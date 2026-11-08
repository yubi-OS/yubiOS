#!/usr/bin/env bash
# FIDO2 enrollment-surface e2e for yubiOS CI — NO physical hardware (#9, #25).
#
# Boots yubiOS in a bcvk ephemeral VM (`--swtpm --swu2f`) using the immutable
# yubi-OS/bcvk release-descendant commit in PINNED.md and exercises the
# enrollment stack end-to-end with the in-guest software CTAP2 authenticator
# (passless, shipped by `mkosi --profile test`, see PR #40):
#
#   1. enrollment surface   — /usr/bin/yubiOS-enroll-* + /usr/lib/yubiOS present
#   2. enrollment gating    — yubiOS-enroll.service carries ConditionSecurity=measured-os
#   3. FIDO2 registration   — pamu2fcfg registers against the CTAP2 token (the
#                             core primitive every enroll wizard leg builds on)
#   4. SSH resident-key path— ssh-keygen -t ed25519-sk against the authenticator
#                             (ADR-004; covers the #25 "SSH key generation" leg)
#
# The software CTAP2 fixture, FIDO2 registration, and ed25519-sk key generation
# are required assertions. Production trust remains the physical YubiKey
# (ADR-003/ADR-004); swtpm/swu2f are TEST-ONLY. Hardware validation:
# tests/vm/test-luks-fido2.sh.
#
# === Real-YubiKey guard ===
# Sourced from tests/vm/lib/real-u2f-guard.sh. If a real YubiKey is detected on
# the host before bcvk ephemeral run, the script exits 1 with a remediation
# message. The reasoning: when a host-attached real key is visible, in-guest
# FIDO2 assertions can silently exercise the real key instead of passless,
# masking a passthrough regression. Pass --allow-real-u2f to opt out.
set -euo pipefail

IMAGE="${YUBIOS_IMAGE:-./mkosi.output/yubiOS}"
VMID=""
SSH_WAIT_SECS="${YUBIOS_SSH_WAIT_SECS:-300}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Optional opt-out for the real-YubiKey guard: --allow-real-u2f as first argv.
# shellcheck disable=SC2034 # ALLOW_REAL_U2F is read by assert_passless_only in tests/vm/lib/real-u2f-guard.sh
if [[ "${1:-}" == "--allow-real-u2f" ]]; then
  # shellcheck disable=SC2034 # read by assert_passless_only in tests/vm/lib/real-u2f-guard.sh
  ALLOW_REAL_U2F=1
  shift
fi

# shellcheck source=tests/vm/bcvk-ssh-lib.sh
. "${SCRIPT_DIR}/bcvk-ssh-lib.sh"
# shellcheck source=tests/vm/lib/real-u2f-guard.sh
. "${SCRIPT_DIR}/lib/real-u2f-guard.sh"

log()  { printf '\n=== %s ===\n' "$*"; }
skip() { printf 'SKIP: %s\n' "$*"; }       # skip != fail (tool/capability absent)
skip_unsupported_zboot() {
  printf 'SKIP: %s\n' "bcvk/QEMU cannot DirectBoot this ARM64 EFI zboot kernel because it is zstd-compressed; use a bcvk/QEMU build with EFI zboot zstd support, boot through firmware/stub, or rebuild only the CI test image with a bcvk-supported kernel compression. See refs/zstd-efi-zboot-bcvk.md."
  exit 77
}
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing host tool: $1"; }

# Optional host-provided bcvk arguments. CI uses this to bind a zstd-capable
# a qemu-system-aarch64 wrapper into bcvk's inner podman container; local runs normally
# leave it empty. Keep this as a simple whitespace-split string: paths used by
# CI intentionally contain no spaces.
BCVK_EXTRA_ARGS=()
if [[ -n "${BCVK_EPHEMERAL_EXTRA_ARGS:-}" ]]; then
  read -r -a BCVK_EXTRA_ARGS <<<"${BCVK_EPHEMERAL_EXTRA_ARGS}"
fi

cleanup() { [[ -n "$VMID" ]] && podman rm -f "$VMID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# ---- host preflight ----
log "host preflight"
need bcvk
bcvk ephemeral run --help 2>&1 | grep -q -- '--swtpm' || die "pinned bcvk source lacks --swtpm"
bcvk ephemeral run --help 2>&1 | grep -q -- '--swu2f' || die "pinned bcvk source lacks --swu2f"

# Real-YubiKey guard: fail fast before bcvk boots a 5+ minute VM. See
# tests/vm/lib/real-u2f-guard.sh for the rationale. Override via
# ALLOW_REAL_U2F=1 or --allow-real-u2f.
assert_passless_only

g() { bcvk_ssh "$VMID" "$@"; }

# ---- boot ----
log "boot ephemeral VM (--swtpm --swu2f)"
VMID="$(bcvk ephemeral run "${BCVK_EXTRA_ARGS[@]}" --detach --ssh-keygen --swtpm --swu2f "$IMAGE")"
[[ -n "$VMID" ]] || die "bcvk ephemeral run returned no VM id"
echo "VM id: $VMID"
if ! wait_for_bcvk_ssh "$VMID" "$SSH_WAIT_SECS"; then
  logs="$(bcvk_podman_logs_tail "$VMID" 200)"
  if grep -Fq 'unable to handle EFI zboot image with "zstd" compression' <<<"$logs"; then
    skip_unsupported_zboot
  fi
  die "guest did not become reachable over ssh after ${SSH_WAIT_SECS}s"
fi

# ---- 1. enrollment surface ----
log "enrollment surface: yubiOS-enroll-* commands + /usr/lib/yubiOS"
g 'ls /usr/bin/yubiOS-enroll-* >/dev/null 2>&1' \
  || die "no /usr/bin/yubiOS-enroll-* commands in image (Containerfile symlinks missing)"
g 'test -d /usr/lib/yubiOS && test -s /usr/lib/yubiOS/lib.sh' \
  || die "/usr/lib/yubiOS/lib.sh missing"
g 'ls /usr/bin/yubiOS-enroll-*'

# ---- 2. enrollment gating (ADR-016 / #15) ----
log "yubiOS-enroll.service: unit present + measured-os condition wired"
if g 'systemctl cat yubiOS-enroll.service >/dev/null 2>&1'; then
  g 'systemctl cat yubiOS-enroll.service | grep -q "ConditionSecurity=measured-os"' \
    || die "yubiOS-enroll.service lacks ConditionSecurity=measured-os (ADR-016)"
  echo "ConditionSecurity=measured-os wired"
else
  skip "yubiOS-enroll.service not in this image profile"
fi

# ---- 3. start the in-guest CTAP2 authenticator (swu2f Layer 2) ----
log "swu2f Layer 2: start in-guest CTAP2 authenticator (passless)"
g 'command -v passless >/dev/null' \
  || die "passless missing; enrollment e2e requires the TEST image built with mkosi --profile test"
g 'command -v fido2-token >/dev/null' || die "fido2-token missing from TEST image"
g 'command -v systemd-run >/dev/null' || die "systemd-run missing from TEST image"
g 'set -eu
   modprobe uhid
   test -c /dev/uhid
   rm -rf /run/passless-ci
   install -d -m 0700 /run/passless-ci/storage /run/passless-ci/config
   systemd-run --quiet --unit=passless-ci.service --property=Type=exec \
     --setenv=HOME=/root \
     --setenv=XDG_DATA_HOME=/run/passless-ci \
     --setenv=XDG_CONFIG_HOME=/run/passless-ci/config \
     --setenv=PASSLESS_E2E_AUTO_ACCEPT_UV=1 \
     --setenv=PASSLESS_TEST_VENDOR_ID=0x15d9 \
     --setenv=PASSLESS_TEST_PRODUCT_ID=0x0a37 \
     --setenv=PASSLESS_LOG_STYLE=never \
     /usr/bin/passless --backend-type local \
       --local-path /run/passless-ci/storage -v' \
  || die "failed to launch passless against the pre-created CI storage"

if ! g 'set -eu
        for _ in $(seq 1 30); do
          udevadm settle 2>/dev/null || true
          if fido2-token -L 2>/dev/null | tee /run/passless-ci/devices | grep -q .; then
            cat /run/passless-ci/devices
            exit 0
          fi
          systemctl is-active --quiet passless-ci.service || exit 1
          sleep 1
        done
        exit 1'; then
  g 'set +e
     echo "--- passless service ---"
     systemctl --no-pager --full status passless-ci.service
     echo "--- passless journal ---"
     journalctl -b --no-pager -u passless-ci.service -n 200
     echo "--- UHID/hidraw devices ---"
     ls -la /dev/uhid /dev/hidraw*
     echo "--- recent kernel HID messages ---"
     dmesg | grep -Ei "uhid|hidraw|fido" | tail -100
     true' >&2 || true
  die "passless did not enumerate a FIDO2 token inside the ARM64 guest"
fi

g 'for d in $(fido2-token -L | cut -d: -f1); do
     fido2-token -I "$d" 2>/dev/null | tee /run/passless-ci/token-info
     grep -qi "hmac-secret" /run/passless-ci/token-info && exit 0
   done
   exit 1' \
  || die "enumerated swu2f token does not advertise CTAP2 hmac-secret"
echo "CTAP2 hmac-secret authenticator up"

# ---- 4. FIDO2 registration (the wizard's core primitive) ----
log "pam-u2f: register a credential against the software authenticator"
g 'command -v pamu2fcfg >/dev/null' || die "pamu2fcfg missing from image"
g 'pamu2fcfg -u ci-enroll -o pam.yubios.local -i pam.yubios.local > /tmp/enroll_u2f_keys && test -s /tmp/enroll_u2f_keys' \
  || die "pamu2fcfg registration against CTAP2 authenticator failed"
echo "FIDO2 registration OK"

# ---- 5. SSH ed25519-sk keygen (ADR-004; #25 SSH leg) ----
log "ssh-keygen: ed25519-sk keypair against the software authenticator"
g 'ssh-keygen -t ed25519-sk -N "" -f /tmp/ci_sk_key </dev/null && test -s /tmp/ci_sk_key.pub' \
  || die "ssh-keygen ed25519-sk failed against the enumerated CTAP2 authenticator"
g 'head -c 32 /tmp/ci_sk_key.pub'
echo "ed25519-sk keygen OK"

log "PASS: enrollment surface + CTAP2 registration + OpenSSH ed25519-sk verified"
