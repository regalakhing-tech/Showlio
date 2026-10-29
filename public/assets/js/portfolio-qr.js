import qrcode from '../vendor/qrcode.js';

// The upstream default truncates characters to one byte. TextEncoder preserves
// full UTF-8, including astral characters, for both URLs and arbitrary text.
qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/** Encode the exact destination with error correction M and a four-module margin. */
export function createQrSvg(text) {
  if (typeof text !== 'string' || !text.length) throw new Error('The QR destination is empty.');
  if (new TextEncoder().encode(text).length > 2000) throw new Error('The QR destination is too long.');
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  try { code.make(); } catch { throw new Error('The QR destination is too long.'); }
  const modules = code.getModuleCount();
  const size = modules + 8;
  let cells = '';
  for (let row = 0; row < modules; row++) for (let column = 0; column < modules; column++) {
    if (code.isDark(row, column)) cells += `<rect x="${column + 4}" y="${row + 4}" width="1" height="1"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 6}" height="${size * 6}" role="img" aria-label="Portfolio QR code" shape-rendering="crispEdges"><title>${escape(text)}</title><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
}
