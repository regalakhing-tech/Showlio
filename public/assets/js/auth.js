// Sign-in flow. Each step posts to the PHP API (/api/auth/*), which validates,
// rate-limits and talks to Supabase Auth, then keeps the session in HttpOnly
// cookies. This tab only keeps the entered name and email so later steps can use them.
import { checkSignIn, checkSignUp, cleanUsername } from './auth-model.js';
import { renderGoogleButton, bindGoogleButton } from './auth-google.js';
import { slotHeaders, rememberSlot } from './session-slot.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const EASE = 'cubic-bezier(.16,1,.3,1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Pasting needs the async clipboard API (every current browser has it; it asks or checks permission).
const canPaste = () => Boolean(navigator.clipboard?.readText);
// The first 6 digits on the clipboard, '' if there are none, or null if the browser refused.
const readCopiedCode = () => navigator.clipboard.readText().then((text) => (text.match(/\d{6}/)?.[0] ?? ''), () => null);
const icon = (name) => `<svg class="auth-icon" aria-hidden="true"><use href="/assets/workspace-icons.svg#${name}"/></svg>`;

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem('showlio-demo-auth') ?? '{}'); } catch { return {}; } },
  set(value) { try { sessionStorage.setItem('showlio-demo-auth', JSON.stringify({ ...store.get(), ...value })); } catch { /* Private mode: the flow still works. */ } },
  remembered() { try { return localStorage.getItem('showlio-demo-email') ?? ''; } catch { return ''; } },
  remember(email) { try { email ? localStorage.setItem('showlio-demo-email', email) : localStorage.removeItem('showlio-demo-email'); } catch { /* Ignore. */ } },
};

// The button in our emails links here with the email and code. Fill them in (the person still
// presses the button, so link scanners that open emails can't use the code), then drop them
// from the address bar and history.
const linkParams = new URLSearchParams(location.search);
let linkedCode = (linkParams.get('code') ?? '').replace(/\D/g, '').slice(0, 6);
const linkedEmail = (linkParams.get('email') ?? '').trim().replace(/ /g, '+'); // A raw "+" in a query string arrives as a space.
if (linkedEmail) store.set({ email: linkedEmail });
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

// Left-hand story for each step.
const story = {
  'sign-in': ['Show your work.', 'Build your portfolio.', 'A modern platform for developers, AI builders, video creators and digital artists to showcase projects, share skills and grow their career.', 'devflow', 'Sign in'],
  create: ['Build your profile.', 'Start your journey.', 'A modern platform for developers, AI builders, video creators and digital artists to showcase projects, share skills and grow their career.', 'bars', 'Create your account'],
  verify: ['Verify your email.', 'Complete your account.', 'Verify your account to keep building your portfolio on Showlio.', 'devflow', 'Verify your email'],
  ready: ['You’re all set.', 'Build your portfolio.', 'Join the Showlio community to showcase projects, share skills and grow your creative career.', 'growth', 'Your account is ready'],
  forgot: ['Forgot your password?', 'We’ll get you back in.', 'Enter the email you use for Showlio and we’ll send you a code to choose a new password.', 'devflow', 'Reset your password'],
  reset: ['Choose a new password.', 'Get back to your work.', 'Use the 6-digit code from your email to set a new password for your Showlio account.', 'devflow', 'Choose a new password'],
};

const field = ({ name, label, type = 'text', symbol, placeholder, autocomplete, value = '', toggle = false, hint = '', attrs = '' }) => `<div class="auth-field auth-reveal"><label for="f-${name}">${label}</label><span class="auth-input">${icon(symbol)}<input id="f-${name}" name="${name}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" value="${esc(value)}" aria-describedby="${name}-note"${type === 'email' ? ' inputmode="email" spellcheck="false"' : ''}${attrs}>${toggle ? `<button class="auth-eye" type="button" data-toggle="f-${name}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>` : ''}</span><small class="auth-note" id="${name}-note" data-hint="${esc(hint)}">${esc(hint)}</small></div>`;
const divider = '<div class="auth-divider auth-reveal"><span>or</span></div>';
const submit = (label) => `<button class="auth-button auth-reveal" type="submit"><span>${label}</span>${icon('arrow')}</button>`;

const views = {
  'sign-in': () => `<h2 id="auth-card-title" class="auth-reveal">Welcome back</h2><p class="auth-sub auth-reveal">Sign in to your Showlio account.</p>${renderGoogleButton()}${divider}<form id="auth-form" novalidate>${field({ name: 'email', label: 'Email', type: 'email', symbol: 'mail', placeholder: 'you@yourdomain.com', autocomplete: 'email', value: store.remembered() || store.get().email || '' })}${field({ name: 'password', label: 'Password', type: 'password', symbol: 'lock', placeholder: 'Enter your password', autocomplete: 'current-password', toggle: true })}<div class="auth-row auth-reveal"><label class="auth-check"><input type="checkbox" name="remember" ${store.remembered() || !store.get().email ? 'checked' : ''}><span>${icon('check')}</span>Remember me</label><button class="auth-link" type="button" data-forgot>Forgot password?</button></div>${submit('Sign in')}</form><p class="auth-switch auth-reveal">Don’t have an account? <a href="#create">Create account</a></p>`,
  create: () => { const saved = store.get(); return `<h2 id="auth-card-title" class="auth-reveal">Create your account</h2><p class="auth-sub auth-reveal">Join Showlio and start building your portfolio today.</p>${renderGoogleButton()}${divider}<form id="auth-form" novalidate><div class="auth-pair">${field({ name: 'name', label: 'Full name', symbol: 'user', placeholder: 'John Doe', autocomplete: 'name', value: saved.name ?? '' })}${field({ name: 'username', label: 'Username', symbol: 'at', placeholder: 'johndoe', autocomplete: 'username', value: saved.username ?? '' })}</div>${field({ name: 'email', label: 'Email address', type: 'email', symbol: 'mail', placeholder: 'you@yourdomain.com', autocomplete: 'email', value: saved.email ?? '' })}${field({ name: 'password', label: 'Password', type: 'password', symbol: 'lock', placeholder: 'Create a password', autocomplete: 'new-password', toggle: true, hint: 'At least 8 characters' })}<div class="auth-meter auth-reveal" aria-hidden="true"><i></i><i></i><i></i><i></i></div>${field({ name: 'confirm', label: 'Confirm password', type: 'password', symbol: 'lock', placeholder: 'Confirm your password', autocomplete: 'new-password', toggle: true })}<label class="auth-check auth-terms auth-reveal"><input type="checkbox" name="terms" aria-describedby="terms-note"><span>${icon('check')}</span><span>I agree to the <button class="auth-link" type="button" data-doc="terms">Terms &amp; Conditions</button> and <button class="auth-link" type="button" data-doc="privacy">Privacy Policy</button>.</span></label><small class="auth-note auth-terms-note" id="terms-note" data-hint=""></small>${submit('Create account')}</form><p class="auth-switch auth-reveal">Already have an account? <a href="#sign-in">Sign in</a></p>`; },
  verify: () => `<h2 id="auth-card-title" class="auth-reveal">Verify your email</h2><p class="auth-sub auth-reveal">We’ve sent a 6-digit verification code to <strong>${esc(store.get().email || 'you@yourdomain.com')}</strong>.</p><form id="auth-form" novalidate><fieldset class="auth-otp auth-reveal"><legend class="auth-sr">Verification code</legend>${[1, 2, 3, 4, 5, 6].map((n) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" ${n === 1 ? 'name="code" autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${n} of 6" aria-describedby="otp-note">`).join('')}</fieldset><small class="auth-note auth-otp-note" id="otp-note" data-hint="Check your spam folder if it hasn’t arrived.">Check your spam folder if it hasn’t arrived.</small>${canPaste() ? `<button class="auth-paste auth-reveal" type="button" data-paste>${icon('document')}Paste code</button>` : ''}${submit('Verify code')}</form><p class="auth-switch auth-reveal">Didn’t receive the code? <button class="auth-link" type="button" data-resend>Resend code</button></p>${divider}<p class="auth-center auth-reveal"><a class="auth-link" href="#create" data-change-email>Change email address</a></p>`,
  ready: () => { const saved = store.get(); const rows = [['mail', 'Email verified', `${saved.email || 'you@yourdomain.com'} is confirmed`], ['shield-check', 'Signed in', 'Your session is kept secure on this device'], ['user', 'Profile setup next', 'Create your profile to showcase your work']]; return `<div class="auth-success auth-reveal" aria-hidden="true"><span class="auth-rays">${Array.from({ length: 8 }, (_, i) => `<i style="--r:${i * 45}deg"></i>`).join('')}</span><span class="auth-badge"><svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.6 3.6 7.4-8"/></svg></span></div><h2 id="auth-card-title" class="auth-reveal auth-center">Your account is ready</h2><p class="auth-sub auth-center auth-reveal">Your email has been verified and your Showlio account is ready to go. Let’s build something great!</p><ul class="auth-checklist">${rows.map(([symbol, title, text], index) => `<li class="auth-reveal" style="--d:${index}"><span class="auth-row-icon">${icon(symbol)}</span><span><strong>${esc(title)}</strong><small>${esc(text)}</small></span><b>${icon('check')}</b></li>`).join('')}</ul><a class="auth-button auth-reveal" href="/app/#settings" data-enter><span>Create my profile</span>${icon('arrow')}</a><a class="auth-button auth-button-outline auth-reveal" href="/app/#explore" data-enter><span>Explore creators</span></a><p class="auth-fine auth-reveal">By continuing, you agree to our <button class="auth-link" type="button" data-doc="terms">Terms of Service</button> and <button class="auth-link" type="button" data-doc="privacy">Privacy Policy</button>.</p>`; },
  forgot: () => `<h2 id="auth-card-title" class="auth-reveal">Reset your password</h2><p class="auth-sub auth-reveal">Enter your account email and we’ll send you a 6-digit code.</p><form id="auth-form" novalidate>${field({ name: 'email', label: 'Email', type: 'email', symbol: 'mail', placeholder: 'you@yourdomain.com', autocomplete: 'email', value: store.get().email || store.remembered() })}${submit('Send code')}</form><p class="auth-switch auth-reveal">Remembered it? <a href="#sign-in">Back to sign in</a></p>`,
  reset: () => `<h2 id="auth-card-title" class="auth-reveal">Choose a new password</h2><p class="auth-sub auth-reveal">Enter the code we sent to <strong>${esc(store.get().email || 'your email')}</strong> and your new password.</p><form id="auth-form" novalidate>${field({ name: 'code', label: 'Code from your email', symbol: 'shield-check', placeholder: '123456', autocomplete: 'one-time-code', attrs: ' inputmode="numeric" maxlength="6"' })}${field({ name: 'password', label: 'New password', type: 'password', symbol: 'lock', placeholder: 'Create a password', autocomplete: 'new-password', toggle: true, hint: 'At least 8 characters' })}${field({ name: 'confirm', label: 'Confirm password', type: 'password', symbol: 'lock', placeholder: 'Confirm your password', autocomplete: 'new-password', toggle: true })}${submit('Reset password')}</form><p class="auth-switch auth-reveal">No code? <a href="#forgot">Send a new one</a></p>`,
};

const docs = {
  terms: ['Terms of Service', 'Showlio is in early access. Your account is real, but the workspace still shows sample profiles and projects, and nothing you add there is published yet. The full terms will be available before public launch.'],
  privacy: ['Privacy Policy', 'Showlio uses Supabase Auth to keep your account. Your password is stored only as a secure hash, and your session is kept in a cookie that page scripts cannot read. The full privacy policy will be available before public launch.'],
};

const view = $('#auth-view');
const card = $('#auth-card');
let step = '';
let toastTimer;
function toast(message) {
  const element = $('#auth-toast');
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3600);
}
function setNote(input, message) {
  const note = $(`#${input.getAttribute('aria-describedby')}`);
  input.toggleAttribute('aria-invalid', Boolean(message));
  input.closest('.auth-input, .auth-otp, .auth-check')?.classList.toggle('is-invalid', Boolean(message));
  if (note) { note.textContent = message || note.dataset.hint; note.classList.toggle('is-error', Boolean(message)); }
}
function showErrors(form, errors) {
  let first;
  for (const element of form.elements) {
    if (!element.name) continue;
    setNote(element, errors[element.name] ?? '');
    if (errors[element.name] && !first) first = element;
  }
  if (first) {
    first.focus();
    if (!reduced()) first.closest('.auth-field, .auth-check')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
  }
  return !first;
}
// Returns a function that puts the button back.
function busy(button, label) {
  const text = button.querySelector('span');
  const idle = text.textContent;
  button.disabled = true;
  button.classList.add('is-loading');
  text.textContent = label;
  return () => { button.disabled = false; button.classList.remove('is-loading'); text.textContent = idle; };
}
async function post(path, body) {
  try {
    const response = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...slotHeaders() }, body: JSON.stringify(body) });
    rememberSlot(response);
    return { ok: response.ok, data: await response.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'Can’t reach Showlio. Check your connection and try again.' } };
  }
}
// Posts a form step. On failure, shows the server's field errors (or a toast) and frees the button.
async function send(form, path, body, label) {
  const restore = busy(form.querySelector('[type="submit"]'), label);
  const reply = await post(path, body);
  if (reply.ok) return reply;
  restore();
  const errors = reply.data.errors ?? {};
  if (Object.keys(errors).some((name) => form.elements[name])) showErrors(form, errors);
  else toast(Object.values(errors)[0] ?? reply.data.error ?? 'Something went wrong. Try again in a moment.');
  return reply;
}
function enterWorkspace(href) {
  document.body.classList.add('is-leaving');
  setTimeout(() => { location.href = href; }, reduced() ? 0 : 320);
}

function setStory(next, animate) {
  const [first, second, lede, side, title] = story[next];
  const lines = $$('#auth-title .auth-line > span');
  const changed = lines[0].textContent !== first || lines[1].textContent !== second;
  lines[0].textContent = first;
  lines[1].textContent = second;
  $('#auth-lede').textContent = lede;
  document.title = `${title} — Showlio`;
  $$('.sc-side-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.side === side));
  if (animate && changed && !reduced()) {
    lines.forEach((line, index) => line.animate([{ transform: 'translateY(105%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: index * 90, easing: EASE, fill: 'backwards' }));
    $('#auth-lede').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 200, easing: EASE, fill: 'backwards' });
  }
}

function go(next, { focus = true } = {}) {
  if (!views[next]) next = 'sign-in';
  if (next === step) return;
  const first = !step;
  const from = card.getBoundingClientRect().height;
  step = next;
  document.body.dataset.step = next;
  view.innerHTML = views[next]();
  bind(next);
  setStory(next, !first);
  if (!reduced()) {
    const to = card.getBoundingClientRect().height;
    if (!first && Math.abs(to - from) > 2) card.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 520, easing: EASE });
    $$('.auth-reveal', view).forEach((element, index) => element.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: (first ? 380 : 80) + Math.min(index, 12) * 40, easing: EASE, fill: 'backwards' }));
  }
  // Move screen readers and keyboards to the new step's heading.
  const heading = $('#auth-card-title');
  if (focus && !first && heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

function bind(current) {
  const form = $('#auth-form');
  bindGoogleButton(view, toast);
  $$('[data-toggle]', view).forEach((button) => button.addEventListener('click', () => {
    const input = $(`#${button.dataset.toggle}`);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    button.querySelector('use').setAttribute('href', `/assets/workspace-icons.svg#${show ? 'eye-off' : 'eye'}`);
  }));
  $$('[data-doc]', view).forEach((button) => button.addEventListener('click', () => {
    const [title, text] = docs[button.dataset.doc];
    $('#auth-dialog-title').textContent = title;
    $('#auth-dialog-text').textContent = text;
    $('#auth-dialog').showModal();
  }));
  $('[data-forgot]', view)?.addEventListener('click', () => {
    const email = form.elements.email.value.trim();
    if (email) store.set({ email });
    location.hash = 'forgot';
  });
  $$('[data-enter]', view).forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); enterWorkspace(link.getAttribute('href')); }));
  // Clear an error as soon as the person fixes the field.
  form?.addEventListener('input', (event) => { if (event.target.hasAttribute('aria-invalid')) setNote(event.target, ''); });

  if (current === 'sign-in') form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!showErrors(form, checkSignIn(data))) return;
    store.remember(data.remember ? data.email.trim() : '');
    store.set({ email: data.email.trim(), via: 'email' });
    const reply = await send(form, 'sign-in', { email: data.email, password: data.password, remember: Boolean(data.remember) }, 'Signing in…');
    if (reply.data.code === 'email_not_confirmed') location.hash = 'verify';
    if (reply.ok) enterWorkspace('/app/#explore');
  });

  if (current === 'create') {
    const username = form.elements.username;
    username.addEventListener('input', () => { const clean = cleanUsername(username.value); if (clean !== username.value) username.value = clean; });
    const meter = $('.auth-meter', view);
    form.elements.password.addEventListener('input', (event) => {
      const value = event.target.value;
      const score = [value.length >= 8, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value) || value.length >= 14].filter(Boolean).length;
      meter.dataset.score = value ? String(score) : '0';
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!showErrors(form, checkSignUp(data))) return;
      store.set({ name: data.name.trim(), username: cleanUsername(data.username), email: data.email.trim(), via: 'email' });
      const reply = await send(form, 'sign-up', { ...data, terms: Boolean(data.terms) }, 'Creating account…');
      // Supabase skips the code only when email confirmation is turned off.
      if (reply.ok) location.hash = reply.data.verify ? 'verify' : 'ready';
    });
  }

  if (current === 'verify') {
    const boxes = $$('.auth-otp input', view);
    const fill = (start, digits) => { digits.split('').forEach((digit, offset) => { if (boxes[start + offset]) boxes[start + offset].value = digit; }); boxes[Math.min(start + digits.length, 5)].focus(); };
    boxes.forEach((box, index) => {
      box.addEventListener('input', () => {
        const digits = box.value.replace(/\D/g, '');
        box.value = '';
        if (digits) fill(index, digits.slice(0, 6 - index));
        box.closest('.auth-otp').classList.remove('is-invalid');
        setNote(boxes[0], '');
      });
      box.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && !box.value && index) { boxes[index - 1].value = ''; boxes[index - 1].focus(); event.preventDefault(); }
        if (event.key === 'ArrowLeft' && index) boxes[index - 1].focus();
        if (event.key === 'ArrowRight' && index < 5) boxes[index + 1].focus();
      });
      box.addEventListener('paste', (event) => { event.preventDefault(); fill(index, (event.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6 - index)); });
      box.addEventListener('focus', () => box.select());
    });
    // Copied the code from the email (Gmail's Copy code button)? One tap pastes it and verifies.
    $('[data-paste]', view)?.addEventListener('click', async () => {
      const digits = await readCopiedCode();
      if (digits.length !== 6) { setNote(boxes[0], digits === null ? 'Your browser blocked pasting. Tap the first box and paste instead.' : 'Copy the 6-digit code from the email first, then tap Paste code.'); return; }
      fill(0, digits);
      form.requestSubmit();
    });
    if (linkedCode.length === 6) {
      fill(0, linkedCode);
      linkedCode = '';
      setTimeout(() => form.querySelector('[type="submit"]').focus({ preventScroll: true }), 60);
    } else if (matchMedia('(min-width: 760px)').matches) setTimeout(() => boxes[0].focus({ preventScroll: true }), 60);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = boxes.map((box) => box.value).join('');
      if (code.length < 6) {
        setNote(boxes[0], 'Enter all 6 digits of the code.');
        boxes.forEach((box) => box.setAttribute('aria-invalid', 'true'));
        boxes.find((box) => !box.value)?.focus();
        if (!reduced()) $('.auth-otp', view).animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 340, easing: 'ease-out' });
        return;
      }
      if (!store.get().email) { toast('Enter your email first.'); location.hash = 'create'; return; }
      const reply = await send(form, 'verify', { email: store.get().email, code }, 'Verifying…');
      if (reply.ok) location.hash = 'ready';
    });
    const resend = $('[data-resend]', view);
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      const { ok, data } = await post('resend', { email: store.get().email ?? '' });
      toast(ok ? `We sent a new code to ${store.get().email}.` : Object.values(data.errors ?? {})[0] ?? data.error ?? 'Couldn’t send a new code. Try again in a moment.');
      let seconds = 60;
      resend.disabled = true;
      resend.textContent = `Resend in ${seconds}s`;
      const timer = setInterval(() => {
        seconds -= 1;
        if (!resend.isConnected) { clearInterval(timer); return; }
        if (seconds <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend code'; return; }
        resend.textContent = `Resend in ${seconds}s`;
      }, 1000);
    });
    $('[data-change-email]', view).addEventListener('click', () => { sessionStorage.setItem('showlio-focus-email', '1'); });
  }

  if (current === 'forgot') form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    store.set({ email });
    const reply = await send(form, 'forgot', { email }, 'Sending code…');
    if (reply.ok) { toast(`If ${email} has a Showlio account, a code is on its way.`); location.hash = 'reset'; }
  });

  if (current === 'reset' && linkedCode) {
    form.elements.code.value = linkedCode;
    linkedCode = '';
    setTimeout(() => form.elements.password.focus({ preventScroll: true }), 60);
  }
  if (current === 'reset') form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!store.get().email) { location.hash = 'forgot'; return; }
    const data = Object.fromEntries(new FormData(form));
    const reply = await send(form, 'reset', { email: store.get().email, ...data }, 'Saving password…');
    if (reply.ok) { toast('Password updated. You’re signed in.'); enterWorkspace('/app/#explore'); }
  });
  if (current === 'create' && sessionStorage.getItem('showlio-focus-email')) {
    sessionStorage.removeItem('showlio-focus-email');
    setTimeout(() => { form.elements.email.focus(); form.elements.email.select(); }, 80);
  }
}

$('#auth-dialog-close').addEventListener('click', () => $('#auth-dialog').close());
$('#auth-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

// Showcase: the project card and code cycle through the kinds of work Showlio is for.
// The portfolio window highlights one tile while the card shows that piece of work.
const showcase = [
  { title: 'AI Notes', desc: 'Turn meetings into clear, actionable notes.', tags: ['Next.js', 'TypeScript', 'AI'], icon: 'layers', tone: 'dev', preview: 'app' },
  { title: 'Inbox Pilot', desc: 'Sort support email and draft replies with AI.', tags: ['Python', 'Webhooks', 'LLM'], icon: 'workflow', tone: 'ai', preview: 'flow' },
  { title: 'Neon Dreams', desc: 'A brand film in vibrant light and motion.', tags: ['After Effects', 'Resolve'], icon: 'video', tone: 'video', preview: 'image', image: '/assets/images/thumbs/workspace-neon.webp' },
  { title: 'Luma 3D', desc: 'Flowing 3D forms for a studio identity.', tags: ['Blender', 'Cinema 4D'], icon: 'palette', tone: 'art', preview: 'image', image: '/assets/images/thumbs/workspace-luma.webp' },
];
function showItem(index) {
  const item = showcase[index];
  $('#sc-window').dataset.active = String(index);
  $('[data-sc="title"]').textContent = item.title;
  $('[data-sc="desc"]').textContent = item.desc;
  $('[data-sc="chips"]').innerHTML = item.tags.map((tag) => `<span>${esc(tag)}</span>`).join('');
  $('[data-sc="icon"]').setAttribute('href', `/assets/workspace-icons.svg#${item.icon}`);
  $('[data-sc="tone"]').dataset.tone = item.tone;
  $('[data-sc="preview"]').dataset.kind = item.preview;
  if (item.image) $('.sc-preview-image').src = item.image;
}
function startShowcase() {
  const root = $('#auth-showcase');
  if (reduced() || getComputedStyle(root).display === 'none') return;
  let index = 0;
  let paused = false;
  root.addEventListener('pointerenter', () => { paused = true; });
  root.addEventListener('pointerleave', () => { paused = false; });
  setInterval(() => {
    if (paused || document.hidden) return;
    index = (index + 1) % showcase.length;
    root.classList.add('is-swapping');
    setTimeout(() => { showItem(index); root.classList.remove('is-swapping'); }, 260);
  }, 4200);
}

showItem(0);
go(location.hash.slice(1) || 'sign-in', { focus: false });
requestAnimationFrame(() => document.documentElement.classList.add('auth-ready'));
setTimeout(startShowcase, 2600);
