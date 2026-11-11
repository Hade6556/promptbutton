import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AmbiguityType, GapReport, ImproveInput, Scale } from '../messaging';
import { ASK_THRESHOLD, EFFORT, MODEL, PromptButtonError } from './config';
import { buildUserContent } from './context';
import { DOMAINS } from './domains';
import { GAP_ANALYSIS_SYSTEM } from './prompts';

const AMBIGUITY_TYPES = [
  'goal',
  'audience',
  'output_format',
  'constraints',
  'success_criteria',
  'examples',
  'unclear_reference',
  'scope',
] as const satisfies readonly AmbiguityType[];

// Keep the schema to the JSON-schema subset structured outputs accepts:
// no numeric ranges or array length limits — those are enforced in normalize().
const MODES = ['follow_up', 'request', 'brain_dump'] as const;
const SCALES = ['deliverable', 'quick'] as const satisfies readonly Scale[];

const GapReportSchema = z.object({
  mode: z.enum(MODES).describe('follow_up: short reply inside a running conversation; request: self-contained ask with one task; brain_dump: long, loose or multi-part'),
  domain: z.enum(DOMAINS).describe('The field of the task; closest match'),
  scale: z.enum(SCALES).describe('deliverable: build/write/design/plan/analyse/decide/fix; quick: lookup, conversion, one-line fact, tiny edit'),
  expert: z
    .string()
    .nullable()
    .describe('For a deliverable: one sentence naming the specific practitioner whose answer the user wants (specialty, known for, judges by). null for quick or purely factual drafts'),
  draft_is_placeholder: z
    .boolean()
    .describe('true when the draft is the input box’s own hint text (e.g. "Queue another message…", "Ask anything…") rather than something the user typed'),
  ambiguity: z.number().describe('0 = fully specified, 1 = the assistant would have to guess the core intent'),
  // Plain strings, checked in normalize(): one label outside the list must not fail the whole analysis.
  missing: z.array(z.string()).describe(`Ambiguity types that pass all three tests, only from: ${AMBIGUITY_TYPES.join(', ')}`),
  questions: z.array(
    z.object({
      type: z.string().describe(`One of: ${AMBIGUITY_TYPES.join(', ')}`),
      question: z.string(),
      suggestions: z.array(z.string()).describe('2–4 realistic tappable answers'),
    }),
  ),
  already_clear_because: z.string().nullable(),
  ready: z.boolean().describe('true only when the draft is already a finished prompt and a rewrite would not get a materially better answer (step 11)'),
  ready_reason: z.string().nullable().describe('When ready: one line, at most 20 words, naming what the draft already has. Otherwise null'),
});

export const MAX_QUESTIONS = 3;

/** Labels the model sometimes uses for the same thing. "context" is who and what the task is for. */
const ALIASES: Record<string, AmbiguityType> = { context: 'audience', format: 'output_format', output: 'output_format', reference: 'unclear_reference', criteria: 'success_criteria' };

/** A known ambiguity type for a label from the model, or null when it is none of ours. */
export function ambiguityType(label: string): AmbiguityType | null {
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((AMBIGUITY_TYPES as readonly string[]).includes(key)) return key as AmbiguityType;
  return ALIASES[key] ?? null;
}

/** A prompt missing any of these is never "good enough", whatever the model's verdict: goal, context, output format. */
export const ESSENTIALS: readonly AmbiguityType[] = ['goal', 'output_format', 'audience', 'unclear_reference'];

/**
 * The "good enough" safeguard. The model judges readiness against the rewrite quality bar; this
 * guard overrules a yes whenever its own analysis says something essential is open, so an
 * underspecified prompt is always rewritten.
 */
export function readiness(report: {
  ready: boolean;
  readyReason: string | null;
  missing: readonly AmbiguityType[];
  ambiguity: number;
  isPlaceholder: boolean;
  alreadyClearBecause: string | null;
}): { ready: boolean; reason: string | null } {
  const blocked = report.isPlaceholder || report.ambiguity >= ASK_THRESHOLD || report.missing.some((m) => ESSENTIALS.includes(m));
  if (!report.ready || blocked) return { ready: false, reason: null };
  const reason = report.readyReason?.trim() || report.alreadyClearBecause?.trim() || 'It already states the goal, the context and the output you want.';
  return { ready: true, reason: reason.split('\n')[0]!.slice(0, 200) };
}

function normalize(raw: z.infer<typeof GapReportSchema>): GapReport {
  const ambiguity = Math.min(1, Math.max(0, Number.isFinite(raw.ambiguity) ? raw.ambiguity : 0));
  const alreadyClearBecause = raw.already_clear_because?.trim() || null;
  const missing = [...new Set(raw.missing.map(ambiguityType).filter((t): t is AmbiguityType => t !== null))];
  const verdict = readiness({ ready: raw.ready, readyReason: raw.ready_reason, missing, ambiguity, isPlaceholder: raw.draft_is_placeholder, alreadyClearBecause });
  return {
    ambiguity,
    ready: verdict.ready,
    readyReason: verdict.reason,
    mode: raw.mode,
    domain: raw.domain,
    scale: raw.scale,
    expert: raw.expert?.trim() || null,
    isPlaceholder: raw.draft_is_placeholder,
    missing,
    questions: raw.questions.slice(0, MAX_QUESTIONS).map((q) => ({
      type: ambiguityType(q.type) ?? 'scope',
      question: q.question.trim(),
      suggestions: q.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 4),
    })),
    alreadyClearBecause,
  };
}

export async function analyzeGaps(client: Anthropic, input: ImproveInput): Promise<GapReport> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: EFFORT, format: zodOutputFormat(GapReportSchema) },
    system: [{ type: 'text', text: GAP_ANALYSIS_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserContent(input) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new PromptButtonError('refusal', 'The model declined to analyze this prompt.');
  }
  if (!response.parsed_output) {
    throw new PromptButtonError('unknown', 'Gap analysis returned no parseable JSON.');
  }
  return normalize(response.parsed_output);
}
