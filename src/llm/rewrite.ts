import type { ImproveInput, UserAnswer } from '../messaging';
import { EFFORT, MODEL, PromptButtonError, getClient } from './client';
import { serializeInput } from './context';
import { REWRITE_SYSTEM } from './prompts';

/** Strips a code fence or surrounding quotes if the model added them despite instructions. */
function cleanOutput(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence?.[1]) out = fence[1].trim();
  if (out.length > 2 && /^["“]/.test(out) && /["”]$/.test(out)) out = out.slice(1, -1).trim();
  return out;
}

export async function rewritePrompt(input: ImproveInput, answers: UserAnswer[]): Promise<string> {
  const client = await getClient();

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    system: [{ type: 'text', text: REWRITE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: serializeInput(input, answers) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new PromptButtonError('refusal', 'The model declined to rewrite this prompt.');
  }

  const text = response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const cleaned = cleanOutput(text);
  if (!cleaned) throw new PromptButtonError('unknown', 'The model returned an empty rewrite.');
  return cleaned;
}
