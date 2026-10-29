import assert from 'node:assert/strict';
import { test } from 'node:test';
import jsQR from 'jsqr';

const qr = await import('../public/assets/js/portfolio-qr.js').catch(() => ({}));

// Rasterize the exact module rectangles returned by the production SVG.
function decode(svg) {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  assert.ok(size > 8);
  const scale = 5;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const modules = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)];
  assert.ok(modules.length > 100);
  for (const [, x, y] of modules) {
    assert.ok(Number(x) >= 4 && Number(y) >= 4 && Number(x) < size - 4 && Number(y) < size - 4, 'four-module quiet zone');
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = ((Number(y) * scale + dy) * width + Number(x) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return jsQR(pixels, width, width)?.data;
}

test('QR SVG decodes to the actual preview URL and supports Unicode', () => {
  assert.equal(typeof qr.createQrSvg, 'function');
  for (const value of ['http://127.0.0.1:8000/portfolio/view/?slug=alex-rivera', 'https://showlio.example/portfolio/view/?slug=priya&name=Zoë-東京-🌱']) {
    assert.equal(decode(qr.createQrSvg(value)), value);
  }
});

test('QR title is escaped and invalid empty or oversized payloads fail clearly', () => {
  assert.doesNotMatch(qr.createQrSvg('<script>alert("x")</script>'), /<script>|<image|<foreignObject/);
  assert.throws(() => qr.createQrSvg(''), /empty/i);
  assert.throws(() => qr.createQrSvg('a'.repeat(10000)), /long/i);
});
