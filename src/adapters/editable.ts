// Shared helpers for reading from and writing into chat composers.
// Both target sites use ProseMirror contenteditable editors. Setting innerText
// bypasses the editor's state, so the reliable path is execCommand('insertText'),
// which goes through the browser's editing pipeline that ProseMirror listens to.

export function readEditable(el: HTMLElement | null): string {
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  // innerText preserves line breaks between paragraphs, textContent does not.
  return el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function writeEditable(el: HTMLElement | null, text: string): boolean {
  if (!el) return false;

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    // React tracks the value via the prototype setter; calling the native setter
    // then dispatching 'input' makes React see the change.
    const proto = Object.getPrototypeOf(el) as object;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, text) : (el.value = text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    return true;
  }

  el.focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // execCommand is deprecated but still the only API that drives contenteditable
  // editors through their own input handling.
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok || readEditable(el) !== text.trim()) {
    // Fallback: synthesize a paste event, which ProseMirror also handles.
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    ok = readEditable(el) === text.trim();
  }
  if (!ok) {
    el.innerText = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    ok = true;
  }
  return ok;
}

export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n[…${text.length - max} chars omitted…]\n${text.slice(-tail)}`;
}
