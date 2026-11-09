// Typed messages between the content script and the background service worker.

export type Role = 'user' | 'assistant';

export interface HistoryMessage {
  role: Role;
  text: string;
}

export type AmbiguityType =
  | 'goal'
  | 'audience'
  | 'output_format'
  | 'constraints'
  | 'success_criteria'
  | 'examples'
  | 'unclear_reference'
  | 'scope';

export interface GapQuestion {
  type: AmbiguityType;
  question: string;
  suggestions: string[];
}

export interface GapReport {
  ambiguity: number; // 0..1
  missing: AmbiguityType[];
  questions: GapQuestion[];
  alreadyClearBecause: string | null;
}

export interface UserAnswer {
  question: string;
  answer: string;
}

export interface ImproveInput {
  site: string;
  history: HistoryMessage[];
  draft: string;
}

/** Background → content: the user pressed the hotkey. */
export interface TriggerMessage {
  type: 'trigger';
}

/** Content → background: analyze the draft for gaps. */
export interface AnalyzeRequest {
  type: 'analyze';
  input: ImproveInput;
}

/** Content → background: rewrite the draft (with optional answers). */
export interface RewriteRequest {
  type: 'rewrite';
  input: ImproveInput;
  answers: UserAnswer[];
}

export type BackgroundRequest = AnalyzeRequest | RewriteRequest;
export type ContentMessage = TriggerMessage;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: ErrorCode };

export type ErrorCode = 'no_api_key' | 'auth' | 'rate_limit' | 'refusal' | 'network' | 'unknown';

export type AnalyzeResponse = Result<GapReport>;
export type RewriteResponse = Result<string>;
