#!/usr/bin/env bash
# Uploads release/Firstry-Setup-<version>.exe to the VPS, points /download/Firstry-Setup.exe at it,
# and adds a "windows" entry to /download/latest.json (the macOS entry is kept as it is).
#   npm run release:upload:win
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-root@firstry.ai}"
root="${DEPLOY_ROOT:-/var/www/promptbutton}"
version="$(node -p "require('./package.json').version")"
file="Firstry-Setup-$version.exe"
exe="release/$file"
[[ -f "$exe" ]] || { echo "Missing $exe. Run: npm run desktop:dist:win" >&2; exit 1; }
bytes="$(stat -f %z "$exe" 2>/dev/null || stat -c %s "$exe")"
sha="$(shasum -a 256 "$exe" | cut -d' ' -f1)"
ssh "$host" "mkdir -p '$root/download'"
rsync -t --partial "$exe" "$host:$root/download/$file.part"
ssh "$host" "cd '$root/download' && mv '$file.part' '$file' && chmod 644 '$file' && ln -sfn '$file' Firstry-Setup.exe"
# Merge on the server so the macOS entry written by upload-release.sh is untouched. Written last.
ssh "$host" "python3 - '$root/download/latest.json' <<PY
import json, sys, os, datetime
path = sys.argv[1]
data = json.load(open(path)) if os.path.exists(path) else {}
data['windows'] = {'version': '$version', 'file': '$file', 'url': '/download/Firstry-Setup.exe', 'bytes': $bytes,
  'sha256': '$sha', 'arch': 'x64+arm64', 'minimumWindows': '10', 'signing': 'unsigned',
  'published': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}
tmp = path + '.tmp'
json.dump(data, open(tmp, 'w'))
os.chmod(tmp, 0o644)
os.replace(tmp, path)
PY"
echo "Published $file ($bytes bytes, unsigned) at https://firstry.ai/download/Firstry-Setup.exe"
