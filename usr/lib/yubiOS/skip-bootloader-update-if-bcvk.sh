#!/usr/bin/env bash
set -euo pipefail

[ -r /proc/mounts ] || exit 0

if awk '$2 == "/" && $3 == "virtiofs" { found=1 } END { exit found ? 0 : 1 }' /proc/mounts; then
  echo "bcvk ephemeral virtiofs root detected; skipping bootloader-update.service."
  exit 1
fi

# Skip bootupctl on all yubiOS systems (including first boot): CI pre-signs and
# stages keys/loaders under /usr/lib/yubiOS/secureboot and /boot/EFI/yubiOS, and
# first-boot enrollment signs them with the owner's U2F/HSM PIV slot 9a key.
if [ -d /usr/lib/yubiOS/secureboot ] || [ -d /boot/EFI/yubiOS/secureboot ] || [ -d /var/lib/yubiOS/secureboot ] || [ -f /var/lib/yubiOS/.sb-enrolled ] || [ -x /usr/lib/yubiOS/enroll-sb.sh ]; then
  echo "yubiOS Secure Boot key management active; skipping bootupd bootloader-update.service."
  exit 1
fi

exit 0
