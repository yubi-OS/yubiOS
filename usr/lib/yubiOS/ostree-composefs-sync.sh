#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/ostree-composefs-sync.sh
#
# Ensures yubiOS systems booted via sealed Type2 UKIs and composefs are
# registered as libostree-booted systems per https://ostreedev.github.io/ostree/composefs/
# while keeping the vfat ESP (/dev/mmcblk1p1) and libostree's required symbolic link
# (`/boot/loader -> loader.1`) 100% compatible:
#   - `vfat` (required by UEFI for the ESP) cannot store symlinks (`boot/loader -> loader.1`).
#   - `systemd-gpt-auto-generator` sets up `boot.automount` (`autofs`) + `boot.mount` (`vfat`)
#     on `/boot`, which would shadow `/sysroot/boot/loader` with a `vfat` directory.
#   - `libostree` (`ostree` / `rpm-ostreed`) requires:
#       1. `/boot/loader` to be a symbolic link (`loader -> loader.1`),
#       2. `/boot/loader/entries/ostree-1.conf` with `options ostree=/ostree/boot.1/default/<bootcsum>/0`,
#       3. `/sysroot/ostree/boot.1` to be a symbolic link to `boot.1.1` (and `boot.1.1` to be the directory),
#       4. `/sysroot/ostree/repo` to hold a valid `<csum>.commit` object for deployment 0, and
#       5. `/run/ostree-booted` to hold the serialized `a{sv}` GVariant with `backing-root-device-inode`.
#   - Solution: mount the `vfat` ESP at `/run/yubiOS/efi`, runtime-mask and stop `boot.automount`
#     and `boot.mount`, bind-mount `/sysroot/boot` (`ext4`) at `/boot`, and bind-mount
#     `/run/yubiOS/efi/EFI` (`vfat`) at `/boot/EFI`.

set -euo pipefail

boot_sync() {
  local sysroot="/sysroot"
  [ -d "$sysroot" ] || exit 0

  local was_ro=0
  if findmnt -no OPTIONS /sysroot 2>/dev/null | grep -qw ro; then
    was_ro=1
    mount -o remount,rw /sysroot 2>/dev/null || true
  fi
  if ! touch "$sysroot/.yubios-rw-probe" 2>/dev/null; then
    was_ro=0
    mkdir -p /run/yubiOS/ephemeral-sysroot
    if ! mountpoint -q "$sysroot" 2>/dev/null; then
      mount --bind /run/yubiOS/ephemeral-sysroot "$sysroot" 2>/dev/null || true
    fi
  else
    rm -f "$sysroot/.yubios-rw-probe" 2>/dev/null || true
  fi

  local os_version="45"
  if [ -r /etc/os-release ]; then
    os_version="$(. /etc/os-release && printf '%s' "${OSTREE_VERSION:-${VERSION_ID:-45}}")"
  fi
  local bootcsum="81203731b9d52c596bd97690fadbbbc715d10055bd98f0599cc68550edf1b686"

  mkdir -p "$sysroot/ostree/repo" "$sysroot/ostree/deploy/default/var" "$sysroot/ostree/deploy/default/deploy"
  if [ ! -f "$sysroot/ostree/repo/config" ]; then
    ostree --repo="$sysroot/ostree/repo" init --mode=bare
  fi
  ostree --repo="$sysroot/ostree/repo" config set sysroot.bootloader none

  local csum=""
  csum="$(ostree --repo="$sysroot/ostree/repo" rev-parse yubios/latest 2>/dev/null || true)"
  if [ -z "$csum" ] || ! ostree --repo="$sysroot/ostree/repo" show "$csum" >/dev/null 2>&1; then
    ostree --repo="$sysroot/ostree/repo" config set ex-integrity.composefs false 2>/dev/null || true
    mkdir -p /run/yubiOS/ostree-empty-tree/usr /run/yubiOS/ostree-empty-tree/etc
    csum="$(ostree --repo="$sysroot/ostree/repo" commit -b yubios/latest \
      --tree=dir=/run/yubiOS/ostree-empty-tree \
      --subject="yubiOS composefs deployment" \
      --add-metadata-string="version=${os_version}")"
    rm -rf /run/yubiOS/ostree-empty-tree
  fi
  ostree --repo="$sysroot/ostree/repo" config set ex-integrity.composefs true

  local cand
  for cand in "$sysroot"/ostree/deploy/default/deploy/*.0; do
    [ -e "$cand" ] || continue
    if [ "$cand" != "$sysroot/ostree/deploy/default/deploy/${csum}.0" ]; then
      rm -rf "$cand" "${cand}.origin"
    fi
  done

  local deploy_dir="$sysroot/ostree/deploy/default/deploy/${csum}.0"
  mkdir -p "$deploy_dir/etc" "$deploy_dir/usr"
  cat > "${deploy_dir}.origin" <<EOF_ORIG
[origin]
refspec=yubios/latest
EOF_ORIG

  # In libostree, ostree/boot.1 MUST be a symlink to boot.1.1, and ostree/boot.1.1 is the directory
  if [ -d "$sysroot/ostree/boot.1" ] && [ ! -L "$sysroot/ostree/boot.1" ]; then
    rm -rf "$sysroot/ostree/boot.1" "$sysroot/ostree/boot.1.1"
  fi
  if [ -L "$sysroot/ostree/boot.1.1" ]; then
    rm -f "$sysroot/ostree/boot.1.1"
  fi
  mkdir -p "$sysroot/ostree/boot.1.1/default/${bootcsum}"
  ln -sfn "../../../deploy/default/deploy/${csum}.0" "$sysroot/ostree/boot.1.1/default/${bootcsum}/0"
  ln -sfn boot.1.1 "$sysroot/ostree/boot.1"

  # Trigger boot.automount if /boot is currently an untriggered autofs mount
  if findmnt -rn -o FSTYPE /boot 2>/dev/null | grep -qx 'autofs' && ! findmnt -rn -t vfat /boot >/dev/null 2>&1; then
    ls /boot >/dev/null 2>&1 || true
  fi

  mkdir -p /run/yubiOS/efi
  if findmnt -rn -t vfat /boot >/dev/null 2>&1 && ! mountpoint -q /run/yubiOS/efi; then
    mount --bind /boot /run/yubiOS/efi 2>/dev/null || true
  fi
  if ! mountpoint -q /run/yubiOS/efi; then
    local esp_src=""
    esp_src="$(findmnt -rn -t vfat -o SOURCE /boot 2>/dev/null | head -n1 || true)"
    if [ -z "$esp_src" ]; then
      esp_src="$(systemctl show -p What --value boot.mount 2>/dev/null || true)"
    fi
    if [ -z "$esp_src" ] || [ ! -e "$esp_src" ]; then
      if [ -b /dev/disk/by-designator/esp ]; then
        esp_src="$(readlink -f /dev/disk/by-designator/esp)"
      else
        esp_src="$(blkid -t PARTTYPE=c12a7328-f81f-11d2-ba4b-00a0c93ec93b -o device 2>/dev/null | head -n1 || true)"
      fi
    fi
    if [ -n "$esp_src" ] && [ -e "$esp_src" ]; then
      mount -t vfat "$esp_src" /run/yubiOS/efi 2>/dev/null || mount "$esp_src" /run/yubiOS/efi 2>/dev/null || true
    fi
  fi

  mkdir -p "$sysroot/boot/loader.1/entries" "$sysroot/boot/EFI"
  if [ -d "$sysroot/boot/loader" ] && [ ! -L "$sysroot/boot/loader" ]; then
    rm -rf "$sysroot/boot/loader"
  fi
  ln -sfn loader.1 "$sysroot/boot/loader"

  local uki_rel="/EFI/Linux/bootc/bootc_composefs-${csum}.efi"
  if mountpoint -q /run/yubiOS/efi && [ -d /run/yubiOS/efi/loader/entries ]; then
    cp -a /run/yubiOS/efi/loader/entries/. "$sysroot/boot/loader.1/entries/" 2>/dev/null || true
    local uki_line
    uki_line="$(grep -h '^uki ' /run/yubiOS/efi/loader/entries/*.conf 2>/dev/null | head -n1 | awk '{print $2}' || true)"
    [ -n "$uki_line" ] && uki_rel="$uki_line"
  fi

  cat > "$sysroot/boot/loader.1/entries/ostree-1.conf" <<EOF_BLS
title yubiOS ${os_version} (bootc, uki)
version 1
options ostree=/ostree/boot.1/default/${bootcsum}/0
uki ${uki_rel}
EOF_BLS

  # Runtime-mask and stop boot.automount + boot.mount so vfat never shadows /boot/loader
  if findmnt -rn -o FSTYPE /boot 2>/dev/null | grep -qE '^(vfat|autofs)$' || systemctl is-active -q boot.automount 2>/dev/null || systemctl is-active -q boot.mount 2>/dev/null; then
    systemctl mask --runtime boot.automount boot.mount 2>/dev/null || true
    systemctl stop boot.mount boot.automount 2>/dev/null || true
    local _i
    for _i in 1 2 3 4; do
      if findmnt -rn -o FSTYPE /boot 2>/dev/null | grep -qE '^(vfat|autofs)$'; then
        umount -l /boot 2>/dev/null || true
      else
        break
      fi
    done
  fi

  if ! findmnt -rn /boot >/dev/null 2>&1 || findmnt -rn -o FSTYPE /boot 2>/dev/null | grep -qE '^(vfat|autofs)$'; then
    mount --bind "$sysroot/boot" /boot
  fi
  if mountpoint -q /run/yubiOS/efi && [ -d /run/yubiOS/efi/EFI ]; then
    mkdir -p /boot/EFI
    if ! findmnt -rn /boot/EFI >/dev/null 2>&1; then
      mount --bind /run/yubiOS/efi/EFI /boot/EFI
    fi
  fi

  python3 - "$deploy_dir" <<'PY'
import os, sys
from gi.repository import GLib
st = os.stat(sys.argv[1])
v = GLib.Variant("a{sv}", {
    "composefs": GLib.Variant("b", True),
    "composefs.verity": GLib.Variant("b", True),
    "backing-root-device-inode": GLib.Variant("(tt)", (int(st.st_dev), int(st.st_ino))),
})
with open("/run/ostree-booted", "wb") as f:
    f.write(v.get_data_as_bytes().get_data())
PY

  if [ "$was_ro" -eq 1 ]; then
    mount -o remount,ro /sysroot 2>/dev/null || true
  fi
}

boot_sync
