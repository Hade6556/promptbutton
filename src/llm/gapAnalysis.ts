import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AmbiguityType, GapReport, ImproveInput } from '../messaging';
import { EFFORT, MODEL, PromptButtonError } from './config';
import { serializeInput } from './context';
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
const GapReportSchema = z.object({
  ambiguity: z.number().describe('0 = fully specified, 1 = the assistant would have to guess the core intent'),
  missing: z.array(z.enum(AMBIGUITY_TYPES)).describe('Ambiguity types that pass all three tests'),
  questions: z.array(
    z.object({
      type: z.enum(AMBIGUITY_TYPES),
      question: z.string(),
      suggestions: z.array(z.string()).describe('2–4 realistic tappable answers'),
    }),
  ),
  already_clear_because: z.string().nullable(),
});

export const MAX_QUESTIONS = 3;

function normalize(raw: z.infer<typeof GapReportSchema>): GapReport {
  return {
    ambiguity: Math.min(1, Math.max(0, Number.isFinite(raw.ambiguity) ? raw.ambiguity : 0)),
    missing: raw.missing,
    questions: raw.questions.slice(0, MAX_QUESTIONS).map((q) => ({
      type: q.type,
      question: q.question.trim(),
      suggestions: q.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 4),
    })),
    alreadyClearBecause: raw.already_clear_because?.trim() || null,
  };
}

export async function analyzeGaps(client: Anthropic, input: ImproveInput): Promise<GapReport> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: EFFORT, format: zodOutputFormat(GapReportSchema) },
    system: [{ type: 'text', text: GAP_ANALYSIS_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: serializeInput(input) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new PromptButtonError('refusal', 'The model declined to analyze this prompt.');
  }
  if (!response.parsed_output) {
    throw new PromptButtonError('unknown', 'Gap analysis returned no parseable JSON.');
  }
  return normalize(response.parsed_output);
}
