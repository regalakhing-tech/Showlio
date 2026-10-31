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
    assert.doesNotMatch(html, /data-pf-filter=/, 'one category needs no filter controls');
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
    assert.match(html, /aria-label="Portfolio"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /https:\/\/example.com\/work\?a=1&amp;b=2/);
  }
});

test('work details show the category and every extra photo', () => {
  const photo = (name) => `https://abc.supabase.co/storage/v1/object/sign/project-media/u/p/${name}.webp?token=t`;
  const value = { profile: { name: 'Khing' }, works: [{ id: 'reel', title: 'Reel', category: 'Video <b>', type: 'video', image: photo('a'), images: [photo('a'), photo('b'), photo('c')], visible: true }] };
  const detail = renderer.renderWorkDetail(value, 'reel');
  assert.match(detail, /Video &lt;b&gt;/);
  assert.equal((detail.match(/pf-detail-gallery/g) ?? []).length, 1);
  assert.equal((detail.match(/<img /g) ?? []).length, 3, 'the cover once, then the two other photos');
  assert.match(renderer.renderPortfolio(value), /<span class="pf-work-type">Video &lt;b&gt;<\/span>/);
});

test('a blank name stays blank, the logo size is the creator’s, and Spotlight puts their photo behind the name', () => {
  const blank = renderer.renderPortfolio({ profile: { name: '', role: '', logo: '/assets/images/logo.png' }, style: { logoSize: 96 }, works: [] });
  assert.doesNotMatch(blank, /Your name|Your creative role|<h1>/);
  assert.match(blank, /--pf-logo:96px/);
  assert.match(blank, /href="#pf-top" aria-label="Back to top"><img class="pf-logo-image"/, 'the logo alone still has a name for screen readers');
  assert.doesNotMatch(renderer.renderPortfolio({ profile: { name: '' }, works: [] }), /class="pf-mark/, 'no initials to draw, no empty logo');
  assert.match(renderer.renderPortfolio({ profile: { name: 'Ana' }, style: { logoSize: 999 } }), /--pf-logo:40px/, 'out-of-range sizes fall back');
  const spotlight = renderer.renderPortfolio({ profile: { name: 'Ana', avatar: '/assets/images/ana.webp' }, style: { layout: 'showcase' }, works: [{ id: 'w', title: 'Reel', image: '/assets/images/reel.webp', visible: true }] });
  assert.match(spotlight, /pf-backdrop is-portrait[^>]*><img class="pf-backdrop-image" src="\/assets\/images\/ana\.webp"/);
  const noPhoto = renderer.renderPortfolio({ profile: { name: 'Ana' }, style: { layout: 'showcase' }, works: [{ id: 'w', title: 'Reel', image: '/assets/images/reel.webp', visible: true }] });
  assert.match(noPhoto, /class="pf-backdrop" aria-hidden="true"><img class="pf-backdrop-image" src="\/assets\/images\/reel\.webp"/, 'latest work stands in without a photo');
});

test('the name beside the logo is its own: empty by default, never copied from the display name', () => {
  const plain = renderer.renderPortfolio({ profile: { name: 'Khing Jay Regala' }, works: [] });
  assert.doesNotMatch(plain, /<header class="pf-header">[\s\S]*?<span>Khing Jay Regala<\/span>[\s\S]*?<\/header>/, 'the logo stands alone by default');
  assert.match(plain, /<header class="pf-header"><div class="pf-container pf-header-inner"><a class="pf-identity" href="#pf-top" aria-label="Back to top"><span class="pf-mark/);
  assert.match(plain, /<h1>Khing Jay Regala<\/h1>/, 'the page still shows the display name');
  const branded = renderer.renderPortfolio({ profile: { name: 'Khing Jay Regala', brand: 'KJ Studio' }, works: [] });
  assert.match(branded, /<header class="pf-header">[\s\S]*?<span>KJ Studio<\/span>/);
  assert.match(branded, /<h1>Khing Jay Regala<\/h1>/);
});

test('Bento builds its hero from tiles and Gallery keeps every work in one masonry wall', () => {
  const input = { profile: { name: 'Ana Cruz', role: 'Designer', avatar: '/assets/images/ana.webp', location: 'Cebu', skills: ['Figma', 'Motion'], email: 'ana@example.com' }, works: [{ id: 'w', title: 'Reel', image: '/assets/images/reel.webp', visible: true }] };
  const bento = renderer.renderPortfolio({ ...input, style: { layout: 'bento' } });
  for (const tile of ['intro', 'photo', 'facts', 'contact', 'skills', 'latest']) assert.match(bento, new RegExp(`pf-tile pf-tile-${tile}`));
  assert.equal((bento.match(/<h1>/g) ?? []).length, 1);
  assert.match(bento, /pf-tile pf-tile-contact" href="mailto:ana@example.com"/);
  assert.doesNotMatch(bento, /pf-tile-number/);
  const gallery = renderer.renderPortfolio({ ...input, style: { layout: 'gallery' } });
  assert.match(gallery, /pf-site pf-gallery/);
  assert.match(gallery, /<figure class="pf-hero-figure"><img class="pf-portrait-image" src="\/assets\/images\/ana\.webp"/);
  assert.match(gallery, /data-pf-work="w"/);
  assert.equal(renderer.templates.bento.name, 'Bento');
  assert.equal(renderer.templates.gallery.name, 'Gallery');
});

test('all layouts render only the supplied projects in order and expose the filtered count', () => {
  for (const layout of Object.keys(renderer.templates)) {
    const input = { ...fixture(), style: { layout } };
    input.works.unshift({ id: 'first', title: 'Actual first project', type: 'website', visible: true });
    const html = renderer.renderPortfolio(input);
    assert.match(html, /class="pf-work-grid" data-count="2"/);
    assert.ok(html.indexOf('data-pf-work="first"') < html.indexOf('data-pf-work="shown"'));
    assert.equal((html.match(/data-pf-work=/g) || []).length, 2);
    assert.match(renderer.renderPortfolio(input, { type: 'app' }), /class="pf-work-grid" data-count="1"/);
    assert.match(renderer.renderPortfolio(input, { type: 'video' }), /class="pf-work-grid" data-count="0"/);
    assert.match(renderer.renderPortfolio({ style: { layout }, works: [] }), /class="pf-work-grid" data-count="0"/);
  }
});

test('Gallery uses at most two distinct real supporting photos, excluding its cover and unsafe images', () => {
  const photo = name => `https://abc.supabase.co/storage/v1/object/sign/project-media/u/p/${name}.webp?token=t`;
  const input = { style: { layout: 'gallery' }, works: [{ id: 'real', title: 'Actual project', image: photo('cover'), images: [photo('cover'), photo('one'), photo('one'), 'javascript:evil()', photo('two'), photo('three')] }] };
  const html = renderer.renderPortfolio(input);
  assert.match(html, /class="pf-work-images"><span class="pf-work-media">/);
  assert.match(html, /class="pf-work-supporting">/);
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.match(html, /one\.webp/);
  assert.match(html, /two\.webp/);
  assert.doesNotMatch(html, /three\.webp|javascript:evil/);
  for (const layout of ['classic', 'minimal', 'showcase', 'bento']) {
    assert.doesNotMatch(renderer.renderPortfolio({ ...input, style: { layout } }), /pf-work-supporting/);
  }
  assert.doesNotMatch(renderer.renderPortfolio({ ...input, works: [{ id: 'only', image: photo('cover'), images: [photo('cover')] }] }), /pf-work-supporting/);
});

test('portrait layout markers respect validated images and the visibility setting', () => {
  for (const layout of Object.keys(renderer.templates)) {
    const input = { profile: { avatar: '/assets/images/actual.webp' }, style: { layout } };
    assert.match(renderer.renderPortfolio(input), /class="pf-site [^"]*pf-has-portrait/);
    assert.doesNotMatch(renderer.renderPortfolio({ ...input, style: { layout, showAvatar: false } }), /pf-has-portrait|actual\.webp/);
    assert.doesNotMatch(renderer.renderPortfolio({ ...input, profile: { avatar: 'javascript:evil()' } }), /pf-has-portrait/);
  }
});

test('Studio keeps the portrait clear and Bento omits missing optional tiles and invented copy', () => {
  const input = { profile: { name: 'Real creator', avatar: '/assets/images/creator.webp', location: 'Cebu', skills: ['Figma'], email: 'real@example.com' }, works: [{ id: 'work', title: 'Real work', image: '/assets/images/work.webp' }] };
  const studio = renderer.renderPortfolio(input);
  assert.match(studio, /pf-collage-main/);
  assert.doesNotMatch(studio, /pf-collage-card/);
  const bento = renderer.renderPortfolio({ ...input, style: { layout: 'bento' } });
  const tiles = [...bento.matchAll(/class="pf-tile pf-tile-(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(tiles, ['intro', 'photo', 'latest', 'contact', 'skills', 'facts']);
  const empty = renderer.renderPortfolio({ style: { layout: 'bento' } });
  assert.doesNotMatch(empty, /pf-tile-(?:photo|latest|contact|skills|facts)|Creative work, start to finish|Work coming soon|pf-tile-number/);
});

test('category filters appear only when useful and always let an empty selection reset', () => {
  const input = fixture();
  assert.doesNotMatch(renderer.renderPortfolio(input), /pf-filters|data-pf-filter=/);
  const emptySelection = renderer.renderPortfolio(input, { type: 'website' });
  assert.match(emptySelection, /data-pf-filter="all"/);
  assert.match(emptySelection, /No work in this category/);
  input.works.push({ id: 'web', title: 'Web project', type: 'website' });
  const filtered = renderer.renderPortfolio(input, { type: 'app' });
  assert.match(filtered, /data-pf-filter="app" aria-pressed="true"/);
  assert.match(filtered, /data-pf-filter="all"/);
});

test('one footer contains creator navigation, platform credit and the appropriate community action', () => {
  for (const [community, action, href] of [['owner', 'Edit your portfolio', '/portfolio/'], ['guest', 'Join Showlio', '/auth/#sign-up'], [null, '', '']]) {
    for (const input of [fixture(), {}]) {
      const html = renderer.renderPortfolio(input, { community });
      assert.equal((html.match(/<footer\b/g) || []).length, 1);
      assert.match(html, /<footer class="pf-footer">[\s\S]*pf-footer-nav[\s\S]*Made with[\s\S]*Showlio/);
      if (action) assert.match(html, new RegExp(`class="pf-community-action" href="${href}">${action}</a>`));
      else assert.doesNotMatch(html, /pf-community-action|Edit your portfolio|Join Showlio/);
    }
  }
});

test('Spotlight retains portrait priority, the project fallback and the abstract fallback', () => {
  const input = { profile: { name: 'Real creator', avatar: '/assets/images/portrait.webp' }, style: { layout: 'showcase' }, works: [{ id: 'work', image: '/assets/images/work.webp' }] };
  assert.match(renderer.renderPortfolio(input), /class="pf-backdrop is-portrait" aria-hidden="true"><img class="pf-backdrop-image" src="\/assets\/images\/portrait.webp"/);
  assert.match(renderer.renderPortfolio({ ...input, style: { layout: 'showcase', showAvatar: false } }), /class="pf-backdrop" aria-hidden="true"><img class="pf-backdrop-image" src="\/assets\/images\/work.webp"/);
  assert.match(renderer.renderPortfolio({ ...input, profile: {}, works: [] }), /class="pf-backdrop" aria-hidden="true"><span class="pf-backdrop-art"/);
});

test('missing biography and contact copy do not become invented personal claims', () => {
  const html = renderer.renderPortfolio({ profile: { name: 'Real creator', role: 'Designer' } });
  assert.doesNotMatch(html, /Meet Real creator|I’d love to hear/);
  assert.match(html, /Contact details coming soon/);
});
