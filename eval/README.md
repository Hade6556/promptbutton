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

Each case in [`cases.ts`](cases.ts) (and the reviewed model-written ones, see [Case sets](#case-sets-eval_set))
has a conversation, the user's draft, a `tag` (`ambiguous` or `clear`) and a hidden `intent`: what the user
actually wanted. The rewriter never sees the intent.

`run.mts`, per case: gap analysis → if the gate fires, a **simulated user** answers the questions from the intent →
rewrite → the assistant answers both the original draft and the rewrite with the same history.
`judge.mts`: an intent-aware judge compares the two responses twice (A/B and B/A) and writes
`results/summary.md`.

```bash
export ANTHROPIC_API_KEY=sk-ant-…
npm run eval                 # run + judge, hand-written cases
EVAL_SET=reviewed npm run eval     # run + judge, hand-written + reviewed model-written cases (≈ $45)
node --import tsx eval/run.mts     # or step by step
node --import tsx eval/judge.mts
EVAL_ONLY=cold-blog,deep-sql-fix node --import tsx eval/run.mts   # a subset
node --import tsx eval/compare.mts eval/results/v4.json eval/results/latest.json   # run vs run, head to head
```

About 5 model calls per case plus 2 judge calls; 37 cases ≈ 260 calls on `claude-opus-5-5` (≈ $8–10 with
the 16k answer cap, 10–15 min), so **about $0.25 per case** for run + judge. `compare.mts` judges two runs' *rewritten-prompt responses* against each
other, case by case, so a prompt change can be scored as wins/losses rather than two independent win rates;
`REGENERATE=1` re-answers both runs' prompts first so they share the same output cap.

The answers to the prompts stream with a 16,000-token cap and record `stop_reason`. Do not lower it: on this
model thinking counts toward `max_tokens`, and a 3,000 cap left several master-prompt answers empty, which
the judge read as losses.

`npm run cost` runs one real press (gap analysis + rewrite) three ways — extension text, desktop screenshot,
quick ask — and prints token usage and dollars at the current rate card.

## Case sets (`EVAL_SET`)

A number on the site needs a test of at least 100 drafts, always shown with its 95% interval (the same
rule as `ablate.mts`). The 60 hand-written cases are not enough on their own, so `EVAL_SET` picks the set:

| `EVAL_SET` | Cases | Cost at ≈ $0.25 a case | Time at concurrency 4 |
|---|---|---|---|
| `hand` (default) | the 60 hand-written cases in [`cases.ts`](cases.ts) | ≈ $15 | ≈ 20–25 min |
| `reviewed` | those 60 plus the 121 model-written cases accepted in [`cases.reviewed.ts`](cases.reviewed.ts): 181 | ≈ $45 | ≈ 1 hour |

- [`cases.generated.ts`](cases.generated.ts) holds 140 model-written cases (`npm run eval:gen`, 14 per domain).
  Each was read and either accepted or rejected with a one-line reason in `cases.reviewed.ts`: 19 were
  rejected (8 near-duplicates, 5 wrong tags, 5 that need missing material, 1 a person would not type).
  The review was done by an AI reviewer; a person should skim the rejections and a sample of the accepted
  cases before a number that includes them is published.
- Set `EVAL_SET` once for both steps (`EVAL_SET=reviewed npm run eval`). `run.mts` records the set in the run
  file and `judge.mts` uses it unless `EVAL_SET` says otherwise, so `EVAL_SET=hand` on `judge.mts` narrows a
  reviewed run to the hand-written cases. An unknown name stops with an error.
- `summary.md` reports rewrite preferred for hand-written, model-written and combined, each with n and a 95%
  Wilson interval, and says whether the combined number is ready for the site.
- If `cases.generated.ts` is regenerated, its ids change and `EVAL_SET=reviewed` refuses to run until the new
  cases are reviewed.
- `npm run eval:ablate` reads `EVAL_SET` differently: it runs all 200 cases, rejected ones included, unless
  `EVAL_SET=hand`.

## Tuning

- `ASK_THRESHOLD` in `src/llm/config.ts` trades recall on ambiguous drafts against false asks on clear ones.
- The two system prompts live in `src/llm/prompts.ts`; bump `PROMPT_VERSION` when you change them so runs are comparable.
- `results/` is git-ignored except `summary.md`, so the headline numbers travel with the repo.
