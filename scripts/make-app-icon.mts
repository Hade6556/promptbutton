// Renders build/icon.png (1024 px), the amber keycap from site/assets/logo.svg, for the Mac app bundle.
// No image dependencies: rounded rects are rasterised with 4x4 supersampling.
// Run: node --import tsx scripts/make-app-icon.mts
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const S = 1024;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const SIDE_TOP = hex('#b8681d'), SIDE_BOTTOM = hex('#7d450f'), CAP_TOP = hex('#ffc062'), CAP_BOTTOM = hex('#e8892a');

function cover(x: number, y: number, l: number, t: number, r: number, b: number, rad: number): number {
  let hit = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
    if (px < l || px > r || py < t || py > b) continue;
    const cx = Math.min(Math.max(px, l + rad), r - rad), cy = Math.min(Math.max(py, t + rad), b - rad);
    if ((px - cx) ** 2 + (py - cy) ** 2 <= rad ** 2) hit++;
  }
  return hit / 16;
}
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i]! - v) * k);

// Apple's grid: the body sits inside ~824 px of the 1024 canvas.
const L = 100, R = 924, TOP = 112, BOTTOM = 912, DEPTH = 104, RAD = 190;
const rgba = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const side = cover(x, y, L, TOP + DEPTH, R, BOTTOM, RAD);
  const cap = cover(x, y, L, TOP, R, BOTTOM - DEPTH, RAD);
  const rim = cover(x, y, L + 18, TOP + 14, R - 18, BOTTOM - DEPTH - 22, RAD - 18);
  let c = [0, 0, 0], a = 0;
  if (side > 0) { c = mix(SIDE_TOP, SIDE_BOTTOM, (y - TOP - DEPTH) / (BOTTOM - TOP - DEPTH)); a = side; }
  if (cap > 0) {
    let capColor = mix(CAP_TOP, CAP_BOTTOM, (y - TOP) / (BOTTOM - DEPTH - TOP));
    if (rim < 1) capColor = mix(capColor, [255, 244, 228], 0.28 * (1 - rim)); // lit edge of the dished top
    c = mix(c, capColor, a > 0 ? cap : 1); a = cap + a * (1 - cap);
  }
  const o = (y * S + x) * 4;
  rgba[o] = c[0]!; rgba[o + 1] = c[1]!; rgba[o + 2] = c[2]!; rgba[o + 3] = Math.round(a * 255);
}

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (u: Uint8Array) => { let c = 0xffffffff; for (const b of u) c = crcT[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Uint8Array) => { const o = new Uint8Array(12 + data.length), v = new DataView(o.buffer);
  v.setUint32(0, data.length); o.set(Buffer.from(type, 'ascii'), 4); o.set(data, 8); v.setUint32(8 + data.length, crc(o.subarray(4, 8 + data.length))); return o; };
const raw = new Uint8Array(S * (S * 4 + 1));
for (let y = 0; y < S; y++) raw.set(rgba.subarray(y * S * 4, (y + 1) * S * 4), y * (S * 4 + 1) + 1);
const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, S); new DataView(ihdr.buffer).setUint32(4, S); ihdr.set([8, 6, 0, 0, 0], 8);
writeFileSync(OUT, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
console.log('wrote', OUT);
