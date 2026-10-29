const layouts = new Set(['classic', 'minimal', 'showcase']);
const workTypes = new Set(['website', 'app', 'product', 'design', 'video', 'other']);
const linkFields = ['website', 'instagram', 'github', 'linkedin'];
const profileFields = ['name', 'role', 'intro', 'bio', 'slug', 'location', 'availability'];
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const draftText = value => typeof value === 'string' ? value : '';
const text = value => typeof value === 'string' ? value.trim() : '';
const strings = value => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000 ? value : 0;
const slugIsValid = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;

function safeHttps(value) {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return /^https:\/\//i.test(value) && url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

function safeEmail(value) {
  return value.length <= 254 && /^[^\s@<>:;,?"\\]+@[^\s@<>:;,?"\\.]+(?:\.[^\s@<>:;,?"\\.]+)+$/.test(value);
}

function safeImage(value) {
  if (!value) return false;
  if (/^\/assets\/(?:[a-z0-9_~-][a-z0-9._~-]*\/)*[a-z0-9_~-][a-z0-9._~-]*\.(?:png|jpe?g|gif|webp|avif)$/i.test(value)) return true;
  const match = /^data:image\/(png|jpeg|gif|webp|avif);base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length % 4 || match[2].length > Math.ceil(5 * 1024 * 1024 / 3) * 4) return false;
  let bytes;
  try { bytes = atob(match[2]); } catch { return false; }
  if (bytes.length > 5 * 1024 * 1024) return false;
  switch (match[1].toLowerCase()) {
    case 'png': return bytes.length >= 45 && bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.slice(12, 16) === 'IHDR' && bytes.slice(-8, -4) === 'IEND';
    case 'jpeg': return bytes.length >= 12 && bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9');
    case 'gif': return bytes.length >= 14 && /^GIF8[79]a/.test(bytes) && bytes.endsWith(';');
    case 'webp': return bytes.length >= 20 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    case 'avif': return bytes.length >= 24 && bytes.slice(4, 8) === 'ftyp' && /avif|avis/.test(bytes.slice(8, 32));
    default: return false;
  }
}

function accentColor(value) {
  const color = text(value).toLowerCase();
  if (/^#[a-f0-9]{6}$/.test(color)) return color;
  if (/^#[a-f0-9]{3}$/.test(color)) return `#${[...color.slice(1)].map(character => character.repeat(2)).join('')}`;
  return '#006aff';
}

/** Restore only the schema. Drafts retain unfinished link/contact/page text for editing. */
export function normalizePortfolio(value, { draft = false } = {}) {
  const input = record(value);
  const source = record(input.profile);
  const appearance = record(input.style);
  const profile = {};
  for (const key of profileFields) profile[key] = text(source[key]);
  if (draft) profile.slug = draftText(source.slug);
  else if (!slugIsValid(profile.slug)) profile.slug = '';
  for (const key of ['logo', 'avatar']) profile[key] = safeImage(text(source[key])) ? text(source[key]) : '';
  profile.email = draft ? draftText(source.email) : safeEmail(text(source.email)) ? text(source.email) : '';
  for (const key of linkFields) profile[key] = draft ? draftText(source[key]) : safeHttps(text(source[key])) ? text(source[key]) : '';
  profile.skills = strings(source.skills);
  const ids = new Set();
  const works = (Array.isArray(input.works) ? input.works : []).filter(item => item && typeof item === 'object' && !Array.isArray(item)).map((item, index) => {
    let id = text(item.id) || `work-${index + 1}`;
    const initialId = id;
    let suffix = 2;
    while (ids.has(id)) id = `${initialId}-${suffix++}`;
    ids.add(id);
    return {
      id, title: text(item.title), description: text(item.description),
      type: workTypes.has(item.type) ? item.type : 'other',
      image: safeImage(text(item.image)) ? text(item.image) : '',
      url: draft ? draftText(item.url) : safeHttps(text(item.url)) ? text(item.url) : '',
      role: text(item.role), skills: strings(item.skills), visible: item.visible !== false,
    };
  });
  const result = {
    version: 1, id: 'primary', profile,
    style: {
      layout: layouts.has(appearance.layout) ? appearance.layout : 'classic',
      accent: accentColor(appearance.accent),
      background: appearance.background === 'tint' ? 'tint' : 'white',
      showLogo: typeof appearance.showLogo === 'boolean' ? appearance.showLogo : true,
      showAvatar: typeof appearance.showAvatar === 'boolean' ? appearance.showAvatar : true,
    },
    works, updatedAt: timestamp(input.updatedAt),
  };
  if (Number.isSafeInteger(input.publishedAt) && input.publishedAt >= 0) result.publishedAt = timestamp(input.publishedAt);
  return result;
}

/** Copy a workspace identity; no workspace reference or project collection is kept. */
export function createPortfolio(seed = {}) {
  const input = record(seed);
  const source = input.profile ? record(input.profile) : input;
  const links = record(source.links);
  const name = text(source.name);
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
  return normalizePortfolio({
    profile: { ...source, ...links, name, role: source.role ?? source.headline, slug: source.slug ?? slug },
    style: input.style, works: input.works, updatedAt: Date.now(),
  });
}

/** Errors use stable field paths so the builder can focus the matching input. */
export function validateStep(portfolio, step) {
  const input = record(portfolio);
  const profile = record(input.profile);
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (step === 4) return [0, 1, 2, 3].flatMap(index => validateStep(input, index));
  if (step === 0) {
    if (!text(profile.name)) add('profile.name', 'Enter your name.');
    if (!text(profile.role)) add('profile.role', 'Enter your role or headline.');
    if (!slugIsValid(text(profile.slug))) add('profile.slug', 'Use a page name of up to 80 lowercase letters, numbers and single hyphens.');
    if (text(profile.email) && !safeEmail(text(profile.email))) add('profile.email', 'Enter a valid email address.');
    for (const key of linkFields) if (text(profile[key]) && !safeHttps(text(profile[key]))) add(`profile.${key}`, 'Use an HTTPS link without embedded credentials.');
    for (const key of ['avatar', 'logo']) if (text(profile[key]) && !safeImage(text(profile[key]))) add(`profile.${key}`, 'Choose a valid raster image up to 5 MB.');
  }
  if (step === 2) {
    const works = visibleWorks(input);
    if (!works.some(work => text(work.title))) add('works', 'Include at least one work with a title.');
    for (const work of works) {
      const field = `works.${text(work.id)}`;
      if (!text(work.title)) add(`${field}.title`, 'Give this included work a title.');
      if (text(work.url) && !safeHttps(text(work.url))) add(`${field}.url`, 'Use an HTTPS link without embedded credentials.');
      if (text(work.image) && !safeImage(text(work.image))) add(`${field}.image`, 'Choose a valid raster image up to 5 MB.');
    }
  }
  if (step === 3) {
    const style = record(input.style);
    if (text(style.layout) && !layouts.has(style.layout)) add('style.layout', 'Choose one of the available layouts.');
    if (text(style.accent) && !/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(text(style.accent))) add('style.accent', 'Choose a valid hex color.');
    if (text(style.background) && !['white', 'tint'].includes(style.background)) add('style.background', 'Choose a white or tinted background.');
  }
  return errors;
}

export function visibleWorks(portfolio) {
  return (Array.isArray(portfolio?.works) ? portfolio.works : []).filter(work => work && typeof work === 'object' && !Array.isArray(work) && work.visible !== false);
}

export function filterWorks(works, { query = '', type = 'all' } = {}) {
  const search = text(query).toLowerCase();
  return (Array.isArray(works) ? works : []).filter(work => work && (type === 'all' || !type || work.type === type) && (!search || [work.title, work.description, work.role, ...strings(work.skills)].map(text).join(' ').toLowerCase().includes(search)));
}

export function reorderWorks(works, id, direction) {
  const result = Array.isArray(works) ? [...works] : [];
  const index = result.findIndex(work => work.id === id);
  const target = index + direction;
  if ([-1, 1].includes(direction) && index >= 0 && target >= 0 && target < result.length) [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function createPublishedSnapshot(portfolio, now = Date.now()) {
  const errors = validateStep(portfolio, 4);
  if (errors.length) {
    const error = new Error(`Your portfolio is not ready: ${errors[0].message}`);
    error.errors = errors;
    throw error;
  }
  const snapshot = normalizePortfolio(portfolio);
  snapshot.works = visibleWorks(snapshot);
  snapshot.publishedAt = timestamp(now);
  return snapshot;
}

export function portfolioProgress(portfolio) {
  return [0, 1, 2, 3, 4].map(step => validateStep(portfolio, step).length === 0);
}
