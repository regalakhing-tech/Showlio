// "My portfolio" and "Saved" have their own pages, distinct from Explore:
// - My portfolio is the creator's studio: who they are, how their work is doing,
//   and each project with its status and actions.
// - Saved is a reading list: one row per bookmarked project, quick to scan and tidy.
import { icon, esc, avatar, compact } from './workspace-shared.js';
import { personById, disciplineById } from './workspace-data.js';
import { filterProjects } from './workspace-model.js';
import { projectCover } from './workspace-explore.js';

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
  const summary = [plural(mine.length, 'project'), plural(sum(mine, 'views'), 'view'), plural(likes, 'like'), plural(sum(mine, 'comments'), 'comment')].join(' · ');
  const privateNote = profile.visible ? '' : `<div class="ws-mine-note">${icon('lock')}<p><strong>Your profile is private.</strong> Only you can see these projects.</p><button class="ws-btn ws-soft" data-action="make-public">Change in Settings</button></div>`;
  const cards = projects.map((project, index) => `<article class="ws-mine-card" style="--i:${index}"><button class="ws-mine-cover" data-project="${esc(project.id)}" aria-label="Open ${esc(project.title)}">${projectCover(project)}<span class="ws-mine-status ${project.draft ? 'is-draft' : ''}">${project.draft ? 'Draft' : 'Published'}</span></button><div class="ws-mine-body"><button class="ws-mine-title" data-project="${esc(project.id)}">${esc(project.title)}</button><div class="ws-pills">${disciplinePill(project.categories[0])}</div><p class="ws-mine-stats"><span>${icon('eye')}${compact(project.views)}</span><span>${icon('heart')}${compact(project.likes + (state.likes.includes(project.id) ? 1 : 0))}</span><button data-comments="${esc(project.id)}" aria-label="Comments on ${esc(project.title)}">${icon('message')}${compact(project.comments)}</button></p></div><div class="ws-mine-actions"><button class="ws-btn ws-soft" data-project="${esc(project.id)}">${icon('eye')}View</button>${project.real ? `<button class="ws-icon-button ws-mine-delete" data-delete-project="${esc(project.id)}" aria-label="Delete ${esc(project.title)}">${icon('close')}</button>` : ''}</div></article>`).join('');
  const empty = mine.length
    ? `<div class="ws-empty">${icon('search')}<h2>No project matches “${esc(state.feed.query)}”</h2><p>Try another word, or clear the search.</p></div>`
    : `<div class="ws-mine-empty"><span class="ws-mine-empty-icon">${icon('folder')}</span><h2>Your portfolio is ready for its first project</h2><p>Share something you made: code, an automation, a film or a piece of art. Add photos, tell the story, and it appears here and in Explore.</p><button class="ws-btn ws-primary" data-action="share">${icon('plus')}Add your first project</button></div>`;
  return `<section class="ws-panel ws-mine"><header class="ws-mine-hero"><div class="ws-mine-identity">${avatar(profile, 'ws-mine-avatar')}<div><h1>${esc(profile.name)}</h1><p>${esc(profile.headline || `@${profile.username}`)}</p><p class="ws-mine-summary">${summary}</p></div></div><div class="ws-mine-hero-actions"><button class="ws-btn ws-primary" data-action="share">${icon('plus')}Add a project</button><button class="ws-btn ws-outline" data-person="self">${icon('external')}View public profile</button></div></header>${privateNote}<div class="ws-mine-toolbar"><h2>Projects</h2>${mine.length > 1 ? `<div class="ws-segmented" role="group" aria-label="Sort projects">${sorts.map(([id, label]) => `<button data-sort="${id}" aria-pressed="${sort === id}">${label}</button>`).join('')}</div>` : ''}</div>${projects.length ? `<div class="ws-mine-grid">${cards}</div>` : empty}</section>`;
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
