# Eval

Does pressing the button actually get a better answer? Four numbers answer that:

1. **Rewrite preferred** — share of cases where the assistant's response to the rewritten prompt beats its
   response to the original draft, judged pairwise with positions swapped (a win must survive both orders).
2. **Long-conversation slice** — the same, for cases with five or more earlier messages, where the research
   says context-aware rewriting should help most.
3. **False-ask rate** — how often the gate asked questions on a draft tagged `clear`. This is the number that
   keeps the product from being annoying; the CLAM paper's finding is that forced clarification hurts on
   unambiguous requests.
4. **Depth** — median length of the master prompts, which deliverable drafts fell under the 1,200-char floor,
   and which follow-ups or quick asks got over-expanded. A good run has an empty list on both sides.

## How it works

Each case in [`cases.ts`](cases.ts) has a conversation, the user's draft, a `tag` (`ambiguous` or `clear`) and a
hidden `intent`: what the user actually wanted. The rewriter never sees the intent.

`run.mts`, per case: gap analysis → if the gate fires, a **simulated user** answers the questions from the intent →
rewrite → the assistant answers both the original draft and the rewrite with the same history.
`judge.mts`: an intent-aware judge compares the two responses twice (A/B and B/A) and writes
`results/summary.md`.

```bash
export ANTHROPIC_API_KEY=sk-ant-…
npm run eval                 # run + judge
node --import tsx eval/run.mts     # or step by step
node --import tsx eval/judge.mts
EVAL_ONLY=cold-blog,deep-sql-fix node --import tsx eval/run.mts   # a subset
node --import tsx eval/compare.mts eval/results/v4.json eval/results/latest.json   # run vs run, head to head
```

About 5 model calls per case plus 2 judge calls; 37 cases ≈ 260 calls on `claude-opus-5-5` (≈ $8–10 with
the 16k answer cap, 10–15 min). `compare.mts` judges two runs' *rewritten-prompt responses* against each
other, case by case, so a prompt change can be scored as wins/losses rather than two independent win rates;
`REGENERATE=1` re-answers both runs' prompts first so they share the same output cap.

The answers to the prompts stream with a 16,000-token cap and record `stop_reason`. Do not lower it: on this
model thinking counts toward `max_tokens`, and a 3,000 cap left several master-prompt answers empty, which
the judge read as losses.

`npm run cost` runs one real press (gap analysis + rewrite) three ways — extension text, desktop screenshot,
quick ask — and prints token usage and dollars at the current rate card.

## Tuning

- `ASK_THRESHOLD` in `src/llm/config.ts` trades recall on ambiguous drafts against false asks on clear ones.
- The two system prompts live in `src/llm/prompts.ts`; bump `PROMPT_VERSION` when you change them so runs are comparable.
- `results/` is git-ignored except `summary.md`, so the headline numbers travel with the repo.
