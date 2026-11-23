#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS GPG/OpenPGP applet enrollment
# Generates an Ed25519 signing key and moves subkeys to U2F/HSM OpenPGP applet.
# Key material stays on the U2F/HSM after transfer.
# Source: https://github.com/drduh/YubiKey-Guide
# Source: https://www.gnupg.org/documentation/manuals/gnupg/
set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

wait_for_u2f_hsm

if ! command -v gpg &>/dev/null; then
  yubiOS_die "gnupg2 not installed. Run: dnf install -y gnupg2"
fi

NAME="${1:-${USER}}"
EMAIL="${2:-${USER}@$(hostname -f 2>/dev/null || hostname)}"

yubiOS_log "Generating GPG master key for $NAME <$EMAIL>..."
# Generate offline master + signing subkey on U2F/HSM
gpg --batch --gen-key <<KEYGEN
  Key-Type: eddsa
  Key-Curve: Ed25519
  Key-Usage: sign
  Subkey-Type: ecdh
  Subkey-Curve: Curve25519
  Subkey-Usage: encrypt
  Name-Real: ${NAME}
  Name-Email: ${EMAIL}
  Expire-Date: 2y
  %no-protection
KEYGEN

FINGERPRINT=$(gpg --list-keys --with-colons "$EMAIL" | awk -F: '/^fpr/{print $10; exit}')
yubiOS_log "Key fingerprint: $FINGERPRINT"

yubiOS_log "Moving signing subkey to U2F/HSM OpenPGP applet..."
yubiOS_log "Touch U2F/HSM when prompted."
gpg --command-fd=0 --status-fd=1 --edit-key "$FINGERPRINT" <<CMDS
key 1
keytocard
1
save
CMDS

yubiOS_log "Git: configure commit signing"
git config --global user.signingkey "$FINGERPRINT"
git config --global commit.gpgsign true
git config --global gpg.program gpg

echo ""
echo "GPG key enrolled on U2F/HSM."
echo "Public key (add to GitHub/GitLab):"
gpg --armor --export "$EMAIL"
