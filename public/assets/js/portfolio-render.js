import { normalizePortfolio, visibleWorks, filterWorks } from './portfolio-model.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const labels = { all: 'All', website: 'Websites', app: 'Apps', product: 'Products', design: 'Design', video: 'Video', other: 'Other' };
const singular = { website: 'Website', app: 'Mobile app', product: 'Product', design: 'Design', video: 'Video', other: 'Project' };
// Original template keys stay stable in saved portfolios.
export const templates = {
  classic: { name: 'Studio', work: 'Selected work', about: 'About', contact: 'Have a project in mind?', cta: 'View my work' },
  minimal: { name: 'Editorial', work: 'Work', about: 'About', contact: 'Let’s make something good.', cta: 'See the work' },
  showcase: { name: 'Spotlight', work: 'Featured work', about: 'About me', contact: 'Let’s talk.', cta: 'Watch the work' },
  bento: { name: 'Bento', work: 'Selected work', about: 'About me', contact: 'Have a project in mind?', cta: 'View my work' },
  gallery: { name: 'Gallery', work: 'Work', about: 'About', contact: 'Have a project in mind?', cta: 'See the work' },
};
const svg = (paths, extra = '') => `<svg class="pf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;
const arrow = svg('<path d="M5 12h14m-6-6 6 6-6 6"/>');
const external = svg('<path d="M7 17 17 7M8 7h9v9"/>');
const icons = {
  send: svg('<path d="m21 3-9.5 18-2.2-7.3L2 11.5 21 3Z"/><path d="M9.3 13.7 21 3"/>'),
  linkedin: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.3v.2M12 17v-3.6c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6V17M12 10.5V17"/>'),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17.2 6.9v.1"/>'),
  github: svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  website: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
};
// Small Showlio mark, drawn inline so exported pages stay self-contained.
const showlioMark = '<svg class="pf-showlio-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#00a4ff" d="M12 2 21 7l-9 5-9-5 9-5Z"/><path fill="#006aff" d="m3 12 9 5 9-5v2.5l-9 5-9-5V12Z" opacity=".9"/><path fill="#7909ff" d="m3 16.5 9 5 9-5V19l-9 5-9-5v-2.5Z" opacity=".85"/></svg>';
const initials = name => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'Y';
/** Two letters for a name logo: first and last name, like a monogram. */
export const monogram = name => {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toUpperCase();
};
// A steady hue per title, so covers without a photo keep their colour between visits.
const hueOf = value => [...String(value)].reduce((hash, character) => (hash * 31 + character.codePointAt(0)) % 360, 7);
const image = (src, alt, className = '', eager = false) => `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const link = (url, content, className = '', label = '', id = '') => `<a class="${className}" href="${escapeHtml(url)}"${id ? ` id="${id}"` : ''}${url.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${content}</a>`;
const chips = skills => skills.length ? `<ul class="pf-skills" aria-label="Skills">${skills.map(skill => `<li>${escapeHtml(skill)}</li>`).join('')}</ul>` : '';
const firstSentence = text => { const match = /^[\s\S]{20,180}?[.!?](?=\s|$)/.exec(text); return match ? match[0] : text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text; };

function accentText(accent) {
  const channels = accent.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#080d2b' : '#ffffff';
}

/** The uploaded logo, or a logo drawn from the name in the template's own style. */
function mark(profile, style, className = '') {
  if (!style.showLogo) return '';
  if (profile.logo) return image(profile.logo, '', `pf-logo-image ${className}`.trim());
  if (!monogram(profile.name)) return '';
  return `<span class="pf-mark ${className}" aria-hidden="true"><span>${escapeHtml(monogram(profile.name))}</span></span>`;
}

function identity(profile, style, small = false) {
  const logo = mark(profile, style);
  // The name beside the logo is its own setting; by default the logo stands alone.
  const text = profile.brand;
  if (!logo && !text) return '<span class="pf-identity" aria-hidden="true"></span>';
  // With no text, the logo alone links home, so it gets a name of its own.
  return `<a class="pf-identity${small ? ' pf-identity-small' : ''}" href="#pf-top"${text ? '' : ' aria-label="Back to top"'}>${logo}${text ? `<span>${escapeHtml(text)}</span>` : ''}</a>`;
}

// A cover drawn from the title, for work without a photo.
const coverArt = (title, className = 'pf-work-placeholder') => `<span class="${className}" style="--pf-hue:${hueOf(title || 'work')}" aria-hidden="true"><span>${escapeHtml(initials(title || 'Work'))}</span></span>`;

function workCard(work, layout) {
  const tools = work.skills.length ? `<span class="pf-work-tools">${work.skills.slice(0, 4).map(escapeHtml).join(' · ')}</span>` : '';
  const supporting = layout === 'gallery' ? work.images.filter(src => src !== work.image).slice(0, 2) : [];
  return `<article class="pf-work-card"><button class="pf-work-button" type="button" data-pf-work="${escapeHtml(work.id)}" aria-label="View ${escapeHtml(work.title || 'Untitled work')}"><span class="pf-work-images"><span class="pf-work-media">${work.image ? image(work.image, work.title) : coverArt(work.title)}</span>${supporting.length ? `<span class="pf-work-supporting">${supporting.map(src => `<span class="pf-work-thumb">${image(src, work.title)}</span>`).join('')}</span>` : ''}</span><span class="pf-work-caption"><span class="pf-work-text"><strong>${escapeHtml(work.title || 'Untitled work')}</strong><span class="pf-work-type">${escapeHtml(work.category || singular[work.type])}</span>${work.description ? `<span class="pf-work-desc">${escapeHtml(work.description)}</span>` : ''}${tools}</span><span class="pf-work-go"><span class="pf-work-go-text">View project</span>${external}</span></span></button></article>`;
}

/** The hero's picture: the creator's photo, their latest work, or both, depending on the template. */
function heroVisual(layout, profile, style, featured) {
  const photo = style.showAvatar && profile.avatar ? image(profile.avatar, profile.name ? `${profile.name} portrait` : 'Portrait', 'pf-portrait-image', true) : '';
  // No name and no photo: an abstract cover instead of an empty logo.
  const big = monogram(profile.name) ? `<span class="pf-mark pf-mark-hero" aria-hidden="true"><span>${escapeHtml(monogram(profile.name))}</span></span>` : coverArt('', 'pf-backdrop-art');
  if (layout === 'showcase') {
    // The creator's own photo leads; their latest work only stands in when there is no photo.
    if (photo) return `<div class="pf-backdrop is-portrait" aria-hidden="true">${image(profile.avatar, '', 'pf-backdrop-image', true)}</div>`;
    return `<div class="pf-backdrop" aria-hidden="true">${featured ? image(featured.image, '', 'pf-backdrop-image', true) : coverArt(profile.name, 'pf-backdrop-art')}</div>`;
  }
  if (layout === 'minimal') return `<figure class="pf-hero-figure">${photo || (featured ? image(featured.image, '', 'pf-portrait-image', true) : big)}</figure>`;
  if (layout === 'gallery') return photo || monogram(profile.name) ? `<figure class="pf-hero-figure">${photo || big}</figure>` : '';
  return `<div class="pf-collage is-single"><figure class="pf-collage-main">${photo || (featured ? image(featured.image, '', 'pf-portrait-image', true) : big)}</figure></div>`;
}

/** Bento's tiles use only the creator's available identity, imagery and contact details. */
function bentoHero({ profile, style, featured, words, contactUrl, contactNote, lead, status }) {
  const name = escapeHtml(profile.name);
  const photo = style.showAvatar && profile.avatar
    ? `<figure class="pf-tile pf-tile-photo">${image(profile.avatar, profile.name ? `${profile.name} portrait` : 'Portrait', 'pf-portrait-image', true)}</figure>` : '';
  const intro = `<div class="pf-tile pf-tile-intro">${name ? `<h1>${name}</h1>` : ''}${profile.role ? `<p class="pf-role">${escapeHtml(profile.role)}</p>` : ''}${lead ? `<p class="pf-intro">${escapeHtml(lead)}</p>` : ''}<div class="pf-hero-actions"><a class="pf-button" href="#pf-work">${words.cta} ${arrow}</a>${contactUrl ? link(contactUrl, 'Get in touch', 'pf-text-link') : ''}</div></div>`;
  const facts = status || profile.location ? `<div class="pf-tile pf-tile-facts">${status}${profile.location ? `<p class="pf-tile-line">${icons.pin}${escapeHtml(profile.location)}</p>` : ''}</div>` : '';
  const contactInner = `<span class="pf-tile-icon">${icons.send}</span><strong>${words.contact}</strong>${contactNote ? `<span class="pf-tile-note">${escapeHtml(contactNote)}</span>` : ''}<span class="pf-tile-action">Get in touch</span>`;
  const contact = contactUrl ? link(contactUrl, contactInner, 'pf-tile pf-tile-contact', '', 'pf-contact') : '';
  const skills = profile.skills.length ? `<div class="pf-tile pf-tile-skills"><h2 class="pf-tile-title">What I do</h2>${chips(profile.skills.slice(0, 8))}</div>` : '';
  const latest = featured
    ? `<a class="pf-tile pf-tile-latest" href="#pf-work"><span class="pf-work-thumb">${image(featured.image, '')}</span><span class="pf-tile-caption"><small>Latest work</small><strong>${escapeHtml(featured.title || 'Untitled work')}</strong></span></a>`
    : '';
  return `<section class="pf-hero"><div class="pf-container pf-bento-hero">${intro}${photo}${latest}${contact}${skills}${facts}</div></section>`;
}

/** Safe, self-contained markup shared by the builder and browser-only viewer. */
export function renderPortfolio(portfolio, { embedded = false, type = 'all', community = null } = {}) {
  const value = normalizePortfolio(portfolio);
  const { profile, style } = value;
  const layout = style.layout;
  const words = templates[layout];
  const available = visibleWorks(value);
  const selected = Object.hasOwn(labels, type) ? type : 'all';
  const works = filterWorks(available, { type: selected });
  const featured = available.find(work => work.image);
  const name = escapeHtml(profile.name);
  const contactUrl = profile.email ? `mailto:${profile.email}` : profile.website || '';
  // The real address under the contact heading, never invented copy.
  const contactNote = profile.email || profile.website.replace(/^https:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
  const filters = ['all', ...Object.keys(singular).filter(key => available.some(work => work.type === key))];
  const showFilters = filters.length > 2 || (available.length > 0 && selected !== 'all' && works.length === 0);
  const communityAction = community === 'owner' ? link('/portfolio/', 'Edit your portfolio', 'pf-community-action') : community === 'guest' ? link('/auth/#sign-up', 'Join Showlio', 'pf-community-action') : '';
  const socialLinks = [['linkedin', 'LinkedIn'], ['instagram', 'Instagram'], ['github', 'GitHub'], ['website', 'Website']].filter(([key]) => profile[key]).map(([key, label]) => link(profile[key], icons[key], 'pf-social', label)).join('');
  const lead = profile.intro || (profile.bio ? firstSentence(profile.bio) : '');
  const status = profile.availability ? `<p class="pf-status"><i aria-hidden="true"></i>${escapeHtml(profile.availability)}</p>` : '';
  const facts = profile.location ? `<li>${icons.pin}${escapeHtml(profile.location)}</li>` : '';
  const aboutVisual = style.showAvatar && profile.avatar ? image(profile.avatar, '', 'pf-about-photo') : monogram(profile.name) ? `<span class="pf-mark pf-mark-about" aria-hidden="true"><span>${escapeHtml(monogram(profile.name))}</span></span>` : '';
  const contactAction = contactUrl ? link(contactUrl, `Get in touch ${arrow}`, 'pf-button') : '<span class="pf-contact-pending">Contact details coming soon</span>';
  return `<div class="pf-site pf-${layout} pf-bg-${style.background}${embedded ? ' pf-embedded' : ''}${style.showAvatar && profile.avatar ? ' pf-has-portrait' : ''}" style="--pf-accent:${style.accent};--pf-accent-text:${accentText(style.accent)};--pf-logo:${style.logoSize}px" id="pf-top">
    <header class="pf-header"><div class="pf-container pf-header-inner">${identity(profile, style)}<nav class="pf-nav" aria-label="Portfolio"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a>${contactUrl ? link(contactUrl, 'Get in touch', 'pf-talk') : ''}</nav><details class="pf-menu"><summary aria-label="Open menu">${icons.menu}</summary><nav class="pf-menu-panel" aria-label="Portfolio menu"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a></nav></details></div></header>
    ${layout === 'bento' ? bentoHero({ profile, style, featured, words, contactUrl, contactNote, lead, status }) : `<section class="pf-hero">${layout === 'showcase' ? heroVisual(layout, profile, style, featured) : ''}<div class="pf-container pf-hero-inner"><div class="pf-hero-copy">${status ? `<div class="pf-hero-top">${status}</div>` : ''}${name ? `<h1>${name}</h1>` : ''}${profile.role ? `<p class="pf-role">${escapeHtml(profile.role)}</p>` : ''}${lead ? `<p class="pf-intro">${escapeHtml(lead)}</p>` : ''}<div class="pf-hero-actions"><a class="pf-button" href="#pf-work">${words.cta} ${arrow}</a>${contactUrl ? link(contactUrl, 'Get in touch', 'pf-text-link') : '<a class="pf-text-link" href="#pf-about">About me</a>'}</div>${facts ? `<ul class="pf-facts">${facts}</ul>` : ''}</div>${layout === 'showcase' ? '' : heroVisual(layout, profile, style, featured)}</div></section>`}
    <section class="pf-work-section pf-container" id="pf-work" aria-labelledby="pf-work-heading"><div class="pf-section-heading"><h2 id="pf-work-heading">${words.work}</h2>${showFilters ? `<div class="pf-filters" aria-label="Filter selected work">${filters.map(key => `<button type="button" class="pf-filter${selected === key ? ' is-active' : ''}" data-pf-filter="${key}" aria-pressed="${selected === key}">${labels[key]}</button>`).join('')}</div>` : ''}</div><div class="pf-work-grid" data-count="${works.length}">${works.length ? works.map(work => workCard(work, layout)).join('') : `<div class="pf-empty-work"><span class="pf-empty-symbol" aria-hidden="true">${icons.grid}</span><h3>${available.length ? 'No work in this category' : 'Work will appear here'}</h3><p>${available.length ? 'Choose another category to explore more work.' : 'Selected projects will be displayed in this space.'}</p></div>`}</div></section>
    <section class="pf-about" id="pf-about" aria-labelledby="pf-about-heading"><div class="pf-container pf-about-inner${aboutVisual ? '' : ' is-text-only'}">${aboutVisual ? `<div class="pf-about-visual">${aboutVisual}</div>` : ''}<div class="pf-about-copy"><h2 id="pf-about-heading">${words.about}</h2>${profile.bio ? `<p class="pf-bio">${escapeHtml(profile.bio)}</p>` : ''}${profile.location ? `<p class="pf-location">${icons.pin}Based in ${escapeHtml(profile.location)}</p>` : ''}${chips(profile.skills)}${socialLinks ? `<nav class="pf-socials" aria-label="Social links">${socialLinks}</nav>` : ''}</div></div></section>
    ${layout === 'bento' && contactUrl ? '' : `<section class="pf-contact" id="pf-contact" aria-labelledby="pf-contact-heading"><div class="pf-container pf-contact-inner"><span class="pf-contact-symbol" aria-hidden="true">${icons.send}</span><div class="pf-contact-copy"><h2 id="pf-contact-heading">${words.contact}</h2>${contactNote && contactUrl ? `<p>${escapeHtml(contactNote)}</p>` : ''}</div>${contactAction}</div></section>`}
    <footer class="pf-footer"><div class="pf-container pf-footer-inner">${identity(profile, style, true)}<nav class="pf-footer-nav" aria-label="Footer"><a href="#pf-work">Work</a><a href="#pf-about">About</a><a href="#pf-contact">Contact</a></nav><a class="pf-made" href="/portfolio/">Made with ${showlioMark}<strong>Showlio</strong></a>${communityAction}</div></footer>
  </div>`;
}

/** Work details use the same canonical validation as the page. */
export function renderWorkDetail(portfolio, id) {
  const work = visibleWorks(normalizePortfolio(portfolio)).find(item => item.id === id);
  if (!work) return '';
  const more = work.images.filter(src => src !== work.image);
  return `<div class="pf-detail">${work.image ? image(work.image, work.title, 'pf-detail-image') : coverArt(work.title, 'pf-detail-art')}<div class="pf-detail-body"><h2 id="pf-detail-title">${escapeHtml(work.title || 'Untitled work')}</h2><p class="pf-detail-type">${escapeHtml(work.category || singular[work.type])}</p>${work.role ? `<p class="pf-detail-role">${escapeHtml(work.role)}</p>` : ''}${work.description ? `<p class="pf-detail-description">${escapeHtml(work.description)}</p>` : ''}${chips(work.skills)}${more.length ? `<div class="pf-detail-gallery">${more.map(src => image(src, work.title)).join('')}</div>` : ''}${work.url ? link(work.url, `Visit project ${external}`, 'pf-button') : ''}</div></div>`;
}
