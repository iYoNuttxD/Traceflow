import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { createEmailProvider } from '../../src/shared/email/email.provider.js';
import { controlledSmtp } from '../helpers/smtp-server.js';

let directory, key, cert;
const transports = [],
  servers = [];
const original = nodemailer.createTransport.bind(nodemailer);
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'oci03-smtp-'));
  await writeFile(
    join(directory, 'openssl.cnf'),
    '[req]\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\n[extensions]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n'
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-config',
      join(directory, 'openssl.cnf'),
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem')
    ],
    { stdio: 'ignore' }
  );
  key = await readFile(join(directory, 'key.pem'));
  cert = await readFile(join(directory, 'cert.pem'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const transport of transports.splice(0)) transport.close();
  for (const server of servers.splice(0)) await server.close();
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function setup(options = {}, trusted = true) {
  const server = await controlledSmtp({ key, cert, ...options });
  servers.push(server);
  const spy = vi.spyOn(nodemailer, 'createTransport').mockImplementation((configuration) => {
    const transport = original({
      ...configuration,
      tls: { ...configuration.tls, ...(trusted ? { ca: cert } : {}) }
    });
    transports.push(transport);
    return transport;
  });
  const provider = createEmailProvider({
    emailProvider: 'smtp',
    isProduction: true,
    smtpHost: '127.0.0.1',
    smtpPort: server.port,
    smtpSecure: Boolean(options.implicit),
    smtpUser: 'synthetic',
    smtpPassword: 'synthetic-password',
    smtpConnectionTimeoutMs: options.connectionTimeoutMs ?? 800,
    smtpGreetingTimeoutMs: 300,
    smtpSocketTimeoutMs: 300
  });
  return { server, provider, spy };
}
const message = {
  from: 'from@example.test',
  to: 'to@example.test',
  subject: 'Controlled',
  text: 'Synthetic message'
};
describe('SMTP production transport', () => {
  it('preserves only numeric SMTP failure classification, never provider response text', async () => {
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: async () => {
        throw Object.assign(new Error('password=private provider text'), { responseCode: 450 });
      }
    });
    const provider = createEmailProvider({ emailProvider: 'smtp' });
    await expect(provider.send(message)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      responseCode: 450,
      message: 'Não foi possível enviar o e-mail.'
    });
  });

  it.each([false, true])(
    'requires verified TLS (implicit=%s), then sends only to the controlled peer',
    async (implicit) => {
      const { server, provider, spy } = await setup({ implicit });
      await provider.send(message);
      expect(server.messages).toHaveLength(1);
      expect(server.messages[0].encrypted).toBe(true);
      expect(
        server.commands
          .filter((entry) => ['AUTH', 'MAIL', 'DATA'].includes(entry.command))
          .every((entry) => entry.encrypted)
      ).toBe(true);
      expect(spy.mock.calls[0][0]).toMatchObject({
        secure: implicit,
        requireTLS: !implicit,
        opportunisticTLS: false,
        tls: { rejectUnauthorized: true },
        connectionTimeout: 800,
        greetingTimeout: 300,
        socketTimeout: 300,
        logger: false,
        debug: false
      });
    }
  );
  it.each([
    ['no STARTTLS', { starttls: false }, true],
    ['untrusted certificate', {}, false],
    ['invalid credentials', { invalidAuth: true }, true],
    ['greeting timeout', { silent: true }, true],
    ['connection timeout', { silent: true, connectionTimeoutMs: 100 }, true],
    ['TLS handshake timeout', { stallTls: true }, true]
  ])('fails closed with sanitized errors: %s', async (_name, options, trusted) => {
    const { provider, server } = await setup(options, trusted);
    await expect(provider.send(message)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Não foi possível enviar o e-mail.'
    });
    expect(server.messages).toHaveLength(0);
    if (!options.invalidAuth)
      expect(server.commands.some((entry) => entry.command === 'AUTH')).toBe(false);
  });
  it('bounds waiting for the final SMTP response without an automatic retry', async () => {
    const { provider, server } = await setup({ stallData: true });
    await expect(provider.send(message)).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    expect(server.messages).toHaveLength(1);
    expect(server.messages[0].encrypted).toBe(true);
  });
});
