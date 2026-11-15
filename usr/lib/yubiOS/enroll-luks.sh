#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS LUKS2 disk encryption + A/B (/usr A + /usr B + 3-way /etc merge over /)
# enrollment via YubiKey FIDO2.
#
# Protocol: FIDO2 HMAC-secret extension via /dev/hidraw*
# Before enrolling the YubiKey FIDO2 credential, if the disk does not yet have
# the DPS A/B (/usr A + /usr B) + LUKS2 root (LABEL=yubiOS-luks) layout, this
# script provisions:
#   - yubiOS_usr_a (DPS /usr A slot, read-only verity-capable ext4)
#   - yubiOS_usr_b (DPS /usr B slot, standby A/B slot)
#   - yubiOS-luks  (DPS root LUKS2 container generated with an on-device key per
#     ADR-012, initialized with the 3-way /etc + /var merge tree over /)
# Then enrolls an offline recovery key + the YubiKey FIDO2 credential (PIN + touch),
# wipes the temporary bootstrap keyslot, and configures /etc/crypttab + dracut so
# every subsequent boot prompts for the YubiKey FIDO2 token in initramfs.
#
# Source: https://www.freedesktop.org/software/systemd/man/latest/systemd-cryptenroll.html
# Source: https://0pointer.net/blog/fitting-everything-together.html

set -euo pipefail
# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

FIDO2_DEV=$(detect_fido2_device)
yubiOS_log "Using FIDO2 device: $FIDO2_DEV"

part_dev() {
  local disk="$1"
  local num="$2"
  case "$disk" in
    *[0-9]) printf '%sp%s' "$disk" "$num" ;;
    *)      printf '%s%s'  "$disk" "$num" ;;
  esac
}

detect_boot_disk() {
  local src disk mnt
  for mnt in /sysroot /boot /; do
    src="$(findmnt -n -o SOURCE "$mnt" 2>/dev/null | head -n1 || true)"
    if [[ "$src" == /dev/* ]]; then
      disk="$(lsblk -no PKNAME "$src" 2>/dev/null | head -n1 || true)"
      if [[ -n "$disk" && -b "/dev/$disk" ]]; then
        echo "/dev/$disk"
        return 0
      fi
    fi
  done
  return 1
}

provision_ab_luks_layout() {
  local disk arch usr_type root_type last_part p_usra p_usrb p_luks
  disk="$(detect_boot_disk || true)"
  [[ -n "$disk" && -b "$disk" ]] || yubiOS_die "Cannot determine backing boot disk to create A/B + LUKS2 partitions."

  arch="$(uname -m)"
  if [[ "$arch" == "aarch64" ]]; then
    usr_type="b0e01050-ee5f-4390-949a-9101b17104e9"
    root_type="b921b045-1df0-41c3-af44-4c6f280d3fae"
  else
    usr_type="8484680c-9521-48c6-9c11-b0720656f69e"
    root_type="4f68bce3-e8cd-4db1-96e7-fbcaf984b709"
  fi

  yubiOS_log "Provisioning DPS A/B (/usr A + /usr B) + LUKS2 root partitions on $disk..."
  last_part="$(lsblk -ln -o NAME "$disk" | wc -l)"
  p_usra="$(part_dev "$disk" "$last_part")"
  p_usrb="$(part_dev "$disk" "$((last_part + 1))")"
  p_luks="$(part_dev "$disk" "$((last_part + 2))")"

  printf "size=4G, type=%s, name=\"yubiOS_usr_a\"\nsize=4G, type=%s, name=\"yubiOS_usr_b\"\nsize=16G, type=%s, name=\"yubiOS-luks\"\n" "$usr_type" "$usr_type" "$root_type" | sfdisk --append --force "$disk"
  partprobe "$disk" 2>/dev/null || partx --update "$disk" 2>/dev/null || true
  udevadm settle
  sleep 2

  [[ -b "$p_usra" && -b "$p_usrb" && -b "$p_luks" ]] || yubiOS_die "New partitions ($p_usra, $p_usrb, $p_luks) did not appear on $disk."

  yubiOS_log "Formatting /usr A ($p_usra) and /usr B ($p_usrb) with fs-verity support..."
  mkfs.ext4 -F -q -O verity,^has_journal -L yubiOS_usr_a "$p_usra"
  mkfs.ext4 -F -q -O verity,^has_journal -L yubiOS_usr_b "$p_usrb"

  mkdir -p /run/yubiOS/mnt-usra /run/yubiOS/mnt-usrb
  mount "$p_usra" /run/yubiOS/mnt-usra
  mkdir -p /run/yubiOS/mnt-usra/etc
  cp -a /etc/. /run/yubiOS/mnt-usra/etc/ 2>/dev/null || true
  umount /run/yubiOS/mnt-usra

  mount "$p_usrb" /run/yubiOS/mnt-usrb
  mkdir -p /run/yubiOS/mnt-usrb/etc
  cp -a /etc/. /run/yubiOS/mnt-usrb/etc/ 2>/dev/null || true
  umount /run/yubiOS/mnt-usrb

  mkdir -p /run/yubiOS
  umask 077
  dd if=/dev/urandom of=/run/yubiOS/luks-bootstrap.key bs=64 count=1 status=none

  yubiOS_log "Formatting $p_luks as LUKS2 (on-device key generation per ADR-012)..."
  cryptsetup luksFormat --batch-mode --type luks2 --label yubiOS-luks "$p_luks" /run/yubiOS/luks-bootstrap.key
  cryptsetup open --key-file=/run/yubiOS/luks-bootstrap.key "$p_luks" yubios-root
  mkfs.ext4 -F -q -O verity -L yubiOS-luks-root /dev/mapper/yubios-root

  mkdir -p /run/yubiOS/luks-root
  mount /dev/mapper/yubios-root /run/yubiOS/luks-root
  mkdir -p /run/yubiOS/luks-root/etc /run/yubiOS/luks-root/var /run/yubiOS/luks-root/var/lib/yubiOS/ab-merge/etc-base /run/yubiOS/luks-root/var/lib/yubiOS/ab-merge/conflicts
  cp -a /etc/. /run/yubiOS/luks-root/etc/ 2>/dev/null || true
  cp -a /etc/. /run/yubiOS/luks-root/var/lib/yubiOS/ab-merge/etc-base/ 2>/dev/null || true
  cp -a /var/. /run/yubiOS/luks-root/var/ 2>/dev/null || true
  printf 'a\n' > /run/yubiOS/luks-root/var/lib/yubiOS/ab-merge/active-slot
  umount /run/yubiOS/luks-root

  echo "$p_luks"
}

LUKS_PART="${1:-$(detect_luks2_partition)}"
if [[ -z "$LUKS_PART" ]]; then
  provision_ab_luks_layout
  LUKS_PART="$(detect_luks2_partition)"
fi
[[ -z "$LUKS_PART" ]] && yubiOS_die "No LUKS2 partition found. Pass device path as argument."
yubiOS_log "LUKS2 partition: $LUKS_PART"

echo ""
echo "Enrolling YubiKey FIDO2 (PIN + touch) and generating offline recovery key for $LUKS_PART..."
read -rp "Continue with FIDO2 enrollment? [Y/n]: " confirm
[[ "${confirm:-Y}" =~ ^[Nn] ]] && exit 0

UNLOCK_ARGS=()
if [[ -f /run/yubiOS/luks-bootstrap.key ]]; then
  UNLOCK_ARGS=(--unlock-key-file=/run/yubiOS/luks-bootstrap.key)
  yubiOS_log "Generating offline recovery key (store this offline on paper per ADR-003):"
  systemd-cryptenroll "${UNLOCK_ARGS[@]}" --recovery-key "$LUKS_PART" || true
fi

yubiOS_log "Enrolling FIDO2 (enter FIDO2 PIN and touch YubiKey when prompted)..."
systemd-cryptenroll \
  "${UNLOCK_ARGS[@]}" \
  --fido2-device="$FIDO2_DEV" \
  --fido2-with-client-pin=yes \
  --fido2-with-user-presence=yes \
  "$LUKS_PART"

if [[ -f /run/yubiOS/luks-bootstrap.key ]]; then
  systemd-cryptenroll --wipe-slot=password "$LUKS_PART" 2>/dev/null || true
  shred -u /run/yubiOS/luks-bootstrap.key 2>/dev/null || rm -f /run/yubiOS/luks-bootstrap.key
fi

LUKS_UUID=$(cryptsetup luksUUID "$LUKS_PART")
CRYPTTAB_LINE="yubios-root UUID=$LUKS_UUID none luks,fido2-device=auto,fido2-with-client-pin=yes,fido2-with-user-presence=yes"

update_crypttab_file() {
  local f="$1"
  touch "$f"
  if grep -q "UUID=$LUKS_UUID" "$f" 2>/dev/null; then
    sed -i "s|.*UUID=$LUKS_UUID.*|$CRYPTTAB_LINE|" "$f"
  else
    echo "$CRYPTTAB_LINE" >> "$f"
  fi
}

yubiOS_log "Updating /etc/crypttab for dracut boot-time FIDO2 unlock..."
update_crypttab_file /etc/crypttab
if [[ -b /dev/mapper/yubios-root ]]; then
  mkdir -p /run/yubiOS/luks-root
  mount /dev/mapper/yubios-root /run/yubiOS/luks-root 2>/dev/null || true
  if mountpoint -q /run/yubiOS/luks-root 2>/dev/null; then
    update_crypttab_file /run/yubiOS/luks-root/etc/crypttab
    umount /run/yubiOS/luks-root 2>/dev/null || true
  fi
fi

/usr/lib/yubiOS/ab-etc-merge.sh || true

echo ""
echo "FIDO2 disk encryption and A/B (/usr A + /usr B -> / 3-way merge) enrolled."
echo "On next boot: dracut will prompt for your FIDO2 PIN and YubiKey touch."
