// Types shared by the Electron main process and the panel renderer.
import type { GapReport, ReplyAssist, UserAnswer } from '../src/messaging';
import type { AskMode } from '../src/llm/config';

export interface Settings {
  apiKey: string | null;
  askMode: AskMode;
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
  | { type: 'openSettings' }
  | { type: 'saveSettings'; settings: Settings };

export interface PbApi {
  getState(): Promise<PanelState>;
  onState(callback: (state: PanelState) => void): () => void;
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
