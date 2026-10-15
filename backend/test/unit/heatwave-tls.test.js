import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  realpath,
  chmod,
  symlink,
  mkdir
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import { once } from 'node:events';
import { createHash, X509Certificate } from 'node:crypto';
import {
  mysqlTlsProbe,
  publicCaContract,
  protectedFile
} from '../../scripts/lib/heatwave-connection.js';
let root, ca, key;
const certs = {};
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'traceflow-tls-'));
  const command = (args) => execFileSync('openssl', args, { cwd: root, stdio: 'ignore' });
  await writeFile(
    join(root, 'root.cnf'),
    '[req]\ndistinguished_name=dn\nx509_extensions=root_ca\n[dn]\n[root_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n'
  );
  command([
    'req',
    '-config',
    'root.cnf',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '2',
    '-subj',
    '/CN=Synthetic test CA'
  ]);
  command([
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'server.key',
    '-out',
    'server.csr',
    '-subj',
    '/CN=localhost'
  ]);
  for (const kind of ['valid', 'expired', 'identity']) {
    await writeFile(
      join(root, kind + '.ext'),
      'subjectAltName=IP:' +
        (kind === 'identity' ? '127.0.0.2' : '127.0.0.1') +
        '\nextendedKeyUsage=serverAuth\n'
    );
    if (kind === 'expired') {
      await writeFile(join(root, 'index.txt'), '');
      await writeFile(join(root, 'serial'), '1000\n');
      await writeFile(
        join(root, 'ca.cnf'),
        '[ca]\ndefault_ca=local\n[local]\ndatabase=index.txt\nserial=serial\nnew_certs_dir=.\ncertificate=ca.pem\nprivate_key=ca.key\ndefault_md=sha256\ndefault_days=1\npolicy=policy\n[policy]\ncommonName=supplied\n'
      );
      command([
        'ca',
        '-batch',
        '-notext',
        '-config',
        'ca.cnf',
        '-in',
        'server.csr',
        '-out',
        'expired.pem',
        '-startdate',
        '20200101000000Z',
        '-enddate',
        '20200102000000Z',
        '-extfile',
        'expired.ext'
      ]);
    } else {
      command([
        'x509',
        '-req',
        '-in',
        'server.csr',
        '-CA',
        'ca.pem',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-out',
        kind + '.pem',
        '-days',
        '1',
        '-extfile',
        kind + '.ext'
      ]);
    }
    certs[kind] = await readFile(join(root, kind + '.pem'));
  }
  ca = await readFile(join(root, 'ca.pem'));
  key = await readFile(join(root, 'server.key'));
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true });
});
async function peer({ kind = 'valid', supportsTls = true, silent = false, stall = false } = {}) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    if (silent) return;
    const version = Buffer.from('26.7.0\0');
    const data = Buffer.alloc(1 + version.length + 4 + 8 + 1 + 2 + 20);
    data[0] = 10;
    version.copy(data, 1);
    data.writeUInt16LE(supportsTls ? 0xffff : 0xf7ff, 1 + version.length + 13);
    const header = Buffer.alloc(4);
    header.writeUIntLE(data.length, 0, 3);
    socket.write(Buffer.concat([header, data]));
    let request = Buffer.alloc(0);
    const upgrade = (chunk) => {
      request = Buffer.concat([request, chunk]);
      if (request.length < 36 || stall) return;
      socket.pause();
      socket.off('data', upgrade);
      if (request.length > 36) socket.unshift(request.subarray(36));
      sockets.delete(socket);
      const secure = new TLSSocket(socket, {
        isServer: true,
        secureContext: createSecureContext({ key, cert: certs[kind] })
      });
      sockets.add(secure);
      secure.on('error', () => {});
      secure.once('close', () => sockets.delete(secure));
      secure.resume();
    };
    socket.on('data', upgrade);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}
describe('real MySQL STARTTLS boundary with synthetic certificates', () => {
  it('validates chain, SAN, dates and closes the upgraded socket', async () => {
    const server = await peer();
    try {
      const result = await mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca });
      expect(result.verified).toBe(true);
      expect(result.identityVerified).toBe(true);
      expect(result.protocol).toMatch(/^TLSv1\.[23]$/);
    } finally {
      await server.close();
    }
  });
  it.each(['expired', 'identity'])('rejects %s certificate', async (kind) => {
    const server = await peer({ kind });
    try {
      await expect(
        mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca })
      ).rejects.toMatchObject({
        code: kind === 'expired' ? 'CERT_HAS_EXPIRED' : 'ERR_TLS_CERT_ALTNAME_INVALID'
      });
    } finally {
      await server.close();
    }
  });
  it('rejects unknown CA', async () => {
    const server = await peer();
    try {
      await expect(
        mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca: undefined })
      ).rejects.toMatchObject({
        code: expect.stringMatching(
          /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|SELF_SIGNED_CERT_IN_CHAIN)$/
        )
      });
    } finally {
      await server.close();
    }
  });
  it('rejects plaintext downgrade', async () => {
    const server = await peer({ supportsTls: false });
    try {
      await expect(
        mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca })
      ).rejects.toMatchObject({ code: 'TLS_REQUIRED' });
    } finally {
      await server.close();
    }
  });
  it.each([{ silent: true }, { stall: true }])(
    'bounds silent greeting/handshake',
    async (options) => {
      const server = await peer(options);
      try {
        await expect(
          mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca, timeoutMs: 100 })
        ).rejects.toMatchObject({ code: 'TLS_TIMEOUT' });
      } finally {
        await server.close();
      }
    }
  );
  it('reports inaccessible port without exposing supplied config', async () => {
    const server = await peer();
    await server.close();
    await expect(mysqlTlsProbe({ host: '127.0.0.1', port: server.port, ca })).rejects.toMatchObject(
      { code: 'ECONNREFUSED' }
    );
  });
});

describe('OCI061 pinned public CA and protected paths', () => {
  it('checks root CA and DER fingerprint, rejecting wrong pins, leaf, garbage and private key', async () => {
    const pem = ca.toString();
    const digest = createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
    expect(publicCaContract(pem, digest).sha256).toBe(digest);
    for (const timestamp of [0, Date.parse('2100-01-01')]) {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(timestamp);
      try {
        expect(() => publicCaContract(pem, digest)).toThrow(
          expect.objectContaining({ code: 'CA_EXPIRED_OR_NOT_YET_VALID' })
        );
      } finally {
        clock.mockRestore();
      }
    }
    expect(() => publicCaContract(pem, '0'.repeat(64))).toThrow(
      expect.objectContaining({ code: 'CA_FINGERPRINT_MISMATCH' })
    );
    expect(() => publicCaContract(certs.valid.toString())).toThrow(
      expect.objectContaining({ code: 'ROOT_CA_REQUIRED' })
    );
    expect(() => publicCaContract('invalid')).toThrow(
      expect.objectContaining({ code: 'PUBLIC_CA_REQUIRED' })
    );
    expect(() => publicCaContract(pem + pem)).toThrow(
      expect.objectContaining({ code: 'PUBLIC_CA_REQUIRED' })
    );
    expect(() => publicCaContract(key.toString())).toThrow(
      expect.objectContaining({ code: 'PUBLIC_CA_REQUIRED' })
    );
    expect(() =>
      publicCaContract('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')
    ).toThrow(expect.objectContaining({ code: 'INVALID_CA' }));
  });
  it('accepts only protected regular files, rejecting absent, linked, open-mode and writable-parent paths', async () => {
    const base = await realpath(root);
    const path = join(base, 'authorization.json');
    await writeFile(path, '{}', { mode: 0o600 });
    expect(await protectedFile(path, { privateFile: true })).toBe('{}');
    await chmod(path, 0o644);
    await expect(protectedFile(path, { privateFile: true })).rejects.toMatchObject({
      code: 'PRIVATE_FILE_REQUIRED'
    });
    await chmod(path, 0o666);
    await expect(protectedFile(path)).rejects.toMatchObject({ code: 'UNSAFE_FILE_MODE' });
    await chmod(path, 0o600);
    await symlink(path, join(base, 'linked'));
    await expect(protectedFile(join(base, 'linked'))).rejects.toMatchObject({
      code: 'UNSAFE_FILE'
    });
    await expect(protectedFile(join(base, 'absent'))).rejects.toMatchObject({ code: 'ENOENT' });
    const unsafe = join(base, 'unsafe');
    await mkdir(unsafe);
    await chmod(unsafe, 0o777);
    await writeFile(join(unsafe, 'file'), '{}', { mode: 0o600 });
    await expect(protectedFile(join(unsafe, 'file'))).rejects.toMatchObject({
      code: 'UNSAFE_FILE_PARENT'
    });
    await chmod(unsafe, 0o700);
    await chmod(path, 0o000);
    await expect(protectedFile(path)).rejects.toMatchObject({ code: 'EACCES' });
    await chmod(path, 0o600);
  });
});
