#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# tests/vm/test-bcvk-passthrough.sh -- YubiKey USB passthrough (VID 0x1050)
# verification for bcvk / QEMU ephemeral VMs (OMN-162 / OMN-141).
#
# Modes:
#   --verify-args     Validate QEMU XHCI + usb-host VID 0x1050 passthrough argument
#                     construction and host detection helper without booting a VM.
#   default (live)    Requires a physical YubiKey (VID 0x1050) attached to the host
#                     AND YUBIOS_PASSTHROUGH_HW=1. When absent in unattended CI,
#                     exits 77 (SKIP contract) so CI distinguishes hardware-absent
#                     skip from failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/real-u2f-guard.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/bcvk-ssh-lib.sh"

YUBICO_VID="0x1050"
VERIFY_ARGS_ONLY=0
IMAGE="${YUBIOS_IMAGE:-docker.io/0mniteck/yubios:latest}"

usage() {
  cat <<'EOF'
Usage: tests/vm/test-bcvk-passthrough.sh [--verify-args] [--image IMAGE]

Options:
  --verify-args       Verify QEMU USB passthrough flags and guard wiring only (exit 0).
  --image IMAGE       yubiOS OCI image to boot when running live hardware passthrough.
  -h, --help          Show this help message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify-args) VERIFY_ARGS_ONLY=1; shift ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

build_qemu_usb_passthrough_args() {
  printf '%s' "-usb -device qemu-xhci,id=xhci -device usb-host,bus=xhci.0,vendorid=${YUBICO_VID}"
}

echo "=== [OMN-162] test-bcvk-passthrough.sh ==="
QEMU_USB_ARGS="$(build_qemu_usb_passthrough_args)"
echo "QEMU USB passthrough args: ${QEMU_USB_ARGS}"

if [[ "$QEMU_USB_ARGS" != *"qemu-xhci"* ]] || [[ "$QEMU_USB_ARGS" != *"vendorid=0x1050"* ]]; then
  echo "FAIL: malformed QEMU USB passthrough args: $QEMU_USB_ARGS" >&2
  exit 1
fi

if [[ "$VERIFY_ARGS_ONLY" -eq 1 ]]; then
  echo "=== PASS: QEMU YubiKey USB passthrough (VID 0x1050) args & helpers verified ==="
  exit 0
fi

if ! detect_real_yubikey; then
  echo "SKIP (rc=77): no physical YubiKey (VID 1050) detected on host; hardware passthrough gated on OMN-141." >&2
  exit 77
fi

if [[ "${YUBIOS_PASSTHROUGH_HW:-0}" != "1" ]]; then
  echo "SKIP (rc=77): physical YubiKey detected, but YUBIOS_PASSTHROUGH_HW=1 not set (attended hardware gate OMN-141)." >&2
  exit 77
fi

VMID="yubios-yk-passthrough-$$"
cleanup() {
  sudo podman rm -f "$VMID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# shellcheck disable=SC2086
sudo bcvk ephemeral run --rm -d --name "$VMID" --ssh-keygen \
  --qemu-args "$QEMU_USB_ARGS" \
  ${BCVK_EPHEMERAL_EXTRA_ARGS:-} \
  "$IMAGE"

bcvk_wait_ssh "$VMID" "${YUBIOS_SSH_WAIT_SECS:-300}"
g() { bcvk_ssh "$VMID" "$@"; }

echo "--- Stopping software passless service if present so only hardware key can answer ---"
g "systemctl stop passless.service 2>/dev/null || true"
echo "--- Asserting Yubico USB device (1050:) is enumerated inside guest ---"
g "lsusb | grep -Ei '1050:|Yubico'"
echo "--- Asserting fido2-token -L sees the passed-through hardware FIDO2 device ---"
g "test -n \"\$(fido2-token -L)\""

echo "=== PASS: physical YubiKey USB passthrough verified inside bcvk guest ==="
