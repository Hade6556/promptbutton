// What the app reports back so the knowledge base can learn: which techniques a rewrite used and how it
// fared. Outcomes carry no text and are stored without a user id. Before/after pairs carry text, so
// they are accepted only with explicit consent, scrubbed here before storing, and also stored without a user id.
import { handle as db } from './db.mts';

export const SIGNALS = ['inserted', 'undone', 'rated_up', 'rated_down'] as const;
export type Signal = (typeof SIGNALS)[number];

const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;
const WORD = /^[a-z_*]{1,32}$/;

export interface Outcome {
  signal: Signal;
  techniques: string[];
  heldOut: string | null;
  domain: string;
  scale: string;
  family: string;
  kb: string;
}

/** The outcome if the body is one, otherwise null. Nothing free-form gets through: every field is a slug, a keyword or a date. */
export function parseOutcome(body: unknown): Outcome | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const techniques = Array.isArray(b.techniques) ? b.techniques : null;
  if (!SIGNALS.includes(b.signal as Signal) || !techniques || techniques.length > 12) return null;
  if (!techniques.every((t) => typeof t === 'string' && SLUG.test(t))) return null;
  const heldOut = b.heldOut == null ? null : typeof b.heldOut === 'string' && SLUG.test(b.heldOut) ? b.heldOut : undefined;
  if (heldOut === undefined) return null;
  const word = (v: unknown) => (typeof v === 'string' && WORD.test(v) ? v : null);
  const domain = word(b.domain), scale = word(b.scale), family = word(b.family);
  const kb = typeof b.kb === 'string' && /^[0-9a-z-]{1,16}$/.test(b.kb) ? b.kb : null;
  if (!domain || !scale || !family || !kb) return null;
  return { signal: b.signal as Signal, techniques: techniques as string[], heldOut, domain, scale, family, kb };
}

/** Removes what most often identifies someone: email addresses, links, phone-like and long numbers, @handles. Names can remain, which the app says before anyone opts in. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '[link]')
    .replace(/(?<![\w@])@[\w.-]{2,}/g, '[handle]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/\b\d{4,}\b/g, '[number]');
}

export const MAX_PAIR_CHARS = 8000;

export const outcomes = {
  add: (o: Outcome) =>
    db().prepare('INSERT INTO outcomes (signal, techniques, held_out, domain, scale, family, kb) VALUES (?, ?, ?, ?, ?, ?, ?)').run(o.signal, JSON.stringify(o.techniques), o.heldOut, o.domain, o.scale, o.family, o.kb),
  since: (iso: string) => db().prepare('SELECT signal, techniques, held_out, domain, scale, family, kb, at FROM outcomes WHERE at > ? ORDER BY at LIMIT 50000').all(iso),
};

export const pairs = {
  add: (p: { draft: string; rewritten: string; domain: string; techniques: string[] }) =>
    db().prepare('INSERT INTO pairs (draft, rewritten, domain, techniques) VALUES (?, ?, ?, ?)').run(scrub(p.draft).slice(0, MAX_PAIR_CHARS), scrub(p.rewritten).slice(0, MAX_PAIR_CHARS), p.domain, JSON.stringify(p.techniques)),
  since: (iso: string) => db().prepare('SELECT draft, rewritten, domain, techniques, at FROM pairs WHERE at > ? ORDER BY at LIMIT 5000').all(iso),
};
