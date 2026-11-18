// Updates without reinstalling (macOS). The site already publishes /download/latest.json next to the
// installer: the version, the file's name, its size and its SHA-256 (scripts/upload-release.sh).
//
// The app reads that file shortly after launch and every few hours. When it names a newer version, the
// menus offer "Update to x.y.z". Choosing it downloads the disk image, checks it, puts the new app in
// the old one's place and reopens it. Nothing is installed unless all of these hold:
//   1. the download has exactly the size and SHA-256 that latest.json gives;
//   2. the app inside is validly signed, and signed by the same certificate as the app that is running
//      (it must satisfy the running app's own designated requirement), so a file planted on the server
//      by someone without that certificate is refused;
//   3. the app inside says it is the version that was offered.
// Keeping the certificate is also what makes macOS keep the Accessibility permission across the update.
// An ad hoc build has no certificate to match, so it never updates itself: it opens the download page.
import { app, powerSaveBlocker, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions, readRelease, type Release } from './update-feed';

/** Where the newest version is announced. FIRSTTRY_UPDATE_FEED points a test build at another file. */
const FEED = process.env.FIRSTTRY_UPDATE_FEED ?? 'https://firstry.ai/download/latest.json';
/** The first check, after the app has settled. */
const FIRST_CHECK_MS = 30_000;
/** How often it looks again while running. */
const CHECK_EVERY_MS = 6 * 60 * 60_000;
/** Testing only: offer the published version even when it is the one already running. */
const FORCE = process.env.FIRSTTRY_UPDATE_FORCE === '1';

export type UpdateStatus =
  | { phase: 'none' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'installing'; version: string }
  | { phase: 'failed'; version: string; error: string };

const run = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    execFile(file, args, { maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => (error ? reject(new Error((stderr || error.message).trim())) : resolve(`${stdout}${stderr}`)));
  });

export function createUpdater(options: { bundle: string; onChange: (status: UpdateStatus) => void; log: (line: string) => void }) {
  const { bundle, onChange, log } = options;
  let status: UpdateStatus = { phase: 'none' };
  let release: Release | null = null;
  let working = false;
  const set = (next: UpdateStatus) => {
    status = next;
    onChange(status);
  };

  /** Only a packaged Mac app sitting in a folder we may write to can replace itself. */
  const canReplaceItself = () => {
    if (process.platform !== 'darwin' || !app.isPackaged || /\/AppTranslocation\/|^\/Volumes\//.test(bundle)) return false;
    try {
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  };

  /** Looks for a newer version. Quiet on failure: being offline is not an error worth showing. */
  async function check(): Promise<UpdateStatus> {
    if (working || process.platform !== 'darwin' || !app.isPackaged) return status;
    try {
      const response = await fetch(FEED, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const found = readRelease(await response.json(), FEED);
      const newer = found && (compareVersions(found.version, app.getVersion()) > 0 || (FORCE && found.version === app.getVersion()));
      release = newer ? found : null;
      if (release) log(`update: ${release.version} is available (running ${app.getVersion()})`);
      set(release ? { phase: 'available', version: release.version } : { phase: 'none' });
    } catch (error) {
      log(`update: could not check (${error instanceof Error ? error.message : String(error)})`);
    }
    return status;
  }

  async function download(to: string, wanted: Release) {
    const response = await fetch(wanted.url, { signal: AbortSignal.timeout(30 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status}).`);
    const hash = createHash('sha256');
    const file = fs.createWriteStream(to);
    let got = 0, shown = -1;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        got += chunk.length;
        if (got > wanted.bytes) throw new Error('The download is larger than it should be.');
        hash.update(chunk);
        if (!file.write(chunk)) await new Promise<void>((resolve) => file.once('drain', () => resolve()));
        const percent = Math.floor((got / wanted.bytes) * 100);
        if (percent >= shown + 5 || percent === 100) set({ phase: 'downloading', version: wanted.version, percent: (shown = percent) });
      }
    } finally {
      await new Promise<void>((resolve) => file.end(() => resolve()));
    }
    if (got !== wanted.bytes || hash.digest('hex') !== wanted.sha256) throw new Error('The download does not match the published file.');
  }

  /** The rule macOS uses to say "this is the same app from the same maker", read from the running app. */
  async function ownRequirement(): Promise<string> {
    const requirement = /designated => (.+)/.exec(await run('/usr/bin/codesign', ['-d', '-r-', bundle]))?.[1]?.trim();
    if (!requirement || /cdhash/.test(requirement) || !/certificate|anchor/.test(requirement)) throw new Error('This copy is not signed with a certificate, so it cannot check an update.');
    return requirement;
  }

  /** Downloads, checks and installs the offered version, then reopens the app. Resolves only if it failed. */
  async function install(): Promise<void> {
    const wanted = release;
    if (!wanted || working) return;
    if (!canReplaceItself()) {
      void shell.openExternal(new URL('/', FEED).toString()); // the download page
      return;
    }
    working = true;
    // A menu-bar app with nothing in front is one macOS likes to put to sleep (App Nap), which would stretch
    // this from a minute to many. Ask it not to until the update is in place or has failed.
    const awake = powerSaveBlocker.start('prevent-app-suspension');
    const began = Date.now();
    const took = () => `${Math.round((Date.now() - began) / 1000)} s`;
    const name = path.basename(bundle);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'firstry-update-'));
    const dmg = path.join(work, 'update.dmg'), mount = path.join(work, 'mount');
    const staged = path.join(path.dirname(bundle), `.${name.replace(/\.app$/, '')}.update.app`);
    let mounted = false;
    try {
      const requirement = await ownRequirement();
      set({ phase: 'downloading', version: wanted.version, percent: 0 });
      await download(dmg, wanted);
      log(`update: downloaded and matches the published file (${took()})`);
      set({ phase: 'installing', version: wanted.version });
      fs.mkdirSync(mount);
      await run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg]);
      mounted = true;
      const fresh = path.join(mount, name);
      if (!fs.existsSync(fresh)) throw new Error('The download does not contain the app.');
      // The copy in Applications is what will run, so that copy is the one checked.
      fs.rmSync(staged, { recursive: true, force: true });
      await run('/usr/bin/ditto', [fresh, staged]);
      log(`update: copied next to the app (${took()})`);
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged]);
      await run('/usr/bin/codesign', ['--verify', `-R=${requirement}`, staged]);
      const version = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(staged, 'Contents', 'Info.plist')])).trim();
      if (version !== wanted.version) throw new Error(`The download is version ${version}, not ${wanted.version}.`);
      await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => undefined);
      mounted = false;
      fs.rmSync(work, { recursive: true, force: true });
      log(`update: ${wanted.version} is signed by the same certificate (${took()}); replacing ${bundle}`);
      // A small script outlives this process: it waits for the app to quit, swaps the two folders (putting
      // the old one back if the swap fails half-way) and opens whichever is there.
      const swap = `
        i=0; while kill -0 "$1" 2>/dev/null && [ $i -lt 150 ]; do sleep 0.1; i=$((i+1)); done
        old="$2.old"; rm -rf "$old"
        if mv "$2" "$old" && mv "$3" "$2"; then rm -rf "$old"; elif [ -d "$old" ] && [ ! -d "$2" ]; then mv "$old" "$2"; fi
        rm -rf "$3"
        /usr/bin/open "$2"`;
      const { ELECTRON_RUN_AS_NODE: _unused, ...env } = process.env;
      spawn('/bin/sh', ['-c', swap, 'sh', String(process.pid), bundle, staged], { detached: true, stdio: 'ignore', env }).unref();
      app.quit();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`update: ${wanted.version} was not installed: ${reason}`);
      if (mounted) await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => undefined);
      fs.rmSync(work, { recursive: true, force: true });
      fs.rmSync(staged, { recursive: true, force: true });
      working = false;
      powerSaveBlocker.stop(awake);
      set({ phase: 'failed', version: wanted.version, error: reason });
    }
  }

  return {
    status: () => status,
    check,
    install,
    /** Check once the app has settled, then every few hours. */
    start() {
      setTimeout(() => void check(), FIRST_CHECK_MS);
      setInterval(() => void check(), CHECK_EVERY_MS);
    },
  };
}
