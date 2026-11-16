import { useEffect, useRef } from 'preact/hooks';
import { createDash, MOODS, type Mood } from '../../src/mascot/dash';

const DIM_AFTER_MS = 30_000;

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
    let dimTimer = 0;
    const settle = (mood: Mood) => {
      const resting = mood === 'idle' || mood === 'asleep';
      el.classList.toggle('awake', !resting);
      el.classList.remove('dim');
      window.clearTimeout(dimTimer);
      if (resting) dimTimer = window.setTimeout(() => el.classList.add('dim'), DIM_AFTER_MS);
    };
    let shown: Mood = 'idle';
    const offMood = window.pb.pet.onMood((next) => {
      const mood = (MOODS as readonly string[]).includes(next) ? (next as Mood) : 'idle';
      if (mood === shown) return;
      const waking = (shown === 'idle' || shown === 'asleep') && mood !== 'idle' && mood !== 'asleep';
      shown = mood;
      dash.setMood(mood);
      if (waking) dash.hop();
      settle(mood);
    });
    settle(shown);

    // Dragged, Dash hangs from the top of its head: it swings against the direction of travel and
    // stretches with speed. The numbers ease towards the latest speed and back to rest when let go.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    const offMotion = window.pb.pet.onMotion(({ held, vx, vy }) => {
      el.classList.toggle('held', held);
      if (calm) return;
      if (held) {
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
      if (next !== over) window.pb.pet.hit((over = next));
    };
    const onLeave = () => { if (!pressed && over) window.pb.pet.hit((over = false)); };
    const onDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      pressed = true;
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
