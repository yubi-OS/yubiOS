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
FS_TYPE="${YUBIOS_HOMED_FS:-ext4}"
DISK_SIZE="${YUBIOS_HOMED_SIZE:-80%}"
MEMBER_OF="wheel"

log() { echo "[yubiOS] $*"; }
die() { echo "[yubiOS] ERROR: $*" >&2; exit 1; }

# Ensure the LVM yubios-root LV (/dev/lvm/yubios-root) under /dev/mapper/crypt is mounted at /var/home (/home)
# BEFORE starting or querying systemd-homed so systemd-homed computes Disk Ceiling from the 96%VG volume
# rather than the 8 GiB root partition.
if [ -e /dev/mapper/crypt ]; then
  lvm vgchange -ay lvm >/dev/null 2>&1 || true
  if [ -b /dev/lvm/yubios-root ]; then
    mkdir -p /var/home
    if ! mountpoint -q /var/home; then
      mount -o noatime /dev/lvm/yubios-root /var/home
    fi
    if [ ! -e /home ] && [ ! -L /home ]; then
      ln -s var/home /home
    fi
  fi
fi

# Ensure libfast_homed.so and the systemd-homed drop-in are active so large (256 GB+)
# SD cards never stall or hit homectl's 120s D-Bus timeout during home_create_luks():
#   - SYSTEMD_HOME_MKFS_OPTIONS_EXT4 skips synchronous 1 GiB journal wipe, inode-table
#     wipe, and full-device BLKDISCARD during mkfs.ext4
#   - libfast_homed.so skips redundant FITRIM / multi-GiB fallocate on newly truncated
#     sparse home images and extends homectl's D-Bus call timeout from 120s to 600s
FAST_HOMED_SO="/usr/lib/yubiOS/uki/libfast_homed.so"
if [ ! -s "$FAST_HOMED_SO" ] && command -v gcc >/dev/null 2>&1; then
  mkdir -p /run/yubiOS
  FAST_HOMED_SO="/run/yubiOS/libfast_homed.so"
  cat > /run/yubiOS/libfast_homed.c <<'EOF'
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <stdint.h>
#include <stdarg.h>
#include <sys/types.h>
#include <linux/fs.h>
int ioctl(int fd, unsigned long request, ...) {
    static int (*real_ioctl)(int, unsigned long, void *) = NULL;
    if (!real_ioctl) real_ioctl = dlsym(RTLD_NEXT, "ioctl");
    va_list ap; va_start(ap, request); void *arg = va_arg(ap, void *); va_end(ap);
    if (request == FITRIM) return 0;
    return real_ioctl(fd, request, arg);
}
int fallocate(int fd, int mode, off_t offset, off_t len) {
    static int (*real_fallocate)(int, int, off_t, off_t) = NULL;
    if (!real_fallocate) real_fallocate = dlsym(RTLD_NEXT, "fallocate");
    if (len > (off_t)(64ULL << 20)) { errno = EOPNOTSUPP; return -1; }
    return real_fallocate(fd, mode, offset, len);
}
int fallocate64(int fd, int mode, off64_t offset, off64_t len) {
    return fallocate(fd, mode, (off_t)offset, (off_t)len);
}
int sd_bus_call(void *bus, void *m, uint64_t usec, void *ret_error, void *reply) {
    static int (*real_sd_bus_call)(void *, void *, uint64_t, void *, void *) = NULL;
    if (!real_sd_bus_call) real_sd_bus_call = dlsym(RTLD_NEXT, "sd_bus_call");
    if (usec > 0 && usec < 600000000ULL) usec = 600000000ULL;
    return real_sd_bus_call(bus, m, usec, ret_error, reply);
}
EOF
  gcc -shared -fPIC -O2 /run/yubiOS/libfast_homed.c -o "$FAST_HOMED_SO" -ldl 2>/dev/null || true
  rm -f /run/yubiOS/libfast_homed.c
fi

mkdir -p /etc/systemd/system/systemd-homed.service.d
{
  echo "[Service]"
  echo 'Environment="SYSTEMD_HOME_MKFS_OPTIONS_EXT4=-E nodiscard,lazy_itable_init=1,lazy_journal_init=1,assume_storage_prezeroed=1"'
  echo 'Environment="SYSTEMD_BUS_TIMEOUT=600s"'
  if [ -s "$FAST_HOMED_SO" ]; then
    echo "Environment=\"LD_PRELOAD=${FAST_HOMED_SO}\""
  fi
} > /etc/systemd/system/systemd-homed.service.d/yubiOS-homed.conf
systemctl daemon-reload 2>/dev/null || true

if ! systemctl is-active --quiet systemd-homed.service; then
  log "Starting systemd-homed.service..."
  systemctl start systemd-homed.service
else
  systemctl restart systemd-homed.service 2>/dev/null || true
fi

if homectl inspect "$USERNAME" &>/dev/null; then
  die "Homed user '$USERNAME' already exists. Use 'homectl update $USERNAME' to modify."
fi

# Clean up any leftover state from a prior interrupted or timed-out homectl create attempt
pkill -x systemd-homework 2>/dev/null || true
if [ -e "/dev/mapper/home-${USERNAME}" ]; then
  umount -l "/dev/mapper/home-${USERNAME}" 2>/dev/null || true
  cryptsetup close "home-${USERNAME}" 2>/dev/null || true
fi
while IFS=: read -r loop_dev _; do
  [ -n "$loop_dev" ] && losetup -d "$loop_dev" 2>/dev/null || true
done < <(losetup -a 2>/dev/null | grep -E "/(var/)?home/(\.#homework|${USERNAME}\.home)" || true)
rm -f /var/home/.#homework* "/var/home/${USERNAME}.home" "/home/${USERNAME}.home" 2>/dev/null || true

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
log "  FS      : $FS_TYPE (online discard=yes, offline discard=yes, auto-resize=off)"
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

HOMECTL_ENV=(SYSTEMD_BUS_TIMEOUT=600s)
if [ -s "$FAST_HOMED_SO" ]; then
  HOMECTL_ENV+=(LD_PRELOAD="$FAST_HOMED_SO")
fi

env "${HOMECTL_ENV[@]}" homectl create "$USERNAME" \
  --storage="$STORAGE" \
  --image-path="$HOME_IMAGE_PATH" \
  --fs-type="$FS_TYPE" \
  --disk-size="$DISK_SIZE" \
  --luks-discard=yes \
  --luks-offline-discard=yes \
  --auto-resize-mode=off \
  --luks-pbkdf-time-cost=1s \
  --luks-pbkdf-memory-cost=256M \
  --member-of="$MEMBER_OF" \
  --recovery-key=yes \
  --fido2-device=auto \
  --fido2-with-client-pin=yes \
  --fido2-with-user-presence=yes

log "Verifying enrollment..."
homectl inspect "$USERNAME" --no-pager

mkdir -p /var/lib/yubiOS
touch /var/lib/yubiOS/.homed-enrolled
log "Homed enrollment complete for '$USERNAME'."
log "Test unlock with: homectl authenticate $USERNAME"
