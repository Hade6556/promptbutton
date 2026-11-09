import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DictationEvent, PanelState } from '../shared';
import { blocks, inlineRuns, parseSections, type Block } from './format';

const send = (action: Parameters<Window['pb']['send']>[0]) => window.pb.send(action);

function Icon({ d, size = 14 }: { d: preact.JSX.Element; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}
const ARROW = <path d="M5 12h14m-6-6 6 6-6 6" />;
const DOTS = (
  <>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>
);
const CLOSE = <path d="M18 6 6 18M6 6l12 12" />;
const REFRESH = <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />;
const MIC = (
  <>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
  </>
);

type Mic = 'off' | 'starting' | 'listening' | 'stopping';

/** Dictated words go after whatever was already typed, with one space between. */
const joinSpoken = (base: string, spoken: string) => (base.trim() && spoken ? `${base.trimEnd()} ${spoken}` : base + spoken);

/**
 * The loader comet: one colour, a smooth fade from tail to head. It is tiled from short dashes that
 * sit end to end on the box outline without overlapping (overlapping strokes add up their alpha and
 * show as bands). Each dash covers SEG_LEN % of the perimeter and starts SEG_LEN % further ahead than
 * the one behind it, via a negative delay on the same 6 s animation, so the comet moves as one piece.
 * Keep LAP_S in sync with the animation duration on `.progress .orbit`.
 */
const LAP_S = 6;
const SEGMENTS = 24;
const SEG_LEN = 1.25; // % of the perimeter; the comet spans SEGMENTS × SEG_LEN = 30 %
const COMET = Array.from({ length: SEGMENTS }, (_, i) => {
  const t = (i + 1) / SEGMENTS; // 0 → tail end, 1 → head
  return {
    opacity: +(0.9 * t ** 2.2).toFixed(3),
    delay: +(-(i * SEG_LEN * LAP_S) / 100).toFixed(4),
  };
});

function Line({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((run, i) => {
        switch (run.kind) {
          case 'assumed':
            return (
              <span class="assumed" key={i} title="A default the rewriter chose — change it if it is wrong">
                assumed
              </span>
            );
          case 'placeholder':
            return (
              <span class="ph" key={i} title="Only you know this — fill it in">
                {run.text}
              </span>
            );
          case 'bold':
            return <b key={i}>{run.text}</b>;
          default:
            return run.text;
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'p') {
    return (
      <p>
        <Line text={block.text} />
      </p>
    );
  }
  const items = block.items.map((item, i) => (
    <li key={i}>
      <Line text={item} />
    </li>
  ));
  return block.kind === 'ol' ? <ol>{items}</ol> : <ul>{items}</ul>;
}

/**
 * The rewrite, as sections when it is a master prompt (XML tags or "Role:" labels), otherwise as
 * plain text. While streaming, the box follows the text; when done it scrolls back to the top.
 */
function ResultView({ text, streaming }: { text: string; streaming: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<'none' | 'top' | 'middle' | 'bottom'>('none');

  /** Which edges have more content beyond them, for the scroll edge fade. */
  function measure() {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow <= 2) return setEdge('none');
    const atTop = el.scrollTop <= 2;
    const atBottom = el.scrollTop >= overflow - 2;
    setEdge(atTop ? 'top' : atBottom ? 'bottom' : 'middle');
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (streaming) el.scrollTop = el.scrollHeight;
    else el.scrollTop = 0;
    measure();
  }, [text, streaming]);

  const sections = parseSections(text);
  if (!sections) {
    return (
      <div class="line result" ref={ref} data-edge={edge} onScroll={measure}>
        {text}
        {streaming && <span class="caret" />}
      </div>
    );
  }
  return (
    <div class="line result rich" ref={ref} data-edge={edge} onScroll={measure}>
      {sections.map((s, i) => (
        <section class="sec" key={i}>
          {s.label && <span class="sec-label">{s.label}</span>}
          {blocks(s.body).map((b, j) => (
            <BlockView block={b} key={j} />
          ))}
          {streaming && i === sections.length - 1 && <span class="caret" />}
        </section>
      ))}
    </div>
  );
}

/**
 * One box. Above the field: the single thing you need to know right now (a question, the
 * rewrite, a status). In the field: your answer or a change. The arrow does the next step.
 */
export function Panel() {
  const [state, setState] = useState<PanelState>({ phase: 'hidden' });
  const [text, setText] = useState('');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice input. The helper streams partial transcripts; each one replaces the spoken part of the
  // field, appended after whatever was typed before the mic went on.
  const [mic, setMic] = useState<Mic>('off');
  const [level, setLevel] = useState(0);
  const [micNote, setMicNote] = useState<string | null>(null);
  const spokenBase = useRef('');
  const submitAfterVoice = useRef(false);
  const finishRef = useRef<() => void>(() => {});

  useEffect(
    () =>
      window.pb.onDictation((event: DictationEvent) => {
        switch (event.type) {
          case 'listening':
            setMic((m) => (m === 'starting' ? 'listening' : m));
            return;
          case 'level':
            setLevel(event.level);
            return;
          case 'partial':
            setText(joinSpoken(spokenBase.current, event.text));
            return;
          case 'final': {
            const next = joinSpoken(spokenBase.current, event.text);
            setText(next);
            setMic('off');
            setLevel(0);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              if (submitAfterVoice.current) {
                submitAfterVoice.current = false;
                finishRef.current();
              }
            });
            return;
          }
          case 'error':
            setMic('off');
            setLevel(0);
            submitAfterVoice.current = false;
            setMicNote(event.error);
            return;
        }
      }),
    [],
  );

  function toggleMic() {
    if (mic === 'off') {
      spokenBase.current = text;
      setMicNote(null);
      setMic('starting');
      send({ type: 'dictate', on: true });
    } else if (mic !== 'stopping') {
      setMic('stopping');
      send({ type: 'dictate', on: false });
    }
  }

  useEffect(() => {
    void window.pb.getState().then(setState);
    return window.pb.onState((next) => {
      setState(next);
      if (next.phase === 'asking') {
        setQIndex(0);
        setAnswers({});
      }
      if (next.phase !== 'settings') setText('');
      if (next.phase === 'hidden') {
        // Main stops the helper when the panel closes; reset the button with it.
        setMic('off');
        setLevel(0);
        setMicNote(null);
        submitAfterVoice.current = false;
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => window.pb.resize(root.getBoundingClientRect().height);
    const observer = new ResizeObserver(report);
    observer.observe(root);
    report();
    return () => observer.disconnect();
  }, [state.phase, qIndex]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => window.pb.setMouseThrough(!(e.target as HTMLElement | null)?.closest('.box'));
    const onLeave = () => window.pb.setMouseThrough(true);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // First Esc stops listening; the next one closes the box.
        if (mic === 'starting' || mic === 'listening') return toggleMic();
        send({ type: 'cancel' });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        finish();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (state.phase === 'hidden') return null;

  const busy = state.phase === 'capturing' || state.phase === 'analyzing' || state.phase === 'rewriting';
  const questions = state.report?.questions ?? [];
  const question = state.phase === 'asking' ? questions[qIndex] : undefined;
  const replies = state.phase === 'replies' ? (state.assist?.replies ?? []) : [];
  const app = state.appName ?? 'the app';

  /** Submit the answers gathered so far and rewrite. */
  function rewriteWithAnswers(extra: Record<number, string> = answers) {
    send({
      type: 'answers',
      answers: questions.map((q, i) => ({ question: q.question, answer: (extra[i] ?? '').trim() })).filter((a) => a.answer),
    });
  }

  function answer(value: string) {
    const next = { ...answers, [qIndex]: value };
    setAnswers(next);
    setText('');
    if (qIndex + 1 < questions.length) setQIndex(qIndex + 1);
    else rewriteWithAnswers(next);
  }

  /** The arrow / ⌘↵: the obvious next step for the current phase. */
  function finish() {
    // ↵ while listening: stop, wait for the last words, then submit.
    if (mic === 'starting' || mic === 'listening' || mic === 'stopping') {
      submitAfterVoice.current = true;
      if (mic !== 'stopping') toggleMic();
      return;
    }
    const typed = text.trim();
    switch (state.phase) {
      case 'asking':
        return typed ? answer(typed) : rewriteWithAnswers();
      case 'done':
        if (typed) {
          send({ type: 'refine', note: typed });
          setText('');
          return;
        }
        return state.text && send({ type: 'accept', text: state.text });
      case 'replies':
        return typed ? send({ type: 'reply', text: typed }) : undefined;
      case 'notice':
        return state.offerForcePaste ? send({ type: 'forcePaste' }) : send({ type: 'cancel' });
      case 'error':
        return send({ type: 'openSettings' });
      case 'settings':
        if (!state.settings) return;
        if (typed && !typed.startsWith('sk-ant-')) return;
        return send({ type: 'saveSettings', settings: { ...state.settings, apiKey: typed || state.settings.apiKey } });
    }
  }

  finishRef.current = finish;

  const placeholder = (() => {
    if (mic === 'starting') return 'Starting the microphone…';
    if (mic === 'listening') return 'Listening… speak, then press the mic or ↵';
    if (micNote) return micNote;
    switch (state.phase) {
      case 'capturing':
        return 'Reading the screen…';
      case 'analyzing':
        return `Reading ${app}…`;
      case 'rewriting':
        return 'Rewriting…';
      case 'asking':
        return question ? 'Type an answer, or pick one above' : '';
      case 'done':
        return `Change something, or ↵ to insert into ${app}`;
      case 'replies':
        return 'Pick a reply above or type your own, ↵ to put it in the box';
      case 'settings':
        return state.settings?.apiKey ? 'Paste a new key to replace the saved one' : 'Paste your Anthropic API key (sk-ant-…)';
      default:
        return '';
    }
  })();

  const line = (() => {
    switch (state.phase) {
      case 'asking':
        return question ? (
          <p class="line">
            {question.question}
            {questions.length > 1 && <span class="n"> {qIndex + 1}/{questions.length}</span>}
          </p>
        ) : null;
      case 'rewriting':
        return state.text ? <ResultView text={state.text} streaming /> : null;
      case 'done':
        return <ResultView text={state.text ?? ''} streaming={false} />;
      case 'replies':
        return state.assist ? (
          <div class="line">
            <p class="summary">{state.assist.summary}</p>
            {state.assist.asks.length > 0 && (
              <ul class="asks">
                {state.assist.asks.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null;
      case 'error':
        return <p class="line error">{state.error}</p>;
      case 'notice':
        return <p class="line">{state.notice}</p>;
      case 'settings':
        return state.error ? <p class="line error">{state.error}</p> : null;
      default:
        return null;
    }
  })();

  const showField = state.phase !== 'notice' && state.phase !== 'error';
  // Voice is an input like the keyboard: available wherever the field takes text, except the API-key field.
  const showMic = showField && state.phase !== 'settings' && (!busy || mic !== 'off');
  const options = [
    ...(question?.suggestions ?? []).map((s) => (
      <button type="button" class="opt" key={`q-${s}`} onClick={() => answer(s)}>
        {s}
      </button>
    )),
    ...replies.map((r) => (
      <button
        type="button"
        class="opt"
        key={`r-${r.label}`}
        title={r.text}
        onClick={() => {
          setText(r.text);
          inputRef.current?.focus();
        }}
      >
        {r.label}
      </button>
    )),
  ];

  return (
    <div class="wrap" ref={rootRef}>
      <div class="box" data-phase={state.phase}>
        <svg class={busy ? 'progress on' : 'progress'} role={busy ? 'progressbar' : undefined} aria-label={busy ? 'Working' : undefined} aria-hidden={!busy}>
          {COMET.map((seg, i) => (
            <rect
              key={i}
              class={i === COMET.length - 1 ? 'orbit head' : 'orbit'}
              pathLength="100"
              style={{ opacity: seg.opacity, animationDelay: `${seg.delay}s` }}
            />
          ))}
        </svg>
        {/* Content: what the box is saying, and the answers to it directly beneath. Keyed so a new
            phase fades in, while streaming (rewriting → done) keeps the same node. */}
        {(line || options.length > 0) && (
          <div class="content stage" key={state.phase === 'rewriting' || state.phase === 'done' ? 'result' : state.phase}>
            {line}
            {options.length > 0 && <div class="opts">{options}</div>}
          </div>
        )}
        {/* Composer: the field and every control on one row, one baseline. */}
        <div class="composer">
          {showField ? (
            <input
              ref={inputRef}
              // Preact's input typing is a discriminated union per `type`; the runtime value is what matters here.
              type={(state.phase === 'settings' ? 'password' : 'text') as 'text'}
              value={text}
              disabled={busy}
              placeholder={placeholder}
              aria-label={placeholder || 'Message'}
              class={['field', busy && 'shimmer', mic !== 'off' && 'listening', micNote && mic === 'off' && 'note'].filter(Boolean).join(' ')}
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  finish();
                }
              }}
            />
          ) : (
            <span class="field-spacer" />
          )}
          <div class="controls">
            {showMic && (
              <button
                type="button"
                class={mic === 'off' ? 'icon mic' : 'icon mic live'}
                aria-label={mic === 'off' ? 'Dictate' : 'Stop dictating'}
                aria-pressed={mic !== 'off'}
                title={mic === 'off' ? 'Dictate — speak instead of typing' : 'Stop dictating (esc)'}
                style={{ '--level': mic === 'listening' ? level.toFixed(2) : '0' }}
                onClick={toggleMic}
              >
                <Icon d={MIC} size={14} />
              </button>
            )}
            <button type="button" class="icon" aria-label="Settings" title="Settings" onClick={() => send({ type: 'openSettings' })}>
              <Icon d={DOTS} size={14} />
            </button>
            {!busy && state.phase !== 'settings' && (
              <button type="button" class="icon" aria-label="Scan again" title="Scan again (ignore cached result)" onClick={() => send({ type: 'refresh' })}>
                <Icon d={REFRESH} size={13} />
              </button>
            )}
            <button type="button" class="icon" aria-label="Close" title="Close (esc)" onClick={() => send({ type: 'cancel' })}>
              <Icon d={CLOSE} size={13} />
            </button>
            <button type="button" class="go" aria-label={state.phase === 'done' && !text.trim() ? `Insert into ${app}` : 'Continue'} title={state.phase === 'done' && !text.trim() ? `Insert into ${app} (↵)` : 'Continue (↵)'} disabled={busy} onClick={finish}>
              <Icon d={ARROW} size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
