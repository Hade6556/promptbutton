#!/usr/bin/env bash
# Rebuilds the whole server on a fresh Ubuntu VPS: web server, firewall rules, the account service, the
# website and the Mac download. Run it once for a new server; running it again is safe.
#
#   DEPLOY_HOST=root@203.0.113.7 npm run vps:setup
#
# It needs: root SSH access with your key, ANTHROPIC_API_KEY in .env, and release/Firstry-<version>-universal.dmg.
# Afterwards point the A record of firstry.ai at the server. Caddy then gets the certificate by itself.
# What it cannot bring back: the accounts database of a server that is gone.
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:?Set DEPLOY_HOST to the new server, e.g. DEPLOY_HOST=root@203.0.113.7}"
export DEPLOY_HOST="$host"
ip="${host#*@}"
grep -q '^ANTHROPIC_API_KEY=' .env || { echo "No ANTHROPIC_API_KEY in .env" >&2; exit 1; }

echo "== 1/6 Connect"
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$host" 'echo "connected to $(hostname), $(. /etc/os-release; echo "$PRETTY_NAME")"'

echo "== 2/6 Web server and firewall"
scp -q scripts/Caddyfile "$host:/tmp/Caddyfile"
ssh "$host" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq </dev/null
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg rsync python3 </dev/null
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq </dev/null
  apt-get install -y -qq caddy </dev/null
fi
mkdir -p /var/www/promptbutton/download
install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile && rm -f /tmp/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
systemctl enable --now caddy >/dev/null 2>&1
systemctl reload caddy
# Open the web ports if a firewall is installed. SSH is allowed first so that turning the firewall on later cannot lock you out.
if command -v ufw >/dev/null; then ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null; fi
echo "caddy $(caddy version | cut -d' ' -f1): $(systemctl is-active caddy)"
REMOTE

echo "== 3/6 Account service: Node, user, unit, settings file"
bash scripts/deploy-server.sh --setup >/dev/null
# The API key goes straight from .env into the server's settings file; it is never printed.
# Sign-in codes are written to the server log until a RESEND_API_KEY is added, as before.
grep -E '^ANTHROPIC_API_KEY=' .env | head -1 | ssh "$host" 'set -e; f=/etc/pimpmyprompt/env; tmp=$(mktemp)
grep -vE "^#? ?ANTHROPIC_API_KEY=|^MAIL_LOG_CODES=" "$f" > "$tmp"; cat >> "$tmp"
grep -q "^RESEND_API_KEY=" "$tmp" || echo "MAIL_LOG_CODES=1" >> "$tmp"
grep -q "^PMP_ADMIN_TOKEN=" "$tmp" || printf "PMP_ADMIN_TOKEN=%s\n" "$(openssl rand -hex 24)" >> "$tmp"
install -o root -g pmp -m 640 "$tmp" "$f"; rm -f "$tmp"
echo "settings on the server: $(cut -d= -f1 "$f" | grep -v "^#" | tr "\n" " ")"'

echo "== 4/6 Account service: code"
bash scripts/deploy-server.sh | tail -3

echo "== 5/6 Website"
bash scripts/deploy-site.sh

echo "== 6/6 Mac download"
bash scripts/upload-release.sh | tail -1

echo "== Checks"
echo "site over plain HTTP: $(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://$ip/")"
echo "download list: $(curl -s -m 10 "http://$ip/download/latest.json" | head -c 60)"
echo "account service: $(ssh "$host" 'curl -s -m 5 http://127.0.0.1:8787/api/health || curl -s -m 5 http://127.0.0.1:8787/health' | head -c 80)"
echo
echo "Next: point the A record of firstry.ai at $ip. HTTPS starts working a minute or two after DNS has changed."
