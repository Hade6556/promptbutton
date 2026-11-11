import type { HistoryMessage } from '../src/messaging';
import { GENERATED } from './cases.generated';

export type CaseTag = 'ambiguous' | 'clear';

export interface EvalCase {
  id: string;
  /** What we expect the gate to do: ask on `ambiguous`, go straight to rewrite on `clear`. */
  tag: CaseTag;
  site: string;
  history: HistoryMessage[];
  draft: string;
  /** Ground truth of what the user actually wanted. Hidden from the rewriter; seen only by the simulated user and the judge. */
  intent: string;
}

const u = (text: string): HistoryMessage => ({ role: 'user', text });
const a = (text: string): HistoryMessage => ({ role: 'assistant', text });

/** The hand-written cases. ALL_CASES adds the model-written ones from cases.generated.ts. */
export const CASES: EvalCase[] = [
  // ─── Cold starts, underspecified ─────────────────────────────────────────────
  {
    id: 'cold-blog',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'write a blog post about ai',
    intent:
      'An ~800-word blog post for small-business owners about practical uses of AI in customer support, friendly and concrete, with three real examples and a short checklist at the end. No hype.',
  },
  {
    id: 'cold-email-boss',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'write an email to my boss about the project',
    intent:
      'Tell my manager the data-migration project will slip by two weeks because the vendor API was delayed, propose 28 November as the new date, and ask for a 15-minute call this week. Concise and professional, not apologetic.',
  },
  {
    id: 'cold-regex',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'regex for emails',
    intent:
      'A JavaScript regex that validates everyday email addresses (not full RFC 5322), rejects spaces and missing TLDs, with a two-line explanation and three test cases including one that should fail.',
  },
  {
    id: 'cold-workout',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'give me a workout plan',
    intent:
      'A beginner strength plan, three days a week, at home with only a pair of adjustable dumbbells, 30 minutes per session, knee-friendly (no deep lunges or jumping).',
  },
  {
    id: 'cold-explain-k8s',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'explain kubernetes',
    intent:
      'Explain Kubernetes to a frontend developer who already uses Docker, in about 300 words, with one analogy, covering pods, deployments and services only.',
  },
  {
    id: 'cold-app-names',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'names for my app',
    intent:
      'Ten name ideas for a habit-tracking app aimed at university students: short, easy to spell, playful but not childish, with a note on whether the .com is likely available.',
  },
  {
    id: 'cold-cover-letter',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'cover letter for the job',
    intent:
      'A cover letter for a junior data analyst role at a fintech, from a recent economics graduate with one internship doing SQL reporting, under 250 words, confident but not boastful.',
  },
  {
    id: 'cold-summarize-nothing',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'summarize this',
    intent:
      'Summarize a 12-page PDF about EU AI Act compliance obligations for small SaaS companies into five bullet points for a non-lawyer founder. (The document was never attached.)',
  },
  {
    id: 'cold-launch-plan',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'plan for launching our product',
    intent:
      'A six-week launch plan for a B2B invoicing Chrome extension, team of two, no paid ads budget, focused on Product Hunt, two niche communities and a founder-led LinkedIn series, as a week-by-week checklist.',
  },
  {
    id: 'cold-kid-story',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'write a story for my kid',
    intent:
      'A bedtime story for a six-year-old who loves excavators and is nervous about starting school, about 400 words, gentle, with a calm ending.',
  },

  // ─── Deep in a conversation, vague references ────────────────────────────────
  {
    id: 'deep-trip-table',
    tag: 'ambiguous',
    site: 'claude',
    history: [
      u("I'm planning a 5-day trip to Lisbon in late March with my partner. We like food markets, walking, and small museums. Budget is about €150/day for the two of us excluding the flat."),
      a('Great brief. Here is a 5-day outline: Day 1 Alfama and the Sé, Day 2 Belém and LX Factory, Day 3 Sintra day trip, Day 4 Mouraria food walk and Gulbenkian, Day 5 Cascais by train. Want me to go deeper on any day?'),
      u('Day 3 looks too packed. We don’t want to be on a train before 9 and we want a long lunch.'),
      a('Understood. Revised Day 3: 9:40 train to Sintra, Quinta da Regaleira first, long lunch at Tascantiga around 13:30, then Pena Palace gardens only, back by 18:00.'),
    ],
    draft: 'ok now do the same for the other one and put it all in a table',
    intent:
      'Apply the same rules (no train before 9, a long lunch) to Day 5, the Cascais trip, then present all five days as one table with columns for time, activity, notes and rough cost.',
  },
  {
    id: 'deep-tests-other-component',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [
      u('I have two Vue 3 components: CreditsWalletModal shows the credits balance and recent top-ups; CreditsBalanceAlertForm lets the user set a low-balance alert threshold and toggle email alerts.'),
      a('Got it. What would you like to do with them?'),
      u('Write unit tests for the form with Vitest and Testing Library. One thing: the Save button must be disabled while the threshold field is empty.'),
      a('Here is CreditsBalanceAlertForm.test.ts covering rendering, the disabled Save button while the threshold is empty, enabling it once a value is typed, the email toggle, and the submit payload. (test file follows)'),
      u('nice, that passes'),
      a('Great. Want tests for the modal as well?'),
    ],
    draft: 'now do the same for the other one but also check the thing we talked about',
    intent:
      'Write Vitest + Testing Library unit tests for CreditsWalletModal (balance rendering, recent top-ups list, empty state, close button) and also assert that the modal reflects the saved low-balance threshold from the form. Same style as the first test file.',
  },
  {
    id: 'deep-sql-fix',
    tag: 'ambiguous',
    site: 'claude',
    history: [
      u('This Postgres query takes 9 seconds:\nSELECT c.id, c.email, (SELECT MAX(created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order FROM customers c WHERE c.country = \'LT\';'),
      a('The correlated subquery runs once per customer. Try an index on orders(customer_id, created_at) first and tell me if it helps.'),
      u("it's still slow, about 6 seconds"),
      a('Can you paste the EXPLAIN ANALYZE output?'),
      u('Seq Scan on customers (rows=480000) Filter: country = LT; SubPlan 1: Index Only Scan on orders_customer_created_idx (loops=120000)'),
    ],
    draft: 'fix it',
    intent:
      'Rewrite the query as a LEFT JOIN against a grouped subquery (or LATERAL) so the orders table is scanned once, add an index on customers(country), and explain in two sentences why the correlated subquery was slow.',
  },
  {
    id: 'deep-tagline-mix',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [
      u('Taglines for our coffee subscription landing page hero. Audience: remote workers who buy specialty coffee.'),
      a('1. Better coffee, every morning.\n2. Your favourite roasters, delivered before you run out.\n3. Never hit the bottom of the bag again.\n4. Specialty coffee on autopilot.\n5. The last coffee subscription you will try.'),
      u('I like 2 and 3'),
      a('Both lean on the “never run out” benefit; 2 adds the roaster-quality angle, 3 has the wordplay. Want variations on either?'),
    ],
    draft: 'mix 2 and 3 but make it punchier',
    intent:
      'Combine tagline 2’s roaster-quality benefit with tagline 3’s “bottom of the bag” wordplay into a single hero tagline of at most six words, with three alternatives.',
  },
  {
    id: 'deep-resume-rest',
    tag: 'ambiguous',
    site: 'claude',
    history: [
      u('Rewrite my resume bullets:\n- Responsible for managing the team’s sprint process\n- Was involved in migrating the monolith to microservices\n- Helped improve test coverage\n- Participated in on-call rotation\n- Mentored two junior developers\n- Worked on reducing cloud costs'),
      a('- Ran sprint planning and retros for a 7-person team\n- Led the migration of the billing monolith to microservices\n(…and so on for all six)'),
      u('too corporate, I want it to sound like a person wrote it'),
      a('- Kept a 7-person team’s sprints on track and cut planning time in half\n- Led the move of our billing monolith to services, zero downtime'),
      u('better, keep going like that'),
      a('Shall I redo the remaining four bullets in that voice?'),
    ],
    draft: 'do the rest',
    intent:
      'Rewrite the remaining four bullets (test coverage, on-call, mentoring, cloud costs) in the same plain, human voice as the last two, keep any numbers, each under 20 words.',
  },
  {
    id: 'deep-dashboard-metric',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [
      u('I am building a sales dashboard in React with Recharts. Data is monthly: { month, revenue, refunds }.'),
      a('Nice. What do you want to show first?'),
      u('a chart of revenue'),
      a('Here is a BarChart of revenue by month with a tooltip. (code)'),
      u('make it show the trend instead'),
      a('Switched to a LineChart with a monotone line for revenue. (code)'),
    ],
    draft: 'add the other metric too and make it look nicer',
    intent:
      'Add refunds as a second line in a contrasting colour with a legend, format the tooltip values as EUR currency, use consistent margins, and keep the chart responsive.',
  },
  {
    id: 'deep-translate-errors',
    tag: 'ambiguous',
    site: 'claude',
    history: [
      u('Translate these UI strings to Lithuanian: Save, Cancel, Settings, Log out, Search'),
      a('Išsaugoti, Atšaukti, Nustatymai, Atsijungti, Ieškoti'),
    ],
    draft: 'now the error messages',
    intent:
      'Translate six error messages into Lithuanian: “Something went wrong”, “Invalid email address”, “Password is too short”, “Session expired, please log in again”, “File is too large (max 10 MB)”, “No internet connection”. Keep the same formal register as the UI strings.',
  },

  // ─── Brain dumps: should become structured master prompts ────────────────────
  {
    id: 'dump-pricing-page',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft:
      'ok so pricing page. ours is confusing, 5 tiers nobody gets it, support keeps getting "which plan do i need" tickets. competitors have 3. we have starter/pro/business/enterprise/custom lol. also the toggle monthly/yearly is hidden. idk if we should kill the free tier, marketing wants it, finance hates it. want copy too not just layout. and some way to test it, we have like 2k visitors/day on that page. SMBs mostly, 5-50 people companies, invoicing tool. make it good',
    intent:
      'A brief for redesigning the pricing page of an SMB invoicing SaaS: recommend collapsing 5 tiers to 3 with a rationale, decide what to do with the free tier (keep it but reposition it, with the finance concern addressed), make the monthly/yearly toggle prominent, write draft copy (name, one-line value prop, 3 feature bullets) per tier, and propose 3 A/B tests runnable at ~2k visitors/day with the metric for each. Under 600 words, structured.',
  },
  {
    id: 'dump-flaky-etl',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft:
      'the nightly etl keeps failing like 2x a week, airflow, python, pulls from the orders postgres replica into bigquery. sometimes timeout sometimes "connection reset", sometimes it just hangs till the 2h sla kills it. started maybe 3 weeks ago, we did upgrade the replica around then?? idk. no budget for new infra. i need to stop getting paged. also the retries make duplicates in bq which is its own mess. help',
    intent:
      'A diagnostic plan and fix proposal for a flaky Airflow/Python ETL from a Postgres replica to BigQuery: ranked hypotheses tied to the replica upgrade (connection/timeouts/statement_timeout, pooling), concrete checks for each, a fix for idempotency so retries do not create duplicates (merge/dedupe by key), and a short runbook. No new infrastructure. Output as a numbered runbook plus a one-paragraph summary for the on-call channel.',
  },
  {
    id: 'dump-best-man-speech',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft:
      "best man speech for tomas. known him since uni, he was the guy who organised everything, trips, the flat, he once drove 6 hours to pick me up when my car died. his wife is ieva, met at a climbing gym 4 years ago, she made him less of a workaholic. there's the story about the lost passport in bangkok but his mum will be there so maybe not. wedding is in lithuanian but speech in english, some guests don't speak it. 3 min max i get nervous. not cheesy please",
    intent:
      'A best-man speech for Tomas, about 3 minutes (≈400 words), in simple English for a mixed-language audience, warm with light humour and not cheesy, using the uni/organiser stories and the 6-hour drive, mentioning Ieva and the climbing-gym meeting and how she balanced his workaholism, skipping the Bangkok passport story, ending with a toast; with short sentences that are easy to deliver nervously.',
  },

  // ─── Clear in context: the gate should not ask ───────────────────────────────
  {
    id: 'clear-recipe-other-allergy',
    tag: 'clear',
    site: 'chatgpt',
    history: [
      u('Vegan lasagna recipe for 6 please. One guest has a nut allergy.'),
      a('Here is a vegan lasagna for six with a cashew-free béchamel made from blended white beans… (recipe)'),
      u('oh and no soy either'),
      a('Updated: swapped the tofu ricotta for a sunflower-seed and spinach ricotta. (recipe)'),
      u('great'),
    ],
    draft: 'what about the other allergy',
    intent: 'Confirm the recipe is also nut-free (the first message mentioned a nut allergy) and point out any hidden nut sources to double-check, such as pesto or store-bought pasta.',
  },
  {
    id: 'clear-fix-them',
    tag: 'clear',
    site: 'claude',
    history: [
      u('Review this:\ndef avg(xs):\n    total = 0\n    for x in xs: total += x\n    return total / len(xs)'),
      a('Three issues: 1) ZeroDivisionError on an empty list, 2) no type hints, 3) sum() is clearer than the manual loop.'),
    ],
    draft: 'fix them',
    intent: 'Return the full corrected function applying all three points, returning None for an empty list, with type hints and a one-line docstring.',
  },
  {
    id: 'clear-rewrite-intro',
    tag: 'clear',
    site: 'chatgpt',
    history: [
      u('Feedback on my college essay intro? "Ever since I was young I have always been interested in how things work. This curiosity has led me to pursue engineering."'),
      a('It opens on a cliché and tells rather than shows. Start with a specific moment, e.g. the first thing you took apart, and let the interest in engineering emerge from it. Keep first person.'),
    ],
    draft: 'rewrite it',
    intent: 'Rewrite the intro following that feedback: open on a specific moment, first person, under 120 words.',
  },
  {
    id: 'clear-shorter',
    tag: 'clear',
    site: 'claude',
    history: [
      u('Write a 3-paragraph product update email to our existing customers announcing dark mode in our invoicing app. Friendly tone, no hype, end with a link to the changelog.'),
      a('Subject: Dark mode is here\n\nHi there,\n\nYou asked, and it’s ready: dark mode is now available across the invoicing app… (three paragraphs)\n\nRead the full changelog →'),
    ],
    draft: 'make it shorter',
    intent: 'The same email cut to roughly half the length, keeping the subject line, friendly tone and the changelog link.',
  },
  {
    id: 'clear-now-in-python',
    tag: 'clear',
    site: 'chatgpt',
    history: [
      u('Write a debounce function in JavaScript'),
      a('function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }'),
    ],
    draft: 'now in Python',
    intent: 'The same debounce helper in Python, as a decorator using threading.Timer, with a short usage example.',
  },
  {
    id: 'clear-fully-specified',
    tag: 'clear',
    site: 'claude',
    history: [],
    draft:
      'Write a 150-word product description for a 750 ml stainless steel water bottle aimed at day hikers. Include three bullet-point features (double-wall insulation, leak-proof lid, carabiner loop). UK English, no superlatives, no exclamation marks.',
    intent: 'Exactly what the draft says.',
  },
  {
    id: 'clear-yes-do-that',
    tag: 'clear',
    site: 'chatgpt',
    history: [
      u('Write a Node function that fetches JSON from a URL and returns the parsed body'),
      a('(code using fetch) Want me to add error handling for network failures and non-2xx responses?'),
    ],
    draft: 'yes do that',
    intent: 'Add error handling for network failures and non-2xx responses to the function shown, throwing a descriptive error.',
  },
  {
    id: 'clear-fix-typo',
    tag: 'clear',
    site: 'claude',
    history: [
      u('Write a two-sentence welcome message for new forum members'),
      a('Welcome aboard! We are glad you are here. You will recieve a short tour of the forum in your inbox shortly.'),
    ],
    draft: "fix the typo in the second sentence — 'recieve'",
    intent: 'Return the message with “recieve” corrected to “receive” and nothing else changed.',
  },
  {
    id: 'clear-numbered-list',
    tag: 'clear',
    site: 'chatgpt',
    history: [
      u('Give me tips for running a good retrospective'),
      a('Set a clear goal. Start with a check-in. Time-box each section. Collect items silently first. Group similar items. Vote on what to discuss. Agree on owners for actions. Follow up next time. (each explained in a paragraph)'),
    ],
    draft: 'turn this into a numbered list with one sentence each',
    intent: 'The same eight tips as a numbered list, one sentence per tip, same order.',
  },
  {
    id: 'clear-markdown-table',
    tag: 'clear',
    site: 'claude',
    history: [
      u('Compare the MacBook Air 13, ThinkPad X1 Carbon and Dell XPS 13 for a student who travels a lot'),
      a('(three paragraphs comparing price, weight, battery life, and a verdict for each)'),
    ],
    draft: 'put the comparison into a markdown table with columns price, weight, battery, verdict',
    intent: 'A markdown table with the three laptops as rows and the four requested columns, using the figures from the comparison.',
  },
  {
    id: 'clear-unit-convert',
    tag: 'clear',
    site: 'chatgpt',
    history: [],
    draft: 'convert 72°F to Celsius',
    intent: 'The temperature in Celsius (about 22.2 °C), one line.',
  },

  // ─── One-line deliverables: should become full master prompts ────────────────
  {
    id: 'cold-landing-page',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'i want to build a landing page',
    intent:
      'A single-file HTML/CSS/JS landing page for "Ledgerly", an invoicing tool for freelancers, whose job is free-trial sign-ups: a hero with one headline, one subline and one call to action, three benefit sections with short copy, a pricing block (free, and €9 per month), an FAQ and a footer. Distinctive look rather than a purple-gradient template, correct at 375 px, visible focus states, and placeholder copy clearly marked where facts are unknown.',
  },
  {
    id: 'cold-saas-dashboard',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'make me a dashboard for my app',
    intent:
      'A React + Tailwind admin dashboard for a B2B SaaS: sidebar navigation, KPI cards for MRR, active users and churn, a 30-day sign-ups line chart, a recent-activity table with search and pagination, dark mode, loading and empty states, mock data, components split into files, and instructions to run it.',
  },
  {
    id: 'cold-pitch-deck',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'help me with a pitch deck',
    intent:
      'A 10-slide outline for a pre-seed pitch to angel investors for a tool that automates invoice reminders for freelancers: problem, solution, demo, market, business model (€9 per month subscription), traction (120 paying users), team (two founders), competition, the ask (€300k) and use of funds, with one-sentence speaker notes per slide.',
  },
  {
    id: 'cold-churn-analysis',
    tag: 'ambiguous',
    site: 'claude',
    history: [],
    draft: 'analyze churn',
    intent:
      'Given a CSV of subscription events (user_id, plan, started_at, cancelled_at, country), compute the monthly churn rate for the last 12 months by plan, name the two segments with the highest churn, and write a short findings memo with a recommended next step. Pandas code included; metric definitions stated explicitly.',
  },
  {
    id: 'cold-learn-rust',
    tag: 'ambiguous',
    site: 'chatgpt',
    history: [],
    draft: 'teach me rust',
    intent:
      'A four-week self-study plan for an experienced Python developer who wants to write a command-line tool in Rust: weekly topics starting with ownership and borrowing, one small project per week, free resources (The Rust Book, Rustlings), a short self-check per week, about two hours per weekday.',
  },
  {
    id: 'deep-build-from-notes',
    tag: 'clear',
    site: 'claude',
    history: [
      u('I want to build a Chrome extension that summarises long Gmail threads. One click, five bullets, done. I write TypeScript. No backend — the user brings their own Claude API key.'),
      a('Clear. Proposed shape: a Manifest V3 extension with a content script that detects an open Gmail thread and adds a "Summarise thread" button to the toolbar; on click it reads the visible message bodies, sends them to the Claude API with the key from chrome.storage.local, and shows the five bullets in a side panel. Build with Vite + CRXJS. Shall I also add a popup for entering the key?'),
      u('Yes, popup for the key. Keep the summary in the side panel, not a modal. Use claude-opus-5-5.'),
      a('Got it: popup for the key, side panel for the summary, claude-opus-5-5. Anything else before I write it?'),
    ],
    draft: 'ok build the first version',
    intent:
      'Implement the MVP as agreed: Manifest V3 Chrome extension in TypeScript with Vite + CRXJS; content script adds a "Summarise thread" button in Gmail, reads the visible thread, calls claude-opus-5-5 with the key from chrome.storage.local (entered via a popup), shows five bullets in the side panel; no backend; include manifest, all source files, build steps and a short README.',
  },
  // ─── Added for the knowledge-base ablation: more domains, more deliverables ───────────────────
  { id: 'kb-landing-page', tag: 'ambiguous', site: 'claude', history: [], draft: 'make a landing page for my app',
    intent: 'A single-file HTML landing page for "Tidywork", a to-do app for freelancers on Mac. One primary action: join the waitlist with an email. Sections: hero, three benefits, one screenshot placeholder, FAQ. Calm, minimal, dark-on-cream. Placeholder copy clearly marked.' },
  { id: 'kb-pricing-page', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'design a pricing page',
    intent: 'A responsive pricing section in React with Tailwind for a B2B analytics tool: three tiers (Starter €29, Team €99, Enterprise "talk to us"), monthly/yearly toggle with 2 months free yearly, the Team tier highlighted, a comparison table underneath. Accessible toggle.' },
  { id: 'kb-dashboard-ui', tag: 'clear', site: 'claude', history: [], draft: 'Build a single HTML file with a sales dashboard: four KPI tiles (revenue, orders, average order value, refund rate), a line chart of daily revenue for 30 days drawn in inline SVG with made-up data, and a table of the top 10 products. Light theme, system font, works at 375 px.',
    intent: 'Exactly what was asked: one HTML file, four KPI tiles, an inline-SVG 30-day revenue line chart with sample data, a top-10 products table, light theme, responsive to 375 px. No external libraries.' },
  { id: 'kb-cold-email', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'write a cold email to get customers',
    intent: 'A cold email under 110 words to heads of support at 50–200 person SaaS companies, offering a 20-minute demo of a tool that drafts replies to support tickets. One specific pain (backlog after launches), one proof point as a [placeholder], one clear ask. Plain, no hype. Plus two subject lines.' },
  { id: 'kb-ad-copy', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'need ad copy for instagram',
    intent: 'Five Instagram ad variations for a reusable coffee cup brand aimed at commuters aged 25–40: each with a hook under 8 words, a caption under 40 words and a call to action to shop the autumn colours. Warm and a little dry, no emojis, no environmental guilt.' },
  { id: 'kb-positioning', tag: 'clear', site: 'claude', history: [], draft: 'Write a one-paragraph positioning statement for a password manager aimed at families (parents managing accounts for kids and grandparents). Competitors are 1Password and Bitwarden. Our difference: one adult can recover any family member\'s vault. Then give three taglines under six words.',
    intent: 'One positioning paragraph for a family password manager built around the recovery difference versus 1Password and Bitwarden, then three taglines under six words each. Nothing else.' },
  { id: 'kb-churn-analysis', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'analyze why customers are leaving',
    intent: 'A plan for a churn analysis of a subscription meal-kit business using a CSV export with columns signup_date, cancel_date, plan, deliveries, support_tickets, discount_used. Wants: the questions to answer, the cuts to make, the pandas code for cohort retention, and how to tell discount-driven churn from service-driven churn. Feeds a decision on whether to end first-box discounts.' },
  { id: 'kb-sql-report', tag: 'clear', site: 'claude', history: [], draft: 'Postgres. Tables: orders(id, customer_id, created_at, total_cents, status), customers(id, country). Write a query for monthly revenue per country for 2026, completed orders only, with each month\'s share of that country\'s yearly total. Explain the window function in two lines.',
    intent: 'One Postgres query: monthly revenue per country for 2026, status = completed, plus the month\'s share of the country\'s yearly total via a window function, and a two-line explanation of the window function.' },
  { id: 'kb-ab-test', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'did my a/b test work? 4.1% vs 4.6%',
    intent: 'Whether a checkout-button test is conclusive: control 4.1% conversion on 9,800 visitors, variant 4.6% on 9,750 visitors, ran 14 days. Wants the significance test worked through, the confidence interval for the difference, a plain-language verdict and whether to keep running. Decision: ship the variant or not.' },
  { id: 'kb-roadmap', tag: 'ambiguous', site: 'claude', history: [], draft: 'help me plan next quarter',
    intent: 'A Q1 plan for a three-person startup building a scheduling tool for dental clinics: one goal (reach 40 paying clinics from 22), two engineers and one founder doing sales, fixed constraint of an integration promised to a partner by 15 February. Wants three priorities, what to cut, and a week-by-week outline. The founder decides.' },
  { id: 'kb-hire-decision', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'should i hire a contractor or full time',
    intent: 'A recommendation for a 10-person agency deciding between a contract designer (€450 a day, about 8 days a month) and a full-time designer (€52k a year plus costs), with design demand uneven and two retainers ending in June. Wants a cost comparison over 12 months, the risks of each, and a recommendation with the reasoning and what was ruled out.' },
  { id: 'kb-launch-plan', tag: 'clear', site: 'claude', history: [], draft: 'Make a 4-week launch checklist for a paid iOS habit-tracker app, solo developer, launch date 2 March, budget €500. Group tasks by week, mark the three that cannot slip, and add one line on how to measure launch-week success.',
    intent: 'A four-week launch checklist grouped by week for a solo developer launching a paid iOS habit tracker on 2 March with €500, the three tasks that cannot slip marked, and one line on measuring launch-week success.' },
  { id: 'kb-product-names', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'names for my candle brand',
    intent: 'Fifteen name ideas for a small-batch candle brand with scents inspired by Baltic coast places (pine forest, amber, sea fog). Short, pronounceable in English, not twee, .com unlikely to matter. Grouped by idea (place, material, feeling) with one line of reasoning per group.' },
  { id: 'kb-short-story', tag: 'ambiguous', site: 'claude', history: [], draft: 'write a short story',
    intent: 'A 600-word story for a nine-year-old about a lighthouse keeper\'s daughter who finds the light has gone out on the night her father is at sea. Gentle tension, no villain, ends with her solving it herself. Third person, past tense, to read aloud at bedtime.' },
  { id: 'kb-video-script', tag: 'clear', site: 'chatgpt', history: [], draft: 'Write a 45-second voiceover script for a product video about a bike light that turns on automatically at dusk. Audience: city commuters. Three beats: the problem (forgetting your lights), the product, the call to action (pre-order at half price until Friday). Conversational, no superlatives. Give the word count.',
    intent: 'A 45-second voiceover script (about 110 words) in three beats for an automatic bike light aimed at city commuters, conversational, ending on the half-price pre-order until Friday, with the word count stated.' },
  { id: 'kb-meal-plan', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'meal plan for the week',
    intent: 'A Monday–Friday dinner plan for two adults and a six-year-old, vegetarian, each dinner under 35 minutes, budget about €60, no mushrooms. Wants a table of dinners, one combined shopping list grouped by aisle, and which two dinners can be cooked ahead on Sunday.' },
  { id: 'kb-budget', tag: 'ambiguous', site: 'claude', history: [], draft: 'help me save money',
    intent: 'A monthly budget for a single renter in Vilnius earning €2,100 net with rent €650, a €180 car loan and no savings, who wants a €3,000 emergency fund within 12 months. Wants amounts per category, the monthly saving needed, and the two cuts that matter most.' },
  { id: 'kb-running-plan', tag: 'clear', site: 'chatgpt', history: [], draft: 'I can run 5 km in 32 minutes and run twice a week. Give me an 8-week plan to run 10 km without stopping, three runs a week (Tue, Thu, Sun), as a table with distance and pace guidance per run, and one line on what to do if I miss a week.',
    intent: 'An 8-week, three-runs-a-week table (Tue, Thu, Sun) taking a 32-minute 5 km runner to a continuous 10 km, with distance and pace guidance per run and one line on missing a week.' },
  { id: 'kb-explain-vectors', tag: 'ambiguous', site: 'claude', history: [], draft: 'explain embeddings',
    intent: 'An explanation of text embeddings for a backend developer who knows SQL but no machine learning, in about 400 words, with one concrete example (finding similar support tickets), how similarity is measured, and three practice questions at the end without the answers.' },
  { id: 'kb-compare-db', tag: 'clear', site: 'chatgpt', history: [], draft: 'Compare SQLite and Postgres for a single-server web app with about 2,000 daily users and one writer process. A table with five rows (concurrency, backups, operations, features, migration cost) and a two-sentence recommendation.',
    intent: 'A five-row comparison table of SQLite and Postgres (concurrency, backups, operations, features, migration cost) for a single-server app with about 2,000 daily users and one writer, then a two-sentence recommendation.' },
  { id: 'kb-api-endpoint', tag: 'ambiguous', site: 'claude', history: [], draft: 'add rate limiting to my api',
    intent: 'Rate limiting for an Express 5 API in TypeScript on Node 22, single server, no Redis: 60 requests a minute per API key on all routes and 5 a minute per IP on POST /login, returning 429 with Retry-After. Wants the middleware code, where to mount it, and tests with node:test.' },
  { id: 'kb-bug-flaky', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'my test fails sometimes',
    intent: 'Help finding why a Jest test for a React hook that debounces search input fails about one run in five in CI but never locally. Uses fake timers and @testing-library/react. Wants the likely causes ranked, how to confirm each, and a corrected test.' },
  { id: 'kb-speech', tag: 'ambiguous', site: 'chatgpt', history: [], draft: 'write a speech for my friends wedding',
    intent: 'A three-minute best-man speech for Tomas, a friend of 15 years, marrying Greta. One story (the camping trip where he forgot the tent), warm and lightly funny, nothing embarrassing in front of grandparents, ends with a toast. Placeholders where a detail is missing.' },
];

export const ALL_CASES: EvalCase[] = [...CASES, ...GENERATED];
