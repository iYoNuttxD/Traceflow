import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';

// Loopback-only SMTP peer. Messages stay in memory; no forwarding or delivery exists.
export async function controlledSmtp({
  key,
  cert,
  implicit = false,
  starttls = true,
  invalidAuth = false,
  silent = false,
  stallData = false,
  stallTls = false
} = {}) {
  const sockets = new Set(),
    commands = [],
    messages = [];
  const secureContext = key && tls.createSecureContext({ key, cert });
  function accept(socket, encrypted = implicit) {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    if (silent) return;
    if (implicit || !encrypted) socket.write('220 controlled.test ESMTP\r\n');
    let buffer = '',
      data = false;
    function consume(chunk) {
      buffer += chunk.toString();
      if (data) {
        if (buffer.includes('\r\n.\r\n')) {
          messages.push({ encrypted, body: buffer });
          buffer = '';
          data = false;
          if (!stallData) socket.write('250 accepted\r\n');
        }
        return;
      }
      while (buffer.includes('\r\n')) {
        const at = buffer.indexOf('\r\n');
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const command = line.split(' ')[0];
        commands.push({ command, encrypted });
        if (command === 'EHLO')
          socket.write(
            `250-controlled.test\r\n${!encrypted && starttls ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN\r\n`
          );
        else if (command === 'STARTTLS') {
          if (!starttls) {
            socket.write('454 TLS unavailable\r\n');
            continue;
          }
          socket.write('220 begin TLS\r\n');
          socket.removeListener('data', consume);
          if (!stallTls) accept(new tls.TLSSocket(socket, { isServer: true, secureContext }), true);
          return;
        } else if (command === 'AUTH')
          socket.write(
            invalidAuth
              ? '535 invalid credential confidential-server-text\r\n'
              : '235 authenticated\r\n'
          );
        else if (command === 'DATA') {
          data = true;
          socket.write('354 send message\r\n');
        } else if (command === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    }
    socket.on('data', consume);
  }
  const server = implicit
    ? tls.createServer({ key, cert }, (socket) => accept(socket, true))
    : net.createServer((socket) => accept(socket));
  server.on('tlsClientError', () => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    commands,
    messages,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((done) => server.close(done));
    }
  };
}
