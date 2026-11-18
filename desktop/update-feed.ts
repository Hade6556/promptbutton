// The parts of the updater that only read text: comparing versions and checking latest.json. Kept apart
// from update.ts so they can be tested without Electron.

export interface Release {
  version: string;
  url: string;
  bytes: number;
  sha256: string;
}

/** 1 when `a` is the newer version, -1 when older, 0 when the same. Versions are three numbers. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
}

/** latest.json, or null when it is not a release this code can install. Every field is checked: it comes from the network. */
export function readRelease(json: unknown, feed: string): Release | null {
  const r = json as { version?: unknown; file?: unknown; bytes?: unknown; sha256?: unknown } | null;
  if (!r || typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)) return null;
  if (typeof r.file !== 'string' || !/^[A-Za-z0-9._-]+\.dmg$/.test(r.file)) return null;
  if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256)) return null;
  if (typeof r.bytes !== 'number' || !(r.bytes > 0) || r.bytes > 1024 ** 3) return null;
  return { version: r.version, url: new URL(r.file, feed).toString(), bytes: r.bytes, sha256: r.sha256 };
}
