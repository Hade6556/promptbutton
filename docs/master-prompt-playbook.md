# Master-prompt playbook — what backs the rewrite

PromptButton's rewriter decides three things per draft, all classified once by the gap analysis and
handed over as `mode`, `scale` and `domain`:

- **Follow-up** (a short reply inside a live chat) and **quick** drafts (a lookup, a conversion, a
  tiny edit) are tightened, never expanded.
- Everything else — a **request** or **brain dump** for a *deliverable* (build, write, design, plan,
  analyse, decide, fix) — becomes a **master prompt**: the brief a top practitioner would want before
  starting, built against a per-domain checklist. This is the default; the "Concise" setting turns it
  off.

"i want to build a landing page" is the canonical case. v4 tightened it to two sentences and our
eval showed the cost (overall preference 52% → 45%). v5 expands it to roughly 1,200–2,500 characters.
The system prompt that applies the rules is `src/llm/prompts.ts` (`REWRITE_SYSTEM`); the checklists
are `src/llm/domains.ts`.

## The structure, and why each part is there

| Section in the master prompt | Why | Source |
|---|---|---|
| **Role** — one or two sentences naming the *specific* practitioner: specialty, known for, judges by | A detailed, task-specific expert identity beat vanilla prompting 48.5% vs 23% (GPT-4 judge); the generic "imagine you are an expert" changed nothing. Personas do not improve *factual* accuracy, so the role is omitted for lookups and follow-ups and used for generative work, where role-play does help | ExpertPrompting [8]; Zheng et al. & Wharton on the limits [9]; Kong et al. on reasoning gains [10]; Anthropic, *Give Claude a role* [1] |
| **Goal** — one sentence, plus why it matters | Clear, explicit instructions beat vague ones; "providing context or motivation behind your instructions … help[s] it deliver more targeted responses" | Anthropic, *Be clear and direct*, *Add context* [1] |
| **Context** — who it's for, relevant facts from the chat | Context/audience was one of three checklist items that lifted quality 5.67 → 7.50 / 8; "integrate the intended audience in the prompt" (principle 2) | [4]; Principled Instructions [11] |
| **Task** — numbered deliverables; asks explicitly for more than the minimum | "If you want Claude to do more than the task strictly requires, explicitly request it"; the dashboard example adds "Include as many relevant features and interactions as possible. Go beyond the basics" | Anthropic [1]; OpenAI meta-prompt `# Steps` [3] |
| **Quality bar** — 4–8 checkable lines from the domain checklist | Checklist-improved prompts scored highest *and* used fewer tokens than raw + clarifying: quality comes from covering the right checklist, not from bulk; "clearly state the requirements that the model must follow" (principle 25) | [4]; [11] |
| **Constraints** — phrased as what to do | "Tell Claude what to do instead of what not to do"; affirmative directives (principle 4) | Anthropic, *Control the format* [1]; [11] |
| **Output** — exact format, length, language, deliverable | "Be specific about the output format and constraints you want"; Prompt Improver reached 100% word-count adherence; OpenAI's template always carries `# Output Format` | Anthropic [1], [2]; OpenAI [3] |
| **Done when** — 2–4 checkable criteria | Success criteria come *before* prompt engineering in Anthropic's guide; OpenAI: rubrics keep multi-step work from skipping steps | Anthropic, *Overview* [1]; OpenAI [3] |
| **Examples** — only the user's own, clearly delimited | "Examples are one of the most reliable ways to steer output format, tone, and structure"; few-shot is the most robust technique across 1,500+ papers | Anthropic [1]; Prompt Report [5] |
| **Assumptions** — the `(assumed)` defaults in one place, then `[placeholders]` | Never invent; "models can't read your mind". Collecting the choices lets the user flip them in seconds | OpenAI [3] |
| **Labelled sections / XML tags** | Tags "help Claude parse complex prompts unambiguously"; labelled sections and delimiters (principles 8, 17); OpenAI orders role → instructions → steps → output format → examples | Anthropic, *XML tags* [1]; [11]; OpenAI [3] |

## Domain playbooks (v5)

The gap analysis classifies the task into one of ten domains (front-end/design, software, writing,
marketing & sales, data analysis, research & learning, planning & strategy, creative, personal life,
other). Each has a hand-written playbook with: the expert to describe, a "pin down" checklist, what
excellent looks like, phrasing shown to work, and a default deliverable. The rewriter must cover every
checklist item — from the draft, the chat or the user's answers when known, otherwise as a one-line
default marked `(assumed)`. It never turns a gap into an invented fact.

The front-end playbook carries Anthropic's own frontend guidance: ask for a fully-featured
implementation, and avoid the "AI slop" defaults (overused fonts, purple gradients on white,
cookie-cutter layouts) in favour of one committed aesthetic [1, *Frontend design*]. The writing and
marketing playbooks lean on the audience and style principles [11]; the learning playbook on "explain
at the stated level" and "teach, then test" (principles 5, 15).

The same playbooks tell the gap analysis which questions change the master prompt most (front-end:
purpose and primary action, audience, stack; writing: reader, effect, tone and length; analysis: the
decision it feeds, the data; planning: goal and deadline, fixed constraints, who decides).

## Guardrails

- **Classification is decided once.** The gap analysis sets `mode` (`follow_up` / `request` / `brain_dump`), `scale` (`deliverable` / `quick`), `domain` and a one-sentence `expert`, and hands them to the rewriter, so the two passes cannot disagree.
- **Follow-ups and quick asks stay short.** No role, no structure; the v4 caps still apply (≈1.5× the draft for follow-ups, 2× for quick asks). Expanding "convert 72°F to Celsius" into a brief would be noise.
- **Length guide, not cap, for master prompts.** The user turn carries a target range (1,200–2,500 characters, ceiling 3,500 for long dumps) and the playbook; the rewrite may exceed it only when the user asked for copy, examples or code to be included.
- **Specificity over bulk.** Every line must be checkable or change the answer; no filler adjectives without the criterion next to them. This is the checklist study's lesson [4], kept in the expansion.
- **Choices are marked `(assumed)`** and repeated once under *Assumptions*, so defaults are visible and editable, never presented as the user's requirements.
- **No "think step by step".** The targets reason on their own; prescribed thinking steps make reasoning models worse (OpenAI: give reasoning models high-level goals; Anthropic: *Overthinking and excessive thoroughness*). Analysis and planning tasks get a Done-when criterion asking for the reasoning behind the main recommendation.
- **Example sketch, never example content.** When output shape matters and the user gave none, a single placeholder line asks for one.
- **Refine = revise.** A follow-up instruction is applied to the previous rewrite word for word, not regenerated.
- **"Concise" setting.** Tray menu (desktop), popup (extension) and the playground expose `depth`; concise returns to v4 behaviour for every mode.

## Measured (v5, 2026-11-09)

`npm run eval`, 37 cases with hidden intent, pairwise position-swapped judge (`eval/results/summary-v5.md`):

| Slice | n | Rewrite preferred | Tie | Original preferred |
|---|---|---|---|---|
| All cases | 37 | 59% | 24% | 16% |
| Cold first messages | 20 | 75% | 15% | 10% |
| Conversations with ≥5 earlier messages | 5 | 40% | 40% | 20% |

Earlier versions on the same judge: v3 52%, v4 (tighten-only) 45%. False-ask rate on clear drafts: 0%.
All 17 master prompts cleared the 1,200-char floor (median 2,634 chars); no follow-up or quick ask was expanded.

Head to head, v4 vs v5 on the 31 shared cases, both answered under the same 16k output cap
(`eval/results/compare-v4-v5.md`): v5 better 15 · tie 4 · v4 better 12. v5 took the ambiguous
non-dump cases 10–7 and the clear cases 4–3; the lighter v4 prompt still won 5 of the 10 cold
writing/personal one-liners (blog, cover letter, kid story, workout, launch plan) and 2 of 3 brain
dumps — a master prompt can over-specify a writing task. Two harness lessons: the answering model
must not be capped low (thinking counts toward `max_tokens`; a 3k cap left answers empty and read as
losses), and three master prompts drove answers past 16k tokens. Prompt .8 therefore adds a length
target to every Output section and a rule against multiplying deliverables ("for each week list five
things"); on a spot check the Rust study plan fell from 26k to 11k characters and finished, the pitch
deck from 8k to 4k, while full code deliverables (a landing page, a multi-file dashboard) still run
past 16k tokens by design.

Caveats: one judge model, 37 cases, and the hidden-intent design rewards rewrites that guess the
intent right — directional, not definitive.

## Rules the rewriter keeps in every mode

- **Don't duplicate context.** Removing an accidentally duplicated paragraph *improved* accuracy in the Prompt Report's case study [5]. The rewrite deduplicates instead of restating.
- **Ask before rewriting only when it pays.** Clarifying questions beat raw prompts (6.67 vs 5.67) but lost to a good checklist (7.50) and doubled the turns [4]; forced clarification hurts on clear requests [6]. The gate asks at most three questions, only above the threshold, and the questions come from the domain's ask-first list.
- **Context-aware rewriting helps more the longer the conversation** [7], so the transcript or screenshot is always in the loop.

## Sources

1. Anthropic — *Prompting best practices* (Be clear and direct · Add context · Use examples effectively · Structure prompts with XML tags · Give Claude a role · Control the format of responses · Frontend design, incl. the `<frontend_aesthetics>` snippet · Migration: "frame your instructions with modifiers"). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices — and the *Prompt engineering overview* (success criteria first). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
2. Anthropic — *Improve your prompts in the developer console* (Prompt Improver: chain-of-thought section, example standardisation and enrichment, rewriting, output-format enforcement; +30% accuracy on a multilabel classification test; 100% word-count adherence on summaries — vendor-reported). https://www.anthropic.com/news/prompt-improver
3. OpenAI — *Prompt generation* (the meta-prompt behind the Playground's Generate button: one-line task → details → `# Steps` → `# Output Format` → `# Examples` → `# Notes`; preserve user content; reasoning before conclusions). https://developers.openai.com/api/docs/guides/prompt-generation — and the *Prompt engineering* guide (identity, instructions, examples, context; Markdown/XML delimiters; high-level goals for reasoning models). https://developers.openai.com/api/docs/guides/prompt-engineering
4. *Less Back-and-Forth: A Comparative Study of Structured Prompting* (arXiv 2605.20149, 2026). Raw 5.67 · clarifying 6.67 · checklist 7.50 (0–8 rubric) across summarisation, planning, explanation, coding on three models; checklist prompts used the fewest tokens. Small study, single-rater rubric — directional. https://arxiv.org/abs/2605.20149
5. Schulhoff et al. — *The Prompt Report* (arXiv 2406.06608): 58 text techniques; few-shot and chain-of-thought most consistently effective; duplicated context hurt accuracy in a case study. https://arxiv.org/html/2406.06608v5
6. Kuhn et al. — *CLAM: Selective Clarification for Ambiguous Questions* (arXiv 2212.07769): clarification helps on ambiguous inputs and penalises unambiguous ones. https://arxiv.org/abs/2212.07769v2
7. Sarkar et al. — *Conversational User-AI Intervention: A Study on Prompt Rewriting* (arXiv 2503.16789): rewriting with conversation history improves responses, more so in longer conversations. https://arxiv.org/abs/2503.16789v1
8. Xu et al. — *ExpertPrompting: Instructing Large Language Models to be Distinguished Experts* (arXiv 2305.14688): an LLM-written, task-specific expert identity; answers preferred 48.5% vs 23% over vanilla (GPT-4 judge, 500 samples); the static "imagine you are an expert" line produced answers of the same length and no gain. https://arxiv.org/abs/2305.14688
9. Zheng et al. — *Is "A Helpful Assistant" the Best Role for Large Language Models?* (arXiv 2311.10054, 162 roles × 2,410 factual questions: no or slightly negative effect on accuracy) https://arxiv.org/abs/2311.10054 — and Wharton Generative AI Labs, *Prompting Science Report 4: Playing Pretend — Expert Personas Don't Improve Factual Accuracy* (arXiv 2512.05858). https://arxiv.org/abs/2512.05858
10. Kong et al. — *Better Zero-Shot Reasoning with Role-Play Prompting* (arXiv 2308.07702): role-play lifted ChatGPT on 12 reasoning benchmarks, e.g. AQuA 53.5% → 63.8%, Last Letter 23.8% → 84.2%. https://arxiv.org/abs/2308.07702
11. Bsharat, Myrzakhan & Shen — *Principled Instructions Are All You Need for Questioning LLaMA-1/2, GPT-3.5/4* (arXiv 2312.16171): 26 principles; the authors report +57.7% quality and +36.4% correctness on GPT-4 (human-rated ATLAS benchmark). Used here: audience (2), affirmative directives (4), explain at a level (5), few-shot (7), sections (8), teach-then-test (15), role (16), delimiters (17), "detailed text with all the information necessary" (21), explicit requirements (25), match the sample's language and style (26). https://arxiv.org/abs/2312.16171
12. Miessler — *fabric* `improve_prompt` pattern (community prompt-improver: persona, details, delimiters, steps, examples, output length). https://github.com/danielmiessler/fabric/blob/main/data/patterns/improve_prompt/system.md

Measured on our own cases by `npm run eval` (`eval/README.md`); one-line deliverables are the `cold-*` cases, brain dumps `dump-*`, and v4-vs-v5 comparisons live in `eval/results/`.
