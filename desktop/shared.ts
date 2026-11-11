// Types shared by the Electron main process and the panel renderer.
import type { Depth, DiscussAction, GapReport, ReplyAssist, Result, UserAnswer, VoiceIntent } from '../src/messaging';
import type { AskMode } from '../src/llm/config';

export interface Settings {
  /** Advanced: the user's own Anthropic key, used directly instead of their account. */
  apiKey: string | null;
  /** Signed-in account: Claude calls go through our server and count against the plan. */
  account: { email: string; token: string } | null;
  askMode: AskMode;
  /** full: task-like drafts become a full master prompt. concise: tighten only. */
  depth: Depth;
  /** macOS NSWindowSharingNone / Windows WDA_EXCLUDEFROMCAPTURE: the panel is invisible to screen sharing. */
  hideFromCapture: boolean;
  /** The first-run setup that was completed; 0 = never. Bumped when setup gains a step everyone must see. */
  onboarded: number;
  /** A user-chosen global shortcut (Electron accelerator), or null for the defaults. */
  shortcut: string | null;
  /** The settings pane open last, restored next time. */
  lastPane: SetupPane;
  /** The app version that ran last, to notice an update (macOS may want permissions granted again). */
  lastVersion: string | null;
}

/** Settings window panes, in toolbar order. */
export type SetupPane = 'general' | 'prompts' | 'account' | 'permissions' | 'about';
/** First-run steps, in order. */
export type OnboardingStep = 'welcome' | 'permissions' | 'account' | 'try' | 'done';

export type PermissionKind = 'accessibility' | 'screen' | 'microphone';
/** 'restart': switched on in System Settings, but macOS applies it only after the app restarts. */
export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restart' | 'unsupported';
export type Permissions = Record<PermissionKind, PermissionStatus>;

/** Everything the settings / setup window shows. Secrets never reach it (see publicSettings in main.ts). */
export interface SetupState {
  view: 'onboarding' | 'settings';
  step: OnboardingStep;
  pane: SetupPane;
  platform: string;
  version: string;
  settings: Settings;
  accountScreen: AccountScreen;
  accountError?: string;
  permissions: Permissions;
  /** Required access was lost after setup: the window opened by itself to fix it. */
  revoked: boolean;
  /** Set when access went missing right after an update from this version. */
  updatedFrom: string | null;
  shortcut: { keys: string[][]; label: string; custom: boolean; recording: boolean; error?: string };
  /** The shortcut was pressed while this window had focus (ms timestamp), for the practice step. */
  shortcutPressedAt: number | null;
  openAtLogin: boolean;
}

export type SetupAction =
  | { type: 'step'; step: OnboardingStep }
  | { type: 'pane'; pane: SetupPane }
  | { type: 'finishOnboarding' }
  | { type: 'restartOnboarding' }
  | { type: 'requestPermission'; permission: PermissionKind }
  | { type: 'openPermissionPane'; permission: PermissionKind }
  /** Clear macOS's record for this app (a stale switch that looks on but is not) and ask again. */
  | { type: 'resetPermission'; permission: PermissionKind }
  | { type: 'relaunch' }
  | { type: 'prefs'; prefs: Partial<Pick<Settings, 'askMode' | 'depth' | 'hideFromCapture'>> }
  | { type: 'openAtLogin'; on: boolean }
  | { type: 'recordShortcut'; on: boolean }
  | { type: 'setShortcut'; accelerator: string | null }
  | { type: 'account'; action: AccountAction }
  | { type: 'open'; target: 'site' | 'privacy' | 'terms' | 'support' }
  | { type: 'close' }
  | { type: 'quit' };

/** Account actions both surfaces send: the panel's inline card and the settings window. */
export type AccountAction = Extract<
  RendererAction,
  { type: 'requestCode' | 'verifyCode' | 'changeEmail' | 'signOut' | 'upgrade' | 'manageBilling' | 'ownKeyMode' | 'saveOwnKey' }
>;

export type Phase =
  | 'hidden'
  | 'capturing'
  | 'analyzing'
  | 'asking'
  | 'rewriting'
  | 'done'
  /** The draft is already a finished prompt: say so instead of rewriting it again. */
  | 'ready'
  /** Empty field: summary of the chat + suggested replies. */
  | 'replies'
  | 'error'
  | 'notice'
  | 'settings';

export type DraftSource = 'field' | 'selection' | 'none';

/** The signed-in account as the server reports it. */
export interface AccountView {
  email: string;
  plan: 'trial' | 'pro';
  status: string | null;
  percentUsed: number;
  /** Unix seconds when a Pro allowance resets. */
  resetsAt: number | null;
  held: boolean;
  canUpgrade: boolean;
  canManage: boolean;
}

/** What the account screen shows. */
export interface AccountScreen {
  mode: 'signin' | 'code' | 'account' | 'ownKey';
  email?: string;
  account?: AccountView | null;
  /** A saved own key exists (the key itself never reaches the panel). */
  hasOwnKey?: boolean;
  /** One line under the account, e.g. "Finish checkout in your browser". */
  note?: string;
  working?: boolean;
}

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
  /** Phase 'ready': one line on why the draft needs no rewrite. */
  readyReason?: string;
  /** The latest exchange about the prompt on screen. `action` is null while the reply is being written. */
  chat?: { user: string; reply: string; action: DiscussAction | null } | null;
  /** The editor is working out its reply. */
  talking?: boolean;
  settings?: Settings;
  accountScreen?: AccountScreen;
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
  /** Say something about the prompt on screen (typed or spoken): the editor revises, defends or answers. */
  | { type: 'chat'; text: string }
  /** After the editor defended the prompt: change it anyway, or keep it. */
  | { type: 'chatDecision'; change: boolean }
  /** Phase 'ready': rewrite although the prompt is already good, optionally with what to change. */
  | { type: 'improveAnyway'; note?: string }
  | { type: 'cancel' }
  /** Re-read the screen and run again, ignoring the cached result. */
  | { type: 'refresh' }
  | { type: 'openSettings' }
  | { type: 'saveSettings'; settings: Settings }
  /** Account screen. */
  | { type: 'requestCode'; email: string }
  | { type: 'verifyCode'; code: string }
  | { type: 'changeEmail' }
  | { type: 'signOut' }
  | { type: 'upgrade' }
  | { type: 'manageBilling' }
  | { type: 'ownKeyMode'; on: boolean }
  | { type: 'saveOwnKey'; key: string | null }
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
  /** process.platform of the app: 'darwin' or 'win32'. */
  platform: string;
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
  /** The settings / setup window. */
  setup: {
    get(): Promise<SetupState>;
    onState(callback: (state: SetupState) => void): () => void;
    send(action: SetupAction): void;
    /** Ask the window to fit this content height (px). */
    resize(height: number): void;
  };
}

declare global {
  interface Window {
    pb: PbApi;
  }
}
