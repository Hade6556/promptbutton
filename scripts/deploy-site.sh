#!/usr/bin/env bash
# Deploys the landing page to the VPS: site/index.html and site/assets/ only.
# site/stage/ is capture tooling and stays local; /download/ on the server (the DMG) is left untouched.
#
#   npm run site:deploy
#   DEPLOY_HOST=root@other.host DEPLOY_ROOT=/var/www/promptbutton npm run site:deploy
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-root@72.61.138.63}"
root="${DEPLOY_ROOT:-/var/www/promptbutton}"
rsync -rltz --delete \
  --include='/index.html' --include='/assets/' --include='/assets/**' --exclude='*' \
  site/ "$host:$root/"
echo "Deployed to https://pimpmypromt.ai/ (http://${host#*@}/)"
