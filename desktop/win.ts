// Windows: the focused field, the window and the keyboard go through desktop/bin-win/winhelper.exe
// (UI Automation, see desktop/native/win/Program.cs). The screenshot comes from Electron's own
// desktopCapturer, which needs no permission on Windows.
import { desktopCapturer, type NativeImage } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const isWindows = process.platform === 'win32';

// Packaged apps keep the helper outside app.asar (asarUnpack), where Windows can run it.
const HELPER = path.join(__dirname, '..', 'bin-win', 'winhelper.exe').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

export interface WinFocused {
  hwnd: number;
  pid: number;
  app: string;
  /** The executable name, e.g. "Code" or "chrome". */
  bundleId: string;
  title: string;
  role: string;
  value: string;
  placeholder?: string;
  selectedText: string;
  valueSettable: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
  diagnostics?: Record<string, unknown>;
}

/** Runs the helper; `input` goes to stdin. Resolves with its one line of JSON. */
export function runWinHelper<T = Record<string, unknown>>(args: string[], input?: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(HELPER, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
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
        reject(new Error(stderr.trim() || `winhelper exited with ${code}`));
      }
    });
    child.stdin.end(input ?? '', 'utf8');
  });
}

/** The front window as an image: that window when Windows can capture it, else the whole screen. */
export async function captureWindow(hwnd: number, bounds: WinFocused['bounds']): Promise<NativeImage | null> {
  const w = Math.min(1600, Math.max(480, bounds?.w ?? 1280));
  const h = Math.round(w * ((bounds?.h ?? 800) / Math.max(1, bounds?.w ?? 1280)));
  try {
    const windows = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: w, height: h }, fetchWindowIcons: false });
    const match = windows.find((s) => s.id.startsWith(`window:${hwnd}:`));
    if (match && !match.thumbnail.isEmpty()) return match.thumbnail;
    const screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 } });
    const shot = screens[0]?.thumbnail;
    return shot && !shot.isEmpty() ? shot : null;
  } catch (error) {
    console.warn('[PromptButton] window capture failed', error instanceof Error ? error.message : error);
    return null;
  }
}

/** 16×16 average hash as 64 hex characters, the same scheme the macOS path uses. */
export function averageHash(image: NativeImage): string {
  const bitmap = image.resize({ width: 16, height: 16, quality: 'good' }).toBitmap(); // BGRA
  const grey: number[] = [];
  for (let i = 0; i + 3 < bitmap.length; i += 4) grey.push((bitmap[i]! + bitmap[i + 1]! + bitmap[i + 2]!) / 3);
  const mean = grey.reduce((s, v) => s + v, 0) / Math.max(1, grey.length);
  let hex = '';
  for (let i = 0; i < grey.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) if ((grey[i + b] ?? 0) > mean) nibble |= 1 << (3 - b);
    hex += nibble.toString(16);
  }
  return hex;
}
