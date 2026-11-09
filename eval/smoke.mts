// Live smoke test of the two Claude calls with the exact prompts the extension uses.
// Run: node --import tsx eval/smoke.mts   (needs ANTHROPIC_API_KEY or an `ant auth login` profile)
import Anthropic from '@anthropic-ai/sdk';
import type { ImproveInput } from '../src/messaging';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';

const cases: Array<{ name: string; expect: 'ask' | 'clear'; input: ImproveInput }> = [
  {
    name: 'cold vague first message',
    expect: 'ask',
    input: { site: 'chatgpt', history: [], draft: 'write a blog post about ai' },
  },
  {
    name: 'short clear follow-up',
    expect: 'clear',
    input: {
      site: 'claude',
      history: [
        { role: 'user', text: 'Write a 3-paragraph product update email to our existing customers announcing dark mode in our invoicing app. Friendly, no hype.' },
        { role: 'assistant', text: 'Subject: Dark mode is here\n\nHi there,\n\nYou asked, we listened... (three paragraphs)' },
      ],
      draft: 'make it shorter',
    },
  },
  {
    name: 'vague reference deep in conversation',
    expect: 'ask',
    input: {
      site: 'chatgpt',
      history: [
        { role: 'user', text: 'I have two Vue components, CreditsWalletModal and CreditsBalanceAlertForm. The modal shows balance and the form lets users set a low-balance alert threshold.' },
        { role: 'assistant', text: 'Got it. What would you like to do with them?' },
        { role: 'user', text: 'Write unit tests for the form with Vitest and Testing Library.' },
        { role: 'assistant', text: '(test file for CreditsBalanceAlertForm)' },
      ],
      draft: 'now do the same for the other one but also check the thing we talked about',
    },
  },
];

const client = new Anthropic();

for (const c of cases) {
  console.log(`\n━━━ ${c.name}  (expect: ${c.expect}) ━━━`);
  console.log('draft:', JSON.stringify(c.input.draft));

  let t = performance.now();
  const gaps = await analyzeGaps(client, c.input);
  console.log(`gap analysis ${(performance.now() - t).toFixed(0)}ms →`, JSON.stringify(gaps, null, 2));

  t = performance.now();
  const rewritten = await rewritePrompt(client, c.input, []);
  console.log(`rewrite ${(performance.now() - t).toFixed(0)}ms →\n${rewritten}`);
}
