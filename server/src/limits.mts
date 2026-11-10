// In-memory fixed-window counters. One process, so memory is the right place; a restart only resets windows.
const windows = new Map<string, { count: number; resetAt: number }>();

/** True if this hit is allowed; counts it either way. */
export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  return { ok: w.count <= limit, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
}

const inFlight = new Map<number, number>();
export function acquire(userId: number, max: number): boolean {
  const n = inFlight.get(userId) ?? 0;
  if (n >= max) return false;
  inFlight.set(userId, n + 1);
  return true;
}
export function release(userId: number): void {
  const n = (inFlight.get(userId) ?? 1) - 1;
  if (n <= 0) inFlight.delete(userId);
  else inFlight.set(userId, n);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}, 60_000).unref();
