#!/bin/bash
# SPDX-License-Identifier: GPL-2.0-only
# yubiOS First-Boot User Home Enrollment via systemd-homed + U2F/HSM FIDO2
#
# Creates a FIDO2-unlocked LUKS2 home directory for the primary user inside the
# /dev/lvm/yubios-root (96%VG) LVM logical volume under /dev/mapper/crypt.
#
# Usage:
#   yubiOS-enroll-homed [username]
#
# Fast-path design (no LD_PRELOAD, no interposition of systemd/glibc symbols):
#   * --luks-discard=no --luks-offline-discard=no (fvf35, OMN-36): the image file is
#                                   allocated ONCE and never punched, so no step on the
#                                   login path is O(disk size). systemd v262 homework-luks.c:
#                                   - create: home_truncate() fallocate(fd,0,0,size) (L2166,
#                                     unwritten extents, fast); mkfs gets -E nodiscard
#                                     (mkfs-util.c:423); no FITRIM (offline=no, L2547);
#                                     run_fallocate() (L2566) returns at "Backing file is
#                                     fully allocated already" (L1164).
#                                   - login (AcquireHome): run_fallocate() (L1434) hits the
#                                     same early return; no FITRIM (discard=no, L1505).
#                                   - logout: run_fallocate_by_path() (L1721) early return.
#                                   The old discard=yes/offline=no pair FITRIM-punched the whole
#                                   164 GiB file at every login (L1506) and re-allocated it at
#                                   every logout (L1721), pushing AcquireHome past
#                                   pam_systemd_home's fixed 2 min D-Bus timeout (fvf35).
#                                   Existing homes keep their recorded luksDiscard; switch them
#                                   with `homectl update <user> --luks-discard=no`.
#   * --luks-extra-mount-options=noinit_itable : ext4lazyinit does not zero inode tables in
#                                   the background after login (documented ext4 option; the
#                                   group descriptors stay honestly flagged "not zeroed").
#   * SYSTEMD_HOME_MKFS_OPTIONS_EXT4="-J size=64 -E lazy_itable_init=1,nodiscard"
#                                   (systemd-homed.service.d/yubiOS-homed.conf, shipped in the
#                                   image): 64 MiB journal instead of 1 GiB. mke2fs keeps only
#                                   the LAST -E, and these options are appended after homework's
#                                   own -E, so the custom -E must restate nodiscard.
#                                   No assume_storage_prezeroed / lazy_journal_init: a LUKS2
#                                   image on a sparse file is NOT pre-zeroed (unwritten sectors
#                                   decrypt to pseudo-random bytes).
#   * fsck is never skipped and syncfs() is never stubbed.

set -euo pipefail

USERNAME="${1:-yubios}"
STORAGE="luks"
FS_TYPE="${YUBIOS_HOMED_FS:-ext4}"
DISK_SIZE="${YUBIOS_HOMED_SIZE:-80%}"
MEMBER_OF="wheel"
# homectl's own D-Bus timeout for CreateHome is fixed at 2 min (HOME_SLOW_BUS_CALL_TIMEOUT_USEC).
# If it expires, systemd-homed keeps working; we wait for the record instead of failing.
# With discard=no the create normally returns well inside 2 min and homectl prints the
# recovery key itself; this gate stays as defense-in-depth for a slow card.
CREATE_WAIT_SECS="${YUBIOS_HOMED_CREATE_WAIT:-900}"

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
      mount -o noatime,noinit_itable /dev/lvm/yubios-root /var/home 2>/dev/null \
        || mount -o noatime /dev/lvm/yubios-root /var/home
    fi
    if [ ! -e /home ] && [ ! -L /home ]; then
      ln -s var/home /home
    fi
  fi
fi

# Purge the LD_PRELOAD/libfast_homed.so drop-ins written by fccd6e43/2641a872. A file with the
# same name in /etc/systemd/system/<unit>.d/ overrides the image's /usr/lib copy, so a stale
# /etc copy would keep injecting the preload into systemd-homed, systemd-homework and GDM.
for unit_dropin in systemd-homed.service.d gdm.service.d; do
  f="/etc/systemd/system/${unit_dropin}/yubiOS-homed.conf"
  if [ -f "$f" ] && grep -qE 'LD_PRELOAD|libfast_homed|assume_storage_prezeroed' "$f"; then
    rm -f "$f"
    rmdir "/etc/systemd/system/${unit_dropin}" 2>/dev/null || true
  fi
done
rm -f /run/yubiOS/libfast_homed.so /run/yubiOS/libfast_homed.c 2>/dev/null || true

# RTC-less boards (ROCK 5B) cold-boot at TIME_EPOCH; keep e2fsck from treating every
# superblock as "from the future" (which forces a full check inside systemd-homework).
printf '[options]\nbroken_system_clock = true\n' > /etc/e2fsck.conf 2>/dev/null || true

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

# Clean up leftover state from a prior interrupted homectl create attempt. Only image/loop/dm
# objects that belong to THIS user are touched; a running systemd-homework is never killed.
if [ -e "/dev/mapper/home-${USERNAME}" ]; then
  umount -l "/dev/mapper/home-${USERNAME}" 2>/dev/null || true
  cryptsetup close "home-${USERNAME}" 2>/dev/null || true
fi
while IFS=: read -r loop_dev _; do
  if [ -n "$loop_dev" ]; then
    losetup -d "$loop_dev" 2>/dev/null || true
  fi
done < <(losetup -a 2>/dev/null | grep -E "/(var/)?home/(\.#homework${USERNAME}|${USERNAME}\.home)" || true)
rm -f "/var/home/.#homework${USERNAME}"* "/var/home/${USERNAME}.home" 2>/dev/null || true

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
log "  FS      : $FS_TYPE (online discard=yes, offline discard=no, noinit_itable, auto-resize=off)"
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

create_rc=0
homectl create "$USERNAME" \
  --storage="$STORAGE" \
  --image-path="$HOME_IMAGE_PATH" \
  --fs-type="$FS_TYPE" \
  --disk-size="$DISK_SIZE" \
  --luks-discard=no \
  --luks-offline-discard=no \
  --luks-extra-mount-options=noinit_itable \
  --auto-resize-mode=off \
  --luks-pbkdf-time-cost=1s \
  --luks-pbkdf-memory-cost=256M \
  --member-of="$MEMBER_OF" \
  --recovery-key=yes \
  --fido2-device=auto \
  --fido2-with-client-pin=yes \
  --fido2-with-user-presence=yes || create_rc=$?

if [ "$create_rc" -ne 0 ]; then
  # homectl gives up after 2 min, systemd-homed does not. Wait for the operation to land.
  log "homectl create returned $create_rc; waiting up to ${CREATE_WAIT_SECS}s for systemd-homed to finish..."
  waited=0
  # NB: /proc/<pid>/comm is truncated to 15 chars ("systemd-homewor"), so `pgrep -x systemd-homework`
  # never matches. Gate on homed's own record state and on the full homework path instead.
  until homectl inspect "$USERNAME" --no-pager 2>/dev/null | grep -qE '^[[:space:]]*State:[[:space:]]+(inactive|dirty)$' \
        && ! pgrep -f '^/usr/lib/systemd/systemd-homework( |$)' >/dev/null 2>&1; do
    if [ "$waited" -ge "$CREATE_WAIT_SECS" ]; then
      die "systemd-homed did not finish creating '$USERNAME' (homectl rc=$create_rc). See: journalctl -b -u systemd-homed"
    fi
    sleep 5
    waited=$((waited + 5))
  done
fi

log "Verifying enrollment..."
homectl inspect "$USERNAME" --no-pager

mkdir -p /var/lib/yubiOS
touch /var/lib/yubiOS/.homed-enrolled
log "Homed enrollment complete for '$USERNAME'."
log "Test unlock with: homectl authenticate $USERNAME"
log "Test activation (PIN + touch) with: homectl activate $USERNAME && homectl deactivate $USERNAME"
