// Reads what the user is looking at: the frontmost app, the text in its focused field
// (macOS Accessibility API via System Events), and a screenshot of its front window.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Screenshot } from '../src/messaging';
import type { DraftSource } from './shared';

const execFileAsync = promisify(execFile);

export interface Capture {
  appName: string;
  bundleId: string;
  pid: number;
  role: string;
  fieldText: string;
  selectedText: string;
  /** Which text became the draft. */
  source: DraftSource;
  draft: string;
  bounds: { x: number; y: number; w: number; h: number } | null;
  screenshot: Screenshot | null;
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

const SEP = '<<PB_SEP>>';

const CAPTURE_SCRIPT = `
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

async function screenshot(bounds: Capture['bounds']): Promise<Screenshot | null> {
  const file = path.join(os.tmpdir(), `promptbutton-${process.pid}-${Date.now()}.jpg`);
  const region = bounds && bounds.w > 50 && bounds.h > 50 ? ['-R', `${bounds.x},${bounds.y},${bounds.w},${bounds.h}`] : [];
  try {
    // -x: no sound. Needs Screen Recording permission the first time (macOS prompts).
    await execFileAsync('screencapture', ['-x', '-t', 'jpg', ...region, file]);
    const data = await fs.readFile(file);
    if (data.length < 1000) return null; // permission denied yields an empty/blank file
    return { mediaType: 'image/jpeg', data: data.toString('base64') };
  } catch (error) {
    console.warn('[PromptButton] screenshot failed', error instanceof Error ? error.message : error);
    return null;
  } finally {
    await fs.unlink(file).catch(() => {});
  }
}

export async function captureContext(): Promise<Capture> {
  const raw = await runAppleScript(CAPTURE_SCRIPT);
  const [appName = '', pidText = '0', bundleId = '', boundsText = '', role = '', fieldText = '', selectedText = ''] = raw.split(SEP);
  const [x, y, w, h] = boundsText.split(',').map((n) => Number.parseInt(n, 10));
  const bounds = [x, y, w, h].every((n) => Number.isFinite(n)) && w! > 0 && h! > 0 ? { x: x!, y: y!, w: w!, h: h! } : null;

  const selection = selectedText.trim();
  const field = fieldText.trim();
  const source: DraftSource = selection ? 'selection' : field ? 'field' : 'none';

  return {
    appName: appName || 'this app',
    bundleId,
    pid: Number.parseInt(pidText, 10) || 0,
    role,
    fieldText,
    selectedText,
    source,
    draft: selection || field,
    bounds,
    screenshot: await screenshot(bounds),
  };
}
