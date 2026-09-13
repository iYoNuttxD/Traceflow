import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import setup from '../../global-setup.js';
import {
  createTestEvidenceEnvironment,
  assertTestEvidenceRoot
} from '../../helpers/test-evidence-environment.js';
import {
  LocalTestEvidenceStorage,
  testEvidenceStorage
} from '../../../src/modules/testCases/storage/local-test-evidence.storage.js';

describe('canonical evidence environment ownership', () => {
  it('reclaims suite children even when skipped suites never run their hooks', () => {
    let parent;
    const teardown = setup({
      provide: (key, value) => {
        parent = value;
      }
    });
    const child = createTestEvidenceEnvironment({}, parent);
    expect(existsSync(child.root)).toBe(true);
    teardown();
    expect(existsSync(parent)).toBe(false);
    expect(existsSync(child.owner)).toBe(false);
  });
  it('sets the same owned root before the storage singleton is imported', async () => {
    expect(process.env.TEST_EVIDENCE_STORAGE_DIR).toBeTruthy();
    expect(isAbsolute(assertTestEvidenceRoot())).toBe(true);
    expect(await testEvidenceStorage.root()).toBe(assertTestEvidenceRoot());
    expect(assertTestEvidenceRoot()).not.toContain('.data/test-evidence');
  });
  it('bootstraps a fresh process with no operator-provided storage variable', () => {
    const env = { ...process.env };
    delete env.TEST_EVIDENCE_STORAGE_DIR;
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { existsSync } from 'node:fs';
      import { configureTestEvidenceEnvironment } from './test/helpers/test-evidence-environment.js';
      assert.equal(process.env.TEST_EVIDENCE_STORAGE_DIR, undefined);
      const owner = configureTestEvidenceEnvironment();
      const { testEvidenceStorage } = await import('./src/modules/testCases/storage/local-test-evidence.storage.js');
      assert.equal(await testEvidenceStorage.root(), owner.assertRoot());
      owner.cleanup();
      assert.equal(existsSync(owner.owner), false);
    `
      ],
      { env, encoding: 'utf8' }
    );
    expect(child.status, child.stderr).toBe(0);
  });
  it('isolates owners and preserves external data after upload failure and final cleanup', async () => {
    const outside = mkdtempSync(join(realpathSync(tmpdir()), 's107-sentinel-'));
    const sentinel = join(outside, 'sentinel');
    writeFileSync(sentinel, 'external evidence');
    const first = createTestEvidenceEnvironment({ TEST_EVIDENCE_STORAGE_DIR: outside });
    const second = createTestEvidenceEnvironment({});
    try {
      expect(first.root).not.toBe(second.root);
      expect(first.root).not.toContain(outside);
      const storage = new LocalTestEvidenceStorage({ directory: first.root });
      const attempt = await storage.begin();
      await storage.receive(attempt, {
        fieldname: 'evidence',
        originalname: 'fake.png',
        stream: Readable.from(['fake'])
      });
      await expect(storage.prepare(attempt, [])).rejects.toMatchObject({ statusCode: 400 });
      await storage.cleanup(attempt);
      first.cleanup();
      expect(existsSync(first.owner)).toBe(false);
      expect(second.assertRoot()).toBe(second.root);
      expect(readFileSync(sentinel, 'utf8')).toBe('external evidence');
    } finally {
      if (existsSync(first.owner)) first.cleanup();
      second.cleanup();
      rmSync(outside, { recursive: true });
    }
  });
  it('refuses cleanup when configuration or ownership marker changes', () => {
    const environment = {};
    const owner = createTestEvidenceEnvironment(environment);
    const marker = join(owner.owner, '.traceflow-test-evidence-owner');
    const token = readFileSync(marker);
    try {
      environment.TEST_EVIDENCE_STORAGE_DIR = tmpdir();
      expect(() => owner.cleanup()).toThrow('ownership');
      environment.TEST_EVIDENCE_STORAGE_DIR = owner.root;
      writeFileSync(marker, 'another owner');
      expect(() => owner.cleanup()).toThrow('ownership');
      expect(existsSync(owner.root)).toBe(true);
    } finally {
      writeFileSync(marker, token);
      owner.cleanup();
    }
  });
});
