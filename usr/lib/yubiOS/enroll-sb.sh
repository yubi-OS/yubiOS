#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS owner Secure Boot signing with YubiKey PIV slot 9a.
#
# Signing only. Makes the PK, KEK and db certificates, the signed EFI signature
# lists (.auth) and signs the UKIs with the db key. It does not run the
# mutable-U-Boot enrollment steps from 0mniteck/U-Boot Docs SIGN.md. The
# immutable U-Boot variable store is baked at CI build time for non-StMM builds
# from the owner's public .auth material.
#
# Slot 9a replaces the slot 9c choice in ADR-002 for Secure Boot signing (2026-10-11).
#
# Requires: ykman, libykcs11 (YUBIOS_PKCS11_LIB), efitools (cert-to-efi-sig-list,
# sign-efi-sig-list), engine_pkcs11 (openssl pkcs11 engine), systemd-sbsign.

set -euo pipefail
source /usr/lib/yubiOS/lib.sh

PIV_SLOT=9a
# SIGN.md uses "-key 1" for PKCS#11 key id 01, which is PIV 9a.
ENGINE_KEY="${YUBIOS_ENGINE_KEY:-1}"
SB_KEY_URI="pkcs11:id=%01;type=private"
OWNER_GUID="${YUBIOS_OWNER_GUID:-cc1e39bc-7c39-11ef-b26d-9b41b973d7e9}"
CN_PREFIX="${YUBIOS_CN_PREFIX:-yubiOS}"
KEYDIR=/var/lib/yubiOS/secureboot
DAYS=1826
export PKCS11_MODULE_PATH="$YUBIOS_PKCS11_LIB"
T="$(date +%Y-%m-%d) 00:00:00"

mkdir -p "$KEYDIR"
cd "$KEYDIR"

yubiOS_log "Checking YubiKey PIV slot $PIV_SLOT for the signing key from YubiKey testing..."
ykman piv info > piv-info.txt
if ! grep -qi "slot $PIV_SLOT" piv-info.txt; then
  yubiOS_log "No key or certificate in PIV slot $PIV_SLOT. Nothing is generated here; mint it in the YubiKey testing step first."
  exit 1
fi

if [ -f PK.auth ] && [ "${YUBIOS_REGENERATE:-0}" != 1 ]; then
  yubiOS_log "PK.auth already exists in $KEYDIR. Set YUBIOS_REGENERATE=1 to remake the key set."
  exit 1
fi

yubiOS_log "PK: self-signed certificate on the 9a key (touch required)"
openssl req -x509 -sha256 -engine pkcs11 -keyform ENGINE -key "$ENGINE_KEY" \
  -subj "/CN=${CN_PREFIX} PK/" -out PK.crt -nodes -days "$DAYS"
cert-to-efi-sig-list -g "$OWNER_GUID" PK.crt PK.esl
sign-efi-sig-list -c PK.crt -t "$T" -o PK PK.esl PK.forsig
openssl smime -sign -binary -engine pkcs11 -keyform ENGINE -in PK.forsig -out PK.signed \
  -signer PK.crt -inkey "$ENGINE_KEY" -outform DER -md sha256
sign-efi-sig-list -i PK.signed -t "$T" PK PK.esl PK.auth

yubiOS_log "KEK: certificate signed by PK (touch required)"
openssl req -x509 -sha256 -engine pkcs11 -keyform ENGINE -key "$ENGINE_KEY" \
  -subj "/CN=${CN_PREFIX} KEK/" -out KEK.crt -nodes -days "$DAYS"
cert-to-efi-sig-list -g "$OWNER_GUID" KEK.crt KEK.esl
sign-efi-sig-list -c PK.crt -t "$T" -o KEK KEK.esl KEK.forsig
openssl smime -sign -binary -engine pkcs11 -keyform ENGINE -in KEK.forsig -out KEK.signed \
  -signer PK.crt -inkey "$ENGINE_KEY" -outform DER -md sha256
sign-efi-sig-list -i KEK.signed -t "$T" KEK KEK.esl KEK.auth

yubiOS_log "db: certificate signed by KEK (touch required)"
openssl req -x509 -sha256 -engine pkcs11 -keyform ENGINE -key "$ENGINE_KEY" \
  -subj "/CN=${CN_PREFIX} db/" -out db.crt -nodes -days "$DAYS"
cert-to-efi-sig-list -g "$OWNER_GUID" db.crt db.esl
sign-efi-sig-list -c KEK.crt -t "$T" -o db db.esl db.forsig
openssl smime -sign -binary -engine pkcs11 -keyform ENGINE -in db.forsig -out db.signed \
  -signer KEK.crt -inkey "$ENGINE_KEY" -outform DER -md sha256
sign-efi-sig-list -i db.signed -t "$T" db db.esl db.auth

openssl x509 -in db.crt -outform DER -out yubiOS-db.cer

yubiOS_log "Signing UKIs with the db key (PIV 9a, touch per signature)..."
for uki in /efi/EFI/Linux/*.efi /boot/EFI/Linux/*.efi; do
  [ -f "$uki" ] || continue
  yubiOS_log "Signing: $uki"
  SIGNED_TMP="$(mktemp /tmp/yubiOS-signed-XXXXXX.efi)"
  systemd-sbsign sign \
    --private-key "$SB_KEY_URI" \
    --private-key-source "engine:pkcs11" \
    --certificate "$KEYDIR/db.crt" \
    --certificate-source file \
    --output "$SIGNED_TMP" \
    "$uki"
  mv -f "$SIGNED_TMP" "$uki"
done

echo "Owner Secure Boot signing complete: $KEYDIR"
echo "  PK.auth KEK.auth db.auth  signed EFI signature lists (public)"
echo "  yubiOS-db.cer             db certificate (public)"
