import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderGoogleButton, bindGoogleButton } from '../public/assets/js/auth-google.js';

test('Google entry is a separate accessible button that cannot submit credentials', () => {
  const html = renderGoogleButton();
  assert.match(html, /type="button"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /aria-describedby="auth-google-note"/);
  assert.match(html, /id="auth-google-note"/);
  assert.match(html, /not connected/i);
  assert.doesNotMatch(html, /<input|accounts\.google|onclick=/);
});

test('unconfigured Google clicks explain availability without authenticating or navigating', () => {
  const handlers = new Map();
  const notices = [];
  const button = { addEventListener: (event, handler) => handlers.set(event, handler) };
  bindGoogleButton({ querySelector: () => button }, message => notices.push(message));
  const event = { preventDefault() { this.prevented = true; } };
  handlers.get('click')(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(notices, ['Google sign-in is not connected yet. No Google account has been signed in.']);
  assert.equal(handlers.size, 1);
});
