#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS FIDO2-only Secure Boot signing path
#
# ADR-002 notes PIV/CCID as the accepted path. This script implements the
# alternative: wrapping a software ECDSA key with FIDO2 HMAC-secret (hidraw only).
#
# Flow:
#   1. Generate an EC P-256 key pair on host (plaintext, ephemeral)
#   2. Derive a 32-byte wrapping key via FIDO2 HMAC-secret extension
#   3. Encrypt the private key with age + age-plugin-fido2-hmac
#   4. Delete the plaintext key — only the encrypted blob remains on disk
#   5. At sign time: FIDO2 HMAC-secret decrypts the key, systemd-sbsign runs, key wiped
#
# Dependencies: age, age-plugin-fido2-hmac, openssl, systemd-sbsign (systemd >= 257, ADR-008)
# Source: https://github.com/nicowillis/age-plugin-fido2-hmac
# Source: FIDO2 HMAC-secret extension — CTAP 2.0 s6.3.2
#
# Status: EXPERIMENTAL — see ADR-002 for production recommendation (PIV).
set -euo pipefail
source /usr/lib/yubiOS/lib.sh

command -v age >/dev/null            || yubiOS_die "age not installed: dnf install age"
command -v age-plugin-fido2-hmac >/dev/null || \
  yubiOS_die "age-plugin-fido2-hmac not installed. See: https://github.com/nicowillis/age-plugin-fido2-hmac"

KEYDIR=/var/lib/yubiOS/fido2-sb
mkdir -p "$KEYDIR" && chmod 700 "$KEYDIR"

PLAIN_KEY="$KEYDIR/sb-key.pem"
ENC_KEY="$KEYDIR/sb-key.pem.age"
CERT_PEM="$KEYDIR/sb-cert.pem"

yubiOS_log "Generating EC P-256 Secure Boot signing key..."
openssl ecparam -name prime256v1 -genkey -noout -out "$PLAIN_KEY"
openssl req -new -x509 -key "$PLAIN_KEY" \
  -subj "/CN=yubiOS FIDO2 Secure Boot" \
  -days 3650 -out "$CERT_PEM"

yubiOS_log "Encrypting key with FIDO2 HMAC-secret (touch U2F/HSM)..."
age -r "$(age-plugin-fido2-hmac --generate)" \
    -o "$ENC_KEY" "$PLAIN_KEY"

yubiOS_log "Wiping plaintext key from disk..."
shred -u "$PLAIN_KEY"

echo ""
echo "FIDO2-wrapped Secure Boot key enrolled."
echo "  Encrypted key: $ENC_KEY"
echo "  Certificate:   $CERT_PEM"
echo ""
echo "To sign UKIs (touch required):"
echo "  /usr/lib/yubiOS/sign-uki-fido2.sh /path/to/image.efi"
