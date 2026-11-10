// Renders the small keycap icons from the same shape and colours as build/icon.png:
//   desktop/assets/tray/   the menu bar item (macOS template images + an amber "working" image) and the
//                          Windows tray image (the tray there has no template tinting, so it is amber)
//   public/icon/           16–128 px app icons (browser extension and Windows small sizes)
// macOS tints a *Template image itself: black for a light menu bar, white for a dark one, and the
// selection colour while the menu is open, so the idle states carry no colour of their own.
// Run: node --import tsx scripts/make-menubar-icons.mts
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
// Ember: the same stops as scripts/make-app-icon.mts and --accent / --accent-deep in desktop/renderer/styles.css.
const SIDE_TOP = hex('#b8681d'), SIDE_BOTTOM = hex('#7d450f'), CAP_TOP = hex('#ffc062'), CAP_BOTTOM = hex('#e8892a');
const GREY_CAP_TOP = hex('#d9d2ca'), GREY_CAP_BOTTOM = hex('#a8a099'), GREY_SIDE_TOP = hex('#7f7872'), GREY_SIDE_BOTTOM = hex('#5c5650');

/** Fraction of pixel (x, y) inside a rounded rect, 4×4 supersampled. */
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
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i]! - v) * Math.min(1, Math.max(0, k)));

/** Keycap geometry in pixels for a square canvas of `size`: [left, top, right, bottom, depth, radius]. */
function geometry(size: number, tight: boolean) {
  const k = size / 1024;
  // The app icon sits on Apple's grid; menu bar and 16 px images use the whole canvas so the glyph is legible.
  return tight
    ? { L: size * 0.08, T: size * 0.14, R: size * 0.92, B: size * 0.9, D: size * 0.15, RAD: size * 0.22 }
    : { L: 100 * k, T: 112 * k, R: 924 * k, B: 912 * k, D: 104 * k, RAD: 190 * k };
}

type Style = 'amber' | 'grey' | 'template' | 'template-outline';

function render(size: number, style: Style, tight: boolean): Uint8Array {
  const { L, T, R, B, D, RAD } = geometry(size, tight);
  const rgba = new Uint8Array(size * size * 4);
  const gap = Math.max(1, size / 18); // the clear line between the cap and its side in template images
  const stroke = Math.max(1.5, size / 14);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const side = cover(x, y, L, T + D, R, B, RAD);
    const cap = cover(x, y, L, T, R, B - D, RAD);
    let c: number[] = [0, 0, 0], a = 0;
    if (style === 'template' || style === 'template-outline') {
      const capGap = cover(x, y, L, T, R, B - D + gap, RAD); // cap grown down by the gap
      const sideShown = side * (1 - capGap);
      const capShown = style === 'template' ? cap : cap - cover(x, y, L + stroke, T + stroke, R - stroke, B - D - stroke, Math.max(0, RAD - stroke));
      a = Math.min(1, capShown + sideShown);
    } else {
      const [st, sb, ct, cb] = style === 'amber' ? [SIDE_TOP, SIDE_BOTTOM, CAP_TOP, CAP_BOTTOM] : [GREY_SIDE_TOP, GREY_SIDE_BOTTOM, GREY_CAP_TOP, GREY_CAP_BOTTOM];
      if (side > 0) { c = mix(st, sb, (y - T - D) / (B - T - D)); a = side; }
      if (cap > 0) {
        let capColor = mix(ct, cb, (y - T) / (B - D - T));
        const rim = cover(x, y, L + size * 0.018, T + size * 0.014, R - size * 0.018, B - D - size * 0.022, RAD * 0.9);
        if (rim < 1) capColor = mix(capColor, [255, 244, 228], 0.28 * (1 - rim));
        c = mix(c, capColor, a > 0 ? cap : 1); a = cap + a * (1 - cap);
      }
    }
    const o = (y * size + x) * 4;
    rgba[o] = Math.round(c[0]!); rgba[o + 1] = Math.round(c[1]!); rgba[o + 2] = Math.round(c[2]!); rgba[o + 3] = Math.round(a * 255);
  }
  return rgba;
}

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (u: Uint8Array) => { let c = 0xffffffff; for (const b of u) c = crcT[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Uint8Array) => { const o = new Uint8Array(12 + data.length), v = new DataView(o.buffer);
  v.setUint32(0, data.length); o.set(Buffer.from(type, 'ascii'), 4); o.set(data, 8); v.setUint32(8 + data.length, crc(o.subarray(4, 8 + data.length))); return o; };
function png(size: number, rgba: Uint8Array): Buffer {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, size); new DataView(ihdr.buffer).setUint32(4, size); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}
function write(rel: string, size: number, style: Style, tight: boolean) {
  const out = path.join(ROOT, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, png(size, render(size, style, tight)));
  console.log('wrote', rel);
}

// macOS menu bar: 18 pt square at 1x and 2x. The "Template" suffix makes Electron mark them as template images.
for (const [suffix, px] of [['', 18], ['@2x', 36]] as const) {
  write(`desktop/assets/tray/trayTemplate${suffix}.png`, px, 'template', true); // ready
  write(`desktop/assets/tray/trayOffTemplate${suffix}.png`, px, 'template-outline', true); // needs setup
  write(`desktop/assets/tray/trayBusy${suffix}.png`, px, 'amber', true); // working
}
// Windows tray: 16 px at 1x and 2x.
for (const [suffix, px] of [['', 16], ['@2x', 32]] as const) {
  write(`desktop/assets/tray/trayWin${suffix}.png`, px, 'amber', true);
  write(`desktop/assets/tray/trayWinOff${suffix}.png`, px, 'grey', true);
}
// App icons at small sizes (browser extension, favicons); 16 px uses the tight shape to stay legible.
for (const px of [16, 32, 48, 96, 128]) write(`public/icon/${px}.png`, px, 'amber', px <= 32);
