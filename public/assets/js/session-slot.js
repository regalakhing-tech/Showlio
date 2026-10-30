// Several accounts can be signed in at once, one per tab. Every sign-in is its own
// session with a random id; this tab remembers its id and names it on every API
// call, so signing in or out in another tab never changes the account shown here.
const KEY = 'showlio-slot';
const VALID = /^(main|[a-z0-9]{8})$/;
const CHANNEL = 'showlio-sessions';
const TAB = Math.random().toString(36).slice(2); // Tells this tab's own messages apart from other tabs'.

export function currentSlot() {
  try {
    const slot = sessionStorage.getItem(KEY);
    return VALID.test(slot ?? '') ? slot : null;
  } catch {
    return null;
  }
}

export function slotHeaders() {
  const slot = currentSlot();
  return slot ? { 'X-Showlio-Slot': slot } : {};
}

export function rememberSlot(response) {
  const slot = response.headers.get('X-Showlio-Slot');
  if (!VALID.test(slot ?? '')) return;
  try { sessionStorage.setItem(KEY, slot); } catch { /* Private mode: falls back to the first signed-in account. */ }
}

// "Use another account", or signing out of a session another tab still uses: this tab lets
// go of the session, which stays signed in for the other tabs.
export function forgetSlot() {
  try { sessionStorage.removeItem(KEY); } catch { /* Nothing stored. */ }
}

/** Answers other tabs asking whether a session is in use here. Returns the channel (close it to stop). */
export function answerSessionChecks(getSlot = currentSlot, tab = TAB) {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = ({ data }) => {
    if (data?.type === 'who' && data.tab !== tab && data.slot && data.slot === getSlot()) channel.postMessage({ type: 'here', slot: data.slot, tab });
  };
  return channel;
}

/** Whether another open tab is using this session, so signing out here would sign it out too. */
export function sessionUsedElsewhere(slot, { wait = 250, tab = TAB } = {}) {
  if (!slot || typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const finish = (answer) => { clearTimeout(timer); channel.close(); resolve(answer); };
    const timer = setTimeout(() => finish(false), wait);
    channel.onmessage = ({ data }) => { if (data?.type === 'here' && data.slot === slot && data.tab !== tab) finish(true); };
    channel.postMessage({ type: 'who', slot, tab });
  });
}
