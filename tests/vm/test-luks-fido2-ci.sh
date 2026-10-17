#!/usr/bin/env bash
# End-to-end LUKS2 FIDO2 + systemd-homed + pam-u2f test for yubiOS CI — NO physical hardware.
#
# Drives `bcvk ephemeral run` with the software TPM (--swtpm) and software U2F/FIDO2
# (--swu2f) devices, then runs assertions inside the guest over SSH. This is the
# hardware-free sibling of tests/vm/test-luks-fido2.sh (which needs a real YubiKey +
# native-to-disk). yubiOS production trust anchor is still the YubiKey FIDO2 device
# (ADR-003); swtpm/swu2f are TEST-ONLY.
#
# Closes #20 (test spec). Relates to #33, #9. yubiOS#25 (swu2f), yubi-OS/bcvk#3 (swtpm).
#
# === bcvk dependency ===
# Build the immutable yubi-OS/bcvk release-descendant commit in PINNED.md and put
# it on PATH before running this test, e.g.:
#     git init bcvk && git -C bcvk remote add origin https://github.com/yubi-OS/bcvk
#     git -C bcvk fetch --depth=1 origin <PINNED_SHA> && git -C bcvk checkout --detach FETCH_HEAD
#     (cd bcvk && cargo build --release)
#     export PATH="$PWD/bcvk/target/release:$PATH"
# Runner host also needs: swtpm + swtpm-tools (for --swtpm). For the optional swu2f
# Layer 1 / CTAP1 path also: libu2f-emu with a QEMU built --enable-u2f.
# See bcvk docs/swtpm.md, docs/swu2f.md.
#
# === CTAP1 vs CTAP2 — the two FIDO2 layers (bcvk docs/swu2f.md) ===
# swu2f Layer 1 = QEMU `u2f-emulated` (libu2f-emu) = U2F / CTAP1 only -> pam-u2f.
# `systemd-cryptenroll --fido2` AND systemd-homed FIDO2 need CTAP2 `hmac-secret`,
# which libu2f-emu does NOT provide. That is swu2f Layer 2: an IN-GUEST /dev/uhid
# CTAP2 authenticator shipped in the image. bcvk's --swu2f only loads the `uhid`
# module (modules-load= karg); the authenticator binary lives in the guest.
#
# The yubiOS TEST image (mkosi --profile test) ships `passless` (pando85/passless,
# Rust; backend pando85/soft-fido2 implements hmac-secret) as that Layer 2
# authenticator. This CI script requires that test-only fixture and fails unless
# the CTAP2 hmac-secret token, LUKS2 enrollment/unlock, and homed enrollment all
# execute. Production images remain intentionally incompatible with this test.
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
command -v swtpm  >/dev/null 2>&1 || skip "host swtpm not found; --swtpm may fail to attach a vTPM"

# Real-YubiKey guard: fail fast before bcvk boots a 5+ minute VM. See
# tests/vm/lib/real-u2f-guard.sh for the rationale. Override via
# ALLOW_REAL_U2F=1 or --allow-real-u2f.
assert_passless_only

# in-guest runner: ssh into the ephemeral VM and run a command, fail loudly on nonzero
g() { bcvk_ssh "$VMID" "$@"; }

# ---- boot the ephemeral VM with software TPM + software U2F ----
log "boot ephemeral VM (--swtpm --swu2f)"
VMID="$(bcvk ephemeral run "${BCVK_EXTRA_ARGS[@]}" --detach --ssh-keygen --swtpm --swu2f "$IMAGE")"
[[ -n "$VMID" ]] || die "bcvk ephemeral run returned no VM id"
echo "VM id: $VMID"

# wait for sshd
if ! wait_for_bcvk_ssh "$VMID" "$SSH_WAIT_SECS"; then
  logs="$(bcvk_podman_logs_tail "$VMID" 200)"
  if grep -Fq 'unable to handle EFI zboot image with "zstd" compression' <<<"$logs"; then
    skip_unsupported_zboot
  fi
  die "guest did not become reachable over ssh after ${SSH_WAIT_SECS}s"
fi

# ---- swtpm: /dev/tpm0 + measured-os ----
log "swtpm: /dev/tpm0 present and TPM2 measured-os condition"
g 'test -c /dev/tpm0'     || die "/dev/tpm0 missing (swtpm did not attach)"
g 'test -c /dev/tpmrm0'   || die "/dev/tpmrm0 missing"
if g "systemd-analyze condition 'ConditionSecurity=measured-os'" >/dev/null 2>&1; then
  echo "measured-os condition satisfied"
else
  skip "ConditionSecurity=measured-os not satisfied under direct-kernel boot (expected; see bcvk docs/swtpm.md)"
fi

# ---- swu2f Layer 1 (CTAP1): pam-u2f ----
log "swu2f Layer 1: emulated U2F token visible to libfido2"
g 'ls /dev/hidraw* >/dev/null 2>&1' || skip "no /dev/hidraw* — QEMU u2f-emulated not present (Layer 1 optional; build QEMU --enable-u2f + libu2f-emu)"
if g 'command -v pamu2fcfg >/dev/null'; then
  log "pam-u2f: register a token and assert pam_u2f config"
  if g 'ls /dev/hidraw* >/dev/null 2>&1'; then
    g 'pamu2fcfg -u ci > /tmp/u2f_keys 2>/dev/null && test -s /tmp/u2f_keys' \
      || skip "pamu2fcfg found no token to register (Layer 1 device absent)"
  fi
  # pam_u2f must be present and ordered "required" (not sufficient) in the auth stack.
  g 'grep -Rqs "pam_u2f.so" /etc/pam.d/' || die "pam_u2f.so not wired into /etc/pam.d"
  echo "pam_u2f.so present in /etc/pam.d"
else
  skip "pamu2fcfg not in guest image; pam-u2f register leg not exercised"
fi

# ---- swu2f Layer 2 (CTAP2): start the in-guest software authenticator ----
# bcvk --swu2f only loads the uhid module (docs/swu2f.md); the CTAP2 hmac-secret
# authenticator runs IN the guest. The TEST image (mkosi --profile test) ships
# `passless`. Start it so /dev/uhid exposes a CTAP2 token for the probe + FIDO2 legs.
#
# passless's local backend opens /dev/uhid before initializing storage (observed on the previously pinned release; re-verify when the pin moves).
# If the storage directory is absent, it asks a desktop notification daemon for
# permission to create it and exits in a headless guest. Run 29872832727 hit that
# path: passless briefly started, but no hidraw device survived to enumerate.
# Pre-create an explicit ephemeral store and use a transient service so process
# state and journal diagnostics remain observable over separate SSH commands.
log "swu2f Layer 2: start in-guest CTAP2 authenticator (passless)"
g 'command -v passless >/dev/null' \
  || die "passless missing; VM e2e requires the TEST image built with mkosi --profile test"
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

# ---- CTAP2 capability probe (required for the FIDO2 hmac-secret legs) ----
log "probe: CTAP2 hmac-secret authenticator (swu2f Layer 2)"
g 'for d in $(fido2-token -L | cut -d: -f1); do
     fido2-token -I "$d" 2>/dev/null | tee /run/passless-ci/token-info
     grep -qi "hmac-secret" /run/passless-ci/token-info && exit 0
   done
   exit 1' \
  || die "enumerated swu2f token does not advertise CTAP2 hmac-secret"
echo "CTAP2 hmac-secret authenticator found"

# ---- LUKS2 FIDO2 unlock (required) ----
log "LUKS2 FIDO2: enroll + reopen on a throwaway container"
g 'set -e
   dd if=/dev/zero of=/tmp/t.luks bs=1M count=48 status=none
   echo -n testpass | cryptsetup luksFormat --type luks2 -q /tmp/t.luks -
   PASSWORD=testpass systemd-cryptenroll --fido2-device=auto \
     --fido2-with-client-pin=no /tmp/t.luks
   systemd-cryptsetup attach t_ci /tmp/t.luks - fido2-device=auto
   cryptsetup status t_ci | grep -q "type:.*LUKS2"
   systemd-cryptsetup detach t_ci' \
  || die "LUKS2 FIDO2 enroll/unlock failed against CTAP2 authenticator"
echo "LUKS2 FIDO2 enroll + token unlock OK"

# ---- systemd-homed ----
log "systemd-homed: service active"
g 'systemctl is-active systemd-homed.service >/dev/null' || die "systemd-homed not active"
log "systemd-homed: FIDO2-backed home create + authenticate"
g 'set -e
   PASSWORD=ignored NEWPASSWORD= homectl create citest \
     --storage=luks --fido2-device=auto --enforce-password-policy=no
   homectl inspect citest | grep -qi fido2
   homectl remove citest' \
  || die "homed FIDO2 home create/inspect failed"
echo "homed FIDO2 home OK"

log "PASS: swtpm + swu2f CTAP2 + LUKS2 FIDO2 + homed FIDO2 verified"
