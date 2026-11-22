#!/bin/bash
# Verify a signed yubiOS UKI against the U2F/HSM PIV Secure Boot certificate (ADR-008).
# This is the verify half of the sbsign chain: validate-pkcs11-uri.sh proves signing
# works; this proves a *shipped* UKI carries a signature that chains to the PIV cert.
#
# systemd-sbsign has no `verify` verb and sbverify (sbsigntool) is dropped per ADR-008,
# so osslsigncode is the Authenticode verifier that checks against a specific cert.
#
# Usage: ./tests/verify-uki-signature.sh [UKI.efi] [cert.pem]
#   Defaults: newest /boot/EFI/Linux/*.efi  +  /var/lib/yubiOS/yubiOS-sb.pem
set -euo pipefail

CERT_PEM="${2:-${CERT_PEM:-/var/lib/yubiOS/yubiOS-sb.pem}}"
UKI="${1:-${UKI:-}}"

if [[ -z "$UKI" ]]; then
  UKI="$(ls -t /boot/EFI/Linux/*.efi 2>/dev/null | head -n1 || true)"
fi

echo "=== yubiOS UKI signature verification ==="
echo "  UKI  : ${UKI:-<none found>}"
echo "  Cert : $CERT_PEM"

# 1. UKI present
echo -n "1/4 UKI present... "
if [[ -n "$UKI" && -f "$UKI" ]]; then
  echo "OK"
else
  echo "FAIL (no UKI; build/install yubiOS first or pass a path)"
  exit 1
fi

# 2. Certificate present + parseable
echo -n "2/4 Certificate present + parseable... "
if [[ -f "$CERT_PEM" ]] && openssl x509 -in "$CERT_PEM" -noout 2>/dev/null; then
  echo "OK"
else
  echo "FAIL (run yubiOS-enroll-sb first)"
  exit 1
fi

# 3. osslsigncode available
echo -n "3/4 osslsigncode available... "
if ! command -v osslsigncode >/dev/null 2>&1; then
  echo "SKIP (install osslsigncode to verify the signature)"
  exit 0
fi
echo "OK"

# 4. The gate: signature on the UKI chains to the PIV cert.
echo -n "4/4 Verifying UKI Authenticode signature against PIV cert... "
if osslsigncode verify -in "$UKI" -CAfile "$CERT_PEM" >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL (UKI is unsigned or signed by a different key)"
  exit 1
fi

echo ""
echo "=== PASS: UKI carries a valid signature chaining to the yubiOS PIV cert ==="
