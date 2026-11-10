// PromptButton desktop: a global hotkey summons an always-on-top panel over any app.
// Reads the focused field + a window screenshot, runs the same gap-analysis → questions →
// rewrite pipeline as the extension, and writes the result back into the field.
import Anthropic from '@anthropic-ai/sdk';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, systemPreferences, Tray } from 'electron';
import path from 'node:path';
import { ASK_THRESHOLD, PromptButtonError } from '../src/llm/config';
import { toResult } from '../src/llm/errors';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { suggestReplies } from '../src/llm/reply';
import { rewritePrompt } from '../src/llm/rewrite';
import { interpretVoice } from '../src/llm/voice';
import type { GapReport, ImproveInput, Result, RewriteOptions, UserAnswer, VoiceContext, VoiceIntent } from '../src/messaging';
import { captureContext, hashDistance, type Capture } from './capture';
import { cancelDictation, startDictation, stopDictation } from './dictation';
import { dotEnvPaths, resolveApiKey } from './env';
import { forcePaste, insertText } from './insert';
import { loadSettings, saveSettings } from './settings';
import type { AccountScreen, AccountView, PanelState, RendererAction, Settings } from './shared';

// Both chords trigger: ⌥⇧P is the documented one; ⌥⌘P is what people press when they read ⇧ as ⌘.
const HOTKEYS = ['Alt+Shift+P', 'Alt+Command+P'];
const HOTKEY = '⌥⇧P (or ⌥⌘P)';
const PANEL_WIDTH = 600;
const PANEL_HEIGHT = 56; // the bare box; the renderer asks for more as content appears
const PANEL_MAX_HEIGHT = 760;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: Settings = { apiKey: null, account: null, askMode: 'auto', depth: 'full', hideFromCapture: false };
let state: PanelState = { phase: 'hidden', hotkey: HOTKEY };
let busy = false;
/** Incremented on every trigger/close so results from a cancelled run are ignored. */
let runId = 0;
const stale = (id: number) => id !== runId;
interface Run {
  capture: Capture;
  input: ImproveInput;
  report: GapReport | null;
  text: string;
  answers: UserAnswer[];
}
let current: Run | null = null;
let lastInsert: { capture: Capture; original: string } | null = null;
let noticeTimer: NodeJS.Timeout | undefined;

/** The last finished run, so re-opening on unchanged input costs no tokens. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Within this window after a real scan, an empty-field reopen reuses the result even if the screen moved (streaming, scrolling). */
const CACHE_GRACE_MS = 90 * 1000;
const HASH_TOLERANCE_BITS = 12; // of 256: caret blinks and hover states pass, new text does not
let lastRun: { key: string; hash: string | null; at: number; snapshot: PanelState; current: Run } | null = null;

function fingerprint(capture: Capture): string {
  return `${capture.bundleId || capture.appName}|${capture.pid}|${capture.source}|${capture.draft}`;
}

function rememberRun() {
  if (!current) return;
  if (state.phase !== 'asking' && state.phase !== 'done' && state.phase !== 'replies') return;
  lastRun = { key: fingerprint(current.capture), hash: current.capture.screenshotHash, at: Date.now(), snapshot: { ...state }, current };
}

function cachedRun(capture: Capture): typeof lastRun {
  if (!lastRun) return null;
  const elapsed = Date.now() - lastRun.at;
  if (elapsed > CACHE_TTL_MS) {
    console.log(`[PromptButton] cache miss: last run ${Math.round(elapsed / 1000)}s ago (ttl ${CACHE_TTL_MS / 1000}s)`);
    return null;
  }
  if (lastRun.key !== fingerprint(capture)) {
    console.log(`[PromptButton] cache miss: input changed (${lastRun.current.capture.source}/${lastRun.current.capture.draft.length} chars → ${capture.source}/${capture.draft.length} chars)`);
    return null;
  }
  // With a draft, the text is the input. With an empty field, the screen is — but a chat that is
  // still streaming or was scrolled is not "new input", so a short grace window ignores pixels.
  if (capture.source === 'none' && elapsed > CACHE_GRACE_MS) {
    const distance = lastRun.hash && capture.screenshotHash ? hashDistance(lastRun.hash, capture.screenshotHash) : Number.POSITIVE_INFINITY;
    if (distance > HASH_TOLERANCE_BITS) {
      console.log(`[PromptButton] cache miss: screen changed (hash distance ${distance} > ${HASH_TOLERANCE_BITS}, ${Math.round(elapsed / 1000)}s since scan)`);
      return null;
    }
  }
  return lastRun;
}

function setState(patch: Partial<PanelState>) {
  const previous = state.phase;
  state = { ...state, ...patch, hotkey: HOTKEY };
  if (state.phase !== previous) {
    const detail =
      state.phase === 'asking' && state.report
        ? ` ambiguity=${state.report.ambiguity.toFixed(2)} questions=${state.report.questions.length}`
        : state.phase === 'done'
          ? ` chars=${state.text?.length ?? 0}`
          : state.phase === 'error' || state.phase === 'notice'
            ? ` ${state.error ?? state.notice ?? ''}`
            : '';
    console.log(`[PromptButton] ${previous} → ${state.phase}${detail}`);
  }
  win?.webContents.send('pb:state', state);
}

let resumeAfterSettings = false;

/** The account server. PMP_API_BASE points a development build at a local one. */
const API_BASE = (process.env.PMP_API_BASE ?? 'https://pimpmypromt.ai/api').replace(/\/$/, '');

function client(): Anthropic {
  // In order: an own key saved in the app, the signed-in account, then a developer's env or .env key.
  if (settings.apiKey) {
    console.log('[PromptButton] using the saved own API key');
    return new Anthropic({ apiKey: settings.apiKey, maxRetries: 1, timeout: 60_000 });
  }
  if (settings.account) {
    console.log('[PromptButton] using the account server');
    return new Anthropic({ apiKey: null, authToken: settings.account.token, baseURL: API_BASE, maxRetries: 1, timeout: 60_000 });
  }
  const { key, source } = resolveApiKey(null);
  if (key) {
    console.log(`[PromptButton] using API key from ${source}`);
    return new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 });
  }
  throw new PromptButtonError('no_api_key', 'Sign in to start.');
}

// ---- Account: sign-in with an emailed code, plan and usage, Stripe checkout and portal ----

let accountScreen: AccountScreen = { mode: 'signin' };
let accountView: AccountView | null = null;
let checkoutPoll: ReturnType<typeof setInterval> | undefined;

class SessionEnded extends Error {}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The panel learns whether a key or session exists, never the key or the token. */
function publicSettings(): Settings {
  return { ...settings, apiKey: settings.apiKey ? 'saved' : null, account: settings.account ? { email: settings.account.email, token: '' } : null };
}

/** The screen as it should look now: signed-in users always land on their account. */
function currentScreen(): AccountScreen {
  if (accountScreen.mode !== 'ownKey') {
    if (settings.account) accountScreen = { ...accountScreen, mode: 'account', email: settings.account.email };
    else if (accountScreen.mode === 'account') accountScreen = { mode: 'signin' };
  }
  return { ...accountScreen, account: accountView, hasOwnKey: Boolean(settings.apiKey) };
}

function showAccount(error?: string, patch: Partial<AccountScreen> = {}) {
  accountScreen = { ...accountScreen, ...patch };
  setState({ phase: 'settings', settings: publicSettings(), accountScreen: currentScreen(), error });
  showPanel(true);
}

async function accountApi<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth && settings.account) headers.authorization = `Bearer ${settings.account.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach Pimp My Prompt. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && options.auth) throw new SessionEnded('Your session ended. Sign in again.');
  if (!res.ok) throw new Error(data.error ?? `The server answered ${res.status}.`);
  return data as T;
}

function forgetAccount() {
  settings = { ...settings, account: null };
  saveSettings(settings);
  accountView = null;
  clearInterval(checkoutPoll);
}

async function refreshAccount(): Promise<AccountView | null> {
  if (!settings.account) return null;
  try {
    accountView = (await accountApi<{ account: AccountView }>('/account', { method: 'GET', auth: true })).account;
  } catch (error) {
    if (error instanceof SessionEnded) forgetAccount();
    else console.warn('[PromptButton] account refresh failed:', message(error));
  }
  if (state.phase === 'settings') setState({ settings: publicSettings(), accountScreen: currentScreen() });
  return accountView;
}

/** After Checkout opens in the browser, the webhook upgrades the account; notice it within seconds. */
function watchForUpgrade() {
  clearInterval(checkoutPoll);
  const until = Date.now() + 15 * 60_000;
  checkoutPoll = setInterval(async () => {
    const view = await refreshAccount();
    if (view?.plan === 'pro') {
      clearInterval(checkoutPoll);
      if (state.phase === 'settings') showAccount(undefined, { note: 'You are on Pro now. Thank you!' });
    } else if (Date.now() > until || !settings.account) clearInterval(checkoutPoll);
  }, 4000);
}

type AccountAction = Extract<RendererAction, { type: 'requestCode' | 'verifyCode' | 'changeEmail' | 'signOut' | 'upgrade' | 'manageBilling' | 'ownKeyMode' | 'saveOwnKey' }>;

async function accountAction(action: AccountAction) {
  switch (action.type) {
    case 'requestCode': {
      const email = action.email.trim();
      showAccount(undefined, { working: true, note: undefined });
      try {
        await accountApi('/auth/code', { body: { email } });
        showAccount(undefined, { mode: 'code', email, working: false });
      } catch (error) {
        showAccount(message(error), { working: false });
      }
      return;
    }
    case 'verifyCode': {
      const email = accountScreen.email ?? '';
      showAccount(undefined, { working: true });
      try {
        const data = await accountApi<{ token: string; account: AccountView }>('/auth/verify', { body: { email, code: action.code } });
        settings = { ...settings, account: { email, token: data.token } };
        saveSettings(settings);
        accountView = data.account;
        accountScreen = { mode: 'account', email };
        console.log('[PromptButton] signed in');
        if (resumeAfterSettings && current) {
          resumeAfterSettings = false;
          return analyzeAndContinue();
        }
        showAccount();
      } catch (error) {
        showAccount(message(error), { working: false });
      }
      return;
    }
    case 'changeEmail':
      return showAccount(undefined, { mode: 'signin', email: undefined, working: false });
    case 'signOut':
      await accountApi('/auth/signout', { auth: true }).catch(() => {});
      forgetAccount();
      accountScreen = { mode: 'signin' };
      return showAccount();
    case 'upgrade':
    case 'manageBilling': {
      showAccount(undefined, { working: true, note: undefined });
      try {
        const { url } = await accountApi<{ url: string }>(action.type === 'upgrade' ? '/billing/checkout' : '/billing/portal', { auth: true });
        await shell.openExternal(url);
        showAccount(undefined, {
          working: false,
          note: action.type === 'upgrade' ? 'Finish checkout in your browser. This updates by itself when it is done.' : 'Your subscription opened in the browser.',
        });
        if (action.type === 'upgrade') watchForUpgrade();
      } catch (error) {
        if (error instanceof SessionEnded) forgetAccount();
        showAccount(message(error), { working: false });
      }
      return;
    }
    case 'ownKeyMode':
      return showAccount(undefined, { mode: action.on ? 'ownKey' : settings.account ? 'account' : 'signin', note: undefined });
    case 'saveOwnKey':
      settings = { ...settings, apiKey: action.key };
      saveSettings(settings);
      if (action.key && resumeAfterSettings && current) {
        resumeAfterSettings = false;
        return analyzeAndContinue();
      }
      return action.key ? hidePanel() : showAccount(undefined, { mode: settings.account ? 'account' : 'signin' });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    // Real macOS material (NSVisualEffectView HUD) behind the box instead of painted glass: it blurs
    // whatever app is underneath and honours Reduce Transparency on its own. The system draws the
    // window shadow and corner radius, so the renderer paints only a translucent fill and a hairline.
    vibrancy: 'hud',
    visualEffectState: 'active',
    roundedCorners: true,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Panel windows float over full-screen apps and can take key focus without activating the whole app.
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(settings.hideFromCapture);
  void win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => (win = null));
  // A panel window never makes the app active, so the menu's ⌘C/⌘V/⌘X/⌘A/⌘Z never fire. Do them here.
  const contents = win.webContents;
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.meta || input.control || input.alt) return;
    const key = input.key.toLowerCase();
    if (key === 'c' && !input.shift) {
      event.preventDefault();
      void contents.executeJavaScript('String(window.getSelection() || "")').then((selected: string) => {
        if (selected) return contents.copy();
        // Nothing selected: copy what the panel is showing.
        const shown = state.phase === 'error' ? state.error : state.phase === 'done' ? current?.text : '';
        if (shown) clipboard.writeText(shown);
      });
    } else if (key === 'v' && !input.shift) { event.preventDefault(); contents.paste(); }
    else if (key === 'x' && !input.shift) { event.preventDefault(); contents.cut(); }
    else if (key === 'a' && !input.shift) { event.preventDefault(); contents.selectAll(); }
    else if (key === 'z') { event.preventDefault(); if (input.shift) contents.redo(); else contents.undo(); }
  });
}

/** The box rests a little below the menu bar — about an eighth of the way down the screen — centred, and grows downward. */
const PANEL_TOP_RATIO = 0.12;
const PANEL_MARGIN = 16;

function panelOrigin(display: Electron.Display) {
  const { x, y, width, height } = display.workArea;
  return { x: Math.round(x + (width - PANEL_WIDTH) / 2), y: Math.round(y + height * PANEL_TOP_RATIO) };
}

function positionPanel() {
  if (!win) return;
  const origin = panelOrigin(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
  win.setPosition(origin.x, origin.y);
}

/**
 * The renderer reports its content height; keep the window exactly that tall. The box stays anchored at
 * its resting position and grows downward; if it would run off the bottom it slides up, never above the
 * top margin.
 */
function fitPanel(height: number) {
  if (!win) return;
  const [x = 0, currentY = 0] = win.getPosition();
  const display = screen.getDisplayNearestPoint({ x: x + PANEL_WIDTH / 2, y: currentY });
  const area = display.workArea;
  const resting = panelOrigin(display).y;
  const next = Math.max(PANEL_HEIGHT, Math.min(PANEL_MAX_HEIGHT, area.height - 2 * PANEL_MARGIN, Math.ceil(height)));
  const bottomLimit = area.y + area.height - PANEL_MARGIN;
  const y = Math.max(area.y + PANEL_MARGIN, Math.min(resting, bottomLimit - next));
  const [, currentHeight] = win.getSize();
  if (next !== currentHeight || y !== currentY) win.setBounds({ x, y, width: PANEL_WIDTH, height: next }, false);
}

/**
 * The window must float over every Space, full-screen apps included. A window that has lived through
 * a sleep/wake or a full-screen Space being torn down can lose that membership (seen on macOS 26: the
 * panel stopped appearing over full-screen VS Code until the app was restarted), so the layering is
 * re-asserted before every show, and a hidden window is rebuilt after the Mac wakes or unlocks.
 */
function assertLayering() {
  if (!win) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function rebuildHiddenWindow(reason: string) {
  if (!win || win.isVisible()) return;
  console.log(`[PromptButton] rebuilding the panel window after ${reason}`);
  win.destroy();
  win = null;
  createWindow();
}

function showPanel(takeFocus: boolean) {
  if (!win) createWindow();
  positionPanel();
  assertLayering();
  if (takeFocus) win!.show();
  else win!.showInactive();
  win!.moveTop();
}

function hidePanel() {
  clearTimeout(noticeTimer);
  cancelDictation(); // the mic never stays on behind a closed panel
  voiceSnapshots = [];
  win?.hide();
  busy = false;
  runId++; // anything still in flight belongs to a closed run
  setState({ phase: 'hidden', report: null, text: '', assist: undefined, error: undefined, notice: undefined, offerForcePaste: false });
}

function notice(text: string, options: { ttl?: number; offerForcePaste?: boolean } = {}) {
  clearTimeout(noticeTimer);
  setState({ phase: 'notice', notice: text, offerForcePaste: options.offerForcePaste ?? false });
  showPanel(false);
  if (options.ttl) noticeTimer = setTimeout(hidePanel, options.ttl);
}

/** Without Accessibility the app can neither read the field nor write into it, so say that and open the right pane. */
function needAccessibility() {
  busy = false;
  const name = app.getName();
  setState({
    phase: 'error',
    error: `${name} needs Accessibility access to read and write the field you are typing in. In the window that just opened, turn on ${name}, then press ${HOTKEY} again. If it is already on, remove it with the minus button and add it back.`,
  });
  showPanel(true);
  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
}

function fail(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (/not allowed to send keystrokes|not allowed assistive access|\(1002\)|\(-25211\)|\(-1719\)/i.test(raw)) return needAccessibility();
  const result = toResult<never>(error);
  busy = false;
  if (!result.ok) {
    if (result.code === 'no_api_key' || result.code === 'auth') {
      resumeAfterSettings = current !== null; // continue the run once signed in or a key is saved
      if (result.code === 'no_api_key') return showAccount(undefined, { working: false });
      if (settings.apiKey) return showAccount(result.error, { mode: 'ownKey', working: false });
      forgetAccount();
      return showAccount('Your session ended. Sign in again.', { mode: 'signin', working: false });
    }
    if (result.code === 'limit') {
      void refreshAccount();
      return showAccount(result.error, { working: false, note: undefined });
    }
    setState({ phase: 'error', error: result.error });
  }
  showPanel(true);
}

async function trigger(options: { fresh?: boolean } = {}) {
  // The hotkey toggles: open and run when hidden, close when visible — even mid-run.
  if (state.phase !== 'hidden' && !options.fresh) {
    console.log(`[PromptButton] hotkey while ${state.phase} → closing`);
    hidePanel();
    return;
  }
  if (busy) return;
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) return needAccessibility();
  const my = ++runId;
  busy = true;
  try {
    // Capture before showing the panel so the screenshot does not include it.
    if (options.fresh) win?.hide();
    const capture = await captureContext();
    if (stale(my)) return;

    const cached = options.fresh ? null : cachedRun(capture);
    if (cached) {
      console.log(`[PromptButton] unchanged input — reopening the last result, no API call (${cached.snapshot.phase})`);
      current = cached.current;
      busy = false;
      setState({ ...cached.snapshot });
      showPanel(true);
      return;
    }
    console.log(
      `[PromptButton] captured app="${capture.appName}" role=${capture.role || '?'} via=${capture.method} source=${capture.source} settable=${capture.valueSettable} draft=${capture.draft.length} chars screenshot=${capture.screenshot ? `${Math.round((capture.screenshot.data.length * 3) / 4 / 1024)} KB` : 'none'}`,
    );
    if (capture.source === 'none') {
      current = { capture, input: { site: capture.appName, history: [], draft: '', screenshot: capture.screenshot }, report: null, text: '', answers: [] };
      await suggestForEmptyField(my);
      return;
    }
    // Never ship secrets to the model (e.g. the hotkey pressed while a .env file is focused).
    if (/sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}/.test(capture.draft)) {
      busy = false;
      notice('The focused text looks like it contains an API key or secret, so it was not sent anywhere. Click into the chat box you want to improve and press again.', { ttl: 6000 });
      return;
    }
    const input: ImproveInput = { site: capture.appName, history: [], draft: capture.draft, screenshot: capture.screenshot };
    current = { capture, input, report: null, text: '', answers: [] };
    await analyzeAndContinue();
  } catch (error) {
    if (!stale(my)) fail(error);
  }
}

/** Empty field, or a "draft" that is only the box's own hint text: read the chat on screen and suggest what to say. */
async function suggestForEmptyField(my: number) {
  if (!current) return;
  const { capture } = current;
  if (!capture.screenshot) {
    busy = false;
    notice(`Nothing to work with — type a draft in ${capture.appName}, or allow Screen Recording so I can read the chat.`, { ttl: 5000 });
    return;
  }
  const input: ImproveInput = { site: capture.appName, history: [], draft: '', screenshot: capture.screenshot };
  current = { ...current, input, report: null, text: '', answers: [] };
  setState({ phase: 'analyzing', appName: capture.appName, source: 'none', draft: '', report: null, text: '', error: undefined });
  showPanel(false);
  const assist = await suggestReplies(client(), input);
  if (stale(my)) return;
  console.log(`[PromptButton] reply assist: ${assist.replies.length} replies, ${assist.asks.length} asks`);
  busy = false;
  setState({ phase: 'replies', assist });
  rememberRun();
  showPanel(true);
}

// ── Voice understanding ─────────────────────────────────────────────────────────────────────────
// The renderer applies a voice intent through the same actions as the keyboard; main interprets it
// against what the box shows and keeps snapshots so each voice-applied change can be undone.

let voiceSnapshots: { state: PanelState; current: Run }[] = [];

function voiceContext(transcript: string, typed: string, questionIndex: number): VoiceContext {
  const base = { app: state.appName ?? current?.capture.appName ?? 'the app', draft: current?.input.draft ?? '', typed, transcript };
  switch (state.phase) {
    case 'done':
      return { ...base, phase: 'done', rewrite: state.text ?? current?.text ?? '' };
    case 'asking':
      return {
        ...base,
        phase: 'asking',
        current: questionIndex,
        questions: (state.report?.questions ?? []).map((q, index) => ({ index, question: q.question, suggestions: q.suggestions })),
      };
    case 'replies':
      return {
        ...base,
        phase: 'replies',
        summary: state.assist?.summary,
        replies: (state.assist?.replies ?? []).map((r, index) => ({ index, label: r.label, text: r.text })),
      };
    default:
      return { ...base, phase: base.draft.trim() ? 'other' : 'empty' };
  }
}

async function handleVoice(transcript: string, typed: string, questionIndex: number): Promise<Result<VoiceIntent>> {
  const started = Date.now();
  try {
    const intent = await interpretVoice(client(), voiceContext(transcript, typed, questionIndex));
    console.log(`[PromptButton] voice intent=${intent.intent}${intent.command ? `/${intent.command}` : ''} heard="${intent.heard}" (${Date.now() - started} ms, phase=${state.phase})`);
    return { ok: true, value: intent };
  } catch (error) {
    console.warn('[PromptButton] voice interpretation failed', error instanceof Error ? error.message : error);
    return toResult<never>(error);
  }
}

function snapshotForVoice() {
  if (!current) return;
  voiceSnapshots.push({ state: { ...state }, current: { ...current, answers: [...current.answers] } });
  if (voiceSnapshots.length > 10) voiceSnapshots.shift();
}

async function undoVoice() {
  const snap = voiceSnapshots.pop();
  if (!snap) {
    // The last voice action was an insert into the app (the panel closed): put the original back.
    if (lastInsert) await undo();
    return;
  }
  runId++; // drop anything the undone change still has in flight
  busy = false;
  current = snap.current;
  setState({ ...snap.state });
  showPanel(true);
  console.log(`[PromptButton] voice undo → ${snap.state.phase}`);
}

/** A dictated new request: becomes the draft for the full pipeline; the original field stays the insert target. */
async function voiceDraft(text: string) {
  if (!current || !text.trim()) return;
  current = { ...current, input: { ...current.input, draft: text.trim() }, report: null, text: '', answers: [] };
  runId++;
  await analyzeAndContinue();
}

/** From a captured draft: gap analysis → questions or straight to the rewrite. Also used to resume after settings. */
async function analyzeAndContinue() {
  if (!current) return;
  const { capture, input } = current;
  const my = runId;
  busy = true;
  try {
    setState({
      phase: 'analyzing',
      appName: capture.appName,
      source: capture.source,
      draft: capture.draft,
      report: null,
      text: '',
      error: undefined,
    });
    showPanel(false);

    if (settings.askMode === 'never') {
      await rewrite([]);
      return;
    }
    const report = await analyzeGaps(client(), input);
    if (stale(my)) return;
    current.report = report;
    console.log(
      `[PromptButton] gap analysis mode=${report.mode} scale=${report.scale} domain=${report.domain} ambiguity=${report.ambiguity.toFixed(2)} missing=${report.missing.join(',') || '-'} questions=${report.questions.length}${report.isPlaceholder ? ' placeholder=yes' : ''}`,
    );
    if (report.isPlaceholder) {
      // The field only held its own hint text ("Queue another message…"): treat it as empty.
      console.log('[PromptButton] draft is the box’s hint text → reading the chat instead');
      await suggestForEmptyField(my);
      return;
    }
    const shouldAsk = report.questions.length > 0 && (settings.askMode === 'always' || report.ambiguity >= ASK_THRESHOLD);
    if (shouldAsk) {
      busy = false;
      setState({ phase: 'asking', report, asked: true });
      rememberRun();
      showPanel(true); // the user needs focus to answer
      return;
    }
    setState({ report, asked: false });
    await rewrite([]);
  } catch (error) {
    if (!stale(my)) fail(error);
  }
}

async function rewrite(answers: UserAnswer[], revision?: { previous: string; request: string }) {
  if (!current) return;
  const my = runId;
  current.answers = answers;
  busy = true;
  try {
    setState({ phase: 'rewriting', text: '' });
    const options: RewriteOptions = {
      mode: current.report?.mode,
      domain: current.report?.domain,
      scale: current.report?.scale,
      expert: current.report?.expert,
      depth: settings.depth,
    };
    if (revision) {
      options.previous = revision.previous;
      options.revision = revision.request;
    }
    const text = await rewritePrompt(
      client(),
      current.input,
      answers,
      (delta) => {
        if (!current || stale(my)) return;
        current.text += delta;
        setState({ text: current.text });
      },
      options,
    );
    if (stale(my)) return;
    current.text = text;
    busy = false;
    setState({ phase: 'done', text });
    rememberRun();
    showPanel(true);
  } catch (error) {
    if (!stale(my)) fail(error);
  }
}

async function accept(text: string) {
  if (!current) return;
  const { capture } = current;
  // Give focus back to the target app before writing; our window must not be key.
  win?.hide();
  try {
    const outcome = await insertText(capture, text);
    console.log(`[PromptButton] insert into "${capture.appName}": ${outcome} (${text.length} chars)`);
    lastInsert = { capture, original: capture.draft };
    if (outcome === 'copied') {
      notice(`Copied. ${capture.appName} did not accept a direct replace — press ⌘V to paste, or let me select all and paste.`, {
        offerForcePaste: true,
      });
      return;
    }
    hidePanel();
  } catch (error) {
    clipboard.writeText(text);
    notice(`Copied to the clipboard (${error instanceof Error ? error.message : 'insert failed'}). Press ⌘V to paste.`, { ttl: 6000 });
  }
}

async function handleAction(action: RendererAction) {
  switch (action.type) {
    case 'answers':
      return rewrite(action.answers);
    case 'skip':
      return rewrite([]);
    case 'refine':
      if (!current || !action.note.trim()) return;
      // Revise the previous rewrite instead of regenerating, so the parts the user liked survive.
      return rewrite(current.answers, { previous: current.text, request: action.note.trim() });
    case 'accept':
    case 'reply':
      return accept(action.text);
    case 'copy':
      clipboard.writeText(action.text);
      return notice('Copied to the clipboard.', { ttl: 1800 });
    case 'forcePaste':
      if (current) {
        try {
          await forcePaste(current.capture, current.text);
          hidePanel();
        } catch (error) {
          notice(`Could not paste: ${error instanceof Error ? error.message : error}`, { ttl: 5000 });
        }
      }
      return;
    case 'cancel':
      return hidePanel();
    case 'dictate':
      if (!action.on) return stopDictation();
      // The panel must be key for the mic prompt and for typing to land in the field afterwards.
      win?.focus();
      console.log('[PromptButton] voice input on');
      return startDictation((event) => {
        if (event.type === 'final' || event.type === 'error') console.log(`[PromptButton] voice input ${event.type === 'final' ? `done (${event.text.length} chars)` : `error: ${event.error}`}`);
        win?.webContents.send('pb:dictation', event);
      });
    case 'voiceSnapshot':
      return snapshotForVoice();
    case 'undoVoice':
      return undoVoice();
    case 'voiceDraft':
      return voiceDraft(action.text);
    case 'refresh':
      return trigger({ fresh: true });
    case 'requestCode':
    case 'verifyCode':
    case 'changeEmail':
    case 'signOut':
    case 'upgrade':
    case 'manageBilling':
    case 'ownKeyMode':
    case 'saveOwnKey':
      return accountAction(action);
    case 'openSettings':
      showAccount(undefined, { working: false, note: undefined });
      return void refreshAccount();
    case 'saveSettings':
      // Preferences only: the key and the session are changed through the account actions.
      settings = { ...action.settings, apiKey: settings.apiKey, account: settings.account };
      saveSettings(settings);
      win?.setContentProtection(settings.hideFromCapture);
      buildTray();
      if (resumeAfterSettings && current) {
        resumeAfterSettings = false;
        console.log('[PromptButton] key saved — resuming the interrupted run');
        return analyzeAndContinue();
      }
      return hidePanel();
  }
}

async function undo() {
  if (!lastInsert) return;
  try {
    await insertText(lastInsert.capture, lastInsert.original);
    notice('Restored your original draft.', { ttl: 2000 });
  } catch {
    clipboard.writeText(lastInsert.original);
    notice('Original draft copied to the clipboard.', { ttl: 3000 });
  }
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'public', 'icon', '32.png')).resize({ width: 18, height: 18 });
  tray ??= new Tray(icon);
  tray.setToolTip('PromptButton');
  const mode = (value: Settings['askMode'], label: string): Electron.MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: settings.askMode === value,
    click: () => {
      settings = { ...settings, askMode: value };
      saveSettings(settings);
    },
  });
  const depth = (value: Settings['depth'], label: string): Electron.MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: settings.depth === value,
    click: () => {
      settings = { ...settings, depth: value };
      saveSettings(settings);
    },
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Improve prompt  ${HOTKEY}`, click: () => void trigger() },
      { label: 'Undo last insert', click: () => void undo(), enabled: lastInsert !== null },
      { type: 'separator' },
      { label: 'Ask questions', submenu: [mode('auto', 'Only when the draft is ambiguous'), mode('always', 'Always'), mode('never', 'Never, just rewrite')] },
      { label: 'Rewrite depth', submenu: [depth('full', 'Full master prompt'), depth('concise', 'Concise — tighten only')] },
      {
        label: 'Hide from screen sharing',
        type: 'checkbox',
        checked: settings.hideFromCapture,
        click: (item) => {
          settings = { ...settings, hideFromCapture: item.checked };
          saveSettings(settings);
          win?.setContentProtection(settings.hideFromCapture);
        },
      },
      { label: 'Account…', click: () => void handleAction({ type: 'openSettings' }) },
      { type: 'separator' },
      { label: `Quit ${app.getName()}`, role: 'quit' },
    ]),
  );
}

// One copy only: a second launch would add a second tray icon and fight over the hotkey.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => console.log('[PromptButton] already running; ignoring the second launch'));

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  settings = loadSettings();
  app.dock?.hide(); // menu-bar utility, no Dock icon
  createWindow();
  buildTray();
  powerMonitor.on('resume', () => rebuildHiddenWindow('wake'));
  powerMonitor.on('unlock-screen', () => rebuildHiddenWindow('unlock'));

  if (process.platform === 'darwin') {
    // Prompts once for Accessibility (needed to read the focused field and to paste).
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log(`[PromptButton] permissions: accessibility=${trusted ? 'granted' : 'NOT granted'} screen-recording=${screenStatus}`);
    if (!trusted) console.warn(`[PromptButton] Grant Accessibility: System Settings → Privacy & Security → Accessibility → ${app.getName()}.`);
    if (screenStatus !== 'granted') console.warn(`[PromptButton] Grant Screen Recording: System Settings → Privacy & Security → Screen Recording → ${app.getName()}, then restart.`);
  }

  for (const chord of HOTKEYS) {
    const ok = globalShortcut.register(chord, () => {
      console.log(`[PromptButton] hotkey ${chord}`);
      void trigger();
    });
    if (!ok) console.error(`[PromptButton] could not register ${chord}; another app owns it.`);
  }
  // Scriptable triggers for testing and for buttons that are not keyboards:
  //   kill -USR2 <pid>  → improve the focused field (same as the hotkey)
  //   kill -USR1 <pid>  → insert the finished rewrite (same as the arrow / ⌘↵)
  process.on('SIGUSR2', () => void trigger());
  process.on('SIGUSR1', () => {
    if (state.phase === 'done' && current?.text) void accept(current.text);
  });

  ipcMain.handle('pb:getState', () => state);
  ipcMain.on('pb:action', (_event, action: RendererAction) => void handleAction(action));
  ipcMain.handle('pb:voice', (_event, transcript: string, typed: string, questionIndex: number) =>
    handleVoice(String(transcript ?? ''), String(typed ?? ''), Number(questionIndex) || 0),
  );
  ipcMain.on('pb:resize', (_event, height: number) => fitPanel(Number(height) || PANEL_HEIGHT));
  // Transparent areas of the window must not swallow clicks meant for the app underneath.
  ipcMain.on('pb:mouse', (_event, ignore: boolean) => win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }));

  const mode = settings.apiKey ? 'own key' : settings.account ? `account ${settings.account.email} via ${API_BASE}` : `developer key from ${resolveApiKey(null).source}`;
  console.log(`[PromptButton] Claude calls use: ${mode} (developer keys checked in env, ${dotEnvPaths().join(', ')})`);
  console.log(`[PromptButton] ready — ${HOTKEY} (pid ${process.pid})`);
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar.
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cancelDictation();
});
