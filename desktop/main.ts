// PromptButton desktop: a global hotkey summons an always-on-top panel over any app.
// Reads the focused field + a window screenshot, runs the same gap-analysis → questions →
// rewrite pipeline as the extension, and writes the result back into the field.
import Anthropic from '@anthropic-ai/sdk';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, screen, systemPreferences, Tray } from 'electron';
import path from 'node:path';
import { ASK_THRESHOLD, PromptButtonError } from '../src/llm/config';
import { toResult } from '../src/llm/errors';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';
import type { GapReport, ImproveInput, UserAnswer } from '../src/messaging';
import { captureContext, type Capture } from './capture';
import { dotEnvPaths, resolveApiKey } from './env';
import { forcePaste, insertText } from './insert';
import { loadSettings, saveSettings } from './settings';
import type { PanelState, RendererAction, Settings } from './shared';

// Both chords trigger: ⌥⇧P is the documented one; ⌥⌘P is what people press when they read ⇧ as ⌘.
const HOTKEYS = ['Alt+Shift+P', 'Alt+Command+P'];
const HOTKEY = '⌥⇧P (or ⌥⌘P)';
const PANEL_WIDTH = 600;
const PANEL_HEIGHT = 56; // the bare box; the renderer asks for more as content appears
const PANEL_MAX_HEIGHT = 760;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: Settings = { apiKey: null, askMode: 'auto', hideFromCapture: false };
let state: PanelState = { phase: 'hidden', hotkey: HOTKEY };
let busy = false;
let current: { capture: Capture; input: ImproveInput; report: GapReport | null; text: string; answers: UserAnswer[] } | null = null;
let lastInsert: { capture: Capture; original: string } | null = null;
let noticeTimer: NodeJS.Timeout | undefined;

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

function client(): Anthropic {
  // Node process: no CORS, so organisations that block browser calls work without a proxy.
  // Key: saved in the app, or ANTHROPIC_API_KEY in the environment, or .env in the project / ~/.promptbutton.env.
  const { key, source } = resolveApiKey(settings.apiKey);
  if (!key) {
    throw new PromptButtonError(
      'no_api_key',
      `No API key found. Paste one here, or put ANTHROPIC_API_KEY=sk-ant-… in ${dotEnvPaths()[0]} (no restart needed).`,
    );
  }
  console.log(`[PromptButton] using API key from ${source}`);
  return new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 });
}

function createWindow() {
  win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
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
}

function positionPanel() {
  if (!win) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  win.setPosition(Math.round(x + (width - PANEL_WIDTH) / 2), y + 12);
}

/** The renderer reports its content height; keep the window exactly that tall, anchored at the top. */
function fitPanel(height: number) {
  if (!win) return;
  const [x, y] = win.getPosition();
  const next = Math.max(PANEL_HEIGHT, Math.min(PANEL_MAX_HEIGHT, Math.ceil(height)));
  const [, currentHeight] = win.getSize();
  if (next !== currentHeight) win.setBounds({ x, y, width: PANEL_WIDTH, height: next }, false);
}

function showPanel(takeFocus: boolean) {
  if (!win) createWindow();
  positionPanel();
  if (takeFocus) win!.show();
  else win!.showInactive();
}

function hidePanel() {
  clearTimeout(noticeTimer);
  win?.hide();
  busy = false;
  setState({ phase: 'hidden', report: null, text: '', error: undefined, notice: undefined, offerForcePaste: false });
}

function notice(text: string, options: { ttl?: number; offerForcePaste?: boolean } = {}) {
  clearTimeout(noticeTimer);
  setState({ phase: 'notice', notice: text, offerForcePaste: options.offerForcePaste ?? false });
  showPanel(false);
  if (options.ttl) noticeTimer = setTimeout(hidePanel, options.ttl);
}

function fail(error: unknown) {
  const result = toResult<never>(error);
  busy = false;
  if (!result.ok) {
    if (result.code === 'no_api_key' || result.code === 'auth') {
      resumeAfterSettings = current !== null; // continue the run once a key is saved
      setState({ phase: 'settings', settings, error: result.error });
      showPanel(true);
      return;
    }
    setState({ phase: 'error', error: result.error });
  }
  showPanel(true);
}

async function trigger() {
  if (busy) return;
  // A press while the panel is mid-interaction brings it to the front instead of cancelling.
  if (state.phase === 'asking' || state.phase === 'done' || state.phase === 'settings') {
    showPanel(true);
    return;
  }
  if (state.phase !== 'hidden' && state.phase !== 'notice') {
    hidePanel();
    return;
  }
  busy = true;
  try {
    // Capture before showing the panel so the screenshot does not include it.
    const capture = await captureContext();
    console.log(
      `[PromptButton] captured app="${capture.appName}" role=${capture.role || '?'} via=${capture.method} source=${capture.source} settable=${capture.valueSettable} draft=${capture.draft.length} chars screenshot=${capture.screenshot ? `${Math.round((capture.screenshot.data.length * 3) / 4 / 1024)} KB` : 'none'}`,
    );
    if (capture.source === 'none') {
      busy = false;
      notice(`Nothing to improve yet — type a draft in ${capture.appName}, then press ${HOTKEY}.`, { ttl: 4000 });
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
    fail(error);
  }
}

/** From a captured draft: gap analysis → questions or straight to the rewrite. Also used to resume after settings. */
async function analyzeAndContinue() {
  if (!current) return;
  const { capture, input } = current;
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
    current.report = report;
    console.log(`[PromptButton] gap analysis ambiguity=${report.ambiguity.toFixed(2)} missing=${report.missing.join(',') || '-'} questions=${report.questions.length}`);
    const shouldAsk = report.questions.length > 0 && (settings.askMode === 'always' || report.ambiguity >= ASK_THRESHOLD);
    if (shouldAsk) {
      busy = false;
      setState({ phase: 'asking', report, asked: true });
      showPanel(true); // the user needs focus to answer
      return;
    }
    setState({ report, asked: false });
    await rewrite([]);
  } catch (error) {
    fail(error);
  }
}

async function rewrite(answers: UserAnswer[]) {
  if (!current) return;
  current.answers = answers;
  busy = true;
  try {
    setState({ phase: 'rewriting', text: '' });
    const text = await rewritePrompt(client(), current.input, answers, (delta) => {
      if (!current) return;
      current.text += delta;
      setState({ text: current.text });
    });
    current.text = text;
    busy = false;
    setState({ phase: 'done', text });
    showPanel(true);
  } catch (error) {
    fail(error);
  }
}

async function accept(text: string) {
  if (!current) return;
  const { capture } = current;
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
      return rewrite([...current.answers, { question: 'Additional instruction from the user', answer: action.note.trim() }]);
    case 'accept':
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
    case 'openSettings':
      setState({ phase: 'settings', settings, error: undefined });
      return showPanel(true);
    case 'saveSettings':
      settings = action.settings;
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Improve prompt  ${HOTKEY}`, click: () => void trigger() },
      { label: 'Undo last insert', click: () => void undo(), enabled: lastInsert !== null },
      { type: 'separator' },
      { label: 'Ask questions', submenu: [mode('auto', 'Only when the draft is ambiguous'), mode('always', 'Always'), mode('never', 'Never, just rewrite')] },
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
      { label: 'API key…', click: () => void handleAction({ type: 'openSettings' }) },
      { type: 'separator' },
      { label: 'Quit PromptButton', role: 'quit' },
    ]),
  );
}

app.whenReady().then(() => {
  settings = loadSettings();
  app.dock?.hide(); // menu-bar utility, no Dock icon
  createWindow();
  buildTray();

  if (process.platform === 'darwin') {
    // Prompts once for Accessibility (needed to read the focused field and to paste).
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log(`[PromptButton] permissions: accessibility=${trusted ? 'granted' : 'NOT granted'} screen-recording=${screenStatus}`);
    if (!trusted) console.warn('[PromptButton] Grant Accessibility: System Settings → Privacy & Security → Accessibility → Electron.');
    if (screenStatus !== 'granted') console.warn('[PromptButton] Grant Screen Recording: System Settings → Privacy & Security → Screen Recording → Electron, then restart.');
  }

  for (const chord of HOTKEYS) {
    const ok = globalShortcut.register(chord, () => {
      console.log(`[PromptButton] hotkey ${chord}`);
      void trigger();
    });
    if (!ok) console.error(`[PromptButton] could not register ${chord}; another app owns it.`);
  }
  // Scriptable trigger for testing and for buttons that are not keyboards: kill -USR2 <pid>
  process.on('SIGUSR2', () => void trigger());

  ipcMain.handle('pb:getState', () => state);
  ipcMain.on('pb:action', (_event, action: RendererAction) => void handleAction(action));
  ipcMain.on('pb:resize', (_event, height: number) => fitPanel(Number(height) || PANEL_HEIGHT));
  // Transparent areas of the window must not swallow clicks meant for the app underneath.
  ipcMain.on('pb:mouse', (_event, ignore: boolean) => win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }));

  console.log(`[PromptButton] key source at startup: ${resolveApiKey(settings.apiKey).source} (checked settings, env, ${dotEnvPaths().join(', ')})`);
  console.log(`[PromptButton] ready — ${HOTKEY} (pid ${process.pid})`);
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar.
});
app.on('will-quit', () => globalShortcut.unregisterAll());
