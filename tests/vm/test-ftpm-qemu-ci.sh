#!/usr/bin/env bash
# yubiOS Phase F0 fTPM e2e -- OP-TEE fTPM under QEMU virt, with the firmware
# SOURCED FROM THE PUBLISHED DOCKER ARTIFACT rather than rebuilt from source.
#
# tests/vm/build-arm64-ftpm-qemu.sh builds that chain from scratch (repo sync +
# TF-A + OP-TEE + fTPM TA + U-Boot, tens of minutes). ci_firmware-rk.yml already
# builds and publishes the same thing, so CI pulls the bundle instead:
#   0mniteck/yubios:firmware-qemu-arm64  ->  /firmware/{flash.bin,bl1.bin,fip.bin}
#
# Layered, because the firmware and the OS are two different boots:
#
#   Stage A (always) -- FIRMWARE markers. Boot flash.bin alone and assert the
#     secure world brought up the fTPM: Early TA loaded at init, TA probed via
#     ldelf, functional (U-Boot's BOOTCOMMAND prints YUBIOS_TPM_OK after tpm2
#     startup + self_test), StMM SP loaded, no known failure signature. Same
#     assertions as ci_firmware-rk.yml Stage 3, which is green.
#
#   Stage B (opt-in, FTPM_LINUX_PAYLOAD=1) -- LINUX + in-guest verifier.
#     `bcvk to-disk` the yubiOS image, boot that disk under the SAME firmware,
#     then run tests/vm/verify-tpm0-pcr-extend.sh INSIDE the guest over the
#     serial console. The dev/test image (Containerfile.dev) ships a serial getty
#     with root autologin precisely because this chain has no other way in:
#     U-Boot owns the boot, so bcvk's kernel-cmdline SSH credential never
#     applies, /etc is transient, root has no password, and there is no network.
#     tests/vm/ftpm-console-driver.py does the console talking.
#
# Exit codes: 0 = pass, 77 = explicit SKIP, 1 = failure.
set -euo pipefail

FIRMWARE_IMAGE="${FIRMWARE_IMAGE:-docker.io/0mniteck/yubios:firmware-qemu-arm64}"
YUBIOS_IMAGE="${YUBIOS_IMAGE:-}"
FTPM_LINUX_PAYLOAD="${FTPM_LINUX_PAYLOAD:-0}"
FTPM_UUID="${FTPM_UUID:-bc50d971-d4c9-42c4-82cb-343fb7f37896}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"
LINUX_BOOT_TIMEOUT="${LINUX_BOOT_TIMEOUT:-900}"
# Run 30165202571 (#120) failed here: `bcvk to-disk` made no progress for 26
# minutes and the step's own timeout-minutes killed the whole job, so the script
# never reached its own SKIP contract and produced no diagnosis. Every long
# operation in Stage B now has its own budget, and blowing that budget is a loud
# 77 SKIP naming the budget -- not a dead job.
TO_DISK_TIMEOUT="${TO_DISK_TIMEOUT:-900}"
# Runs 30180564384/30180564430 (2026-07-26) showed the real failure mode: this
# used to default under ${PWD} -- the git checkout -- and the whole script runs
# via 'sudo', so every dir it created here (firmware/, the installer disk) came
# out root-owned. On rock1's PERSISTENT self-hosted workspace, that leftover
# root-owned tree makes actions/checkout's own cleanup fail with EACCES on the
# NEXT run, which silently falls back to a stale pre-checkout tree -- the whole
# job then runs against old code with no error banner anywhere. /tmp already
# works for FTPM_LOG_DIR (recreated + chmod 0777 every run by the workflow), so
# WORK moves there too, and gets removed at the START of every run for the same
# reason: a same-run interruption's root-owned leftovers must not survive either.
if mountpoint -q /mnt/extended 2>/dev/null; then
  mkdir -p /mnt/extended/tmp
  WORK="${WORK:-/mnt/extended/tmp/yubios-ftpm-work}"
else
  WORK="${WORK:-/tmp/yubios-ftpm-work}"
fi
LOG_DIR="${LOG_DIR:-/tmp/yubios-ftpm-logs}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '\n=== %s ===\n' "$*"; }
skip() { printf 'SKIP: %s\n' "$*"; }
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing host tool: $1"; }

CID=""
QEMU_PID=""
HEARTBEAT_PID=""
cleanup() {
  [[ -n "$QEMU_PID" ]] && kill "$QEMU_PID" 2>/dev/null || true
  [[ -n "$HEARTBEAT_PID" ]] && kill "$HEARTBEAT_PID" 2>/dev/null || true
  [[ -n "$CID" ]] && podman rm -f "$CID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "host preflight"
need qemu-system-aarch64
need podman
need dd
rm -rf "$WORK"
mkdir -p "$WORK" "$LOG_DIR"

# ---- source the firmware from the published OCI artifact ----
log "extract firmware from ${FIRMWARE_IMAGE}"
(
  while true; do sleep 30; echo "... still pulling ${FIRMWARE_IMAGE} ($(date -u +%H:%M:%S))"; done
) &
HEARTBEAT_PID=$!
# `set -e` aborts on the failing command before any `$?` capture, so the rc has to
# be taken inside a guarded block or the error path below is dead code.
PULL_RC=0
podman pull "$FIRMWARE_IMAGE" >/dev/null || PULL_RC=$?
kill "$HEARTBEAT_PID" 2>/dev/null || true
wait "$HEARTBEAT_PID" 2>/dev/null || true
HEARTBEAT_PID=""
[[ "$PULL_RC" -eq 0 ]] || die "cannot pull ${FIRMWARE_IMAGE}"
CID="$(podman create "$FIRMWARE_IMAGE" /bin/true)"
[[ -n "$CID" ]] || die "podman create returned no container id"
rm -rf "${WORK}/firmware"
mkdir -p "${WORK}/firmware"
podman cp "${CID}:/firmware/." "${WORK}/firmware/" \
  || die "no /firmware payload in ${FIRMWARE_IMAGE}"
podman rm -f "$CID" >/dev/null 2>&1 || true
CID=""
ls -l "${WORK}/firmware/" || true

# Stage 3 stitches flash.bin from bl1 + fip when the bundle lacks it: bl1 at
# offset 0, fip at 4096-byte block 64. Keep that exact geometry.
FLASH="${WORK}/firmware/flash.bin"
if [[ ! -s "$FLASH" ]]; then
  if [[ -s "${WORK}/firmware/bl1.bin" && -s "${WORK}/firmware/fip.bin" ]]; then
    log "stitch flash.bin from bl1.bin + fip.bin"
    dd if="${WORK}/firmware/bl1.bin" of="$FLASH" bs=4096 conv=notrunc
    dd if="${WORK}/firmware/fip.bin" of="$FLASH" seek=64 bs=4096 conv=notrunc
  else
    skip "${FIRMWARE_IMAGE} has no flash.bin and no bl1.bin+fip.bin to stitch; dispatch ci_firmware-rk.yml with Docker_push to publish the qemu-arm64 bundle first."
    exit 77
  fi
fi
test -s "$FLASH" || die "flash.bin is empty after staging"

# ---- Stage A: firmware markers ----
log "Stage A: boot flash.bin and assert fTPM firmware markers"
NW_LOG="${LOG_DIR}/ftpm-nw.log"
OPTEE_LOG="${LOG_DIR}/ftpm-optee.log"
rm -f "$NW_LOG" "$OPTEE_LOG"
# -nic none: run 30180564430 failed here with 'failed to find romfile
# "efi-virtio.rom"' -- without -net none/-nodefaults QEMU auto-adds a default
# user-mode NIC, and its virtio-net-pci default romfile isn't present in every
# qemu-system-aarch64 build/package on this host. Nothing in Stage A boots a
# guest OS or needs network; suppress the default NIC outright instead of
# chasing which QEMU package ships that ROM.
timeout "$BOOT_TIMEOUT" qemu-system-aarch64 \
  -M virt,secure=on -cpu max -m 2048 -nic none \
  -bios "$FLASH" \
  -display none -d guest_errors \
  -serial "file:${NW_LOG}" -serial "file:${OPTEE_LOG}" || true
touch "$NW_LOG" "$OPTEE_LOG"

fail=0
grep -Eiq "early_ta_init.*${FTPM_UUID}|Early TA ${FTPM_UUID}" "$NW_LOG" "$OPTEE_LOG" \
  && echo "PASS: fTPM Early TA at init" || { echo "::error::fTPM Early TA not at init"; fail=1; }
grep -Eiq "ldelf: Loading TS ${FTPM_UUID}|Lookup user TA ELF ${FTPM_UUID}" "$NW_LOG" "$OPTEE_LOG" \
  && echo "PASS: fTPM TA probed" || { echo "::error::fTPM TA never probed"; fail=1; }
grep -q "YUBIOS_TPM_OK" "$NW_LOG" \
  && echo "PASS: fTPM functional (tpm2 startup + self_test)" || { echo "::error::fTPM not functional"; fail=1; }
grep -Eiq "stmm load address" "$NW_LOG" "$OPTEE_LOG" \
  && echo "PASS: StMM SP loaded into OP-TEE" || { echo "::error::StMM SP never loaded"; fail=1; }
if grep -Eq "Missing TPMv2 device|Couldn't set TPM|TA panicked|ldelf failed|data-abort" "$NW_LOG" "$OPTEE_LOG"; then
  echo "::error::known failure signature present"
  fail=1
else
  echo "PASS: no known failure signatures"
fi
[[ "$fail" -eq 0 ]] || die "Stage A firmware markers failed (see ${NW_LOG} / ${OPTEE_LOG})"
echo "STAGE_A_PASS"

# ---- Stage B: Linux + in-guest verifier under the same firmware ----
if [[ "$FTPM_LINUX_PAYLOAD" != "1" ]]; then
  skip "Stage B not requested (FTPM_LINUX_PAYLOAD != 1). Firmware-level fTPM proven; verify-tpm0-pcr-extend.sh not run."
  exit 77
fi

log "Stage B: install yubiOS to a disk and boot it under the fTPM firmware"
[[ -n "$YUBIOS_IMAGE" ]] || { skip "Stage B needs YUBIOS_IMAGE to install a Linux payload."; exit 77; }
command -v bcvk >/dev/null 2>&1 || { skip "Stage B needs bcvk on PATH to build the payload disk."; exit 77; }
command -v python3 >/dev/null 2>&1 || { skip "Stage B needs python3 for the console driver."; exit 77; }
test -s "${SCRIPT_DIR}/ftpm-console-driver.py" \
  || { skip "tests/vm/ftpm-console-driver.py missing; cannot drive the guest console."; exit 77; }
test -s "${SCRIPT_DIR}/verify-tpm0-pcr-extend.sh" \
  || { skip "tests/vm/verify-tpm0-pcr-extend.sh missing."; exit 77; }

DISK="${WORK}/yubios-ftpm.raw"
rm -f "$DISK"
# Capture bcvk's own output so a SKIP at TO_DISK_TIMEOUT isn't a dead-end. The
# heartbeat alone ("... still running bcvk to-disk") said nothing changed; the
# real question was always "where did bcvk get stuck" -- now the answer is in a
# file under LOG_DIR/ that survives the timeout. tee-and-redirect-to-file both
# run even when `timeout` kills bcvk, because they're shell redirects owned by
# the timeout's grandchild process tree at the moment of SIGTERM.
TO_DISK_LOG="${LOG_DIR}/ftpm-to-disk.log"
rm -f "$TO_DISK_LOG"
(
  while true; do sleep 30; echo "... still running bcvk to-disk for ${YUBIOS_IMAGE} ($(date -u +%H:%M:%S))"; done
) &
HEARTBEAT_PID=$!
# Bounded, and rc captured without tripping `set -e` (see TO_DISK_TIMEOUT above).
TO_DISK_RC=0
timeout --foreground -k 30 "$TO_DISK_TIMEOUT" \
  bcvk to-disk --disk-size 20G "$YUBIOS_IMAGE" "$DISK" >"$TO_DISK_LOG" 2>&1 || TO_DISK_RC=$?
kill "$HEARTBEAT_PID" 2>/dev/null || true
wait "$HEARTBEAT_PID" 2>/dev/null || true
HEARTBEAT_PID=""
if [[ "$TO_DISK_RC" -eq 124 || "$TO_DISK_RC" -eq 137 ]]; then
  skip "bcvk to-disk made no progress within ${TO_DISK_TIMEOUT}s installing ${YUBIOS_IMAGE} and was killed. See ${TO_DISK_LOG} for bcvk's last output before SIGTERM (rc=${TO_DISK_RC}). If the log shows bcvk still pulling the image or still in podman create, the network or podman storage is the bottleneck and TO_DISK_TIMEOUT should be raised. If the log shows bcvk's installer VM at the firmware prompt or in a boot loop, the ARM64 zstd EFI zboot hang is the cause -- a zstd-capable QEMU should be on PATH (see FTPM_PATH above) or the firmware bundle needs to be rebuilt against a bcvk-bootable kernel."
  exit 77
fi
if [[ "$TO_DISK_RC" -ne 0 ]]; then
  skip "bcvk to-disk could not install ${YUBIOS_IMAGE} (rc=${TO_DISK_RC}); Stage B payload unavailable."
  exit 77
fi
test -s "$DISK" || { skip "bcvk to-disk produced no disk image."; exit 77; }

LINUX_LOG="${LOG_DIR}/ftpm-linux.log"
LINUX_OPTEE_LOG="${LOG_DIR}/ftpm-linux-optee.log"
CONSOLE_SOCK="${WORK}/console.sock"
rm -f "$LINUX_LOG" "$LINUX_OPTEE_LOG" "$CONSOLE_SOCK"

# Console on a unix socket so the driver can both read the boot log and type into
# the autologin shell. Second serial stays a plain file for the OP-TEE log.
log "Stage B: boot the installed disk (console on ${CONSOLE_SOCK})"
qemu-system-aarch64 \
  -M virt,secure=on -cpu max -m 4096 -nic none \
  -bios "$FLASH" \
  -drive "if=none,file=${DISK},format=raw,id=hd0" \
  -device virtio-blk-device,drive=hd0 \
  -display none -d guest_errors \
  -chardev "socket,id=con0,path=${CONSOLE_SOCK},server=on,wait=off" \
  -serial chardev:con0 \
  -serial "file:${LINUX_OPTEE_LOG}" &
QEMU_PID=$!

set +e
python3 "${SCRIPT_DIR}/ftpm-console-driver.py" \
  "$CONSOLE_SOCK" \
  "${SCRIPT_DIR}/verify-tpm0-pcr-extend.sh" \
  "$LINUX_BOOT_TIMEOUT" 2>&1 | tee "$LINUX_LOG"
rc="${PIPESTATUS[0]}"
set -e

kill "$QEMU_PID" 2>/dev/null || true
QEMU_PID=""

# The console log doubles as the Linux-side evidence for checks 1-2, so assert
# those explicitly even when the in-guest run reported something else.
if grep -Eiq "optee: initialized driver" "$LINUX_LOG"; then
  echo "PASS: guest OP-TEE bus up"
fi
if grep -Eiq "tpm_ftpm_tee" "$LINUX_LOG"; then
  echo "PASS: tpm_ftpm_tee bound to the OP-TEE fTPM"
fi

if [[ "$rc" -eq 77 ]]; then
  skip "Stage B could not reach a shell on the guest console (see ${LINUX_LOG}). Firmware-level fTPM still PASSED in Stage A. If the guest booted, the image likely predates the root-autologin getty in Containerfile.dev -- rebuild and push :dev via ci_dev_image.yml."
  exit 77
fi
if [[ "$rc" -ne 0 ]]; then
  die "verify-tpm0-pcr-extend.sh failed in-guest (rc=${rc}); see ${LINUX_LOG}"
fi

log "PASS: Stage A firmware markers + in-guest verify-tpm0-pcr-extend.sh (live /dev/tpm0, PCR extend)"
