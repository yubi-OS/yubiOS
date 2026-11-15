#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS A/B /usr (usr-a + usr-b) + LUKS2 / 3-way merge helper.
#
# Architecture (docs/SPEC.md s4.2-4.3, ADR-003/006/007/010/012/013, 0pointer-mastery):
#   - /usr A (LABEL=yubiOS_usr_a) and /usr B (LABEL=yubiOS_usr_b) are the two
#     read-only A/B OS image slots.
#   - /dev/mapper/yubios-root (unlocked from LABEL=yubiOS-luks via YubiKey FIDO2
#     in dracut initramfs) holds the persistent encrypted state:
#       * /etc (reconciled via 3-way merge of old-slot /usr/etc base, new-slot
#         /usr/etc target, and local /etc modifications),
#       * /var (persistent state across A/B switches),
#       * /var/lib/yubiOS/ab-merge/ (active slot tracker + baseline snapshots).
set -euo pipefail

AB_ROOT="/run/yubiOS/ab"
LUKS_MAPPER="/dev/mapper/yubios-root"
LUKS_MNT="/run/yubiOS/luks-root"

mkdir -p "$AB_ROOT/usr-a" "$AB_ROOT/usr-b" "$LUKS_MNT"

if [ -b /dev/disk/by-label/yubiOS_usr_a ] && ! mountpoint -q "$AB_ROOT/usr-a" 2>/dev/null; then
  mount -o ro /dev/disk/by-label/yubiOS_usr_a "$AB_ROOT/usr-a" 2>/dev/null || true
fi
if [ -b /dev/disk/by-label/yubiOS_usr_b ] && ! mountpoint -q "$AB_ROOT/usr-b" 2>/dev/null; then
  mount -o ro /dev/disk/by-label/yubiOS_usr_b "$AB_ROOT/usr-b" 2>/dev/null || true
fi

if [ ! -b "$LUKS_MAPPER" ] && [ -b /dev/disk/by-label/yubiOS-luks ]; then
  /usr/lib/systemd/systemd-cryptsetup attach yubios-root /dev/disk/by-label/yubiOS-luks none fido2-device=auto,fido2-with-client-pin=yes,fido2-with-user-presence=yes || true
fi

if [ -b "$LUKS_MAPPER" ]; then
  if ! mountpoint -q "$LUKS_MNT" 2>/dev/null; then
    mount "$LUKS_MAPPER" "$LUKS_MNT" 2>/dev/null || true
  fi
  if mountpoint -q "$LUKS_MNT" 2>/dev/null; then
    mkdir -p "$LUKS_MNT/etc" "$LUKS_MNT/var" "$LUKS_MNT/var/lib/yubiOS/ab-merge/etc-base" "$LUKS_MNT/var/lib/yubiOS/ab-merge/conflicts"
    ACTIVE_SLOT="a"
    if [ -f "$LUKS_MNT/var/lib/yubiOS/ab-merge/active-slot" ]; then
      ACTIVE_SLOT="$(cat "$LUKS_MNT/var/lib/yubiOS/ab-merge/active-slot")"
    fi
    VENDOR_ETC="/usr/etc"
    [ -d "$VENDOR_ETC" ] || VENDOR_ETC="/etc"
    if [ "$ACTIVE_SLOT" = "b" ] && [ -d "$AB_ROOT/usr-b/etc" ]; then
      VENDOR_ETC="$AB_ROOT/usr-b/etc"
    elif [ -d "$AB_ROOT/usr-a/etc" ]; then
      VENDOR_ETC="$AB_ROOT/usr-a/etc"
    fi
    BASE_ETC="$LUKS_MNT/var/lib/yubiOS/ab-merge/etc-base"
    LOCAL_ETC="$LUKS_MNT/etc"

    python3 - "$BASE_ETC" "$VENDOR_ETC" "$LOCAL_ETC" "$LUKS_MNT/var/lib/yubiOS/ab-merge/conflicts" <<'PYEOF'
import os, sys, shutil, filecmp, subprocess

base_dir, new_dir, local_dir, conflict_dir = sys.argv[1:5]

if not os.listdir(local_dir):
    shutil.copytree(new_dir, local_dir, symlinks=True, dirs_exist_ok=True)
if not os.listdir(base_dir):
    shutil.copytree(new_dir, base_dir, symlinks=True, dirs_exist_ok=True)

for root, dirs, files in os.walk(new_dir):
    rel = os.path.relpath(root, new_dir)
    b_root = os.path.join(base_dir, rel) if rel != "." else base_dir
    l_root = os.path.join(local_dir, rel) if rel != "." else local_dir
    os.makedirs(l_root, exist_ok=True)
    for fn in files:
        n_path = os.path.join(root, fn)
        b_path = os.path.join(b_root, fn)
        l_path = os.path.join(l_root, fn)
        if os.path.islink(n_path):
            if not os.path.lexists(l_path):
                os.symlink(os.readlink(n_path), l_path)
            continue
        if not os.path.exists(l_path):
            shutil.copy2(n_path, l_path)
        elif os.path.exists(b_path) and not os.path.islink(l_path):
            if filecmp.cmp(b_path, l_path, shallow=False):
                if not filecmp.cmp(b_path, n_path, shallow=False):
                    shutil.copy2(n_path, l_path)
            elif not filecmp.cmp(b_path, n_path, shallow=False) and not filecmp.cmp(l_path, n_path, shallow=False):
                r = subprocess.run(["diff3", "-m", l_path, b_path, n_path], capture_output=True)
                if r.returncode == 0:
                    with open(l_path, "wb") as wf:
                        wf.write(r.stdout)
                else:
                    c_out = os.path.join(conflict_dir, rel.replace("/", "_") + "_" + fn)
                    shutil.copy2(l_path, c_out)

shutil.rmtree(base_dir, ignore_errors=True)
shutil.copytree(new_dir, base_dir, symlinks=True, dirs_exist_ok=True)
PYEOF
  fi
fi
