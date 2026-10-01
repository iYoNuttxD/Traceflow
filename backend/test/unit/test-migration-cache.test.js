import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import setup from '../global-setup.js';
import { deployOncePerInvocation } from '../helpers/test-migration-cache.js';

const directories = [];
const directory = () => {
  const result = mkdtempSync(join(tmpdir(), 'traceflow-test-migration-cache-'));
  directories.push(result);
  return result;
};
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true })));

const databaseUrl = 'mysql://test:artificial@localhost/traceflow_test';

describe('migration deployment per isolated invocation', () => {
  it.each([
    { fileParallelism: false, watch: false, cached: true },
    { fileParallelism: true, watch: false, cached: false },
    { fileParallelism: undefined, watch: false, cached: false },
    { fileParallelism: false, watch: true, cached: false }
  ])(
    'shares markers only with sequential non-watch files: $fileParallelism, $watch',
    ({ fileParallelism, watch, cached }) => {
      const provided = {};
      const teardown = setup({
        config: { fileParallelism, watch },
        provide: (key, value) => {
          provided[key] = value;
        }
      });
      try {
        if (cached) expect(existsSync(provided.testMigrationCache)).toBe(true);
        else expect(provided.testMigrationCache).toBeUndefined();
      } finally {
        teardown();
      }
      expect(existsSync(provided.testEvidenceParent)).toBe(false);
    }
  );

  it('deploys once across callers and does not store credentials', () => {
    const root = directory();
    const deploy = vi.fn();
    deployOncePerInvocation({ directory: root, databaseUrl, deploy });
    deployOncePerInvocation({ directory: root, databaseUrl, deploy });
    expect(deploy).toHaveBeenCalledOnce();
    expect(readdirSync(root)).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect(readFileSync(join(root, readdirSync(root)[0]), 'utf8')).toBe('');
  });

  it('deploys for each database and each new invocation, including a filtered run', () => {
    const root = directory();
    const deploy = vi.fn();
    deployOncePerInvocation({ directory: root, databaseUrl, deploy });
    deployOncePerInvocation({ directory: root, databaseUrl: `${databaseUrl}_other`, deploy });
    deployOncePerInvocation({ directory: directory(), databaseUrl, deploy });
    expect(deploy).toHaveBeenCalledTimes(3);
  });

  it('never caches a failed deployment', () => {
    const options = { directory: directory(), databaseUrl, deploy: vi.fn() };
    options.deploy.mockImplementationOnce(() => {
      throw new Error('migration failed');
    });
    expect(() => deployOncePerInvocation(options)).toThrow('migration failed');
    deployOncePerInvocation(options);
    deployOncePerInvocation(options);
    expect(options.deploy).toHaveBeenCalledTimes(2);
  });

  it('invalidates the marker before a forced deployment that fails', () => {
    const options = { directory: directory(), databaseUrl, deploy: vi.fn() };
    deployOncePerInvocation(options);
    options.deploy.mockImplementationOnce(() => {
      throw new Error('refresh failed');
    });
    expect(() => deployOncePerInvocation({ ...options, force: true })).toThrow('refresh failed');
    deployOncePerInvocation(options);
    expect(options.deploy).toHaveBeenCalledTimes(3);
  });

  it('deploys every time without an invocation-owned directory', () => {
    const deploy = vi.fn();
    deployOncePerInvocation({ databaseUrl, deploy });
    deployOncePerInvocation({ databaseUrl, deploy });
    expect(deploy).toHaveBeenCalledTimes(2);
  });
});
