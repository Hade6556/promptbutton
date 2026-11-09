import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type { AnalyzeResponse, BackgroundRequest, RewriteResponse, TriggerMessage } from '../src/messaging';
import { getClient, toResult } from '../src/llm/client';
import { analyzeGaps } from '../src/llm/gapAnalysis';
import { rewritePrompt } from '../src/llm/rewrite';

async function handle(message: BackgroundRequest): Promise<AnalyzeResponse | RewriteResponse> {
  try {
    const client = await getClient();
    switch (message.type) {
      case 'analyze':
        return { ok: true, value: await analyzeGaps(client, message.input) };
      case 'rewrite':
        return { ok: true, value: await rewritePrompt(client, message.input, message.answers) };
    }
  } catch (error) {
    console.error('[PromptButton]', message.type, error);
    return toResult<never>(error);
  }
}

export default defineBackground(() => {
  // Hotkey (and, later, the physical button sending the same chord).
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'improve-prompt') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'trigger' } satisfies TriggerMessage);
    } catch {
      // No content script on this page (not a supported site, or not reloaded yet).
      console.info('[PromptButton] no content script in tab', tab.url);
    }
  });

  // Chrome's native onMessage needs sendResponse + `return true` for async replies.
  browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
    if (message?.type !== 'analyze' && message?.type !== 'rewrite') return false;
    void handle(message).then(sendResponse);
    return true;
  });
});
