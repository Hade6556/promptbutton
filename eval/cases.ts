import type { HistoryMessage } from '../src/messaging';

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
];
