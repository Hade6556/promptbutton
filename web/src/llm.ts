import Anthropic from '@anthropic-ai/sdk';
import { PromptButtonError } from '../../src/llm/config';
import { toResult } from '../../src/llm/errors';
import { analyzeGaps } from '../../src/llm/gapAnalysis';
import { rewritePrompt } from '../../src/llm/rewrite';
import type { GapReport, ImproveInput, Result, RewriteOptions, UserAnswer } from '../../src/messaging';

const KEY_STORAGE = 'promptbutton.apiKey';
const BASE_URL_STORAGE = 'promptbutton.baseUrl';
export const PROXY_URL = 'http://127.0.0.1:8787';

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
function write(name: string, value: string | null): void {
  try {
    value ? localStorage.setItem(name, value) : localStorage.removeItem(name);
  } catch {
    // Private mode or blocked storage: the value just lives for this page load.
  }
}

export const getKey = () => read(KEY_STORAGE);
export const setKey = (key: string | null) => write(KEY_STORAGE, key);
export const getBaseUrl = () => read(BASE_URL_STORAGE) ?? '';
export const setBaseUrl = (url: string) => write(BASE_URL_STORAGE, url.trim().replace(/\/+$/, '') || null);

function client(): Anthropic {
  const apiKey = getKey();
  const baseURL = getBaseUrl();
  if (!apiKey && !baseURL) throw new PromptButtonError('no_api_key', 'Add your Anthropic API key to run this.');
  // Browser-direct call with the user's own key, or via the local proxy for orgs that block CORS.
  return new Anthropic({
    apiKey: apiKey ?? 'proxy',
    baseURL: baseURL || undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 60_000,
  });
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
  options?: RewriteOptions,
): Promise<Result<string>> {
  try {
    return { ok: true, value: await rewritePrompt(client(), input, answers, onDelta, options) };
  } catch (error) {
    return toResult<never>(error);
  }
}
