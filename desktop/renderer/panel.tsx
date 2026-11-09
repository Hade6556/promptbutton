import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GapReport } from '../../src/messaging';
import { diffWords } from '../../src/utils/diff';
import type { PanelState, Settings } from '../shared';

const send = (action: Parameters<Window['pb']['send']>[0]) => window.pb.send(action);

/* ---------- icons (lucide-style strokes) ---------- */
const I = {
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  square: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  sparkles: <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" />,
  wand: <path d="m15 4 1 1-9.5 9.5-1-1zM13 6l5 5M4 20l3-1-2-2zM9 4h.01M20 15h.01M15 2h.01M3 11h.01" />,
  insert: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />,
  copy: <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  dots: <>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  skip: <path d="M5 5v14l9-7zM19 5v14" />,
  eye: <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
};
function Icon({ d, size = 14 }: { d: preact.JSX.Element; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}
function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="7" width="26" height="22" rx="7" fill="#1D37A8" />
      <rect x="3" y="3" width="26" height="22" rx="7" fill="#3B6CFF" />
    </svg>
  );
}
function Key({ children }: { children: preact.ComponentChildren }) {
  return <kbd class="key">{children}</kbd>;
}

/* ---------- the overlay ---------- */

export function Panel() {
  const [state, setState] = useState<PanelState>({ phase: 'hidden' });
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [note, setNote] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.pb.getState().then(setState);
    return window.pb.onState((next) => {
      setState(next);
      if (next.phase === 'asking') setAnswers({});
      if (next.phase === 'analyzing' || next.phase === 'settings' || next.phase === 'error') setCollapsed(false);
      if (next.phase === 'done') setNote('');
    });
  }, []);

  // Window height follows the content; clicks outside pill/card fall through to the app below.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => window.pb.resize(root.getBoundingClientRect().height + 16);
    const observer = new ResizeObserver(report);
    observer.observe(root);
    report();
    return () => observer.disconnect();
  }, [state.phase, collapsed]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const over = (e.target as HTMLElement | null)?.closest('.pill, .card');
      window.pb.setMouseThrough(!over);
    }
    function onLeave() {
      window.pb.setMouseThrough(true);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const primary = () => {
    if (state.phase === 'done' && state.text) send({ type: 'accept', text: state.text });
    else if (state.phase === 'asking') submitAnswers();
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') send({ type: 'cancel' });
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        primary();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function submitAnswers() {
    if (!state.report) return;
    send({
      type: 'answers',
      answers: state.report.questions
        .map((q, i) => ({ question: q.question, answer: (answers[i] ?? '').trim() }))
        .filter((a) => a.answer.length > 0),
    });
  }

  function submitNote() {
    const trimmed = note.trim();
    if (!trimmed) return primary();
    send({ type: 'refine', note: trimmed });
    setNote('');
  }

  if (state.phase === 'hidden') return null;

  const busy = state.phase === 'capturing' || state.phase === 'analyzing' || state.phase === 'rewriting';
  const app = state.appName ?? 'this app';
  const showCard = !collapsed;

  return (
    <div class="overlay" ref={rootRef}>
      <div class="pill">
        <div class="logo" title="PromptButton">
          <Logo />
        </div>
        <button type="button" class="pill-btn" onClick={() => setCollapsed((c) => !c)}>
          <Icon d={collapsed ? I.chevronUp : I.chevronDown} size={13} />
          {collapsed ? 'Show' : 'Hide'}
        </button>
        <button type="button" class="pill-icon" title="Close (esc)" aria-label="Close" onClick={() => send({ type: 'cancel' })}>
          <Icon d={I.square} size={12} />
        </button>
      </div>

      {showCard && (
        <div class="card" data-phase={state.phase}>
          {state.phase === 'settings' && state.settings ? (
            <SettingsForm settings={state.settings} error={state.error} hotkey={state.hotkey} />
          ) : (
            <>
              {state.draft && (state.phase !== 'notice' || state.offerForcePaste) && (
                <div class="bubble-row">
                  <div class="bubble">{state.draft}</div>
                </div>
              )}

              {busy && (
                <p class="status">
                  <span class="shimmer">
                    {state.phase === 'rewriting'
                      ? 'Rewriting…'
                      : state.phase === 'capturing'
                        ? 'Reading the screen…'
                        : `Reading ${app} and checking what’s missing…`}
                  </span>
                </p>
              )}

              {state.report && (state.phase === 'asking' || state.phase === 'rewriting' || state.phase === 'done') && (
                <div class="badges">
                  <span class="badge">
                    <Icon d={I.eye} size={12} /> Viewed {app}
                  </span>
                  <span class="badge muted">
                    {Math.round(state.report.ambiguity * 100)}% ambiguous
                    {state.report.missing.length > 0 && ` · missing ${state.report.missing.map((m) => m.replace('_', ' ')).join(', ')}`}
                  </span>
                </div>
              )}

              {state.phase === 'asking' && state.report && (
                <Questions report={state.report} answers={answers} onAnswer={(i, v) => setAnswers((a) => ({ ...a, [i]: v }))} />
              )}

              {(state.phase === 'rewriting' || state.phase === 'done') && (
                <Answer text={state.text ?? ''} original={state.draft ?? ''} streaming={state.phase === 'rewriting'} />
              )}

              {state.phase === 'error' && <p class="line error">{state.error}</p>}
              {state.phase === 'notice' && <p class="line">{state.notice}</p>}

              <div class="chips">
                {state.phase === 'asking' && (
                  <>
                    <Chip icon={I.sparkles} label="Rewrite with answers" onClick={submitAnswers} />
                    <Dot />
                    <Chip icon={I.skip} label="Skip questions" onClick={() => send({ type: 'skip' })} />
                  </>
                )}
                {state.phase === 'done' && state.text && (
                  <>
                    <Chip icon={I.insert} label={`Insert into ${app}`} onClick={() => send({ type: 'accept', text: state.text! })} />
                    <Dot />
                    <Chip icon={I.copy} label="Copy" onClick={() => send({ type: 'copy', text: state.text! })} />
                    <Dot />
                    <Chip icon={I.refresh} label="Rewrite again" onClick={() => send({ type: 'skip' })} />
                    <Dot />
                    <Chip icon={I.x} label="Cancel" onClick={() => send({ type: 'cancel' })} />
                  </>
                )}
                {state.phase === 'notice' && state.offerForcePaste && (
                  <>
                    <Chip icon={I.insert} label="Select all and paste" onClick={() => send({ type: 'forcePaste' })} />
                    <Dot />
                    <Chip icon={I.x} label="I’ll paste myself" onClick={() => send({ type: 'cancel' })} />
                  </>
                )}
                {state.phase === 'error' && (
                  <>
                    <Chip icon={I.dots} label="Settings" onClick={() => send({ type: 'openSettings' })} />
                    <Dot />
                    <Chip icon={I.x} label="Close" onClick={() => send({ type: 'cancel' })} />
                  </>
                )}
              </div>

              <div class="ask">
                <div class="ask-input">
                  <input
                    type="text"
                    value={note}
                    disabled={busy}
                    placeholder=""
                    aria-label="Tell it what to change"
                    onInput={(e) => setNote((e.currentTarget as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        submitNote();
                      }
                    }}
                  />
                  {!note && (
                    <div class="placeholder" aria-hidden="true">
                      {state.phase === 'done' ? 'Tell it what to change, or ' : state.phase === 'asking' ? 'Add a detail, or ' : 'Add a detail, or '}
                      <Key>⌘</Key>
                      <Key>↵</Key>
                      {state.phase === 'done' ? ' to insert' : ' to rewrite'}
                    </div>
                  )}
                </div>
                <div class="ask-row">
                  <button type="button" class="mode" title="When to ask questions" onClick={() => send({ type: 'openSettings' })}>
                    <Icon d={I.bolt} size={11} />
                    {state.settings?.askMode === 'never' ? 'Direct' : state.settings?.askMode === 'always' ? 'Ask' : 'Smart'}
                  </button>
                  <button type="button" class="more" aria-label="Settings" onClick={() => send({ type: 'openSettings' })}>
                    <Icon d={I.dots} size={14} />
                  </button>
                  <span class="spacer" />
                  <button type="button" class="go" aria-label="Primary action" disabled={busy} onClick={submitNote}>
                    <Icon d={I.arrowRight} size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Dot() {
  return <span class="dot">•</span>;
}

function Chip({ icon, label, onClick }: { icon: preact.JSX.Element; label: string; onClick: () => void }) {
  return (
    <button type="button" class="chip" onClick={onClick}>
      <Icon d={icon} size={14} />
      {label}
    </button>
  );
}

function Questions({ report, answers, onAnswer }: { report: GapReport; answers: Record<number, string>; onAnswer: (i: number, v: string) => void }) {
  return (
    <ol class="questions">
      {report.questions.map((q, i) => (
        <li key={i}>
          <p class="q">{q.question}</p>
          <div class="options">
            {q.suggestions.map((s) => (
              <button type="button" class={`opt${answers[i] === s ? ' on' : ''}`} key={s} onClick={() => onAnswer(i, answers[i] === s ? '' : s)}>
                {s}
              </button>
            ))}
            <input
              type="text"
              class="own"
              value={answers[i] ?? ''}
              placeholder="Type your own"
              aria-label={`Answer: ${q.question}`}
              onInput={(e) => onAnswer(i, (e.currentTarget as HTMLInputElement).value)}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Answer({ text, original, streaming }: { text: string; original: string; streaming: boolean }) {
  const ops = useMemo(() => (streaming ? null : diffWords(original, text)), [original, text, streaming]);
  return (
    <p class="answer">
      {ops ? ops.map((op, i) => (op.type === 'del' ? null : op.type === 'add' && op.text.trim() ? <mark key={i}>{op.text}</mark> : op.text)) : text}
      {streaming && <span class="caret" aria-hidden="true" />}
    </p>
  );
}

function SettingsForm({ settings, error, hotkey }: { settings: Settings; error?: string; hotkey?: string }) {
  const [key, setKey] = useState('');
  const [askMode, setAskMode] = useState(settings.askMode);
  const [hide, setHide] = useState(settings.hideFromCapture);
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    const trimmed = key.trim();
    if (trimmed && !trimmed.startsWith('sk-ant-')) return setProblem('Anthropic keys start with sk-ant-.');
    send({ type: 'saveSettings', settings: { apiKey: trimmed || settings.apiKey, askMode, hideFromCapture: hide } });
  }

  return (
    <div class="settings">
      {error && <p class="line error">{error}</p>}
      <label>
        <span>Anthropic API key {settings.apiKey && <em>· saved {settings.apiKey.slice(0, 10)}…{settings.apiKey.slice(-4)}</em>}</span>
        <input
          type="password"
          value={key}
          placeholder={settings.apiKey ? 'Paste a new key to replace it' : 'sk-ant-…  (or put ANTHROPIC_API_KEY in .env)'}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setKey((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </label>
      <label>
        <span>Clarifying questions</span>
        <div class="options">
          {(['auto', 'always', 'never'] as const).map((m) => (
            <button type="button" key={m} class={`opt${askMode === m ? ' on' : ''}`} onClick={() => setAskMode(m)}>
              {m === 'auto' ? 'Smart — only when ambiguous' : m === 'always' ? 'Always ask' : 'Never, rewrite directly'}
            </button>
          ))}
        </div>
      </label>
      <label class="row">
        <input type="checkbox" checked={hide} onChange={(e) => setHide((e.currentTarget as HTMLInputElement).checked)} />
        <span>Hide this overlay from screen sharing</span>
      </label>
      <p class="hint">Press {hotkey ?? '⌥⇧P'} in any app. Esc closes.</p>
      {problem && <p class="line error">{problem}</p>}
      <div class="chips">
        <Chip icon={I.sparkles} label="Save" onClick={save} />
        <Dot />
        <Chip icon={I.x} label="Close" onClick={() => send({ type: 'cancel' })} />
      </div>
    </div>
  );
}
