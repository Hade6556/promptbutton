#!/usr/bin/env bash
# Builds release/PimpMyPrompt-<version>-universal.dmg (Apple Silicon and Intel in one file).
# With a "Developer ID Application" certificate in the keychain it signs with it, and it also notarizes
# when APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are set. Without one it signs ad hoc,
# which Apple Silicon requires to launch at all; Gatekeeper then asks users to approve the first launch.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run desktop:build            # main, preload, renderer (and host-only helpers, replaced next)
bash scripts/build-helpers.sh    # universal helpers
args=(--mac dmg --universal --publish never)
if security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "Signing with a Developer ID certificate."
  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    args+=(-c.mac.notarize=true)
  else
    echo "No APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID: signed but not notarized."
  fi
else
  echo "No Developer ID certificate: signing with the self-signed identity, or ad hoc without one (build/after-pack.cjs)."
  bash scripts/make-signing-identity.sh
  export PMP_ADHOC=1
  args+=(-c.mac.identity=null)
fi
npx electron-builder "${args[@]}"
