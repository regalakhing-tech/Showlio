// Runs the PHP auth API against a fake Supabase that records every call, so
// validation, rate limits, cookies and error mapping are checked without a
// real project or network.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { startPhp } from '../scripts/lib/php-server.mjs';
import { startFakeSmtp } from './support/fake-smtp.mjs';

const SECRET = 'sb_secret_test';
const PUBLISHABLE = 'sb_publishable_test';
const user = { id: 'u1', email: 'ana@example.com', user_metadata: { username: 'ana', full_name: 'Ana Cruz' } };
const session = (n) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 3600, token_type: 'bearer', user });

// Profile routes read the token's expiry and subject, so they need a JWT-shaped token.
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const ACCESS_JWT = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', email: 'ana@example.com', exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
const EXPIRED_JWT = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 })}.signature`;
const account = (extra = {}) => ({
  profile: { username: 'ana', email: 'ana@example.com', name: 'Ana Cruz', headline: '', bio: '', location: '', avatarPath: 'u1/now.webp', availability: 'available', visible: false, skills: ['PHP', 'Figma'], links: { website: 'https://ana.dev', instagram: '', youtube: '' } },
  preferences: { showAvailability: true, communityDiscovery: true, projectNotifications: true, messageNotifications: false, communityNotifications: true, productNotifications: false },
  ...extra,
});
const OWN_PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const DRAFT_PROJECT = '33333333-3333-4333-8333-333333333333';
const NEW_PROJECT = '44444444-4444-4444-8444-444444444444';
const OTHER_CREATOR = 'c0ffee00-0000-4000-8000-000000000002';
const feed = {
  projects: [
    { id: OWN_PROJECT, creatorId: 'u1', title: 'My Reel', summary: 'Edit of the year.', status: 'completed', visibility: 'published', videoUrl: null, duration: null, likes: 2, saves: 0, views: 9, shownAt: '2026-10-30T12:00:00+00:00', categories: ['Video'], tools: ['Premiere'], coverPath: `u1/${OWN_PROJECT}/cover.webp`, mediaPaths: [`u1/${OWN_PROJECT}/cover.webp`, `u1/${OWN_PROJECT}/detail.webp`] },
    { id: OTHER_PROJECT, creatorId: OTHER_CREATOR, title: 'Bot', summary: 'Sorts mail.', status: 'completed', visibility: 'published', videoUrl: null, duration: null, likes: 5, saves: 1, views: 40, shownAt: '2026-10-29T08:00:00+00:00', categories: [], tools: [], coverPath: null },
  ],
  creators: [{ id: OTHER_CREATOR, username: 'bo', name: 'Bo Lim', headline: '', bio: 'Automations.', avatarPath: null, followers: 7 }],
  likes: [OTHER_PROJECT],
  bookmarks: [],
  following: [OTHER_CREATOR],
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const calls = [];
let wait = 0;
let fake;
let smtp;
let php;
let origin;

function fakeSupabase(request, body) {
  const route = `${request.method} ${request.url}`;
  const bearer = request.headers.authorization;
  if (route === 'POST /rest/v1/rpc/auth_attempt') return request.headers.apikey === SECRET ? [200, wait] : [401, { message: 'Invalid API key' }];
  if (route === 'POST /rest/v1/rpc/auth_clear' || route === 'POST /rest/v1/rpc/auth_refund') return [204];
  if (['POST /auth/v1/recover', 'POST /auth/v1/resend'].includes(route) && body.email === 'busy@example.com') return [429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }];
  if (['POST /auth/v1/recover', 'POST /auth/v1/resend'].includes(route) && body.email === 'soon@example.com') return [429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }];
  if (route === 'POST /rest/v1/rpc/username_available') return [200, body.candidate !== 'taken'];
  if (route === 'POST /auth/v1/token?grant_type=password') {
    if (body.password === 'correct-horse') return [200, session(1)];
    if (body.password === 'unconfirmed-pw') return [400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }];
    return [400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }];
  }
  if (route === 'POST /auth/v1/token?grant_type=refresh_token') return body.refresh_token === 'refresh-1' ? [200, session(2)] : [400, { error_code: 'refresh_token_not_found' }];
  if (route === 'GET /auth/v1/user') return ['Bearer access-1', 'Bearer access-2'].includes(bearer) ? [200, user] : [403, { error_code: 'bad_jwt' }];
  if (route === 'PUT /auth/v1/user') return body.password === 'weakweak1' ? [422, { error_code: 'weak_password' }] : [200, user];
  if (route === 'POST /auth/v1/admin/users') {
    if (request.headers.apikey !== SECRET) return [401, { message: 'Invalid API key' }];
    if (['exists@example.com', 'pending@example.com'].includes(body.email)) return [422, { error_code: 'email_exists' }];
    return [200, { id: 'u2', email: body.email, user_metadata: body.user_metadata }];
  }
  if (route === 'POST /auth/v1/admin/generate_link') {
    if (request.headers.apikey !== SECRET) return [401, { message: 'Invalid API key' }];
    if (body.type === 'signup' && body.email === 'exists@example.com') return [422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }];
    if (body.type === 'recovery' && body.email === 'nobody@example.com') return [404, { code: 404, error_code: 'user_not_found', msg: 'User with this email not found' }];
    return [200, { id: 'u2', email: body.email, email_otp: body.type === 'recovery' ? '112233' : '654321', verification_type: body.type, user_metadata: body.data ?? { full_name: 'Ana Cruz', username: 'ana' } }];
  }
  if (route === 'POST /auth/v1/verify') {
    if (body.token !== '123456') return [403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }];
    return [200, session(body.type === 'recovery' ? 3 : 2)];
  }
  const { method, url } = request;
  const creator = [`Bearer ${ACCESS_JWT}`, 'Bearer access-2'].includes(bearer);
  const serverOnly = ['auth_attempt', 'auth_clear', 'auth_refund', 'username_available'].some((name) => route === `POST /rest/v1/rpc/${name}`);
  // Guests may open portfolios: the fake answers as anon without a token, and as the owner with one.
  if (route === 'POST /rest/v1/rpc/creator_portfolio') {
    if (bearer && !creator) return [401, { code: 'PGRST301', message: 'JWT expired' }];
    return [200, body.handle !== 'bo_lim' ? null : {
      profile: { id: OTHER_CREATOR, username: 'bo_lim', name: 'Bo Lim', headline: 'Colorist', bio: 'I grade films.', location: 'Cebu', avatarPath: null, availability: null, visible: true, own: false, joinedAt: '2026-10-01T00:00:00+00:00' },
      skills: ['DaVinci Resolve'], links: [{ kind: 'website', url: 'https://bo.example.com' }], followers: 4,
      projects: [{ id: OTHER_PROJECT, title: 'Bot', summary: 'Sorts mail.', likes: 5, views: 40, comments: 2, shownAt: '2026-10-29T08:00:00+00:00', categories: [], tools: ['Python'], mediaPaths: [`${OTHER_CREATOR}/${OTHER_PROJECT}/a.webp`] }],
    }];
  }
  if (url.startsWith('/rest/v1/rpc/') && !serverOnly && !creator) return [401, { code: 'PGRST301', message: 'JWT expired' }];
  if (route === 'POST /rest/v1/rpc/workspace_feed') return [200, feed];
  if (route === 'POST /storage/v1/object/sign/project-media') return [200, body.paths.map((path) => ({ error: null, path, signedURL: `/object/sign/project-media/${path}?token=signed` }))];
  if (route === 'POST /rest/v1/rpc/create_my_project') return [200, { id: NEW_PROJECT }];
  if (route === 'PATCH /rest/v1/profiles?id=eq.u1') return creator ? [204] : [401, { code: 'PGRST301' }];
  if (method === 'POST' && url.startsWith(`/storage/v1/object/project-media/u1/${NEW_PROJECT}/`)) return [200, { Key: url.slice(18) }];
  if (route === 'POST /rest/v1/project_media') return body.sort_order === 7 ? [400, { code: '23514', message: 'Limit reached: at most 10 project media per item.' }] : [201];
  if (route === 'POST /rest/v1/rpc/delete_my_project') return [OWN_PROJECT, NEW_PROJECT].includes(body.project) ? [200, [`u1/${body.project}/cover.webp`]] : [400, { code: 'P0002', message: 'Project not found.' }];
  if (route === 'DELETE /storage/v1/object/project-media') return [200, []];
  if (route === 'POST /rest/v1/rpc/toggle_like') return body.project === DRAFT_PROJECT ? [403, { code: '42501', message: 'new row violates row-level security policy' }] : [200, { liked: true, likes: 6 }];
  if (route === 'POST /rest/v1/rpc/toggle_bookmark') return [200, { saved: true, saves: 2 }];
  if (route === 'POST /rest/v1/rpc/toggle_follow') return [200, { following: true, followers: 8 }];
  if (route === 'POST /rest/v1/rpc/record_project_view') return [204];
  const comment = { id: 'c0000000-0000-4000-8000-000000000001', body: 'Love it!', createdAt: '2026-10-31T01:00:00+00:00', authorId: OTHER_CREATOR, username: 'bo', name: 'Bo Lim', avatarPath: `${OTHER_CREATOR}/me.webp`, mine: false, canDelete: true };
  if (route === 'POST /rest/v1/rpc/project_comments_list') return [200, [comment]];
  const NOTE = 'd0000000-0000-4000-8000-000000000001';
  if (route === 'POST /rest/v1/rpc/my_notifications') return [200, { followers: 3, notifications: [{ id: NOTE, type: 'comment', title: '', body: 'Nice!', createdAt: '2026-10-31T02:00:00+00:00', read: false, saved: false, actor: { id: OTHER_CREATOR, username: 'bo', name: 'Bo Lim', headline: '', avatarPath: null }, project: { id: OWN_PROJECT, title: 'My Reel' } }] }];
  if (method === 'PATCH' && url.startsWith('/rest/v1/notifications?')) return creator ? [204] : [401, { code: 'PGRST301' }];
  if (method === 'DELETE' && url.startsWith('/rest/v1/notifications?')) return creator ? [204] : [401, { code: 'PGRST301' }];
  if (route === 'POST /rest/v1/rpc/add_project_comment') return [200, { ...comment, body: body.body, mine: true }];
  if (route === 'POST /rest/v1/rpc/delete_project_comment') return body.comment === comment.id ? [204] : [400, { code: 'P0002', message: 'Comment not found.' }];
  if (route === 'POST /rest/v1/rpc/my_profile') return [200, account()];
  if (route === 'POST /rest/v1/rpc/save_my_profile') {
    if (body.profile.headline === 'too fast') return [429, { code: 'PT429', message: 'You’re saving very quickly. Try again in 2 minutes.' }];
    return [200, account({ previousAvatarPath: 'avatarPath' in body.profile ? 'u1/old.png' : null })];
  }
  if (route === 'POST /rest/v1/rpc/set_my_preferences') return [200, account()];
  if (method === 'POST' && url.startsWith('/storage/v1/object/avatars/u1/')) return [200, { Key: url.slice(18) }];
  if (method === 'DELETE' && url.startsWith('/storage/v1/object/avatars/')) return [200, [{}]];
  if (['POST /auth/v1/logout?scope=local', 'POST /auth/v1/recover', 'POST /auth/v1/resend'].includes(route)) return route.includes('logout') ? [204] : [200, {}];
  return [404, { message: `Unexpected ${route}` }];
}

before(async () => {
  fake = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw && request.headers['content-type']?.includes('json') ? JSON.parse(raw) : raw || null;
    calls.push({ route: `${request.method} ${request.url}`, apikey: request.headers.apikey, authorization: request.headers.authorization, forwardedFor: request.headers['sb-forwarded-for'], type: request.headers['content-type'], body });
    const [status, data] = fakeSupabase(request, body);
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(data === undefined ? '' : JSON.stringify(data));
  });
  smtp = await startFakeSmtp({ reject: (address) => address === 'bounce@example.com' });
  fake.listen(0, '127.0.0.1');
  await once(fake, 'listening');
  php = await startPhp({
    SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SECRET_KEY: SECRET,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtp.port),
    SMTP_SECURE: 'none',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
    MAIL_FROM: 'codes@showlio.test',
    SITE_URL: 'https://showlio.test',
  });
  origin = php.origin;
});

after(async () => {
  await php?.stop();
  fake?.close();
  smtp?.close();
});

beforeEach(() => {
  calls.length = 0;
  smtp.messages.length = 0;
  wait = 0;
});

const post = (path, body, { cookie, slot, type = 'application/json', base = origin } = {}) => fetch(`${base}/api/auth/${path}`, {
  method: 'POST',
  headers: { 'Content-Type': type, ...(cookie ? { Cookie: cookie } : {}), ...(slot === undefined ? {} : { 'X-Showlio-Slot': String(slot) }) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const called = (route) => calls.filter((call) => call.route === route);
const cookie = (response, name) => response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`)) ?? '';
// A sign-in creates a new session whose cookie names end in its id; this reads one with the id left out.
const fresh = (response, name) => (response.headers.getSetCookie().find((line) => new RegExp(`^${name}_[a-z0-9]{8}=`).test(line)) ?? '').replace(/^(showlio_(?:access|refresh))_[a-z0-9]{8}=/, '$1=');

test('auth routes accept only JSON POST requests', async () => {
  const get = await fetch(`${origin}/api/auth/sign-in`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await post('sign-in', 'email=a@b.co', { type: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await post('sign-in', '[1, 2]')).status, 400);
  assert.equal((await post('sign-in', 'x'.repeat(20000))).status, 413);
  assert.equal(calls.length, 0);
});

test('sign-in validates input before calling Supabase', async () => {
  const response = await post('sign-in', { email: 'not-an-email', password: 'short' });
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).errors, {
    email: 'Enter a valid email, like you@yourdomain.com.',
    password: 'Passwords have at least 8 characters.',
  });
  assert.equal((await post('sign-in', { email: ['ana@example.com'], password: 'x'.repeat(73) })).status, 422);
  assert.equal(calls.length, 0);
});

test('sign-in sets HttpOnly cookies, counts hashed keys and clears the email counter', async () => {
  const response = await post('sign-in', { email: ' Ana@Example.com ', password: 'correct-horse', remember: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: 'u1', email: 'ana@example.com', username: 'ana', name: 'Ana Cruz' } });

  const access = fresh(response, 'showlio_access');
  const refresh = fresh(response, 'showlio_refresh');
  assert.match(access, /^showlio_access=access-1;.*Max-Age=3600;.*path=\/api;.*HttpOnly; SameSite=Lax$/);
  assert.match(refresh, /^showlio_refresh=p\.refresh-1;.*Max-Age=2592000;.*path=\/api;.*HttpOnly; SameSite=Lax$/);
  assert.doesNotMatch(access + refresh, /Secure/, 'plain HTTP in development');

  const [limit] = called('POST /rest/v1/rpc/auth_attempt');
  assert.equal(limit.apikey, SECRET);
  assert.deepEqual(limit.body.limits, [1000, 5]);
  assert.equal(limit.body.window_seconds, 900);
  for (const key of limit.body.keys) assert.match(key, /^sign-in:[0-9a-f]{64}$/, 'no raw email or IP');
  const [signIn] = called('POST /auth/v1/token?grant_type=password');
  assert.deepEqual([signIn.apikey, signIn.forwardedFor], [SECRET, '127.0.0.1'], 'Supabase Auth limits each visitor by their own IP, which only the secret key may pass on');
  assert.deepEqual(signIn.body, { email: 'ana@example.com', password: 'correct-horse' });
  assert.deepEqual(called('POST /rest/v1/rpc/auth_clear')[0].body, { keys: [limit.body.keys[1]] });
});

test('without remember me the cookies end with the browser session', async () => {
  const response = await post('sign-in', { email: 'ana@example.com', password: 'correct-horse' });
  assert.match(fresh(response, 'showlio_refresh'), /^showlio_refresh=s\.refresh-1;/);
  assert.doesNotMatch(fresh(response, 'showlio_access') + fresh(response, 'showlio_refresh'), /expires|Max-Age/i);
});

test('a wrong password is a 401 on the password field and keeps counting', async () => {
  const response = await post('sign-in', { email: 'ana@example.com', password: 'wrong-password' });
  assert.equal(response.status, 401);
  assert.deepEqual((await response.json()).errors, { password: 'Email or password is incorrect.' });
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal(called('POST /rest/v1/rpc/auth_clear').length, 0);

  const unconfirmed = await post('sign-in', { email: 'ana@example.com', password: 'unconfirmed-pw' });
  assert.equal(unconfirmed.status, 403);
  assert.equal((await unconfirmed.json()).code, 'email_not_confirmed');
});

test('rate-limited attempts get 429 with Retry-After and never reach Supabase Auth', async () => {
  wait = 600;
  const response = await post('sign-in', { email: 'ana@example.com', password: 'correct-horse' });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '600');
  assert.equal((await response.json()).error, 'Too many attempts. Try again in 10 minutes.');
  assert.equal(called('POST /auth/v1/token?grant_type=password').length, 0);
});

test('without the secret key, auth fails closed instead of allowing unlimited guesses', async () => {
  const unconfigured = await startPhp({ SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SECRET_KEY: '' });
  try {
    const response = await post('sign-in', { email: 'ana@example.com', password: 'correct-horse' }, { base: unconfigured.origin });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  } finally {
    await unconfigured.stop();
  }
});

test('the session endpoint knows guests, members and expired tokens', async () => {
  const session = (cookies) => fetch(`${origin}/api/auth/session`, { headers: cookies ? { Cookie: cookies } : {} });
  assert.equal((await session()).status, 401);

  const member = await session('showlio_access=access-1');
  assert.equal(member.status, 200);
  assert.equal((await member.json()).user.email, 'ana@example.com');

  const refreshed = await session('showlio_access=expired; showlio_refresh=s.refresh-1');
  assert.equal(refreshed.status, 200);
  assert.match(cookie(refreshed, 'showlio_access'), /^showlio_access=access-2;/);
  assert.doesNotMatch(cookie(refreshed, 'showlio_refresh'), /Max-Age/, 'keeps the session-only choice');

  const revoked = await session('showlio_access=expired; showlio_refresh=p.stolen');
  assert.equal(revoked.status, 401);
  assert.match(cookie(revoked, 'showlio_access'), /^showlio_access=deleted;/);

  calls.length = 0;
  assert.equal((await session('showlio_access=access-1%0D%0AX-Injected:%201')).status, 401);
  assert.equal(calls.length, 0, 'a header-breaking cookie never reaches Supabase');
});

test('sign-up checks every field and the username, then asks for the emailed code', async () => {
  const invalid = await post('sign-up', { name: ' ', username: 'No', email: 'ana@', password: 'short', confirm: 'other', terms: false });
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys((await invalid.json()).errors).sort(), ['confirm', 'email', 'name', 'password', 'terms', 'username']);
  assert.equal(calls.length, 0);

  const form = { name: '  Ana   Cruz ', username: '@Ana_New', email: 'Ana@Example.com', password: 'correct-horse', confirm: 'correct-horse', terms: true };
  const taken = await post('sign-up', { ...form, username: 'taken' });
  assert.deepEqual((await taken.json()).errors, { username: 'That username is taken. Try another.' });

  const response = await post('sign-up', form);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { verify: true });
  const [created] = called('POST /auth/v1/admin/users');
  assert.deepEqual([created.apikey, created.body], [SECRET, { email: 'ana@example.com', password: 'correct-horse', email_confirm: false, user_metadata: { username: 'ana_new', full_name: 'Ana Cruz' } }]);
  const [link] = called('POST /auth/v1/admin/generate_link');
  assert.deepEqual([link.apikey, link.body], [SECRET, { type: 'signup', email: 'ana@example.com' }]);
  const [limit] = called('POST /rest/v1/rpc/auth_attempt');
  assert.deepEqual([limit.body.limits, limit.body.window_seconds], [[1000, 3], 3600]);

  // Showlio sends the code itself, with the branded template.
  const [email] = smtp.messages;
  assert.deepEqual(email.to, ['ana@example.com']);
  assert.match(email.text, /^Subject: 654321 is your Showlio verification code$/m, 'the code leads, so Gmail offers its own Copy code button');
  assert.match(email.text, /^From: Showlio <codes@showlio\.test>$/m);
  assert.match(email.text, /Hi Ana Cruz, welcome to Showlio!/);
  assert.match(email.text, /<img src="cid:showlio-logo"/, 'the logo is embedded, not loaded from the website');
  assert.match(email.text, /Content-ID: <showlio-logo>/);
  assert.match(email.text, /letter-spacing:10px[^>]*>654321</, 'the code itself');
  assert.doesNotMatch(email.text, /href=|https?:\/\/showlio/, 'no links: Gmail blocks code emails that link to a website');
  assert.match(email.text, /Your Showlio verification code is 654321\. It expires in 1 hour\./, 'plain-text version');
  assert.doesNotMatch(email.text, /\{\{/, 'every placeholder is filled');

  const exists = await post('sign-up', { ...form, email: 'exists@example.com' });
  assert.deepEqual([exists.status, (await exists.json()).errors], [422, { email: 'An account with this email already exists. Sign in or reset your password.' }]);
});

test('a repeated pending signup cannot silently keep a different original password', async () => {
  const response = await post('sign-up', { name: 'Ana Cruz', username: 'ana_new', email: 'pending@example.com', password: 'replacement-password', confirm: 'replacement-password', terms: true });
  assert.equal(response.status, 422);
  assert.match((await response.json()).errors.email, /sign in|reset/i);
  assert.equal(called('POST /auth/v1/admin/generate_link').length, 0, 'existing accounts must not receive a signup code for a password that was ignored');
  assert.equal(smtp.messages.length, 0);
  assert.equal(called('POST /rest/v1/rpc/auth_refund').length, 1);
});

test('the email code is checked by Supabase and signs the person in', async () => {
  const wrong = await post('verify', { email: 'ana@example.com', code: '000000' });
  assert.equal(wrong.status, 422);
  assert.match((await wrong.json()).errors.code, /wrong or has expired/);
  assert.equal((await post('verify', { email: 'ana@example.com', code: '12345' })).status, 422);

  const right = await post('verify', { email: 'ana@example.com', code: '123456' });
  assert.equal(right.status, 200);
  assert.match(fresh(right, 'showlio_access'), /^showlio_access=access-2;/);
  assert.equal(called('POST /auth/v1/verify').at(-1).body.type, 'email');

  for (const [path, type, subject, code] of [['resend', 'signup', '654321 is your Showlio verification code', '654321'], ['forgot', 'recovery', '112233 is your Showlio password reset code', '112233']]) {
    calls.length = 0;
    smtp.messages.length = 0;
    const sent = await post(path, { email: 'ana@example.com' });
    assert.deepEqual(await sent.json(), { sent: true }, path);
    assert.deepEqual(called('POST /auth/v1/admin/generate_link')[0].body, { type, email: 'ana@example.com' }, path);
    assert.match(smtp.messages[0].text, new RegExp(`^Subject: ${subject}$`, 'm'), path);
    assert.match(smtp.messages[0].text, new RegExp(`>${code}<`), path);
  }
});

test('a password reset checks the code, sets the new password and signs in', async () => {
  const response = await post('reset', { email: 'ana@example.com', code: '123456', password: 'new-password-1', confirm: 'new-password-1' });
  assert.equal(response.status, 200);
  assert.match(fresh(response, 'showlio_access'), /^showlio_access=access-3;/);
  assert.equal(called('POST /auth/v1/verify')[0].body.type, 'recovery');
  const [update] = called('PUT /auth/v1/user');
  assert.deepEqual([update.authorization, update.body], ['Bearer access-3', { password: 'new-password-1' }]);

  calls.length = 0;
  const weak = await post('reset', { email: 'ana@example.com', code: '123456', password: 'weakweak1', confirm: 'weakweak1' });
  assert.equal(weak.status, 422);
  assert.ok((await weak.json()).errors.password);
  assert.equal(weak.headers.getSetCookie().length, 0, 'no half-finished session');
  assert.equal(called('POST /auth/v1/logout?scope=local').length, 1);
});

test('sign-out ends the Supabase session and clears both cookies', async () => {
  const response = await post('sign-out', {}, { cookie: 'showlio_access=access-1; showlio_refresh=p.refresh-1' });
  assert.equal(response.status, 200);
  assert.equal(called('POST /auth/v1/logout?scope=local')[0].authorization, 'Bearer access-1');
  assert.match(cookie(response, 'showlio_access'), /^showlio_access=deleted;.*path=\/api;/);
  assert.match(cookie(response, 'showlio_refresh'), /^showlio_refresh=deleted;.*path=\/api;/);
});

const signedIn = { Cookie: `showlio_access=${ACCESS_JWT}`, 'Content-Type': 'application/json' };
const profileApi = (method, body, path = 'profile', headers = signedIn) => fetch(`${origin}/api/${path}`, { method, headers, body: body && JSON.stringify(body) });
const avatarUrl = (path) => `http://127.0.0.1:${fake.address().port}/storage/v1/object/public/avatars/${path}`;

test('loading the profile is one call as the creator and returns the real profile', async () => {
  assert.equal((await fetch(`${origin}/api/profile`)).status, 401);
  const response = await profileApi('GET');
  assert.equal(response.status, 200);
  const { avatarPath, ...profile } = account().profile;
  assert.deepEqual(await response.json(), { profile: { ...profile, avatar: avatarUrl(avatarPath) }, preferences: account().preferences });
  assert.equal(calls.length, 1, 'no separate session check');
  assert.deepEqual([calls[0].route, calls[0].apikey, calls[0].authorization], ['POST /rest/v1/rpc/my_profile', PUBLISHABLE, `Bearer ${ACCESS_JWT}`], 'RLS as the creator, never the secret key');
});

test('an expired access token is refreshed before the profile call', async () => {
  const response = await profileApi('GET', undefined, 'profile', { Cookie: `showlio_access=${EXPIRED_JWT}; showlio_refresh=p.refresh-1` });
  assert.equal(response.status, 200);
  assert.match(cookie(response, 'showlio_access'), /^showlio_access=access-2;/);
  assert.deepEqual(calls.map((call) => call.route), ['POST /auth/v1/token?grant_type=refresh_token', 'POST /rest/v1/rpc/my_profile']);
  assert.equal((await profileApi('GET', undefined, 'profile', { Cookie: `showlio_access=${EXPIRED_JWT}` })).status, 401);
});

test('saving validates, uploads the photo, saves in one call and removes the old photo', async () => {
  const draft = { name: '  Ana  Cruz ', headline: 'Motion designer', bio: 'Hi!\nI animate.', location: 'Cebu', availability: 'showcasing', visible: true, skills: ['PHP', 'php', ' Figma '], links: { website: 'https://ana.dev', instagram: '', youtube: 'https://youtube.com/@ana' }, avatar: PNG };
  const invalid = await profileApi('PUT', { ...draft, name: ' ', links: { website: 'http://ana.dev' }, avatar: 'data:image/png;base64,AAAA', availability: 'busy' });
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys((await invalid.json()).errors).sort(), ['availability', 'avatar', 'links', 'name']);
  assert.equal(calls.length, 0);

  const response = await profileApi('PUT', draft);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.avatar, avatarUrl('u1/now.webp'));
  assert.equal(calls.length, 3);
  const [upload, save, cleanup] = calls;
  assert.match(upload.route, /^POST \/storage\/v1\/object\/avatars\/u1\/[0-9a-f]{24}\.png$/);
  assert.deepEqual([upload.type, upload.authorization], ['image/png', `Bearer ${ACCESS_JWT}`]);
  assert.equal(save.route, 'POST /rest/v1/rpc/save_my_profile');
  assert.deepEqual(save.body.profile, { name: 'Ana Cruz', headline: 'Motion designer', bio: 'Hi!\nI animate.', location: 'Cebu', availability: 'showcasing', visible: true, skills: ['PHP', 'Figma'], links: { website: 'https://ana.dev', instagram: '', youtube: 'https://youtube.com/@ana' }, avatarPath: upload.route.slice(32) });
  assert.equal(cleanup.route, 'DELETE /storage/v1/object/avatars/u1/old.png', 'the replaced photo is removed');

  calls.length = 0;
  assert.equal((await profileApi('PUT', { ...draft, avatar: undefined })).status, 200);
  assert.equal(calls.length, 1, 'without a new photo a save is a single call');
  assert.equal('avatarPath' in calls[0].body.profile, false);
});

test('a rate-limited save reports the wait and deletes the photo it just uploaded', async () => {
  const response = await profileApi('PUT', { name: 'Ana', headline: 'too fast', availability: 'available', skills: [], links: {}, avatar: PNG });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /Try again in 2 minutes/);
  const [upload, , cleanup] = calls;
  assert.equal(cleanup.route, upload.route.replace('POST', 'DELETE'));
});

test('settings switches are one call and reject anything else', async () => {
  const response = await profileApi('PATCH', { messageNotifications: true, communityDiscovery: false }, 'profile/preferences');
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => [call.route, call.body]), [['POST /rest/v1/rpc/set_my_preferences', { changes: { messageNotifications: true, communityDiscovery: false } }]]);
  assert.equal((await profileApi('PATCH', { visibility: 'public' }, 'profile/preferences')).status, 422);
  assert.equal((await profileApi('PATCH', { productNotifications: 'yes' }, 'profile/preferences')).status, 422);
  assert.equal((await profileApi('PATCH', {}, 'profile/preferences')).status, 422);
});

const signedUrl = (path) => `http://127.0.0.1:${fake.address().port}/storage/v1/object/sign/project-media/${path}?token=signed`;

test('the feed is one database call plus one signing call, mapped to workspace cards with galleries', async () => {
  const response = await profileApi('GET', undefined, 'feed');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(calls.map((call) => [call.route, call.authorization]), [['POST /rest/v1/rpc/workspace_feed', `Bearer ${ACCESS_JWT}`], ['POST /storage/v1/object/sign/project-media', `Bearer ${ACCESS_JWT}`]]);
  assert.deepEqual(calls[1].body, { expiresIn: 43200, paths: [`u1/${OWN_PROJECT}/cover.webp`, `u1/${OWN_PROJECT}/detail.webp`] });
  const [own, other] = data.projects;
  const photos = [signedUrl(`u1/${OWN_PROJECT}/cover.webp`), signedUrl(`u1/${OWN_PROJECT}/detail.webp`)];
  assert.deepEqual(own, { id: OWN_PROJECT, title: 'My Reel', description: 'Edit of the year.', image: photos[0], images: photos, categories: ['Video'], tools: ['Premiere'], creator: 'u1', owner: true, views: 9, likes: 2, comments: 0, saves: 0, created: Date.parse('2026-10-30T12:00:00Z'), duration: '', draft: false, real: true });
  assert.deepEqual([other.owner, other.image, other.images, other.categories, other.likes], [false, '/assets/images/workspace-content.webp', [], ['Other'], 4], 'the viewer\'s own like is added back by the card');
  assert.deepEqual(data.creators, [{ id: OTHER_CREATOR, name: 'Bo Lim', role: '@bo', username: 'bo', bio: 'Automations.', avatar: '', followers: 7, hue: 270, real: true }]);
  assert.deepEqual([data.likes, data.following], [[OTHER_PROJECT], [OTHER_CREATOR]]);
});

test('posting validates the details and publishes them in one call', async () => {
  const invalid = await profileApi('POST', { title: ' ', description: 'x'.repeat(301), category: 'Bogus', tools: ['ok', 'x'.repeat(41)] }, 'projects');
  assert.equal(invalid.status, 422);
  assert.deepEqual(Object.keys((await invalid.json()).errors).sort(), ['category', 'description', 'title', 'tools']);
  assert.equal(calls.length, 0);

  const response = await profileApi('POST', { title: ' Neon  Poster ', description: 'A gig poster.', category: 'Design', tools: ['Figma', 'figma', 'Procreate'] }, 'projects');
  assert.equal(response.status, 201);
  const { project } = await response.json();
  assert.deepEqual([project.id, project.title, project.owner, project.real, project.categories, project.tools, project.images, project.likes], [NEW_PROJECT, 'Neon Poster', true, true, ['Design'], ['Figma', 'Procreate'], [], 0]);
  assert.deepEqual(calls.map((call) => [call.route, call.body]), [['POST /rest/v1/rpc/create_my_project', { project: { title: 'Neon Poster', summary: 'A gig poster.', categories: ['Design'], tools: ['Figma', 'Procreate'] } }]]);

  calls.length = 0;
  const shared = await profileApi('POST', { title: 'Shared', description: 'For everyone.', category: 'Design', makePublic: true }, 'projects');
  assert.equal((await shared.json()).profilePublic, true);
  assert.deepEqual(calls.map((call) => [call.route, call.body, call.authorization]).slice(1), [['PATCH /rest/v1/profiles?id=eq.u1', { visibility: 'public' }, `Bearer ${ACCESS_JWT}`]], 'a private profile goes public only when asked, as the creator');
});

test('each photo uploads into the project folder and is recorded at its position', async () => {
  const response = await profileApi('POST', { project: NEW_PROJECT, image: PNG, position: 2 }, 'projects/media');
  assert.equal(response.status, 201);
  const [upload, media] = calls;
  assert.match(upload.route, new RegExp(`^POST /storage/v1/object/project-media/u1/${NEW_PROJECT}/[0-9a-f]{24}\\.png$`));
  assert.deepEqual([upload.type, upload.authorization], ['image/png', `Bearer ${ACCESS_JWT}`]);
  const path = upload.route.replace('POST /storage/v1/object/project-media/', '');
  assert.deepEqual(media.body, { project_id: NEW_PROJECT, storage_path: path, alt_text: '', width: 1, height: 1, sort_order: 2 });
  assert.deepEqual(await response.json(), { path });

  for (const [body, field] of [[{ project: NEW_PROJECT, image: 'data:image/gif;base64,R0lGOD', position: 0 }, 'image'], [{ project: NEW_PROJECT, image: PNG, position: 10 }, 'position'], [{ project: 'nope', image: PNG, position: 0 }, 'id']]) {
    const rejected = await profileApi('POST', body, 'projects/media');
    assert.equal(rejected.status, 422, field);
    assert.ok((await rejected.json()).errors[field], field);
  }
});

test('a photo the database refuses is removed from storage again', async () => {
  const response = await profileApi('POST', { project: NEW_PROJECT, image: PNG, position: 7 }, 'projects/media');
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /Limit reached/);
  const [upload, , cleanup] = calls;
  assert.deepEqual([cleanup.route, cleanup.body], ['DELETE /storage/v1/object/project-media', { prefixes: [upload.route.replace('POST /storage/v1/object/project-media/', '')] }]);
});

test('deleting a project removes it and its photos; unknown or malformed ids are refused', async () => {
  const response = await profileApi('DELETE', undefined, `projects?id=${OWN_PROJECT}`);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => [call.route, call.body]), [
    ['POST /rest/v1/rpc/delete_my_project', { project: OWN_PROJECT }],
    ['DELETE /storage/v1/object/project-media', { prefixes: [`u1/${OWN_PROJECT}/cover.webp`] }],
  ]);
  assert.equal((await profileApi('DELETE', undefined, `projects?id=${OTHER_PROJECT}`)).status, 404);
  assert.equal((await profileApi('DELETE', undefined, 'projects?id=../../etc')).status, 422);
});

test('likes, saves, follows and views are one call each', async () => {
  for (const [path, argument, id, reply] of [
    ['projects/like', 'project', OTHER_PROJECT, { liked: true, likes: 6 }],
    ['projects/save', 'project', OTHER_PROJECT, { saved: true, saves: 2 }],
    ['creators/follow', 'creator', OTHER_CREATOR, { following: true, followers: 8 }],
  ]) {
    calls.length = 0;
    const response = await profileApi('POST', { id }, path);
    assert.deepEqual([response.status, await response.json()], [200, reply], path);
    assert.deepEqual(calls.map((call) => call.body), [{ [argument]: id }], path);
  }
  const draft = await profileApi('POST', { id: DRAFT_PROJECT }, 'projects/like');
  assert.deepEqual([draft.status, (await draft.json()).error], [403, 'That isn’t available any more. Refresh and try again.']);
  assert.equal((await profileApi('POST', { id: OTHER_PROJECT }, 'projects/view')).status, 200);
  assert.equal((await profileApi('POST', { id: 42 }, 'projects/like')).status, 422);
  assert.equal((await fetch(`${origin}/api/projects/like`, { method: 'POST', headers: { Cookie: signedIn.Cookie }, body: '{}' })).status, 415);
  assert.equal((await fetch(`${origin}/api/feed`)).status, 401);
});

test('code emails that cannot be sent are not counted, and unknown emails get the usual answer', async () => {
  const bounced = await post('forgot', { email: 'bounce@example.com' });
  assert.deepEqual([bounced.status, (await bounced.json()).error], [502, 'We couldn’t send the code email just now. Try again in a moment.']);
  const [counted] = called('POST /rest/v1/rpc/auth_attempt');
  assert.deepEqual(called('POST /rest/v1/rpc/auth_refund')[0].body, { keys: counted.body.keys });

  calls.length = 0;
  const unknown = await post('forgot', { email: 'nobody@example.com' });
  assert.deepEqual([unknown.status, await unknown.json()], [200, { sent: true }], 'no hint that the account doesn’t exist');
  assert.equal(smtp.messages.length, 0);
  assert.equal(called('POST /rest/v1/rpc/auth_refund').length, 1);

  calls.length = 0;
  assert.equal((await post('forgot', { email: 'ana@example.com' })).status, 200);
  assert.equal(called('POST /rest/v1/rpc/auth_refund').length, 0, 'sent emails keep counting');
  calls.length = 0;
  await post('sign-up', { name: 'Ana Cruz', username: 'taken', email: 'ana@example.com', password: 'correct-horse', confirm: 'correct-horse', terms: true });
  assert.equal(called('POST /rest/v1/rpc/auth_refund').length, 1, 'a taken username sends no email either');
});

test('each tab keeps its own account: sign-ins get new sessions and ended ones are never reused', async () => {
  const tabA = 'showlio_access=access-2; showlio_refresh=p.refresh-2';
  const signIn = await post('sign-in', { email: 'ana@example.com', password: 'correct-horse', remember: true }, { cookie: tabA, slot: 'main' });
  const id = signIn.headers.get('x-showlio-slot');
  assert.match(id, /^[a-z0-9]{8}$/, 'a sign-in always gets a fresh session, even from a tab that had one');
  assert.match(cookie(signIn, `showlio_access_${id}`), new RegExp(`^showlio_access_${id}=access-1;`));
  assert.equal(cookie(signIn, 'showlio_access'), '', 'the other tab keeps its account');

  const both = `${tabA}; showlio_access_${id}=access-1; showlio_refresh_${id}=p.refresh-1`;
  for (const [slot, token] of [['main', 'access-2'], [id, 'access-1']]) {
    calls.length = 0;
    const response = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: both, 'X-Showlio-Slot': slot } });
    assert.equal(response.status, 200);
    assert.equal(called('GET /auth/v1/user')[0].authorization, `Bearer ${token}`, `${slot} uses its own account`);
  }

  const out = await post('sign-out', {}, { cookie: both, slot: id });
  assert.match(cookie(out, `showlio_access_${id}`), new RegExp(`^showlio_access_${id}=deleted;`));
  assert.equal(cookie(out, 'showlio_access'), '', 'signing out one session leaves the other signed in');

  const ended = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: tabA, 'X-Showlio-Slot': id } });
  assert.equal(ended.status, 401, 'a tab whose session ended goes back to sign-in instead of switching to another account');

  const fresh = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: `showlio_access_${id}=access-1` } });
  assert.equal(fresh.headers.get('x-showlio-slot'), id, 'a new tab is pinned to a session this browser holds');
  assert.equal((await fetch(`${origin}/api/auth/session`, { headers: { Cookie: tabA, 'X-Showlio-Slot': '../../x' } })).headers.get('x-showlio-slot'), 'main', 'a malformed id is ignored');
});

test('comments: listed with their authors, added and deleted, one call each', async () => {
  const list = await profileApi('GET', undefined, `projects/comments?project=${OTHER_PROJECT}`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).comments, [{ id: 'c0000000-0000-4000-8000-000000000001', body: 'Love it!', created: Date.parse('2026-10-31T01:00:00Z'), author: OTHER_CREATOR, username: 'bo', name: 'Bo Lim', avatar: `http://127.0.0.1:${fake.address().port}/storage/v1/object/public/avatars/${OTHER_CREATOR}/me.webp`, mine: false, canDelete: true }]);
  assert.deepEqual(calls.map((call) => [call.route, call.body, call.authorization]), [['POST /rest/v1/rpc/project_comments_list', { project: OTHER_PROJECT }, `Bearer ${ACCESS_JWT}`]]);

  calls.length = 0;
  const added = await profileApi('POST', { project: OTHER_PROJECT, body: '  Great work!\r\nShipping soon?  ' }, 'projects/comments');
  assert.equal(added.status, 201);
  assert.deepEqual([(await added.json()).comment.body, calls[0].body], ['Great work!\nShipping soon?', { project: OTHER_PROJECT, body: 'Great work!\nShipping soon?' }]);
  assert.equal((await profileApi('POST', { project: OTHER_PROJECT, body: '   ' }, 'projects/comments')).status, 422);
  assert.equal((await profileApi('POST', { project: OTHER_PROJECT, body: 'x'.repeat(1001) }, 'projects/comments')).status, 422);

  assert.equal((await profileApi('DELETE', undefined, 'projects/comments?id=c0000000-0000-4000-8000-000000000001')).status, 200);
  assert.equal((await profileApi('DELETE', undefined, `projects/comments?id=${NEW_PROJECT}`)).status, 404);
  assert.equal((await fetch(`${origin}/api/projects/comments?project=${OTHER_PROJECT}`)).status, 401);
});

test('notifications: real items with who did what, marked read or saved, deleted', async () => {
  const NOTE = 'd0000000-0000-4000-8000-000000000001';
  const list = await profileApi('GET', undefined, 'notifications');
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { followers: 3, notifications: [{ id: NOTE, type: 'comment', title: '', body: 'Nice!', created: Date.parse('2026-10-31T02:00:00Z'), unread: true, saved: false, actor: { id: OTHER_CREATOR, username: 'bo', name: 'Bo Lim', role: '@bo', avatar: '', hue: 270 }, project: { id: OWN_PROJECT, title: 'My Reel' } }] });

  calls.length = 0;
  assert.equal((await profileApi('PATCH', { all: true }, 'notifications')).status, 200);
  assert.equal(calls[0].route, 'PATCH /rest/v1/notifications?recipient_id=eq.u1&read_at=is.null');
  assert.match(calls[0].body.read_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

  for (const [change, body] of [[{ read: false }, { read_at: null }], [{ saved: true }, { is_saved: true }]]) {
    calls.length = 0;
    assert.equal((await profileApi('PATCH', { id: NOTE, ...change }, 'notifications')).status, 200);
    assert.deepEqual([calls[0].route, calls[0].body, calls[0].authorization], [`PATCH /rest/v1/notifications?id=eq.${NOTE}`, body, `Bearer ${ACCESS_JWT}`]);
  }
  assert.equal((await profileApi('PATCH', { id: NOTE }, 'notifications')).status, 422);
  assert.equal((await profileApi('PATCH', { id: 'nope', read: true }, 'notifications')).status, 422);
  assert.equal((await profileApi('DELETE', undefined, `notifications?id=${NOTE}`)).status, 200);
  assert.equal((await fetch(`${origin}/api/notifications`)).status, 401);
});

test('portfolio: anyone can open a public creator page with signed photos; unknown or private ones are missing', async () => {
  calls.length = 0;
  const response = await fetch(`${origin}/api/portfolio?u=Bo_Lim`);
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.deepEqual(page.profile, { id: OTHER_CREATOR, username: 'bo_lim', name: 'Bo Lim', headline: 'Colorist', bio: 'I grade films.', location: 'Cebu', availability: '', avatar: '', hue: 270, visible: true, own: false, joined: Date.parse('2026-10-01T00:00:00Z') });
  assert.deepEqual([page.skills, page.links, page.followers], [['DaVinci Resolve'], [{ kind: 'website', url: 'https://bo.example.com' }], 4]);
  assert.deepEqual(page.projects, [{ id: OTHER_PROJECT, title: 'Bot', description: 'Sorts mail.', categories: ['Other'], tools: ['Python'], images: [`http://127.0.0.1:${fake.address().port}/storage/v1/object/sign/project-media/${OTHER_CREATOR}/${OTHER_PROJECT}/a.webp?token=signed`], likes: 5, views: 40, comments: 2, created: Date.parse('2026-10-29T08:00:00Z') }]);
  assert.deepEqual(calls.filter((call) => call.route.includes('creator_portfolio')).map((call) => [call.body, call.authorization]), [[{ handle: 'bo_lim' }, undefined]], 'a guest asks as anon');

  calls.length = 0;
  assert.equal((await profileApi('GET', undefined, 'portfolio?u=bo_lim')).status, 200);
  assert.equal(calls.find((call) => call.route.includes('creator_portfolio')).authorization, `Bearer ${ACCESS_JWT}`, 'a signed-in creator asks as themselves');

  for (const handle of ['nobody', 'x', '../etc', '']) {
    const missing = await fetch(`${origin}/api/portfolio?u=${encodeURIComponent(handle)}`);
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /isn’t public/);
  }
});
