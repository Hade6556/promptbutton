#!/usr/bin/env bash
# Builds release/PimpMyPrompt-Setup-<version>.exe: one installer for x64 and ARM64 Windows 10/11.
# Per-user install (no admin prompt), Start menu and desktop shortcuts, launches when done.
# Unsigned: Windows SmartScreen shows "Windows protected your PC" until it is signed;
# users click "More info", then "Run anyway". Builds on macOS or Windows; needs the .NET SDK.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run desktop:bundle             # main, preload, renderer (no macOS helpers needed)
bash scripts/build-win-helper.sh   # desktop/bin-win/winhelper.exe
npx electron-builder --win nsis --x64 --arm64 --publish never
