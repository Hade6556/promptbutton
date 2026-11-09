import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ImproveInput, ReplyAssist } from '../messaging';
import { EFFORT, MODEL, PromptButtonError } from './config';
import { buildUserContent } from './context';
import { REPLY_SYSTEM } from './prompts';

const ReplyAssistSchema = z.object({
  summary: z.string().describe('At most two short sentences in plain words: what the assistant said/found and what it needs from the user'),
  asks: z.array(z.string()).describe('The questions or decisions the assistant is asking the user for, one short line each; empty if none'),
  replies: z.array(
    z.object({
      label: z.string().describe('2–5 word chip label'),
      text: z.string().describe('The complete reply, ready to send, in the user\'s voice and language'),
    }),
  ),
});

export const MAX_REPLIES = 4;

/** Summarises the assistant's latest message and proposes replies the user could send. */
export async function suggestReplies(client: Anthropic, input: ImproveInput): Promise<ReplyAssist> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: EFFORT, format: zodOutputFormat(ReplyAssistSchema) },
    system: [{ type: 'text', text: REPLY_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserContent({ ...input, draft: input.draft || '(empty — the user has not typed anything yet)' }) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new PromptButtonError('refusal', 'The model declined to summarise this conversation.');
  }
  const raw = response.parsed_output;
  if (!raw) throw new PromptButtonError('unknown', 'Reply suggestions returned no parseable JSON.');
  return {
    summary: raw.summary.trim(),
    asks: raw.asks.map((a) => a.trim()).filter(Boolean).slice(0, 4),
    replies: raw.replies
      .map((r) => ({ label: r.label.trim(), text: r.text.trim() }))
      .filter((r) => r.label && r.text)
      .slice(0, MAX_REPLIES),
  };
}
