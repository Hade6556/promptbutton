/// <reference types="node" />
// Pairwise comparison of two eval runs: for each case, which run's *rewritten-prompt response*
// better serves the user's intent? Position-swapped, intent-aware. Also reports length ratios
// and how often non-dump cases received master-prompt structure.
//
//   node --env-file-if-exists=.env --import tsx eval/compare.mts eval/results/baseline-v3.json eval/results/latest.json
//   REGENERATE=1 …   re-answers both runs' rewritten prompts with the current responder first, so two
//                    runs made with different output caps are judged on equal footing.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MODEL } from '../src/llm/config';
import { ALL_CASES, CASES } from './cases';
import { pool, respond } from './lib.mts';
import type { RunResult } from './run.mts';

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error('usage: compare.mts <runA.json> <runB.json>');
  process.exit(1);
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const client = new Anthropic();
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);

const Verdict = z.object({ winner: z.enum(['A', 'B', 'tie']), reason: z.string() });
const SYSTEM = `You compare two assistant responses given to the same user at the same point in a conversation. You are told what the user actually wanted. Judge which response better serves that intent: right task, right audience, right format and length, constraints respected, correct and complete, no invented details that contradict the intent. Ignore style unless the intent makes it matter. Answer "tie" when equal.`;

async function judgeOnce(r: RunResult, responseA: string, responseB: string): Promise<'A' | 'B' | 'tie'> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'medium', format: zodOutputFormat(Verdict) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `<what_the_user_actually_wanted>\n${r.intent}\n</what_the_user_actually_wanted>\n\n<user_message_as_typed>\n${r.draft}\n</user_message_as_typed>\n\n<response_A>\n${responseA}\n</response_A>\n\n<response_B>\n${responseB}\n</response_B>`,
      },
    ],
  });
  return res.parsed_output?.winner ?? 'tie';
}

/** Counts section labels (bold, heading, XML tag or "Label:" line) — a proxy for "got the master-prompt treatment". */
const sections = (text: string) =>
  (text.match(/^(\*\*[^*\n]{2,40}\*\*|#{1,3} .+|<[a-z_]+>|(?:Role|Goal|Context|Task|Quality bar|Constraints|Output|Done when|Examples|Assumptions):)/gm) ?? []).length;

const runA = JSON.parse(readFileSync(aPath, 'utf8')) as { results: RunResult[] };
const runB = JSON.parse(readFileSync(bPath, 'utf8')) as { results: RunResult[] };
const byId = new Map(runB.results.map((r) => [r.id, r]));
const pairs = runA.results.filter((a) => byId.has(a.id)).map((a) => ({ a, b: byId.get(a.id)! }));
console.log(`Comparing ${pairs.length} cases: A=${path.basename(aPath)} vs B=${path.basename(bPath)}\n`);

if (process.env.REGENERATE === '1') {
  console.log('Regenerating both runs’ answers to the rewritten prompts with the current responder…');
  await pool(pairs, CONCURRENCY, async ({ a, b }) => {
    const history = ALL_CASES.find((c) => c.id === a.id)?.history ?? []; // model-written cases have earlier messages too
    const [ra, rb] = await Promise.all([respond(client, history, a.rewritten), respond(client, history, b.rewritten)]);
    a.responseRewritten = ra.text;
    a.stop = { original: a.stop?.original ?? 'unknown', rewritten: ra.stopReason };
    b.responseRewritten = rb.text;
    b.stop = { original: b.stop?.original ?? 'unknown', rewritten: rb.stopReason };
    console.log(`${a.id.padEnd(30)} answered  A ${ra.stopReason} ${ra.text.length} chars · B ${rb.stopReason} ${rb.text.length} chars`);
  });
  console.log('');
}

const rows = await pool(pairs, CONCURRENCY, async ({ a, b }) => {
  const [first, second] = await Promise.all([judgeOnce(a, a.responseRewritten, b.responseRewritten), judgeOnce(a, b.responseRewritten, a.responseRewritten)]);
  const bWins = first === 'B' && second === 'A';
  const aWins = first === 'A' && second === 'B';
  const verdict = bWins ? 'B' : aWins ? 'A' : 'tie';
  const row = {
    id: a.id,
    tag: a.tag,
    mode: (b.gap as { mode?: string }).mode ?? '-',
    verdict,
    ratioA: +(a.rewritten.length / Math.max(1, a.draft.length)).toFixed(1),
    ratioB: +(b.rewritten.length / Math.max(1, b.draft.length)).toFixed(1),
    sectionsA: sections(a.rewritten),
    sectionsB: sections(b.rewritten),
    askedA: a.asked,
    askedB: b.asked,
    cutA: a.stop ? a.stop.rewritten !== 'end_turn' : false,
    cutB: b.stop ? b.stop.rewritten !== 'end_turn' : false,
  };
  console.log(`${row.id.padEnd(30)} ${row.verdict.padEnd(4)} len ${row.ratioA}x→${row.ratioB}x  sections ${row.sectionsA}→${row.sectionsB}  mode=${row.mode}${row.cutA || row.cutB ? '  ⚠ cut off' : ''}`);
  return row;
});

const slice = (f: (r: (typeof rows)[number]) => boolean) => {
  const s = rows.filter(f);
  const n = s.length;
  const w = s.filter((r) => r.verdict === 'B').length;
  const l = s.filter((r) => r.verdict === 'A').length;
  const avg = (k: 'ratioA' | 'ratioB' | 'sectionsA' | 'sectionsB') => (n ? (s.reduce((t, r) => t + r[k], 0) / n).toFixed(1) : '-');
  return { n, bWins: w, aWins: l, ties: n - w - l, ratioA: avg('ratioA'), ratioB: avg('ratioB'), sectionsA: avg('sectionsA'), sectionsB: avg('sectionsB') };
};
const table = [
  ['All', slice(() => true)],
  ['Brain dumps (dump-*)', slice((r) => r.id.startsWith('dump-'))],
  ['Other ambiguous', slice((r) => r.tag === 'ambiguous' && !r.id.startsWith('dump-'))],
  ['Clear', slice((r) => r.tag === 'clear')],
] as const;

const overStructured = rows.filter((r) => r.tag === 'clear' && r.sectionsB >= 3).map((r) => r.id);
const md = `# Run comparison — ${path.basename(aPath)} (A) vs ${path.basename(bPath)} (B)

| Slice | n | B better | tie | A better | avg length ratio A→B | avg sections A→B |
|---|---|---|---|---|---|---|
${table.map(([label, s]) => `| ${label} | ${s.n} | ${s.bWins} | ${s.ties} | ${s.aWins} | ${s.ratioA}x → ${s.ratioB}x | ${s.sectionsA} → ${s.sectionsB} |`).join('\n')}

Clear cases with master-prompt structure in B (should be none): ${overStructured.length ? overStructured.join(', ') : 'none'}
Answers cut off before finishing: A ${rows.filter((r) => r.cutA).length} · B ${rows.filter((r) => r.cutB).length}${process.env.REGENERATE === '1' ? ' (both runs re-answered with the same 16k cap)' : ''}

| Case | Tag | Mode (B) | Verdict | Length A→B | Sections A→B | Asked A→B | Cut off A→B |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.tag} | ${r.mode} | ${r.verdict} | ${r.ratioA}x→${r.ratioB}x | ${r.sectionsA}→${r.sectionsB} | ${r.askedA ? 'y' : 'n'}→${r.askedB ? 'y' : 'n'} | ${r.cutA ? 'y' : 'n'}→${r.cutB ? 'y' : 'n'} |`).join('\n')}
`;
const out = path.join(HERE, 'results', 'compare.md');
writeFileSync(out, md);
console.log(`\n${md}\nWritten to ${path.relative(process.cwd(), out)}`);
