// Puts the rewritten prompt back where the draft came from, safest method first:
//  1. set the focused field's AXValue through the helper (verified by reading it back),
//  2. paste over the user's selection,
//  3. copy to the clipboard and tell the user — never select-all without being asked.
import { clipboard } from 'electron';
import { runAppleScript, runHelper, type Capture } from './capture';

export type InsertOutcome = 'replaced' | 'pasted' | 'copied';

const PASTE_SCRIPT = `
on run argv
  set targetPid to (item 1 of argv) as integer
  set selectAll to (item 2 of argv) is "all"
  tell application "System Events"
    set frontmost of (first application process whose unix id is targetPid) to true
    delay 0.25
    if selectAll then
      keystroke "a" using command down
      delay 0.05
    end if
    keystroke "v" using command down
  end tell
end run`;

async function pasteInto(pid: number, text: string, selectAll: boolean): Promise<void> {
  const previous = await clipboard.readText();
  clipboard.writeText(text);
  try {
    await runAppleScript(PASTE_SCRIPT, [String(pid), selectAll ? 'all' : 'selection']);
  } finally {
    // Give the target app time to read the clipboard before restoring the user's.
    setTimeout(() => clipboard.writeText(previous), 800);
  }
}

export async function insertText(capture: Capture, text: string): Promise<InsertOutcome> {
  if (capture.source === 'field' && capture.pid && capture.valueSettable) {
    try {
      const result = await runHelper<{ set: boolean; value: string; axError: number }>(['set', String(capture.pid)], text);
      if (result.set && result.value.trim() === text.trim()) return 'replaced';
      console.info(`[PromptButton] AXValue write not accepted (set=${result.set}, axError=${result.axError})`);
    } catch (error) {
      console.info('[PromptButton] AXValue write failed:', error instanceof Error ? error.message : error);
    }
  }
  if (capture.source === 'selection' && capture.pid) {
    try {
      await pasteInto(capture.pid, text, false);
      return 'pasted';
    } catch (error) {
      console.info('[PromptButton] paste failed:', error instanceof Error ? error.message : error);
    }
  }
  clipboard.writeText(text);
  return 'copied';
}

/** User-requested: activate the app, select all, paste. For editors whose fields reject AXValue. */
export async function forcePaste(capture: Capture, text: string): Promise<void> {
  await pasteInto(capture.pid, text, true);
}
