#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/ima/stage-ima-policy.sh [--prepare-only] [ROOT]
#
# Staging of the signed IMA custom policy (Option 1: shim-less MOKvar table).
#
# Chain (Linux v7.3, Secure Boot on, IMA_ARCH_POLICY -> "appraise func=POLICY_CHECK appraise_type=imasig"):
#   systemd-boot loads \EFI\systemd\drivers\yubios-ima-mokvar-<arch>.efi (db-signed, carries the CA)
#     -> LINUX_EFI_MOK_VARIABLE_TABLE {MokListRT=<CA>, MokListTrustedRT=01}
#     -> CA lands in .machine (restrict_link_by_ca: CA:TRUE + keyCertSign, NO digitalSignature
#        because CONFIG_INTEGRITY_CA_MACHINE_KEYRING_MAX=y), .machine linked into .secondary
#     -> dracut 99yubios-ima pre-pivot: keyctl padd the leaf into %:.ima
#        (restrict_link_by_digsig: digitalSignature, !CA, !keyCertSign, signed by .secondary)
#     -> PID 1 ima_setup() writes "/etc/ima/ima-policy"; kernel appraises its security.ima.
#
# security.ima v2 (integrity.h struct signature_v2_hdr, digsig_asymmetric.c):
#   03 (EVM_IMA_XATTR_DIGSIG) 02 (v2) 04 (HASH_ALGO_SHA256) <keyid: last 4 B of leaf SKID, BE>
#   <sig_size BE16 = 0x0100> <RSASSA-PKCS1-v1_5(SHA-256(file)) == openssl dgst -sha256 -sign>
#
# Two phases, so two clean image builds come out byte-identical:
#   prepare (all random material, ONCE): mint the ephemeral IMA CA + signer, sign the policy,
#     DELETE both private keys, and patch the CA into yubios-ima-mokvar-{x64,aa64}.efi.patched.
#     CI: stage-ci-sb-keys.sh "$GITHUB_WORKSPACE" calls `stage-ima-policy.sh --prepare-only <ws>`
#     on the runner before Build 1 and Build 2, so both builds COPY the same usr/lib/yubiOS/ima.
#     Host tools needed: bash, openssl, coreutils (od, dd, head), grep. No python3, no sbsign.
#   install (deterministic, every build): if the prepared material is already present it is kept;
#     /etc/ima/ima-policy is copied, security.ima applied from ima-policy.sig.hex, and the
#     pre-patched driver is signed with ci-sb-db.key + db.crt when both exist (sbsign, else
#     systemd-sbsign; the Containerfile pins time() via libfaketime_sb.so like every other
#     PE it signs, and RSA PKCS#1 v1.5 is deterministic, so both builds sign identically).
# Without prepared material (local build, no CI staging) both phases run in one go.
set -euo pipefail

PREPARE_ONLY=0
if [ "${1:-}" = "--prepare-only" ]; then PREPARE_ONLY=1; shift; fi
ROOT="${1:-/}"
ROOT="${ROOT%/}"
IMA_DIR="$ROOT/usr/lib/yubiOS/ima"
SB_DIR="${YUBIOS_IMA_SB_DIR:-$ROOT/usr/lib/yubiOS/secureboot}"
SDBOOT_DRV_DIR="$ROOT/usr/lib/systemd/boot/efi/drivers"
EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
case "$EPOCH" in ''|*[!0-9]*) EPOCH=1700000000 ;; esac
POLICY="$IMA_DIR/ima-policy"
CA_DER="$IMA_DIR/yubios-ima-ca.der"
LEAF_DER="$IMA_DIR/yubios-ima.der"
SIG_BIN="$IMA_DIR/ima-policy.sig"
SIG_HEX="$IMA_DIR/ima-policy.sig.hex"
SLOT_MAX=2036
ALL_SUFFIXES="x64 aa64"

log() { printf 'stage-ima-policy: %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[ -s "$POLICY" ] || die "missing $POLICY"
command -v openssl >/dev/null 2>&1 || die "openssl not found"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

arch_suffixes() {
  case "${YUBIOS_IMA_ARCH:-$(uname -m)}" in
    aarch64|arm64) echo aa64 ;;
    x86_64|amd64) echo x64 ;;
    *) echo "$ALL_SUFFIXES" ;;
  esac
}

esp_driver_dirs() {
  echo "$ROOT/boot/EFI/systemd/drivers"
  if [ -d "$ROOT/boot/efi/EFI" ]; then echo "$ROOT/boot/efi/EFI/systemd/drivers"; fi
}

# Create a directory only if missing. `install -d -m` chmods an EXISTING directory too, which fails
# with EPERM when the CI workspace (bind-mounted into the rootless staging container) owns it.
ensure_dir() { [ -d "$1" ] || install -d -m 0755 "$1"; }

hexbyte() { od -An -tx1 -v -j "$2" -N 1 "$1" | tr -d ' \n'; }

# Patch a DER CA into the "YUBIMOK\0" slot (mokvar_drv.c struct yubimok_slot:
# char magic[8]; u32 ca_der_len (LE); u8 ca_der[2036]) with coreutils only.
patch_slot() {
  local tmpl="$1" der="$2" out="$3" len offs off
  len="$(wc -c < "$der" | tr -d ' ')"
  if [ "$len" -lt 64 ] || [ "$len" -gt "$SLOT_MAX" ]; then die "CA DER must be 64..$SLOT_MAX bytes (got $len)"; fi
  [ "$(hexbyte "$der" 0)" = 30 ] || die "CA is not DER"
  [ "$(head -c 2 "$tmpl")" = MZ ] || die "$tmpl is not a PE image"
  offs="$(LC_ALL=C grep -obUa 'YUBIMOK' "$tmpl" | cut -d: -f1)"
  [ "$(printf '%s\n' "$offs" | grep -c .)" -eq 1 ] || die "expected exactly one YUBIMOK slot in $tmpl"
  off="$offs"
  [ "$(hexbyte "$tmpl" $((off + 7)))" = 00 ] || die "YUBIMOK slot in $tmpl is not NUL-terminated"
  {
    # shellcheck disable=SC2059
    printf "$(printf '\\%03o\\%03o\\%03o\\%03o' $((len & 255)) $(((len >> 8) & 255)) $(((len >> 16) & 255)) $(((len >> 24) & 255)))"
    cat "$der"
    head -c $((SLOT_MAX - len)) /dev/zero
  } > "$WORK/slot.bin"
  cp -f "$tmpl" "$WORK/patched.efi"
  dd if="$WORK/slot.bin" of="$WORK/patched.efi" bs=1 seek=$((off + 8)) conv=notrunc status=none
  [ "$(wc -c < "$WORK/patched.efi")" -eq "$(wc -c < "$tmpl")" ] || die "patch changed the image size"
  install -m 0644 "$WORK/patched.efi" "$out"
}

have_prepared() {
  [ -s "$CA_DER" ] && [ -s "$LEAF_DER" ] && [ -s "$SIG_BIN" ] && [ -s "$SIG_HEX" ]
}

verify_existing_signature() {
  # The shipped policy must still match the shipped signature (no key exists to re-sign it).
  openssl x509 -inform DER -in "$LEAF_DER" -noout -pubkey > "$WORK/leaf.pub"
  tail -c +10 "$SIG_BIN" > "$WORK/policy.rsasig"
  openssl dgst -sha256 -verify "$WORK/leaf.pub" -signature "$WORK/policy.rsasig" "$POLICY" >/dev/null \
    || die "$POLICY changed since it was signed and the IMA signer key is gone; re-run the CI key staging"
}

mint_and_sign() {
  cat > "$WORK/ima.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt = no
[dn]
CN = unused
[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[v3_leaf]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF
  log "minting ephemeral RSA-2048 'YUBIOS IMA Policy CA' + 'YUBIOS IMA Policy Signer'"
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 -config "$WORK/ima.cnf" -extensions v3_ca \
    -subj "/CN=YUBIOS IMA Policy CA" -keyout "$WORK/ca.key" -out "$WORK/ca.pem" 2>/dev/null
  openssl req -new -newkey rsa:2048 -nodes -sha256 -config "$WORK/ima.cnf" \
    -subj "/CN=YUBIOS IMA Policy Signer" -keyout "$WORK/leaf.key" -out "$WORK/leaf.csr" 2>/dev/null
  openssl x509 -req -sha256 -days 3650 -in "$WORK/leaf.csr" -CA "$WORK/ca.pem" -CAkey "$WORK/ca.key" \
    -set_serial "0x$(openssl rand -hex 16)" -extfile "$WORK/ima.cnf" -extensions v3_leaf -out "$WORK/leaf.pem" 2>/dev/null
  rm -f "$WORK/ca.key"   # CA key only ever signs the leaf

  local skid keyid
  skid="$(openssl x509 -in "$WORK/leaf.pem" -noout -ext subjectKeyIdentifier | tail -n1 | tr -d ' :\r\n')"
  keyid="${skid: -8}"
  [[ "$keyid" =~ ^[0-9A-Fa-f]{8}$ ]] || die "could not extract leaf SKID (got '$skid')"

  openssl dgst -sha256 -sign "$WORK/leaf.key" -out "$WORK/policy.rsasig" "$POLICY"
  rm -f "$WORK/leaf.key"  # no IMA private key survives
  [ "$(wc -c < "$WORK/policy.rsasig")" -eq 256 ] || die "unexpected RSA-2048 signature length"

  {
    printf '\003\002\004'
    printf '%b' "\\x${keyid:0:2}\\x${keyid:2:2}\\x${keyid:4:2}\\x${keyid:6:2}"
    printf '\001\000'
    cat "$WORK/policy.rsasig"
  } > "$WORK/ima-policy.sig"
  [ "$(wc -c < "$WORK/ima-policy.sig")" -eq 265 ] || die "security.ima blob is not 265 bytes"

  ensure_dir "$IMA_DIR"
  openssl x509 -in "$WORK/ca.pem" -outform DER -out "$WORK/ca.der"
  openssl x509 -in "$WORK/leaf.pem" -outform DER -out "$WORK/leaf.der"
  install -m 0644 "$WORK/ca.der" "$CA_DER"
  install -m 0644 "$WORK/leaf.der" "$LEAF_DER"
  install -m 0644 "$WORK/ima-policy.sig" "$SIG_BIN"
  printf '0x%s\n' "$(od -An -tx1 -v "$SIG_BIN" | tr -d ' \n')" > "$WORK/sig.hex"
  install -m 0644 "$WORK/sig.hex" "$SIG_HEX"
  log "signed $POLICY (keyid $keyid, 265-byte security.ima v2)"
}

prepare() {
  local suf
  if have_prepared; then
    log "prepared IMA CA/signer/signature found: keeping them (builds and initramfs stay in sync)"
    verify_existing_signature
  else
    mint_and_sign
  fi
  # Deterministic from (template, CA): safe to redo on every run; only rewrite on change.
  for suf in $ALL_SUFFIXES; do
    patch_slot "$IMA_DIR/yubios-ima-mokvar-${suf}.efi.tmpl" "$CA_DER" "$WORK/${suf}.patched"
    if ! cmp -s "$WORK/${suf}.patched" "$IMA_DIR/yubios-ima-mokvar-${suf}.efi.patched" 2>/dev/null; then
      install -m 0644 "$WORK/${suf}.patched" "$IMA_DIR/yubios-ima-mokvar-${suf}.efi.patched"
    fi
  done
}

set_ima_xattr() {
  local f="$1"
  if command -v setfattr >/dev/null 2>&1; then
    setfattr -n security.ima -v "$(cat "$SIG_HEX")" "$f" 2>/dev/null \
      || log "note: setfattr security.ima on $f not supported here; 99yubios-ima applies it at pre-pivot"
  else
    log "note: setfattr unavailable; 99yubios-ima applies security.ima at pre-pivot"
  fi
}

sign_efi() {
  local in="$1" out="$2" key="$SB_DIR/ci-sb-db.key" crt="$SB_DIR/db.crt" sd
  if command -v sbsign >/dev/null 2>&1; then
    sbsign --key "$key" --cert "$crt" --output "$out" "$in" >/dev/null
  elif sd="$(command -v systemd-sbsign 2>/dev/null)" || { [ -x /usr/lib/systemd/systemd-sbsign ] && sd=/usr/lib/systemd/systemd-sbsign; }; then
    "$sd" sign --private-key "$key" --certificate "$crt" --output "$out" "$in" >/dev/null
  else
    return 2
  fi
  sbverify --cert "$crt" "$out" >/dev/null || die "sbverify failed for $out"
}

install_drivers() {
  local suf name patched dst d have_key=0 rc
  if [ -f "$SB_DIR/ci-sb-db.key" ] && [ -f "$SB_DIR/db.crt" ]; then have_key=1; fi
  ensure_dir "$SDBOOT_DRV_DIR"
  for suf in $(arch_suffixes); do
    name="yubios-ima-mokvar-${suf}.efi"
    patched="$IMA_DIR/${name}.patched"
    dst="$SDBOOT_DRV_DIR/$name"
    if [ "$have_key" = 1 ]; then
      rc=0
      sign_efi "$patched" "$WORK/$name.signed" || rc=$?
      if [ "$rc" = 0 ]; then
        install -m 0644 "$WORK/$name.signed" "$dst"
        log "signed $name with $SB_DIR/db.crt"
      else
        log "no sbsign/systemd-sbsign here: staging UNSIGNED $name (the Containerfile signing step signs it)"
        install -m 0644 "$patched" "$dst"
      fi
    elif [ ! -s "$dst" ]; then
      install -m 0644 "$patched" "$dst"
      log "no Secure Boot db key: staged UNSIGNED $name (enroll-sb.sh resign signs it with PIV 9a)"
    else
      log "no Secure Boot db key: keeping existing $dst"
    fi
    while read -r d; do
      ensure_dir "$d"
      install -m 0644 "$dst" "$d/$name"
    done < <(esp_driver_dirs)
  done
}

prepare
if [ "$PREPARE_ONLY" = 0 ]; then
  ensure_dir "$ROOT/etc"
  ensure_dir "$ROOT/etc/ima"
  install -m 0644 "$POLICY" "$ROOT/etc/ima/ima-policy"
  set_ima_xattr "$POLICY"
  set_ima_xattr "$ROOT/etc/ima/ima-policy"
  install_drivers
  touch -h -d "@$EPOCH" "$ROOT/etc/ima/ima-policy" "$SDBOOT_DRV_DIR"/*.efi 2>/dev/null || true
fi

for f in "$IMA_DIR"/*; do touch -h -d "@$EPOCH" "$f" 2>/dev/null || true; done
if find "$IMA_DIR" -name '*.key' | grep -q .; then die "private key left behind"; fi
if [ -d "$ROOT/etc/ima" ] && find "$ROOT/etc/ima" -name '*.key' | grep -q .; then die "private key left behind"; fi
log "done ($([ "$PREPARE_ONLY" = 1 ] && echo prepare-only || echo prepare+install))"
