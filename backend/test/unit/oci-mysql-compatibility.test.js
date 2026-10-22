import { randomBytes } from 'node:crypto';
import { readFile, writeFile, symlink, unlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import * as probes from '../../scripts/lib/oci-compatibility-probes.js';
import { concurrencyProbe } from '../../scripts/lib/oci-compatibility-concurrency.js';
import {
  assertCommandResult,
  assertNativeRuntime,
  assertServerIdentity,
  classifyFailure,
  createOwnedDirectory,
  removeOwnedDirectory,
  sanitizeOutput,
  validateCompatibilityTarget
} from '../../scripts/lib/oci-compatibility-safety.js';

function validEnvironment() {
  const id = randomBytes(6).toString('hex');
  return {
    TEST_DATABASE_URL: `mysql://tf_oci_${id}:${randomBytes(32).toString('hex')}@127.0.0.1:55123/tf_oci_${id}_test`
  };
}
function changedTarget(change) {
  const environment = validEnvironment();
  const url = new URL(environment.TEST_DATABASE_URL);
  change(url);
  environment.TEST_DATABASE_URL = url.toString();
  return environment;
}

describe('OCI compatibility fails closed before opening a database', () => {
  it('requires explicit TEST_DATABASE_URL without fallback', () => {
    expect(() => validateCompatibilityTarget({})).toThrow(/TEST_DATABASE_URL/);
    expect(() =>
      validateCompatibilityTarget({ DATABASE_URL: 'mysql://127.0.0.1/traceflow' })
    ).toThrow();
  });
  it('accepts only a fresh run namespace and restricted identity', () => {
    const result = validateCompatibilityTarget(validEnvironment());
    expect(result.host).toBe('127.0.0.1');
    expect(result.database).toBe(`tf_oci_${result.runId}_test`);
  });
  it.each(['10.20.2.25', 'localhost', '[::1]', 'traceflow.dev', 'db.example.invalid', '127.0.0.2'])(
    'refuses OCI, DNS and unowned host %s',
    (host) => {
      expect(() =>
        validateCompatibilityTarget(
          changedTarget((url) => {
            url.hostname = host;
          })
        )
      ).toThrow();
    }
  );
  it.each(['3306', '33060', '443', '49151'])('refuses non-isolated port %s', (port) => {
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.port = port;
        })
      )
    ).toThrow();
  });
  it.each([
    'traceflow',
    'traceflow_test',
    'traceflow_production_test',
    'mysql',
    'tf_oci_nothex_test'
  ])('refuses existing or ambiguous schema %s', (database) => {
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.pathname = `/${database}`;
        })
      )
    ).toThrow();
  });
  it('refuses root or external credentials and options that can redirect the datasource', () => {
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.username = 'root';
        })
      )
    ).toThrow();
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.password = 'inadequate';
        })
      )
    ).toThrow();
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.search = '?socket=/tmp/mysql.sock';
        })
      )
    ).toThrow();
    expect(() =>
      validateCompatibilityTarget(
        changedTarget((url) => {
          url.hash = 'ambiguous';
        })
      )
    ).toThrow();
    expect(() =>
      validateCompatibilityTarget({
        ...validEnvironment(),
        DATABASE_URL: 'mysql://127.0.0.1/traceflow'
      })
    ).toThrow();
  });
  it('the actual CLI rejects production before spawning mysqld or writing a report', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/validate-oci-mysql-compatibility.js')],
      {
        env: {
          PATH: process.env.PATH,
          TEST_DATABASE_URL: 'mysql://root:never-used@10.20.2.25:3306/traceflow_test'
        },
        encoding: 'utf8'
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('SAFETY BLOCKED');
    expect(result.stdout).not.toContain('never-used');
    expect(result.stdout).not.toContain('RUNNING');
  });
  it('preserves an existing report when the CLI refuses to overwrite evidence', async () => {
    const owner = await createOwnedDirectory('123456abcdef');
    const report = join(owner.root, 'prior-evidence.json');
    const original = '{"preserve":"previous run"}\n';
    try {
      await writeFile(report, original);
      const result = spawnSync(
        process.execPath,
        [
          resolve('scripts/validate-oci-mysql-compatibility.js'),
          '--mysql-base',
          owner.root,
          '--expected-version',
          '26.7.0',
          '--report',
          report
        ],
        { env: { PATH: process.env.PATH, ...validEnvironment() }, encoding: 'utf8' }
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('EEXIST');
      expect(result.stdout).not.toContain('RUNNING');
      expect(await readFile(report, 'utf8')).toBe(original);
    } finally {
      await removeOwnedDirectory(owner, { serverStopped: true });
    }
  });
});

describe('effective identity, failure propagation and native evidence', () => {
  const expected = {
    version: '26.7.0',
    serverUuid: 'owned-instance',
    datadir: '/private/owned/data',
    port: '55123',
    database: 'tf_oci_123456abcdef_test',
    ownerToken: 'current-run-owner'
  };
  it('checks the actual version, UUID, datadir, port, database and owner', () => {
    expect(() =>
      assertServerIdentity({ ...expected, datadir: `${expected.datadir}/` }, expected)
    ).not.toThrow();
    for (const key of Object.keys(expected))
      expect(() => assertServerIdentity({ ...expected, [key]: 'different' }, expected)).toThrow();
  });
  it.each(['P1000', 'ER_ACCESS_DENIED_ERROR'])('classifies authentication failure %s', (code) => {
    expect(classifyFailure({ code })).toBe('AUTHENTICATION_FAILED');
  });
  it.each(['ETIMEDOUT', 'P1001', 'P1002', 'P2024'])(
    'classifies connection/pool failure %s',
    (code) => {
      expect(classifyFailure({ code })).toBe('CONNECTION_UNAVAILABLE');
    }
  );
  it.each([{ status: 1 }, { status: null, signal: 'SIGTERM' }, { status: 0, error: 'TIMEOUT' }])(
    'never approves a failed migration command: %j',
    (result) => {
      expect(() => assertCommandResult(result, 'MIGRATE_DEPLOY')).toThrow();
    }
  );
  it('requires a loaded engine for the declared ARM64 platform and a native Argon2 addon', () => {
    const actual = {
      platform: 'linux',
      architecture: 'arm64',
      objects: ['libquery_engine-linux-arm64-openssl-3.0.x.so.node', 'argon2.armv8.node']
    };
    const target = {
      platform: 'linux',
      architecture: 'arm64',
      engine: 'linux-arm64-openssl-3.0.x'
    };
    expect(() => assertNativeRuntime(actual, target)).not.toThrow();
    expect(() => assertNativeRuntime({ ...actual, architecture: 'x64' }, target)).toThrow();
    expect(() =>
      assertNativeRuntime(
        { ...actual, objects: ['libquery_engine-darwin-arm64.dylib.node', 'argon2.node'] },
        target
      )
    ).toThrow();
    expect(() =>
      assertNativeRuntime({ ...actual, objects: [actual.objects[0]] }, target)
    ).toThrow();
    expect(classifyFailure({ code: 'ERR_MODULE_NOT_FOUND' })).toBe('NATIVE_DEPENDENCY_MISSING');
    expect(classifyFailure({ message: 'Prisma engine ELF architecture is incompatible' })).toBe(
      'NATIVE_ENGINE_UNAVAILABLE'
    );
  });
  it('redacts credentials from URLs, command output and failures', () => {
    const environment = validEnvironment();
    const secret = new URL(environment.TEST_DATABASE_URL).password;
    const output = sanitizeOutput(
      `Failed ${environment.TEST_DATABASE_URL}\npassword=${secret}\n${secret}`,
      [secret]
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain('mysql://');
  });
});

describe('cleanup only removes the current stopped owned instance', () => {
  it('refuses running server or altered ownership without deleting any files', async () => {
    const owner = await createOwnedDirectory('123456abcdef');
    const marker = join(owner.root, '.owner.json');
    try {
      await expect(removeOwnedDirectory(owner, { serverStopped: false })).rejects.toThrow();
      const original = await readFile(marker, 'utf8');
      await writeFile(marker, JSON.stringify({ ...owner, token: 'wrong-owner' }));
      await expect(removeOwnedDirectory(owner, { serverStopped: true })).rejects.toThrow();
      await expect(access(marker)).resolves.toBeUndefined();
      await writeFile(marker, original);
    } finally {
      await removeOwnedDirectory(owner, { serverStopped: true });
    }
    await expect(access(owner.root)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('refuses a symlink substituted for the ownership marker', async () => {
    const owner = await createOwnedDirectory('123456abcdef');
    const other = await createOwnedDirectory('abcdef123456');
    const marker = join(owner.root, '.owner.json');
    const original = await readFile(marker, 'utf8');
    try {
      await unlink(marker);
      await symlink(join(other.root, '.owner.json'), marker);
      await expect(removeOwnedDirectory(owner, { serverStopped: true })).rejects.toThrow();
      await expect(access(other.root)).resolves.toBeUndefined();
    } finally {
      await unlink(marker);
      await writeFile(marker, original);
      await removeOwnedDirectory(owner, { serverStopped: true });
      await removeOwnedDirectory(other, { serverStopped: true });
    }
  });
});

describe('partial connection initialization', () => {
  it('disconnects the first owned client if authentication of the second fails', async () => {
    const failure = Object.assign(new Error('synthetic authentication failure'), { code: 'P1000' });
    const client = { $disconnect: vi.fn(), user: { deleteMany: vi.fn() } };
    const connect = vi
      .spyOn(probes, 'connectOwnedPrisma')
      .mockResolvedValueOnce({ client })
      .mockRejectedValueOnce(failure);
    try {
      await expect(concurrencyProbe()).rejects.toBe(failure);
      expect(client.$disconnect).toHaveBeenCalledOnce();
      expect(client.user.deleteMany).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });
});
