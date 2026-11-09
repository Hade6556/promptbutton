import Anthropic from '@anthropic-ai/sdk';
import { PromptButtonError } from '../../src/llm/config';
import { toResult } from '../../src/llm/errors';
import { analyzeGaps } from '../../src/llm/gapAnalysis';
import { rewritePrompt } from '../../src/llm/rewrite';
import type { GapReport, ImproveInput, Result, UserAnswer } from '../../src/messaging';

const KEY_STORAGE = 'promptbutton.apiKey';

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setKey(key: string | null): void {
  try {
    key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode or blocked storage: the key just lives for this page load.
  }
}

function client(): Anthropic {
  const apiKey = getKey();
  if (!apiKey) throw new PromptButtonError('no_api_key', 'Add your Anthropic API key to run this.');
  // Browser-direct call with the user's own key; nothing is proxied or stored elsewhere.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });
}

export async function analyze(input: ImproveInput): Promise<Result<GapReport>> {
  try {
    return { ok: true, value: await analyzeGaps(client(), input) };
  } catch (error) {
    return toResult<never>(error);
  }
}

export async function rewrite(
  input: ImproveInput,
  answers: UserAnswer[],
  onDelta?: (text: string) => void,
): Promise<Result<string>> {
  try {
    return { ok: true, value: await rewritePrompt(client(), input, answers, onDelta) };
  } catch (error) {
    return toResult<never>(error);
  }
}
