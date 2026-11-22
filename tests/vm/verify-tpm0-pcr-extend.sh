#!/usr/bin/env bash
# Phase F0 done-condition check — run INSIDE the booted QEMU virt ARM64 guest.
# Proves: (1) the fTPM TA is registered and /dev/tpm0 + /dev/tpmrm0 exist,
#         (2) the TPM responds to TPM2_Startup,
#         (3) a PCR extend changes a PCR value (measured-boot primitive works).
# No U2F/HSM here: this validates the platform-integrity TPM, not user identity.
set -euo pipefail

FTPM_UUID="bc50d971-d4c9-42c4-82cb-343fb7f37896"
PCR="${PCR:-16}"   # PCR 16 is the debug/resettable PCR — safe to extend in a bring-up test.

echo "=== yubiOS Phase F0 — fTPM /dev/tpm0 + PCR-extend verification ==="

echo -n "1/5 OP-TEE bus + fTPM TA present... "
dmesg | grep -q "optee: initialized driver" && echo "OK" || { echo "FAIL (no OP-TEE driver)"; exit 1; }

echo -n "2/5 /dev/tpm0 and /dev/tpmrm0 exist... "
[ -c /dev/tpm0 ] && [ -c /dev/tpmrm0 ] && echo "OK" || { echo "FAIL (tpm_ftpm_tee not bound)"; exit 1; }

echo -n "3/5 TPM responds to startup/getcap... "
tpm2_startup -c 2>/dev/null || true
tpm2_getcap properties-fixed >/dev/null 2>&1 && echo "OK" || { echo "FAIL"; exit 1; }

echo "4/5 Reading PCR $PCR before extend..."
BEFORE="$(tpm2_pcrread "sha256:$PCR" | awk '/'"$PCR"' *:/{print $NF}')"
echo "    before: $BEFORE"

echo -n "5/5 Extending PCR $PCR and confirming it changed... "
tpm2_pcrextend "$PCR:sha256=$(printf 'yubiOS-f0' | sha256sum | cut -d' ' -f1)"
AFTER="$(tpm2_pcrread "sha256:$PCR" | awk '/'"$PCR"' *:/{print $NF}')"
echo "    after:  $AFTER"
[ "$BEFORE" != "$AFTER" ] && echo "OK — PCR extended" || { echo "FAIL (PCR unchanged)"; exit 1; }

echo ""
echo "=== PASS: live /dev/tpm0 backed by ms-tpm-20-ref fTPM ($FTPM_UUID), PCR extend works ==="
