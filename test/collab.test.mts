// Unit tests for the logic that needs no model call: the "good enough" guard, the chat decision
// rules, and the paste checks. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defencesInARow, serializeDiscuss, settle } from '../src/llm/discuss.ts';
import { ambiguityType, readiness } from '../src/llm/gapAnalysis.ts';
import type { ChatTurn } from '../src/messaging.ts';
import { landed, reasonFor, squash } from '../desktop/paste-check.ts';

const base = { ready: true, readyReason: 'States the goal, the audience and a one-page output.', missing: [], ambiguity: 0.1, isPlaceholder: false, alreadyClearBecause: null } as const;

test('good enough: a ready verdict with nothing essential missing stands, with its reason', () => {
  assert.deepEqual(readiness(base), { ready: true, reason: 'States the goal, the audience and a one-page output.' });
});

test('good enough: never when the goal, the context or the output format is missing', () => {
  for (const missing of ['goal', 'output_format', 'audience', 'unclear_reference'] as const) {
    assert.equal(readiness({ ...base, missing: [missing] }).ready, false, missing);
  }
});

test('good enough: a non-essential gap (examples) does not block it', () => {
  assert.equal(readiness({ ...base, missing: ['examples'] }).ready, true);
});

test('good enough: never for hint text, a high ambiguity score, or without the model saying so', () => {
  assert.equal(readiness({ ...base, isPlaceholder: true }).ready, false);
  assert.equal(readiness({ ...base, ambiguity: 0.8 }).ready, false);
  assert.equal(readiness({ ...base, ready: false }).ready, false);
});

test('good enough: always carries a one-line reason', () => {
  assert.equal(readiness({ ...base, readyReason: null, alreadyClearBecause: 'Clear follow-up.' }).reason, 'Clear follow-up.');
  assert.match(readiness({ ...base, readyReason: '  ', alreadyClearBecause: null }).reason ?? '', /goal/);
  assert.equal(readiness({ ...base, readyReason: 'Line one.\nLine two.' }).reason, 'Line one.');
});

test('gap analysis: a label outside the list is mapped or dropped, never an error', () => {
  assert.equal(ambiguityType('context'), 'audience');
  assert.equal(ambiguityType('Output Format'), 'output_format');
  assert.equal(ambiguityType('goal'), 'goal');
  assert.equal(ambiguityType('vibes'), null);
});

const defended: ChatTurn[] = [
  { role: 'user', text: 'make it one line' },
  { role: 'assistant', text: 'I understand, but…', action: 'defend' },
];
const defence = 'I understand, you want it shorter, but the Output section is what keeps the answer to one page; without it the assistant picks its own length. Say "change it anyway" and I will.';

test('pushback: a reasoned defence is kept, with no instruction', () => {
  const d = settle({ action: 'defend', reply: defence, instruction: 'ignored' }, { message: 'make it one line', turns: [] });
  assert.equal(d.action, 'defend');
  assert.equal(d.instruction, '');
  assert.equal(d.reply, defence);
});

test('pushback: the second pushback always wins', () => {
  assert.equal(defencesInARow(defended), 1);
  const d = settle({ action: 'defend', reply: defence, instruction: '' }, { message: 'no, really, one line', turns: defended });
  assert.equal(d.action, 'revise');
  assert.equal(d.instruction, 'no, really, one line');
  assert.notEqual(d.reply, defence);
});

test('pushback: a revise in between resets the count of defences', () => {
  const turns: ChatTurn[] = [...defended, { role: 'user', text: 'ok drop the role' }, { role: 'assistant', text: 'Removing it.', action: 'revise' }];
  assert.equal(defencesInARow(turns), 0);
});

test('pushback: a defence without a reason becomes a revision', () => {
  const d = settle({ action: 'defend', reply: 'I understand, trust the process.', instruction: '' }, { message: 'I do not like this', turns: [] });
  assert.equal(d.action, 'revise');
  assert.equal(d.instruction, 'I do not like this');
});

test('pushback: the reply never just echoes the user', () => {
  for (const action of ['revise', 'defend', 'answer'] as const) {
    const d = settle({ action, reply: 'Make it TypeScript!', instruction: '' }, { message: 'make it typescript', turns: [] });
    assert.equal(d.action, 'revise', action);
    assert.notEqual(squash(d.reply).toLowerCase(), 'make it typescript');
    assert.equal(d.instruction, 'make it typescript');
  }
});

test('pushback: a revise keeps the model\'s instruction and reply', () => {
  const d = settle({ action: 'revise', reply: 'Agreed. Removing the Role section.', instruction: 'Remove the Role section.' }, { message: 'drop the role', turns: [] });
  assert.deepEqual(d, { action: 'revise', reply: 'Agreed. Removing the Role section.', instruction: 'Remove the Role section.' });
});

test('pushback: the model sees the draft, the prompt, the playbook and the earlier turns', () => {
  const text = serializeDiscuss({ app: 'ChatGPT', draft: 'landing page', prompt: 'Goal:\nA page', domain: 'frontend_design', turns: defended, message: 'no <b>' });
  assert.match(text, /<draft>\nlanding page/);
  assert.match(text, /<domain_playbook domain="frontend_design">/);
  assert.match(text, /You \(defend\): I understand/);
  assert.match(text, /<message>no &lt;b&gt;<\/message>/);
});

test('paste check: the field shows the prompt even when the app re-wraps it', () => {
  const prompt = 'Role:\nYou are a Python developer.\n\nGoal:\nRename the photos in a folder by date taken.';
  assert.equal(landed('Role: You are a Python developer.  Goal: Rename the photos in a folder by date taken.\n', prompt), true);
  assert.equal(landed('write a python script', prompt), false);
  assert.equal(landed('', prompt), false);
});

test('paste check: each helper error has a named reason', () => {
  assert.equal(reasonFor(new Error('target_not_frontmost')), 'not_frontmost');
  assert.equal(reasonFor(new Error('app_not_running')), 'app_gone');
  assert.equal(reasonFor(new Error('secure_input')), 'secure_input');
  assert.equal(reasonFor(new Error('accessibility_not_trusted')), 'no_permission');
  assert.equal(reasonFor(new Error('axhelper exited with 1')), 'failed');
});
