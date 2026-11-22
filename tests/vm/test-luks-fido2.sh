#!/bin/bash
# End-to-end LUKS2 FIDO2 unlock test using bootc install to-filesystem + a host-attached U2F/HSM.
# Requires: podman, parted, dosfstools, e2fsprogs, cryptsetup, systemd-cryptenroll,
# a physical U2F/HSM visible to the HOST's /dev/hidraw* (so systemd-cryptenroll can prompt
# for a tap), and a spare block device.
# Usage: sudo ./tests/vm/test-luks-fido2.sh /dev/sdX <yubiOS-image:tag>
#
# This test bypasses bcvk (which internally invokes `bootc install to-disk`, triggering
# `bootupd_check_required` -- see OMN-149). Instead, we partition + format + LUKS + mount
# ourselves, then invoke `bootc install to-filesystem` directly inside a privileged podman
# container running the yubiOS image. Pattern adapted from upstream bootc's
# tmt/tests/booted/test-install-to-filesystem-var-mount.sh -- the canonical CI test for
# `bootc install to-filesystem`.
set -euo pipefail

DEVICE="${1:-}"
IMAGE="${2:-}"   # required: previous default (ghcr.io/corning-croak-cable/yubiOS:latest) was a stale org rename that 404s
PASS="testpassphrase123"
MNT=/mnt/yubios-install

[[ -z "$DEVICE" || -z "$IMAGE" ]] && { echo "Usage: $0 <block-device> <image:tag>"; exit 1; }
[[ "$EUID" -ne 0 ]]  && { echo "Run as root (sudo)."; exit 1; }

cleanup() {
  set +e
  umount "$MNT/boot" 2>/dev/null
  umount "$MNT" 2>/dev/null
  cryptsetup close yubios-root 2>/dev/null
  rm -rf "$MNT" 2>/dev/null
}
trap cleanup EXIT

echo "=== yubiOS LUKS2 FIDO2 end-to-end test (bootc install to-filesystem) ==="
echo "  Device : $DEVICE"
echo "  Image  : $IMAGE"
echo ""

# Step 0: Wipe any prior filesystem/RAID/LVM signatures on the target disk.
# wipefs -a is bcvk's own suggested alternative (see OMN-14) when its
# "Detected existing partitions" error fires, and it works across builds
# that don't yet expose a --wipe flag.
wipefs -a "$DEVICE" || true

# Step 1: Partition the disk (GPT: ESP + LUKS root).
# Layout:
#   p1: ESP (vfat, 1GiB) -- /boot/efi
#   p2: LUKS root (rest of disk) -- / via LUKS
echo "1/7 Partitioning $DEVICE (GPT: ESP + LUKS root)"
parted -s "$DEVICE" mklabel gpt
parted -s "$DEVICE" mkpart ESP fat32 1MiB 1025MiB
parted -s "$DEVICE" set 1 esp on
parted -s "$DEVICE" mkpart root 1025MiB 100%
partprobe "$DEVICE" || true
sleep 2

# Resolve partition paths (NVMe uses 'p' separator; SCSI/SATA does not).
if [[ "$DEVICE" =~ nvme ]]; then
  ESP_PART="${DEVICE}p1"
  LUKS_PART="${DEVICE}p2"
else
  ESP_PART="${DEVICE}1"
  LUKS_PART="${DEVICE}2"
fi
[[ -b "$ESP_PART"  ]] || { echo "ERROR: $ESP_PART not present after partprobe"; exit 1; }
[[ -b "$LUKS_PART" ]] || { echo "ERROR: $LUKS_PART not present after partprobe"; exit 1; }

# Step 2: Format ESP + LUKS + open + ext4 on the opened device.
echo "2/7 Formatting ESP + LUKS root"
mkfs.vfat -F32 "$ESP_PART"
echo -n "$PASS" | cryptsetup luksFormat --batch-mode "$LUKS_PART" -
echo -n "$PASS" | cryptsetup open "$LUKS_PART" yubios-root -
mkfs.ext4 -F /dev/mapper/yubios-root

# Step 3: Mount root + ESP at the staging path bootc will see as /target.
echo "3/7 Mounting target filesystems"
mkdir -p "$MNT"
mount /dev/mapper/yubios-root "$MNT"
# Mount the ESP at /target/boot (= "$MNT/boot" via podman -v "$MNT:/target").
# NOT at /target/boot/efi: bootc install to-filesystem with
# --boot-mount-spec=UUID=$ESP_UUID mounts the boot partition at /target/boot
# for Finalizing-filesystem-boot. Mounting ESP at /target/boot/efi leaves
# /target/boot as a plain directory under the root fs, and finalize-boot
# fails with:
#   mount: /target/boot: mount point not mounted or bad option.
# systemd-boot then writes to /target/boot/efi/* (a directory inside the
# ESP mount) -- the correct EFI directory layout on the ESP.
mkdir -p "$MNT/boot"
mount "$ESP_PART" "$MNT/boot"

# Step 4: Run bootc install to-filesystem inside a privileged podman container.
# This is the upstream bootc canonical pattern: invoke bootc from inside the
# image itself, with /dev mounted so bootc can see the block devices and
# --pid=host so it can mount within the host's mount namespace.
LUKS_UUID=$(blkid -s UUID -o value "$LUKS_PART")
ESP_UUID=$(blkid -s UUID -o value "$ESP_PART")

echo "4/7 Running bootc install to-filesystem (in privileged podman)"
podman run --rm --privileged \
    -v "$MNT:/target" \
    -v /dev:/dev \
    --pid=host \
    --security-opt label=type:unconfined_t \
    "$IMAGE" \
    bootc install to-filesystem \
        --composefs-backend \
        --disable-selinux \
        --root-mount-spec="UUID=$LUKS_UUID" \
        --boot-mount-spec="UUID=$ESP_UUID" \
        /target

# Step 5: Tear down mounts + LUKS before the post-install verify steps.
# The verify steps re-open the LUKS container fresh and would conflict with
# an existing mount on /dev/mapper/yubios-root.
echo "5/7 Cleaning up mount + LUKS"
umount "$MNT/boot"
umount "$MNT"
cryptsetup close yubios-root
trap - EXIT  # disable cleanup trap; we've already cleaned up

# Step 6: Verify the resulting LUKS partition unlocks with the test passphrase.
echo "6/7 Verifying LUKS unlock with test passphrase"
LUKS_PART=$(lsblk -J -o NAME,FSTYPE "$DEVICE" | \
  python3 -c "
import sys,json
d=json.load(sys.stdin)
for b in d['blockdevices']:
  for c in b.get('children',[]):
    if c.get('fstype')=='crypto_LUKS': print('/dev/'+c['name']); break
")
echo "  LUKS partition: $LUKS_PART"
[[ -z "$LUKS_PART" ]] && { echo "ERROR: no LUKS partition found"; exit 1; }
echo -n "$PASS" | cryptsetup open "$LUKS_PART" yubiOS-test --batch-mode
cryptsetup status yubiOS-test
cryptsetup close yubiOS-test

# Step 6.5 (NEW): real-U2F/HSM precondition for the FIDO2 enrollment in step 7.
# systemd-cryptenroll --fido2-device=auto picks the FIRST HID FIDO2 device it
# enumerates. If the host has no real Yubico (VID 1050) device, --auto finds
# nothing and the enrollment silently exits without prompting -- exactly the
# "I haven't been asked to tap/enroll" failure mode. This precondition matches
# the inverse of tests/vm/lib/real-u2f-guard.sh: the CI tests fail loud when a
# real key IS visible (so they don't accidentally exercise the real key instead
# of passless); this DESTRUCTIVE test fails loud when a real key is NOT visible
# (so the operator doesn't silently enroll against nothing).
real_key_seen=0
if [[ -d /sys/class/hidraw ]]; then
  for d in /sys/class/hidraw/*; do
    [[ -e "$d" ]] || continue
    if command -v udevadm >/dev/null 2>&1; then
      if udevadm info "$d" 2>/dev/null | grep -Eiq 'ID_VENDOR=Yubico|ID_VENDOR_ID=1050'; then
        real_key_seen=1
        echo "OK: real U2F/HSM on $d (will be used by step 7)"
        break
      fi
    fi
  done
fi
if [[ "$real_key_seen" -ne 1 ]]; then
  echo "FAIL: no real U2F/HSM visible to the HOST's HID bus." >&2
  echo "" >&2
  echo "Step 7 calls systemd-cryptenroll --fido2-device=auto --fido2-with-user-presence=yes" >&2
  echo "against $LUKS_PART. With no real Yubico (VID 1050) device on /dev/hidraw*, --auto" >&2
  echo "finds nothing and the enrollment exits silently without ever prompting for a tap." >&2
  echo "" >&2
  echo "Remedies (pick one):" >&2
  echo "  1. Plug in a U2F/HSM and re-run (preferred)." >&2
  echo "  2. Run on a host that already has a U2F/HSM attached." >&2
  exit 1
fi

# Step 7: Enroll FIDO2 (CI-friendly: add temp key slot via luksAddKey,
# then use the temp slot to unlock cryptenroll).
# In CI there is no TTY for systemd-tty-ask-password-agent. The previous
# v0.14 approach (--unlock-key-file=$PASS with $PASS written to a tmp
# file) still prompted for the current passphrase on rock1 -- the
# systemd-cryptenroll version there doesn't honor --unlock-key-file
# as expected, or the file-content mechanism is broken. Per Ermine's
# directive (2026-08-01): "maybe set a temp pass so we can unlock to
# trigger a add u2f". Approach:
#   1. Pick a random per-run TMP_PASS (avoids collisions with prior runs).
#   2. Write $PASS to EXISTING_PASSFILE and TMP_PASS to TMP_PASSFILE
#      (both 0600 temp files).
#   3. cryptsetup luksAddKey -- uses EXISTING_PASSFILE=$PASS to authorize
#      the slot add, then writes TMP_PASS as a NEW key slot on the LUKS.
#      This is an LUKS keyslot addition, not a replacement; the original
#      $PASS slot is preserved.
#   4. systemd-cryptenroll -- now uses TMP_PASSFILE for --unlock-key-file.
#      TMP_PASS unlocks the new slot cryptenroll just added, which
#      cryptenroll can read non-interactively.
#   5. systemd-cryptenroll -- --fido2-with-client-pin=no so the FIDO2
#      enrollment skips the PIN prompt and only requires U2F/HSM touch.
#   6. Cleanup EXISTING_PASSFILE + TMP_PASSFILE, propagate exit code.
# Only U2F/HSM touch is interactive (physical operator action).
TMP_PASS="yubios-fido-temp-$(date +%s%N | sha256sum | head -c 16)"
EXISTING_PASSFILE=$(mktemp /tmp/yubios-luks-existing-pass.XXXXXX)
TMP_PASSFILE=$(mktemp /tmp/yubios-luks-temp-pass.XXXXXX)
echo -n "$PASS" > "$EXISTING_PASSFILE"
echo -n "$TMP_PASS" > "$TMP_PASSFILE"
chmod 0600 "$EXISTING_PASSFILE" "$TMP_PASSFILE"
# Add a new key slot with TMP_PASS (authorized by EXISTING_PASSFILE=$PASS)
cryptsetup luksAddKey "$LUKS_PART" \
  --key-file="$EXISTING_PASSFILE" \
  --new-keyfile="$TMP_PASSFILE" \
  --batch-mode
LUKSADDKEY_RC=$?
[ "$LUKSADDKEY_RC" -eq 0 ] || { rm -f "$EXISTING_PASSFILE" "$TMP_PASSFILE"; exit "$LUKSADDKEY_RC"; }
# Now systemd-cryptenroll uses TMP_PASS to unlock (new slot, no prompt expected)
echo "7/7 Enrolling FIDO2 (touch U2F/HSM when prompted)"
systemd-cryptenroll \
  --fido2-device=auto \
  --fido2-with-client-pin=no \
  --fido2-with-user-presence=yes \
  --unlock-key-file="$TMP_PASSFILE" \
  "$LUKS_PART"
CRYPTENROLL_RC=$?
rm -f "$EXISTING_PASSFILE" "$TMP_PASSFILE"
[ "$CRYPTENROLL_RC" -eq 0 ] || exit "$CRYPTENROLL_RC"

echo ""
echo "=== PASS: LUKS2 FIDO2 enrollment complete ==="
echo "Remove the passphrase slot after confirming FIDO2 works:"
echo "  systemd-cryptenroll --wipe-slot=password $LUKS_PART"
