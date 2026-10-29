// Illustrative content for the reference-design preview, not live member data.
export const creators = [
  { id: 'daniel', name: 'Daniel Cruz', role: 'Full Stack Developer', image: 'daniel-cruz', categories: ['Development'], skills: ['React', 'Node.js', 'Supabase', 'PHP'], availability: 'Open to collaborate', bio: 'I build thoughtful web applications and enjoy bringing useful ideas to life with people who love to create.' },
  { id: 'maya', name: 'Maya Santos', role: 'Digital Illustrator', image: 'maya-santos', categories: ['Illustration', 'Design'], skills: ['Illustration', 'Procreate', 'Art'], availability: 'Just showcasing', bio: 'Color, character, and a little imagination. I create expressive illustrations and visual stories with a playful point of view.' },
  { id: 'kenji', name: 'Kenji Tan', role: 'Video Editor', image: 'kenji-tan', categories: ['Video'], skills: ['Premiere Pro', 'After Effects', 'Storytelling'], availability: 'Open to collaborate', bio: 'I turn everyday moments into cinematic stories through editing, sound, and a careful eye for the details.' },
  { id: 'alex', name: 'Alex Rivera', role: 'UI/UX Designer', image: 'alex-rivera', categories: ['Design', 'UI/UX'], skills: ['Figma', 'UI Design', 'Prototyping'], availability: 'Open to collaborate', bio: 'Creative UI/UX designer with a passion for building user-centered digital experiences. I love collaborating on meaningful projects.' },
  { id: 'lia', name: 'Lia Mendoza', role: 'UI/UX Designer', image: 'lia-mendoza', categories: ['Design', 'UI/UX'], skills: ['Branding', 'Figma', 'Design systems'], availability: 'Open to collaborate', bio: 'I create considered visual identities and intuitive digital experiences, connecting clear ideas with thoughtful design.' },
];

export const projects = [
  { id: 'taskflow', title: 'TaskFlow', category: 'Web App', description: 'A productivity web app for teams.', detail: 'A thoughtful team workspace that brings tasks, project timelines, and everyday collaboration together in one clear interface.', creator: 'daniel', author: 'Daniel Cruz', image: 'project-taskflow', likes: 1400, tags: ['React', 'Productivity', 'Web design'] },
  { id: 'habitify', title: 'Habitify', category: 'Mobile App', description: 'A habit tracking mobile app.', detail: 'A friendly mobile concept for building healthier routines, celebrating progress, and making small daily habits feel rewarding.', creator: 'maya', author: 'Maya Santos', image: 'project-habitify', likes: 882, tags: ['Mobile', 'UI/UX', 'Figma'] },
  { id: 'brand', title: 'Brand Identity', category: 'Design', description: 'Complete branding for a tech startup.', detail: 'A minimal visual identity explored through typography, a geometric mark, and a coordinated collection of premium stationery.', creator: 'lia', author: 'Lia Mendoza', image: 'project-brand-identity', likes: 1100, tags: ['Branding', 'Identity', 'Graphic design'] },
  { id: 'travel', title: 'Travel Vlog', category: 'Video', description: 'Cinematic travel video edit.', detail: 'An atmospheric travel-film concept that finds a story in warm city light, quiet streets, and the moments between destinations.', creator: 'kenji', author: 'Kenji Tan', image: 'project-travel', likes: 760, tags: ['Film', 'Travel', 'Video editing'] },
];

export const stories = [
  { name: 'Lia Mendoza', role: 'UI/UX Designer', creator: 'lia', quote: 'Showlio helped me organize my work and get discovered by amazing collaborators. The AI tools made writing my profile so much easier!' },
  { name: 'Daniel Cruz', role: 'Full Stack Developer', creator: 'daniel', quote: "I found teammates for my side project through Showlio. It's a great platform for students and creators to connect and build together." },
  { name: 'Maya Santos', role: 'Digital Illustrator', creator: 'maya', quote: 'As someone without a portfolio website, Showlio gave me a simple way to showcase my art and reach people who appreciate my work.' },
  { name: 'Kenji Tan', role: 'Video Editor', creator: 'kenji', quote: 'Having my creative work in one place makes it easier to share my process and connect with people who love telling stories.' },
];

export const categories = ['All', 'Development', 'Design', 'Photography', 'Video', 'Writing', 'Illustration', 'Marketing', 'UI/UX'];
export const imagePath = (name) => `/assets/images/${name}.jpg`;
export const creatorById = (id) => creators.find((creator) => creator.id === id);
