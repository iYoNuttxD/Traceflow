import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { connect, isIP } from 'node:net';
import { connect as tlsConnect, checkServerIdentity } from 'node:tls';
import { isAbsolute, resolve, dirname } from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { requireCondition as check } from './oci-compatibility-safety.js';

// Only explicit inputs. This module never loads .env, discovers credentials or runs SQL.
export const managedHost = 'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com';
export const managedCaPath = '/etc/pki/traceflow/mysql-ca.pem';

export const diagnosticPhases = Object.freeze(
  Object.fromEntries(
    [
      'PREVALIDATION',
      'TLS_CA',
      'DNS_IDENTITY',
      'TLS_PROBE',
      'PRISMA_INIT',
      'SQL_IDENTITY',
      'SERVER_IDENTITY',
      'SQL_SESSION_TLS',
      'SESSION_TLS',
      'SQL_SERVER_PARAMETERS',
      'ROLES',
      'SQL_DIRECT_GRANTS',
      'DIRECT_GRANTS',
      'SQL_PUBLIC_GRANTS',
      'EFFECTIVE_GRANTS',
      'SQL_SELECT_ONE',
      'DISCONNECT',
      'UNKNOWN'
    ].map((phase) => [phase, phase])
  )
);

export function isDiagnosticPhase(value) {
  return typeof value === 'string' && Object.hasOwn(diagnosticPhases, value);
}

export function isDiagnosticCode(value) {
  return typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value);
}

// Read data properties only: never invoke metadata getters, coercion or toJSON.
function errorProperty(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

export function sanitizedMysqlCode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'string' && !/^[1-9][0-9]{0,4}$/.test(value)) return undefined;
  const number = Number(value);
  // MySQL protocol error numbers are unsigned 16-bit integers; zero is not an error.
  if (!Number.isInteger(number) || number < 1 || number > 65535) return undefined;
  const canonical = String(number);
  return typeof value === 'number' || canonical === value ? canonical : undefined;
}

export function diagnosticFailure(error, phase) {
  const code = errorProperty(error, 'code');
  const mysqlCode = sanitizedMysqlCode(errorProperty(errorProperty(error, 'meta'), 'code'));
  return {
    status: 'FAIL',
    code: isDiagnosticCode(code) ? code : 'DIAGNOSTIC_FAILED',
    phase: isDiagnosticPhase(phase) ? phase : diagnosticPhases.UNKNOWN,
    ...(mysqlCode === undefined ? {} : { mysqlCode }),
    writes: false
  };
}

export async function protectedFile(path, { privateFile = false, rootOwned = false } = {}) {
  check(isAbsolute(path || '') && path === resolve(path), 'ABSOLUTE_FILE_REQUIRED');
  check((await realpath(path)) === path, 'UNSAFE_FILE');
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const st = await lstat(parent);
    check(st.isDirectory() && [0, process.getuid()].includes(st.uid), 'UNSAFE_FILE_PARENT');
    // A root-owned sticky temporary ancestor is acceptable for the isolated laboratory.
    check(!(st.mode & 0o022) || (st.uid === 0 && st.mode & 0o1000), 'UNSAFE_FILE_PARENT');
    if (parent === dirname(parent)) break;
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await file.stat();
    check(st.isFile() && [0, process.getuid()].includes(st.uid), 'UNSAFE_FILE');
    check(!(st.mode & 0o022) && st.size <= 1024 * 1024, 'UNSAFE_FILE_MODE');
    if (privateFile)
      check(!(st.mode & 0o077) && st.uid === process.getuid(), 'PRIVATE_FILE_REQUIRED');
    if (rootOwned) check(st.uid === 0, 'ROOT_OWNED_CA_REQUIRED');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}

export function publicCaContract(pem, expectedSha256) {
  check(
    /^\s*-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(pem),
    'PUBLIC_CA_REQUIRED'
  );
  let certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch {
    check(false, 'INVALID_CA');
  }
  check(certificate.ca && certificate.verify(certificate.publicKey), 'ROOT_CA_REQUIRED');
  check(
    Date.parse(certificate.validFrom) <= Date.now() && Date.parse(certificate.validTo) > Date.now(),
    'CA_EXPIRED_OR_NOT_YET_VALID'
  );
  const sha256 = createHash('sha256').update(certificate.raw).digest('hex');
  if (expectedSha256) check(sha256 === expectedSha256.toLowerCase(), 'CA_FINGERPRINT_MISMATCH');
  return {
    sha256,
    validFrom: new Date(certificate.validFrom).toISOString(),
    validTo: new Date(certificate.validTo).toISOString()
  };
}

export async function verifyManagedDns(target, resolver = lookup) {
  const addresses = await resolver(target.host, { all: true });
  check(
    addresses.length > 0 && addresses.every((entry) => entry.address === target.expectedAddress),
    'DNS_IDENTITY_MISMATCH'
  );
}

export function verifyServerIdentity(identity, target, local) {
  check(
    identity.db === target.schema &&
      identity.uuid === target.serverUuid &&
      Number(identity.port) === target.port &&
      identity.version === target.version &&
      identity.currentUser?.split('@')[0] === target.user &&
      (!local || identity.datadir.replace(/\/$/, '') === target.datadir.replace(/\/$/, '')),
    'SERVER_IDENTITY_MISMATCH'
  );
}

export function connectionContract(environment, authorization) {
  check(!environment.DATABASE_URL, 'AMBIGUOUS_DATABASE_URL');
  check(
    authorization?.formatVersion === 1 && authorization.operation === 'diagnose-read-only',
    'READ_ONLY_REQUIRED'
  );
  check(['local-isolated', 'oci-read-only'].includes(authorization.mode), 'MODE_REQUIRED');
  const expires = Date.parse(authorization.expiresAt);
  check(expires > Date.now() && expires < Date.now() + 86400000, 'AUTHORIZATION_EXPIRED');
  const local = authorization.mode === 'local-isolated';
  check(
    !environment[local ? 'HEATWAVE_DIAGNOSTIC_DATABASE_URL' : 'TEST_DATABASE_URL'] &&
      !environment.TEST_RUNTIME_DATABASE_URL &&
      !environment.MIGRATION_DATABASE_URL &&
      !environment.RUNTIME_DATABASE_URL,
    'AMBIGUOUS_CREDENTIAL_ENVIRONMENT'
  );
  check(
    !environment.NODE_TLS_REJECT_UNAUTHORIZED || environment.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    'INSECURE_TLS_ENVIRONMENT'
  );
  const value = environment[local ? 'TEST_DATABASE_URL' : 'HEATWAVE_DIAGNOSTIC_DATABASE_URL'];
  check(value, local ? 'TEST_DATABASE_URL_REQUIRED' : 'EXPLICIT_CREDENTIAL_REQUIRED');
  let url;
  try {
    url = new URL(value);
  } catch {
    check(false, 'INVALID_DATABASE_URL');
  }
  const target = authorization.target;
  check(
    target &&
      url.protocol === 'mysql:' &&
      !url.hash &&
      url.hostname === target.host &&
      Number(url.port || 3306) === target.port &&
      decodeURIComponent(url.pathname.slice(1)) === target.schema &&
      decodeURIComponent(url.username) === target.user &&
      url.password &&
      /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(target.schema) &&
      !/^(root|admin|administrator|mysql\.)/i.test(target.user),
    'TARGET_MISMATCH'
  );
  check(
    /^[a-f0-9-]{36}$/.test(target.serverUuid) && typeof target.version === 'string',
    'SERVER_IDENTITY_REQUIRED'
  );
  if (local)
    check(
      target.host === '127.0.0.1' &&
        target.port >= 49152 &&
        target.port <= 65535 &&
        /^tf_oci_[a-f0-9]{12}_test$/.test(target.schema) &&
        target.datadir,
      'PROTECTED_DATABASE_TARGET'
    );
  else
    check(
      authorization.approved === true &&
        target.expectedAddress === '10.20.2.25' &&
        target.port === 3306 &&
        target.host === managedHost &&
        !/(?:^|_)(?:dev|development|test)(?:_|$)/i.test(target.schema) &&
        /^[a-fA-F0-9]{64}$/.test(target.caSha256 || ''),
      'REMOTE_APPROVAL_REQUIRED'
    );
  const allowed = [
    'sslaccept',
    'sslcert',
    'connection_limit',
    'connect_timeout',
    'pool_timeout',
    'socket_timeout'
  ];
  check(
    [...url.searchParams.keys()].every(
      (k) => allowed.includes(k) && url.searchParams.getAll(k).length === 1
    ),
    'UNREVIEWED_CONNECTION_OPTION'
  );
  check(
    url.searchParams.get('sslaccept') === 'strict' &&
      isAbsolute(url.searchParams.get('sslcert') || ''),
    'STRICT_TLS_REQUIRED'
  );
  check(
    url.searchParams.get('connection_limit') === '1' &&
      url.searchParams.get('connect_timeout') === '5' &&
      url.searchParams.get('pool_timeout') === '5' &&
      url.searchParams.get('socket_timeout') === '10',
    'BOUNDED_DIAGNOSTIC_POOL_REQUIRED'
  );
  if (!local) check(url.searchParams.get('sslcert') === managedCaPath, 'MANAGED_CA_PATH_REQUIRED');
  return { value, url, target, local, ca: url.searchParams.get('sslcert') };
}

export function validateGrants(rows, schema, role = 'diagnostic') {
  const allowed =
    role === 'runtime' ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] : ['SELECT', 'SHOW VIEW'];
  check(['runtime', 'diagnostic', 'backup'].includes(role), 'UNKNOWN_ROLE');
  const privileges = new Set();
  for (const row of rows) {
    const grant = typeof row === 'string' ? row : Object.values(row)[0];
    if (/^GRANT USAGE ON \*\.\* TO [^\n]+$/.test(grant) && !grant.includes('WITH GRANT OPTION'))
      continue;
    const match = /^GRANT ([A-Z ,]+) ON (`[^`]+`\.\*) TO [^\n]+$/.exec(grant);
    check(
      match && match[2] === '`' + schema + '`.*' && !grant.includes('WITH GRANT OPTION'),
      'EXCESSIVE_OR_UNRESOLVED_GRANTS'
    );
    for (const privilege of match[1].split(',').map((x) => x.trim())) {
      check(allowed.includes(privilege), 'EXCESSIVE_OR_UNRESOLVED_GRANTS');
      privileges.add(privilege);
    }
  }
  // SELECT on the target schema is required. Role grants are refused rather than guessed.
  check(privileges.has('SELECT'), 'SELECT_PRIVILEGE_REQUIRED');
  return [...privileges].sort();
}

/** Resolve only the known mandatory public role; never guess effective privileges. */
export function diagnosticRoles({ mandatoryRoles, activeRoles }) {
  const publicRole = /^(?:public|['`"]public['`"])(?:@(?:%|['`"]%['`"]))?$/;
  check(
    typeof mandatoryRoles === 'string' && typeof activeRoles === 'string',
    'ROLE_METADATA_REQUIRED'
  );
  const mandatoryPublic = publicRole.test(mandatoryRoles);
  check(mandatoryRoles === '' || mandatoryPublic, 'UNREVIEWED_MANDATORY_ROLE');
  check(
    activeRoles === 'NONE' || (mandatoryPublic && publicRole.test(activeRoles)),
    'UNREVIEWED_ACTIVE_ROLE'
  );
  return { mandatoryPublic, activePublic: activeRoles !== 'NONE' };
}

export function validateEffectiveGrants(rows, schema, role, roles) {
  const explicit = rows.filter((row) => {
    const grant = typeof row === 'string' ? row : Object.values(row)[0];
    // Ignore only the assignment after proving mandatory public and separately expanding it.
    return !(roles.mandatoryPublic && /^GRANT `public`@`%` TO `[^`]+`@`[^`]+`$/.test(grant));
  });
  return validateGrants(explicit, schema, role);
}

export async function mysqlTlsProbe({ host, port, ca, timeoutMs = 5000 }) {
  // MySQL STARTTLS handshake only, no authentication packet or query.
  return new Promise((accept, reject) => {
    const socket = connect({ host, port });
    let secure,
      data = Buffer.alloc(0),
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (secure) secure.destroy();
      else socket.destroy();
      if (error)
        reject(
          Object.assign(new Error('TLS_VALIDATION_FAILED'), {
            code: error.code || 'TLS_VALIDATION_FAILED'
          })
        );
      else accept(result);
    };
    const timer = setTimeout(() => finish({ code: 'TLS_TIMEOUT' }), timeoutMs);
    socket.once('error', finish);
    const greeting = (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length < 4) return;
      const length = data.readUIntLE(0, 3);
      if (length > 8192) return finish({ code: 'MYSQL_GREETING_INVALID' });
      if (data.length < length + 4) return;
      const payload = data.subarray(4),
        end = payload.indexOf(0, 1);
      if (
        payload[0] !== 10 ||
        end < 2 ||
        end + 15 >= payload.length ||
        !(payload.readUInt16LE(end + 14) & 0x800)
      )
        return finish({ code: 'TLS_REQUIRED' });
      socket.off('data', greeting);
      const request = Buffer.alloc(36);
      request.writeUIntLE(32, 0, 3);
      request[3] = 1;
      request.writeUInt32LE(0x00088a00, 4);
      request.writeUInt32LE(16 * 1024 * 1024, 8);
      request[12] = 45;
      socket.write(request);
      secure = tlsConnect(
        {
          socket,
          ca,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          ...(isIP(host) ? {} : { servername: host }),
          checkServerIdentity: (_hostname, cert) => checkServerIdentity(host, cert)
        },
        () => {
          const cert = secure.getPeerCertificate();
          const error = checkServerIdentity(host, cert);
          if (error) return finish(error);
          finish(null, {
            verified: secure.authorized,
            protocol: secure.getProtocol(),
            cipher: secure.getCipher().name,
            certificateSha256: createHash('sha256').update(cert.raw).digest('hex'),
            validFrom: new Date(cert.valid_from).toISOString(),
            validTo: new Date(cert.valid_to).toISOString(),
            identityVerified: true
          });
        }
      );
      secure.once('error', finish);
    };
    socket.on('data', greeting);
    socket.once('end', () => finish({ code: 'TLS_PEER_CLOSED' }));
  });
}
