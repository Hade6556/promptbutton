# Run comparison — v4.json (A) vs v5.json (B)

| Slice | n | B better | tie | A better | avg length ratio A→B | avg sections A→B |
|---|---|---|---|---|---|---|
| All | 31 | 15 | 4 | 12 | 8.0x → 36.2x | 0.5 → 3.4 |
| Brain dumps (dump-*) | 3 | 1 | 0 | 2 | 2.6x → 7.3x | 5.3 → 8.7 |
| Other ambiguous | 17 | 10 | 0 | 7 | 9.7x → 58.7x | 0.0 → 4.1 |
| Clear | 11 | 4 | 4 | 3 | 7.0x → 9.3x | 0.0 → 0.9 |

Clear cases with master-prompt structure in B (should be none): clear-fully-specified
Answers cut off before finishing: A 0 · B 0 (both runs re-answered with the same 16k cap)

| Case | Tag | Mode (B) | Verdict | Length A→B | Sections A→B | Asked A→B | Cut off A→B |
|---|---|---|---|---|---|---|---|
| cold-blog | ambiguous | request | A | 7.8x→110.3x | 0→9 | y→y | n→n |
| cold-email-boss | ambiguous | request | B | 6.6x→57.1x | 0→9 | y→y | n→n |
| cold-regex | ambiguous | request | B | 14.9x→17.2x | 0→0 | n→n | n→n |
| cold-workout | ambiguous | request | A | 11.9x→112.6x | 0→8 | y→y | n→n |
| cold-explain-k8s | ambiguous | request | B | 13.9x→138.4x | 0→9 | n→y | n→n |
| cold-app-names | ambiguous | request | B | 13.6x→154.6x | 0→9 | y→y | n→n |
| cold-cover-letter | ambiguous | request | A | 9.3x→117.3x | 0→9 | y→y | n→n |
| cold-summarize-nothing | ambiguous | request | B | 16.2x→20.6x | 0→0 | y→y | n→n |
| cold-launch-plan | ambiguous | request | A | 10.1x→99.4x | 0→8 | y→y | n→n |
| cold-kid-story | ambiguous | request | A | 9x→104.5x | 0→8 | y→y | n→n |
| deep-trip-table | ambiguous | follow_up | B | 1.7x→2.6x | 0→0 | n→n | n→n |
| deep-tests-other-component | ambiguous | follow_up | B | 2.1x→2.2x | 0→0 | n→n | n→n |
| deep-sql-fix | ambiguous | follow_up | B | 22.8x→24.5x | 0→0 | n→n | n→n |
| deep-tagline-mix | ambiguous | follow_up | B | 4.8x→5.2x | 0→0 | n→n | n→n |
| deep-resume-rest | ambiguous | follow_up | A | 11.5x→13.9x | 0→0 | n→n | n→n |
| deep-dashboard-metric | ambiguous | follow_up | A | 3.1x→3.7x | 0→0 | n→n | n→n |
| deep-translate-errors | ambiguous | follow_up | B | 5.4x→14.5x | 0→0 | n→y | n→n |
| dump-pricing-page | ambiguous | brain_dump | B | 2.8x→7.5x | 6→10 | n→n | n→n |
| dump-flaky-etl | ambiguous | brain_dump | A | 2.5x→8.8x | 6→8 | n→n | n→n |
| dump-best-man-speech | ambiguous | brain_dump | A | 2.6x→5.7x | 4→8 | n→n | n→n |
| clear-recipe-other-allergy | clear | follow_up | tie | 4.6x→6x | 0→0 | y→n | n→n |
| clear-fix-them | clear | follow_up | B | 19.5x→17.5x | 0→0 | n→n | n→n |
| clear-rewrite-intro | clear | follow_up | A | 13.3x→19.3x | 0→0 | n→n | n→n |
| clear-shorter | clear | follow_up | A | 7.6x→8.2x | 0→0 | n→n | n→n |
| clear-now-in-python | clear | follow_up | tie | 11x→11.8x | 0→0 | n→n | n→n |
| clear-fully-specified | clear | request | A | 1.8x→11.2x | 0→10 | n→n | n→n |
| clear-yes-do-that | clear | follow_up | B | 8.5x→15.3x | 0→0 | n→n | n→n |
| clear-fix-typo | clear | follow_up | tie | 2.4x→2.9x | 0→0 | n→n | n→n |
| clear-numbered-list | clear | follow_up | tie | 1.7x→2.5x | 0→0 | n→n | n→n |
| clear-markdown-table | clear | follow_up | B | 1.9x→1.9x | 0→0 | n→n | n→n |
| clear-unit-convert | clear | request | B | 4.5x→5.6x | 0→0 | n→n | n→n |
