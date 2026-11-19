#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/uki/stage-ci-sb-keys.sh
#
# Stages the initial Secure Boot key hierarchy (PK, KEK, db: .crt, .esl, .auth,
# and yubiOS-db.cer) using the exact PKCS#11 flow from usr/lib/yubiOS/enroll-sb.sh:
#   1. If a physical YubiKey (USB VID 1050) is present, uses YubiKey PIV slot 9a
#      via libykcs11.so + openssl pkcs11 provider + efitools.
#   2. If no physical YubiKey is attached, opts for the swu2f path (/dev/uhid
#      passless authenticator + SoftHSM2 PKCS#11 slot 9a/01 token) and runs the
#      exact same enroll-sb.sh openssl -provider pkcs11 + efitools commands.
#   3. Stages the resulting files into the enroll-sb.sh locations:
#        - usr/lib/yubiOS/secureboot/
#        - var/lib/yubiOS/secureboot/ (when writable)
#        - repro-evidence/secureboot/
#        - repro-evidence/EFI/yubiOS/secureboot/
#      with mtimes clamped to SOURCE_DATE_EPOCH for reproducible builds.

set -euo pipefail

REPO_ROOT="${1:-.}"
cd "$REPO_ROOT"

EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
case "$EPOCH" in
  ''|*[!0-9]*) EPOCH=1700000000 ;;
esac
[ "$EPOCH" -gt 0 ] || EPOCH=1700000000

OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGM_KEY="010203040506070801020304050607080102030405060708"
CN_PREFIX="${YUBIOS_CN_PREFIX:-YUBIOS}"
DAYS=1826
T_STR="$(date -u -d "@${EPOCH}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%d 00:00:00')"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

sync_host_dev() {
  if [ -d /host-dev ]; then
    if [ -e /host-dev/uhid ] && [ ! -e /dev/uhid ]; then
      ln -sf /host-dev/uhid /dev/uhid 2>/dev/null || true
    fi
    local hd
    for hd in /host-dev/hidraw*; do
      [ -e "$hd" ] || continue
      if [ ! -e "/dev/$(basename "$hd")" ]; then
        ln -sf "$hd" "/dev/$(basename "$hd")" 2>/dev/null || true
      fi
    done
    if [ -d /host-dev/bus/usb ] && [ ! -d /dev/bus/usb ]; then
      mkdir -p /dev/bus
      ln -sf /host-dev/bus/usb /dev/bus/usb 2>/dev/null || true
    fi
  fi
}

sync_host_dev

has_physical_yubikey() {
  local d
  for d in /sys/bus/usb/devices/*/idVendor; do
    [ -r "$d" ] || continue
    if [ "$(cat "$d" 2>/dev/null || true)" = "1050" ]; then
      return 0
    fi
  done
  if command -v lsusb >/dev/null 2>&1 && lsusb 2>/dev/null | grep -qi '1050:'; then
    return 0
  fi
  if command -v ykman >/dev/null 2>&1 && ykman list 2>/dev/null | grep -qi yubikey; then
    return 0
  fi
  return 1
}

find_ykcs11() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/libykcs11.so \
    /usr/lib/aarch64-linux-gnu/libykcs11.so.2 \
    /usr/lib/x86_64-linux-gnu/libykcs11.so \
    /usr/lib/x86_64-linux-gnu/libykcs11.so.2 \
    /usr/lib64/libykcs11.so \
    /usr/lib64/libykcs11.so.2; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

find_softhsm2() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/softhsm/libsofthsm2.so \
    /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so \
    /usr/lib64/pkcs11/libsofthsm2.so \
    /usr/lib64/libsofthsm2.so \
    /usr/lib/softhsm/libsofthsm2.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

find_pkcs11_ossl_module() {
  local cand
  for cand in \
    /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11.so \
    /usr/lib/x86_64-linux-gnu/ossl-modules/pkcs11.so \
    /usr/lib64/ossl-modules/pkcs11.so \
    /usr/lib/ossl-modules/pkcs11.so; do
    if [ -e "$cand" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  return 1
}

# Exact enroll-sb.sh PKCS#11 enrollment ceremony (PK, KEK, db) against PKCS11_LIB + SB_KEY_URI
enroll_sb_pkcs11_ceremony() {
  local pkcs11_lib="$1"
  local sb_key_uri="$2"
  export PKCS11_MODULE_PATH="$pkcs11_lib"
  export PKCS11_PROVIDER_MODULE="$pkcs11_lib"

  local ossl_mod
  if ossl_mod="$(find_pkcs11_ossl_module)"; then
    cat > "$WORK_DIR/openssl-pkcs11.cnf" <<EOF
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
pkcs11 = pkcs11_sect

[default_sect]
activate = 1

[pkcs11_sect]
module = $ossl_mod
pkcs11-module-path = $pkcs11_lib
pkcs11-module-quirks = no-deinit no-operation-state
activate = 1

[req]
distinguished_name = req_dn
prompt = no

[req_dn]
CN = ${CN_PREFIX}
EOF
    export OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf"
  fi

  (
    cd "$WORK_DIR"
    echo "[stage-ci-sb-keys] PK: self-signed certificate via PKCS#11 ($pkcs11_lib)"
    openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$sb_key_uri" \
      -subj "/CN=${CN_PREFIX} PK/" -out PK.crt -nodes -days "$DAYS"
    cert-to-efi-sig-list -g "$OWNER_GUID" PK.crt PK.esl
    sign-efi-sig-list -c PK.crt -t "$T_STR" -o PK PK.esl PK.forsig
    openssl smime -sign -binary -provider pkcs11 -provider default -in PK.forsig -out PK.signed \
      -signer PK.crt -inkey "$sb_key_uri" -outform DER -md sha256
    sign-efi-sig-list -i PK.signed -t "$T_STR" PK PK.esl PK.auth

    echo "[stage-ci-sb-keys] KEK: certificate signed by PK via PKCS#11"
    openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$sb_key_uri" \
      -subj "/CN=${CN_PREFIX} KEK/" -out KEK.crt -nodes -days "$DAYS"
    cert-to-efi-sig-list -g "$OWNER_GUID" KEK.crt KEK.esl
    sign-efi-sig-list -c PK.crt -t "$T_STR" -o KEK KEK.esl KEK.forsig
    openssl smime -sign -binary -provider pkcs11 -provider default -in KEK.forsig -out KEK.signed \
      -signer PK.crt -inkey "$sb_key_uri" -outform DER -md sha256
    sign-efi-sig-list -i KEK.signed -t "$T_STR" KEK KEK.esl KEK.auth

    echo "[stage-ci-sb-keys] db: certificate signed by KEK via PKCS#11"
    openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$sb_key_uri" \
      -subj "/CN=${CN_PREFIX} db/" -out db.crt -nodes -days "$DAYS"
    cert-to-efi-sig-list -g "$OWNER_GUID" db.crt db.esl
    sign-efi-sig-list -c KEK.crt -t "$T_STR" -o db db.esl db.forsig
    openssl smime -sign -binary -provider pkcs11 -provider default -in db.forsig -out db.signed \
      -signer KEK.crt -inkey "$sb_key_uri" -outform DER -md sha256
    sign-efi-sig-list -i db.signed -t "$T_STR" db db.esl db.auth

    openssl x509 -in db.crt -outform DER -out yubiOS-db.cer
  )
}

stage_via_yubikey() {
  echo "[stage-ci-sb-keys] Physical YubiKey (1050:*) detected; using hardware PIV slot 9a"
  if [ ! -S /run/pcscd/pcscd.comm ]; then
    pcscd 2>/dev/null || true
    sleep 1
  fi
  local pkcs11_lib
  pkcs11_lib="$(find_ykcs11)" || return 1

  if ! ykman piv keys export 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1; then
    ykman piv keys generate -m "$PIV_MGM_KEY" --algorithm RSA2048 --pin-policy ONCE --touch-policy NEVER 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
  fi
  if ! ykman piv certificates export 9a "$WORK_DIR/slot9a-init.crt" >/dev/null 2>&1 || [ ! -s "$WORK_DIR/slot9a-init.crt" ]; then
    ykman piv certificates generate -m "$PIV_MGM_KEY" -P "$PIV_PIN" -s "CN=${CN_PREFIX} PIV" -d "$DAYS" 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
  fi

  enroll_sb_pkcs11_ceremony "$pkcs11_lib" "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}"
}

stage_via_swu2f() {
  echo "[stage-ci-sb-keys] No physical YubiKey attached; opting for swu2f + SoftHSM PKCS#11 slot 9a fallback"
  local passless_pid=""
  if command -v passless >/dev/null 2>&1 && [ -e /dev/uhid ]; then
    mkdir -p "$WORK_DIR/passless/storage" "$WORK_DIR/passless/config"
    HOME="$WORK_DIR" XDG_DATA_HOME="$WORK_DIR/passless" XDG_CONFIG_HOME="$WORK_DIR/passless/config" \
      PASSLESS_E2E_AUTO_ACCEPT_UV=1 PASSLESS_LOG_STYLE=never \
      passless --backend-type local --local-path "$WORK_DIR/passless/storage" >/dev/null 2>&1 &
    passless_pid=$!
    sleep 1
    sync_host_dev
  fi
  if command -v fido2-token >/dev/null 2>&1; then
    fido2-token -L 2>/dev/null || true
  fi

  local softhsm_lib
  softhsm_lib="$(find_softhsm2)" || {
    if [ -n "$passless_pid" ]; then kill "$passless_pid" 2>/dev/null || true; fi
    echo "ERROR: libsofthsm2.so not found for swu2f PKCS#11 fallback" >&2
    return 1
  }

  # Initialize SoftHSM token using the canonical ci_mkosi-installer.yml / ci_test_sealed-uki-vm.yml
  # softhsm2-util --import pattern so both CKO_PRIVATE_KEY and CKO_PUBLIC_KEY carry full attributes.
  mkdir -p "$WORK_DIR/softhsm/tokens"
  cat > "$WORK_DIR/softhsm/softhsm2.conf" <<EOF
directories.tokendir = $WORK_DIR/softhsm/tokens
objectstore.backend = file
log.level = ERROR
EOF
  export SOFTHSM2_CONF="$WORK_DIR/softhsm/softhsm2.conf"

  openssl genrsa -out "$WORK_DIR/slot9a.key" 2048 >/dev/null 2>&1
  openssl pkcs8 -topk8 -nocrypt -in "$WORK_DIR/slot9a.key" -out "$WORK_DIR/slot9a.p8"
  rm -f "$WORK_DIR/slot9a.key"
  softhsm2-util --init-token --free --label yubiOS-ci --pin "$PIV_PIN" --so-pin "$PIV_PIN" >/dev/null
  softhsm2-util --import "$WORK_DIR/slot9a.p8" --token yubiOS-ci --label "PIV AUTH key" --id 01 --pin "$PIV_PIN" >/dev/null
  rm -f "$WORK_DIR/slot9a.p8"

  enroll_sb_pkcs11_ceremony "$softhsm_lib" "pkcs11:token=yubiOS-ci;id=%01;type=private?pin-value=${PIV_PIN}"
  local rc=$?
  if [ -n "$passless_pid" ]; then kill "$passless_pid" 2>/dev/null || true; fi
  return "$rc"
}

if has_physical_yubikey && stage_via_yubikey; then
  echo "[stage-ci-sb-keys] Staged Secure Boot keys via physical YubiKey PIV slot 9a"
else
  stage_via_swu2f
  echo "[stage-ci-sb-keys] Staged Secure Boot keys via swu2f + SoftHSM PKCS#11 fallback"
fi

for target_dir in \
  "usr/lib/yubiOS/secureboot" \
  "repro-evidence/secureboot" \
  "repro-evidence/EFI/yubiOS/secureboot"; do
  mkdir -p "$target_dir"
  for fn in PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl PK.auth KEK.auth db.auth yubiOS-db.cer; do
    cp -f "$WORK_DIR/$fn" "$target_dir/$fn"
    chmod 0644 "$target_dir/$fn"
    touch -h -d "@${EPOCH}" "$target_dir/$fn"
  done
  touch -h -d "@${EPOCH}" "$target_dir"
done

if [ "$REPO_ROOT" = "/" ]; then
  mkdir -p /var/lib/yubiOS/secureboot /boot/EFI/yubiOS/secureboot
  cp -f "$WORK_DIR"/*.crt "$WORK_DIR"/*.esl "$WORK_DIR"/*.auth "$WORK_DIR/yubiOS-db.cer" /var/lib/yubiOS/secureboot/ 2>/dev/null || true
  cp -f "$WORK_DIR"/*.crt "$WORK_DIR"/*.esl "$WORK_DIR"/*.auth "$WORK_DIR/yubiOS-db.cer" /boot/EFI/yubiOS/secureboot/ 2>/dev/null || true
fi

ls -la usr/lib/yubiOS/secureboot/
