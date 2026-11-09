import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GapReport } from '../../src/messaging';
import { diffWords } from '../../src/utils/diff';
import { Questions, Verdict } from '../../web/src/components';
import type { PanelState, Settings } from '../shared';

const send = (action: Parameters<Window['pb']['send']>[0]) => window.pb.send(action);

function prettyHotkey(hotkey = 'Alt+Shift+P') {
  return hotkey.replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '');
}

export function Panel() {
  const [state, setState] = useState<PanelState>({ phase: 'hidden' });
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    void window.pb.getState().then(setState);
    return window.pb.onState((next) => {
      setState(next);
      if (next.phase === 'asking') setAnswers({});
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') send({ type: 'cancel' });
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state.phase === 'done' && state.text) {
        send({ type: 'accept', text: state.text });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, state.text]);

  if (state.phase === 'hidden') return null;

  const sourceLabel =
    state.source === 'selection' ? 'from your selection' : state.source === 'field' ? 'from the focused field' : '';

  return (
    <div class="card" data-phase={state.phase}>
      <header class="head">
        <div class="title">
          <span class="wordmark">PromptButton</span>
          {state.appName && state.phase !== 'settings' && (
            <span class="badge">
              {state.appName}
              {sourceLabel && <span class="muted"> · {sourceLabel}</span>}
            </span>
          )}
        </div>
        <button type="button" class="close" aria-label="Close" onClick={() => send({ type: 'cancel' })}>
          ×
        </button>
      </header>

      <div class="body">
        {state.phase === 'capturing' && <Status text="Reading the screen…" />}
        {state.phase === 'analyzing' && <Status text={`Reading ${state.appName ?? 'the window'} and checking what’s missing…`} />}

        {state.report && (state.phase === 'asking' || state.phase === 'rewriting' || state.phase === 'done') && (
          <Verdict report={state.report} asked={!!state.asked} />
        )}

        {state.phase === 'asking' && state.report && (
          <Questions
            report={state.report}
            answers={answers}
            onAnswer={(i, v) => setAnswers((a) => ({ ...a, [i]: v }))}
            onSubmit={() =>
              send({
                type: 'answers',
                answers: state
                  .report!.questions.map((q, i) => ({ question: q.question, answer: (answers[i] ?? '').trim() }))
                  .filter((a) => a.answer.length > 0),
              })
            }
            onSkip={() => send({ type: 'skip' })}
          />
        )}

        {state.phase === 'rewriting' && (
          <div class="result-text streaming" aria-live="polite">
            {state.text}
            <span class="caret" aria-hidden="true" />
          </div>
        )}

        {state.phase === 'done' && state.text && <Done text={state.text} original={state.draft ?? ''} appName={state.appName ?? 'the app'} />}

        {state.phase === 'error' && (
          <>
            <p class="error" role="alert">
              {state.error}
            </p>
            <div class="actions">
              <button type="button" class="ghost" onClick={() => send({ type: 'openSettings' })}>
                Settings
              </button>
              <button type="button" class="ghost" onClick={() => send({ type: 'cancel' })}>
                Close
              </button>
            </div>
          </>
        )}

        {state.phase === 'notice' && (
          <>
            <p class="notice">{state.notice}</p>
            {state.offerForcePaste && (
              <div class="actions">
                <button type="button" class="primary" onClick={() => send({ type: 'forcePaste' })}>
                  Select all and paste
                </button>
                <button type="button" class="ghost" onClick={() => send({ type: 'cancel' })}>
                  I’ll paste myself
                </button>
              </div>
            )}
          </>
        )}

        {state.phase === 'settings' && state.settings && <SettingsForm settings={state.settings} error={state.error} hotkey={state.hotkey} />}
      </div>
    </div>
  );
}

function Status({ text }: { text: string }) {
  return (
    <div class="status">
      <span class="dot" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function Done({ text, original, appName }: { text: string; original: string; appName: string }) {
  const ops = useMemo(() => diffWords(original, text), [original, text]);
  return (
    <>
      <h2>
        Rewritten prompt <span class="muted">· additions highlighted</span>
      </h2>
      <div class="result-text">
        {ops.map((op, i) =>
          op.type === 'del' ? null : op.type === 'add' && op.text.trim() ? <mark key={i}>{op.text}</mark> : op.text,
        )}
      </div>
      <div class="actions">
        <button type="button" class="primary" onClick={() => send({ type: 'accept', text })}>
          Insert into {appName}
        </button>
        <button type="button" class="ghost" onClick={() => send({ type: 'copy', text })}>
          Copy
        </button>
        <button type="button" class="ghost" onClick={() => send({ type: 'cancel' })}>
          Cancel
        </button>
        <span class="spacer" />
        <span class="kbd">⌘↩ insert · esc close</span>
      </div>
      <details class="original">
        <summary>Show original draft</summary>
        <p>{original}</p>
      </details>
    </>
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
      <h2>Settings</h2>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <label>
        <span>Anthropic API key {settings.apiKey && <span class="muted">· saved {settings.apiKey.slice(0, 10)}…{settings.apiKey.slice(-4)}</span>}</span>
        <input
          type="password"
          value={key}
          placeholder={settings.apiKey ? 'Paste a new key to replace it' : 'sk-ant-… (or set ANTHROPIC_API_KEY before launching)'}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setKey((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </label>
      <label>
        <span>Ask clarifying questions</span>
        <select value={askMode} onChange={(e) => setAskMode((e.currentTarget as HTMLSelectElement).value as Settings['askMode'])}>
          <option value="auto">Only when the draft is ambiguous</option>
          <option value="always">Always</option>
          <option value="never">Never, just rewrite</option>
        </select>
      </label>
      <label class="row">
        <input type="checkbox" checked={hide} onChange={(e) => setHide((e.currentTarget as HTMLInputElement).checked)} />
        <span>Hide this panel from screen sharing</span>
      </label>
      <p class="muted">
        Press {prettyHotkey(hotkey)} in any app. macOS will ask once for Accessibility (to read the field and paste) and Screen
        Recording (to read the conversation on screen).
      </p>
      {problem && <p class="error">{problem}</p>}
      <div class="actions">
        <button type="button" class="primary" onClick={save}>
          Save
        </button>
        <button type="button" class="ghost" onClick={() => send({ type: 'cancel' })}>
          Close
        </button>
      </div>
    </div>
  );
}

export type { GapReport };
