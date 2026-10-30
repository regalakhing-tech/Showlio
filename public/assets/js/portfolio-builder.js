import { createPortfolio, normalizePortfolio, validateStep, portfolioProgress, visibleWorks, reorderWorks, createPublishedSnapshot, availabilityLabel } from './portfolio-model.js';
import { loadDraft, saveDraft, saveSnapshot, loadSnapshot } from './portfolio-store.js';
import { renderPortfolio, renderWorkDetail, escapeHtml as esc } from './portfolio-render.js';
import { renderProfile, renderAbout, renderWorks, renderStyle, renderPublish, renderWorkForm } from './portfolio-editor.js';
import { createQrSvg } from './portfolio-qr.js';
import { slotHeaders, rememberSlot } from './session-slot.js';
import { withPreservedFocus } from './workspace-shared.js';

const $ = selector => document.querySelector(selector);
const main = $('#pb-main');
const dialog = $('#pb-dialog');
const steps = ['Profile', 'About & skills', 'Projects & products', 'Style', 'Publish'];
const hashes = ['profile', 'about', 'work', 'style', 'publish'];
const nextLabels = ['Continue to About', 'Add projects & products', 'Customize portfolio', 'Continue to Publish', 'Create portfolio'];
const glyphs = { phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>', monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const i = name => `<svg class="pb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[name] || `<use href="/assets/workspace-icons.svg#${name}"/>`}</svg>`;
const state = { portfolio: null, snapshot: null, step: 0, device: 'desktop', mobilePreview: false, query: '', type: 'all', reorder: false, previewType: 'all', dirty: false };
let saveTimer, toastTimer, revision = 0, saveQueue = Promise.resolve(), lastDialogFocus, editWork, imageToken = 0, dragId, savingPreview = false;
const identityVersions = { logo: 0, avatar: 0 };
let pendingImages = 0;

// The portfolio's name, role, photo, bio, location, skills, website and Instagram are the
// creator's Showlio profile: they load from the account, and edits here save back to it,
// so the workspace, the community and every portfolio page show the same person.
let account = null;
let syncTimer, syncQueue = Promise.resolve();
const slugFor = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
const accountFields = profile => JSON.stringify([profile.name, profile.role, profile.bio, profile.location, profile.skills, profile.website, profile.instagram, profile.avatar?.startsWith('data:') ? profile.avatar : ''].map(value => typeof value === 'string' ? value.trim() : value));
const fromAccount = () => ({ name: account.name, role: account.headline, bio: account.bio, location: account.location, skills: account.skills, website: account.links.website, instagram: account.links.instagram, avatar: '' });
async function accountRequest(method, body) {
  let response;
  try { response = await fetch('/api/profile', { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...slotHeaders() }, body: body && JSON.stringify(body) }); }
  catch { return { ok: false, data: { error: 'Can’t reach Showlio. Check your connection and try again.' } }; }
  rememberSlot(response);
  if (response.status === 401) { location.replace('/auth/#sign-in'); await new Promise(() => {}); }
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}
/** Puts the account's details into the portfolio; true when anything changed. */
function applyAccount() {
  const profile = state.portfolio.profile;
  const before = JSON.stringify(profile);
  // A page name made from the old name follows the person; a custom one stays.
  if (!profile.slug || profile.slug === slugFor(profile.name)) profile.slug = slugFor(account.username);
  Object.assign(profile, { name: account.name, role: account.headline, bio: account.bio, location: account.location, skills: [...account.skills], website: account.links.website, instagram: account.links.instagram });
  if (account.avatar) profile.avatar = account.avatar;
  else if (!profile.avatar.startsWith('data:')) profile.avatar = '';
  if (!profile.availability) profile.availability = availabilityLabel(account.availability);
  return JSON.stringify(profile) !== before;
}
function scheduleAccountSync() {
  if (!account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncQueue = syncQueue.then(syncAccount); }, 1200);
}
async function syncAccount() {
  const profile = state.portfolio.profile;
  if (accountFields(profile) === accountFields(fromAccount())) return;
  // Name, role and links must be valid on the profile; the step's own checks explain what to fix.
  if (validateStep(state.portfolio, 0).some(error => ['profile.name', 'profile.role', 'profile.website', 'profile.instagram'].includes(error.field))) return;
  const sent = accountFields(profile);
  status('Updating your profile…', 'is-saving');
  const { ok, data } = await accountRequest('PUT', {
    name: profile.name, headline: profile.role, bio: profile.bio, location: profile.location, availability: account.availability, visible: account.visible,
    skills: profile.skills, links: { ...account.links, website: profile.website.trim(), instagram: profile.instagram.trim() },
    avatar: profile.avatar.startsWith('data:') ? profile.avatar : undefined,
  });
  if (!ok) {
    status('Profile not updated', 'is-error');
    notify(Object.values(data.errors ?? {})[0] ?? data.error ?? 'Your Showlio profile couldn’t be updated. Try again in a moment.');
    return;
  }
  account = data.profile;
  // The uploaded photo now lives in the account; keep its link instead of the local copy.
  if (profile.avatar.startsWith('data:') && accountFields(profile) === sent && account.avatar) { profile.avatar = account.avatar; changed({ sync: false }); updatePreview(); }
  status(state.dirty ? 'Unsaved changes' : 'Saved to your profile', state.dirty ? 'is-saving' : '');
  if (accountFields(state.portfolio.profile) !== sent) scheduleAccountSync();
}

function status(message, kind = '') {
  const node = $('#pb-save-status');
  if (node.textContent === message && node.className === `pb-save-status ${kind}`) return;
  node.textContent = message;
  node.className = `pb-save-status ${kind}`;
}
// Entrance animations run only after navigation, not on every re-render while typing.
let enterTimer;
function animateEnter(kind) {
  if (reduced()) return;
  clearTimeout(enterTimer);
  delete document.body.dataset.enter;
  void document.body.offsetWidth;
  document.body.dataset.enter = kind;
  enterTimer = setTimeout(() => { delete document.body.dataset.enter; }, 1100);
}
// The highlighted step slides from the previous step to the new one.
function placeIndicator(fromStep = null) {
  const nav = $('.pb-steps');
  const indicator = nav?.querySelector('.pb-step-indicator');
  const active = nav?.querySelector('.pb-step.is-active');
  if (!indicator || !active) return;
  const from = fromStep === null ? null : nav.querySelector(`[data-step="${fromStep}"]`);
  const box = element => `translate(${element.offsetLeft}px, ${element.offsetTop}px)`;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.height = `${active.offsetHeight}px`;
  indicator.style.transition = 'none';
  indicator.style.transform = box(from && from !== active ? from : active);
  indicator.classList.add('is-ready');
  if (from && from !== active && !reduced()) {
    void indicator.offsetWidth;
    indicator.style.transition = '';
    indicator.style.transform = box(active);
  }
}
function closeMenus(except = null) {
  document.querySelectorAll('.pb-menu:not([hidden])').forEach(menu => {
    if (menu === except) return;
    menu.hidden = true;
    menu.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    menu.closest('.pb-work-card')?.classList.remove('is-menu-open');
  });
}
function toggleMenu(button) {
  const menu = button.parentElement.querySelector('.pb-menu');
  const open = menu.hidden;
  closeMenus(menu);
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  button.closest('.pb-work-card')?.classList.toggle('is-menu-open', open);
  if (open) menu.querySelector('button, input')?.focus({ preventScroll: true });
}
function notify(message) {
  if (dialog.open) { $('#pb-modal-feedback').textContent = message; return; }
  const node = $('#pb-toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 4200);
}
function changed({ sync = true } = {}) {
  if (sync) scheduleAccountSync();
  revision++;
  state.dirty = true;
  state.portfolio.updatedAt = Date.now();
  status('Unsaved changes', 'is-saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(), 650);
}
async function persist() {
  clearTimeout(saveTimer);
  const version = revision;
  const value = structuredClone(state.portfolio);
  status('Saving…', 'is-saving');
  const task = saveQueue.catch(() => {}).then(() => saveDraft(value));
  saveQueue = task;
  try {
    await task;
    if (version === revision) { state.dirty = false; status('Draft saved'); }
    return true;
  } catch {
    status('Couldn’t save', 'is-error');
    notify('This browser could not save your draft. Allow browser storage or free some space, then try Save draft again.');
    return false;
  }
}
function previewUrl(snapshot = state.snapshot, community = false) {
  const url = new URL('/portfolio/view/', location.origin);
  // The Showlio profile link is the live page anyone can open.
  if (community && account) { url.searchParams.set('u', account.username); return url.href; }
  if (snapshot?.profile.slug) url.searchParams.set('slug', snapshot.profile.slug);
  else url.searchParams.set('draft', '1');
  if (community) url.searchParams.set('community', '1');
  return url.href;
}
function openModal(title, body, subtitle = '') {
  if (!dialog.open) lastDialogFocus = document.activeElement;
  $('#pb-dialog-title').textContent = title;
  $('#pb-dialog-subtitle').textContent = subtitle;
  $('#pb-dialog-content').innerHTML = body;
  $('#pb-modal-feedback').textContent = '';
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('pb-dialog-open');
}
function closeModal() { dialog.close(); }
dialog.addEventListener('close', () => { imageToken++; editWork = null; document.body.classList.remove('pb-dialog-open'); if (lastDialogFocus?.isConnected) lastDialogFocus.focus({ preventScroll: true }); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const b = dialog.getBoundingClientRect();
  if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) closeModal();
});

function renderSidebar() {
  const p = state.portfolio;
  const progress = portfolioProgress(p);
  $('#pb-sidebar').innerHTML = `<h2>Build your portfolio</h2><nav class="pb-steps" aria-label="Portfolio steps"><span class="pb-step-indicator" aria-hidden="true"></span>${steps.map((label, index) => `<button type="button" class="pb-step ${index === state.step ? 'is-active' : ''} ${progress[index] && index < state.step ? 'is-complete' : ''}" data-step="${index}" ${index === state.step ? 'aria-current="step"' : ''}><span class="pb-step-num">${progress[index] && index < state.step ? i('check') : index + 1}</span><span class="pb-step-label">${label}</span></button>`).join('')}</nav><div class="pb-step-user">${p.profile.avatar ? `<img src="${esc(p.profile.avatar)}" alt="">` : `<span class="pb-step-user-avatar">${esc((p.profile.name || 'You').slice(0, 1))}</span>`}<div><strong>${esc(p.profile.name || 'Your portfolio')}</strong><small>${esc(p.profile.role || 'Your creative role')}</small></div></div><a class="pb-back-link" href="/app/">${i('arrow-left')} Back to Showlio</a>`;
}
function previewPane() {
  return `<aside class="pb-preview-pane"><div class="pb-preview-toolbar"><h2>Your portfolio preview</h2><div class="pb-device-toggle" aria-label="Preview size" data-active="${state.device}"><button type="button" data-device="desktop" class="${state.device === 'desktop' ? 'is-active' : ''}" aria-pressed="${state.device === 'desktop'}">${i('monitor')} Desktop</button><button type="button" data-device="mobile" class="${state.device === 'mobile' ? 'is-active' : ''}" aria-pressed="${state.device === 'mobile'}">${i('phone')} Mobile</button></div></div><div class="pb-preview-surface ${state.device === 'mobile' ? 'is-mobile' : ''}" id="pb-preview-site">${renderPortfolio(state.portfolio, { embedded: true, type: state.previewType })}</div><p class="pb-preview-note">${i('help')}Style changes apply to your whole portfolio.</p></aside>`;
}
function renderMain() {
  const search = document.activeElement?.id === 'pb-work-search' ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  withPreservedFocus(main, () => {
    const p = state.portfolio;
    const body = state.step === 0 ? renderProfile(p) : state.step === 1 ? renderAbout(p) : state.step === 3 ? renderStyle(p) : '';
    main.innerHTML = `<div class="pb-error" id="pb-step-error" role="alert" hidden></div>${[0, 1, 3].includes(state.step) ? `<button type="button" class="pb-btn pb-soft pb-mobile-preview" data-action="toggle-preview">${i('eye')}${state.mobilePreview ? 'Back to editing' : 'Show live preview'}</button>` : ''}${state.step === 2 ? renderWorks(p, state) : state.step === 4 ? `<div class="pb-publish-layout">${renderPublish(p, { ready: !validateStep(p, 4).length, snapshot: state.snapshot })}${previewPane()}</div>` : `<div class="pb-editor-split">${body}${previewPane()}</div>`}`;
  }, main);
  if (search) $('#pb-work-search')?.setSelectionRange(search.start, search.end);
}
function renderFooter() {
  const progress = portfolioProgress(state.portfolio);
  $('#pb-footer').innerHTML = `<button type="button" class="pb-btn pb-outline pb-footer-back" data-action="back">${i('arrow-left')}${state.step ? 'Back' : 'Showlio'}</button><div class="pb-footer-progress"><span>Step ${state.step + 1} of 5</span><span class="pb-progress-bars" aria-hidden="true">${steps.map((_, index) => `<span class="${index === state.step ? 'is-active' : progress[index] && index < state.step ? 'is-complete' : ''}"></span>`).join('')}</span></div><span class="pb-footer-note">${state.step === 2 ? 'Choose which work appears in your portfolio.' : state.step === 4 ? 'Your portfolio preview is saved in this browser.' : 'Your portfolio, your story.'}</span><button type="button" class="pb-btn pb-primary pb-footer-next" data-action="next" ${savingPreview ? 'disabled' : ''}><span>${state.step === 4 && state.snapshot ? 'Update saved portfolio' : nextLabels[state.step]}</span>${i('arrow')}</button>`;
}
function render() {
  document.body.classList.toggle('pb-show-preview', state.mobilePreview);
  renderSidebar(); renderMain(); renderFooter();
  placeIndicator();
  document.title = `${steps[state.step]} — Portfolio builder — Showlio`;
}
function updatePreview() {
  const host = $('#pb-preview-site');
  if (host) withPreservedFocus(host, () => { host.innerHTML = renderPortfolio(state.portfolio, { embedded: true, type: state.previewType }); });
}
function goStep(step) {
  const from = state.step;
  state.step = Math.max(0, Math.min(4, Number(step) || 0));
  state.mobilePreview = false;
  const hash = `#${hashes[state.step]}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  render();
  if (from !== state.step) { animateEnter(state.step > from ? 'forward' : 'back'); placeIndicator(from); }
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function showErrors(errors) {
  const box = $('#pb-step-error');
  box.hidden = false;
  box.innerHTML = errors.map(error => `<p>${esc(error.message)}</p>`).join('');
  const field = errors[0]?.field.split('.').at(-1);
  const input = [...main.querySelectorAll('[data-profile]')].find(node => node.dataset.profile === field);
  if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  else { box.tabIndex = -1; box.focus(); }
}
async function createPreview() {
  if (savingPreview) return;
  if (pendingImages) { notify('Wait for your image to finish processing, then try again.'); return; }
  const errors = validateStep(state.portfolio, 4);
  if (errors.length) { showErrors(errors); return; }
  savingPreview = true;
  renderFooter();
  try {
    if (!(await persist())) return;
    const snapshot = createPublishedSnapshot(state.portfolio);
    state.snapshot = await saveSnapshot(snapshot);
    render(); showShare(false, { celebrate: true });
  } catch (error) { notify(error.message || 'Your portfolio could not be saved. Try again.'); }
  finally { savingPreview = false; renderFooter(); }
}

async function readRaster(file, maxEdge = 1600) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image up to 5 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Choose another file.'); });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Choose an image smaller than 40 megapixels.');
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not process this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', .87);
  } finally { bitmap.close(); }
}
async function setIdentityImage(field, file) {
  if (!Object.hasOwn(identityVersions, field)) return;
  const token = ++identityVersions[field];
  pendingImages++;
  try {
    const image = await readRaster(file, 900);
    if (token !== identityVersions[field]) return;
    state.portfolio.profile[field] = image;
    changed(); render();
  } catch (error) { if (token === identityVersions[field]) notify(error.message); }
  finally { pendingImages--; }
}
function openWork(id = '', type = 'website') {
  const work = state.portfolio.works.find(item => item.id === id);
  editWork = work ? structuredClone(work) : { id: `work-${crypto.randomUUID()}`, title: '', type, image: '', visible: true, skills: [] };
  openModal(work ? 'Edit your work' : 'Add work to your portfolio', renderWorkForm(editWork), 'Websites, apps, projects, and products — all in one place.');
}
async function handleWorkImage(file) {
  const token = ++imageToken;
  const submit = $('#pb-work-form [type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const image = await readRaster(file);
    if (token !== imageToken || !editWork || !dialog.open) return;
    editWork.image = image;
    $('#pb-work-image-preview').innerHTML = `<img src="${esc(image)}" alt="Your work cover">`;
    $('#pb-modal-feedback').textContent = 'Cover image ready.';
  } catch (error) { if (token === imageToken) notify(error.message); }
  finally { if (token === imageToken && submit?.isConnected) submit.disabled = false; }
}
function addSkill() {
  const input = $('#pb-skill-input');
  const value = input.value.trim();
  if (!value) { input.focus(); return; }
  if (state.portfolio.profile.skills.length >= 15) { notify('You can add up to 15 skills.'); return; }
  if (!state.portfolio.profile.skills.some(skill => skill.toLowerCase() === value.toLowerCase())) state.portfolio.profile.skills.push(value);
  changed(); renderMain();
  if (!reduced()) $('.pb-chips .pb-chip:last-child')?.classList.add('is-new');
  $('#pb-skill-input')?.focus();
}
function starterCollection() {
  const data = [
    ['Flow', 'app', 'project-habitify', 'A friendly app that helps people build lasting habits.'],
    ['Studio', 'website', 'project-taskflow', 'A clean, accessible website and workspace for a creative team.'],
    ['Clay Collection', 'product', 'portfolio-clay', 'A thoughtful collection of everyday ceramic objects.'],
    ['Orbit', 'design', 'project-brand-identity', 'A flexible visual identity for a growing creative studio.'],
    ['Trail Notes', 'website', 'workspace-mountains', 'A travel journal inspired by the outdoors.'],
    ['Focus', 'app', 'project-habitify', 'A calm place to plan the day and make room for focused work.'],
  ];
  state.portfolio.works.push(...data.map(([title, type, image, description], index) => ({ id: `work-${crypto.randomUUID()}`, title, type, description, image: `/assets/images/${image === 'portfolio-clay' ? image + '.jpg' : image + '.webp'}`, url: '', role: state.portfolio.profile.role, skills: [], visible: ![3, 5].includes(index) })));
  changed(); render(); notify('Starter collection added. Edit the items to make them your own.');
}
async function copyLink(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    notify('Link copied.');
    if (button) { button.classList.add('is-copied'); setTimeout(() => button.isConnected && button.classList.remove('is-copied'), 1600); }
  }
  catch { const input = $('#pb-share-url'); if (input) { input.focus(); input.select(); } notify('Select the link and copy it with your keyboard.'); }
}
function download(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function showShare(community = false, { celebrate = false, switching = false } = {}) {
  if (!state.snapshot) { notify('Create your portfolio preview first.'); return; }
  const p = state.snapshot.profile;
  const url = previewUrl(state.snapshot, community);
  const other = previewUrl(state.snapshot, !community);
  openModal('Share your portfolio', `<div class="pb-modal-body">${celebrate ? `<p class="pb-share-success">${i('check-circle')}Your portfolio is ready to share</p>` : ''}<div class="pb-share-tabs${switching ? ' is-switching' : ''}" data-active="${community ? 'community' : 'portfolio'}" aria-label="Choose what to share"><button type="button" data-share-tab="portfolio" class="${community ? '' : 'is-active'}" aria-pressed="${!community}">Portfolio website</button><button type="button" data-share-tab="community" class="${community ? 'is-active' : ''}" aria-pressed="${community}">Showlio profile</button></div><div class="pb-share-person">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span class="pb-step-user-avatar">${esc(p.name.slice(0, 1))}</span>`}<div><strong>${esc(p.name)}</strong><p>${esc(p.role)}</p></div></div><div class="pb-qr">${createQrSvg(url)}</div><p class="pb-qr-caption">Scan to open this saved preview</p><label class="pb-field" for="pb-share-url">${community ? 'Showlio profile preview link' : 'Public portfolio link'}</label><div class="pb-copy-row pb-copy-inline"><input id="pb-share-url" readonly value="${esc(url)}"><button class="pb-icon-button" data-action="copy-share" type="button" aria-label="Copy link" title="Copy link">${i('copy')}${i('check')}</button></div><div class="pb-share-actions"><button class="pb-btn pb-outline" type="button" data-action="download-qr" data-qr-link="${esc(url)}">${i('download')} Download QR</button><a class="pb-btn pb-primary" href="${esc(url)}" target="_blank" rel="noopener">Open ${community ? 'profile' : 'portfolio'} ${i('external')}</a></div><hr class="pb-share-divider"><label class="pb-field" for="pb-share-other">${community ? 'Your portfolio website' : 'Your Showlio profile'}</label><div class="pb-copy-row"><input id="pb-share-other" readonly value="${esc(other)}"><button class="pb-btn pb-outline" data-action="copy-other" type="button">${i('copy')}${i('check')}<span>Copy link</span></button></div><p class="pb-modal-note">Your portfolio shows your work. Your Showlio profile connects you to the community. Your Showlio profile link is live and always up to date. The portfolio website preview is saved in this browser; download an HTML copy to take it anywhere.</p><button class="pb-btn pb-ghost" type="button" data-action="export">${i('download')}Download portfolio HTML</button></div>`, 'Let people explore your work, with or without a Showlio account.');
}

document.addEventListener('input', event => {
  const target = event.target;
  if (!state.portfolio) return;
  if (target.hasAttribute('data-count')) {
    const counter = document.getElementById(`${target.id}-count`);
    if (counter) counter.textContent = `${Array.from(target.value).length}/${target.maxLength}`;
  }
  if (target.dataset.profile) {
    const field = target.dataset.profile;
    state.portfolio.profile[field] = target.value;
    target.removeAttribute('aria-invalid');
    changed(); updatePreview(); renderFooter();
  }
  if (target.id === 'pb-work-search') { state.query = target.value; renderMain(); }
  if (target.dataset.style === 'accent') {
    const value = target.value.toLowerCase();
    if (/^#[a-f0-9]{6}$/.test(value)) { state.portfolio.style.accent = value; changed(); updatePreview(); }
  }
});
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.imageTarget && target.files?.[0]) {
    const field = target.dataset.imageTarget;
    target.disabled = true;
    try { await setIdentityImage(field, target.files[0]); }
    finally { if (target.isConnected) { target.disabled = false; target.value = ''; } }
  }
  if (target.id === 'pb-work-image' && target.files?.[0]) handleWorkImage(target.files[0]);
  if (target.dataset.toggleWork) {
    const work = state.portfolio.works.find(item => item.id === target.dataset.toggleWork);
    if (work) { work.visible = target.checked; changed(); render(); }
  }
  if (target.dataset.style && target.type === 'checkbox') { state.portfolio.style[target.dataset.style] = target.checked; changed(); updatePreview(); }
  if (target.dataset.style === 'accent' && /^#[a-f0-9]{6}$/i.test(target.value)) renderMain();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.id === 'pb-skill-input') { event.preventDefault(); addSkill(); }
  const open = event.key === 'Escape' && document.querySelector('.pb-menu:not([hidden])');
  if (open) {
    const opener = open.parentElement.querySelector('[aria-expanded]');
    event.preventDefault(); closeMenus(); opener?.focus();
  }
});
window.addEventListener('resize', () => placeIndicator());
document.addEventListener('submit', event => {
  if (event.target.id !== 'pb-work-form') return;
  event.preventDefault();
  const form = event.target;
  const candidate = { ...editWork, title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), type: form.elements.type.value, role: form.elements.role.value.trim(), url: form.elements.url.value.trim(), skills: [...new Set(form.elements.skills.value.split(',').map(value => value.trim()).filter(Boolean))], visible: form.elements.visible.checked };
  const errors = validateStep({ ...state.portfolio, works: [{ ...candidate, visible: true }] }, 2);
  if (errors.length) { notify(errors[0].message); return; }
  const index = state.portfolio.works.findIndex(work => work.id === candidate.id);
  if (index < 0) state.portfolio.works.push(candidate); else state.portfolio.works[index] = candidate;
  changed(); closeModal(); render(); notify('Work saved to your portfolio.');
});
document.addEventListener('click', async event => {
  if (event.target.closest('.pb-skip')) { event.preventDefault(); main.focus(); return; }
  const target = event.target.closest('button, a[data-action]');
  if (!event.target.closest('.pb-menu, [data-card-menu], [data-action="add-menu"]')) closeMenus();
  if (!target || !state.portfolio) return;
  if (target.hasAttribute('data-card-menu') || target.dataset.action === 'add-menu') { toggleMenu(target); return; }
  if (target.dataset.addType) { closeMenus(); openWork('', target.dataset.addType); return; }
  if (target.dataset.step !== undefined) { goStep(target.dataset.step); return; }
  if (target.dataset.device) {
    state.device = target.dataset.device;
    const toggle = target.closest('.pb-device-toggle');
    toggle.dataset.active = state.device;
    toggle.querySelectorAll('[data-device]').forEach(item => { const on = item.dataset.device === state.device; item.classList.toggle('is-active', on); item.setAttribute('aria-pressed', String(on)); });
    $('#pb-preview-site')?.classList.toggle('is-mobile', state.device === 'mobile');
    return;
  }
  if (target.dataset.editWork) { openWork(target.dataset.editWork); return; }
  if (target.dataset.deleteWork) {
    const work = state.portfolio.works.find(item => item.id === target.dataset.deleteWork);
    if (!work) return;
    openModal('Remove this work?', `<div class="pb-modal-body"><p>Remove “${esc(work.title)}” from your portfolio draft?</p><p class="pb-hint">Your saved portfolio stays unchanged until you create it again.</p><div class="pb-share-actions"><button class="pb-btn pb-outline" data-action="close-modal">Keep work</button><button class="pb-btn pb-primary" data-confirm-delete="${esc(work.id)}">Remove work</button></div></div>`);
    return;
  }
  if (target.dataset.confirmDelete) { state.portfolio.works = state.portfolio.works.filter(work => work.id !== target.dataset.confirmDelete); changed(); closeModal(); render(); notify('Work removed from the draft.'); return; }
  if (target.dataset.moveWork) { state.portfolio.works = reorderWorks(state.portfolio.works, target.dataset.workId, Number(target.dataset.moveWork)); changed(); renderMain(); return; }
  if (target.dataset.workFilter) { state.type = target.dataset.workFilter; renderMain(); animateEnter('filter'); return; }
  if (target.dataset.removeSkill) { state.portfolio.profile.skills = state.portfolio.profile.skills.filter(skill => skill !== target.dataset.removeSkill); changed(); renderMain(); return; }
  if (target.dataset.clearImage) { identityVersions[target.dataset.clearImage]++; state.portfolio.profile[target.dataset.clearImage] = ''; changed(); render(); return; }
  if (target.dataset.style && target.dataset.styleValue) { state.portfolio.style[target.dataset.style] = target.dataset.styleValue; changed(); renderMain(); return; }
  if (target.dataset.pfFilter) { state.previewType = target.dataset.pfFilter; updatePreview(); return; }
  if (target.dataset.pfWork) { openModal('Project details', `<div class="pb-modal-body">${renderWorkDetail(state.portfolio, target.dataset.pfWork)}</div>`); return; }
  if (target.dataset.shareTab) {
    const community = target.dataset.shareTab === 'community';
    if (community !== (dialog.querySelector('.pb-share-tabs')?.dataset.active === 'community')) withPreservedFocus(dialog, () => showShare(community, { switching: true }));
    return;
  }
  const action = target.dataset.action;
  if (action === 'back') { if (state.step) goStep(state.step - 1); else if (await persist()) location.href = '/app/'; }
  if (action === 'next') { if (state.step === 4) await createPreview(); else { const errors = validateStep(state.portfolio, state.step); if (errors.length) showErrors(errors); else goStep(state.step + 1); } }
  if (action === 'save') { if (await persist()) notify('Your portfolio draft is saved.'); }
  if (action === 'preview') { if (await persist()) location.href = previewUrl(null); }
  if (action === 'add-work') openWork();
  if (action === 'start-collection') starterCollection();
  if (action === 'reorder') { state.reorder = !state.reorder; state.query = ''; state.type = 'all'; renderMain(); if (state.reorder) animateEnter('filter'); }
  if (action === 'add-skill') addSkill();
  if (action === 'close-modal') closeModal();
  if (action === 'clear-work-image' && editWork) { imageToken++; editWork.image = ''; $('#pb-work-image-preview').innerHTML = `${i('camera')}<strong>Upload a cover image</strong><small>JPG, PNG or WebP · up to 5 MB</small>`; const input = $('#pb-work-image'); if (input) input.value = ''; const submit = $('#pb-work-form [type="submit"]'); if (submit) submit.disabled = false; }
  if (action === 'create-preview') await createPreview();
  if (action === 'share') showShare();
  if (action === 'open-saved') location.href = previewUrl();
  if (action === 'copy-share') await copyLink($('#pb-share-url').value, target);
  if (action === 'copy-other') await copyLink($('#pb-share-other').value, target);
  if (action === 'reset-style') { state.portfolio.style = normalizePortfolio({}).style; changed(); renderMain(); notify('Style reset to the Showlio defaults.'); }
  if (action === 'download-qr') { download(createQrSvg(target.dataset.qrLink), 'image/svg+xml', `${state.snapshot.profile.slug}-qr.svg`); notify('QR code downloaded.'); }
  if (action === 'toggle-preview') { state.mobilePreview = !state.mobilePreview; state.device = 'mobile'; render(); }
  if (action === 'export') {
    target.disabled = true;
    try { const { exportPortfolio } = await import('./portfolio-export.js'); const html = await exportPortfolio(state.snapshot); download(html, 'text/html;charset=utf-8', `${state.snapshot.profile.slug}-portfolio.html`); notify('Portfolio HTML downloaded.'); }
    catch { notify('The export could not be created. Keep this page open and try again.'); } finally { if (target.isConnected) target.disabled = false; }
  }
});
document.addEventListener('dragstart', event => {
  const card = event.target.closest('.pb-work-card[draggable="true"]');
  if (card) { dragId = card.dataset.workId; card.classList.add('is-dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragId); }
});
document.addEventListener('dragover', event => {
  const upload = event.target.closest('.pb-upload');
  const card = dragId && event.target.closest('.pb-work-card');
  if (upload || card) event.preventDefault();
  document.querySelectorAll('.pb-upload.is-dragover, .pb-work-card.is-drop-target').forEach(node => { if (node !== upload && node !== card) node.classList.remove('is-dragover', 'is-drop-target'); });
  upload?.classList.add('is-dragover');
  if (card && card.dataset.workId !== dragId) card.classList.add('is-drop-target');
});
document.addEventListener('drop', event => {
  const upload = event.target.closest('.pb-upload');
  if (upload && event.dataTransfer.files[0]) {
    event.preventDefault();
    const input = upload.querySelector('input[type="file"]');
    if (input?.id === 'pb-work-image') handleWorkImage(event.dataTransfer.files[0]);
    else if (input?.dataset.imageTarget) {
      const field = input.dataset.imageTarget;
      setIdentityImage(field, event.dataTransfer.files[0]);
    }
    return;
  }
  const card = event.target.closest('.pb-work-card');
  if (dragId && card && state.reorder) {
    event.preventDefault();
    const works = state.portfolio.works;
    const from = works.findIndex(work => work.id === dragId), to = works.findIndex(work => work.id === card.dataset.workId);
    if (from >= 0 && to >= 0 && from !== to) { const [work] = works.splice(from, 1); works.splice(to, 0, work); changed(); renderMain(); }
    dragId = null;
  }
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.is-dragging, .is-drop-target, .is-dragover').forEach(node => node.classList.remove('is-dragging', 'is-drop-target', 'is-dragover'));
});
window.addEventListener('hashchange', () => { const index = hashes.indexOf(location.hash.slice(1)); if (index >= 0) goStep(index); });
window.addEventListener('beforeunload', event => { if (state.dirty || pendingImages) { event.preventDefault(); event.returnValue = ''; } });

async function start() {
  const [loaded, draft] = await Promise.all([accountRequest('GET'), loadDraft().catch(() => { status('Storage unavailable', 'is-error'); return null; })]);
  account = loaded.ok ? loaded.data.profile : null;
  state.portfolio = draft;
  if (!state.portfolio) {
    state.portfolio = createPortfolio(account ? { ...account, role: account.headline, slug: slugFor(account.username) } : {});
    if (account) state.portfolio.profile.availability = availabilityLabel(account.availability);
    changed({ sync: false });
  } else if (account && applyAccount()) changed({ sync: false });
  else status('Draft saved');
  if (!account) notify(loaded.data.error ?? 'Your Showlio profile couldn’t be loaded, so changes stay in this browser for now.');
  try { state.snapshot = await loadSnapshot(state.portfolio.profile.slug); } catch { /* The draft remains editable when storage is blocked. */ }
  state.step = Math.max(0, hashes.indexOf(location.hash.slice(1)));
  render();
  animateEnter('first');
}
start();
