#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS owner Secure Boot enrollment and signing, run on the booted board.
#
# Phases:
#   enroll : only in setup mode. Makes PK, KEK, db from the YubiKey PIV slot 9a
#            key (signing only, SIGN.md steps 1-3), writes PK, KEK, db through the
#            StMM variable store with efi-updatevar, then verifies them.
#   resign : signs the systemd-boot loader and every UKI on the ESP with the db
#            key (slot 9a), and verifies each signature against db.crt.
#   all    : enroll, then resign. Never reboots. Reboot only after resign passes,
#            because the next boot enforces Secure Boot.
#
# Requires: ykman, libykcs11 (YUBIOS_PKCS11_LIB), efitools (cert-to-efi-sig-list,
# sign-efi-sig-list, efi-updatevar, efi-readvar), pkcs11-provider, openssl,
# systemd-sbsign, sbverify (sbsigntools). Keys are RSA-2048 (UEFI needs RSA).
# Owner keys only. No CI keys. Slot 9a (2026-10-11).

set -euo pipefail
source /usr/lib/yubiOS/lib.sh

PHASE="${1:-all}"
ESP="${YUBIOS_ESP:-/efi}"
[ -d "$ESP/EFI" ] || ESP=/boot/efi
KEYDIR=/var/lib/yubiOS/secureboot
ENROLLED_MARK=/var/lib/yubiOS/.sb-enrolled
SB_KEY_URI="pkcs11:id=%01;type=private"
OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
CN_PREFIX="${YUBIOS_CN_PREFIX:-YUBIOS}"
DAYS=1826
EFIVARS=/sys/firmware/efi/efivars
GUID_GLOBAL=8be4df61-93ca-11d2-aa0d-00e098032b8c
PKCS11_LIB="${YUBIOS_PKCS11_LIB:-}"
if [ -z "$PKCS11_LIB" ]; then
  for c in /usr/lib64/libykcs11.so /usr/lib64/libykcs11.so.2 /usr/lib/libykcs11.so; do
    if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
  done
fi
[ -n "$PKCS11_LIB" ] || { echo "libykcs11 not found; set YUBIOS_PKCS11_LIB" >&2; exit 1; }
export PKCS11_MODULE_PATH="$PKCS11_LIB"
export PKCS11_PROVIDER_MODULE="$PKCS11_LIB"
T="$(date +%Y-%m-%d) 00:00:00"

for tool in ykman openssl cert-to-efi-sig-list sign-efi-sig-list efi-updatevar efi-readvar systemd-sbsign sbverify; do
  command -v "$tool" >/dev/null || { yubiOS_log "missing tool: $tool"; exit 1; }
done

setup_mode() {
  # SetupMode is 1 while no PK is enrolled. The data byte follows a 4-byte attribute header.
  local f="$EFIVARS/SetupMode-$GUID_GLOBAL"
  [ -r "$f" ] || { yubiOS_log "SetupMode not readable; is efivarfs mounted?"; return 2; }
  od -An -t u1 -j4 -N1 "$f" | tr -d ' '
}

require_slot_9a() {
  mkdir -p "$KEYDIR"
  ykman piv keys export 9a "$KEYDIR/slot9a-pub.pem" >/dev/null 2>&1 || {
    yubiOS_log "No key in PIV slot 9a. Mint it first: ykman piv keys generate -a RSA2048 --pin-policy ALWAYS --touch-policy ALWAYS 9a <pub.pem>"
    exit 1
  }
  openssl pkey -pubin -in "$KEYDIR/slot9a-pub.pem" -noout -text | grep -q '(2048 bit)' || {
    yubiOS_log "Slot 9a key is not RSA-2048. UEFI needs RSA."
    exit 1
  }
}

phase_enroll() {
  local sm
  sm="$(setup_mode)" || exit 1
  if [ "$sm" != "1" ]; then
    yubiOS_log "Not in setup mode (SetupMode=$sm). Refusing to write keys."
    exit 1
  fi
  if [ -f "$ENROLLED_MARK" ]; then
    yubiOS_log "Already enrolled ($ENROLLED_MARK). Refusing to write again."
    exit 1
  fi
  require_slot_9a
  cd "$KEYDIR"

  yubiOS_log "PK: self-signed certificate on slot 9a (PIN and touch)"
  openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$SB_KEY_URI" \
    -subj "/CN=${CN_PREFIX} PK/" -out PK.crt -nodes -days "$DAYS"
  cert-to-efi-sig-list -g "$OWNER_GUID" PK.crt PK.esl
  sign-efi-sig-list -c PK.crt -t "$T" -o PK PK.esl PK.forsig
  openssl smime -sign -binary -provider pkcs11 -provider default -in PK.forsig -out PK.signed \
    -signer PK.crt -inkey "$SB_KEY_URI" -outform DER -md sha256
  sign-efi-sig-list -i PK.signed -t "$T" PK PK.esl PK.auth

  yubiOS_log "KEK: certificate signed by PK (PIN and touch)"
  openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$SB_KEY_URI" \
    -subj "/CN=${CN_PREFIX} KEK/" -out KEK.crt -nodes -days "$DAYS"
  cert-to-efi-sig-list -g "$OWNER_GUID" KEK.crt KEK.esl
  sign-efi-sig-list -c PK.crt -t "$T" -o KEK KEK.esl KEK.forsig
  openssl smime -sign -binary -provider pkcs11 -provider default -in KEK.forsig -out KEK.signed \
    -signer PK.crt -inkey "$SB_KEY_URI" -outform DER -md sha256
  sign-efi-sig-list -i KEK.signed -t "$T" KEK KEK.esl KEK.auth

  yubiOS_log "db: certificate signed by KEK (PIN and touch)"
  openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$SB_KEY_URI" \
    -subj "/CN=${CN_PREFIX} db/" -out db.crt -nodes -days "$DAYS"
  cert-to-efi-sig-list -g "$OWNER_GUID" db.crt db.esl
  sign-efi-sig-list -c KEK.crt -t "$T" -o db db.esl db.forsig
  openssl smime -sign -binary -provider pkcs11 -provider default -in db.forsig -out db.signed \
    -signer KEK.crt -inkey "$SB_KEY_URI" -outform DER -md sha256
  sign-efi-sig-list -i db.signed -t "$T" db db.esl db.auth

  yubiOS_log "Writing PK, KEK, db through the StMM store"
  efi-updatevar -f PK.auth PK
  efi-updatevar -f KEK.auth KEK
  efi-updatevar -f db.auth db

  yubiOS_log "Verifying enrolled variables"
  for v in PK KEK db; do efi-readvar -v "$v"; done
  [ "$(setup_mode)" = "0" ] || { yubiOS_log "SetupMode still 1 after PK write"; exit 1; }
  openssl x509 -in db.crt -outform DER -out "$KEYDIR/yubiOS-db.cer"
  touch "$ENROLLED_MARK"
  yubiOS_log "Keys enrolled. Next: resign the loader and UKIs before any reboot."
}

phase_resign() {
  require_slot_9a
  [ -f "$KEYDIR/db.crt" ] || { yubiOS_log "db.crt missing. Run the enroll phase first."; exit 1; }
  local -a images=()
  local f
  for f in "$ESP"/EFI/systemd/systemd-bootaa64.efi "$ESP"/EFI/BOOT/BOOTAA64.EFI "$ESP"/EFI/Linux/*.efi; do
    [ -f "$f" ] && images+=("$f")
  done
  [ "${#images[@]}" -gt 0 ] || { yubiOS_log "No loader or UKI found under $ESP"; exit 1; }
  for f in "${images[@]}"; do
    yubiOS_log "Signing with the db key (touch): $f"
    local tmp
    tmp="$(mktemp "$KEYDIR/signed-XXXXXX.efi")"
    systemd-sbsign sign \
      --private-key "$SB_KEY_URI" \
      --private-key-source "provider:pkcs11" \
      --certificate "$KEYDIR/db.crt" \
      --certificate-source file \
      --output "$tmp" \
      "$f"
    if ! sbverify --cert "$KEYDIR/db.crt" "$tmp" >/dev/null; then
      rm -f "$tmp"
      yubiOS_log "Signature did not verify against db.crt: $f. Original left in place."
      exit 1
    fi
    mv -f "$tmp" "$f"
  done
  yubiOS_log "Resigned ${#images[@]} image(s) with the db key. Reboot is now safe."
}

case "$PHASE" in
  enroll) phase_enroll ;;
  resign) phase_resign ;;
  all)    phase_enroll; phase_resign ;;
  *)      echo "usage: enroll-sb.sh [enroll|resign|all]"; exit 2 ;;
esac

echo "Done. Do not reboot until resign reports success. The next boot enforces Secure Boot."
