// Generates the extension icons (a cobalt keycap) as PNGs with no image dependencies.
// Run: node --import tsx scripts/make-icons.mts
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
const SIZES = [16, 32, 48, 96, 128];
const TOP = [0x2b, 0x4b, 0xd8];
const SIDE = [0x1d, 0x37, 0xa8];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'ascii'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(size: number, rgba: Uint8Array): Buffer {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Coverage of a rounded rect at point (x, y), supersampled. */
function roundedRect(x: number, y: number, left: number, top: number, right: number, bottom: number, radius: number): number {
  const ss = 4;
  let hit = 0;
  for (let sy = 0; sy < ss; sy++) {
    for (let sx = 0; sx < ss; sx++) {
      const px = x + (sx + 0.5) / ss;
      const py = y + (sy + 0.5) / ss;
      if (px < left || px > right || py < top || py > bottom) continue;
      const cx = Math.min(Math.max(px, left + radius), right - radius);
      const cy = Math.min(Math.max(py, top + radius), bottom - radius);
      if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) hit++;
    }
  }
  return hit / (ss * ss);
}

function draw(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const pad = size * 0.06;
  const radius = size * 0.22;
  const depth = size * 0.14;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const side = roundedRect(x, y, pad, pad + depth, size - pad, size - pad, radius);
      const top = roundedRect(x, y, pad, pad, size - pad, size - pad - depth, radius);
      // Composite: top over side over transparent.
      let r = 0, g = 0, b = 0, a = 0;
      if (side > 0) { r = SIDE[0]!; g = SIDE[1]!; b = SIDE[2]!; a = side; }
      if (top > 0) {
        r = r * (1 - top) + TOP[0]! * top;
        g = g * (1 - top) + TOP[1]! * top;
        b = b * (1 - top) + TOP[2]! * top;
        a = a + top * (1 - a);
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(path.join(OUT_DIR, `${size}.png`), png(size, draw(size)));
  console.log(`wrote public/icon/${size}.png`);
}
