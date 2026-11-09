# PromptButton eval — 2026-11-09

Model: `claude-opus-5-5` · ask threshold: 0.6 · judge: pairwise, position-swapped, intent-aware.

| Slice | n | Rewrite preferred | Tie | Original preferred |
|---|---|---|---|---|
| All cases | 31 | 45% | 26% | 29% |
| Conversations with ≥5 earlier messages | 5 | 40% | 40% | 20% |
| Cold first messages | 15 | 73% | 7% | 20% |

**Gate:** asked on 40% of ambiguous drafts (recall) · asked on 9% of clear drafts (false-ask rate).
**Length:** rewrites are 8.0× the draft on average.

| Case | Tag | Ambiguity | Asked | Verdict |
|---|---|---|---|---|
| cold-blog | ambiguous | 0.80 | yes (3) | rewritten |
| cold-email-boss | ambiguous | 0.85 | yes (3) | rewritten |
| cold-regex | ambiguous | 0.30 | no | rewritten |
| cold-workout | ambiguous | 0.75 | yes (3) | rewritten |
| cold-explain-k8s | ambiguous | 0.55 | no | rewritten |
| cold-app-names | ambiguous | 0.85 | yes (3) | rewritten |
| cold-cover-letter | ambiguous | 0.85 | yes (3) | rewritten |
| cold-summarize-nothing | ambiguous | 0.95 | yes (2) | rewritten |
| cold-launch-plan | ambiguous | 0.85 | yes (3) | rewritten |
| cold-kid-story | ambiguous | 0.65 | yes (3) | rewritten |
| deep-trip-table | ambiguous | 0.50 | no | original |
| deep-tests-other-component | ambiguous | 0.45 | no | rewritten |
| deep-sql-fix | ambiguous | 0.10 | no | original |
| deep-tagline-mix | ambiguous | 0.10 | no | original |
| deep-resume-rest | ambiguous | 0.05 | no | tie |
| deep-dashboard-metric | ambiguous | 0.20 | no | tie |
| deep-translate-errors | ambiguous | 0.50 | no | original |
| dump-pricing-page | ambiguous | 0.45 | no | original |
| dump-flaky-etl | ambiguous | 0.40 | no | original |
| dump-best-man-speech | ambiguous | 0.30 | no | rewritten |
| clear-recipe-other-allergy | clear | 0.60 | yes (1) | rewritten |
| clear-fix-them | clear | 0.10 | no | original |
| clear-rewrite-intro | clear | 0.30 | no | original |
| clear-shorter | clear | 0.10 | no | tie |
| clear-now-in-python | clear | 0.10 | no | tie |
| clear-fully-specified | clear | 0.10 | no | tie |
| clear-yes-do-that | clear | 0.05 | no | tie |
| clear-fix-typo | clear | 0.05 | no | rewritten |
| clear-numbered-list | clear | 0.05 | no | tie |
| clear-markdown-table | clear | 0.05 | no | tie |
| clear-unit-convert | clear | 0.02 | no | original |
