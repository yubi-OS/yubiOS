#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS TOTP enrollment via ykman oath
# Stores TOTP secret in U2F/HSM OATH applet (hidraw).
# Usage: yubiOS-enroll-totp <name> <secret-uri>
#   e.g: yubiOS-enroll-totp "GitHub" "otpauth://totp/..."
# Source: https://docs.yubico.com/software/yubikey-manager/yubikey-manager-manual.html
set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

wait_for_u2f_hsm

ACCOUNT="${1:-}"
URI="${2:-}"

if [[ -z "$ACCOUNT" || -z "$URI" ]]; then
  echo "Usage: yubiOS-enroll-totp <account-name> <otpauth-uri>"
  echo "  e.g: yubiOS-enroll-totp \"GitHub\" \"otpauth://totp/GitHub:user@example.com?secret=BASE32...\""
  exit 1
fi

yubiOS_log "Adding TOTP account: $ACCOUNT"
ykman oath accounts uri "$URI"
yubiOS_log "Done. List accounts: ykman oath accounts list"
# SC2027/SC2086: escape inner quotes so $ACCOUNT is properly quoted
yubiOS_log "Get code:            ykman oath accounts code \"$ACCOUNT\""
