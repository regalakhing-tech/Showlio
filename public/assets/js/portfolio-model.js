const layouts = new Set(['classic', 'minimal', 'showcase', 'bento', 'gallery']);
const workTypes = new Set(['website', 'app', 'product', 'design', 'video', 'other']);
const linkFields = ['website', 'instagram', 'github', 'linkedin'];
// brand: the name beside the logo, when it differs from the display name on the page.
const profileFields = ['name', 'brand', 'role', 'intro', 'bio', 'slug', 'location', 'availability'];
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

// Photos stored in Showlio's Supabase Storage: public avatars and signed project photos.
const storageImage = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:public|sign)\/[a-z0-9-]+\/[\w./%-]+(?:\?token=[\w.-]+)?$/i;

function safeImage(value) {
  if (!value) return false;
  if (storageImage.test(value)) return true;
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

// The header logo's height in pixels; wide logos keep their shape.
export const LOGO_SIZES = { min: 24, max: 120, default: 40 };
const logoSize = value => Number.isInteger(value) && value >= LOGO_SIZES.min && value <= LOGO_SIZES.max ? value : LOGO_SIZES.default;

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
      images: strings(item.images).filter(safeImage).slice(0, 10),
      category: text(item.category).slice(0, 40),
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
      logoSize: logoSize(appearance.logoSize),
    },
    works, updatedAt: timestamp(input.updatedAt),
  };
  if (Number.isSafeInteger(input.publishedAt) && input.publishedAt >= 0) result.publishedAt = timestamp(input.publishedAt);
  if (layouts.has(input.publishedLayout)) result.publishedLayout = input.publishedLayout;
  return result;
}

const availabilityLabels = { available: 'Open to collaborate', showcasing: 'Showcasing my work' };
// Showlio project categories, grouped into the portfolio's work types.
const categoryTypes = { Video: 'video', Design: 'design', 'UI/UX': 'design', Illustration: 'design', 'Digital Art': 'design', Photography: 'design', Development: 'product', 'AI Automation': 'product' };

/** The availability line a portfolio shows for a Showlio availability setting. */
export const availabilityLabel = value => availabilityLabels[value] ?? '';

/** A creator's Showlio profile and published projects (GET /api/portfolio) as a portfolio. */
export function portfolioFromCreator(page) {
  const input = record(page);
  const source = record(input.profile);
  const links = {};
  for (const item of Array.isArray(input.links) ? input.links : []) if (linkFields.includes(item?.kind) && !links[item.kind]) links[item.kind] = text(item.url);
  const current = normalizePortfolio({
    profile: {
      ...links, name: source.name, role: text(source.headline) || (text(source.username) ? `@${text(source.username)}` : ''),
      bio: source.bio, location: source.location, availability: availabilityLabel(source.availability), avatar: source.avatar, skills: input.skills,
    },
    style: { layout: source.template }, // The template the creator picked for their page.
    works: (Array.isArray(input.projects) ? input.projects : []).map(project => {
      const category = text(record(project).categories?.[0]);
      const images = strings(project?.images);
      return { id: project?.id, title: project?.title, description: project?.description, type: categoryTypes[category] ?? 'other', category, image: images[0], images, skills: project?.tools, visible: true };
    }),
  });
  if (!input.portfolio || typeof input.portfolio !== 'object') return current;
  const published = normalizePortfolio(input.portfolio);
  // Refresh linked project data, keeping the published order, inclusion, type and link.
  // Newly posted work joins the builder first; it is public here after the next publish.
  const fresh = new Map(current.works.map(work => [`${SHOWLIO_WORK}${work.id}`, work]));
  published.works = published.works.filter(work => !isShowlioWork(work) || fresh.has(work.id)).map(work => {
    const project = fresh.get(work.id);
    return project ? { ...work, title: project.title, description: project.description, category: project.category, image: project.image, images: project.images, skills: project.skills } : work;
  });
  return published;
}

/**
 * Whether the editor's draft is the creator's published page (or newer edits of it). A draft from before
 * that publish, from another device or account, or an untouched starting draft is not, and the
 * editor reopens on the published page instead.
 */
export const draftMatchesPublished = (draft, published) => !published || (Boolean(draft) && draft.publishedAt === published.publishedAt);

/** Restore an editable copy without re-including projects omitted from the saved public page. */
export function portfolioDraftFromCreator(page) {
  const published = portfolioFromCreator(page);
  const included = new Set(published.works.map(work => work.id));
  const current = portfolioFromCreator({ ...page, portfolio: null });
  published.works = mergeShowlioWorks(published.works, current.works).map(work => included.has(work.id) ? work : { ...work, visible: false });
  published.publishedLayout = published.style.layout;
  return published;
}

// Works linked to a Showlio project carry this id prefix.
export const SHOWLIO_WORK = 'showlio-';
export const isShowlioWork = work => String(work?.id ?? '').startsWith(SHOWLIO_WORK);
// The sample works the removed "Load starter collection" button used to add, by title and photo.
const sampleWorks = new Set(['Flow|project-habitify.webp', 'Studio|project-taskflow.webp', 'Clay Collection|portfolio-clay.jpg', 'Orbit|project-brand-identity.webp', 'Trail Notes|workspace-mountains.webp', 'Focus|project-habitify.webp'].map(key => key.replace('|', '|/assets/images/')));

/**
 * The portfolio's works with the creator's published Showlio projects (portfolioFromCreator works)
 * folded in: new projects first, linked ones refreshed (title, description, category, photos, tools)
 * while their place, visibility, type, role and link stay as the creator set them. Projects removed
 * from Showlio leave; works added by hand stay. Old sample works are dropped.
 */
export function mergeShowlioWorks(current, projects) {
  const fresh = new Map((Array.isArray(projects) ? projects : []).map(work => [`${SHOWLIO_WORK}${work.id}`, work]));
  const kept = (Array.isArray(current) ? current : [])
    .filter(work => !sampleWorks.has(`${work.title}|${work.image}`))
    .filter(work => !isShowlioWork(work) || fresh.has(work.id))
    .map(work => {
      const project = fresh.get(work.id);
      return project ? { ...work, title: project.title, description: project.description, category: project.category, image: project.image, images: project.images, skills: project.skills } : work;
    });
  const known = new Set(kept.map(work => work.id));
  const added = [...fresh].filter(([id]) => !known.has(id)).map(([id, project]) => ({ ...project, id, visible: true }));
  return [...added, ...kept];
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
      if (Array.isArray(work.skills) && (work.skills.length > 15 || work.skills.some(skill => text(skill).length > 40))) add(`${field}.skills`, 'Use up to 15 skills, each at most 40 characters.');
    }
  }
  if (step === 3) {
    const style = record(input.style);
    if (text(style.layout) && !layouts.has(style.layout)) add('style.layout', 'Choose one of the available layouts.');
    if (text(style.accent) && !/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(text(style.accent))) add('style.accent', 'Choose a valid hex color.');
    if (text(style.background) && !['white', 'tint'].includes(style.background)) add('style.background', 'Choose a white or tinted background.');
    if (style.logoSize !== undefined && logoSize(style.logoSize) !== style.logoSize) add('style.logoSize', `Choose a logo size from ${LOGO_SIZES.min} to ${LOGO_SIZES.max} pixels.`);
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
