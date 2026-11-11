// Deterministic keycap avatar. installId: random ID made once on the Mac. usage: local counts only.
const PALETTE = [ // cap top, cap bottom, skirt, ink: Ember tokens plus two cool counterweights
  ['#ffc46b', '#e8892a', '#9a5a19', '#17120f'], ['#f6965a', '#cf6f16', '#7a3d0c', '#17120f'],
  ['#efdcbc', '#cdb38b', '#8c7a63', '#17120f'], ['#6fb6d3', '#0b6e9e', '#084a6b', '#fff4e4'],
  ['#a9cdab', '#6f9a74', '#46634a', '#17120f'], ['#756b63', '#4a433e', '#17120f', '#fff4e4'],
  ['#f4cdbd', '#d8957c', '#9b5a44', '#17120f'], ['#ffe596', '#f2b92c', '#a07812', '#17120f']];
const SHAPES = [{ w: 28, h: 21, rx: 7 }, { w: 23, h: 23, rx: 11.5 }, { w: 30, h: 18, rx: 4 }, { w: 24, h: 25, rx: 3 }];
const ln = (d, c, w = 1.6) => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
const EYES = [ // x, y: face centre. c: ink. b: cap colour (for eyelids)
  (x, y, c) => `<circle cx="${x - 4.5}" cy="${y}" r="1.9" fill="${c}"/><circle cx="${x + 4.5}" cy="${y}" r="1.9" fill="${c}"/>`,
  (x, y, c) => [-5, 5].map((d) => `<circle cx="${x + d}" cy="${y}" r="3" fill="#fff"/><circle cx="${x + d + 0.9}" cy="${y + 0.6}" r="1.5" fill="#17120f"/>`).join(''),
  (x, y, c) => ln(`M${x - 7} ${y + 1}q2.5-3.5 5 0M${x + 2} ${y + 1}q2.5-3.5 5 0`, c, 1.8),
  (x, y, c, b) => [-5, 5].map((d) => `<circle cx="${x + d}" cy="${y}" r="3" fill="#fff"/><circle cx="${x + d}" cy="${y + 1}" r="1.4" fill="#17120f"/><path d="M${x + d - 3.2} ${y}a3.2 3.2 0 0 1 6.4 0z" fill="${b}"/>` + ln(`M${x + d - 3.2} ${y}h6.4`, c, 1.2)).join('')];
const BROWS = [() => '', (x, y, c) => ln(`M${x - 7} ${y - 5}l4-1.2M${x + 3} ${y - 6.2}l4 1.2`, c),
  (x, y, c) => ln(`M${x - 7} ${y - 4.5}h4.5M${x + 2.5} ${y - 6.5}l4.5 1.5`, c)];
const MOUTHS = [(x, y, c) => ln(`M${x - 3} ${y}q3 2.6 6 0`, c), (x, y, c) => `<ellipse cx="${x}" cy="${y + 0.6}" rx="1.6" ry="1.9" fill="${c}"/>`,
  (x, y, c) => ln(`M${x - 3} ${y + 0.8}q4 0.6 6-1.4`, c)];
const GLYPH = { 'front-end': '</>', software: '{}', writing: '¶', marketing: '!', data: '%', learning: '?',
  planning: '#', creative: '*', personal: '♥', other: '' };
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, list) => list[Math.floor(r() * list.length)];

export function avatarSVG(installId, usage = {}) {
  const r = rng(hash(installId));
  const [top, bottom, skirt, ink] = pick(r, PALETTE);
  const s = pick(r, SHAPES), eyes = pick(r, EYES), brows = pick(r, BROWS), mouth = pick(r, MOUTHS);
  const tilt = (r() * 8 - 4).toFixed(1), id = `k${hash(installId).toString(36)}`;
  const press = usage.state === 'working' ? 2.5 : 0; // the key physically goes down while it works
  const x = (40 - s.w) / 2, y = 36 - s.h - 4 + press, cx = 20, ey = y + s.h * 0.42, my = y + s.h * 0.72;
  const n = usage.presses ?? 0;
  const face = n >= 100 ? `<rect x="${cx - 10}" y="${ey - 2.8}" width="20" height="5.6" rx="2.8" fill="#17120f"/>`
    + ln(`M${cx - 8} ${ey - 1.4}h3`, '#fff', 1) + brows(cx, ey, ink) : eyes(cx, ey, ink, bottom) + brows(cx, ey, ink);
  const bling = n >= 25 ? `<path d="M${x + 3.5} ${y - 4}l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z" fill="#f2b92c" stroke="#a07812" stroke-width=".6"/>` : '';
  const crown = n >= 500 ? `<path d="M${cx - 6.5} ${y + 0.5}l1.5-6 3.2 3.4 1.8-4.6 1.8 4.6 3.2-3.4 1.5 6z" fill="#f2b92c" stroke="#a07812" stroke-width=".8"/>` : '';
  const glyph = GLYPH[usage.topDomain] ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img" aria-label="Your key">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="40" height="40" rx="10" fill="var(--avatar-tile, #f7f3ec)"/>
  <g transform="rotate(${tilt} 20 24)">
    <rect x="${x}" y="${36 - s.h}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${skirt}"/>
    <rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="url(#${id})"/>
    <rect x="${x + 2.5}" y="${y + 1.6}" width="${s.w - 5}" height="${s.h - 5}" rx="${Math.max(s.rx - 2, 1.5)}" fill="#fff" opacity=".16"/>
    ${face}${mouth(cx, my, ink)}${bling}${crown}
    <text x="${x + s.w - 2.5}" y="${y + 6}" font-size="5.5" font-weight="700" font-family="ui-monospace,monospace" text-anchor="end" fill="${ink}" opacity=".55">${glyph}</text>
  </g></svg>`;
}
