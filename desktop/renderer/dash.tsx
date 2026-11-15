import { useEffect, useRef } from 'preact/hooks';
import { createDash, type DashHandle, type Mood } from '../../src/mascot/dash';

/**
 * Dash, the mascot, showing what the app is doing. The drawing lives in src/mascot/dash.ts.
 * It is decoration for screen readers by default: the state it shows is always also in words.
 */
export function Dash({ mood, size = 24, tile = false, label = '', arrive = false }: { mood: Mood; size?: number; tile?: boolean; label?: string; arrive?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const dash = useRef<DashHandle | null>(null);
  useEffect(() => {
    if (!host.current) return;
    dash.current = createDash(host.current, { size, tile, label, mood, arrive, follow: size > 32 });
    return () => dash.current?.destroy();
    // The drawing is made once; `mood` changes go through setMood below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, tile]);
  useEffect(() => {
    dash.current?.setMood(mood);
  }, [mood]);
  return <span class="dash-host" ref={host} />;
}
