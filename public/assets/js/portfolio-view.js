import { normalizePortfolio, portfolioFromCreator } from './portfolio-model.js';
import { slotHeaders } from './session-slot.js';
import { loadDraft, loadSnapshot } from './portfolio-store.js';
import { renderPortfolio, renderWorkDetail, templates, monogram } from './portfolio-render.js';

const host = document.querySelector('[data-pf-view]');
const dialog = document.querySelector('[data-pf-dialog]');
const content = document.querySelector('[data-pf-dialog-content]');
const params = new URLSearchParams(location.search);
let portfolio;
let activeType = 'all';
let lastWorkButton;

function unavailable(storageError = false, message = '') {
  document.title = 'Portfolio unavailable — Showlio';
  host.innerHTML = `<section class="pf-unavailable"><img src="/assets/images/showlio-logo-sm.webp" alt="Showlio" width="130" height="43"><h1>This portfolio isn’t available here</h1><p>${message ? message.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`) : storageError ? 'This browser couldn’t open its portfolio storage. Allow local browser storage and try again, or return to the builder.' : 'Portfolio previews are saved in the browser where they were created. Open this link in that browser, or create your own portfolio.'}</p><div class="pf-unavailable-actions"><a class="pf-button" href="/portfolio/">Create a portfolio</a><a href="/app/">Back to workspace</a></div></section>`;
}

let filterTimer;
function render() {
  host.innerHTML = renderPortfolio(portfolio, { type: activeType });
  dialog.className = `pf-dialog pf-dialog-${portfolio.style.layout}`;
  setFavicon();
}

// The tab icon becomes the creator's name logo, in their accent colour.
function setFavicon() {
  const letters = monogram(portfolio.profile.name).replace(/[&<>"']/g, '');
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${portfolio.style.accent}"/><text x="32" y="42" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">${letters}</text></svg>`;
  document.querySelector('link[rel="icon"]').href = `data:image/svg+xml,${encodeURIComponent(icon)}`;
}

// On their own page, the creator picks a template; it is saved to their account at once.
function ownerBar() {
  const bar = document.querySelector('[data-pf-owner]');
  const draw = (message = '') => {
    bar.innerHTML = `<strong>Your page template</strong><div class="pf-owner-choices" role="radiogroup" aria-label="Page template">${Object.entries(templates).map(([key, item]) => `<button type="button" role="radio" aria-checked="${portfolio.style.layout === key}" data-pf-template="${key}"><i class="pf-owner-swatch is-${key}" aria-hidden="true"></i>${item.name}</button>`).join('')}</div><span class="pf-owner-status" role="status">${message}</span>`;
  };
  bar.hidden = false;
  draw();
  bar.addEventListener('click', async event => {
    const choice = event.target.closest('[data-pf-template]')?.dataset.pfTemplate;
    const before = portfolio.style.layout;
    if (!choice || choice === before) return;
    portfolio = normalizePortfolio({ ...portfolio, style: { ...portfolio.style, layout: choice } });
    host.classList.add('pf-settled');
    render();
    draw('Saving…');
    bar.querySelector(`[data-pf-template="${choice}"]`)?.focus({ preventScroll: true });
    let saved = false;
    try {
      const response = await fetch('/api/portfolio/template', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...slotHeaders() }, body: JSON.stringify({ template: choice }) });
      saved = response.ok;
    } catch { saved = false; }
    if (!saved) {
      portfolio = normalizePortfolio({ ...portfolio, style: { ...portfolio.style, layout: before } });
      render();
    }
    draw(saved ? `Saved. Visitors now see ${templates[choice].name}.` : 'Couldn’t save. Check your connection and try again.');
  });
}
// The page entrance plays once; later filter changes only animate the work cards.
function settle() { setTimeout(() => host.classList.add('pf-settled'), 1600); }

host.addEventListener('click', event => {
  const filter = event.target.closest('[data-pf-filter]');
  if (filter) {
    activeType = filter.dataset.pfFilter;
    host.classList.add('pf-settled');
    host.classList.remove('pf-filtering');
    render();
    void host.offsetWidth;
    host.classList.add('pf-filtering');
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => host.classList.remove('pf-filtering'), 900);
    [...host.querySelectorAll('[data-pf-filter]')].find(button => button.dataset.pfFilter === activeType)?.focus({ preventScroll: true });
    return;
  }
  const menuLink = event.target.closest('.pf-menu-panel a');
  if (menuLink) menuLink.closest('details').open = false;
  const button = event.target.closest('[data-pf-work]');
  if (button) {
    const detail = renderWorkDetail(portfolio, button.dataset.pfWork);
    if (!detail) return;
    lastWorkButton = button;
    content.innerHTML = detail;
    dialog.showModal();
  }
});

dialog.querySelector('[data-pf-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => lastWorkButton?.focus({ preventScroll: true }));

// A creator's live portfolio (?u=username): their Showlio profile and published projects,
// always current, for anyone with the link.
async function startCreator(handle) {
  let response;
  try { response = await fetch(`/api/portfolio?u=${encodeURIComponent(handle)}`, { headers: slotHeaders() }); } catch { unavailable(false, 'Showlio couldn’t be reached. Check your connection and try again.'); return; }
  const page = await response.json().catch(() => ({}));
  if (!response.ok) { unavailable(false, page.error || 'This portfolio couldn’t be opened. Try again in a moment.'); return; }
  portfolio = portfolioFromCreator(page);
  document.title = `${portfolio.profile.name || 'Portfolio'}${portfolio.profile.role ? ` — ${portfolio.profile.role}` : ''}`;
  const header = document.querySelector('[data-pf-community]');
  header.hidden = false;
  const action = header.querySelector('a:last-child');
  action.href = page.profile.own ? '/portfolio/' : '/auth/#sign-up';
  action.textContent = page.profile.own ? 'Edit your portfolio' : 'Join Showlio';
  if (page.profile.own && !page.profile.visible) {
    const note = document.querySelector('[data-pf-notice]');
    note.hidden = false;
    note.querySelector('span').textContent = 'Only you can see this page: your profile is private.';
    const link = note.querySelector('a');
    link.href = '/app/#settings';
    link.textContent = 'Make it public';
  }
  host.classList.add('pf-community-profile');
  render();
  if (page.profile.own) ownerBar();
  settle();
}

async function start() {
  const handle = params.get('u');
  if (handle !== null) { await startCreator(handle); return; }
  const isDraft = params.get('draft') === '1';
  const slug = params.get('slug');
  if (!isDraft && (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80)) { unavailable(); return; }
  try {
    const value = isDraft ? await loadDraft() : await loadSnapshot(slug);
    if (!value) { unavailable(); return; }
    portfolio = normalizePortfolio(value);
    document.title = `${portfolio.profile.name || 'Portfolio'}${portfolio.profile.role ? ` — ${portfolio.profile.role}` : ''}`;
    const note = document.querySelector('[data-pf-notice]');
    note.hidden = false;
    note.querySelector('span').textContent = isDraft ? 'Draft preview · Saved in this browser' : 'Portfolio preview · Saved in this browser';
    if (params.get('community') === '1') {
      document.querySelector('[data-pf-community]').hidden = false;
      host.classList.add('pf-community-profile');
    }
    render();
    settle();
  } catch { unavailable(true); }
}

start();
