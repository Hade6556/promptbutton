// Reads the API key from the environment or a .env file, so the key never has to be typed
// into the app. Re-read on every use, so editing .env takes effect without a restart.
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Candidate .env locations: the project (when run from source) and the user's home. */
export function dotEnvPaths(): string[] {
  return [path.join(app.getAppPath(), '.env'), path.join(os.homedir(), '.promptbutton.env')];
}

export function readDotEnv(): Record<string, string> {
  for (const file of dotEnvPaths()) {
    try {
      return parseDotEnv(fs.readFileSync(file, 'utf8'));
    } catch {
      // try the next location
    }
  }
  return {};
}

export type KeySource = 'settings' | 'env' | 'dotenv' | 'none';

/** The key the app should use and where it came from. Saved settings win, then env, then .env. */
export function resolveApiKey(saved: string | null): { key: string | undefined; source: KeySource } {
  if (saved) return { key: saved, source: 'settings' };
  const env = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (env) return { key: env, source: 'env' };
  const dotenv = readDotEnv().ANTHROPIC_API_KEY;
  if (dotenv && dotenv.startsWith('sk-ant-')) return { key: dotenv, source: 'dotenv' };
  return { key: undefined, source: 'none' };
}
