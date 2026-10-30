// "Add a project": details, drag-and-drop photos with thumbnails, a preview of the finished
// project, then publishing. The project is created first and each photo uploads on its own,
// so no single request carries every photo.
import { icon, esc, avatar, resizeImage } from './workspace-shared.js';
import { disciplines, disciplineById } from './workspace-data.js';

export const MAX_PHOTOS = 8;
const PLACEHOLDER = '/assets/images/workspace-content.webp';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** The photo viewer used by the preview and by the project dialog: a large photo and a strip of thumbnails. */
export function galleryMarkup(images, title) {
  const photos = images.length ? images : [PLACEHOLDER];
  return `<div class="ws-gallery" data-gallery><div class="ws-gallery-stage"><img src="${esc(photos[0])}" alt="${esc(title)}, photo 1 of ${photos.length}" data-gallery-main></div>${photos.length > 1 ? `<div class="ws-gallery-thumbs" role="group" aria-label="Photos">${photos.map((src, index) => `<button type="button" data-gallery-thumb="${index}" aria-label="Show photo ${index + 1}" aria-current="${index === 0}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>`;
}

export function bindGallery(root, images, title) {
  root.querySelector('[data-gallery]')?.addEventListener('click', (event) => {
    const thumb = event.target.closest('[data-gallery-thumb]');
    if (!thumb) return;
    const index = Number(thumb.dataset.galleryThumb);
    const main = root.querySelector('[data-gallery-main]');
    main.src = images[index];
    main.alt = `${title}, photo ${index + 1} of ${images.length}`;
    for (const button of root.querySelectorAll('[data-gallery-thumb]')) button.setAttribute('aria-current', String(button === thumb));
  });
}

/** Splits the comma-separated tools field into names; the first spelling of a repeated name wins, as on the server. */
export function parseTools(value) {
  const tools = new Map();
  for (const tool of String(value).split(',').map((item) => item.trim().replace(/\s+/g, ' ')).filter(Boolean)) if (!tools.has(tool.toLowerCase())) tools.set(tool.toLowerCase(), tool);
  return [...tools.values()];
}

/** What is wrong with the details, by field, using the same rules as the API. */
export function checkProject({ title, description, tools }) {
  const errors = {};
  if (!title.trim()) errors.title = 'Add a project title.';
  else if (title.trim().length > 80) errors.title = 'Keep the title within 80 characters.';
  if (!description.trim()) errors.description = 'Describe your project in a sentence or two.';
  else if (description.trim().length > 300) errors.description = 'Keep the description within 300 characters.';
  if (tools.length > 15 || tools.some((tool) => tool.length > 40)) errors.tools = 'Use up to 15 tools, with 40 characters each at most.';
  return errors;
}

// Runs tasks a few at a time, so a slow connection isn't swamped by every upload at once.
async function inBatches(items, size, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const index = next++; await task(items[index], index); }
  }));
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));

/** The success mark: a disc and ring that draw in, a tick, and a short burst around it. */
export const successMark = () => `<span class="ws-success-mark" aria-hidden="true"><span class="ws-success-burst">${Array.from({ length: 8 }, (_, index) => `<i style="--r:${index * 45}deg"></i>`).join('')}</span><svg viewBox="0 0 64 64"><circle class="ws-success-disc" cx="32" cy="32" r="28"/><circle class="ws-success-ring" cx="32" cy="32" r="28"/><path class="ws-success-tick" d="M20.5 33.5l7.5 7.5 15.5-17"/></svg></span>`;

export function openProjectComposer({ state, openModal, api, errorOf, onPublished, onView, onDone }) {
  const photos = []; // { id, url } once ready, { id, pending: true } while shrinking
  let busy = false;
  let dragged = null;
  const content = openModal('Add a project', `<form class="ws-composer" data-composer novalidate><p class="ws-composer-intro">Share a piece of your work. Add photos, tell the story, then preview it before you publish.</p><div class="ws-composer-grid"><section class="ws-composer-media" aria-labelledby="ws-composer-photos" data-drop><div class="ws-composer-head"><h3 id="ws-composer-photos">Photos</h3><span data-photo-count></span></div><label class="ws-dropzone"><input type="file" class="ws-sr" accept="${ACCEPTED.join(',')}" multiple data-photo-input><span class="ws-dropzone-icon">${icon('camera')}</span><strong>Drag photos here</strong><span>or <b>browse your files</b></span><small>JPG, PNG or WebP · up to ${MAX_PHOTOS} photos · 10 MB each</small></label><ul class="ws-photo-grid" data-photo-grid></ul><p class="ws-composer-hint" data-photo-hint>The first photo is your cover. Tap the star on another photo to make it the cover${matchMedia('(pointer: fine)').matches ? ', or drag photos to reorder them' : ''}.</p></section><section class="ws-composer-details" aria-label="Project details"><label class="ws-composer-field"><span>Project title <small data-count="title">0/80</small></span><input name="title" maxlength="80" placeholder="What have you been creating?" autocomplete="off"></label><label class="ws-composer-field"><span>Description <small data-count="description">0/300</small></span><textarea name="description" maxlength="300" rows="5" placeholder="Tell people about the idea, your role and the result."></textarea></label><fieldset class="ws-composer-field"><legend>Discipline</legend><div class="ws-discipline-picks">${disciplines.map((item, index) => `<label class="ws-discipline-pick" style="--disc:${item.color};--disc-tint:${item.tint}"><input type="radio" name="category" value="${esc(item.id)}" ${index === 0 ? 'checked' : ''}><span>${icon(item.icon)}${esc(item.id)}</span></label>`).join('')}</div></fieldset><label class="ws-composer-field"><span>Tools or skills <small>Optional · separate with commas</small></span><input name="tools" maxlength="400" placeholder="Figma, After Effects, Python" autocomplete="off"></label></section></div>${state.profile.visible ? '' : '<label class="ws-composer-public"><input type="checkbox" name="makePublic" checked><span><strong>Show this project to everyone</strong><small>Your profile is private right now, so only you would see it. This makes your profile public; you can change it any time in Settings.</small></span></label>'}<p class="ws-settings-error ws-composer-error" data-composer-error role="alert" hidden></p><footer class="ws-composer-footer"><span class="ws-composer-status" data-composer-status aria-live="polite"></span><button type="button" class="ws-btn ws-outline" data-composer-preview>${icon('eye')}Preview</button><button type="submit" class="ws-btn ws-primary" data-composer-publish>${icon('check')}<span>Publish project</span></button></footer></form><div class="ws-composer-preview" data-preview hidden></div><div class="ws-publish" data-publishing hidden></div>`, { wide: true });
  if (!content) return;
  const form = content.querySelector('[data-composer]');
  const preview = content.querySelector('[data-preview]');
  const dialog = content.closest('dialog');
  const heading = dialog?.querySelector('#ws-modal-title');
  const stage = content.querySelector('[data-publishing]');
  const error = form.querySelector('[data-composer-error]');
  const say = (message) => { error.textContent = message; error.hidden = !message; };

  const details = () => {
    const tools = parseTools(form.elements.tools.value);
    return { title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), category: form.elements.category.value, tools, makePublic: Boolean(form.elements.makePublic?.checked) };
  };

  const paintPhotos = () => {
    form.querySelector('[data-photo-count]').textContent = `${photos.length} of ${MAX_PHOTOS}`;
    form.querySelector('.ws-dropzone').hidden = photos.length >= MAX_PHOTOS;
    form.querySelector('[data-photo-hint]').hidden = photos.length < 2;
    form.querySelector('[data-photo-grid]').innerHTML = photos.map((photo, index) => photo.pending
      ? `<li class="ws-photo is-pending" aria-label="Preparing photo"><span class="ws-photo-spinner" aria-hidden="true"></span></li>`
      : `<li class="ws-photo" data-photo="${photo.id}" draggable="true"><img src="${esc(photo.url)}" alt="Photo ${index + 1}">${index === 0 ? '<span class="ws-photo-badge">Cover</span>' : ''}<span class="ws-photo-actions">${index > 0 ? `<button type="button" data-photo-cover="${photo.id}" aria-label="Make photo ${index + 1} the cover">${icon('star')}</button>` : ''}<button type="button" data-photo-remove="${photo.id}" aria-label="Remove photo ${index + 1}">${icon('close')}</button></span></li>`).join('');
  };

  const addFiles = async (files) => {
    if (busy) return;
    const list = [...files];
    const room = MAX_PHOTOS - photos.length;
    const problems = [];
    if (list.length > room) problems.push(room ? `Only ${room} more ${room === 1 ? 'photo fits' : 'photos fit'}; the rest were skipped.` : `A project holds up to ${MAX_PHOTOS} photos.`);
    const chosen = list.slice(0, Math.max(room, 0)).filter((file) => {
      if (!ACCEPTED.includes(file.type)) { problems.push(`${file.name} isn’t a JPG, PNG or WebP image.`); return false; }
      return true;
    });
    say(problems.join(' '));
    const slots = chosen.map(() => ({ id: crypto.randomUUID(), pending: true }));
    photos.push(...slots);
    paintPhotos();
    await Promise.all(chosen.map(async (file, index) => {
      const slot = slots[index];
      try {
        // Shrunk to 1600px WebP: sharp on any screen and quick to upload.
        slot.url = await resizeImage(file, 1600);
        delete slot.pending;
      } catch (problem) {
        photos.splice(photos.indexOf(slot), 1);
        say(`${file.name}: ${problem.message}`);
      }
      paintPhotos();
    }));
  };

  const move = (id, to) => {
    const from = photos.findIndex((photo) => photo.id === id);
    if (from < 0 || to < 0 || from === to) return;
    photos.splice(to, 0, ...photos.splice(from, 1));
    paintPhotos();
  };

  const showPreview = () => {
    const values = details();
    const ready = photos.filter((photo) => photo.url).map((photo) => photo.url);
    const discipline = disciplineById(values.category);
    heading.textContent = 'Preview';
    preview.innerHTML = `<p class="ws-composer-intro">This is how your project will look to people on Showlio.</p>${galleryMarkup(ready, values.title || 'Your project')}${photos.some((photo) => photo.pending) ? '<p class="ws-composer-hint">Some photos are still being prepared; they’ll appear here in a moment.</p>' : ready.length ? '' : '<p class="ws-composer-hint">No photos yet: your project will use a placeholder cover.</p>'}<div class="ws-preview-body"><h3 class="ws-preview-title">${esc(values.title || 'Untitled project')}</h3><div class="ws-modal-person">${avatar(state.profile)}<div><h3>${esc(state.profile.name)}</h3><p>${esc(state.profile.headline || `@${state.profile.username}`)}</p></div></div><p class="ws-preview-description">${esc(values.description || 'Your description will appear here.')}</p><div class="ws-pills"><span class="ws-pill ws-disc-pill" style="--disc:${discipline?.color};--disc-tint:${discipline?.tint}">${icon(discipline?.icon ?? 'tag')}${esc(values.category)}</span>${values.tools.map((tool) => `<span class="ws-pill ws-tool-pill">${esc(tool)}</span>`).join('')}</div></div><footer class="ws-composer-footer"><span class="ws-composer-status"></span><button type="button" class="ws-btn ws-outline" data-preview-back>${icon('arrow-left')}Keep editing</button><button type="button" class="ws-btn ws-primary" data-preview-publish>${icon('check')}Publish project</button></footer>`;
    bindGallery(preview, ready.length ? ready : [PLACEHOLDER], values.title || 'Your project');
    form.hidden = true;
    preview.hidden = false;
    content.closest('dialog').scrollTop = 0;
    preview.querySelector('[data-preview-back]').focus({ preventScroll: true });
  };
  const showForm = () => {
    heading.textContent = 'Add a project';
    preview.hidden = true;
    form.hidden = false;
    form.querySelector('[data-composer-preview]').focus({ preventScroll: true });
  };

  // Publishing takes over the dialog: the cover, a progress bar and each photo's state,
  // then a success screen with the animated check.
  const showProgress = (values, ready) => {
    heading.textContent = 'Publishing your project';
    form.hidden = true;
    preview.hidden = true;
    stage.hidden = false;
    stage.innerHTML = `<div class="ws-publish-cover"><img src="${esc(ready[0] ?? PLACEHOLDER)}" alt=""><span class="ws-publish-shine" aria-hidden="true"></span></div><p class="ws-publish-name">${esc(values.title)}</p><p class="ws-publish-step" data-publish-step role="status">Creating your project…</p><div class="ws-publish-bar" role="progressbar" aria-label="Publishing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-publish-fill></span></div>${ready.length ? `<ul class="ws-publish-photos">${ready.map((src, index) => `<li class="is-waiting" data-publish-photo="${index}"><img src="${esc(src)}" alt="Photo ${index + 1}"><span class="ws-publish-state" aria-hidden="true"></span></li>`).join('')}</ul>` : ''}`;
    dialog.scrollTop = 0;
  };
  const setProgress = (done, total, text) => {
    const percent = Math.round((done / total) * 100);
    stage.querySelector('[data-publish-fill]').style.width = `${percent}%`;
    stage.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(percent));
    stage.querySelector('[data-publish-step]').textContent = text;
  };
  const markPhoto = (index, status) => {
    const tile = stage.querySelector(`[data-publish-photo="${index}"]`);
    tile.className = `is-${status}`;
    tile.querySelector('.ws-publish-state').innerHTML = status === 'done' ? icon('check') : status === 'failed' ? icon('close') : '';
  };
  const showSuccess = (project, failed, visibleToOthers) => {
    heading.textContent = 'Project published';
    stage.innerHTML = `<div class="ws-publish-done">${successMark()}<h3 class="ws-publish-heading">Your project is live!</h3><p class="ws-publish-message">“${esc(project.title)}” ${visibleToOthers ? 'now appears on your profile and in Explore.' : 'is saved. Only you can see it until you make your profile public in Settings → Privacy.'}</p>${failed ? `<p class="ws-publish-warning">${failed} ${failed === 1 ? 'photo' : 'photos'} didn’t upload. To include ${failed === 1 ? 'it' : 'them'}, delete the project and post it again.</p>` : ''}<div class="ws-publish-actions"><button type="button" class="ws-btn ws-outline" data-publish-view>${icon('eye')}View project</button><button type="button" class="ws-btn ws-primary" data-publish-done>${icon('check')}Done</button></div></div>`;
    stage.querySelector('[data-publish-done]').focus({ preventScroll: true });
    stage.querySelector('[data-publish-view]').addEventListener('click', () => onView(project.id));
    stage.querySelector('[data-publish-done]').addEventListener('click', () => onDone());
  };

  const publish = async () => {
    if (busy) return;
    if (!preview.hidden) showForm();
    const values = details();
    const errors = checkProject(values);
    const first = Object.keys(errors)[0];
    if (first) { say(errors[first]); form.elements[first].focus(); return; }
    if (photos.some((photo) => photo.pending)) { say('Your photos are still being prepared. Publish again in a moment.'); return; }
    busy = true;
    say('');
    const ready = photos.map((photo) => photo.url);
    const total = 1 + ready.length;
    showProgress(values, ready);
    // Keep the progress on screen long enough to read, even on a fast connection.
    const [{ ok, data }] = await Promise.all([api('projects', 'POST', values), pause(600)]);
    if (!ok) {
      busy = false;
      stage.hidden = true;
      showForm();
      say(errorOf(data));
      return;
    }
    let done = 0;
    const step = () => (ready.length ? `Uploading photos ${done} of ${ready.length}…` : 'Finishing up…');
    setProgress(1, total, step());
    const uploaded = [];
    await inBatches(ready, 3, async (url, index) => {
      markPhoto(index, 'uploading');
      const reply = await api('projects/media', 'POST', { project: data.project.id, image: url, position: index });
      if (reply.ok) uploaded[index] = url;
      markPhoto(index, reply.ok ? 'done' : 'failed');
      done += 1;
      setProgress(1 + done, total, step());
    });
    setProgress(total, total, 'All done!');
    const images = uploaded.filter(Boolean);
    const project = { ...data.project, image: images[0] ?? data.project.image, images };
    onPublished(project, data.profilePublic);
    const visibleToOthers = state.profile.visible || data.profilePublic;
    await pause(450);
    showSuccess(project, ready.length - images.length, visibleToOthers);
  };

  // Typing: live character counts.
  form.addEventListener('input', (event) => {
    const counter = form.querySelector(`[data-count="${event.target.name}"]`);
    if (counter) counter.textContent = `${event.target.value.length}/${event.target.maxLength}`;
    if (!error.hidden && event.target.name) say('');
  });
  form.querySelector('[data-photo-input]').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });

  // Dropping files anywhere on the photos column.
  const drop = form.querySelector('[data-drop]');
  drop.addEventListener('dragover', (event) => {
    if (dragged || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    drop.classList.add('is-dragging');
  });
  drop.addEventListener('dragleave', (event) => { if (!drop.contains(event.relatedTarget)) drop.classList.remove('is-dragging'); });
  drop.addEventListener('drop', (event) => {
    drop.classList.remove('is-dragging');
    if (dragged || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  });

  // Reordering photos by dragging them (pointer devices); the star does it everywhere.
  const grid = form.querySelector('[data-photo-grid]');
  grid.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('[data-photo]');
    if (!tile) return;
    dragged = tile.dataset.photo;
    event.dataTransfer.effectAllowed = 'move';
    tile.classList.add('is-lifted');
  });
  grid.addEventListener('dragover', (event) => { if (dragged) event.preventDefault(); });
  grid.addEventListener('drop', (event) => {
    if (!dragged) return;
    event.preventDefault();
    const target = event.target.closest('[data-photo]');
    move(dragged, target ? photos.findIndex((photo) => photo.id === target.dataset.photo) : photos.length - 1);
  });
  grid.addEventListener('dragend', () => { dragged = null; paintPhotos(); });

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.dataset.photoRemove) {
      photos.splice(photos.findIndex((photo) => photo.id === button.dataset.photoRemove), 1);
      paintPhotos();
      form.querySelector('[data-photo-remove], [data-photo-input]').focus();
    }
    if (button.dataset.photoCover) { move(button.dataset.photoCover, 0); form.querySelector('[data-photo-remove]')?.focus(); }
    if (button.hasAttribute('data-composer-preview')) showPreview();
  });
  preview.addEventListener('click', (event) => {
    if (event.target.closest('[data-preview-back]')) showForm();
    if (event.target.closest('[data-preview-publish]')) publish();
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); publish(); });

  paintPhotos();
  form.elements.title.focus();
}
