import { creators, projects, stories, imagePath, thumbPath, creatorById } from './community.js';
import { initMotion, staggerIn, flip, prefersReducedMotion } from './motion.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
const portrait = (id, className = '') => `<img class="${className}" src="${thumbPath(creatorById(id).image)}" alt="" width="40" height="40" loading="lazy">`;

// Keep the reference's layered compositions proportional at every viewport width.
for (const [selector, designWidth, designHeight] of [['.hero-art', 620, 510], ['.creator-art', 560, 500]]) {
  const art = $(selector);
  const shell = document.createElement('div');
  shell.className = 'art-shell';
  art.before(shell);
  shell.append(art);
  if (selector === '.hero-art') {
    art.setAttribute('role', 'img');
    art.querySelectorAll('button').forEach((button) => {
      const label = document.createElement('span');
      label.className = button.className;
      if (button.dataset.profileTab) label.classList.add('mock-tab');
      if (button.closest('.connect-avatars')) label.classList.add('mock-connect-plus');
      if (button.dataset.icon) label.dataset.icon = button.dataset.icon;
      label.innerHTML = button.innerHTML;
      button.replaceWith(label);
    });
    art.querySelector('.mock-tabs').removeAttribute('role');
    art.querySelector('.mock-tabs').removeAttribute('aria-label');
  }
  const resize = () => {
    const scale = Math.min(shell.clientWidth / designWidth, 1);
    art.style.setProperty('--art-scale', String(scale));
    shell.style.height = `${designHeight * scale}px`;
  };
  resize();
  new ResizeObserver(resize).observe(shell);
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
}

$$('[data-avatars]').forEach((element) => {
  element.insertAdjacentHTML('afterbegin', element.dataset.avatars.split(',').map((id) => portrait(id)).join(''));
});

const steps = [
  ['user', 'blue', 'Create Your Profile', 'Showcase your skills, interests,<br>and projects in one place.'],
  ['folder', 'purple', 'Share Your Work', 'Publish your projects, designs,<br>code, or creative works.'],
  ['search', 'pink', 'Get Discovered', 'Let others find you by skills,<br>talents, and interests.'],
  ['users', 'teal', 'Connect & Collaborate', 'Find teammates and creators<br>who share your vision.'],
];
$('#steps-grid').innerHTML = steps.map(([symbol, color, title, copy]) => `<article><div class="step-icon step-${color}">${icon(symbol)}</div><h2>${title}</h2><p>${copy}</p></article>`).join('');

function creatorCard(creator) {
  return `<button class="creator-card creator-${creator.id}" data-creator="${creator.id}"><img class="creator-photo" src="${thumbPath(creator.image)}" alt="${creator.name}" width="240" height="190" loading="lazy"><span class="creator-info"><span class="creator-identity">${portrait(creator.id)}<span><strong>${creator.name}</strong><small>${creator.role}</small></span></span><span class="availability ${creator.id === 'maya' ? 'availability-blue' : ''}"><i></i> ${creator.availability}</span><span class="skill-tags">${creator.skills.slice(0, 3).map((skill) => `<span>${skill}</span>`).join('')}</span></span></button>`;
}
$('#creator-art-cards').innerHTML = ['daniel', 'kenji', 'maya'].map((id) => creatorCard(creatorById(id))).join('');

// Talent tiles: browse the sample creators by field and spotlight their cards.
const talents = [
  { id: 'Development', icon: 'code', color: '#1f86ff', skills: 'React · Node.js · PHP' },
  { id: 'Design', icon: 'pen', color: '#9447ff', skills: 'UI/UX · Branding · Figma' },
  { id: 'Video', icon: 'video', color: '#f0479a', skills: 'Editing · Motion · Story' },
  { id: 'Illustration', icon: 'palette', color: '#0db5a3', skills: 'Procreate · Character art' },
];
const creatorsIn = (talent) => creators.filter((creator) => creator.categories.includes(talent));
$('#talent-tiles').innerHTML = talents.map((talent) => {
  const people = creatorsIn(talent.id);
  return `<button class="talent-tile" data-talent="${talent.id}" aria-pressed="false" style="--tile:${talent.color}"><span class="talent-icon">${icon(talent.icon)}</span><span class="talent-text"><strong>${talent.id}</strong><small>${talent.skills}</small></span><span class="talent-people"><span class="talent-avatars">${people.map((creator) => portrait(creator.id)).join('')}</span><small>${people.length} sample creator${people.length === 1 ? '' : 's'}</small></span><span class="talent-check">${icon('check')}</span></button>`;
}).join('');
const tickerSkills = ['Figma', 'React', 'Premiere Pro', 'Procreate', 'Branding', 'Node.js', 'After Effects', 'UI Design', 'Supabase', 'Storytelling', 'Prototyping', 'Illustration'];
$('#skill-marquee').innerHTML = `<div class="marquee-track">${[...tickerSkills, ...tickerSkills].map((skill) => `<span>${skill}</span>`).join('')}</div>`;

let activeTalent = null;
function selectTalent(talent) {
  activeTalent = activeTalent === talent ? null : talent;
  $$('.talent-tile').forEach((tile) => tile.setAttribute('aria-pressed', String(tile.dataset.talent === activeTalent)));
  const matches = activeTalent ? creatorsIn(activeTalent) : [];
  const ids = new Set(matches.map((creator) => creator.id));
  $('.creator-art').classList.toggle('has-spotlight', Boolean(activeTalent));
  $$('.creator-art .creator-card').forEach((card) => card.classList.toggle('is-spotlit', ids.has(card.dataset.creator)));
  $('#creator-results').hidden = !activeTalent;
  if (!activeTalent) return;
  $('.result-count').textContent = `${activeTalent} · ${matches.length} sample creator${matches.length === 1 ? '' : 's'}`;
  $('.result-list').innerHTML = matches.map((creator) => `<button class="result-creator" data-creator="${creator.id}">${portrait(creator.id)}<span><strong>${creator.name}</strong><small>${creator.role}</small></span>${icon('arrow')}</button>`).join('');
  staggerIn($('.result-list').children, { y: 8, step: 50 });
}
$('#talent-tiles').addEventListener('click', (event) => { const tile = event.target.closest('[data-talent]'); if (tile) selectTalent(tile.dataset.talent); });

function storedSet(key) {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return new Set(Array.isArray(value) ? value.filter((id) => projects.some((project) => project.id === id)) : []); } catch { return new Set(); }
}
const saved = storedSet('showlio-preview-bookmarks');
const liked = storedSet('showlio-preview-likes');
function persistSet(key, value) { try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* The preview remains usable when storage is unavailable. */ } }
const formatLikes = (count) => count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
function renderProjects() {
  $('#project-grid').innerHTML = projects.map((project) => `<article class="project-card"><button class="project-image-button" data-project="${project.id}" aria-label="View ${project.title}"><img src="${thumbPath(project.image)}" alt="${project.title} — ${project.category.toLowerCase()} project" width="480" height="300" loading="lazy"></button><div class="project-body"><div class="project-type"><span>${project.category}</span><button class="bookmark-button ${saved.has(project.id) ? 'is-saved' : ''}" data-bookmark="${project.id}" aria-label="${saved.has(project.id) ? 'Unsave' : 'Save'} ${project.title}" aria-pressed="${saved.has(project.id)}">${icon('bookmark')}</button></div><button class="project-title" data-project="${project.id}">${project.title}</button><p>${project.description}</p><div class="project-footer"><button class="project-author" data-creator="${project.creator}">${portrait(project.creator)}<span>${project.author}</span></button><button class="like-button ${liked.has(project.id) ? 'is-liked' : ''}" data-like="${project.id}" aria-label="${liked.has(project.id) ? 'Unlike' : 'Like'} ${project.title}" aria-pressed="${liked.has(project.id)}">${icon('heart')}<span>${formatLikes(project.likes + (liked.has(project.id) ? 1 : 0))}</span></button></div></div></article>`).join('');
}
renderProjects();

$('#stats-band').innerHTML = [['users', '2K+', 'Creators'], ['project', '4K+', 'Projects'], ['grid', '20+', 'Talent Categories'], ['globe', 'Global', 'Community']].map(([symbol, value, label]) => `<div class="stat"><span class="stat-icon">${icon(symbol)}</span><p><strong><span class="stat-value" data-value="${value}" aria-hidden="true">${value}</span><span class="sr-only">${value}</span></strong><span>${label}</span></p></div>`).join('');
let storyOffset = 0;
const starRating = (rating) => `<span class="star-rating" role="img" aria-label="${rating} out of 5 stars">${Array.from({ length: 5 }, (_, index) => `<span class="star" style="--fill:${Math.max(0, Math.min(1, rating - index))}">${icon('star')}${icon('star')}</span>`).join('')}</span>`;
function renderStories() {
  $('#testimonial-grid').innerHTML = Array.from({ length: 3 }, (_, index) => stories[(storyOffset + index + stories.length) % stories.length]).map((story) => `<article class="testimonial"><div class="story-person">${portrait(story.creator)}<div><h3>${story.name}</h3><p>${story.role}</p></div></div><blockquote>“${story.quote}”</blockquote><div class="story-rating">${starRating(story.rating)}<small aria-hidden="true">${story.rating.toFixed(1)}</small></div></article>`).join('');
}
renderStories();
function moveStories(step) {
  storyOffset = (storyOffset + step + stories.length) % stories.length;
  renderStories();
  staggerIn($('#testimonial-grid').children, { x: step * 40, y: 0, step: 70, duration: 520 });
}
$('#stories-prev').addEventListener('click', () => moveStories(-1));
$('#stories-next').addEventListener('click', () => moveStories(1));

const dialog = $('#preview-dialog');
let lastFocus;
function openDialog(content) {
  lastFocus = document.activeElement;
  $('#dialog-content').innerHTML = content;
  hydrateIcons(dialog);
  dialog.showModal();
  document.body.classList.add('dialog-open');
}
function closeDialog() { dialog.close(); }
dialog.addEventListener('close', () => { if (!dialog.open) { document.body.classList.remove('dialog-open'); if (lastFocus?.isConnected) lastFocus.focus(); } });
$('.dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });

function showCreator(id) {
  const creator = creatorById(id);
  if (!creator) return;
  openDialog(`<div class="creator-modal-cover"><img src="${imagePath(creator.image)}" alt="${creator.name}" width="500" height="350"></div><p class="eyebrow">SAMPLE CREATOR</p><h2 id="dialog-title">${creator.name}</h2><p class="dialog-role">${creator.role} · Philippines</p><span class="availability ${id === 'maya' ? 'availability-blue' : ''}"><i></i>${creator.availability}</span><p class="dialog-description">${creator.bio}</p><div class="skill-tags dialog-skills">${creator.skills.map((skill) => `<span>${skill}</span>`).join('')}</div><button class="button button-primary" data-dialog-create>Create your own profile ${icon('arrow')}</button>`);
}
function showProject(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  openDialog(`<img class="project-modal-image" src="${imagePath(project.image)}" alt="${project.title}" width="600" height="400"><p class="eyebrow">${project.category.toUpperCase()} · SAMPLE PROJECT</p><h2 id="dialog-title">${project.title}</h2><p class="dialog-role">A creative project by ${project.author}</p><p class="dialog-description">${project.detail}</p><div class="skill-tags dialog-skills">${project.tags.map((tag) => `<span>${tag}</span>`).join('')}</div><button class="button button-primary" data-dialog-creator="${project.creator}">Meet the creator ${icon('arrow')}</button>`);
}
const information = {
  help: ['A little help to get started.', 'Explore sample creators, browse their projects, or try creating a local profile preview. The live community and account tools are coming next.'],
  privacy: ['Your privacy matters.', 'This design preview does not create accounts or send profile entries to a server. Likes and saved projects stay in this browser. Published profiles and privacy settings will be available when the community launches.'],
  terms: ['Made for thoughtful creators.', 'You are exploring a design preview. Sample profiles, projects, stories, and statistics are illustrative. The complete terms for the live community will be available before registration opens.'],
  guidelines: ['Create. Share. Be kind.', 'Share work you own or have permission to share. Credit collaborators, describe your contribution honestly, respect other creators, and keep personal information private.'],
  report: ['Help keep the community welcoming.', 'Reporting will be available on live profiles and projects when the community launches. The profiles shown here are fictional examples with generated imagery.'],
  contact: ['Let’s create something good.', 'Showlio is under development. Official contact details will be published here when the community opens. For now, explore the design and try your profile preview.'],
  social: ['Our community is coming together.', 'Official Showlio social channels will appear here at launch. For now, discover the sample creators and imagine what you could build together.'],
};
function showInformation(key) {
  const [title, copy] = information[key] ?? information.help;
  openDialog(`<p class="eyebrow">SHOWLIO COMMUNITY</p><h2 id="dialog-title">${title}</h2><p class="dialog-description">${copy}</p><button class="button button-primary" data-dialog-close>Keep Exploring ${icon('arrow')}</button>`);
}
let toastTimer;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000); }

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  // Account screens live on their own page.
  if (button.dataset.action === 'create' || button.hasAttribute('data-dialog-create')) { location.href = '/auth/#create'; return; }
  if (button.dataset.action === 'signin') { location.href = '/auth/'; return; }
  if (button.dataset.creator) { showCreator(button.dataset.creator); return; }
  if (button.dataset.dialogCreator) { dialog.close(); showCreator(button.dataset.dialogCreator); return; }
  if (button.dataset.project) { showProject(button.dataset.project); return; }
  if (button.dataset.info) { showInformation(button.dataset.info); return; }
  if (button.hasAttribute('data-dialog-close')) { closeDialog(); return; }
  const key = button.dataset.bookmark ? 'bookmark' : button.dataset.like ? 'like' : null;
  if (key) {
    const id = key === 'bookmark' ? button.dataset.bookmark : button.dataset.like;
    const set = key === 'bookmark' ? saved : liked;
    const active = !set.has(id);
    active ? set.add(id) : set.delete(id);
    persistSet(`showlio-preview-${key === 'bookmark' ? 'bookmarks' : 'likes'}`, set);
    button.classList.toggle(key === 'bookmark' ? 'is-saved' : 'is-liked', active);
    button.setAttribute('aria-pressed', String(active));
    const project = projects.find((item) => item.id === id);
    button.setAttribute('aria-label', `${key === 'bookmark' ? active ? 'Unsave' : 'Save' : active ? 'Unlike' : 'Like'} ${project.title}`);
    if (key === 'like') button.querySelector('span').textContent = formatLikes(project.likes + (active ? 1 : 0));
    toast(key === 'bookmark' ? active ? 'Project saved in this browser.' : 'Project removed from your saved list.' : active ? 'A little love for great creative work.' : 'Like removed.');
  }
});

const menuButton = $('.menu-toggle');
// Swap only the icon reference: replacing the button's SVG would detach the click target mid-event.
function setMenu(open) { $('#main-nav').classList.toggle('is-open', open); menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); menuButton.querySelector('use')?.setAttribute('href', `/assets/icons.svg#${open ? 'close' : 'menu'}`); }
function closeMenu() { setMenu(false); }
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
$$('.nav-link').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', (event) => { if (!event.composedPath().includes($('.site-header'))) closeMenu(); });
$('#header-search').addEventListener('click', () => { $('#explore').scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth' }); $('.talent-tile').focus({ preventScroll: true }); });
$('#view-projects').addEventListener('click', () => { openDialog(`<p class="eyebrow">A LITTLE INSPIRATION</p><h2 id="dialog-title">Explore the projects.</h2><p class="dialog-description">Four different ways to bring an idea to life. Select a project to take a closer look.</p><div class="project-picker">${projects.map((project) => `<button data-picker-project="${project.id}"><img src="${thumbPath(project.image)}" alt="" width="160" height="100"><strong>${project.title}</strong><small>${project.category}</small></button>`).join('')}</div>`); });
dialog.addEventListener('click', (event) => { const button = event.target.closest('[data-picker-project]'); if (button) { dialog.close(); showProject(button.dataset.pickerProject); } });

// Profile studio: every setting updates the sample profile preview live.
const studioForm = $('#studio-settings');
const previewCard = $('#preview-card');
const accents = [['cobalt', 'Cobalt', '#3b4bff'], ['violet', 'Violet', '#8a3dff'], ['pink', 'Pink', '#ee4396'], ['teal', 'Teal', '#0aa896'], ['orange', 'Orange', '#f57a1f']];
const statuses = { open: 'Open to collaborate', showcase: 'Just showcasing', busy: 'Busy right now' };
const studioSkills = ['Figma', 'UI Design', 'Prototyping', 'User Research', 'Branding', 'Motion'];
const maxSkills = 3;
$('#accent-swatches').innerHTML = accents.map(([value, label, color], index) => `<label class="swatch" style="--swatch:${color}"><input type="radio" name="accent" value="${value}" aria-label="${label}"${index === 0 ? ' checked' : ''}>${icon('check')}</label>`).join('');
$('#skill-picker').innerHTML = studioSkills.map((skill, index) => `<label class="skill-option"><input type="checkbox" name="skill" value="${skill}"${index < maxSkills ? ' checked' : ''}>${icon('check')}${skill}</label>`).join('');

const previewSkills = $('#preview-skills');
const chosenSkills = () => $$('#skill-picker input:checked').map((input) => input.value);
function syncSkills(animate) {
  const chosen = chosenSkills();
  const chips = [...previewSkills.children];
  flip(chips, () => {
    for (const chip of chips) if (!chosen.includes(chip.dataset.skill)) chip.remove();
    for (const skill of chosen) {
      if (chips.some((chip) => chip.dataset.skill === skill)) continue;
      const chip = document.createElement('span');
      chip.dataset.skill = skill;
      chip.textContent = skill;
      previewSkills.append(chip);
      if (animate && !prefersReducedMotion()) chip.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  });
  $('#skill-count').textContent = `${chosen.length} of ${maxSkills}`;
}
syncSkills(false);

function nudge(element) {
  element.classList.add('is-warning');
  setTimeout(() => element.classList.remove('is-warning'), 900);
  if (!prefersReducedMotion()) element.animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 320 });
}
studioForm.addEventListener('submit', (event) => event.preventDefault());
studioForm.addEventListener('change', (event) => {
  const input = event.target;
  if (input.name === 'accent') previewCard.style.setProperty('--accent', accents.find(([value]) => value === input.value)[2]);
  if (input.name === 'status') {
    previewCard.querySelector('.preview-status').dataset.status = input.value;
    $('#preview-status-text').textContent = statuses[input.value];
    staggerIn([$('#preview-status-text')], { y: 6, duration: 360 });
  }
  if (input.name === 'skill') {
    if (input.checked && chosenSkills().length > maxSkills) { input.checked = false; nudge($('#skill-count')); toast(`Highlight up to ${maxSkills} skills. Remove one to add another.`); return; }
    syncSkills(true);
  }
  if (input.name === 'location' || input.name === 'featured') previewCard.querySelector(`[data-show="${input.name}"]`).classList.toggle('is-hidden', !input.checked);
});
$('#try-studio').addEventListener('click', () => { $('#studio').scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' }); $('#accent-swatches input:checked').focus({ preventScroll: true }); });
hydrateIcons();
initMotion();
