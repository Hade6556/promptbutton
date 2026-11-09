# Run comparison — baseline-v3.json (A) vs v4.json (B)

| Slice | n | B better | tie | A better | avg length ratio A→B | avg sections A→B |
|---|---|---|---|---|---|---|
| All | 31 | 12 | 6 | 13 | 15.8x → 8.0x | 0.6 → 0.4 |
| Brain dumps (dump-*) | 3 | 2 | 0 | 1 | 4.1x → 2.6x | 6.7 → 4.0 |
| Other ambiguous | 17 | 5 | 3 | 9 | 18.7x → 9.7x | 0.0 → 0.0 |
| Clear | 11 | 5 | 3 | 3 | 14.6x → 7.0x | 0.0 → 0.0 |

Clear cases with master-prompt structure in B (should be none): none

| Case | Tag | Mode (B) | Verdict | Length A→B | Sections A→B | Asked A→B |
|---|---|---|---|---|---|---|
| cold-blog | ambiguous | request | A | 15.3x→7.8x | 0→0 | y→y |
| cold-email-boss | ambiguous | request | A | 8.6x→6.6x | 0→0 | y→y |
| cold-regex | ambiguous | request | B | 26.9x→14.9x | 0→0 | n→n |
| cold-workout | ambiguous | request | B | 21.3x→11.9x | 0→0 | y→y |
| cold-explain-k8s | ambiguous | request | B | 25.9x→13.9x | 0→0 | n→n |
| cold-app-names | ambiguous | request | tie | 17.3x→13.6x | 0→0 | y→y |
| cold-cover-letter | ambiguous | request | B | 25.6x→9.3x | 0→0 | y→y |
| cold-summarize-nothing | ambiguous | request | tie | 17.1x→16.2x | 0→0 | y→y |
| cold-launch-plan | ambiguous | request | A | 22x→10.1x | 0→0 | y→y |
| cold-kid-story | ambiguous | request | A | 12.3x→9x | 0→0 | y→y |
| deep-trip-table | ambiguous | follow_up | A | 4.1x→1.7x | 0→0 | n→n |
| deep-tests-other-component | ambiguous | follow_up | B | 5.1x→2.1x | 0→0 | n→n |
| deep-sql-fix | ambiguous | follow_up | A | 65x→22.8x | 0→0 | n→n |
| deep-tagline-mix | ambiguous | follow_up | A | 9.3x→4.8x | 0→0 | n→n |
| deep-resume-rest | ambiguous | follow_up | tie | 21.3x→11.5x | 0→0 | n→n |
| deep-dashboard-metric | ambiguous | follow_up | A | 5.7x→3.1x | 0→0 | n→n |
| deep-translate-errors | ambiguous | follow_up | A | 15.3x→5.4x | 0→0 | y→n |
| dump-pricing-page | ambiguous | brain_dump | A | 4.9x→2.8x | 8→6 | n→n |
| dump-flaky-etl | ambiguous | brain_dump | B | 4.1x→2.5x | 5→6 | n→n |
| dump-best-man-speech | ambiguous | brain_dump | B | 3.3x→2.6x | 7→0 | n→n |
| clear-recipe-other-allergy | clear | follow_up | B | 10.4x→4.6x | 0→0 | n→y |
| clear-fix-them | clear | follow_up | A | 31.6x→19.5x | 0→0 | n→n |
| clear-rewrite-intro | clear | follow_up | B | 58.7x→13.3x | 0→0 | n→n |
| clear-shorter | clear | follow_up | A | 11.8x→7.6x | 0→0 | n→n |
| clear-now-in-python | clear | follow_up | B | 23.7x→11x | 0→0 | n→n |
| clear-fully-specified | clear | request | tie | 1.8x→1.8x | 0→0 | n→n |
| clear-yes-do-that | clear | follow_up | A | 8.5x→8.5x | 0→0 | n→n |
| clear-fix-typo | clear | follow_up | tie | 3.7x→2.4x | 0→0 | n→n |
| clear-numbered-list | clear | follow_up | tie | 2.9x→1.7x | 0→0 | n→n |
| clear-markdown-table | clear | follow_up | B | 2.7x→1.9x | 0→0 | n→n |
| clear-unit-convert | clear | request | B | 4.6x→4.5x | 0→0 | n→n |
