import assert from 'node:assert/strict';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/smoke.mjs https://your-deployment.vercel.app');
const origin = new URL(input);
if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('Expected an HTTP(S) deployment URL.');

const response = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, `Health endpoint returned ${response.status}. Check deployment access protection and PHP runtime logs.`);
assert.match(response.headers.get('content-type') ?? '', /application\/json/);
assert.deepEqual(await response.json(), { status: 'ok', app: 'Showlio' });
console.log(`PHP health check passed: ${origin.origin}/api/health`);
