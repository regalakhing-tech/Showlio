// A tiny SMTP server for tests: accepts mail from PHPMailer and keeps each message.
// reject(address) turns a recipient away with 550, like a full or missing mailbox.
import { once } from 'node:events';
import { createServer } from 'node:net';

export async function startFakeSmtp({ reject = () => false } = {}) {
  const messages = [];
  const server = createServer((socket) => {
    let buffer = '';
    let reading = false;
    let message = { to: [], data: '' };
    socket.write('220 fake.smtp ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (reading) {
          if (line === '.') {
            reading = false;
            messages.push({ ...message, text: message.data });
            message = { to: [], data: '' };
            socket.write('250 OK queued\r\n');
          } else {
            message.data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          }
          continue;
        }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake.smtp\r\n250 8BITMIME\r\n');
        else if (verb === 'RCPT') {
          const address = line.match(/<([^>]*)>/)?.[1] ?? '';
          if (reject(address)) socket.write('550 Mailbox unavailable\r\n');
          else { message.to.push(address); socket.write('250 OK\r\n'); }
        } else if (verb === 'DATA') { reading = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (verb === 'RSET') { message = { to: [], data: '' }; socket.write('250 OK\r\n'); }
        else if (verb === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: server.address().port, messages, close: () => server.close() };
}
