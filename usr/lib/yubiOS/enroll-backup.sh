#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS backup U2F/HSM enrollment
# Enrolls a second U2F/HSM for all active trust anchors.
# Run after primary enrollment. Both keys will unlock the system.
set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

yubiOS_log "Backup U2F/HSM enrollment"
yubiOS_log "Insert your BACKUP U2F/HSM and press Enter."
read -rp ""

wait_for_u2f_hsm

yubiOS_log "Enrolling backup: LUKS2 FIDO2"
LUKS_PART="${1:-$(detect_luks2_partition)}"
if [[ -n "$LUKS_PART" ]]; then
  systemd-cryptenroll \
    --fido2-device=auto \
    --fido2-with-client-pin=yes \
    --fido2-with-user-presence=yes \
    "$LUKS_PART"
  yubiOS_log "Backup LUKS2 FIDO2 enrolled."
fi

yubiOS_log "Enrolling backup: PAM U2F"
TARGET_USER="${SUDO_USER:-$(logname 2>/dev/null || id -un)}"
pamu2fcfg -u "$TARGET_USER" -N >> /etc/yubico/u2f_keys
yubiOS_log "Backup PAM U2F enrolled."

echo ""
echo "Backup U2F/HSM enrolled. Test sudo with the backup key."
