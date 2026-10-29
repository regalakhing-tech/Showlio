import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { creators, projects, imagePath, thumbPath } from '../public/assets/js/community.js';
import { workspaceProjects, people, defaultProfile } from '../public/assets/js/workspace-data.js';

let server;
let origin;
let output = '';

before(async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'scripts/router.php'], {
    env: { ...process.env, GEMINI_API_KEY: 'test-secret-must-not-be-returned' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  let spawnError;
  server.on('error', (error) => { spawnError = error; });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`PHP server exited: ${output}`);
    try {
      await fetch(origin, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await delay(50);
    }
  }
  throw new Error(`PHP did not start: ${output}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
});

test('serves the Showlio starter', async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Showlio/);
});

test('serves the independent portfolio builder and viewer without changing existing routes', async () => {
  for (const path of ['/portfolio/', '/portfolio/view/']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /portfolio/i);
    const bare = await fetch(`${origin}${path.slice(0, -1)}`, { redirect: 'manual' });
    assert.equal(bare.status, 308, path);
    assert.equal(bare.headers.get('location'), path);
  }
  for (const path of ['/assets/css/portfolio.css', '/assets/css/portfolio-public.css', '/assets/js/portfolio-builder.js', '/assets/js/portfolio-editor.js', '/assets/js/portfolio-model.js', '/assets/js/portfolio-store.js', '/assets/js/portfolio-view.js', '/assets/js/portfolio-render.js', '/assets/js/portfolio-qr.js', '/assets/vendor/qrcode.js']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
});

test('health proves PHP execution without returning environment secrets', async () => {
  const response = await fetch(`${origin}/api/health?probe=1`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', app: 'Showlio' });
});

test('health supports HEAD without a response body', async () => {
  const response = await fetch(`${origin}/api/health`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('health rejects unsupported methods', async () => {
  const response = await fetch(`${origin}/api/health`, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.deepEqual(await response.json(), { error: 'Method not allowed.' });
});

test('unknown API routes return JSON 404', async () => {
  const response = await fetch(`${origin}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Route not found.' });
});

test('serves compiled CSS and browser JavaScript separately from the API', async () => {
  for (const [path, type] of [['/assets/css/app.css', /text\/css/], ['/assets/js/app.js', /javascript/]]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), type, path);
    assert.ok((await response.text()).length > 0, path);
  }
});

test('does not expose source, environment, Git or blueprint files', async () => {
  for (const path of ['/.env', '/.env.example', '/.git/config', '/src/config/app.php', '/SHOWLIO_INFO.md', '/api/index.php/extra', '/assets/../.env']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
  }
});

test('missing public pages return 404 instead of a fake application screen', async () => {
  const response = await fetch(`${origin}/discover`);
  assert.equal(response.status, 404);
});

test('serves every generated portrait, project thumbnail, brand asset and web font', async () => {
  const paths = new Set([
    ...creators.map((creator) => imagePath(creator.image)),
    ...projects.map((project) => imagePath(project.image)),
    ...[...creators, ...projects].map((item) => thumbPath(item.image)),
    '/assets/images/showlio-logo-sm.png', '/assets/images/favicon.png',
    '/assets/images/showlio-logo.png', '/assets/icons.svg', '/assets/fonts/inter-latin.woff2',
  ]);
  for (const path of paths) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
});

test('serves the workspace and account pages, redirecting bare paths', async () => {
  for (const [path, marker] of [['/app/', /Explore portfolios/], ['/auth/', /Show your work/]]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), marker, path);
    const bare = await fetch(`${origin}${path.slice(0, -1)}`, { redirect: 'manual' });
    assert.equal(bare.status, 308, path);
    assert.equal(bare.headers.get('location'), path);
  }
});

test('serves every workspace image, stylesheet and script', async () => {
  const paths = new Set([
    ...workspaceProjects.flatMap((project) => [project.image, project.image.replace('/thumbs/', '/')]),
    ...people.filter((person) => person.avatar).map((person) => person.avatar), defaultProfile.avatar,
    '/assets/css/workspace.css', '/assets/css/auth.css', '/assets/js/auth.js', '/assets/js/auth-model.js', '/assets/js/auth-google.js', '/assets/workspace-icons.svg',
  ]);
  for (const path of paths) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    await response.arrayBuffer();
  }
});
