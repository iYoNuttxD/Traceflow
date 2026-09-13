import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, rename, unlink, rmdir, access } from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { fail } from '../test-case.schema.js';
import {
  declaredFormat,
  evidenceField,
  evidenceLimits,
  safeFilename,
  validateEvidenceBytes,
  validateBinaryEvidence,
  EVIDENCE_READ_BYTES
} from './test-evidence.validation.js';
const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const unavailable = () =>
  fail('Armazenamento de evidências indisponível.', 503, 'TEST_EVIDENCE_STORAGE_UNAVAILABLE');
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const inside = (root, path) =>
  path === root ||
  (!relative(root, path).startsWith(`..${sep}`) &&
    relative(root, path) !== '..' &&
    !isAbsolute(relative(root, path)));
async function noSymlinks(path) {
  let cursor = resolve(path);
  for (;;) {
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw unavailable();
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}
export class TestEvidenceStorage {
  async begin() {
    throw unavailable();
  }
  async receive() {
    throw unavailable();
  }
  async prepare() {
    throw unavailable();
  }
  async cleanup() {
    throw unavailable();
  }
  async content() {
    throw unavailable();
  }
}
export class LocalTestEvidenceStorage extends TestEvidenceStorage {
  constructor({
    directory = process.env.TEST_EVIDENCE_STORAGE_DIR,
    environment = process.env.NODE_ENV,
    limits = evidenceLimits()
  } = {}) {
    super();
    this.directory = directory;
    this.environment = environment;
    this.limits = limits;
  }
  async root() {
    try {
      if (this.environment === 'production' && (!this.directory || !isAbsolute(this.directory)))
        throw unavailable();
      const root = resolve(this.directory || join(backendRoot, '.data/test-evidence'));
      for (const publicRoot of [
        join(backendRoot, 'public'),
        resolve(backendRoot, '../frontend'),
        join(backendRoot, 'dist')
      ])
        if (inside(publicRoot, root) || inside(root, publicRoot)) throw unavailable();
      // Validate the existing ancestor before mkdir, then every component of the result.
      let ancestor = root;
      for (;;) {
        try {
          await lstat(ancestor);
          break;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          ancestor = dirname(ancestor);
        }
      }
      await noSymlinks(ancestor);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await noSymlinks(root);
      await access(root, constants.W_OK | constants.R_OK);
      if ((await realpath(root)) !== root) throw unavailable();
      return root;
    } catch {
      throw unavailable();
    }
  }
  async begin() {
    const root = await this.root();
    const id = randomUUID();
    const staging = join(root, `staging-${id}`);
    try {
      await mkdir(staging, { mode: 0o700 });
    } catch {
      throw unavailable();
    }
    return { root, staging, totalBytes: 0, files: [], promoted: [], closed: false };
  }
  async receive(attempt, file) {
    const { scope, position } = evidenceField(file.fieldname);
    const originalName = safeFilename(file.originalname);
    const [, , kind] = declaredFormat(originalName, scope);
    const key = randomUUID();
    const path = join(attempt.staging, key);
    let handle,
      sizeBytes = 0;
    try {
      await noSymlinks(attempt.staging);
      handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600
      );
      const item = { storageKey: key, originalName, scope, position, sizeBytes: 0 };
      attempt.files.push(item);
      for await (const chunk of file.stream) {
        sizeBytes += chunk.length;
        attempt.totalBytes += chunk.length;
        if (
          sizeBytes > (kind === 'VIDEO' ? this.limits.videoBytes : this.limits.fileBytes) ||
          attempt.totalBytes > this.limits.totalBytes
        )
          throw fail('Limite de evidências excedido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
        await handle.writeFile(chunk);
      }
      item.sizeBytes = sizeBytes;
      return item;
    } catch (error) {
      if (error.statusCode) throw error;
      throw unavailable();
    } finally {
      await handle?.close();
    }
  }
  async prepare(attempt, positions) {
    if (!attempt) return [];
    const counts = new Map();
    try {
      if (attempt.files.length > this.limits.files)
        throw fail('Muitas evidências.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
      const prepared = [];
      for (const item of attempt.files) {
        if (item.scope === 'STEP' && !positions.includes(item.position))
          throw fail('Passo da evidência inválido.');
        const group = item.position ?? 'general';
        counts.set(group, (counts.get(group) || 0) + 1);
        if (counts.get(group) > (item.scope === 'STEP' ? this.limits.perStep : this.limits.general))
          throw fail(
            'Muitas evidências para o mesmo destino.',
            413,
            'TEST_EVIDENCE_LIMIT_EXCEEDED'
          );
        await noSymlinks(attempt.staging);
        const handle = await open(
          join(attempt.staging, item.storageKey),
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size !== item.sizeBytes) throw unavailable();
          const [ext] = declaredFormat(item.originalName, item.scope);
          let format;
          const hash = createHash('sha256');
          if (ext) {
            format = await validateBinaryEvidence(
              handle,
              stat.size,
              item.originalName,
              item.scope,
              this.limits
            );
            // One reusable chunk; no stream prefetch or whole-video allocation.
            const buffer = Buffer.alloc(EVIDENCE_READ_BYTES);
            let position = 0;
            while (position < stat.size) {
              const { bytesRead } = await handle.read(
                buffer,
                0,
                Math.min(buffer.length, stat.size - position),
                position
              );
              if (!bytesRead) throw unavailable();
              hash.update(buffer.subarray(0, bytesRead));
              position += bytesRead;
            }
          } else {
            // Text/JSON retain full UTF-8/JSON validation, bounded by fileBytes (10 MiB).
            if (!stat.size || stat.size > this.limits.fileBytes)
              throw fail('Tamanho de evidência inválido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
            const bytes = await handle.readFile();
            format = await validateEvidenceBytes(bytes, item.originalName, item.scope, this.limits);
            hash.update(bytes);
          }
          prepared.push({ ...item, ...format, sizeBytes: stat.size, sha256: hash.digest('hex') });
        } finally {
          await handle.close();
        }
      }
      await noSymlinks(attempt.root);
      for (const item of prepared) {
        await rename(join(attempt.staging, item.storageKey), join(attempt.root, item.storageKey));
        attempt.promoted.push(item.storageKey);
      }
      return prepared;
    } catch (error) {
      if (error.statusCode) throw error;
      throw unavailable();
    }
  }
  async cleanup(attempt, { committed = false } = {}) {
    if (!attempt || attempt.closed) return;
    // Delete only keys owned by this attempt. Never sweep an arbitrary directory.
    try {
      await noSymlinks(attempt.root);
      await noSymlinks(attempt.staging);
      for (const item of attempt.files)
        await unlink(join(attempt.staging, item.storageKey)).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      if (!committed)
        for (const key of attempt.promoted)
          await unlink(join(attempt.root, key)).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
      await rmdir(attempt.staging);
      attempt.closed = true;
    } catch {
      throw unavailable();
    }
  }
  async content(key, sizeBytes) {
    if (!keyPattern.test(key)) throw unavailable();
    let handle;
    try {
      const root = await this.root();
      handle = await open(join(root, key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== sizeBytes) throw unavailable();
      return handle.createReadStream({ autoClose: true });
    } catch {
      await handle?.close();
      throw unavailable();
    }
  }
}
export const testEvidenceStorage = new LocalTestEvidenceStorage();
