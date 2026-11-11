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

// ── Blind pairwise judging, shared by the ablation ────────────────────────────────────────────────
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const VerdictSchema = z.object({ winner: z.enum(['A', 'B', 'tie']), reason: z.string() });

export const JUDGE_SYSTEM = `You compare two assistant responses given to the same user at the same point in a conversation. You are also told what the user actually wanted, which neither assistant could see in full.

Judge which response better serves what the user actually wanted:
- Does it do the right task, for the right audience, in the right format and length?
- Does it respect constraints the user cares about (explicit or in the intent)?
- Is it correct and complete for that intent? Penalise invented details that contradict the intent.
- Ignore differences in style or politeness unless the intent makes them matter.

A response that asks a reasonable clarifying question instead of guessing can still lose to a response that gets the task right. If both are equally good or equally off, answer "tie".`;

export interface JudgeContext {
  historyLength: number;
  intent: string;
  draft: string;
}

async function judgeOnce(client: Anthropic, ctx: JudgeContext, A: string, B: string): Promise<'A' | 'B' | 'tie'> {
  const conversation = ctx.historyLength
    ? `(The conversation had ${ctx.historyLength} earlier messages; both responses had the same history.)`
    : '(This was the first message of the conversation.)';
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'medium', format: zodOutputFormat(VerdictSchema) },
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${conversation}\n\n<what_the_user_actually_wanted>\n${ctx.intent}\n</what_the_user_actually_wanted>\n\n<user_message_as_typed>\n${ctx.draft}\n</user_message_as_typed>\n\n<response_A>\n${A}\n</response_A>\n\n<response_B>\n${B}\n</response_B>`,
      },
    ],
  });
  return response.parsed_output?.winner ?? 'tie';
}

/** Judged twice with the positions swapped. A side wins only if it wins in both orders; anything else is a tie. */
export async function judgePair(client: Anthropic, ctx: JudgeContext, first: string, second: string): Promise<'first' | 'second' | 'tie'> {
  const [ab, ba] = await Promise.all([judgeOnce(client, ctx, first, second), judgeOnce(client, ctx, second, first)]);
  if (ab === 'A' && ba === 'B') return 'first';
  if (ab === 'B' && ba === 'A') return 'second';
  return 'tie';
}

/** Wilson score interval for a proportion, as percentages. Honest about small samples in a way a bare percentage is not. */
export function wilson(wins: number, n: number, z = 1.96): { rate: number; low: number; high: number } {
  if (n === 0) return { rate: 0, low: 0, high: 0 };
  const p = wins / n;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return { rate: Math.round(p * 100), low: Math.round((centre - half) * 100), high: Math.round((centre + half) * 100) };
}
