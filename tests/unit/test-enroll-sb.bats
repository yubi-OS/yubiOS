#!/usr/bin/env bats
# Unit tests for usr/lib/yubiOS/enroll-sb.sh (OMN-171, ADR-002 PIV slot 9a).
# Run from the repo root or from / inside the image: bats tests/unit/test-enroll-sb.bats
# shellcheck disable=SC2016  # single-quoted stub bodies and grep patterns are literal by design
# Hermetic: every hardware/firmware tool is a PATH stub, efivarfs is a temp dir,
# and KEYDIR/ENROLLED_MARK/ESP live under $BATS_TEST_TMPDIR. No root, no YubiKey.

bats_require_minimum_version 1.5.0

resolve() {
  # Prefer the checkout (cwd = repo root), fall back to the image path (cwd = /).
  if [ -f "$1" ]; then
    printf '%s/%s\n' "$(pwd -P)" "$1"
  else
    printf '/%s\n' "$1"
  fi
}

setup() {
  SB_SH="$(resolve usr/lib/yubiOS/enroll-sb.sh)"
  WRAPPER_SH="$(resolve usr/lib/yubiOS/enroll-sb-wrapper.sh)"
  export YUBIOS_LIB_SH
  YUBIOS_LIB_SH="$(resolve usr/lib/yubiOS/lib.sh)"

  W="$BATS_TEST_TMPDIR"
  export YUBIOS_SB_KEYDIR="$W/keys"
  export YUBIOS_SB_ENROLLED_MARK="$W/state/.sb-enrolled"
  export YUBIOS_EFIVARS="$W/efivars"
  export YUBIOS_ESP="$W/esp"
  export YUBIOS_PKCS11_LIB="$W/libykcs11.so"
  export STUB_LOG="$W/calls.log"
  SETUPMODE_FILE="$YUBIOS_EFIVARS/SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c"
  export SETUPMODE_FILE
  mkdir -p "$W/bin" "$W/state" "$YUBIOS_EFIVARS" "$YUBIOS_ESP/EFI"
  : > "$STUB_LOG"
  set_setup_mode 1
  write_stubs
  export PATH="$W/bin:$PATH"
}

# efivarfs layout: 4-byte attribute header, then the data byte.
set_setup_mode() {
  if [ "$1" = 1 ]; then
    printf '\007\000\000\000\001' > "$SETUPMODE_FILE"
  else
    printf '\007\000\000\000\000' > "$SETUPMODE_FILE"
  fi
}

stub() {
  printf '#!/bin/bash\necho "%s $*" >> "$STUB_LOG"\n%s\n' "$1" "$2" > "$W/bin/$1"
  chmod +x "$W/bin/$1"
}

write_stubs() {
  # ykman piv keys export 9a <out>
  stub ykman '[ -n "${STUB_YKMAN_FAIL:-}" ] && exit 1
[ "$1 $2 $3 $4" = "piv keys export 9a" ] || exit 3
echo "PUBKEY" > "$5"'
  # openssl: pkey reports key size; req/smime/x509 write their -out file.
  stub openssl 'if [ "$1" = pkey ]; then echo "Public-Key: (${STUB_KEY_BITS:-2048} bit)"; exit 0; fi
out=""; prev=""
for a in "$@"; do [ "$prev" = "-out" ] && out="$a"; prev="$a"; done
[ -n "$out" ] && echo "openssl-$1" > "$out"
exit 0'
  stub cert-to-efi-sig-list 'echo esl > "${!#}"'
  stub sign-efi-sig-list 'echo sig > "${!#}"'
  # Writing PK leaves setup mode, as real firmware does.
  stub efi-updatevar '[ -n "${STUB_UPDATEVAR_FAIL:-}" ] && exit 1
if [ "${!#}" = PK ] && [ -z "${STUB_PK_NO_FLIP:-}" ]; then printf "\007\000\000\000\000" > "$SETUPMODE_FILE"; fi
exit 0'
  stub efi-readvar 'echo "Variable $2, length 1000"'
  stub systemd-sbsign 'out=""; prev=""
for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done
{ cat "${!#}"; echo SIGNED; } > "$out"'
  stub sbverify '[ -n "${STUB_SBVERIFY_FAIL:-}" ] && exit 1
echo "Signature verification OK"'
}

make_esp_images() {
  mkdir -p "$YUBIOS_ESP/EFI/systemd" "$YUBIOS_ESP/EFI/BOOT" "$YUBIOS_ESP/EFI/Linux"
  echo loader > "$YUBIOS_ESP/EFI/systemd/systemd-bootaa64.efi"
  echo fallback > "$YUBIOS_ESP/EFI/BOOT/BOOTAA64.EFI"
  echo uki1 > "$YUBIOS_ESP/EFI/Linux/yubios-a.efi"
  echo uki2 > "$YUBIOS_ESP/EFI/Linux/yubios-b.efi"
}

make_db_crt() {
  mkdir -p "$YUBIOS_SB_KEYDIR"
  echo dbcert > "$YUBIOS_SB_KEYDIR/db.crt"
}

# ── static contract ───────────────────────────────────────────────────────

@test "enroll-sb.sh exists, is executable, and parses" {
  [ -x "$SB_SH" ]
  bash -n "$SB_SH"
}

@test "contract: PIV slot 9a key, pkcs11 id %01, RSA-2048 gate" {
  grep -q 'ykman piv keys export 9a' "$SB_SH"
  grep -q 'SB_KEY_URI="pkcs11:id=%01;type=private"' "$SB_SH"
  grep -q "grep -q '(2048 bit)'" "$SB_SH"
}

@test "contract: PK, KEK, db written with efi-updatevar and checked with efi-readvar" {
  grep -q 'efi-updatevar -f PK.auth PK' "$SB_SH"
  grep -q 'efi-updatevar -f KEK.auth KEK' "$SB_SH"
  grep -q 'efi-updatevar -f db.auth db' "$SB_SH"
  grep -q 'efi-readvar -v' "$SB_SH"
  grep -q 'SetupMode still 1 after PK write' "$SB_SH"
}

@test "contract: images signed with systemd-sbsign and verified with sbverify" {
  grep -q 'systemd-sbsign sign' "$SB_SH"
  grep -q 'private-key-source "provider:pkcs11"' "$SB_SH"
  grep -q 'sbverify --cert "$KEYDIR/db.crt"' "$SB_SH"
}

@test "contract: test overrides default to the production paths" {
  grep -qF 'source "${YUBIOS_LIB_SH:-/usr/lib/yubiOS/lib.sh}"' "$SB_SH"
  grep -qF 'KEYDIR="${YUBIOS_SB_KEYDIR:-/var/lib/yubiOS/secureboot}"' "$SB_SH"
  grep -qF 'ENROLLED_MARK="${YUBIOS_SB_ENROLLED_MARK:-/var/lib/yubiOS/.sb-enrolled}"' "$SB_SH"
  grep -qF 'EFIVARS="${YUBIOS_EFIVARS:-/sys/firmware/efi/efivars}"' "$SB_SH"
}

@test "wrapper execs /usr/lib/yubiOS/enroll-sb.sh with all args" {
  [ -f "$WRAPPER_SH" ] || skip "enroll-sb-wrapper.sh not present"
  grep -qF 'exec /usr/lib/yubiOS/enroll-sb.sh "$@"' "$WRAPPER_SH"
}

# ── argument handling ─────────────────────────────────────────────────────

@test "invalid phase exits 2 with usage" {
  run "$SB_SH" bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage: enroll-sb.sh [enroll|resign|all]"* ]]
}

# ── enroll guards ─────────────────────────────────────────────────────────

@test "enroll refuses when SetupMode=0" {
  set_setup_mode 0
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"Not in setup mode (SetupMode=0). Refusing to write keys."* ]]
  run ! grep -q '^efi-updatevar' "$STUB_LOG"
  run ! grep -q '^ykman' "$STUB_LOG"
}

@test "enroll refuses when SetupMode is unreadable" {
  rm -f "$SETUPMODE_FILE"
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"SetupMode not readable; is efivarfs mounted?"* ]]
  run ! grep -q '^efi-updatevar' "$STUB_LOG"
}

@test "enroll refuses when already enrolled" {
  touch "$YUBIOS_SB_ENROLLED_MARK"
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"Already enrolled"* ]]
  run ! grep -q '^efi-updatevar' "$STUB_LOG"
}

@test "enroll refuses when slot 9a has no key" {
  export STUB_YKMAN_FAIL=1
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"No key in PIV slot 9a"* ]]
  run ! grep -q '^efi-updatevar' "$STUB_LOG"
  [ ! -e "$YUBIOS_SB_ENROLLED_MARK" ]
}

@test "enroll refuses when slot 9a key is not RSA-2048" {
  export STUB_KEY_BITS=256
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"Slot 9a key is not RSA-2048. UEFI needs RSA."* ]]
  run ! grep -q '^efi-updatevar' "$STUB_LOG"
}

@test "enroll fails when SetupMode stays 1 after the PK write" {
  export STUB_PK_NO_FLIP=1
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"SetupMode still 1 after PK write"* ]]
  [ ! -e "$YUBIOS_SB_ENROLLED_MARK" ]
}

@test "enroll stops before marking enrolled when efi-updatevar fails" {
  export STUB_UPDATEVAR_FAIL=1
  run "$SB_SH" enroll
  [ "$status" -ne 0 ]
  [ ! -e "$YUBIOS_SB_ENROLLED_MARK" ]
}

# ── enroll happy path ─────────────────────────────────────────────────────

@test "enroll writes PK, KEK, db in order and marks enrolled" {
  run "$SB_SH" enroll
  [ "$status" -eq 0 ]
  [[ "$output" == *"Keys enrolled. Next: resign the loader and UKIs before any reboot."* ]]
  for v in PK KEK db; do
    [ -f "$YUBIOS_SB_KEYDIR/$v.auth" ]
    [ -f "$YUBIOS_SB_KEYDIR/$v.crt" ]
  done
  [ -f "$YUBIOS_SB_KEYDIR/yubiOS-db.cer" ]
  [ -f "$YUBIOS_SB_ENROLLED_MARK" ]
  run grep '^efi-updatevar' "$STUB_LOG"
  [ "${lines[0]}" = "efi-updatevar -f PK.auth PK" ]
  [ "${lines[1]}" = "efi-updatevar -f KEK.auth KEK" ]
  [ "${lines[2]}" = "efi-updatevar -f db.auth db" ]
  [ "${#lines[@]}" -eq 3 ]
  run grep -c '^efi-readvar -v' "$STUB_LOG"
  [ "$output" -eq 3 ]
  [ "$(od -An -t u1 -j4 -N1 "$SETUPMODE_FILE" | tr -d ' ')" = 0 ]
}

@test "enroll signs every cert request with the slot 9a pkcs11 key" {
  run "$SB_SH" enroll
  [ "$status" -eq 0 ]
  run grep -c '^openssl req .*-key pkcs11:id=%01;type=private' "$STUB_LOG"
  [ "$output" -eq 3 ]
  run grep -c '^openssl smime .*-inkey pkcs11:id=%01;type=private' "$STUB_LOG"
  [ "$output" -eq 3 ]
  grep -q '^openssl smime .*-in KEK.forsig .*-signer PK.crt' "$STUB_LOG"
  grep -q '^openssl smime .*-in db.forsig .*-signer KEK.crt' "$STUB_LOG"
  grep -q '^ykman piv keys export 9a ' "$STUB_LOG"
}

@test "enroll twice: second run refuses (setup mode left, mark present)" {
  run "$SB_SH" enroll
  [ "$status" -eq 0 ]
  run "$SB_SH" enroll
  [ "$status" -eq 1 ]
  [[ "$output" == *"Not in setup mode (SetupMode=0)"* ]]
}

# ── resign ────────────────────────────────────────────────────────────────

@test "resign refuses when db.crt is missing" {
  make_esp_images
  run "$SB_SH" resign
  [ "$status" -eq 1 ]
  [[ "$output" == *"db.crt missing. Run the enroll phase first."* ]]
  run ! grep -q '^systemd-sbsign' "$STUB_LOG"
}

@test "resign refuses when no loader or UKI is on the ESP" {
  make_db_crt
  run "$SB_SH" resign
  [ "$status" -eq 1 ]
  [[ "$output" == *"No loader or UKI found under $YUBIOS_ESP"* ]]
}

@test "resign signs loader, fallback, and every UKI and verifies each" {
  make_db_crt
  make_esp_images
  run "$SB_SH" resign
  [ "$status" -eq 0 ]
  [[ "$output" == *"Resigned 4 image(s) with the db key. Reboot is now safe."* ]]
  for f in EFI/systemd/systemd-bootaa64.efi EFI/BOOT/BOOTAA64.EFI EFI/Linux/yubios-a.efi EFI/Linux/yubios-b.efi; do
    grep -q SIGNED "$YUBIOS_ESP/$f"
  done
  run grep -c '^systemd-sbsign sign --private-key pkcs11:id=%01;type=private --private-key-source provider:pkcs11' "$STUB_LOG"
  [ "$output" -eq 4 ]
  run grep -c "^sbverify --cert $YUBIOS_SB_KEYDIR/db.crt" "$STUB_LOG"
  [ "$output" -eq 4 ]
  run ! ls "$YUBIOS_SB_KEYDIR"/signed-*.efi 2>/dev/null
}

@test "resign leaves the original untouched when sbverify fails" {
  make_db_crt
  make_esp_images
  export STUB_SBVERIFY_FAIL=1
  run "$SB_SH" resign
  [ "$status" -eq 1 ]
  [[ "$output" == *"Signature did not verify against db.crt"* ]]
  [[ "$output" == *"Original left in place."* ]]
  [ "$(cat "$YUBIOS_ESP/EFI/systemd/systemd-bootaa64.efi")" = loader ]
  [ "$(cat "$YUBIOS_ESP/EFI/BOOT/BOOTAA64.EFI")" = fallback ]
  [ "$(cat "$YUBIOS_ESP/EFI/Linux/yubios-a.efi")" = uki1 ]
  run ! ls "$YUBIOS_SB_KEYDIR"/signed-*.efi 2>/dev/null
}

# ── all ───────────────────────────────────────────────────────────────────

@test "all: enroll then resign, never reboots" {
  make_esp_images
  run "$SB_SH" all
  [ "$status" -eq 0 ]
  [ -f "$YUBIOS_SB_ENROLLED_MARK" ]
  grep -q SIGNED "$YUBIOS_ESP/EFI/Linux/yubios-a.efi"
  [[ "$output" == *"Done. Do not reboot until resign reports success."* ]]
  run ! grep -qE '^(reboot|systemctl)' "$STUB_LOG"
  run ! grep -q 'reboot$' "$SB_SH"
}
