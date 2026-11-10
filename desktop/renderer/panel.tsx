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

  // Follow the stream only while the reader stays at the bottom. Scrolling up hands control to them.
  const follow = useRef(true);
  const wasStreaming = useRef(false);
  function onScroll() {
    const el = ref.current;
    if (el && streaming) follow.current = el.scrollTop >= el.scrollHeight - el.clientHeight - 24;
    measure();
  }
  function onWheel(e: WheelEvent) {
    if (streaming && e.deltaY < 0) follow.current = false;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (streaming) {
      if (!wasStreaming.current) follow.current = true; // a new run starts following again
      if (follow.current) el.scrollTop = el.scrollHeight;
    } else if (wasStreaming.current && follow.current) {
      el.scrollTop = 0; // finished while following: show the prompt from its start
    }
    wasStreaming.current = streaming;
    measure();
  }, [text, streaming]);

  const sections = parseSections(text);
  if (!sections) {
    return (
      <div class="line result" ref={ref} data-edge={edge} onScroll={onScroll} onWheel={onWheel}>
        {text}
        {streaming && <span class="caret" />}
      </div>
    );
  }
  return (
    <div class="line result rich" ref={ref} data-edge={edge} onScroll={onScroll} onWheel={onWheel}>
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

  // Voice input. While listening, the live transcript shows in the field (after anything typed
  // before the mic went on). When listening ends — on a pause, the mic button or ↵ — the words are
  // interpreted against what the box shows and acted on at once; the "heard" line offers Undo.
  const [mic, setMic] = useState<Mic>('off');
  const [level, setLevel] = useState(0);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [understanding, setUnderstanding] = useState(false);
  const [heard, setHeard] = useState<{ text: string; undoable: boolean } | null>(null);
  const spokenBase = useRef('');
  const onSpokenRef = useRef<(spoken: string, typed: string) => void>(() => {});

  useEffect(
    () =>
      window.pb.onDictation((event: DictationEvent) => {
        switch (event.type) {
          case 'listening':
            setMic((m) => (m === 'starting' ? 'listening' : m));
            return;
          case 'stopping':
            setMic('stopping');
            return;
          case 'level':
            setLevel(event.level);
            return;
          case 'partial':
            setText(joinSpoken(spokenBase.current, event.text));
            return;
          case 'final':
            setMic('off');
            setLevel(0);
            setText(joinSpoken(spokenBase.current, event.text));
            if (event.text.trim()) onSpokenRef.current(event.text.trim(), spokenBase.current);
            else requestAnimationFrame(() => inputRef.current?.focus());
            return;
          case 'error':
            setMic('off');
            setLevel(0);
            setMicNote(event.error);
            return;
        }
      }),
    [],
  );

  function toggleMic() {
    if (understanding) return;
    if (mic === 'off') {
      spokenBase.current = text;
      setMicNote(null);
      setHeard(null);
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
        setHeard(null);
        setUnderstanding(false);
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

  const busy = state.phase === 'capturing' || state.phase === 'analyzing' || state.phase === 'rewriting' || understanding;
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

  /**
   * Spoken words, once listening ends: ask main what they mean here, then act at once through the
   * same paths as the keyboard. A snapshot is taken first wherever the change can be undone.
   */
  async function onSpoken(spoken: string, typed: string) {
    setUnderstanding(true);
    setMicNote(null);
    const result = await window.pb.interpretVoice(spoken, typed, qIndex);
    setUnderstanding(false);
    if (!result.ok) {
      // Nothing is lost: the words stay in the field to edit or send with ↵.
      setMicNote('Could not work out what to do — your words are in the box. Edit them, or ↵.');
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const intent = result.value;
    const said = (s: string) => s || joinSpoken(typed, spoken);
    const show = (undoable: boolean) => setHeard({ text: intent.heard || spoken, undoable });
    setText('');

    if (intent.intent === 'command') {
      switch (intent.command) {
        case 'insert':
          if (state.phase === 'done' && state.text) return send({ type: 'accept', text: state.text });
          if (state.phase === 'replies' && replies[0]) return send({ type: 'reply', text: replies[0].text });
          return finish();
        case 'undo':
          setHeard(null);
          return send({ type: 'undoVoice' });
        case 'skip':
          show(true);
          send({ type: 'voiceSnapshot' });
          return rewriteWithAnswers();
        case 'cancel':
          return send({ type: 'cancel' });
        case 'start_over':
        case 'rescan':
          return send({ type: 'refresh' });
        default:
          return;
      }
    }

    switch (intent.intent) {
      case 'edit_prompt':
        if (state.phase === 'done') {
          show(true);
          send({ type: 'voiceSnapshot' });
          return send({ type: 'refine', note: said(intent.instruction) });
        }
        if (state.phase === 'asking') return answer(said(intent.instruction || intent.text));
        show(true);
        send({ type: 'voiceSnapshot' });
        return send({ type: 'voiceDraft', text: said(intent.instruction || intent.text) });

      case 'answer_questions': {
        if (state.phase !== 'asking') {
          show(true);
          send({ type: 'voiceSnapshot' });
          return send({ type: 'voiceDraft', text: said(intent.text) });
        }
        const merged = { ...answers };
        for (const a of intent.answers) if (a.index >= 0 && a.index < questions.length) merged[a.index] = a.answer;
        const picked = intent.pick !== null ? question?.suggestions[intent.pick] : undefined;
        if (picked && !merged[qIndex]) merged[qIndex] = picked;
        if (Object.keys(merged).length === Object.keys(answers).length && intent.text) merged[qIndex] = intent.text;
        setAnswers(merged);
        // Go to the next question still open; when none is left, rewrite.
        const open = questions.findIndex((_, i) => !merged[i]?.trim());
        if (open >= 0) {
          setHeard({ text: intent.heard || spoken, undoable: false });
          return setQIndex(open);
        }
        show(true);
        send({ type: 'voiceSnapshot' });
        return rewriteWithAnswers(merged);
      }

      case 'reply': {
        const picked = intent.pick !== null ? replies[intent.pick]?.text : undefined;
        const reply = intent.text || picked || joinSpoken(typed, spoken);
        if (state.phase === 'replies') return send({ type: 'reply', text: reply });
        show(true);
        send({ type: 'voiceSnapshot' });
        return send({ type: 'voiceDraft', text: reply });
      }

      case 'new_draft':
        show(true);
        send({ type: 'voiceSnapshot' });
        return send({ type: 'voiceDraft', text: said(intent.text) });
    }
  }
  onSpokenRef.current = (spoken, typed) => void onSpoken(spoken, typed);

  /** The arrow / ⌘↵: the obvious next step for the current phase. */
  function finish() {
    // ↵ while listening: stop now; the words are then interpreted and acted on.
    if (mic === 'starting' || mic === 'listening') return toggleMic();
    if (mic === 'stopping' || understanding) return;
    setHeard(null);
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

  const placeholder = (() => {
    if (mic === 'starting') return 'Starting the microphone…';
    if (mic === 'listening') return 'Listening… pause when you’re done';
    if (understanding) return 'Understanding…';
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
        {/* What voice just did, with a way back. Sits on the composer's top edge, same inset. */}
        {heard && (
          <div class="heard" role="status">
            <Icon d={MIC} size={12} />
            <span class="heard-text">{heard.text}</span>
            {heard.undoable && (
              <button
                type="button"
                class="heard-undo"
                onClick={() => {
                  setHeard(null);
                  send({ type: 'undoVoice' });
                }}
              >
                Undo
              </button>
            )}
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
              onInput={(e) => {
                setText((e.currentTarget as HTMLInputElement).value);
                setHeard(null);
              }}
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
