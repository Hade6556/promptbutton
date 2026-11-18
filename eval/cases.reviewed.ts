// Review of the 140 model-written cases in cases.generated.ts, so the lab eval can reach 100+ drafts.
//
// Who: an AI reviewer (Claude) working for the developer, 18 November 2026. No person has checked it yet.
//
// How: every case was read in full (id, tag, site, history, draft, intent) and compared with the 60
// hand-written cases in cases.ts and with the other model-written cases. A case was rejected when:
//   - not-typed:  the draft is not something a real person would type into a chat box;
//   - wrong-tag:  a "clear" draft that needs more information, or an "ambiguous" draft that is already
//                 complete (the intent adds nothing a competent answer would not do, so asking first
//                 would be a false ask);
//   - intent:     the intent contradicts the draft, or depends on facts no clarifying question could
//                 draw out, so the judge would mark down any reasonable answer;
//   - history:    the earlier messages contradict the draft;
//   - duplicate:  another case with the same tag has the same situation and the same expected answer;
//   - needs-material: answering needs a tool, a file, a link or live data, including an earlier
//                 message that is only a bracketed placeholder when the intent depends on its content.
// Two calls were made the same way as in the hand-written set, and so did not count against a case:
// "clear" drafts written like a short spec (kb-dashboard-ui and kb-sql-report read the same way), and
// specific facts in an "ambiguous" intent that a clarifying question could draw out (cold-kid-story's
// excavators). A "clear" draft that is the complete version of a hand-written "ambiguous" one
// (pricing section, A/B test) was kept: it tests the opposite gate decision.
//
// Before a number that includes these cases is published, a person should skim every rejection below
// and a sample of the accepted ones (about 20, two per domain) and move any id they disagree with.
//
// EVAL_SET=reviewed in run.mts and judge.mts uses the hand-written cases plus REVIEWED_IDS (selectCases).
import { CASES, type EvalCase } from './cases';
import { GENERATED } from './cases.generated';

/** Model-written cases accepted for the lab eval, in the order of cases.generated.ts. */
export const REVIEWED_IDS: readonly string[] = [
  // frontend
  'gen-frontend-bakery-landing-hero-copy-1',
  'gen-frontend-dashboard-table-too-cramped-2',
  'gen-frontend-dentist-booking-form-clear-3',
  'gen-frontend-button-colors-shorter-versio-4',
  'gen-frontend-wedding-site-rsvp-section-5',
  'gen-frontend-saas-pricing-page-tiers-6',
  'gen-frontend-portfolio-feels-boring-fix-7',
  'gen-frontend-school-newsletter-email-temp-9',
  'gen-frontend-mobile-nav-hamburger-broken-10',
  'gen-frontend-gym-signup-onboarding-screen-11',
  'gen-frontend-realtor-listing-card-compone-12',
  'gen-frontend-charity-donate-page-hero-13',
  'gen-frontend-font-pairing-law-firm-14',
  // software
  'gen-software-csv-dedupe-python-script-2',
  'gen-software-rest-pagination-design-choic-3',
  'gen-software-regex-uk-postcode-validation-4',
  'gen-software-airflow-dag-retry-logic-5',
  'gen-software-django-n-plus-one-7',
  'gen-software-legacy-php-migration-plan-8',
  'gen-software-bash-backup-rotate-script-9',
  'gen-software-api-rate-limiter-redis-12',
  'gen-software-spreadsheet-to-api-sync-13',
  // writing
  'gen-writing-retirement-speech-for-cowork-1',
  'gen-writing-landlord-mold-complaint-emai-2',
  'gen-writing-bakery-instagram-launch-post-3',
  'gen-writing-cover-letter-career-change-5',
  'gen-writing-school-newsletter-fundraiser-6',
  'gen-writing-apology-email-missed-deadlin-7',
  'gen-writing-linkedin-post-layoff-announc-9',
  'gen-writing-essay-intro-climate-migratio-10',
  'gen-writing-hoa-meeting-minutes-cleanup-11',
  'gen-writing-product-update-email-custome-12',
  'gen-writing-eulogy-for-grandmother-13',
  'gen-writing-internal-policy-remote-work--14',
  // marketing
  'gen-marketing-saas-pricing-tier-rethink-2',
  'gen-marketing-cold-email-dental-clinics-3',
  'gen-marketing-gym-referral-program-design-4',
  'gen-marketing-wine-shop-newsletter-shorter-5',
  'gen-marketing-realtor-facebook-ad-copy-6',
  'gen-marketing-b2b-positioning-statement-lo-7',
  'gen-marketing-tutoring-flyer-headline-idea-8',
  'gen-marketing-webinar-signup-dropoff-9',
  'gen-marketing-coffee-roaster-subscription--10',
  'gen-marketing-festival-sponsor-pitch-follo-11',
  'gen-marketing-etsy-listing-seo-candles-12',
  'gen-marketing-car-dealer-q4-sales-push-13',
  'gen-marketing-linkedin-post-funding-news-14',
  // data
  'gen-data-churn-rate-dip-explain-1',
  'gen-data-pivot-table-sales-reps-2',
  'gen-data-ab-test-significance-check-3',
  'gen-data-survey-likert-averaging-ques-4',
  'gen-data-sql-duplicate-customers-dedu-5',
  'gen-data-school-test-scores-followup-6',
  'gen-data-restaurant-covers-forecast-7',
  'gen-data-cohort-retention-query-clear-8',
  'gen-data-warehouse-picking-errors-cor-9',
  'gen-data-household-energy-bills-trend-11',
  'gen-data-clinic-wait-times-median-12',
  'gen-data-marketing-attribution-findin-13',
  'gen-data-farm-yield-fertilizer-compar-14',
  // research
  'gen-research-explain-photosynthesis-to-ki-1',
  'gen-research-compare-loan-amortization-me-2',
  'gen-research-literature-review-remote-nur-3',
  'gen-research-summarise-meeting-notes-shor-4',
  'gen-research-learn-sourdough-science-5',
  'gen-research-compare-ww1-causes-essay-7',
  'gen-research-explain-inflation-follow-up-8',
  'gen-research-guitar-theory-modes-10',
  'gen-research-clear-compare-heat-pumps-11',
  'gen-research-clear-teach-spanish-subjunct-13',
  'gen-research-clear-crop-rotation-comparis-14',
  // planning
  'gen-planning-bakery-expansion-decision-1',
  'gen-planning-saas-quarterly-okrs-draft-2',
  'gen-planning-wedding-planning-timeline-3',
  'gen-planning-clinic-scheduling-business-c-4',
  'gen-planning-career-switch-roadmap-5',
  'gen-planning-farm-crop-rotation-plan-6',
  'gen-planning-nonprofit-annual-fundraising-7',
  'gen-planning-restaurant-menu-cut-decision-8',
  'gen-planning-product-roadmap-shorten-9',
  'gen-planning-freelancer-pricing-strategy-10',
  'gen-planning-school-tech-rollout-plan-11',
  'gen-planning-rent-vs-buy-decision-12',
  'gen-planning-warehouse-strategy-memo-revi-13',
  'gen-planning-retirement-side-business-pla-14',
  // creative
  'gen-creative-bakery-name-ideas-1',
  'gen-creative-gym-tagline-shorter-3',
  'gen-creative-short-film-script-scene-4',
  'gen-creative-poster-art-direction-5',
  'gen-creative-podcast-name-brainstorm-6',
  'gen-creative-wedding-toast-poem-7',
  'gen-creative-fantasy-world-concept-8',
  'gen-creative-product-launch-video-script-9',
  'gen-creative-mural-concept-library-10',
  'gen-creative-horror-flash-fiction-clear-11',
  'gen-creative-coffee-brand-taglines-clear-12',
  'gen-creative-character-names-scifi-clear-13',
  'gen-creative-comic-strip-rewrite-clear-14',
  // personal
  'gen-personal-knee-pain-running-return-1',
  'gen-personal-lisbon-anniversary-weekend-p-3',
  'gen-personal-apology-text-to-sister-4',
  'gen-personal-credit-card-debt-payoff-orde-5',
  'gen-personal-mould-bathroom-rental-flat-6',
  'gen-personal-beginner-gym-split-three-7',
  'gen-personal-wedding-gift-amount-question-8',
  'gen-personal-meal-prep-high-protein-9',
  'gen-personal-thailand-vaccines-two-weeks-10',
  'gen-personal-boyfriend-moving-in-talk-11',
  'gen-personal-sleep-schedule-night-shift-12',
  'gen-personal-kitchen-renovation-budget-sp-13',
  'gen-personal-shorter-retirement-savings-r-14',
  // other
  'gen-other-dog-keeps-barking-night-2',
  'gen-other-garden-shed-permit-question-3',
  'gen-other-rewrite-complaint-shorter-4',
  'gen-other-choir-rehearsal-schedule-pla-5',
  'gen-other-retirement-gift-coworker-ide-6',
  'gen-other-moving-checklist-cross-count-8',
  'gen-other-car-noise-diagnosis-help-10',
  'gen-other-volunteer-signup-email-draft-12',
  'gen-other-tenant-deposit-dispute-lette-13',
  'gen-other-camping-trip-food-plan-14',
];

export type RejectRule = 'not-typed' | 'wrong-tag' | 'intent' | 'history' | 'duplicate' | 'needs-material';

export interface Rejection {
  id: string;
  rule: RejectRule;
  /** One line a person can check against the case. */
  reason: string;
}

/** Model-written cases left out of the lab eval, with why. */
export const REJECTED: readonly Rejection[] = [
  { id: 'gen-frontend-restaurant-menu-dark-mode-8', rule: 'needs-material', reason: 'The CSS to change is only "[pasted ~120 lines]", and the intent wants just the new and changed rules of that file.' },
  { id: 'gen-software-flaky-test-ci-failure-1', rule: 'duplicate', reason: 'Same as hand-written kb-bug-flaky: a Jest test failing about 1 run in 5 in CI, fake timers, ranked causes and a fixed test.' },
  { id: 'gen-software-shorten-error-message-copy-6', rule: 'wrong-tag', reason: '"too long, theyre on mobile" with the four messages in the history is as complete as hand-written clear-shorter; the intent adds nothing a good shortening would not do.' },
  { id: 'gen-software-explain-segfault-c-code-10', rule: 'wrong-tag', reason: 'The code is in the draft and has one answer (s is an uninitialised pointer); asking questions before answering would be a false ask.' },
  { id: 'gen-software-kafka-consumer-lag-spike-11', rule: 'wrong-tag', reason: 'The draft answers the questions the assistant just asked, so it is complete; the intent only adds "ordered by effort", which a good answer does anyway.' },
  { id: 'gen-software-commit-message-cleanup-rewri-14', rule: 'wrong-tag', reason: 'The history lists the four changes and the draft names Conventional Commits, so the four messages are fully determined.' },
  { id: 'gen-writing-grant-report-shorter-version-4', rule: 'needs-material', reason: 'The section to cut is only "[about 450 words …]", and the intent asks to keep a sentence of a pupil story that appears nowhere.' },
  { id: 'gen-writing-wedding-speech-make-funnier-8', rule: 'duplicate', reason: 'Same as hand-written kb-speech (best-man speech for Tomas, clean because grandparents attend); the speech is also a placeholder and the intent adds a road-trip habit nobody mentions.' },
  { id: 'gen-marketing-bakery-instagram-launch-capt-1', rule: 'duplicate', reason: 'Same as gen-writing-bakery-instagram-launch-post-3: an Instagram caption for a small bakery’s new bake, playful, a word limit, local hashtags, an order or urgency line.' },
  { id: 'gen-data-dashboard-metric-definitions-10', rule: 'needs-material', reason: 'The definitions to shorten are only a placeholder, and the intent requires keeping a definition of "active" that appears nowhere in the conversation.' },
  { id: 'gen-research-teach-me-excel-pivot-6', rule: 'duplicate', reason: 'Same as gen-data-pivot-table-sales-reps-2: beginner pivot-table steps for monthly totals per person; only the spreadsheet app differs.' },
  { id: 'gen-research-review-study-on-coffee-9', rule: 'needs-material', reason: 'The draft’s "[link]" is a placeholder and the intent asks for a check of that study’s sample, design and confounders.' },
  { id: 'gen-research-clear-summarise-paper-abstra-12', rule: 'needs-material', reason: 'The abstract to summarise is only "[pasted]", so no answer can report its findings.' },
  { id: 'gen-creative-bedtime-story-dragon-2', rule: 'duplicate', reason: 'Same as hand-written cold-kid-story: a gentle bedtime story for a young child who is nervous about starting school.' },
  { id: 'gen-personal-cheap-dinners-family-four-2', rule: 'duplicate', reason: 'Same as hand-written kb-meal-plan: five weeknight dinners for a family with a vegetarian, quick, about €60, shopping list by aisle.' },
  { id: 'gen-other-wedding-toast-for-sister-1', rule: 'duplicate', reason: 'Same as hand-written kb-speech: a short wedding toast with one camping-trip story, nothing embarrassing, ending on a toast.' },
  { id: 'gen-other-funeral-eulogy-grandfather-d-7', rule: 'duplicate', reason: 'Same as gen-writing-eulogy-for-grandmother-13: a clear 4–5 minute eulogy for a grandparent who raised four children after the spouse died young, with one light moment.' },
  { id: 'gen-other-book-club-discussion-questio-9', rule: 'not-typed', reason: '"(fictional, about three sisters …)" is the generator saying it made the book up; no book-club host would write that.' },
  { id: 'gen-other-pick-paint-color-continue-11', rule: 'wrong-tag', reason: 'With the colour chosen and the room described, "what about trim and ceiling" can be answered as is; the intent adds nothing a good answer would not give.' },
];

export const EVAL_SETS = ['hand', 'reviewed'] as const;
export type EvalSet = (typeof EVAL_SETS)[number];

/** EVAL_SET, defaulting to the hand-written set. Throws on an unknown name so a typo never runs the wrong set. */
export function parseEvalSet(value: string | undefined): EvalSet {
  const name = value?.trim() || 'hand';
  if ((EVAL_SETS as readonly string[]).includes(name)) return name as EvalSet;
  throw new Error(`EVAL_SET=${value} is not a case set. Use one of: ${EVAL_SETS.join(', ')}.`);
}

const GENERATED_IDS = new Set(GENERATED.map((c) => c.id));
const ACCEPTED = new Set(REVIEWED_IDS);

/** True for a model-written case id, accepted or not. */
export const isGenerated = (id: string): boolean => GENERATED_IDS.has(id);
/** True for a model-written case that passed review. */
export const isReviewed = (id: string): boolean => ACCEPTED.has(id);

/**
 * The review covers one version of cases.generated.ts. If that file is regenerated, the ids change and
 * the review no longer applies, so the reviewed set refuses to run rather than quietly shrink.
 */
function assertReviewMatchesGenerated(): void {
  const rejected = new Set(REJECTED.map((r) => r.id));
  const both = REVIEWED_IDS.filter((id) => rejected.has(id));
  const unknown = [...REVIEWED_IDS, ...rejected].filter((id) => !GENERATED_IDS.has(id));
  const unreviewed = GENERATED.filter((c) => !ACCEPTED.has(c.id) && !rejected.has(c.id)).map((c) => c.id);
  const problems = [
    both.length ? `accepted and rejected: ${both.join(', ')}` : '',
    unknown.length ? `not in cases.generated.ts: ${unknown.join(', ')}` : '',
    unreviewed.length ? `not reviewed: ${unreviewed.join(', ')}` : '',
  ].filter(Boolean);
  if (problems.length) throw new Error(`eval/cases.reviewed.ts does not match eval/cases.generated.ts; review the cases again.\n${problems.join('\n')}`);
}

/** The model-written cases that passed review. */
export function reviewedCases(): EvalCase[] {
  assertReviewMatchesGenerated();
  return GENERATED.filter((c) => ACCEPTED.has(c.id));
}

/** The cases a run uses: hand-written only, or hand-written plus the reviewed model-written ones. */
export function selectCases(set: EvalSet): EvalCase[] {
  return set === 'hand' ? CASES : [...CASES, ...reviewedCases()];
}
