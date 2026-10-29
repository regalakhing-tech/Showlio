// Demo sign-in flow. Nothing is sent to a server: the steps only move between
// screens and keep the entered name and email in this browser tab.
import { checkSignIn, checkSignUp, cleanUsername } from './auth-model.js';
import { renderGoogleButton, bindGoogleButton } from './auth-google.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const EASE = 'cubic-bezier(.16,1,.3,1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name) => `<svg class="auth-icon" aria-hidden="true"><use href="/assets/workspace-icons.svg#${name}"/></svg>`;

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem('showlio-demo-auth') ?? '{}'); } catch { return {}; } },
  set(value) { try { sessionStorage.setItem('showlio-demo-auth', JSON.stringify({ ...store.get(), ...value })); } catch { /* Private mode: the flow still works. */ } },
  remembered() { try { return localStorage.getItem('showlio-demo-email') ?? ''; } catch { return ''; } },
  remember(email) { try { email ? localStorage.setItem('showlio-demo-email', email) : localStorage.removeItem('showlio-demo-email'); } catch { /* Ignore. */ } },
};

// Left-hand story for each step.
const story = {
  'sign-in': ['Show your work.', 'Build your portfolio.', 'A modern platform for developers, AI builders, video creators and digital artists to showcase projects, share skills and grow their career.', 'devflow', 'Sign in'],
  create: ['Build your profile.', 'Start your journey.', 'A modern platform for developers, AI builders, video creators and digital artists to showcase projects, share skills and grow their career.', 'bars', 'Create your account'],
  verify: ['Verify your email.', 'Complete your account.', 'Verify your account to keep building your portfolio on Showlio.', 'devflow', 'Verify your email'],
  ready: ['You’re all set.', 'Build your portfolio.', 'Join the Showlio community to showcase projects, share skills and grow your creative career.', 'growth', 'Your account is ready'],
};

const field = ({ name, label, type = 'text', symbol, placeholder, autocomplete, value = '', toggle = false, hint = '' }) => `<div class="auth-field auth-reveal"><label for="f-${name}">${label}</label><span class="auth-input">${icon(symbol)}<input id="f-${name}" name="${name}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" value="${esc(value)}" aria-describedby="${name}-note"${type === 'email' ? ' inputmode="email" spellcheck="false"' : ''}>${toggle ? `<button class="auth-eye" type="button" data-toggle="f-${name}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>` : ''}</span><small class="auth-note" id="${name}-note" data-hint="${esc(hint)}">${esc(hint)}</small></div>`;
const divider = '<div class="auth-divider auth-reveal"><span>or</span></div>';
const submit = (label) => `<button class="auth-button auth-reveal" type="submit"><span>${label}</span>${icon('arrow')}</button>`;
const demo = (text) => `<p class="auth-demo auth-reveal">${icon('shield')} ${text}</p>`;

const views = {
  'sign-in': () => `<h2 id="auth-card-title" class="auth-reveal">Welcome back</h2><p class="auth-sub auth-reveal">Sign in to your Showlio account.</p>${demo('Design preview: there are no real accounts yet. Do not enter a password you use anywhere else.')}${renderGoogleButton()}${divider}<form id="auth-form" novalidate>${field({ name: 'email', label: 'Email', type: 'email', symbol: 'mail', placeholder: 'you@yourdomain.com', autocomplete: 'email', value: store.remembered() || store.get().email || '' })}${field({ name: 'password', label: 'Password', type: 'password', symbol: 'lock', placeholder: 'Enter your password', autocomplete: 'current-password', toggle: true })}<div class="auth-row auth-reveal"><label class="auth-check"><input type="checkbox" name="remember" ${store.remembered() || !store.get().email ? 'checked' : ''}><span>${icon('check')}</span>Remember me</label><button class="auth-link" type="button" data-forgot>Forgot password?</button></div>${submit('Sign in')}</form><p class="auth-switch auth-reveal">Don’t have an account? <a href="#create">Create account</a></p><p class="auth-fine auth-reveal">Any email and an 8+ character password open the preview.</p>`,
  create: () => { const saved = store.get(); return `<h2 id="auth-card-title" class="auth-reveal">Create your account</h2><p class="auth-sub auth-reveal">Join Showlio and start building your portfolio today.</p>${demo('Design preview: nothing you enter is sent anywhere. Do not use a real password.')}${renderGoogleButton()}${divider}<form id="auth-form" novalidate><div class="auth-pair">${field({ name: 'name', label: 'Full name', symbol: 'user', placeholder: 'John Doe', autocomplete: 'name', value: saved.name ?? '' })}${field({ name: 'username', label: 'Username', symbol: 'at', placeholder: 'johndoe', autocomplete: 'username', value: saved.username ?? '' })}</div>${field({ name: 'email', label: 'Email address', type: 'email', symbol: 'mail', placeholder: 'you@yourdomain.com', autocomplete: 'email', value: saved.email ?? '' })}${field({ name: 'password', label: 'Password', type: 'password', symbol: 'lock', placeholder: 'Create a password', autocomplete: 'new-password', toggle: true, hint: 'At least 8 characters' })}<div class="auth-meter auth-reveal" aria-hidden="true"><i></i><i></i><i></i><i></i></div>${field({ name: 'confirm', label: 'Confirm password', type: 'password', symbol: 'lock', placeholder: 'Confirm your password', autocomplete: 'new-password', toggle: true })}<label class="auth-check auth-terms auth-reveal"><input type="checkbox" name="terms" aria-describedby="terms-note"><span>${icon('check')}</span><span>I agree to the <button class="auth-link" type="button" data-doc="terms">Terms &amp; Conditions</button> and <button class="auth-link" type="button" data-doc="privacy">Privacy Policy</button>.</span></label><small class="auth-note auth-terms-note" id="terms-note" data-hint=""></small>${submit('Create account')}</form><p class="auth-switch auth-reveal">Already have an account? <a href="#sign-in">Sign in</a></p>`; },
  verify: () => `<h2 id="auth-card-title" class="auth-reveal">Verify your email</h2><p class="auth-sub auth-reveal">We’ve sent a 6-digit verification code to <strong>${esc(store.get().email || 'you@yourdomain.com')}</strong>.</p><form id="auth-form" novalidate><fieldset class="auth-otp auth-reveal"><legend class="auth-sr">Verification code</legend>${[1, 2, 3, 4, 5, 6].map((n) => `<input inputmode="numeric" pattern="[0-9]*" maxlength="1" ${n === 1 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${n} of 6" aria-describedby="otp-note">`).join('')}</fieldset><small class="auth-note auth-otp-note" id="otp-note" data-hint="Demo: any 6 digits work.">Demo: any 6 digits work.</small>${submit('Verify code')}</form><p class="auth-switch auth-reveal">Didn’t receive the code? <button class="auth-link" type="button" data-resend>Resend code</button></p>${divider}<p class="auth-center auth-reveal"><a class="auth-link" href="#create" data-change-email>Change email address</a></p>`,
  ready: () => { const saved = store.get(); const rows = [['mail', 'Email verified', `${saved.email || 'you@yourdomain.com'} is confirmed`], ['shield-check', 'Preview account', 'Kept only in this browser tab'], ['user', 'Profile setup next', 'Create your profile to showcase your work']]; return `<div class="auth-success auth-reveal" aria-hidden="true"><span class="auth-rays">${Array.from({ length: 8 }, (_, i) => `<i style="--r:${i * 45}deg"></i>`).join('')}</span><span class="auth-badge"><svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.6 3.6 7.4-8"/></svg></span></div><h2 id="auth-card-title" class="auth-reveal auth-center">Your account is ready</h2><p class="auth-sub auth-center auth-reveal">Your email has been verified and your Showlio account is ready to go. Let’s build something great!</p><ul class="auth-checklist">${rows.map(([symbol, title, text], index) => `<li class="auth-reveal" style="--d:${index}"><span class="auth-row-icon">${icon(symbol)}</span><span><strong>${esc(title)}</strong><small>${esc(text)}</small></span><b>${icon('check')}</b></li>`).join('')}</ul><a class="auth-button auth-reveal" href="/app/#settings" data-enter><span>Create my profile</span>${icon('arrow')}</a><a class="auth-button auth-button-outline auth-reveal" href="/app/#explore" data-enter><span>Explore creators</span></a><p class="auth-fine auth-reveal">By continuing, you agree to our <button class="auth-link" type="button" data-doc="terms">Terms of Service</button> and <button class="auth-link" type="button" data-doc="privacy">Privacy Policy</button>.</p>`; },
};

const docs = {
  terms: ['Terms of Service', 'You are exploring a design preview of Showlio. Accounts, profiles and projects here are illustrative, and nothing you enter is published. The full terms will be available before registration opens.'],
  privacy: ['Privacy Policy', 'This demo keeps your name and email only in this browser tab so the screens can greet you. Nothing is sent to a server, and closing the tab clears it.'],
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
function busy(button, label) {
  button.disabled = true;
  button.classList.add('is-loading');
  button.querySelector('span').textContent = label;
  return new Promise((resolve) => setTimeout(resolve, reduced() ? 150 : 900));
}
function enterWorkspace(href) {
  store.set({ signedIn: true });
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
  $('[data-forgot]', view)?.addEventListener('click', () => toast('Password reset isn’t connected in this demo. Any password with 8 or more characters works.'));
  $$('[data-enter]', view).forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); enterWorkspace(link.getAttribute('href')); }));
  // Clear an error as soon as the person fixes the field.
  form?.addEventListener('input', (event) => { if (event.target.hasAttribute('aria-invalid')) setNote(event.target, ''); });

  if (current === 'sign-in') form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!showErrors(form, checkSignIn(data))) return;
    store.remember(data.remember ? data.email.trim() : '');
    store.set({ email: data.email.trim(), via: 'email' });
    await busy(form.querySelector('[type="submit"]'), 'Signing in…');
    enterWorkspace('/app/#explore');
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
      await busy(form.querySelector('[type="submit"]'), 'Creating account…');
      location.hash = 'verify';
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
    if (matchMedia('(min-width: 760px)').matches) setTimeout(() => boxes[0].focus({ preventScroll: true }), 60);
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
      await busy(form.querySelector('[type="submit"]'), 'Verifying…');
      location.hash = 'ready';
    });
    const resend = $('[data-resend]', view);
    resend.addEventListener('click', () => {
      toast(`We sent a new code to ${store.get().email || 'your email'}. Demo: any 6 digits work.`);
      let seconds = 30;
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
