# PromptButton eval — 2026-11-09

Model: `claude-opus-5-5` · ask threshold: 0.6 · judge: pairwise, position-swapped, intent-aware.

| Slice | n | Rewrite preferred | Tie | Original preferred |
|---|---|---|---|---|
| All cases | 37 | 59% | 24% | 16% |
| Conversations with ≥5 earlier messages | 5 | 40% | 40% | 20% |
| Cold first messages | 20 | 75% | 15% | 10% |

**Gate:** asked on 60% of ambiguous drafts (recall) · asked on 0% of clear drafts (false-ask rate).
**Length:** rewrites are 50.7× the draft on average.
**Depth:** 17 master prompts (median 2634 chars; under the 1200-char floor: none) · 20 concise rewrites (over-expanded: clear-rewrite-intro, deep-build-from-notes).
**Responses cut off before finishing:** 0 to the original draft · 3 to the rewrite.

| Case | Tag | Mode / scale / domain | Ambiguity | Asked | Chars | Verdict |
|---|---|---|---|---|---|---|
| cold-blog | ambiguous | request / deliverable / writing | 0.80 | yes (3) | 2867 | rewritten |
| cold-email-boss | ambiguous | request / deliverable / writing | 0.80 | yes (3) | 2454 | rewritten |
| cold-regex | ambiguous | request / quick / software | 0.30 | no | 275 | rewritten |
| cold-workout | ambiguous | request / deliverable / personal_life | 0.80 | yes (3) | 2478 | rewritten |
| cold-explain-k8s | ambiguous | request / deliverable / research_learning | 0.60 | yes (3) | 2492 | rewritten |
| cold-app-names | ambiguous | request / deliverable / creative | 0.85 | yes (3) | 2473 | rewritten |
| cold-cover-letter | ambiguous | request / deliverable / writing | 0.85 | yes (3) | 2816 | rewritten |
| cold-summarize-nothing | ambiguous | request / quick / research_learning | 0.90 | yes (3) | 289 | rewritten |
| cold-launch-plan | ambiguous | request / deliverable / planning_strategy | 0.85 | yes (3) | 2981 | rewritten |
| cold-kid-story | ambiguous | request / deliverable / creative | 0.75 | yes (3) | 2507 | rewritten |
| deep-trip-table | ambiguous | follow_up / quick / personal_life | 0.45 | no | 159 | rewritten |
| deep-tests-other-component | ambiguous | follow_up / deliverable / software | 0.45 | no | 162 | rewritten |
| deep-sql-fix | ambiguous | follow_up / quick / software | 0.10 | no | 147 | rewritten |
| deep-tagline-mix | ambiguous | follow_up / quick / creative | 0.10 | no | 166 | original |
| deep-resume-rest | ambiguous | follow_up / quick / writing | 0.10 | no | 153 | original |
| deep-dashboard-metric | ambiguous | follow_up / quick / software | 0.20 | no | 175 | tie |
| deep-translate-errors | ambiguous | follow_up / quick / other | 0.60 | yes (1) | 318 | rewritten |
| dump-pricing-page | ambiguous | brain_dump / deliverable / marketing_sales | 0.40 | no | 3506 | original |
| dump-flaky-etl | ambiguous | brain_dump / deliverable / software | 0.40 | no | 3611 | tie |
| dump-best-man-speech | ambiguous | brain_dump / deliverable / writing | 0.30 | no | 2634 | rewritten |
| clear-recipe-other-allergy | clear | follow_up / quick / personal_life | 0.55 | no | 169 | tie |
| clear-fix-them | clear | follow_up / quick / software | 0.10 | no | 140 | rewritten |
| clear-rewrite-intro | clear | follow_up / quick / writing | 0.30 | no | 193 | original |
| clear-shorter | clear | follow_up / quick / writing | 0.10 | no | 123 | original |
| clear-now-in-python | clear | follow_up / quick / software | 0.10 | no | 154 | tie |
| clear-fully-specified | clear | request / deliverable / marketing_sales | 0.15 | no | 2743 | tie |
| clear-yes-do-that | clear | follow_up / quick / software | 0.05 | no | 168 | rewritten |
| clear-fix-typo | clear | follow_up / quick / writing | 0.05 | no | 135 | rewritten |
| clear-numbered-list | clear | follow_up / quick / writing | 0.05 | no | 130 | tie |
| clear-markdown-table | clear | follow_up / quick / research_learning | 0.05 | no | 161 | tie |
| clear-unit-convert | clear | request / quick / other | 0.00 | no | 129 | original |
| cold-landing-page | ambiguous | request / deliverable / frontend_design | 0.80 | yes (3) | 3661 | tie |
| cold-saas-dashboard | ambiguous | request / deliverable / frontend_design | 0.85 | yes (3) | 2568 | rewritten |
| cold-pitch-deck | ambiguous | request / deliverable / planning_strategy | 0.85 | yes (3) | 2620 | rewritten |
| cold-churn-analysis | ambiguous | request / deliverable / data_analysis | 0.85 | yes (3) | 3008 | rewritten |
| cold-learn-rust | ambiguous | request / deliverable / research_learning | 0.70 | yes (3) | 2612 | rewritten |
| deep-build-from-notes | clear | follow_up / deliverable / software | 0.10 | no | 198 | tie |
