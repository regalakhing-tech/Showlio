import { creators, projects, stories, categories, imagePath, creatorById } from './community.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const portrait = (id, className = '') => `<img class="${className}" src="${imagePath(creatorById(id).image)}" alt="" width="40" height="40" loading="lazy">`;

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
  return `<button class="creator-card creator-${creator.id}" data-creator="${creator.id}"><img class="creator-photo" src="${imagePath(creator.image)}" alt="${creator.name}" width="240" height="190" loading="lazy"><span class="creator-info"><span class="creator-identity">${portrait(creator.id)}<span><strong>${creator.name}</strong><small>${creator.role}</small></span></span><span class="availability ${creator.id === 'maya' ? 'availability-blue' : ''}"><i></i> ${creator.availability}</span><span class="skill-tags">${creator.skills.slice(0, 3).map((skill) => `<span>${skill}</span>`).join('')}</span></span></button>`;
}
$('#creator-art-cards').innerHTML = ['daniel', 'kenji', 'maya'].map((id) => creatorCard(creatorById(id))).join('');

let selectedCategory = 'All';
$('.category-filters').innerHTML = categories.map((category) => `<button class="${category === 'All' ? 'active' : ''}" aria-pressed="${category === 'All'}" data-category="${category}">${category}</button>`).join('') + '<button class="more-filter" data-category="All" aria-pressed="false">and more…</button>';

function showResults() {
  const query = $('#creator-search').value.trim().toLowerCase();
  const matches = creators.filter((creator) => (selectedCategory === 'All' || creator.categories.includes(selectedCategory)) && `${creator.name} ${creator.role} ${creator.skills.join(' ')} ${projects.filter((project) => project.creator === creator.id).map((project) => project.title).join(' ')}`.toLowerCase().includes(query));
  $('#creator-results').hidden = false;
  $('.result-count').textContent = `${matches.length} sample creator${matches.length === 1 ? '' : 's'} found`;
  $('.result-list').innerHTML = matches.length ? matches.map((creator) => `<button class="result-creator" data-creator="${creator.id}">${portrait(creator.id)}<span><strong>${creator.name}</strong><small>${creator.role}</small></span>${icon('arrow')}</button>`).join('') : '<p class="empty-results">No matching creators in this preview. Try another category or search for “design”, “PHP”, or “video”.</p>';
}
$('.creator-search').addEventListener('submit', (event) => { event.preventDefault(); showResults(); });
$('#creator-search').addEventListener('input', showResults);
$('.category-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  selectedCategory = button.dataset.category;
  $$('.category-filters button').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  showResults();
});

function storedSet(key) {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return new Set(Array.isArray(value) ? value.filter((id) => projects.some((project) => project.id === id)) : []); } catch { return new Set(); }
}
const saved = storedSet('showlio-preview-bookmarks');
const liked = storedSet('showlio-preview-likes');
function persistSet(key, value) { try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* The preview remains usable when storage is unavailable. */ } }
const formatLikes = (count) => count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
function renderProjects() {
  $('#project-grid').innerHTML = projects.map((project) => `<article class="project-card"><button class="project-image-button" data-project="${project.id}" aria-label="View ${project.title}"><img src="${imagePath(project.image)}" alt="${project.title} — ${project.category.toLowerCase()} project" width="480" height="300" loading="lazy"></button><div class="project-body"><div class="project-type"><span>${project.category}</span><button class="bookmark-button ${saved.has(project.id) ? 'is-saved' : ''}" data-bookmark="${project.id}" aria-label="${saved.has(project.id) ? 'Unsave' : 'Save'} ${project.title}" aria-pressed="${saved.has(project.id)}">${icon('bookmark')}</button></div><button class="project-title" data-project="${project.id}">${project.title}</button><p>${project.description}</p><div class="project-footer"><button class="project-author" data-creator="${project.creator}">${portrait(project.creator)}<span>${project.author}</span></button><button class="like-button ${liked.has(project.id) ? 'is-liked' : ''}" data-like="${project.id}" aria-label="${liked.has(project.id) ? 'Unlike' : 'Like'} ${project.title}" aria-pressed="${liked.has(project.id)}">${icon('heart')}<span>${formatLikes(project.likes + (liked.has(project.id) ? 1 : 0))}</span></button></div></div></article>`).join('');
}
renderProjects();

$('#stats-band').innerHTML = [['users', '2K+', 'Creators'], ['project', '4K+', 'Projects'], ['grid', '20+', 'Talent Categories'], ['globe', 'Global', 'Community']].map(([symbol, value, label]) => `<div class="stat"><span class="stat-icon">${icon(symbol)}</span><p><strong>${value}</strong><span>${label}</span></p></div>`).join('');
let storyOffset = 0;
function renderStories() {
  $('#testimonial-grid').innerHTML = Array.from({ length: 3 }, (_, index) => stories[(storyOffset + index + stories.length) % stories.length]).map((story) => `<article class="testimonial"><div class="story-person">${portrait(story.creator)}<div><h3>${story.name}</h3><p>${story.role}</p></div></div><blockquote>“${story.quote}”</blockquote><div class="story-rating"><span aria-label="5 out of 5 stars">★★★★★</span><small>5.0</small></div></article>`).join('');
}
renderStories();
$('#stories-prev').addEventListener('click', () => { storyOffset = (storyOffset - 1 + stories.length) % stories.length; renderStories(); });
$('#stories-next').addEventListener('click', () => { storyOffset = (storyOffset + 1) % stories.length; renderStories(); });

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
function showSignup() {
  if (dialog.open) dialog.close();
  openDialog(`<p class="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2 id="dialog-title">Show the world<br>what you can do.</h2><p class="dialog-description">Try your profile preview. Nothing is published, and no account is created.</p><form id="profile-preview-form"><label>Your name<input name="name" placeholder="How should we call you?" maxlength="60" required autocomplete="name"></label><label>Your creative role<input name="role" placeholder="e.g. UI/UX designer, photographer, developer" maxlength="100" required></label><label>Your skills<input name="skills" placeholder="Figma, illustration, React…" maxlength="160"></label><button class="button button-primary button-large" type="submit">Preview My Profile ${icon('arrow')}</button></form>`);
  $('#profile-preview-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name')).trim();
    const role = String(data.get('role')).trim();
    event.target.elements.namedItem('name').value = name;
    event.target.elements.namedItem('role').value = role;
    if (!event.target.reportValidity()) return;
    const skills = String(data.get('skills')).split(',').map((skill) => skill.trim()).filter(Boolean).slice(0, 8);
    $('#dialog-content').innerHTML = `<div class="profile-preview-initial">${escapeHtml(name.slice(0, 1).toUpperCase())}</div><p class="eyebrow">YOUR PROFILE PREVIEW</p><h2 id="dialog-title">${escapeHtml(name)}</h2><p class="dialog-role">${escapeHtml(role)}</p><div class="skill-tags dialog-skills">${skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div><p class="dialog-description">Your skills. Your work. Your story.<br>You're ready to make a great first impression.</p><p class="preview-note">This is a local preview. Account creation and publishing are coming soon.</p><button class="button button-primary" data-dialog-close>Keep Exploring ${icon('arrow')}</button>`;
  });
}

const information = {
  signin: ['Welcome back.', 'The Showlio community is taking shape. Sign-in will be available when accounts launch. In the meantime, explore the sample creators or try your profile preview.'],
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
  if (button.dataset.action === 'create' || button.hasAttribute('data-dialog-create')) { showSignup(); return; }
  if (button.dataset.action === 'signin') { showInformation('signin'); return; }
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
function closeMenu() { $('#main-nav').classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation'); menuButton.innerHTML = icon('menu'); }
menuButton.addEventListener('click', () => { const open = menuButton.getAttribute('aria-expanded') !== 'true'; $('#main-nav').classList.toggle('is-open', open); menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); menuButton.innerHTML = icon(open ? 'close' : 'menu'); });
$$('.nav-link').forEach((link) => link.addEventListener('click', () => { $$('.nav-link').forEach((item) => item.classList.toggle('active', item === link)); closeMenu(); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', (event) => { if (!event.target.closest('.site-header')) closeMenu(); });
$('#header-search').addEventListener('click', () => { $('#explore').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); $('#creator-search').focus({ preventScroll: true }); });
$('#view-projects').addEventListener('click', () => { openDialog(`<p class="eyebrow">A LITTLE INSPIRATION</p><h2 id="dialog-title">Explore the projects.</h2><p class="dialog-description">Four different ways to bring an idea to life. Select a project to take a closer look.</p><div class="project-picker">${projects.map((project) => `<button data-picker-project="${project.id}"><img src="${imagePath(project.image)}" alt="" width="160" height="100"><strong>${project.title}</strong><small>${project.category}</small></button>`).join('')}</div>`); });
dialog.addEventListener('click', (event) => { const button = event.target.closest('[data-picker-project]'); if (button) { dialog.close(); showProject(button.dataset.pickerProject); } });

const aiExamples = {
  improve: 'Creative UI/UX designer with a passion for building user-centered digital experiences. I enjoy turning ideas into clean, intuitive designs and love collaborating with people on meaningful projects.',
  bio: 'I’m a UI/UX designer who turns ideas into simple, thoughtful digital experiences. I work with Figma, enjoy solving design challenges, and am open to creative collaborations.',
  skills: 'Based on this sample designer profile: UI design · UX research · Figma · Wireframing · Interactive prototyping. Keep only the skills you actually use.',
  title: 'UI/UX Designer · Thoughtful interfaces, meaningful experiences',
  project: 'A clean, intuitive habit-tracking app designed to help people build consistent routines. This concept brings daily goals, progress, and small celebrations into one friendly mobile experience.',
};
let aiMode = 'improve';
function selectAiMode(mode) { aiMode = mode; $$('[data-ai-mode]').forEach((button) => { button.classList.toggle('active', button.dataset.aiMode === mode); button.setAttribute('aria-pressed', String(button.dataset.aiMode === mode)); }); $('#ai-output').textContent = aiExamples[mode]; }
$$('[data-ai-mode]').forEach((button) => button.addEventListener('click', () => selectAiMode(button.dataset.aiMode)));
$$('[data-example]').forEach((button) => button.addEventListener('click', () => { selectAiMode(button.dataset.example); $('#ai-prompt').value = button.dataset.example === 'project' ? 'Describe a friendly habit-tracking app concept.' : button.dataset.example === 'skills' ? 'Suggest skills for this sample UI/UX designer.' : 'Write a professional bio for this sample UI/UX designer.'; }));
$('#ai-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#ai-prompt').value.trim(); $('#ai-output').textContent = input && !/sample|habit-tracking/i.test(input) ? `A starting point in your own words: ${input}\n\nAdd a specific project you’re proud of and how you contributed. Keep the details accurate, then make this draft sound like you.` : aiExamples[aiMode]; toast('Example draft ready. You can edit the text directly.'); });
$('#copy-ai').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#ai-output').innerText); toast('Profile text copied.'); } catch { toast('Select the example text and copy it with your keyboard.'); } });
$('#try-ai').addEventListener('click', () => { $('#ai-prompt').focus({ preventScroll: true }); $('#ai-prompt').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
$$('[data-ai-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.aiMode === aiMode)));
hydrateIcons();
