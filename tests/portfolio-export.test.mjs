import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';

const exporter = await import('../public/assets/js/portfolio-export.js').catch(() => ({}));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII=';
const css = '@font-face{font-family:Inter;src:url(/assets/fonts/inter-latin.woff2) format("woff2")}body{margin:0}.pf-work-card{display:block}';
const fixture = () => ({
  profile: { name: 'Alex Rivera', role: 'Designer', intro: 'Useful things.', bio: 'About Alex', skills: ['Figma'], email: 'alex@example.com', github: 'https://github.com/alex', logo: '/assets/images/logo.png', avatar: '/assets/images/avatar.png' },
  style: { layout: 'showcase', accent: '#bada55', background: 'tint' },
  works: [{ id: 'shown', title: 'Orbit', type: 'app', role: 'Design lead', description: 'An app for teams', skills: ['Research'], image: '/assets/images/orbit.png', url: 'https://example.com/orbit' }, { id: 'web', title: 'Studio', type: 'website', image: `data:image/png;base64,${png}` }, { id: 'private', title: 'Secret draft', description: 'Unannounced launch', image: '/assets/images/private.png', visible: false }],
});

function fakeAssets(t, overrides = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    if (Object.hasOwn(overrides, path)) return overrides[path]();
    if (path === '/assets/css/portfolio-public.css') return new Response(css);
    if (path === '/assets/fonts/inter-latin.woff2') return new Response('font fixture');
    if (/^\/assets\/images\/(logo|avatar|orbit)\.png$/.test(path)) return new Response(Buffer.from(png, 'base64'), { headers: { 'Content-Type': 'image/png' } });
    throw new Error(`Unexpected fetch: ${path}`);
  });
  return requests;
}

test('exports a complete offline document with inline CSS, font, and visible raster assets', async t => {
  const requests = fakeAssets(t);
  assert.equal(typeof exporter.exportPortfolio, 'function');
  const html = await exporter.exportPortfolio(fixture());
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>Alex Rivera/);
  assert.match(html, /data:font\/woff2;base64,Zm9udCBmaXh0dXJl/);
  assert.match(html, new RegExp(`src="data:image/png;base64,${png.replace(/[+]/g, '\\+')}`));
  assert.doesNotMatch(html, /(?:src|href)="\/assets\/|url\(\/assets\/|<link\b|<script[^>]+src=|\bimport\s/);
  for (const content of ['Alex Rivera', 'Designer', 'About Alex', 'Figma', 'mailto:alex@example.com', 'https://github.com/alex', 'pf-showcase', '--pf-accent:#bada55', 'pf-bg-tint', 'Design lead', 'Research']) assert.ok(html.includes(content), content);
  assert.doesNotMatch(html, /Secret draft|Unannounced launch|private\.png|data-pf-work="private"/);
  assert.deepEqual(requests.map(request => request.path).sort(), ['/assets/css/portfolio-public.css', '/assets/fonts/inter-latin.woff2', '/assets/images/avatar.png', '/assets/images/logo.png', '/assets/images/orbit.png'].sort());
  assert.ok(requests.every(request => request.options.redirect === 'error'));
});

test('rejects unavailable or malformed required assets instead of exporting broken images', async t => {
  fakeAssets(t, { '/assets/images/orbit.png': () => new Response('missing', { status: 404 }) });
  await assert.rejects(exporter.exportPortfolio(fixture()), /orbit\.png/);
  t.mock.restoreAll();
  fakeAssets(t, { '/assets/images/orbit.png': () => new Response('<svg>not a raster</svg>') });
  await assert.rejects(exporter.exportPortfolio(fixture()), /orbit\.png/);
  t.mock.restoreAll();
  fakeAssets(t, { '/assets/css/portfolio-public.css': () => new Response('missing', { status: 404 }) });
  await assert.rejects(exporter.exportPortfolio(fixture()), /portfolio-public\.css/);
});

test('falls back to system fonts when the optional local font is unavailable', async t => {
  fakeAssets(t, { '/assets/fonts/inter-latin.woff2': () => new Response('missing', { status: 404 }) });
  const html = await exporter.exportPortfolio(fixture());
  assert.doesNotMatch(html, /url\(\/assets\/|@font-face/);
});

test('normalization prevents external, traversal, and active image fetches', async t => {
  const requests = fakeAssets(t);
  const value = fixture();
  value.profile.avatar = 'https://example.com/track.png';
  value.profile.logo = '/assets/../secrets.png';
  value.works[0].image = 'data:image/svg+xml;base64,PHN2Zz4=';
  const html = await exporter.exportPortfolio(value);
  assert.doesNotMatch(html, /track\.png|secrets\.png|image\/svg\+xml/);
  assert.deepEqual(requests.map(request => request.path).sort(), ['/assets/css/portfolio-public.css', '/assets/fonts/inter-latin.woff2'].sort());
});

test('text and work IDs cannot break out of HTML or inline script data', async t => {
  fakeAssets(t);
  const value = fixture();
  const payload = '</script><script>globalThis.pwned=1</script><img src=x onerror=evil()>\u2028';
  value.profile.name = payload;
  value.profile.bio = payload;
  value.works[0].id = payload;
  value.works[0].title = payload;
  value.works[0].description = payload;
  value.works[0].url = 'javascript:evil()';
  const html = await exporter.exportPortfolio(value);
  assert.doesNotMatch(html, /<script>globalThis\.pwned|<img src=x|href="javascript:/);
  assert.match(html, /&lt;\/script&gt;/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  const data = JSON.parse(scripts[0][1]);
  assert.equal(data[0].id, payload.trim());
  new vm.Script(scripts[1][1]);
});

test('inline controls filter cards and open and close project details without imports', async t => {
  fakeAssets(t);
  const html = await exporter.exportPortfolio(fixture());
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const data = scripts[0][1];
  const listeners = new Map();
  const filters = ['all', 'app', 'website'].map(type => ({ dataset: { pfFilter: type }, classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; } }));
  const cards = ['shown', 'web'].map(id => ({ hidden: false, querySelector: () => ({ dataset: { pfWork: id } }) }));
  const detail = { innerHTML: '' };
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const document = { getElementById(id) { return ({ 'pf-export-data': { textContent: data }, 'pf-export-dialog': dialog, 'pf-export-detail': detail })[id]; }, querySelectorAll(selector) { return selector === '[data-pf-filter]' ? filters : cards; }, addEventListener(name, listener) { listeners.set(name, listener); } };
  vm.runInNewContext(scripts[1][1], { document });
  const click = (selector, control) => listeners.get('click')({ target: { closest: candidate => candidate === selector ? control : null }, preventDefault() {} });
  click('[data-pf-filter]', filters[1]);
  assert.deepEqual(cards.map(card => card.hidden), [false, true]);
  assert.equal(filters[1]['aria-pressed'], 'true');
  click('[data-pf-work]', { dataset: { pfWork: 'shown' } });
  assert.equal(dialog.open, true);
  assert.match(detail.innerHTML, /An app for teams/);
  click('[data-pf-close]', {});
  assert.equal(dialog.open, false);
  click('[data-pf-filter]', filters[0]);
  assert.deepEqual(cards.map(card => card.hidden), [false, false]);
});
