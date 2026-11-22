#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# tests/vm/lib/real-u2f-guard.sh -- fail-loudly guard for swu2f (passless)
# CI tests when a real U2F/HSM is attached to the host.
#
# Background: the passless in-guest authenticator (swu2f Layer 2, CTAP2
# hmac-secret) is the SOFTWARE fallback used by yubiOS CI because no
# physical U2F/HSM is present. Production trust stays on the physical
# U2F/HSM (ADR-003/ADR-004); swu2f is TEST-ONLY.
#
# Problem: when a real U2F/HSM is plugged into the same host that runs
# this script, the in-guest FIDO2 assertions can silently exercise the
# REAL key instead of passless:
#   - QEMU u2f-emulated and passless both attach to /dev/uhid; an
#     enumeration-order race can surface the real key first inside the
#     guest even though --swu2f was used.
#   - systemd-cryptenroll --fido2-device=auto picks the FIRST detected
#     device, so a real key on the host (USB-passthrough or whole-host
#     passthrough) can be selected over passless.
# In either case the test silently passes against the wrong authenticator
# and masks a real passthrough regression.
#
# This guard detects a real Yubico device on the HOST before bcvk
# ephemeral run and exits 1 with a remediation message. Operators who
# understand the failure-mode trade-off can opt out via either:
#   - the environment variable ALLOW_REAL_U2F=1, or
#   - the first argv token --allow-real-u2f (callers handle this
#     themselves; the lib only reads ALLOW_REAL_U2F).
#
# Public API:
#   detect_real_u2f_hsm
#     Returns 0 if a real Yubico USB device is visible on the host.
#     Detects via lsusb (1050: VID or "Yubico" string) and/or via udev
#     metadata on /sys/class/hidraw/* (ID_VENDOR=Yubico or
#     ID_VENDOR_ID=1050).
#
#   assert_passless_only
#     die()s with a remediation message if a real U2F/HSM is visible
#     AND ALLOW_REAL_U2F is not 1. Run BEFORE bcvk ephemeral run so the
#     operator sees the failure in seconds rather than after a 5+ minute
#     boot.

# Consumed by assert_passless_only. Caller sets via env or argv parse.
ALLOW_REAL_U2F="${ALLOW_REAL_U2F:-0}"

# Detect a real Yubico USB device on the host. Returns 0 (and prints the
# reason to stderr) if one is found. Intentionally aggressive: any of
# the probes below counting as a hit is sufficient. False positives
# (e.g. an emulated Yubico device) should be ruled out via
# ALLOW_REAL_U2F=1 when intentional.
detect_real_u2f_hsm() {
  if command -v lsusb >/dev/null 2>&1; then
    if lsusb 2>/dev/null | grep -Eiq 'id 1050:|yubico'; then
      echo "lsusb reports a Yubico (VID 1050) device" >&2
      return 0
    fi
  fi
  if [[ -d /sys/class/hidraw ]]; then
    local d
    for d in /sys/class/hidraw/*; do
      [[ -e "$d" ]] || continue
      if command -v udevadm >/dev/null 2>&1; then
        if udevadm info "$d" 2>/dev/null | grep -Eiq 'ID_VENDOR=Yubico|ID_VENDOR_ID=1050'; then
          echo "udev reports Yubico (VID 1050) on $d" >&2
          return 0
        fi
      fi
    done
  fi
  return 1
}

# die loudly if a real U2F/HSM is visible AND ALLOW_REAL_U2F was NOT set
# to 1. Call this BEFORE bcvk ephemeral run so the guard fails fast.
assert_passless_only() {
  if [[ "${ALLOW_REAL_U2F}" == "1" ]]; then
    echo "WARN: ALLOW_REAL_U2F=1 set; skipping real-U2F/HSM guard." >&2
    return 0
  fi
  if detect_real_u2f_hsm; then
    cat >&2 <<'EOF'
FAIL: real U2F/HSM detected on this host.

This test exercises the swu2f Layer 2 (passless) fallback, which is
TEST-ONLY (ADR-003). A real U2F/HSM on the host means a passthrough
regression would be silently masked by the in-guest software
authenticator rather than failing loud:

  - QEMU u2f-emulated / passless attach to /dev/uhid, so enumeration-
    order races can surface the real key first inside the guest even
    though --swu2f was used.
  - systemd-cryptenroll --fido2-device=auto picks the FIRST detected
    FIDO2 device; a host-attached real key (USB passthrough or whole-
    host passthrough) can be selected over passless.

Remedies (pick one):
  1. Unplug the U2F/HSM and re-run (preferred).
  2. Set ALLOW_REAL_U2F=1 (env) or pass --allow-real-u2f (argv) if you
     understand the failure-mode trade-off (passthrough breakage will
     not be detected by this test run).
  3. Use the DESTRUCTIVE hardware test instead, which is designed for a
     real key:
       sudo ./tests/vm/test-luks-fido2.sh /dev/sdX yubiOS-image:tag
EOF
    exit 1
  fi
}
