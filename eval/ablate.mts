/// <reference types="node" />
// Three arms on every eval case, to answer two different questions with one run:
//   1. Does the rewrite beat the raw draft?            raw        vs  rewrite with the knowledge base
//   2. Does the knowledge base add anything?           rewrite without the knowledge base  vs  with it
// Each pair is judged blind and position-swapped. The summary gives a win rate with a 95% interval,
// which is the form a number has to be in before it goes on the site.
//
//   npm run eval:ablate                         # all cases
//   EVAL_ONLY=cold-blog,deep-sql-fix npm run eval:ablate
//   EVAL_LIMIT=5 npm run eval:ablate            # the first five, for a smoke test
//   EVAL_SET=hand npm run eval:ablate           # only the hand-written cases (default: the reviewed set, see cases.reviewed.ts)
//   EVAL_DROP=<technique-id> npm run eval:ablate  # one technique's own effect: the full set against the set without it
//
// About 11 model calls per case (classification, simulated answers, two rewrites, three answers, four
// judgements). Check the cost of a small run before starting a full one.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ASK_THRESHOLD, MODEL } from '../src/llm/config';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { KB_VERSION, selectTechniques } from '../src/llm/kb';
import { rewritePrompt } from '../src/llm/rewrite';
import type { GapReport, ImproveInput, UserAnswer } from '../src/messaging';
import { CASES, type EvalCase } from './cases';
import { parseEvalSet, selectCases } from './cases.reviewed';
import { judgePair, pool, respond, wilson } from './lib.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, 'results');
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
const only = process.env.EVAL_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const limit = Number(process.env.EVAL_LIMIT ?? 0);
const drop = process.env.EVAL_DROP?.trim() || null;
const handWritten = new Set(CASES.map((c) => c.id));
const client = new Anthropic();

const AnswersSchema = z.object({ answers: z.array(z.object({ question: z.string(), answer: z.string() })) });

async function simulateUser(c: EvalCase, questions: GapReport['questions']): Promise<UserAnswer[]> {
  if (questions.length === 0) return [];
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(AnswersSchema) },
    system: 'You are role-playing the user in a chat with an AI assistant. You are shown what the user actually wants and the clarifying questions asked before sending. Answer every question the way this user would: one short phrase or sentence each, consistent with the intent. If the intent does not settle a question, choose something specific and reasonable.',
    messages: [{ role: 'user', content: `<intent>\n${c.intent}\n</intent>\n\n<questions>\n${questions.map((q, i) => `${i + 1}. ${q.question} (suggestions: ${q.suggestions.join(' | ')})`).join('\n')}\n</questions>` }],
  });
  return response.parsed_output?.answers ?? [];
}

const InventedSchema = z.object({ invented: z.array(z.string()).describe('Each stated fact in the prompt that has no basis in the material. Empty when there is none.') });

/** "Nothing made up", checked: facts in the rewrite that came from nowhere. Defaults marked (assumed) and [placeholders] are allowed; that is what they are for. */
async function inventedFacts(c: EvalCase, answers: UserAnswer[], rewritten: string): Promise<string[]> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(InventedSchema) },
    system: 'You check a rewritten prompt against the material it was written from. List every specific fact the prompt states as given (a name, number, date, place, product detail, preference of the user) that appears nowhere in the material. Do not list: anything marked (assumed), anything in [square-bracket placeholders], general expertise such as what a good landing page contains, quality criteria, or instructions about format. Only facts presented as true about the user or their situation.',
    messages: [{ role: 'user', content: `<material>\n<conversation>\n${c.history.map((m) => `${m.role}: ${m.text}`).join('\n') || '(none)'}\n</conversation>\n<draft>\n${c.draft}\n</draft>\n<answers>\n${answers.map((a) => `${a.question} → ${a.answer}`).join('\n') || '(none)'}\n</answers>\n</material>\n\n<rewritten_prompt>\n${rewritten}\n</rewritten_prompt>` }],
  });
  return response.parsed_output?.invented ?? [];
}

type Verdict = 'first' | 'second' | 'tie';
interface Row {
  id: string;
  domain: string;
  scale: string;
  techniques: string[];
  chars: { without: number; with: number };
  /** `second` means the rewrite with the knowledge base won. */
  rawVsKb: Verdict;
  /** `second` means the knowledge base won; null when no technique applied, so the two rewrites share an input. */
  plainVsKb: Verdict | null;
  cut: number;
  /** Facts in the rewrite with no basis in the draft, the conversation or the answers. */
  invented: string[];
}

async function runCase(c: EvalCase): Promise<Row> {
  const input: ImproveInput = { site: c.site, history: c.history, draft: c.draft };
  const gap = await analyzeGaps(client, input);
  const asked = gap.questions.length > 0 && gap.ambiguity >= ASK_THRESHOLD;
  const answers = asked ? await simulateUser(c, gap.questions) : [];
  const options = { mode: gap.mode, domain: gap.domain, scale: gap.scale, expert: gap.expert, depth: 'full' as const };
  // Techniques are only injected into master prompts, so a quick ask or a follow-up has nothing to ablate.
  const techniques = gap.scale === 'deliverable' && gap.mode !== 'follow_up' ? selectTechniques({ domain: gap.domain, mode: gap.mode, scale: gap.scale, site: c.site }).map((t) => t.id) : [];
  const withKb = await rewritePrompt(client, input, answers, undefined, options);
  // With EVAL_DROP the comparison is narrower: everything against everything but one technique, on the cases that would use it.
  const compare = drop ? techniques.includes(drop) : techniques.length > 0;
  const without = compare ? await rewritePrompt(client, input, answers, undefined, drop ? { ...options, kbHoldout: drop } : { ...options, kb: false }) : withKb;

  const [raw, plain, kb] = await Promise.all([
    respond(client, c.history, c.draft),
    compare ? respond(client, c.history, without) : Promise.resolve(null),
    respond(client, c.history, withKb),
  ]);
  const ctx = { historyLength: c.history.length, intent: c.intent, draft: c.draft };
  const [rawVsKb, plainVsKb, invented] = await Promise.all([
    judgePair(client, ctx, raw.text, kb.text),
    plain ? judgePair(client, ctx, plain.text, kb.text) : Promise.resolve(null),
    inventedFacts(c, answers, withKb),
  ]);
  return {
    id: c.id, domain: gap.domain, scale: gap.scale, techniques,
    chars: { without: without.length, with: withKb.length },
    rawVsKb, plainVsKb,
    cut: [raw, plain, kb].filter((r) => r && r.stopReason !== 'end_turn').length,
    invented,
  };
}

// The hand-written cases plus the model-written ones that passed review; the 19 rejected drafts never count.
const pool_ = selectCases(parseEvalSet(process.env.EVAL_SET ?? 'reviewed'));
let cases = only ? pool_.filter((c) => only.includes(c.id)) : pool_;
if (limit) cases = cases.slice(0, limit);
console.log(`Ablation over ${cases.length} cases on ${MODEL}, knowledge base ${KB_VERSION}, concurrency ${CONCURRENCY}…\n`);

const done = (await pool(cases, CONCURRENCY, async (c) => {
  try {
    const row = await runCase(c);
    console.log(`${row.id.padEnd(30)} ${row.domain.padEnd(18)} raw→kb: ${row.rawVsKb.padEnd(6)}  plain→kb: ${row.plainVsKb ?? 'n/a'}  (${row.techniques.length} techniques)`);
    return row;
  } catch (error) {
    console.error(`${c.id}: FAILED`, error instanceof Error ? error.message : error);
    return null;
  }
})).filter((r): r is Row => r !== null);

const tally = (verdicts: Verdict[]) => {
  const wins = verdicts.filter((v) => v === 'second').length;
  const losses = verdicts.filter((v) => v === 'first').length;
  return { n: verdicts.length, wins, losses, ties: verdicts.length - wins - losses, ...wilson(wins, verdicts.length) };
};
const rewrite = tally(done.map((r) => r.rawVsKb));
const applicable = done.filter((r) => r.plainVsKb !== null);
const kb = tally(applicable.map((r) => r.plainVsKb!));
const line = (label: string, t: ReturnType<typeof tally>) => `| ${label} | ${t.n} | ${t.rate}% (${t.low}–${t.high}%) | ${t.ties} | ${t.losses} |`;
const publishable = rewrite.n >= 100;
const hand = tally(done.filter((r) => handWritten.has(r.id)).map((r) => r.rawVsKb));
const written = tally(done.filter((r) => !handWritten.has(r.id)).map((r) => r.rawVsKb));
const withInvented = done.filter((r) => r.invented.length > 0);
// One technique's own effect, in percentage points of blind comparisons: wins minus losses.
const dropLift = drop && kb.n ? Math.round(((kb.wins - kb.losses) / kb.n) * 1000) / 10 : null;

const summary = `# Knowledge-base ablation — ${new Date().toISOString().slice(0, 10)}

Model: \`${MODEL}\` · knowledge base: ${KB_VERSION} · judge: blind, pairwise, position-swapped (a side wins only if it wins both orders).

| Comparison | n | Preferred, with 95% interval | Ties | Losses |
|---|---|---|---|---|
${line('Rewrite (with knowledge base) vs the raw draft', rewrite)}
${line(drop ? `All techniques vs all but \`${drop}\`` : 'With the knowledge base vs the same rewrite without it', kb)}
${line('  of which hand-written cases (rewrite vs raw)', hand)}
${line('  of which model-written cases (rewrite vs raw)', written)}

${publishable
    ? `**For the site:** "In ${rewrite.n} blind comparisons, the answer to the rewritten prompt was preferred ${rewrite.rate}% of the time (95% interval ${rewrite.low}–${rewrite.high}%)."`
    : `**Not ready for the site:** ${rewrite.n} cases is too few; the interval above is the honest size of the result. Run at least 100.`}

The second row covers the ${applicable.length} cases where ${drop ? 'that technique' : 'at least one technique'} applied (master prompts). A tie there means the judge could see no difference.
${dropLift === null ? '' : `**${drop}:** ${dropLift > 0 ? '+' : ''}${dropLift} points over ${kb.n} cases. ${kb.n >= 30 ? `Record it with \`npm run kb -- lift ${drop} ${dropLift}\`.` : 'Too few cases to record (30 needed).'}\n`}
**Nothing made up:** ${withInvented.length} of ${done.length} rewrites stated a fact with no basis in the draft, the conversation or the answers${withInvented.length ? `: ${withInvented.map((r) => `${r.id} ("${r.invented[0]!.slice(0, 80)}")`).join('; ')}` : ''}.
Answers cut off before finishing: ${done.reduce((n, r) => n + r.cut, 0)}.

| Case | Domain | Techniques | Raw → rewrite | Without → with KB |
|---|---|---|---|---|
${done.map((r) => `| ${r.id} | ${r.domain} | ${r.techniques.join(', ') || '–'} | ${r.rawVsKb === 'second' ? 'rewrite' : r.rawVsKb === 'first' ? 'raw' : 'tie'} | ${r.plainVsKb === null ? 'n/a' : r.plainVsKb === 'second' ? 'with KB' : r.plainVsKb === 'first' ? 'without' : 'tie'} |`).join('\n')}
`;

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(path.join(RESULTS_DIR, 'ablation-latest.json'), JSON.stringify({ model: MODEL, kb: KB_VERSION, ranAt: new Date().toISOString(), rows: done }, null, 2));
writeFileSync(path.join(RESULTS_DIR, 'ablation.md'), summary);
console.log(`\n${summary}\nWritten to eval/results/ablation.md`);
