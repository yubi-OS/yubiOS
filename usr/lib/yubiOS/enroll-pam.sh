#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS PAM U2F enrollment for sudo and login
#
# Protocol: FIDO2/U2F via /dev/hidraw* (libfido2)
# pam-u2f >= 1.3.1 required (CVE-2025-23013 partial auth bypass)
# Source: https://www.yubico.com/support/security-advisories/ysa-2025-01/
#
# pamu2fcfg generates a credential handle + public key for the user.
# Stored in /etc/yubico/u2f_keys (central, root-owned).
# Format: username:credentialHandle,publicKey,...
# Source: https://github.com/Yubico/pam-u2f (pam-u2f 1.4.0 docs)

set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

# Verify pam-u2f is >= 1.3.1
check_pam_u2f_version

TARGET_USER="${SUDO_USER:-${1:-$(logname 2>/dev/null || id -un)}}"

yubiOS_log "Enrolling U2F for user: $TARGET_USER"
yubiOS_log "Touch U2F/HSM when the LED flashes..."

mkdir -p /etc/yubico && touch /etc/yubico/u2f_keys && chmod 600 /etc/yubico/u2f_keys

# -u: specify username in output
# -r: resident key (stores handle on U2F/HSM for portability)
# -N: no PIN prompt during registration (PIN required at AUTH time via pam module)
# Append to central authfile
pamu2fcfg -u "$TARGET_USER" -N >> /etc/yubico/u2f_keys

echo ""
echo "PAM U2F enrolled for $TARGET_USER."
echo ""
echo "sudo now requires U2F/HSM touch."
echo "Test it in a new terminal before closing this session:"
echo "  sudo whoami"
echo ""
echo "IMPORTANT: If sudo fails and you are locked out:"
echo "  1. Boot with rd.break karg (edit in UEFI boot menu)"
echo "  2. mount -o remount,rw /sysroot"
echo "  3. Edit /sysroot/etc/pam.d/sudo — comment out pam_u2f line"
echo "  4. Reboot and re-enroll with a working U2F/HSM"
