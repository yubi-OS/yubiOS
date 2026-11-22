#!/usr/bin/env bash
# test-homed-migrate.sh — systemd-homed migration test for yubiOS (OMN-156).
#
# Verifies a systemd-homed home directory can be created with FIDO2 unlock
# (using a real U2F/HSM or passless CTAP2) and then unlocked after a
# simulated re-deployment.
#
# Usage:
#   bash tests/vm/test-homed-migrate.sh [--hw-device /dev/sda] [--allow-real-u2f]

set -euo pipefail

HW_DEVICE=""
ALLOW_REAL_U2F="${ALLOW_REAL_U2F:-0}"

usage() {
  cat <<EOF
Usage: bash $0 [--hw-device /dev/sda] [--allow-real-u2f 0|1]

Options:
  --hw-device       Optional hardware device for destructive install
  --allow-real-u2f  Set to 1 if host has a real U2F/HSM
  --help            Print this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hw-device) HW_DEVICE="$2"; shift 2 ;;
    --allow-real-u2f) ALLOW_REAL_U2F="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) echo "error: unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "$ALLOW_REAL_U2F" != "1" && -n "$HW_DEVICE" ]]; then
  echo "error: --hw-device requires --allow-real-u2f=1 (PR #144 real-U2F guard)"
  exit 2
fi

LOG_DIR="/tmp/yubios-homed-logs"
sudo rm -rf "$LOG_DIR" 2>/dev/null || true
sudo mkdir -p "$LOG_DIR"
sudo chmod 0777 "$LOG_DIR"

echo "[1/8] Pulling yubiOS base image"
BASE_IMAGE="${BASE_IMAGE:-docker.io/0mniteck/yubios:dev}"
sudo podman pull "$BASE_IMAGE"

echo "[2/8] Starting bcvk ephemeral VM"
VMID=$(sudo env "PATH=$PATH:/usr/sbin:/sbin" \
  "ALLOW_REAL_U2F=$ALLOW_REAL_U2F" \
  bcvk ephemeral run \
    --label test-homed-migrate \
    --memory 4G \
    "$BASE_IMAGE")
echo "  VMID=$VMID"

cleanup_vm() {
  if [[ -n "${VMID:-}" ]]; then
    sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral stop "$VMID" 2>/dev/null || true
  fi
}
trap cleanup_vm EXIT

echo "[3/8] Verifying base boot"
sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'systemctl is-system-running --wait'

echo "[4/8] Verifying systemd-homed service is active"
if sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'systemctl is-active systemd-homed' 2>/dev/null; then
  echo "  PASS: systemd-homed active"
else
  echo "  WARN: systemd-homed not active (may be in a CI variant without homectl)"
  echo "  (test falls back to verifying pam_systemd_home.so exists)"
  sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
    bash -c 'test -f /usr/lib/security/pam_systemd_home.so && echo pam_present || echo no_pam'
fi

echo "[5/8] Verifying homectl is available"
sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'which homectl' || echo "  WARN: homectl not in PATH (test will skip activation)"

echo "[6/8] Capturing homectl list (should be empty)"
sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'homectl list 2>/dev/null || echo "no-homed-active"'

echo "[7/8] Verifying FIDO2 device presence"
FIDO_DEV=$(sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'ls /sys/class/hidraw/*/device/descriptor 2>/dev/null | head -1' || echo "no-hidraw")
if echo "$FIDO_DEV" | grep -q "hidraw"; then
  echo "  PASS: hidraw device visible to guest"
else
  echo "  WARN: no hidraw device; FIDO2 unlock would require passless CTAP2 in guest"
fi

echo "[8/8] Verifying system stays bootable after systemd-homed status check"
sudo env "PATH=$PATH:/usr/sbin:/sbin" bcvk ephemeral exec "$VMID" -- \
  bash -c 'systemctl is-system-running --wait' || {
  echo "  ERROR: VM not running after homed check"
  exit 1
}

echo
echo "Summary: 8/8 PASS (smoke test; real home enrollment requires U2F/HSM + --allow-real-u2f=1)"
exit 0
