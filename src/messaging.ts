// Typed messages between the content script, the background service worker, and the web playground.

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

/** A screenshot of the app window, used as conversation context when no transcript is available (desktop). */
export interface Screenshot {
  mediaType: 'image/jpeg' | 'image/png';
  /** Base64 without a data: prefix. */
  data: string;
}

export interface ImproveInput {
  /** Where the draft lives: "chatgpt", "claude", "web", or the desktop app name ("Code", "Slack"). */
  site: string;
  history: HistoryMessage[];
  draft: string;
  screenshot?: Screenshot | null;
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

export type ErrorCode = 'no_api_key' | 'auth' | 'rate_limit' | 'refusal' | 'network' | 'unknown';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: ErrorCode };

export type AnalyzeResponse = Result<GapReport>;
export type RewriteResponse = Result<string>;

/** Long-lived port used to stream the rewrite into the preview. */
export const REWRITE_PORT = 'promptbutton-rewrite';

export type PortMessage =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; error: string; code?: ErrorCode };
