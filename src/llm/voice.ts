// Voice understanding: turns a speech transcript into an action for the box, read against what the
// box is showing (a master prompt, a question, chat replies, or nothing). The renderer applies the
// returned intent through the same functions the keyboard uses.
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { VoiceCommand, VoiceContext, VoiceIntent } from '../messaging';
import { EFFORT, MODEL, PromptButtonError } from './config';
import { VOICE_SYSTEM } from './prompts';

const COMMANDS = ['insert', 'undo', 'skip', 'cancel', 'start_over', 'rescan'] as const satisfies readonly VoiceCommand[];

const VoiceIntentSchema = z.object({
  intent: z.enum(['edit_prompt', 'answer_questions', 'reply', 'new_draft', 'command']),
  command: z.enum(COMMANDS).nullable(),
  instruction: z.string().describe('edit_prompt: the change, as a clean written instruction; otherwise empty'),
  text: z.string().describe('new_draft / reply / a single answer: clean written text; otherwise empty'),
  answers: z.array(z.object({ index: z.number(), answer: z.string() })).describe('answer_questions: answers by question index'),
  pick: z.number().nullable().describe('0-based index of a chosen on-screen suggestion or reply, else null'),
  heard: z.string().describe('3–8 words for the "Heard:" line'),
});

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function serializeVoice(ctx: VoiceContext): string {
  const parts = [`<phase>${ctx.phase}</phase>`, `<app>${esc(ctx.app)}</app>`];
  if (ctx.draft) parts.push(`<original_draft>${esc(clip(ctx.draft, 1500))}</original_draft>`);
  if (ctx.questions?.length) {
    const qs = ctx.questions
      .map((q) => `<question index="${q.index}"${q.index === ctx.current ? ' on_screen="true"' : ''}>${esc(q.question)}${q.suggestions.length ? `\n<suggestions>${q.suggestions.map((s, i) => `${i}: ${esc(s)}`).join(' | ')}</suggestions>` : ''}</question>`)
      .join('\n');
    parts.push(`<questions>\n${qs}\n</questions>`);
  }
  if (ctx.rewrite) parts.push(`<rewrite_on_screen>\n${esc(clip(ctx.rewrite, 4000))}\n</rewrite_on_screen>`);
  if (ctx.summary) parts.push(`<chat_summary>${esc(ctx.summary)}</chat_summary>`);
  if (ctx.replies?.length) parts.push(`<suggested_replies>\n${ctx.replies.map((r) => `${r.index}: ${esc(r.label)} — ${esc(r.text)}`).join('\n')}\n</suggested_replies>`);
  if (ctx.typed.trim()) parts.push(`<typed>${esc(ctx.typed)}</typed>`);
  parts.push(`<transcript>${esc(ctx.transcript)}</transcript>`);
  return parts.join('\n\n');
}

/** Short spoken commands that need no model call. */
const FAST: [RegExp, VoiceCommand, string][] = [
  [/^(please )?(insert|put it in|send it|use (it|that|this)|paste it|go ahead and insert)( it| that)?( please)?$/, 'insert', 'Insert'],
  [/^(undo|undo that|go back|put it back|revert( that)?)( please)?$/, 'undo', 'Undo'],
  [/^(skip|skip (it|that|this|the questions)|just skip( it)?)( please)?$/, 'skip', 'Skip the questions'],
  [/^(cancel|close|close it|never ?mind|stop)( please)?$/, 'cancel', 'Close'],
  [/^(start over|start again|from scratch)( please)?$/, 'start_over', 'Start over'],
  [/^(scan again|look again|rescan|refresh)( please)?$/, 'rescan', 'Scan again'],
];

export function fastIntent(transcript: string): VoiceIntent | null {
  const t = transcript
    .toLowerCase()
    .replace(/[.,!?…]/g, '')
    .replace(/^(um+|uh+|ok(ay)?|so|right|perfect|great|cool|nice|yeah|yes)\s+/g, '')
    .replace(/^(um+|uh+|ok(ay)?|so|right|perfect|great|cool|nice|yeah|yes)\s+/g, '')
    .trim();
  for (const [re, command, heard] of FAST) {
    if (re.test(t)) return { intent: 'command', command, instruction: '', text: '', answers: [], pick: null, heard };
  }
  return null;
}

export async function interpretVoice(client: Anthropic, ctx: VoiceContext): Promise<VoiceIntent> {
  const fast = fastIntent(ctx.transcript);
  if (fast && !ctx.typed.trim()) return fast;

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1200,
    output_config: { effort: EFFORT, format: zodOutputFormat(VoiceIntentSchema) },
    system: [{ type: 'text', text: VOICE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: serializeVoice(ctx) }],
  });
  if (response.stop_reason === 'refusal') throw new PromptButtonError('refusal', 'The model declined to interpret this.');
  const raw = response.parsed_output;
  if (!raw) throw new PromptButtonError('unknown', 'Voice interpretation returned no parseable JSON.');
  return {
    intent: raw.intent,
    command: raw.intent === 'command' ? raw.command : null,
    instruction: raw.instruction.trim(),
    text: raw.text.trim(),
    answers: raw.answers.map((a) => ({ index: Math.round(a.index), answer: a.answer.trim() })).filter((a) => a.answer),
    pick: typeof raw.pick === 'number' && Number.isFinite(raw.pick) ? Math.round(raw.pick) : null,
    heard: raw.heard.trim(),
  };
}
