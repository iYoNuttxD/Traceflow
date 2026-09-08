import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  readFile,
  mkdtemp,
  readdir,
  rm,
  writeFile,
  symlink,
  realpath,
  mkdir,
  open
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  LocalTestEvidenceStorage,
  TestEvidenceStorage
} from '../../../src/modules/testCases/storage/local-test-evidence.storage.js';
import {
  EVIDENCE_DEFAULTS,
  declaredFormat,
  evidenceField,
  evidenceLimits,
  safeFilename,
  validateEvidenceBytes
} from '../../../src/modules/testCases/storage/test-evidence.validation.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=',
  'base64'
);
const directories = [];
async function fixture(limits = EVIDENCE_DEFAULTS) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 's107-storage-'));
  directories.push(directory);
  return {
    directory,
    storage: new LocalTestEvidenceStorage({ directory, environment: 'test', limits })
  };
}
const receive = (storage, attempt, bytes = png, name = 'image.png', field = 'evidence') =>
  storage.receive(attempt, {
    fieldname: field,
    originalname: name,
    stream: Readable.from([bytes])
  });
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
describe('S1-07 private evidence storage', () => {
  it.each([
    ['png', png],
    ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['webp', Buffer.from('52494646240000005745425056503820', 'hex')],
    ['mp4', Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex')],
    ['mov', Buffer.from('000000186674797071742020000000007174202000000000', 'hex')],
    ['webm', Buffer.from('1a45dfa3874282847765626d', 'hex')],
    ['pdf', Buffer.from('%PDF-1.7\n')]
  ])(
    'validates and hashes generated large %s without full-file reads',
    async (extension, header) => {
      const { storage, directory } = await fixture();
      const bytes = Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024, 0x61)]);
      const attempt = await storage.begin();
      await receive(storage, attempt, bytes, `large.${extension}`);
      const probe = await open(join(attempt.staging, attempt.files[0].storageKey), 'r');
      const prototype = Object.getPrototypeOf(probe);
      await probe.close();
      const wholeFile = vi.spyOn(prototype, 'readFile').mockImplementation(() => {
        throw new Error('Whole binary read forbidden');
      });
      const reads = vi.spyOn(prototype, 'read');
      try {
        const [item] = await storage.prepare(attempt, []);
        expect(item.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(item.sizeBytes).toBe(bytes.length);
        expect(wholeFile).not.toHaveBeenCalled();
        expect(reads.mock.calls.length).toBeGreaterThan(2);
        expect(Math.max(...reads.mock.calls.map((call) => call[2]))).toBeLessThanOrEqual(64 * 1024);
      } finally {
        wholeFile.mockRestore();
        reads.mockRestore();
        await storage.cleanup(attempt);
      }
      expect(await readdir(directory)).toEqual([]);
    }
  );
  it('does not mistake APNG after large metadata for a permitted static PNG', async () => {
    const { storage } = await fixture();
    const metadata = Buffer.alloc(128 * 1024 + 12);
    metadata.writeUInt32BE(128 * 1024, 0);
    metadata.write('tEXt', 4);
    const animation = Buffer.from('000000086163544c000000010000000000000000', 'hex');
    const bytes = Buffer.concat([png.subarray(0, 33), metadata, animation, png.subarray(33)]);
    await expect(validateEvidenceBytes(bytes, 'animation.png', 'EXECUTION')).rejects.toMatchObject({
      statusCode: 400
    });
    const attempt = await storage.begin();
    await receive(storage, attempt, bytes, 'animation.png');
    await expect(storage.prepare(attempt, [])).rejects.toMatchObject({ statusCode: 400 });
    await storage.cleanup(attempt);
  });
  it('stages, validates, hashes persisted bytes and uses a random private key', async () => {
    const { storage, directory } = await fixture();
    const attempt = await storage.begin();
    await receive(storage, attempt, png, '../../my image.png', 'stepEvidence.1');
    const items = await storage.prepare(attempt, [1]);
    expect(items[0]).toMatchObject({
      scope: 'STEP',
      position: 1,
      originalName: 'my image.png',
      mimeType: 'image/png',
      kind: 'IMAGE',
      sizeBytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex')
    });
    expect(items[0].storageKey).toMatch(/^[a-f0-9-]{36}$/);
    await storage.cleanup(attempt, { committed: true });
    expect(await readdir(directory)).toEqual([items[0].storageKey]);
    const stream = await storage.content(items[0].storageKey, png.length);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(png);
  });
  it('compensates promoted files on database failure and is idempotent', async () => {
    const { storage, directory } = await fixture();
    const attempt = await storage.begin();
    await receive(storage, attempt);
    await storage.prepare(attempt, []);
    await storage.cleanup(attempt);
    await storage.cleanup(attempt);
    expect(await readdir(directory)).toEqual([]);
  });
  it('cleans all staging when one file is invalid', async () => {
    const { storage, directory } = await fixture();
    const attempt = await storage.begin();
    await receive(storage, attempt);
    await receive(storage, attempt, Buffer.from('fake'), 'fake.png');
    await expect(storage.prepare(attempt, [])).rejects.toMatchObject({ statusCode: 400 });
    await storage.cleanup(attempt);
    expect(await readdir(directory)).toEqual([]);
  });
  it('rejects missing step target and cleans it', async () => {
    const { storage } = await fixture();
    const attempt = await storage.begin();
    await receive(storage, attempt, png, 'image.png', 'stepEvidence.3');
    await expect(storage.prepare(attempt, [1])).rejects.toMatchObject({ statusCode: 400 });
    await storage.cleanup(attempt);
  });
  it.each([
    ['fileBytes', 4, 'evidence'],
    ['totalBytes', 4, 'evidence']
  ])('enforces %s while streaming', async (key, value, field) => {
    const { storage, directory } = await fixture({ ...EVIDENCE_DEFAULTS, [key]: value });
    const attempt = await storage.begin();
    await expect(receive(storage, attempt, png, 'image.png', field)).rejects.toMatchObject({
      statusCode: 413
    });
    await storage.cleanup(attempt);
    expect(await readdir(directory)).toEqual([]);
  });
  it.each([
    ['perStep', 'stepEvidence.1'],
    ['general', 'evidence'],
    ['files', 'evidence']
  ])('enforces %s quota', async (key, field) => {
    const { storage } = await fixture({ ...EVIDENCE_DEFAULTS, [key]: 1 });
    const attempt = await storage.begin();
    await receive(storage, attempt, png, 'a.png', field);
    await receive(storage, attempt, png, 'b.png', field);
    await expect(storage.prepare(attempt, [1])).rejects.toMatchObject({ statusCode: 413 });
    await storage.cleanup(attempt);
  });
  it('rejects symlink roots, symlink content, traversal and mismatched persisted size', async () => {
    const { storage, directory } = await fixture();
    await mkdir(join(directory, 'private'));
    await symlink(join(directory, 'private'), join(directory, 'alias'));
    await expect(
      new LocalTestEvidenceStorage({ directory: join(directory, 'alias') }).begin()
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(storage.content('../private', 1)).rejects.toMatchObject({ statusCode: 503 });
    const key = '12345678-1234-4234-8234-123456789abc';
    await writeFile(join(directory, 'private/secret'), 'x');
    await symlink(join(directory, 'private/secret'), join(directory, key));
    await expect(storage.content(key, 1)).rejects.toMatchObject({ statusCode: 503 });
    const attempt = await storage.begin();
    await receive(storage, attempt);
    const [file] = await storage.prepare(attempt, []);
    await expect(storage.content(file.storageKey, 1)).rejects.toMatchObject({ statusCode: 503 });
    await storage.cleanup(attempt);
  });
  it.each([null, 'relative/path', '/Users/daniel/Coding/Traceflow/frontend/public/evidence'])(
    'fails closed with unsafe production config %s',
    async (directory) =>
      await expect(
        new LocalTestEvidenceStorage({ directory, environment: 'production' }).begin()
      ).rejects.toMatchObject({ statusCode: 503 })
  );
  it('abstract storage fails closed', async () => {
    const storage = new TestEvidenceStorage();
    for (const method of ['begin', 'receive', 'prepare', 'cleanup', 'content'])
      await expect(storage[method]()).rejects.toMatchObject({ statusCode: 503 });
  });
});
describe('S1-07 real MP4 fixture', () => {
  it('detects real MP4 independent of client MIME and enforces video size boundary', async () => {
    const bytes = await readFile(
      new URL('../../fixtures/test-evidence/sample.mp4', import.meta.url)
    );
    expect(
      await validateEvidenceBytes(bytes, 'sample.mp4', 'STEP', {
        ...EVIDENCE_DEFAULTS,
        videoBytes: bytes.length
      })
    ).toEqual({ mimeType: 'video/mp4', kind: 'VIDEO' });
    await expect(
      validateEvidenceBytes(bytes, 'sample.mp4', 'STEP', {
        ...EVIDENCE_DEFAULTS,
        videoBytes: bytes.length - 1
      })
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});
describe('S1-07 signature and upload policy', () => {
  it.each(['a.svg', 'a.html', 'a.js', 'a.sh', 'a.zip', 'a.exe', 'a.tar.gz'])('rejects %s', (name) =>
    expect(() => declaredFormat(name, 'EXECUTION')).toThrow()
  );
  it.each(['a.pdf', 'a.txt', 'a.log', 'a.json'])('rejects document %s on steps', (name) =>
    expect(() => declaredFormat(name, 'STEP')).toThrow()
  );
  it.each([
    'stepEvidence.0',
    'stepEvidence.-1',
    'stepEvidence.101',
    'stepEvidence.01',
    'other',
    'stepEvidence.1.path'
  ])('rejects field %s', (field) => expect(() => evidenceField(field)).toThrow());
  it('normalizes names and strict field positions', () => {
    expect(safeFilename('C:\\secret\\..\\a\r\n.png')).toBe('a__.png');
    expect(safeFilename('...')).toBe('evidence');
    expect(evidenceField('stepEvidence.100')).toEqual({ scope: 'STEP', position: 100 });
  });
  it('enforces safe operational configuration', () => {
    expect(evidenceLimits({})).toEqual(EVIDENCE_DEFAULTS);
    expect(evidenceLimits({ TEST_EVIDENCE_MAX_FILES: '2' }).files).toBe(2);
    expect(() => evidenceLimits({ TEST_EVIDENCE_MAX_FILES: '-1' })).toThrow();
    expect(() => evidenceLimits({ TEST_EVIDENCE_MAX_FILES: '21' })).toThrow();
  });
  it('accepts real PNG and valid JSON/text while checking exact byte limits', async () => {
    expect(
      await validateEvidenceBytes(png, 'a.png', 'STEP', {
        ...EVIDENCE_DEFAULTS,
        fileBytes: png.length
      })
    ).toEqual({ mimeType: 'image/png', kind: 'IMAGE' });
    await expect(
      validateEvidenceBytes(png, 'a.png', 'STEP', {
        ...EVIDENCE_DEFAULTS,
        fileBytes: png.length - 1
      })
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(
      (await validateEvidenceBytes(Buffer.from('{"ok":true}'), 'a.json', 'EXECUTION')).kind
    ).toBe('DATA');
    expect((await validateEvidenceBytes(Buffer.from('a\n\té'), 'a.log', 'EXECUTION')).kind).toBe(
      'TEXT'
    );
  });
  it.each([
    [Buffer.from('not png'), 'a.png'],
    [png, 'a.jpg'],
    [Buffer.from('{bad}'), 'a.json'],
    [Buffer.from([255]), 'a.txt'],
    [Buffer.from([0]), 'a.log'],
    [Buffer.from('<html>x</html>'), 'a.txt'],
    [Buffer.alloc(0), 'a.txt']
  ])(
    'rejects invalid bytes for %s %s',
    async (bytes, name) =>
      await expect(validateEvidenceBytes(bytes, name, 'EXECUTION')).rejects.toBeDefined()
  );
});
