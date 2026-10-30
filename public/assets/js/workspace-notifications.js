// Notifications: real likes, saves, follows and comments on the creator's work, newest
// first and grouped by day, with the creator's totals beside them.
import { icon, esc, avatar, compact } from './workspace-shared.js';
import { timeAgo } from './workspace-project-view.js';

const TABS = [['all', 'All'], ['unread', 'Unread'], ['saved', 'Saved']];
const TYPE_ICONS = { like: 'heart', bookmark: 'bookmark', follow: 'users', comment: 'message' };

/** What happened, as safe HTML: "Bo Lim liked <project>". */
export function describe(item) {
  const who = `<strong>${esc(item.actor?.name ?? 'Someone')}</strong>`;
  const what = item.project ? `<strong>${esc(item.project.title)}</strong>` : 'your project';
  switch (item.type) {
    case 'follow': return `${who} started following you`;
    case 'like': return `${who} liked ${what}`;
    case 'bookmark': return `${who} saved ${what}`;
    case 'comment': return `${who} commented on ${what}${item.body ? `: <q>${esc(item.body)}</q>` : ''}`;
    default: return `${item.title ? `<strong>${esc(item.title)}</strong> ` : ''}${esc(item.body)}`;
  }
}

/** "Today", "Yesterday" or a date, for grouping. */
export function dayLabel(timestamp, now = Date.now()) {
  const day = (time) => new Date(time).toDateString();
  if (day(timestamp) === day(now)) return 'Today';
  if (day(timestamp) === day(now - 86400000)) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function visibleNotifications(state) {
  const tab = TABS.some(([id]) => id === state.notificationTab) ? state.notificationTab : 'all';
  return state.notifications.filter((item) => tab === 'all' || (tab === 'unread' ? item.unread : item.saved));
}

function noteMarkup(item) {
  const person = item.actor ?? { name: '?' };
  return `<li class="ws-note ${item.unread ? 'is-unread' : ''}" data-note="${esc(item.id)}"><button class="ws-note-main" data-note-open="${esc(item.id)}"><span class="ws-note-avatar">${avatar(person)}<span class="ws-note-badge is-${esc(item.type)}">${icon(TYPE_ICONS[item.type] ?? 'bell')}</span></span><span class="ws-note-text"><span>${describe(item)}</span><time datetime="${new Date(item.created).toISOString()}">${esc(timeAgo(item.created))}</time></span></button><span class="ws-note-actions"><button class="${item.saved ? 'is-on' : ''}" data-note-save="${esc(item.id)}" aria-pressed="${item.saved}" aria-label="${item.saved ? 'Unsave' : 'Save'} notification">${icon('bookmark')}</button><button data-note-read="${esc(item.id)}" aria-label="Mark as ${item.unread ? 'read' : 'unread'}">${icon(item.unread ? 'check' : 'mail')}</button><button data-note-delete="${esc(item.id)}" aria-label="Delete notification">${icon('close')}</button></span></li>`;
}

export function renderNotifications(state) {
  const tab = TABS.some(([id]) => id === state.notificationTab) ? state.notificationTab : 'all';
  const counts = { all: state.notifications.length, unread: state.notifications.filter((item) => item.unread).length, saved: state.notifications.filter((item) => item.saved).length };
  const items = visibleNotifications(state);
  const groups = [];
  for (const item of items) {
    const label = dayLabel(item.created);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(item);
  }
  const empty = {
    all: ['Nothing here yet', 'When people like, save, follow or comment on your work, you’ll see it here.'],
    unread: ['You’re all caught up', 'There are no unread notifications.'],
    saved: ['No saved notifications', 'Save a notification with its bookmark to keep it here.'],
  }[tab];
  const mine = state.projects.filter((project) => project.owner);
  const total = (key) => mine.reduce((sum, project) => sum + (Number(project[key]) || 0), 0);
  const stats = [
    ['eye', 'Project views', total('views')],
    ['heart', 'Likes', total('likes') + mine.filter((project) => state.likes.includes(project.id)).length],
    ['bookmark', 'Saves', total('saves')],
    ['message', 'Comments', total('comments')],
    ['users', 'Followers', state.followers ?? 0],
  ];
  return `<div class="ws-content-grid"><section class="ws-panel ws-inbox"><header class="ws-inbox-head"><div><h1>Notifications</h1><p>Likes, saves, follows and comments on your work.</p></div><button class="ws-btn ws-soft" data-action="mark-read" ${counts.unread ? '' : 'disabled'}>${icon('check')}Mark all as read</button></header><div class="ws-segmented ws-inbox-tabs" role="group" aria-label="Show notifications">${TABS.map(([id, label]) => `<button data-notification-tab="${id}" aria-pressed="${tab === id}">${label}<b>${counts[id]}</b></button>`).join('')}</div>${groups.length ? groups.map((group) => `<section class="ws-inbox-group" aria-label="${esc(group.label)}"><h2>${esc(group.label)}</h2><ol class="ws-inbox-list">${group.items.map(noteMarkup).join('')}</ol></section>`).join('') : `<div class="ws-inbox-empty"><span>${icon('bell')}</span><h2>${empty[0]}</h2><p>${empty[1]}</p></div>`}</section><aside class="ws-right-rail"><section class="ws-panel ws-inbox-stats"><h2>Your work at a glance</h2><p>Totals across your projects.</p><ul>${stats.map(([symbol, label, value]) => `<li><span class="ws-inbox-stat-icon">${icon(symbol)}</span><span>${label}</span><b>${compact(value)}</b></li>`).join('')}</ul><button class="ws-btn ws-outline" data-action="notification-settings">${icon('settings')}Notification settings</button></section></aside></div>`;
}
