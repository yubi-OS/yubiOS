#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/ostree-composefs-sync.sh
#
# Ensures yubiOS systems booted via sealed Type2 UKIs and composefs are
# registered as libostree-booted systems per https://ostreedev.github.io/ostree/composefs/
# while keeping the vfat ESP (/dev/mmcblk1p1) and libostree's required symbolic link
# (`/boot/loader -> loader.1`) 100% compatible:
#   - `vfat` (required by UEFI for the ESP) cannot store symlinks (`boot/loader -> loader.1`).
#   - `libostree` (`ostree` / `rpm-ostree`) requires `/boot/loader` to be a symbolic link.
#   - Solution: move the `vfat` ESP mount to `/efi`, bind-mount `/sysroot/boot` (`ext4`,
#     which holds the real `loader -> loader.1` symlink) at `/boot`, and bind-mount
#     `/efi/EFI` onto `/boot/EFI` so both `systemd-boot`/`enroll-sb.sh` and `libostree`
#     work seamlessly.

set -euo pipefail

boot_sync() {
  local sysroot="/sysroot"
  [ -d "$sysroot" ] || exit 0

  local was_ro=0
  if findmnt -no OPTIONS /sysroot 2>/dev/null | grep -qw ro; then
    was_ro=1
    mount -o remount,rw /sysroot 2>/dev/null || true
  fi

  local csum="40cf629c9d0745d437063c082ffe47b255f1e2e7f4b4f162ef54f32da14e794f"
  local bootcsum="81203731b9d52c596bd97690fadbbbc715d10055bd98f0599cc68550edf1b686"
  if [ -r /proc/cmdline ]; then
    local cmd_cfs
    cmd_cfs="$(sed -nE 's/.*composefs\.digest=v[12]-sha(256|512)-[0-9]+:\??([0-9a-fA-F]{64}).*/\2/p' /proc/cmdline | head -n1 || true)"
    [ -z "$cmd_cfs" ] && cmd_cfs="$(sed -nE 's/.*composefs=\??([0-9a-fA-F]{64}).*/\1/p' /proc/cmdline | head -n1 || true)"
    [ -n "$cmd_cfs" ] && csum="$cmd_cfs"
  fi

  local deploy_dir=""
  local cand
  for cand in "$sysroot"/ostree/deploy/*/deploy/*.0; do
    if [ -d "$cand" ]; then
      deploy_dir="$cand"
      break
    fi
  done

  if [ -z "$deploy_dir" ]; then
    mkdir -p "$sysroot/ostree/repo/objects" "$sysroot/ostree/repo/refs/heads" "$sysroot/ostree/repo/tmp" \
      "$sysroot/ostree/deploy/default/var" "$sysroot/ostree/deploy/default/deploy"
    if [ ! -f "$sysroot/ostree/repo/config" ]; then
      cat > "$sysroot/ostree/repo/config" <<'EOF_REPO'
[core]
repo_version=1
mode=bare

[sysroot]
bootloader=none

[ex-integrity]
composefs=true
EOF_REPO
    fi
    deploy_dir="$sysroot/ostree/deploy/default/deploy/${csum}.0"
    mkdir -p "$deploy_dir/etc" "$deploy_dir/usr"
    if [ ! -f "${deploy_dir}.origin" ]; then
      cat > "${deploy_dir}.origin" <<'EOF_ORIG'
[origin]
container-image-reference=ostree-unverified-registry:docker.io/0mniteck/yubios:latest
EOF_ORIG
    fi
    mkdir -p "$sysroot/ostree/boot.1/default/${bootcsum}"
    ln -sfn "../../../deploy/default/deploy/${csum}.0" "$sysroot/ostree/boot.1/default/${bootcsum}/0"
    ln -sfn boot.1 "$sysroot/ostree/boot.1.1" 2>/dev/null || true
  fi

  # Ensure /sysroot/boot (ext4) has `loader -> loader.1` symlink and BLS entry with `options ostree=...`
  mkdir -p "$sysroot/boot/loader.1/entries" "$sysroot/boot/EFI"
  ln -sfn loader.1 "$sysroot/boot/loader"

  # If /boot is currently the vfat ESP mount (where /boot/loader is a vfat directory, not a symlink),
  # keep the vfat ESP mounted at /efi, copy its loader/entries/*.conf into /sysroot/boot/loader.1/entries/
  # with `options ostree=...`, and mount /sysroot/boot at /boot with /efi/EFI bind-mounted at /boot/EFI.
  local boot_fstype
  boot_fstype="$(findmnt -no FSTYPE /boot 2>/dev/null || true)"
  if [ "$boot_fstype" = "vfat" ]; then
    local esp_src
    esp_src="$(findmnt -no SOURCE /boot 2>/dev/null || true)"
    mkdir -p /run/yubiOS/efi
    if [ -n "$esp_src" ] && ! mountpoint -q /run/yubiOS/efi; then
      mount "$esp_src" /run/yubiOS/efi 2>/dev/null || true
    fi
    if [ -d /boot/loader/entries ]; then
      cp -a /boot/loader/entries/. "$sysroot/boot/loader.1/entries/" 2>/dev/null || true
    fi
    for econf in "$sysroot"/boot/loader.1/entries/*.conf; do
      [ -f "$econf" ] || continue
      if ! grep -q 'ostree=' "$econf"; then
        printf 'options ostree=/ostree/boot.1/default/%s/0\n' "$bootcsum" >> "$econf"
      fi
    done
    systemctl stop boot.automount 2>/dev/null || true
    umount /boot 2>/dev/null || true
    mount --bind "$sysroot/boot" /boot 2>/dev/null || true
    if mountpoint -q /run/yubiOS/efi; then
      mkdir -p /boot/EFI
      mount --bind /run/yubiOS/efi/EFI /boot/EFI 2>/dev/null || true
    fi
  fi

  python3 - "$deploy_dir" <<'PY'
import os, sys
deploy_dir = sys.argv[1]
st = os.stat(deploy_dir)
try:
    import gi
    gi.require_version("GLib", "2.0")
    from gi.repository import GLib
    builder = GLib.VariantBuilder(GLib.VariantType.new("a{sv}"))
    builder.add_value(GLib.Variant.new_dict_entry(
        GLib.Variant.new_string("composefs"),
        GLib.Variant.new_variant(GLib.Variant.new_boolean(True))
    ))
    builder.add_value(GLib.Variant.new_dict_entry(
        GLib.Variant.new_string("composefs.verity"),
        GLib.Variant.new_variant(GLib.Variant.new_boolean(True))
    ))
    devino = GLib.Variant.new_tuple([
        GLib.Variant.new_uint64(int(st.st_dev)),
        GLib.Variant.new_uint64(int(st.st_ino))
    ])
    builder.add_value(GLib.Variant.new_dict_entry(
        GLib.Variant.new_string("backing-root-device-inode"),
        GLib.Variant.new_variant(devino)
    ))
    v = builder.end()
    data = v.get_data_as_bytes().get_data()
    with open("/run/ostree-booted", "wb") as f:
        f.write(data)
except Exception:
    with open("/run/ostree-booted", "wb") as f:
        f.write(b"")
PY

  if [ "$was_ro" -eq 1 ]; then
    mount -o remount,ro /sysroot 2>/dev/null || true
  fi
}

boot_sync
