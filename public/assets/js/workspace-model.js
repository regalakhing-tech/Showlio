import { defaultProfile, workspaceProjects, people } from './workspace-data.js';

const clone = (value) => structuredClone(value);
// Repository images, a just-chosen upload, or a saved photo in the public Supabase avatars bucket.
const safeImage = (value) => typeof value === 'string' && value.length < 3 * 1024 * 1024 && (/^\/assets\/images\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/.test(value) || /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value) || /^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/avatars\/[A-Za-z0-9/_.-]+$/.test(value));
export function normalizeProfile(input) {
  const profile = clone(defaultProfile);
  for (const [key, limit] of [['name', 60], ['headline', 100], ['bio', 500], ['location', 100]]) {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if ((key === 'name' || key === 'headline') && !value) throw new Error(`Please enter a ${key}.`);
    if (value.length > limit) throw new Error(`${key} must be ${limit} characters or fewer.`);
    profile[key] = value;
  }
  if (input.avatar && !safeImage(input.avatar)) throw new Error('Choose a valid profile image.');
  profile.avatar = input.avatar || '';
  profile.availability = ['available', 'unavailable', 'showcasing'].includes(input.availability) ? input.availability : 'available';
  profile.visible = input.visible !== false;
  if (!Array.isArray(input.skills) || input.skills.length > 15 || input.skills.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 40)) throw new Error('Use up to 15 skills, each 40 characters or fewer.');
  profile.skills = [...new Map(input.skills.map((skill) => [skill.trim().toLowerCase(), skill.trim()])).values()];
  profile.links = {};
  for (const key of ['website', 'instagram', 'youtube']) {
    const value = typeof input.links?.[key] === 'string' ? input.links[key].trim() : '';
    if (value) {
      let url;
      try { url = new URL(value); } catch { throw new Error('Use a complete HTTPS URL for your social links.'); }
      if (url.protocol !== 'https:' || url.username || url.password || value.length > 500) throw new Error('Use HTTPS links without embedded credentials.');
    }
    profile.links[key] = value;
  }
  return profile;
}
export function createWorkspaceState(saved = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  // The signed-in creator's real profile comes from /api/profile (workspace.js); this sample only serves tests.
  const profile = clone(defaultProfile);
  const customProjects = Array.isArray(saved.customProjects) ? saved.customProjects.filter((project) => project && typeof project.id === 'string' && project.id.length <= 80 && /^local-[a-z0-9-]+$/.test(project.id) && typeof project.title === 'string' && project.title.trim() && project.title.length <= 80 && typeof project.description === 'string' && project.description.trim() && project.description.length <= 300 && safeImage(project.image) && Array.isArray(project.categories) && project.categories.length >= 1 && project.categories.length <= 3 && project.categories.every((category) => typeof category === 'string' && category.trim() && category.length <= 40)).slice(0, 20).map((project) => ({
    id: project.id, title: project.title.trim(), description: project.description.trim(), image: project.image,
    categories: [...new Set(project.categories.map(category => category.trim()))],
    duration: typeof project.duration === 'string' && /^\d{1,2}:[0-5]\d$/.test(project.duration) ? project.duration : '',
    creator: 'self', owner: true, views: 0, likes: 0, comments: 0,
    created: Number.isSafeInteger(project.created) && project.created >= 0 && project.created <= 8640000000000000 ? project.created : 0,
  })) : [];
  const projects = [...customProjects, ...clone(workspaceProjects)];
  const knownIds = new Set(projects.map((project) => project.id));
  const list = (key, allowed) => Array.isArray(saved[key]) ? [...new Set(saved[key].filter((id) => allowed.has(id)))] : [];
  const preferences = { rememberWorkspace: true, showAvailability: true, communityDiscovery: true, projectNotifications: true, messageNotifications: true, communityNotifications: true, productNotifications: false };
  for (const key of Object.keys(preferences)) if (typeof saved.preferences?.[key] === 'boolean') preferences[key] = saved.preferences[key];
  return { profile, draft: clone(profile), projects, customProjects, notifications: [], followers: 0, preferences, following: list('following', new Set(people.map((person) => person.id))), bookmarks: list('bookmarks', knownIds), likes: list('likes', knownIds), page: 'explore', settingsTab: 'profile', notificationTab: 'all', feed: { query: '', category: 'All', sort: 'for-you', savedOnly: false, mineOnly: false, filtersOpen: false } };
}
export function filterProjects(projects, filters = {}, bookmarks = []) {
  const query = String(filters.query ?? '').trim().toLowerCase();
  const result = projects.filter((project) => (!filters.savedOnly || bookmarks.includes(project.id)) && (!filters.mineOnly || project.owner) && (!filters.category || filters.category === 'All' || project.categories.includes(filters.category)) && (!query || `${project.title} ${project.description} ${people.find((person) => person.id === project.creator)?.name ?? ''} ${project.categories.join(' ')} ${(project.tools ?? []).join(' ')}`.toLowerCase().includes(query)));
  if (filters.sort === 'popular') result.sort((a, b) => b.likes - a.likes);
  if (filters.sort === 'trending') result.sort((a, b) => b.views - a.views);
  if (filters.sort === 'latest') result.sort((a, b) => b.created - a.created);
  return result;
}
export const profileCompletion = (profile, hasProject = false) => (profile.avatar ? 20 : 0) + (profile.bio.trim() ? 25 : 0) + (profile.skills.length >= 3 ? 20 : 0) + (Object.values(profile.links).some(Boolean) ? 20 : 0) + (hasProject ? 15 : 0);
export function serializeWorkspace(state) {
  return { version: 1, customProjects: state.customProjects, following: state.following, bookmarks: state.bookmarks, likes: state.likes, preferences: state.preferences };
}
