// Turns a master prompt into sections for display. Display only: what gets inserted into the
// target app is always the raw rewrite text.
//
// Two shapes are recognised: XML-tagged (<role>…</role>, used when the target is claude.ai) and
// label-led ("Role:" on its own line, used everywhere else). A section still streaming (no closing
// tag yet) is returned as the last section so the text can be rendered while it arrives.

export interface Section {
  label: string;
  body: string;
}

const CANONICAL: Record<string, string> = {
  role: 'Role',
  persona: 'Role',
  goal: 'Goal',
  context: 'Context',
  task: 'Task',
  tasks: 'Task',
  quality_bar: 'Quality bar',
  'quality bar': 'Quality bar',
  constraints: 'Constraints',
  output: 'Output',
  output_format: 'Output',
  'done when': 'Done when',
  done_when: 'Done when',
  examples: 'Examples',
  assumptions: 'Assumptions',
  open_questions: 'Open questions',
  'open questions': 'Open questions',
};

const LABEL_WORDS = ['Role', 'Persona', 'Goal', 'Context', 'Task', 'Quality bar', 'Constraints', 'Output', 'Done when', 'Examples', 'Assumptions', 'Open questions'];
const LABEL_LINE = new RegExp(`^(?:\\*\\*|#{1,3}\\s*)?(${LABEL_WORDS.join('|')})(?:\\*\\*)?\\s*(?::|—|–|-)?\\s*(.*)$`, 'i');

function pretty(key: string): string {
  const k = key.toLowerCase().trim();
  return CANONICAL[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function parseXml(text: string): Section[] | null {
  if (!/^\s*<[a-z][a-z_]*>/.test(text)) return null;
  const re = /<([a-z][a-z_]*)>\s*([\s\S]*?)\s*(?:<\/\1>|$)/g;
  const sections: Section[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) sections.push({ label: pretty(m[1]!), body: m[2]!.trim() });
  return sections.length ? sections : null;
}

function parseLabels(text: string): Section[] | null {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of text.split('\n')) {
    const m = raw.match(LABEL_LINE);
    // A label line is short: the word, optional punctuation, and at most a short remainder on the same line.
    if (m && (m[2]!.length === 0 || /[:—–-]\s*\S/.test(raw))) {
      current = { label: pretty(m[1]!), body: m[2]!.trim() };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (!raw.trim()) continue;
      current = { label: '', body: raw };
      sections.push(current);
      continue;
    }
    current.body = current.body ? `${current.body}\n${raw}` : raw;
  }
  const labelled = sections.filter((s) => s.label).length;
  if (labelled < 2) return null;
  return sections.map((s) => ({ ...s, body: s.body.trim() }));
}

/** Sections when the text is a master prompt; null for plain prose (render as-is). */
export function parseSections(text: string): Section[] | null {
  return parseXml(text) ?? parseLabels(text);
}

export type Inline = { kind: 'text'; text: string } | { kind: 'assumed' } | { kind: 'placeholder'; text: string } | { kind: 'bold'; text: string };

/** Splits a line into runs: plain text, "(assumed)" markers, [placeholders], **bold**. */
export function inlineRuns(line: string): Inline[] {
  const runs: Inline[] = [];
  const re = /\(assumed\)|\[[^\]\n]{1,120}\]|\*\*[^*\n]{1,80}\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) runs.push({ kind: 'text', text: line.slice(last, m.index) });
    const hit = m[0];
    if (hit === '(assumed)') runs.push({ kind: 'assumed' });
    else if (hit.startsWith('[')) runs.push({ kind: 'placeholder', text: hit });
    else runs.push({ kind: 'bold', text: hit.slice(2, -2) });
    last = m.index + hit.length;
  }
  if (last < line.length) runs.push({ kind: 'text', text: line.slice(last) });
  return runs;
}

export type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] };

/** Groups a section body into paragraphs, bullet lists and numbered lists. */
export function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const bullet = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const kind: 'ul' | 'ol' = /^\s*\d/.test(line) ? 'ol' : 'ul';
      const prev = out[out.length - 1];
      if (prev && prev.kind === kind) prev.items.push(bullet[1]!);
      else out.push({ kind, items: [bullet[1]!] });
      continue;
    }
    out.push({ kind: 'p', text: line.trim() });
  }
  return out;
}
