// Per-domain playbooks: what a top practitioner pins down before starting, what excellent looks
// like. The gap analysis classifies the domain; the rewriter gets the matching playbook in the user turn
// and must cover every checklist item — from the draft, the conversation or the user's answers, otherwise
// as an "(assumed)" default. The proven phrasing that used to live here is now in the knowledge base
// (kb/, compiled to kb.generated.ts): each line there carries its sources and an evidence score.
//
// Why checklists rather than a bigger word budget: in the 2026 structured-prompting comparison the
// checklist-improved prompts scored 7.50 vs 5.67 raw while using fewer tokens (arXiv 2605.20149).
// Why a specific expert line: a detailed, task-specific identity beat vanilla prompting 48.5% vs 23%,
// while the generic "imagine you are an expert" changed nothing (ExpertPrompting, arXiv 2305.14688).
// Sources for the individual lines: docs/master-prompt-playbook.md.
import type { Domain } from '../messaging';
import { KB_VERSION, selectTechniques, type KbQuery, type KbTechnique } from './kb';

export interface DomainPlaybook {
  /** The kind of practitioner the role line should describe. */
  expertHint: string;
  /** What the practitioner pins down before starting. Each item is covered or marked (assumed). */
  checklist: string[];
  /** What excellent looks like — concrete and checkable. */
  qualityBar: string[];
  /** The deliverable when the user did not say. */
  defaultOutput: string;
  /** The questions whose answers change the master prompt most; the gap analysis asks these first. */
  askFirst: string[];
}

export const DOMAINS = [
  'frontend_design',
  'software',
  'writing',
  'marketing_sales',
  'data_analysis',
  'research_learning',
  'planning_strategy',
  'creative',
  'personal_life',
  'other',
] as const satisfies readonly Domain[];

export const DOMAIN_LABELS: Record<Domain, string> = {
  frontend_design: 'web pages, landing pages, UI, the visible layer of apps',
  software: 'code, bugs, scripts, APIs, architecture, data pipelines',
  writing: 'emails, posts, essays, docs, speeches, reports',
  marketing_sales: 'campaigns, ads, positioning, pricing, outreach, growth',
  data_analysis: 'metrics, SQL, statistics, spreadsheets, findings from data',
  research_learning: 'explain, teach, compare, summarise, review the literature',
  planning_strategy: 'plans, roadmaps, decisions, OKRs, business cases',
  creative: 'stories, names, taglines, concepts, scripts, art direction',
  personal_life: 'health, fitness, food, travel, money, home, relationships',
  other: 'anything else',
};

export const DOMAIN_PLAYBOOKS: Record<Domain, DomainPlaybook> = {
  frontend_design: {
    expertHint:
      'a senior product designer who also ships production front-end code, known for pages a stranger understands in five seconds and that look nothing like a template',
    checklist: [
      'Purpose of the page or screen and the single primary action a visitor should take',
      'Who lands on it, what they already believe, and the objection that stops them',
      'Sections in order (for a landing page: hero, proof, how it works, pricing or offer, FAQ, footer) and the job of each',
      'Brand: name, tone, existing colours, fonts and logo; reference sites the user likes or dislikes',
      'Typography and colour direction, and the one memorable element that carries the design',
      'Motion: one orchestrated moment (page load or key reveal) rather than scattered hover effects; respects reduced-motion',
      'Responsive: correct at 375 px, 768 px and 1280 px with no horizontal scroll',
      'Accessibility: visible focus states, text contrast of at least 4.5:1, real labels and alt text',
      'Performance: one web font at most, compressed images, no heavy libraries unless needed',
      'Stack and deliverable: a single HTML file with inline CSS and JS, or the user’s framework; where it will be hosted',
      'Copy: the user’s real copy, or placeholder copy in their voice clearly marked for replacement — never lorem ipsum',
      'Success: the metric (sign-ups, demo requests, clicks) and how it is tracked',
    ],
    qualityBar: [
      'Looks designed for this product, not for any product: a visitor can tell what it is and for whom in five seconds',
      'Clear hierarchy: one headline and one primary button above the fold; everything else quieter',
      'Every section earns its place; none is filler',
      'Real states included: hover, focus, loading, empty and error, plus a working mobile menu',
      'Valid, commented, runnable code with no missing assets',
    ],
    defaultOutput: 'A single HTML file with embedded CSS and JavaScript, responsive, with placeholder copy marked for replacement',
    askFirst: ['What is the page for, and what should a visitor do on it?', 'Who lands on it?', 'A single HTML file, or your framework?'],
  },

  software: {
    expertHint:
      'a staff engineer in the user’s stack who writes the code, the tests and the explanation, and has debugged this class of problem before',
    checklist: [
      'Language, framework and versions; runtime, OS and package manager',
      'What already exists (files, functions, schema, APIs) and what must not change',
      'Exact expected behaviour, including edge cases and failure modes',
      'For bugs: the error text, how to reproduce it, and what changed recently',
      'Inputs, outputs and data shapes, with one concrete example of each',
      'Constraints: performance, security, allowed dependencies, lint and style rules, backwards compatibility',
      'Tests: what to add or update and how to run them',
      'Deliverable: full file, diff, snippet, or a plan first',
    ],
    qualityBar: [
      'Code runs as given: imports, types and names resolve; nothing left as "..."',
      'Edge cases and errors handled explicitly, not with silent fallbacks',
      'Changes limited to what was asked; existing behaviour preserved unless told otherwise',
      'Each non-obvious decision explained in one line, trade-offs named',
      'Tests cover the change, and a short "how to verify" is included',
    ],
    defaultOutput: 'Working code in the user’s language plus a short explanation of the approach and how to verify it',
    askFirst: ['Which language or framework, and which version?', 'What exactly should happen, and what happens now?', 'Full file, diff, or a plan first?'],
  },

  writing: {
    expertHint: 'an editor who writes in this genre for a living and knows what its best readers expect',
    checklist: [
      'Who reads it, what they already know, and what they should think, feel or do afterwards',
      'The one message, and the two or three supporting points in priority order',
      'Genre and venue (email, blog, LinkedIn, speech, docs page) and its conventions',
      'Voice and tone: formal or casual, first or third person, warmth, humour — with a sample of the user’s voice if available',
      'Length as a number: words, minutes spoken, or paragraphs',
      'Facts, names, dates and links that must appear; topics and clichés to leave out',
      'Structure: subject line or headline, opening hook, sections, call to action, sign-off',
      'Language and regional spelling',
    ],
    qualityBar: [
      'A reader can state the main point after one read',
      'Concrete nouns and verbs; no filler adjectives and no "in today’s fast-paced world" openers',
      'Sounds like the user: the first sentence is specific to them, not a template',
      'Length within 10% of the target; format matches the venue',
      'Nothing invented about the user’s facts — gaps stay as [placeholders]',
    ],
    defaultOutput: 'The finished text, ready to send or publish, with [placeholders] for facts only the user has',
    askFirst: ['Who is it for?', 'What should they do or feel after reading it?', 'Tone and length?'],
  },

  marketing_sales: {
    expertHint: 'a growth marketer who has run this exact play before and judges copy by measured conversion, not taste',
    checklist: [
      'Product, the specific customer segment, and the problem they have today',
      'The outcome — sign-ups, demos, revenue, retention — and the current baseline if known',
      'Channel and format: email sequence, paid ad, landing section, cold outreach, pricing page',
      'Positioning: the differentiator, main competitors, and proof (numbers, logos, quotes)',
      'Offer and call to action; pricing or trial details',
      'Voice and brand rules; compliance limits (claims, consent and spam law, platform rules)',
      'Variants to test and the metric that decides',
      'Length and number of pieces',
    ],
    qualityBar: [
      'Leads with the customer’s problem or outcome, not the product’s features',
      'Every claim is specific and backed, or marked as needing proof',
      'One clear call to action per piece',
      'Variants differ in one meaningful dimension so a test is readable',
      'In the brand’s voice, and passes the "would a real person say this" test',
    ],
    defaultOutput: 'The copy or plan itself, plus a short rationale and the metric to watch',
    askFirst: ['Who is the customer and what problem are we solving?', 'How will the result be measured?', 'Channel and format?'],
  },

  data_analysis: {
    expertHint:
      'a senior analyst who starts from the decision the numbers will drive, checks data quality first, and shows the reasoning behind every conclusion',
    checklist: [
      'The decision or question the analysis feeds, and who makes it',
      'Data available: source, grain, columns, time range, size, known quality issues',
      'Exact metric definitions (how "active user" or "churn" is computed)',
      'Segments and comparisons that matter; the baseline or benchmark',
      'Tools and output: SQL dialect, Python/pandas, spreadsheet, BI tool, chart types',
      'Rigor needed: directional vs significance-tested; sample sizes',
      'Caveats to state: confounders, seasonality, missing data',
      'Deliverable: query, notebook, chart, memo or dashboard spec, and its length',
    ],
    qualityBar: [
      'Opens with the answer and its confidence, then the evidence',
      'Metric definitions are explicit; numbers can be reproduced from the stated query or steps',
      'Data-quality checks and caveats are stated, not buried',
      'Charts use the right type, labelled axes, and a title that states the finding',
      'Ends with a recommended next step or decision, not just a description',
    ],
    defaultOutput: 'A short findings memo (answer first, evidence, caveats, next step) plus the code or query used',
    askFirst: ['What decision will this inform?', 'What data do you have (source, columns, period)?', 'A query, a chart, or written findings?'],
  },

  research_learning: {
    expertHint: 'a teacher who is also a practitioner: explains from what the learner already knows, with examples and a way to check understanding',
    checklist: [
      'The learner’s current level and background',
      'Why they need it (exam, job, decision, curiosity) and by when',
      'Depth: overview, working knowledge or expert; time available',
      'Form: explanation, analogy, worked examples, exercises, reading list or study plan',
      'Scope: what to include and what to leave out',
      'Sources: how recent, whether citations are needed, primary vs secondary',
      'A check for understanding: questions, a small project or a self-test',
      'Language and length',
    ],
    qualityBar: [
      'Starts from the learner’s level and builds in order; no undefined terms',
      'Each concept has one concrete example and one common misconception corrected',
      'Claims are current and sourced where it matters; uncertainty is stated',
      'Ends with a way to practise or verify understanding',
      'Length fits the time the learner has',
    ],
    defaultOutput: 'A structured explanation with examples, followed by a short self-check',
    askFirst: ['What do you already know about this?', 'What do you need it for, and how deep?', 'An explanation, exercises, or a plan?'],
  },

  planning_strategy: {
    expertHint: 'an operator who has shipped plans like this and is judged on whether they held up under real constraints',
    checklist: [
      'The goal, how success is measured, and the deadline or horizon',
      'Who decides, who executes, who must be consulted',
      'Constraints: budget, people, time, dependencies, policy',
      'Current state, what has been tried, known risks and unknowns',
      'Options considered and the criteria to choose between them',
      'Level of detail: phases, week by week, or a task list with owners',
      'Checkpoints and the trigger to change course',
      'Format: one-pager, table, sequenced list or slide outline',
    ],
    qualityBar: [
      'Recommendation first, with the trade-off it accepts',
      'Every step has an owner, a date or sequence, and a visible output',
      'Each risk has a mitigation or an explicit acceptance',
      'Assumptions are listed so they can be checked',
      'Fits the requested length; nothing generic that could apply to any plan',
    ],
    defaultOutput: 'A one-page plan: goal, recommendation, phased steps with owners and dates, risks, open questions',
    askFirst: ['What is the goal and the deadline?', 'Which constraints are fixed (budget, people, tech)?', 'Who decides, and how detailed should it be?'],
  },

  creative: {
    expertHint: 'a working creative in this form who can generate many distinct options and say what makes each one work',
    checklist: [
      'The form (story, poem, names, tagline, concept, script) and the occasion or use',
      'Audience and the effect wanted: laugh, move, intrigue, reassure',
      'Tone, style references and anti-references ("not like X")',
      'Elements that must appear (characters, facts, words, themes) and ones to avoid',
      'Length and number of options',
      'Constraints: language, rhyme or meter, rating; for names, trademark and domain availability concerns',
      'Whether to rank the options and explain the choice',
    ],
    qualityBar: [
      'Options are genuinely different from each other, not variations of one idea',
      'Specific to the brief: uses its details rather than generic tropes',
      'The chosen tone is sustained; no slide into a cliché ending',
      'Length and count exactly as asked',
      'If ranked, each ranking states its reason in one line',
    ],
    defaultOutput: 'Several distinct options (five unless told otherwise) with one line on the idea behind each',
    askFirst: ['Who is it for, and what should it make them feel?', 'Tone and references?', 'How many options, and how long?'],
  },

  personal_life: {
    expertHint: 'a practitioner (coach, dietitian, travel planner, adviser) who personalises to the user’s situation and says when to see a professional',
    checklist: [
      'The user’s situation: the relevant facts (level, constraints, location, budget, time)',
      'The goal and the timeframe',
      'Preferences and dislikes; what has been tried',
      'Hard limits: health conditions, allergies, injuries, legal or financial constraints',
      'Equipment, ingredients or resources available',
      'Format: plan, list, schedule, step by step, or comparison',
      'Safety: when to defer to a professional',
    ],
    qualityBar: [
      'Tailored to the stated situation; nothing that ignores a stated limit',
      'Specific and actionable: amounts, times, names — not general advice',
      'Flags real risks and when to see a professional, without hedging everything',
      'Fits the time and budget stated',
    ],
    defaultOutput: 'A concrete plan or list the user can follow this week',
    askFirst: ['What is your situation and goal?', 'Any limits (health, budget, time, equipment)?', 'What have you tried?'],
  },

  other: {
    expertHint: 'the specialist whose job is exactly this task',
    checklist: [
      'The goal and why it matters',
      'Who it is for',
      'What already exists or has been decided',
      'Constraints: scope, time, tools, things that must not change',
      'Format and length of the result',
      'Success criteria',
      'Examples of good or bad, if any',
    ],
    qualityBar: [
      'Does the right task for the right person',
      'Concrete over generic: specifics from the user’s situation throughout',
      'Constraints respected; stated format and length',
      'Nothing invented — gaps stay as [placeholders] or (assumed) defaults',
    ],
    defaultOutput: 'The deliverable in the format that fits the task, with assumptions listed',
    askFirst: ['What should the result achieve?', 'Who is it for?', 'What format and length?'],
  },
};

const bullets = (items: string[]) => items.map((item) => `- ${item}`).join('\n');

/**
 * The playbook as a block for the rewrite's user turn. The "proven phrasing" lines come from the
 * knowledge base, matched to the domain, scale and the model being written for; their ids are named in
 * the block so a rewrite can be traced to the techniques that shaped it. `techniques: []` leaves them
 * out, which is how the eval measures what the knowledge base adds.
 */
export function playbookBlock(domain: Domain, query: Omit<KbQuery, 'domain'> = {}, techniques: KbTechnique[] = selectTechniques({ domain, ...query })): string {
  const p = DOMAIN_PLAYBOOKS[domain];
  const phrasing = techniques.length
    ? `\nProven phrasing to include where it fits the task (knowledge base ${KB_VERSION}: ${techniques.map((t) => t.id).join(', ')}):\n${bullets(techniques.map((t) => t.instruction))}`
    : '';
  return `<domain_playbook domain="${domain}">
Expert to describe in the Role line: ${p.expertHint}.
Pin down (cover every item: from the draft, the conversation or the answers when known, otherwise as a one-line default marked (assumed)):
${bullets(p.checklist)}
Excellent looks like (turn into the Quality bar, specific to this case):
${bullets(p.qualityBar)}${phrasing}
Default deliverable when the user did not say: ${p.defaultOutput} (assumed)
</domain_playbook>`;
}

/** Domain criteria + ask-first hints for the gap-analysis system prompt (built once; the prompt stays frozen). */
export function domainGuide(): string {
  return DOMAINS.map((d) => `- ${d}: ${DOMAIN_LABELS[d]}. Ask first: ${DOMAIN_PLAYBOOKS[d].askFirst.join(' · ')}`).join('\n');
}
