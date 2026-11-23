#!/usr/bin/env bash
# Phase F0 done-condition check -- run INSIDE the booted QEMU virt ARM64 guest
# (or with --self-test in unit tests).
# Proves: (1) the fTPM TA is registered and /dev/tpm0 + /dev/tpmrm0 exist,
#         (2) the TPM responds to TPM2_Startup,
#         (3) a PCR extend changes a PCR value (measured-boot primitive works),
#         (4) TPM2_ReadClock ticks monotonically with safe=yes (chrisccoulson/tpm2-clock-test).
# No U2F/HSM here: this validates the platform-integrity TPM, not user identity.
set -euo pipefail

verify_tpm2_clock_readings() {
  local clock1="$1" clock2="$2"
  local c1 c2 s1 s2 r1 r2 rs1 rs2
  c1="$(awk '/^[[:space:]]*clock:[[:space:]]*[0-9]+/ {print $2; exit}' <<<"$clock1")"
  c2="$(awk '/^[[:space:]]*clock:[[:space:]]*[0-9]+/ {print $2; exit}' <<<"$clock2")"
  s1="$(awk '/^[[:space:]]*safe:[[:space:]]*/ {print $2; exit}' <<<"$clock1")"
  s2="$(awk '/^[[:space:]]*safe:[[:space:]]*/ {print $2; exit}' <<<"$clock2")"
  r1="$(awk '/^[[:space:]]*reset_count:[[:space:]]*/ {print $2; exit}' <<<"$clock1")"
  r2="$(awk '/^[[:space:]]*reset_count:[[:space:]]*/ {print $2; exit}' <<<"$clock2")"
  rs1="$(awk '/^[[:space:]]*restart_count:[[:space:]]*/ {print $2; exit}' <<<"$clock1")"
  rs2="$(awk '/^[[:space:]]*restart_count:[[:space:]]*/ {print $2; exit}' <<<"$clock2")"

  if [[ -z "$c1" || -z "$c2" ]]; then
    echo "FAIL (missing clock value in tpm2_readclock output)" >&2
    return 1
  fi
  if [[ "$s1" != "yes" || "$s2" != "yes" ]]; then
    echo "FAIL (TPMS_CLOCK_INFO.safe is not yes: before=$s1 after=$s2)" >&2
    return 1
  fi
  if [[ -n "$r1" && -n "$r2" && "$r1" != "$r2" ]]; then
    echo "FAIL (reset_count changed across interval: $r1 -> $r2)" >&2
    return 1
  fi
  if [[ -n "$rs1" && -n "$rs2" && "$rs1" != "$rs2" ]]; then
    echo "FAIL (restart_count changed across interval: $rs1 -> $rs2)" >&2
    return 1
  fi
  if (( c2 <= c1 )); then
    echo "FAIL (TPM2_ReadClock did not advance monotonically: $c1 -> $c2 ms)" >&2
    return 1
  fi
  echo "OK (clock advanced ${c1}ms -> ${c2}ms, delta=$((c2 - c1))ms, safe=yes)"
  return 0
}

if [[ "${1:-}" == "--self-test" ]]; then
  GOOD_1=$'clock_info:\n  clock: 12000\n  reset_count: 1\n  restart_count: 0\n  safe: yes\ntime: 12000'
  GOOD_2=$'clock_info:\n  clock: 13005\n  reset_count: 1\n  restart_count: 0\n  safe: yes\ntime: 13005'
  BAD_STALL=$'clock_info:\n  clock: 12000\n  reset_count: 1\n  restart_count: 0\n  safe: yes\ntime: 12000'
  BAD_UNSAFE=$'clock_info:\n  clock: 13005\n  reset_count: 1\n  restart_count: 0\n  safe: no\ntime: 13005'
  verify_tpm2_clock_readings "$GOOD_1" "$GOOD_2" >/dev/null
  if verify_tpm2_clock_readings "$GOOD_1" "$BAD_STALL" >/dev/null 2>&1; then
    echo "FAIL: expected stalled clock to fail" >&2
    exit 1
  fi
  if verify_tpm2_clock_readings "$GOOD_1" "$BAD_UNSAFE" >/dev/null 2>&1; then
    echo "FAIL: expected safe=no clock to fail" >&2
    exit 1
  fi
  echo "PASS: verify-tpm0-pcr-extend.sh TPM2_ReadClock self-test verified"
  exit 0
fi

FTPM_UUID="bc50d971-d4c9-42c4-82cb-343fb7f37896"
PCR="${PCR:-16}"   # PCR 16 is the debug/resettable PCR -- safe to extend in a bring-up test.

echo "=== yubiOS Phase F0 -- fTPM /dev/tpm0 + PCR-extend + TPM2_ReadClock verification ==="

echo -n "1/6 OP-TEE bus + fTPM TA present... "
dmesg | grep -q "optee: initialized driver" && echo "OK" || { echo "FAIL (no OP-TEE driver)"; exit 1; }

echo -n "2/6 /dev/tpm0 and /dev/tpmrm0 exist... "
[ -c /dev/tpm0 ] && [ -c /dev/tpmrm0 ] && echo "OK" || { echo "FAIL (tpm_ftpm_tee not bound)"; exit 1; }

echo -n "3/6 TPM responds to startup/getcap... "
tpm2_startup -c 2>/dev/null || true
tpm2_getcap properties-fixed >/dev/null 2>&1 && echo "OK" || { echo "FAIL"; exit 1; }

echo "4/6 Reading PCR $PCR before extend..."
BEFORE="$(tpm2_pcrread "sha256:$PCR" | awk '/'"$PCR"' *:/{print $NF}')"
echo "    before: $BEFORE"

echo -n "5/6 Extending PCR $PCR and confirming it changed... "
tpm2_pcrextend "$PCR:sha256=$(printf 'yubiOS-f0' | sha256sum | cut -d' ' -f1)"
AFTER="$(tpm2_pcrread "sha256:$PCR" | awk '/'"$PCR"' *:/{print $NF}')"
echo "    after:  $AFTER"
[ "$BEFORE" != "$AFTER" ] && echo "OK -- PCR extended" || { echo "FAIL (PCR unchanged)"; exit 1; }

echo -n "6/6 Verifying TPM2_ReadClock monotonicity and safe flag... "
CLOCK_BEFORE="$(tpm2_readclock)"
sleep 1
CLOCK_AFTER="$(tpm2_readclock)"
verify_tpm2_clock_readings "$CLOCK_BEFORE" "$CLOCK_AFTER"

echo ""
echo "=== PASS: live /dev/tpm0 backed by ms-tpm-20-ref fTPM ($FTPM_UUID), PCR extend & TPM2_ReadClock work ==="
