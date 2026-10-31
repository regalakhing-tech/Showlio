import qrcode from '../vendor/qrcode.js';

// The upstream default truncates characters to one byte. TextEncoder preserves
// full UTF-8, including astral characters, for both URLs and arbitrary text.
qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/**
 * Encode the exact destination with a four-module margin.
 * style 'square' (default): classic square modules, error correction M.
 * style 'dots': round dots and rounded "eyes", with error correction Q for the extra styling.
 */
export function createQrSvg(text, { style = 'square' } = {}) {
  if (typeof text !== 'string' || !text.length) throw new Error('The QR destination is empty.');
  if (new TextEncoder().encode(text).length > 2000) throw new Error('The QR destination is too long.');
  const dots = style === 'dots';
  const code = qrcode(0, dots ? 'Q' : 'M');
  code.addData(text, 'Byte');
  try { code.make(); } catch { throw new Error('The QR destination is too long.'); }
  const modules = code.getModuleCount();
  const size = modules + 8;
  const svg = (body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 6}" height="${size * 6}" role="img" aria-label="Portfolio QR code"${extra}><title>${escape(text)}</title><rect width="${size}" height="${size}" fill="#fff"/>${body}</svg>`;
  if (!dots) {
    let cells = '';
    for (let row = 0; row < modules; row++) for (let column = 0; column < modules; column++) {
      if (code.isDark(row, column)) cells += `<rect x="${column + 4}" y="${row + 4}" width="1" height="1"/>`;
    }
    return svg(`<g fill="#000">${cells}</g>`, ' shape-rendering="crispEdges"');
  }
  // The three 7×7 finder patterns become rounded eyes; every other dark module is a dot.
  const eyes = [[0, 0], [0, modules - 7], [modules - 7, 0]];
  const inEye = (row, column) => eyes.some(([top, left]) => row >= top && row < top + 7 && column >= left && column < left + 7);
  let cells = '';
  for (let row = 0; row < modules; row++) for (let column = 0; column < modules; column++) {
    if (code.isDark(row, column) && !inEye(row, column)) cells += `<circle cx="${column + 4.5}" cy="${row + 4.5}" r=".48"/>`;
  }
  const eye = ([top, left]) => `<g class="qr-eye"><rect x="${left + 4}" y="${top + 4}" width="7" height="7" rx="2.3"/><circle cx="${left + 7.5}" cy="${top + 7.5}" r="2.6" fill="#fff"/><circle cx="${left + 7.5}" cy="${top + 7.5}" r="1.6"/></g>`;
  return svg(`<g fill="#000">${cells}${eyes.map(eye).join('')}</g>`);
}
