# Eval

Does pressing the button actually get a better answer? Three numbers answer that:

1. **Rewrite preferred** — share of cases where the assistant's response to the rewritten prompt beats its
   response to the original draft, judged pairwise with positions swapped (a win must survive both orders).
2. **Long-conversation slice** — the same, for cases with five or more earlier messages, where the research
   says context-aware rewriting should help most.
3. **False-ask rate** — how often the gate asked questions on a draft tagged `clear`. This is the number that
   keeps the product from being annoying; the CLAM paper's finding is that forced clarification hurts on
   unambiguous requests.

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
```

About 5 model calls per case plus 2 judge calls; 28 cases ≈ 200 short calls on `claude-opus-5-5`.

## Tuning

- `ASK_THRESHOLD` in `src/llm/config.ts` trades recall on ambiguous drafts against false asks on clear ones.
- The two system prompts live in `src/llm/prompts.ts`; bump `PROMPT_VERSION` when you change them so runs are comparable.
- `results/` is git-ignored except `summary.md`, so the headline numbers travel with the repo.
