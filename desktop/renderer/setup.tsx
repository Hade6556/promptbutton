// The settings window and the first-run setup it opens with. Main owns all state (settings.json,
// permissions, account); this view renders a SetupState and sends SetupActions back.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { AccountScreen, OnboardingStep, PermissionKind, PermissionStatus, SetupAction, SetupPane, SetupState } from '../shared';
import { Dash } from './dash';
import type { Mood } from '../../src/mascot/dash';
import { usageLine } from './panel';

const send = (action: SetupAction) => window.pb.setup.send(action);
const account = (action: Extract<SetupAction, { type: 'account' }>['action']) => send({ type: 'account', action });

function Glyph({ children, size = 18 }: { children: ComponentChildren; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const ICONS: Record<SetupPane, ComponentChildren> = {
  general: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  prompts: <path d="M5 4h14v12H9l-4 4V4Zm4 5h6m-6 3h4" />,
  account: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-3.6 3.6-5.5 7-5.5s6 1.9 7 5.5" />
    </>
  ),
  permissions: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5" />;

const PANE_TITLES: Record<SetupPane, string> = { general: 'General', prompts: 'Prompts', account: 'Account', permissions: 'Permissions', about: 'About' };

// ── Small controls, all on the Ember tokens ─────────────────────────────────────────────────────

function Btn(props: { kind?: 'primary' | 'plain'; disabled?: boolean; onClick: () => void; children: ComponentChildren; type?: 'button' | 'submit' }) {
  return (
    <button type={props.type ?? 'button'} class={`btn ${props.kind ?? ''}`} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} class="switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function Segmented<T extends string>({ value, label, options, onChange }: { value: T; label: string; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" role="radio" aria-checked={v === value} class={v === value ? 'on' : ''} key={v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Keycaps, the product's signature. `lit` presses them down in amber: the shortcut just worked. */
function Keys({ keys, size = 'md', lit = false }: { keys: string[]; size?: 'md' | 'lg'; lit?: boolean }) {
  return (
    <span class={`keys ${size}${lit ? ' lit' : ''}`} aria-label={keys.join(' ')}>
      {keys.map((k, i) => (
        <kbd class={k.length > 1 ? 'cap word' : 'cap'} key={`${k}${i}`}>
          {k}
        </kbd>
      ))}
    </span>
  );
}

function Group({ title, children }: { title?: string; children: ComponentChildren }) {
  return (
    <section class="group">
      {title && <h2 class="group-title">{title}</h2>}
      <div class="group-body">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: ComponentChildren; hint?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="row">
      <div class="row-text">
        <div class="row-label">{label}</div>
        {hint && <div class="row-hint">{hint}</div>}
      </div>
      {children && <div class="row-control">{children}</div>}
    </div>
  );
}

// ── Permissions ─────────────────────────────────────────────────────────────────────────────────

const PERMISSIONS: { kind: PermissionKind; name: string; need: 'Required' | 'Recommended' | 'Optional'; why: string }[] = [
  { kind: 'accessibility', name: 'Accessibility', need: 'Required', why: 'Reads the text box you are typing in and puts the new prompt back.' },
  { kind: 'screen', name: 'Screen Recording', need: 'Recommended', why: 'Reads the conversation on screen when you press the shortcut, so the rewrite fits it.' },
  { kind: 'microphone', name: 'Microphone', need: 'Optional', why: 'Lets you speak instead of typing. macOS asks about speech recognition the first time you use it.' },
];

const STATUS_TEXT: Record<PermissionStatus, string> = {
  granted: 'Allowed',
  denied: 'Not allowed',
  'not-determined': 'Not asked yet',
  restart: 'Restart to finish',
  unsupported: '',
};

function PermissionRows({ state }: { state: SetupState }) {
  // Remember which ones the person asked for here: after that, a "denied" deserves the full recovery hint.
  const [asked, setAsked] = useState<Set<PermissionKind>>(new Set());
  const ask = (kind: PermissionKind) => {
    setAsked(new Set([...asked, kind]));
    send({ type: 'requestPermission', permission: kind });
  };
  return (
    <div class="group-body">
      {PERMISSIONS.map(({ kind, name, need, why }) => {
        const status = state.permissions[kind];
        const showHint = status === 'denied' && kind === 'accessibility' && (asked.has(kind) || state.revoked);
        return (
          <div class="row perm" key={kind}>
            <div class="row-text">
              <div class="row-label">
                {name} <span class="need">{need}</span>
              </div>
              <div class="row-hint">{why}</div>
              {showHint && (
                <div class="row-hint fix">
                  In System Settings, turn on First Try. This screen updates by itself. If the switch already looks on, macOS is holding a record for an older copy:{' '}
                  <button type="button" class="link" onClick={() => send({ type: 'resetPermission', permission: kind })}>
                    reset it and ask again
                  </button>
                  .
                </div>
              )}
              {status === 'restart' && <div class="row-hint fix">macOS turns Screen Recording on after the app restarts.</div>}
            </div>
            <div class="row-control">
              <span class={`status ${status}`}>
                {status === 'granted' && <Glyph size={13}>{CHECK}</Glyph>}
                {STATUS_TEXT[status]}
              </span>
              {status === 'not-determined' && <Btn onClick={() => ask(kind)}>Allow</Btn>}
              {status === 'denied' && (kind === 'accessibility' && !asked.has(kind) && !state.revoked ? <Btn onClick={() => ask(kind)}>Allow</Btn> : <Btn onClick={() => send({ type: 'openPermissionPane', permission: kind })}>Open System Settings</Btn>)}
              {status === 'restart' && <Btn onClick={() => send({ type: 'relaunch' })}>Restart now</Btn>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Account ─────────────────────────────────────────────────────────────────────────────────────

function AccountForm({ screen, error }: { screen: AccountScreen; error?: string }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue('');
    input.current?.focus();
  }, [screen.mode]);
  const off = Boolean(screen.working);
  const a = screen.account;

  const submit = (e: Event) => {
    e.preventDefault();
    const typed = value.trim();
    if (off || !typed) return;
    if (screen.mode === 'signin') account({ type: 'requestCode', email: typed });
    else if (screen.mode === 'code') account({ type: 'verifyCode', code: typed });
    else if (screen.mode === 'ownKey') account({ type: 'saveOwnKey', key: typed });
  };
  const ready =
    screen.mode === 'signin' ? /^\S+@\S+\.\S+$/.test(value.trim()) : screen.mode === 'code' ? value.replace(/\D/g, '').length === 6 : value.trim().startsWith('sk-ant-');

  if (screen.mode === 'account') {
    return (
      <div class="acct">
        {error && <p class="form-error">{error}</p>}
        <div class="acct-head">
          <span class="acct-email">{screen.email}</span>
          {a && <span class={`plan ${a.plan}`}>{a.plan === 'pro' ? 'Pro' : 'Free trial'}</span>}
        </div>
        {a && (
          <>
            <div class="meter" role="progressbar" aria-label="Allowance used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.percentUsed}>
              <span class={a.percentUsed >= 90 ? 'high' : ''} style={{ width: `${a.percentUsed}%` }} />
            </div>
            <p class="hint">{usageLine(a)}</p>
          </>
        )}
        {screen.hasOwnKey && <p class="hint">Your own Anthropic key is saved and used first, so presses do not count against this plan.</p>}
        {screen.note && <p class="hint">{screen.note}</p>}
        <div class="actions">
          {a?.canUpgrade && (
            <Btn kind="primary" disabled={off} onClick={() => account({ type: 'upgrade' })}>
              Upgrade to Pro
            </Btn>
          )}
          {a?.canManage && (
            <Btn disabled={off} onClick={() => account({ type: 'manageBilling' })}>
              Manage subscription
            </Btn>
          )}
          <Btn disabled={off} onClick={() => account({ type: 'signOut' })}>
            Sign out
          </Btn>
        </div>
      </div>
    );
  }

  const field =
    screen.mode === 'signin'
      ? { label: 'Email', type: 'email', placeholder: 'you@example.com', button: 'Send code', auto: 'email' }
      : screen.mode === 'code'
        ? { label: 'Code', type: 'text', placeholder: '6-digit code', button: 'Sign in', auto: 'one-time-code' }
        : { label: 'Anthropic API key', type: 'password', placeholder: screen.hasOwnKey ? 'Paste a new key to replace the saved one' : 'sk-ant-…', button: 'Save key', auto: 'off' };

  return (
    <form class="acct" onSubmit={submit}>
      {screen.mode === 'signin' && <p class="hint">We email you a 6-digit code. No password needed.</p>}
      {screen.mode === 'code' && (
        <p class="hint">
          We sent a code to <strong>{screen.email}</strong>. It expires in 10 minutes.
        </p>
      )}
      {screen.mode === 'ownKey' && (
        <p class="hint">Your key is used directly, and Anthropic bills you for the usage. It is stored only on this Mac.{screen.hasOwnKey ? ' A key is saved.' : ''}</p>
      )}
      <div class="field-row">
        <label class="sr" for="acct-field">
          {field.label}
        </label>
        <input
          id="acct-field"
          ref={input}
          class="input"
          type={field.type as 'text'}
          inputMode={screen.mode === 'code' ? 'numeric' : undefined}
          placeholder={field.placeholder}
          autocomplete={field.auto}
          spellcheck={false}
          value={value}
          disabled={off}
          onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)}
        />
        <Btn kind="primary" type="submit" disabled={off || !ready} onClick={() => {}}>
          {off ? 'One moment…' : field.button}
        </Btn>
      </div>
      {error && <p class="form-error">{error}</p>}
      <div class="links">
        {screen.mode === 'signin' && (
          <button type="button" class="link" disabled={off} onClick={() => account({ type: 'ownKeyMode', on: true })}>
            Use my own Anthropic key instead
          </button>
        )}
        {screen.mode === 'code' && (
          <>
            <button type="button" class="link" disabled={off} onClick={() => account({ type: 'requestCode', email: screen.email ?? '' })}>
              Send a new code
            </button>
            <button type="button" class="link" disabled={off} onClick={() => account({ type: 'changeEmail' })}>
              Use a different email
            </button>
          </>
        )}
        {screen.mode === 'ownKey' && (
          <>
            {screen.hasOwnKey && (
              <button type="button" class="link" onClick={() => account({ type: 'saveOwnKey', key: null })}>
                Remove the saved key
              </button>
            )}
            <button type="button" class="link" onClick={() => account({ type: 'ownKeyMode', on: false })}>
              {screen.email ? 'Back to my account' : 'Sign in instead'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

// ── Shortcut recorder ───────────────────────────────────────────────────────────────────────────

const IS_MAC = () => window.pb.platform === 'darwin';
const CODE_KEYS: Record<string, string> = {
  Space: 'Space', Enter: 'Return', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
};
const SYMBOL: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };

/** An Electron accelerator from a key event, using the physical key (⌥P types "π" on a Mac). */
function accelerator(e: KeyboardEvent): { mods: string[]; key: string | null } {
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', IS_MAC() && e.metaKey && 'Command'].filter(Boolean) as string[];
  const code = e.code;
  const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : (CODE_KEYS[code] ?? null);
  return { mods, key };
}

function ShortcutRow({ state, flash }: { state: SetupState; flash: boolean }) {
  const { shortcut } = state;
  const [held, setHeld] = useState<string[]>([]);
  useEffect(() => {
    if (!shortcut.recording) return setHeld([]);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { mods, key } = accelerator(e);
      if (e.type === 'keyup') return setHeld(mods);
      if (e.code === 'Escape' && mods.length === 0) return send({ type: 'recordShortcut', on: false });
      setHeld(mods);
      if (key && mods.length > 0) send({ type: 'setShortcut', accelerator: [...mods, key].join('+') });
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [shortcut.recording]);

  const heldKeys = held.map((m) => (IS_MAC() ? SYMBOL[m]! : m === 'Control' ? 'Ctrl' : m));
  return (
    <Row
      label="Improve prompt"
      hint={
        shortcut.recording ? (
          <span class="recording">Press the new shortcut. Esc cancels.</span>
        ) : shortcut.error ? (
          <span class="error-text">{shortcut.error}</span>
        ) : flash ? (
          <span class="ok-text">Shortcut works.</span>
        ) : shortcut.custom ? (
          'Your own shortcut.'
        ) : (
          `Either shortcut works. Press one now to test it.`
        )
      }
    >
      {shortcut.recording ? (
        <span class="keys md recording-keys">{heldKeys.length ? heldKeys.map((k) => <kbd class="cap" key={k}>{k}</kbd>) : <span class="dots">…</span>}</span>
      ) : (
        <span class="shortcut-list">
          {shortcut.keys.map((k, i) => (
            <Keys keys={k} key={i} lit={flash} />
          ))}
        </span>
      )}
      {shortcut.recording ? (
        <Btn onClick={() => send({ type: 'recordShortcut', on: false })}>Cancel</Btn>
      ) : (
        <Btn onClick={() => send({ type: 'recordShortcut', on: true })}>Change…</Btn>
      )}
      {shortcut.custom && !shortcut.recording && (
        <button type="button" class="link" onClick={() => send({ type: 'setShortcut', accelerator: null })}>
          Use default
        </button>
      )}
    </Row>
  );
}

/** True for two seconds after the shortcut is pressed in this window. */
function usePressFlash(pressedAt: number | null): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!pressedAt) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 2000);
    return () => clearTimeout(t);
  }, [pressedAt]);
  return on;
}

// ── Settings panes ──────────────────────────────────────────────────────────────────────────────

function GeneralPane({ state }: { state: SetupState }) {
  const flash = usePressFlash(state.shortcutPressedAt);
  const s = state.settings;
  return (
    <>
      <Group title="Shortcut">
        <ShortcutRow state={state} flash={flash} />
      </Group>
      <Group title="App">
        <Row label="Open at login" hint="Keeps the shortcut ready after you restart your computer.">
          <Switch label="Open at login" checked={state.openAtLogin} onChange={(on) => send({ type: 'openAtLogin', on })} />
        </Row>
        <Row label="Hide from screen sharing" hint="The panel stays out of screen shares, recordings and screenshots.">
          <Switch label="Hide from screen sharing" checked={s.hideFromCapture} onChange={(on) => send({ type: 'prefs', prefs: { hideFromCapture: on } })} />
        </Row>
      </Group>
    </>
  );
}

function PromptsPane({ state }: { state: SetupState }) {
  const s = state.settings;
  return (
    <Group>
      <Row label="Ask questions first" hint="Short questions about what the draft leaves open, before the rewrite.">
        <Segmented
          label="Ask questions first"
          value={s.askMode}
          options={[
            ['auto', 'When unclear'],
            ['always', 'Always'],
            ['never', 'Never'],
          ]}
          onChange={(askMode) => send({ type: 'prefs', prefs: { askMode } })}
        />
      </Row>
      <Row label="Rewrite" hint="A full prompt adds role, context, steps and output format. Tighten keeps your wording and fixes what is unclear.">
        <Segmented
          label="Rewrite"
          value={s.depth}
          options={[
            ['full', 'Full prompt'],
            ['concise', 'Tighten'],
          ]}
          onChange={(depth) => send({ type: 'prefs', prefs: { depth } })}
        />
      </Row>
      <Row label="Help improve rewrites" hint="Reports which techniques a rewrite used and whether you kept it, undid it or rated it. Never your text. Needs an account.">
        <Switch label="Help improve rewrites" checked={s.shareOutcomes} onChange={(on) => send({ type: 'prefs', prefs: { shareOutcomes: on } })} />
      </Row>
      <Row label="Share before and after prompts" hint="Also sends your draft and its rewrite so we can test changes on real requests. Emails, links and numbers are removed first; names may remain. Not linked to your account.">
        <Switch label="Share before and after prompts" checked={s.sharePairs} onChange={(on) => send({ type: 'prefs', prefs: { sharePairs: on } })} />
      </Row>
    </Group>
  );
}

function PermissionsPane({ state }: { state: SetupState }) {
  const lostAccess = state.revoked;
  return (
    <>
      {lostAccess && (
        <div class="banner" role="alert">
          <strong>First Try can’t read or write text boxes right now.</strong>{' '}
          {state.updatedFrom
            ? `You updated from ${state.updatedFrom} to ${state.version}, and macOS wants Accessibility allowed again for the new version. Turn it on below.`
            : 'Accessibility is off for this copy of the app. That happens after an update, or when it is switched off in System Settings. Turn it back on below.'}
        </div>
      )}
      <section class="group">
        <PermissionRows state={state} />
      </section>
      <p class="footnote">Nothing is read until you press the shortcut. Text and screenshots are sent to Claude only to write the prompt and are not stored.</p>
    </>
  );
}

function AboutPane({ state }: { state: SetupState }) {
  return (
    <>
      <div class="about">
        <span class="keys lg" aria-hidden="true">
          <kbd class="cap lit-static">P</kbd>
        </span>
        <div>
          <div class="about-name">First Try</div>
          <div class="hint">Version {state.version}</div>
        </div>
      </div>
      <Group>
        <Row label="Setup" hint="Walk through permissions, sign-in and the shortcut again.">
          <Btn onClick={() => send({ type: 'restartOnboarding' })}>Run setup again</Btn>
        </Row>
        <Row label="Help and legal">
          <span class="links">
            <button type="button" class="link" onClick={() => send({ type: 'open', target: 'site' })}>
              Website
            </button>
            <button type="button" class="link" onClick={() => send({ type: 'open', target: 'support' })}>
              Contact
            </button>
            <button type="button" class="link" onClick={() => send({ type: 'open', target: 'privacy' })}>
              Privacy
            </button>
            <button type="button" class="link" onClick={() => send({ type: 'open', target: 'terms' })}>
              Terms
            </button>
          </span>
        </Row>
      </Group>
      <div class="actions end">
        <Btn onClick={() => send({ type: 'quit' })}>Quit First Try</Btn>
      </div>
    </>
  );
}

function Settings({ state }: { state: SetupState }) {
  const panes: SetupPane[] = state.platform === 'darwin' ? ['general', 'prompts', 'account', 'permissions', 'about'] : ['general', 'prompts', 'account', 'about'];
  const pane = panes.includes(state.pane) ? state.pane : 'general';
  useEffect(() => {
    document.title = PANE_TITLES[pane];
  }, [pane]);
  return (
    <div class="settings">
      <header class="chrome">
        <div class="title">{PANE_TITLES[pane]}</div>
        <nav class="toolbar" aria-label="Settings">
          {panes.map((p) => (
            <button type="button" key={p} class={p === pane ? 'tool on' : 'tool'} aria-current={p === pane ? 'page' : undefined} onClick={() => send({ type: 'pane', pane: p })}>
              <Glyph>{ICONS[p]}</Glyph>
              <span>{PANE_TITLES[p]}</span>
              {p === 'permissions' && state.permissions.accessibility === 'denied' && <span class="badge" aria-label="needs attention" />}
            </button>
          ))}
        </nav>
      </header>
      <main class="pane" key={pane}>
        {pane === 'general' && <GeneralPane state={state} />}
        {pane === 'prompts' && <PromptsPane state={state} />}
        {pane === 'account' && (
          <Group>
            <div class="row block">
              <AccountForm screen={state.accountScreen} error={state.accountError} />
            </div>
          </Group>
        )}
        {pane === 'permissions' && <PermissionsPane state={state} />}
        {pane === 'about' && <AboutPane state={state} />}
      </main>
    </div>
  );
}

// ── First-run setup ─────────────────────────────────────────────────────────────────────────────

function Onboarding({ state }: { state: SetupState }) {
  const steps: OnboardingStep[] = state.platform === 'darwin' ? ['welcome', 'permissions', 'account', 'try', 'done'] : ['welcome', 'account', 'try', 'done'];
  const step = steps.includes(state.step) ? state.step : 'welcome';
  const index = steps.indexOf(step);
  const go = (to: OnboardingStep) => send({ type: 'step', step: to });
  const next = () => (index < steps.length - 1 ? go(steps[index + 1]!) : send({ type: 'finishOnboarding' }));
  const back = index > 0 ? () => go(steps[index - 1]!) : null;
  const signedIn = state.accountScreen.mode === 'account' || Boolean(state.accountScreen.hasOwnKey);
  const pressed = state.shortcutPressedAt !== null;
  const keys = state.shortcut.keys[0] ?? [];
  useEffect(() => {
    document.title = 'Set up First Try';
  }, []);

  let title = '';
  let body: ComponentChildren = null;
  let content: ComponentChildren = null;
  let primary = { label: 'Continue', disabled: false };
  let secondary: { label: string; onClick: () => void } | null = null;
  // Dash leads each step and shows where it stands: asleep until macOS lets it work, watching for the
  // first press of the shortcut, pleased once a step is finished.
  let mood: Mood = 'idle';

  switch (step) {
    case 'welcome':
      title = 'Better prompts, one shortcut away';
      body = 'Write a rough prompt in any app: ChatGPT, Claude, Cursor, Mail. Press the shortcut, and First Try reads the conversation, asks what is missing, and rewrites the prompt in place.';
      content = (
        <div class="hero-keys">
          <Keys keys={keys} size="lg" />
        </div>
      );
      primary = { label: 'Get started', disabled: false };
      break;
    case 'permissions': {
      const ok = state.permissions.accessibility === 'granted';
      title = 'Allow access';
      body = 'macOS asks once for each of these. Your screen is read only when you press the shortcut.';
      content = (
        <section class="group">
          <PermissionRows state={state} />
        </section>
      );
      primary = { label: 'Continue', disabled: !ok };
      mood = ok ? 'done' : 'asleep';
      if (!ok) secondary = { label: 'Set up later', onClick: () => send({ type: 'close' }) };
      break;
    }
    case 'account':
      title = signedIn ? 'You’re signed in' : 'Sign in';
      body = signedIn ? 'Your presses use this account.' : 'Your free trial starts when you sign in.';
      content = (
        <Group>
          <div class="row block">
            <AccountForm screen={state.accountScreen} error={state.accountError} />
          </div>
        </Group>
      );
      primary = { label: 'Continue', disabled: !signedIn };
      mood = signedIn ? 'done' : state.accountError ? 'oops' : 'curious';
      if (!signedIn) secondary = { label: 'Skip for now', onClick: next };
      break;
    case 'try':
      title = pressed ? 'That’s it' : 'Try the shortcut';
      body = pressed
        ? 'Next time, press it in a chat box with a draft in it. You can change the shortcut in Settings.'
        : 'Press it now. It works in any app where you type.';
      content = (
        <div class="hero-keys">
          <Keys keys={keys} size="lg" lit={pressed} />
        </div>
      );
      primary = { label: 'Continue', disabled: false };
      mood = pressed ? 'done' : 'watching';
      if (!pressed) primary.label = 'Skip';
      break;
    case 'done':
      title = 'You’re set';
      body = 'Three things to remember:';
      content = (
        <ul class="tips">
          <li>
            <Keys keys={keys} /> <span>Improves the prompt you are typing, wherever you are.</span>
          </li>
          <li>
            <Keys keys={['↵']} /> <span>Puts the new prompt into the app. Esc closes without changing anything.</span>
          </li>
          <li>
            <span class="tray-glyph">
              <Dash mood="idle" size={20} />
            </span>{' '}
            <span>Dash, the ghost in the menu bar, has Settings, your account and Undo last insert.</span>
          </li>
        </ul>
      );
      primary = { label: 'Start using First Try', disabled: false };
      mood = 'done';
      break;
  }

  return (
    <div class="onboarding">
      <header class="chrome slim" />
      <main class="step" key={step}>
        <div class="step-dash">
          <Dash mood={mood} size={72} arrive={step === 'welcome'} label="Dash, the First Try mascot" />
        </div>
        <h1>{title}</h1>
        <p class="lede">{body}</p>
        {content}
      </main>
      <footer class="step-foot">
        <span class="progress-text" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span key={s} class={i === index ? 'pip on' : i < index ? 'pip done' : 'pip'} />
          ))}
        </span>
        <span class="spacer" />
        {secondary && (
          <button type="button" class="link" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
        {back && <Btn onClick={back}>Back</Btn>}
        <Btn kind="primary" disabled={primary.disabled} onClick={next}>
          {primary.label}
        </Btn>
      </footer>
    </div>
  );
}

export function Setup() {
  const [state, setState] = useState<SetupState | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset.platform = window.pb.platform;
    void window.pb.setup.get().then(setState);
    return window.pb.setup.onState(setState);
  }, []);
  // The window takes the height of what it shows.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => window.pb.setup.resize(el.scrollHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [state === null]);
  return <div ref={root}>{state && (state.view === 'onboarding' ? <Onboarding state={state} /> : <Settings state={state} />)}</div>;
}
