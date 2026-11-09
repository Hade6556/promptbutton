import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { PanelState } from '../shared';
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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (streaming) el.scrollTop = el.scrollHeight;
    else el.scrollTop = 0;
  }, [text, streaming]);

  const sections = parseSections(text);
  if (!sections) {
    return (
      <div class="line result" ref={ref}>
        {text}
        {streaming && <span class="caret" />}
      </div>
    );
  }
  return (
    <div class="line result rich" ref={ref}>
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

  useEffect(() => {
    void window.pb.getState().then(setState);
    return window.pb.onState((next) => {
      setState(next);
      if (next.phase === 'asking') {
        setQIndex(0);
        setAnswers({});
      }
      if (next.phase !== 'settings') setText('');
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const report = () => window.pb.resize(root.getBoundingClientRect().height + 8);
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
      if (e.key === 'Escape') send({ type: 'cancel' });
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
    switch (state.phase) {
      case 'capturing':
        return 'Reading the screen…';
      case 'analyzing':
        return `Reading ${app}…`;
      case 'rewriting':
        return 'Rewriting…';
      case 'asking':
        return question ? 'Type an answer, or pick one below' : '';
      case 'done':
        return 'Change something, or ↵ to insert';
      case 'replies':
        return 'Pick a reply below or type your own, ↵ to put it in the box';
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

  return (
    <div class="wrap" ref={rootRef}>
      <div class="box" data-phase={state.phase}>
        {line}
        <div class="field" hidden={state.phase === 'notice' || state.phase === 'error'}>
          <input
            ref={inputRef}
            // Preact's input typing is a discriminated union per `type`; the runtime value is what matters here.
            type={(state.phase === 'settings' ? 'password' : 'text') as 'text'}
            value={text}
            disabled={busy}
            placeholder={placeholder}
            class={busy ? 'shimmer' : ''}
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
        </div>
        <div class="row">
          {question?.suggestions.map((s) => (
            <button type="button" class="opt" key={s} onClick={() => answer(s)}>
              {s}
            </button>
          ))}
          {replies.map((r) => (
            <button
              type="button"
              class="opt"
              key={r.label}
              title={r.text}
              onClick={() => {
                setText(r.text);
                inputRef.current?.focus();
              }}
            >
              {r.label}
            </button>
          ))}
          {state.phase === 'done' && (
            <span class="hint">
              <kbd>↵</kbd> insert into {app}
            </span>
          )}
          <span class="spacer" />
          <button type="button" class="more" aria-label="Settings" title="Settings" onClick={() => send({ type: 'openSettings' })}>
            <Icon d={DOTS} size={14} />
          </button>
          {!busy && state.phase !== 'settings' && (
            <button type="button" class="more" aria-label="Scan again" title="Scan again (ignore cached result)" onClick={() => send({ type: 'refresh' })}>
              <Icon d={REFRESH} size={13} />
            </button>
          )}
          <button type="button" class="more" aria-label="Close" title="Close (esc)" onClick={() => send({ type: 'cancel' })}>
            <Icon d={CLOSE} size={13} />
          </button>
          <button type="button" class="go" aria-label="Continue" disabled={busy} onClick={finish}>
            <Icon d={ARROW} size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
