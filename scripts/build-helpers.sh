#!/usr/bin/env bash
# Builds the two Swift helpers as universal binaries (Apple Silicon and Intel) for macOS 13 or later.
# macOS 13 is the floor because the x86_64 link fails against older targets with this toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
mkdir -p desktop/bin
for arch in arm64 x86_64; do
  xcrun swiftc -O -target "$arch-apple-macos13" -o "$tmp/axhelper-$arch" desktop/native/axhelper.swift
  xcrun swiftc -O -target "$arch-apple-macos13" -o "$tmp/dictate-$arch" desktop/native/dictate.swift \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker desktop/native/dictate-Info.plist
done
for bin in axhelper dictate; do lipo -create -output "desktop/bin/$bin" "$tmp/$bin-arm64" "$tmp/$bin-x86_64"; done
lipo -info desktop/bin/axhelper desktop/bin/dictate
