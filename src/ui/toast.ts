import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export type ToastKind = 'busy' | 'info' | 'error';

export interface ToastOptions {
  kind: ToastKind;
  message: string;
  /** Optional single action button, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  /** Auto-hide after this many ms; omit to keep it until the next show/hide. */
  ttl?: number;
}

export interface Toast {
  show(options: ToastOptions): void;
  hide(): void;
}

export async function createToast(ctx: ContentScriptContext): Promise<Toast> {
  let root: HTMLDivElement | null = null;
  let hideTimer: number | undefined;

  const ui = await createShadowRootUi(ctx, {
    name: 'promptbutton-toast',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    onMount(container) {
      root = document.createElement('div');
      root.className = 'toast';
      root.setAttribute('role', 'status');
      root.innerHTML = `<span class="spinner"></span><span class="message"></span>`;
      container.append(root);
      return root;
    },
  });
  ui.mount();

  function hide() {
    window.clearTimeout(hideTimer);
    root?.setAttribute('data-visible', 'false');
  }

  function show({ kind, message, action, ttl }: ToastOptions) {
    if (!root) return;
    window.clearTimeout(hideTimer);
    root.dataset.kind = kind;
    root.querySelector('.message')!.textContent = message;
    root.querySelector('.action')?.remove();
    if (action) {
      const button = document.createElement('button');
      button.className = 'action';
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.onClick();
        hide();
      });
      root.append(button);
    }
    root.dataset.visible = 'true';
    if (ttl) hideTimer = window.setTimeout(hide, ttl);
  }

  return { show, hide };
}
