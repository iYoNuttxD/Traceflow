import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { connectionContract, validateGrants } from '../../scripts/lib/heatwave-connection.js';

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
    f.authorization.target.host = 'database.internal';
    u.hostname = 'database.internal';
    u.port = '3306';
    Object.assign(f.authorization.target, { port: 3306, expectedAddress: '10.20.2.25' });
    const e = { HEATWAVE_DIAGNOSTIC_DATABASE_URL: u.toString() };
    expect(() => connectionContract(e, f.authorization)).toThrow();
    f.authorization.approved = true;
    expect(connectionContract(e, f.authorization).local).toBe(false);
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
