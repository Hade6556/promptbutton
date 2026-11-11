import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Settings } from './shared';

export const DEFAULTS: Settings = {
  apiKey: null,
  account: null,
  askMode: 'auto',
  depth: 'full',
  hideFromCapture: false,
  onboarded: 0,
  shortcut: null,
  lastPane: 'general',
  lastVersion: null,
  shareOutcomes: true,
  sharePairs: false,
};

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}
