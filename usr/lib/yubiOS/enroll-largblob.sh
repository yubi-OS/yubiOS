#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS FIDO2 Large Blob enrollment — store credential metadata on U2F/HSM
#
# FIDO2 Large Blob (CTAP 2.1) stores up to ~4KB of user data in the
# authenticator's Large Blob Array. yubiOS uses this to:
#   - Store the SSH public key stub (for recovery on a new machine)
#   - Store the PAM U2F credential handle hash (for auditing)
#
# Requires: libfido2 >= 1.12 (fido2-token -B support)
#           U2F/HSM firmware >= 5.5.0 (Large Blob support)
# Source: https://fidoalliance.org/specs/fido-v2.1-ps-20210615/ s12
# Source: https://github.com/Yubico/libfido2 — fido2-token(1) -B flag
set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

FIDO2_DEV=$(detect_fido2_device)
SSH_PUB="${HOME}/.ssh/id_ed25519_sk.pub"

# Verify Large Blob support
yubiOS_log "Checking Large Blob support..."
if ! fido2-token -I "$FIDO2_DEV" 2>/dev/null | grep -q "largeBlobs"; then
  yubiOS_die "U2F/HSM does not support Large Blob (requires firmware >= 5.5.0)"
fi

BLOB_DATA="{}"
if [[ -f "$SSH_PUB" ]]; then
  SSH_KEY=$(cat "$SSH_PUB")
  BLOB_DATA="{\"ssh_pub\":\"$SSH_KEY\",\"enrolled_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  yubiOS_log "Including SSH public key in Large Blob..."
fi

TMPBLOB="$(mktemp)"
# SC2064: use single quotes so $TMPBLOB expands at signal time, not at trap registration
trap 'rm -f "$TMPBLOB"' EXIT
echo "$BLOB_DATA" > "$TMPBLOB"

yubiOS_log "Writing Large Blob (touch U2F/HSM)..."
fido2-token -B set "$FIDO2_DEV" "$TMPBLOB"

yubiOS_log "Large Blob written successfully."
echo ""
echo "To read back from any machine with this U2F/HSM:"
echo "  fido2-token -B get \$(fido2-token -L | awk 'NR==1{print \$1}')"
