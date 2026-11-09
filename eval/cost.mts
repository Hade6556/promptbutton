/// <reference types="node" />
// What does one press cost? Runs the real gap-analysis + rewrite calls once (text-only, like the
// extension) and once with a window screenshot (like the desktop app), and prints token usage.
//
//   node --env-file-if-exists=.env --import tsx eval/cost.mts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { EFFORT, MODEL } from '../src/llm/config';
import { buildUserContent } from '../src/llm/context';
import { GAP_ANALYSIS_SYSTEM, REWRITE_SYSTEM } from '../src/llm/prompts';
import type { GapReport, ImproveInput } from '../src/messaging';

const client = new Anthropic();

// claude-opus-5-5 rate card ($ per million tokens): input 4, output 20, cache read 0.20,
// 5-minute cache write 1.25× input. Override with env if the card changes.
const PRICE = {
  input: Number(process.env.PRICE_INPUT ?? 4),
  output: Number(process.env.PRICE_OUTPUT ?? 20),
  cacheWrite: Number(process.env.PRICE_CACHE_WRITE ?? 5),
  cacheRead: Number(process.env.PRICE_CACHE_READ ?? 0.2),
};

type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

function dollars(u: Usage): number {
  const cw = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + cw * PRICE.cacheWrite + cr * PRICE.cacheRead) / 1e6;
}

function show(label: string, u: Usage) {
  const cw = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;
  console.log(`${label.padEnd(28)} in ${String(u.input_tokens).padStart(6)}  cache-write ${String(cw).padStart(6)}  cache-read ${String(cr).padStart(6)}  out ${String(u.output_tokens).padStart(5)}   $${dollars(u).toFixed(4)}`);
  return dollars(u);
}

// Minimal schema: we only need usage, but structured output must still parse.
const Gap = z.object({
  mode: z.enum(['follow_up', 'request', 'brain_dump']),
  domain: z.string(),
  scale: z.enum(['deliverable', 'quick']),
  expert: z.string().nullable(),
  ambiguity: z.number(),
  missing: z.array(z.string()),
  questions: z.array(z.object({ type: z.string(), question: z.string(), suggestions: z.array(z.string()) })),
  already_clear_because: z.string().nullable(),
});

async function press(label: string, input: ImproveInput) {
  console.log(`\n━━━ ${label} ━━━`);
  const gap = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: EFFORT, format: zodOutputFormat(Gap) },
    system: [{ type: 'text', text: GAP_ANALYSIS_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserContent(input) }],
  });
  const g = gap.parsed_output!;
  const report = { mode: g.mode, domain: g.domain, scale: g.scale, expert: g.expert } as Pick<GapReport, 'mode' | 'domain' | 'scale' | 'expert'>;
  const a = show('gap analysis', gap.usage);

  const rewrite = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    system: [{ type: 'text', text: REWRITE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserContent(input, [], { ...report, depth: 'full' }) }],
  });
  const b = show('rewrite', rewrite.usage);
  const chars = rewrite.content.filter((c) => c.type === 'text').reduce((n, c) => n + (c as { text: string }).text.length, 0);
  console.log(`${'total per press'.padEnd(28)} $${(a + b).toFixed(4)}   (rewrite ${chars} chars, ${g.mode}/${g.scale}/${g.domain})`);
  return a + b;
}

function screenshot(): { mediaType: 'image/jpeg'; data: string } {
  const file = path.join(os.tmpdir(), `pb-cost-${Date.now()}.jpg`);
  // A typical app window region on a laptop display.
  execFileSync('screencapture', ['-x', '-t', 'jpg', '-R', '0,0,1440,900', file]);
  const data = readFileSync(file);
  unlinkSync(file);
  console.log(`screenshot: ${(data.length / 1024).toFixed(0)} KB jpeg (1440×900 points)`);
  return { mediaType: 'image/jpeg', data: data.toString('base64') };
}

console.log(`Model ${MODEL}, effort ${EFFORT}. Prices $/M: in ${PRICE.input}, out ${PRICE.output}, cache write ${PRICE.cacheWrite}, cache read ${PRICE.cacheRead}\n(First call of each kind pays the cache write for the system prompt; later calls read it.)`);

const text = await press('extension: text history, one-line draft', {
  site: 'claude',
  history: [
    { role: 'user', text: 'I run a small invoicing tool for freelancers called Ledgerly. We have about 120 paying users.' },
    { role: 'assistant', text: 'Got it — Ledgerly, invoicing for freelancers, 120 paying users. What would you like to work on?' },
  ],
  draft: 'i want to build a landing page',
});

const shot = screenshot();
const desktop = await press('desktop: screenshot + one-line draft', { site: 'Code', history: [], draft: 'i want to build a landing page', screenshot: shot });

const quick = await press('quick ask (no master prompt)', { site: 'chatgpt', history: [], draft: 'convert 72°F to Celsius' });

console.log(`\nSummary: extension press $${text.toFixed(3)} · desktop press (with screenshot) $${desktop.toFixed(3)} · quick ask $${quick.toFixed(3)}`);
console.log('Add one gap-analysis-sized call for "What should I say?" (reply assist) and one rewrite-sized call per refine.');
