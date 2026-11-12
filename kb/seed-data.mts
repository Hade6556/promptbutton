// The starting contents of the knowledge base: the phrasing lines that used to be hard-coded in
// src/llm/domains.ts, and the structural rules the rewriter's system prompt already follows, each with
// the evidence recorded in docs/master-prompt-playbook.md. Rows marked `own_playbook` have no outside
// source yet; they carry the lowest confidence that is still injected and say so on the sources page.
import type { AppliedIn, SourceType, Stance } from './lib.mts';

export interface SeedEvidence {
  /** An id from sources.json, or one of the extra references below. */
  ref: string;
  quote?: string;
  effect?: string;
  stance?: Stance;
}

export interface SeedTechnique {
  slug: string;
  instruction: string;
  domains?: string[];
  scales?: string[];
  models?: string[];
  avoidWhen?: string;
  appliedIn?: AppliedIn;
  evidence: SeedEvidence[];
}

export const EXTRA_REFS: Record<string, { url: string; title: string; publisher: string; type: SourceType; published: string }> = {
  'anthropic-prompt-improver': { url: 'https://www.anthropic.com/news/prompt-improver', title: 'Improve your prompts in the developer console', publisher: 'Anthropic', type: 'vendor_doc', published: '2024-11' },
  'own-playbook': { url: 'https://firstry.ai/sources.html#house-rules', title: 'Firstry house rule (no outside source yet)', publisher: 'Firstry', type: 'own_playbook', published: '2026-11' },
  'own-eval-2026-11-09': { url: 'https://firstry.ai/sources.html#our-eval', title: 'Firstry eval, 37 conversations, 9 November 2026', publisher: 'Firstry', type: 'own_eval', published: '2026-11' },
};

const HOUSE: SeedEvidence = { ref: 'own-playbook' };

export const SEED: SeedTechnique[] = [
  // ── Injected phrasing, per domain ──────────────────────────────────────────────────────────
  { slug: 'fe-ask-for-full-features', domains: ['frontend_design'], scales: ['deliverable'],
    instruction: 'Include as many relevant features and interactions as possible. Go beyond the basics to create a fully-featured implementation.',
    evidence: [{ ref: 'anthropic-best-practices', quote: 'Include as many relevant features and interactions as possible. Go beyond the basics' }] },
  { slug: 'fe-avoid-generic-ai-aesthetic', domains: ['frontend_design'], scales: ['deliverable'],
    instruction: 'Avoid the generic AI aesthetic: overused fonts (Inter, Roboto, Arial, system fonts), purple-gradient-on-white colour schemes, identical rounded cards, predictable layouts. Commit to one cohesive aesthetic with dominant colours and sharp accents.',
    evidence: [{ ref: 'anthropic-best-practices', effect: 'The frontend design section names these defaults and asks for one committed aesthetic.' }] },
  { slug: 'sw-implement-not-describe', domains: ['software'],
    instruction: 'Implement the change rather than describing it; when something is ambiguous, state the assumption and continue.', evidence: [HOUSE] },
  { slug: 'sw-solve-general-case', domains: ['software'],
    instruction: 'Solve the general case: do not special-case tests or hard-code expected values to make them pass.', evidence: [HOUSE] },
  { slug: 'writing-for-stated-reader', domains: ['writing'],
    instruction: 'Write for the stated reader and build on what they already know.',
    evidence: [{ ref: 'arxiv-2312.16171', effect: 'Principle 2: integrate the intended audience in the prompt. The authors report +57.7% quality on GPT-4 across the 26 principles together.' }] },
  { slug: 'writing-match-users-voice', domains: ['writing'],
    instruction: 'Match the user’s own voice and wording where it is given.',
    evidence: [{ ref: 'arxiv-2312.16171', effect: 'Principle 26: match the language and style of a provided sample.' }] },
  { slug: 'mkt-state-audience', domains: ['marketing_sales'],
    instruction: 'State the audience explicitly and write for them.',
    evidence: [{ ref: 'arxiv-2312.16171', effect: 'Principle 2: integrate the intended audience in the prompt.' }, { ref: 'arxiv-2605.20149', effect: 'Audience was one of three checklist items in prompts that scored 7.50 against 5.67 raw (0–8 rubric).' }] },
  { slug: 'mkt-reason-per-recommendation', domains: ['marketing_sales'],
    instruction: 'Give the one-line reasoning behind each recommendation so it can be challenged.', evidence: [HOUSE] },
  { slug: 'data-reasoning-behind-conclusion', domains: ['data_analysis'],
    instruction: 'State the reasoning behind the main conclusion in two or three lines so it can be checked.', evidence: [HOUSE] },
  { slug: 'learn-explain-at-stated-level', domains: ['research_learning'],
    instruction: 'Explain at the stated level: adjust depth, never accuracy.',
    evidence: [{ ref: 'arxiv-2312.16171', effect: 'Principle 5: ask for an explanation at a stated level of the reader.' }] },
  { slug: 'learn-teach-then-test', domains: ['research_learning'],
    instruction: 'Teach, then test: include a short self-check without giving the answers up front.',
    evidence: [{ ref: 'arxiv-2312.16171', effect: 'Principle 15: teach the topic and include a test, without giving the answers first.' }] },
  { slug: 'plan-reasoning-and-ruled-out', domains: ['planning_strategy'],
    instruction: 'Give the reasoning behind the recommended option in two or three lines, including what was ruled out.', evidence: [HOUSE] },
  { slug: 'creative-distinct-alternatives', domains: ['creative'],
    instruction: 'Produce distinct alternatives and name the idea behind each in a few words.', evidence: [HOUSE] },
  { slug: 'life-amounts-not-general-advice', domains: ['personal_life'],
    instruction: 'Be specific: amounts, durations and schedules, not general advice.', evidence: [HOUSE] },
  { slug: 'ask-explicitly-for-more', domains: ['other'],
    instruction: 'Be specific about the output wanted; when more than the minimum is wanted, ask for it explicitly.',
    evidence: [{ ref: 'anthropic-best-practices', effect: 'Advises asking explicitly when more than the task strictly requires is wanted.' }] },

  // ── Structural rules, already built into the rewriter's system prompt ─────────────────────────
  { slug: 'role-specific-expert', appliedIn: 'system_prompt', scales: ['deliverable'],
    instruction: 'Open with one or two sentences naming the specific practitioner for this task: specialty, what they are known for, what they judge by.',
    avoidWhen: 'Factual lookups and follow-ups: personas do not improve factual accuracy.',
    evidence: [
      { ref: 'arxiv-2305.14688', effect: 'Answers from a task-specific expert identity were preferred 48.5% against 23% for vanilla prompting (GPT-4 judge, 500 samples); a generic "imagine you are an expert" line gave no gain.' },
      { ref: 'arxiv-2308.07702', effect: 'Role-play lifted ChatGPT on 12 reasoning benchmarks, e.g. AQuA 53.5% to 63.8%.' },
      { ref: 'anthropic-best-practices', effect: 'Recommends giving the model a role.' },
      { ref: 'arxiv-2311.10054', stance: 'contradicts', effect: '162 roles across 2,410 factual questions: no or slightly negative effect on accuracy.' },
    ] },
  { slug: 'goal-with-reason', appliedIn: 'system_prompt',
    instruction: 'State the goal in one sentence and say why it matters.',
    evidence: [{ ref: 'anthropic-best-practices', effect: 'Clear, explicit instructions and the motivation behind them give more targeted responses.' }] },
  { slug: 'context-and-audience', appliedIn: 'system_prompt',
    instruction: 'Say who the result is for and carry over the relevant facts from the conversation.',
    evidence: [
      { ref: 'arxiv-2605.20149', effect: 'Checklist prompts covering context and audience scored 7.50 against 5.67 raw (0–8 rubric). Small study, single rater.' },
      { ref: 'arxiv-2312.16171', effect: 'Principle 2: integrate the intended audience.' },
      { ref: 'arxiv-2503.16789', effect: 'Rewriting with conversation history improves responses, more so in longer conversations.' },
    ] },
  { slug: 'checklist-quality-bar', appliedIn: 'system_prompt', scales: ['deliverable'],
    instruction: 'Give four to eight checkable quality criteria drawn from the checklist for this kind of task.',
    evidence: [
      { ref: 'arxiv-2605.20149', effect: 'Checklist-improved prompts scored highest (7.50 of 8) and used the fewest tokens.' },
      { ref: 'arxiv-2312.16171', effect: 'Principle 25: clearly state the requirements the model must follow.' },
    ] },
  { slug: 'affirmative-constraints', appliedIn: 'system_prompt',
    instruction: 'Phrase constraints as what to do, not what to avoid.',
    evidence: [{ ref: 'anthropic-best-practices', effect: 'Advises telling the model what to do instead of what not to do.' }, { ref: 'arxiv-2312.16171', effect: 'Principle 4: use affirmative directives.' }] },
  { slug: 'exact-output-format', appliedIn: 'system_prompt',
    instruction: 'Name the exact output: format, length, language and deliverable.',
    evidence: [
      { ref: 'anthropic-best-practices', effect: 'Advises being specific about the output format and constraints.' },
      { ref: 'anthropic-prompt-improver', effect: 'Vendor-reported: 100% word-count adherence on summaries and +30% accuracy on a multilabel classification test after the improver enforced format.' },
      { ref: 'openai-prompt-generation', effect: 'The meta-prompt always carries an Output Format section.' },
    ] },
  { slug: 'done-when-criteria', appliedIn: 'system_prompt', scales: ['deliverable'],
    instruction: 'End with two to four checkable criteria for when the work is done.',
    evidence: [{ ref: 'anthropic-overview', effect: 'Success criteria are set before prompt engineering starts.' }, { ref: 'openai-prompt-generation', effect: 'Steps and explicit requirements keep multi-step work from skipping parts.' }] },
  { slug: 'only-the-users-own-examples', appliedIn: 'system_prompt',
    instruction: 'Include examples only when the user supplied them, clearly delimited; otherwise ask for one with a placeholder.',
    evidence: [{ ref: 'anthropic-best-practices', effect: 'Calls examples one of the most reliable ways to steer format, tone and structure.' }, { ref: 'arxiv-2406.06608', effect: 'Few-shot prompting was among the most consistently effective of 58 techniques surveyed.' }] },
  { slug: 'mark-assumptions-never-invent', appliedIn: 'system_prompt',
    instruction: 'Never turn a gap into an invented fact: mark each default (assumed), list the assumptions once, and leave unknowns as [placeholders].',
    evidence: [{ ref: 'openai-prompt-generation', effect: 'The meta-prompt preserves user content and does not add facts.' }, HOUSE] },
  { slug: 'labelled-sections', appliedIn: 'system_prompt', scales: ['deliverable'],
    instruction: 'Split a long prompt into labelled sections or tags.',
    evidence: [
      { ref: 'anthropic-best-practices', effect: 'XML tags help the model parse complex prompts unambiguously.' },
      { ref: 'arxiv-2312.16171', effect: 'Principles 8 and 17: sections and delimiters.' },
      { ref: 'openai-prompt-engineering', effect: 'Recommends Markdown or XML delimiters and an order of identity, instructions, examples, context.' },
    ] },
  { slug: 'no-forced-step-by-step', appliedIn: 'system_prompt',
    instruction: 'Do not add "think step by step"; ask instead for the reasoning behind the main recommendation.',
    evidence: [{ ref: 'openai-prompt-engineering', effect: 'Reasoning models do better with high-level goals than with prescribed thinking steps.' }] },
  { slug: 'clarify-only-when-ambiguous', appliedIn: 'system_prompt',
    instruction: 'Ask a clarifying question only when the draft is ambiguous; never on a clear one.',
    evidence: [
      { ref: 'arxiv-2212.07769', effect: 'Clarification helps on ambiguous inputs and penalises unambiguous ones.' },
      { ref: 'own-eval-2026-11-09', effect: 'The gate asked on 60% of ambiguous drafts and on 0% of clear ones (37 cases).' },
    ] },
  { slug: 'specific-over-long', appliedIn: 'system_prompt',
    instruction: 'Every line must be checkable or change the answer; do not repeat context.',
    evidence: [{ ref: 'arxiv-2605.20149', effect: 'The highest-scoring prompts were also the shortest.' }, { ref: 'arxiv-2406.06608', effect: 'Duplicated context hurt accuracy in a case study.' }] },
];
