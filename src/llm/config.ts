// No browser/wxt imports here so the eval scripts can import the LLM modules from Node.
import type { ErrorCode } from '../messaging';

export const MODEL = 'claude-opus-5-5';
/** Low effort keeps the button snappy; the tasks are editing, not deep reasoning. */
export const EFFORT = 'low' as const;

export class PromptButtonError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PromptButtonError';
  }
}
