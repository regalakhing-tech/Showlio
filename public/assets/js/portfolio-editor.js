import { filterWorks, normalizePortfolio, portfolioProgress, visibleWorks } from './portfolio-model.js';

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
// Icons missing from the shared sprite are drawn inline.
const glyphs = {
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const i = name => `<svg class="pb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[name] || `<use href="/assets/workspace-icons.svg#${esc(({ image: 'camera' })[name] || name)}"/>`}</svg>`;
const types = [['website', 'Website'], ['app', 'App'], ['product', 'Product'], ['design', 'Design'], ['video', 'Video'], ['other', 'Other']];
const filterLabels = { all: 'All work', website: 'Websites', app: 'Apps', product: 'Products', design: 'Design', video: 'Video', other: 'Other' };
const typeIcons = { website: 'globe', app: 'phone', product: 'box', design: 'palette', video: 'video', other: 'sparkles' };
const heading = (title, subtitle, id = '') => `<div class="pb-heading"><h1${id ? ` id="${id}"` : ''}>${title}</h1><p>${subtitle}</p></div>`;
const selected = value => value ? ' is-active' : '';
const checked = value => value ? ' checked' : '';
const button = (action, label, icon = '', className = 'pb-outline') => `<button type="button" class="pb-btn ${className}" data-action="${action}">${icon ? i(icon) : ''}${label}</button>`;

function field(name, label, value, { type = 'text', max = 160, placeholder = '', required = false, hint = '', rows = 0, profile = true, count = false } = {}) {
  const id = `pb-${profile ? 'profile' : 'work'}-${name}`;
  const described = [hint ? `${id}-hint` : '', count ? `${id}-count` : ''].filter(Boolean).join(' ');
  const attributes = `id="${id}" ${profile ? `data-profile="${name}"` : `name="${name}"`} maxlength="${max}"${required ? ' required' : ''}${described ? ` aria-describedby="${described}"` : ''}${count ? ' data-count' : ''} placeholder="${esc(placeholder)}"`;
  const control = rows ? `<textarea ${attributes} rows="${rows}">${esc(value)}</textarea>` : `<input type="${type}" ${attributes} value="${esc(value)}">`;
  const counter = count ? `<small class="pb-count" id="${id}-count" aria-live="polite">${Array.from(String(value ?? '')).length}/${max}</small>` : '';
  return `<div class="pb-field"><label for="${id}">${label}</label>${count ? `<div class="pb-count-wrap">${control}${counter}</div>` : control}${hint ? `<small id="${id}-hint">${hint}</small>` : ''}</div>`;
}

function identityUpload(profile, target, image) {
  const logo = target === 'logo';
  const inputId = `pb-upload-${target}`;
  return `<div class="pb-field pb-identity-field"><span>${logo ? 'Your logo' : 'Profile photo'}</span><div class="pb-upload-wrap"><label class="pb-upload ${logo ? 'pb-logo-upload' : 'pb-avatar-upload'}">${image ? `<img src="${esc(image)}" alt="${logo ? 'Your logo' : 'Your profile photo'}">` : `<span>${i(logo ? 'image' : 'user')}<small>${logo ? 'Add your logo' : 'Add your photo'}</small></span>`}<input id="${inputId}" type="file" data-image-target="${target}" accept="image/jpeg,image/png,image/webp" aria-label="Upload ${logo ? 'logo' : 'profile photo'}"></label><label class="pb-upload-badge" for="${inputId}" aria-hidden="true">${i(logo ? 'upload' : 'camera')}</label></div><label class="pb-upload-action" for="${inputId}">Upload ${logo ? 'logo' : 'photo'}</label><small>${logo ? 'Use a square image, e.g. 512 × 512.' : 'Use a clear, friendly photo.'}</small>${profile[target] ? `<button type="button" class="pb-btn pb-ghost pb-remove-image" data-clear-image="${target}" aria-label="Remove ${logo ? 'logo' : 'profile photo'}">Remove ${logo ? 'logo' : 'photo'}</button>` : ''}</div>`;
}

export function renderProfile(p) {
  const profile = p?.profile || {};
  const safe = normalizePortfolio(p).profile;
  return `<section class="pb-form-pane" aria-labelledby="pb-profile-title">${heading('Create your portfolio', 'Start with you. Add your work next.', 'pb-profile-title')}<div class="pb-form">
    <div class="pb-identity">${identityUpload(profile, 'logo', safe.logo)}${identityUpload(profile, 'avatar', safe.avatar)}</div>
    ${field('name', 'Display name', profile.name, { max: 100, placeholder: 'Your name', required: true })}
    ${field('role', 'Your role', profile.role, { placeholder: 'Product designer & developer', required: true })}
    ${field('intro', 'Short introduction', profile.intro, { max: 280, placeholder: 'Tell people what you create.', rows: 3, count: true })}
    <div class="pb-field"><label for="pb-profile-slug">Portfolio page name <span class="pb-tip" title="This becomes the end of your portfolio link.">${i('info')}</span></label><div class="pb-input-prefix"><span>/portfolio/view/</span><input id="pb-profile-slug" data-profile="slug" maxlength="80" type="text" value="${esc(profile.slug)}" placeholder="your-name" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocapitalize="none" spellcheck="false" required aria-describedby="pb-slug-hint"></div><small id="pb-slug-hint">Lowercase letters, numbers and hyphens. Your saved preview opens in this browser.</small></div>
    ${field('location', 'Location (optional)', profile.location, { max: 120, placeholder: 'City, country' })}
    <section class="pb-section"><h2>Contact & links</h2><div class="pb-form">${field('email', 'Email (optional)', profile.email, { type: 'email', max: 254, placeholder: 'hello@example.com' })}${field('website', 'Website (optional)', profile.website, { type: 'url', max: 2048, placeholder: 'https://your-website.com', hint: 'Use HTTPS for website and social links.' })}<div class="pb-grid2">${field('github', 'GitHub (optional)', profile.github, { type: 'url', max: 2048, placeholder: 'https://github.com/you' })}${field('linkedin', 'LinkedIn (optional)', profile.linkedin, { type: 'url', max: 2048, placeholder: 'https://linkedin.com/in/you' })}</div>${field('instagram', 'Instagram (optional)', profile.instagram, { type: 'url', max: 2048, placeholder: 'https://instagram.com/you' })}</div></section>
    <p class="pb-hint">Images stay in this browser. JPG, PNG or WebP, up to 5 MB each.</p>
  </div></section>`;
}

export function renderAbout(p) {
  const profile = p?.profile || {};
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  return `<section class="pb-form-pane">${heading('A little more about you', 'Share your story and what you do best.')}<div class="pb-form">
    ${field('bio', 'About you', profile.bio, { max: 2000, rows: 6, placeholder: 'What inspires your work? Tell visitors about your experience and approach.', hint: 'A few thoughtful sentences help people get to know you.', count: true })}
    <section class="pb-section"><h2>Skills & expertise</h2><div class="pb-field"><label for="pb-skill-input">Add a skill</label><div class="pb-skill-entry"><input id="pb-skill-input" type="text" maxlength="80" placeholder="e.g. Product design" aria-describedby="pb-skills-hint">${button('add-skill', 'Add', 'plus')}</div><small id="pb-skills-hint">Add one skill at a time. Press Enter or choose Add.</small></div><div class="pb-chips" aria-label="Your skills">${skills.length ? skills.map(skill => `<span class="pb-chip">${esc(skill)}<button type="button" data-remove-skill="${esc(skill)}" aria-label="Remove ${esc(skill)}">${i('close')}</button></span>`).join('') : '<span class="pb-chips-empty">Your skills will appear here.</span>'}</div></section>
    <section class="pb-section"><h2>Let people know you’re available</h2>${field('availability', 'Availability (optional)', profile.availability, { placeholder: 'Open to freelance projects', hint: 'This appears with your contact details.' })}</section>
  </div></section>`;
}

function workCard(work, index, works, reorder, order) {
  const title = work.title || 'Untitled work';
  const type = types.find(([value]) => value === work.type) || types.at(-1);
  const image = normalizePortfolio({ works: [work] }).works[0]?.image;
  const included = work.visible !== false;
  const id = esc(work.id);
  const name = esc(title);
  return `<article class="pb-work-card" data-work-id="${id}" data-included="${included}" style="--i:${Math.min(order, 11)}"${reorder ? ' draggable="true"' : ''} aria-label="${name}">
    <button type="button" class="pb-work-image" data-edit-work="${id}" aria-label="Edit ${name}">${image ? `<img src="${esc(image)}" alt="" loading="lazy" draggable="false">` : `<span class="pb-work-placeholder">${i(typeIcons[type[0]])}</span>`}</button>
    ${reorder ? `<span class="pb-card-grip is-dragging-handle" title="Drag to reorder" aria-hidden="true">${i('grip')}</span>` : `<button type="button" class="pb-card-grip" data-action="reorder" aria-label="Reorder work" title="Reorder work">${i('grip')}</button>`}
    <div class="pb-card-menu"><button type="button" class="pb-icon-button pb-card-more" data-card-menu aria-expanded="false" aria-label="More actions for ${name}" title="More actions">${i('more')}</button><div class="pb-menu" role="group" aria-label="Actions for ${name}" hidden>
      <button type="button" data-edit-work="${id}">${i('pen')}Edit work</button>
      <label class="pb-menu-switch"><span>Show in portfolio</span><input class="pb-switch" type="checkbox" data-toggle-work="${id}"${checked(included)} aria-label="Include ${name} in portfolio"></label>
      <button type="button" class="pb-menu-danger" data-delete-work="${id}" aria-label="Delete ${name}">${i('trash')}Delete</button>
    </div></div>
    <div class="pb-card-body"><h2 title="${name}">${name}</h2><div class="pb-card-meta"><span class="pb-type-tag" data-type="${type[0]}">${type[1]}</span><span class="pb-status${included ? ' is-included' : ''}">${included ? 'Included' : 'Draft'}</span></div>
    ${reorder ? `<div class="pb-card-actions"><span>Move</span><button type="button" class="pb-icon-button" data-move-work="-1" data-work-id="${id}" aria-label="Move ${name} earlier"${index === 0 ? ' disabled' : ''}>${i('arrow-left')}</button><button type="button" class="pb-icon-button pb-flip" data-move-work="1" data-work-id="${id}" aria-label="Move ${name} later"${index === works.length - 1 ? ' disabled' : ''}>${i('arrow-left')}</button></div>` : ''}</div>
  </article>`;
}

export function renderWorks(p, { query = '', type = 'all', reorder = false } = {}) {
  const works = Array.isArray(p?.works) ? p.works : [];
  const filtered = filterWorks(works, { query, type });
  const addMenu = `<div class="pb-split"><button type="button" class="pb-btn pb-primary pb-split-main" data-action="add-work">${i('plus')}Add work</button><button type="button" class="pb-btn pb-primary pb-split-toggle" data-action="add-menu" aria-expanded="false" aria-label="Choose a type of work to add">${i('chevron-down')}</button><div class="pb-menu pb-split-menu" role="group" aria-label="Add a type of work" hidden>${types.map(([value, label]) => `<button type="button" data-add-type="${value}">${i(typeIcons[value])}${label}</button>`).join('')}</div></div>`;
  return `<section class="pb-library"><div class="pb-heading-row">${heading('Add work to your portfolio', 'Show the websites, apps, projects, and products you create.')}${addMenu}</div>
    <div class="pb-library-toolbar"><label class="pb-search">${i('search')}<span class="pb-sr-only">Search your work</span><input id="pb-work-search" type="search" value="${esc(query)}" placeholder="Search your work"></label><div class="pb-filters" aria-label="Filter work type">${Object.entries(filterLabels).map(([value, label]) => `<button type="button" data-work-filter="${value}" class="${type === value ? 'is-active' : ''}" aria-pressed="${type === value}">${label}</button>`).join('')}</div>${works.length ? `<span class="pb-work-count" title="${visibleWorks(p).length} included in your portfolio">${works.length} ${works.length === 1 ? 'item' : 'items'}</span>${button('reorder', reorder ? 'Done' : 'Reorder', reorder ? 'check' : 'list', reorder ? 'pb-primary pb-reorder' : 'pb-outline pb-reorder')}` : ''}</div>
    ${reorder ? '<p class="pb-reorder-hint">Drag a card, or use its arrow buttons, to change the order.</p>' : ''}
    <div class="pb-work-grid">${filtered.length ? filtered.map((work, order) => workCard(work, works.indexOf(work), works, reorder, order)).join('') : `<div class="pb-empty">${i(works.length ? 'search' : 'folder')}<h2>${works.length ? 'No matching work' : 'Make room for your best work'}</h2><p>${works.length ? 'Try another search or work type to find what you’re looking for.' : 'Bring your projects, products and ideas together. Start with one, then keep adding as you grow.'}</p>${works.length ? '' : `<div class="pb-empty-actions">${button('add-work', 'Add your first work', 'plus', 'pb-primary')}${button('start-collection', 'Load starter collection', 'grid', 'pb-ghost')}</div>`}</div>`}</div>
    ${works.length ? `<button type="button" class="pb-add-work" data-action="add-work">${i('plus')}Add another project or product</button>` : ''}
  </section>`;
}

const miniLayouts = {
  classic: '<i class="pb-mini-bar"></i><i class="pb-mini-hero"><b></b><b></b></i><i class="pb-mini-grid"><b></b><b></b><b></b><b></b><b></b><b></b></i>',
  minimal: '<i class="pb-mini-bar"></i><i class="pb-mini-hero"><b></b><b></b></i><i class="pb-mini-grid"><b></b><b></b></i>',
  showcase: '<i class="pb-mini-bar"></i><i class="pb-mini-banner"></i><i class="pb-mini-grid"><b></b><b></b><b></b></i>',
};

export function renderStyle(p) {
  const style = normalizePortfolio(p).style;
  const layouts = [['classic', 'Classic', 'A clean, versatile layout for all types of work.'], ['minimal', 'Minimal', 'A focused, modern layout.'], ['showcase', 'Showcase', 'A bold, visual layout for standout work.']];
  const colors = [['#006aff', 'Blue'], ['#7958ef', 'Violet'], ['#15ad8a', 'Green'], ['#ec64a2', 'Pink'], ['#f09c45', 'Orange'], ['#172545', 'Navy']];
  return `<section class="pb-form-pane pb-style-pane">${heading('Your portfolio, your style', 'Choose a look for your entire portfolio.')}<div class="pb-style-rows">
    <section class="pb-style-row"><h2>Layout</h2><div class="pb-style-layouts">${layouts.map(([value, label, description]) => `<button type="button" class="pb-style-option${selected(style.layout === value)}" data-style="layout" data-style-value="${value}" aria-pressed="${style.layout === value}"><span class="pb-mini-layout is-${value}" aria-hidden="true">${miniLayouts[value]}</span><strong>${label}</strong><small>${description}</small></button>`).join('')}</div></section>
    <section class="pb-style-row"><h2>Accent color</h2><div class="pb-swatches">${colors.map(([value, label]) => `<button type="button" class="pb-swatch${selected(style.accent === value)}" data-style="accent" data-style-value="${value}" style="--swatch:${value}" aria-label="${label} accent" aria-pressed="${style.accent === value}"></button>`).join('')}<div class="pb-color-input"><input type="color" data-style="accent" value="${style.accent}" aria-label="Choose custom accent color"><input type="text" data-style="accent" value="${style.accent}" pattern="#[a-fA-F0-9]{6}" maxlength="7" aria-label="Accent color hex code" spellcheck="false"></div></div></section>
    <section class="pb-style-row"><h2>Page background</h2><div class="pb-choices">${[['white', 'White', 'A clean, neutral background.'], ['tint', 'Soft tint', 'A subtle tint of your accent.']].map(([value, label, description]) => `<button type="button" class="pb-choice${selected(style.background === value)}" data-style="background" data-style-value="${value}" aria-pressed="${style.background === value}"><span class="pb-radio" aria-hidden="true"></span><span><strong>${label}</strong><small>${description}</small></span></button>`).join('')}</div></section>
    <section class="pb-style-row"><h2>Typography</h2><div class="pb-type-row"><span class="pb-type-pill">Inter${i('check')}</span><small>Matches your Showlio style.</small></div></section>
    <section class="pb-style-row"><h2>Header</h2><div><label class="pb-toggle-row"><input class="pb-switch" type="checkbox" data-style="showLogo"${checked(style.showLogo)}><span><strong>Show my logo</strong><small>Display your personal logo in the header.</small></span></label><label class="pb-toggle-row"><input class="pb-switch" type="checkbox" data-style="showAvatar"${checked(style.showAvatar)}><span><strong>Show profile photo</strong><small>Display your profile photo on your homepage.</small></span></label></div></section>
  </div><button type="button" class="pb-btn pb-ghost pb-reset" data-action="reset-style">${i('refresh')}Reset style</button></section>`;
}

export function renderPublish(p, { ready = false, snapshot = null } = {}) {
  const profile = p?.profile || {};
  const safe = normalizePortfolio(p).profile;
  const progress = portfolioProgress(p);
  const steps = ['Profile details', 'About & skills', 'Projects & products', 'Your style', 'Ready to create'];
  const count = visibleWorks(p).length;
  return `<section class="pb-publish-summary">${heading(snapshot ? 'Your portfolio is ready' : 'Ready for your next chapter?', snapshot ? 'Your saved portfolio brings it all together.' : 'Take one last look. Then bring your portfolio together.')}
    <ul class="pb-checklist">${steps.map((label, index) => `<li class="${progress[index] ? 'is-complete' : ''}" style="--i:${index}">${i(progress[index] ? 'check-circle' : 'help')}<span>${label}${index === 2 ? ` <small>(${count} included)</small>` : ''}</span><span class="pb-sr-only">${progress[index] ? 'Complete' : 'Needs attention'}</span></li>`).join('')}</ul>
    <div class="pb-publish-card${snapshot ? ' is-ready' : ''}"><div class="pb-publish-person">${safe.avatar || safe.logo ? `<img src="${esc(safe.avatar || safe.logo)}" alt="${esc(profile.name || 'Your profile')}">` : `<span class="pb-share-avatar" aria-hidden="true">${i('user')}</span>`}<h2>${esc(profile.name || 'Your portfolio')}</h2><p>${esc(profile.role || 'Your work, in one place')}</p></div><h2>${snapshot ? 'Saved in this browser' : 'Your work deserves a home'}</h2><p>${snapshot ? 'Open your saved portfolio or share its preview link and QR code. The preview is available in this browser.' : 'Create a saved preview of your portfolio. You can keep editing your draft and create a fresh version whenever you’re ready.'}</p>${snapshot ? `${button('share', 'Share portfolio', 'link', 'pb-primary')}${button('open-saved', 'Open saved portfolio', 'external')}` : `<button type="button" class="pb-btn pb-primary" data-action="create-preview"${ready ? '' : ' disabled'}>${i('sparkles')}Create portfolio</button>`}<p class="pb-hint">${snapshot ? 'Draft edits appear in the saved portfolio after you create it again.' : ready ? `${count} ${count === 1 ? 'work' : 'works'} will be included.` : 'Add your name, role, page name and at least one included work to continue.'}</p></div>
  </section>`;
}

export function renderWorkForm(work = {}) {
  const image = normalizePortfolio({ works: [work] }).works[0]?.image;
  return `<form id="pb-work-form"><div class="pb-modal-body"><div class="pb-form">
    ${field('title', 'Work title', work.title, { profile: false, required: true, placeholder: 'Give your work a name' })}
    <div class="pb-field"><label for="pb-work-type">Work type</label><select id="pb-work-type" name="type">${types.map(([value, label]) => `<option value="${value}"${(work.type || 'website') === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="pb-field"><span>Cover image (optional)</span><label class="pb-upload pb-cover-upload"><span id="pb-work-image-preview">${image ? `<img src="${esc(image)}" alt="Current work cover">` : `${i('upload')}<strong>Upload a cover image</strong><small>JPG, PNG or WebP · up to 5 MB</small>`}</span><input id="pb-work-image" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload work cover image"></label><button type="button" class="pb-btn pb-ghost pb-remove-image" data-action="clear-work-image">Remove image</button></div>
    ${field('description', 'Description (optional)', work.description, { profile: false, max: 2000, rows: 3, placeholder: 'What did you create, and why does it matter?' })}
    ${field('url', 'Project link (optional)', work.url, { profile: false, type: 'url', max: 2048, placeholder: 'https://your-project.com', hint: 'Use an HTTPS link.' })}
    <div class="pb-grid2">${field('role', 'Your role (optional)', work.role, { profile: false, placeholder: 'e.g. Product designer' })}${field('skills', 'Skills (optional)', Array.isArray(work.skills) ? work.skills.join(', ') : '', { profile: false, max: 1000, placeholder: 'Figma, React, Branding', hint: 'Separate skills with commas.' })}</div>
    <label class="pb-toggle-row"><input class="pb-switch" type="checkbox" name="visible"${checked(work.visible !== false)}><span><strong>Include in portfolio</strong><small>Turn this off to keep the work as a draft.</small></span></label>
  </div></div><footer class="pb-modal-footer">${button('close-modal', 'Cancel')}<button type="submit" class="pb-btn pb-primary">Save work${i('check')}</button></footer></form>`;
}
