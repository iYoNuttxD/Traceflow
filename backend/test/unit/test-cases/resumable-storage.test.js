import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  mkdtemp,
  realpath,
  rm,
  readFile,
  writeFile,
  readdir,
  symlink,
  mkdir,
  chmod,
  open
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { LocalTestEvidenceStorage } from '../../../src/modules/testCases/storage/local-test-evidence.storage.js';
import { ResumableEvidenceStorage } from '../../../src/modules/testCases/storage/resumable-evidence.storage.js';
import {
  manifest,
  partContract,
  progress,
  uploadLimits
} from '../../../src/modules/testCases/uploads/upload-contract.js';
const owned = [];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const data = Buffer.from('{"ok":true}');
const input = () => ({
  idempotencyKey: randomUUID(),
  testCaseVersion: 1,
  files: [{ name: 'result.json', field: 'evidence', sizeBytes: data.length, sha256: hash(data) }]
});
async function fixture() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'tf041-storage-'));
  owned.push(root);
  const local = new LocalTestEvidenceStorage({ directory: root, environment: 'test' });
  const storage = new ResumableEvidenceStorage({ storage: local });
  const parsed = manifest(input()),
    row = {
      id: randomUUID(),
      filesJson: parsed.files,
      totalBytes: parsed.totalBytes,
      status: 'OPEN'
    };
  const token = randomUUID();
  return { root, local, storage, row, token };
}
async function receive(f, bytes = data, checksum = hash(data), token = f.token) {
  return f.storage.receive(f.row, token, Readable.from([bytes]), {
    size: data.length,
    checksum,
    timeoutMs: 1000
  });
}
async function assembled(f) {
  const part = await receive(f);
  f.row.filesJson[0].parts[0] = part;
  return f.storage.assemble(f.row, randomUUID(), Date.now() + 10000);
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of owned.splice(0)) await rm(root, { recursive: true, force: true });
});
describe('persistent private resumable storage and admission contract', () => {
  it('uses bounded defaults and rejects unsafe operator limits', () => {
    const limits = uploadLimits({});
    expect(limits).toMatchObject({
      ACTIVE_USER: 3,
      CONCURRENT_USER: 2,
      CONCURRENT_GLOBAL: 4,
      maxParts: 40
    });
    for (const value of ['0', '-1', 'NaN', '999999999999999'])
      expect(() => uploadLimits({ TEST_UPLOAD_ACTIVE_USER: value })).toThrow();
    expect(uploadLimits({ TEST_UPLOAD_ACTIVE_USER: '2' }).ACTIVE_USER).toBe(2);
    expect(() => uploadLimits({ TEST_UPLOAD_MIN_FREE_BYTES: '1' })).toThrow();
    expect(uploadLimits({ TEST_UPLOAD_MIN_FREE_BYTES: '1073741824' }).MIN_FREE_BYTES).toBe(
      1073741824
    );
  });
  it('manifest normalizes filenames, counts files/parts, rejects invalid context and preserves aggregate caps', () => {
    const body = input();
    body.files[0].name = '../../private/result.json';
    const row = manifest(body);
    expect(row.files[0].originalName).toBe('result.json');
    expect(() =>
      manifest({ ...body, files: Array.from({ length: 21 }, () => body.files[0]) })
    ).toThrow();
    expect(() => manifest(body, undefined, 0)).toThrow();
    expect(() => manifest({ ...body, files: [{ ...body.files[0], field: 'invalid' }] })).toThrow();
    expect(() => manifest({ ...body, files: [{ ...body.files[0], sizeBytes: 0 }] })).toThrow();
    const state = { filesJson: row.files, ...row, id: randomUUID() };
    expect(() => partContract(state, 'other', 0, hash(data), 0)).toThrow();
    expect(() => partContract(state, row.files[0].id, 0, 'bad', 0)).toThrow();
    expect(progress(state).confirmedBytes).toBe(0);
  });
  it('preserves byte identity, promotes without overwrite, and keeps committed files during cleanup', async () => {
    const f = await fixture(),
      attempt = await assembled(f);
    const prepared = await f.local.prepare(attempt, [1], { promote: false });
    expect(prepared[0].sha256).toBe(hash(data));
    await f.storage.promote(attempt, f.row);
    await f.storage.promote(attempt, f.row);
    const key = f.row.filesJson[0].storageKey;
    await f.storage.prune(f.row, { all: true, protectedKeys: [key] });
    expect(await readFile(join(f.root, key))).toEqual(data);
    await f.storage.prune(f.row, { all: true, protectedKeys: [key] });
    expect(await readFile(join(f.root, key))).toEqual(data);
  });
  it('refuses an existing part and never deletes its prior bytes', async () => {
    const f = await fixture(),
      directory = await f.storage.directory(f.row.id);
    const path = join(directory, 'part-' + f.token);
    await writeFile(path, 'existing');
    await expect(receive(f)).rejects.toMatchObject({ statusCode: 503 });
    expect(await readFile(path, 'utf8')).toBe('existing');
  });
  it('refuses conflicting final bytes and preserves existing files', async () => {
    const f = await fixture(),
      attempt = await assembled(f),
      path = join(f.root, f.row.filesJson[0].storageKey);
    await writeFile(path, 'old');
    await expect(f.storage.promote(attempt, f.row)).rejects.toMatchObject({ statusCode: 503 });
    expect(await readFile(path, 'utf8')).toBe('old');
  });
  it('removes only owned partial files after stream failure, bad size or checksum', async () => {
    const f = await fixture();
    for (const bytes of [Buffer.alloc(0), Buffer.from('wrongbytes'), Buffer.concat([data, data])]) {
      await expect(receive(f, bytes)).rejects.toBeDefined();
      expect(await readdir(await f.storage.directory(f.row.id))).toEqual([]);
    }
    const stream = Readable.from(
      (async function* () {
        yield data.subarray(0, 3);
        throw Error('stream failure');
      })()
    );
    await expect(
      f.storage.receive(f.row, f.token, stream, {
        size: data.length,
        checksum: hash(data),
        timeoutMs: 1000
      })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await readdir(await f.storage.directory(f.row.id))).toEqual([]);
  });
  it('bounds a stalled stream by its explicit deadline', async () => {
    const f = await fixture(),
      stream = new PassThrough();
    await expect(
      f.storage.receive(f.row, f.token, stream, {
        size: data.length,
        checksum: hash(data),
        timeoutMs: 10
      })
    ).rejects.toMatchObject({ code: 'UPLOAD_TIMEOUT' });
    expect(await readdir(await f.storage.directory(f.row.id))).toEqual([]);
  });
  it.each(['../escape', '/tmp', 'bad'])(
    'rejects traversal identifier %s before touching disk',
    async (id) => {
      const f = await fixture();
      await expect(f.storage.directory(id)).rejects.toMatchObject({ statusCode: 503 });
      await expect(f.storage.assemble(f.row, id, Date.now() + 1000)).rejects.toMatchObject({
        statusCode: 503
      });
      await expect(
        f.storage.receive(f.row, id, Readable.from([data]), { size: data.length, timeoutMs: 10 })
      ).rejects.toMatchObject({ statusCode: 503 });
    }
  );
  it.each(['namespace', 'session', 'part', 'work', 'destination'])(
    'refuses %s symlinks and leaves the outside sentinel intact',
    async (where) => {
      const f = await fixture(),
        outside = join(f.root, 'outside');
      await mkdir(outside, { mode: 0o700 });
      await writeFile(join(outside, 'sentinel'), 'preserved');
      if (where === 'namespace') {
        await symlink(outside, join(f.root, '.uploads'));
        await expect(f.storage.directory(f.row.id)).rejects.toMatchObject({ statusCode: 503 });
      } else if (where === 'session') {
        await mkdir(join(f.root, '.uploads'), { mode: 0o700 });
        await symlink(outside, join(f.root, '.uploads', f.row.id));
        await expect(f.storage.directory(f.row.id)).rejects.toMatchObject({ statusCode: 503 });
      } else if (where === 'part') {
        const directory = await f.storage.directory(f.row.id);
        await symlink(join(outside, 'sentinel'), join(directory, 'part-' + f.token));
        await expect(receive(f)).rejects.toMatchObject({ statusCode: 503 });
        await expect(f.storage.prune(f.row, { all: true })).rejects.toMatchObject({
          statusCode: 503
        });
      } else if (where === 'work') {
        const directory = await f.storage.directory(f.row.id);
        await symlink(outside, join(directory, 'work-' + f.token));
        await expect(f.storage.prune(f.row)).rejects.toMatchObject({ statusCode: 503 });
      } else {
        const attempt = await assembled(f);
        await symlink(join(outside, 'sentinel'), join(f.root, f.row.filesJson[0].storageKey));
        await expect(f.storage.promote(attempt, f.row)).rejects.toBeDefined();
      }
      expect(await readFile(join(outside, 'sentinel'), 'utf8')).toBe('preserved');
    }
  );
  it('rejects public mode, unknown cleanup entries and unreadable/non-directory roots', async () => {
    const f = await fixture(),
      path = await f.storage.directory(f.row.id);
    await chmod(path, 0o755);
    await expect(f.storage.directory(f.row.id)).rejects.toMatchObject({ statusCode: 503 });
    await chmod(path, 0o700);
    await writeFile(join(path, 'unknown'), 'preserved');
    await expect(f.storage.prune(f.row)).rejects.toMatchObject({ statusCode: 503 });
    expect(await readFile(join(path, 'unknown'), 'utf8')).toBe('preserved');
    await writeFile(join(f.root, 'regular'), 'file');
    const storage = new ResumableEvidenceStorage({
      storage: new LocalTestEvidenceStorage({
        directory: join(f.root, 'regular'),
        environment: 'test'
      })
    });
    await expect(storage.freeBytes()).rejects.toMatchObject({ statusCode: 503 });
  });
  it('reclaims crash orphans, detects corrupt persisted parts, and refuses an incomplete final assembly', async () => {
    const f = await fixture(),
      part = await receive(f);
    await f.storage.prune(f.row);
    expect(await readdir(await f.storage.directory(f.row.id))).toEqual([]);
    await expect(f.storage.assemble(f.row, randomUUID(), Date.now() + 1000)).rejects.toMatchObject({
      code: 'UPLOAD_PARTS_MISSING'
    });
    const next = await receive(f);
    f.row.filesJson[0].parts[0] = next;
    await writeFile(join(await f.storage.directory(f.row.id), part.key), 'x'.repeat(data.length));
    await expect(f.storage.assemble(f.row, randomUUID(), Date.now() + 1000)).rejects.toMatchObject({
      code: 'UPLOAD_CHECKSUM_MISMATCH'
    });
    await expect(f.storage.assemble(f.row, randomUUID(), Date.now() - 1)).rejects.toMatchObject({
      code: 'UPLOAD_TIMEOUT'
    });
  });
  it.each([
    ['a'.repeat(1048576), 'log.txt', true],
    ['{"long":"' + 'a'.repeat(1048576) + '"}', 'result.json', true],
    ['\ufeff{"ok":true}', 'result.json', true],
    ['< ' + ' '.repeat(131072) + 'script>bad</script>', 'log.txt', false],
    ['{"x":', 'result.json', false],
    ['{}{}', 'result.json', false],
    ['text\u0000binary', 'log.txt', false]
  ])(
    'streamed canonical validation preserves formats without readFile, case %#',
    async (text, name, valid) => {
      const f = await fixture(),
        attempt = await f.local.begin();
      await f.local.receive(attempt, {
        originalname: name,
        fieldname: 'evidence',
        stream: Readable.from([Buffer.from(text)])
      });
      const handle = await open(join(attempt.staging, attempt.files[0].storageKey), 'r');
      const prototype = Object.getPrototypeOf(handle);
      await handle.close();
      vi.spyOn(prototype, 'readFile').mockImplementation(() => {
        throw Error('whole-file buffering forbidden');
      });
      if (valid)
        expect((await f.local.prepare(attempt, []))[0].sha256).toBe(hash(Buffer.from(text)));
      else await expect(f.local.prepare(attempt, [])).rejects.toMatchObject({ statusCode: 400 });
    }
  );
});
