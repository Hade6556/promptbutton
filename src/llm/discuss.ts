// The panel's chat about the prompt on screen. The user says something about it; the editor either
// agrees and revises, defends the prompt with a concrete reason, or answers a question. The revise
// itself is done by the rewriter (revision mode), from the instruction returned here.
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ChatTurn, DiscussInput, Discussion } from '../messaging';
import { EFFORT, MODEL, PromptButtonError } from './config';
import { playbookBlock } from './domains';
import { DISCUSS_SYSTEM } from './prompts';

const DiscussionSchema = z.object({
  action: z.enum(['revise', 'defend', 'answer']),
  reply: z.string().describe('What the user reads: one to three sentences'),
  instruction: z.string().describe('revise: the exact edit for the reviser. Empty for defend and answer'),
});

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** How many times in a row the editor has already defended the prompt (since its last revise). */
export function defencesInARow(turns: readonly ChatTurn[]): number {
  let count = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    if (turn.role !== 'assistant') continue;
    if (turn.action === 'defend') count++;
    else if (turn.action === 'revise') break;
  }
  return count;
}

export function serializeDiscuss(input: DiscussInput): string {
  const parts = [`<app>${esc(input.app)}</app>`];
  if (input.draft.trim()) parts.push(`<draft>\n${esc(clip(input.draft, 2000))}\n</draft>`);
  if (input.answers?.length) parts.push(`<user_answers>\n${input.answers.map((a) => `Q: ${esc(a.question)}\nA: ${esc(a.answer)}`).join('\n')}\n</user_answers>`);
  if (input.domain) parts.push(playbookBlock(input.domain));
  parts.push(`<prompt>\n${esc(clip(input.prompt, 6000))}\n</prompt>`);
  if (input.turns.length) {
    const lines = input.turns.slice(-8).map((t) => `${t.role === 'user' ? 'User' : `You${t.action ? ` (${t.action})` : ''}`}: ${esc(clip(t.text, 600))}`);
    parts.push(`<chat>\n${lines.join('\n')}\n</chat>`);
  }
  parts.push(`<message>${esc(input.message)}</message>`);
  return parts.join('\n\n');
}

/**
 * Makes the model's decision safe to act on:
 * - a second pushback always wins: after one defence, a further defence becomes a revise;
 * - a revise always carries an instruction (the user's own words if the model gave none);
 * - a reply that only echoes the user, or a defence with no reason in it, is not shown as is.
 */
export function settle(raw: { action: Discussion['action']; reply: string; instruction: string }, input: Pick<DiscussInput, 'message' | 'turns'>): Discussion {
  let action = raw.action;
  let reply = raw.reply.trim();
  let instruction = raw.instruction.trim();
  const echo = !reply || squash(reply) === squash(input.message);

  if (action === 'defend' && defencesInARow(input.turns) >= 1) {
    action = 'revise';
    reply = 'Understood. I made my case; it is your prompt, so I am changing it.';
    instruction = instruction || input.message.trim();
  }
  // A defence has to say why: an acknowledgement alone ("I understand, trust the process") is not one.
  if (action === 'defend' && (echo || squash(reply).split(' ').length < 12)) {
    action = 'revise';
    reply = 'Fair point. Changing it.';
  }
  if (action === 'answer' && echo) {
    action = 'revise';
    reply = 'Changing it.';
  }
  if (action === 'revise') {
    if (!instruction) instruction = input.message.trim();
    if (echo) reply = 'Changing it.';
  } else {
    instruction = '';
  }
  return { action, reply: clip(reply, 600), instruction };
}

export async function discussPrompt(client: Anthropic, input: DiscussInput): Promise<Discussion> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    output_config: { effort: EFFORT, format: zodOutputFormat(DiscussionSchema) },
    system: [{ type: 'text', text: DISCUSS_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: serializeDiscuss(input) }],
  });
  if (response.stop_reason === 'refusal') throw new PromptButtonError('refusal', 'The model declined to discuss this prompt.');
  if (!response.parsed_output) throw new PromptButtonError('unknown', 'The reply could not be read.');
  return settle(response.parsed_output, input);
}
