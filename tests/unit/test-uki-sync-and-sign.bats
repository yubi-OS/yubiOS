#!/usr/bin/env bats
# Unit tests for ADR-034 (OMN-191):
#   - usr/lib/yubiOS/uki/uki-sync-and-sign.sh
#   - usr/lib/kernel/install.d/05-rpmostree.install
#   - usr/lib/kernel/install.d/95-yubios-uki-resign.install
#   - usr/lib/yubiOS/enroll-sb.sh local composefs OCI commit & deploy integration
# shellcheck disable=SC2016

bats_require_minimum_version 1.5.0

resolve() {
  if [ -f "$1" ]; then
    printf '%s/%s\n' "$(pwd -P)" "$1"
  else
    printf '/%s\n' "$1"
  fi
}

setup() {
  SYNC_SH="$(resolve usr/lib/yubiOS/uki/uki-sync-and-sign.sh)"
  K05_SH="$(resolve usr/lib/kernel/install.d/05-rpmostree.install)"
  K95_SH="$(resolve usr/lib/kernel/install.d/95-yubios-uki-resign.install)"
  SB_SH="$(resolve usr/lib/yubiOS/enroll-sb.sh)"
  export YUBIOS_LIB_SH
  YUBIOS_LIB_SH="$(resolve usr/lib/yubiOS/lib.sh)"
  export YUBIOS_UKI_SYNC_SH="$SYNC_SH"

  W="$BATS_TEST_TMPDIR"
  export YUBIOS_SB_KEYDIR="$W/keys"
  export YUBIOS_SB_ENROLLED_MARK="$W/state/.sb-enrolled"
  export YUBIOS_EFIVARS="$W/efivars"
  export YUBIOS_ESP="$W/esp"
  export YUBIOS_OCI_DIR="$W/oci"
  export YUBIOS_MODULES_DIR="$W/modules"
  export YUBIOS_OS_RELEASE="$W/os-release"
  export YUBIOS_PKCS11_LIB="$W/libykcs11.so"
  export YUBIOS_COMPOSEFS_DIGEST="e28bd60d1a8c71ac85caf471b58884f8063cccb9084fda20b6c82f76b43fe952"
  export STUB_LOG="$W/calls.log"

  mkdir -p "$W/bin" "$W/state" "$YUBIOS_EFIVARS" "$YUBIOS_ESP/EFI/systemd" "$YUBIOS_ESP/EFI/BOOT" "$YUBIOS_ESP/EFI/Linux/bootc" "$YUBIOS_OCI_DIR" "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64"
  : > "$STUB_LOG"
  touch "$YUBIOS_PKCS11_LIB"
  cat > "$YUBIOS_OS_RELEASE" <<'EOF_OS'
ID="yubios"
VERSION_ID="45"
EOF_OS
  echo "vmlinuz-bytes" > "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/vmlinuz"
  write_stubs
  export PATH="$W/bin:$PATH"
}

stub() {
  printf '#!/bin/bash\necho "%s $*" >> "$STUB_LOG"\n%s\n' "$1" "$2" > "$W/bin/$1"
  chmod +x "$W/bin/$1"
}

write_stubs() {
  stub ykman '[ "$1 $2 $3 $4" = "piv keys export 9a" ] || exit 3; echo "PUBKEY" > "$5"'
  stub openssl 'if [ "$1" = pkey ]; then echo "Public-Key: (2048 bit)"; exit 0; fi; exit 0'
  stub cert-to-efi-sig-list 'echo esl > "${!#}"'
  stub sign-efi-sig-list 'echo sig > "${!#}"'
  stub efi-updatevar 'exit 0'
  stub efi-readvar 'exit 0'
  stub dracut 'out="${!#}"; echo "initramfs-for-$*" > "$out"'
  stub ukify 'out=""; prev=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done; echo "UKI-BUILT-$*" > "$out"'
  stub systemd-sbsign 'out=""; prev=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done; { cat "${!#}"; echo SIGNED-9A; } > "$out"'
  stub sbverify '[ -n "${STUB_SBVERIFY_FAIL:-}" ] && exit 1; echo "Signature verification OK"'
}

make_db_crt() {
  mkdir -p "$YUBIOS_SB_KEYDIR"
  echo "dbcert" > "$YUBIOS_SB_KEYDIR/db.crt"
  touch "$YUBIOS_SB_ENROLLED_MARK"
}

@test "scripts exist, are executable, and pass bash -n" {
  for s in "$SYNC_SH" "$K05_SH" "$K95_SH"; do
    [ -x "$s" ]
    bash -n "$s"
  done
}

@test "05-rpmostree.install generates initramfs on same FS without EXDEV and triggers uki-sync-and-sign" {
  make_db_crt
  run "$K05_SH" add 7.3.4-300.fc45.aarch64 /boot/entry "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/vmlinuz"
  [ "$status" -eq 0 ]
  [ -s "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/initramfs.img" ]
  grep -q '^dracut --no-hostonly --force --kver 7.3.4-300.fc45.aarch64 ' "$STUB_LOG"
  grep -q '^ukify build ' "$STUB_LOG"
  grep -q '^systemd-sbsign sign ' "$STUB_LOG"
  grep -q '^sbverify --cert ' "$STUB_LOG"
  [ -f "$YUBIOS_OCI_DIR/oci-layout" ]
  [ -f "$YUBIOS_OCI_DIR/index.json" ]
  [ -f "$YUBIOS_OCI_DIR/last-deployed.json" ]
  grep -q '"yubios-local:latest"' "$YUBIOS_OCI_DIR/index.json"
  grep -q '"yubios-local:7.3.4-300.fc45.aarch64"' "$YUBIOS_OCI_DIR/index.json"
  grep -q 'SIGNED-9A' "$YUBIOS_ESP/EFI/Linux/bootc/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
  [ -f "$YUBIOS_ESP/loader/entries/bootc_yubios-45-1.conf" ]
  grep -q "uki /EFI/Linux/bootc/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi" "$YUBIOS_ESP/loader/entries/bootc_yubios-45-1.conf"
}

@test "95-yubios-uki-resign.install builds, signs with slot 9a, commits to local OCI repo, and updates BLS" {
  make_db_crt
  echo "preexisting-initrd" > "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/initramfs.img"
  touch -d "+1 minute" "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/initramfs.img"
  run "$K95_SH" add 7.3.4-300.fc45.aarch64 /boot/entry "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/vmlinuz"
  [ "$status" -eq 0 ]
  grep -q '"signer":"piv-slot-9a"' "$YUBIOS_OCI_DIR/last-deployed.json"
  grep -q 'SIGNED-9A' "$YUBIOS_OCI_DIR/composefs/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
}

@test "uki-sync-and-sign refuses unsigned update when system is marked enrolled but db.crt is missing" {
  touch "$YUBIOS_SB_ENROLLED_MARK"
  rm -f "$YUBIOS_SB_KEYDIR/db.crt"
  echo "preexisting-initrd" > "$YUBIOS_MODULES_DIR/7.3.4-300.fc45.aarch64/initramfs.img"
  run "$SYNC_SH" --reason "test-missing-dbcrt" --kver 7.3.4-300.fc45.aarch64
  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing unsigned UKI update"* ]]
}

@test "enroll-sb.sh resign commits the newly signed UKI into the local composefs OCI repository and deploys BLS" {
  make_db_crt
  echo "loader" > "$YUBIOS_ESP/EFI/systemd/systemd-bootaa64.efi"
  echo "fallback" > "$YUBIOS_ESP/EFI/BOOT/BOOTAA64.EFI"
  echo "uki-initial" > "$YUBIOS_ESP/EFI/Linux/bootc/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
  run "$SB_SH" resign
  [ "$status" -eq 0 ]
  [ -f "$YUBIOS_OCI_DIR/oci-layout" ]
  [ -f "$YUBIOS_OCI_DIR/index.json" ]
  [ -f "$YUBIOS_OCI_DIR/last-deployed.json" ]
  grep -q '"reason":"enroll-sb-resign"' "$YUBIOS_OCI_DIR/last-deployed.json"
  grep -q 'SIGNED-9A' "$YUBIOS_OCI_DIR/composefs/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
}

@test "validate-pkcs11-uri.sh --syntax-only accepts valid RFC 7512 URI and rejects path delimiter injection" {
  run "${REPO_ROOT}/tests/validate-pkcs11-uri.sh" --syntax-only "pkcs11:manufacturer=piv_II;id=%9c;type=private" "/run/yubios/pin.txt" "/run/p11-kit/pkcs11"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: PKCS#11 URI syntax valid"* ]]

  run "${REPO_ROOT}/tests/validate-pkcs11-uri.sh" --syntax-only "pkcs11:manufacturer=piv_II;id=%9c;type=private" "/run/bad;inject=1/pin"
  [ "$status" -eq 1 ]
  [[ "$output" == *"contains RFC 7512 delimiter"* ]]
}

@test "verify-uki-signature.sh --check-cert-subject accepts yubiOS PIV cert and rejects fallback CN=mkosi" {
  local good_cert="${BATS_TEST_TMPDIR}/good.pem"
  local bad_cert="${BATS_TEST_TMPDIR}/bad.pem"
  local cnf="${BATS_TEST_TMPDIR}/openssl.cnf"
  printf '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=placeholder\n' > "$cnf"
  openssl req -x509 -newkey rsa:2048 -nodes -config "$cnf" -keyout "${BATS_TEST_TMPDIR}/g.key" -out "$good_cert" -days 1 -subj "/CN=yubiOS-PIV-Slot-9a" 2>/dev/null
  openssl req -x509 -newkey rsa:2048 -nodes -config "$cnf" -keyout "${BATS_TEST_TMPDIR}/b.key" -out "$bad_cert" -days 1 -subj "/CN=mkosi-ephemeral" 2>/dev/null

  run "${REPO_ROOT}/tests/verify-uki-signature.sh" --check-cert-subject "$good_cert" "yubiOS-PIV-Slot-9a"
  [ "$status" -eq 0 ]

  run "${REPO_ROOT}/tests/verify-uki-signature.sh" --check-cert-subject "$bad_cert"
  [ "$status" -eq 1 ]
  [[ "$output" == *"fell back to an unconfigured tool-generated default"* ]]
}
