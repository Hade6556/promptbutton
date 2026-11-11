#!/usr/bin/env bash
# Uploads release/PimpMyPrompt-<version>-universal.dmg to the VPS, points /download/PimpMyPrompt.dmg at it,
# then writes /download/latest.json, which the site reads to show the version and size. The JSON goes up
# last, so the page never advertises a file that is not there yet.
#   npm run release:upload
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-root@72.61.138.63}"
root="${DEPLOY_ROOT:-/var/www/promptbutton}"
version="$(node -p "require('./package.json').version")"
file="PimpMyPrompt-$version-universal.dmg"
dmg="release/$file"
app="release/mac-universal/Pimp My Prompt.app"
[[ -f "$dmg" ]] || { echo "Missing $dmg. Run: npm run desktop:dist" >&2; exit 1; }
bytes="$(stat -f %z "$dmg")"
sha="$(shasum -a 256 "$dmg" | cut -d' ' -f1)"
# Read the signature once: piping codesign into "grep -q" fails under pipefail when grep exits early.
signature="$(codesign -dv --verbose=2 "$app" 2>&1 || true)"
case "$signature" in
  *"Authority=Developer ID Application"*) signing=developer-id ;;
  *"Authority=Pimp My Prompt Self-Signed"*) signing=self-signed ;;
  *) signing=ad-hoc ;;
esac
if xcrun stapler validate "$dmg" >/dev/null 2>&1; then notarized=true; else notarized=false; fi
cat > release/latest.json <<JSON
{"version":"$version","file":"$file","url":"/download/PimpMyPrompt.dmg","bytes":$bytes,"sha256":"$sha","arch":"universal","minimumMacOS":"13.0","signing":"$signing","notarized":$notarized,"published":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON
ssh "$host" "mkdir -p '$root/download'"
rsync -t --partial "$dmg" "$host:$root/download/$file.part"
ssh "$host" "cd '$root/download' && mv '$file.part' '$file' && chmod 644 '$file' && ln -sfn '$file' PimpMyPrompt.dmg"
# Keep the Windows entry that upload-release-win.sh added: this file only describes the Mac build.
rsync -t release/latest.json "$host:$root/download/latest.mac.json"
ssh "$host" "python3 - '$root/download' <<'PY'
import json, os, sys
d = sys.argv[1]
new = json.load(open(os.path.join(d, 'latest.mac.json')))
try:
    old = json.load(open(os.path.join(d, 'latest.json')))
    if 'windows' in old: new['windows'] = old['windows']
except Exception:
    pass
tmp = os.path.join(d, 'latest.json.tmp')
json.dump(new, open(tmp, 'w'))
os.chmod(tmp, 0o644)
os.replace(tmp, os.path.join(d, 'latest.json'))
os.remove(os.path.join(d, 'latest.mac.json'))
PY"
echo "Published $file ($bytes bytes, $signing, notarized=$notarized) at https://pimpmypromt.ai/download/PimpMyPrompt.dmg"
