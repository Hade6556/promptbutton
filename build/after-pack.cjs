// Ad-hoc signs the merged universal app when no Developer ID certificate is available (PMP_ADHOC=1).
// electron-builder 26 does not ad-hoc sign by itself, and an unsigned or broken-seal app that was
// downloaded is reported by Apple Silicon Macs as "damaged" instead of offering Open Anyway.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (process.env.PMP_ADHOC !== '1' || context.electronPlatformName !== 'darwin') return;
  if (context.arch !== 4) return; // Arch.universal: sign only the merged app, not the per-arch halves
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // No hardened runtime here: it only matters for notarization, which needs a Developer ID anyway, and
  // codesign --deep would not pass the microphone entitlement down to the voice helper.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
