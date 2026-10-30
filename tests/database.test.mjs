// Applies supabase/migrations to an in-memory Postgres (PGlite) with stand-ins
// for Supabase's auth and storage schemas, then checks the access rules as the
// anon and authenticated API roles would see them.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const DENIED = /permission denied|row-level security/;
let db;
const users = {};
let defaultVisibility;

// Run one statement as an API role, with the JWT subject PostgREST would set.
function as(role, userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [userId ? JSON.stringify({ sub: userId, role, email: 'member@example.com' }) : '']);
    return tx.query(sql, params);
  });
}
const guest = (sql, params) => as('anon', null, sql, params);
const user = (name, sql, params) => as('authenticated', users[name], sql, params);
const rows = async (promise) => (await promise).rows;

// Created already confirmed, as when email confirmation is off.
async function signUp(name, metadata) {
  const { rows: [row] } = await db.query('insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id', [`${name}@example.com`, metadata]);
  users[name] = row.id;
}

async function publishedProject(owner, title) {
  const [project] = await rows(user(owner, "insert into projects (title, visibility) values ($1, 'published') returning id", [title]));
  return project.id;
}

before(async () => {
  db = new PGlite();
  await db.exec(readFileSync('tests/support/supabase-stub.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await signUp('alice', { username: 'alice', full_name: 'Alice Doe' });
  await signUp('bob', { username: 'Bob', name: 'Bob Reyes' });
  await signUp('carol', { username: 'alice' });
  await signUp('mod', {});
  // New profiles start public; the access tests below start from private profiles and publish them one by one.
  defaultVisibility = (await db.query('select visibility from profiles where id = $1', [users.alice])).rows[0].visibility;
  await db.query("update profiles set visibility = 'private'");
});

test('sign-up creates a profile and preferences, falling back when a username is taken', async () => {
  const profiles = await rows(db.query('select id, username, display_name, visibility from profiles order by created_at'));
  const byId = Object.fromEntries(profiles.map((row) => [row.id, row]));
  assert.deepEqual([byId[users.alice].username, byId[users.alice].display_name, byId[users.alice].visibility], ['alice', 'Alice Doe', 'private']);
  assert.equal(defaultVisibility, 'public', 'profiles start public');
  assert.equal(byId[users.bob].username, 'bob');
  assert.match(byId[users.carol].username, /^alice_[0-9a-f]{8}$/);
  assert.equal(byId[users.mod].display_name, 'mod');
  assert.equal((await rows(db.query('select count(*)::int as n from user_preferences')))[0].n, 4);

  const [check] = await rows(guest("select username_available('alice') as taken, username_available('fresh_name') as free, username_available('Bad Name') as invalid"));
  assert.deepEqual(check, { taken: false, free: true, invalid: false });
});

test('unconfirmed sign-ups get no profile and hold no username until the email code is checked', async () => {
  const { rows: [pending] } = await db.query("insert into auth.users (email, raw_user_meta_data) values ('typo@example.con', $1) returning id", [{ username: 'dana', full_name: 'Dana Typo' }]);
  const profileOf = async (id) => rows(db.query('select username, display_name from profiles where id = $1', [id]));
  assert.deepEqual(await profileOf(pending.id), []);
  assert.equal((await rows(guest("select username_available('dana') as free")))[0].free, true);

  await db.query('update auth.users set raw_user_meta_data = raw_user_meta_data where id = $1', [pending.id]);
  assert.deepEqual(await profileOf(pending.id), [], 'other updates do not create it');

  await db.query('update auth.users set email_confirmed_at = now() where id = $1', [pending.id]);
  assert.deepEqual(await profileOf(pending.id), [{ username: 'dana', display_name: 'Dana Typo' }]);
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [pending.id]);
  await db.query('update auth.users set email_confirmed_at = now() where id = $1', [pending.id]);
  assert.equal((await profileOf(pending.id)).length, 1, 're-confirming keeps the one profile');
  await db.query('delete from auth.users where id = $1', [pending.id]);
});

test('guests see only public profiles and owners cannot touch moderation fields', async () => {
  assert.equal((await rows(guest('select id from profiles'))).length, 0);

  await user('alice', "update profiles set visibility = 'public', headline = 'Creative Developer', bio = 'I build web apps with PHP and React.' where id = $1", [users.alice]);
  const visible = await rows(guest('select username, published_at from profiles'));
  assert.equal(visible.length, 1);
  assert.equal(visible[0].username, 'alice');
  assert.ok(visible[0].published_at);

  const attempt = await user('bob', "update profiles set headline = 'hacked' where id = $1", [users.alice]);
  assert.equal(attempt.affectedRows, 0);
  await assert.rejects(user('alice', 'update profiles set hidden_at = now() where id = $1', [users.alice]), DENIED);
  await assert.rejects(user('alice', 'insert into profiles (id, username, display_name) values (gen_random_uuid(), $1, $2)', ['someone', 'Someone']), DENIED);
});

test('projects stay private until published and only their creator edits them', async () => {
  const [draft] = await rows(user('alice', "insert into projects (title, summary) values ('TaskFlow Dashboard', 'Team planner') returning id, slug, visibility"));
  assert.deepEqual([draft.slug, draft.visibility], ['taskflow-dashboard', 'draft']);
  const [second] = await rows(user('alice', "insert into projects (title) values ('TaskFlow Dashboard') returning slug"));
  assert.equal(second.slug, 'taskflow-dashboard-2');

  assert.equal((await rows(guest('select id from projects'))).length, 0);
  await user('alice', "insert into project_categories (project_id, category_id) select $1, id from categories where slug = 'development'", [draft.id]);
  await user('alice', "select set_project_skills($1, array['React', 'react ', 'Tailwind'])", [draft.id]);
  await user('alice', "update projects set visibility = 'published' where id = $1", [draft.id]);

  const [card] = await rows(guest('select title, creator_username, categories, skills, published_at from project_cards where id = $1', [draft.id]));
  assert.deepEqual([card.title, card.creator_username, card.categories, card.skills], ['TaskFlow Dashboard', 'alice', ['Development'], ['React', 'Tailwind']]);
  assert.ok(card.published_at);

  assert.equal((await user('bob', "update projects set title = 'Mine now' where id = $1", [draft.id])).affectedRows, 0);
  await assert.rejects(user('bob', 'insert into projects (creator_id, title) values ($1, $2)', [users.alice, 'Spoof']), DENIED);
  await assert.rejects(user('alice', 'update projects set like_count = 999 where id = $1', [draft.id]), DENIED);
  await assert.rejects(user('alice', 'select set_project_skills($1, $2)', [draft.id, Array.from({ length: 16 }, (_, i) => `Skill ${i}`)]), /up to 15 skills/);
  await assert.rejects(user('bob', 'select set_project_skills($1, $2)', [draft.id, ['PHP']]), /your own projects/);
});

test('likes and bookmarks keep counters and notify the creator once', async () => {
  const projectId = await publishedProject('alice', 'Neon Dreams');
  await user('bob', 'insert into project_likes (project_id) values ($1)', [projectId]);
  await user('bob', 'delete from project_likes where project_id = $1', [projectId]);
  await user('bob', 'insert into project_likes (project_id) values ($1)', [projectId]);
  await user('bob', 'insert into bookmarks (project_id) values ($1)', [projectId]);

  const [counts] = await rows(guest('select like_count, bookmark_count from projects where id = $1', [projectId]));
  assert.deepEqual(counts, { like_count: 1, bookmark_count: 1 });
  const notices = await rows(user('alice', 'select type, actor_id from notifications where project_id = $1 order by type', [projectId]));
  assert.deepEqual(notices.map((row) => row.type), ['bookmark', 'like']);
  assert.ok(notices.every((row) => row.actor_id === users.bob));

  assert.equal((await rows(user('alice', 'select * from bookmarks'))).length, 0);
  await assert.rejects(guest('select * from bookmarks'), DENIED);
  await user('alice', "update notifications set read_at = now(), is_saved = true where type = 'like'");
  await assert.rejects(user('alice', "update notifications set type = 'system'"), DENIED);

  const [draft] = await rows(user('alice', "insert into projects (title) values ('Secret Draft') returning id"));
  await assert.rejects(user('bob', 'insert into project_likes (project_id) values ($1)', [draft.id]), DENIED);
});

test('collaboration requests need an available recipient and only the recipient answers', async () => {
  const [request] = await rows(user('bob', "insert into collaboration_requests (recipient_id, project_title, message, tags) values ($1, 'Launch film', 'Want to team up?', array['Motion Design']) returning id", [users.alice]));
  await assert.rejects(user('bob', "update collaboration_requests set status = 'accepted' where id = $1", [request.id]), /Only the recipient/);
  await user('alice', "update collaboration_requests set status = 'accepted' where id = $1", [request.id]);

  const [answered] = await rows(user('bob', 'select status, responded_at from collaboration_requests where id = $1', [request.id]));
  assert.equal(answered.status, 'accepted');
  assert.ok(answered.responded_at);
  assert.equal((await rows(user('alice', "select id from notifications where type = 'collaboration_request'"))).length, 1);
  assert.equal((await rows(user('bob', "select body from notifications where type = 'collaboration_response'")))[0].body, 'accepted');
  assert.equal((await rows(user('carol', 'select id from collaboration_requests'))).length, 0);

  await user('alice', "update profiles set availability = 'showcasing' where id = $1", [users.alice]);
  await assert.rejects(user('carol', "insert into collaboration_requests (recipient_id, project_title) values ($1, 'Another idea')", [users.alice]), DENIED);
  await user('alice', "update profiles set availability = 'available' where id = $1", [users.alice]);
});

test('reports stay private and moderators hide content through the audited RPC', async () => {
  const projectId = await publishedProject('alice', 'Questionable Post');
  const [report] = await rows(user('bob', "insert into content_reports (target_type, target_id, reason) values ('project', $1, 'spam') returning id, status", [projectId]));
  assert.equal(report.status, 'open');
  await assert.rejects(user('bob', "insert into content_reports (target_type, target_id, reason) values ('project', $1, 'spam')", [projectId]), /duplicate key/);
  assert.equal((await rows(user('alice', 'select id from content_reports'))).length, 0);
  assert.equal((await user('bob', "update content_reports set status = 'resolved'")).affectedRows, 0);
  await assert.rejects(user('bob', "select moderate_content('project', $1, 'hide')", [projectId]), /Moderator access required/);

  await db.query("insert into private.user_roles (user_id, role) values ($1, 'moderator')", [users.mod]);
  await user('mod', "select moderate_content('project', $1, 'hide', 'Spam links', $2)", [projectId, report.id]);
  assert.equal((await rows(guest('select id from projects where id = $1', [projectId]))).length, 0);
  assert.equal((await rows(user('alice', 'select hidden_at from projects where id = $1', [projectId])))[0].hidden_at instanceof Date, true);
  assert.equal((await rows(user('bob', 'select status from content_reports where id = $1', [report.id])))[0].status, 'resolved');
  assert.equal((await rows(user('bob', "select id from notifications where type = 'report_update'"))).length, 1);
  assert.equal((await rows(user('mod', 'select id from moderation_actions'))).length, 1);
  assert.equal((await rows(user('bob', 'select id from moderation_actions'))).length, 0);
});

test('storage policies keep uploads in the owner folder and expose only published work', async () => {
  const projectId = await publishedProject('alice', 'Alpine Dusk');
  const path = `${users.alice}/${projectId}/cover.webp`;
  await user('alice', "insert into storage.objects (bucket_id, name) values ('project-media', $1)", [path]);
  await assert.rejects(user('alice', "insert into storage.objects (bucket_id, name) values ('project-media', $1)", [`${users.bob}/${projectId}/x.webp`]), DENIED);
  await assert.rejects(user('bob', "insert into storage.objects (bucket_id, name) values ('project-media', $1)", [`${users.bob}/${projectId}/x.webp`]), DENIED);

  const objectVisible = async () => (await rows(guest("select name from storage.objects where bucket_id = 'project-media' and name = $1", [path]))).length === 1;
  assert.equal(await objectVisible(), false, 'unreferenced uploads stay private');
  await user('alice', 'insert into project_media (project_id, storage_path, alt_text) values ($1, $2, $3)', [projectId, path, 'Snowy peaks at sunset']);
  assert.equal(await objectVisible(), true);
  await user('alice', "update projects set visibility = 'draft' where id = $1", [projectId]);
  assert.equal(await objectVisible(), false, 'unpublishing hides media');
  await assert.rejects(user('alice', 'insert into project_media (project_id, storage_path) values ($1, $2)', [projectId, `${users.bob}/${projectId}/y.webp`]), /check constraint/);

  await user('alice', "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${users.alice}/avatar.webp`]);
  await assert.rejects(user('alice', "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${users.bob}/avatar.webp`]), DENIED);
});

test('portfolio drafts are private and published snapshots are public unless hidden', async () => {
  await user('alice', `insert into portfolio_drafts (content) values ('{"profile":{"name":"Alice"}}')`);
  assert.equal((await rows(user('bob', 'select * from portfolio_drafts'))).length, 0);
  await assert.rejects(guest('select * from portfolio_drafts'), DENIED);

  const hero = `${users.alice}/hero.webp`;
  await user('alice', "insert into storage.objects (bucket_id, name) values ('portfolio-media', $1)", [hero]);
  const heroVisible = async () => (await rows(guest("select name from storage.objects where bucket_id = 'portfolio-media' and name = $1", [hero]))).length === 1;
  assert.equal(await heroVisible(), false);
  await user('alice', `insert into published_portfolios (slug, content, media_paths) values ('alice-doe', '{"profile":{"name":"Alice"}}', $1)`, [[hero]]);
  assert.equal((await rows(guest("select slug from published_portfolios where slug = 'alice-doe'"))).length, 1);
  assert.equal(await heroVisible(), true);

  await assert.rejects(user('alice', "update published_portfolios set hidden_at = now() where owner_id = $1", [users.alice]), DENIED);
  await assert.rejects(user('bob', "insert into published_portfolios (slug, content) values ('alice-doe', '{}')"), /duplicate key/);
});

test('discovery views return public creators with skills and search vectors', async () => {
  await user('alice', "select set_profile_skills(array['PHP', 'React', 'php', 'Figma'])");
  const [card] = await rows(guest('select username, skills, skill_keys, public_project_count from creator_cards'));
  assert.deepEqual(card.skills, ['PHP', 'React', 'Figma']);
  assert.deepEqual(card.skill_keys, ['php', 'react', 'figma']);
  assert.equal(card.public_project_count, 2, 'hidden and draft projects are not counted');

  const bySkill = await rows(guest("select username from creator_cards where skill_keys @> array['php']"));
  assert.deepEqual(bySkill.map((row) => row.username), ['alice']);
  const byText = await rows(guest("select username from creator_cards where search_vector @@ plainto_tsquery('simple', 'creative developer')"));
  assert.deepEqual(byText.map((row) => row.username), ['alice']);

  await user('alice', 'update profiles set discoverable = false where id = $1', [users.alice]);
  assert.equal((await rows(guest('select id from creator_cards'))).length, 0);
  assert.equal((await rows(guest('select id from project_cards'))).length, 0);
  assert.equal((await rows(guest('select id from profiles where id = $1', [users.alice]))).length, 1, 'profile URL still works');
});

test('auth rate limits allow up to the limit, report the wait, clear on success and stay server-only', async () => {
  const server = (sql, params) => as('service_role', null, sql, params);
  const attempt = async () => (await rows(server("select auth_attempt(array['sign-in:ip', 'sign-in:email'], array[20, 3], 900) as wait")))[0].wait;
  assert.deepEqual([await attempt(), await attempt(), await attempt()], [0, 0, 0]);
  const wait = await attempt();
  assert.ok(wait > 890 && wait <= 900, `waits out the window, got ${wait}`);
  assert.equal((await rows(db.query("select count(*)::int as n from private.auth_attempts where key = 'sign-in:email'")))[0].n, 3, 'blocked attempts are not recorded');

  await server("select auth_clear(array['sign-in:email'])");
  assert.equal(await attempt(), 0);
  assert.equal((await rows(db.query("select count(*)::int as n from private.auth_attempts where key = 'sign-in:ip'")))[0].n, 4, 'clearing one key keeps the others');

  await assert.rejects(server("select auth_attempt(array['a'], array[0], 900)"), /Invalid rate limit request/);
  await assert.rejects(server("select auth_attempt(array['a', 'b'], array[1], 900)"), /Invalid rate limit request/);
  await assert.rejects(guest("select auth_attempt(array['x'], array[1], 60)"), DENIED);
  await assert.rejects(user('alice', "select auth_clear(array['sign-in:email'])"), DENIED);
  await assert.rejects(user('alice', 'select * from private.auth_attempts'), DENIED);
});

test('workspace profile RPCs read, save and switch settings in one call each, as the caller', async () => {
  const { rows: [row] } = await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('erin@example.com', $1, now()) returning id", [{ username: 'erin', full_name: 'Erin Lee' }]);
  users.erin = row.id;
  const call = async (sql, params) => (await rows(user('erin', sql, params)))[0].result;

  const fresh = await call('select my_profile() as result');
  assert.deepEqual(fresh.profile, { username: 'erin', email: 'member@example.com', name: 'Erin Lee', headline: '', bio: '', location: '', avatarPath: null, availability: 'available', visible: true, skills: [], links: { website: '', instagram: '', youtube: '' } }, 'a new account starts public');
  assert.deepEqual(fresh.preferences, { showAvailability: true, communityDiscovery: true, projectNotifications: true, messageNotifications: true, communityNotifications: true, productNotifications: false });

  const draft = { name: 'Erin Lee', headline: 'Illustrator', bio: 'Ink and colour.', location: 'Davao', availability: 'showcasing', visible: true, skills: ['Procreate', 'procreate', 'Inking'], links: { website: 'https://erin.art', instagram: '', youtube: 'https://youtube.com/@erin' }, avatarPath: `${users.erin}/one.webp` };
  const saved = await call('select save_my_profile($1) as result', [draft]);
  assert.deepEqual([saved.profile.headline, saved.profile.visible, saved.profile.skills, saved.profile.links, saved.profile.avatarPath, saved.previousAvatarPath],
    ['Illustrator', true, ['Procreate', 'Inking'], { website: 'https://erin.art', instagram: '', youtube: 'https://youtube.com/@erin' }, `${users.erin}/one.webp`, null]);
  const again = await call('select save_my_profile($1) as result', [{ ...draft, links: { website: '' }, avatarPath: `${users.erin}/two.webp` }]);
  assert.equal(again.previousAvatarPath, `${users.erin}/one.webp`, 'the replaced photo is reported for deletion');
  assert.deepEqual(again.profile.links, { website: '', instagram: '', youtube: '' });
  const { avatarPath, ...kept } = draft;
  assert.equal((await call('select save_my_profile($1) as result', [kept])).profile.avatarPath, `${users.erin}/two.webp`, 'no avatarPath keeps the photo');

  await assert.rejects(user('erin', 'select save_my_profile($1)', [{ ...draft, avatarPath: `${users.alice}/stolen.webp` }]), /check constraint/, 'photos must live in the creator\'s own folder');
  await assert.rejects(user('erin', 'select save_my_profile($1)', [{ ...draft, links: { website: 'http://insecure.example' } }]), /https_url/);
  assert.equal((await call('select my_profile() as result')).profile.headline, 'Illustrator', 'a failed save changes nothing');

  const switched = await call("select set_my_preferences('{\"communityDiscovery\": false, \"productNotifications\": true}') as result");
  assert.deepEqual([switched.preferences.communityDiscovery, switched.preferences.productNotifications, switched.preferences.showAvailability], [false, true, true]);

  assert.equal((await rows(user('bob', 'select my_profile() as result')))[0].result.profile.username, 'bob', 'each caller only ever gets their own profile');
  await assert.rejects(guest('select my_profile()'), DENIED);
  await assert.rejects(guest("select save_my_profile('{}')"), DENIED);
});

test('profile saves are rate limited per creator', async () => {
  const draft = { name: 'Erin Lee', headline: 'Illustrator', availability: 'available', visible: false, skills: [], links: {} };
  await db.query("delete from private.auth_attempts where key like 'profile:%'");
  for (let n = 0; n < 30; n++) await user('erin', 'select save_my_profile($1)', [draft]);
  await assert.rejects(user('erin', 'select save_my_profile($1)', [draft]), /saving very quickly/);
  await user('bob', 'select save_my_profile($1)', [{ ...draft, name: 'Bob Reyes' }]);
});

test('community RPCs: post, feed, like, save, follow and delete, all as the caller', async () => {
  const signUpPublic = async (name) => {
    const { rows: [row] } = await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id", [`${name}@example.com`, { username: name, full_name: name }]);
    users[name] = row.id;
    await user(name, "update profiles set visibility = 'public', headline = 'Creator' where id = $1", [row.id]);
  };
  await signUpPublic('fay');
  await signUpPublic('gus');
  const call = async (name, sql, params) => (await rows(user(name, sql, params)))[0].result;

  const { id } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Neon Poster', summary: 'A gig poster.', categories: ['Design', 'Digital Art', 'Nope'], tools: ['Figma', 'figma', 'Procreate'] }]);
  const coverPath = `${users.fay}/${id}/cover.webp`;
  await user('fay', 'insert into project_media (project_id, storage_path, alt_text, width, height) values ($1, $2, $3, 1600, 900)', [id, coverPath, 'Neon Poster']);

  const gusFeed = await call('gus', 'select workspace_feed() as result');
  const poster = gusFeed.projects.find((project) => project.id === id);
  assert.deepEqual([poster.title, poster.summary, poster.categories, poster.tools, poster.coverPath, poster.creatorId, poster.likes], ['Neon Poster', 'A gig poster.', ['Design', 'Digital Art'], ['Figma', 'Procreate'], coverPath, users.fay, 0]);
  assert.ok(gusFeed.creators.some((creator) => creator.id === users.fay && creator.followers === 0));
  assert.ok(!gusFeed.creators.some((creator) => creator.id === users.gus), 'the caller is not suggested to themselves');

  assert.deepEqual(await call('gus', 'select toggle_like($1) as result', [id]), { liked: true, likes: 1 });
  assert.deepEqual(await call('gus', 'select toggle_bookmark($1) as result', [id]), { saved: true, saves: 1 });
  assert.deepEqual(await call('gus', 'select toggle_follow($1) as result', [users.fay]), { following: true, followers: 1 });
  const after = await call('gus', 'select workspace_feed() as result');
  assert.deepEqual([after.likes, after.bookmarks, after.following], [[id], [id], [users.fay]]);
  assert.equal((await rows(db.query("select count(*)::int as n from notifications where recipient_id = $1 and type in ('like', 'bookmark', 'follow')", [users.fay])))[0].n, 3, 'the creator is notified');
  assert.deepEqual(await call('gus', 'select toggle_like($1) as result', [id]), { liked: false, likes: 0 });
  assert.deepEqual(await call('gus', 'select toggle_follow($1) as result', [users.fay]), { following: false, followers: 0 });

  const { id: draft } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Draft idea', categories: ['Video'] }]);
  await user('fay', "update projects set visibility = 'draft' where id = $1", [draft]);
  assert.ok((await call('fay', 'select workspace_feed() as result')).projects.some((project) => project.id === draft), 'owners see their drafts');
  assert.ok(!(await call('gus', 'select workspace_feed() as result')).projects.some((project) => project.id === draft), 'others do not');
  await assert.rejects(user('gus', 'select toggle_like($1)', [draft]), DENIED);

  await assert.rejects(user('gus', 'select delete_my_project($1)', [id]), /Project not found/);
  assert.deepEqual(await call('fay', 'select delete_my_project($1) as result', [id]), [coverPath]);
  assert.ok(!(await call('gus', 'select workspace_feed() as result')).projects.some((project) => project.id === id));
  await assert.rejects(guest('select workspace_feed()'), DENIED);
});

test('auth_refund gives back only the latest attempt per key and is server-only', async () => {
  const server = (sql, params) => as('service_role', null, sql, params);
  const count = async (key) => (await rows(db.query('select count(*)::int as n from private.auth_attempts where key = $1', [key])))[0].n;
  await db.query("delete from private.auth_attempts where key in ('refund:a', 'refund:b')");
  for (let n = 0; n < 3; n++) await server("select auth_attempt(array['refund:a', 'refund:b'], array[10, 10], 3600)");
  await server("select auth_refund(array['refund:a', 'refund:b'])");
  assert.deepEqual([await count('refund:a'), await count('refund:b')], [2, 2]);
  await assert.rejects(guest("select auth_refund(array['refund:a'])"), DENIED);
  await assert.rejects(user('alice', "select auth_refund(array['refund:a'])"), DENIED);
});

test('the feed lists every project photo in order, cover first', async () => {
  const call = async (name, sql, params) => (await rows(user(name, sql, params)))[0].result;
  const { id } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Gallery piece', summary: 'Three angles.', categories: ['Design'] }]);
  for (const [file, position] of [['side.webp', 2], ['cover.webp', 0], ['back.webp', 1]]) {
    await user('fay', 'insert into project_media (project_id, storage_path, sort_order) values ($1, $2, $3)', [id, `${users.fay}/${id}/${file}`, position]);
  }
  const project = (await call('gus', 'select workspace_feed() as result')).projects.find((item) => item.id === id);
  assert.deepEqual(project.mediaPaths, ['cover.webp', 'back.webp', 'side.webp'].map((file) => `${users.fay}/${id}/${file}`));
  assert.equal(project.coverPath, `${users.fay}/${id}/cover.webp`);
  await assert.rejects(user('gus', 'insert into project_media (project_id, storage_path) values ($1, $2)', [id, `${users.gus}/${id}/sneaky.webp`]), DENIED);
});

test('comments: members comment on public projects, counts follow, authors and creators delete', async () => {
  const call = async (name, sql, params) => (await rows(user(name, sql, params)))[0].result;
  const { id } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Commented piece', summary: 'Say something.', categories: ['Design'] }]);
  const first = await call('gus', 'select add_project_comment($1, $2) as result', [id, '  Love the colours!  ']);
  assert.deepEqual([first.body, first.username, first.mine, first.canDelete], ['Love the colours!', 'gus', true, true]);
  await call('fay', 'select add_project_comment($1, $2) as result', [id, 'Thank you!']);
  const listForFay = await call('fay', 'select project_comments_list($1) as result', [id]);
  assert.deepEqual(listForFay.map((comment) => [comment.username, comment.mine, comment.canDelete]), [['gus', false, true], ['fay', true, true]], 'the creator can remove any comment on their project');
  assert.equal((await call('gus', 'select workspace_feed() as result')).projects.find((project) => project.id === id).comments, 2);

  await assert.rejects(user('gus', 'select add_project_comment($1, $2)', [id, ' ']), /check constraint/);
  await assert.rejects(user('erin', 'select delete_project_comment($1)', [first.id]), /Comment not found/, 'others cannot delete it');
  await user('fay', 'select delete_project_comment($1)', [first.id]);
  assert.equal((await rows(db.query('select comment_count from projects where id = $1', [id])))[0].comment_count, 1);

  const { id: draft } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Secret draft', categories: ['Design'] }]);
  await user('fay', "update projects set visibility = 'draft' where id = $1", [draft]);
  await assert.rejects(user('gus', 'select add_project_comment($1, $2)', [draft, 'Hello?']), DENIED);
  assert.deepEqual(await call('gus', 'select project_comments_list($1) as result', [draft]), []);
  await assert.rejects(guest('select project_comments_list($1)', [id]), DENIED);
});

test('notifications: comments notify the creator, and my_notifications lists who did what', async () => {
  const call = async (name, sql, params) => (await rows(user(name, sql, params)))[0].result;
  const { id } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Noticed piece', categories: ['Design'] }]);
  await call('gus', 'select add_project_comment($1, $2) as result', [id, 'This is lovely.']);
  await call('fay', 'select add_project_comment($1, $2) as result', [id, 'My own note.']);
  await call('gus', 'select toggle_follow($1) as result', [users.fay]);

  const inbox = await call('fay', 'select my_notifications() as result');
  const comment = inbox.notifications.find((item) => item.type === 'comment' && item.project?.id === id);
  assert.deepEqual([comment.body, comment.actor.username, comment.project.title, comment.read, comment.saved], ['This is lovely.', 'gus', 'Noticed piece', false, false]);
  assert.equal(inbox.notifications.filter((item) => item.type === 'comment' && item.project?.id === id).length, 1, 'commenting on your own project notifies nobody');
  assert.ok(inbox.notifications.some((item) => item.type === 'follow' && item.actor?.id === users.gus));
  assert.equal(inbox.followers, 1);
  assert.deepEqual(inbox.notifications.map((item) => item.createdAt), [...inbox.notifications.map((item) => item.createdAt)].sort().reverse(), 'newest first');

  await user('fay', "update notifications set read_at = now(), is_saved = true where id = $1", [comment.id]);
  const after = (await call('fay', 'select my_notifications() as result')).notifications.find((item) => item.id === comment.id);
  assert.deepEqual([after.read, after.saved], [true, true]);
  await assert.rejects(user('fay', "update notifications set body = 'changed' where id = $1", [comment.id]), DENIED);
  assert.equal((await rows(user('gus', 'select id from notifications where id = $1', [comment.id]))).length, 0, 'only the recipient sees it');
  await user('fay', 'delete from notifications where id = $1', [comment.id]);
  assert.ok(!(await call('fay', 'select my_notifications() as result')).notifications.some((item) => item.id === comment.id));
  await assert.rejects(guest('select my_notifications()'), DENIED);
});

test('creator_portfolio: guests see a public creator and published work; private creators only themselves', async () => {
  const call = async (name, sql, params) => (await rows(user(name, sql, params)))[0].result;
  const asGuest = async (handle) => (await rows(guest('select creator_portfolio($1) as result', [handle])))[0].result;
  await call('fay', 'select save_my_profile($1) as result', [{ name: 'fay', headline: 'Creator', bio: 'I make posters.', location: 'Cebu', availability: 'available', visible: true, skills: ['Figma'], links: { website: 'https://fay.example.com', instagram: '', youtube: '' } }]);
  const { id } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Portfolio piece', summary: 'Shown to guests.', categories: ['Design'], tools: ['Figma'] }]);
  await user('fay', 'insert into project_media (project_id, storage_path, alt_text, width, height) values ($1, $2, $3, 1600, 900)', [id, `${users.fay}/${id}/cover.webp`, 'Cover']);
  const { id: draft } = await call('fay', 'select create_my_project($1) as result', [{ title: 'Hidden draft', categories: ['Video'] }]);
  await user('fay', "update projects set visibility = 'draft' where id = $1", [draft]);

  const page = await asGuest('FAY');
  assert.deepEqual([page.profile.username, page.profile.bio, page.profile.location, page.profile.availability, page.profile.own], ['fay', 'I make posters.', 'Cebu', 'available', false]);
  assert.deepEqual(page.skills, ['Figma']);
  assert.deepEqual(page.links, [{ kind: 'website', url: 'https://fay.example.com' }]);
  const piece = page.projects.find((project) => project.id === id);
  assert.deepEqual([piece.title, piece.categories, piece.tools, piece.mediaPaths], ['Portfolio piece', ['Design'], ['Figma'], [`${users.fay}/${id}/cover.webp`]]);
  assert.ok(!page.projects.some((project) => project.id === draft), 'drafts stay private');
  assert.equal(typeof page.followers, 'number');
  assert.equal((await call('fay', 'select creator_portfolio($1) as result', ['fay'])).profile.own, true);

  await user('fay', "update profiles set show_availability = false where id = $1", [users.fay]);
  assert.equal((await asGuest('fay')).profile.availability, null, 'hidden availability is not shared');
  await user('fay', "update profiles set visibility = 'private' where id = $1", [users.fay]);
  assert.equal(await asGuest('fay'), null);
  assert.equal(await call('gus', 'select creator_portfolio($1) as result', ['fay']), null);
  assert.equal((await call('fay', 'select creator_portfolio($1) as result', ['fay'])).profile.visible, false, 'owners still see their own');
  assert.equal(await asGuest('nobody_here'), null);
  await user('fay', "update profiles set visibility = 'public' where id = $1", [users.fay]);
});
