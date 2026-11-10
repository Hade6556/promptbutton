#!/usr/bin/env bash
# Deploys server/ to the VPS as the pimpmyprompt systemd service (runs as user pmp, Node 24).
# First run: npm run server:deploy -- --setup   (installs Node, creates the user, unit and env file)
# Secrets live in /etc/pimpmyprompt/env on the server, never in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-root@72.61.138.63}"
NODE_VERSION=24.22.1

if [[ "${1:-}" == "--setup" ]]; then
  ssh "$host" NODE_VERSION="$NODE_VERSION" bash -s <<'REMOTE'
set -euo pipefail
if ! /opt/node/bin/node --version 2>/dev/null | grep -q "v$NODE_VERSION"; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  grep " node-v$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p /opt/node && tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C /opt/node --strip-components=1
  rm -f "node-v$NODE_VERSION-linux-x64.tar.xz" SHASUMS256.txt
fi
id pmp >/dev/null 2>&1 || useradd --system --home /var/lib/pimpmyprompt --shell /usr/sbin/nologin pmp
install -d -o pmp -g pmp -m 750 /var/lib/pimpmyprompt
install -d -o root -g root -m 755 /opt/pimpmyprompt
install -d -o root -g pmp -m 750 /etc/pimpmyprompt
if [[ ! -f /etc/pimpmyprompt/env ]]; then
  umask 027
  cat > /etc/pimpmyprompt/env <<ENV
SITE_URL=https://pimpmypromt.ai
DB_PATH=/var/lib/pimpmyprompt/app.db
CODE_SECRET=$(openssl rand -hex 32)
# ANTHROPIC_API_KEY=
# RESEND_API_KEY=
# MAIL_FROM=Pimp My Prompt <signin@pimpmypromt.ai>
# STRIPE_SECRET_KEY=rk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_ID=price_...
ENV
  chgrp pmp /etc/pimpmyprompt/env
fi
cat > /etc/systemd/system/pimpmyprompt.service <<'UNIT'
[Unit]
Description=Pimp My Prompt account server
After=network-online.target
Wants=network-online.target

[Service]
User=pmp
Group=pmp
WorkingDirectory=/opt/pimpmyprompt
EnvironmentFile=/etc/pimpmyprompt/env
ExecStart=/opt/node/bin/node src/server.mts
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ReadWritePaths=/var/lib/pimpmyprompt
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable pimpmyprompt >/dev/null
echo "setup done: node $(/opt/node/bin/node --version)"
REMOTE
fi

rsync -az --delete --exclude node_modules --exclude test --exclude scripts --exclude tsconfig.json server/ "$host:/opt/pimpmyprompt/"
ssh "$host" 'cd /opt/pimpmyprompt && PATH=/opt/node/bin:$PATH npm ci --omit=dev --no-audit --no-fund --silent && systemctl restart pimpmyprompt && sleep 1 && systemctl is-active pimpmyprompt && journalctl -u pimpmyprompt -n 8 --no-pager -o cat'
