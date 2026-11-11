#!/usr/bin/env bash
# Creates the self-signed code-signing identity that every Mac release is signed with.
#
# Why: macOS ties the Accessibility and Screen Recording switches to an app's signature. An ad-hoc
# signature is different for every build, so each update silently orphaned the user's permission
# (the switch still looked on). A certificate, even a self-signed one, gives every build the same
# identity ("this bundle id, signed by this certificate"), so permissions survive updates. It is not
# a Developer ID: Gatekeeper still asks for "Open Anyway" on first launch.
#
# The key lives in its own keychain, outside the repo: ~/.pimpmyprompt/signing.keychain-db.
# KEEP THAT FOLDER. If the key is lost, the next release has a new identity and every user has to
# grant the permissions once more. Run once per build machine:  npm run desktop:identity
set -euo pipefail
dir="${PMP_SIGNING_DIR:-$HOME/.pimpmyprompt}"
keychain="$dir/signing.keychain-db"
name="Pimp My Prompt Self-Signed"
pass="pimp-my-prompt-signing" # protects nothing by itself: the keychain file is the secret, kept at 0600 in a 0700 folder

if [[ -f "$keychain" ]] && security find-certificate -c "$name" "$keychain" >/dev/null 2>&1; then
  echo "Signing identity already exists: $keychain"
  exit 0
fi
mkdir -p "$dir" && chmod 700 "$dir"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/cert.conf" <<CONF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $name
O = Pimp My Prompt
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CONF
# 20 years: an expired certificate would change nothing for installed copies, but new builds need a valid one.
openssl req -x509 -newkey rsa:2048 -nodes -days 7300 -keyout "$tmp/key.pem" -out "$tmp/cert.pem" -config "$tmp/cert.conf" 2>/dev/null
openssl pkcs12 -export -legacy -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -name "$name" -out "$tmp/id.p12" -passout "pass:$pass" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -name "$name" -out "$tmp/id.p12" -passout "pass:$pass"
security create-keychain -p "$pass" "$keychain"
security set-keychain-settings "$keychain"            # no auto-lock
security unlock-keychain -p "$pass" "$keychain"
security import "$tmp/id.p12" -k "$keychain" -P "$pass" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$pass" "$keychain" >/dev/null
chmod 600 "$keychain"
echo "Created signing identity \"$name\" in $keychain"
echo "Back this folder up: $dir"
