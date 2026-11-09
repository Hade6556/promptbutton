// Puts the rewritten prompt back where the draft came from.
//
// The target app must be frontmost first: Chromium/Electron apps report no focused element
// while our panel holds focus. Then, safest method first:
//  1. set the focused field's AXValue through the helper, verified by reading it back
//     (native fields: TextEdit, Mail, Notes…),
//  2. for chat-box-sized fields whose whole content was the draft: ⌘A + ⌘V inside that field,
//     verified by reading it back (Monaco/VS Code, Slack, browsers),
//  3. paste over the user's selection,
//  4. copy to the clipboard and tell the user.
import { clipboard } from 'electron';
import { runAppleScript, runHelper, type Capture } from './capture';

export type InsertOutcome = 'replaced' | 'pasted' | 'copied';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ACTIVATE_SCRIPT = `
on run argv
  tell application "System Events"
    set frontmost of (first application process whose unix id is ((item 1 of argv) as integer)) to true
  end tell
end run`;

const PASTE_SCRIPT = `
on run argv
  set selectAll to (item 1 of argv) is "all"
  tell application "System Events"
    if selectAll then
      keystroke "a" using command down
      delay 0.06
    end if
    keystroke "v" using command down
  end tell
end run`;

/** A field whose entire content was the draft and that looks like a message box, not a document. */
function isChatLikeField(capture: Capture): boolean {
  return capture.source === 'field' && capture.draft.length <= 2000 && capture.draft.split('\n').length <= 20;
}

async function activate(pid: number) {
  await runAppleScript(ACTIVATE_SCRIPT, [String(pid)]);
  await delay(220);
}

async function readBack(pid: number): Promise<string | null> {
  try {
    const focused = await runHelper<{ value: string; pid: number }>(['focused']);
    return focused.pid === pid ? focused.value : null;
  } catch {
    return null;
  }
}

async function paste(text: string, selectAll: boolean): Promise<void> {
  const previous = await clipboard.readText();
  clipboard.writeText(text);
  try {
    await runAppleScript(PASTE_SCRIPT, [selectAll ? 'all' : 'selection']);
    await delay(250);
  } finally {
    // Give the target app time to consume the clipboard before restoring the user's.
    setTimeout(() => clipboard.writeText(previous), 900);
  }
}

export async function insertText(capture: Capture, text: string): Promise<InsertOutcome> {
  if (!capture.pid) {
    clipboard.writeText(text);
    return 'copied';
  }
  await activate(capture.pid);

  // 1. Direct AX write (native text views only — Electron editors accept it into a hidden
  //    textarea without updating what the user sees, so they skip straight to paste).
  if (capture.source === 'field' && capture.valueSettable && !capture.chromium) {
    try {
      const result = await runHelper<{ set: boolean; value: string; axError: number }>(['set', String(capture.pid)], text);
      if (result.set && result.value.trim() === text.trim()) {
        await delay(200);
        const still = await readBack(capture.pid);
        if (still === null || still.trim() === text.trim()) return 'replaced';
        console.info('[PromptButton] AXValue write was reverted by the app; trying paste');
      } else {
        console.info(`[PromptButton] AXValue write not reflected (set=${result.set}, axError=${result.axError}); trying paste`);
      }
    } catch (error) {
      console.info('[PromptButton] AXValue write failed:', error instanceof Error ? error.message : error);
    }
  }

  // 2. Replace the whole message box by select-all + paste (Monaco/VS Code, Slack, web apps).
  if (isChatLikeField(capture)) {
    try {
      await paste(text, true);
      const after = await readBack(capture.pid);
      if (after === null || after.trim() === text.trim() || (after.trim() !== capture.fieldText.trim() && after.includes(text.slice(0, 40)))) {
        return 'pasted';
      }
      console.info('[PromptButton] select-all paste did not change the field');
    } catch (error) {
      console.info('[PromptButton] select-all paste failed:', error instanceof Error ? error.message : error);
    }
  }

  // 3. Paste over the user's own selection.
  if (capture.source === 'selection') {
    try {
      await paste(text, false);
      return 'pasted';
    } catch (error) {
      console.info('[PromptButton] paste failed:', error instanceof Error ? error.message : error);
    }
  }

  clipboard.writeText(text);
  return 'copied';
}

/** User-requested: select all and paste, no verification. */
export async function forcePaste(capture: Capture, text: string): Promise<void> {
  await activate(capture.pid);
  await paste(text, true);
}
