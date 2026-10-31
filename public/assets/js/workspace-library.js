// "My portfolio" and "Saved" have their own pages, distinct from Explore:
// - My portfolio is the creator's studio: who they are, how their work is doing,
//   and each project with its status and actions.
// - Saved is a reading list: one row per bookmarked project, quick to scan and tidy.
import { icon, esc, avatar, compact } from './workspace-shared.js';
import { personById, disciplineById } from './workspace-data.js';
import { filterProjects } from './workspace-model.js';
import { projectCover } from './workspace-explore.js';
import { timeAgo } from './workspace-project-view.js';
import { portfolioUrl } from './workspace-creator.js';

const sum = (projects, key) => projects.reduce((total, project) => total + (Number(project[key]) || 0), 0);
const plural = (count, one, many = `${one}s`) => `${compact(count)} ${count === 1 ? one : many}`;
const disciplinePill = (category) => {
  const discipline = disciplineById(category);
  return `<span class="ws-pill ws-disc-pill" style="--disc:${discipline?.color ?? '#1f2a55'};--disc-tint:${discipline?.tint ?? '#eef2fa'}">${icon(discipline?.icon ?? 'tag')}${esc(category)}</span>`;
};
const sorts = [['latest', 'Newest'], ['trending', 'Most viewed'], ['popular', 'Most liked']];

export function renderPortfolio(state) {
  const profile = state.profile;
  const mine = state.projects.filter((project) => project.owner);
  const sort = sorts.some(([id]) => id === state.feed.sort) ? state.feed.sort : 'latest';
  const projects = filterProjects(mine, { query: state.feed.query, sort });
  const likes = sum(mine, 'likes') + mine.filter((project) => state.likes.includes(project.id)).length;
  const stats = [['folder', mine.length, 'project'], ['eye', sum(mine, 'views'), 'view'], ['heart', likes, 'like'], ['message', sum(mine, 'comments'), 'comment']]
    .map(([glyph, count, label]) => `<li>${icon(glyph)}<strong>${compact(count)}</strong><span>${count === 1 ? label : `${label}s`}</span></li>`).join('');
  const privateNote = profile.visible ? '' : `<div class="ws-mine-note">${icon('lock')}<p><strong>Your profile is private.</strong> Only you can see these projects.</p><button class="ws-btn ws-soft" data-action="make-public">Change in Settings</button></div>`;
  // Each card opens its project; the creator's real projects also get icon-only edit and delete.
  const cards = projects.map((project, index) => `<article class="ws-mine-card" style="--i:${index}"><div class="ws-mine-cover"><button class="ws-mine-open" data-project="${esc(project.id)}" aria-label="Open ${esc(project.title)}">${projectCover(project)}</button><span class="ws-mine-status ${project.draft ? 'is-draft' : ''}">${project.draft ? 'Draft' : 'Published'}</span>${project.real ? `<div class="ws-mine-tools"><button class="ws-mine-tool" data-edit-project="${esc(project.id)}" aria-label="Edit ${esc(project.title)}" title="Edit project">${icon('edit')}</button><button class="ws-mine-tool is-danger" data-delete-project="${esc(project.id)}" aria-label="Delete ${esc(project.title)}" title="Delete project">${icon('trash')}</button></div>` : ''}</div><div class="ws-mine-body"><button class="ws-mine-title" data-project="${esc(project.id)}">${esc(project.title)}</button><div class="ws-mine-meta">${disciplinePill(project.categories[0])}${project.created ? `<time datetime="${new Date(project.created).toISOString()}">${esc(timeAgo(project.created))}</time>` : ''}</div><p class="ws-mine-stats"><span title="Views">${icon('eye')}${compact(project.views)}</span><span title="Likes">${icon('heart')}${compact(project.likes + (state.likes.includes(project.id) ? 1 : 0))}</span><button data-comments="${esc(project.id)}" aria-label="Comments on ${esc(project.title)}" title="Comments">${icon('message')}${compact(project.comments)}</button></p></div></article>`).join('');
  const empty = mine.length
    ? `<div class="ws-empty">${icon('search')}<h2>No project matches “${esc(state.feed.query)}”</h2><p>Try another word, or clear the search.</p></div>`
    : `<div class="ws-mine-empty"><span class="ws-mine-empty-icon">${icon('folder')}</span><h2>Your portfolio is ready for its first project</h2><p>Share something you made: code, an automation, a film or a piece of art. Add photos, tell the story, and it appears here and in Explore.</p><button class="ws-btn ws-primary" data-action="share">${icon('plus')}Add your first project</button></div>`;
  const livePage = profile.username ? `<a class="ws-btn ws-outline" href="${esc(portfolioUrl(profile.username, ''))}" target="_blank" rel="noopener">${icon('external')}View live page</a>` : '';
  return `<section class="ws-panel ws-mine"><header class="ws-mine-hero"><div class="ws-mine-banner" aria-hidden="true"></div><div class="ws-mine-identity">${avatar(profile, 'ws-mine-avatar')}<div><h1>${esc(profile.name)}</h1><p>${esc(profile.headline || `@${profile.username}`)}</p></div></div><div class="ws-mine-hero-actions"><button class="ws-btn ws-primary" data-action="share">${icon('plus')}Add a project</button>${livePage}<button class="ws-icon-button ws-mine-hero-tool" data-person="self" aria-label="Preview your profile" title="Preview your profile">${icon('eye')}</button></div><ul class="ws-mine-stats-row" aria-label="Your numbers">${stats}</ul></header>${privateNote}<div class="ws-mine-toolbar"><h2>Projects <span>${mine.length}</span></h2>${mine.length > 1 ? `<div class="ws-segmented" role="group" aria-label="Sort projects">${sorts.map(([id, label]) => `<button data-sort="${id}" aria-pressed="${sort === id}">${label}</button>`).join('')}</div>` : ''}</div>${projects.length ? `<div class="ws-mine-grid">${cards}<button class="ws-mine-add" data-action="share"><span>${icon('plus')}</span><strong>Add a project</strong><small>Photos, a story and the tools you used</small></button></div>` : empty}</section>`;
}

export function renderSaved(state) {
  const saved = filterProjects(state.projects, { query: state.feed.query, savedOnly: true, sort: 'latest' }, state.bookmarks);
  const total = state.projects.filter((project) => state.bookmarks.includes(project.id)).length;
  const rows = saved.map((project, index) => {
    const author = project.owner ? { ...state.profile, role: state.profile.headline } : personById(project.creator);
    return `<article class="ws-saved-row" style="--i:${index}"><button class="ws-saved-thumb" data-project="${esc(project.id)}" aria-label="Open ${esc(project.title)}">${projectCover(project)}</button><div class="ws-saved-body"><button class="ws-saved-title" data-project="${esc(project.id)}">${esc(project.title)}</button><p class="ws-saved-description">${esc(project.description)}</p><div class="ws-saved-meta"><button class="ws-saved-person" data-person="${project.owner ? 'self' : esc(project.creator)}">${avatar(author)}<span>${esc(author.name)}</span></button>${disciplinePill(project.categories[0])}<span class="ws-saved-counts"><span>${icon('heart')}${compact(project.likes + (state.likes.includes(project.id) ? 1 : 0))}</span><span>${icon('message')}${compact(project.comments)}</span></span></div></div><button class="ws-saved-remove" data-bookmark="${esc(project.id)}" aria-pressed="true" aria-label="Remove ${esc(project.title)} from saved">${icon('bookmark')}<span>Saved</span></button></article>`;
  }).join('');
  const empty = total
    ? `<div class="ws-empty">${icon('search')}<h2>Nothing saved matches “${esc(state.feed.query)}”</h2><p>Try another word, or clear the search.</p></div>`
    : `<div class="ws-saved-empty"><span class="ws-saved-empty-icon">${icon('bookmark')}</span><h2>Nothing saved yet</h2><p>Tap the bookmark on any project in Explore to keep it here for later.</p><button class="ws-btn ws-primary" data-nav="explore">${icon('grid')}Explore projects</button></div>`;
  return `<section class="ws-panel ws-saved"><header class="ws-saved-head"><div><h1>Saved</h1><p>Projects you bookmarked to come back to.</p></div>${total ? `<span class="ws-saved-total">${plural(total, 'project')}</span>` : ''}</header>${saved.length ? `<div class="ws-saved-list">${rows}</div>` : empty}</section>`;
}
