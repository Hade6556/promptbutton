// The knowledge base at run time: which evidence-backed techniques apply to this draft. The rows are
// compiled from kb/kb.db into kb.generated.ts, so a lookup is a filter over a small array in memory.
// Every technique has an id that traces to its sources on https://firstry.ai/sources.html.
import type { Domain, DraftMode, Scale } from '../messaging';
import { KB, KB_VERSION } from './kb.generated';

export interface KbTechnique {
  id: string;
  instruction: string;
  domains: string[];
  scales: string[];
  /** Model families the advice was written for: 'claude', 'gpt', 'gemini', or '*' for any. */
  models: string[];
  /** 'injected' lines go into the rewrite's user turn; 'system_prompt' rules are already part of the rewriter. */
  appliedIn: string;
  confidence: number;
  sources: Array<{ title: string; url: string }>;
}

export type ModelFamily = 'claude' | 'gpt' | 'gemini' | '*';

/** The model family behind the app the user is typing in, when the app name gives it away. */
export function familyOf(site: string | undefined): ModelFamily {
  const name = (site ?? '').toLowerCase();
  if (/claude|anthropic/.test(name)) return 'claude';
  if (/chatgpt|openai|gpt|copilot/.test(name)) return 'gpt';
  if (/gemini|bard|aistudio/.test(name)) return 'gemini';
  return '*';
}

export interface KbQuery {
  domain: Domain;
  mode?: DraftMode;
  scale?: Scale;
  site?: string;
  /** The draft text. Only read when the domain is 'other', to find techniques from the closest domains. */
  draft?: string;
}

/** Words that point at a domain when the classifier could not place the draft. */
const DOMAIN_WORDS: Record<string, string[]> = {
  frontend_design: ['page', 'landing', 'website', 'site', 'design', 'layout', 'html', 'css', 'screen', 'button', 'app', 'mockup'],
  software: ['code', 'bug', 'script', 'function', 'error', 'api', 'test', 'tests', 'database', 'deploy', 'regex', 'query'],
  writing: ['write', 'email', 'post', 'essay', 'letter', 'article', 'draft', 'rewrite', 'speech', 'blog', 'reply', 'message'],
  marketing_sales: ['customers', 'campaign', 'ads', 'ad', 'sales', 'pricing', 'launch', 'audience', 'brand', 'outreach', 'copy', 'leads'],
  data_analysis: ['data', 'analysis', 'analyze', 'analyse', 'metrics', 'chart', 'spreadsheet', 'csv', 'statistics', 'numbers', 'report', 'trend'],
  research_learning: ['explain', 'learn', 'understand', 'summarize', 'summarise', 'compare', 'study', 'teach', 'difference', 'research', 'exam', 'why'],
  planning_strategy: ['plan', 'roadmap', 'strategy', 'decide', 'decision', 'priorities', 'quarter', 'goals', 'schedule', 'budget', 'timeline', 'options'],
  creative: ['story', 'name', 'names', 'tagline', 'idea', 'ideas', 'script', 'poem', 'concept', 'character', 'slogan', 'creative'],
  personal_life: ['meal', 'workout', 'trip', 'travel', 'money', 'health', 'home', 'family', 'gift', 'recipe', 'diet', 'weekend'],
};

/**
 * For a draft the classifier filed under 'other': the domains whose words the draft uses, best first.
 * A plain word match, no model call: it only widens the pool, and the cap below still applies.
 */
export function nearbyDomains(draft: string | undefined): string[] {
  const words = new Set((draft ?? '').toLowerCase().match(/[a-z]{2,}/g) ?? []);
  return Object.entries(DOMAIN_WORDS)
    .map(([domain, list]) => ({ domain, hits: list.filter((w) => words.has(w)).length }))
    .filter((d) => d.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map((d) => d.domain);
}

const MAX_INJECTED = 8;

/**
 * The techniques to add for this draft: right domain, right scale, written for any model or for the one
 * in use. Advice for a specific model never reaches a different one. Domain-specific entries come
 * first, then the strongest evidence; the cap keeps the prompt from growing with the knowledge base.
 */
export function selectTechniques(query: KbQuery, entries: KbTechnique[] = KB, max = MAX_INJECTED): KbTechnique[] {
  const family = familyOf(query.site);
  const scale = query.scale ?? 'deliverable';
  const specific = (t: KbTechnique) => (t.domains.includes(query.domain) ? 2 : 0) + (t.models.includes('*') ? 0 : 1);
  const near = query.domain === 'other' ? nearbyDomains(query.draft) : [];
  return entries
    .filter((t) => t.appliedIn === 'injected')
    .filter((t) => t.domains.includes(query.domain) || t.domains.includes('*') || t.domains.some((d) => near.includes(d)))
    .filter((t) => t.scales.includes(scale) || t.scales.includes('*'))
    .filter((t) => t.models.includes('*') || (family !== '*' && t.models.includes(family)))
    .sort((a, b) => specific(b) - specific(a) || b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, max);
}

/** One time in five, when there is more than one technique to use, one is left out so its effect can be measured. */
export const HOLDOUT_RATE = 0.2;

export interface TechniquePlan {
  /** Ids of the techniques that go into this rewrite. */
  used: string[];
  /** The id deliberately left out this time, or null. */
  heldOut: string | null;
}

/**
 * Chooses the techniques for one rewrite and, at random, leaves one out. Comparing how rewrites fare with
 * and without a technique is the only way to learn its own effect: without the holdout every rewrite in
 * a domain would carry the same set and nothing could be told apart.
 */
export function planTechniques(query: KbQuery, random: () => number = Math.random, entries: KbTechnique[] = KB): TechniquePlan {
  const ids = selectTechniques(query, entries).map((t) => t.id);
  if (ids.length < 2 || random() >= HOLDOUT_RATE) return { used: ids, heldOut: null };
  const heldOut = ids[Math.floor(random() * ids.length)]!;
  return { used: ids.filter((id) => id !== heldOut), heldOut };
}

export { KB, KB_VERSION };
