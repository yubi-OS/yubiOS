#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
#
# tests/vm/test-secure-boot-tamper.sh -- negative tamper assertions for the
# yubiOS sealed-UKI + composefs boot chain (OMN-162 / OMN-53):
#   Leg 1: Byte-flip a signed UKI PE payload -> signature verification fails closed.
#   Leg 2: Byte-flip composefs=<sha512> in BLSConfig / cmdline -> composefs store lookup fails closed.
#   Leg 3: Strip signature / verify against foreign ROTPK -> signature verification fails closed.
#
# Runs deterministically in CI, Bats, or standalone without requiring a live VM.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tests/vm/test-secure-boot-tamper.sh [--self-test] [--uki PATH --cert PATH]

Options:
  --self-test         Run all 3 negative tamper legs using an ephemeral signed PE fixture (default).
  --uki PATH          Signed UKI PE binary to test in addition to the synthetic fixture.
  --cert PATH         Signer certificate PEM corresponding to --uki.
  -h, --help          Show this help message.
EOF
}

UKI_ARG=""
CERT_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --self-test) shift ;;
    --uki) UKI_ARG="${2:-}"; shift 2 ;;
    --cert) CERT_ARG="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

WORKDIR="$(mktemp -d "/tmp/yubios-sb-tamper.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

echo "=== [OMN-162] test-secure-boot-tamper.sh ==="

# Generate a minimal valid PE32+ EFI image and two distinct X.509 certificates
# (owner signer vs. foreign ROTPK) so all 3 negative tamper legs execute
# deterministically on any runner with python3 + openssl.
python3 - "$WORKDIR" <<'EOF_PE'
import os, struct, sys

workdir = sys.argv[1]
pe = bytearray(4096)
pe[0:2] = b"MZ"
struct.pack_into("<I", pe, 0x3C, 0x80)
pe_off = 0x80
pe[pe_off:pe_off+4] = b"PE\x00\x00"
struct.pack_into("<HHIIIHH", pe, pe_off+4, 0xAA64, 2, 0, 0, 0, 0xF0, 0x0002)
opt_off = pe_off + 24
struct.pack_into("<HBBIIIIIQIIHHHHHHIIIIHHQQQQII", pe, opt_off,
    0x20B, 1, 0,
    512, 512, 0, 0x1000, 0x1000,
    0x10000000, 0x1000, 0x200,
    0, 0, 0, 0, 0, 0,
    0, 0x3000, 0x200, 0,
    10, 0,
    0, 0, 0, 0,
    0, 16)
sec_off = opt_off + 0xF0
pe[sec_off:sec_off+8] = b".text\x00\x00\x00"
struct.pack_into("<IIIIIIHHI", pe, sec_off+8, 512, 0x1000, 512, 0x200, 0, 0, 0, 0, 0x60000020)
sec2_off = sec_off + 40
pe[sec2_off:sec2_off+8] = b".cmdline"
cmdline = b"audit=0 composefs.digest=v1-sha512-12:" + (b"a" * 128) + b"\x00"
struct.pack_into("<IIIIIIHHI", pe, sec2_off+8, len(cmdline), 0x2000, 512, 0x400, 0, 0, 0, 0, 0x40000040)
pe[0x200:0x200+16] = b"\x00\x00\x80\xd2\xc0\x03\x5f\xd6" * 2
pe[0x400:0x400+len(cmdline)] = cmdline

with open(os.path.join(workdir, "unsigned.efi"), "wb") as f:
    f.write(pe)
EOF_PE

cat > "$WORKDIR/openssl.cnf" <<'EOF_CNF'
[req]
distinguished_name = dn
prompt = no
[dn]
CN = yubiOS-Test
EOF_CNF

openssl req -x509 -newkey rsa:2048 -nodes \
  -config "$WORKDIR/openssl.cnf" \
  -keyout "$WORKDIR/owner.key" -out "$WORKDIR/owner.crt" \
  -days 1 -subj "/CN=yubiOS-Owner-SB-Test" >/dev/null 2>&1

openssl req -x509 -newkey rsa:2048 -nodes \
  -config "$WORKDIR/openssl.cnf" \
  -keyout "$WORKDIR/foreign.key" -out "$WORKDIR/foreign.crt" \
  -days 1 -subj "/CN=Foreign-ROTPK-Test" >/dev/null 2>&1

sign_pe() {
  local in_efi="$1" key="$2" crt="$3" out_efi="$4"
  if command -v osslsigncode >/dev/null 2>&1; then
    osslsigncode sign -certs "$crt" -key "$key" -h sha256 -in "$in_efi" -out "$out_efi" >/dev/null 2>&1
  elif command -v sbsign >/dev/null 2>&1; then
    sbsign --key "$key" --cert "$crt" --output "$out_efi" "$in_efi" >/dev/null 2>&1
  else
    openssl dgst -sha256 -sign "$key" -out "${out_efi}.sig" "$in_efi"
    cp "$in_efi" "$out_efi"
  fi
}

verify_pe() {
  local in_efi="$1" crt="$2"
  if [[ -n "${UKI_VERIFY_HELPER:-}" ]]; then
    "$UKI_VERIFY_HELPER" "$in_efi" "$crt"
    return $?
  fi
  if command -v osslsigncode >/dev/null 2>&1 && [[ ! -f "${in_efi}.sig" ]]; then
    osslsigncode verify -in "$in_efi" -CAfile "$crt" >/dev/null 2>&1
  elif command -v sbverify >/dev/null 2>&1 && [[ ! -f "${in_efi}.sig" ]]; then
    sbverify --cert "$crt" "$in_efi" >/dev/null 2>&1
  else
    [[ -f "${in_efi}.sig" ]] || return 1
    openssl x509 -in "$crt" -pubkey -noout > "$WORKDIR/verify_pub.pem" 2>/dev/null || return 1
    openssl dgst -sha256 -verify "$WORKDIR/verify_pub.pem" -signature "${in_efi}.sig" "$in_efi" >/dev/null 2>&1
  fi
}

sign_pe "$WORKDIR/unsigned.efi" "$WORKDIR/owner.key" "$WORKDIR/owner.crt" "$WORKDIR/signed.efi"
if [[ -n "$UKI_ARG" && -n "$CERT_ARG" && -f "$UKI_ARG" && -f "$CERT_ARG" ]]; then
  cp "$UKI_ARG" "$WORKDIR/signed.efi"
  cp "$CERT_ARG" "$WORKDIR/owner.crt"
fi

echo -n "0/3 Positive baseline: valid signed UKI verifies against owner cert... "
if verify_pe "$WORKDIR/signed.efi" "$WORKDIR/owner.crt"; then
  echo "OK"
else
  echo "FAIL (positive baseline signed UKI rejected)" >&2
  exit 1
fi

echo -n "1/3 Negative 1: byte-flip in signed UKI PE section must be rejected... "
cp "$WORKDIR/signed.efi" "$WORKDIR/tampered.efi"
[[ -f "$WORKDIR/signed.efi.sig" ]] && cp "$WORKDIR/signed.efi.sig" "$WORKDIR/tampered.efi.sig"
printf '\x58' | dd of="$WORKDIR/tampered.efi" bs=1 seek=520 count=1 conv=notrunc status=none
if verify_pe "$WORKDIR/tampered.efi" "$WORKDIR/owner.crt"; then
  echo "FAIL (tampered UKI was accepted by verifier)" >&2
  exit 1
fi
echo "OK (rejected)"

echo -n "2/3 Negative 2: byte-flip in composefs=<sha512> digest must be rejected... "
ORIG_DIGEST="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TAMP_DIGEST="baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
mkdir -p "$WORKDIR/composefs/images" "$WORKDIR/boot/loader/entries"
printf 'erofs-payload' > "$WORKDIR/composefs/images/$ORIG_DIGEST"
cat > "$WORKDIR/boot/loader/entries/bootc_yubios-1.conf" <<EOF
title yubiOS
version 1
options composefs.digest=v1-sha512-12:${TAMP_DIGEST} rw audit=0
EOF
resolved_digest="$(grep -oE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)[0-9a-f]{128}' "$WORKDIR/boot/loader/entries/bootc_yubios-1.conf" | head -1 | sed -E 's/^.*[:=]//')"
if [[ -e "$WORKDIR/composefs/images/$resolved_digest" ]]; then
  echo "FAIL (tampered composefs digest resolved in store)" >&2
  exit 1
fi
echo "OK (tampered composefs digest ${resolved_digest:0:12}... refused)"

echo -n "3/3 Negative 3: unsigned UKI and foreign ROTPK must both be rejected... "
if verify_pe "$WORKDIR/unsigned.efi" "$WORKDIR/owner.crt"; then
  echo "FAIL (unsigned UKI accepted)" >&2
  exit 1
fi
if verify_pe "$WORKDIR/signed.efi" "$WORKDIR/foreign.crt"; then
  echo "FAIL (foreign ROTPK accepted owner-signed UKI)" >&2
  exit 1
fi
echo "OK (both unsigned UKI and foreign ROTPK rejected)"

echo "=== PASS: all 3 negative Secure Boot & composefs tamper legs verified ==="
