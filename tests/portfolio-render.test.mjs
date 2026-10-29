import assert from 'node:assert/strict';
import { test } from 'node:test';

const renderer = await import('../public/assets/js/portfolio-render.js').catch(() => ({}));
const fixture = () => ({ profile: { name: 'Alex Rivera', role: 'Designer', intro: 'I make useful things.', bio: 'About Alex', slug: 'alex-rivera', skills: ['Figma'] }, works: [{ id: 'shown', title: 'Orbit', type: 'app', visible: true }, { id: 'private', title: 'Secret draft', description: 'Unannounced launch', image: '/assets/images/private.png', visible: false }] });

test('public and embedded rendering exclude hidden work and only show the chosen work type', () => {
  assert.equal(typeof renderer.renderPortfolio, 'function');
  for (const embedded of [true, false]) {
    const html = renderer.renderPortfolio(fixture(), { embedded });
    assert.match(html, /data-pf-work="shown"/);
    assert.doesNotMatch(html, /Secret draft|Unannounced launch|private\.png|data-pf-work="private"/);
    assert.match(html, /data-pf-filter="app"/);
    assert.doesNotMatch(renderer.renderPortfolio(fixture(), { embedded, type: 'website' }), /data-pf-work="shown"/);
  }
});

test('user text and attributes are escaped and invalid links, images, and appearance are discarded', () => {
  const html = renderer.renderPortfolio({ profile: { name: '<img src=x onerror=alert(1)>', role: '<script>alert(1)</script>', bio: '"<svg onload=evil()>', website: 'javascript:alert(1)', avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }, style: { layout: 'classic" onclick="evil()', accent: 'red;position:fixed', background: 'evil' }, works: [{ id: 'x" onmouseover="evil()', title: '<script>evil()</script>', url: 'javascript:evil()', visible: true }] });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<svg onload|href="javascript:|src="data:image\/svg|style="[^"]*position:fixed| onclick=["']| onmouseover=["']/);
  assert.match(html, /pf-classic/);
  assert.match(html, /--pf-accent:#006aff/);
});

test('empty portfolios show honest work placeholders and style toggles hide identity images', () => {
  const html = renderer.renderPortfolio({ profile: { name: 'Alex Rivera', logo: '/assets/images/logo.png', avatar: '/assets/images/avatar.png' }, style: { showLogo: false, showAvatar: false }, works: [] }, { embedded: true });
  assert.match(html, /pf-embedded/);
  assert.match(html, /Work will appear here/);
  assert.doesNotMatch(html, /src="\/assets\/images\/(?:logo|avatar)\.png"/);
  assert.doesNotMatch(html, /data-pf-work=/);
});

test('public layouts preserve personal identity, accessible filters, and safe external links', () => {
  for (const layout of ['classic', 'minimal', 'showcase']) {
    const input = fixture();
    input.style = { layout, accent: '#bada55', background: 'tint' };
    input.profile.website = 'https://example.com/work?a=1&b=2';
    const html = renderer.renderPortfolio(input);
    assert.match(html, new RegExp(`pf-${layout}`));
    assert.match(html, /Alex Rivera/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /https:\/\/example.com\/work\?a=1&amp;b=2/);
  }
});
