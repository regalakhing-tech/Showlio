// The creator profile dialog: who someone is and a taste of their work, with a way
// into their full portfolio page. Details come from GET /api/portfolio.
import { icon, esc, avatar, compact } from './workspace-shared.js';
import { projectCover } from './workspace-explore.js';

const LINKS = { website: ['link', 'Website'], instagram: ['camera', 'Instagram'], youtube: ['play', 'YouTube'], github: ['code', 'GitHub'], linkedin: ['users', 'LinkedIn'], behance: ['palette', 'Behance'], dribbble: ['palette', 'Dribbble'], x: ['at', 'X'], tiktok: ['video', 'TikTok'], other: ['external', 'Link'] };
const AVAILABILITY = { available: 'Open to collaborate', showcasing: 'Showcasing work', unavailable: 'Not taking new work' };
const SKILLS_SHOWN = 8;
const WORK_SHOWN = 4;

/** The public portfolio page for a username. */
export const portfolioUrl = (username, origin = location.origin) => `${origin}/portfolio/view/?u=${encodeURIComponent(username)}`;

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const sum = (projects, key) => projects.reduce((total, project) => total + (Number(project[key]) || 0), 0);

function workCard(project, feed, url) {
  const known = feed.find((item) => item.id === project.id);
  const cover = project.images?.[0]
    ? `<img src="${esc(project.images[0])}" alt="" loading="lazy">`
    : known ? projectCover(known) : `<span class="ws-cp-work-blank">${icon('folder')}</span>`;
  const body = `<span class="ws-cp-work-cover">${cover}</span><span class="ws-cp-work-text"><strong>${esc(project.title)}</strong><small>${esc(project.categories?.[0] ?? 'Project')} · ${icon('heart')}${compact(project.likes ?? 0)}</small></span>`;
  // Projects in the feed open in place; anything else opens on the portfolio page.
  return known
    ? `<button class="ws-cp-work-card" data-project="${esc(project.id)}">${body}</button>`
    : `<a class="ws-cp-work-card" href="${esc(url)}" target="_blank" rel="noopener">${body}</a>`;
}

/**
 * person: what the workspace already knows (name, role, avatar, hue, username, bio, followers).
 * page: the /api/portfolio answer; undefined while it loads, null when it couldn't load.
 */
export function creatorMarkup(person, page, { self = false, following = false, feed = [] } = {}) {
  const profile = page?.profile ?? {};
  const username = profile.username ?? person.username;
  const url = portfolioUrl(username);
  const loading = page === undefined;
  const projects = page?.projects ?? [];
  const followers = self ? page?.followers : person.followers ?? page?.followers;
  const shown = { ...person, name: profile.name ?? person.name, avatar: profile.avatar ?? person.avatar };
  const headline = profile.headline || person.headline || person.role || `@${username}`;
  const bio = page ? profile.bio : person.bio;
  const location = profile.location ?? person.location;
  const availability = page ? AVAILABILITY[profile.availability] : undefined;
  const skills = page?.skills ?? [];
  const links = (page?.links ?? []).filter((link) => LINKS[link.kind] && hostOf(link.url));
  const stat = (value) => (value == null ? '—' : compact(value));
  const meta = [
    location ? `<li>${icon('pin')}${esc(location)}</li>` : '',
    `<li>${icon('at')}${esc(username)}</li>`,
    availability ? `<li class="ws-cp-availability is-${esc(profile.availability)}"><i></i>${esc(availability)}</li>` : '',
  ].join('');
  const actions = self
    ? `<button class="ws-btn ws-outline" data-action="complete-profile">${icon('pen')}Edit profile</button>`
    : `<button class="ws-btn ${following ? 'ws-soft' : 'ws-outline'} ws-cp-follow" data-follow="${esc(person.id)}" aria-pressed="${following}">${following ? `${icon('check')}Following` : `${icon('plus')}Follow`}</button>`;
  const privateNote = self && page && !profile.visible
    ? `<div class="ws-cp-note">${icon('lock')}<p><strong>Only you can see your portfolio.</strong> Your profile is private, so the link won’t open for anyone else.</p><button class="ws-btn ws-soft" data-action="make-public">Make it public</button></div>`
    : '';
  const failed = page === null
    ? `<div class="ws-cp-note is-error">${icon('help')}<p>Couldn’t load everything about ${esc(shown.name)}. Check your connection and try again.</p><button class="ws-btn ws-soft" data-person="${esc(self ? 'self' : person.id)}">${icon('refresh')}Try again</button></div>`
    : '';
  const about = loading
    ? '<span class="ws-cp-skeleton"></span><span class="ws-cp-skeleton"></span><span class="ws-cp-skeleton is-short"></span>'
    : `<p class="ws-cp-bio">${esc(bio || (self ? 'Add a short bio in Settings so people know what you create.' : `${shown.name} hasn’t written a bio yet.`))}</p>`;
  const skillList = skills.length
    ? `<h4>Skills</h4><ul class="ws-cp-skills">${skills.slice(0, SKILLS_SHOWN).map((skill) => `<li>${esc(skill)}</li>`).join('')}${skills.length > SKILLS_SHOWN ? `<li class="is-more">+${skills.length - SKILLS_SHOWN} more</li>` : ''}</ul>`
    : '';
  const linkList = links.length
    ? `<h4>Links</h4><ul class="ws-cp-links">${links.map((link) => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer nofollow">${icon(LINKS[link.kind][0])}<span>${LINKS[link.kind][1]}<small>${esc(hostOf(link.url))}</small></span>${icon('external')}</a></li>`).join('')}</ul>`
    : '';
  const work = loading
    ? `<div class="ws-cp-work-grid">${'<span class="ws-cp-work-card is-loading"><span class="ws-cp-work-cover"></span><span class="ws-cp-work-text"><span class="ws-cp-skeleton"></span><span class="ws-cp-skeleton is-short"></span></span></span>'.repeat(2)}</div>`
    : projects.length
      ? `<div class="ws-cp-work-grid">${projects.slice(0, WORK_SHOWN).map((project) => workCard(project, feed, url)).join('')}</div>`
      : `<p class="ws-cp-empty">${self ? 'Your published projects will appear here.' : 'No published projects yet.'}</p>`;

  return `<article class="ws-cp${loading ? ' is-loading' : ''}" data-creator="${esc(username)}" aria-busy="${loading}">
    <header class="ws-cp-hero"><div class="ws-cp-identity">${avatar(shown, 'ws-cp-avatar')}<div class="ws-cp-name"><h3>${esc(shown.name)}</h3><p>${esc(headline)}</p><ul class="ws-cp-meta">${meta}</ul></div></div><div class="ws-cp-actions">${actions}<a class="ws-btn ws-primary" href="${esc(url)}" target="_blank" rel="noopener">View full portfolio${icon('external')}</a></div></header>
    ${privateNote}${failed}
    <dl class="ws-cp-stats"><div><dt>Projects</dt><dd>${stat(page && projects.length)}</dd></div><div><dt>Followers</dt><dd>${stat(followers)}</dd></div><div><dt>Likes</dt><dd>${stat(page && sum(projects, 'likes'))}</dd></div><div><dt>Views</dt><dd>${stat(page && sum(projects, 'views'))}</dd></div></dl>
    <div class="ws-cp-body"><section class="ws-cp-about"><h4>About</h4>${about}${skillList}${linkList}</section><section class="ws-cp-work"><div class="ws-cp-work-head"><h4>Recent work</h4>${projects.length > WORK_SHOWN ? `<a href="${esc(url)}#pf-work" target="_blank" rel="noopener">See all ${projects.length}${icon('arrow')}</a>` : ''}</div>${work}</section></div>
    <footer class="ws-cp-share"><label for="ws-cp-url">Portfolio link</label><div class="ws-cp-url"><input id="ws-cp-url" type="text" readonly value="${esc(url)}"><button class="ws-btn ws-soft" data-copy-link="${esc(url)}">${icon('link')}Copy link</button></div></footer>
  </article>`;
}
