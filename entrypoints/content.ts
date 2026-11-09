import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import '../src/ui/toast.css';
import { pickAdapter } from '../src/adapters';
import type { ContentMessage, ImproveInput, RewriteRequest, RewriteResponse } from '../src/messaging';
import { createToast } from '../src/ui/toast';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const adapter = pickAdapter();
    const toast = await createToast(ctx);
    let busy = false;

    console.info(`[PromptButton] ready on ${adapter.id}`);

    browser.runtime.onMessage.addListener((message: ContentMessage) => {
      if (message?.type === 'trigger') void improve();
      return false;
    });

    async function improve() {
      if (busy) return;

      const draft = adapter.readDraft();
      if (!adapter.composerEl()) {
        toast.show({ kind: 'error', message: 'Could not find the chat box on this page.', ttl: 4000 });
        return;
      }
      if (!draft.trim()) {
        toast.show({ kind: 'info', message: 'Type a draft first, then press the button.', ttl: 3000 });
        return;
      }

      const input: ImproveInput = { site: adapter.id, history: adapter.readHistory(), draft };
      console.debug('[PromptButton] input', input);

      busy = true;
      toast.show({ kind: 'busy', message: `Improving your prompt… (${input.history.length} messages of context)` });
      try {
        const request: RewriteRequest = { type: 'rewrite', input, answers: [] };
        const response = (await browser.runtime.sendMessage(request)) as RewriteResponse | undefined;

        if (!response) throw new Error('No response from the extension background.');
        if (!response.ok) {
          toast.show({ kind: 'error', message: response.error, ttl: 6000 });
          return;
        }

        if (!adapter.writeDraft(response.value)) {
          toast.show({ kind: 'error', message: 'Rewrite ready, but the chat box refused the text.', ttl: 5000 });
          return;
        }
        toast.show({
          kind: 'info',
          message: 'Prompt improved.',
          action: { label: 'Undo', onClick: () => adapter.writeDraft(draft) },
          ttl: 8000,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.show({ kind: 'error', message, ttl: 6000 });
      } finally {
        busy = false;
      }
    }
  },
});
