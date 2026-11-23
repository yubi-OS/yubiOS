#!/bin/bash
# Validates systemd-sbsign + libykcs11 PKCS#11 URI for ECC slot 9c (ADR-008)
# and enforces RFC 7512 path/label delimiter hygiene (amutable/tine/image/sign.bzl).
# Run with U2F/HSM inserted after running yubiOS-enroll-sb, or pass
#   --syntax-only <uri> [pin_source_path] [socket_path]
# for headless CI syntax & injection validation.
set -euo pipefail

validate_pkcs11_uri_syntax() {
  local uri="${1:-}"
  local pin_path="${2:-}"
  local sock_path="${3:-}"

  if [[ ! "$uri" =~ ^pkcs11: ]]; then
    echo "FAIL: PKCS#11 URI must start with 'pkcs11:' (got: $uri)" >&2
    return 1
  fi

  # Reject unescaped RFC 7512 path delimiters in host paths pasted into pin-source= or socket env
  # (mirrors _PATH_DELIMITERS = [":", ";", "?", "&", ",", "%"] in amutable/tine/image/sign.bzl).
  local p delim_re='[:;?&,%]'
  for p in "$pin_path" "$sock_path"; do
    if [[ -n "$p" && "$p" =~ $delim_re ]]; then
      echo "FAIL: host path '$p' contains RFC 7512 delimiter (:, ;, ?, &, ,, %)" >&2
      return 1
    fi
  done

  local body="${uri#pkcs11:}"
  local path_part="${body%%\?*}"
  local query_part=""
  if [[ "$body" == *\?* ]]; then
    query_part="${body#*\?}"
  fi
  local IFS=';'
  local attr key val
  for attr in $path_part; do
    [[ -z "$attr" ]] && continue
    if [[ "$attr" != *=* ]]; then
      echo "FAIL: malformed PKCS#11 URI attribute '$attr'" >&2
      return 1
    fi
    key="${attr%%=*}"
    val="${attr#*=}"
    case "$key" in
      token|object|manufacturer|model|serial)
        if [[ ! "$val" =~ ^[A-Za-z0-9._-]+$ ]]; then
          echo "FAIL: PKCS#11 label '$key=$val' violates ^[A-Za-z0-9._-]+$" >&2
          return 1
        fi
        ;;
      id)
        if [[ ! "$val" =~ ^(%[0-9A-Fa-f]{2}|[A-Za-z0-9._-])+$ ]]; then
          echo "FAIL: PKCS#11 id '$val' is not valid percent-encoded or token characters" >&2
          return 1
        fi
        ;;
      type)
        if [[ ! "$val" =~ ^(private|public|cert|secret-key|data)$ ]]; then
          echo "FAIL: PKCS#11 type '$val' is not a valid RFC 7512 object type" >&2
          return 1
        fi
        ;;
      slot-id)
        if [[ ! "$val" =~ ^[0-9]+$ ]]; then
          echo "FAIL: PKCS#11 slot-id '$val' must be numeric" >&2
          return 1
        fi
        ;;
    esac
  done
  if [[ -n "$query_part" ]]; then
    local q_delim_re='[:;?,%]'
    local IFS='&'
    for attr in $query_part; do
      [[ -z "$attr" ]] && continue
      if [[ "$attr" != *=* ]]; then
        echo "FAIL: malformed PKCS#11 query attribute '$attr'" >&2
        return 1
      fi
      key="${attr%%=*}"
      val="${attr#*=}"
      if [[ "$val" =~ $q_delim_re ]]; then
        echo "FAIL: PKCS#11 query '$key=$val' contains unescaped RFC 7512 delimiter" >&2
        return 1
      fi
    done
  fi
  return 0
}

if [[ "${1:-}" == "--syntax-only" ]]; then
  shift
  URI_ARG="${1:-pkcs11:manufacturer=piv_II;id=%9c;type=private}"
  PIN_ARG="${2:-}"
  SOCK_ARG="${3:-}"
  validate_pkcs11_uri_syntax "$URI_ARG" "$PIN_ARG" "$SOCK_ARG"
  echo "PASS: PKCS#11 URI syntax valid ($URI_ARG)"
  exit 0
fi

PKCS11_LIB="${PKCS11_LIB:-/usr/lib64/libykcs11.so}"
CERT_PEM="${CERT_PEM:-/var/lib/yubiOS/yubiOS-sb.pem}"
TEST_EFI="${1:-/usr/lib/systemd/boot/efi/systemd-bootx64.efi}"
DEFAULT_URI="${PKCS11_URI:-pkcs11:manufacturer=piv_II;id=%9c;type=private}"

echo "=== PKCS#11 URI validation for yubiOS Secure Boot ==="

echo -n "0/5 Validating RFC 7512 PKCS#11 URI syntax... "
validate_pkcs11_uri_syntax "$DEFAULT_URI" "${PKCS11_PIN_SOURCE:-}" "${P11_KIT_SERVER_ADDRESS:-}" && echo "OK" || exit 1

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
TMP_SIGNED="$(mktemp /tmp/yubiOS-test-signed.XXXXXX.efi)"
trap 'rm -f "$TMP_SIGNED"' EXIT
echo -n "4/5 Test signing $TEST_EFI with systemd-sbsign (touch U2F/HSM)... "
PKCS11_MODULE_PATH="$PKCS11_LIB" systemd-sbsign sign \
  --private-key "$DEFAULT_URI" \
  --private-key-source "engine:pkcs11" \
  --certificate "$CERT_PEM" \
  --certificate-source file \
  --output "$TMP_SIGNED" \
  "$TEST_EFI" 2>/dev/null && echo "OK" || { echo "FAIL"; exit 1; }

# 5. Verify the signature.
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
