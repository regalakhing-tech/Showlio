import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceState, filterProjects, normalizeProfile, profileCompletion, markAllRead, serializeWorkspace } from '../public/assets/js/workspace-model.js';
import { projectCard, projectCover } from '../public/assets/js/workspace-explore.js';
import { checkSignIn, checkSignUp, cleanUsername } from '../public/assets/js/auth-model.js';

test('workspace restores valid local data and rejects malformed saved state', () => {
  const state = createWorkspaceState({ profile: { name: '<script>', avatar: 'javascript:alert(1)' }, following: 'invalid', bookmarks: ['missing'] });
  assert.equal(state.profile.name, 'Sophia Carter');
  assert.deepEqual(state.following, []);
  assert.deepEqual(state.bookmarks, []);
});
test('project discovery searches author/skills, filters categories and sorts without mutating source', () => {
  const state = createWorkspaceState();
  const original = state.projects.map((item) => item.id);
  assert.equal(filterProjects(state.projects, { query: 'Priya' })[0].id, 'lead-scout');
  assert.equal(filterProjects(state.projects, { query: 'blender' })[0].id, 'luma');
  for (const category of ['Development', 'AI Automation', 'Video', 'Digital Art', 'Design']) {
    const matches = filterProjects(state.projects, { category });
    assert.ok(matches.length >= 2, category);
    assert.ok(matches.every((item) => item.categories.includes(category)), category);
  }
  const popular = filterProjects(state.projects, { sort: 'popular' });
  assert.ok(popular[0].likes >= popular[1].likes);
  assert.deepEqual(state.projects.map((item) => item.id), original);
});
test('profile validation preserves real input, caps biography and rejects unsafe links', () => {
  const profile = createWorkspaceState().profile;
  assert.equal(normalizeProfile({ ...profile, name: '  Sophia  ' }).name, 'Sophia');
  assert.throws(() => normalizeProfile({ ...profile, bio: 'x'.repeat(501) }), /500/);
  assert.throws(() => normalizeProfile({ ...profile, links: { website: 'javascript:alert(1)' } }), /HTTPS/);
  assert.throws(() => normalizeProfile({ ...profile, name: ' ' }), /name/i);
});
test('profile completion starts at the reference 85 percent and reaches 100 with a portfolio project', () => {
  const state = createWorkspaceState();
  assert.equal(profileCompletion(state.profile, false), 85);
  assert.equal(profileCompletion(state.profile, true), 100);
});
test('mark all read preserves notification content and saved flags', () => {
  const state = createWorkspaceState();
  const updated = markAllRead(state.notifications);
  assert.ok(updated.every((item) => !item.unread));
  assert.equal(updated.filter((item) => item.saved).length, 3);
  assert.ok(state.notifications.some((item) => item.unread));
});

test('restored projects whitelist fields and reject malicious duration markup', () => {
  const input = { id: 'local-safe', title: 'A local project', description: 'A description', image: '/assets/images/workspace-content.jpg', categories: ['Design'], duration: '<img src=x onerror=alert(1)>', creator: 'untrusted', created: Infinity, extra: 'discard me' };
  const state = createWorkspaceState({ customProjects: [input] });
  const project = state.customProjects[0];
  assert.equal(project.duration, '');
  assert.equal(project.creator, 'self');
  assert.equal(project.created, 0);
  assert.equal(Object.hasOwn(project, 'extra'), false);
  assert.doesNotMatch(projectCard(project, state), /<img src=x|onerror=/);
  const directCard = projectCard({ ...project, duration: input.duration }, state);
  assert.ok(directCard.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.doesNotMatch(directCard, /<img src=x/);
  const valid = createWorkspaceState({ customProjects: [{ ...input, duration: '2:35', created: 1720000000000 }] }).customProjects[0];
  assert.equal(valid.duration, '2:35');
  assert.equal(valid.created, 1720000000000);
});

test('notification saved flags round-trip additions and removals through browser storage', () => {
  const state = createWorkspaceState();
  const added = state.notifications.find(item => !item.saved);
  const removed = state.notifications.find(item => item.saved);
  added.saved = true;
  removed.saved = false;
  added.unread = false;
  const restored = createWorkspaceState(JSON.parse(JSON.stringify(serializeWorkspace(state))));
  assert.deepEqual(restored.notifications, state.notifications);
  const allUnsaved = createWorkspaceState({ savedNotificationIds: [] });
  assert.ok(createWorkspaceState(serializeWorkspace(allUnsaved)).notifications.every(item => !item.saved));
});

test('portfolio covers render code and workflow previews with escaped text', () => {
  const state = createWorkspaceState();
  const code = state.projects.find((item) => item.cover?.type === 'code');
  const flow = state.projects.find((item) => item.cover?.type === 'flow');
  assert.match(projectCover(code), /ws-cover-code/);
  assert.match(projectCover(flow), /ws-cover-flow/);
  const hostile = projectCover({ cover: { type: 'code', file: '<b>x</b>', lines: ['const a = "<img src=x onerror=alert(1)>";'] } });
  assert.doesNotMatch(hostile, /<img src=x|<b>x/);
  assert.match(projectCard(state.projects.find((item) => item.owner), state), /Sophia Carter/);
});

test('sign-in and sign-up validation explain what to fix', () => {
  assert.deepEqual(checkSignIn({ email: 'you@yourdomain.com', password: 'longenough' }), {});
  assert.match(checkSignIn({ email: 'nope', password: 'short' }).email, /valid email/);
  assert.match(checkSignIn({ email: 'a@b.co', password: 'short' }).password, /8 characters/);
  const valid = { name: 'Jo Doe', username: '@JoDoe', email: 'jo@doe.dev', password: 'password1', confirm: 'password1', terms: 'on' };
  assert.deepEqual(checkSignUp(valid), {});
  assert.match(checkSignUp({ ...valid, confirm: 'different' }).confirm, /match/);
  assert.match(checkSignUp({ ...valid, terms: undefined }).terms, /terms/);
  assert.match(checkSignUp({ ...valid, username: '!!' }).username, /3 to 20/);
  assert.equal(cleanUsername('@Jo Doe!'), 'jodoe');
});
