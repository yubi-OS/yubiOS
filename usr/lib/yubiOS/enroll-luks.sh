#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-only
# yubiOS Disk Encryption Enrollment (systemd-cryptenroll --fido2-device=auto)
#
# Architecture (ADR-003, ADR-012):
#   - Creates a single LUKS2 partition (yubiOS-luks) sized to 100% of the
#     remaining free space on the boot disk after the composefs partition (p2).
#   - Inside the LUKS2 volume (/dev/mapper/yubios-root), initializes an LVM2
#     Volume Group (yubios) containing:
#       * usr_a : 1%VG  (ext4 + fs-verity, /usr slot A 3-way overlay backing)
#       * usr_b : 1%VG  (ext4 + fs-verity, /usr slot B 3-way overlay backing)
#       * homed : 96%VG (btrfs, mounted at /var/home for systemd-homed)
#       * 2%VG  : left unallocated/empty at the end of the VG
#   - Enrolls an offline recovery key plus the owner's YubiKey FIDO2 token.

set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "[yubiOS] ERROR: Must run as root (use: sudo yubiOS-enroll-luks)" >&2
  exit 1
fi

find_fido2_hidraw() {
  local dev vid
  for dev in /sys/class/hidraw/hidraw*; do
    [ -e "$dev" ] || continue
    if grep -qi "1050" "$dev/device/uevent" 2>/dev/null; then
      echo "/dev/$(basename "$dev")"
      return 0
    fi
    vid="$(cat "$dev/device/../../idVendor" 2>/dev/null || true)"
    if [ "$vid" = "1050" ]; then
      echo "/dev/$(basename "$dev")"
      return 0
    fi
  done
  return 1
}

echo "[yubiOS] Waiting for YubiKey FIDO2 interface..."
for _ in $(seq 1 30); do
  if FIDO2_DEV="$(find_fido2_hidraw)"; then
    break
  fi
  sleep 1
done

if [ -z "${FIDO2_DEV:-}" ]; then
  if fido2-token -L 2>/dev/null | grep -q .; then
    FIDO2_DEV="auto"
  else
    echo "[yubiOS] ERROR: No YubiKey FIDO2 hidraw device detected." >&2
    exit 1
  fi
fi
echo "[yubiOS] Using FIDO2 device: $FIDO2_DEV"

part_dev() {
  local disk="$1" pnum="$2"
  case "$disk" in
    *[0-9]) echo "${disk}p${pnum}" ;;
    *)      echo "${disk}${pnum}" ;;
  esac
}

ensure_luks_partition() {
  local existing
  existing="$(blkid -t TYPE=crypto_LUKS -o device 2>/dev/null | head -n1 || true)"
  if [ -n "$existing" ]; then
    if [ ! -e /dev/mapper/yubios-root ] && [ -f /run/yubiOS/luks-bootstrap.key ]; then
      cryptsetup open --key-file=/run/yubiOS/luks-bootstrap.key "$existing" yubios-root >&2 2>/dev/null || true
    fi
    lvm vgchange -ay yubios >&2 2>/dev/null || true
    echo "$existing"
    return 0
  fi

  local root_src disk root_type p_luks keyfile
  root_src="$(findmnt -n -o SOURCE /sysroot 2>/dev/null || findmnt -n -o SOURCE /var 2>/dev/null || findmnt -n -o SOURCE / 2>/dev/null || true)"
  disk=""
  if [ -n "$root_src" ] && [ -b "$root_src" ]; then
    disk="$(lsblk -no PKNAME "$root_src" 2>/dev/null | head -n1 || true)"
    [ -n "$disk" ] && disk="/dev/$disk"
  fi
  if [ -z "$disk" ] || [ ! -b "$disk" ]; then
    for cand in /dev/mmcblk1 /dev/mmcblk0 /dev/vda /dev/nvme0n1 /dev/sda; do
      if [ -b "$cand" ]; then
        disk="$cand"
        break
      fi
    done
  fi
  if [ -z "$disk" ] || [ ! -b "$disk" ]; then
    echo "[yubiOS] ERROR: Cannot determine backing disk for LUKS2 + LVM provisioning." >&2
    exit 1
  fi

  case "$(uname -m)" in
    aarch64)
      root_type="b921b045-1df0-41c3-af44-4c6f280d3fae"
      ;;
    *)
      root_type="4f68bce3-e8cd-4db1-96e7-fbcaf984b709"
      ;;
  esac

  p_luks="$(part_dev "$disk" 3)"

  if [ ! -b "$p_luks" ]; then
    echo "[yubiOS] Creating yubiOS-luks partition ($p_luks) sized to 100% of remaining free space on $disk..." >&2
    printf 'type=%s, name="yubiOS-luks"\n' "$root_type" | sfdisk --append --force "$disk" >&2 || true
    partx -u "$disk" >&2 2>/dev/null || partprobe "$disk" >&2 2>/dev/null || true
    udevadm settle --timeout=10 || true
  fi

  if [ ! -b "$p_luks" ]; then
    echo "[yubiOS] ERROR: Failed to create partition $p_luks on $disk" >&2
    exit 1
  fi

  mkdir -p /run/yubiOS
  keyfile="/run/yubiOS/luks-bootstrap.key"
  dd if=/dev/urandom of="$keyfile" bs=64 count=1 status=none
  chmod 0400 "$keyfile"

  echo "[yubiOS] Formatting $p_luks as LUKS2 (on-device key generation per ADR-012)..." >&2
  cryptsetup luksFormat --batch-mode --type luks2 --label yubiOS-luks "$p_luks" "$keyfile" >&2
  cryptsetup open --key-file="$keyfile" "$p_luks" yubios-root >&2

  echo "[yubiOS] Creating LVM2 volume group 'yubios' inside /dev/mapper/yubios-root..." >&2
  lvm pvcreate -ff -y /dev/mapper/yubios-root >&2
  lvm vgcreate -y yubios /dev/mapper/yubios-root >&2

  echo "[yubiOS] Creating LVM logical volumes: usr_a (1%VG), usr_b (1%VG), homed (96%VG), leaving 2%VG empty at end..." >&2
  lvm lvcreate -y -l 1%VG -n usr_a yubios >&2
  lvm lvcreate -y -l 1%VG -n usr_b yubios >&2
  lvm lvcreate -y -l 96%VG -n homed yubios >&2
  lvm vgchange -ay yubios >&2
  udevadm settle --timeout=10 || true

  echo "[yubiOS] Formatting /dev/yubios/usr_a and /dev/yubios/usr_b (ext4 + fs-verity)..." >&2
  mkfs.ext4 -F -O verity,^has_journal -L yubiOS_usr_a /dev/yubios/usr_a >&2
  mkfs.ext4 -F -O verity,^has_journal -L yubiOS_usr_b /dev/yubios/usr_b >&2

  mkdir -p /run/yubiOS/usr-a-init /run/yubiOS/usr-b-init
  mount /dev/yubios/usr_a /run/yubiOS/usr-a-init >&2
  mkdir -p /run/yubiOS/usr-a-init/upper /run/yubiOS/usr-a-init/lower /run/yubiOS/usr-a-init/work
  umount /run/yubiOS/usr-a-init >&2

  mount /dev/yubios/usr_b /run/yubiOS/usr-b-init >&2
  mkdir -p /run/yubiOS/usr-b-init/upper /run/yubiOS/usr-b-init/lower /run/yubiOS/usr-b-init/work
  umount /run/yubiOS/usr-b-init >&2
  rmdir /run/yubiOS/usr-a-init /run/yubiOS/usr-b-init 2>/dev/null || true

  echo "[yubiOS] Formatting /dev/yubios/homed (btrfs) for systemd-homed..." >&2
  mkfs.btrfs -f -L yubiOS_homed /dev/yubios/homed >&2

  echo "$p_luks"
}

LUKS_DEV="${1:-$(ensure_luks_partition)}"
echo "[yubiOS] LUKS2 partition: $LUKS_DEV"
echo ""
echo "Enrolling YubiKey FIDO2 (PIN + touch) and generating offline recovery key for $LUKS_DEV..."
read -r -p "Continue with FIDO2 enrollment? [Y/n]: " confirm
if [[ "${confirm:-Y}" =~ ^[Nn]$ ]]; then
  echo "Aborted."
  exit 1
fi

KEYFILE_ARG=()
if [ -f /run/yubiOS/luks-bootstrap.key ]; then
  KEYFILE_ARG=(--unlock-key-file=/run/yubiOS/luks-bootstrap.key)
fi

if ! cryptsetup luksDump "$LUKS_DEV" 2>/dev/null | grep -q "systemd-recovery"; then
  echo "[yubiOS] Generating offline recovery key (store this offline on paper per ADR-003):"
  systemd-cryptenroll "${KEYFILE_ARG[@]}" --recovery-key "$LUKS_DEV"
fi

echo ""
echo "[yubiOS] Enrolling FIDO2 (enter FIDO2 PIN and touch YubiKey when prompted)..."
systemd-cryptenroll "${KEYFILE_ARG[@]}"   --fido2-device=auto   --fido2-with-client-pin=yes   --fido2-with-user-presence=yes   "$LUKS_DEV"

if [ -f /run/yubiOS/luks-bootstrap.key ]; then
  systemd-cryptenroll --wipe-slot=0 "$LUKS_DEV" 2>/dev/null || true
  rm -f /run/yubiOS/luks-bootstrap.key
fi

LUKS_UUID="$(blkid -s UUID -o value "$LUKS_DEV")"
if [ -n "$LUKS_UUID" ]; then
  echo "[yubiOS] Updating /etc/crypttab for dracut boot-time FIDO2 unlock..."
  touch /etc/crypttab
  sed -i '/^yubios-root[[:space:]]/d' /etc/crypttab
  echo "yubios-root UUID=${LUKS_UUID} none fido2-device=auto,fido2-with-client-pin=yes,fido2-with-user-presence=yes,discard" >> /etc/crypttab
fi

/usr/lib/yubiOS/ab-etc-merge.sh || true

mkdir -p /var/lib/yubiOS
touch /var/lib/yubiOS/.luks-enrolled
echo ""
echo "FIDO2 disk encryption and LVM (usr_a 1% + usr_b 1% -> /usr 3-way overlay, homed 96%, 2% empty) enrolled."
echo "On next boot: dracut will prompt for your FIDO2 PIN and YubiKey touch."
