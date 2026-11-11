// macOS privacy permissions: what each one is for, its live status, and how to ask for it.
// Windows needs none of these, so every status reads 'unsupported' there.
import { app, desktopCapturer, shell, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import type { PermissionKind, PermissionStatus, Permissions } from './shared';

const IS_MAC = process.platform === 'darwin';

const PANES: Record<PermissionKind, string> = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
};

/** Screen Recording asked for in this process: macOS only reports a new grant after a relaunch. */
let screenRequested = false;

function media(kind: 'screen' | 'microphone'): PermissionStatus {
  const status = systemPreferences.getMediaAccessStatus(kind);
  if (status === 'granted') return 'granted';
  if (status === 'not-determined') return 'not-determined';
  // 'denied' or 'restricted'. After the user switches Screen Recording on, this process keeps
  // reporting denied until it restarts, so say "restart" rather than "denied" once we have asked.
  if (kind === 'screen' && screenRequested) return 'restart';
  return 'denied';
}

export function readPermissions(): Permissions {
  if (!IS_MAC) return { accessibility: 'unsupported', screen: 'unsupported', microphone: 'unsupported' };
  return {
    accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
    screen: media('screen'),
    microphone: media('microphone'),
  };
}

/** The one permission the app cannot work without. */
export const hasRequired = (p: Permissions) => p.accessibility === 'granted' || p.accessibility === 'unsupported';

export function openPermissionPane(kind: PermissionKind) {
  if (IS_MAC) void shell.openExternal(PANES[kind]);
}

const TCC_SERVICE: Record<PermissionKind, string> = { accessibility: 'Accessibility', screen: 'ScreenCapture', microphone: 'Microphone' };

/**
 * Removes macOS's record of this app for one permission, then asks again. This is the cure for a
 * stale record: after an update signed differently (or a copy run from another place), System
 * Settings can show the switch on while macOS refuses the app. Only the packaged app is reset;
 * in development the record belongs to Electron itself.
 */
export async function resetPermission(kind: PermissionKind, bundleId: string): Promise<void> {
  if (!IS_MAC) return;
  if (app.isPackaged) {
    await new Promise<void>((resolve) => {
      execFile('/usr/bin/tccutil', ['reset', TCC_SERVICE[kind], bundleId], (error, stdout) => {
        console.log(`[PromptButton] tccutil reset ${TCC_SERVICE[kind]} ${bundleId}: ${error ? error.message : stdout.trim()}`);
        resolve();
      });
    });
  }
  await requestPermission(kind);
}

/**
 * Ask for a permission the first way macOS allows: the system prompt when it has never been asked,
 * otherwise the matching System Settings pane (macOS never prompts twice).
 */
export async function requestPermission(kind: PermissionKind): Promise<void> {
  if (!IS_MAC) return;
  switch (kind) {
    case 'accessibility':
      // Adds the app to the Accessibility list and shows the system prompt once; the pane opens too,
      // because the prompt only offers a button to the same place.
      if (!systemPreferences.isTrustedAccessibilityClient(true)) openPermissionPane('accessibility');
      return;
    case 'screen': {
      const before = systemPreferences.getMediaAccessStatus('screen');
      screenRequested = true;
      // Any capture attempt registers the app in the Screen Recording list and shows the prompt the first time.
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => []);
      if (before !== 'not-determined') openPermissionPane('screen');
      return;
    }
    case 'microphone': {
      if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
        await systemPreferences.askForMediaAccess('microphone').catch(() => false);
      } else openPermissionPane('microphone');
      return;
    }
  }
}
