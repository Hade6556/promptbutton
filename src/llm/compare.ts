import type Anthropic from '@anthropic-ai/sdk';
import { MODEL, PromptButtonError } from './config';

/**
 * Blind "try both": the same model answers the user's own draft and First Try's prompt, under the same
 * conditions, so the person can pick the better answer before being told which was which.
 *
 * Fair by construction: both requests are identical except for the text the user would send. No system
 * prompt (a chat app's plain answer), the same model, the same effort and the same length cap. When an
 * answer reaches the cap it is marked, so a longer answer is not mistaken for a finished one.
 */

/** The longest either answer may be. Both get the same cap, so neither is cut shorter than the other. */
export const ANSWER_TOKENS = 1600;

export interface BlindAnswer {
  text: string;
  /** It reached ANSWER_TOKENS before finishing. */
  cut: boolean;
}

function request(text: string) {
  return {
    model: MODEL,
    max_tokens: ANSWER_TOKENS,
    output_config: { effort: 'medium' as const },
    messages: [{ role: 'user' as const, content: text }],
  };
}

async function answer(client: Anthropic, text: string, onDelta: (delta: string) => void, signal?: AbortSignal): Promise<BlindAnswer> {
  const stream = client.messages.stream(request(text), { signal });
  stream.on('text', onDelta);
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new PromptButtonError('refusal', 'The model declined to answer one of the two.');
  const out = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!out) throw new PromptButtonError('unknown', 'One of the two answers came back empty.');
  return { text: out, cut: response.stop_reason === 'max_tokens' };
}

/**
 * Both answers, at the same time. `onDelta(slot, text)` reports streamed text per slot; which slot holds
 * which answer is decided by the caller (`draftSlot`) and never sent to the screen until the pick.
 */
export async function answerBoth(
  client: Anthropic,
  draft: string,
  prompt: string,
  draftSlot: 0 | 1,
  onDelta: (slot: 0 | 1, delta: string) => void,
  signal?: AbortSignal,
): Promise<[BlindAnswer, BlindAnswer]> {
  const promptSlot: 0 | 1 = draftSlot === 0 ? 1 : 0;
  const [fromDraft, fromPrompt] = await Promise.all([
    answer(client, draft, (d) => onDelta(draftSlot, d), signal),
    answer(client, prompt, (d) => onDelta(promptSlot, d), signal),
  ]);
  return draftSlot === 0 ? [fromDraft, fromPrompt] : [fromPrompt, fromDraft];
}
