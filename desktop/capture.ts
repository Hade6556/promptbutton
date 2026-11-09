// Reads what the user is looking at: the frontmost app, the text in its focused field, and a
// screenshot of its front window.
//
// Field text comes from the compiled Accessibility helper (desktop/native/axhelper.swift), which
// talks to the C-level AX API and wakes Chromium/Electron apps' accessibility trees. Fallbacks:
// AppleScript (System Events) for native apps if the helper is missing, then copying the user's
// selection with ⌘C for apps that expose nothing (current Chrome does this).
import { clipboard } from 'electron';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Screenshot } from '../src/messaging';
import type { DraftSource } from './shared';

const execFileAsync = promisify(execFile);
const HELPER = path.join(__dirname, '..', 'bin', 'axhelper');

export interface Capture {
  appName: string;
  bundleId: string;
  pid: number;
  role: string;
  fieldText: string;
  selectedText: string;
  /** Whether the focused element accepts a direct AXValue write (unknown → true). */
  valueSettable: boolean;
  /** Which text became the draft. */
  source: DraftSource;
  /** How the text was obtained. */
  method: 'ax' | 'applescript' | 'clipboard' | 'none';
  draft: string;
  bounds: { x: number; y: number; w: number; h: number } | null;
  screenshot: Screenshot | null;
}

/** Runs the Swift helper; `input` is piped to stdin. Resolves with parsed JSON. */
export function runHelper<T = Record<string, unknown>>(args: string[], input?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(HELPER, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 8000);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as T & { error?: string };
        if (parsed.error) reject(new Error(parsed.error));
        else resolve(parsed);
      } catch {
        reject(new Error(stderr.trim() || `axhelper exited with ${code}`));
      }
    });
    child.stdin.end(input ?? '');
  });
}

/** Runs AppleScript from stdin so multi-line scripts and arbitrary argv values need no shell quoting. */
export function runAppleScript(source: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-', ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.replace(/\n$/, ''));
      else reject(new Error(stderr.trim() || `osascript exited with ${code}`));
    });
    child.stdin.end(source);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface HelperFocused {
  app: string;
  bundleId: string;
  pid: number;
  bounds?: { x: number; y: number; w: number; h: number };
  role: string;
  value: string;
  placeholder?: string;
  selectedText: string;
  valueSettable: boolean;
  diagnostics?: Record<string, unknown>;
}

const SEP = '<<PB_SEP>>';
const APPLESCRIPT_CAPTURE = `
on textOf(v)
  if v is missing value then return ""
  try
    return v as text
  on error
    return ""
  end try
end textOf
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set appPid to unix id of p
  set bid to ""
  try
    set bid to bundle identifier of p
  end try
  set wx to 0
  set wy to 0
  set ww to 0
  set wh to 0
  try
    set w to first window of p
    set {wx, wy} to position of w
    set {ww, wh} to size of w
  end try
  set roleName to ""
  set fieldText to ""
  set selText to ""
  try
    set f to value of attribute "AXFocusedUIElement" of p
    set roleName to my textOf(value of attribute "AXRole" of f)
    try
      set fieldText to my textOf(value of attribute "AXValue" of f)
    end try
    try
      set selText to my textOf(value of attribute "AXSelectedText" of f)
    end try
  end try
end tell
set sep to "${SEP}"
return appName & sep & appPid & sep & bid & sep & wx & "," & wy & "," & ww & "," & wh & sep & roleName & sep & fieldText & sep & selText
`;

async function focusedViaAppleScript(): Promise<HelperFocused> {
  const raw = await runAppleScript(APPLESCRIPT_CAPTURE);
  const [app = '', pidText = '0', bundleId = '', boundsText = '', role = '', value = '', selectedText = ''] = raw.split(SEP);
  const [x, y, w, h] = boundsText.split(',').map((n) => Number.parseInt(n, 10));
  const bounds = [x, y, w, h].every((n) => Number.isFinite(n)) && w! > 0 && h! > 0 ? { x: x!, y: y!, w: w!, h: h! } : undefined;
  return { app, bundleId, pid: Number.parseInt(pidText, 10) || 0, bounds, role, value, selectedText, valueSettable: true };
}

/** Last resort: ⌘C the current selection and read the clipboard, then put the clipboard back. */
async function copySelection(): Promise<string> {
  const previous = await clipboard.readText();
  clipboard.writeText('');
  try {
    await runAppleScript('tell application "System Events" to keystroke "c" using command down');
    await delay(200);
    return (await clipboard.readText()).trim();
  } finally {
    clipboard.writeText(previous);
  }
}

async function screenshot(bounds: Capture['bounds']): Promise<Screenshot | null> {
  const file = path.join(os.tmpdir(), `promptbutton-${process.pid}-${Date.now()}.jpg`);
  const region = bounds && bounds.w > 50 && bounds.h > 50 ? ['-R', `${bounds.x},${bounds.y},${bounds.w},${bounds.h}`] : [];
  try {
    await execFileAsync('screencapture', ['-x', '-t', 'jpg', ...region, file]);
    const data = await fs.readFile(file);
    if (data.length < 1000) return null;
    return { mediaType: 'image/jpeg', data: data.toString('base64') };
  } catch (error) {
    console.warn('[PromptButton] screenshot failed', error instanceof Error ? error.message : error);
    return null;
  } finally {
    await fs.unlink(file).catch(() => {});
  }
}

export async function captureContext(): Promise<Capture> {
  let focused: HelperFocused;
  let method: Capture['method'] = 'ax';
  try {
    focused = await runHelper<HelperFocused>(['focused']);
    if (focused.diagnostics) console.debug('[PromptButton] ax', JSON.stringify(focused.diagnostics));
  } catch (error) {
    console.warn('[PromptButton] axhelper unavailable, using AppleScript:', error instanceof Error ? error.message : error);
    focused = await focusedViaAppleScript();
    method = 'applescript';
  }

  let selection = focused.selectedText.trim();
  let field = focused.value.trim();
  // Belt and braces for fields that expose the placeholder as their value (VS Code's chat box).
  if (focused.placeholder && field === focused.placeholder.trim()) field = '';
  if (/^(Queue another message|Ask .*|Type a message|Message .*|Send a message)…?\.{0,3}$/i.test(field)) field = '';
  if (!selection && !field) {
    // Nothing exposed (e.g. Chrome). If the user selected their draft, ⌘C gets it.
    const copied = await copySelection();
    if (copied) {
      selection = copied;
      method = 'clipboard';
    }
  }

  const source: DraftSource = selection ? 'selection' : field ? 'field' : 'none';
  if (source === 'none') method = 'none';

  return {
    appName: focused.app || 'this app',
    bundleId: focused.bundleId,
    pid: focused.pid,
    role: focused.role,
    fieldText: focused.value,
    selectedText: focused.selectedText,
    valueSettable: focused.valueSettable !== false,
    source,
    method,
    draft: selection || field,
    bounds: focused.bounds ?? null,
    screenshot: await screenshot(focused.bounds ?? null),
  };
}
