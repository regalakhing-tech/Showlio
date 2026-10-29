import { icon, esc, avatar, readImage, compact, withPreservedFocus } from './workspace-shared.js';
import { defaultProfile, people, personById, companies, disciplines } from './workspace-data.js';
import { createWorkspaceState, normalizeProfile, profileCompletion, markAllRead, serializeWorkspace } from './workspace-model.js';
import { renderExplore, projectCover } from './workspace-explore.js';
import { renderNotifications, companyMark } from './workspace-notifications.js';
import { renderSettings, bindSettings } from './workspace-settings.js';

const $ = (selector) => document.querySelector(selector);
const storageKey = 'showlio-demo-workspace-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { saved = {}; }
const state = createWorkspaceState(saved);
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
function openModal(title, body) {
  if (!dialog.open) focusBeforeDialog = document.activeElement;
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
  openModal('Public profile preview', `<div class="ws-modal-person">${avatar(valid)}<div><h3>${esc(valid.name)}</h3><p>${esc(valid.headline)}</p></div></div><p>${esc(valid.location)}</p><p style="margin-top:15px">${esc(valid.bio)}</p><div class="ws-pills">${valid.skills.map(skill => `<span class="ws-pill">${esc(skill)}</span>`).join('')}</div><p class="ws-modal-note">${valid.visible ? 'Visible in this demo preview.' : 'Private demo preview.'} Nothing is published to a live community.</p>`);
}
function showPerson(id) {
  if (id === 'self') { previewProfile(state.profile); return; }
  const person = personById(id);
  const work = state.projects.filter(item => item.creator === person.id);
  openModal('Creator profile', `<div class="ws-modal-person">${avatar(person)}<div><h3>${person.name}</h3><p>${person.role}</p></div></div><p>A sample creator sharing their work, ideas, and creative process with the Showlio community.</p>${work.length ? `<h4 class="ws-modal-subhead">Portfolio</h4><div class="ws-modal-work">${work.map(item => `<button data-project="${item.id}"><span class="ws-modal-work-cover">${projectCover(item)}</span><strong>${esc(item.title)}</strong><small>${esc(item.categories[0])}</small></button>`).join('')}</div>` : ''}<div class="ws-modal-actions"><button class="ws-btn ws-primary" data-follow="${person.id}" aria-pressed="${state.following.includes(person.id)}">${state.following.includes(person.id) ? 'Following' : 'Follow creator'}</button></div><p class="ws-modal-note">Illustrative creator. Following is stored only in this demo.</p>`);
}
function showProject(id, comments = false) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  const person = project.owner ? { ...state.profile, role: state.profile.headline } : personById(project.creator);
  openModal(comments ? `Comments on ${project.title}` : project.title, `<div class="ws-modal-photo">${projectCover({ ...project, image: project.image.replace('/thumbs/', '/') }, 'modal')}</div><div class="ws-modal-person">${avatar(person)}<div><h3>${esc(person.name)}</h3><p>${esc(person.role)}</p></div></div><p>${esc(project.description)}</p><div class="ws-pills">${[...project.categories, ...(project.tools ?? [])].map((category, index)=>`<span class="ws-pill ${index < project.categories.length ? '' : 'ws-tool-pill'}">${esc(category)}</span>`).join('')}</div>${comments?'<p class="ws-modal-note">Comments are a preview. Live conversations will be available when the community connects.</p>':`<div class="ws-modal-actions"><button class="ws-btn ws-soft" data-bookmark="${project.id}">${icon('bookmark')} ${state.bookmarks.includes(project.id)?'Saved project':'Save project'}</button></div>`}`);
}
function shareProject() {
  const content = openModal('Add a project', `<p>Give your next piece of work a place in your demo portfolio.</p><form id="ws-share-form" style="margin-top:20px"><label class="ws-field">Project title<input name="title" maxlength="80" required placeholder="What have you been creating?"></label><label class="ws-field">Description<textarea name="description" maxlength="300" rows="3" required placeholder="Tell us about the idea and your contribution."></textarea></label><label class="ws-field">Discipline<select name="category">${disciplines.map(item => `<option>${item.id}</option>`).join('')}</select></label><label class="ws-field">Project image (optional)<input type="file" name="image" accept="image/jpeg,image/png,image/webp"></label><p class="ws-modal-note">Images must be under 2 MB. This saves a demo project in this browser; nothing is uploaded.</p><button class="ws-btn ws-primary" type="submit">${icon('plus')} Add to my portfolio</button></form>`);
  content.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.customProjects.length >= 20) { notify('This demo supports up to 20 local projects.'); return; }
    const form = event.target;
    const title = form.elements.title.value.trim();
    const description = form.elements.description.value.trim();
    if (!title || !description) { notify('Add a title and description first.'); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const image = form.elements.image.files[0] ? await readImage(form.elements.image.files[0]) : '/assets/images/workspace-content.webp';
      const project = { id: `local-${crypto.randomUUID()}`, title, description, categories: [form.elements.category.value], tools: [], image, creator: 'self', owner: true, views: 0, likes: 0, comments: 0, created: Date.now() };
      state.customProjects.unshift(project); state.projects.unshift(project);
      state.feed = { ...state.feed, query: '', category: 'All', savedOnly: false, mineOnly: true };
      const stored = persist(); closeModal(); navigate('explore');
      notify(stored ? 'Project added to your demo portfolio.' : 'Project added for this session. Browser storage is unavailable.');
    } catch (error) { notify(error.message); } finally { if (button.isConnected) button.disabled = false; }
  });
}
function reviewRequest(id) {
  const item = state.notifications.find(entry => entry.id === id && entry.type === 'request');
  if (!item) return;
  const company = companies.find(entry => entry.id === item.company);
  const content = openModal(`Collaboration with ${company.name}`, `<div class="ws-modal-person">${companyMark(company)}<div><h3>${company.name}</h3><p>${company.project}</p></div></div><p>We’d love to collaborate on a creative project that brings together thoughtful storytelling and engaging motion design.</p><div class="ws-pills">${company.tags.map(tag=>`<span class="ws-pill">${tag}</span>`).join('')}</div><p class="ws-modal-note">This is a sample request. Accepting changes only its local demo status; no message is sent.</p><div class="ws-modal-actions"><button class="ws-btn ws-primary" id="ws-accept-request">${icon('check')} ${state.requestStatuses[id]==='accepted'?'Accepted in demo':'Accept in demo'}</button><button class="ws-btn ws-outline" data-dismiss="${id}">Dismiss</button></div>`);
  content.querySelector('#ws-accept-request').addEventListener('click', () => {
    state.requestStatuses[id] = 'accepted'; item.unread = false; persist(); closeModal(); render(); notify('Collaboration accepted in this demo.');
  });
}
function notificationOptions(id) {
  const item = state.notifications.find(entry=>entry.id===id);
  if (!item) return;
  const content=openModal('Activity options', `<div class="ws-modal-actions"><button id="ws-read-one" class="ws-btn ws-soft">${icon('check')} Mark as read</button><button id="ws-save-notification" class="ws-btn ws-outline">${icon('bookmark')} ${item.saved?'Unsave notification':'Save notification'}</button></div>`);
  content.querySelector('#ws-read-one').addEventListener('click',()=>{ item.unread=false; persist(); closeModal(); render(); notify('Notification marked as read.'); });
  content.querySelector('#ws-save-notification').addEventListener('click',()=>{ item.saved=!item.saved; persist(); closeModal(); render(); notify(item.saved?'Notification saved.':'Notification removed from saved.'); });
}
function showGroup(group) {
  if (group==='requests') { state.notificationTab='requests'; renderView(); return; }
  const items=state.notifications.filter(item=>group==='followers'?item.type==='follower':group==='reports'?item.type==='report':['follower','like','save','views','comment'].includes(item.type));
  openModal(group==='followers'?'Recent followers':group==='reports'?'Moderation & reports':'Recent activity',items.map(item=> item.type==='follower'?`<button class="ws-result-person" data-person="${item.person}">${avatar(personById(item.person))}<span><strong>${personById(item.person).name}</strong><small>Started following you · ${item.time}</small></span>${icon('chevron')}</button>`:`<div class="ws-group-activity"><strong>${esc(item.title??(item.type==='views'?'Your profile is getting noticed':`${personById(item.person).name} interacted with your work`))}</strong><p>${esc(item.message??'A new moment of creative connection in your demo activity.')}</p><small>${item.time}</small></div>`).join(''));
}
function showCreators() { openModal('Discover creators',people.slice(0,8).map(person=>`<button class="ws-result-person" data-person="${person.id}">${avatar(person)}<span><strong>${person.name}</strong><small>${person.role}</small></span>${icon('chevron')}</button>`).join('')); }
function closeMenu() {
  const wasOpen = document.body.classList.contains('ws-nav-open');
  const focusInMenu = $('#workspace-sidebar').contains(document.activeElement) || document.activeElement.classList.contains('ws-mobile-shade');
  document.body.classList.remove('ws-nav-open');
  $('#ws-mobile-menu')?.setAttribute('aria-expanded','false');
  if (wasOpen && focusInMenu) $('#ws-mobile-menu')?.focus();
}
function navigate(page) {
  closeMenu();
  state.page=page;
  if (location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
const actions = {
  notify, openModal, closeModal, readImage, previewProfile,
  refresh: () => render(),
  setSettingsTab(tab) { state.settingsTab=tab; renderView(); },
  saveProfile(profile) {
    try { state.profile=normalizeProfile(profile); state.draft=structuredClone(state.profile); const stored=persist(); render(); notify(stored?'Profile changes saved in this browser.':'Profile updated for this session. Browser storage is unavailable.'); return true; } catch(error) { notify(error.message); return false; }
  },
  updatePreference(name,value) { if (!(name in state.preferences)||typeof value!=='boolean')return; state.preferences[name]=value; persist(); notify(name==='rememberWorkspace'&&!value?'Remembering disabled. Changes now last for this session.':'Demo preference updated.'); },
};
function renderHeader() {
  const unread=state.notifications.filter(item=>item.unread&&state.requestStatuses[item.id]!=='dismissed').length;
  $('#workspace-header').innerHTML=`<div class="ws-header-inner"><a class="ws-brand" href="/" aria-label="Showlio home"><img src="/assets/images/showlio-logo-sm.webp" alt="Showlio" width="651" height="217"></a><form class="ws-global-search" id="ws-search-form" role="search">${icon('search')}<input id="ws-search-input" type="search" value="${esc(state.feed.query)}" placeholder="Search portfolios, skills or creators…" aria-label="Search portfolios and creators"></form><div class="ws-header-actions"><button class="ws-menu-button" id="ws-mobile-menu" aria-label="Toggle workspace navigation" aria-controls="workspace-sidebar" aria-expanded="false">${icon('menu')}</button><a href="#notifications" aria-label="Notifications${unread?`, ${unread} unread`:''}">${icon('bell')}${unread?'<i class="ws-notification-dot"></i>':''}</a><button data-action="messages" aria-label="Messages">${icon('message')}</button><button class="ws-account" data-action="account" aria-label="Account menu">${avatar(state.profile)}<span class="ws-demo-badge">DEMO</span>${icon('chevron-down')}</button></div></div>`;
}
function renderSidebar() {
  const profile=state.profile;
  const isAvailable=profile.availability==='available';
  const unread=state.notifications.filter(item=>item.unread&&state.requestStatuses[item.id]!=='dismissed').length;
  const nav=[['grid','Explore','explore'],['folder','My portfolio','projects'],['bookmark','Saved','saved'],['bell','Notifications','notifications'],['message','Messages','messages'],['settings','Settings','settings']];
  const completion=profileCompletion(profile,state.customProjects.length>0);
  $('#workspace-sidebar').innerHTML=`<img class="ws-cover" src="/assets/images/thumbs/workspace-mountains-cover.webp" alt="Alpine mountains at sunset" width="302" height="130"><div class="ws-profile-content"><div class="ws-profile-top"><div class="ws-avatar-wrap"><img class="ws-main-avatar" src="${esc(profile.avatar)}" alt="${esc(profile.name)}" width="120" height="120"><button class="ws-avatar-camera" data-action="edit-photo" aria-label="Change profile photo">${icon('camera')}</button></div>${state.preferences.showAvailability?`<span class="ws-available ${isAvailable?'':'is-busy'}"><i></i>${isAvailable?'Available':profile.availability==='showcasing'?'Showcasing':'Unavailable'}</span>`:''}</div><h2 class="ws-profile-name">${esc(profile.name)}</h2><p class="ws-profile-headline">${esc(profile.headline)}</p><p class="ws-profile-location">${icon('pin')} ${esc(profile.location||'Location not set')}</p><p class="ws-profile-bio">${esc(profile.bio===defaultProfile.bio?'I create engaging video content and motion design for brands, startups, and creators.':profile.bio)}</p><div class="ws-completion"><div><span>Profile completion</span><b>${completion}%</b></div><span class="ws-progress" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion}"><span style="width:${completion}%"></span></span></div></div><nav class="ws-nav" aria-label="Workspace navigation">${nav.map(([symbol,label,target])=>{const active=(target===state.page&&!state.feed.savedOnly&&!state.feed.mineOnly)||(target==='saved'&&state.page==='explore'&&state.feed.savedOnly)||(target==='projects'&&state.page==='explore'&&state.feed.mineOnly);return `<button class="${active?'active':''}" data-nav="${target}" ${active?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span>${target==='notifications'&&unread?`<b class="ws-nav-count" aria-label="${unread} unread">${unread}</b>`:''}</button>`;}).join('')}</nav><p class="ws-demo-note">Demo workspace · Local preview only</p>`;
}
let lastViewKey='';
function renderView() {
  const key=JSON.stringify([state.page,state.feed.category,state.feed.sort,state.feed.query,state.feed.savedOnly,state.feed.mineOnly,state.notificationTab,state.settingsTab]);
  view.classList.toggle('ws-enter',key!==lastViewKey);
  lastViewKey=key;
  withPreservedFocus(view, () => {
    view.innerHTML=state.page==='settings'?renderSettings(state):state.page==='notifications'?renderNotifications(state):renderExplore(state);
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
  if(event.target.id==='ws-period'){state.activityPeriod=event.target.value;renderView();}
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
  if(button.dataset.follow){const id=button.dataset.follow;state.following=state.following.includes(id)?state.following.filter(value=>value!==id):[...state.following,id];persist();renderView();if(dialog.open)showPerson(id);else notify(state.following.includes(id)?'Following in this demo.':'Creator unfollowed in this demo.');return;}
  for(const [attribute,key] of [['bookmark','bookmarks'],['like','likes']])if(button.dataset[attribute]){const id=button.dataset[attribute];state[key]=state[key].includes(id)?state[key].filter(value=>value!==id):[...state[key],id];state.popped=state[key].includes(id)?`${attribute}:${id}`:'';persist();renderView();if(dialog.open)showProject(id);else notify(key==='bookmarks'?(state[key].includes(id)?'Project saved.':'Project removed from saved.'):'Project reaction updated.');return;}
  if(button.dataset.review){reviewRequest(button.dataset.review);return;}
  if(button.dataset.dismiss){state.requestStatuses[button.dataset.dismiss]='dismissed';persist();if(dialog.open)closeModal();render();notify('Request dismissed in this demo.');return;}
  if(button.dataset.viewGroup){showGroup(button.dataset.viewGroup);return;}
  if(button.dataset.notificationMenu){notificationOptions(button.dataset.notificationMenu);return;}
  const action=button.dataset.action;
  if(action==='share')shareProject();
  if(action==='filter'){state.feed.filtersOpen=!state.feed.filtersOpen;renderView();}
  if(action==='clear-filters'){state.feed={query:'',category:'All',sort:'for-you',savedOnly:false,mineOnly:false,filtersOpen:false};render();}
  if(action==='clear-search'){state.feed.query='';render();$('#ws-search-input')?.focus();}
  if(action==='more-categories'||action==='collections')openModal('Explore collections','<p>Browse portfolios by the kind of work you need.</p><div class="ws-modal-actions">'+disciplines.map(item=>`<button class="ws-btn ws-soft" data-category="${item.id}">${icon(item.icon)} ${item.id}</button>`).join('')+'</div>');
  if(action==='creators')showCreators();
  if(action==='mark-read'){state.notifications=markAllRead(state.notifications);persist();render();notify('All demo notifications marked as read.');}
  if(action==='notification-settings'){state.settingsTab='notifications';navigate('settings');}
  if(action==='edit-photo'){state.settingsTab='profile';navigate('settings');view.querySelector('[data-avatar-input]')?.click();}
  if(action==='muted')openModal('Muted accounts','<p>You haven’t muted anyone in this demo.</p><p class="ws-modal-note">Connected moderation tools will become available with live accounts.</p>');
  if(action==='safety')openModal('Help & safety','<p>Share work you own, credit your collaborators, and keep personal information private. This workspace contains fictional profiles and sample activity.</p>');
  if(action==='messages')openModal('Your messages','<p>Your demo inbox is quiet for now. Connected messaging is not available yet.</p>');
  if(action==='account')openModal('Your workspace',`<div class="ws-modal-person">${avatar(state.profile)}<div><h3>${esc(state.profile.name)}</h3><p>Demo workspace</p></div></div><div class="ws-modal-actions"><button class="ws-btn ws-soft" id="ws-account-settings">${icon('settings')} Account settings</button><a href="/auth/" class="ws-btn ws-outline">${icon('logout')} Sign out</a></div>`).querySelector('#ws-account-settings').addEventListener('click',()=>{closeModal();navigate('settings');});
});
window.addEventListener('hashchange',()=>{state.page=['explore','notifications','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'explore';render();window.scrollTo({top:0,behavior:'instant'});});
state.page=['explore','notifications','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'explore';
document.body.classList.add('ws-booting');
render();
setTimeout(()=>document.body.classList.remove('ws-booting'),1800);
