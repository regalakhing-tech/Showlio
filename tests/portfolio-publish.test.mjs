import assert from 'node:assert/strict';
import { test } from 'node:test';

const publisher = await import('../public/assets/js/portfolio-publish.js').catch(() => ({}));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const snapshot = () => ({ profile: { name: 'Ana', role: 'Designer', slug: 'ana', logo: png, intro: 'My own introduction.', email: 'ana@example.com' }, style: { layout: 'gallery', logoSize: 96 }, works: [{ id: 'own', title: 'My work', image: png, visible: true }, { id: 'hidden', title: 'Private draft', visible: false }] });

test('publishing uploads each distinct image once and saves every published field on the server', async () => {
  assert.equal(typeof publisher.publishPortfolio, 'function');
  const calls = [];
  const original = snapshot();
  const result = await publisher.publishPortfolio(original, { headers: { 'X-Showlio-Session': 'slot' }, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, options, body });
    return Response.json(url.endsWith('/media') ? { image: 'https://abc.supabase.co/storage/v1/object/sign/portfolio-media/u/logo.webp?token=t' } : { published: true });
  } });
  assert.deepEqual(calls.map(call => call.url), ['/api/portfolio/media', '/api/portfolio']);
  assert.equal(calls[0].options.headers['X-Showlio-Session'], 'slot');
  const saved = calls[1].body;
  assert.equal(saved.profile.logo, saved.works[0].image);
  assert.equal(saved.profile.intro, original.profile.intro);
  assert.equal(saved.profile.email, original.profile.email);
  assert.equal(saved.style.layout, 'gallery');
  assert.equal(saved.style.logoSize, 96);
  assert.equal(saved.works.length, 1);
  assert.equal(result.profile.logo, saved.profile.logo);
  assert.equal(original.profile.logo, png, 'publishing must not mutate the editor');
});

test('a failed upload or server save rejects publishing', async () => {
  assert.equal(typeof publisher.publishPortfolio, 'function');
  for (const stage of ['upload', 'save']) {
    let saves = 0;
    await assert.rejects(publisher.publishPortfolio(snapshot(), { fetchImpl: async url => {
      if (url.endsWith('/media')) return stage === 'upload' ? Response.json({ error: 'Upload failed' }, { status: 502 }) : Response.json({ image: '/assets/images/logo.webp' });
      saves++;
      return Response.json({ error: 'Save failed' }, { status: 503 });
    } }), /failed/i);
    assert.equal(saves, stage === 'upload' ? 0 : 1);
  }
});
