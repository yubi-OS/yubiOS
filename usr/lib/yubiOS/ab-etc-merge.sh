#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-only
# yubiOS LVM Activation, /usr A/B 3-Way OverlayFS Mount, and yubios-root Mount
#
# Hierarchy:
#   - /dev/mapper/crypt (LUKS2)
#     - LVM VG 'lvm':
#       * /dev/lvm/usr_a       (1%VG)  : mounted at /run/yubiOS/ab/usr-a (rw)
#       * /dev/lvm/usr_b       (1%VG)  : mounted at /run/yubiOS/ab/usr-b (rw)
#       * /dev/lvm/yubios-root (96%VG) : mounted at /var/home (rw) for systemd-homed
#       * 2%VG unallocated at end
#
# Mounts a 3-way upper/lower/work OverlayFS directly onto /usr (NOT on /):
#   - lowerdir : /run/yubiOS/ab/usr-b/lower:/run/yubiOS/ab/usr-base
#   - upperdir : /run/yubiOS/ab/usr-a/upper
#   - workdir  : /run/yubiOS/ab/usr-a/work

set -euo pipefail

if [ ! -e /dev/mapper/crypt ]; then
  exit 0
fi

USR_A="/dev/lvm/usr_a"
USR_B="/dev/lvm/usr_b"
YUBIOS_ROOT_LV="/dev/lvm/yubios-root"

for _ in $(seq 1 15); do
  lvm vgchange -ay lvm >/dev/null 2>&1 || true
  udevadm settle --timeout=5 >/dev/null 2>&1 || true
  if [ -b "$USR_A" ] && [ -b "$USR_B" ]; then
    break
  fi
  sleep 1
done

if [ ! -b "$USR_A" ] || [ ! -b "$USR_B" ]; then
  exit 0
fi

mkdir -p /run/yubiOS/ab/usr-a /run/yubiOS/ab/usr-b /run/yubiOS/ab/usr-base

if ! mountpoint -q /run/yubiOS/ab/usr-a; then
  mount -o rw "$USR_A" /run/yubiOS/ab/usr-a 2>/dev/null || exit 0
fi

if ! mountpoint -q /run/yubiOS/ab/usr-b; then
  mount -o rw "$USR_B" /run/yubiOS/ab/usr-b 2>/dev/null || exit 0
fi

mkdir -p /run/yubiOS/ab/usr-a/upper /run/yubiOS/ab/usr-a/lower /run/yubiOS/ab/usr-a/work
mkdir -p /run/yubiOS/ab/usr-b/upper /run/yubiOS/ab/usr-b/lower /run/yubiOS/ab/usr-b/work

if [ "$(findmnt -n -o FSTYPE /usr 2>/dev/null || true)" != "overlay" ]; then
  if ! mountpoint -q /run/yubiOS/ab/usr-base; then
    mount --bind /usr /run/yubiOS/ab/usr-base
    mount -o remount,ro,bind /run/yubiOS/ab/usr-base 2>/dev/null || true
  fi
  mount -t overlay overlay     -o "lowerdir=/run/yubiOS/ab/usr-b/lower:/run/yubiOS/ab/usr-base,upperdir=/run/yubiOS/ab/usr-a/upper,workdir=/run/yubiOS/ab/usr-a/work"     /usr
fi

if [ -b "$YUBIOS_ROOT_LV" ]; then
  mkdir -p /var/home
  if ! mountpoint -q /var/home; then
    mount "$YUBIOS_ROOT_LV" /var/home 2>/dev/null || true
  fi
  if [ ! -e /home ] && [ ! -L /home ]; then
    ln -s var/home /home
  fi
fi

# Ensure authselect-apply-changes cannot overwrite yubiOS PAM system-auth/password-auth
# (which otherwise strips pam_systemd_home.so from login on tty1/kmsconvt and causes
# user@<uid>.service's (sd-pam) helper to broadcast the YubiKey PIN prompt to serial wall).
if [ -f /usr/lib/pam.d/yubiOS-system-auth ]; then
  for pam_target in /etc/pam.d/system-auth /etc/pam.d/password-auth; do
    if [ -L "$pam_target" ] || ! grep -q "pam_systemd_home.so" "$pam_target" 2>/dev/null; then
      rm -f "$pam_target"
      cp /usr/lib/pam.d/yubiOS-system-auth "$pam_target"
    fi
  done
fi
