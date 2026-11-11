# Knowledge base

Every technique the rewrite applies, with the evidence for it. Build-time only: `kb/kb.db` (SQLite) is
the store, and `npm run kb -- compile` turns its active rows into `src/llm/kb.generated.ts` (bundled
into the app) and `site/sources.html` (the public list).

```
sources.json ─ fetch ─ extract ─ check ─ candidate ─ approve ─ active ─ compile ─ app + sources page
 (allowlist)   robots   Claude,   quote on page,      a person             ↑
               + delay  no tools  injection filter                  recompute: contradicted,
                                  known domain                      stale or harmful → retired
```

| Command | What it does |
|---|---|
| `npm run kb -- init` | Create the database and load the seed rows (`seed-data.mts`) |
| `npm run kb -- fetch [id]` | Download allowlisted pages into `kb/cache/` (ignored by git), obeying robots.txt and crawl-delay |
| `npm run kb -- extract [id]` | Read fetched pages into claims. Calls the Claude API |
| `npm run kb -- verify` | Re-check every stored quote against its page; a quote that no longer matches is removed |
| `npm run kb -- review` | List candidates and quarantined claims |
| `npm run kb -- approve <slug…>` | Make candidates active. This is the human step |
| `npm run kb -- retire <slug> <why>` | Retire a technique and keep the reason |
| `npm run kb -- lift <slug> <points>` | Record a measured change in win rate; −5 or worse retires the technique |
| `npm run kb -- compile` | Write `kb.generated.ts` and `site/sources.html` |
| `npm run kb -- refresh` | Fetch, extract what changed, verify, recompute, compile |

| `npm run kb -- pull` | Download the outcomes the app reported. Needs `PMP_ADMIN_TOKEN`, set to the same value on the server |
| `npm run kb -- learn` | Measured lift per technique from the app's holdout; a technique that costs 5 points or more is retired |
| `npm run kb -- stale <family>` | A new model came out: send that family's techniques back to review |

## How it learns from use

One rewrite in five leaves one technique out at random (`planTechniques` in `src/llm/kb.ts`). The app
reports the technique ids, the one held out and what happened next: inserted, undone, rated up or down.
No text, no user id. `learn` compares the kept rate with a technique against the kept rate when it was
held out, once both sides have 30 rewrites. Without the holdout every rewrite in a domain would carry
the same set and no technique's own effect could be told apart.

The same question can be asked offline: `EVAL_DROP=<id> npm run eval:ablate` runs the full set against
the set without one technique and prints the `lift` command to record the result.

Rules the code enforces (see `lib.mts`, tested in `test/kb.test.mts`):

- New advice enters as a candidate. Nothing extracted from the web is injected until a person approves it.
- A claim is stored only if its quote (25 words at most) appears word for word on the fetched page.
- Extracted instructions with links, markup, secrets or wording aimed at a model are quarantined.
- Only our own `instruction` wording reaches a prompt. Page text and quotes never do.
- Confidence is a formula: strongest source type, +0.10 per further publisher, −0.20 per contradiction,
  ×0.8 for model-specific advice older than a year, ± measured lift. Below 0.40 a technique is not used.
- Advice written for one model family is only injected when the user is typing in that family's app.

Measuring it: `npm run eval:ablate` runs raw draft, rewrite without the knowledge base and rewrite with
it on every eval case, judged blind, and writes `eval/results/ablation.md` with 95% intervals.
