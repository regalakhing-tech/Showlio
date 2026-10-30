// The project dialog: photos on the left; creator, description, likes, saves and
// comments on the right (stacked on phones). Community projects load real comments;
// sample projects explain that comments are for community projects.
import { icon, esc, avatar, compact } from './workspace-shared.js';
import { disciplineById } from './workspace-data.js';
import { galleryMarkup } from './workspace-composer.js';
import { projectCover } from './workspace-explore.js';

/** "just now", "5m", "3h", "2d", then a date. */
export function timeAgo(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export function actionsMarkup(project, state) {
  const liked = state.likes.includes(project.id);
  const saved = state.bookmarks.includes(project.id);
  const likes = project.likes + (liked ? 1 : 0);
  return `<button type="button" class="ws-pv-action ${liked ? 'is-liked' : ''}" data-like="${esc(project.id)}" aria-pressed="${liked}">${icon('heart')}<b>${compact(likes)}</b><span>${likes === 1 ? 'Like' : 'Likes'}</span></button><button type="button" class="ws-pv-action ${saved ? 'is-saved' : ''}" data-bookmark="${esc(project.id)}" aria-pressed="${saved}">${icon('bookmark')}<span>${saved ? 'Saved' : 'Save'}</span></button><span class="ws-pv-stat">${icon('eye')}<b>${compact(project.views)}</b><span>${project.views === 1 ? 'view' : 'views'}</span></span>`;
}

export function commentsMarkup(comments) {
  if (comments === undefined) return '<li class="ws-pv-comment is-loading" aria-hidden="true"><i></i><span><i></i><i></i></span></li><li class="ws-pv-comment is-loading" aria-hidden="true"><i></i><span><i></i><i></i></span></li>';
  if (comments === null) return '<li class="ws-pv-empty">Comments didn’t load. Close and open the project to try again.</li>';
  if (!comments.length) return '<li class="ws-pv-empty">No comments yet. Start the conversation.</li>';
  return comments.map((comment) => `<li class="ws-pv-comment" data-comment="${esc(comment.id)}">${avatar({ name: comment.name, avatar: comment.avatar })}<div><p class="ws-pv-comment-head"><strong>${esc(comment.name)}</strong><time datetime="${new Date(comment.created).toISOString()}">${esc(timeAgo(comment.created))}</time>${comment.canDelete ? `<button type="button" class="ws-pv-comment-delete" data-delete-comment="${esc(comment.id)}">Delete</button>` : ''}</p><p class="ws-pv-comment-body">${esc(comment.body)}</p></div></li>`).join('');
}

export function projectViewMarkup(project, person, state, comments) {
  const gallery = project.images?.length > 1;
  const primary = project.categories[0];
  const discipline = disciplineById(primary);
  const follows = state.following.includes(project.creator);
  const media = gallery ? galleryMarkup(project.images, project.title) : `<div class="ws-pv-cover">${projectCover({ ...project, image: project.image.replace('/thumbs/', '/') }, 'modal')}</div>`;
  const follow = !project.owner ? `<button type="button" class="ws-btn ${follows ? 'ws-soft' : 'ws-primary'} ws-pv-follow" data-follow="${esc(project.creator)}" aria-pressed="${follows}">${follows ? `${icon('check')}Following` : `${icon('plus')}Follow`}</button>` : '';
  const conversation = project.real
    ? `<ul class="ws-pv-comment-list" data-comment-list>${commentsMarkup(comments)}</ul><form class="ws-pv-comment-form" data-comment-form novalidate>${avatar(state.profile)}<label class="ws-sr" for="ws-pv-comment-input">Add a comment</label><textarea id="ws-pv-comment-input" name="body" rows="1" maxlength="1000" placeholder="Add a comment…"></textarea><button type="submit" class="ws-btn ws-primary" aria-label="Post comment">${icon('arrow')}</button></form>`
    : '<p class="ws-pv-empty ws-pv-sample">This is a sample project, so it has no conversation. Comments are open on projects shared by Showlio members.</p>';
  return `<article class="ws-pv" data-project-view="${esc(project.id)}"><div class="ws-pv-media">${media}</div><div class="ws-pv-side"><header class="ws-pv-creator"><button type="button" class="ws-pv-person" data-person="${project.owner ? 'self' : esc(project.creator)}">${avatar(person)}<span><strong>${esc(person.name)}</strong><small>${esc(person.role || '')}</small></span></button>${follow}</header>${project.description ? `<p class="ws-pv-description">${esc(project.description)}</p>` : ''}<div class="ws-pills"><span class="ws-pill ws-disc-pill" style="--disc:${discipline?.color ?? '#1f2a55'};--disc-tint:${discipline?.tint ?? '#eef2fa'}">${icon(discipline?.icon ?? 'tag')}${esc(primary)}</span>${(project.tools ?? []).map((tool) => `<span class="ws-pill ws-tool-pill">${esc(tool)}</span>`).join('')}</div><div class="ws-pv-actions" data-pv-actions>${actionsMarkup(project, state)}</div><section class="ws-pv-comments" aria-labelledby="ws-pv-comments-title"><h3 id="ws-pv-comments-title">Comments <span data-comment-count>${compact(project.comments)}</span></h3>${conversation}</section>${project.owner && project.real ? `<button type="button" class="ws-pv-delete" data-delete-project="${esc(project.id)}">${icon('close')}Delete project</button>` : ''}</div></article>`;
}
