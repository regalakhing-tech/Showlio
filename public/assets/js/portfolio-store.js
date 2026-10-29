import { normalizePortfolio, validateStep } from './portfolio-model.js';

// A separate database keeps the workspace/account store entirely untouched.
const databaseName = 'showlio-portfolio-v1';
let databasePromise;
let writeQueue = Promise.resolve();

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB storage is unavailable in this browser.'));
      return;
    }
    let request;
    let failed = false;
    try { request = globalThis.indexedDB.open(databaseName, 1); } catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('snapshots')) database.createObjectStore('snapshots', { keyPath: 'slug' });
    };
    request.onerror = () => { failed = true; reject(request.error || new Error('Unable to open portfolio storage.')); };
    request.onblocked = () => { failed = true; reject(new Error('Portfolio storage is blocked by another open page. Close it and retry.')); };
    request.onsuccess = () => {
      const database = request.result;
      if (failed) { database.close(); return; }
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

async function transaction(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    let request;
    let result;
    try {
      tx = database.transaction(storeName, mode);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || request?.error || new Error('Portfolio storage transaction was cancelled.'));
      tx.onerror = () => reject(tx.error || request?.error || new Error('Unable to save portfolio data.'));
      request = action(tx.objectStore(storeName));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('Unable to access portfolio data.'));
    } catch (error) { reject(error); }
  });
}

function enqueueWrite(action) {
  const pending = writeQueue.then(action);
  // A failed save must reject its caller while allowing the next save to retry.
  writeQueue = pending.catch(() => {});
  return pending;
}

export async function loadDraft() {
  await writeQueue;
  const value = await transaction('drafts', 'readonly', store => store.get('primary'));
  return value ? normalizePortfolio(value, { draft: true }) : null;
}

export async function saveDraft(portfolio) {
  // Capture now, before joining the queue: later edits cannot alter this write.
  const draft = normalizePortfolio(portfolio, { draft: true });
  draft.updatedAt = Date.now();
  return enqueueWrite(async () => {
    await transaction('drafts', 'readwrite', store => store.put(draft));
    return normalizePortfolio(draft, { draft: true });
  });
}

export async function saveSnapshot(value) {
  const errors = validateStep(value, 4);
  if (errors.length) {
    const error = new Error(`Your portfolio is not ready: ${errors[0].message}`);
    error.errors = errors;
    throw error;
  }
  const snapshot = normalizePortfolio(value);
  snapshot.works = snapshot.works.filter(work => work.visible);
  return enqueueWrite(async () => {
    await transaction('snapshots', 'readwrite', store => store.put({ slug: snapshot.profile.slug, portfolio: snapshot }));
    return normalizePortfolio(snapshot);
  });
}

export async function loadSnapshot(slug) {
  await writeQueue;
  const value = await transaction('snapshots', 'readonly', store => store.get(typeof slug === 'string' ? slug : ''));
  if (!value?.portfolio) return null;
  const snapshot = normalizePortfolio(value.portfolio);
  snapshot.works = snapshot.works.filter(work => work.visible);
  return snapshot;
}
