import { readFile, lstat, realpath } from 'node:fs/promises';
import { connect, isIP } from 'node:net';
import { connect as tlsConnect, checkServerIdentity } from 'node:tls';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { requireCondition as check } from './oci-compatibility-safety.js';

// Only explicit inputs. This module never loads .env, discovers credentials or runs SQL.
export async function protectedFile(path, { privateFile = false } = {}) {
  check(isAbsolute(path || ''), 'ABSOLUTE_FILE_REQUIRED');
  const st = await lstat(path);
  check(
    st.isFile() && !st.isSymbolicLink() && (await realpath(path)) === resolve(path),
    'UNSAFE_FILE'
  );
  check(!(st.mode & 0o022) && st.size <= 1024 * 1024, 'UNSAFE_FILE_MODE');
  if (privateFile)
    check(!(st.mode & 0o077) && st.uid === process.getuid(), 'PRIVATE_FILE_REQUIRED');
  return readFile(path, 'utf8');
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
        /^tf_oci_[a-f0-9]{12}_test$/.test(target.schema) &&
        target.datadir,
      'PROTECTED_DATABASE_TARGET'
    );
  else
    check(
      authorization.approved === true &&
        target.expectedAddress === '10.20.2.25' &&
        target.port === 3306 &&
        !['localhost', '127.0.0.1'].includes(target.host),
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
