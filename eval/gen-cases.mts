/// <reference types="node" />
// Grows the eval set: asks the model for new cases per domain, in the shape of the hand-written ones,
// and writes them to eval/cases.generated.ts. A person should read them before they count.
//
//   npm run eval:gen              # 14 per domain (140 in all)
//   GEN_PER_DOMAIN=5 npm run eval:gen
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MODEL } from '../src/llm/config';
import { DOMAINS, DOMAIN_LABELS } from '../src/llm/domains';
import { CASES, type EvalCase } from './cases';
import { pool } from './lib.mts';

const PER_DOMAIN = Number(process.env.GEN_PER_DOMAIN ?? 14);
const client = new Anthropic();

const CaseSchema = z.object({
  slug: z.string().describe('Three or four lowercase words joined by hyphens that name the case.'),
  tag: z.enum(['ambiguous', 'clear']),
  site: z.enum(['chatgpt', 'claude']),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })),
  draft: z.string(),
  intent: z.string(),
});
const Schema = z.object({ cases: z.array(CaseSchema) });

const SYSTEM = `You write test cases for a tool that rewrites the message a person is about to send to an AI chat assistant. Each case is one moment in a chat: what the person typed, and privately what they actually wanted.

A case has:
- draft: the message exactly as a real person would type it. Most people type short, lowercase, with the odd typo and no context. Vary length and care from case to case; do not make them all sloppy in the same way.
- intent: the ground truth of what this person wants, which the tool cannot see. Two to four sentences with concrete specifics: who it is for, real numbers, names of made-up products or places, format, length, tone, the decision it feeds. Specific enough that two answers can be compared against it.
- tag: "ambiguous" when the draft leaves out things the intent depends on; "clear" when the draft already states nearly everything in the intent, in which case the draft is longer and the intent mostly restates it.
- history: usually empty (a first message). For about one case in four, two to four earlier messages that set up the draft; then the draft may lean on them ("ok do it", "make it shorter").
- site: alternate between chatgpt and claude.

Rules:
- Every case is a different situation: different people, industries, countries, stakes. Ordinary life and ordinary work, not only tech.
- About two thirds ambiguous, one third clear.
- Intents never contradict their drafts.
- Invented names and numbers only; no real private individuals.`;

const style = (c: EvalCase) => `<example tag="${c.tag}">\n<draft>${c.draft}</draft>\n<intent>${c.intent}</intent>\n</example>`;
const examples = [CASES.find((c) => c.id === 'cold-blog')!, CASES.find((c) => c.id === 'kb-sql-report')!, CASES.find((c) => c.id === 'kb-budget')!].map(style).join('\n');

const batches = await pool([...DOMAINS], 3, async (domain) => {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 12000,
    output_config: { effort: 'low', format: zodOutputFormat(Schema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Write ${PER_DOMAIN} cases in this domain: ${domain} (${DOMAIN_LABELS[domain]}).\n\nThe style to match:\n${examples}` }],
  });
  const cases = response.parsed_output?.cases ?? [];
  console.log(`${domain}: ${cases.length} cases`);
  return cases.map((c, i): EvalCase => ({
    id: `gen-${domain.split('_')[0]}-${c.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)}-${i + 1}`,
    tag: c.tag,
    site: c.site,
    history: c.history,
    draft: c.draft,
    intent: c.intent,
  }));
});

const all = batches.flat();
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases.generated.ts');
writeFileSync(
  file,
  `// Written by \`npm run eval:gen\` on ${new Date().toISOString().slice(0, 10)} with ${MODEL}. Model-written cases, kept apart from the
// hand-written ones in cases.ts so results can be reported for each set. Read them before trusting a
// number that includes them.
import type { EvalCase } from './cases';

export const GENERATED: EvalCase[] = ${JSON.stringify(all, null, 2)};
`,
);
console.log(`\n${all.length} cases → eval/cases.generated.ts`);
