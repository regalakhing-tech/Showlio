import { icon, esc, initials } from './workspace-shared.js';

const tabs = [
  ['profile', 'user', 'Profile'],
  ['account', 'settings', 'Account'],
  ['privacy', 'shield', 'Privacy'],
  ['notifications', 'bell', 'Notifications'],
  ['social', 'link', 'Social & Links'],
  ['billing', 'card', 'Billing'],
];
const bindings = new WeakMap();
const availabilityLabels = {
  available: 'Available for new projects',
  unavailable: 'Not available right now',
  showcasing: 'Just showcasing my work',
};

// The saved or newly chosen photo, or a monogram until the creator adds one.
function photo(profile, alt = '') {
  return profile.avatar ? `<img src="${esc(profile.avatar)}" alt="${esc(alt)}">` : `<span class="ws-monogram" style="--hue:220" ${alt ? `role="img" aria-label="${esc(alt)}"` : 'aria-hidden="true"'}>${esc(initials(profile.name))}</span>`;
}

function button(label, action, iconName, className = 'ws-outline') {
  return `<button type="button" class="ws-btn ${className}" data-settings-action="${action}">${iconName ? icon(iconName) : ''}${label}</button>`;
}

function field(label, key, value, placeholder = '', extra = '') {
  return `<label class="ws-field ws-settings-field"><span>${label}</span><input name="${key}" value="${esc(value || '')}" placeholder="${placeholder}" ${extra}></label>`;
}

function switchRow(label, description, name, checked, isDraft = false) {
  return `<div class="ws-settings-toggle-row"><div><strong id="ws-label-${name}">${label}</strong><p>${description}</p></div><button type="button" role="switch" aria-checked="${Boolean(checked)}" aria-labelledby="ws-label-${name}" class="ws-settings-switch" data-${isDraft ? 'draft-toggle' : 'preference'}="${name}"><span></span></button></div>`;
}

function assistantPanel(compact = false) {
  return `<section class="ws-settings-ai ${compact ? 'ws-settings-ai-rail' : ''}" aria-label="AI Assistant demo"><div class="ws-settings-ai-title">${icon('sparkles')}<h3>AI Assistant</h3><span class="ws-settings-beta">BETA</span></div><p>${compact ? 'A little help to make your profile shine.' : 'Make your profile stand out with a little AI help.'}</p><div class="ws-settings-ai-buttons">${button('Improve my bio', 'suggest-bio', 'sparkles')}${button('Suggest relevant skills', 'suggest-skills', 'plus')}${compact ? button('Rewrite in a more professional tone', 'suggest-professional', 'document') : ''}</div><small>Editable demo suggestions</small></section>`;
}

function profileRail(state) {
  const draft = state.draft;
  const checks = [
    ['Add a profile photo', Boolean(draft.avatar)],
    ['Write a compelling bio', Boolean(draft.bio?.trim())],
    ['Add at least 3 skills', (draft.skills || []).length >= 3],
    ['Link your social accounts', Object.values(draft.links || {}).some(Boolean)],
    ['Complete your portfolio', (state.projects || []).some(project => project.owner)],
  ];
  return `<aside class="ws-settings-rail"><section class="ws-panel ws-settings-visibility"><div class="ws-settings-visibility-heading"><h3 id="ws-label-visible">Profile visibility</h3><button type="button" role="switch" aria-checked="${Boolean(draft.visible)}" aria-labelledby="ws-label-visible" class="ws-settings-switch" data-draft-toggle="visible"><span></span></button></div><p class="ws-settings-visibility-description">Let others discover your profile and work.</p><div class="ws-settings-preview-inset"><span class="ws-settings-preview-icon">${icon('eye')}</span><strong>View what others see</strong><p>See how your profile looks to others.</p>${button('Preview profile', 'preview', 'external', 'ws-settings-text-button')}</div><p class="ws-settings-save-note">Visibility changes apply when saved.</p></section><section class="ws-panel ws-settings-tips"><h3>Quick profile tips</h3><p>A complete profile helps you connect.</p><ul>${checks.map(([label, done]) => `<li class="${done ? 'is-complete' : ''}"><span class="ws-settings-tip-check">${done ? icon('check') : ''}</span>${label}</li>`).join('')}</ul></section>${assistantPanel(true)}</aside>`;
}

function profileForm(draft) {
  return `<form class="ws-panel ws-settings-profile" data-settings-form="profile" novalidate><div class="ws-settings-panel-heading"><div><h2>Profile information</h2><p>This information appears on your public profile and helps others discover you.</p></div>${button('View public profile', 'preview', 'external', 'ws-soft')}</div><div class="ws-settings-identity"><div class="ws-settings-photo"><strong>Profile photo</strong><div class="ws-settings-avatar-wrap">${photo(draft, 'Your current profile photo')}<button type="button" class="ws-icon-button ws-settings-camera" data-settings-action="choose-avatar" aria-label="Choose a new profile photo">${icon('camera')}</button></div><button type="button" class="ws-settings-link" data-settings-action="choose-avatar">Change photo</button><small>JPG, PNG or WebP · Max 10 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" class="ws-settings-file-input" data-avatar-input aria-label="Choose profile photo"></div>${assistantPanel()}</div><div class="ws-settings-fields"><div class="ws-settings-field-pair">${field('Display name', 'name', draft.name, 'Your name', 'maxlength="60" required autocomplete="name"')}${field('Headline', 'headline', draft.headline, 'What do you create?', 'maxlength="100" required')}</div><label class="ws-field ws-settings-field"><span>About me</span><textarea name="bio" maxlength="500" rows="4" placeholder="Tell the community a little about yourself…" aria-describedby="ws-bio-help ws-bio-counter">${esc(draft.bio || '')}</textarea><span class="ws-settings-field-meta"><small id="ws-bio-help">A little about you, your work, and what inspires you.</small><small id="ws-bio-counter" aria-live="polite">${(draft.bio || '').length}/500</small></span></label><div class="ws-settings-field-pair">${field('Location', 'location', draft.location, 'City, Country', 'maxlength="100" autocomplete="address-level2"')}<label class="ws-field ws-settings-field"><span>Collaboration availability</span><select name="availability">${Object.entries(availabilityLabels).map(([value, label]) => `<option value="${value}" ${draft.availability === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="ws-settings-skills"><div class="ws-settings-skills-heading"><span class="ws-settings-label">Skills</span><button type="button" class="ws-settings-add-skill" data-settings-action="add-skill">${icon('plus')}Add skills</button></div><div class="ws-pills">${(draft.skills || []).map((skill, index) => `<span class="ws-pill ws-settings-skill">${esc(skill)}<button type="button" data-remove-skill="${index}" aria-label="Remove ${esc(skill)}">${icon('close')}</button></span>`).join('')}</div><small>Add skills that show what you do best.</small></div></div><p class="ws-settings-error" data-settings-error role="alert" hidden></p><footer class="ws-settings-form-footer">${button('Preview profile', 'preview', 'eye')}<button type="submit" class="ws-btn ws-primary">Save changes ${icon('check')}</button></footer></form>`;
}

function preferencesPanel(title, subtitle, content, footer = '') {
  return `<section class="ws-panel ws-settings-preferences"><div class="ws-settings-panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div></div>${content}${footer}</section>`;
}

function otherTab(tab, state) {
  const preferences = state.preferences || {};
  const draft = state.draft;
  if (tab === 'account') {
    return preferencesPanel('Account overview', 'The account you’re signed in with.', `<div class="ws-settings-account-summary">${photo(state.profile)}<div><h3>${esc(state.profile.name)}</h3><p>${esc(state.profile.email)}</p><span class="ws-settings-local-badge">@${esc(state.profile.username)}</span></div></div><div class="ws-settings-info-block">${icon('lock')}<div><h3>Account access</h3><p>You sign in with your email and password. To change your password, sign out and choose “Forgot password?” on the sign-in page.</p></div></div>${switchRow('Remember workspace preferences', 'Keep your sample projects, saves and likes on this browser.', 'rememberWorkspace', preferences.rememberWorkspace ?? true)}`);
  }
  if (tab === 'privacy') {
    return preferencesPanel('Privacy preferences', 'Choose who can see your profile.', `${switchRow('Public profile', 'Anyone can view your profile and published work. Off keeps it private to you.', 'visible', draft.visible, true)}${switchRow('Show collaboration availability', 'Show whether you’re open to new projects on your profile.', 'showAvailability', preferences.showAvailability ?? true)}${switchRow('Allow community discovery', 'Let people find you through search and Explore.', 'communityDiscovery', preferences.communityDiscovery ?? true)}<div class="ws-settings-info-block">${icon('shield')}<p>Public profile applies when you press Save changes. The other switches save right away.</p></div><p class="ws-settings-error" data-settings-error role="alert" hidden></p>`, `<div class="ws-settings-form-footer">${button('Save changes', 'save', 'check', 'ws-primary')}</div>`);
  }
  if (tab === 'notifications') {
    return preferencesPanel('Notification preferences', 'Choose which updates you want to hear about.', `${switchRow('Project activity', 'Updates about projects and new feedback.', 'projectNotifications', preferences.projectNotifications ?? true)}${switchRow('Messages & collaborations', 'New conversations and collaboration invitations.', 'messageNotifications', preferences.messageNotifications ?? true)}${switchRow('Community highlights', 'Featured creators, inspiration, and community updates.', 'communityNotifications', preferences.communityNotifications ?? false)}${switchRow('Product updates', 'News about Showlio features.', 'productNotifications', preferences.productNotifications ?? false)}<div class="ws-settings-info-block">${icon('bell')}<p>Saved to your account right away. Showlio doesn’t send notification emails yet; these choices will apply when it does.</p></div>`);
  }
  if (tab === 'social') {
    const links = draft.links || {};
    return `<form data-settings-form="social" class="ws-panel ws-settings-preferences" novalidate><div class="ws-settings-panel-heading"><div><h2>Social & links</h2><p>Help people find more of your work.</p></div></div><div class="ws-settings-social-fields">${field('Website or portfolio', 'website', links.website, 'https://your-portfolio.com', 'type="url" maxlength="500" inputmode="url"')}${field('Instagram', 'instagram', links.instagram, 'https://instagram.com/yourname', 'type="url" maxlength="500" inputmode="url"')}${field('YouTube', 'youtube', links.youtube, 'https://youtube.com/@yourname', 'type="url" maxlength="500" inputmode="url"')}</div><p class="ws-settings-link-help">Use a full https:// address. Your links are saved with your profile.</p><p class="ws-settings-error" data-settings-error role="alert" hidden></p><footer class="ws-settings-form-footer">${button('Preview profile', 'preview', 'eye')}<button type="submit" class="ws-btn ws-primary">Save changes ${icon('check')}</button></footer></form>`;
  }
  return preferencesPanel('Your plan', 'A place for your work to grow.', `<div class="ws-settings-plan"><span class="ws-settings-local-badge">CURRENT DEMO PLAN</span><h3>Showlio Free</h3><p>Explore your portfolio, projects, and community workspace.</p><ul><li>${icon('check')}Personal creator profile</li><li>${icon('check')}Portfolio and project workspace</li><li>${icon('check')}Local profile customization</li></ul></div><div class="ws-settings-info-block">${icon('card')}<div><h3>Billing is not connected</h3><p>There are no charges, subscriptions, or payment details in this demo.</p></div></div>`);
}

export function renderSettings(state) {
  const tab = tabs.some(([id]) => id === state.settingsTab) ? state.settingsTab : 'profile';
  return `<section class="ws-settings"><header class="ws-page-heading"><h1>Account settings</h1><p class="ws-muted">Manage your account, profile, privacy, and preferences all in one place.</p></header><div class="ws-settings-tabs" role="tablist" aria-label="Account settings">${tabs.map(([id, glyph, label]) => `<button type="button" role="tab" id="ws-tab-${id}" aria-controls="ws-settings-content" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" data-settings-tab="${id}" class="${id === tab ? 'is-active' : ''}">${icon(glyph)}${label}</button>`).join('')}</div><div role="tabpanel" id="ws-settings-content" aria-labelledby="ws-tab-${tab}" class="${tab === 'profile' ? 'ws-content-grid ws-settings-grid' : 'ws-settings-secondary-content'}">${tab === 'profile' ? profileForm(state.draft) + profileRail(state) : otherTab(tab, state)}</div></section>`;
}

function validLink(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function profileError(draft) {
  if (!draft.name?.trim()) return 'Please enter your display name.';
  if (!draft.headline?.trim()) return 'Please enter a headline.';
  if (draft.name.trim().length > 60) return 'Keep your display name within 60 characters.';
  if (draft.headline.trim().length > 100) return 'Keep your headline within 100 characters.';
  if ((draft.bio || '').length > 500) return 'Keep your bio within 500 characters.';
  if ((draft.skills || []).length > 15 || (draft.skills || []).some(skill => !skill.trim() || skill.length > 40)) return 'Use up to 15 skills, with 1–40 characters each.';
  if (Object.values(draft.links || {}).some(value => !validLink(value.trim()))) return 'Enter a valid HTTPS address for each social link.';
  return '';
}

function showError(root, message) {
  const error = root.querySelector('[data-settings-error]');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
  if (message) {
    error.tabIndex = -1;
    error.focus();
  }
}

function copyDraft(draft) {
  return { ...draft, name: draft.name.trim(), headline: draft.headline.trim(), bio: draft.bio || '', skills: [...draft.skills], links: Object.fromEntries(Object.entries(draft.links || {}).map(([key, value]) => [key, value.trim()])) };
}

// Suggested skills for the "Add skills" dialog, by the disciplines Showlio is built around.
export const skillSuggestions = {
  Popular: ['Figma', 'JavaScript', 'Python', 'Video Editing', 'UI Design', 'Photoshop', 'Prompt Engineering', 'Motion Design', 'React', 'Branding', 'Illustration', 'Storytelling'],
  Development: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'PHP', 'Laravel', 'Python', 'SQL', 'Tailwind CSS', 'Flutter', 'Git'],
  'AI Automation': ['Prompt Engineering', 'OpenAI API', 'LangChain', 'n8n', 'Zapier', 'Make.com', 'Python', 'Chatbots', 'RAG', 'Data Analysis', 'Workflow Design'],
  Design: ['Figma', 'UI Design', 'UX Research', 'Branding', 'Typography', 'Illustrator', 'Photoshop', 'Wireframing', 'Prototyping', 'Design Systems'],
  Video: ['Video Editing', 'Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Color Grading', 'Motion Design', 'Storytelling', 'Cinematography', 'CapCut', 'Sound Design'],
  'Digital Art': ['Procreate', 'Illustration', 'Blender', '3D Modeling', 'Concept Art', 'Character Design', 'Digital Painting', 'Krita', 'Animation', 'Photoshop'],
};
const headlineHints = [
  ['AI Automation', /\bai\b|automat|machine learning|\bml\b|prompt/i],
  ['Video', /video|film|editor|motion|youtube|cinemat/i],
  ['Development', /develop|engineer|program|coder|software|web|full.?stack|front.?end|back.?end/i],
  ['Digital Art', /artist|illustrat|\b3d\b|animat|painter/i],
  ['Design', /design|ux|ui\b|brand/i],
];
// Opens on the discipline that matches the creator's headline, so the first suggestions fit.
export const suggestedGroup = (headline = '') => headlineHints.find(([, pattern]) => pattern.test(headline))?.[0] ?? 'Popular';

function openSkillDialog(state, actions) {
  const skills = state.draft.skills;
  let group = suggestedGroup(state.draft.headline);
  let changed = false;
  const has = (name) => skills.some(skill => skill.toLowerCase() === name.toLowerCase());
  const content = actions.openModal('Add skills', `<form class="ws-skill-picker" data-skill-form novalidate><p class="ws-skill-intro">Tap a suggestion or type your own. Skills show on your public profile and help people find you.</p><div class="ws-skill-entry"><label class="ws-sr" for="ws-skill-input">Skill name</label><span class="ws-skill-input">${icon('search')}<input id="ws-skill-input" name="skill" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Search or add a skill" aria-describedby="ws-skill-meta"><button type="submit" class="ws-btn ws-primary">${icon('plus')}Add</button></span><p class="ws-skill-meta" id="ws-skill-meta"><span data-skill-count></span><span data-skill-chars>0/40</span></p><p class="ws-settings-error ws-skill-error" data-skill-error role="alert" hidden></p></div><section class="ws-skill-section" aria-labelledby="ws-skill-yours"><h3 id="ws-skill-yours">Your skills</h3><div class="ws-skill-chosen" data-skill-chosen></div></section><section class="ws-skill-section" aria-labelledby="ws-skill-suggested"><h3 id="ws-skill-suggested" data-skill-suggest-title>Suggested</h3><div class="ws-skill-tabs" role="group" aria-label="Suggestion categories">${Object.keys(skillSuggestions).map(name => `<button type="button" data-skill-group="${esc(name)}">${esc(name)}</button>`).join('')}</div><div class="ws-skill-suggestions" data-skill-suggestions></div></section><footer class="ws-skill-footer"><small>Changes are kept when you press Save changes on your profile.</small><button type="button" class="ws-btn ws-primary" data-skill-done>Done</button></footer></form>`);
  if (!content) return;
  const form = content.querySelector('[data-skill-form]');
  const input = form.elements.skill;
  const error = form.querySelector('[data-skill-error]');
  const say = (message) => { error.textContent = message; error.hidden = !message; input.toggleAttribute('aria-invalid', Boolean(message)); };

  const paint = () => {
    form.querySelector('[data-skill-count]').textContent = `${skills.length} of 15 skills`;
    form.querySelector('[data-skill-chosen]').innerHTML = skills.length
      ? skills.map((skill, index) => `<span class="ws-skill-tag">${esc(skill)}<button type="button" data-skill-remove="${index}" aria-label="Remove ${esc(skill)}">${icon('close')}</button></span>`).join('')
      : '<p class="ws-skill-empty">No skills yet. Add a few that show what you do best.</p>';
    const query = input.value.trim().toLowerCase();
    // Typing searches every category; otherwise show the chosen one.
    const names = query ? [...new Set(Object.values(skillSuggestions).flat())].filter(name => name.toLowerCase().includes(query)) : skillSuggestions[group];
    form.querySelector('[data-skill-suggest-title]').textContent = query ? `Matches for “${input.value.trim()}”` : 'Suggested';
    form.querySelector('.ws-skill-tabs').hidden = Boolean(query);
    for (const tab of form.querySelectorAll('[data-skill-group]')) tab.setAttribute('aria-pressed', String(tab.dataset.skillGroup === group));
    if (!query) form.querySelector('[data-skill-group][aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    form.querySelector('[data-skill-suggestions]').innerHTML = names.length
      ? names.map(name => { const added = has(name); return `<button type="button" class="ws-skill-chip" data-skill-suggest="${esc(name)}" aria-pressed="${added}">${icon(added ? 'check' : 'plus')}${esc(name)}</button>`; }).join('')
      : `<p class="ws-skill-empty">No suggestion matches. Press Add to use “${esc(input.value.trim())}”.</p>`;
  };
  const add = (raw) => {
    const value = raw.trim().replace(/\s+/g, ' ');
    const message = !value ? 'Type a skill or pick a suggestion.' : value.length > 40 ? 'Keep each skill within 40 characters.' : has(value) ? `${value} is already on your profile.` : skills.length >= 15 ? 'You can add up to 15 skills. Remove one to add another.' : '';
    say(message);
    if (message) return false;
    skills.push(value);
    changed = true;
    return true;
  };
  const remove = (name) => {
    const index = skills.findIndex(skill => skill.toLowerCase() === name.toLowerCase());
    if (index >= 0) { skills.splice(index, 1); changed = true; say(''); }
  };
  // Keep keyboard focus on the same control after a repaint replaces it.
  const repaint = (selector) => { paint(); (selector && form.querySelector(selector) || input).focus(); };

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (add(input.value)) { input.value = ''; form.querySelector('[data-skill-chars]').textContent = '0/40'; }
    repaint();
  });
  input.addEventListener('input', () => {
    form.querySelector('[data-skill-chars]').textContent = `${input.value.length}/40`;
    say('');
    paint();
  });
  form.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.skillGroup) { group = target.dataset.skillGroup; repaint(`[data-skill-group="${CSS.escape(group)}"]`); }
    if (target.dataset.skillSuggest) {
      const name = target.dataset.skillSuggest;
      if (has(name)) remove(name); else add(name);
      repaint(`[data-skill-suggest="${CSS.escape(name)}"]`);
    }
    if (target.dataset.skillRemove) {
      const index = Number(target.dataset.skillRemove);
      remove(skills[index]);
      repaint(`[data-skill-remove="${Math.min(index, skills.length - 1)}"]`);
    }
    if (target.hasAttribute('data-skill-done')) actions.closeModal();
  });
  content.closest('dialog')?.addEventListener('close', () => {
    if (!changed) return;
    actions.refresh();
    actions.notify('Skills updated. Press Save changes to keep them on your profile.');
  }, { once: true });
  paint();
  input.focus();
}

function openSuggestion(kind, state, actions) {
  const draft = state.draft;
  const skillList = (draft.skills || []).slice(0, 3).join(', ');
  const bio = `${draft.name || 'I'}${draft.name ? ' is a' : ' am a'} ${draft.headline || 'creator'}${draft.location ? ` based in ${draft.location}` : ''}.${skillList ? ` Creative focus: ${skillList}.` : ''}`.slice(0, 500);
  const suggestions = {
    bio: { title: 'Bio suggestion', value: bio, max: 500 },
    professional: { title: 'Professional bio suggestion', value: (draft.bio?.trim() || bio).replace(/!+/g, '.').replace(/\s+/g, ' ').slice(0, 500), max: 500 },
    skills: { title: 'Skill suggestions', value: [...new Set((draft.headline || '').split(/\s*(?:&|\||,|\band\b)\s*/i).map(value => value.trim()).filter(value => value && value.length <= 40 && !draft.skills.some(skill => skill.toLowerCase() === value.toLowerCase())))].slice(0, Math.max(0, 15 - draft.skills.length)).join(', '), max: 250 },
  };
  const suggestion = suggestions[kind];
  const content = actions.openModal(suggestion.title, `<div class="ws-settings-suggestion"><p class="ws-settings-demo-note">Editable demo suggestion, based only on your current profile. Review it before adding it to your draft.</p><label class="ws-field ws-settings-field"><span>${kind === 'skills' ? 'Skills, separated by commas' : suggestion.title}</span><textarea data-suggestion rows="4" maxlength="${suggestion.max}">${esc(suggestion.value)}</textarea></label><p class="ws-settings-error" data-suggestion-error role="alert" hidden></p><div class="ws-settings-form-footer"><button type="button" class="ws-btn ws-outline" data-suggestion-cancel>Cancel</button><button type="button" class="ws-btn ws-primary" data-use-suggestion>Use suggestion</button></div></div>`);
  if (!content) return;
  content.querySelector('[data-suggestion-cancel]').addEventListener('click', () => actions.closeModal());
  content.querySelector('[data-use-suggestion]').addEventListener('click', () => {
    const value = content.querySelector('[data-suggestion]').value.trim();
    let message = !value ? 'Enter a suggestion to use.' : '';
    if (kind === 'skills' && value) {
      const additions = value.split(',').map(skill => skill.trim()).filter(Boolean);
      const merged = [...draft.skills];
      for (const skill of additions) if (!merged.some(existing => existing.toLowerCase() === skill.toLowerCase())) merged.push(skill);
      if (merged.length > 15 || merged.some(skill => skill.length > 40)) message = 'Use up to 15 skills, with 40 characters maximum each.';
      if (!message) draft.skills = merged;
    } else if (!message) {
      draft[kind === 'professional' ? 'bio' : kind] = value.slice(0, suggestion.max);
    }
    const error = content.querySelector('[data-suggestion-error]');
    error.textContent = message;
    error.hidden = !message;
    if (message) return;
    actions.closeModal();
    actions.refresh();
    actions.notify('Suggestion added to your draft. Save changes when you’re ready.');
  });
}

export function bindSettings(root, state, actions) {
  bindings.get(root)?.abort();
  const controller = new AbortController();
  bindings.set(root, controller);
  const options = { signal: controller.signal };
  const save = () => {
    const error = profileError(state.draft);
    showError(root, error);
    if (error) return;
    actions.saveProfile(copyDraft(state.draft));
  };
  const capture = event => {
    const field = event.target;
    if (!field.matches('.ws-settings [name]')) return;
    const key = field.name;
    if (['name', 'headline', 'bio', 'location', 'availability'].includes(key)) state.draft[key] = field.value;
    if (['website', 'instagram', 'youtube'].includes(key)) {
      state.draft.links ||= {};
      state.draft.links[key] = field.value;
    }
    if (key === 'bio') {
      const counter = root.querySelector('#ws-bio-counter');
      if (counter) counter.textContent = `${field.value.length}/500`;
    }
  };
  root.addEventListener('input', capture, options);
  root.addEventListener('change', capture, options);
  root.addEventListener('submit', event => {
    if (!event.target.matches('[data-settings-form]')) return;
    event.preventDefault();
    save();
  }, options);
  root.addEventListener('keydown', event => {
    const current = event.target.closest('[data-settings-tab]');
    if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex(([id]) => id === current.dataset.settingsTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    actions.setSettingsTab(tabs[next][0]);
    root.querySelector(`[data-settings-tab="${tabs[next][0]}"]`)?.focus();
  }, options);
  root.addEventListener('change', async event => {
    if (!event.target.matches('[data-avatar-input]')) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      state.draft.avatar = await actions.readAvatar(file);
      actions.refresh();
      actions.notify('Photo added to your draft. Save changes to keep it.');
    } catch (error) {
      actions.notify(error.message || 'Choose a JPG, PNG, or WebP image under 10 MB.');
    }
  }, options);
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || !root.contains(target)) return;
    if (target.dataset.settingsTab) {
      const tab = target.dataset.settingsTab;
      actions.setSettingsTab(tab);
      root.querySelector(`[data-settings-tab="${tab}"]`)?.focus();
    } else if (target.dataset.preference) {
      const value = target.getAttribute('aria-checked') !== 'true';
      target.setAttribute('aria-checked', String(value));
      actions.updatePreference(target.dataset.preference, value);
    } else if (target.dataset.draftToggle) {
      state.draft[target.dataset.draftToggle] = !state.draft[target.dataset.draftToggle];
      target.setAttribute('aria-checked', String(state.draft[target.dataset.draftToggle]));
    } else if (target.hasAttribute('data-remove-skill')) {
      const index = Number(target.dataset.removeSkill);
      state.draft.skills.splice(index, 1);
      actions.refresh();
      const removeButtons = root.querySelectorAll('[data-remove-skill]');
      (removeButtons[Math.min(index, removeButtons.length - 1)] || root.querySelector('[data-settings-action="add-skill"]'))?.focus();
    } else {
      const action = target.dataset.settingsAction;
      if (action === 'preview') {
        const error = profileError(state.draft);
        if (error) actions.notify(error);
        else actions.previewProfile(copyDraft(state.draft));
      }
      if (action === 'save') save();
      if (action === 'choose-avatar') root.querySelector('[data-avatar-input]')?.click();
      if (action === 'add-skill') openSkillDialog(state, actions);
      if (action?.startsWith('suggest-')) openSuggestion(action.replace('suggest-', ''), state, actions);
    }
  }, options);
}
