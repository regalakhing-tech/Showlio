import test from 'node:test';
import assert from 'node:assert/strict';
import * as editor from '../public/assets/js/portfolio-editor.js';
import { createPortfolio } from '../public/assets/js/portfolio-model.js';

test('profile and about controls preserve escaped text and canonical field attributes', () => {
  const p = createPortfolio({ name: 'Alex' });
  p.profile.name = '\"><script>alert(1)</script>';
  p.profile.skills = ['HTML "&" CSS', '<svg onload=bad()>'];
  const profile = editor.renderProfile(p);
  assert.match(profile, /^<section class="pb-form-pane"/);
  assert.match(profile, /data-profile="slug"[^>]*maxlength="80"/);
  assert.match(profile, /&lt;script&gt;/);
  assert.doesNotMatch(profile, /<script|onchange=|onclick=/);
  assert.match(profile, /data-image-target="logo"/);
  assert.match(profile, /data-image-target="avatar"/);
  const about = editor.renderAbout(p);
  assert.match(about, /id="pb-skill-input"/);
  assert.match(about, /data-remove-skill="HTML &quot;&amp;&quot; CSS"/);
  assert.doesNotMatch(about, /<svg onload=/);
});

test('library supports many works, filters, visibility, editing and keyboard reorder', () => {
  const p = createPortfolio({ works: Array.from({ length: 42 }, (_, index) => ({ id: `item-${index}`, title: `Work ${index}`, type: index % 2 ? 'app' : 'website', visible: index !== 1 })) });
  const html = editor.renderWorks(p);
  assert.equal((html.match(/class="pb-work-card"/g) || []).length, 42);
  assert.match(html, /data-edit-work="item-41"/);
  assert.match(html, /data-delete-work="item-41"/);
  assert.match(html, /data-toggle-work="item-1"/);
  assert.match(html, />Draft</);
  assert.doesNotMatch(html, /Published|draggable="true"/);
  const filtered = editor.renderWorks(p, { query: 'Work 41', type: 'app', reorder: true });
  assert.equal((filtered.match(/class="pb-work-card"/g) || []).length, 1);
  assert.match(filtered, /draggable="true"/);
  assert.match(filtered, /data-move-work="-1" data-work-id="item-41"/);
  assert.match(filtered, /data-work-filter="video"/);
});

test('empty library and style controls expose controller actions without inline handlers', () => {
  const p = createPortfolio();
  assert.match(editor.renderWorks(p), /data-action="start-collection"/);
  const html = editor.renderStyle(p);
  for (const value of ['classic', 'minimal', 'showcase', 'white', 'tint']) assert.match(html, new RegExp(`data-style-value="${value}"`));
  assert.match(html, /type="color" data-style="accent"/);
  assert.match(html, /type="checkbox" data-style="showAvatar"/);
});

test('publish reports browser saving honestly and work form is accessible and escaped', () => {
  const p = createPortfolio({ name: 'Alex', role: 'Designer', works: [{ title: 'Orbit', visible: true }] });
  assert.match(editor.renderPublish(p, { ready: true }), /data-action="create-preview"/);
  const saved = editor.renderPublish(p, { ready: true, snapshot: p });
  assert.match(saved, /Saved in this browser/);
  assert.match(saved, /data-action="share"/);
  assert.match(saved, /data-action="open-saved"/);
  assert.equal((saved.match(/<li /g) || []).length, 5);
  const form = editor.renderWorkForm({ title: '\"><script>bad()</script>', skills: ['A&B'] });
  assert.match(form, /<form id="pb-work-form"/);
  assert.match(form, /name="title"[^>]*required/);
  assert.match(form, /id="pb-work-image-preview"/);
  assert.match(form, /name="visible" checked/);
  assert.match(form, /value="A&amp;B"/);
  assert.doesNotMatch(form, /<script/);
});
