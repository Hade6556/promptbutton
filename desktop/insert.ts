// Puts the rewritten prompt back where the draft came from, and says exactly what happened.
//
// Order of work:
//  0. Bring the target app to the front and wait until macOS confirms it is frontmost. Nothing is
//     typed anywhere before that, so keystrokes can never land in the wrong app.
//  1. Native fields (TextEdit, Mail, Notes…): set the field's AXValue, verified by reading it back.
//  2. Chat-box-sized fields whose whole content was the draft: ⌘A + ⌘V in that field (Electron apps,
//     browsers), verified by reading the field back when the app lets us; one retry if it did not land.
//  3. A selection, or a field the app does not describe (Chrome): paste at the selection or caret.
//  4. Otherwise copy to the clipboard.
//
// A paste we could read back is 'pasted' and the user's clipboard is returned. A paste the app does
// not let us check is 'unverified': the prompt then stays on the clipboard so ⌘V finishes the job.
// Every other ending is 'copied' with a reason the panel turns into one plain sentence.
import { clipboard } from 'electron';
import { copyWholeField, runHelper, type Capture } from './capture';
import { restoreClipboardLater, snapshotClipboard } from './clipboard';
import { isWindows, runWinHelper } from './win';

import { errorText, landed, reasonFor, squash, type InsertReason, type InsertResult } from './paste-check';

export { squash, type InsertOutcome, type InsertReason, type InsertResult } from './paste-check';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The focused element is a text field we may write into: the draft filled it, or it was empty. */
function isWritableField(capture: Capture): boolean {
  return capture.source === 'field' || (capture.source === 'none' && /^(AXText(Area|Field)|Edit|Document)$/.test(capture.role));
}

/** A field whose entire content was the draft (or nothing) and that looks like a message box, not a document. */
function isChatLikeField(capture: Capture): boolean {
  return isWritableField(capture) && capture.draft.length <= 2000 && capture.draft.split('\n').length <= 20;
}

/** The app reports the field's text, so a paste can be checked by reading it back. */
function isReadable(capture: Capture): boolean {
  return capture.method === 'ax' && /^(AXText(Area|Field)|AXComboBox|Edit|Document)$/.test(capture.role);
}

/** Brings the target to the front; resolves only once it is frontmost, otherwise throws target_not_frontmost / app_not_running. */
async function activate(capture: Capture) {
  if (isWindows) {
    await runWinHelper(['activate', String(capture.hwnd)]);
    await delay(120);
    return;
  }
  const result = await runHelper<{ frontmost: boolean }>(['activate', String(capture.pid)]);
  if (!result.frontmost) throw new Error('target_not_frontmost');
}

async function readBack(capture: Capture): Promise<string | null> {
  try {
    const focused = await (isWindows ? runWinHelper<{ value: string; pid: number; role?: string }>(['focused']) : runHelper<{ value: string; pid: number; role?: string }>(['focused']));
    return focused.pid === capture.pid ? focused.value : null;
  } catch {
    return null;
  }
}

/** After activation the app needs a moment to give focus back to its field; wait for it instead of guessing. */
async function waitForFocus(capture: Capture): Promise<string | null> {
  if (!isReadable(capture)) {
    await delay(180);
    return null;
  }
  for (let i = 0; i < 6; i++) {
    const value = await readBack(capture);
    if (value !== null) return value;
    await delay(120);
  }
  return null;
}

/**
 * Did the prompt arrive? true / false when the box could be read, null when the app gives no way to
 * check. Apps that describe their field are read through Accessibility; apps that describe nothing
 * ("blind") are read by select-all + copy.
 */
async function check(capture: Capture, text: string): Promise<boolean | null> {
  if (isReadable(capture)) return confirmLanded(capture, text);
  if (!capture.blind || isWindows) return null;
  await delay(350);
  const now = await copyWholeField(capture.pid);
  if (!now) return null; // nothing came back: cannot tell
  return landed(now, text);
}

/** Polls the field until it shows the prompt. null: the app would not let us read it. */
async function confirmLanded(capture: Capture, text: string, timeoutMs = 1500): Promise<boolean | null> {
  const until = Date.now() + timeoutMs;
  let readable = false;
  while (Date.now() < until) {
    await delay(150);
    const now = await readBack(capture);
    if (now === null) continue;
    readable = true;
    if (landed(now, text)) return true;
  }
  return readable ? false : null;
}

/** Writes straight into the focused field: AXValue on macOS, UI Automation's ValuePattern on Windows. */
function setValue(capture: Capture, text: string): Promise<{ set: boolean; value: string; axError?: number }> {
  return isWindows ? runWinHelper(['set', String(capture.hwnd)], text) : runHelper(['set', String(capture.pid)], text);
}

/** Sends ⌘A (optional) and ⌘V to the target. The helper refuses unless the target is frontmost. */
async function sendPaste(capture: Capture, text: string, selectAll: boolean): Promise<void> {
  // Something else may have written to the clipboard since we did (a clipboard manager, the user).
  if ((await clipboard.readText()) !== text) await clipboard.writeText(text);
  if (isWindows) await runWinHelper(['paste', String(capture.hwnd), selectAll ? 'all' : 'selection']);
  else await runHelper(['paste', String(capture.pid), selectAll ? 'all' : 'selection']);
}

export async function insertText(capture: Capture, text: string): Promise<InsertResult> {
  if (!capture.pid) {
    await clipboard.writeText(text);
    return { outcome: 'copied', reason: 'no_target' };
  }
  const saved = await snapshotClipboard();
  const copied = async (reason: InsertReason, detail?: string): Promise<InsertResult> => {
    await clipboard.writeText(text);
    return { outcome: 'copied', reason, detail };
  };

  try {
    await activate(capture);
  } catch (error) {
    return copied(reasonFor(error), errorText(error));
  }
  const before = await waitForFocus(capture);
  // The field no longer holds what was captured: the user typed on, or focus moved to another field.
  // Replacing "everything" there could destroy text we never saw.
  if (isReadable(capture) && before !== null && squash(capture.fieldText) && squash(before) && squash(before) !== squash(capture.fieldText)) {
    return copied('field_changed');
  }

  // 1. Direct AX write (native text views only — Electron editors accept it into a hidden
  //    textarea without updating what the user sees, so they skip straight to paste).
  if (isWritableField(capture) && capture.valueSettable && !capture.chromium) {
    try {
      const result = await setValue(capture, text);
      if (result.set && squash(result.value) === squash(text)) {
        await delay(200);
        const still = await readBack(capture);
        if (still === null || landed(still, text)) return { outcome: 'replaced' };
        console.info('[PromptButton] AXValue write was reverted by the app; trying paste');
      } else {
        console.info(`[PromptButton] AXValue write not reflected (set=${result.set}, axError=${result.axError}); trying paste`);
      }
    } catch (error) {
      console.info('[PromptButton] AXValue write failed:', errorText(error));
    }
  }

  // 2–3. Paste: over the whole message box, over the user's selection, or at the caret of a field
  //      the app does not describe (source 'none' with no role: Chrome and other silent apps).
  const selectAll = isChatLikeField(capture);
  const atSelection = capture.source === 'selection' || (capture.source === 'none' && !capture.role);
  if (!selectAll && !atSelection) return copied('no_field');

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await sendPaste(capture, text, selectAll);
      const ok = await check(capture, text);
      if (ok === true) {
        restoreClipboardLater(saved, text, 400);
        return { outcome: 'pasted' };
      }
      if (ok === null) {
        // Sent to the frontmost target, but the app gives nothing to read back. Give slow apps time
        // to take the paste, and leave the prompt on the clipboard as the fallback.
        await delay(350);
        await clipboard.writeText(text);
        return { outcome: 'unverified' };
      }
      // Readable and unchanged. Replacing everything again is safe; pasting at a caret twice is not.
      if (!selectAll || attempt === 2) break;
      console.info('[PromptButton] paste did not reach the field; retrying once');
      await activate(capture);
      await delay(300);
    }
    return copied('not_changed');
  } catch (error) {
    console.info('[PromptButton] paste failed:', errorText(error));
    return copied(reasonFor(error), errorText(error));
  }
}

/** User-requested: select all and paste, whatever the field is. */
export async function forcePaste(capture: Capture, text: string): Promise<InsertResult> {
  try {
    await activate(capture);
    await waitForFocus(capture);
    await sendPaste(capture, text, true);
    const ok = await check(capture, text);
    if (ok === false) {
      await clipboard.writeText(text);
      return { outcome: 'copied', reason: 'not_changed' };
    }
    await delay(300);
    if (!ok) await clipboard.writeText(text);
    return { outcome: ok ? 'pasted' : 'unverified' };
  } catch (error) {
    await clipboard.writeText(text);
    return { outcome: 'copied', reason: reasonFor(error), detail: errorText(error) };
  }
}
