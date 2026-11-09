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

/** What kind of draft this is; decides how much structure the rewrite adds. */
export type DraftMode = 'follow_up' | 'request' | 'brain_dump';

/** Field of the task; selects the playbook (checklist + quality bar) the master prompt is built against. */
export type Domain =
  | 'frontend_design'
  | 'software'
  | 'writing'
  | 'marketing_sales'
  | 'data_analysis'
  | 'research_learning'
  | 'planning_strategy'
  | 'creative'
  | 'personal_life'
  | 'other';

/**
 * deliverable: something to build, write, design, plan, analyse, decide or fix — gets a master prompt.
 * quick: a lookup, conversion, one-line fact or tiny edit — stays short.
 */
export type Scale = 'deliverable' | 'quick';

/** User setting: how far a task-like draft is expanded. */
export type Depth = 'full' | 'concise';

export interface GapReport {
  ambiguity: number; // 0..1
  mode: DraftMode;
  domain: Domain;
  scale: Scale;
  /** One sentence naming the specific practitioner whose answer the user wants; null for quick/factual drafts. */
  expert: string | null;
  /** The "draft" is the chat box's own hint text ("Queue another message…"), not something the user typed. */
  isPlaceholder: boolean;
  missing: AmbiguityType[];
  questions: GapQuestion[];
  alreadyClearBecause: string | null;
}

/** "What should I say?" — produced when the user presses with an empty field. */
export interface ReplySuggestion {
  /** 2–5 word label for the chip. */
  label: string;
  /** The full reply, ready to send, in the user's voice. */
  text: string;
}

export interface ReplyAssist {
  /** Plain-words summary of the assistant's latest message, at most two short sentences. */
  summary: string;
  /** The decisions/questions the assistant wants from the user, one short line each. */
  asks: string[];
  replies: ReplySuggestion[];
}

/** What the panel is showing when the user speaks; the interpreter reads speech against it. */
export type VoicePhase = 'empty' | 'asking' | 'done' | 'replies' | 'other';

export interface VoiceContext {
  phase: VoicePhase;
  app: string;
  /** The draft the run started from ('' when the field was empty). */
  draft: string;
  /** Asking: every question with its suggestions; `current` is the one on screen. */
  questions?: { index: number; question: string; suggestions: string[] }[];
  current?: number;
  /** Done: the rewritten prompt on screen. */
  rewrite?: string;
  /** Replies: the chat summary and the suggested replies. */
  summary?: string;
  replies?: { index: number; label: string; text: string }[];
  /** Text typed into the field before the mic went on. */
  typed: string;
  transcript: string;
}

export type VoiceCommand = 'insert' | 'undo' | 'skip' | 'cancel' | 'start_over' | 'rescan';

export interface VoiceIntent {
  intent: 'edit_prompt' | 'answer_questions' | 'reply' | 'new_draft' | 'command';
  command: VoiceCommand | null;
  /** edit_prompt: the change to make, as a clean written instruction. */
  instruction: string;
  /** Clean written text: the new draft, the reply, or a single answer. */
  text: string;
  /** answer_questions: answers by question index. */
  answers: { index: number; answer: string }[];
  /** A picked suggestion (asking) or reply (replies), by index; null if none. */
  pick: number | null;
  /** A few words for the "Heard:" line, e.g. "Add: TypeScript, no role section". */
  heard: string;
}

/** Content → background: summarise the chat and suggest replies (empty field). */
export interface SuggestRequest {
  type: 'suggest';
  input: ImproveInput;
}

export type SuggestResponse = Result<ReplyAssist>;

/** Extra steering for the rewrite call. */
export interface RewriteOptions {
  /** Classified by the gap analysis; the rewriter follows it unless clearly wrong. */
  mode?: DraftMode;
  domain?: Domain;
  scale?: Scale;
  expert?: string | null;
  /** User setting; defaults to 'full'. Follow-ups and quick drafts are concise regardless. */
  depth?: Depth;
  /** A previous rewrite to revise instead of regenerating. */
  previous?: string;
  /** What to change about `previous`. */
  revision?: string;
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
  options?: RewriteOptions;
}

export type BackgroundRequest = AnalyzeRequest | RewriteRequest | SuggestRequest;
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
