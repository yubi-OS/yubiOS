#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS shared library: detection, logging, gating functions

# SC2034: export so sourcing scripts can use these constants
export YUBIOS_STATE_DIR=/var/lib/yubiOS
export YUBICOS_U2F_KEYS=/etc/yubico/u2f_keys
export YUBIOS_PIV_SLOT="${YUBIOS_PIV_SLOT:-9a}"   # PIV Authentication slot 9a for Secure Boot (ADR-002)
export YUBIOS_PKCS11_LIB="${YUBIOS_PKCS11_LIB:-/usr/lib64/libykcs11.so}"

yubiOS_log() { echo "[yubiOS] $*"; }
yubiOS_warn() { echo "[yubiOS WARN] $*" >&2; }
yubiOS_die() { echo "[yubiOS ERROR] $*" >&2; exit 1; }

# Detect first available FIDO2 device via libfido2
# Source: fido2-token -L lists hidraw paths
# Source: https://github.com/Yubico/libfido2
detect_fido2_device() {
  local dev
  dev=$(fido2-token -L 2>/dev/null | awk -F: 'NR==1{print $1}' | tr -d ' ')
  if [[ -z "$dev" ]]; then
    yubiOS_die "No FIDO2 device found. Plug in your YubiKey and try again."
  fi
  echo "$dev"
}

# Wait for YubiKey to appear on hidraw
wait_for_yubikey() {
  yubiOS_log "Waiting for YubiKey... (plug it in now)"
  local attempts=0
  while ! fido2-token -L 2>/dev/null | grep -q /dev/hidraw; do
    sleep 1
    attempts=$((attempts+1))
    [[ $attempts -gt 30 ]] && yubiOS_die "Timed out waiting for YubiKey."
  done
  yubiOS_log "YubiKey detected."
}

# Verify pam-u2f version >= 1.3.1 (CVE-2025-23013 fix)
# Source: https://www.yubico.com/support/security-advisories/ysa-2025-01/
check_pam_u2f_version() {
  local ver
  ver=$(rpm -q pam-u2f --queryformat '%{VERSION}' 2>/dev/null || \
       dpkg-query -W -f='${Version}' pam-u2f 2>/dev/null || echo 0)
  # Require >= 1.3.1
  if [[ "$(printf '%s\n%s' "1.3.1" "$ver" | sort -V | head -1)" != "1.3.1" ]]; then
    yubiOS_die "pam-u2f version $ver is < 1.3.1. Update before enrolling (CVE-2025-23013)."
  fi
}

# Detect root LUKS2 partition
# SC2140/SC1078: use single-quoted -c to prevent shellcheck parsing Python as shell
detect_luks2_partition() {
  lsblk -J -o NAME,FSTYPE,MOUNTPOINT 2>/dev/null | \
    python3 -c '
import sys,json
d=json.load(sys.stdin)
def find(devs):
    for b in devs:
        if b.get("fstype") == "crypto_LUKS" and b.get("mountpoint") in (None, ""):
            print("/dev/" + b["name"])
            return
        find(b.get("children", []))
find(d["blockdevices"])
'
}

# Enforce CTAP 2.1 minimum PIN length (CTAP 2.1 minPinLength extension)
# YubiKey 5.4+ supports minPinLength; enforced locally as a policy gate.
# Source: CTAP 2.1 spec s7.2.3, https://fidoalliance.org/specs/fido-v2.1-ps-20210615/
check_fido2_pin_length() {
  local min_len="${1:-8}"
  local device
  device=$(detect_fido2_device)
  local info
  info=$(fido2-token -I "$device" 2>/dev/null || echo "")
  local current_len
  current_len=$(echo "$info" | awk '/minPinLength/{print $2}' | head -1)
  if [[ -n "$current_len" && "$current_len" -lt "$min_len" ]]; then
    yubiOS_die "FIDO2 PIN too short ($current_len < $min_len). Set a longer PIN: ykman fido access change-pin"
  fi
}

# Multi-user PAM enrollment: add another user to /etc/yubico/u2f_keys
enroll_pam_user() {
  local target_user="${1:-}"
  [[ -z "$target_user" ]] && yubiOS_die "Usage: enroll_pam_user <username>"
  yubiOS_log "Enrolling PAM U2F for $target_user (touch YubiKey twice)..."
  pamu2fcfg -u "$target_user" -N >> /etc/yubico/u2f_keys
  yubiOS_log "Done. Test: sudo -u $target_user whoami"
}
