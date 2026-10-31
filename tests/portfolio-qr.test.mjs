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

// Rasterize the styled QR exactly as drawn: round dots, and eyes made of a rounded square,
// a white ring and a centre dot.
function decodeDots(svg) {
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const paint = (inside, dark) => {
    for (let py = 0; py < width; py++) for (let px = 0; px < width; px++) {
      if (!inside((px + 0.5) / scale, (py + 0.5) / scale)) continue;
      const offset = (py * width + px) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = dark ? 0 : 255;
    }
  };
  const dots = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="\.48"\/>/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.ok(dots.length > 100, 'data modules are dots');
  const grid = new Map(dots.map(([x, y]) => [`${Math.floor(x)},${Math.floor(y)}`, true]));
  paint((x, y) => grid.has(`${Math.floor(x)},${Math.floor(y)}`) && (x % 1 - .5) ** 2 + (y % 1 - .5) ** 2 <= .48 ** 2, true);
  const eyes = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="7" height="7" rx="2.3"\/>/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.equal(eyes.length, 3, 'three rounded eyes');
  const rounded = (left, top, side, radius) => (x, y) => {
    if (x < left || y < top || x > left + side || y > top + side) return false;
    const nx = Math.min(Math.max(x, left + radius), left + side - radius);
    const ny = Math.min(Math.max(y, top + radius), top + side - radius);
    return (x - nx) ** 2 + (y - ny) ** 2 <= radius ** 2;
  };
  for (const [left, top] of eyes) {
    const cx = left + 3.5;
    const cy = top + 3.5;
    paint(rounded(left, top, 7, 2.3), true);
    paint((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= 2.6 ** 2, false);
    paint((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= 1.6 ** 2, true);
  }
  return jsQR(pixels, width, width)?.data;
}

test('the dotted QR with rounded eyes still scans to the exact link', () => {
  for (const value of ['https://showlio-seven.vercel.app/portfolio/view/?u=khingjay', 'http://127.0.0.1:8000/portfolio/view/?u=ana_cruz']) {
    const svg = qr.createQrSvg(value, { style: 'dots' });
    assert.doesNotMatch(svg, /width="1" height="1"/, 'no square modules');
    assert.equal(decodeDots(svg), value);
  }
});
