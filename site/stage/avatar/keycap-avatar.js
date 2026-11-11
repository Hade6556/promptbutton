// Keycap avatar, v2: a sculpted keycap with a face, the same every time for the same install ID.
// Runs in the browser, makes no network calls, costs nothing. usage = counts kept on the Mac.
const PALETTES = [
  { name: 'amber', hi: '#ffd894', top: '#f6aa3c', side: '#d27c1c', deep: '#8a4f12', ink: '#2a1708', blush: '#ff6f4d' },
  { name: 'ember', hi: '#ffbe98', top: '#ee8040', side: '#c25e1c', deep: '#73320f', ink: '#2a1206', blush: '#ff5a4a' },
  { name: 'sand', hi: '#fff4e4', top: '#ead6b8', side: '#c8ac86', deep: '#86704f', ink: '#2b2117', blush: '#f08f6e' },
  { name: 'porcelain', hi: '#ffffff', top: '#f3eee6', side: '#d6cdbf', deep: '#9c9081', ink: '#2a2420', blush: '#f4a08a' },
  { name: 'teal', hi: '#aee0f2', top: '#47a3c9', side: '#0b6e9e', deep: '#063d58', ink: '#05212f', blush: '#ff8a7a' },
  { name: 'sage', hi: '#d9eed8', top: '#96c29b', side: '#6b9670', deep: '#3a5a3f', ink: '#15241a', blush: '#f2897a' },
  { name: 'basalt', hi: '#958a82', top: '#5d544e', side: '#3b3430', deep: '#161210', ink: '#f6ece0', blush: '#e8735c' },
  { name: 'clay', hi: '#ffe0d4', top: '#eca892', side: '#c57560', deep: '#843f2e', ink: '#2e130b', blush: '#e85a4a' },
  { name: 'brass', hi: '#fff3c2', top: '#f6cf55', side: '#d6a21e', deep: '#81590c', ink: '#2b1f04', blush: '#f2784a' },
];
const SHAPES = [{ w: 46, h: 40, rx: 10 }, { w: 52, h: 35, rx: 9 }, { w: 40, h: 44, rx: 9 }, { w: 44, h: 42, rx: 15 }];
const GLYPH = { 'front-end': '&lt;/&gt;', software: '{ }', writing: '¶', marketing: '!', data: '%', learning: '?',
  planning: '#', creative: '*', personal: '♥', other: '' };
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, list) => list[Math.floor(r() * list.length)];
const L = (d, c, w) => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

export function traits(id) { // everything the ID decides, in a fixed order
  const r = rng(hash(id));
  return { pal: pick(r, PALETTES), shape: pick(r, SHAPES), eyes: Math.floor(r() * 4), brows: Math.floor(r() * 3),
    mouth: Math.floor(r() * 4), blush: r() < 0.5, glossy: r() < 0.5, tilt: +(r() * 6 - 3).toFixed(1), grain: Math.floor(r() * 997) };
}

export function avatarSVG(id, usage = {}) {
  const t = traits(id), p = t.pal, s = t.shape, u = `k${hash(id).toString(36)}`;
  const n = usage.presses ?? 0, down = usage.state === 'working' ? 3 : 0;
  const bx = (64 - s.w) / 2, by = 58 - s.h, tx = bx + 4, tw = s.w - 8, ty = by - 3 + down, th = s.h - 9;
  const trx = Math.max(s.rx - 2, 4), cx = 32, ey = ty + th * 0.43, my = ty + th * 0.75;
  const face = (extra = '') => `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="${trx}" ${extra}/>`;
  const sclera = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="url(#${u}e)"/>`;
  const pupil = (x, y, R) => `<circle cx="${x}" cy="${y}" r="${R}" fill="#1a1310"/><circle cx="${x + R * 0.38}" cy="${y - R * 0.42}" r="${R * 0.4}" fill="#fff"/>`;
  const ex = [-8, 8];
  const eyes = [
    () => ex.map((d) => `<ellipse cx="${cx + d}" cy="${ey}" rx="2.8" ry="3.6" fill="${p.ink}"/><circle cx="${cx + d + 1}" cy="${ey - 1.3}" r="1.05" fill="#fff" opacity=".9"/>`).join(''),
    () => ex.map((d) => sclera(cx + d, ey) + pupil(cx + d + 1.2, ey + 0.8, 2.6)).join(''),
    () => L(ex.map((d) => `M${cx + d - 4} ${ey + 1.5}q4-5 8 0`).join(''), p.ink, 2.7),
    () => ex.map((d) => sclera(cx + d, ey) + pupil(cx + d, ey + 1.6, 2.4) + `<path d="M${cx + d - 5.3} ${ey + 0.5}a5.3 5.3 0 0 1 10.6 0z" fill="${p.top}"/>` + L(`M${cx + d - 5.3} ${ey + 0.5}h10.6`, p.ink, 1.9)).join(''),
  ][t.eyes]();
  const brows = ['', L(`M${cx - 12} ${ey - 8}q4-3 8-1M${cx + 4} ${ey - 9}q4-2 8 1`, p.ink, 2.5),
    L(`M${cx - 12} ${ey - 7.5}h7.5M${cx + 4.5} ${ey - 10.5}l7.5 2.5`, p.ink, 2.5)][t.brows];
  const mouth = [L(`M${cx - 5} ${my}q5 4.6 10 0`, p.ink, 2.7),
    `<path d="M${cx - 5.5} ${my - 1.2}h11a5.5 5.5 0 0 1-11 0z" fill="#2a120a"/><path d="M${cx - 3} ${my + 3.4}q3-2.4 6 0z" fill="#ff8a7a"/>`,
    `<ellipse cx="${cx}" cy="${my + 0.5}" rx="2.4" ry="2.9" fill="#2a120a"/>`, L(`M${cx - 5} ${my + 1}q6 1.4 9.5-2.6`, p.ink, 2.7)][t.mouth];
  const blush = t.blush ? ex.map((d) => `<ellipse cx="${cx + d * 1.65}" cy="${ey + 6}" rx="3.6" ry="2.2" fill="${p.blush}" opacity=".5" filter="url(#${u}c)"/>`).join('') : '';
  const shades = n >= 100 ? `<path d="M${cx - 15} ${ey - 4.5}h30v2.5c0 4.6-3.4 7.2-7.4 7.2s-6.4-3-7-5.6h-1.2c-.6 2.6-3 5.6-7 5.6s-7.4-2.6-7.4-7.2z" fill="url(#${u}k)"/><path d="M${cx - 12} ${ey - 3}h3.5l-4.5 6.5h-1.6zM${cx + 4} ${ey - 3}h3.5l-4.5 6.5h-1.6z" fill="#fff" opacity=".32"/>` : '';
  const star = (x, y, r) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z" fill="url(#${u}a)" stroke="#8a6410" stroke-width=".5"/>`;
  const bling = n >= 25 ? star(tx + tw - 1, ty - 1, 6.5) + star(tx + tw + 5.5, ty + 6, 3) : '';
  const crown = n >= 500 ? `<path d="M${cx - 10} ${ty + 1.5}l-1.4-9.5 6 4.6 5.4-6.6 5.4 6.6 6-4.6-1.4 9.5z" fill="url(#${u}a)" stroke="#8a6410" stroke-width=".8" stroke-linejoin="round"/>`
    + `<circle cx="${cx}" cy="${ty - 2}" r="1.7" fill="#47a3c9"/><circle cx="${cx - 6}" cy="${ty - 0.8}" r="1.2" fill="#ee8040"/><circle cx="${cx + 6}" cy="${ty - 0.8}" r="1.2" fill="#ee8040"/>` : '';
  const g = GLYPH[usage.topDomain] ?? '';
  const legend = g ? `<text x="${tx + tw - 4}" y="${ty + th - 3.4}" text-anchor="end" font-size="6.5" font-weight="800" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" fill="#fff" opacity=".35">${g}</text>`
    + `<text x="${tx + tw - 4}" y="${ty + th - 4}" text-anchor="end" font-size="6.5" font-weight="800" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" fill="${p.ink}" opacity=".42">${g}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Your key">
<defs>
 <linearGradient id="${u}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.hi}"/><stop offset=".6" stop-color="${p.top}"/><stop offset="1" stop-color="${p.side}"/></linearGradient>
 <linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.side}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
 <radialGradient id="${u}v" cx=".5" cy=".42" r=".66"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
 <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <radialGradient id="${u}g" cx=".5" cy=".3" r=".75"><stop offset="0" stop-color="${p.top}" stop-opacity=".38"/><stop offset="1" stop-color="${p.top}" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}e" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e3d9cc"/></radialGradient>
 <linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".5" stop-color="#f4c443"/><stop offset="1" stop-color="#a8780f"/></linearGradient>
 <linearGradient id="${u}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4d4540"/><stop offset="1" stop-color="#0b0806"/></linearGradient>
 <filter id="${u}b" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2.2"/></filter>
 <filter id="${u}c" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".9"/></filter>
 <filter id="${u}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="${t.grain}"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .7 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>
<rect width="64" height="64" rx="16" fill="var(--avatar-tile, #f7f3ec)"/><rect width="64" height="64" rx="16" fill="url(#${u}g)"/>
<ellipse cx="32" cy="58.6" rx="${s.w / 2 - 2}" ry="3" fill="#120c08" opacity=".38" filter="url(#${u}b)"/>
<g transform="rotate(${t.tilt} 32 40)">
 <rect x="${bx}" y="${by}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="url(#${u}s)"/>
 ${face(`fill="url(#${u}t)"`)}${face(`fill="url(#${u}v)"`)}${face(`fill="#000" opacity="${t.glossy ? 0.1 : 0.26}" filter="url(#${u}n)"`)}
 <rect x="${tx + 0.7}" y="${ty + 0.7}" width="${tw - 1.4}" height="${th - 1.4}" rx="${trx - 0.7}" fill="none" stroke="url(#${u}r)" stroke-width="1.2"/>
 ${t.glossy ? `<ellipse cx="${tx + tw * 0.3}" cy="${ty + th * 0.17}" rx="${tw * 0.2}" ry="${th * 0.075}" fill="#fff" opacity=".6" transform="rotate(-10 ${tx + tw * 0.3} ${ty + th * 0.17})"/>` : ''}
 ${legend}${blush}${eyes}${brows}${shades}${mouth}${bling}${crown}
</g></svg>`;
}
