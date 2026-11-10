// The global shortcut: the default chords, a user-chosen one, and how to show either.

const IS_MAC = process.platform === 'darwin';

// macOS: ⌥⇧P is the documented chord; ⌥⌘P is what people press when they read ⇧ as ⌘.
// Windows: Alt+Shift+P matches the Mac; Ctrl+Alt+P is the fallback if a keyboard-layout switcher eats Alt+Shift.
export const DEFAULT_SHORTCUTS = IS_MAC ? ['Alt+Shift+P', 'Alt+Command+P'] : ['Alt+Shift+P', 'Control+Alt+P'];

/** Electron accelerators to register: the saved one alone, or both defaults. */
export const shortcutsFor = (custom: string | null) => (custom ? [custom] : DEFAULT_SHORTCUTS);

const MAC_SYMBOLS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };
const KEY_NAMES: Record<string, string> = { Return: '↵', Escape: 'Esc', Backspace: '⌫', Tab: '⇥', Up: '↑', Down: '↓', Left: '←', Right: '→' };
const ORDER = ['Control', 'Alt', 'Shift', 'Command'];

/** The keys of one accelerator for display, modifiers in the platform's order: ['⌥', '⇧', 'P'] or ['Ctrl', 'Alt', 'P']. */
export function shortcutKeys(accelerator: string): string[] {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const mods = ORDER.filter((m) => parts.includes(m));
  const shownMods = IS_MAC ? mods.map((m) => MAC_SYMBOLS[m]!) : mods.map((m) => (m === 'Control' ? 'Ctrl' : m === 'Command' ? 'Win' : m));
  return [...shownMods, KEY_NAMES[key] ?? key];
}

const joined = (accelerator: string) => shortcutKeys(accelerator).join(IS_MAC ? '' : '+');

/** "⌥⇧P (or ⌥⌘P)" for the defaults, or the one saved chord. */
export function shortcutLabel(custom: string | null): string {
  const list = shortcutsFor(custom);
  return list.length > 1 ? `${joined(list[0]!)} (or ${joined(list[1]!)})` : joined(list[0]!);
}

/** A chord a person can press anywhere without typing a character: a non-Shift modifier and one key. */
export function validShortcut(accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = parts.pop();
  if (!key || parts.length === 0 || ORDER.includes(key)) return false;
  if (!parts.every((p) => ORDER.includes(p))) return false;
  return parts.some((p) => p !== 'Shift');
}
