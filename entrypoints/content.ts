import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import '../src/ui/panel.css';
import { pickAdapter } from '../src/adapters';
import { ASK_THRESHOLD, askModeItem } from '../src/settings';
import {
  REWRITE_PORT,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ContentMessage,
  type GapReport,
  type ImproveInput,
  type PortMessage,
  type Result,
  type RewriteRequest,
  type UserAnswer,
} from '../src/messaging';
import { createPanel } from '../src/ui/panel';

/** Streams the rewrite from the background over a port; resolves with the final text. */
function streamRewrite(
  input: ImproveInput,
  answers: UserAnswer[],
  onDelta: (text: string) => void,
  options?: RewriteRequest['options'],
): Promise<Result<string>> {
  return new Promise((resolve) => {
    const port = browser.runtime.connect({ name: REWRITE_PORT });
    port.onMessage.addListener((message: PortMessage) => {
      if (message.type === 'delta') return onDelta(message.text);
      if (message.type === 'done') resolve({ ok: true, value: message.text });
      else resolve({ ok: false, error: message.error, code: message.code });
      port.disconnect();
    });
    port.onDisconnect.addListener(() =>
      resolve({ ok: false, error: 'Lost the connection to the extension. Reload the page and try again.', code: 'unknown' }),
    );
    port.postMessage({ type: 'rewrite', input, answers, options } satisfies RewriteRequest);
  });
}

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const adapter = pickAdapter();
    let busy = false;
    let current: { input: ImproveInput; report: GapReport | null } | null = null;
    let lastOriginal: string | null = null;

    const panel = await createPanel(ctx, {
      onPress: () => void improve(),
      onSubmitAnswers: (answers) => void rewrite(answers),
      onSkipQuestions: () => void rewrite([]),
      onAccept: (text) => {
        if (!current) return;
        if (!adapter.writeDraft(text)) {
          panel.showError('Rewrite ready, but the chat box refused the text. Copy it from the preview instead.');
          return;
        }
        lastOriginal = current.input.draft;
        panel.showNotice('Prompt replaced. Review it, then send.', { undo: true, ttl: 8000 });
      },
      onCancel: () => {
        busy = false;
        panel.hide();
      },
      onUndo: () => {
        if (lastOriginal !== null) adapter.writeDraft(lastOriginal);
        panel.hide();
      },
    });

    console.info(`[PromptButton] ready on ${adapter.id}`);

    browser.runtime.onMessage.addListener((message: ContentMessage) => {
      if (message?.type === 'trigger') void improve();
      return false;
    });

    async function improve() {
      if (busy) return;
      panel.pressFab();

      if (!adapter.composerEl()) {
        panel.showError('Could not find the chat box on this page.');
        return;
      }
      const draft = adapter.readDraft();
      if (!draft.trim()) {
        panel.showNotice('Type a draft first, then press the button.', { ttl: 3000 });
        return;
      }

      const input: ImproveInput = { site: adapter.id, history: adapter.readHistory(), draft };
      current = { input, report: null };
      console.debug('[PromptButton] input', input);

      const mode = await askModeItem.getValue();
      if (mode === 'never') return rewrite([]);

      busy = true;
      const turns = input.history.length;
      panel.showBusy(turns ? `Reading ${turns} message${turns === 1 ? '' : 's'} and checking what’s missing…` : 'Checking what’s missing…');
      try {
        const request: AnalyzeRequest = { type: 'analyze', input };
        const response = (await browser.runtime.sendMessage(request)) as AnalyzeResponse | undefined;
        if (!response) throw new Error('No response from the extension background.');
        if (!response.ok) {
          busy = false;
          return panel.showError(response.error);
        }
        current.report = response.value;
        const shouldAsk =
          response.value.questions.length > 0 && (mode === 'always' || response.value.ambiguity >= ASK_THRESHOLD);
        if (shouldAsk) {
          busy = false;
          return panel.showQuestions(response.value);
        }
        busy = false;
        await rewrite([]);
      } catch (error) {
        busy = false;
        panel.showError(error instanceof Error ? error.message : String(error));
      }
    }

    async function rewrite(answers: UserAnswer[]) {
      if (!current || busy) return;
      busy = true;
      panel.startPreview(current.input.draft, current.report);
      const result = await streamRewrite(current.input, answers, (delta) => panel.appendDelta(delta), {
        mode: current.report?.mode,
      });
      busy = false;
      if (!result.ok) return panel.showError(result.error);
      panel.finishPreview(result.value);
    }
  },
});
