import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import {
  REWRITE_PORT,
  type AnalyzeResponse,
  type BackgroundRequest,
  type PortMessage,
  type RewriteRequest,
  type RewriteResponse,
  type TriggerMessage,
} from '../src/messaging';
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

async function streamRewrite(request: RewriteRequest, post: (message: PortMessage) => void) {
  try {
    const client = await getClient();
    const text = await rewritePrompt(client, request.input, request.answers, (delta) =>
      post({ type: 'delta', text: delta }),
    );
    post({ type: 'done', text });
  } catch (error) {
    console.error('[PromptButton] stream rewrite', error);
    const result = toResult<never>(error);
    if (!result.ok) post({ type: 'error', error: result.error, code: result.code });
  }
}

export default defineBackground(() => {
  // Hotkey (and the physical button, which sends the same chord).
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'improve-prompt') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'trigger' } satisfies TriggerMessage);
    } catch {
      console.info('[PromptButton] no content script in tab', tab.url);
    }
  });

  // One-shot requests. Chrome's native onMessage needs sendResponse + `return true` for async replies.
  browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
    if (message?.type !== 'analyze' && message?.type !== 'rewrite') return false;
    void handle(message).then(sendResponse);
    return true;
  });

  // Streaming rewrite over a port so the preview fills in as the model writes.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== REWRITE_PORT) return;
    let closed = false;
    port.onDisconnect.addListener(() => (closed = true));
    port.onMessage.addListener((message: RewriteRequest) => {
      if (message?.type !== 'rewrite') return;
      void streamRewrite(message, (m) => {
        if (!closed) port.postMessage(m);
      });
    });
  });
});
