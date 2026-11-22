#!/bin/bash
# Validates systemd-sbsign + libykcs11 PKCS#11 URI for ECC slot 9c (ADR-008).
# Run with U2F/HSM inserted after running yubiOS-enroll-sb.
# Verifies: module loads, key accessible, cert matches, test sign succeeds.
set -euo pipefail

PKCS11_LIB="${PKCS11_LIB:-/usr/lib64/libykcs11.so}"
CERT_PEM="${CERT_PEM:-/var/lib/yubiOS/yubiOS-sb.pem}"
TEST_EFI="${1:-/usr/lib/systemd/boot/efi/systemd-bootx64.efi}"

echo "=== PKCS#11 URI validation for yubiOS Secure Boot ==="

# 1. Verify the module loads
echo -n "1/5 Loading PKCS11 module... "
pkcs11-tool --module "$PKCS11_LIB" --list-slots 2>/dev/null \
  | grep -q "Yubico" && echo "OK" || { echo "FAIL"; exit 1; }

# 2. Verify key in slot 9c
echo -n "2/5 Key in slot 9c... "
pkcs11-tool --module "$PKCS11_LIB" --list-objects --type privkey 2>/dev/null \
  | grep -q "PIV AUTH" && echo "OK" || { echo "FAIL (check: ykman piv keys info)"; exit 1; }

# 3. Verify cert exported
echo -n "3/5 Certificate at $CERT_PEM... "
[[ -f "$CERT_PEM" ]] && openssl x509 -in "$CERT_PEM" -noout 2>/dev/null \
  && echo "OK" || { echo "FAIL (run yubiOS-enroll-sb first)"; exit 1; }

# 4. Test sign a file (THE gate: proves the PKCS#11 URI works with systemd-sbsign)
# ADR-008: systemd-sbsign via OpenSSL pkcs11 engine. It cannot sign in place, so
# write to a separate output file.
TMP_SIGNED="$(mktemp /tmp/yubiOS-test-signed.XXXXXX.efi)"
trap 'rm -f "$TMP_SIGNED"' EXIT
echo -n "4/5 Test signing $TEST_EFI with systemd-sbsign (touch U2F/HSM)... "
PKCS11_MODULE_PATH="$PKCS11_LIB" systemd-sbsign sign \
  --private-key "pkcs11:manufacturer=piv_II;id=%9c;type=private" \
  --private-key-source "engine:pkcs11" \
  --certificate "$CERT_PEM" \
  --certificate-source file \
  --output "$TMP_SIGNED" \
  "$TEST_EFI" 2>/dev/null && echo "OK" || { echo "FAIL"; exit 1; }

# 5. Verify the signature.
# sbverify (sbsigntool) is gone per ADR-008; systemd-sbsign has no verify verb.
# osslsigncode is the Authenticode verifier that checks against a specific cert.
# Best-effort: signing in step 4 already proves the URI works; this corroborates.
echo -n "5/5 Verifying signature... "
if command -v osslsigncode >/dev/null 2>&1; then
  osslsigncode verify -in "$TMP_SIGNED" -CAfile "$CERT_PEM" >/dev/null 2>&1 \
    && echo "OK" || { echo "FAIL"; exit 1; }
else
  echo "SKIP (install osslsigncode to verify; signing in step 4 already passed)"
fi

echo ""
echo "=== PASS: PKCS#11 URI valid, systemd-sbsign works with libykcs11 ==="
echo "Use this URI in mkosi:"
echo "  SecureBootKey=pkcs11:manufacturer=piv_II;id=%9c;type=private"
echo "  SecureBootKeySource=engine:pkcs11"
