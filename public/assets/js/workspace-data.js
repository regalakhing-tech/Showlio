// Illustrative demo content. People, projects and activity are fictional.
export const defaultProfile = {
  name: 'Sophia Carter', headline: 'Video Creator & Motion Designer',
  bio: 'I’m a video creator and motion designer with 5+ years of experience bringing ideas to life through engaging visuals. I love working with brands, startups, and fellow creators to tell meaningful stories.',
  location: 'San Francisco, CA', availability: 'available', visible: true,
  avatar: '/assets/images/thumbs/workspace-sophia.webp', skills: ['Video Editing', 'Motion Design', 'Storytelling', 'After Effects', 'Color Grading', 'Content Strategy', 'Brand Marketing'],
  links: { website: 'https://example.com/sophia', instagram: '', youtube: '' },
};

// The four kinds of work Showlio is built around, plus product design.
export const disciplines = [
  { id: 'Development', icon: 'code', color: '#1f6bff', tint: '#e8f0ff' },
  { id: 'AI Automation', icon: 'workflow', color: '#7a3cff', tint: '#f1eaff' },
  { id: 'Video', icon: 'video', color: '#e23c86', tint: '#ffebf4' },
  { id: 'Digital Art', icon: 'palette', color: '#0b9a87', tint: '#e2f7f3' },
  { id: 'Design', icon: 'pen', color: '#e8710d', tint: '#fff1e4' },
];
export const disciplineById = (id) => disciplines.find((item) => item.id === id);

const thumb = (name) => `/assets/images/thumbs/${name}.webp`;
export const people = [
  { id: 'daniel', name: 'Daniel Cruz', role: 'Full-Stack Developer', avatar: thumb('daniel-cruz') },
  { id: 'noah', name: 'Noah Reyes', role: 'AI Automation Engineer', hue: 262 },
  { id: 'kenji', name: 'Kenji Tan', role: 'Videographer & Editor', avatar: thumb('kenji-tan') },
  { id: 'maya', name: 'Maya Santos', role: 'Digital Artist', avatar: thumb('maya-santos') },
  { id: 'elena', name: 'Elena Park', role: 'Creative Developer', hue: 212 },
  { id: 'priya', name: 'Priya Desai', role: 'Machine Learning Engineer', hue: 292 },
  { id: 'alex', name: 'Alex Rivera', role: 'Product Designer', avatar: thumb('alex-rivera') },
  { id: 'lia', name: 'Lia Mendoza', role: 'Brand Designer', avatar: thumb('lia-mendoza') },
  { id: 'marcus', name: 'Marcus Lee', role: '3D & Matte Painting Artist', hue: 172 },
  { id: 'jordan', name: 'Jordan Kim', role: 'Backend Developer', hue: 228 },
];
export const personById = (id) => people.find((person) => person.id === id) ?? people[0];

// `cover` draws a live code or workflow preview instead of a photo.
export const workspaceProjects = [
  { id: 'ai-notes', title: 'AI Notes', description: 'Turns meeting recordings into clear summaries and action items, ready to share.', image: thumb('project-taskflow'), creator: 'daniel', categories: ['Development', 'AI Automation'], tools: ['Next.js', 'TypeScript'], views: 14200, likes: 1240, comments: 64, created: 12,
    cover: { type: 'code', file: 'notes.ts', lines: ['import { summarize } from "ai";', '', 'export async function notes(call) {', '  const text = await call.text();', '  return summarize(text, {', '    format: "action-items",', '  });', '}'] } },
  { id: 'inbox-pilot', title: 'Inbox Pilot', description: 'An AI workflow that sorts support email, drafts replies and alerts the team when it matters.', image: thumb('project-taskflow'), creator: 'noah', categories: ['AI Automation'], tools: ['Python', 'Webhooks'], views: 9800, likes: 802, comments: 41, created: 11,
    cover: { type: 'flow', stat: '1.2K runs a week', nodes: [['mail', 'New email'], ['sparkles', 'AI triage'], ['message', 'Draft reply']], branch: ['bell', 'Alert team'] } },
  { id: 'neon', title: 'Neon Dreams', description: 'A brand film exploring people and technology through vibrant light and motion.', image: thumb('workspace-neon'), creator: 'self', owner: true, categories: ['Video'], tools: ['After Effects', 'DaVinci Resolve'], views: 12400, likes: 892, comments: 48, duration: '0:48', created: 10 },
  { id: 'luma', title: 'Luma 3D Identity', description: 'Flowing 3D forms that became the visual identity for a young design studio.', image: thumb('workspace-luma'), creator: 'maya', categories: ['Digital Art'], tools: ['Blender', 'Cinema 4D'], views: 9300, likes: 1021, comments: 37, created: 9 },
  { id: 'taskflow', title: 'TaskFlow Dashboard', description: 'A team planner with live timelines, built as a fast and accessible React app.', image: thumb('project-taskflow'), creator: 'elena', categories: ['Development', 'Design'], tools: ['React', 'Tailwind'], views: 8700, likes: 653, comments: 32, created: 8 },
  { id: 'travel', title: 'Paris After Rain', description: 'A short travel film about quiet streets, warm light and the moments between places.', image: thumb('project-travel'), creator: 'kenji', categories: ['Video'], tools: ['Premiere Pro', 'Sony FX3'], views: 15200, likes: 1100, comments: 76, duration: '2:14', created: 7 },
  { id: 'lead-scout', title: 'Lead Scout Agent', description: 'An AI agent that researches new leads and writes a one-page brief for the sales team.', image: thumb('project-taskflow'), creator: 'priya', categories: ['AI Automation'], tools: ['LangGraph', 'Postgres'], views: 7600, likes: 588, comments: 29, created: 6,
    cover: { type: 'flow', stat: '18 hours saved a week', nodes: [['search', 'New lead'], ['bot', 'Research agent'], ['document', 'Write brief']], branch: ['users', 'Sync CRM'] } },
  { id: 'alpine', title: 'Alpine Dusk', description: 'A digital matte painting of snow peaks at sunset, painted for a film title sequence.', image: thumb('workspace-mountains'), creator: 'marcus', categories: ['Digital Art'], tools: ['Photoshop', 'Procreate'], views: 11300, likes: 964, comments: 52, created: 5 },
  { id: 'devflow', title: 'DevFlow Previews', description: 'A small deploy pipeline that builds, tests and ships a preview for every pull request.', image: thumb('project-taskflow'), creator: 'jordan', categories: ['Development'], tools: ['Node.js', 'Docker'], views: 6400, likes: 471, comments: 22, created: 4,
    cover: { type: 'code', file: 'pipeline.ts', lines: ['export const preview = flow({', '  name: "preview-deploy",', '  on: "pull_request",', '  steps: [', '    build(), test(),', '    deploy({ preview: true }),', '  ],', '});'] } },
  { id: 'brand', title: 'Orbit Brand System', description: 'A minimal identity with a geometric mark, type system and print collateral.', image: thumb('project-brand-identity'), creator: 'lia', categories: ['Design'], tools: ['Illustrator', 'Figma'], views: 9100, likes: 721, comments: 24, created: 3 },
  { id: 'content', title: 'How I Plan My Content', description: 'A behind-the-scenes look at my creative process and weekly planning workflow.', image: thumb('workspace-content'), creator: 'self', owner: true, categories: ['Video'], tools: ['Premiere Pro', 'Notion'], views: 21600, likes: 1400, comments: 93, duration: '1:12', created: 2 },
  { id: 'habitify', title: 'Habitify Mobile', description: 'A friendly habit tracker concept with playful progress and gentle reminders.', image: thumb('project-habitify'), creator: 'alex', categories: ['Design', 'Development'], tools: ['Figma', 'SwiftUI'], views: 8200, likes: 682, comments: 31, created: 1 },
];
export const companies = [
  { id: 'lume', name: 'Lume Studios', mark: 'Lume', style: 'lume', time: '2h ago', project: 'Product Launch Film', tags: ['Video Editing', 'Motion Design', 'Color Grading'] },
  { id: 'orbit', name: 'Orbit', mark: '△', style: 'orbit', time: '1d ago', project: 'AI Feature Explainer Series', tags: ['Motion Design', 'After Effects', 'Storytelling'] },
  { id: 'pixel', name: 'PixelForge', mark: 'P', style: 'pixel', time: '2d ago', project: 'Creator Spotlight Series', tags: ['Storytelling', 'Video Editing'] },
  { id: 'nova', name: 'Nova Creative', mark: 'N', style: 'nova', time: '3d ago', project: 'Motion Identity', tags: ['Motion Design', 'Branding'] },
  { id: 'studio', name: 'Studio North', mark: 'S', style: 'studio', time: '4d ago', project: 'Documentary Trailer', tags: ['Video Editing', 'Color Grading'] },
];
const followerIds = ['daniel', 'maya', 'kenji', 'noah', 'priya', 'elena', 'alex', 'lia', 'marcus', 'jordan', 'priya', 'noah'];
export const notificationSeeds = [
  ...companies.map((company, index) => ({ id: `request-${company.id}`, type: 'request', company: company.id, time: company.time, unread: true, saved: index === 1 })),
  ...followerIds.map((person, index) => ({ id: `follower-${index}`, type: 'follower', person, time: ['3h ago', '8h ago', '1d ago'][index] ?? `${index}d ago`, unread: true, saved: false })),
  { id: 'activity-like', type: 'like', person: 'noah', project: 'neon', time: '4h ago', unread: true, saved: true },
  { id: 'activity-save', type: 'save', person: 'maya', project: 'content', time: '6h ago', unread: true, saved: false },
  { id: 'activity-views', type: 'views', time: '1d ago', unread: true, saved: false },
  { id: 'activity-comment', type: 'comment', person: 'kenji', project: 'neon', time: '2d ago', unread: true, saved: false },
  { id: 'report-resolved', type: 'report', title: 'Your report was resolved', message: 'We reviewed your report on a comment. No policy violation was found.', time: '2d ago', unread: true, saved: true },
  { id: 'report-update', type: 'report', title: 'Your feedback helps our community', message: 'Thanks for helping make Showlio a welcoming place for creators.', time: '3d ago', unread: true, saved: false },
  { id: 'report-safety', type: 'report', title: 'Community safety update', message: 'Take a moment to review your notification and profile preferences.', time: '4d ago', unread: true, saved: false },
];
