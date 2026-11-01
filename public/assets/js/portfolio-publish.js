import { createPublishedSnapshot } from './portfolio-model.js';

/** Upload local images before publishing the complete portfolio. Never report a failed save as live. */
export async function publishPortfolio(value, { fetchImpl = fetch, headers = {} } = {}) {
  const snapshot = createPublishedSnapshot(value);
  async function request(url, method, body) {
    const response = await fetchImpl(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(Object.values(data.errors ?? {})[0] ?? data.error ?? 'Your portfolio could not be published. Try again.');
    return data;
  }
  const uploaded = new Map();
  async function image(source) {
    if (!source?.startsWith('data:')) return source || '';
    if (!uploaded.has(source)) {
      uploaded.set(source, request('/api/portfolio/media', 'POST', { image: source }).then(data => {
        if (typeof data.image !== 'string' || !data.image) throw new Error('Your image could not be uploaded. Try again.');
        return data.image;
      }));
    }
    return uploaded.get(source);
  }
  snapshot.profile.logo = await image(snapshot.profile.logo);
  snapshot.profile.avatar = await image(snapshot.profile.avatar);
  for (const work of snapshot.works) {
    work.image = await image(work.image);
    work.images = await Promise.all(work.images.map(image));
  }
  const saved = await request('/api/portfolio', 'PUT', snapshot);
  if (Number.isSafeInteger(saved.publishedAt)) snapshot.publishedAt = saved.publishedAt;
  return snapshot;
}
