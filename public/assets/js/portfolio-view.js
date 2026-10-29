import { normalizePortfolio } from './portfolio-model.js';
import { loadDraft, loadSnapshot } from './portfolio-store.js';
import { renderPortfolio, renderWorkDetail } from './portfolio-render.js';

const host = document.querySelector('[data-pf-view]');
const dialog = document.querySelector('[data-pf-dialog]');
const content = document.querySelector('[data-pf-dialog-content]');
const params = new URLSearchParams(location.search);
let portfolio;
let activeType = 'all';
let lastWorkButton;

function unavailable(storageError = false) {
  document.title = 'Portfolio unavailable — Showlio';
  host.innerHTML = `<section class="pf-unavailable"><img src="/assets/images/showlio-logo-sm.webp" alt="Showlio" width="130" height="43"><h1>This portfolio isn’t available here</h1><p>${storageError ? 'This browser couldn’t open its portfolio storage. Allow local browser storage and try again, or return to the builder.' : 'Portfolio previews are saved in the browser where they were created. Open this link in that browser, or create your own portfolio.'}</p><div class="pf-unavailable-actions"><a class="pf-button" href="/portfolio/">Create a portfolio</a><a href="/app/">Back to workspace</a></div></section>`;
}

let filterTimer;
function render() {
  host.innerHTML = renderPortfolio(portfolio, { type: activeType });
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

async function start() {
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
