import { useEffect, useRef, useState } from 'preact/hooks';
import { ASK_THRESHOLD, type AskMode } from '../../src/llm/config';
import type { GapReport, HistoryMessage, ImproveInput, UserAnswer } from '../../src/messaging';
import { KeyDialog, Keycap, Questions, Result, Transcript, Verdict } from './components';
import { PROXY_URL, analyze, getBaseUrl, getKey, rewrite, setBaseUrl, setKey } from './llm';
import { SAMPLES } from './samples';

type Phase = 'idle' | 'analyzing' | 'asking' | 'rewriting' | 'done';

const REPO_URL = 'https://github.com/Hade6556/promptbutton';

export function App() {
  const defaultSample = SAMPLES[1]!;
  const [turns, setTurns] = useState<HistoryMessage[]>(defaultSample.history);
  const [draft, setDraft] = useState(defaultSample.draft);
  const [sampleNote, setSampleNote] = useState<string | null>(defaultSample.note);
  const [mode, setMode] = useState<AskMode>('auto');

  const [phase, setPhase] = useState<Phase>('idle');
  const [report, setReport] = useState<GapReport | null>(null);
  const [asked, setAsked] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [streamed, setStreamed] = useState('');
  const [resultFor, setResultFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const [keyOpen, setKeyOpen] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(getKey());
  const [baseUrl, setBaseUrlState] = useState(getBaseUrl());
  const [pressed, setPressed] = useState(false);

  const playgroundRef = useRef<HTMLElement>(null);
  const busy = phase === 'analyzing' || phase === 'rewriting';

  function currentInput(): ImproveInput {
    return { site: 'web', history: turns.filter((t) => t.text.trim()), draft };
  }

  async function press() {
    if (busy) return;
    setPressed(true);
    window.setTimeout(() => setPressed(false), 180);

    if (!getKey() && !getBaseUrl()) {
      setKeyOpen(true);
      return;
    }
    if (!draft.trim()) {
      setError('Type a draft first, then press.');
      return;
    }

    setError(null);
    setResult(null);
    setReport(null);
    setAnswers({});
    setAsked(false);
    setElapsed(null);
    playgroundRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const started = performance.now();
    const input = currentInput();

    if (mode === 'never') {
      await runRewrite(input, [], started);
      return;
    }

    setPhase('analyzing');
    const analysis = await analyze(input);
    if (!analysis.ok) {
      fail(analysis.error, analysis.code);
      return;
    }
    setReport(analysis.value);
    const shouldAsk =
      analysis.value.questions.length > 0 && (mode === 'always' || analysis.value.ambiguity >= ASK_THRESHOLD);
    if (shouldAsk) {
      setAsked(true);
      setPhase('asking');
      return;
    }
    await runRewrite(input, [], started);
  }

  async function runRewrite(input: ImproveInput, userAnswers: UserAnswer[], started: number) {
    setPhase('rewriting');
    setStreamed('');
    const rewritten = await rewrite(input, userAnswers, (delta) => setStreamed((s) => s + delta), { mode: report?.mode });
    if (!rewritten.ok) {
      fail(rewritten.error, rewritten.code);
      return;
    }
    setResult(rewritten.value);
    setResultFor(input.draft);
    setElapsed(Math.round(performance.now() - started));
    setPhase('done');
  }

  function fail(message: string, code?: string) {
    setError(message);
    setPhase('idle');
    if (code === 'no_api_key' || code === 'auth') setKeyOpen(true);
  }

  function submitAnswers() {
    if (!report) return;
    const userAnswers = report.questions
      .map((q, i) => ({ question: q.question, answer: (answers[i] ?? '').trim() }))
      .filter((a) => a.answer.length > 0);
    void runRewrite(currentInput(), userAnswers, performance.now());
  }

  function loadSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    setTurns(sample.history);
    setDraft(sample.draft);
    setSampleNote(sample.note);
    setResult(null);
    setReport(null);
    setError(null);
    setPhase('idle');
  }

  // The physical button sends the same chord as the extension hotkey.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        void press();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <header class="site-header">
        <a class="wordmark" href="#top">
          PromptButton
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#why">Why it asks</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" class="ghost" onClick={() => setKeyOpen(true)}>
            {savedKey || baseUrl ? `API key${baseUrl ? ' · proxy' : ' saved'}` : 'Add API key'}
          </button>
        </nav>
      </header>

      <main id="top">
        <section class="hero">
          <div class="hero-copy">
            <h1 class="display">Ask before you rewrite.</h1>
            <p class="lede">
              Every prompt enhancer makes your prompt longer. PromptButton reads the whole conversation, works out what
              the model still needs, asks you only when it matters, and rewrites your draft in your own words.
            </p>
            <div class="actions">
              <button type="button" class="primary" onClick={() => void press()}>
                Try it on the sample
              </button>
              <a class="button ghost" href={REPO_URL} target="_blank" rel="noreferrer">
                Get the Chrome extension
              </a>
            </div>
            <p class="hint">
              Works inside claude.ai and chatgpt.com with the extension. Here, the button runs on whatever you paste
              below.
            </p>
          </div>
          <div class="hero-key">
            <Keycap pressed={pressed} busy={busy} onPress={() => void press()} />
          </div>
        </section>

        <section class="playground" ref={playgroundRef} id="try">
          <div class="pane input-pane">
            <div class="pane-head">
              <h2>Conversation so far</h2>
              <label class="select">
                <span>Load a sample</span>
                <select onChange={(e) => loadSample((e.currentTarget as HTMLSelectElement).value)} value="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {SAMPLES.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {sampleNote && <p class="note">{sampleNote}</p>}
            <Transcript
              turns={turns}
              onChange={(t) => {
                setTurns(t);
                setSampleNote(null);
              }}
            />

            <h2 class="draft-head">Your draft</h2>
            <textarea
              class="draft"
              rows={3}
              value={draft}
              aria-label="Your draft message"
              placeholder="The message you were about to send…"
              onInput={(e) => setDraft((e.currentTarget as HTMLTextAreaElement).value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void press();
              }}
            />
            <div class="draft-actions">
              <button type="button" class="primary" disabled={busy} onClick={() => void press()}>
                {busy ? 'Working…' : 'Press'}
              </button>
              <label class="select">
                <span>Questions</span>
                <select value={mode} onChange={(e) => setMode((e.currentTarget as HTMLSelectElement).value as AskMode)}>
                  <option value="auto">Only if the draft is ambiguous</option>
                  <option value="always">Always</option>
                  <option value="never">Never, just rewrite</option>
                </select>
              </label>
            </div>
          </div>

          <div class="pane output-pane" aria-live="polite">
            {error && (
              <div class="error-box" role="alert">
                <p>{error}</p>
              </div>
            )}

            {phase === 'idle' && !result && !error && (
              <div class="placeholder">
                <h2>What the model still needs</h2>
                <p>Press the key. You’ll see whether the draft is clear enough, which pieces are missing, and the rewrite.</p>
              </div>
            )}

            {phase === 'analyzing' && (
              <div class="status">
                <span class="dot" aria-hidden="true" />
                <p>Reading {turns.filter((t) => t.text.trim()).length} messages and checking what’s missing…</p>
              </div>
            )}

            {report && <Verdict report={report} asked={asked} />}

            {phase === 'asking' && report && (
              <Questions
                report={report}
                answers={answers}
                onAnswer={(i, v) => setAnswers((a) => ({ ...a, [i]: v }))}
                onSubmit={submitAnswers}
                onSkip={() => void runRewrite(currentInput(), [], performance.now())}
              />
            )}

            {phase === 'rewriting' && (
              <>
                <h2>Rewriting…</h2>
                <div class="result-text streaming" aria-live="polite">
                  {streamed}
                  <span class="caret" aria-hidden="true" />
                </div>
              </>
            )}

            {phase === 'done' && result && (
              <>
                <h2>
                  Rewritten prompt
                  <span class="elapsed">
                    {' '}
                    · additions highlighted{elapsed !== null && ` · ${(elapsed / 1000).toFixed(1)}s`}
                  </span>
                </h2>
                <Result
                  text={result}
                  original={resultFor}
                  onUseAsDraft={() => {
                    setDraft(result);
                    setResult(null);
                    setReport(null);
                    setPhase('idle');
                  }}
                />
              </>
            )}
          </div>
        </section>

        <section class="how" id="how">
          <h2 class="display-sm">How it works</h2>
          <ol class="steps">
            <li>
              <h3>Read the conversation</h3>
              <p>
                The last dozen turns are read as context. References like “the other one” are resolved against what was
                actually said, so the rewrite can pull in facts instead of restating them.
              </p>
            </li>
            <li>
              <h3>Decide whether to ask</h3>
              <p>
                A first pass names what is missing: goal, audience, format, constraints, success criteria, examples. It
                asks at most three questions, and none when the draft is already clear in context.
              </p>
            </li>
            <li>
              <h3>Rewrite without inventing</h3>
              <p>
                Your answers are woven in. Anything still unknown becomes a bracketed placeholder for you to fill. The
                result stays in your voice and is often barely longer than the draft.
              </p>
            </li>
          </ol>
        </section>

        <section class="why" id="why">
          <h2 class="display-sm">Why it asks instead of just expanding</h2>
          <ul class="refs">
            <li>
              Rewriting a prompt with the conversation in view improves the response, and more so in longer
              conversations.{' '}
              <a href="https://arxiv.org/abs/2503.16789v1" target="_blank" rel="noreferrer">
                Sarkar et al., 2025
              </a>
            </li>
            <li>
              Clarifying questions help on ambiguous requests but hurt on clear ones, so asking has to be selective.{' '}
              <a href="https://arxiv.org/abs/2212.07769v2" target="_blank" rel="noreferrer">
                CLAM, 2022
              </a>
            </li>
            <li>
              Naming the kind of ambiguity before writing the question produces better questions.{' '}
              <a href="https://alphaxiv.org/overview/2504.12113v2" target="_blank" rel="noreferrer">
                arXiv 2504.12113
              </a>
            </li>
            <li>
              Detecting underspecified requests and making them fully specified improves answers.{' '}
              <a href="https://www.arxiv.org/pdf/2602.11938" target="_blank" rel="noreferrer">
                arXiv 2602.11938
              </a>
            </li>
            <li>
              Duplicated context in a prompt measurably hurts, which is why the rewrite removes repetition rather than
              adding boilerplate.{' '}
              <a href="https://arxiv.org/html/2406.06608v5" target="_blank" rel="noreferrer">
                The Prompt Report, 2024
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer class="site-footer">
        <p>
          A hackathon project. Bring your own Anthropic key; nothing is stored outside your browser.{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>

      <KeyDialog
        open={keyOpen}
        current={savedKey}
        baseUrl={baseUrl}
        proxyUrl={PROXY_URL}
        onSave={(key, url) => {
          if (key) {
            setKey(key);
            setSavedKey(key);
          }
          setBaseUrl(url);
          setBaseUrlState(getBaseUrl());
          setKeyOpen(false);
          setError(null);
        }}
        onClear={() => {
          setKey(null);
          setSavedKey(null);
        }}
        onClose={() => setKeyOpen(false)}
      />
    </>
  );
}
