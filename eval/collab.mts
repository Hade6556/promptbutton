// Live check of the two collaborator behaviours, with the exact prompts the app uses:
//   1. the "good enough" safeguard: a finished prompt is left alone, an underspecified one is not;
//   2. pushback in the chat: the editor revises, or defends with a concrete reason, and never echoes.
//   node --env-file-if-exists=.env --import tsx eval/collab.mts      (npm run collab-smoke)
import Anthropic from '@anthropic-ai/sdk';
import { discussPrompt } from '../src/llm/discuss';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';
import type { ChatTurn, DiscussAction, ImproveInput } from '../src/messaging';

const client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
const input = (draft: string): ImproveInput => ({ site: 'ChatGPT', history: [], draft });
let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail.replace(/\n/g, ' ').slice(0, 260)}`);
};

const STRONG = `Goal:
Write a Python 3.11 script that renames the photos in a folder by the date they were taken, so the folder sorts chronologically. I run it myself on macOS.

Context:
For: me, a developer; about 4,000 JPEG and HEIC files from two phones in one flat folder.
- Use the EXIF DateTimeOriginal; fall back to the file's modification time and say so in the log.

Task:
1. Rename each file to YYYY-MM-DD_HH-MM-SS.ext; add _1, _2 when two photos share a second.
2. Add a --dry-run flag that prints old → new without touching files.

Output:
One file, rename_photos.py, standard library plus Pillow only, under 120 lines, followed by the exact command to run it.

Done when:
- A dry run on the folder lists every file once and never proposes an existing name.`;

// Long and confident, but no output format, no audience and no measurable goal.
const POLISHED_BUT_EMPTY = `I have been thinking a lot about our onboarding lately and I really feel that it could be so much better than it currently is. There are several parts of it that do not feel right to me, and some colleagues have mentioned similar things in passing during the last few weeks. I would love for you to take a careful look at this whole area and come back to me with your very best thinking on it, because it matters a great deal to the company and to me personally, and we should move on it soon.`;

console.log('── Good enough safeguard ──');
{
  const strong = await analyzeGaps(client, input(STRONG));
  check('a finished prompt is good enough', strong.ready && Boolean(strong.readyReason), `ready=${strong.ready} reason="${strong.readyReason}" missing=${strong.missing.join(',') || '-'}`);

  const cold = await analyzeGaps(client, input('write a blog post about AI'));
  check('a cold one-liner is rewritten', !cold.ready, `ready=${cold.ready} ambiguity=${cold.ambiguity.toFixed(2)} missing=${cold.missing.join(',') || '-'}`);

  const empty = await analyzeGaps(client, input(POLISHED_BUT_EMPTY));
  check('a long prompt without goal, context or format is rewritten', !empty.ready, `ready=${empty.ready} ambiguity=${empty.ambiguity.toFixed(2)} missing=${empty.missing.join(',') || '-'}`);

  // The loop the safeguard exists for: enhance, then press again on the result.
  const draft = 'i want to build a landing page for my invoicing app for freelancers';
  const first = await analyzeGaps(client, input(draft));
  const rewritten = await rewritePrompt(client, input(draft), [], undefined, { mode: first.mode, domain: first.domain, scale: first.scale, expert: first.expert, depth: 'full' });
  const again = await analyzeGaps(client, input(rewritten));
  check('pressing again on our own rewrite stops', !first.ready && again.ready, `first ready=${first.ready}; second ready=${again.ready} reason="${again.readyReason}" (${rewritten.length} chars)`);
}

console.log('\n── Pushback in the chat ──');
{
  const draft = 'write a python script that renames the photos in a folder by the date they were taken';
  const base = { app: 'ChatGPT', draft, prompt: STRONG, domain: 'software' as const };
  const say = async (message: string, turns: ChatTurn[] = []) => discussPrompt(client, { ...base, turns, message });
  const notEcho = (reply: string, message: string) => reply.trim().toLowerCase() !== message.trim().toLowerCase() && reply.trim().length > 15;
  const expect = (name: string, d: { action: DiscussAction; reply: string; instruction: string }, message: string, ok: boolean) =>
    check(name, ok && notEcho(d.reply, message), `${d.action}: "${d.reply}"${d.instruction ? ` → ${d.instruction}` : ''}`);

  let m = 'also make it work on Windows';
  let d = await say(m);
  expect('a concrete edit is applied', d, m, d.action === 'revise' && /windows/i.test(d.instruction));

  m = 'this is way too much, just make the whole thing one line: rename my photos';
  d = await say(m);
  expect('a harmful change is defended with a reason', d, m, d.action === 'defend' && /^I understand/i.test(d.reply) && d.reply.split(/\s+/).length >= 15);

  const turns: ChatTurn[] = [
    { role: 'user', text: m },
    { role: 'assistant', text: d.reply, action: 'defend' },
  ];
  m = 'no. one line. do it.';
  d = await say(m, turns);
  expect('the second pushback wins', d, m, d.action === 'revise' && d.instruction.length > 0);

  m = "I don't like this prompt, we're heading the wrong way";
  d = await say(m);
  expect('vague pushback gets a revision or a reasoned defence', d, m, (d.action === 'revise' && d.instruction.length > 10) || (d.action === 'defend' && d.reply.split(/\s+/).length >= 15));

  m = 'actually it is for my mum, she has never used a terminal';
  d = await say(m);
  expect('a new fact from the user is accepted', d, m, d.action === 'revise' && d.instruction.length > 10);

  m = 'why does it say Pillow only?';
  d = await say(m);
  expect('a question is answered without changing the prompt', d, m, d.action === 'answer' && d.instruction === '');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
