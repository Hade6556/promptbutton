/// <reference types="node" />
// Shared by run.mts and compare.mts: the "assistant answers the prompt" call and a small pool.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from '../src/llm/config';
import type { HistoryMessage } from '../src/messaging';

export interface Answer {
  text: string;
  /** end_turn normally; max_tokens means the answer was cut off and the judge should know. */
  stopReason: string;
}

/**
 * The target assistant answering a prompt with the same history. Streaming with a high cap: a
 * master prompt for a landing page or a runbook legitimately needs several thousand output tokens,
 * and on this model thinking counts toward max_tokens (a 3,000 cap left some answers empty).
 */
export async function respond(client: Anthropic, history: HistoryMessage[], prompt: string): Promise<Answer> {
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [...history.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: prompt }],
    })
    .finalMessage();
  if (response.stop_reason === 'refusal') return { text: '[refused]', stopReason: 'refusal' };
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return { text, stopReason: response.stop_reason ?? 'unknown' };
}

export async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}
