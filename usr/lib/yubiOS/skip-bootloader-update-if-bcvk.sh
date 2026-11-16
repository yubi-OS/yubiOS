#!/usr/bin/env bash
set -euo pipefail

[ -r /proc/mounts ] || exit 0

if awk '$2 == "/" && $3 == "virtiofs" { found=1 } END { exit found ? 0 : 1 }' /proc/mounts; then
  echo "bcvk ephemeral virtiofs root detected; skipping bootloader-update.service."
  exit 1
fi

# Skip bootupctl when yubiOS owner-signed UKI/systemd-boot is active so bootupd
# does not fail or overwrite the YubiKey-signed EFI binaries on /boot.
if [ -d /var/lib/yubiOS/secureboot ] || [ -f /var/lib/yubiOS/.sb-enrolled ]; then
  echo "yubiOS owner-signed Secure Boot active; skipping bootupd bootloader-update.service."
  exit 1
fi

exit 0
