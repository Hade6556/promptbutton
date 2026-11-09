import type { HistoryMessage } from '../../src/messaging';

export interface Sample {
  id: string;
  label: string;
  /** What the demo is meant to show. */
  note: string;
  history: HistoryMessage[];
  draft: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'cold',
    label: 'Cold start, vague ask',
    note: 'No conversation yet and almost nothing specified. Expect questions.',
    history: [],
    draft: 'write a blog post about ai',
  },
  {
    id: 'deep',
    label: 'Deep in a chat, vague reference',
    note: 'The history holds the answers. Expect a rewrite that pulls them in, with few or no questions.',
    history: [
      {
        role: 'user',
        text: "I'm planning a 5-day trip to Lisbon in late March with my partner. We like food markets, walking, and small museums. Budget is about €150/day for the two of us excluding the flat.",
      },
      {
        role: 'assistant',
        text: 'Great brief. Here is a 5-day outline: Day 1 Alfama and the Sé, Day 2 Belém and LX Factory, Day 3 Sintra day trip, Day 4 Mouraria food walk and Gulbenkian, Day 5 Cascais by train. Want me to go deeper on any day?',
      },
      {
        role: 'user',
        text: 'Day 3 looks too packed. We don’t want to be on a train before 9 and we want a long lunch.',
      },
      {
        role: 'assistant',
        text: 'Understood. Revised Day 3: 9:40 train to Sintra, Quinta da Regaleira first, long lunch at Tascantiga around 13:30, then Pena Palace gardens only, back by 18:00.',
      },
    ],
    draft: 'ok now do the same for the other one and put it all in a table',
  },
  {
    id: 'clear',
    label: 'Short, clear follow-up',
    note: 'A quick follow-up that is unambiguous in context. Expect no questions and a light touch.',
    history: [
      {
        role: 'user',
        text: 'Write a 3-paragraph product update email to our existing customers announcing dark mode in our invoicing app. Friendly tone, no hype, end with a link to the changelog.',
      },
      {
        role: 'assistant',
        text: 'Subject: Dark mode is here\n\nHi there,\n\nYou asked, and it’s ready: dark mode is now available across the invoicing app…\n\n(three paragraphs)\n\nRead the full changelog →',
      },
    ],
    draft: 'make it shorter',
  },
];
