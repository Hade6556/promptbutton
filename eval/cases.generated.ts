// Written by `npm run eval:gen` on 2026-11-11 with claude-opus-5-5. Model-written cases, kept apart from the
// hand-written ones in cases.ts so results can be reported for each set. Read them before trusting a
// number that includes them.
import type { EvalCase } from './cases';

export const GENERATED: EvalCase[] = [
  {
    "id": "gen-frontend-bakery-landing-hero-copy-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "make a landing page for my bakery",
    "intent": "A single-page HTML/CSS landing page for Crumb & Kettle, a small sourdough bakery in Leeds, with a hero section, weekly bread menu, opening hours (Tue–Sat 7am–2pm) and a pre-order button linking to a Google Form. Warm, rustic look with cream and brown tones, mobile-first, no JavaScript frameworks."
  },
  {
    "id": "gen-frontend-dashboard-table-too-cramped-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "my table looks cramped how fix",
    "intent": "A React admin table showing 12 columns of shipment data in Tailwind is unreadable on 1366px laptops. Wants concrete fixes: column priority hiding, sticky first column, row padding values, and truncation with tooltips, as code changes to the existing Tailwind classes."
  },
  {
    "id": "gen-frontend-dentist-booking-form-clear-3",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Build an appointment booking form in plain HTML and CSS for a dental clinic called Brightline Dental. Fields: full name, phone, email, preferred date, time slot dropdown (9am-5pm hourly), reason for visit (checkup, cleaning, pain, other), and a notes textarea. Accessible labels, visible focus states, inline error styling, single column on mobile, two columns above 768px. Teal and white color scheme.",
    "intent": "A plain HTML/CSS booking form for Brightline Dental with name, phone, email, date, hourly 9–5 slot dropdown, visit reason select, notes; accessible labels, focus states, inline error styles, one column mobile and two above 768px, teal/white palette."
  },
  {
    "id": "gen-frontend-button-colors-shorter-versio-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "can you give me a button style system for my app, primary secondary danger"
      },
      {
        "role": "assistant",
        "text": "Here's a full button system with 5 variants, 3 sizes, hover/active/disabled states, and CSS custom properties for theming..."
      }
    ],
    "draft": "too much just the basics",
    "intent": "Only three variants (primary, secondary, danger) in a single medium size with hover and disabled states, as plain CSS under 40 lines. Drop the size scale and the custom-property theming layer since the app is a small internal tool for a warehouse team."
  },
  {
    "id": "gen-frontend-wedding-site-rsvp-section-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "rsvp section for wedding site??",
    "intent": "An RSVP section for Amara and Tomasz's wedding site on 14 June in Kraków: guest name, attending yes/no, number of guests (max 2), meal choice (beef, fish, vegetarian), and a song request. Elegant, sage green and gold, HTML/CSS that will be pasted into a Carrd embed, bilingual labels in English and Polish."
  },
  {
    "id": "gen-frontend-saas-pricing-page-tiers-6",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Design a pricing section in React + Tailwind for my invoicing SaaS Ledgerly. Three tiers: Solo $9/mo (1 user, 20 invoices), Team $29/mo (5 users, unlimited invoices, recurring billing), Business $79/mo (20 users, API access, priority support). Monthly/annual toggle with 20% annual discount, highlight Team as most popular, feature checklist per card, stacked cards on mobile.",
    "intent": "A React + Tailwind pricing section for Ledgerly with Solo $9, Team $29 (highlighted most popular) and Business $79 tiers and their listed features, a monthly/annual toggle applying 20% off, checklists per card, and stacked layout on mobile."
  },
  {
    "id": "gen-frontend-portfolio-feels-boring-fix-7",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "my portfolio site feels boring",
    "intent": "An illustrator in Lisbon has a white, centered single-column portfolio and wants five specific visual changes to make it feel more personal: typography pairing, an asymmetric project grid, a color accent, subtle hover motion, and a hand-drawn header. Suggestions should keep page load light because it's hosted on GitHub Pages."
  },
  {
    "id": "gen-frontend-restaurant-menu-dark-mode-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "here's my css for the menu page of our taqueria site [pasted ~120 lines]"
      },
      {
        "role": "assistant",
        "text": "Thanks, I see the layout uses a grid of menu cards with a cream background and red headings. What would you like to change?"
      }
    ],
    "draft": "add dark mode",
    "intent": "Add a dark theme to the pasted taqueria menu CSS using prefers-color-scheme plus a manual toggle class on body, keeping the red headings readable at WCAG AA contrast. Return only the new and changed CSS rules, not the whole file."
  },
  {
    "id": "gen-frontend-school-newsletter-email-temp-9",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Need an HTML email template for a primary school monthly newsletter (Hollins Park Primary). Table-based layout so it works in Outlook, max width 600px, inline styles only. Sections: header with logo placeholder, principal's note, upcoming dates list, a two-column photo row, and footer with unsubscribe link. Friendly but not childish, navy and yellow.",
    "intent": "A table-based, inline-styled 600px HTML email for Hollins Park Primary's monthly newsletter, Outlook-safe, with logo header, principal's note, dates list, two-column photo row and unsubscribe footer, navy/yellow and friendly-not-childish."
  },
  {
    "id": "gen-frontend-mobile-nav-hamburger-broken-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "hamburger menu not working on iphone",
    "intent": "A vanilla JS hamburger menu on a Shopify-free static site for a Nairobi coffee roaster opens on desktop Chrome but not Safari iOS 17. Wants likely causes (click vs touch, 100vh, overflow on body) and a corrected snippet for the toggle and the slide-in panel CSS."
  },
  {
    "id": "gen-frontend-gym-signup-onboarding-screen-11",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "onboarding screens ideas for fitness app",
    "intent": "Layout and copy for four onboarding screens for PulseFit, a gym chain app in Melbourne: goals selection, preferred club, class-time preferences, and notification permission. Wants a wireframe-style description per screen with headline, controls and CTA text, plus one tip to reduce drop-off, for a meeting with the designer on Thursday."
  },
  {
    "id": "gen-frontend-realtor-listing-card-compone-12",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Write a Vue 3 component (script setup) for a property listing card. Props: image url, price (number, format as CAD), address, beds, baths, sqft, and status ('new' | 'sold' | 'open house'). Show a colored status badge top-left over the image, price large, specs in a row with icons, hover lifts the card slightly. Scoped CSS, no UI library.",
    "intent": "A Vue 3 script-setup listing card with props for image, CAD-formatted price, address, beds, baths, sqft and a three-value status badge over the image; large price, icon spec row, hover lift, scoped CSS without libraries."
  },
  {
    "id": "gen-frontend-charity-donate-page-hero-13",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "we're a small animal shelter in Cork redoing our website, can you help with the donate page"
      },
      {
        "role": "assistant",
        "text": "Of course! Do you want help with layout, copy, or code — and what platform is the site on?"
      }
    ],
    "draft": "all of it, wordpress",
    "intent": "A donate page for Paws of Cork on WordPress: hero headline and copy, preset amounts (€10, €25, €50, custom), monthly vs one-off choice, a 'what your money does' strip, and a short success story. Delivered as Gutenberg block layout guidance plus custom CSS for the additional CSS panel, tone heartfelt but not guilt-tripping."
  },
  {
    "id": "gen-frontend-font-pairing-law-firm-14",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "good fonts for a law firm site",
    "intent": "Three Google Fonts heading/body pairings for Varga & Holt, a two-partner family law firm in Budapest, that feel trustworthy and approachable rather than stuffy. Must support Hungarian accents (ő, ű), include recommended sizes for h1 and body, and a one-line rationale each."
  },
  {
    "id": "gen-software-flaky-test-ci-failure-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "my test passes locally but fails in ci sometimes",
    "intent": "A Jest test for a Node 20 checkout service fails about 1 in 5 runs on GitHub Actions because it depends on Date.now() and a 200ms setTimeout. Wants the likely causes ranked, and a concrete fix using fake timers. A short code example of the fixed test is needed."
  },
  {
    "id": "gen-software-csv-dedupe-python-script-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "script to remove duplicates from a csv",
    "intent": "A Python script for a vet clinic receptionist in Leeds that dedupes a 12,000-row client export (clients.csv), treating rows as duplicates when email matches case-insensitively, keeping the most recent last_visit. Standard library only, writes clients_clean.csv, prints how many rows were removed. Plain comments because she is not a programmer."
  },
  {
    "id": "gen-software-rest-pagination-design-choic-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "offset or cursor pagination?",
    "intent": "Choosing pagination for a public REST API listing ~4 million shipment events for a freight startup, Haulwise, where clients poll for new events every minute. Wants a recommendation with the tradeoffs in a short table and an example response shape for the chosen approach. Decision is due for the API review on Friday."
  },
  {
    "id": "gen-software-regex-uk-postcode-validation-4",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Need a JavaScript regex to validate UK postcodes in a signup form. Should accept upper or lower case, optional single space (e.g. 'sw1a 1aa' and 'SW1A1AA'), not worry about the GIR 0AA special case. Give the regex, 5 passing and 5 failing test strings, and a one-paragraph explanation.",
    "intent": "A JS regex for UK postcodes, case-insensitive, optional single space, ignoring GIR 0AA. Include 5 valid and 5 invalid test strings and a one-paragraph explanation."
  },
  {
    "id": "gen-software-airflow-dag-retry-logic-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "how do i make the dag retry only the failed part",
    "intent": "An Airflow 2.8 DAG at a Lagos fintech pulls daily transactions from three bank APIs then loads to BigQuery; currently one PythonOperator does everything, so one bank timeout reruns all. Wants it restructured into per-bank tasks with retries=3 and 10-minute exponential backoff, with example DAG code."
  },
  {
    "id": "gen-software-shorten-error-message-copy-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "write user-facing error messages for our payment form: card declined, expired card, network error, invalid cvc"
      },
      {
        "role": "assistant",
        "text": "Here are four messages: 1. Card declined: 'Your bank declined this card. Please try another card or contact your bank for details.' 2. Expired card: 'This card appears to have expired. Please check the date or use a different card.' 3. Network error: 'We couldn't reach our payment service. Please check your connection and try again.' 4. Invalid CVC: 'The security code doesn't look right. It's the 3 or 4 digits on the back of your card.'"
      }
    ],
    "draft": "too long, theyre on mobile",
    "intent": "Rewrite the four payment error messages to fit under ~60 characters each for a mobile checkout banner in a grocery delivery app, keeping the next-step instruction. Same calm tone, no apologies, returned as a simple list."
  },
  {
    "id": "gen-software-django-n-plus-one-7",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Django 4.2. My view lists 50 Book objects and shows book.author.name and a count of book.reviews. Debug toolbar shows 101 queries. Show me how to fix it with select_related/prefetch_related or annotate so it's 1-2 queries, and explain which to use for the FK vs the reverse relation.",
    "intent": "Fix an N+1 problem in a Django 4.2 book list view: select_related for author FK, annotate Count for reviews (or prefetch), getting down to 1-2 queries, with a brief explanation of when to use each."
  },
  {
    "id": "gen-software-legacy-php-migration-plan-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "we need to get off our old php app, where do i start",
    "intent": "A phased migration plan for a 14-year-old PHP 5.6 inventory system at a Portuguese tile manufacturer, ~90k lines, one MySQL database, two developers. Wants a strangler-fig approach over 12 months with the first three modules to extract and risks, as a one-page plan to show the owner."
  },
  {
    "id": "gen-software-bash-backup-rotate-script-9",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "bash script for cron: tar+gzip /var/www/shop into /backups/shop-YYYY-MM-DD.tar.gz, keep only the latest 7 backups and delete older ones, log to /var/log/shop-backup.log, exit nonzero if tar fails. Ubuntu 22.04.",
    "intent": "A bash cron script on Ubuntu 22.04 that archives /var/www/shop to dated tar.gz files in /backups, retains the newest 7, logs to /var/log/shop-backup.log, and exits nonzero on tar failure."
  },
  {
    "id": "gen-software-explain-segfault-c-code-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "why segfault\n\nchar *s; strcpy(s, name);",
    "intent": "A first-year engineering student in Pune doing a C assignment needs to understand that s is an uninitialized pointer, plus two correct fixes (fixed array vs malloc with strlen+1) and why strncpy/snprintf is safer. Wants a beginner-level explanation, not just corrected code."
  },
  {
    "id": "gen-software-kafka-consumer-lag-spike-11",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "our kafka consumer group for order-events has lag climbing to 2 million every evening around 7pm"
      },
      {
        "role": "assistant",
        "text": "Some questions first: how many partitions does the topic have, how many consumer instances run, and what does each message's processing involve (DB writes, HTTP calls)?"
      }
    ],
    "draft": "12 partitions, 4 pods, each msg does a postgres insert and calls the loyalty api",
    "intent": "Diagnose evening lag on a 12-partition order-events topic consumed by 4 pods doing a Postgres insert plus a synchronous loyalty API call per message at a retail chain. Wants concrete fixes ordered by effort: scale to 12 consumers, batch inserts, make the loyalty call async or via a separate topic, with expected impact on throughput."
  },
  {
    "id": "gen-software-api-rate-limiter-redis-12",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Implement a sliding-window rate limiter in Go using Redis (go-redis v9): 100 requests per minute per API key, as HTTP middleware returning 429 with a Retry-After header. Use a sorted set with a Lua script so it's atomic. Include a short test with miniredis.",
    "intent": "Go HTTP middleware for a sliding-window rate limiter, 100 req/min per API key, Redis sorted set via atomic Lua script with go-redis v9, 429 plus Retry-After, and a miniredis-based test."
  },
  {
    "id": "gen-software-spreadsheet-to-api-sync-13",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "can i connect google sheets to our api",
    "intent": "An operations manager at a Melbourne event-hire company wants a Google Apps Script that pushes new rows from a Bookings sheet to their internal REST endpoint (POST /bookings with bearer token) every 15 minutes and marks each row as synced. Needs step-by-step setup and the script, assuming no coding background."
  },
  {
    "id": "gen-software-commit-message-cleanup-rewri-14",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "here's my diff summary: renamed getUser to fetchUserProfile everywhere, added null check in ProfileCard, bumped axios 1.4 to 1.7, removed unused lodash import"
      },
      {
        "role": "assistant",
        "text": "Suggested commit message:\n\nRefactor user profile fetching and update dependencies\n\nThis commit renames getUser to fetchUserProfile across the codebase for clarity, adds a null check to ProfileCard to prevent crashes when the profile is missing, upgrades axios from 1.4 to 1.7, and removes an unused lodash import."
      }
    ],
    "draft": "split it, we use conventional commits",
    "intent": "Split the change into separate Conventional Commits messages: a refactor for the rename, a fix for the ProfileCard null check, a chore(deps) for the axios bump, and a chore for the lodash removal. Each a one-line subject under 72 characters, optional short body only where useful."
  },
  {
    "id": "gen-writing-retirement-speech-for-cowork-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "need a short speech for my coworkers retirement",
    "intent": "A 3-minute toast (about 400 words) for Denise Okafor, retiring after 31 years as head nurse on the night shift at Harlow General's cardiac ward. Warm with two light jokes about her legendary label maker and her refusal to use the new scheduling app, ending on a sincere thank-you from the whole team. Will be read aloud at a cake gathering in the break room."
  },
  {
    "id": "gen-writing-landlord-mold-complaint-emai-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "email to landlord about the mold again",
    "intent": "A firm but polite email to property manager Gerald Stokes about black mold in the bathroom ceiling of flat 4B, first reported on 12 March and 2 April with no repair. Should reference photos attached, ask for a written repair date within 7 days, and mention the tenant will contact the city housing inspector if nothing happens. Under 200 words."
  },
  {
    "id": "gen-writing-bakery-instagram-launch-post-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "insta caption for new sourdough",
    "intent": "An Instagram caption for Crumb & Kettle, a small bakery in Leeds, launching a rye-and-fennel sourdough at £5.20 a loaf, available Fridays and Saturdays only from 14 June. Playful, under 60 words, with 4 to 6 local hashtags and a line saying pre-orders open by DM."
  },
  {
    "id": "gen-writing-grant-report-shorter-version-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "Can you draft the impact section for our year-end report to the Marlowe Foundation? We ran after-school reading clubs in 6 schools, 212 kids, average reading age went up 1.4 years, 38 volunteers."
      },
      {
        "role": "assistant",
        "text": "Here's a draft impact section: Over the 2024–25 school year, our reading clubs reached 212 pupils across six partner schools... [about 450 words covering reach, outcomes, volunteers, and a pupil story]"
      }
    ],
    "draft": "too long, cut it",
    "intent": "Cut the impact section to roughly 200 words for the Marlowe Foundation's one-page report template, keeping the three headline numbers (212 pupils, +1.4 years reading age, 38 volunteers) and one sentence of the pupil story. Drop the volunteer training details. Keep the formal funder tone."
  },
  {
    "id": "gen-writing-cover-letter-career-change-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "cover letter for a project coordinator job, i used to be a chef",
    "intent": "A one-page cover letter for a Project Coordinator role at Vantell Construction in Calgary from someone with 9 years as a sous chef who ran a 14-person kitchen, handled supplier ordering of about $40k a month and rostering. Should translate kitchen experience into scheduling, budgeting and team coordination, mention a completed CAPM certificate, and sound confident without apologizing for the switch."
  },
  {
    "id": "gen-writing-school-newsletter-fundraiser-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "write something for the school newsletter abt the fun run",
    "intent": "A 150-word newsletter paragraph for parents at Brookfield Primary announcing the Spring Fun Run on Saturday 10 May, 9:30am at Pellow Park, raising money for new playground equipment with a £4,000 target. Upbeat and simple, with how to sign up (forms to class teachers by 2 May) and a call for 10 parent marshals."
  },
  {
    "id": "gen-writing-apology-email-missed-deadlin-7",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "how do i say sorry to a client for being late without groveling",
    "intent": "A short email to client Priya Raman at Halden Logistics apologizing that the translated safety manual (Spanish version, 46 pages) will arrive on Thursday instead of Monday due to a reviewer's illness. Professional, one sentence of apology, offering a 10% discount on the invoice and confirming the new delivery time of 5pm Thursday."
  },
  {
    "id": "gen-writing-wedding-speech-make-funnier-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "best man speech for my brother Tomas, marrying Lucia. they met at a salsa class he was terrible at. keep it about 4 minutes"
      },
      {
        "role": "assistant",
        "text": "Here's a draft: Good evening everyone. For those who don't know me, I'm Mateo, Tomas's younger brother... [speech covering childhood, the salsa class, and a toast]"
      }
    ],
    "draft": "funnier pls but not mean",
    "intent": "Rework Mateo's best man speech to add three or four more jokes, mostly about Tomas's two left feet at salsa and his habit of over-planning road trips, while keeping Lucia shown in a flattering light. Nothing about exes or drinking since grandparents attend. Keep it around 4 minutes and the sincere toast at the end."
  },
  {
    "id": "gen-writing-linkedin-post-layoff-announc-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "linkedin post saying i got laid off and looking for work",
    "intent": "A LinkedIn post from a data analyst laid off from Fenwick Retail after 4 years, open to analytics roles in Melbourne or remote, skilled in SQL, Tableau and forecasting. Grateful and positive toward former colleagues, about 120 words, ending with a clear ask for referrals or intros."
  },
  {
    "id": "gen-writing-essay-intro-climate-migratio-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "intro paragraph for my essay on climate migration",
    "intent": "An opening paragraph of about 150 words for a second-year university geography essay arguing that coastal Bangladesh shows climate migration is mostly internal rather than international. Academic tone, starting with a concrete hook, ending in a clear thesis statement, no first person."
  },
  {
    "id": "gen-writing-hoa-meeting-minutes-cleanup-11",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Turn these notes into formal meeting minutes for the Willow Creek HOA board meeting on 3 June. Attendees: Carla Nguyen (chair), Ben Ortiz, Sandra Lee, Mike Patel. Absent: Joan Fry. Notes: pool reopening approved for June 15, vote 4-0. Landscaping contract with GreenEdge renewed at $1,850/month. Discussed parking complaints, Ben to draft new guest parking rules by July 1. Next meeting July 8, 7pm, clubhouse. Use headings and keep it to one page.",
    "intent": "One-page formal minutes for the Willow Creek HOA board meeting of 3 June with headings, listing the four attendees and Joan Fry as absent, recording the 4-0 pool reopening approval for 15 June, the GreenEdge renewal at $1,850/month, Ben Ortiz's action item on guest parking rules due 1 July, and the next meeting on 8 July at 7pm in the clubhouse."
  },
  {
    "id": "gen-writing-product-update-email-custome-12",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Write a customer email for Tidyslate, our invoicing app for freelancers. Announce three updates going live March 20: recurring invoices, payment reminders that send automatically after 7 days, and export to CSV. Friendly, plain language, under 200 words, subject line included, one CTA button text that says 'Try recurring invoices'. No exclamation marks overload, max one.",
    "intent": "A customer announcement email for the freelancer invoicing app Tidyslate with a subject line, under 200 words, friendly plain language, covering recurring invoices, automatic payment reminders after 7 days and CSV export launching 20 March, at most one exclamation mark, and a CTA button reading 'Try recurring invoices'."
  },
  {
    "id": "gen-writing-eulogy-for-grandmother-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I need a eulogy for my grandmother Agnes Whitlow, 91, I'm reading it Saturday at a Methodist church in Ohio. About 5 minutes. She was a schoolteacher for 38 years in Dalton, grew tomatoes she gave to the whole street, played hymns on piano every Sunday, and raised four kids after my grandpa died young. Tone: warm, a little gentle humor about her tomatoes, ending with a short prayer-like line. Written in first person from me, her grandson.",
    "intent": "A roughly 5-minute first-person eulogy from her grandson for Agnes Whitlow, 91, at a Methodist church in Ohio, covering her 38 years teaching in Dalton, sharing tomatoes with the street, Sunday hymns on piano, and raising four children as a widow. Warm with gentle tomato humor, closing on a brief prayer-like line."
  },
  {
    "id": "gen-writing-internal-policy-remote-work--14",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Draft a remote work policy for Ardent Dental Labs, 45 staff in Porto. Office-based roles (technicians) excluded. Admin and design staff can work remote up to 2 days a week, must be in office Tuesdays, need manager approval via the HR portal, and must be reachable 9:00-17:00 Lisbon time. Company provides laptop but no home office stipend. Sections: purpose, eligibility, schedule, equipment, review. Keep it plain and under 500 words.",
    "intent": "A plain-language remote work policy under 500 words for Ardent Dental Labs (45 staff, Porto) with sections purpose, eligibility, schedule, equipment and review: technicians excluded, admin and design staff up to 2 remote days a week with mandatory office Tuesdays, manager approval through the HR portal, reachable 9:00–17:00 Lisbon time, laptop provided and no home office stipend."
  },
  {
    "id": "gen-marketing-bakery-instagram-launch-capt-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "caption for our new croissant",
    "intent": "An Instagram caption for Pan & Pluma, a small bakery in Porto, launching a pistachio-rose croissant at €3.80 starting Saturday. Warm, playful, under 40 words, two or three emojis, ending with 'only 60 a day' to create urgency, plus five local hashtags."
  },
  {
    "id": "gen-marketing-saas-pricing-tier-rethink-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "should we raise prices",
    "intent": "Founder of Tallyhop, a scheduling tool for dog groomers with 420 customers on a single $29/month plan and 3% monthly churn, wants to know whether to move to three tiers ($19/$39/$79). Wants a pros/cons analysis, expected revenue impact under two churn scenarios, and a recommendation on grandfathering existing users."
  },
  {
    "id": "gen-marketing-cold-email-dental-clinics-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "write cold email to dentists",
    "intent": "A cold outreach email from a rep at ClearCall, an AI phone answering service at $149/month, to independent dental clinic owners in Ohio. Under 120 words, opens with the cost of missed calls (about 1 in 4 go unanswered), offers a 14-day free trial, low-pressure tone, plus two subject line options."
  },
  {
    "id": "gen-marketing-gym-referral-program-design-4",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "I run a single-location gym in Leeds called IronYard, 600 members, £35/month. I want a referral program: the referrer gets one free month per friend who stays 2+ months, the friend gets 50% off their first month. Write the rules (max 5 bullet points), a short poster headline, and estimate the cost if 10% of members refer one person each.",
    "intent": "Referral program for IronYard gym in Leeds (600 members, £35/month): referrer gets a free month per friend retained 2+ months, friend gets 50% off month one. Needs up to five rule bullets, a poster headline, and a cost estimate assuming 60 referrals."
  },
  {
    "id": "gen-marketing-wine-shop-newsletter-shorter-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "write our december newsletter for Vino Cortés, we have a 3-bottle holiday bundle for €45 and a tasting night dec 14"
      },
      {
        "role": "assistant",
        "text": "Here's a draft: 'Dear friends of Vino Cortés, as the year winds down...' [~350 words covering the bundle, the tasting, gift cards, and opening hours]"
      }
    ],
    "draft": "too long",
    "intent": "Cut the Vino Cortés December newsletter to about 120 words, keeping only the €45 three-bottle bundle and the December 14 tasting night, dropping gift cards and hours. Keep the warm tone and end with a single 'Reserve your seat' call to action."
  },
  {
    "id": "gen-marketing-realtor-facebook-ad-copy-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "fb ad for open house",
    "intent": "Facebook ad copy for an open house at a 3-bed, 2-bath bungalow at 14 Wren Lane, Halifax, listed at CAD 549,000, Sunday 1–4pm. Primary text under 90 words aimed at first-time buyers, highlighting the renovated kitchen and walkable school, plus a headline under 40 characters."
  },
  {
    "id": "gen-marketing-b2b-positioning-statement-lo-7",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Write a positioning statement for FreightNest, a freight-matching platform for small trucking companies (1-10 trucks) in Mexico. Main competitor is brokers who take 15-20% commission; we charge a flat 1,200 MXN/month. Use the classic 'For [target] who [need], [product] is a [category] that [benefit]. Unlike [alternative], we [differentiator]' format. Give me 3 variations.",
    "intent": "Three variations of a classic-format positioning statement for FreightNest, a flat 1,200 MXN/month freight-matching platform for Mexican trucking firms with 1–10 trucks, contrasting with brokers charging 15–20% commission."
  },
  {
    "id": "gen-marketing-tutoring-flyer-headline-idea-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "need slogan ideas tutoring",
    "intent": "Ten slogan options for a flyer for Bright Steps, a math tutoring service for 11–16 year olds in Nairobi run by two university students at KES 1,500 per hour. Aimed at parents worried about exam results, encouraging not pushy, each under eight words."
  },
  {
    "id": "gen-marketing-webinar-signup-dropoff-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "why is nobody signing up for my webinar",
    "intent": "A marketing consultant's free webinar on LinkedIn lead gen got 2,300 landing page visits but only 41 signups (1.8%). Wants a diagnosis of likely causes—form length (7 fields), vague headline, Tuesday 9am slot—and five prioritized fixes to reach 8% before the next session in three weeks."
  },
  {
    "id": "gen-marketing-coffee-roaster-subscription--10",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "We sell coffee subscriptions (Hilltop Roasters, $22/bag, ships monthly). About 40% cancel after month 3. Write a 3-email win-back sequence for people who just cancelled: email 1 day after, day 10, day 30. Include subject lines, keep each under 100 words, offer a free bag on the third email only. Friendly, not desperate.",
    "intent": "A three-email win-back sequence for cancelled Hilltop Roasters subscribers at days 1, 10 and 30, each with a subject line and under 100 words, friendly tone, with a free-bag offer only in the third email."
  },
  {
    "id": "gen-marketing-festival-sponsor-pitch-follo-11",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "draft a sponsorship pitch for our town food festival, Riverside Eats in Ballarat, 12,000 attendees, gold package $5,000"
      },
      {
        "role": "assistant",
        "text": "Here's a pitch email to potential sponsors outlining audience, logo placement, stage mentions and the $5,000 gold package..."
      }
    ],
    "draft": "now one for the local bank specifically",
    "intent": "Tailor the Riverside Eats sponsorship pitch to Ballarat Community Bank, emphasising local family reach and community goodwill, offering naming rights to the family zone within the $5,000 gold package. Keep it under 200 words and addressed to the branch manager."
  },
  {
    "id": "gen-marketing-etsy-listing-seo-candles-12",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "make my etsy title better",
    "intent": "Rewrite the Etsy title and first description line for a hand-poured soy candle with a fig and cedar scent, 8oz, 45-hour burn, priced $24. Wants a keyword-rich title under 140 characters targeting gift searches (housewarming, for her) without keyword stuffing."
  },
  {
    "id": "gen-marketing-car-dealer-q4-sales-push-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Used car dealership in Kraków, we have 38 cars over 90 days in stock, mostly compact hatchbacks 2016-2019. Give me a Q4 promotion plan to clear at least 25 of them by Dec 31: suggested discount levels, 2 promo ideas, which channels (we use OLX and Otomoto plus a small Instagram), and a simple weekly target. Budget for ads 8,000 PLN.",
    "intent": "A Q4 clearance plan for a Kraków used car dealer to sell 25 of 38 aged 2016–2019 hatchbacks by December 31, with discount levels, two promo ideas, channel split across OLX, Otomoto and Instagram within an 8,000 PLN ad budget, and weekly sales targets."
  },
  {
    "id": "gen-marketing-linkedin-post-funding-news-14",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "linkedin post about our raise",
    "intent": "A LinkedIn post from the CEO of Verdant Loop, a Rotterdam startup turning restaurant food waste into compost, announcing a €2.4M seed round led by NorthPier Ventures. Humble and grateful, about 150 words, mentions hiring three engineers and thanks the first 50 restaurant partners, no buzzwords."
  },
  {
    "id": "gen-data-churn-rate-dip-explain-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "why did our churn go down last month",
    "intent": "A product analyst at Brightloom, a meal-kit subscription in Toronto, saw monthly churn fall from 7.8% to 5.1% in March and wants a list of likely causes to check before reporting it as a win. They suspect a billing-date change that delayed cancellations. They want 5-6 hypotheses ranked by likelihood, each with the specific cut of data that would confirm or rule it out."
  },
  {
    "id": "gen-data-pivot-table-sales-reps-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "how do i make a pivot table that shows each rep",
    "intent": "An office manager at a tile distributor in Valencia has a Google Sheets export with columns date, rep, region, product, amount_eur for Q1. She wants a pivot table with reps as rows, months as columns, total sales as values, plus a grand-total column sorted descending. Step-by-step clicks for Google Sheets, not Excel."
  },
  {
    "id": "gen-data-ab-test-significance-check-3",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "A/B test on our checkout button. Control: 12,480 visitors, 412 conversions. Variant: 12,610 visitors, 471 conversions. Two-sided test, alpha 0.05. Is this significant? Give me the p-value, the 95% CI for the difference in conversion rates, and one sentence I can paste in Slack for non-technical people.",
    "intent": "A two-proportion z-test comparing 412/12,480 vs 471/12,610, two-sided at alpha 0.05, reporting the p-value, the 95% confidence interval for the difference in conversion rates, and a single plain-language Slack sentence for non-technical colleagues."
  },
  {
    "id": "gen-data-survey-likert-averaging-ques-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "can i average likert scores",
    "intent": "A nurse researcher at a regional hospital in Cork ran a 5-point Likert staff-wellbeing survey (n=143, 12 items, two wards) and wants to know if reporting mean scores per item is defensible or if she should use medians and percentages. She needs a short justification she can put in the methods section of an internal report, plus which test to compare the two wards."
  },
  {
    "id": "gen-data-sql-duplicate-customers-dedu-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "sql to find duplicates",
    "intent": "A data engineer at an insurance broker uses SQL Server and has a clients table (client_id, full_name, email, phone, created_at) with duplicates from two merged CRMs. They want a query that groups rows by lowercased trimmed email, shows groups with more than one row, and keeps the earliest created_at as the survivor, listing the ids to delete."
  },
  {
    "id": "gen-data-school-test-scores-followup-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "I have reading scores for 6 classes in my school, fall and spring, about 25 kids each. I want to show which classes improved most."
      },
      {
        "role": "assistant",
        "text": "You could compute each student's spring minus fall gain, then average gains per class and show them in a bar chart with error bars. Do you want help with the spreadsheet formulas?"
      }
    ],
    "draft": "yes but some kids missing spring",
    "intent": "A literacy coordinator in a primary school in Leeds has about 9 of 150 students with no spring score. She wants to know whether to drop them or impute, and the Excel formulas to compute class average gains using only students with both scores, plus a note showing how many were excluded per class. Plain explanations, she's not a statistician."
  },
  {
    "id": "gen-data-restaurant-covers-forecast-7",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "forecast next months customers from my numbers",
    "intent": "The owner of Casa Lumen, a 60-seat restaurant in Lisbon, has 24 months of daily covers in a spreadsheet and wants a forecast of daily covers for next July to plan staff schedules. She wants a simple method she can do in Excel (seasonal average or FORECAST.ETS), with a weekday breakdown and a rough range, not a point estimate."
  },
  {
    "id": "gen-data-cohort-retention-query-clear-8",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "BigQuery. events table: user_id STRING, event_ts TIMESTAMP, event_name STRING. Signup = event_name 'signup'. Write a query for weekly cohort retention: cohort = signup week, then % of cohort with any event in week 1 through week 8 after signup. Output one row per cohort with columns w1..w8. Only cohorts from Jan 2026 onward.",
    "intent": "A BigQuery SQL query building weekly signup cohorts from the events table (event_name = 'signup'), computing the percentage of each cohort active in weeks 1-8 after signup, pivoted into columns w1 to w8, one row per cohort, restricted to cohorts starting January 2026 or later."
  },
  {
    "id": "gen-data-warehouse-picking-errors-cor-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "is there a link between overtime and mistakes",
    "intent": "An operations lead at a parcel warehouse in Poznań has per-shift data for 40 pickers over 3 months: overtime hours and mis-pick count. He wants to know how to test whether overtime is associated with error rate (errors per 1,000 picks, not raw counts), what a correlation or regression would tell him, and how to avoid blaming individuals. Output feeds a proposal to cap overtime at 6 hours/week."
  },
  {
    "id": "gen-data-dashboard-metric-definitions-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "Write definitions for our KPI glossary: active user, retention, ARPU, conversion rate. We're a language-learning app."
      },
      {
        "role": "assistant",
        "text": "Here are detailed definitions with formulas, edge cases, and examples for each of the four metrics..."
      }
    ],
    "draft": "too long, make it shorter",
    "intent": "The PM at a language-learning app called Parlo wants each of the four definitions cut to one sentence plus a formula line, so they fit into tooltip boxes on a Looker dashboard (max ~200 characters each). Keep the 'active = completed at least one lesson in 7 days' detail."
  },
  {
    "id": "gen-data-household-energy-bills-trend-11",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I've got 3 years of monthly electricity bills in a spreadsheet: columns month, kWh, cost_nzd. We installed a heat pump in June 2024. Help me figure out if usage actually dropped after that, accounting for winter vs summer. Give me the steps and formulas for Google Sheets, and a simple chart idea. Keep it non-technical.",
    "intent": "A homeowner in New Zealand wants a non-technical, step-by-step Google Sheets method to compare kWh before and after a June 2024 heat-pump install, controlling for season (e.g. comparing same months year over year), with the formulas and one simple chart suggestion."
  },
  {
    "id": "gen-data-clinic-wait-times-median-12",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "mean or median for wait times??",
    "intent": "A practice manager at a GP clinic in Adelaide is reporting patient wait times to the board; data is 2,300 visits from last quarter, heavily right-skewed with some 3-hour waits. She wants a clear recommendation (median plus 90th percentile), why, and one sentence explaining it to board members."
  },
  {
    "id": "gen-data-marketing-attribution-findin-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Summarize these findings for our CEO in 5 bullets, no jargon: Q2 paid social spend $84k, 1,120 signups, CAC $75. Search spend $52k, 1,310 signups, CAC $40. Referral program cost $9k, 640 signups, CAC $14. Referral signups retain 22% better at 90 days. Recommendation: shift $20k from social to referral and search in Q3.",
    "intent": "Five plain-language bullets for the CEO summarizing Q2 channel performance (paid social $84k/1,120/$75 CAC, search $52k/1,310/$40, referral $9k/640/$14), the 22% better 90-day retention for referrals, and the recommendation to move $20k from social into referral and search in Q3."
  },
  {
    "id": "gen-data-farm-yield-fertilizer-compar-14",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "I run trials on my farm in Kenya. 3 fertilizer types (A, B, C), 8 plots each, maize yield in tonnes per hectare. I want to know if any fertilizer is better. Which test should I use, how do I run it in Excel, and how do I read the result? I'm not a statistician, keep it simple.",
    "intent": "A simple explanation recommending one-way ANOVA for comparing maize yields across three fertilizers with 8 plots each, step-by-step instructions using Excel's Data Analysis ToolPak, and how to interpret the p-value, with a mention of a follow-up comparison to find which fertilizer differs."
  },
  {
    "id": "gen-research-explain-photosynthesis-to-ki-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "how does photosynthesis work",
    "intent": "A parent in Leeds wants to explain photosynthesis to their 9-year-old daughter for a school project due Friday. Needs a 150-word explanation with one kitchen-table analogy and a simple experiment using a jar of pondweed. No chemical equations."
  },
  {
    "id": "gen-research-compare-loan-amortization-me-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "difference between flat rate and reducing balance??",
    "intent": "A shopkeeper in Nairobi is choosing between two KSh 400,000 business loans over 24 months: one at 12% flat, one at 21% reducing balance. Wants a plain explanation of both methods and the total interest paid on each, then which is cheaper."
  },
  {
    "id": "gen-research-literature-review-remote-nur-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "lit review on telehealth for nurses",
    "intent": "A master's nursing student in Adelaide needs an outline for a 3,000-word literature review on nurse-led telehealth follow-up for heart failure patients in rural areas, 2015 onward. Wants themes, gaps, and suggested search terms for CINAHL, in Harvard style."
  },
  {
    "id": "gen-research-summarise-meeting-notes-shor-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "can you summarise this article on the four-day work week trial at Halvorsen Logistics: [pasted 2,400 word article]"
      },
      {
        "role": "assistant",
        "text": "Here's a summary: Halvorsen Logistics ran a six-month four-day week trial across 340 staff. Productivity held steady, sick days fell 31%, and 88% of staff wanted to continue... (about 400 words)"
      }
    ],
    "draft": "shorter pls, its for my boss",
    "intent": "An HR coordinator needs the Halvorsen trial summary cut to five bullet points under 80 words total for her director, who is deciding whether to pilot a four-day week in their 60-person warehouse. Keep the 31% sick-day drop and the 88% staff figure."
  },
  {
    "id": "gen-research-learn-sourdough-science-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "why does my sourdough not rise",
    "intent": "A home baker in Montreal with a 3-week-old starter gets dense loaves; kitchen is about 18°C in winter. Wants an explanation of yeast and bacteria activity vs temperature and three specific fixes to try next bake, ranked by likely impact."
  },
  {
    "id": "gen-research-teach-me-excel-pivot-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "teach me pivot tables",
    "intent": "A clinic receptionist in Manila has an Excel sheet of 1,200 appointments with columns date, doctor, service, fee. Wants step-by-step instructions to build a pivot showing monthly revenue per doctor, written for a total beginner, numbered steps."
  },
  {
    "id": "gen-research-compare-ww1-causes-essay-7",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "main causes of ww1",
    "intent": "A Year 11 history student in Auckland is writing a 1,200-word essay arguing that militarism was the most important cause. Wants the four MAIN causes compared briefly, then strongest evidence for militarism and one counterargument to address."
  },
  {
    "id": "gen-research-explain-inflation-follow-up-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "what is core inflation vs headline inflation"
      },
      {
        "role": "assistant",
        "text": "Headline inflation measures price changes across the whole basket, including food and energy. Core inflation strips out those volatile items to show the underlying trend..."
      }
    ],
    "draft": "ok so which one matters for my rent",
    "intent": "A tenant in Toronto whose lease says rent rises with CPI wants to know which measure landlords and provincial guidelines actually use, and roughly how a 3.4% headline vs 2.6% core figure would change his $1,850 rent. Short answer, two paragraphs."
  },
  {
    "id": "gen-research-review-study-on-coffee-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "is this study legit [link]",
    "intent": "A retired engineer saw a headline claiming coffee cuts dementia risk 40%. Wants a plain check of the study: sample size, observational vs trial, confounders, and whether the headline overstates it, in under 250 words."
  },
  {
    "id": "gen-research-guitar-theory-modes-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "explain modes",
    "intent": "A self-taught guitarist who knows the major scale and pentatonic wants modes explained practically: what Dorian and Mixolydian sound like, which chord progressions to jam them over, and one fingering pattern each in A. Avoid heavy theory jargon."
  },
  {
    "id": "gen-research-clear-compare-heat-pumps-11",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Compare air-source vs ground-source heat pumps for a 140 m² detached house in central Poland, poorly insulated 1980s build. Cover upfront cost range in PLN, running costs vs our current gas boiler (~6,500 PLN/yr), efficiency in -15°C winters, and whether insulating first matters. Table plus a short recommendation.",
    "intent": "A comparison table of air-source vs ground-source heat pumps for a 140 m² poorly insulated 1980s house in central Poland: upfront PLN cost, running costs against 6,500 PLN/yr gas, cold-weather efficiency at -15°C, and the role of insulating first, followed by a short recommendation."
  },
  {
    "id": "gen-research-clear-summarise-paper-abstra-12",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Summarise this abstract in 3 sentences for a non-scientist audience (our library newsletter, readers mostly 60+). Avoid jargon, keep the key finding about walking 7,000 steps and mortality, mention it's observational. Abstract: [pasted]",
    "intent": "A three-sentence plain-language summary of the pasted abstract for a library newsletter with readers mostly over 60, keeping the 7,000-steps mortality finding and noting the study is observational."
  },
  {
    "id": "gen-research-clear-teach-spanish-subjunct-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I'm a B1 Spanish learner. Explain when to use the present subjunctive after 'cuando' vs indicative, with 5 example sentence pairs about everyday life, then give me 6 fill-in-the-blank exercises with answers at the bottom.",
    "intent": "For a B1 Spanish learner: an explanation of subjunctive vs indicative after 'cuando', five everyday example sentence pairs, and six fill-in-the-blank exercises with an answer key at the end."
  },
  {
    "id": "gen-research-clear-crop-rotation-comparis-14",
    "tag": "clear",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "I run a 12-hectare mixed farm in Normandy, mainly wheat and rapeseed."
      },
      {
        "role": "assistant",
        "text": "Thanks, that helps. What would you like to explore?"
      }
    ],
    "draft": "Compare adding field beans vs adding a clover ley into my wheat/rapeseed rotation. Focus on nitrogen savings in kg/ha, effect on blackgrass, and income loss in the break year. Keep it to one page, bullet points, and cite any research you're relying on.",
    "intent": "A one-page bulleted comparison for a 12-hectare Normandy wheat/rapeseed farmer of adding field beans vs a clover ley: nitrogen savings in kg/ha, blackgrass impact, and break-year income loss, with cited research."
  },
  {
    "id": "gen-planning-bakery-expansion-decision-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "should i open a second location",
    "intent": "Owner of Crumb & Kettle, a bakery in Porto doing €38k/month revenue at 14% margin, deciding whether to open a second shop 4 km away with €60k savings and a €90k bank offer. Wants a pros/cons comparison, break-even estimate, and a clear go/no-go recommendation with the three numbers that would change it."
  },
  {
    "id": "gen-planning-saas-quarterly-okrs-draft-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "okrs for next quarter pls",
    "intent": "Q3 OKRs for a 6-person customer success team at Tallyform, a B2B forms SaaS, focused on cutting monthly churn from 3.1% to 2.2% and raising onboarding completion. Wants 2 objectives with 3 measurable key results each, in a table, plain wording."
  },
  {
    "id": "gen-planning-wedding-planning-timeline-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "wedding in 9 months where do i even start",
    "intent": "A month-by-month checklist for a couple in Leeds planning a 70-guest wedding next June on a £14,000 budget, no planner. Wants priorities ordered (venue, photographer, caterer first), rough budget split by category, and deadlines for invitations."
  },
  {
    "id": "gen-planning-clinic-scheduling-business-c-4",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Write a one-page business case for my dental clinic (3 dentists, Kraków) to adopt online booking software. Current no-show rate 12%, avg appointment value 280 PLN, ~900 appointments/month. Software costs 650 PLN/month and vendor claims reminders cut no-shows by half. Include costs, projected savings, payback period, and two risks. Audience: my two partners.",
    "intent": "A one-page business case for partner dentists in a Kraków clinic on adopting 650 PLN/month booking software, using 900 appointments/month, 12% no-shows, 280 PLN average value and a halved no-show rate. Must show costs, savings, payback period and two risks."
  },
  {
    "id": "gen-planning-career-switch-roadmap-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "how do i get into ux design",
    "intent": "A 12-month roadmap for a 34-year-old high-school art teacher in Ohio switching to UX design while working full time, about 8 hours/week available and $1,500 to spend. Wants phases with milestones, which free vs paid courses, and when to build a 3-project portfolio and start applying."
  },
  {
    "id": "gen-planning-farm-crop-rotation-plan-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "i run a 40 hectare farm in saskatchewan, mostly canola and wheat, soil's getting tired and clubroot showed up in one field last year"
      },
      {
        "role": "assistant",
        "text": "Clubroot is serious for canola. Extending rotations and adding pulses or cereals between canola years is the main lever. Want me to sketch a rotation?"
      }
    ],
    "draft": "yes, 4 years",
    "intent": "A 4-year crop rotation for a 40 ha Saskatchewan farm splitting land into blocks, keeping canola no more than once every 4 years, adding peas or lentils, and isolating the clubroot field. Wants a year-by-block table plus a short note on expected income impact."
  },
  {
    "id": "gen-planning-nonprofit-annual-fundraising-7",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Create a 12-month fundraising plan for a small animal shelter in Cape Town (Paws Haven). Goal: R850,000 this year, last year we raised R600,000, mostly from individual donors. Volunteers only, no paid fundraiser. Break it into quarterly campaigns, include one event, a monthly-giving drive, and a corporate outreach push. Give target amounts per channel in a table.",
    "intent": "A 12-month volunteer-run fundraising plan for Paws Haven shelter in Cape Town to raise R850,000, up from R600,000. Quarterly campaigns including one event, a monthly-giving drive and corporate outreach, with a table of target amounts per channel."
  },
  {
    "id": "gen-planning-restaurant-menu-cut-decision-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "which dishes to drop from menu",
    "intent": "Owner of a 45-seat Thai restaurant in Melbourne with 32 menu items wants a method to cut down to about 20 using sales volume and margin data (menu engineering matrix). Wants steps to classify items, what to do with each quadrant, and how to tell regulars."
  },
  {
    "id": "gen-planning-product-roadmap-shorten-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "draft a 2026 roadmap for our budgeting app Pennywise: bank sync, shared household budgets, android widgets, AI categorization, export to excel"
      },
      {
        "role": "assistant",
        "text": "Here's a quarter-by-quarter roadmap with themes, features, dependencies, success metrics and risks for each quarter..."
      }
    ],
    "draft": "too long for the board slide",
    "intent": "Condense the Pennywise 2026 roadmap into a single board slide: four quarters as columns, one or two features each, one metric per quarter, under 60 words total. Drop dependencies and risks."
  },
  {
    "id": "gen-planning-freelancer-pricing-strategy-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "im undercharging what should i do",
    "intent": "A freelance translator (Spanish-English) in Valencia charging €0.06/word, earning about €2,400/month, wants a plan to raise rates to €0.09 over 6 months without losing her 3 main agency clients. Wants a staged schedule, a template email announcing the increase, and a fallback plan."
  },
  {
    "id": "gen-planning-school-tech-rollout-plan-11",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I'm the vice principal of a 600-student middle school in Nairobi. We're getting 200 tablets in January. Write a rollout plan for the spring term: teacher training in week 1-2, grade 7 pilot first, then grades 8 and 9. Include a weekly timeline, who's responsible, how we handle damage/loss, and 3 success metrics. Keep it under 2 pages.",
    "intent": "An under-2-page spring-term rollout plan for 200 tablets at a 600-student Nairobi middle school: teacher training weeks 1-2, grade 7 pilot, then grades 8 and 9. Weekly timeline, owners, damage/loss policy and 3 success metrics."
  },
  {
    "id": "gen-planning-rent-vs-buy-decision-12",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "rent or buy?",
    "intent": "A couple in Calgary paying CA$2,300/month rent deciding whether to buy a CA$520,000 townhouse with CA$60,000 saved, combined income CA$145,000, likely staying 5+ years. Wants a 5- and 10-year cost comparison with assumptions stated and a recommendation."
  },
  {
    "id": "gen-planning-warehouse-strategy-memo-revi-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "write a decision memo on whether Northline Logistics should add a second shift at the Gdańsk warehouse or lease a new 4,000 m2 site"
      },
      {
        "role": "assistant",
        "text": "Decision memo: Options, costs, capacity, risks... Recommendation: add second shift."
      }
    ],
    "draft": "Good, but add the actual numbers: second shift costs €310k/year extra labor and adds 35% capacity, new site lease is €420k/year plus €250k fit-out and adds 60% capacity. Volume is growing 20%/year. Redo the recommendation with a 3-year view and keep it one page.",
    "intent": "Revise the Northline memo into one page with a 3-year comparison: second shift €310k/year for +35% capacity versus lease €420k/year plus €250k fit-out for +60%, against 20% annual volume growth, and an updated recommendation."
  },
  {
    "id": "gen-planning-retirement-side-business-pla-14",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "business plan for my pottery thing",
    "intent": "A lean business plan for a 61-year-old retiree in Asheville selling handmade pottery at weekend markets (about $900/month now) who wants to reach $2,500/month via Etsy and two local shops. Wants a one-page plan with pricing, channels, monthly targets for 12 months, and startup costs under $3,000."
  },
  {
    "id": "gen-creative-bakery-name-ideas-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "need names for my bakery",
    "intent": "Fifteen name ideas for a small sourdough-and-pastry bakery opening in a converted tram depot in Ghent, Belgium, run by a couple named Ilse and Matteo. Names should work in Dutch and English, be short enough for a round sign, and lean warm and slightly playful rather than fancy French. Brief one-line rationale per name."
  },
  {
    "id": "gen-creative-bedtime-story-dragon-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "bedtime story w a dragon pls",
    "intent": "A calm 5-minute read-aloud bedtime story (about 600 words) for a 4-year-old named Nia who is nervous about starting preschool. The dragon should be small and shy and make a friend on its first day somewhere new. Gentle ending, no scary parts, simple repeated phrases she can join in on."
  },
  {
    "id": "gen-creative-gym-tagline-shorter-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "tagline for my gym, its for older adults, called IronBloom, in Perth"
      },
      {
        "role": "assistant",
        "text": "Here are a few: 1. \"IronBloom: Strength that grows with you, at every age.\" 2. \"Stronger tomorrow starts at IronBloom today.\" 3. \"Built for the years ahead — IronBloom Perth.\""
      }
    ],
    "draft": "shorter and less cheesy",
    "intent": "Tagline options for IronBloom, a Perth strength gym for adults 55+, of five words or fewer each. Tone should be plain and confident, avoiding clichés like 'age is just a number' or 'grow'. Wants around eight options for the shopfront window decal."
  },
  {
    "id": "gen-creative-short-film-script-scene-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "write a scene where two sisters argue",
    "intent": "A two-page screenplay scene in proper format for a student short film shot in one kitchen location. Adult sisters Rosa and Dalia argue over whether to sell their late father's fishing boat in a Portuguese coastal town; subtext about who stayed home and who left. No resolution, ends on a silent beat, realistic dialogue with minimal exposition."
  },
  {
    "id": "gen-creative-poster-art-direction-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "art direction ideas for a jazz festival poster",
    "intent": "Three distinct visual concepts for a print poster for the Marrow Creek Jazz Weekend, a small outdoor festival in rural Tennessee, Aug 14–16, with a budget for one illustrator. Each concept should give palette, typography direction, main image and mood in a short paragraph. Audience is mostly locals 40+, so it should feel welcoming, not edgy."
  },
  {
    "id": "gen-creative-podcast-name-brainstorm-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "podcast name ideas?? something catchy",
    "intent": "Name ideas for a biweekly podcast where two nurses in Manchester discuss night-shift life with dark humour and practical tips for new nurses. Wants 12 options, ideally with an available-sounding .com style and not containing the word 'scrubs'. Mark the top three favourites."
  },
  {
    "id": "gen-creative-wedding-toast-poem-7",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "short poem for my brothers wedding",
    "intent": "A rhyming poem of 12–16 lines to read during a best-man toast for brother Kofi marrying Hana in Accra. Should mention their first meeting at a badly flooded bus stop and Kofi's terrible cooking, lightly funny then sincere at the end. Must take under a minute to read aloud."
  },
  {
    "id": "gen-creative-fantasy-world-concept-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "help me come up with a magic system",
    "intent": "A magic system for a YA fantasy novel set in a desert archipelago where magic is drawn from salt and every spell permanently costs the caster a memory. Needs clear rules, limits, two or three types of practitioners and how society regulates it, in about 500 words. Should create moral dilemmas for a 16-year-old protagonist."
  },
  {
    "id": "gen-creative-product-launch-video-script-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "we make a reusable lunchbox called KeepCrate, stainless, leakproof, kids version coming out"
      },
      {
        "role": "assistant",
        "text": "Sounds great! How can I help with the KeepCrate kids launch?"
      }
    ],
    "draft": "write the video script",
    "intent": "A 30-second Instagram Reels script for the KeepCrate Kids lunchbox launch, aimed at parents of 5–10-year-olds. Shot list with on-screen text and voiceover, showing the leakproof test with yogurt and the dishwasher-safe lid. Ends with launch date of 3 March and price of $34."
  },
  {
    "id": "gen-creative-mural-concept-library-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "ideas for a mural",
    "intent": "Concepts for a 6m by 3m outdoor mural on the side of the Westhaven public library in a mixed Somali and Polish neighbourhood. The council wants it to celebrate reading and community without text in any one language. Three concepts with composition, palette and how residents could contribute elements."
  },
  {
    "id": "gen-creative-horror-flash-fiction-clear-11",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Write a horror flash fiction piece under 300 words for a contest. Setting: a 24-hour laundromat at 3am. First person, present tense. The twist should be that the narrator is the one haunting the place, revealed only in the last line. No gore, slow creeping dread.",
    "intent": "A first-person, present-tense horror flash piece under 300 words, set in a 24-hour laundromat at 3am, building slow dread without gore, with a final-line reveal that the narrator is the ghost. For a contest submission."
  },
  {
    "id": "gen-creative-coffee-brand-taglines-clear-12",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Give me 10 tagline options for Halde Coffee, a Norwegian roaster selling light-roast beans by subscription. Audience: home brewers 25–40. Tone dry and understated, Scandinavian, no exclamation marks, max 6 words each. English only.",
    "intent": "Ten English taglines of six words or fewer for Halde Coffee, a Norwegian light-roast subscription roaster, targeting home brewers aged 25–40, in a dry understated Scandinavian tone with no exclamation marks."
  },
  {
    "id": "gen-creative-character-names-scifi-clear-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I'm writing a sci-fi novel about a generation ship 300 years into its voyage. Crew descends from Indonesian, Nigerian and Finnish settlers whose languages have blended. Give me 20 first+last names that feel like that blend evolved, plus 5 names for the ship's districts. Just lists, no explanations.",
    "intent": "Twenty first-and-last name combinations reflecting an evolved blend of Indonesian, Nigerian and Finnish naming on a 300-year generation ship, plus five district names for the ship. Plain lists only, no commentary."
  },
  {
    "id": "gen-creative-comic-strip-rewrite-clear-14",
    "tag": "clear",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "Here's my 4-panel comic: P1 cat stares at empty bowl. P2 cat stares at owner. P3 owner says 'you ate an hour ago'. P4 cat knocks a glass off the table."
      },
      {
        "role": "assistant",
        "text": "That's a solid classic setup. The punchline in panel 4 works visually, though it's a familiar beat. Want alternatives?"
      }
    ],
    "draft": "yes, give me 3 alternative panel 4 endings, keep panels 1-3 the same, each ending should be wordless and work as a single visual gag, and avoid knocking things off tables",
    "intent": "Three alternative wordless panel-4 punchlines for the existing cat comic, keeping panels 1–3 unchanged, each a single visual gag that doesn't involve knocking objects off surfaces."
  },
  {
    "id": "gen-personal-knee-pain-running-return-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "knee hurts after running what do i do",
    "intent": "A 38-year-old in Leeds who started running 3 weeks ago (5k three times a week) has dull pain on the outside of the right knee that starts around km 3. Wants likely causes (e.g. IT band), what to change in the training plan, two or three stretches, and clear signs that mean seeing a physio instead."
  },
  {
    "id": "gen-personal-cheap-dinners-family-four-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "easy dinners for the week?",
    "intent": "A 5-night weeknight dinner plan for a family of four in Lyon (two kids aged 6 and 9, one vegetarian adult), each meal under 30 minutes and roughly €60 total for the week. Wants a combined shopping list grouped by aisle."
  },
  {
    "id": "gen-personal-lisbon-anniversary-weekend-p-3",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "plan a trip to lisbon",
    "intent": "A 3-day itinerary in Lisbon for a couple's 10th anniversary in late October, staying in Alfama, no car, one of them can't handle steep long walks. Wants one special dinner suggestion per night around €80–120 for two and a day trip option to Sintra or Cascais."
  },
  {
    "id": "gen-personal-apology-text-to-sister-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "i missed my sister's birthday dinner because of work and she's not answering"
      },
      {
        "role": "assistant",
        "text": "That sounds hard. Would you like help writing her a message? It may help to acknowledge the hurt without over-explaining."
      }
    ],
    "draft": "yeah write something",
    "intent": "A short WhatsApp message (3–4 sentences) to her younger sister Mira apologizing for missing her 30th birthday dinner, owning it without blaming work, and offering to take her to brunch this Saturday. Warm, not dramatic, no emojis overload."
  },
  {
    "id": "gen-personal-credit-card-debt-payoff-orde-5",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I have three debts: Visa $4,200 at 24.9%, store card $1,100 at 29.9%, car loan $9,800 at 6.5%. I can pay $650/month total beyond minimums... actually $650 total including minimums (Visa min $120, store $40, car $260). Compare avalanche vs snowball: months to debt-free and total interest for each. Table please.",
    "intent": "A comparison of avalanche vs snowball for three debts (Visa $4,200 at 24.9%, store card $1,100 at 29.9%, car $9,800 at 6.5%) with $650/month total including minimums of $120/$40/$260. Wants months to payoff and total interest per method in a table."
  },
  {
    "id": "gen-personal-mould-bathroom-rental-flat-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "black stuff on bathroom ceiling how to get rid",
    "intent": "A renter in a Glasgow flat with a windowless bathroom has black mould spots on the ceiling above the shower. Wants a safe cleaning method with cheap products, how to stop it returning, and a short polite email to the landlord asking about a broken extractor fan."
  },
  {
    "id": "gen-personal-beginner-gym-split-three-7",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Make me a 3-day/week full-body gym plan for a total beginner, 45 minutes per session, goal is general strength and losing a bit of fat. I'm 52, female, mild lower back issues so no barbell deadlifts. Include sets, reps and how to progress over 8 weeks.",
    "intent": "A 3-day full-body beginner plan, 45 minutes per session, for a 52-year-old woman wanting strength and modest fat loss, avoiding barbell deadlifts due to mild back issues. Sets, reps, and an 8-week progression."
  },
  {
    "id": "gen-personal-wedding-gift-amount-question-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "how much do you give at a wedding",
    "intent": "A guest in Toronto attending a coworker's wedding alone, cash gift customary, dinner at a mid-range venue. Wants a reasonable range in CAD for a colleague she's friendly with but not close to, and whether a card plus cash is the norm."
  },
  {
    "id": "gen-personal-meal-prep-high-protein-9",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "I want to get to about 140g protein a day, I'm 75kg and cutting"
      },
      {
        "role": "assistant",
        "text": "That's a solid target. Do you want food ideas, a sample day, or a meal-prep plan?"
      }
    ],
    "draft": "meal prep one, no fish tho",
    "intent": "A Sunday meal-prep plan for 5 workdays giving ~140g protein/day at around 1,900 kcal, no fish or seafood. Wants lunches and dinners with macros per portion, a grocery list, and storage notes for fridge vs freezer."
  },
  {
    "id": "gen-personal-thailand-vaccines-two-weeks-10",
    "tag": "clear",
    "site": "claude",
    "history": [],
    "draft": "Going to Chiang Mai and the islands in Thailand for 2 weeks in March, leaving from Berlin. What vaccinations are usually recommended, and what should I ask my doctor about malaria tablets? Just a short checklist, I'll confirm with the travel clinic.",
    "intent": "A short checklist of commonly recommended vaccines for a 2-week March trip from Berlin to Chiang Mai and Thai islands, plus questions to ask the doctor about malaria prophylaxis. Brief, with a note to confirm at a travel clinic."
  },
  {
    "id": "gen-personal-boyfriend-moving-in-talk-11",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "how to bring up money stuff before moving in together",
    "intent": "A woman in Melbourne whose boyfriend earns about twice her salary is moving into her flat next month. Wants a few conversation openers and a fair way to split rent (A$2,400/month) and bills proportionally, framed gently so it doesn't feel transactional."
  },
  {
    "id": "gen-personal-sleep-schedule-night-shift-12",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "cant sleep after night shifts",
    "intent": "A nurse in Manila working three 12-hour night shifts (7pm–7am) a week, then switching to days on off-days, sleeps only 4 hours after shifts. Wants a practical sleep schedule for shift and off days, plus tips on light, caffeine cutoff, and naps."
  },
  {
    "id": "gen-personal-kitchen-renovation-budget-sp-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "We have €18,000 for a small kitchen renovation in our apartment in Valencia (about 9 m²). Keeping the layout and plumbing as is. Break the budget down by category: cabinets, countertop, appliances, labor, flooring, contingency. Give typical percentages and a euro amount each.",
    "intent": "A budget breakdown for an €18,000 renovation of a 9 m² kitchen in Valencia, keeping layout and plumbing, split into cabinets, countertop, appliances, labor, flooring, and contingency with percentages and euro amounts."
  },
  {
    "id": "gen-personal-shorter-retirement-savings-r-14",
    "tag": "clear",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "I'm 34, earn $72k, have $15k in a 401k, employer matches 4%. How much should I contribute?"
      },
      {
        "role": "assistant",
        "text": "At minimum contribute 4% to capture the full match. Many guidelines suggest 15% total including the match, so around 11% from you, rising over time as raises come in. Also consider whether an emergency fund and any high-interest debt come first..."
      }
    ],
    "draft": "ok make that shorter, just the numbers and what to do first, 3 bullets max",
    "intent": "A condensed version of the previous retirement advice for a 34-year-old earning $72k with a 4% match: at most three bullets covering contribute at least 4%, aim for ~11% from salary (15% total), and handle emergency fund/high-interest debt first."
  },
  {
    "id": "gen-other-wedding-toast-for-sister-1",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "need a toast for my sisters wedding",
    "intent": "A 2-3 minute maid-of-honor toast for her younger sister Marta marrying Joaquín in Valencia, with one funny story about Marta getting lost on a 2015 camping trip and a sincere ending. Warm, light humor, nothing embarrassing about exes, ends with a raise-your-glass line."
  },
  {
    "id": "gen-other-dog-keeps-barking-night-2",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "how do i get my dog to stop barking",
    "intent": "Owner of a 2-year-old rescue beagle mix in a Leeds flat whose dog barks at hallway noises between 10pm and 1am, prompting a neighbour complaint. Wants a step-by-step 3-week desensitization plan plus quick fixes for tonight, no shock or citronella collars."
  },
  {
    "id": "gen-other-garden-shed-permit-question-3",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I live in a detached house in a suburb of Ottawa, Ontario. I want to build a 10x12 ft garden shed, 9 ft tall, no electricity, on gravel base, 2 ft from the back fence. Do I likely need a building permit, what setbacks usually apply, and what should I ask the city before buying materials? Short bullet list please.",
    "intent": "A short bullet list on whether a 120 sq ft, 9 ft tall unpowered shed on gravel in suburban Ottawa likely needs a permit, typical setback rules, whether 2 ft from the rear fence is likely OK, and specific questions to ask the city before buying materials."
  },
  {
    "id": "gen-other-rewrite-complaint-shorter-4",
    "tag": "ambiguous",
    "site": "claude",
    "history": [
      {
        "role": "user",
        "text": "write a complaint to my landlord, the heating has been broken for 9 days and i called twice"
      },
      {
        "role": "assistant",
        "text": "Dear Mr. Okafor, I am writing to formally report that the heating in my unit has not worked for nine days despite two phone calls... [full four-paragraph letter]"
      }
    ],
    "draft": "too long and too nice",
    "intent": "Cut the letter to about 120 words, firm rather than polite, stating the 9 days and two calls with dates, demanding repair within 48 hours, and noting she'll contact the city housing office otherwise. No threats of lawsuits."
  },
  {
    "id": "gen-other-choir-rehearsal-schedule-pla-5",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [],
    "draft": "rehearsal schedule for christmas concert",
    "intent": "A volunteer director of a 28-person community choir in Galway needs a weekly rehearsal plan from 1 October to the 14 December concert, Tuesdays 7:30-9pm, for 9 pieces including one with orchestra. Wants a table showing which pieces each week, with two full run-throughs before the concert."
  },
  {
    "id": "gen-other-retirement-gift-coworker-ide-6",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "gift ideas for someone retiring",
    "intent": "Team of 12 at a Rotterdam logistics firm pooling about €240 for Henk, retiring after 31 years, who loves sailing and birdwatching. Wants 6-8 concrete gift ideas within budget, plus one group-signed keepsake idea."
  },
  {
    "id": "gen-other-funeral-eulogy-grandfather-d-7",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Please help me write a eulogy for my grandfather Tomasz, 88, who was a carpenter in Kraków for 50 years, built the family's summer house, loved chess and terrible puns, and raised four kids after my grandmother died young. I'm reading it in English at the service, about 4 minutes. Gentle, with one light moment about his puns.",
    "intent": "A roughly 4-minute English eulogy (~500 words) for grandfather Tomasz, 88, a Kraków carpenter for 50 years who built the summer house, loved chess and puns, and raised four kids as a widower. Gentle tone with one light moment about his puns."
  },
  {
    "id": "gen-other-moving-checklist-cross-count-8",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "moving checklist",
    "intent": "A family of four moving from Perth to Brisbane in 8 weeks with a cat and a school-age child. Wants a week-by-week checklist covering removalists, school transfer, pet transport, utilities and Queensland car registration."
  },
  {
    "id": "gen-other-book-club-discussion-questio-9",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "I'm hosting my book club Thursday. We read a novel called The Salt Orchard (fictional, about three sisters inheriting a failing apple farm in Tasmania). Give me 8 discussion questions, mix of character, theme and 'what would you do' questions, no spoilers needed since everyone finished it.",
    "intent": "Eight book-club discussion questions on The Salt Orchard, about three sisters inheriting a failing Tasmanian apple farm, mixing character, theme and what-would-you-do questions; spoilers allowed."
  },
  {
    "id": "gen-other-car-noise-diagnosis-help-10",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "car making weird noise when i brake",
    "intent": "Driver of a 2014 hatchback with 142,000 km hears a high squeal when braking lightly at low speeds, worse in the morning. Wants likely causes ranked, whether it's safe to drive for a week, and a rough cost range to expect at a garage in Bristol."
  },
  {
    "id": "gen-other-pick-paint-color-continue-11",
    "tag": "ambiguous",
    "site": "chatgpt",
    "history": [
      {
        "role": "user",
        "text": "my living room faces north, small, grey sofa and oak floors. paint ideas?"
      },
      {
        "role": "assistant",
        "text": "For a north-facing room, warm neutrals work well: 1) soft cream, 2) warm greige, 3) muted sage, 4) pale terracotta..."
      }
    ],
    "draft": "ok the sage one, what about trim and ceiling",
    "intent": "Having chosen muted sage for the walls, wants matching trim and ceiling suggestions: specific shade descriptions, finish (eggshell, satin, flat), and whether to paint the ceiling white or a tint of the sage, keeping the small room feeling larger."
  },
  {
    "id": "gen-other-volunteer-signup-email-draft-12",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "email asking parents to volunteer",
    "intent": "PTA secretary at Brookfield Primary needs an email asking parents to fill 20 volunteer shifts for the 17 May spring fair, 9am-3pm, in 2-hour slots, signup via a shared form by 5 May. Friendly, under 150 words, with a clear subject line."
  },
  {
    "id": "gen-other-tenant-deposit-dispute-lette-13",
    "tag": "clear",
    "site": "chatgpt",
    "history": [],
    "draft": "Write a letter to my former landlord, Greenhill Lettings, asking for my £1,150 deposit back. I moved out 6 weeks ago (lease ended 31 March), left the flat cleaned, have dated photos, and they haven't replied to two emails. Mention I'll go to the deposit protection scheme dispute service if not returned in 14 days. Firm but polite, one page.",
    "intent": "A one-page firm but polite letter to Greenhill Lettings requesting return of a £1,150 deposit, noting lease end 31 March, move-out 6 weeks ago, cleaned flat with dated photos, two unanswered emails, and escalation to the deposit scheme dispute service after 14 days."
  },
  {
    "id": "gen-other-camping-trip-food-plan-14",
    "tag": "ambiguous",
    "site": "claude",
    "history": [],
    "draft": "what food to bring camping",
    "intent": "Three-night canoe camping trip in Algonquin-style backcountry for 4 adults, one vegetarian, no cooler, single gas burner. Wants a meal plan per day plus a packing list with quantities, lightweight and nothing that needs refrigeration."
  }
];
