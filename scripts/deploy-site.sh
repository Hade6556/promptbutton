#!/usr/bin/env bash
# Deploys the website to the VPS: the landing page, legal pages, Stripe return pages and assets.
# site/stage/ is capture tooling and stays local; /download/ on the server (the DMG) is left untouched.
#
#   npm run site:deploy
#   DEPLOY_HOST=root@other.host DEPLOY_ROOT=/var/www/promptbutton npm run site:deploy
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-root@72.61.138.63}"
root="${DEPLOY_ROOT:-/var/www/promptbutton}"
rsync -rltz --delete \
  --include='/index.html' --include='/privacy.html' --include='/terms.html' --include='/sources.html' \
  --include='/assets/' --include='/assets/**' --include='/billing/' --include='/billing/**' --exclude='*' \
  site/ "$host:$root/"
echo "Deployed to https://pimpmypromt.ai/ (http://${host#*@}/)"
