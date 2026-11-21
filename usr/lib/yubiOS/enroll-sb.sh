#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS owner Secure Boot enrollment and signing, run on the booted board.
#
# Phases:
#   enroll : only in setup mode. Makes PK, KEK, db from the U2F/HSM PIV slot 9a
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
# Paths default to production; YUBIOS_* overrides exist so tests/unit/test-enroll-sb.bats
# can run unprivileged without a U2F/HSM or a mounted efivarfs.
# shellcheck source=usr/lib/yubiOS/lib.sh
source "${YUBIOS_LIB_SH:-/usr/lib/yubiOS/lib.sh}"
export PATH="$PATH:/usr/lib/systemd:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

PHASE="${1:-all}"
ESP="${YUBIOS_ESP:-/efi}"
for _esp_cand in "$ESP" /boot/efi /boot; do
  if [ -d "$_esp_cand/EFI" ]; then ESP="$_esp_cand"; break; fi
done
KEYDIR="${YUBIOS_SB_KEYDIR:-/var/lib/yubiOS/secureboot}"
if [ -n "${YUBIOS_SYSTEM_SB_KEYDIR:-}" ]; then
  SYSTEM_KEYDIR="$YUBIOS_SYSTEM_SB_KEYDIR"
elif [ -n "${YUBIOS_SB_KEYDIR:-}" ]; then
  SYSTEM_KEYDIR="$YUBIOS_SB_KEYDIR"
else
  SYSTEM_KEYDIR="/usr/lib/yubiOS/secureboot"
fi
ENROLLED_MARK="${YUBIOS_SB_ENROLLED_MARK:-/var/lib/yubiOS/.sb-enrolled}"
SB_KEY_URI="pkcs11:id=%01;type=private"
OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
CN_PREFIX="${YUBIOS_CN_PREFIX:-YUBIOS}"
DAYS=1826
EFIVARS="${YUBIOS_EFIVARS:-/sys/firmware/efi/efivars}"
GUID_GLOBAL=8be4df61-93ca-11d2-aa0d-00e098032b8c
PKCS11_LIB="${YUBIOS_PKCS11_LIB:-}"
if [ -z "$PKCS11_LIB" ] || [ ! -e "$PKCS11_LIB" ]; then
  for c in /usr/lib64/libykcs11.so /usr/lib64/libykcs11.so.2 /usr/lib/libykcs11.so /usr/lib/aarch64-linux-gnu/libykcs11.so; do
    if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
  done
fi
[ -n "$PKCS11_LIB" ] || { echo "libykcs11 not found; set YUBIOS_PKCS11_LIB" >&2; exit 1; }
export PKCS11_MODULE_PATH="$PKCS11_LIB"
export PKCS11_PROVIDER_MODULE="$PKCS11_LIB"
T="$(date -u -d '+1 day' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%d %H:%M:%S')"

for tool in ykman openssl cert-to-efi-sig-list sign-efi-sig-list efi-updatevar efi-readvar systemd-sbsign sbverify; do
  command -v "$tool" >/dev/null || { yubiOS_log "missing tool: $tool"; exit 1; }
done

ensure_efivars_rw() {
  if [ "$EFIVARS" = "/sys/firmware/efi/efivars" ]; then
    modprobe tee 2>/dev/null || true
    modprobe optee 2>/dev/null || true
    modprobe tee_stmm_efi 2>/dev/null || true
    modprobe efivarfs 2>/dev/null || true
    if [ -d "$EFIVARS" ]; then
      if mountpoint -q "$EFIVARS" 2>/dev/null; then
        mount -o remount,rw "$EFIVARS" 2>/dev/null || {
          umount "$EFIVARS" 2>/dev/null || true
          mount -t efivarfs -o rw efivarfs "$EFIVARS" 2>/dev/null || true
        }
      else
        mount -t efivarfs -o rw efivarfs "$EFIVARS" 2>/dev/null || true
      fi
      chattr -i "$EFIVARS"/PK-* "$EFIVARS"/KEK-* "$EFIVARS"/db-* 2>/dev/null || true
    fi
  fi
}

setup_mode() {
  # SetupMode is 1 while no PK is enrolled. The data byte follows a 4-byte attribute header.
  ensure_efivars_rw
  local f="$EFIVARS/SetupMode-$GUID_GLOBAL"
  [ -r "$f" ] || { yubiOS_log "SetupMode not readable; is efivarfs mounted?" >&2; return 2; }
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
  if [ "$sm" != "1" ] && [ ! -f "$ENROLLED_MARK" ]; then
    local pk_null=""
    local cand
    for cand in \
      "$ESP/EFI/yubiOS/keys/PK_null.auth" \
      "$ESP/EFI/yubiOS/secureboot/PK_null.auth" \
      "$KEYDIR/PK_null.auth" \
      "$SYSTEM_KEYDIR/PK_null.auth"; do
      if [ -f "$cand" ]; then
        pk_null="$cand"
        break
      fi
    done
    if [ -n "$pk_null" ]; then
      yubiOS_log "SetupMode=$sm: applying initial $pk_null to clear PK and enter SetupMode=1"
      ensure_efivars_rw
      if efi-updatevar -f "$pk_null" PK; then
        sm="$(setup_mode)" || exit 1
      fi
    fi
    if [ "$sm" != "1" ] && [ -f "$KEYDIR/PK.crt" ]; then
      yubiOS_log "SetupMode=$sm: signing blank ESL with $KEYDIR/PK.crt (slot 9a) to clear partial PK and enter SetupMode=1"
      : > "$KEYDIR/null.esl"
      sign-efi-sig-list -c "$KEYDIR/PK.crt" -t "$T" -o PK "$KEYDIR/null.esl" "$KEYDIR/PK_owner_null.forsig"
      if openssl smime -sign -binary -provider pkcs11 -provider default \
        -in "$KEYDIR/PK_owner_null.forsig" -out "$KEYDIR/PK_owner_null.signed" \
        -signer "$KEYDIR/PK.crt" -inkey "$SB_KEY_URI" -outform DER -md sha256; then
        sign-efi-sig-list -i "$KEYDIR/PK_owner_null.signed" -t "$T" PK "$KEYDIR/null.esl" "$KEYDIR/PK_owner_null.auth"
        ensure_efivars_rw
        if efi-updatevar -f "$KEYDIR/PK_owner_null.auth" PK; then
          sm="$(setup_mode)" || exit 1
          T="$(date -u -d '+1 day +1 minute' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%d %H:%M:%S')"
        fi
      fi
      rm -f "$KEYDIR/PK_owner_null.forsig" "$KEYDIR/PK_owner_null.signed" "$KEYDIR/PK_owner_null.auth" 2>/dev/null || true
    fi
  fi
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

  yubiOS_log "Writing db, KEK, PK through the StMM store (PK last to lock User Mode)"
  ensure_efivars_rw
  efi-updatevar -f db.auth db
  ensure_efivars_rw
  efi-updatevar -f KEK.auth KEK
  ensure_efivars_rw
  efi-updatevar -f PK.auth PK

  yubiOS_log "Verifying enrolled variables"
  for v in PK KEK db; do efi-readvar -v "$v"; done
  [ "$(setup_mode)" = "0" ] || { yubiOS_log "SetupMode still 1 after PK write"; exit 1; }
  openssl x509 -in db.crt -outform DER -out "$KEYDIR/yubiOS-db.cer"
  rm -f "$KEYDIR/PK_null.auth" "$KEYDIR/null.esl" 2>/dev/null || true
  if [ -d "$ESP/EFI" ]; then
    mkdir -p "$ESP/EFI/yubiOS/secureboot" "$ESP/EFI/yubiOS/keys" 2>/dev/null || true
    rm -f "$ESP/EFI/yubiOS/secureboot/PK_null.auth" "$ESP/EFI/yubiOS/secureboot/null.esl" \
          "$ESP/EFI/yubiOS/keys/PK_null.auth" "$ESP/EFI/yubiOS/keys/null.esl" 2>/dev/null || true
    cp -f PK.auth KEK.auth db.auth PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl "$KEYDIR/yubiOS-db.cer" "$ESP/EFI/yubiOS/secureboot/" 2>/dev/null || true
    cp -f PK.auth KEK.auth db.auth PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl "$KEYDIR/yubiOS-db.cer" "$ESP/EFI/yubiOS/keys/" 2>/dev/null || true
  fi
  touch "$ENROLLED_MARK"
  yubiOS_log "Keys enrolled. Next: resign the loader and UKIs before any reboot."
}

phase_resign() {
  require_slot_9a
  [ -f "$KEYDIR/db.crt" ] || { yubiOS_log "db.crt missing. Run the enroll phase first."; exit 1; }
  local -a images=()
  local f
  for f in "$ESP"/EFI/systemd/systemd-bootaa64.efi "$ESP"/EFI/systemd/systemd-bootx64.efi "$ESP"/EFI/BOOT/BOOTAA64.EFI "$ESP"/EFI/BOOT/BOOTX64.EFI "$ESP"/EFI/Linux/*.efi "$ESP"/EFI/Linux/bootc/*.efi; do
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
  local uki_sync="${YUBIOS_UKI_SYNC_SH:-/usr/lib/yubiOS/uki/uki-sync-and-sign.sh}"
  if [ -x "$uki_sync" ]; then
    YUBIOS_ESP="$ESP" YUBIOS_SB_KEYDIR="$KEYDIR" YUBIOS_SB_ENROLLED_MARK="$ENROLLED_MARK"       "$uki_sync" --reason "enroll-sb-resign" --from-signed-esp --esp "$ESP" --keydir "$KEYDIR" || true
  fi
  yubiOS_log "Resigned ${#images[@]} image(s) with the db key. Reboot is now safe."
}

phase_prebuilt() {
  local sm
  sm="$(setup_mode)" || exit 1
  if [ "$sm" != "1" ]; then
    yubiOS_log "Not in setup mode (SetupMode=$sm). Refusing to write keys."
    exit 1
  fi
  local src_dir=""
  for cand in "$ESP/EFI/yubiOS/secureboot" "$ESP/EFI/yubiOS/keys" "/usr/lib/yubiOS/secureboot" "$KEYDIR"; do
    if [ -f "$cand/PK.auth" ] && [ -f "$cand/KEK.auth" ] && [ -f "$cand/db.auth" ]; then
      src_dir="$cand"
      break
    fi
  done
  [ -n "$src_dir" ] || { yubiOS_log "No prebuilt PK.auth/KEK.auth/db.auth found under $ESP/EFI/yubiOS/{secureboot,keys} or /usr/lib/yubiOS/secureboot"; exit 1; }
  install -d -m 0700 "$KEYDIR"
  if [ "$src_dir" != "$KEYDIR" ]; then
    cp -f "$src_dir"/* "$KEYDIR/" 2>/dev/null || true
  fi
  yubiOS_log "Writing prebuilt db, KEK, PK from $src_dir through the StMM store"
  ensure_efivars_rw
  efi-updatevar -f "$src_dir/db.auth" db
  ensure_efivars_rw
  efi-updatevar -f "$src_dir/KEK.auth" KEK
  ensure_efivars_rw
  efi-updatevar -f "$src_dir/PK.auth" PK
  for v in PK KEK db; do efi-readvar -v "$v"; done
  [ "$(setup_mode)" = "0" ] || { yubiOS_log "SetupMode still 1 after PK write"; exit 1; }
  touch "$ENROLLED_MARK"
  yubiOS_log "Prebuilt Secure Boot keys enrolled (SetupMode=0)."
}

case "$PHASE" in
  enroll)   phase_enroll ;;
  resign)   phase_resign ;;
  prebuilt) phase_prebuilt ;;
  all)      phase_enroll; phase_resign ;;
  *)        echo "usage: enroll-sb.sh [enroll|resign|all] (or prebuilt)"; exit 2 ;;
esac

echo "Done. Do not reboot until resign reports success. The next boot enforces Secure Boot."
