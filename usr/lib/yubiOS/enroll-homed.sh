#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-only
# yubiOS First-Boot User Home Enrollment via systemd-homed + U2F/HSM FIDO2
#
# Creates a FIDO2-unlocked LUKS2 home directory for the primary user inside the
# /dev/lvm/yubios-root (96%VG) LVM logical volume under /dev/mapper/crypt.
#
# Usage:
#   yubiOS-enroll-homed [username]

set -euo pipefail

USERNAME="${1:-yubios}"
STORAGE="luks"
FS_TYPE="btrfs"
DISK_SIZE="${YUBIOS_HOMED_SIZE:-95%}"
MEMBER_OF="wheel"

log() { echo "[yubiOS] $*"; }
die() { echo "[yubiOS] ERROR: $*" >&2; exit 1; }

if ! systemctl is-active --quiet systemd-homed.service; then
  log "Starting systemd-homed.service..."
  systemctl start systemd-homed.service
fi

if homectl inspect "$USERNAME" &>/dev/null; then
  die "Homed user '$USERNAME' already exists. Use 'homectl update $USERNAME' to modify."
fi

# Ensure the LVM yubios-root LV (/dev/lvm/yubios-root) under /dev/mapper/crypt is mounted at /var/home (/home)
if [ -e /dev/mapper/crypt ]; then
  lvm vgchange -ay lvm >/dev/null 2>&1 || true
  if [ -b /dev/lvm/yubios-root ]; then
    mkdir -p /var/home
    if ! mountpoint -q /var/home; then
      mount /dev/lvm/yubios-root /var/home
    fi
  fi
fi

log "Waiting for U2F/HSM... (plug it in now)"
for _ in $(seq 1 30); do
  if ykman list 2>/dev/null | grep -q .; then
    log "U2F/HSM detected."
    break
  fi
  if fido2-token -L 2>/dev/null | grep -q .; then
    log "FIDO2 token detected."
    break
  fi
  sleep 1
done

HOME_IMAGE_PATH="/home/${USERNAME}.home"
log "Creating homed home for $USERNAME"
log "  Storage : $STORAGE (LUKS2 on /dev/lvm/yubios-root -> $HOME_IMAGE_PATH)"
log "  FS      : $FS_TYPE"
log "  Size    : $DISK_SIZE"
log "  Groups  : $MEMBER_OF"
log ""
log "A recovery key will be printed. Write it down and store offline."
log "Do NOT continue until the recovery key is safely stored."
echo ""
read -r -p "Ready? [Y/n]: " confirm
if [[ "${confirm:-Y}" =~ ^[Nn]$ ]]; then
  die "Aborted by user."
fi

homectl create "$USERNAME"   --storage="$STORAGE"   --image-path="$HOME_IMAGE_PATH"   --fs-type="$FS_TYPE"   --disk-size="$DISK_SIZE"   --member-of="$MEMBER_OF"   --recovery-key=yes   --fido2-device=auto   --fido2-with-client-pin=yes   --fido2-with-user-presence=yes

log "Verifying enrollment..."
homectl inspect "$USERNAME"

mkdir -p /var/lib/yubiOS
touch /var/lib/yubiOS/.homed-enrolled
log "Homed enrollment complete for '$USERNAME'."
log "Test unlock with: homectl authenticate $USERNAME"
