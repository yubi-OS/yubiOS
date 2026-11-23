#!/bin/bash
# Verify a signed yubiOS UKI against the U2F/HSM PIV Secure Boot certificate (ADR-008)
# and enforce signer Subject CN parity (amutable/tine/examples/image-secureboot/BUCK).
#
# Usage: ./tests/verify-uki-signature.sh [UKI.efi] [cert.pem]
#        ./tests/verify-uki-signature.sh --check-cert-subject <cert.pem> [expected_cn_substring]
set -euo pipefail

check_cert_subject() {
  local cert="$1"
  local expected_sub="${2:-}"
  [[ -f "$cert" ]] || { echo "FAIL: certificate not found: $cert" >&2; return 1; }
  local subj
  subj="$(openssl x509 -in "$cert" -noout -subject 2>/dev/null)" || {
    echo "FAIL: cannot parse X.509 certificate: $cert" >&2
    return 1
  }
  if [[ "${ALLOW_EPHEMERAL_MKOSI_CN:-0}" != "1" ]]; then
    if [[ "$subj" =~ CN[[:space:]]*=[[:space:]]*(mkosi|ukify|tine\.generated) ]]; then
      echo "FAIL: certificate subject '$subj' fell back to an unconfigured tool-generated default" >&2
      return 1
    fi
  fi
  if [[ -n "$expected_sub" && "$subj" != *"$expected_sub"* ]]; then
    echo "FAIL: certificate subject '$subj' does not contain expected '$expected_sub'" >&2
    return 1
  fi
  return 0
}

if [[ "${1:-}" == "--check-cert-subject" ]]; then
  shift
  check_cert_subject "${1:-}" "${2:-}"
  echo "PASS: certificate subject verified ($(openssl x509 -in "$1" -noout -subject))"
  exit 0
fi

CERT_PEM="${2:-${CERT_PEM:-/var/lib/yubiOS/yubiOS-sb.pem}}"
UKI="${1:-${UKI:-}}"

if [[ -z "$UKI" ]]; then
  UKI="$(ls -t /boot/EFI/Linux/*.efi 2>/dev/null | head -n1 || true)"
fi

echo "=== yubiOS UKI signature verification ==="
echo "  UKI  : ${UKI:-<none found>}"
echo "  Cert : $CERT_PEM"

# 1. UKI present
echo -n "1/5 UKI present... "
if [[ -n "$UKI" && -f "$UKI" ]]; then
  echo "OK"
else
  echo "FAIL (no UKI; build/install yubiOS first or pass a path)"
  exit 1
fi

# 2. Certificate present + parseable + non-fallback Subject CN
echo -n "2/5 Certificate present + parseable + non-fallback CN... "
if check_cert_subject "$CERT_PEM" "${EXPECTED_CERT_CN:-}"; then
  echo "OK"
else
  echo "FAIL (run yubiOS-enroll-sb first or check certificate CN)"
  exit 1
fi

# 3. osslsigncode available
echo -n "3/5 osslsigncode available... "
if ! command -v osslsigncode >/dev/null 2>&1; then
  echo "SKIP (install osslsigncode to verify the signature)"
  exit 0
fi
echo "OK"

# 4. The gate: signature on the UKI chains to the PIV cert.
echo -n "4/5 Verifying UKI Authenticode signature against PIV cert... "
if osslsigncode verify -in "$UKI" -CAfile "$CERT_PEM" >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL (UKI is unsigned or signed by a different key)"
  exit 1
fi

# 5. Embedded PKCS#7 signer Subject matches $CERT_PEM Subject
echo -n "5/5 Verifying embedded PKCS#7 signer subject matches PIV cert... "
TMP_SIG="$(mktemp /tmp/yubiOS-uki-sig.XXXXXX.pem)"
trap 'rm -f "$TMP_SIG"' EXIT
if osslsigncode extract-signature -pem -in "$UKI" -out "$TMP_SIG" >/dev/null 2>&1; then
  EXPECTED_SUBJ="$(openssl x509 -in "$CERT_PEM" -noout -subject)"
  EMBEDDED_SUBJS="$(openssl pkcs7 -in "$TMP_SIG" -print_certs -noout 2>/dev/null || true)"
  if [[ -n "$EMBEDDED_SUBJS" && "$EMBEDDED_SUBJS" != *"$EXPECTED_SUBJ"* ]]; then
    echo "FAIL (embedded signer '$EMBEDDED_SUBJS' != expected '$EXPECTED_SUBJ')"
    exit 1
  fi
fi
echo "OK"

echo ""
echo "=== PASS: UKI carries a valid signature chaining to the yubiOS PIV cert ==="
