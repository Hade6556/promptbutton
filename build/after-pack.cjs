// Signs the merged universal app when no Developer ID certificate is available (PMP_ADHOC=1).
//
// Preferred: the self-signed identity from scripts/make-signing-identity.sh. It gives every release
// the same designated requirement (bundle id + certificate), so macOS keeps the user's Accessibility
// and Screen Recording switches across updates. Without it the app is signed ad hoc: it runs, but
// its identity is its own hash, so every update orphans those permissions.
// electron-builder 26 does neither by itself, and an unsigned or broken-seal app that was downloaded
// is reported by Apple Silicon Macs as "damaged" instead of offering Open Anyway.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CERT_NAME = 'Pimp My Prompt Self-Signed';
const KEYCHAIN_PASSWORD = 'pimp-my-prompt-signing';
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options });

/** SHA-1 of the self-signed certificate, or null when the identity has not been created on this machine. */
function selfSignedIdentity(keychain) {
  if (!fs.existsSync(keychain)) return null;
  try {
    const out = run('security', ['find-certificate', '-c', CERT_NAME, '-Z', keychain]);
    return out.match(/SHA-1 hash:\s*([0-9A-F]{40})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

exports.default = async function afterPack(context) {
  if (process.env.PMP_ADHOC !== '1' || context.electronPlatformName !== 'darwin') return;
  if (context.arch !== 4) return; // Arch.universal: sign only the merged app, not the per-arch halves
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const keychain = path.join(process.env.PMP_SIGNING_DIR || path.join(os.homedir(), '.pimpmyprompt'), 'signing.keychain-db');
  const identity = selfSignedIdentity(keychain);

  // The Swift helpers are plain executables under Resources, which --deep does not sign: do them first,
  // so they carry the same identity as the app that runs them.
  const bin = path.join(app, 'Contents', 'Resources', 'app.asar.unpacked', 'desktop', 'bin');
  const helpers = fs.existsSync(bin) ? fs.readdirSync(bin).map((name) => path.join(bin, name)) : [];
  const signAll = (id) => {
    for (const helper of helpers) run('codesign', ['--force', '--sign', id, helper], { stdio: 'inherit' });
    run('codesign', ['--force', '--deep', '--sign', id, app], { stdio: 'inherit' });
  };

  // No hardened runtime here: it only matters for notarization, which needs a Developer ID anyway, and
  // codesign --deep would not pass the microphone entitlement down to the voice helper.
  if (!identity) {
    console.warn('\n  ! No self-signed identity (npm run desktop:identity): signing ad hoc.\n  ! Users will have to grant Accessibility again after every update.\n');
    signAll('-');
  } else {
    // codesign only finds identities in keychains on the search list: add ours for the duration.
    const before = run('security', ['list-keychains', '-d', 'user']).split('\n').map((l) => l.trim().replace(/^"|"$/g, '')).filter(Boolean);
    run('security', ['unlock-keychain', '-p', KEYCHAIN_PASSWORD, keychain]);
    run('security', ['list-keychains', '-d', 'user', '-s', ...before, keychain]);
    try {
      signAll(identity);
    } finally {
      run('security', ['list-keychains', '-d', 'user', '-s', ...before]);
    }
    console.log(`  • signed with "${CERT_NAME}" (${identity.slice(0, 8)}…): permissions survive updates`);
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  console.log(`  • ${run('codesign', ['-d', '-r-', app], { stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop()}`);
};
