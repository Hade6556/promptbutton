# Master-prompt playbook — what backs the rewrite

PromptButton's rewriter has three modes. **Follow-up** (short reply in a live chat) and **request**
(a mostly clear ask) are tightened, not expanded. **Brain dump** (long, loose, multi-part) is turned
into a *master prompt*. This file lists the components that mode uses and the evidence for each.
The system prompt that applies them is `src/llm/prompts.ts` (`REWRITE_SYSTEM`).

## The structure, and why each part is there

| Section in the master prompt | Why | Source |
|---|---|---|
| **Goal** — one sentence; several goals → ordered | Clear, explicit instructions beat vague ones; "think of Claude as a brilliant but new employee who lacks context" | Anthropic, *Be clear and direct* [1] |
| **Context** — who it's for, why it matters, relevant facts | "Providing context or motivation behind your instructions … help[s] it deliver more targeted responses"; context/audience was one of three checklist items that lifted quality 5.67 → 7.50 / 8 | Anthropic, *Add context* [1]; structured-prompting study [4] |
| **Task** — numbered steps when order/completeness matters | "Provide instructions as sequential steps using numbered lists" | Anthropic [1]; OpenAI "specify the steps" [3] |
| **Constraints** — scope, tone, tech, don'ts | Rules were part of the winning checklist ("roles/rules") | [4] |
| **Output** — exact format, length, language | "Be specific about the output format and constraints you want"; Prompt Improver enforces output format and reached 100% word-count adherence in its test | Anthropic [1], [2] |
| **Done when** — 2–4 checkable criteria | Success criteria are the precondition Anthropic puts *before* prompt engineering; OpenAI: rubrics/TODOs keep multi-step work from skipping steps | Anthropic, *Overview* [1]; OpenAI [3] |
| **Examples** — only the user's own, clearly delimited | "Examples are one of the most reliable ways to steer output format, tone, and structure"; few-shot is the most robust technique across 1,500+ papers | Anthropic [1]; Prompt Report [5] |
| **Open questions** — placeholders or explicit assumptions | Never invent; "models can't read your mind" | OpenAI [3] |
| **Role line** — only when expertise framing changes the answer | "Even a single sentence makes a difference" — but a tell when added everywhere | Anthropic, *Give Claude a role* [1] |
| **"Think through the approach first"** — only for reasoning tasks | The Prompt Improver's first step is a dedicated reasoning section; CoT is the second most robust technique; skip it for simple writing | [2], [5] |
| **Labelled sections / XML tags** | Tags "help Claude parse complex prompts unambiguously"; OpenAI orders identity → instructions → examples → context with Markdown/XML boundaries | Anthropic, *XML tags* [1]; OpenAI [3] |

## Rules the rewriter keeps in every mode

- **Don't duplicate context.** Removing an accidentally duplicated paragraph *improved* accuracy in the Prompt Report's case study [5]. The rewrite deduplicates the dump instead of restating it.
- **Don't pad.** The checklist prompts in [4] produced the *shortest* answers (683 tokens vs 962 raw) while scoring highest — structure, not length, is what helps.
- **Ask before rewriting only when it pays.** Clarifying questions beat raw prompts (6.67 vs 5.67) but lost to a good checklist (7.50) and doubled the turns [4]; forced clarification hurts on clear requests [6]. That is why the gate asks at most three questions, only above an ambiguity threshold, and brain dumps get a structured rewrite rather than an interrogation.
- **Context-aware rewriting helps more the longer the conversation** [7], so the screenshot/transcript is always in the loop.

## Sources

1. Anthropic — *Prompting best practices* (Be clear and direct · Add context · Use examples effectively · Structure prompts with XML tags · Give Claude a role · Communication style and verbosity). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices and the *Prompt engineering overview* (success criteria first). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
2. Anthropic — *Improve your prompts in the developer console* (Prompt Improver: chain-of-thought section, example standardisation, example enrichment, rewriting, output-format enforcement; +30% accuracy on a multilabel classification test; 100% word-count adherence on summaries). https://claude.com/blog/prompt-improver
3. OpenAI — *Prompt engineering* guide (developer-message sections: identity, instructions, examples, context; Markdown/XML delimiters; diverse few-shot examples; explicit steps for non-reasoning models, high-level goals for reasoning models; rubrics/TODO lists). https://developers.openai.com/api/docs/guides/prompt-engineering
4. *Less Back-and-Forth: A Comparative Study of Structured Prompting* (arXiv 2605.20149, 2026). Raw 5.67 · clarifying 6.67 · checklist 7.50 (0–8 rubric) across summarisation, planning, explanation, coding on three models; checklist = roles/rules + context/audience + answer format. Small study, single-rater rubric — directional, not definitive. https://arxiv.org/html/2605.20149
5. Schulhoff et al. — *The Prompt Report* (arXiv 2406.06608): 58 text techniques; few-shot and chain-of-thought most consistently effective; duplicated context hurt accuracy in a case study. https://arxiv.org/html/2406.06608v5
6. Kuhn et al. — *CLAM: Selective Clarification for Ambiguous Questions* (arXiv 2212.07769): clarification helps on ambiguous inputs and imposes a large penalty on unambiguous ones. https://arxiv.org/abs/2212.07769v2
7. Sarkar et al. — *Conversational User-AI Intervention: A Study on Prompt Rewriting* (arXiv 2503.16789): rewriting with conversation history improves responses, more so in longer conversations. https://arxiv.org/abs/2503.16789v1

Measured on our own cases by `npm run eval` (`eval/README.md`); the brain-dump cases are tagged `dump-*`.
