import { normalizePortfolio, visibleWorks } from './portfolio-model.js';
import { escapeHtml, renderPortfolio, renderWorkDetail } from './portfolio-render.js';

const cssPath = '/assets/css/portfolio-public.css';
const fontPath = '/assets/fonts/inter-latin.woff2';
const localRaster = /^\/assets\/(?:[a-z0-9_~-][a-z0-9._~-]*\/)*[a-z0-9_~-][a-z0-9._~-]*\.(png|jpe?g|gif|webp|avif)$/i;
const fontUrl = /url\(\s*(["']?)\/assets\/fonts\/inter-latin\.woff2\1\s*\)/gi;

// This script is constant: portfolio text only enters the JSON data element.
const controls = `(() => {
  const works = new Map(JSON.parse(document.getElementById('pf-export-data').textContent).map(work => [work.id, work]));
  const dialog = document.getElementById('pf-export-dialog');
  const detail = document.getElementById('pf-export-detail');
  document.addEventListener('click', event => {
    const filter = event.target.closest('[data-pf-filter]');
    if (filter) {
      event.preventDefault();
      const type = filter.dataset.pfFilter;
      document.querySelectorAll('[data-pf-filter]').forEach(button => {
        const active = button === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      document.querySelectorAll('.pf-work-card').forEach(card => {
        const work = works.get(card.querySelector('[data-pf-work]').dataset.pfWork);
        card.hidden = type !== 'all' && work.type !== type;
      });
      return;
    }
    const button = event.target.closest('[data-pf-work]');
    if (button) {
      const work = works.get(button.dataset.pfWork);
      if (work) {
        detail.innerHTML = work.detail;
        dialog.showModal();
      }
      return;
    }
    if (event.target.closest('[data-pf-close]')) dialog.close();
    if (event.target === dialog) dialog.close();
  });
})();`;

async function getAsset(path) {
  try {
    const response = await fetch(path, { credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } catch (cause) {
    throw new Error(`Could not include ${path} in the offline portfolio.`, { cause });
  }
}

function dataUrl(bytes, mime) {
  // Chunk conversion avoids argument limits for uploaded images.
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function inlineStyles() {
  let css = await (await getAsset(cssPath)).text();
  if (css.includes(fontPath)) {
    try {
      const bytes = new Uint8Array(await (await getAsset(fontPath)).arrayBuffer());
      if (!bytes.length) throw new Error('Empty font');
      css = css.replace(fontUrl, () => `url("${dataUrl(bytes, 'font/woff2')}")`);
    } catch {
      // Inter is optional; the compiled stylesheet already has system fallbacks.
      css = css.replace(/@font-face\s*\{[^}]*\}/gi, rule => rule.includes(fontPath) ? '' : rule);
    }
  }
  if (/url\(\s*["']?(?!data:)/i.test(css.replace(/url\(\s*["']?data:[^)]*\)/gi, '')) || /@import\b/i.test(css)) {
    throw new Error('The portfolio stylesheet contains an asset that cannot be included offline.');
  }
  return css;
}

/** Build a standalone document; downloading it remains the caller's responsibility. */
export async function exportPortfolio(portfolio) {
  const value = normalizePortfolio(portfolio);
  value.works = visibleWorks(value);
  const images = new Map();
  const inlineImage = async source => {
    if (!source || source.startsWith('data:')) return source;
    if (!localRaster.test(source)) throw new Error('Only local raster assets can be included offline.');
    if (!images.has(source)) images.set(source, (async () => {
      const bytes = new Uint8Array(await (await getAsset(source)).arrayBuffer());
      const extension = localRaster.exec(source)[1].toLowerCase();
      const result = dataUrl(bytes, `image/${extension === 'jpg' ? 'jpeg' : extension}`);
      // Reuse model signature/size checks so malformed images never vanish silently.
      if (normalizePortfolio({ profile: { avatar: result } }).profile.avatar !== result) {
        throw new Error(`Could not include ${source}: invalid raster image or image exceeds 5 MB.`);
      }
      return result;
    })());
    return images.get(source);
  };
  const css = await inlineStyles();
  value.profile.logo = value.style.showLogo ? await inlineImage(value.profile.logo) : '';
  value.profile.avatar = value.style.showAvatar ? await inlineImage(value.profile.avatar) : '';
  for (const work of value.works) work.image = await inlineImage(work.image);
  const works = value.works.map(work => ({ id: work.id, type: work.type, detail: renderWorkDetail(value, work.id) }));
  const json = JSON.stringify(works).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // The stylesheet is a trusted local build, but protect the raw-text boundary too.
  const styles = `${css}\n.pf-work-card[hidden]{display:none!important}`.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(value.profile.name || 'Creative portfolio')} — Portfolio</title><style>${styles}</style></head>
<body class="pf-viewer"><main class="pf-viewer-main">${renderPortfolio(value)}</main>
<dialog class="pf-dialog" id="pf-export-dialog" aria-labelledby="pf-detail-title"><button class="pf-dialog-close" type="button" data-pf-close aria-label="Close project details">×</button><div id="pf-export-detail"></div></dialog>
<script type="application/json" id="pf-export-data">${json}</script><script>${controls}</script></body></html>`;
}
