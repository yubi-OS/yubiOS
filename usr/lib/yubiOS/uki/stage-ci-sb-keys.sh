#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/uki/stage-ci-sb-keys.sh
#
# Stages the initial Secure Boot key hierarchy (PK, KEK, db, PK_null: .crt,
# .esl, .auth, null.esl, and yubiOS-db.cer) using the exact single-certificate
# Slot 9a hierarchy proven on hardware in scripts/flash-device-e2e.sh:
#   - db.crt generated with explicit validity window 2025-01-01..2036-01-01 UTC
#     (before RTC-less / Oct 17 / 2026-01-01 / SOURCE_DATE_EPOCH timestamps)
#   - PK.crt and KEK.crt are exact copies of db.crt (single unified Slot 9a cert)
#   - PK.auth, KEK.auth, db.auth signed by PK.crt at T="2026-01-01 00:00:00"
#   - PK_null.auth (blank null.esl for SetupMode 0->1 unlock) signed by PK.crt
#     at T_NULL="2026-01-01 00:01:00"
#   - Stages all artifacts into usr/lib/yubiOS/secureboot/,
#     /var/lib/yubiOS/secureboot/, /boot/EFI/yubiOS/secureboot/, and
#     /boot/EFI/yubiOS/keys/ with mtimes clamped to SOURCE_DATE_EPOCH.

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
CN_LABEL="${YUBIOS_CN_LABEL:-YUBIOS Test Slot 9a}"
DAYS=1826
NOT_BEFORE="20250101000000Z"
NOT_AFTER="20360101000000Z"
T_STR="2026-01-01 00:00:00"
T_NULL_STR="2026-01-01 00:01:00"

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

has_physical_u2f_hsm() {
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
  if command -v ykman >/dev/null 2>&1 && ykman list 2>/dev/null | grep -qi 'U2F/HSM\|fido\|piv'; then
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

# Exact flash-device-e2e.sh single-cert Slot 9a ceremony (db.crt == PK.crt == KEK.crt,
# PK.auth / KEK.auth / db.auth / PK_null.auth all signed by PK.crt)
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
CN = ${CN_LABEL}
EOF
    export OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf"
  fi

  if [ -z "${LD_PRELOAD:-}" ] && command -v gcc >/dev/null 2>&1; then
    printf '#include <time.h>\ntime_t time(time_t *t){time_t v=1767225600;if(t)*t=v;return v;}\n' > "$WORK_DIR/faketime_sb.c"
    if gcc -shared -fPIC -O2 "$WORK_DIR/faketime_sb.c" -o "$WORK_DIR/libfaketime_sb.so" 2>/dev/null; then
      export LD_PRELOAD="$WORK_DIR/libfaketime_sb.so"
    fi
  fi

  (
    cd "$WORK_DIR"
    echo "[stage-ci-sb-keys] Minting unified Slot 9a certificate ($CN_LABEL, $NOT_BEFORE..$NOT_AFTER) via PKCS#11 ($pkcs11_lib)"
    if ! openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$sb_key_uri" \
      -subj "/CN=${CN_LABEL}" -not_before "$NOT_BEFORE" -not_after "$NOT_AFTER" \
      -out db.crt -nodes; then
      openssl req -x509 -sha256 -provider pkcs11 -provider default -key "$sb_key_uri" \
        -subj "/CN=${CN_LABEL}" -days "$DAYS" -out db.crt -nodes
    fi
    openssl x509 -in db.crt -noout -subject -issuer -dates -fingerprint -sha256
    cp -f db.crt PK.crt
    cp -f db.crt KEK.crt
    openssl x509 -in db.crt -outform DER -out yubiOS-db.cer

    for var in PK KEK db; do
      cert-to-efi-sig-list -g "$OWNER_GUID" "${var}.crt" "${var}.esl"
      sign-efi-sig-list -c PK.crt -t "$T_STR" -o "$var" "${var}.esl" "${var}.forsig"
      openssl smime -sign -binary -provider pkcs11 -provider default \
        -in "${var}.forsig" -out "${var}.signed" \
        -signer PK.crt -inkey "$sb_key_uri" -outform DER -md sha256
      sign-efi-sig-list -i "${var}.signed" -t "$T_STR" "$var" "${var}.esl" "${var}.auth"
    done

    echo "[stage-ci-sb-keys] PK_null: pre-signed blank ESL (null.esl) for SetupMode 0->1 unlock"
    : > null.esl
    sign-efi-sig-list -c PK.crt -t "$T_NULL_STR" -o PK null.esl PK_null.forsig
    openssl smime -sign -binary -provider pkcs11 -provider default \
      -in PK_null.forsig -out PK_null.signed \
      -signer PK.crt -inkey "$sb_key_uri" -outform DER -md sha256
    sign-efi-sig-list -i PK_null.signed -t "$T_NULL_STR" PK null.esl PK_null.auth
  )
}

stage_via_u2f_hsm() {
  echo "[stage-ci-sb-keys] Physical U2F/HSM (1050:*) detected; using hardware PIV slot 9a"
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
    ykman piv certificates generate -m "$PIV_MGM_KEY" -P "$PIV_PIN" -s "CN=${CN_LABEL}" -d "$DAYS" 9a "$WORK_DIR/slot9a-pub.pem" >/dev/null 2>&1 || return 1
  fi

  enroll_sb_pkcs11_ceremony "$pkcs11_lib" "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}"
}

stage_via_swu2f() {
  echo "[stage-ci-sb-keys] No physical U2F/HSM attached; opting for swu2f + SoftHSM PKCS#11 slot 9a fallback"
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

  # Initialize SoftHSM token using the canonical softhsm2-util --import pattern
  # so both CKO_PRIVATE_KEY and CKO_PUBLIC_KEY carry full attributes.
  mkdir -p "$WORK_DIR/softhsm/tokens"
  cat > "$WORK_DIR/softhsm/softhsm2.conf" <<EOF
directories.tokendir = $WORK_DIR/softhsm/tokens
objectstore.backend = file
log.level = ERROR
EOF
  export SOFTHSM2_CONF="$WORK_DIR/softhsm/softhsm2.conf"

  openssl genrsa -out "$WORK_DIR/slot9a.key" 2048 >/dev/null 2>&1
  openssl pkcs8 -topk8 -nocrypt -in "$WORK_DIR/slot9a.key" -out "$WORK_DIR/slot9a.p8"
  cp -f "$WORK_DIR/slot9a.p8" "$WORK_DIR/ci-sb-db.key"
  rm -f "$WORK_DIR/slot9a.key"
  softhsm2-util --init-token --free --label yubiOS-ci --pin "$PIV_PIN" --so-pin "$PIV_PIN" >/dev/null
  softhsm2-util --import "$WORK_DIR/slot9a.p8" --token yubiOS-ci --label "PIV AUTH key" --id 01 --pin "$PIV_PIN" >/dev/null
  rm -f "$WORK_DIR/slot9a.p8"

  enroll_sb_pkcs11_ceremony "$softhsm_lib" "pkcs11:token=yubiOS-ci;id=%01;type=private?pin-value=${PIV_PIN}"
  local rc=$?
  if [ -n "$passless_pid" ]; then kill "$passless_pid" 2>/dev/null || true; fi
  return "$rc"
}

if has_physical_u2f_hsm && stage_via_u2f_hsm; then
  echo "[stage-ci-sb-keys] Staged Secure Boot keys via physical U2F/HSM PIV slot 9a"
else
  stage_via_swu2f
  echo "[stage-ci-sb-keys] Staged Secure Boot keys via swu2f + SoftHSM PKCS#11 fallback"
fi

for target_dir in \
  "usr/lib/yubiOS/secureboot" \
  "repro-evidence/secureboot" \
  "repro-evidence/EFI/yubiOS/secureboot"; do
  mkdir -p "$target_dir"
  for fn in PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl null.esl PK.auth PK_null.auth KEK.auth db.auth yubiOS-db.cer; do
    cp -f "$WORK_DIR/$fn" "$target_dir/$fn"
    chmod 0644 "$target_dir/$fn"
    touch -h -d "@${EPOCH}" "$target_dir/$fn"
  done
  if [ "$target_dir" = "usr/lib/yubiOS/secureboot" ] && [ -f "$WORK_DIR/ci-sb-db.key" ]; then
    cp -f "$WORK_DIR/ci-sb-db.key" "$target_dir/ci-sb-db.key"
    chmod 0600 "$target_dir/ci-sb-db.key"
    touch -h -d "@${EPOCH}" "$target_dir/ci-sb-db.key"
  fi
  touch -h -d "@${EPOCH}" "$target_dir"
done

if [ "$REPO_ROOT" = "/" ]; then
  mkdir -p /var/lib/yubiOS/secureboot /boot/EFI/yubiOS/secureboot /boot/EFI/yubiOS/keys
  for dest_dir in /var/lib/yubiOS/secureboot /boot/EFI/yubiOS/secureboot /boot/EFI/yubiOS/keys; do
    for fn in PK.crt KEK.crt db.crt PK.esl KEK.esl db.esl null.esl PK.auth PK_null.auth KEK.auth db.auth yubiOS-db.cer; do
      cp -f "$WORK_DIR/$fn" "$dest_dir/$fn"
      chmod 0644 "$dest_dir/$fn"
      touch -h -d "@${EPOCH}" "$dest_dir/$fn"
    done
    touch -h -d "@${EPOCH}" "$dest_dir"
  done
fi

ls -la usr/lib/yubiOS/secureboot/
