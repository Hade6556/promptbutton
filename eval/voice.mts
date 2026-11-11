/// <reference types="node" />
// Voice understanding smoke test: what does a spoken utterance mean in each panel state?
//   node --env-file-if-exists=.env --import tsx eval/voice.mts      (npm run voice-smoke)
import Anthropic from '@anthropic-ai/sdk';
import { interpretVoice } from '../src/llm/voice';
import type { VoiceContext, VoiceIntent } from '../src/messaging';

const client = new Anthropic();

const REWRITE = `Role:
You are a senior product designer who also ships production front-end code. (assumed)

Goal:
Build a landing page for Ledgerly that gets freelancers to start a free trial.

Task:
1. Hero with one headline, one subline and a "Start free trial" button.
2. Three benefit sections, pricing, FAQ, footer.

Output:
A single HTML file with embedded CSS and JS. (assumed)`;

const QUESTIONS: VoiceContext['questions'] = [
  { index: 0, question: 'What is the page for, and what should a visitor do on it?', suggestions: ['Sign up for a SaaS trial', 'Buy a product', 'Book a demo'] },
  { index: 1, question: 'Who lands on it?', suggestions: ['Developers', 'Small business owners', 'Consumers'] },
  { index: 2, question: 'How should it be built?', suggestions: ['Single HTML file', 'React + Tailwind', 'Next.js'] },
];

const REPLIES: VoiceContext['replies'] = [
  { index: 0, label: 'Go with your pick', text: 'Go with your recommendation.' },
  { index: 1, label: 'Use option 2', text: 'Let’s go with option 2, the event-sourced design.' },
  { index: 2, label: 'Ask for trade-offs', text: 'Before deciding, can you compare the two on cost and complexity?' },
];

const base = (phase: VoiceContext['phase'], transcript: string, extra: Partial<VoiceContext> = {}): VoiceContext => ({
  phase,
  app: 'Code',
  draft: '',
  typed: '',
  transcript,
  ...extra,
});

interface Case {
  name: string;
  ctx: VoiceContext;
  check: (i: VoiceIntent) => string | null; // null = pass, otherwise the reason
}

const has = (s: string, ...words: string[]) => words.every((w) => s.toLowerCase().includes(w.toLowerCase()));

const CASES: Case[] = [
  {
    name: 'done: add a requirement',
    ctx: base('done', 'um also make it typescript and uh drop the role part', { draft: 'i want to build a landing page', rewrite: REWRITE }),
    check: (i) => (i.intent !== 'edit_prompt' ? `intent ${i.intent}` : has(i.instruction, 'typescript') && /role/i.test(i.instruction) ? null : `instruction "${i.instruction}"`),
  },
  {
    name: 'done: shorter',
    ctx: base('done', 'make it a lot shorter', { rewrite: REWRITE }),
    check: (i) => (i.intent === 'edit_prompt' && /short/i.test(i.instruction) ? null : `${i.intent} "${i.instruction}"`),
  },
  {
    name: 'done: pushback goes to the chat in the user\'s words',
    ctx: base('done', "um I don't really like this prompt we're heading the wrong way", { rewrite: REWRITE }),
    check: (i) => (i.intent === 'edit_prompt' && /wrong way|don.t like/i.test(i.instruction) ? null : `${i.intent} "${i.instruction}"`),
  },
  {
    name: 'done: insert (fast path)',
    ctx: base('done', 'Perfect, put it in.', { rewrite: REWRITE }),
    check: (i) => (i.command === 'insert' ? null : `${i.intent}/${i.command}`),
  },
  {
    name: 'done: insert (model)',
    ctx: base('done', 'yeah that looks great go ahead and drop it into the chat', { rewrite: REWRITE }),
    check: (i) => (i.command === 'insert' ? null : `${i.intent}/${i.command}`),
  },
  {
    name: 'done: self-correction',
    ctx: base('done', 'change the stack to python no wait go', { rewrite: REWRITE }),
    check: (i) => (i.intent === 'edit_prompt' && /\bgo\b/i.test(i.instruction) && !/python/i.test(i.instruction) ? null : `${i.intent} "${i.instruction}"`),
  },
  {
    name: 'done: clearly a new task',
    ctx: base('done', 'actually forget that I need a cold email to a VC about our seed round', { rewrite: REWRITE }),
    check: (i) => (i.intent === 'new_draft' && has(i.text, 'email') ? null : `${i.intent} "${i.text}"`),
  },
  {
    name: 'asking: two answers in one breath',
    ctx: base('asking', "it's for developers and just make it a single HTML file", { draft: 'i want to build a landing page', questions: QUESTIONS, current: 0 }),
    check: (i) => {
      if (i.intent !== 'answer_questions') return `intent ${i.intent}`;
      const a1 = i.answers.find((a) => a.index === 1)?.answer ?? '';
      const a2 = i.answers.find((a) => a.index === 2)?.answer ?? '';
      return /developer/i.test(a1) && /html/i.test(a2) ? null : `answers ${JSON.stringify(i.answers)}`;
    },
  },
  {
    name: 'asking: pick a suggestion',
    ctx: base('asking', 'the first one', { questions: QUESTIONS, current: 0 }),
    check: (i) => (i.intent === 'answer_questions' && (i.pick === 0 || i.answers.some((a) => a.index === 0 && /trial/i.test(a.answer))) ? null : `${i.intent} pick=${i.pick} ${JSON.stringify(i.answers)}`),
  },
  {
    name: 'asking: skip (fast path)',
    ctx: base('asking', 'just skip it', { questions: QUESTIONS, current: 0 }),
    check: (i) => (i.command === 'skip' ? null : `${i.intent}/${i.command}`),
  },
  {
    name: 'replies: compose from a suggestion',
    ctx: base('replies', 'go with option two but tell it to use postgres for the event store', { summary: 'The assistant proposed two designs and wants you to pick one.', replies: REPLIES }),
    check: (i) => (i.intent === 'reply' && has(i.text, 'postgres') && /2|two|event/i.test(i.text) ? null : `${i.intent} "${i.text}"`),
  },
  {
    name: 'empty: brain dump becomes the draft',
    ctx: base('empty', 'okay so I need like a launch plan for our invoicing app um we have three weeks two engineers and no marketing budget and it has to be ready for product hunt', {}),
    check: (i) => (i.intent === 'new_draft' && has(i.text, 'launch') && !/\bum\b|\blike\b/i.test(i.text) ? null : `${i.intent} "${i.text}"`),
  },
  {
    name: 'typed + spoken combine',
    ctx: base('done', 'and make the hero dark', { rewrite: REWRITE, typed: 'use the brand green' }),
    check: (i) => (i.intent === 'edit_prompt' && has(i.instruction, 'green') && /dark/i.test(i.instruction) ? null : `${i.intent} "${i.instruction}"`),
  },
];

let failed = 0;
for (const c of CASES) {
  const t = performance.now();
  try {
    const intent = await interpretVoice(client, c.ctx);
    const why = c.check(intent);
    if (why) failed++;
    console.log(`${why ? 'FAIL' : 'ok  '} ${c.name.padEnd(38)} ${(performance.now() - t).toFixed(0).padStart(5)}ms  ${intent.intent}${intent.command ? `/${intent.command}` : ''}  heard="${intent.heard}"${why ? `\n      ↳ ${why}` : ''}`);
  } catch (error) {
    failed++;
    console.log(`ERR  ${c.name}: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exitCode = failed ? 1 : 0;
