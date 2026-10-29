import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as model from '../public/assets/js/portfolio-model.js';
const ready = () => model.createPortfolio({ name: 'Alex Rivera', headline: 'Product designer', works: [{ id: 'one', title: 'Launch', type: 'design', visible: true }] });
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=';

test('portfolio seeds only a separate identity from a workspace profile', () => {
  assert.equal(typeof model.createPortfolio, 'function');
  const source = { name: ' Alex Rivera ', headline: 'Designer', bio: 'About Alex', avatar: '/assets/images/avatar.png', skills: ['Figma'], location: 'Manila', links: { website: 'https://example.com' } };
  const portfolio = model.createPortfolio(source);
  assert.equal(portfolio.version, 1);
  assert.equal(portfolio.id, 'primary');
  assert.equal(portfolio.profile.name, 'Alex Rivera');
  assert.equal(portfolio.profile.role, 'Designer');
  assert.equal(portfolio.profile.bio, 'About Alex');
  assert.equal(portfolio.profile.slug, 'alex-rivera');
  assert.equal(portfolio.profile.website, 'https://example.com');
  assert.equal(typeof portfolio.profile.availability, 'string');
  assert.deepEqual(portfolio.works, []);
  portfolio.profile.skills.push('JavaScript');
  assert.deepEqual(source.skills, ['Figma']);
  assert.equal(model.createPortfolio({ profile: source }).profile.role, 'Designer');
});

test('restoration whitelists schema, rejects corrupted nested fields and preserves unlimited work ordering', () => {
  const many = Array.from({ length: 120 }, (_, index) => ({ id: `work-${index}`, title: `Work ${index}`, visible: index !== 2 }));
  const value = model.normalizePortfolio({ version: 999, id: 'other', profile: { name: '<b>Alex</b>', skills: [' Figma ', {}, 'Figma', ''], website: 'javascript:alert(1)' }, style: { layout: 'evil', accent: 'red;display:none', background: 'evil', showAvatar: 'false' }, works: [...many, null, 'bad'], updatedAt: Infinity, extra: 'discard' });
  assert.equal(value.id, 'primary');
  assert.equal(value.version, 1);
  assert.equal(value.profile.name, '<b>Alex</b>');
  assert.deepEqual(value.profile.skills, ['Figma']);
  assert.equal(value.profile.website, '');
  assert.equal(value.style.layout, 'classic');
  assert.equal(value.style.accent, '#006aff');
  assert.equal(value.style.background, 'white');
  assert.equal(value.style.showAvatar, true);
  assert.equal(value.updatedAt, 0);
  assert.equal(Object.hasOwn(value, 'extra'), false);
  assert.equal(value.works.length, 120);
  assert.equal(value.works[119].id, 'work-119');
  assert.equal(model.visibleWorks(value).length, 119);
  assert.doesNotThrow(() => model.normalizePortfolio(null));
  assert.doesNotThrow(() => model.normalizePortfolio({ profile: [], style: null, works: {} }));
  assert.equal(model.normalizePortfolio({ style: { accent: '#ABC' } }).style.accent, '#aabbcc');
});

test('only safe HTTPS links, plain emails, local raster paths and genuine raster data headers survive restoration', () => {
  const unsafe = ['javascript:alert(1)', 'http://example.com', '//example.com', 'https://user:pass@example.com', 'https://example.com\n/path'];
  for (const url of unsafe) {
    const value = model.normalizePortfolio({ profile: { website: url }, works: [{ title: 'Project', url }] });
    assert.equal(value.profile.website, '', url);
    assert.equal(value.works[0].url, '', url);
  }
  for (const image of ['blob:local-image', 'javascript:alert(1)', 'https://example.com/photo.jpg', '/assets/images/../private.jpg', '/assets/logo.svg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,PHN2Zz4=']) {
    assert.equal(model.normalizePortfolio({ profile: { avatar: image } }).profile.avatar, '', image);
  }
  const value = model.normalizePortfolio({ profile: { email: 'alex@example.com', website: 'https://example.com/work?q=1#two', avatar: png, logo: '/assets/images/logo.webp' } });
  assert.equal(value.profile.email, 'alex@example.com');
  assert.equal(value.profile.website, 'https://example.com/work?q=1#two');
  assert.equal(value.profile.avatar, png);
  assert.equal(value.profile.logo, '/assets/images/logo.webp');
  assert.equal(model.normalizePortfolio({ profile: { email: 'mailto:alex@example.com?subject=oops' } }).profile.email, '');
});

test('step validation requires identity and included titled work while optional fields stay optional', () => {
  const value = model.createPortfolio();
  assert.deepEqual(model.validateStep(value, 0).map(item => item.field), ['profile.name', 'profile.role', 'profile.slug']);
  assert.deepEqual(model.validateStep(value, 1), []);
  assert.deepEqual(model.validateStep(value, 3), []);
  assert.equal(model.validateStep(value, 2)[0].field, 'works');
  const complete = ready();
  assert.deepEqual(model.validateStep(complete, 4), []);
  complete.profile.slug = 'INVALID slug';
  complete.profile.email = 'bad@email';
  complete.profile.website = 'javascript:alert(1)';
  complete.works[0].url = 'http://example.com';
  const errors = model.validateStep(complete, 4);
  for (const field of ['profile.slug', 'profile.email', 'profile.website', 'works.one.url']) assert.ok(errors.some(item => item.field === field), field);
  assert.ok(errors.every(item => typeof item.message === 'string' && item.message.length));
  const hidden = ready();
  hidden.works[0].visible = false;
  hidden.works[0].url = 'invalid';
  assert.equal(model.validateStep(hidden, 2)[0].field, 'works');
  assert.deepEqual(model.portfolioProgress(ready()), [true, true, true, true, true]);
  assert.deepEqual(model.portfolioProgress(value), [false, true, false, true, false]);
});

test('filters and movement preserve all items and never mutate the source list', () => {
  const works = [{ id: 'a', title: 'Orbit', type: 'app', description: 'Mobile payments', skills: ['Swift'] }, { id: 'b', title: 'Studio', type: 'design', skills: ['Figma'] }, { id: 'c', title: 'Cloud', type: 'app', skills: [] }];
  assert.deepEqual(model.filterWorks(works, { query: 'swift', type: 'app' }).map(item => item.id), ['a']);
  assert.deepEqual(model.filterWorks(works, { query: 'studio', type: 'app' }), []);
  assert.deepEqual(model.filterWorks(works, { type: 'all' }).map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(model.reorderWorks(works, 'b', -1).map(item => item.id), ['b', 'a', 'c']);
  assert.deepEqual(model.reorderWorks(works, 'b', 1).map(item => item.id), ['a', 'c', 'b']);
  assert.deepEqual(model.reorderWorks(works, 'a', -1), works);
  assert.deepEqual(model.reorderWorks(works, 'missing', 1), works);
  assert.deepEqual(works.map(item => item.id), ['a', 'b', 'c']);
});

test('snapshots omit excluded work and remain independent of later edits', () => {
  const value = ready();
  value.works.push({ ...value.works[0], id: 'hidden', title: 'Private', visible: false, url: 'unsafe' });
  const snapshot = model.createPublishedSnapshot(value, 1234);
  assert.equal(snapshot.publishedAt, 1234);
  assert.deepEqual(snapshot.works.map(item => item.id), ['one']);
  value.profile.name = 'Changed';
  value.works[0].skills.push('New');
  snapshot.profile.skills.push('Snapshot only');
  assert.equal(snapshot.profile.name, 'Alex Rivera');
  assert.deepEqual(snapshot.works[0].skills, []);
  assert.deepEqual(value.profile.skills, []);
  assert.throws(() => model.createPublishedSnapshot(model.createPortfolio()), /name|profile|ready/i);
});

// Node has no browser IndexedDB. This small asynchronous implementation exposes
// transaction durability/abort separately from request success, as browsers do.
function browserDatabase() {
  const stores = new Map();
  const control = { abortNext: false, transactions: 0, commits: 0, active: 0, maxActive: 0 };
  const database = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name, options) { stores.set(name, { records: new Map(), keyPath: options.keyPath }); },
    transaction(name, mode) {
      control.transactions++;
      control.active++;
      control.maxActive = Math.max(control.maxActive, control.active);
      const tx = { error: null };
      const store = stores.get(name);
      tx.objectStore = () => ({
        get(key) { return request(() => structuredClone(store.records.get(key))); },
        put(value) { const copy = structuredClone(value); return request(() => copy, () => store.records.set(copy[store.keyPath], copy)); },
      });
      function request(read, commit) {
        const request = {};
        setTimeout(() => {
          request.result = read();
          request.onsuccess?.();
          setTimeout(() => {
            control.active--;
            if (mode === 'readwrite' && control.abortNext) {
              control.abortNext = false;
              tx.error = new Error('Quota exceeded');
              tx.onabort?.();
            } else {
              commit?.();
              control.commits++;
              tx.oncomplete?.();
            }
          }, 5);
        }, 0);
        return request;
      }
      return tx;
    },
    close() {},
  };
  control.factory = { open() { const request = {}; setTimeout(() => { request.result = database; request.onupgradeneeded?.(); request.onsuccess?.(); }, 0); return request; } };
  return control;
}

test('IndexedDB writes await durable completion, queue immutable inputs, and surface aborted saves', async () => {
  const browser = browserDatabase();
  globalThis.indexedDB = browser.factory;
  const store = await import(`../public/assets/js/portfolio-store.js?test=${Date.now()}`);
  assert.equal(typeof store.saveDraft, 'function');
  assert.equal(await store.loadDraft(), null);
  const first = ready();
  const second = ready();
  second.profile.name = 'Latest edit';
  const firstSave = store.saveDraft(first);
  const secondSave = store.saveDraft(second);
  second.profile.name = 'Unsaved mutation';
  const before = browser.commits;
  await firstSave;
  assert.ok(browser.commits > before);
  await secondSave;
  assert.equal(browser.maxActive, 1, 'queued saves cannot race or overtake one another');
  assert.equal((await store.loadDraft()).profile.name, 'Latest edit');
  browser.abortNext = true;
  await assert.rejects(store.saveDraft(first), /Quota exceeded/);
  assert.equal((await store.loadDraft()).profile.name, 'Latest edit');
  await store.saveDraft(first);
  const snapshot = model.createPublishedSnapshot(first, 100);
  await store.saveSnapshot(snapshot);
  first.profile.name = 'Edited after save';
  await store.saveDraft(first);
  const saved = await store.loadSnapshot('alex-rivera');
  assert.equal(saved.profile.name, 'Alex Rivera');
  assert.equal(saved.publishedAt, 100);
  assert.equal(await store.loadSnapshot('missing'), null);
  delete globalThis.indexedDB;
});

test('draft saves restore incomplete inputs while rendering and snapshots still validate them', async () => {
  const browser = browserDatabase();
  globalThis.indexedDB = browser.factory;
  const store = await import(`../public/assets/js/portfolio-store.js?partial=${Date.now()}`);
  const { renderPortfolio, renderWorkDetail } = await import('../public/assets/js/portfolio-render.js');
  try {
    const draft = ready();
    const unfinished = {
      slug: 'Alex unfinished-', email: 'alex@', website: 'https://',
      instagram: 'javascript:alert(1)', github: 'github.com/alex', linkedin: 'http://example.com',
    };
    Object.assign(draft.profile, unfinished, { avatar: 'data:image/svg+xml;base64,PHN2Zz4=', extra: 'discard' });
    draft.works[0].url = ' https:// ';
    draft.works[0].image = 'javascript:alert(1)';
    draft.style = { layout: 'evil', accent: 'red;display:none', background: 'evil' };
    draft.extra = 'discard';
    const saved = await store.saveDraft(draft);
    const restored = await store.loadDraft();
    for (const value of [saved, restored]) {
      for (const [key, input] of Object.entries(unfinished)) assert.equal(value.profile[key], input, key);
      assert.equal(value.works[0].url, ' https:// ');
      assert.equal(value.profile.avatar, '');
      assert.equal(value.works[0].image, '');
      assert.equal(value.style.layout, 'classic');
      assert.equal(value.style.accent, '#006aff');
      assert.equal(value.style.background, 'white');
      assert.equal(Object.hasOwn(value, 'extra'), false);
      assert.equal(Object.hasOwn(value.profile, 'extra'), false);
    }
    const strict = model.normalizePortfolio(restored);
    for (const key of Object.keys(unfinished)) assert.equal(strict.profile[key], '', key);
    assert.equal(strict.works[0].url, '');
    const html = renderPortfolio(restored) + renderWorkDetail(restored, 'one');
    assert.doesNotMatch(html, /href="(?:javascript:|http:|github\.com|https:\/\/")|src="(?:javascript:|data:image\/svg)/);
    assert.throws(() => model.createPublishedSnapshot(restored), /not ready/);
    await assert.rejects(store.saveSnapshot(restored), /not ready/);
    assert.equal(await store.loadSnapshot(unfinished.slug), null);
  } finally {
    delete globalThis.indexedDB;
  }
});

test('storage unavailable rejects saves without pretending browser persistence succeeded', async () => {
  delete globalThis.indexedDB;
  const store = await import(`../public/assets/js/portfolio-store.js?unavailable=${Date.now()}`);
  assert.equal(typeof store.saveDraft, 'function');
  await assert.rejects(store.saveDraft(ready()), /storage|IndexedDB/i);
});

test('a blocked database open rejects and closes any late connection', async () => {
  let closed = false;
  let completeLateOpen;
  const lateOpen = new Promise(resolve => { completeLateOpen = resolve; });
  globalThis.indexedDB = { open() {
    const request = {};
    setTimeout(() => {
      request.onblocked?.();
      setTimeout(() => {
        request.result = { close() { closed = true; } };
        request.onsuccess?.();
        completeLateOpen();
      }, 0);
    }, 0);
    return request;
  } };
  const store = await import(`../public/assets/js/portfolio-store.js?blocked=${Date.now()}`);
  await assert.rejects(store.saveDraft(ready()), /blocked/i);
  await lateOpen;
  assert.equal(closed, true);
  delete globalThis.indexedDB;
});
