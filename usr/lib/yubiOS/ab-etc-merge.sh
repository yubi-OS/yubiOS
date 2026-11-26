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
    mount -o noatime,noinit_itable "$YUBIOS_ROOT_LV" /var/home 2>/dev/null \
      || mount "$YUBIOS_ROOT_LV" /var/home 2>/dev/null || true
  fi
  if [ ! -e /home ] && [ ! -L /home ]; then
    ln -s var/home /home
  fi
fi

# Prevent RTC-less cold-boot clock skew (e.g. ROCK 5B resetting to TIME_EPOCH 00:00:00 UTC)
# from placing /var/home/*.home superblocks or homed identity records in the "future", which
# otherwise forces e2fsck inside systemd-homework activate to scan the full 164 GiB home image.
printf '[options]\nbroken_system_clock = true\n' > /etc/e2fsck.conf 2>/dev/null || true
max_ts=0
for ref_path in /var/home /var/home/*.home /var/lib/systemd/home/*.identity; do
  [ -e "$ref_path" ] || continue
  ts="$(stat -c %Y "$ref_path" 2>/dev/null || echo 0)"
  if [ "${ts:-0}" -gt "$max_ts" ] 2>/dev/null; then
    max_ts="$ts"
  fi
done
now_ts="$(date +%s 2>/dev/null || echo 0)"
if [ "$max_ts" -gt 0 ] && [ "$now_ts" -le "$max_ts" ] 2>/dev/null; then
  date -s "@$((max_ts + 1))" >/dev/null 2>&1 || true
fi

# Purge the libfast_homed.so LD_PRELOAD drop-ins that fccd6e43/2641a872 copied into the persistent
# /etc on every boot. A same-named /etc drop-in overrides the image's /usr/lib copy, so without
# this purge an already-enrolled device would keep preloading the shim into systemd-homed,
# systemd-homework and the whole GDM process tree (fallocate>64MiB -> EOPNOTSUPP, fsck skipped,
# syncfs() stubbed, D-Bus secrets rewritten, all sd_bus_call timeouts forced to >=600s).
# The image's /usr/lib/systemd/system/systemd-homed.service.d/yubiOS-homed.conf (mkfs journal
# size only) stays authoritative.
for unit_dropin in systemd-homed.service.d gdm.service.d; do
  stale="/etc/systemd/system/${unit_dropin}/yubiOS-homed.conf"
  if [ -f "$stale" ] && grep -qE 'LD_PRELOAD|libfast_homed|assume_storage_prezeroed' "$stale" 2>/dev/null; then
    rm -f "$stale"
    rmdir "/etc/systemd/system/${unit_dropin}" 2>/dev/null || true
    YUBIOS_NEED_DAEMON_RELOAD=1
  fi
done
if [ "${YUBIOS_NEED_DAEMON_RELOAD:-0}" = 1 ]; then
  # This runs Before=systemd-homed.service, so a reload makes the purge effective this boot.
  systemctl daemon-reload >/dev/null 2>&1 || true
fi

# Ensure authselect-apply-changes cannot overwrite yubiOS PAM system-auth/password-auth
# (which otherwise strips pam_systemd_home.so from login on tty1/kmsconvt and causes
# user@<uid>.service's (sd-pam) helper to broadcast the U2F/HSM PIN prompt to serial wall).
if [ -f /usr/lib/pam.d/yubiOS-system-auth ]; then
  for pam_target in /etc/pam.d/system-auth /etc/pam.d/password-auth; do
    if [ -L "$pam_target" ] || ! cmp -s /usr/lib/pam.d/yubiOS-system-auth "$pam_target" 2>/dev/null; then
      rm -f "$pam_target"
      cp /usr/lib/pam.d/yubiOS-system-auth "$pam_target"
    fi
  done
fi

# Ensure kernel-install hooks in /etc/kernel/install.d stay synced to yubiOS's
# same-FS dracut + U2F/HSM UKI re-sign + local composefs OCI repository hooks (ADR-034),
# so a package upgrade of rpm-ostree or systemd-udev in the /usr overlay cannot
# restore the cross-device EXDEV 05-rpmostree.install scriptlet.
if [ -d /usr/lib/kernel/install.d ]; then
  mkdir -p /etc/kernel/install.d /var/lib/yubiOS/oci
  for khook in 05-rpmostree.install 95-yubios-uki-resign.install; do
    if [ -f "/usr/lib/kernel/install.d/$khook" ]; then
      cp -f "/usr/lib/kernel/install.d/$khook" "/etc/kernel/install.d/$khook"
      chmod 0755 "/etc/kernel/install.d/$khook"
    fi
  done
fi

# Keep the signed IMA custom policy (stage-ima-policy.sh) in /etc in step with the A/B /usr:
# copy /usr/lib/yubiOS/ima/ima-policy to /etc/ima/ima-policy and set its security.ima from
# ima-policy.sig.hex, but only when this boot's %:.ima holds the yubios-ima signer. Without the key
# a signed policy cannot load, and 99yubios-ima's pre-pivot guard removes it to keep PID 1's
# ima_setup() from freezing; it reinstates the file itself on the next boot that has the key.
ima_src="${YUBIOS_IMA_DIR:-/usr/lib/yubiOS/ima}/ima-policy"
ima_hex="${YUBIOS_IMA_DIR:-/usr/lib/yubiOS/ima}/ima-policy.sig.hex"
ima_dst="${YUBIOS_ETC_DIR:-/etc}/ima/ima-policy"
if [ -s "$ima_src" ] && [ -s "$ima_hex" ] && command -v keyctl >/dev/null 2>&1 \
   && keyctl list %:.ima 2>/dev/null | grep -q 'yubios-ima'; then
  mkdir -p "$(dirname "$ima_dst")"
  if ! cmp -s "$ima_src" "$ima_dst" 2>/dev/null; then
    cp -f "$ima_src" "$ima_dst"
  fi
  if command -v setfattr >/dev/null 2>&1; then
    setfattr -n security.ima -v "$(cat "$ima_hex")" "$ima_dst" 2>/dev/null || true
  fi
fi
