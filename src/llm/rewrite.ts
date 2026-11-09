import type Anthropic from '@anthropic-ai/sdk';
import type { ImproveInput, UserAnswer } from '../messaging';
import { EFFORT, MODEL, PromptButtonError } from './config';
import { serializeInput } from './context';
import { REWRITE_SYSTEM } from './prompts';

/** Strips a code fence or surrounding quotes if the model added them despite instructions. */
export function cleanOutput(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence?.[1]) out = fence[1].trim();
  if (out.length > 2 && /^["“]/.test(out) && /["”]$/.test(out)) out = out.slice(1, -1).trim();
  return out;
}

function params(input: ImproveInput, answers: UserAnswer[]) {
  return {
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01' as const],
    fallbacks: 'default' as const,
    output_config: { effort: EFFORT },
    system: [{ type: 'text' as const, text: REWRITE_SYSTEM, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: serializeInput(input, answers) }],
  };
}

/**
 * Rewrites the draft. With `onDelta` the response is streamed and each text delta is
 * reported as it arrives; the returned string is always the cleaned full text.
 */
export async function rewritePrompt(
  client: Anthropic,
  input: ImproveInput,
  answers: UserAnswer[],
  onDelta?: (text: string) => void,
): Promise<string> {
  let response: Anthropic.Beta.BetaMessage;
  if (onDelta) {
    const stream = client.beta.messages.stream(params(input, answers));
    stream.on('text', (delta) => onDelta(delta));
    response = await stream.finalMessage();
  } else {
    response = await client.beta.messages.create(params(input, answers));
  }

  if (response.stop_reason === 'refusal') {
    throw new PromptButtonError('refusal', 'The model declined to rewrite this prompt.');
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const cleaned = cleanOutput(text);
  if (!cleaned) throw new PromptButtonError('unknown', 'The model returned an empty rewrite.');
  return cleaned;
}
