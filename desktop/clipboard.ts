// The user's clipboard is borrowed for a paste and given back afterwards, whatever it held.
// Electron's clipboard calls are asynchronous: every one is awaited, so a paste keystroke can
// never run ahead of the write it depends on.
import { clipboard, ClipboardItem } from 'electron';

export interface ClipboardSnapshot {
  text: string;
  /** Every format of every entry, read out in full (entries from read() stay tied to the live clipboard). */
  items: Record<string, Blob | string>[];
}

/** Everything on the clipboard: text, rich text, images, files. */
export async function snapshotClipboard(): Promise<ClipboardSnapshot> {
  const text = await clipboard.readText().catch(() => '');
  const items: ClipboardSnapshot['items'] = [];
  try {
    for (const entry of await clipboard.read()) {
      const formats: Record<string, Blob | string> = {};
      for (const type of entry.types) {
        if (type === 'electron application/bookmark') continue;
        try {
          formats[type] = (await entry.getType(type)) as Blob;
        } catch {
          // a format the platform lists but cannot deliver: skip it
        }
      }
      if (Object.keys(formats).length > 0) items.push(formats);
    }
  } catch {
    // Fall back to text only.
  }
  return { text, items };
}

export async function restoreClipboard(snapshot: ClipboardSnapshot): Promise<void> {
  try {
    if (snapshot.items.length > 0) {
      await clipboard.write(snapshot.items.map((formats) => new ClipboardItem(formats)));
      return;
    }
  } catch (error) {
    console.warn('[PromptButton] could not restore the full clipboard; restoring text only:', error instanceof Error ? error.message : error);
  }
  if (snapshot.text) await clipboard.writeText(snapshot.text);
  else clipboard.clear();
}

/**
 * Gives the clipboard back after `delayMs`, but only if it still holds what we put there. If the
 * user (or a clipboard manager) copied something else in the meantime, that newer content wins.
 */
export function restoreClipboardLater(snapshot: ClipboardSnapshot, ours: string, delayMs: number) {
  setTimeout(() => {
    void clipboard
      .readText()
      .then((now) => (now === ours ? restoreClipboard(snapshot) : undefined))
      .catch(() => {});
  }, delayMs);
}
