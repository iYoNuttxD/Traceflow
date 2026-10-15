import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, unlink, rmdir, link, statfs } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { testEvidenceStorage } from './local-test-evidence.storage.js';
import { UUID, unavailable, uploadError } from '../uploads/upload-contract.js';

const readFlags = constants.O_RDONLY | constants.O_NOFOLLOW;
const writeFlags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
const bufferBytes = 64 * 1024;
async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700 }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.getuid && info.uid !== process.getuid()) ||
    info.mode & 0o077
  )
    throw unavailable();
  const parent = await open(dirname(path), readFlags);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return path;
}
async function removeFile(path) {
  const stat = await lstat(path).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!stat) return;
  if (!stat.isFile() || stat.isSymbolicLink()) throw unavailable();
  await unlink(path);
}
async function hashFile(path, expectedSize) {
  const handle = await open(path, readFlags);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== expectedSize) throw unavailable();
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      highWaterMark: bufferBytes
    }))
      hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
export class ResumableEvidenceStorage {
  constructor({ storage = testEvidenceStorage } = {}) {
    this.storage = storage;
  }
  async directory(id) {
    if (!UUID.test(id)) throw unavailable();
    return privateDirectory(
      join(await privateDirectory(join(await this.storage.root(), '.uploads')), id)
    );
  }
  async freeBytes() {
    try {
      const value = await statfs(await this.storage.root());
      return value.bavail * value.bsize;
    } catch {
      throw unavailable();
    }
  }
  async receive(row, token, stream, { size, checksum, timeoutMs }) {
    const directory = await this.directory(row.id);
    const key = `part-${token}`;
    if (!UUID.test(token)) throw unavailable();
    let handle,
      total = 0,
      accepted = false,
      created = false;
    const deadline = Date.now() + timeoutMs;
    const hash = createHash('sha256');
    const timeout = setTimeout(
      () =>
        stream.destroy(uploadError('Envio interrompido. Retome o upload.', 408, 'UPLOAD_TIMEOUT')),
      timeoutMs
    );
    timeout.unref?.();
    try {
      handle = await open(join(directory, key), writeFlags, 0o600);
      created = true;
      for await (const chunk of stream) {
        if (Date.now() >= deadline) throw uploadError('Envio interrompido.', 408, 'UPLOAD_TIMEOUT');
        total += chunk.length;
        if (total > size)
          throw uploadError('Parte acima do tamanho permitido.', 413, 'UPLOAD_PART_TOO_LARGE');
        hash.update(chunk);
        await handle.writeFile(chunk);
      }
      if (total !== size)
        throw uploadError('Comprimento da parte incorreto.', 400, 'UPLOAD_LENGTH_MISMATCH');
      if (hash.digest('hex') !== checksum)
        throw uploadError('Checksum da parte incorreto.', 422, 'UPLOAD_CHECKSUM_MISMATCH');
      await handle.sync();
      const parent = await open(directory, readFlags);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      accepted = true;
      return { key, sizeBytes: size, sha256: checksum };
    } catch (error) {
      if (error.statusCode) throw error;
      if (error.code === 'ENOSPC')
        throw uploadError('Espaço temporário insuficiente.', 507, 'UPLOAD_DISK_FULL');
      throw unavailable();
    } finally {
      clearTimeout(timeout);
      await handle?.close();
      if (created && !accepted) await removeFile(join(directory, key));
    }
  }
  async discardPart(row, part) {
    if (!/^part-[0-9a-f-]{36}$/.test(part.key) || !UUID.test(part.key.slice(5)))
      throw unavailable();
    await removeFile(join(await this.directory(row.id), part.key));
  }
  async assemble(row, token, deadline) {
    if (!UUID.test(token)) throw unavailable();
    const directory = await this.directory(row.id);
    const staging = await privateDirectory(join(directory, `work-${token}`));
    const attempt = {
      root: await this.storage.root(),
      staging,
      files: [],
      promoted: [],
      closed: false
    };
    try {
      for (const file of row.filesJson) {
        if (!UUID.test(file.storageKey)) throw unavailable();
        const output = await open(join(staging, file.storageKey), writeFlags, 0o600);
        const hash = createHash('sha256');
        let total = 0;
        try {
          for (let i = 0; i < Math.ceil(file.sizeBytes / (8 * 1024 * 1024)); i++) {
            if (Date.now() >= deadline)
              throw uploadError(
                'Confirmação interrompida. Retome o upload.',
                503,
                'UPLOAD_TIMEOUT'
              );
            const part = file.parts[i];
            if (!part || !UUID.test(part.key?.slice(5)) || !part.key.startsWith('part-'))
              throw uploadError('Há partes ausentes.', 409, 'UPLOAD_PARTS_MISSING');
            const input = await open(join(directory, part.key), readFlags);
            const partHash = createHash('sha256');
            let bytes = 0;
            try {
              const info = await input.stat();
              if (!info.isFile() || info.size !== part.sizeBytes) throw unavailable();
              for await (const chunk of input.createReadStream({
                autoClose: false,
                highWaterMark: bufferBytes
              })) {
                if (Date.now() >= deadline)
                  throw uploadError('Confirmação interrompida.', 503, 'UPLOAD_TIMEOUT');
                total += chunk.length;
                bytes += chunk.length;
                if (total > file.sizeBytes) throw unavailable();
                partHash.update(chunk);
                hash.update(chunk);
                await output.writeFile(chunk);
              }
            } finally {
              await input.close();
            }
            if (bytes !== part.sizeBytes || partHash.digest('hex') !== part.sha256)
              throw uploadError('Checksum da parte incorreto.', 422, 'UPLOAD_CHECKSUM_MISMATCH');
          }
          if (total !== file.sizeBytes || hash.digest('hex') !== file.sha256)
            throw uploadError(
              'Checksum do arquivo incorreto.',
              422,
              'UPLOAD_FILE_CHECKSUM_MISMATCH'
            );
          await output.sync();
        } finally {
          await output.close();
        }
        attempt.files.push({
          storageKey: file.storageKey,
          originalName: file.originalName,
          scope: file.scope,
          position: file.position,
          sizeBytes: file.sizeBytes
        });
      }
      return attempt;
    } catch (error) {
      if (error.statusCode) throw error;
      if (error.code === 'ENOSPC')
        throw uploadError('Espaço temporário insuficiente.', 507, 'UPLOAD_DISK_FULL');
      throw unavailable();
    }
  }
  // Called only while holding the durable receipt lock in the business transaction.
  async promote(attempt, row) {
    for (const file of row.filesJson) {
      const source = join(attempt.staging, file.storageKey),
        destination = join(attempt.root, file.storageKey);
      try {
        await link(source, destination);
      } catch (error) {
        if (
          error.code !== 'EEXIST' ||
          (await hashFile(destination, file.sizeBytes)) !== file.sha256
        )
          throw unavailable();
      }
      // A hard link creates without overwriting; fsync makes the directory entry durable.
      const handle = await open(attempt.root, readFlags);
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  }
  async prune(row, { all = false, protectedKeys = [] } = {}) {
    const directory = await this.directory(row.id);
    const referenced = new Set(
      all ? [] : row.filesJson.flatMap((file) => Object.values(file.parts).map((part) => part.key))
    );
    for (const name of await readdir(directory)) {
      if (/^part-/.test(name) && UUID.test(name.slice(5))) {
        if (!referenced.has(name)) await removeFile(join(directory, name));
      } else if (/^work-/.test(name) && UUID.test(name.slice(5))) {
        const path = join(directory, name),
          info = await lstat(path);
        if (!info.isDirectory() || info.isSymbolicLink()) throw unavailable();
        for (const key of await readdir(path)) {
          if (!row.filesJson.some((file) => file.storageKey === key)) throw unavailable();
          await removeFile(join(path, key));
        }
        await rmdir(path);
      } else throw unavailable();
    }
    if (all) {
      const root = await this.storage.root();
      for (const file of row.filesJson) {
        if (!UUID.test(file.storageKey)) throw unavailable();
        if (!protectedKeys.includes(file.storageKey)) await removeFile(join(root, file.storageKey));
      }
      await rmdir(directory);
    }
  }
}
export const resumableEvidenceStorage = new ResumableEvidenceStorage();
