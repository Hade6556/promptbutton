// PromptButton desktop: a global hotkey summons an always-on-top panel over any app.
// Reads the focused field + a window screenshot, runs the same gap-analysis → questions →
// rewrite pipeline as the extension, and writes the result back into the field.
import Anthropic from '@anthropic-ai/sdk';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, screen, systemPreferences, Tray } from 'electron';
import path from 'node:path';
import { ASK_THRESHOLD } from '../src/llm/config';
import { toResult } from '../src/llm/errors';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';
import type { GapReport, ImproveInput, UserAnswer } from '../src/messaging';
import { captureContext, type Capture } from './capture';
import { forcePaste, insertText } from './insert';
import { loadSettings, saveSettings } from './settings';
import type { PanelState, RendererAction, Settings } from './shared';

const HOTKEY = 'Alt+Shift+P';
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 600;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: Settings = { apiKey: null, askMode: 'auto', hideFromCapture: false };
let state: PanelState = { phase: 'hidden', hotkey: HOTKEY };
let busy = false;
let current: { capture: Capture; input: ImproveInput; report: GapReport | null; text: string } | null = null;
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

function client(): Anthropic {
  // Node process: no CORS, so organisations that block browser calls work without a proxy.
  // With no saved key the SDK falls back to ANTHROPIC_API_KEY / an `ant auth login` profile.
  return new Anthropic({ apiKey: settings.apiKey ?? undefined, maxRetries: 1, timeout: 60_000 });
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
  win.setPosition(Math.round(x + (width - PANEL_WIDTH) / 2), y + 20);
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
  if (state.phase !== 'hidden' && state.phase !== 'notice') {
    hidePanel();
    return;
  }
  busy = true;
  try {
    // Capture before showing the panel so the screenshot does not include it.
    const capture = await captureContext();
    console.log(
      `[PromptButton] captured app="${capture.appName}" role=${capture.role || '?'} source=${capture.source} draft=${capture.draft.length} chars screenshot=${capture.screenshot ? `${Math.round((capture.screenshot.data.length * 3) / 4 / 1024)} KB` : 'none'}`,
    );
    if (capture.source === 'none') {
      busy = false;
      notice(`Nothing to improve: no text in the focused field of ${capture.appName}. Click into a chat box or select your draft, then press ${HOTKEY.replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '')}.`, { ttl: 5000 });
      return;
    }
    const input: ImproveInput = { site: capture.appName, history: [], draft: capture.draft, screenshot: capture.screenshot };
    current = { capture, input, report: null, text: '' };
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
      { label: `Improve prompt  (${HOTKEY.replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '')})`, click: () => void trigger() },
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
    if (!trusted) console.warn('[PromptButton] Accessibility permission not granted yet (System Settings → Privacy & Security → Accessibility).');
  }

  if (!globalShortcut.register(HOTKEY, () => void trigger())) {
    console.error(`[PromptButton] could not register ${HOTKEY}; another app owns it.`);
  }
  // Scriptable trigger for testing and for buttons that are not keyboards: kill -USR2 <pid>
  process.on('SIGUSR2', () => void trigger());

  ipcMain.handle('pb:getState', () => state);
  ipcMain.on('pb:action', (_event, action: RendererAction) => void handleAction(action));

  console.log(`[PromptButton] ready — ${HOTKEY} (pid ${process.pid})`);
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar.
});
app.on('will-quit', () => globalShortcut.unregisterAll());
