#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS SSH key enrollment via FIDO2 ed25519-sk (resident key)
#
# Protocol: FIDO2 via /dev/hidraw* (libfido2)
# ed25519-sk: private key stays on U2F/HSM; stub + pubkey stored on disk.
# -O resident: credential stored in U2F/HSM FIDO2 internal storage.
# Recovery: ssh-keygen -K regenerates stub from U2F/HSM on any new machine.
#
# Source: https://www.openssh.com/txt/release-8.2 (OpenSSH 8.2 FIDO2 support)
# Source: libfido2 v1.16.0 hidraw communication
# Requires: OpenSSH >= 8.2, U2F/HSM firmware >= 5.2.3, libfido2 >= 1.10

set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

export HOME="${HOME:-/root}"
SSH_DIR="${HOME}/.ssh"
KEY_FILE="${SSH_DIR}/id_ed25519_sk"
mkdir -p "$SSH_DIR" && chmod 700 "$SSH_DIR"

if [[ -f "$KEY_FILE" ]]; then
  yubiOS_warn "Existing key at $KEY_FILE. Skipping. Delete it first to re-enroll."
  exit 0
fi

yubiOS_log "Generating ed25519-sk resident key (touch U2F/HSM twice when prompted)..."
yubiOS_log "First touch: create credential. Second touch: verify."

# -O resident: store discoverable credential on U2F/HSM (limited slots)
# -O verify-required: require FIDO2 PIN on every use (not just touch)
# -O application: namespaced so credential is identifiable on the key
# Source: ssh-keygen(1) man page, OpenSSH 8.3+
ssh-keygen -t ed25519-sk \
  -O resident \
  -O verify-required \
  -O application=ssh:yubiOS \
  -f "$KEY_FILE" \
  -C "yubiOS@$(hostname --fqdn 2>/dev/null || hostname)"

chmod 600 "${KEY_FILE}" "${KEY_FILE}.pub"

echo ""
echo "SSH key generated: $KEY_FILE"
echo ""
echo "Your public key (add to remote ~/.ssh/authorized_keys):"
echo ""
cat "${KEY_FILE}.pub"
echo ""
echo "Copy to remote hosts:"
echo "  ssh-copy-id -i ${KEY_FILE}.pub user@hostname"
echo ""
echo "On a new machine, recover stub from U2F/HSM:"
echo "  ssh-keygen -K"
echo ""
echo "GitHub: Settings -> SSH Keys -> New -> paste the public key above."
