import { useEffect, useRef } from 'preact/hooks';
import { createDash, MOODS, type Mood, type Move } from '../../src/mascot/dash';

const DIM_AFTER_MS = 30_000;

// ── Left alone ──────────────────────────────────────────────────────────────────────────────────────
// Nobody has touched Dash or used the box: it fidgets now and then, gets sleepy, then falls asleep.
// To watch it all quickly, start the app with FIRSTTRY_IDLE_SPEED=10 (every time below is divided by it).
const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get('idle')) || 1);
/** Left alone this long, Dash gets sleepy: heavy lids, slower breath. */
const DROWSY_AFTER_MS = 20_000 / SPEED;
/** Left alone this long, it is fast asleep (and drawn 15 times a second, not 60). */
const ASLEEP_AFTER_MS = 60_000 / SPEED;
/** A fidget plays after a random wait between these two, until Dash is asleep. */
const FIDGET_MIN_MS = 8_000 / SPEED;
const FIDGET_MAX_MS = 25_000 / SPEED;
/** The height of an idle hop, as a share of the hop for a finished prompt. */
const IDLE_HOP = 0.45;
type Fidget = Move | 'hop';
/** What it does while awake, and while sleepy ('puff' is the two drops rising once, like a "z"). The same one never plays twice running. */
const AWAKE_FIDGETS: Fidget[] = ['blink', 'look', 'stretch', 'hop'];
const DROWSY_FIDGETS: Fidget[] = ['blink', 'stretch', 'yawn', 'puff'];

/**
 * Dash on the desktop: a window of its own (see "Dash on the desktop" in main.ts). The drawing is the 3D
 * Dash from src/mascot. The main process tells it where the pointer is on the whole screen, what the box
 * is doing, and how fast it is being dragged; this file turns that into a look, a mood and a swing.
 */
export function Pet() {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current!;
    // The window hears the real pointer only while it is over the window, in the window's own small
    // coordinates. Those events must not reach Dash, or it would snap to them; it follows the positions
    // sent by the main process instead, which cover the whole screen.
    const mute = (event: PointerEvent) => { if (event.isTrusted) event.stopImmediatePropagation(); };
    window.addEventListener('pointermove', mute, true);
    const dash = createDash(host.current!, { size: 72, tile: false, follow: true, label: '', mood: 'idle' });

    const offCursor = window.pb.pet.onCursor(({ x, y }) => {
      const box = dash.el.getBoundingClientRect();
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: box.left + box.width / 2 + x * window.innerWidth, clientY: box.top + box.height / 2 + y * window.innerHeight }));
    });

    // At rest Dash is small and, after a while, a little faded. It grows when it has something to say.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isResting = (mood: Mood) => mood === 'idle' || mood === 'sleepy' || mood === 'asleep';
    let dimTimer = 0, wasResting: boolean | null = null;
    const settle = (mood: Mood) => {
      const resting = isResting(mood);
      el.classList.toggle('awake', !resting);
      if (resting === wasResting) return; // getting sleepy does not start the fade again
      wasResting = resting;
      el.classList.remove('dim');
      window.clearTimeout(dimTimer);
      if (resting) dimTimer = window.setTimeout(() => el.classList.add('dim'), DIM_AFTER_MS);
    };
    let shown: Mood = 'idle';
    const show = (mood: Mood) => {
      if (mood !== shown) dash.setMood((shown = mood));
      settle(mood);
    };

    // `base` is what the app says (idle, asleep because it cannot work yet, or what the box is doing).
    // While it is idle, `stage` is how long Dash has been left alone.
    let base: Mood = 'idle', stage: 'awake' | 'drowsy' | 'asleep' = 'awake', lastFidget: Fidget | null = null;
    let drowsyTimer = 0, asleepTimer = 0, fidgetTimer = 0, held = false;
    const stopIdle = () => { window.clearTimeout(drowsyTimer); window.clearTimeout(asleepTimer); window.clearTimeout(fidgetTimer); };
    const planFidget = () => {
      fidgetTimer = window.setTimeout(() => {
        if (stage !== 'asleep' && !held) {
          const pool = (stage === 'awake' ? AWAKE_FIDGETS : DROWSY_FIDGETS).filter((fidget) => fidget !== lastFidget);
          const fidget = pool[Math.floor(Math.random() * pool.length)]!;
          lastFidget = fidget;
          if (fidget === 'hop') dash.hop(IDLE_HOP);
          else dash.play(fidget);
        }
        planFidget();
      }, FIDGET_MIN_MS + Math.random() * (FIDGET_MAX_MS - FIDGET_MIN_MS));
    };
    /** Start counting from now. Nothing counts while the window is hidden or the app has something else to show. */
    const startIdle = () => {
      stopIdle();
      stage = 'awake';
      if (base !== 'idle' || document.hidden) return;
      drowsyTimer = window.setTimeout(() => { stage = 'drowsy'; show('sleepy'); }, DROWSY_AFTER_MS);
      asleepTimer = window.setTimeout(() => { stage = 'asleep'; window.clearTimeout(fidgetTimer); show('asleep'); }, ASLEEP_AFTER_MS);
      // With reduced motion there are no fidgets: the sleepy and the sleeping pose simply appear.
      if (!calm) planFidget();
    };
    /** The pointer on Dash, a press, a drag: a dozing Dash starts awake, and the count begins again. */
    const touch = () => {
      if (base === 'idle' && stage !== 'awake') {
        show('idle');
        if (!calm) dash.play('startle');
      }
      startIdle();
    };
    const offMood = window.pb.pet.onMood((next) => {
      const mood = (MOODS as readonly string[]).includes(next) ? (next as Mood) : 'idle';
      if (mood === base && mood !== 'idle') return;
      const dozing = stage !== 'awake', fromRest = isResting(shown), before = base;
      base = mood;
      if (mood === 'idle') {
        // The box closed, or the app can work again: back to rest, counting from now. (The app repeats
        // "idle" while nothing happens; that must not wake a dozing Dash.)
        if (before !== 'idle') { show('idle'); startIdle(); }
        return;
      }
      stopIdle();
      stage = 'awake';
      show(mood);
      if (mood === 'asleep') return; // it cannot work yet: asleep until it can
      if (dozing && !calm) dash.play('startle'); // the shortcut woke it
      else if (fromRest) dash.hop();
    });
    const onVisibility = () => { if (document.hidden) stopIdle(); else startIdle(); };
    document.addEventListener('visibilitychange', onVisibility);
    settle(shown);
    startIdle();

    // Dragged, Dash hangs from the top of its head: it swings against the direction of travel and
    // stretches with speed. The numbers ease towards the latest speed and back to rest when let go.
    const want = { tilt: 0, stretch: 0, sideways: true };
    const now = { tilt: 0, sx: 1, sy: 1 };
    let frame = 0;
    const paint = () => {
      frame = 0;
      const sx = want.sideways ? 1 + want.stretch : 1 - want.stretch * 0.7, sy = want.sideways ? 1 - want.stretch * 0.7 : 1 + want.stretch;
      now.tilt += (want.tilt - now.tilt) * 0.22;
      now.sx += (sx - now.sx) * 0.22;
      now.sy += (sy - now.sy) * 0.22;
      el.style.setProperty('--tilt', `${now.tilt.toFixed(2)}deg`);
      el.style.setProperty('--sx', now.sx.toFixed(3));
      el.style.setProperty('--sy', now.sy.toFixed(3));
      want.tilt *= 0.8; // no news means the pointer stopped
      want.stretch *= 0.8;
      const still = Math.abs(now.tilt) < 0.05 && Math.abs(now.sx - 1) < 0.002 && Math.abs(want.tilt) < 0.05;
      if (!still) frame = requestAnimationFrame(paint);
      else { el.style.setProperty('--tilt', '0deg'); el.style.setProperty('--sx', '1'); el.style.setProperty('--sy', '1'); }
    };
    const offMotion = window.pb.pet.onMotion(({ held: carried, vx, vy }) => {
      el.classList.toggle('held', carried);
      if (carried !== held) { held = carried; touch(); }
      if (calm) return;
      if (carried) {
        want.tilt = Math.max(-18, Math.min(18, vx * 1.2));
        want.stretch = Math.min(0.14, Math.hypot(vx, vy) * 0.006);
        want.sideways = Math.abs(vx) >= Math.abs(vy);
      } else {
        el.classList.remove('land');
        void el.offsetWidth;
        el.classList.add('land');
      }
      if (!frame) frame = requestAnimationFrame(paint);
    });

    // Only Dash's body takes the mouse; the rest of the window is as good as not there.
    const body = el.querySelector<HTMLElement>('.pet-hit')!;
    let over = false, pressed = false;
    const onMove = (event: MouseEvent) => {
      const next = pressed || body.contains(event.target as Node);
      if (next === over) return;
      window.pb.pet.hit((over = next));
      if (next) touch(); // the pointer came onto Dash
    };
    const onLeave = () => { if (!pressed && over) window.pb.pet.hit((over = false)); };
    const onDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      pressed = true;
      touch();
      window.pb.pet.down();
    };
    const onUp = (event: MouseEvent) => {
      if (event.button !== 0 || !pressed) return;
      pressed = false;
      window.pb.pet.up();
    };
    const onMenu = (event: MouseEvent) => { event.preventDefault(); window.pb.pet.menu(); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    body.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    body.addEventListener('contextmenu', onMenu);

    return () => {
      window.removeEventListener('pointermove', mute, true);
      offCursor(); offMood(); offMotion();
      window.clearTimeout(dimTimer);
      stopIdle();
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      body.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      body.removeEventListener('contextmenu', onMenu);
      dash.destroy();
    };
  }, []);

  return (
    <div class="pet" ref={root}>
      <div class="pet-grow">
        <div class="pet-hit" role="button" aria-label="Dash. Improve the prompt you are writing">
          <span class="pet-body" ref={host} />
        </div>
      </div>
    </div>
  );
}
