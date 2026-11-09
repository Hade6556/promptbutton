// Types shared by the Electron main process and the panel renderer.
import type { Depth, GapReport, ReplyAssist, Result, UserAnswer, VoiceIntent } from '../src/messaging';
import type { AskMode } from '../src/llm/config';

export interface Settings {
  apiKey: string | null;
  askMode: AskMode;
  /** full: task-like drafts become a full master prompt. concise: tighten only. */
  depth: Depth;
  /** macOS NSWindowSharingNone / Windows WDA_EXCLUDEFROMCAPTURE: the panel is invisible to screen sharing. */
  hideFromCapture: boolean;
}

export type Phase =
  | 'hidden'
  | 'capturing'
  | 'analyzing'
  | 'asking'
  | 'rewriting'
  | 'done'
  /** Empty field: summary of the chat + suggested replies. */
  | 'replies'
  | 'error'
  | 'notice'
  | 'settings';

export type DraftSource = 'field' | 'selection' | 'none';

export interface PanelState {
  phase: Phase;
  appName?: string;
  source?: DraftSource;
  draft?: string;
  report?: GapReport | null;
  asked?: boolean;
  text?: string;
  assist?: ReplyAssist;
  error?: string;
  notice?: string;
  /** Offer "select all and paste" after a copy-only insert. */
  offerForcePaste?: boolean;
  settings?: Settings;
  hotkey?: string;
}

export type RendererAction =
  | { type: 'answers'; answers: UserAnswer[] }
  | { type: 'skip' }
  | { type: 'accept'; text: string }
  /** Put a suggested/typed reply into the (empty) field. */
  | { type: 'reply'; text: string }
  | { type: 'copy'; text: string }
  | { type: 'forcePaste' }
  /** Re-run the rewrite with an extra instruction typed into the input box. */
  | { type: 'refine'; note: string }
  | { type: 'cancel' }
  /** Re-read the screen and run again, ignoring the cached result. */
  | { type: 'refresh' }
  | { type: 'openSettings' }
  | { type: 'saveSettings'; settings: Settings }
  /** Voice input: start or stop transcribing the microphone into the field. */
  | { type: 'dictate'; on: boolean }
  /** Voice: remember the box as it is, so the change about to be applied can be undone. */
  | { type: 'voiceSnapshot' }
  /** Voice: put the box back as it was before the last voice-applied change. */
  | { type: 'undoVoice' }
  /** Voice: the user dictated a new request; run the whole pipeline on it as the draft. */
  | { type: 'voiceDraft'; text: string };

/** Main → renderer while voice input runs. */
export type DictationEvent =
  | { type: 'listening' }
  /** Listening ended on a pause; the final text follows. */
  | { type: 'stopping' }
  | { type: 'level'; level: number }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; error: string };

export interface PbApi {
  getState(): Promise<PanelState>;
  onState(callback: (state: PanelState) => void): () => void;
  onDictation(callback: (event: DictationEvent) => void): () => void;
  /** What the spoken words mean in the box's current state. */
  interpretVoice(transcript: string, typed: string, questionIndex: number): Promise<Result<VoiceIntent>>;
  send(action: RendererAction): void;
  /** Ask the window to fit this content height (px). */
  resize(height: number): void;
  /** Let clicks fall through to the app underneath when the pointer is off the pill/card. */
  setMouseThrough(ignore: boolean): void;
}

declare global {
  interface Window {
    pb: PbApi;
  }
}
