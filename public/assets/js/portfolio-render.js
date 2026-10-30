import { normalizePortfolio, visibleWorks, filterWorks } from './portfolio-model.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const labels = { all: 'All', website: 'Websites', app: 'Apps', product: 'Products', design: 'Design', video: 'Video', other: 'Other' };
const singular = { website: 'Website', app: 'Mobile app', product: 'Product', design: 'Design', video: 'Video', other: 'Project' };
const arrow = '<svg class="pf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const external = '<svg class="pf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const svg = (paths, extra = '') => `<svg class="pf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;
const icons = {
  send: svg('<path d="m21 3-9.5 18-2.2-7.3L2 11.5 21 3Z"/><path d="M9.3 13.7 21 3"/>'),
  linkedin: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.3v.2M12 17v-3.6c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6V17M12 10.5V17"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17.2 6.9v.1"/>'),
  github: svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  website: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
};
// Small Showlio mark, drawn inline so exported pages stay self-contained.
const showlioMark = '<svg class="pf-showlio-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#00a4ff" d="M12 2 21 7l-9 5-9-5 9-5Z"/><path fill="#006aff" d="m3 12 9 5 9-5v2.5l-9 5-9-5V12Z" opacity=".9"/><path fill="#7909ff" d="m3 16.5 9 5 9-5V19l-9 5-9-5v-2.5Z" opacity=".85"/></svg>';
const initials = name => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'Y';
const image = (src, alt, className = '') => `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
const link = (url, content, className = '', label = '') => `<a class="${className}" href="${escapeHtml(url)}"${url.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${content}</a>`;
const chips = skills => skills.length ? `<ul class="pf-skills" aria-label="Skills">${skills.map(skill => `<li>${escapeHtml(skill)}</li>`).join('')}</ul>` : '';

function accentText(accent) {
  const channels = accent.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#080d2b' : '#ffffff';
}

function identity(profile, style, small = false) {
  const mark = style.showLogo ? profile.logo ? image(profile.logo, '', 'pf-logo-image') : `<span class="pf-monogram" aria-hidden="true">${escapeHtml(initials(profile.name))}</span>` : '';
  return `<a class="pf-identity${small ? ' pf-identity-small' : ''}" href="#pf-top">${mark}<span>${escapeHtml(profile.name || 'Your name')}</span></a>`;
}

function workCard(work) {
  return `<article class="pf-work-card"><button class="pf-work-button" type="button" data-pf-work="${escapeHtml(work.id)}" aria-label="View ${escapeHtml(work.title || 'Untitled work')}"><span class="pf-work-media">${work.image ? image(work.image, work.title) : `<span class="pf-work-placeholder" aria-hidden="true"><span>${escapeHtml(initials(work.title))}</span></span>`}</span><span class="pf-work-caption"><span><strong>${escapeHtml(work.title || 'Untitled work')}</strong><span class="pf-work-type">${escapeHtml(work.category || singular[work.type])}</span></span>${external}</span></button></article>`;
}

/** Safe, self-contained markup shared by the builder and browser-only viewer. */
export function renderPortfolio(portfolio, { embedded = false, type = 'all' } = {}) {
  const value = normalizePortfolio(portfolio);
  const { profile, style } = value;
  const available = visibleWorks(value);
  const selected = Object.hasOwn(labels, type) ? type : 'all';
  const works = filterWorks(available, { type: selected });
  const name = escapeHtml(profile.name || 'Your name');
  const contactUrl = profile.email ? `mailto:${profile.email}` : profile.website || '';
  const filters = ['all', ...Object.keys(singular).filter(key => available.some(work => work.type === key))];
  const socialLinks = [['linkedin', 'LinkedIn'], ['instagram', 'Instagram'], ['github', 'GitHub'], ['website', 'Website']].filter(([key]) => profile[key]).map(([key, label]) => link(profile[key], icons[key], 'pf-social', label)).join('');
  const portrait = style.showAvatar ? `<div class="pf-portrait-wrap"><div class="pf-portrait">${profile.avatar ? image(profile.avatar, profile.name ? `${profile.name} portrait` : 'Your portrait') : `<span class="pf-avatar-placeholder" aria-label="Profile monogram">${escapeHtml(initials(profile.name))}</span>`}</div>${profile.availability ? `<p class="pf-availability"><i aria-hidden="true"></i>${escapeHtml(profile.availability)}</p>` : ''}</div>` : '';
  const aboutPhoto = style.showAvatar && profile.avatar ? image(profile.avatar, '', 'pf-about-photo') : '';
  return `<div class="pf-site pf-${style.layout} pf-bg-${style.background}${embedded ? ' pf-embedded' : ''}" style="--pf-accent:${style.accent};--pf-accent-text:${accentText(style.accent)}" id="pf-top">
    <header class="pf-header"><div class="pf-container pf-header-inner">${identity(profile, style)}<nav class="pf-nav" aria-label="Portfolio"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a>${contactUrl ? link(contactUrl, 'Let’s talk', 'pf-talk') : ''}</nav><details class="pf-menu"><summary aria-label="Open menu">${icons.menu}</summary><nav class="pf-menu-panel" aria-label="Portfolio menu"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a></nav></details></div></header>
    <section class="pf-hero"><div class="pf-container pf-hero-inner${!style.showAvatar ? ' pf-without-portrait' : ''}"><div class="pf-hero-copy"><p class="pf-role">${escapeHtml(profile.role || 'Your creative role')}</p><h1>${name}</h1>${profile.intro ? `<p class="pf-intro">${escapeHtml(profile.intro)}</p>` : ''}<div class="pf-hero-actions"><a class="pf-button" href="#pf-work">Explore my work ${arrow}</a><a class="pf-text-link" href="#pf-about">About me</a></div></div>${portrait}</div></section>
    <section class="pf-work-section pf-container" id="pf-work" aria-labelledby="pf-work-heading"><div class="pf-section-heading"><h2 id="pf-work-heading">Selected work</h2><div class="pf-filters" aria-label="Filter selected work">${filters.map(key => `<button type="button" class="pf-filter${selected === key ? ' is-active' : ''}" data-pf-filter="${key}" aria-pressed="${selected === key}">${labels[key]}</button>`).join('')}</div></div><div class="pf-work-grid">${works.length ? works.map(workCard).join('') : `<div class="pf-empty-work"><span class="pf-empty-symbol" aria-hidden="true">＋</span><h3>${available.length ? 'No work in this category' : 'Work will appear here'}</h3><p>${available.length ? 'Choose another category to explore more work.' : 'Selected projects will be displayed in this space.'}</p></div>`}</div></section>
    <div class="pf-bottom"><section class="pf-about pf-container${!aboutPhoto ? ' pf-about-without-photo' : ''}" id="pf-about" aria-labelledby="pf-about-heading">${aboutPhoto}<div class="pf-about-copy"><h2 class="pf-eyebrow" id="pf-about-heading">About me</h2>${profile.bio ? `<p>${escapeHtml(profile.bio)}</p>` : `<p>Meet ${name}${profile.role ? `, ${escapeHtml(profile.role)}` : ''}.</p>`}${profile.location ? `<p class="pf-location">Based in ${escapeHtml(profile.location)}</p>` : ''}${chips(profile.skills)}</div></section>
    <section class="pf-contact pf-container" id="pf-contact" aria-labelledby="pf-contact-heading"><div class="pf-contact-inner"><span class="pf-contact-symbol" aria-hidden="true">${icons.send}</span><div class="pf-contact-copy"><p class="pf-eyebrow">Let’s work together</p><h2 id="pf-contact-heading">Have a project in mind?</h2><p>I’d love to hear about it and explore what we can create together.</p></div>${contactUrl ? link(contactUrl, `Get in touch ${arrow}`, 'pf-button') : '<span class="pf-contact-pending">Contact details coming soon</span>'}${socialLinks ? `<nav class="pf-socials" aria-label="Social links">${socialLinks}</nav>` : ''}</div></section></div>
    <footer class="pf-footer"><div class="pf-container pf-footer-inner">${identity(profile, style, true)}<nav class="pf-footer-nav" aria-label="Footer"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a></nav><a class="pf-made" href="/portfolio/">Made with ${showlioMark}<strong>Showlio</strong></a></div></footer>
  </div>`;
}

/** Work details use the same canonical validation as the page. */
export function renderWorkDetail(portfolio, id) {
  const work = visibleWorks(normalizePortfolio(portfolio)).find(item => item.id === id);
  if (!work) return '';
  const more = work.images.filter(src => src !== work.image);
  return `<div class="pf-detail">${work.image ? image(work.image, work.title, 'pf-detail-image') : ''}<p class="pf-eyebrow">${escapeHtml(work.category || singular[work.type])}</p><h2 id="pf-detail-title">${escapeHtml(work.title || 'Untitled work')}</h2>${work.role ? `<p class="pf-detail-role">${escapeHtml(work.role)}</p>` : ''}${work.description ? `<p class="pf-detail-description">${escapeHtml(work.description)}</p>` : ''}${chips(work.skills)}${more.length ? `<div class="pf-detail-gallery">${more.map(src => image(src, work.title)).join('')}</div>` : ''}${work.url ? link(work.url, `Visit project ${external}`, 'pf-button') : ''}</div>`;
}
