import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  connectionContract,
  validateGrants,
  diagnosticRoles,
  validateDirectGrants,
  validateEffectiveGrants,
  validateRoleGraph,
  managedHost,
  managedCaPath,
  verifyServerIdentity,
  verifyManagedDns
} from '../../scripts/lib/heatwave-connection.js';

function fixture() {
  const target = {
    host: '127.0.0.1',
    port: 55061,
    schema: 'tf_oci_abcdef012345_test',
    user: 'tf06_reader',
    serverUuid: '12345678-1234-1234-1234-123456789012',
    version: '26.7.0',
    datadir: '/private/disposable/data'
  };
  const url = new URL('mysql://127.0.0.1');
  Object.assign(url, {
    port: String(target.port),
    pathname: target.schema,
    username: target.user,
    password: randomBytes(32).toString('hex')
  });
  for (const [k, v] of Object.entries({
    sslaccept: 'strict',
    sslcert: '/private/synthetic-ca.pem',
    connection_limit: '1',
    connect_timeout: '5',
    pool_timeout: '5',
    socket_timeout: '10'
  }))
    url.searchParams.set(k, v);
  return {
    environment: { TEST_DATABASE_URL: url.toString() },
    authorization: {
      formatVersion: 1,
      operation: 'diagnose-read-only',
      mode: 'local-isolated',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      target
    }
  };
}
describe('OCI06 explicit read-only boundary', () => {
  it('accepts an explicit bounded TLS target', () => {
    const f = fixture();
    expect(connectionContract(f.environment, f.authorization).local).toBe(true);
  });
  it.each([
    'DATABASE_URL',
    'missing-test',
    'expired',
    'mode',
    'operation',
    'schema',
    'host',
    'port',
    'user',
    'identity',
    'tls',
    'ca',
    'pool',
    'timeout',
    'unknown-option',
    'duplicate-option'
  ])('rejects %s before connecting', (mutation) => {
    const f = fixture(),
      a = f.authorization,
      e = f.environment,
      u = new URL(e.TEST_DATABASE_URL);
    if (mutation === 'DATABASE_URL') e.DATABASE_URL = e.TEST_DATABASE_URL;
    if (mutation === 'missing-test') delete e.TEST_DATABASE_URL;
    if (mutation === 'expired') a.expiresAt = '2000-01-01T00:00:00Z';
    if (mutation === 'mode') a.mode = 'production';
    if (mutation === 'operation') a.operation = 'migrate';
    if (mutation === 'schema') {
      a.target.schema = 'traceflow';
      u.pathname = 'traceflow';
    }
    if (mutation === 'host') {
      a.target.host = '10.20.2.25';
      u.hostname = a.target.host;
    }
    if (mutation === 'port') {
      a.target.port = 3306;
      u.port = '3306';
    }
    if (mutation === 'user') {
      a.target.user = 'root';
      u.username = 'root';
    }
    if (mutation === 'identity') delete a.target.serverUuid;
    if (mutation === 'tls') u.searchParams.set('sslaccept', 'accept_invalid_certs');
    if (mutation === 'ca') u.searchParams.set('sslcert', 'relative.pem');
    if (mutation === 'pool') u.searchParams.set('connection_limit', '100');
    if (mutation === 'timeout') u.searchParams.set('socket_timeout', '0');
    if (mutation === 'unknown-option') u.searchParams.set('socket', '/mysql.sock');
    if (mutation === 'duplicate-option') u.searchParams.append('sslaccept', 'strict');
    if (mutation !== 'missing-test') e.TEST_DATABASE_URL = u.toString();
    expect(() => connectionContract(e, a)).toThrow();
  });
  it('requires separate explicit managed approval', () => {
    const f = fixture(),
      u = new URL(f.environment.TEST_DATABASE_URL);
    f.authorization.mode = 'oci-read-only';
    f.authorization.target.host = managedHost;
    f.authorization.target.schema = 'tfproduction';
    f.authorization.target.caSha256 = 'a'.repeat(64);
    u.hostname = managedHost;
    u.pathname = 'tfproduction';
    u.searchParams.set('sslcert', managedCaPath);
    u.port = '3306';
    Object.assign(f.authorization.target, { port: 3306, expectedAddress: '10.20.2.25' });
    const e = { HEATWAVE_DIAGNOSTIC_DATABASE_URL: u.toString() };
    expect(() => connectionContract(e, f.authorization)).toThrow();
    f.authorization.approved = true;
    expect(connectionContract(e, f.authorization).local).toBe(false);
  });
});
describe('OCI061 identity and environment boundaries', () => {
  it('refuses DNS errors, empty or mixed answers without alternate lookup', async () => {
    const target = { host: managedHost, expectedAddress: '10.20.2.25' };
    let calls = 0;
    await expect(
      verifyManagedDns(target, async () => {
        calls++;
        throw Object.assign(new Error(), { code: 'ENOTFOUND' });
      })
    ).rejects.toMatchObject({ code: 'ENOTFOUND' });
    expect(calls).toBe(1);
    for (const addresses of [
      [],
      [{ address: '127.0.0.1' }],
      [{ address: '10.20.2.25' }, { address: '10.20.2.26' }]
    ])
      await expect(verifyManagedDns(target, async () => addresses)).rejects.toMatchObject({
        code: 'DNS_IDENTITY_MISMATCH'
      });
    await expect(
      verifyManagedDns(target, async () => [{ address: '10.20.2.25' }])
    ).resolves.toBeUndefined();
  });

  it.each([
    'HEATWAVE_DIAGNOSTIC_DATABASE_URL',
    'TEST_RUNTIME_DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'RUNTIME_DATABASE_URL'
  ])('rejects mixed %s in local mode', (name) => {
    const f = fixture();
    f.environment[name] = f.environment.TEST_DATABASE_URL;
    expect(() => connectionContract(f.environment, f.authorization)).toThrow(
      expect.objectContaining({ code: 'AMBIGUOUS_CREDENTIAL_ENVIRONMENT' })
    );
  });
  it.each([
    'test-variable',
    'wrong-fqdn',
    'ip-host',
    'dev-schema',
    'ca-path',
    'missing-pin',
    'tls-environment',
    'malformed-url',
    'long-approval'
  ])('rejects managed %s without network', (kind) => {
    const f = fixture();
    const u = new URL(f.environment.TEST_DATABASE_URL);
    Object.assign(f.authorization, { mode: 'oci-read-only', approved: true });
    Object.assign(f.authorization.target, {
      host: managedHost,
      port: 3306,
      schema: 'tfproduction',
      expectedAddress: '10.20.2.25',
      caSha256: 'a'.repeat(64)
    });
    u.hostname = managedHost;
    u.port = '3306';
    u.pathname = 'tfproduction';
    u.searchParams.set('sslcert', managedCaPath);
    const e = { HEATWAVE_DIAGNOSTIC_DATABASE_URL: u.toString() };
    if (kind === 'test-variable') e.TEST_DATABASE_URL = f.environment.TEST_DATABASE_URL;
    if (kind === 'wrong-fqdn' || kind === 'ip-host') {
      u.hostname = kind === 'ip-host' ? '10.20.2.25' : 'other.invalid';
      f.authorization.target.host = u.hostname;
    }
    if (kind === 'dev-schema') {
      u.pathname = 'traceflow_dev';
      f.authorization.target.schema = 'traceflow_dev';
    }
    if (kind === 'ca-path') u.searchParams.set('sslcert', '/home/opc/traceflow-ca.crt');
    if (kind === 'missing-pin') delete f.authorization.target.caSha256;
    if (kind === 'tls-environment') e.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    if (kind === 'long-approval')
      f.authorization.expiresAt = new Date(Date.now() + 86400000 * 2).toISOString();
    e.HEATWAVE_DIAGNOSTIC_DATABASE_URL = kind === 'malformed-url' ? 'invalid' : u.toString();
    expect(() => connectionContract(e, f.authorization)).toThrow();
  });
  it('requires actual authenticated account, version, UUID, schema, port and owned datadir', () => {
    const { target } = fixture().authorization;
    const identity = {
      db: target.schema,
      uuid: target.serverUuid,
      version: target.version,
      port: target.port,
      datadir: target.datadir + '/',
      currentUser: target.user + '@127.0.0.1'
    };
    expect(() => verifyServerIdentity(identity, target, true)).not.toThrow();
    for (const name of ['db', 'uuid', 'version', 'port', 'datadir', 'currentUser'])
      expect(() =>
        verifyServerIdentity({ ...identity, [name]: 'unexpected' }, target, true)
      ).toThrow(expect.objectContaining({ code: 'SERVER_IDENTITY_MISMATCH' }));
  });
});
describe('least privileges', () => {
  it('allows bounded runtime DML', () =>
    expect(
      validateGrants(
        [
          'GRANT USAGE ON *.* TO `u`@`h`',
          'GRANT SELECT, INSERT, UPDATE, DELETE ON `tf_test`.* TO `u`@`h`'
        ],
        'tf_test',
        'runtime'
      )
    ).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']));
  it.each([
    'CREATE',
    'ALTER',
    'DROP',
    'INDEX',
    'FILE',
    'SUPER',
    'ALL PRIVILEGES',
    'GRANT OPTION',
    'TRIGGER'
  ])('refuses runtime %s', (right) =>
    expect(() =>
      validateGrants(
        ['GRANT SELECT, ' + right + ' ON `tf_test`.* TO `u`@`h`'],
        'tf_test',
        'runtime'
      )
    ).toThrow()
  );
  it.each([
    'GRANT SELECT ON *.* TO `u`@`h`',
    'GRANT SELECT ON `traceflow`.* TO `u`@`h`',
    'GRANT `administrator`@`%` TO `u`@`h`',
    'GRANT SELECT ON `tf_test`.* TO `u`@`h` WITH GRANT OPTION'
  ])('refuses unresolved or excessive grants', (grant) =>
    expect(() => validateGrants([grant], 'tf_test')).toThrow()
  );
  it('does not allow DML on diagnostic credential', () =>
    expect(() =>
      validateGrants(['GRANT SELECT, INSERT ON `tf_test`.* TO `u`@`h`'], 'tf_test')
    ).toThrow());
});

describe('mandatory role expansion boundary', () => {
  it('requires complete known role metadata', () => {
    expect(diagnosticRoles({ mandatoryRoles: '', activeRoles: 'NONE' })).toEqual({
      mandatoryPublic: false,
      activePublic: false
    });
    for (const value of ['public', "'public'@'%'", '`public`@`%`']) {
      expect(diagnosticRoles({ mandatoryRoles: value, activeRoles: 'NONE' }).mandatoryPublic).toBe(
        true
      );
      expect(
        diagnosticRoles({ mandatoryRoles: value, activeRoles: '`public`@`%`' }).activePublic
      ).toBe(true);
    }
    for (const metadata of [
      {},
      { mandatoryRoles: 'admin', activeRoles: 'NONE' },
      { mandatoryRoles: 'public,admin', activeRoles: 'NONE' },
      { mandatoryRoles: 'public@localhost', activeRoles: 'NONE' },
      { mandatoryRoles: "'public`", activeRoles: 'NONE' },
      { mandatoryRoles: 'public\n', activeRoles: 'NONE' },
      { mandatoryRoles: 'public', activeRoles: '`public`@`%`\n' },
      { mandatoryRoles: 'public', activeRoles: "`public'@`%`" },
      { mandatoryRoles: '', activeRoles: '`public`@`%`' },
      { mandatoryRoles: 'public', activeRoles: '`admin`@`%`' }
    ]) {
      expect(() => diagnosticRoles(metadata)).toThrow();
    }
  });
  it('refuses mandatory role inheritance even with a recognized graph and claimed expansion', () => {
    const base = ['GRANT USAGE ON *.* TO `u`@`h`', 'GRANT SELECT ON `tf_test`.* TO `u`@`h`'];
    const roles = diagnosticRoles({ mandatoryRoles: 'public', activeRoles: 'NONE' });
    const assignment = 'GRANT `public`@`%` TO `u`@`h`';
    const direct = validateDirectGrants(base, 'tf_test', 'diagnostic', roles, 'u@h');
    const graphVerified = validateRoleGraph(
      [
        {
          USER: 'u',
          HOST: 'h',
          GRANTEE: 'u',
          GRANTEE_HOST: 'h',
          ROLE_NAME: 'public',
          ROLE_HOST: '%',
          IS_GRANTABLE: 'NO',
          IS_MANDATORY: 'YES'
        }
      ],
      roles,
      'u@h'
    );
    // Recognizing the old graph shape is not proof of inherited privileges or warnings.
    expect(() =>
      validateDirectGrants([...base, assignment], 'tf_test', 'diagnostic', roles, 'u@h')
    ).toThrow();
    for (const rows of [base, [...base, assignment]])
      expect(() =>
        validateEffectiveGrants(rows, 'tf_test', 'diagnostic', roles, {
          direct,
          currentUser: 'u@h',
          graphVerified
        })
      ).toThrow(expect.objectContaining({ code: 'EFFECTIVE_GRANTS_UNVERIFIED' }));
  });
  it('preserves direct-only audit and refuses incomplete or excessive evidence', () => {
    const base = ['GRANT USAGE ON *.* TO `u`@`h`', 'GRANT SELECT ON `tf_test`.* TO `u`@`h`'];
    const roles = diagnosticRoles({ mandatoryRoles: '', activeRoles: 'NONE' });
    const evidence = {
      currentUser: 'u@h',
      direct: validateDirectGrants(base, 'tf_test', 'diagnostic', roles, 'u@h'),
      graphVerified: false
    };
    expect(validateEffectiveGrants(base, 'tf_test', 'diagnostic', roles, evidence)).toEqual([
      'SELECT'
    ]);
    for (const extra of [
      'GRANT INSERT ON `tf_test`.* TO `u`@`h`',
      'GRANT SELECT ON *.* TO `u`@`h`',
      'GRANT SELECT ON `other`.* TO `u`@`h`',
      'GRANT `public`@`%` TO `u`@`h`',
      'GRANT `nested`@`%` TO `u`@`h` WITH ADMIN OPTION',
      'GRANT SELECT ON `tf_test`.* TO `u`@`h` WITH GRANT OPTION'
    ])
      expect(() =>
        validateEffectiveGrants([...base, extra], 'tf_test', 'diagnostic', roles, evidence)
      ).toThrow();
    expect(() => validateEffectiveGrants(base, 'tf_test', 'diagnostic', roles)).toThrow(
      expect.objectContaining({ code: 'EFFECTIVE_GRANTS_UNVERIFIED' })
    );
  });
  it('compares the complete authenticated identity when the authorization specifies it', () => {
    const { target } = fixture().authorization;
    target.account = target.user + '@10.20.1.184';
    const identity = {
      db: target.schema,
      uuid: target.serverUuid,
      version: target.version,
      port: target.port,
      datadir: target.datadir,
      currentUser: target.account
    };
    expect(() => verifyServerIdentity(identity, target, true)).not.toThrow();
    expect(() =>
      verifyServerIdentity({ ...identity, currentUser: target.user + '@%' }, target, true)
    ).toThrow(expect.objectContaining({ code: 'SERVER_IDENTITY_MISMATCH' }));
  });
});
