import { useEffect, useRef, useState } from 'preact/hooks';
import type { GapReport, HistoryMessage } from '../../src/messaging';

/* ---------- Keycap: the one bold element ---------- */

export function Keycap({ pressed, busy, onPress }: { pressed: boolean; busy: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      class="keycap"
      data-pressed={pressed || busy}
      aria-label="Improve the draft (Alt+Shift+P)"
      onClick={onPress}
      disabled={busy}
    >
      <span class="keycap-side" aria-hidden="true" />
      <span class="keycap-top">
        <span class="keycap-legend">{busy ? '…' : 'Press'}</span>
        <span class="keycap-sub" aria-hidden="true">
          ⌥⇧P
        </span>
      </span>
    </button>
  );
}

/* ---------- Transcript editor ---------- */

function AutoTextarea(props: {
  value: string;
  placeholder?: string;
  onInput: (v: string) => void;
  minRows?: number;
  class?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      class={props.class}
      rows={props.minRows ?? 2}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onInput={(e) => props.onInput((e.currentTarget as HTMLTextAreaElement).value)}
      spellcheck={false}
    />
  );
}

export function Transcript({ turns, onChange }: { turns: HistoryMessage[]; onChange: (t: HistoryMessage[]) => void }) {
  function update(i: number, patch: Partial<HistoryMessage>) {
    onChange(turns.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function remove(i: number) {
    onChange(turns.filter((_, idx) => idx !== i));
  }
  function add() {
    const last = turns[turns.length - 1];
    onChange([...turns, { role: last?.role === 'user' ? 'assistant' : 'user', text: '' }]);
  }

  return (
    <div class="transcript">
      {turns.length === 0 && <p class="empty">No conversation yet. This will be the first message.</p>}
      {turns.map((turn, i) => (
        <div class={`turn turn-${turn.role}`} key={i}>
          <div class="turn-meta">
            <button
              type="button"
              class="role"
              title="Switch role"
              onClick={() => update(i, { role: turn.role === 'user' ? 'assistant' : 'user' })}
            >
              {turn.role === 'user' ? 'You' : 'Assistant'}
            </button>
            <button type="button" class="ghost small" onClick={() => remove(i)} aria-label={`Remove turn ${i + 1}`}>
              Remove
            </button>
          </div>
          <AutoTextarea
            value={turn.text}
            onInput={(text) => update(i, { text })}
            ariaLabel={`${turn.role} message ${i + 1}`}
            placeholder={turn.role === 'user' ? 'What you said…' : 'What the assistant replied…'}
          />
        </div>
      ))}
      <button type="button" class="ghost" onClick={add}>
        Add a turn
      </button>
    </div>
  );
}

/* ---------- Questions ---------- */

export function Questions({
  report,
  answers,
  onAnswer,
  onSubmit,
  onSkip,
}: {
  report: GapReport;
  answers: Record<number, string>;
  onAnswer: (i: number, v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const answered = report.questions.filter((_, i) => answers[i]?.trim()).length;
  return (
    <div class="questions">
      <ol class="question-list">
        {report.questions.map((q, i) => (
          <li class="question" key={i}>
            <p class="question-text">{q.question}</p>
            <div class="chips" role="group" aria-label="Suggested answers">
              {q.suggestions.map((s) => (
                <button
                  type="button"
                  class="chip"
                  key={s}
                  aria-pressed={answers[i] === s}
                  onClick={() => onAnswer(i, answers[i] === s ? '' : s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              type="text"
              class="answer"
              value={answers[i] ?? ''}
              placeholder="Or type your own"
              aria-label={`Answer: ${q.question}`}
              onInput={(e) => onAnswer(i, (e.currentTarget as HTMLInputElement).value)}
            />
          </li>
        ))}
      </ol>
      <div class="actions">
        <button type="button" class="primary" onClick={onSubmit}>
          {answered > 0 ? `Rewrite with ${answered} answer${answered === 1 ? '' : 's'}` : 'Rewrite anyway'}
        </button>
        <button type="button" class="ghost" onClick={onSkip}>
          Skip questions
        </button>
      </div>
    </div>
  );
}

/* ---------- Result ---------- */

export function Verdict({ report, asked }: { report: GapReport; asked: boolean }) {
  const pct = Math.round(report.ambiguity * 100);
  const text = asked
    ? `Ambiguity ${pct}% — asking ${report.questions.length} question${report.questions.length === 1 ? '' : 's'} before rewriting.`
    : `Ambiguity ${pct}% — ${report.alreadyClearBecause ?? 'clear enough to rewrite directly.'}`;
  return (
    <div class="verdict">
      <div class="meter" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p>{text}</p>
      {report.missing.length > 0 && (
        <p class="missing">
          Missing: {report.missing.map((m) => m.replace('_', ' ')).join(', ')}
        </p>
      )}
    </div>
  );
}

export function Result({ text, original, onUseAsDraft }: { text: string; original: string; onUseAsDraft: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div class="result">
      <div class="result-text">{text}</div>
      <div class="actions">
        <button type="button" class="primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
        <button type="button" class="ghost" onClick={onUseAsDraft}>
          Use as new draft
        </button>
      </div>
      <details class="original">
        <summary>Show original draft</summary>
        <p>{original}</p>
      </details>
    </div>
  );
}

/* ---------- API key ---------- */

export function KeyDialog({
  open,
  current,
  onSave,
  onClear,
  onClose,
}: {
  open: boolean;
  current: string | null;
  onSave: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function save() {
    const key = value.trim();
    if (!key.startsWith('sk-ant-')) {
      setError('Anthropic keys start with sk-ant-.');
      return;
    }
    setError(null);
    onSave(key);
    setValue('');
  }

  return (
    <dialog ref={ref} class="key-dialog" onClose={onClose}>
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2>Your Anthropic API key</h2>
        <p>
          Calls go straight from this page to the Anthropic API with your key. It is stored only in this browser and
          never sent anywhere else.
        </p>
        <label>
          <span>{current ? `Saved: ${current.slice(0, 10)}…${current.slice(-4)}` : 'Key'}</span>
          <input
            type="password"
            value={value}
            placeholder="sk-ant-…"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>
        {error && <p class="error">{error}</p>}
        <div class="actions">
          <button type="button" class="primary" onClick={save}>
            Save key
          </button>
          {current && (
            <button type="button" class="ghost" onClick={onClear}>
              Remove saved key
            </button>
          )}
          <button type="button" class="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  );
}
