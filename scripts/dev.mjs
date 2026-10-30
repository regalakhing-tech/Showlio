// Local development server: `npm run dev`.
//
// PHP's built-in server answers one request at a time, and its worker option
// does not exist on Windows. One slow Supabase call therefore stalled every
// stylesheet, script and icon behind it, and the browser gave up on some of
// them. This starts several PHP servers and hands each request to the least
// busy one. Vercel runs PHP functions in parallel, so production needs none of this.
import { createServer, request } from 'node:http';
import { startPhp } from './lib/php-server.mjs';

const port = Number(process.env.PORT) || 8000;
const workers = await Promise.all(Array.from({ length: 8 }, async () => ({ ...(await startPhp({}, { echo: true })), busy: 0 })));

const proxy = createServer((incoming, outgoing) => {
  const worker = workers.reduce((least, next) => (next.busy < least.busy ? next : least));
  worker.busy += 1;
  outgoing.on('close', () => { worker.busy -= 1; });
  const { port: target } = new URL(worker.origin);
  const upstream = request({ host: '127.0.0.1', port: target, method: incoming.method, path: incoming.url, headers: incoming.headers }, (reply) => {
    outgoing.writeHead(reply.statusCode, reply.statusMessage, reply.rawHeaders);
    reply.pipe(outgoing);
  });
  upstream.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    outgoing.end('The PHP development server is not responding.');
  });
  incoming.pipe(upstream);
});

proxy.on('error', async (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other server or set PORT.` : error);
  await stopAll();
  process.exit(1);
});
proxy.listen(port, '127.0.0.1', () => console.log(`Showlio is running at http://127.0.0.1:${port} (${workers.length} PHP workers). Press Ctrl+C to stop.`));

async function stopAll() {
  await Promise.all(workers.map((worker) => worker.stop()));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await stopAll(); process.exit(0); });
