/// <reference types="node" />
// Runs the PromptButton pipeline on every eval case and collects assistant responses
// for the original draft and for the rewrite. Judging happens in judge.mts.
//
//   node --import tsx eval/run.mts            # all cases
//   EVAL_ONLY=cold-blog,deep-sql-fix node --import tsx eval/run.mts
//
// Needs ANTHROPIC_API_KEY (or an `ant auth login` profile). Roughly 5 calls per case.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ASK_THRESHOLD, MODEL } from '../src/llm/config';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';
import type { GapReport, HistoryMessage, ImproveInput, UserAnswer } from '../src/messaging';
import { CASES, type CaseTag, type EvalCase } from './cases';

export interface RunResult {
  id: string;
  tag: CaseTag;
  historyLength: number;
  draft: string;
  intent: string;
  gap: GapReport;
  asked: boolean;
  answers: UserAnswer[];
  rewritten: string;
  responseOriginal: string;
  responseRewritten: string;
  ms: { gap: number; answers: number; rewrite: number; responses: number };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, 'results');
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
const only = process.env.EVAL_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

const client = new Anthropic();

const AnswersSchema = z.object({
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
});

const SIMULATED_USER_SYSTEM = `You are role-playing the user in a chat with an AI assistant. You are shown what the user actually wants (their private intent) and the clarifying questions the assistant's helper asked before rewriting the user's message.

Answer every question the way this user would: one short phrase or sentence each, consistent with the intent. If the intent does not settle a question, choose something specific and reasonable rather than "whatever you think". Do not paste the intent text; answer naturally.`;

async function simulateUser(c: EvalCase, questions: GapReport['questions']): Promise<UserAnswer[]> {
  if (questions.length === 0) return [];
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(AnswersSchema) },
    system: SIMULATED_USER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `<intent>\n${c.intent}\n</intent>\n\n<questions>\n${questions.map((q, i) => `${i + 1}. ${q.question} (suggestions: ${q.suggestions.join(' | ')})`).join('\n')}\n</questions>`,
      },
    ],
  });
  return response.parsed_output?.answers ?? [];
}

async function respond(history: HistoryMessage[], prompt: string): Promise<string> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 3000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    messages: [...history.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') return '[refused]';
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function runCase(c: EvalCase): Promise<RunResult> {
  const input: ImproveInput = { site: c.site, history: c.history, draft: c.draft };
  const ms = { gap: 0, answers: 0, rewrite: 0, responses: 0 };

  let t = performance.now();
  const gap = await analyzeGaps(client, input);
  ms.gap = Math.round(performance.now() - t);
  const asked = gap.questions.length > 0 && gap.ambiguity >= ASK_THRESHOLD;

  t = performance.now();
  const answers = asked ? await simulateUser(c, gap.questions) : [];
  ms.answers = Math.round(performance.now() - t);

  t = performance.now();
  const rewritten = await rewritePrompt(client, input, answers, undefined, { mode: gap.mode });
  ms.rewrite = Math.round(performance.now() - t);

  t = performance.now();
  const [responseOriginal, responseRewritten] = await Promise.all([respond(c.history, c.draft), respond(c.history, rewritten)]);
  ms.responses = Math.round(performance.now() - t);

  return {
    id: c.id,
    tag: c.tag,
    historyLength: c.history.length,
    draft: c.draft,
    intent: c.intent,
    gap,
    asked,
    answers,
    rewritten,
    responseOriginal,
    responseRewritten,
    ms,
  };
}

async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
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

const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
console.log(`Running ${cases.length} cases with concurrency ${CONCURRENCY} on ${MODEL}…\n`);

const results = await pool(cases, CONCURRENCY, async (c) => {
  try {
    const r = await runCase(c);
    const gate = r.asked ? `asked ${r.gap.questions.length}` : 'direct';
    const flag = (c.tag === 'clear') === r.asked ? '  ⚠ gate mismatch' : '';
    console.log(`${r.id.padEnd(30)} ${c.tag.padEnd(9)} ambiguity ${r.gap.ambiguity.toFixed(2)}  ${gate.padEnd(8)} ${(r.ms.gap + r.ms.answers + r.ms.rewrite) / 1000}s${flag}`);
    return r;
  } catch (error) {
    console.error(`${c.id}: FAILED`, error instanceof Error ? error.message : error);
    return null;
  }
});

const ok = results.filter((r): r is RunResult => r !== null);
mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const payload = JSON.stringify({ model: MODEL, threshold: ASK_THRESHOLD, ranAt: new Date().toISOString(), results: ok }, null, 2);
writeFileSync(path.join(RESULTS_DIR, `run-${stamp}.json`), payload);
writeFileSync(path.join(RESULTS_DIR, 'latest.json'), payload);
console.log(`\n${ok.length}/${cases.length} cases done → eval/results/latest.json. Next: node --import tsx eval/judge.mts`);
