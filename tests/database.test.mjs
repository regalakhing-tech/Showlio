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

// Run one statement as an API role, with the JWT subject PostgREST would set.
function as(role, userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [userId ? JSON.stringify({ sub: userId, role }) : '']);
    return tx.query(sql, params);
  });
}
const guest = (sql, params) => as('anon', null, sql, params);
const user = (name, sql, params) => as('authenticated', users[name], sql, params);
const rows = async (promise) => (await promise).rows;

async function signUp(name, metadata) {
  const { rows: [row] } = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [`${name}@example.com`, metadata]);
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
});

test('sign-up creates a profile and preferences, falling back when a username is taken', async () => {
  const profiles = await rows(db.query('select id, username, display_name, visibility from profiles order by created_at'));
  const byId = Object.fromEntries(profiles.map((row) => [row.id, row]));
  assert.deepEqual([byId[users.alice].username, byId[users.alice].display_name, byId[users.alice].visibility], ['alice', 'Alice Doe', 'draft']);
  assert.equal(byId[users.bob].username, 'bob');
  assert.match(byId[users.carol].username, /^alice_[0-9a-f]{8}$/);
  assert.equal(byId[users.mod].display_name, 'mod');
  assert.equal((await rows(db.query('select count(*)::int as n from user_preferences')))[0].n, 4);

  const [check] = await rows(guest("select username_available('alice') as taken, username_available('fresh_name') as free, username_available('Bad Name') as invalid"));
  assert.deepEqual(check, { taken: false, free: true, invalid: false });
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
