// Starts PHP's built-in server on a free port with the given environment.
// Used by the tests and by the local dev server (scripts/dev.mjs).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export async function freePort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));
  return port;
}

// echo: print the server log (dev) instead of keeping it for error messages (tests).
export async function startPhp(env = {}, { echo = false } = {}) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = '';
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'scripts/router.php'], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = (chunk) => { if (echo) process.stdout.write(chunk); else output += chunk; };
  server.stdout.on('data', log);
  server.stderr.on('data', log);
  let spawnError;
  server.on('error', (error) => { spawnError = error; });
  const stop = async () => {
    if (server.exitCode !== null) return;
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  };
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`PHP server exited: ${output}`);
    try {
      await fetch(origin, { signal: AbortSignal.timeout(1000) });
      return { origin, stop, output: () => output };
    } catch {
      await delay(50);
    }
  }
  await stop();
  throw new Error(`PHP did not start: ${output}`);
}
