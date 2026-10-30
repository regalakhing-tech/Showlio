export const esc = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const asset = (name) => `/assets/images/${name}.webp`;
export const icon = (name) => `<svg class="ws-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="/assets/workspace-icons.svg#${esc(name)}"/></svg>`;
export const compact = (value) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
// People without a photo get a colored monogram, like most real communities.
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
export const avatar = (person, className = '') => person.avatar
  ? `<img class="ws-avatar ${className}" src="${esc(person.avatar)}" alt="" width="44" height="44" loading="lazy">`
  : `<span class="ws-avatar ws-monogram ${className}" style="--hue:${Number(person.hue) || 220}" aria-hidden="true">${esc(initials(person.name))}</span>`;

// Replacing a view should keep a keyboard user's place, including when a saved
// card disappears and the next card takes its place.
export function withPreservedFocus(root, update, fallback = root) {
  const active = document.activeElement;
  const controls = () => [...root.querySelectorAll('button, a, input, select, textarea, [tabindex]')];
  let restore;
  if (root.contains(active) && active !== document.body) {
    const identity = active.id ? 'id' : active.getAttributeNames().find(name => name.startsWith('data-')) || (active.hasAttribute('name') ? 'name' : active.hasAttribute('href') ? 'href' : 'type');
    const value = active.getAttribute(identity);
    const sameKind = element => element.tagName === active.tagName && element.hasAttribute(identity);
    const sameControl = element => sameKind(element) && element.getAttribute(identity) === value;
    const matches = controls();
    restore = { sameKind, sameControl, exactIndex: matches.filter(sameControl).indexOf(active), kindIndex: matches.filter(sameKind).indexOf(active) };
  }
  update();
  if (!restore || active.isConnected) return;
  const available = controls().filter(element => !element.disabled && element.getClientRects().length);
  const exact = available.filter(restore.sameControl);
  const successors = available.filter(restore.sameKind);
  const target = exact[Math.max(0, restore.exactIndex)] || successors[Math.min(Math.max(0, restore.kindIndex), successors.length - 1)] || fallback;
  target?.focus({ preventScroll: true });
}

export async function readImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose an image smaller than 2 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Please choose another.'); });
  bitmap.close();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

// Shrinks a chosen photo (512px for profile photos, 1600px for project covers) to a WebP data URL,
// so uploads take moments even on a slow connection instead of sending the original multi-megabyte file.
export async function resizeImage(file, max) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Please choose another.'); });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.88); // Browsers without WebP encoding return PNG, which the API also accepts.
}
