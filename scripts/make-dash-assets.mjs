// Renders every picture of Dash from the one drawing in src/mascot/dash.ts (through its bundle,
// site/assets/dash.js): the site's logo, favicons and share image, the app icon, the browser-extension
// icons, the menu bar and tray images, and reference stills of each mood.
// SVGs are written directly; PNGs are screenshots from headless Chrome.
//   npm run dash:assets            (CHROME=/path/to/chrome to use another browser)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MOODS, stillSVG } from '../site/assets/dash.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const work = mkdtempSync(join(tmpdir(), 'dash-assets-'));
const at = (...p) => { const file = join(root, ...p); mkdirSync(dirname(file), { recursive: true }); return file; };
const text = (file, body) => writeFileSync(file, body.trim() + '\n');
/** Screenshot `body` on a transparent page `w` by `h` CSS pixels. */
const shot = (file, w, h, body, css = '') => {
  const page = join(work, 'page.html');
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}.c{width:${w}px;height:${h}px;display:grid;place-items:center}.c>svg{width:100%;height:auto;display:block}${css}</style><div class="c">${body}</div>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
    `--user-data-dir=${join(work, 'profile')}`, `--window-size=${w},${h}`, `--screenshot=${file}`, pathToFileURL(page).href], { stdio: 'ignore' });
};

// The ghost alone, as one flat colour with the eyes cut out: what a menu bar can tint.
const SHAPE = 'M114 44C150 44 176 71 176 106C176 142 150 168 114 168C101 168 93 165 85 160C79 156 75 165 66 160C57 155 63 146 54 141C46 137 39 144 33 135C27 126 40 121 44 113C48 104 46 95 52 84C62 60 85 44 114 44Z';
const glyph = (fill, { hollow = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 34 164 144">
<mask id="m"><rect x="0" y="0" width="200" height="200" fill="#fff"/>${hollow
    ? `<path d="${SHAPE}" fill="#000" transform="translate(105 106) scale(.8) translate(-105 -106)"/>`
    : '<ellipse cx="122" cy="102" rx="14" ry="20" fill="#000"/><ellipse cx="155" cy="100" rx="12.5" ry="18.5" fill="#000"/>'}</mask>
<path d="${SHAPE}" fill="${fill}" mask="url(#m)"/>${hollow ? `<path d="M112 108h18M146 106h15" stroke="${fill}" stroke-width="10" stroke-linecap="round"/>` : ''}</svg>`;

try {
  // The site.
  const mark = stillSVG({ simple: true, label: 'First Try' });
  text(at('site/assets/logo.svg'), mark);
  text(at('site/assets/favicon.svg'), mark);
  shot(at('site/assets/favicon-32.png'), 32, 32, mark);
  shot(at('site/assets/apple-touch-icon.png'), 180, 180, stillSVG({ tile: 'square' }));
  shot(at('site/assets/og.png'), 1200, 630,
    `<div class="og"><div class="d">${stillSVG({ tile: false })}</div><div><p class="a">Make your prompts</p><p class="b">10x better.</p><p class="s">First Try rewrites a rough prompt into a great one, in one key press.</p><p class="u">firstry.ai</p></div></div>`,
    `.c{display:block}.og{box-sizing:border-box;width:1200px;height:630px;padding:0 84px;display:flex;align-items:center;gap:64px;background:radial-gradient(90% 120% at 22% 30%,#2a3a70 0%,#172143 45%,#0b1020 100%);font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#fff}
     .d{width:380px;flex:none}.d svg{width:100%;height:auto;display:block}p{margin:0}.a{font-size:66px;font-weight:700;letter-spacing:-.02em;line-height:1.05}.b{font-size:100px;font-weight:700;letter-spacing:-.03em;line-height:1.05;color:#ffc163}
     .s{font-size:28px;line-height:1.35;color:#c9d2e8;margin-top:26px;max-width:560px}.u{font-size:26px;font-weight:600;margin-top:22px;color:#fff}`);

  // The app: its icon sits on Apple's grid (an 824 px tile in a 1024 px canvas, with a soft shadow).
  shot(at('build/icon.png'), 1024, 1024, stillSVG({}), '.c>svg{width:824px;filter:drop-shadow(0 12px 22px rgba(0,0,0,.32))}');
  for (const size of [16, 32, 48, 96, 128]) shot(at('public/icon', `${size}.png`), size, size, stillSVG({ simple: size <= 32 }));
  // macOS tints *Template images itself, so those are black; "working" and Windows carry their own colour.
  for (const [name, size, svg] of [
    ['trayTemplate', 18, glyph('#000')], ['trayOffTemplate', 18, glyph('#000', { hollow: true })], ['trayBusy', 18, glyph('#ffad33')],
    ['trayWin', 16, glyph('#ffb547')], ['trayWinOff', 16, glyph('#a8a099', { hollow: true })],
  ]) {
    shot(at('desktop/assets/tray', `${name}.png`), size, size, svg);
    shot(at('desktop/assets/tray', `${name}@2x.png`), size * 2, size * 2, svg);
  }

  // Reference stills: each mood, the hero ghost, and the picture for an empty state.
  for (const mood of MOODS) text(at('site/stage/avatar/export', `mood-${mood}.svg`), stillSVG({ mood, tile: false }));
  text(at('site/stage/avatar/export/dash.svg'), stillSVG({}));
  text(at('site/stage/avatar/export/dash-bare.svg'), stillSVG({ tile: false }));
  text(at('site/stage/avatar/export/empty-state.svg'), stillSVG({ mood: 'curious', tile: false }));
  shot(at('site/stage/avatar/export/hero-1024.png'), 1024, 1024, stillSVG({ tile: false }));
  shot(at('site/stage/avatar/export/hero-512.png'), 512, 512, stillSVG({ tile: false }));
  shot(at('site/stage/avatar/export/empty-state-512.png'), 512, 512, stillSVG({ mood: 'curious', tile: false }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('Dash assets written.');
