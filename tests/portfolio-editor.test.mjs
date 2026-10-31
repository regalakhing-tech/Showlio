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
  const empty = editor.renderWorks(p);
  assert.doesNotMatch(empty, /start-collection|starter/i, 'no sample works to load');
  assert.match(empty, /data-action="add-work"/);
  assert.match(empty, /href="\/app\/"[^>]*>[\s\S]*Post a project on Showlio/);
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

test('works from Showlio uploads are marked, cannot be deleted here, and lock the fields Showlio owns', () => {
  const linked = { id: 'showlio-p1', title: 'Reel', description: 'Cuts', type: 'video', image: '/assets/images/project-habitify.webp', skills: ['Premiere'], visible: true };
  const own = { id: 'work-1', title: 'My site', type: 'website', visible: true };
  const library = editor.renderWorks(createPortfolio({ works: [linked, own] }));
  assert.match(library, /data-work-id="showlio-p1"[\s\S]*From your Showlio uploads/);
  assert.doesNotMatch(library, /data-delete-work="showlio-p1"/);
  assert.match(library, /data-delete-work="work-1"/);
  const form = editor.renderWorkForm(linked);
  assert.match(form, /comes from your Showlio uploads/);
  for (const name of ['title', 'description', 'skills']) assert.match(form, new RegExp(`name="${name}"[^>]*readonly`));
  assert.doesNotMatch(form, /id="pb-work-image"/, 'its photo comes from Showlio');
  assert.doesNotMatch(form, /name="url"[^>]*readonly/, 'the link stays editable');
  assert.doesNotMatch(editor.renderWorkForm(own), /readonly|comes from your Showlio/);
});
