// Dash, the First Try mascot: a white ghost in a hurry with a warm shimmer, drawn as plain SVG and
// moved with CSS. No dependencies. Used by the app (desktop/renderer) and, bundled to
// site/assets/dash.js by `npm run dash:build`, by the landing page.
//
// Every mood stands for a product state:
//   idle      waiting for you            breathes, blinks, eyes follow the pointer
//   watching  you are typing or talking  leans in, eyes on the field
//   thinking  reading, analysing, writing looks up, sways, the shimmer turns
//   curious   it has a question for you  head tilted, one eye wider
//   done      the prompt is ready        happy eyes, one hop
//   oops      something went wrong       small worried eyes, one shake
//   asleep    it cannot work yet         closed eyes, slow breath (no access, or switched off)
// Loops: idle's breath and thinking only. Everything else is one move of at most 0.9 s, then still.
// With prefers-reduced-motion nothing moves; the eyes and pose still change with the mood.

import { BLEED, createDash3D, type Dash3D } from './dash3d';

export const MOODS = ['idle', 'watching', 'thinking', 'curious', 'done', 'oops', 'asleep'] as const;
export type Mood = (typeof MOODS)[number];

const SHAPE =
  'M114 44C150 44 176 71 176 106C176 142 150 168 114 168C101 168 93 165 85 160C79 156 75 165 66 160C57 155 63 146 54 141C46 137 39 144 33 135C27 126 40 121 44 113C48 104 46 95 52 84C62 60 85 44 114 44Z';
const DRIPS: [number, number, number][] = [[29, 152, 5.5], [50, 172, 6.5]];
const EYES: [number, number, number, number][] = [[124, 100, 10, 15.5], [153, 98, 9, 14.5]];
const SHIMMER: [number, number, number, string][] = [[78, 118, 34, '#ff9fb0'], [124, 142, 32, '#ffc24a'], [160, 118, 28, '#ffe3a3']];
const INK = '#141419';

export const DASH_CSS = `
.dash{display:block;width:100%;height:auto;overflow:visible}
.dash .d-all,.dash .d-pose,.dash .d-body{transform-box:fill-box;transform-origin:50% 100%}
.dash .d-pose{transition:transform .32s cubic-bezier(.3,1.4,.5,1)}
.dash .d-body{animation:d-breathe 3.4s ease-in-out infinite}
.dash .d-eyes{transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.dash .d-eye{transform-box:fill-box;transform-origin:50% 55%;transition:transform .12s ease-out}
.dash.is-blink .d-eye{transform:scaleY(.08)}
.dash .d-open,.dash .d-joy,.dash .d-shut,.dash .d-worry,.dash .d-z{transition:opacity .15s}
.dash .d-joy,.dash .d-shut,.dash .d-worry,.dash .d-z{opacity:0}
.dash .d-drip{transform-box:fill-box;transform-origin:50% 50%;transition:transform .3s}
.dash .d-shimmer{transform-box:fill-box;transform-origin:50% 50%}
.dash.is-hop .d-all{animation:d-hop .62s cubic-bezier(.3,.7,.3,1)}
.dash.is-shake .d-all{animation:d-shake .45s ease-in-out}
.dash.is-arrive .d-all{animation:d-arrive .9s cubic-bezier(.2,.9,.25,1)}
.dash[data-mood=watching] .d-pose{transform:rotate(5deg) translateY(1px)}
.dash[data-mood=watching] .d-eyes{transform:translate(2px,7px)!important}
.dash[data-mood=thinking] .d-shimmer{animation:d-swirl 2.4s linear infinite}
.dash[data-mood=thinking] .d-body{animation:d-sway 1.6s ease-in-out infinite}
.dash[data-mood=thinking] .d-eyes{transform:translate(-5px,-6px)!important}
.dash[data-mood=curious] .d-pose{transform:rotate(-8deg)}
.dash[data-mood=curious] .d-eyes{transform:translate(3px,-4px)!important}
.dash[data-mood=curious]:not(.is-blink) .d-eye:first-child{transform:scale(.86)}
.dash[data-mood=curious]:not(.is-blink) .d-eye:last-child{transform:scale(1.16)}
.dash[data-mood=done] .d-joy{opacity:1}
.dash[data-mood=done] .d-open{opacity:0}
.dash[data-mood=done] .d-eyes{transform:none!important}
.dash[data-mood=oops] .d-worry{opacity:1}
.dash[data-mood=oops] .d-open{opacity:0}
.dash[data-mood=oops] .d-eyes{transform:translate(0,3px)!important}
.dash[data-mood=oops] .d-drip{transform:translateY(5px)}
.dash[data-mood=oops] .d-pose{transform:scale(1.03,.95)}
.dash[data-mood=asleep] .d-shut,.dash[data-mood=asleep] .d-z{opacity:1}
.dash[data-mood=asleep] .d-open{opacity:0}
.dash[data-mood=asleep] .d-body{animation-duration:5.2s}
.dash[data-mood=asleep] .d-eyes{transform:translate(0,3px)!important}
.dash[data-mood=asleep] .d-pose{transform:scale(1.02,.96)}
@keyframes d-breathe{50%{transform:scale(1.015,.975)}}
@keyframes d-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes d-swirl{to{transform:rotate(360deg)}}
@keyframes d-hop{0%{transform:scale(1.08,.86)}30%{transform:translateY(-11%) scale(.94,1.08)}55%{transform:translateY(0) scale(1.07,.9)}75%{transform:translateY(-2.5%) scale(.99,1.02)}100%{transform:none}}
@keyframes d-shake{0%,100%{transform:none}20%{transform:translateX(-4%) rotate(-3deg)}45%{transform:translateX(4%) rotate(3deg)}70%{transform:translateX(-2%) rotate(-1.5deg)}}
@keyframes d-arrive{0%{transform:translateX(-170%) skewX(16deg) scale(1.12,.9);opacity:0}25%{opacity:1}62%{transform:translateX(7%) skewX(-7deg) scale(.95,1.05)}82%{transform:translateX(-2%) skewX(2deg)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){.dash,.dash *{animation:none!important;transition:none!important}}`;

export interface DashArt {
  /** `true` puts Dash on the navy app-icon tile, `'square'` on a full-bleed one; `false` leaves the ghost alone, for dark backgrounds. */
  tile?: boolean | 'square';
  /** For 32 px and under: no drips, no soft shadow, bigger eyes. */
  simple?: boolean;
  mood?: Mood;
  /** The accessible name. An empty string hides the picture from assistive technology. */
  label?: string;
}

let count = 0;
/** The drawing, as SVG markup. It needs `DASH_CSS` on the page to show its moods; `stillSVG` does not. */
export function dashSVG({ tile = true, simple = false, mood = 'idle', label = 'Dash, the First Try mascot' }: DashArt = {}): string {
  const u = `dash${count++}`;
  const grow = simple ? 1.22 : 1;
  const eye = ([cx, cy, rx, ry]: [number, number, number, number], i: number) => {
    const arc = (dir: number, cls: string) =>
      `<path class="${cls}" d="M${cx - rx} ${cy + 3 * dir}Q${cx} ${cy - rx * 1.15 * dir} ${cx + rx} ${cy + 3 * dir}" fill="none" stroke="${INK}" stroke-width="${simple ? 9 : 5}" stroke-linecap="round"/>`;
    const lean = i ? 1 : -1; // the brows slope up towards the middle
    const worry = `<g class="d-worry"><ellipse cx="${cx}" cy="${cy + 4}" rx="${rx * (simple ? 0.8 : 0.62)}" ry="${ry * (simple ? 0.72 : 0.6)}" fill="${INK}"/><path d="M${cx - rx * 0.9} ${cy - ry * 0.62 - lean * 3}L${cx + rx * 0.9} ${cy - ry * 0.62 + lean * 3}" stroke="${INK}" stroke-width="${simple ? 7 : 4}" stroke-linecap="round"/></g>`;
    return `<g class="d-eye"><ellipse class="d-open" cx="${cx}" cy="${cy}" rx="${rx * grow}" ry="${ry * grow}" transform="rotate(-4 ${cx} ${cy})" fill="${INK}"/>${arc(1, 'd-joy')}${arc(-1, 'd-shut')}${worry}</g>`;
  };
  const drips = (live: boolean) => (simple ? '' : DRIPS.map(([x, y, r]) => `<circle ${live ? 'class="d-drip" ' : ''}cx="${x}" cy="${y}" r="${r}"/>`).join(''));
  const name = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const plate =
    tile === 'square'
      ? `<rect width="200" height="200" fill="url(#${u}t)"/>`
      : tile
        ? `<rect width="200" height="200" rx="46" fill="url(#${u}t)"/><rect x="1" y="1" width="198" height="198" rx="45" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>`
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="dash" data-mood="${mood}" viewBox="${tile ? '0 0 200 200' : '14 20 176 164'}" ${name}>
<defs><linearGradient id="${u}t" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#1d2748"/><stop offset="1" stop-color="#0b1020"/></linearGradient>
<filter id="${u}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<clipPath id="${u}c"><path d="${SHAPE}"/></clipPath></defs>
${plate}
<g class="d-all"><g class="d-pose"><g class="d-body">
${simple ? '' : `<g fill="#000" opacity=".4" transform="translate(5 8)"><path d="${SHAPE}"/>${drips(false)}</g>`}
<g fill="#fff"><path d="${SHAPE}"/>${drips(true)}</g>
<g clip-path="url(#${u}c)"><g class="d-shimmer" filter="url(#${u}b)" opacity=".78">${SHIMMER.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('')}</g></g>
<g class="d-eyes">${EYES.map(eye).join('')}</g>
<g class="d-z" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M168 46h12l-12 13h12"/><path d="M152 30h8l-8 9h8" opacity=".7"/></g>
</g></g></g></svg>`;
}

const SHOWN: Record<Mood, string> = { idle: 'd-open', watching: 'd-open', thinking: 'd-open', curious: 'd-open', done: 'd-joy', oops: 'd-worry', asleep: 'd-shut' };
/** A picture that needs no stylesheet: a file, an `<img>`, an export. The mood's eyes are baked in. */
export function stillSVG(art: DashArt = {}): string {
  const mood = art.mood ?? 'idle';
  let svg = dashSVG(art).replace(' class="dash"', '');
  for (const cls of ['d-open', 'd-joy', 'd-shut', 'd-worry']) if (cls !== SHOWN[mood]) svg = svg.replaceAll(`class="${cls}"`, `class="${cls}" display="none"`);
  if (mood !== 'asleep') svg = svg.replace('class="d-z"', 'class="d-z" display="none"');
  const pose: Partial<Record<Mood, string>> = { curious: 'rotate(-8 105 168)', watching: 'rotate(5 105 168)' };
  const gaze: Partial<Record<Mood, string>> = { watching: 'translate(2 7)', thinking: 'translate(-5 -6)', curious: 'translate(3 -4)', oops: 'translate(0 3)', asleep: 'translate(0 3)' };
  if (pose[mood]) svg = svg.replace('class="d-pose"', `class="d-pose" transform="${pose[mood]}"`);
  if (gaze[mood]) svg = svg.replace('class="d-eyes"', `class="d-eyes" transform="${gaze[mood]}"`);
  return svg;
}

export interface DashOptions extends DashArt {
  /** Width in CSS pixels. */
  size?: number;
  /** Eyes follow the pointer while idle. */
  follow?: boolean;
  /** Dash in from the left when created. */
  arrive?: boolean;
  /**
   * `auto` (the default) draws Dash in 3D when it stands alone (no tile), is larger than 32 px, the
   * browser has WebGL 2 and motion is allowed; otherwise it is the flat drawing. `svg` forces the flat one.
   */
  render?: 'auto' | 'svg';
}
export interface DashHandle {
  el: HTMLElement;
  setMood(mood: Mood): void;
  hop(): void;
  arrive(): void;
  destroy(): void;
}

// One pointer listener for every Dash on the page, applied once per frame.
const followers = new Set<{ svg: SVGSVGElement; eyes: SVGGElement }>();
const solids = new Set<{ box: HTMLElement; dash: Dash3D }>();
let pointer: { x: number; y: number } | null = null;
let queued = false;
function onPointer(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY };
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!pointer) return;
    for (const { svg, eyes } of followers) {
      const r = svg.getBoundingClientRect();
      const dx = (pointer.x - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (pointer.y - (r.top + r.height / 2)) / window.innerHeight;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v * 2.4));
      eyes.style.transform = `translate(${(clamp(dx) * 7).toFixed(1)}px,${(clamp(dy) * 5).toFixed(1)}px)`;
    }
    for (const { box, dash } of solids) {
      const r = box.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v * 2.4));
      dash.look([clamp((pointer.x - (r.left + r.width / 2)) / window.innerWidth), -clamp((pointer.y - (r.top + r.height / 2)) / window.innerHeight)]);
    }
  });
}

/** A live Dash inside `target`. Setting `done` hops once and `oops` shakes once. */
export function createDash(target: string | HTMLElement, { size = 96, follow = true, arrive = false, render = 'auto', ...art }: DashOptions = {}): DashHandle {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new Error('createDash: no such element');
  if (!document.getElementById('dash-css')) {
    const style = document.createElement('style');
    style.id = 'dash-css';
    style.textContent = DASH_CSS;
    document.head.append(style);
  }
  const box = document.createElement('span');
  box.style.cssText = `display:inline-block;width:${size}px;line-height:0;vertical-align:middle`;
  host.append(box);
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const listen = () => { if (!followers.size && !solids.size) window.addEventListener('pointermove', onPointer, { passive: true }); };
  const unlisten = () => { if (!followers.size && !solids.size) window.removeEventListener('pointermove', onPointer); };

  // In 3D: the same box on the page, with a larger canvas centred on it so that no move is cut off.
  // Where there is a pointer to follow, Dash also faces the side it is on.
  const solid = render === 'auto' && !art.tile && art.tile !== undefined && size > 32 && !calm ? createDash3D(Math.round(size * BLEED), art.mood ?? 'idle', follow && (window.matchMedia?.('(hover: hover)').matches ?? false)) : null;
  if (solid) {
    const label = art.label ?? 'Dash, the First Try mascot';
    box.style.cssText += `;position:relative;height:${Math.round((size * 164) / 176)}px`;
    if (label) { box.setAttribute('role', 'img'); box.setAttribute('aria-label', label); } else box.setAttribute('aria-hidden', 'true');
    box.dataset.mood = art.mood ?? 'idle';
    box.dataset.render = '3d';
    box.append(solid.canvas);
    const entry3 = { box, dash: solid };
    if (follow) { listen(); solids.add(entry3); }
    if (arrive) solid.arrive();
    let flat: DashHandle | null = null;
    // If the browser takes the context away, the flat drawing takes over in the same place.
    solid.onLost = () => {
      solids.delete(entry3); unlisten(); solid.destroy();
      const mood = (box.dataset.mood ?? 'idle') as Mood;
      box.remove();
      flat = createDash(host, { size, follow, render: 'svg', ...art, mood });
    };
    return {
      get el() { return flat ? flat.el : box; },
      setMood(mood) { if (flat) return flat.setMood(mood); if (!MOODS.includes(mood)) return; box.dataset.mood = mood; solid.setMood(mood); },
      hop: () => (flat ? flat.hop() : solid.hop()),
      arrive: () => (flat ? flat.arrive() : solid.arrive()),
      destroy() { if (flat) return flat.destroy(); solids.delete(entry3); unlisten(); solid.destroy(); box.remove(); },
    };
  }

  box.innerHTML = dashSVG({ simple: size <= 32, ...art });
  const svg = box.firstElementChild as SVGSVGElement;
  const entry = { svg, eyes: svg.querySelector('.d-eyes') as SVGGElement };
  let timer = 0;
  let alive = true;
  const once = (cls: string) => {
    if (calm) return;
    svg.classList.remove('is-hop', 'is-shake', 'is-arrive');
    void svg.getBoundingClientRect();
    svg.classList.add(cls);
  };
  svg.addEventListener('animationend', (e) => {
    if ((e.target as Element).classList.contains('d-all')) svg.classList.remove('is-hop', 'is-shake', 'is-arrive');
  });
  const blink = () => {
    if (!alive) return;
    const mood = svg.dataset.mood;
    if (mood !== 'done' && mood !== 'asleep' && mood !== 'oops') {
      svg.classList.add('is-blink');
      window.setTimeout(() => svg.classList.remove('is-blink'), 130);
    }
    timer = window.setTimeout(blink, 2200 + Math.random() * 3800);
  };
  if (!calm) {
    timer = window.setTimeout(blink, 1200 + Math.random() * 2000);
    if (follow) {
      listen();
      followers.add(entry);
    }
    if (arrive) once('is-arrive');
  }
  return {
    el: box,
    setMood(mood) {
      if (!MOODS.includes(mood) || svg.dataset.mood === mood) return;
      svg.dataset.mood = mood;
      if (mood === 'done') once('is-hop');
      if (mood === 'oops') once('is-shake');
    },
    hop: () => once('is-hop'),
    arrive: () => once('is-arrive'),
    destroy() {
      alive = false;
      window.clearTimeout(timer);
      followers.delete(entry);
      unlisten();
      box.remove();
    },
  };
}
