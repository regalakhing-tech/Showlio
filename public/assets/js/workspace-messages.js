// Messages: a Messenger-style inbox. workspace.js polls /api/messages every few seconds
// and calls updateMessages(), which swaps only what changed (the list, the open
// conversation, active status, the theme), so typing, focus and scroll position survive.
import { icon, esc, avatar } from './workspace-shared.js';

export const MESSAGE_LIMIT = 2000;
export const LIKE = '👍';
// Each conversation's colours; both people see the theme either of them picks.
export const CHAT_THEMES = {
  showlio: { label: 'Showlio', colors: ['#00a4ff', '#0b56ff', '#7909ff'] },
  ocean: { label: 'Ocean', colors: ['#22d3ee', '#0891b2', '#2563eb'] },
  violet: { label: 'Violet', colors: ['#c084fc', '#9333ea', '#6d28d9'] },
  sunset: { label: 'Sunset', colors: ['#fbbf24', '#f97316', '#e11d48'] },
  rose: { label: 'Rose', colors: ['#fb7185', '#ec4899', '#be185d'] },
  forest: { label: 'Forest', colors: ['#4ade80', '#16a34a', '#047857'] },
  midnight: { label: 'Midnight', colors: ['#64748b', '#334155', '#0f172a'] },
};
const GROUP_GAP = 5 * 60000; // Messages closer than this join one bubble group.
const TIME_GAP = 15 * 60000; // A longer pause gets a time divider.
const ACTIVE_WINDOW = 2 * 60000;

const person = (who) => ({ name: who.name, avatar: who.avatar, hue: 220 });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const clock = (time) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fullTime = (time) => new Date(time).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const themeOf = (name) => CHAT_THEMES[name] ? name : 'showlio';
export const themeStyle = (name) => { const [a, b, c] = CHAT_THEMES[themeOf(name)].colors; return `--chat-a:${a};--chat-b:${b};--chat-c:${c}`; };
// Up to three emoji and nothing else are shown large, without a bubble.
const BIG_EMOJI = /^(?:\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️]?(?:‍\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️]?)*){1,3}$/u;

export const isActive = (activeAt, now = Date.now()) => Boolean(activeAt) && now - activeAt < ACTIVE_WINDOW;
/** "Active now", "Active 5m ago", "Active 3h ago", or '' when hidden or longer ago. */
export function activeLabel(activeAt, now = Date.now()) {
  if (!activeAt) return '';
  const minutes = Math.floor((now - activeAt) / 60000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Active ${minutes}m ago`;
  if (minutes < 1440) return `Active ${Math.floor(minutes / 60)}h ago`;
  return '';
}
/** "now", "5m", "3h", "Mon", "Oct 12" for the conversation list. */
export function shortAgo(time, now = Date.now()) {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 1440) return new Date(time).toLocaleDateString([], { weekday: 'short' });
  return new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function dividerLabel(time, now = Date.now()) {
  if (sameDay(time, now)) return clock(time);
  if (now - time < 7 * 86400000) return `${new Date(time).toLocaleDateString([], { weekday: 'short' })} ${clock(time)}`;
  return fullTime(time);
}

export function createMessagesState() {
  return { conversations: [], unread: 0, loaded: false, listError: '', filter: '', with: '', partner: null, theme: 'showlio', partnerReadAt: null, thread: [], threadLoaded: false, draft: '', error: '', sending: false, details: false };
}

const face = (who, className = '') => `<span class="ws-msg-face ${className} ${isActive(who.activeAt) ? 'is-active' : ''}">${avatar(person(who))}</span>`;

function listMarkup(state) {
  const { conversations, loaded, listError, filter, with: open } = state.messages;
  if (!loaded) return '<li class="ws-msg-empty">Loading chats…</li>';
  if (listError && !conversations.length) return `<li class="ws-msg-empty">${icon('help')}<strong>Chats didn’t load</strong><span>${esc(listError)} We’ll keep trying.</span></li>`;
  if (!conversations.length) return `<li class="ws-msg-empty">${icon('message')}<strong>No chats yet</strong><span>Start one with any creator on Showlio.</span><button class="ws-btn ws-primary" data-action="new-message">${icon('plus')}New message</button></li>`;
  const query = filter.trim().toLowerCase();
  const shown = query ? conversations.filter((item) => `${item.name} ${item.username}`.toLowerCase().includes(query)) : conversations;
  if (!shown.length) return `<li class="ws-msg-empty">No chats match “${esc(filter.trim())}”.</li>`;
  return shown.map((item) => `<li><button class="ws-msg-convo ${item.id === open ? 'is-open' : ''} ${item.unread ? 'is-unread' : ''}" data-conversation="${esc(item.id)}" ${item.id === open ? 'aria-current="true"' : ''} aria-label="${esc(item.name)}${item.unread ? `, ${item.unread} unread` : ''}${isActive(item.activeAt) ? ', active now' : ''}">${face(item)}<span class="ws-msg-convo-text"><strong>${esc(item.name)}</strong><span class="ws-msg-convo-last"><span>${item.lastMine ? 'You: ' : ''}${esc(item.lastMessage)}</span><time datetime="${new Date(item.lastAt).toISOString()}"> · ${esc(shortAgo(item.lastAt))}</time></span></span>${item.unread ? `<b class="ws-msg-badge">${item.unread > 99 ? '99+' : item.unread}</b>` : ''}</button></li>`).join('');
}

function threadItems(state) {
  const { thread, threadLoaded, partner, partnerReadAt } = state.messages;
  if (!threadLoaded) return '<li class="ws-msg-empty">Loading messages…</li>';
  if (!thread.length) return `<li class="ws-msg-intro">${partner ? `${face(partner, 'is-large')}<strong>${esc(partner.name)}</strong><span>@${esc(partner.username)}${partner.headline ? ` · ${esc(partner.headline)}` : ''}</span><p>Say hello. Your first message starts the conversation.</p>` : ''}</li>`;
  const lastIndex = thread.length - 1;
  return thread.map((message, index) => {
    const previous = thread[index - 1];
    const next = thread[index + 1];
    const divider = !previous || message.created - previous.created > TIME_GAP || !sameDay(previous.created, message.created)
      ? `<li class="ws-msg-divider"><span>${esc(dividerLabel(message.created))}</span></li>` : '';
    const first = !previous || previous.mine !== message.mine || message.created - previous.created > GROUP_GAP || Boolean(divider);
    const last = !next || next.mine !== message.mine || next.created - message.created > GROUP_GAP || next.created - message.created > TIME_GAP || !sameDay(message.created, next.created);
    const big = BIG_EMOJI.test(message.body);
    const who = !message.mine && last && partner ? face(partner) : '<span class="ws-msg-face is-spacer"></span>';
    let status = '';
    if (message.mine && index === lastIndex) {
      if (message.pending) status = '<span class="ws-msg-status">Sending…</span>';
      else if (partnerReadAt && partnerReadAt >= message.created && partner) status = `<span class="ws-msg-status is-seen">${avatar(person(partner))}Seen</span>`;
      else status = `<span class="ws-msg-status">${icon('check')}Sent</span>`;
    }
    return `${divider}<li class="ws-msg ${message.mine ? 'is-mine' : ''} ${first ? 'is-first' : ''} ${last ? 'is-last' : ''} ${big ? 'is-emoji' : ''} ${message.pending ? 'is-pending' : ''}" data-message-id="${esc(message.id)}">${message.mine ? '' : who}<p title="${esc(fullTime(message.created))}">${esc(message.body)}</p>${status}</li>`;
  }).join('');
}

function statusText(partner) {
  if (!partner) return '';
  return activeLabel(partner.activeAt) || `@${partner.username}`;
}

function detailsMarkup(state) {
  const { partner, theme } = state.messages;
  if (!partner) return '';
  const sharing = state.preferences?.showActiveStatus !== false;
  return `<aside class="ws-msg-details" aria-label="Chat details"><button class="ws-icon-button ws-msg-details-close" data-action="chat-details" aria-label="Close chat details">${icon('close')}</button>
    <div class="ws-msg-details-who">${face(partner, 'is-large')}<h3>${esc(partner.name)}</h3><p data-chat-status>${esc(statusText(partner))}</p>${partner.headline ? `<small>${esc(partner.headline)}</small>` : ''}${partner.location ? `<small>${icon('pin')}${esc(partner.location)}</small>` : ''}</div>
    <div class="ws-msg-details-actions"><button class="ws-msg-round" data-person="${esc(partner.id)}"><span>${icon('user')}</span>Profile</button><button class="ws-msg-round" data-action="new-message"><span>${icon('plus')}</span>New chat</button></div>
    <section><h4>Chat theme</h4><p>Both of you see the theme either of you picks.</p><div class="ws-msg-themes" role="radiogroup" aria-label="Chat theme">${Object.entries(CHAT_THEMES).map(([name, item]) => `<button role="radio" aria-checked="${name === themeOf(theme)}" data-chat-theme="${name}" style="${themeStyle(name)}" aria-label="${item.label}" title="${item.label}"><span></span></button>`).join('')}</div></section>
    <section><h4>Privacy</h4><div class="ws-msg-switch-row"><div><strong id="ws-active-label">Show my active status</strong><p>When off, you won’t see when others are active either.</p></div><button type="button" role="switch" class="ws-msg-switch" aria-checked="${sharing}" aria-labelledby="ws-active-label" data-action="toggle-active-status"><span></span></button></div></section>
  </aside>`;
}

function threadMarkup(state) {
  const { with: open, partner, draft, error, theme } = state.messages;
  if (!open) return `<div class="ws-msg-placeholder">${icon('message')}<h2>Your chats</h2><p>Pick a chat on the left, or message any creator on Showlio.</p><button class="ws-btn ws-primary" data-action="new-message">${icon('plus')}New message</button></div>`;
  const who = partner ?? { name: error ? 'Chat unavailable' : 'Loading…', username: '', avatar: '' };
  const hasText = Boolean(draft.trim());
  return `<header class="ws-msg-head"><button class="ws-icon-button ws-msg-back" data-action="close-conversation" aria-label="Back to chats">${icon('arrow-left')}</button>${partner ? `<button class="ws-msg-head-who" data-person="${esc(partner.id)}" aria-label="View ${esc(partner.name)}’s profile">${face(partner)}<span><strong>${esc(who.name)}</strong><small data-chat-status>${esc(statusText(partner))}</small></span></button>` : `<span class="ws-msg-head-who">${face(who)}<span><strong>${esc(who.name)}</strong></span></span>`}${partner ? `<button class="ws-icon-button ws-msg-head-action" data-person="${esc(partner.id)}" aria-label="View profile">${icon('user')}</button><button class="ws-icon-button ws-msg-head-action ${state.messages.details ? 'is-on' : ''}" data-action="chat-details" aria-label="Chat details and settings" aria-expanded="${state.messages.details}">${icon('more')}</button>` : ''}</header>
    <ol class="ws-msg-items" aria-live="polite" aria-label="Messages with ${esc(who.name)}">${threadItems(state)}</ol>
    <p class="ws-msg-hint" data-message-error role="alert">${esc(error)}</p>
    <form class="ws-msg-composer ${hasText ? 'has-text' : ''}" data-message-form novalidate><label class="ws-sr" for="ws-msg-input">Message ${esc(who.name)}</label><textarea id="ws-msg-input" name="message" rows="1" maxlength="${MESSAGE_LIMIT}" placeholder="Aa" ${partner ? '' : 'disabled'}>${esc(draft)}</textarea><button type="submit" class="ws-msg-send" ${partner ? '' : 'disabled'} aria-label="Send message">${icon('arrow')}</button><button type="button" class="ws-msg-like" data-action="send-like" ${partner ? '' : 'disabled'} aria-label="Send a thumbs up">${LIKE}</button></form>`;
}

export function renderMessages(state) {
  const { with: open, details, partner, theme, filter } = state.messages;
  return `<section class="ws-messages ${open ? 'has-open' : ''} ${open && details && partner ? 'has-details' : ''}"><aside class="ws-msg-list" aria-label="Chats"><header class="ws-msg-list-head"><h1>Chats</h1><button class="ws-icon-button ws-msg-compose" data-action="new-message" aria-label="New message">${icon('pen')}</button></header><label class="ws-msg-filter">${icon('search')}<span class="ws-sr">Search chats</span><input type="search" data-chat-filter value="${esc(filter)}" placeholder="Search chats" autocomplete="off"></label><ul data-message-list>${listMarkup(state)}</ul></aside><section class="ws-msg-thread" data-message-thread style="${themeStyle(theme)}">${threadMarkup(state)}</section>${open && details ? detailsMarkup(state) : ''}</section>`;
}

const nearBottom = (list) => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
export function scrollToLatest(view) {
  const list = view.querySelector('.ws-msg-items');
  if (list) list.scrollTop = list.scrollHeight;
}

/** Swaps the list, the open messages, active status and theme in place, keeping the composer untouched. */
export function updateMessages(view, state, { threadChanged = false } = {}) {
  const list = view.querySelector('[data-message-list]');
  if (list) list.innerHTML = listMarkup(state);
  const { partner, theme } = state.messages;
  view.querySelector('[data-message-thread]')?.setAttribute('style', themeStyle(theme));
  for (const button of view.querySelectorAll('[data-chat-theme]')) button.setAttribute('aria-checked', String(button.dataset.chatTheme === themeOf(theme)));
  for (const line of view.querySelectorAll('[data-chat-status]')) line.textContent = statusText(partner);
  for (const faceEl of view.querySelectorAll('.ws-msg-head .ws-msg-face, .ws-msg-details .ws-msg-face')) faceEl.classList.toggle('is-active', isActive(partner?.activeAt));
  const items = view.querySelector('.ws-msg-items');
  if (!items || !threadChanged) return;
  const follow = nearBottom(items);
  items.innerHTML = threadItems(state);
  if (follow) items.scrollTop = items.scrollHeight;
}

/** The "New message" picker body. people: undefined while searching, [] when none match. */
export function peopleMarkup(people) {
  if (people === undefined) return '<li class="ws-msg-empty">Searching…</li>';
  if (!people.length) return '<li class="ws-msg-empty">No public members match. Try a username.</li>';
  return people.map((who) => `<li><button class="ws-result-person" data-message-to="${esc(who.id)}">${face(who)}<span><strong>${esc(who.name)}</strong><small>@${esc(who.username)}${who.headline ? ` · ${esc(who.headline)}` : ''}</small></span></button></li>`).join('');
}

/** The server's latest messages plus ones still sending, which stay last. */
export const mergeThread = (server, local) => [...server, ...local.filter((message) => message.pending)];

/** Whether a poll changed what the open conversation shows, "Seen" included. */
export const threadDiffers = (a, b) => a.length !== b.length || a.some((message, index) => message.id !== b[index].id);
