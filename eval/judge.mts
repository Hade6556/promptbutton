/// <reference types="node" />
// Pairwise, position-swapped LLM judge over eval/results/latest.json.
// Each case is judged twice (A/B and B/A); the rewrite only "wins" if it wins both orders.
//
//   node --import tsx eval/judge.mts [path/to/run.json]
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MODEL } from '../src/llm/config';
import { lengthGuide } from '../src/llm/context';
import type { RunResult } from './run.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, 'results');
const inputPath = process.argv[2] ?? path.join(RESULTS_DIR, 'latest.json');
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);

const client = new Anthropic();

const VerdictSchema = z.object({
  winner: z.enum(['A', 'B', 'tie']),
  reason: z.string(),
});

const JUDGE_SYSTEM = `You compare two assistant responses given to the same user at the same point in a conversation. You are also told what the user actually wanted, which neither assistant could see in full.

Judge which response better serves what the user actually wanted:
- Does it do the right task, for the right audience, in the right format and length?
- Does it respect constraints the user cares about (explicit or in the intent)?
- Is it correct and complete for that intent? Penalise invented details that contradict the intent.
- Ignore differences in style or politeness unless the intent makes them matter.

A response that asks a reasonable clarifying question instead of guessing can still lose to a response that gets the task right. If both are equally good or equally off, answer "tie".`;

type Verdict = 'rewritten' | 'original' | 'tie';

async function judgeOnce(r: RunResult, aIsRewritten: boolean): Promise<'A' | 'B' | 'tie'> {
  const A = aIsRewritten ? r.responseRewritten : r.responseOriginal;
  const B = aIsRewritten ? r.responseOriginal : r.responseRewritten;
  const conversation = r.historyLength
    ? `(The conversation had ${r.historyLength} earlier messages; both responses had the same history.)`
    : '(This was the first message of the conversation.)';
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'medium', format: zodOutputFormat(VerdictSchema) },
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${conversation}\n\n<what_the_user_actually_wanted>\n${r.intent}\n</what_the_user_actually_wanted>\n\n<user_message_as_typed>\n${r.draft}\n</user_message_as_typed>\n\n<response_A>\n${A}\n</response_A>\n\n<response_B>\n${B}\n</response_B>`,
      },
    ],
  });
  return response.parsed_output?.winner ?? 'tie';
}

async function judge(r: RunResult): Promise<Verdict> {
  const [first, second] = await Promise.all([judgeOnce(r, true), judgeOnce(r, false)]);
  const rewrittenWonFirst = first === 'A';
  const rewrittenWonSecond = second === 'B';
  const originalWonFirst = first === 'B';
  const originalWonSecond = second === 'A';
  if (rewrittenWonFirst && rewrittenWonSecond) return 'rewritten';
  if (originalWonFirst && originalWonSecond) return 'original';
  return 'tie';
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

const run = JSON.parse(readFileSync(inputPath, 'utf8')) as { model: string; threshold: number; results: RunResult[] };
console.log(`Judging ${run.results.length} cases from ${path.relative(process.cwd(), inputPath)}…\n`);

const verdicts = await pool(run.results, CONCURRENCY, async (r) => {
  const verdict = await judge(r);
  console.log(`${r.id.padEnd(30)} ${verdict}`);
  return { ...r, verdict };
});

function rate(subset: typeof verdicts) {
  const wins = subset.filter((v) => v.verdict === 'rewritten').length;
  const losses = subset.filter((v) => v.verdict === 'original').length;
  const ties = subset.length - wins - losses;
  const pct = (n: number) => (subset.length ? `${Math.round((100 * n) / subset.length)}%` : '–');
  return { n: subset.length, wins, losses, ties, winRate: pct(wins), lossRate: pct(losses), tieRate: pct(ties) };
}

const all = rate(verdicts);
const long = rate(verdicts.filter((v) => v.historyLength >= 5));
const cold = rate(verdicts.filter((v) => v.historyLength === 0));
const ambiguous = verdicts.filter((v) => v.tag === 'ambiguous');
const clear = verdicts.filter((v) => v.tag === 'clear');
const askRecall = ambiguous.length ? Math.round((100 * ambiguous.filter((v) => v.asked).length) / ambiguous.length) : 0;
const falseAsk = clear.length ? Math.round((100 * clear.filter((v) => v.asked).length) / clear.length) : 0;
const lengthRatio = verdicts.reduce((s, v) => s + v.rewritten.length / Math.max(1, v.draft.length), 0) / Math.max(1, verdicts.length);

// Depth: did task-like drafts get a full master prompt, and did follow-ups/quick asks stay short?
const guideOf = (v: RunResult) => lengthGuide(v.draft.length + v.answers.reduce((n, a) => n + a.answer.length, 0), { mode: v.gap.mode, scale: v.gap.scale, depth: 'full' });
const masterCases = verdicts.filter((v) => guideOf(v).kind === 'master');
const conciseCases = verdicts.filter((v) => guideOf(v).kind === 'concise');
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);
const masterMedian = median(masterCases.map((v) => v.rewritten.length));
const underMin = masterCases.filter((v) => v.rewritten.length < guideOf(v).min).map((v) => v.id);
const overExpanded = conciseCases.filter((v) => v.rewritten.length > guideOf(v).max * 1.2).map((v) => v.id);

const row = (label: string, r: ReturnType<typeof rate>) => `| ${label} | ${r.n} | ${r.winRate} | ${r.tieRate} | ${r.lossRate} |`;
const summary = `# PromptButton eval — ${new Date().toISOString().slice(0, 10)}

Model: \`${run.model}\` · ask threshold: ${run.threshold} · judge: pairwise, position-swapped, intent-aware.

| Slice | n | Rewrite preferred | Tie | Original preferred |
|---|---|---|---|---|
${row('All cases', all)}
${row('Conversations with ≥5 earlier messages', long)}
${row('Cold first messages', cold)}

**Gate:** asked on ${askRecall}% of ambiguous drafts (recall) · asked on ${falseAsk}% of clear drafts (false-ask rate).
**Length:** rewrites are ${lengthRatio.toFixed(1)}× the draft on average.
**Depth:** ${masterCases.length} master prompts (median ${masterMedian} chars; under the ${masterCases[0] ? guideOf(masterCases[0]).min : 1200}-char floor: ${underMin.length ? underMin.join(', ') : 'none'}) · ${conciseCases.length} concise rewrites (over-expanded: ${overExpanded.length ? overExpanded.join(', ') : 'none'}).

| Case | Tag | Mode / scale / domain | Ambiguity | Asked | Chars | Verdict |
|---|---|---|---|---|---|---|
${verdicts.map((v) => `| ${v.id} | ${v.tag} | ${v.gap.mode} / ${v.gap.scale} / ${v.gap.domain} | ${v.gap.ambiguity.toFixed(2)} | ${v.asked ? `yes (${v.gap.questions.length})` : 'no'} | ${v.rewritten.length} | ${v.verdict} |`).join('\n')}
`;

writeFileSync(path.join(RESULTS_DIR, 'judged-latest.json'), JSON.stringify({ ...run, verdicts }, null, 2));
writeFileSync(path.join(RESULTS_DIR, 'summary.md'), summary);
console.log(`\n${summary}\nWritten to eval/results/summary.md`);
