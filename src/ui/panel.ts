import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { GapReport, ReplyAssist, UserAnswer } from '../messaging';
import { diffWords } from '../utils/diff';

export interface PanelHandlers {
  onPress(): void;
  onSubmitAnswers(answers: UserAnswer[]): void;
  onSkipQuestions(): void;
  onAccept(text: string): void;
  onCancel(): void;
  onUndo(): void;
  /** A suggested reply was chosen (or typed) with the field empty. */
  onReply(text: string): void;
}

export interface Panel {
  showBusy(message: string): void;
  showQuestions(report: GapReport): void;
  showReplies(assist: ReplyAssist): void;
  startPreview(original: string, report: GapReport | null): void;
  appendDelta(text: string): void;
  finishPreview(text: string): void;
  showError(message: string): void;
  showNotice(message: string, options?: { undo?: boolean; ttl?: number }): void;
  hide(): void;
  pressFab(): void;
}

type Attrs = Record<string, string | boolean | ((event: Event) => void)>;

/** Tiny DOM builder; all text goes through text nodes so page content is never parsed as HTML. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === 'function') el.addEventListener(name.slice(2).toLowerCase(), value);
    else if (typeof value === 'boolean') {
      if (value) el.setAttribute(name, '');
    } else el.setAttribute(name, value);
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
}

function verdictView(report: GapReport, asked: boolean): HTMLElement {
  const pct = Math.round(report.ambiguity * 100);
  const text = asked
    ? `Ambiguity ${pct}% — asked ${report.questions.length} question${report.questions.length === 1 ? '' : 's'} first.`
    : `Ambiguity ${pct}% — ${report.alreadyClearBecause ?? 'clear enough to rewrite directly.'}`;
  return h('div', { class: 'pb-verdict' }, [
    h('div', { class: 'pb-meter', 'aria-hidden': 'true' }, [h('span', { style: `width:${pct}%` })]),
    h('p', { style: 'margin:0' }, [text]),
  ]);
}

export async function createPanel(ctx: ContentScriptContext, handlers: PanelHandlers): Promise<Panel> {
  let panel!: HTMLElement;
  let title!: HTMLElement;
  let body!: HTMLElement;
  let foot!: HTMLElement;
  let fab!: HTMLButtonElement;
  let preview: HTMLElement | null = null;
  let caret: HTMLElement | null = null;
  let currentOriginal = '';
  let currentReport: GapReport | null = null;
  let streamed = '';
  let hideTimer: number | undefined;

  const ui = await createShadowRootUi(ctx, {
    name: 'promptbutton-panel',
    position: 'inline',
    anchor: 'body',
    append: 'last',
    onMount(container) {
      fab = h('button', {
        class: 'pb-fab',
        type: 'button',
        title: 'Improve this prompt (Alt+Shift+P)',
        'aria-label': 'Improve this prompt',
        onClick: () => handlers.onPress(),
      }, ['✦']);

      title = h('span', { class: 'pb-title' });
      body = h('div', { class: 'pb-body' });
      foot = h('div', { class: 'pb-foot' });
      panel = h('section', { class: 'pb-panel', role: 'dialog', 'aria-label': 'PromptButton', hidden: true }, [
        h('header', { class: 'pb-head' }, [
          title,
          h('button', { class: 'pb-close', type: 'button', 'aria-label': 'Close', onClick: () => handlers.onCancel() }, ['×']),
        ]),
        body,
        foot,
      ]);
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          handlers.onCancel();
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && preview) {
          event.preventDefault();
          handlers.onAccept(preview.innerText.trim());
        }
      });

      const root = h('div', { class: 'pb-root' }, [fab, panel]);
      container.append(root);
      return root;
    },
  });
  ui.mount();

  function open(titleText: string, subtitle?: string) {
    window.clearTimeout(hideTimer);
    title.replaceChildren(titleText, subtitle ? h('small', {}, [subtitle]) : '');
    body.replaceChildren();
    foot.replaceChildren();
    foot.hidden = true;
    preview = null;
    caret = null;
    panel.hidden = false;
    requestAnimationFrame(() => panel.setAttribute('data-visible', 'true'));
  }

  function hide() {
    window.clearTimeout(hideTimer);
    panel.setAttribute('data-visible', 'false');
    panel.hidden = true;
  }

  function setFooter(...nodes: Array<Node | string>) {
    foot.replaceChildren(...nodes);
    foot.hidden = false;
  }

  function renderDiff(original: string, text: string): HTMLElement {
    const el = h('div', { class: 'pb-preview', tabindex: '0', 'aria-label': 'Rewritten prompt' });
    for (const op of diffWords(original, text)) {
      if (op.type === 'del') continue;
      if (op.type === 'add' && op.text.trim()) el.append(h('mark', {}, [op.text]));
      else el.append(op.text);
    }
    return el;
  }

  return {
    pressFab() {
      fab.dataset.pressed = 'true';
      window.setTimeout(() => delete fab.dataset.pressed, 180);
    },

    showBusy(message) {
      open('PromptButton');
      body.append(h('div', { class: 'pb-status' }, [h('span', { class: 'pb-dot', 'aria-hidden': 'true' }), h('p', { style: 'margin:0' }, [message])]));
    },

    showQuestions(report) {
      currentReport = report;
      open('Before rewriting', `ambiguity ${Math.round(report.ambiguity * 100)}%`);
      const inputs: HTMLInputElement[] = [];
      const list = h('ol', { class: 'pb-questions' });
      report.questions.forEach((q, index) => {
        const input = h('input', { class: 'pb-answer', type: 'text', placeholder: 'Or type your own', 'aria-label': q.question });
        inputs.push(input);
        const chips = h('div', { class: 'pb-chips', role: 'group' });
        for (const suggestion of q.suggestions) {
          const chip = h('button', { class: 'pb-chip', type: 'button', 'aria-pressed': 'false' }, [suggestion]);
          chip.addEventListener('click', () => {
            const on = chip.getAttribute('aria-pressed') === 'true';
            for (const c of chips.querySelectorAll('.pb-chip')) c.setAttribute('aria-pressed', 'false');
            chip.setAttribute('aria-pressed', on ? 'false' : 'true');
            input.value = on ? '' : suggestion;
          });
          chips.append(chip);
        }
        input.addEventListener('input', () => {
          for (const c of chips.querySelectorAll('.pb-chip')) {
            c.setAttribute('aria-pressed', c.textContent === input.value ? 'true' : 'false');
          }
        });
        list.append(h('li', { class: 'pb-question' }, [h('p', { class: 'pb-question-text' }, [q.question]), chips, input]));
        if (index === 0) requestAnimationFrame(() => input.focus());
      });
      body.append(list);

      const submit = () =>
        handlers.onSubmitAnswers(
          report.questions
            .map((q, i) => ({ question: q.question, answer: inputs[i]!.value.trim() }))
            .filter((a) => a.answer.length > 0),
        );
      for (const input of inputs) input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());

      setFooter(
        h('button', { class: 'pb-btn primary', type: 'button', onClick: submit }, ['Rewrite with answers']),
        h('button', { class: 'pb-btn', type: 'button', onClick: () => handlers.onSkipQuestions() }, ['Skip']),
        h('span', { class: 'pb-spacer' }),
        h('span', { class: 'pb-kbd' }, ['Enter to rewrite · Esc to close']),
      );
    },

    showReplies(assist) {
      open('What should I say?');
      body.append(h('p', { class: 'pb-reply-summary' }, [assist.summary]));
      if (assist.asks.length) {
        body.append(h('ul', { class: 'pb-asks' }, assist.asks.map((a) => h('li', {}, [a]))));
      }
      const input = h('input', { class: 'pb-answer', type: 'text', placeholder: 'Pick a reply or type your own', 'aria-label': 'Your reply' });
      const chips = h('div', { class: 'pb-chips', role: 'group' });
      for (const reply of assist.replies) {
        const chip = h('button', { class: 'pb-chip', type: 'button', title: reply.text }, [reply.label]);
        chip.addEventListener('click', () => {
          input.value = reply.text;
          input.focus();
        });
        chips.append(chip);
      }
      body.append(chips, input);
      const submit = () => input.value.trim() && handlers.onReply(input.value.trim());
      input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      requestAnimationFrame(() => input.focus());
      setFooter(
        h('button', { class: 'pb-btn primary', type: 'button', onClick: submit }, ['Put it in the box']),
        h('button', { class: 'pb-btn', type: 'button', onClick: () => handlers.onCancel() }, ['Close']),
        h('span', { class: 'pb-spacer' }),
        h('span', { class: 'pb-kbd' }, ['Enter to insert · Esc to close']),
      );
    },

    startPreview(original, report) {
      currentOriginal = original;
      currentReport = report ?? currentReport;
      streamed = '';
      open('Rewriting…');
      if (currentReport) body.append(verdictView(currentReport, currentReport.questions.length > 0 && currentReport.ambiguity >= 0.6));
      caret = h('span', { class: 'pb-caret', 'aria-hidden': 'true' });
      preview = h('div', { class: 'pb-preview', 'aria-live': 'polite' }, [caret]);
      body.append(preview);
    },

    appendDelta(text) {
      if (!preview || !caret) return;
      streamed += text;
      caret.before(text);
      preview.scrollTop = preview.scrollHeight;
    },

    finishPreview(text) {
      title.replaceChildren('Rewritten prompt', h('small', {}, ['additions highlighted']));
      const next = renderDiff(currentOriginal, text);
      if (preview) preview.replaceWith(next);
      else body.append(next);
      preview = next;
      caret = null;
      body.append(
        h('details', { class: 'pb-original' }, [h('summary', {}, ['Show original draft']), h('p', {}, [currentOriginal])]),
      );
      const editButton = h('button', { class: 'pb-btn', type: 'button' }, ['Edit']);
      editButton.addEventListener('click', () => {
        if (!preview) return;
        const editing = preview.getAttribute('contenteditable') === 'true';
        if (editing) {
          preview.removeAttribute('contenteditable');
          editButton.textContent = 'Edit';
        } else {
          preview.textContent = preview.innerText; // drop <mark>s so caret movement is predictable
          preview.setAttribute('contenteditable', 'true');
          preview.focus();
          editButton.textContent = 'Done editing';
        }
      });
      setFooter(
        h('button', { class: 'pb-btn primary', type: 'button', onClick: () => preview && handlers.onAccept(preview.innerText.trim()) }, [
          'Use this prompt',
        ]),
        editButton,
        h('button', { class: 'pb-btn', type: 'button', onClick: () => handlers.onCancel() }, ['Cancel']),
        h('span', { class: 'pb-spacer' }),
        h('span', { class: 'pb-kbd' }, ['⌘/Ctrl+Enter to use · Esc to close']),
      );
      requestAnimationFrame(() => preview?.focus());
    },

    showError(message) {
      open('PromptButton');
      body.append(h('p', { class: 'pb-error', role: 'alert', style: 'margin:0' }, [message]));
      setFooter(h('button', { class: 'pb-btn', type: 'button', onClick: () => handlers.onCancel() }, ['Close']));
    },

    showNotice(message, options = {}) {
      open('PromptButton');
      const row = h('div', { class: 'pb-notice' }, [h('span', {}, [message])]);
      if (options.undo) row.append(h('button', { class: 'pb-btn', type: 'button', onClick: () => handlers.onUndo() }, ['Undo']));
      body.append(row);
      hideTimer = window.setTimeout(hide, options.ttl ?? 6000);
    },

    hide,
  };
}
