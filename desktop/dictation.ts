// Voice input: runs desktop/bin/dictate (macOS SFSpeechRecognizer, on-device when available) and
// streams its JSON lines to a callback. One session at a time; stop() closes the helper's stdin,
// which makes it deliver the final text and exit.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { DictationEvent } from './shared';

const HELPER = path.join(__dirname, '..', 'bin', 'dictate');

let child: ChildProcessWithoutNullStreams | null = null;

export function isDictating(): boolean {
  return child !== null;
}

export function startDictation(onEvent: (event: DictationEvent) => void): void {
  if (child) return;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const proc = spawn(HELPER, [locale]);
  child = proc;
  let buffer = '';
  let ended = false;
  const end = (event: DictationEvent) => {
    if (ended) return;
    ended = true;
    if (child === proc) child = null;
    onEvent(event);
  };

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let msg: { status?: string; level?: number; partial?: string; final?: string; error?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.status === 'listening') onEvent({ type: 'listening' });
      else if (typeof msg.level === 'number') onEvent({ type: 'level', level: msg.level });
      else if (typeof msg.partial === 'string') onEvent({ type: 'partial', text: msg.partial });
      else if (typeof msg.final === 'string') end({ type: 'final', text: msg.final });
      else if (msg.error) end({ type: 'error', error: describe(msg.error) });
    }
  });
  proc.stderr.on('data', (d: Buffer) => console.warn('[PromptButton] dictate:', d.toString().trim()));
  proc.on('error', (error) => end({ type: 'error', error: `Voice input is unavailable (${error.message}). Run npm run desktop:build.` }));
  proc.on('close', (code) => end(code === 0 ? { type: 'final', text: '' } : { type: 'error', error: 'Voice input stopped unexpectedly.' }));
}

export function stopDictation(): void {
  child?.stdin.end();
}

/** Cancel without waiting for the final text (panel closed). */
export function cancelDictation(): void {
  // SIGTERM, not SIGKILL: the helper relays it to its disclaimed child, which owns the microphone.
  child?.stdin.end();
  child?.kill('SIGTERM');
  child = null;
}

function describe(code: string): string {
  switch (code) {
    case 'speech_denied':
      return 'Speech Recognition is off for PromptButton. Turn it on in System Settings › Privacy & Security › Speech Recognition.';
    case 'mic_denied':
      return 'The microphone is off for PromptButton. Turn it on in System Settings › Privacy & Security › Microphone.';
    case 'unavailable':
      return 'Speech recognition is not available for your language on this Mac.';
    default:
      return `Voice input failed: ${code}`;
  }
}
