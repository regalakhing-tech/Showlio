import { icon, esc, avatar, initials, resizeImage, compact, withPreservedFocus } from './workspace-shared.js';
import { people, personById, addPeople, disciplines } from './workspace-data.js';
import { createWorkspaceState, normalizeProfile, profileCompletion, serializeWorkspace } from './workspace-model.js';
import { renderExplore, projectCover } from './workspace-explore.js';
import { renderNotifications } from './workspace-notifications.js';
import { renderSettings, bindSettings } from './workspace-settings.js';
import { openProjectComposer, galleryMarkup, bindGallery } from './workspace-composer.js';
import { slotHeaders, rememberSlot, forgetSlot, currentSlot, answerSessionChecks, sessionUsedElsewhere } from './session-slot.js';
import { projectViewMarkup, actionsMarkup, commentsMarkup } from './workspace-project-view.js';
import { renderPortfolio, renderSaved } from './workspace-library.js';
import { creatorMarkup } from './workspace-creator.js';

const stop = () => new Promise(() => {}); // Never settles: halts this module while the browser leaves or shows an error.
// Talks to the PHP API with the HttpOnly session cookie. A lost session goes back to sign-in.
async function api(path, method = 'GET', body) {
  try {
    const response = await fetch(`/api/${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...slotHeaders() }, body: body && JSON.stringify(body) });
    rememberSlot(response);
    if (response.status === 401) { location.replace('/auth/#sign-in'); await stop(); }
    return { ok: response.ok, data: await response.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'Can’t reach Showlio. Check your connection and try again.' } };
  }
}
answerSessionChecks();
const errorOf = (data) => Object.values(data.errors ?? {})[0] ?? data.error ?? 'Something went wrong. Try again in a moment.';

// The signed-in creator's profile, the community feed and their notifications, fetched together.
const [loaded, feed, inbox] = await Promise.all([api('profile'), api('feed'), api('notifications')]);
if (!loaded.ok) {
  document.querySelector('#workspace-view').innerHTML = `<p class="ws-load-error" role="alert">${esc(errorOf(loaded.data))} <a href="/app/">Reload</a></p>`;
  await stop();
}
const $ = (selector) => document.querySelector(selector);
const storageKey = 'showlio-demo-workspace-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { saved = {}; }
const state = createWorkspaceState(saved);
state.projects = [];
state.customProjects = [];
function applyAccount({ profile, preferences }) {
  state.profile = profile;
  state.draft = structuredClone(profile);
  Object.assign(state.preferences, preferences);
}
applyAccount(loaded.data);
// Real likes, saves and follows come from the account; sample ones stay in this browser.
function applyFeed({ projects, creators, likes, bookmarks, following }) {
  addPeople(creators);
  state.creatorIds = creators.map(creator => creator.id);
  state.projects = projects;
  for (const [key, ids] of [['likes', likes], ['bookmarks', bookmarks], ['following', following]]) state[key] = [...new Set([...state[key], ...ids])];
}
state.creatorIds = [];
if (feed.ok) applyFeed(feed.data);
if (inbox.ok) { state.notifications = inbox.data.notifications; state.followers = inbox.data.followers; }
const dialog = $('#workspace-dialog');
const view = $('#workspace-view');
let focusBeforeDialog;
let toastTimer;
function notify(message) {
  if (dialog.open) { $('#ws-modal-feedback').textContent = message; return; }
  const toast = $('#workspace-toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}
function persist() {
  try {
    if (!state.preferences.rememberWorkspace) { localStorage.removeItem(storageKey); return false; }
    localStorage.setItem(storageKey, JSON.stringify(serializeWorkspace(state)));
    return true;
  } catch { return false; }
}
function closeModal() { dialog.close(); }
function openModal(title, body, { wide = false } = {}) {
  if (!dialog.open) focusBeforeDialog = document.activeElement;
  dialog.classList.toggle('ws-dialog-wide', wide);
  $('#ws-modal-title').textContent = title;
  withPreservedFocus($('#ws-modal-content'), () => { $('#ws-modal-content').innerHTML = `${body}<p id="ws-modal-feedback" class="ws-modal-note" role="status" aria-live="polite"></p>`; }, $('#ws-modal-close'));
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('ws-dialog-open');
  return $('#ws-modal-content');
}
$('#ws-modal-close').addEventListener('click', closeModal);
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  document.body.classList.remove('ws-dialog-open');
  if (focusBeforeDialog?.isConnected) focusBeforeDialog.focus();
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
});
function previewProfile(profile) {
  let valid;
  try { valid = normalizeProfile(profile); } catch (error) { notify(error.message); return; }
  openModal('Public profile preview', `<div class="ws-modal-person">${avatar(valid)}<div><h3>${esc(valid.name)}</h3><p>${esc(valid.headline)}</p></div></div><p>${esc(valid.location)}</p><p style="margin-top:15px">${esc(valid.bio)}</p><div class="ws-pills">${valid.skills.map(skill => `<span class="ws-pill">${esc(skill)}</span>`).join('')}</div><p class="ws-modal-note">${valid.visible ? 'Your profile is public once saved.' : 'Your profile is private. Turn on Profile visibility in Settings to share it.'}</p>`);
}
// Creator profiles: what the workspace knows shows at once, then the full details
// (skills, links, projects, totals) from their portfolio. Each open asks again, so
// follows, edits and new projects show up.
const portfolios = new Map(); // username → /api/portfolio answer, or null when it failed
async function showPerson(id, refresh = true) {
  const self = id === 'self';
  const person = self ? { ...state.profile, id: 'self', role: state.profile.headline, hue: 220, real: true } : personById(id);
  if (!person) return;
  if (!person.real) { showSamplePerson(person); return; }
  const draw = () => openModal(self ? 'Your profile' : 'Creator profile', creatorMarkup(person, portfolios.get(person.username), { self, following: state.following.includes(person.id), feed: state.projects }), { wide: true });
  draw();
  if (!refresh && portfolios.get(person.username)) return;
  const { ok, data } = await api(`portfolio?u=${encodeURIComponent(person.username)}`);
  if (ok || !portfolios.get(person.username)) portfolios.set(person.username, ok ? data : null);
  if (dialog.open && $('#ws-modal-content [data-creator]')?.dataset.creator === person.username) draw();
}
function showSamplePerson(person) {
  const work = state.projects.filter(item => item.creator === person.id);
  const follows = state.following.includes(person.id);
  const about = 'A sample creator sharing their work, ideas, and creative process with the Showlio community.';
  const note = 'Sample creator. Following is kept in this browser only.';
  openModal('Creator profile', `<div class="ws-modal-person">${avatar(person)}<div><h3>${esc(person.name)}</h3><p>${esc(person.role)}</p></div></div><p>${esc(about)}</p>${work.length ? `<h4 class="ws-modal-subhead">Portfolio</h4><div class="ws-modal-work">${work.map(item => `<button data-project="${esc(item.id)}"><span class="ws-modal-work-cover">${projectCover(item)}</span><strong>${esc(item.title)}</strong><small>${esc(item.categories[0])}</small></button>`).join('')}</div>` : ''}<div class="ws-modal-actions"><button class="ws-btn ws-primary" data-follow="${esc(person.id)}" aria-pressed="${follows}">${follows ? `${icon('check')} Following` : 'Follow creator'}</button></div><p class="ws-modal-note">${esc(note)}</p>`);
}
const viewed = new Set();
const comments = new Map(); // project id → comments once loaded (null if loading failed)
const openProjectView = (id) => dialog.open ? dialog.querySelector(`[data-project-view="${CSS.escape(id)}"]`) : null;
function paintComments(id) {
  const view = openProjectView(id);
  const project = state.projects.find(item => item.id === id);
  if (!view || !project) return;
  view.querySelector('[data-comment-list]').innerHTML = commentsMarkup(comments.get(id));
  view.querySelector('[data-comment-count]').textContent = compact(project.comments);
}
async function loadComments(id) {
  const { ok, data } = await api(`projects/comments?project=${encodeURIComponent(id)}`);
  comments.set(id, ok ? data.comments : null);
  paintComments(id);
}
function showProject(id, focusComments = false) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  // Count one view per project per visit; creators' views of their own work don't count.
  if (project.real && !project.owner && !viewed.has(id)) { viewed.add(id); project.views += 1; api('projects/view', 'POST', { id }); }
  const person = project.owner ? { ...state.profile, role: state.profile.headline } : personById(project.creator);
  const content = openModal(project.title, projectViewMarkup(project, person, state, comments.get(id)), { wide: true });
  if (project.images?.length > 1) bindGallery(content, project.images, project.title);
  if (project.real && !comments.has(id)) loadComments(id);
  const form = content.querySelector('[data-comment-form]');
  if (!form) return;
  const input = form.elements.body;
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener('input', grow);
  // Enter posts; Shift+Enter adds a new line.
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) { input.focus(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = input.disabled = true;
    const { ok, data } = await api('projects/comments', 'POST', { project: id, body });
    button.disabled = input.disabled = false;
    if (!ok) { notify(errorOf(data)); input.focus(); return; }
    comments.set(id, [...(comments.get(id) ?? []), data.comment]);
    project.comments += 1;
    input.value = '';
    grow();
    paintComments(id);
    renderView();
    openProjectView(id)?.querySelector('[data-comment-list] li:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input.focus();
  });
  if (focusComments) setTimeout(() => (comments.get(id) !== undefined || project.real ? input.focus() : null), 50);
}
async function deleteComment(commentId) {
  const project = state.projects.find(item => comments.get(item.id)?.some(comment => comment.id === commentId));
  if (!project || !confirm('Delete this comment?')) return;
  const { ok, data } = await api(`projects/comments?id=${encodeURIComponent(commentId)}`, 'DELETE');
  if (!ok) { notify(errorOf(data)); return; }
  comments.set(project.id, comments.get(project.id).filter(comment => comment.id !== commentId));
  project.comments = Math.max(0, project.comments - 1);
  paintComments(project.id);
  renderView();
}
// Signing out of a tab leaves other tabs signed in. When another open tab still uses this
// account, this tab only lets go of it; the last tab using it really signs it out.
async function signOut() {
  const slot = currentSlot();
  if (!(await sessionUsedElsewhere(slot))) {
    await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json', ...slotHeaders() }, body: '{}' }).catch(() => {});
  }
  forgetSlot();
  location.replace('/auth/#sign-in');
}
async function deleteProject(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project?.owner || !project.real || !confirm(`Delete “${project.title}”? This can’t be undone.`)) return;
  const { ok, data } = await api(`projects?id=${encodeURIComponent(id)}`, 'DELETE');
  if (!ok) { notify(errorOf(data)); return; }
  state.projects = state.projects.filter(item => item.id !== id);
  for (const key of ['likes', 'bookmarks']) state[key] = state[key].filter(value => value !== id);
  closeModal(); render(); notify('Project deleted.');
}
function shareProject() {
  openProjectComposer({
    state, openModal, api, errorOf,
    // The feed behind the dialog updates straight away; the dialog shows the success screen.
    onPublished(project, profilePublic) {
      if (profilePublic) { state.profile.visible = true; state.draft.visible = true; }
      state.projects.unshift(project);
      state.feed = { ...state.feed, query: '', category: 'All', savedOnly: false, mineOnly: true };
      state.page = 'explore';
      if (location.hash !== '#explore') history.pushState(null, '', '#explore');
      render();
    },
    onView: (id) => showProject(id),
    onDone: () => closeModal(),
  });
}
// Notifications change on the server first; the list updates as soon as the click lands
// and goes back if the server says no.
async function changeNotification(id, change) {
  const item = state.notifications.find(entry => entry.id === id);
  if (!item) return;
  const before = { unread: item.unread, saved: item.saved };
  if ('read' in change) item.unread = !change.read;
  if ('saved' in change) item.saved = change.saved;
  render();
  const { ok, data } = await api('notifications', 'PATCH', { id, ...change });
  if (!ok) { Object.assign(item, before); render(); notify(errorOf(data)); return false; }
  return true;
}
async function deleteNotification(id) {
  const index = state.notifications.findIndex(entry => entry.id === id);
  if (index < 0) return;
  const [item] = state.notifications.splice(index, 1);
  render();
  const { ok, data } = await api(`notifications?id=${encodeURIComponent(id)}`, 'DELETE');
  if (!ok) { state.notifications.splice(index, 0, item); render(); notify(errorOf(data)); return; }
  notify('Notification deleted.');
}
async function markAllRead() {
  const unread = state.notifications.filter(item => item.unread);
  if (!unread.length) return;
  for (const item of unread) item.unread = false;
  render();
  const { ok, data } = await api('notifications', 'PATCH', { all: true });
  if (!ok) { for (const item of unread) item.unread = true; render(); notify(errorOf(data)); return; }
  notify('All notifications marked as read.');
}
// Opening a notification marks it read and shows what it is about.
function openNotification(id) {
  const item = state.notifications.find(entry => entry.id === id);
  if (!item) return;
  if (item.unread) changeNotification(id, { read: true });
  if (item.type === 'follow' && item.actor) {
    if (!personById(item.actor.id)?.real) addPeople([{ ...item.actor, real: true }]);
    showPerson(item.actor.id);
    return;
  }
  if (item.project && state.projects.some(project => project.id === item.project.id)) { showProject(item.project.id, item.type === 'comment'); return; }
  if (item.project) notify('That project is no longer available.');
}
async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); notify('Portfolio link copied.'); }
  catch { const input = $('#ws-cp-url'); input?.focus(); input?.select(); notify('Select the link and copy it with your keyboard.'); }
}
function showCreators() { const members=people.filter(person=>person.real); if(!members.length){openModal('Discover creators','<p>No other creators have shared their work yet. Invite a friend to join Showlio.</p>');return;} openModal('Discover creators',members.slice(0,12).map(person=>`<button class="ws-result-person" data-person="${esc(person.id)}">${avatar(person)}<span><strong>${esc(person.name)}</strong><small>${esc(person.role)}</small></span>${icon('chevron')}</button>`).join('')); }
function closeMenu() {
  const wasOpen = document.body.classList.contains('ws-nav-open');
  const focusInMenu = $('#workspace-sidebar').contains(document.activeElement) || document.activeElement.classList.contains('ws-mobile-shade');
  document.body.classList.remove('ws-nav-open');
  $('#ws-mobile-menu')?.setAttribute('aria-expanded','false');
  if (wasOpen && focusInMenu) $('#ws-mobile-menu')?.focus();
}
function navigate(page) {
  closeMenu();
  if (dialog.open) closeModal();
  state.page=page;
  if (location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
// Likes, saves and follows switch at once. Real projects and creators are then saved to the
// account and put back if that fails; sample ones stay in this browser.
const reactions = { like: ['likes', 'projects/like', 'liked'], bookmark: ['bookmarks', 'projects/save', 'saved'], follow: ['following', 'creators/follow', 'following'] };
async function react(kind, id) {
  const [key, path, field] = reactions[kind];
  const set = (on) => { state[key] = on ? [...new Set([...state[key], id])] : state[key].filter(value => value !== id); };
  const refresh = () => {
    renderView();
    const view = dialog.open ? dialog.querySelector('[data-project-view]') : null;
    if (view) {
      const project = state.projects.find(item => item.id === view.dataset.projectView);
      view.querySelector('[data-pv-actions]').innerHTML = actionsMarkup(project, state);
      const follow = view.querySelector('[data-follow]');
      if (follow) { const on = state.following.includes(follow.dataset.follow); follow.className = `ws-btn ${on ? 'ws-soft' : 'ws-primary'} ws-pv-follow`; follow.setAttribute('aria-pressed', String(on)); follow.innerHTML = on ? `${icon('check')}Following` : `${icon('plus')}Follow`; }
    } else if (dialog.open) { if (kind === 'follow') showPerson(id, false); else showProject(id); }
  };
  const on = !state[key].includes(id);
  set(on);
  state.popped = on && kind !== 'follow' ? `${kind}:${id}` : '';
  refresh();
  const subject = kind === 'follow' ? personById(id) : state.projects.find(item => item.id === id);
  const message = (now) => kind === 'follow' ? `${now ? 'Following' : 'Unfollowed'} ${subject.name}.` : kind === 'bookmark' ? (now ? 'Project saved.' : 'Project removed from saved.') : (now ? 'You liked this project.' : 'Like removed.');
  if (!subject?.real) { persist(); if (!dialog.open) notify(message(on)); return; }
  const { ok, data } = await api(path, 'POST', { id });
  if (!ok) { set(!on); state.popped = ''; refresh(); notify(errorOf(data)); return; }
  set(data[field]);
  // Cards add the viewer's own like on top of the count, as they do for sample projects.
  if (kind === 'like') subject.likes = Math.max(0, data.likes - (data.liked ? 1 : 0));
  if (kind === 'bookmark') subject.saves = data.saves;
  if (kind === 'follow') subject.followers = data.followers;
  persist(); refresh(); if (!dialog.open) notify(message(data[field]));
}
const actions = {
  notify, openModal, closeModal, previewProfile,
  readAvatar: (file) => resizeImage(file, 512),
  refresh: () => render(),
  setSettingsTab(tab) { state.settingsTab=tab; renderView(); },
  // Only a newly chosen photo (a data URL) is uploaded; otherwise the saved one stays.
  async saveProfile(profile) {
    const { ok, data } = await api('profile', 'PUT', { ...profile, avatar: profile.avatar?.startsWith('data:') ? profile.avatar : undefined });
    if (!ok) { notify(errorOf(data)); return false; }
    applyAccount(data); render(); notify('Profile saved.'); return true;
  },
  // Remember-workspace is a browser setting; every other switch is saved to the account.
  async updatePreference(name,value) {
    if (!(name in state.preferences)||typeof value!=='boolean')return;
    state.preferences[name]=value;
    if (name==='rememberWorkspace') { persist(); notify(value?'Workspace preferences will be remembered on this browser.':'Remembering disabled. Changes now last for this session.'); return; }
    const { ok, data } = await api('profile/preferences', 'PATCH', { [name]: value });
    if (!ok) { state.preferences[name]=!value; render(); notify(errorOf(data)); return; }
    Object.assign(state.preferences, data.preferences); render(); notify('Setting saved.');
  },
};
function renderHeader() {
  const unread=state.notifications.filter(item=>item.unread).length;
  $('#workspace-header').innerHTML=`<div class="ws-header-inner"><a class="ws-brand" href="/" aria-label="Showlio home"><img src="/assets/images/showlio-logo-sm.webp" alt="Showlio" width="651" height="217"></a><form class="ws-global-search" id="ws-search-form" role="search">${icon('search')}<input id="ws-search-input" type="search" value="${esc(state.feed.query)}" placeholder="Search portfolios, skills or creators…" aria-label="Search portfolios and creators"></form><div class="ws-header-actions"><button class="ws-menu-button" id="ws-mobile-menu" aria-label="Toggle workspace navigation" aria-controls="workspace-sidebar" aria-expanded="false">${icon('menu')}</button><a href="#notifications" aria-label="Notifications${unread?`, ${unread} unread`:''}">${icon('bell')}${unread?'<i class="ws-notification-dot"></i>':''}</a><button data-action="messages" aria-label="Messages">${icon('message')}</button><button class="ws-account" data-action="account" aria-label="Account menu">${avatar(state.profile)}${icon('chevron-down')}</button></div></div>`;
}
function renderSidebar() {
  const profile=state.profile;
  const isAvailable=profile.availability==='available';
  const unread=state.notifications.filter(item=>item.unread).length;
  const nav=[['grid','Explore','explore'],['folder','My portfolio','projects'],['bookmark','Saved','saved'],['bell','Notifications','notifications'],['message','Messages','messages'],['settings','Settings','settings']];
  const completion=profileCompletion(profile,state.projects.some(project=>project.owner));
  $('#workspace-sidebar').innerHTML=`<img class="ws-cover" src="/assets/images/thumbs/workspace-mountains-cover.webp" alt="Alpine mountains at sunset" width="302" height="130"><div class="ws-profile-content"><div class="ws-profile-top"><div class="ws-avatar-wrap">${profile.avatar?`<img class="ws-main-avatar" src="${esc(profile.avatar)}" alt="${esc(profile.name)}" width="120" height="120">`:`<span class="ws-main-avatar ws-monogram" style="--hue:220" role="img" aria-label="${esc(profile.name)}">${esc(initials(profile.name))}</span>`}<button class="ws-avatar-camera" data-action="edit-photo" aria-label="Change profile photo">${icon('camera')}</button></div>${state.preferences.showAvailability?`<span class="ws-available ${isAvailable?'':'is-busy'}"><i></i>${isAvailable?'Available':profile.availability==='showcasing'?'Showcasing':'Unavailable'}</span>`:''}</div><h2 class="ws-profile-name">${esc(profile.name)}</h2><p class="ws-profile-headline">${esc(profile.headline||`@${profile.username}`)}</p><p class="ws-profile-location">${icon('pin')} ${esc(profile.location||'Location not set')}</p><p class="ws-profile-bio">${esc(profile.bio||'Add a short bio in Settings so people know what you create.')}</p><div class="ws-completion"><div><span>Profile completion</span><b>${completion}%</b></div><span class="ws-progress" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion}"><span style="width:${completion}%"></span></span>${completion<100?`<button class="ws-completion-link" data-action="complete-profile">Complete your profile ${icon('arrow')}</button>`:''}</div></div><a class="ws-btn ws-primary ws-create-portfolio" href="/portfolio/">${icon("plus")} Create portfolio</a><nav class="ws-nav" aria-label="Workspace navigation">${nav.map(([symbol,label,target])=>{const active=(target===state.page&&!state.feed.savedOnly&&!state.feed.mineOnly)||(target==='saved'&&state.page==='explore'&&state.feed.savedOnly)||(target==='projects'&&state.page==='explore'&&state.feed.mineOnly);return `<button class="${active?'active':''}" data-nav="${target}" ${active?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span>${target==='notifications'&&unread?`<b class="ws-nav-count" aria-label="${unread} unread">${unread}</b>`:''}</button>`;}).join('')}</nav><p class="ws-demo-note">Explore shows sample creators and projects</p>`;
}
let lastViewKey='';
function renderView() {
  const key=JSON.stringify([state.page,state.feed.category,state.feed.sort,state.feed.query,state.feed.savedOnly,state.feed.mineOnly,state.notificationTab,state.settingsTab]);
  view.classList.toggle('ws-enter',key!==lastViewKey);
  lastViewKey=key;
  withPreservedFocus(view, () => {
    view.innerHTML=state.page==='settings'?renderSettings(state):state.page==='notifications'?renderNotifications(state):state.feed.mineOnly?renderPortfolio(state):state.feed.savedOnly?renderSaved(state):renderExplore(state);
    if(state.page==='settings')bindSettings(view,state,actions);
  });
  state.popped='';
  document.title=`Showlio — ${state.page==='settings'?'Account settings':state.page==='notifications'?'Notifications & activity':state.feed.mineOnly?'My portfolio':state.feed.savedOnly?'Saved projects':'Explore portfolios'}`;
}
function render() { withPreservedFocus(document, () => { renderHeader(); renderSidebar(); renderView(); }, view); }
const shade=document.createElement('button'); shade.className='ws-mobile-shade'; shade.setAttribute('aria-label','Close navigation'); document.body.append(shade); shade.addEventListener('click',closeMenu);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
document.addEventListener('input',event=>{if(event.target.id==='ws-search-input'){state.feed.query=event.target.value;if(state.page==='explore')renderView();}});
document.addEventListener('submit',event=>{if(event.target.id==='ws-search-form'){event.preventDefault();state.feed.query=$('#ws-search-input').value;state.feed.category='All';navigate('explore');}});
document.addEventListener('change',event=>{
  if(event.target.id==='ws-collection'){state.feed.mineOnly=event.target.value==='mine';state.feed.savedOnly=event.target.value==='saved';render();}
  if(event.target.id==='ws-only-saved'){state.feed.savedOnly=event.target.checked;render();}
});
document.addEventListener('click',event=>{
  if (event.target.closest('.ws-skip')) { event.preventDefault(); closeMenu(); view.focus(); return; }
  const button=event.target.closest('button'); if(!button)return;
  if(button.id==='ws-mobile-menu'){const open=!document.body.classList.contains('ws-nav-open');document.body.classList.toggle('ws-nav-open',open);button.setAttribute('aria-expanded',String(open));return;}
  const nav=button.dataset.nav;
  if(nav){
    if(['explore','projects','saved'].includes(nav)){state.feed={...state.feed,category:'All',query:'',mineOnly:nav==='projects',savedOnly:nav==='saved'};navigate('explore');}
    else if(nav==='messages')openModal('Your messages','<p>Your demo inbox is quiet for now. Connected messaging is not available yet.</p><p class="ws-modal-note">No message is sent or received by this preview.</p>');
    else navigate(nav);
    return;
  }
  if(button.dataset.category){state.feed.category=button.dataset.category;if(dialog.open)closeModal();navigate('explore');return;}
  if(button.dataset.sort){state.feed.sort=button.dataset.sort;renderView();return;}
  if(button.dataset.notificationTab){state.notificationTab=button.dataset.notificationTab;renderView();return;}
  if(button.dataset.project){showProject(button.dataset.project);return;}
  if(button.dataset.comments){showProject(button.dataset.comments,true);return;}
  if(button.dataset.person){showPerson(button.dataset.person);return;}
  if(button.dataset.copyLink){copyLink(button.dataset.copyLink);return;}
  for(const kind of ['follow','bookmark','like'])if(button.dataset[kind]){react(kind,button.dataset[kind]);return;}
  if(button.dataset.deleteProject){deleteProject(button.dataset.deleteProject);return;}
  if(button.dataset.deleteComment){deleteComment(button.dataset.deleteComment);return;}
  if(button.dataset.noteOpen){openNotification(button.dataset.noteOpen);return;}
  if(button.dataset.noteSave){const item=state.notifications.find(entry=>entry.id===button.dataset.noteSave);if(item)changeNotification(item.id,{saved:!item.saved}).then(ok=>ok&&notify(item.saved?'Notification saved.':'Removed from saved.'));return;}
  if(button.dataset.noteRead){const item=state.notifications.find(entry=>entry.id===button.dataset.noteRead);if(item)changeNotification(item.id,{read:item.unread});return;}
  if(button.dataset.noteDelete){deleteNotification(button.dataset.noteDelete);return;}
  const action=button.dataset.action;
  if(action==='share')shareProject();
  if(action==='filter'){state.feed.filtersOpen=!state.feed.filtersOpen;renderView();}
  if(action==='clear-filters'){state.feed={query:'',category:'All',sort:'for-you',savedOnly:false,mineOnly:false,filtersOpen:false};render();}
  if(action==='clear-search'){state.feed.query='';render();$('#ws-search-input')?.focus();}
  if(action==='more-categories'||action==='collections')openModal('Explore collections','<p>Browse portfolios by the kind of work you need.</p><div class="ws-modal-actions">'+disciplines.map(item=>`<button class="ws-btn ws-soft" data-category="${item.id}">${icon(item.icon)} ${item.id}</button>`).join('')+'</div>');
  if(action==='creators')showCreators();
  if(action==='mark-read')markAllRead();
  if(action==='notification-settings'){state.settingsTab='notifications';navigate('settings');}
  if(action==='make-public'){state.settingsTab='privacy';navigate('settings');}
  if(action==='complete-profile'){state.settingsTab='profile';navigate('settings');}
  if(action==='edit-photo'){state.settingsTab='profile';navigate('settings');view.querySelector('[data-avatar-input]')?.click();}
  if(action==='muted')openModal('Muted accounts','<p>You haven’t muted anyone in this demo.</p><p class="ws-modal-note">Connected moderation tools will become available with live accounts.</p>');
  if(action==='safety')openModal('Help & safety','<p>Share work you own, credit your collaborators, and keep personal information private. This workspace contains fictional profiles and sample activity.</p>');
  if(action==='messages')openModal('Your messages','<p>Your demo inbox is quiet for now. Connected messaging is not available yet.</p>');
  if(action==='account'){const modal=openModal('Your workspace',`<div class="ws-modal-person">${avatar(state.profile)}<div><h3>${esc(state.profile.name)}</h3><p>${esc(state.profile.email)}</p></div></div><div class="ws-modal-actions"><button class="ws-btn ws-soft" id="ws-account-settings">${icon('settings')} Account settings</button><button class="ws-btn ws-outline" id="ws-switch-account">${icon('users')} Use another account</button><button class="ws-btn ws-outline" id="ws-sign-out">${icon('logout')} Sign out</button></div><p class="ws-modal-note">Both only affect this tab: your other tabs stay signed in to their accounts.</p>`);modal.querySelector('#ws-account-settings').addEventListener('click',()=>{closeModal();navigate('settings');});modal.querySelector('#ws-switch-account').addEventListener('click',()=>{forgetSlot();location.assign('/auth/#sign-in');});modal.querySelector('#ws-sign-out').addEventListener('click',()=>signOut());}
});
window.addEventListener('hashchange',()=>{state.page=['explore','notifications','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'explore';render();window.scrollTo({top:0,behavior:'instant'});});
state.page=['explore','notifications','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'explore';
document.body.classList.add('ws-booting');
render();
if (!feed.ok) notify(`Community projects didn’t load: ${errorOf(feed.data)}`);
setTimeout(()=>document.body.classList.remove('ws-booting'),1800);
