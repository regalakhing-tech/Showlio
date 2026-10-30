import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceState, filterProjects, normalizeProfile, profileCompletion } from '../public/assets/js/workspace-model.js';
import { projectCard, projectCover } from '../public/assets/js/workspace-explore.js';
import { renderNotifications, describe, dayLabel, visibleNotifications } from '../public/assets/js/workspace-notifications.js';
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

test('notifications say who did what, escape it, and filter by tab', () => {
  const actor = { id: 'a1', name: '<b>Bo</b>', avatar: '', hue: 40 };
  const now = Date.now();
  const items = [
    { id: 'n1', type: 'comment', body: '<img src=x onerror=alert(1)>', created: now, unread: true, saved: false, actor, project: { id: 'p1', title: 'Reel <i>' } },
    { id: 'n2', type: 'follow', body: '', created: now - 3 * 86400000, unread: false, saved: true, actor: null, project: null },
  ];
  assert.equal(describe(items[0]), '<strong>&lt;b&gt;Bo&lt;/b&gt;</strong> commented on <strong>Reel &lt;i&gt;</strong>: <q>&lt;img src=x onerror=alert(1)&gt;</q>');
  assert.equal(describe(items[1]), '<strong>Someone</strong> started following you');
  assert.equal(describe({ type: 'like', actor, project: null }), '<strong>&lt;b&gt;Bo&lt;/b&gt;</strong> liked your project');
  assert.equal(dayLabel(now, now), 'Today');
  assert.equal(dayLabel(now - 86400000, now), 'Yesterday');
  const state = { ...createWorkspaceState(), notifications: items, followers: 2 };
  assert.deepEqual(['all', 'unread', 'saved'].map((tab) => visibleNotifications({ ...state, notificationTab: tab }).map((item) => item.id)), [['n1', 'n2'], ['n1'], ['n2']]);
  const page = renderNotifications({ ...state, notificationTab: 'all' });
  assert.doesNotMatch(page, /<img src=x|<b>Bo/);
  assert.match(page, /data-note-open="n1"/);
  assert.match(page, /Today/);
  const empty = renderNotifications({ ...state, notifications: [], notificationTab: 'unread' });
  assert.match(empty, /all caught up/);
  assert.match(empty, /data-action="mark-read" disabled/);
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

test('real creators join the people list first, replace stale copies and render escaped', async () => {
  const { people, personById, addPeople } = await import('../public/assets/js/workspace-data.js');
  const before = [...people];
  try {
    const real = { id: 'c0ffee00-0000-4000-8000-000000000001', name: '<b>Bo</b>', role: '@bo', avatar: '', followers: 3, real: true };
    addPeople([real]);
    addPeople([{ ...real, followers: 4 }]);
    assert.equal(people[0].followers, 4);
    assert.equal(people.filter((person) => person.id === real.id).length, 1);
    assert.equal(personById(real.id).name, '<b>Bo</b>');

    const state = createWorkspaceState();
    const project = { id: '22222222-2222-4222-8222-222222222222', title: 'Bot', description: 'Sorts mail.', image: '/assets/images/workspace-content.webp', categories: ['Other'], tools: [], creator: real.id, owner: false, views: 1, likes: 2, comments: 0, created: 0, real: true };
    const card = projectCard(project, { ...state, likes: [project.id] });
    assert.match(card, /&lt;b&gt;Bo&lt;\/b&gt;/);
    assert.doesNotMatch(card, /<b>Bo<\/b>/);
    assert.match(card, /aria-pressed="true"[^>]*>.*? 3<\/button>/s, 'the viewer’s own like is added to the count');
  } finally {
    people.splice(0, people.length, ...before);
  }
});

test('skill suggestions are valid profile skills and open on the creator’s discipline', async () => {
  const { skillSuggestions, suggestedGroup } = await import('../public/assets/js/workspace-settings.js');
  for (const [group, names] of Object.entries(skillSuggestions)) {
    assert.ok(names.length >= 8 && names.length <= 15, group);
    assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length, `${group} has no duplicates`);
    for (const name of names) assert.ok(name.trim() === name && name.length <= 40, name);
  }
  assert.equal(suggestedGroup('Full-Stack Developer'), 'Development');
  assert.equal(suggestedGroup('Video Creator & Motion Designer'), 'Video');
  assert.equal(suggestedGroup('AI Automation Engineer'), 'AI Automation');
  assert.equal(suggestedGroup('Brand Designer'), 'Design');
  assert.equal(suggestedGroup(''), 'Popular');
});

test('the project composer cleans tools and checks details like the API does', async () => {
  const { parseTools, checkProject, MAX_PHOTOS } = await import('../public/assets/js/workspace-composer.js');
  assert.deepEqual(parseTools(' Figma, figma ,After  Effects,, Python '), ['Figma', 'After Effects', 'Python']);
  assert.deepEqual(checkProject({ title: ' ', description: '', tools: [] }), { title: 'Add a project title.', description: 'Describe your project in a sentence or two.' });
  assert.deepEqual(checkProject({ title: 'x'.repeat(81), description: 'x'.repeat(301), tools: ['x'.repeat(41)] }), { title: 'Keep the title within 80 characters.', description: 'Keep the description within 300 characters.', tools: 'Use up to 15 tools, with 40 characters each at most.' });
  assert.deepEqual(checkProject({ title: 'Neon Nights', description: 'A brand film.', tools: ['Premiere Pro'] }), {});
  assert.ok(MAX_PHOTOS >= 5 && MAX_PHOTOS <= 10, 'at least five photos, within the database limit of ten');
});

test('signing out of one tab leaves a session that another open tab still uses', async () => {
  const { answerSessionChecks, sessionUsedElsewhere } = await import('../public/assets/js/session-slot.js');
  const otherTab = answerSessionChecks(() => 'abcd1234', 'tab-a');
  const sameTab = answerSessionChecks(() => 'zzzz9999', 'tab-b');
  try {
    assert.equal(await sessionUsedElsewhere('abcd1234', { tab: 'tab-b', wait: 300 }), true, 'another tab uses it: only this tab lets go');
    assert.equal(await sessionUsedElsewhere('zzzz9999', { tab: 'tab-b', wait: 150 }), false, 'a tab never answers for itself');
    assert.equal(await sessionUsedElsewhere('ffff0000', { tab: 'tab-b', wait: 150 }), false, 'nobody else uses it: really sign out');
    assert.equal(await sessionUsedElsewhere(null), false);
  } finally {
    otherTab.close();
    sameTab.close();
  }
});
