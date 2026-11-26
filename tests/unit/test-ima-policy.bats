#!/usr/bin/env bats
# Unit tests for the shim-less signed IMA custom policy (Option 1):
#   usr/lib/yubiOS/ima/{ima-policy,stage-ima-policy.sh,patch-mokvar-ca.py,yubios-ima-mokvar-*.efi.tmpl}
#   usr/lib/dracut/modules.d/99yubios-ima/{module-setup.sh,load-ima-key.sh}
#   usr/lib/yubiOS/ab-etc-merge.sh IMA sync, Containerfile / Containerfile.dev / flash-device-e2e.sh wiring
# Hermetic: real openssl + python3, stubbed keyctl/setfattr/getfattr/sbsign/sbverify, temp roots.
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
  POLICY="$(resolve usr/lib/yubiOS/ima/ima-policy)"
  STAGE_SH="$(resolve usr/lib/yubiOS/ima/stage-ima-policy.sh)"
  PATCH_PY="$(resolve tools/patch-mokvar-ca.py)"
  TMPL_X64="$(resolve usr/lib/yubiOS/ima/yubios-ima-mokvar-x64.efi.tmpl)"
  TMPL_AA64="$(resolve usr/lib/yubiOS/ima/yubios-ima-mokvar-aa64.efi.tmpl)"
  MOD_SETUP="$(resolve usr/lib/dracut/modules.d/99yubios-ima/module-setup.sh)"
  HOOK_SH="$(resolve usr/lib/dracut/modules.d/99yubios-ima/load-ima-key.sh)"
  AB_SH="$(resolve usr/lib/yubiOS/ab-etc-merge.sh)"
  EMU_PY="$(resolve tools/test-ima-mokvar-template.py)"
  W="$BATS_TEST_TMPDIR"
  export STUB_LOG="$W/calls.log"
  mkdir -p "$W/bin" "$W/tmp"
  : > "$STUB_LOG"
  export PATH="$W/bin:$PATH"
  export TMPDIR="$W/tmp"
  export SOURCE_DATE_EPOCH=1767225600
}

stub() {
  printf '#!/bin/bash\necho "%s $*" >> "$STUB_LOG"\n%s\n' "$1" "$2" > "$W/bin/$1"
  chmod +x "$W/bin/$1"
}

# Temp image root carrying the shipped IMA inputs.
make_root() {
  R="$W/root"
  mkdir -p "$R/usr/lib/yubiOS/ima"
  cp "$POLICY" "$TMPL_X64" "$TMPL_AA64" "$R/usr/lib/yubiOS/ima/"
}

run_stage() {
  run env YUBIOS_IMA_ARCH="${ARCH:-riscv64}" "$STAGE_SH" "$R"
}

# ── 1. policy ─────────────────────────────────────────────────────────────────

@test "ima-policy: tcb measure rules + all tcb dont_measure fsmagics + KEXEC, in kernel syntax" {
  for l in \
    'dont_measure fsmagic=0x9fa0' 'dont_measure fsmagic=0x62656572' 'dont_measure fsmagic=0x64626720' \
    'dont_measure func=FILE_CHECK fsmagic=0x1021994' 'dont_measure fsmagic=0x1cd1' 'dont_measure fsmagic=0x42494e4d' \
    'dont_measure fsmagic=0x73636673' 'dont_measure fsmagic=0xf97cff8c' 'dont_measure fsmagic=0x43415d53' \
    'dont_measure fsmagic=0x27e0eb' 'dont_measure fsmagic=0x63677270' 'dont_measure fsmagic=0x6e736673' \
    'dont_measure fsmagic=0xde5e81e4' 'dont_measure fsmagic=0x62656570' \
    'measure func=MMAP_CHECK mask=MAY_EXEC' 'measure func=BPRM_CHECK mask=MAY_EXEC' \
    'measure func=FILE_CHECK mask=^MAY_READ euid=0' 'measure func=FILE_CHECK mask=^MAY_READ uid=0' \
    'measure func=MODULE_CHECK' 'measure func=FIRMWARE_CHECK' 'measure func=POLICY_CHECK' \
    'measure func=KEXEC_KERNEL_CHECK'; do
    grep -qxF "$l" "$POLICY"
  done
  [ "$(grep -cv '^$' "$POLICY")" -eq 23 ]
  run ! grep -qE '^(appraise|#)' "$POLICY"
  run ! grep -q $'\r' "$POLICY"
}

@test "ima-policy: dont_measure FILE_CHECK ext4 (0xef53) precedes every measure FILE_CHECK (first match wins)" {
  ext4="$(grep -nxF 'dont_measure func=FILE_CHECK fsmagic=0xef53' "$POLICY" | cut -d: -f1)"
  first_measure="$(grep -n '^measure func=FILE_CHECK' "$POLICY" | head -n1 | cut -d: -f1)"
  [ -n "$ext4" ] && [ -n "$first_measure" ]
  [ "$ext4" -lt "$first_measure" ]
  last_dont="$(grep -n '^dont_measure' "$POLICY" | tail -n1 | cut -d: -f1)"
  [ "$last_dont" -lt "$(grep -n '^measure' "$POLICY" | head -n1 | cut -d: -f1)" ]
}

# ── 2. driver templates + patcher ────────────────────────────────────────────

@test "mokvar templates: PE32+ EFI boot service driver (Subsystem 11), compact, one YUBIMOK slot" {
  for t in "$TMPL_X64" "$TMPL_AA64"; do
    [ "$(wc -c < "$t")" -le 8192 ]
    [ "$(head -c2 "$t")" = MZ ]
    run python3 - "$t" <<'EOF'
import struct, sys
d = open(sys.argv[1], 'rb').read()
pe = struct.unpack_from('<I', d, 0x3c)[0]
assert d[pe:pe + 4] == b'PE\0\0'
machine = struct.unpack_from('<H', d, pe + 4)[0]
magic, subsystem = struct.unpack_from('<H', d, pe + 24)[0], struct.unpack_from('<H', d, pe + 24 + 68)[0]
assert magic == 0x20b and subsystem == 11, (hex(magic), subsystem)
assert d.count(b'YUBIMOK\0') == 1
off = d.index(b'YUBIMOK\0')
assert d[off + 8:off + 12] == b'\xff\xff\xff\xff'
print(hex(machine))
EOF
    [ "$status" -eq 0 ]
  done
  run python3 -c "import struct,sys;d=open('$TMPL_X64','rb').read();print(hex(struct.unpack_from('<H',d,struct.unpack_from('<I',d,0x3c)[0]+4)[0]))"
  [ "$output" = 0x8664 ]
  run python3 -c "import struct,sys;d=open('$TMPL_AA64','rb').read();print(hex(struct.unpack_from('<H',d,struct.unpack_from('<I',d,0x3c)[0]+4)[0]))"
  [ "$output" = 0xaa64 ]
}

@test "patch-mokvar-ca.py rejects non-DER and oversize CAs and keeps the image size" {
  printf 'not-a-der-cert-not-a-der-cert-not-a-der-cert-not-a-der-cert-xxxxxx' > "$W/bad.der"
  run python3 "$PATCH_PY" "$TMPL_AA64" "$W/bad.der" "$W/out.efi"
  [ "$status" -ne 0 ]
  python3 -c "open('$W/big.der','wb').write(b'\x30'+b'\x00'*3000)"
  run python3 "$PATCH_PY" "$TMPL_AA64" "$W/big.der" "$W/out.efi"
  [ "$status" -ne 0 ]
  python3 -c "open('$W/ok.der','wb').write(b'\x30\x82'+b'\x11'*700)"
  run python3 "$PATCH_PY" "$TMPL_AA64" "$W/ok.der" "$W/out.efi"
  [ "$status" -eq 0 ]
  [ "$(wc -c < "$W/out.efi")" -eq "$(wc -c < "$TMPL_AA64")" ]
}

# ── 3. stage-ima-policy.sh end to end ────────────────────────────────────────

@test "stage-ima-policy.sh: CA is CA:TRUE + keyCertSign without digitalSignature (.machine MAX restriction)" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  run openssl x509 -inform DER -in "$R/usr/lib/yubiOS/ima/yubios-ima-ca.der" -noout -text
  [[ "$output" == *"CN=YUBIOS IMA Policy CA"* ]]
  [[ "$output" == *"CA:TRUE"* ]]
  [[ "$output" == *"Certificate Sign"* ]]
  [[ "$output" != *"Digital Signature"* ]]
  [[ "$output" == *"Subject Key Identifier"* ]]
  [[ "$output" == *"2048 bit"* ]]
}

@test "stage-ima-policy.sh: leaf is CA:FALSE + digitalSignature + codeSigning, SKID/AKID chain to the CA" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  ima="$R/usr/lib/yubiOS/ima"
  openssl x509 -inform DER -in "$ima/yubios-ima-ca.der" -out "$W/ca.pem"
  openssl x509 -inform DER -in "$ima/yubios-ima.der" -out "$W/leaf.pem"
  run openssl x509 -in "$W/leaf.pem" -noout -text
  [[ "$output" == *"CN=YUBIOS IMA Policy Signer"* ]]
  [[ "$output" == *"CA:FALSE"* ]]
  [[ "$output" == *"Digital Signature"* ]]
  [[ "$output" != *"Certificate Sign"* ]]
  [[ "$output" == *"Code Signing"* ]]
  ca_skid="$(openssl x509 -in "$W/ca.pem" -noout -ext subjectKeyIdentifier | tail -n1 | tr -d ' ')"
  leaf_akid="$(openssl x509 -in "$W/leaf.pem" -noout -ext authorityKeyIdentifier | tail -n1 | tr -d ' ' | sed 's/^keyid://')"
  [ -n "$ca_skid" ] && [ "$ca_skid" = "$leaf_akid" ]
  run openssl verify -CAfile "$W/ca.pem" "$W/leaf.pem"
  [ "$status" -eq 0 ]
}

@test "stage-ima-policy.sh: 265-byte security.ima v2 (03 02 04 <SKID[-4:]> 0100 <sig>) verifies like the kernel" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  ima="$R/usr/lib/yubiOS/ima"
  sig="$ima/ima-policy.sig"
  [ "$(wc -c < "$sig")" -eq 265 ]
  hdr="$(od -An -tx1 -N9 -v "$sig" | tr -d ' \n')"
  skid="$(openssl x509 -inform DER -in "$ima/yubios-ima.der" -noout -ext subjectKeyIdentifier | tail -n1 | tr -d ' :\n' | tr 'A-F' 'a-f')"
  [ "${hdr:0:6}" = 030204 ]
  [ "${hdr:6:8}" = "${skid: -8}" ]
  [ "${hdr:14:4}" = 0100 ]
  [ "$(cat "$ima/ima-policy.sig.hex")" = "0x$(od -An -tx1 -v "$sig" | tr -d ' \n')" ]
  # pkcs1(rsa,sha256): EM recovers to DigestInfo(sha256) || SHA256(policy) (crypto/rsassa-pkcs1.c)
  openssl x509 -inform DER -in "$ima/yubios-ima.der" -noout -pubkey > "$W/leaf.pub"
  tail -c +10 "$sig" > "$W/rsasig"
  run openssl dgst -sha256 -verify "$W/leaf.pub" -signature "$W/rsasig" "$POLICY"
  [ "$status" -eq 0 ]
  recovered="$(openssl pkeyutl -verifyrecover -pubin -inkey "$W/leaf.pub" -in "$W/rsasig" | od -An -tx1 -v | tr -d ' \n')"
  [ "$recovered" = "3031300d060960864801650304020105000420$(sha256sum "$POLICY" | cut -d' ' -f1)" ]
}

@test "stage-ima-policy.sh: installs /etc/ima/ima-policy and deletes every private key" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  cmp "$POLICY" "$R/etc/ima/ima-policy"
  run find "$R" "$W/tmp" -name '*.key'
  [ -z "$output" ]
  run grep -rl -- '-----BEGIN .*PRIVATE KEY-----' "$R" "$W/tmp"
  [ -z "$output" ]
  [ -z "$(ls -A "$W/tmp")" ]
}

@test "stage-ima-policy.sh: patches the IMA CA into the YUBIMOK slot of both drivers and stages them" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  ima="$R/usr/lib/yubiOS/ima"
  for suf in x64 aa64; do
    run python3 - "$ima/yubios-ima-mokvar-$suf.efi.patched" "$ima/yubios-ima-ca.der" "$ima/yubios-ima-mokvar-$suf.efi.tmpl" <<'EOF'
import struct, sys
d, ca, t = (open(p, 'rb').read() for p in sys.argv[1:4])
off = d.index(b'YUBIMOK\0') + 8
assert struct.unpack_from('<I', d, off)[0] == len(ca)
assert d[off + 4:off + 4 + len(ca)] == ca
assert len(d) == len(t) and d[:off] == t[:off]
EOF
    [ "$status" -eq 0 ]
    cmp "$ima/yubios-ima-mokvar-$suf.efi.patched" "$R/usr/lib/systemd/boot/efi/drivers/yubios-ima-mokvar-$suf.efi"
    cmp "$ima/yubios-ima-mokvar-$suf.efi.patched" "$R/boot/EFI/systemd/drivers/yubios-ima-mokvar-$suf.efi"
  done
}

@test "stage-ima-policy.sh: arch selection stages only the native driver (aarch64 -> aa64, x86_64 -> x64)" {
  make_root
  ARCH=aarch64 run_stage
  [ "$status" -eq 0 ]
  [ -f "$R/boot/EFI/systemd/drivers/yubios-ima-mokvar-aa64.efi" ]
  [ ! -e "$R/boot/EFI/systemd/drivers/yubios-ima-mokvar-x64.efi" ]
  rm -rf "$W/root"; make_root
  ARCH=x86_64 run_stage
  [ "$status" -eq 0 ]
  [ -f "$R/usr/lib/systemd/boot/efi/drivers/yubios-ima-mokvar-x64.efi" ]
  [ ! -e "$R/usr/lib/systemd/boot/efi/drivers/yubios-ima-mokvar-aa64.efi" ]
}

@test "stage-ima-policy.sh: signs the driver with ci-sb-db.key + db.crt and verifies with sbverify" {
  make_root
  mkdir -p "$R/usr/lib/yubiOS/secureboot" "$R/boot/efi/EFI"
  echo key > "$R/usr/lib/yubiOS/secureboot/ci-sb-db.key"
  echo crt > "$R/usr/lib/yubiOS/secureboot/db.crt"
  stub sbsign 'out=""; prev=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done; { cat "${!#}"; echo SBSIGNED; } > "$out"'
  stub sbverify 'echo "Signature verification OK"'
  ARCH=aarch64 run_stage
  [ "$status" -eq 0 ]
  grep -q "^sbsign --key $R/usr/lib/yubiOS/secureboot/ci-sb-db.key --cert $R/usr/lib/yubiOS/secureboot/db.crt" "$STUB_LOG"
  grep -q "^sbverify --cert $R/usr/lib/yubiOS/secureboot/db.crt" "$STUB_LOG"
  for d in usr/lib/systemd/boot/efi/drivers boot/EFI/systemd/drivers boot/efi/EFI/systemd/drivers; do
    [ "$(tail -c 9 "$R/$d/yubios-ima-mokvar-aa64.efi")" = SBSIGNED ]
  done
  # the CA-patched unsigned copy stays for owner re-signing (enroll-sb.sh / flash-device-e2e.sh)
  run ! grep -q SBSIGNED "$R/usr/lib/yubiOS/ima/yubios-ima-mokvar-aa64.efi.patched"
  [ -f "$R/usr/lib/yubiOS/secureboot/ci-sb-db.key" ]
}

@test "stage-ima-policy.sh: re-run keeps the CA/leaf/signature (initramfs stays in sync) and re-signs the driver" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  ima="$R/usr/lib/yubiOS/ima"
  before="$(cat "$ima/yubios-ima.der" "$ima/yubios-ima-ca.der" "$ima/ima-policy.sig" | sha256sum)"
  mkdir -p "$R/usr/lib/yubiOS/secureboot"
  echo key > "$R/usr/lib/yubiOS/secureboot/ci-sb-db.key"
  echo crt > "$R/usr/lib/yubiOS/secureboot/db.crt"
  stub sbsign 'out=""; prev=""; for a in "$@"; do [ "$prev" = "--output" ] && out="$a"; prev="$a"; done; { cat "${!#}"; echo SBSIGNED; } > "$out"'
  stub sbverify 'echo "Signature verification OK"'
  run_stage
  [ "$status" -eq 0 ]
  [[ "$output" == *"keeping them"* ]]
  [ "$(cat "$ima/yubios-ima.der" "$ima/yubios-ima-ca.der" "$ima/ima-policy.sig" | sha256sum)" = "$before" ]
  [ "$(tail -c 9 "$R/boot/EFI/systemd/drivers/yubios-ima-mokvar-x64.efi")" = SBSIGNED ]
}

@test "stage-ima-policy.sh: re-run fails loudly when the policy changed after signing" {
  make_root
  run_stage
  [ "$status" -eq 0 ]
  echo 'measure func=FILE_CHECK' >> "$R/usr/lib/yubiOS/ima/ima-policy"
  run_stage
  [ "$status" -ne 0 ]
  [[ "$output" == *"changed since it was signed"* ]]
}

@test "patched drivers install a byte-exact MOKvar table under emulation (x64 + aa64)" {
  python3 -c 'import pefile, unicorn' 2>/dev/null || skip "pefile/unicorn not installed"
  make_root
  run_stage
  [ "$status" -eq 0 ]
  for suf in x64 aa64; do
    run python3 "$EMU_PY" "$R/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.patched" "$R/usr/lib/yubiOS/ima/yubios-ima-ca.der"
    [ "$status" -eq 0 ]
    [[ "$output" == *"byte-exact"* ]]
    run python3 "$EMU_PY" "$R/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.tmpl" --expect-refuse
    [ "$status" -eq 0 ]
  done
}

# ── 4. dracut 99yubios-ima ───────────────────────────────────────────────────

@test "99yubios-ima module-setup.sh: check/depends return 0, installs tools, cert, policy, sig and the pre-pivot 61 hook" {
  [ -x "$MOD_SETUP" ] && [ -x "$HOOK_SH" ]
  run bash -c '
    inst_multiple() { echo "inst_multiple $*"; }
    inst_simple() { echo "inst_simple $*"; }
    inst_hook() { echo "inst_hook $*"; }
    moddir=/mod
    . "$1"
    check || exit 11
    depends || exit 12
    install' _ "$MOD_SETUP"
  [ "$status" -eq 0 ]
  [[ "$output" == *"inst_multiple keyctl setfattr getfattr cmp"* ]]
  [[ "$output" == *"inst_simple /usr/lib/yubiOS/ima/yubios-ima.der"* ]]
  [[ "$output" == *"inst_simple /usr/lib/yubiOS/ima/ima-policy"* ]]
  [[ "$output" == *"inst_simple /usr/lib/yubiOS/ima/ima-policy.sig.hex"* ]]
  [[ "$output" == *"inst_hook pre-pivot 61 /mod/load-ima-key.sh"* ]]
  grep -qx 'add_dracutmodules+=" yubios-ima "' "$(resolve usr/lib/dracut.conf.d/55-yubiOS-ima.conf)"
}

# Hook harness: initrd files, a /sysroot, a fake securityfs policy, and stateful keyctl/setfattr/getfattr.
hook_env() {
  export YUBIOS_IMA_INITRD_DIR="$W/initrd/usr/lib/yubiOS/ima"
  export NEWROOT="$W/sysroot"
  export YUBIOS_IMA_SECFS_POLICY="$W/secfs-policy"
  export YUBIOS_IMA_KMSG="$W/kmsg"
  export KEYRING="$W/ima-keyring" XATTR="$W/xattr"
  mkdir -p "$YUBIOS_IMA_INITRD_DIR" "$NEWROOT/etc/ima"
  cp "$POLICY" "$YUBIOS_IMA_INITRD_DIR/ima-policy"
  echo LEAFDER > "$YUBIOS_IMA_INITRD_DIR/yubios-ima.der"
  echo 0x030204aabbccdd0100ff > "$YUBIOS_IMA_INITRD_DIR/ima-policy.sig.hex"
  : > "$YUBIOS_IMA_KMSG"
  printf 'appraise func=POLICY_CHECK appraise_type=imasig\nmeasure func=MODULE_CHECK\n' > "$YUBIOS_IMA_SECFS_POLICY"
  stub keyctl 'case "$1" in
  padd) [ -n "${STUB_PADD_FAIL:-}" ] && exit 1; cat > /dev/null; echo "123: --als--v 0 0 asymmetric: $3" >> "$KEYRING" ;;
  list) [ -f "$KEYRING" ] && cat "$KEYRING"; exit 0 ;;
esac'
  stub setfattr '[ -n "${STUB_SETFATTR_FAIL:-}" ] && exit 1; echo "$4" > "$XATTR"'
  stub getfattr '[ -f "$XATTR" ] && echo "security.ima=$(cat "$XATTR")"; exit 0'
}

run_hook() {
  run sh -c '. "$1"; echo HOOK-RETURNED' _ "$HOOK_SH"
}

@test "load-ima-key.sh: key accepted -> padd into %:.ima, policy copied to /sysroot with security.ima" {
  hook_env
  run_hook
  [ "$status" -eq 0 ]
  [[ "$output" == *HOOK-RETURNED* ]]
  grep -q '^keyctl padd asymmetric yubios-ima %:.ima' "$STUB_LOG"
  cmp "$POLICY" "$NEWROOT/etc/ima/ima-policy"
  grep -q "^setfattr -n security.ima -v 0x030204aabbccdd0100ff $NEWROOT/etc/ima/ima-policy" "$STUB_LOG"
  run ! grep -q 'removed' "$YUBIOS_IMA_KMSG"
}

@test "load-ima-key.sh: freeze guard removes /sysroot policy when appraisal is on and the key was rejected" {
  hook_env
  cp "$POLICY" "$NEWROOT/etc/ima/ima-policy"
  export STUB_PADD_FAIL=1
  run_hook
  [ "$status" -eq 0 ]
  [ ! -e "$NEWROOT/etc/ima/ima-policy" ]
  grep -q 'POLICY_CHECK appraisal active but signed policy cannot load (key=0' "$YUBIOS_IMA_KMSG"
  grep -q '^<4>yubios-ima:' "$YUBIOS_IMA_KMSG"
}

@test "load-ima-key.sh: freeze guard removes the policy when security.ima did not stick" {
  hook_env
  export STUB_SETFATTR_FAIL=1
  run_hook
  [ "$status" -eq 0 ]
  [ ! -e "$NEWROOT/etc/ima/ima-policy" ]
  grep -q 'key=1 xattr=0' "$YUBIOS_IMA_KMSG"
}

@test "load-ima-key.sh: no POLICY_CHECK appraisal (Secure Boot off) leaves an existing policy alone" {
  hook_env
  printf 'measure func=MODULE_CHECK\n' > "$YUBIOS_IMA_SECFS_POLICY"
  echo 'custom unsigned policy' > "$NEWROOT/etc/ima/ima-policy"
  export STUB_PADD_FAIL=1
  run_hook
  [ "$status" -eq 0 ]
  [ "$(cat "$NEWROOT/etc/ima/ima-policy")" = 'custom unsigned policy' ]
}

@test "load-ima-key.sh: unreadable securityfs policy is treated as appraisal required" {
  hook_env
  rm -f "$YUBIOS_IMA_SECFS_POLICY"
  cp "$POLICY" "$NEWROOT/etc/ima/ima-policy"
  export STUB_PADD_FAIL=1
  run_hook
  [ "$status" -eq 0 ]
  [ ! -e "$NEWROOT/etc/ima/ima-policy" ]
}

@test "load-ima-key.sh: a stale /sysroot policy is replaced by the initramfs copy before the xattr is set" {
  hook_env
  echo 'stale policy' > "$NEWROOT/etc/ima/ima-policy"
  run_hook
  [ "$status" -eq 0 ]
  cmp "$POLICY" "$NEWROOT/etc/ima/ima-policy"
}

# ── 5. ab-etc-merge.sh IMA sync ───────────────────────────────────────────────

ab_ima_block() {
  sed -n '/^# Keep the signed IMA custom policy/,$p' "$AB_SH" > "$W/ab-ima.sh"
  [ -s "$W/ab-ima.sh" ]
  export YUBIOS_IMA_DIR="$W/usrima" YUBIOS_ETC_DIR="$W/etc" KEYRING="$W/ima-keyring" XATTR="$W/xattr"
  mkdir -p "$YUBIOS_IMA_DIR" "$YUBIOS_ETC_DIR"
  cp "$POLICY" "$YUBIOS_IMA_DIR/ima-policy"
  echo 0x0302041122 > "$YUBIOS_IMA_DIR/ima-policy.sig.hex"
  stub keyctl '[ "$1" = list ] && [ -f "$KEYRING" ] && cat "$KEYRING"; exit 0'
  stub setfattr 'echo "$4" > "$XATTR"'
}

@test "ab-etc-merge.sh: syncs /etc/ima/ima-policy + security.ima only when %:.ima holds yubios-ima" {
  ab_ima_block
  run bash "$W/ab-ima.sh"
  [ "$status" -eq 0 ]
  [ ! -e "$W/etc/ima/ima-policy" ]
  echo '1: --als--v 0 0 asymmetric: yubios-ima' > "$KEYRING"
  run bash "$W/ab-ima.sh"
  [ "$status" -eq 0 ]
  cmp "$POLICY" "$W/etc/ima/ima-policy"
  [ "$(cat "$XATTR")" = 0x0302041122 ]
}

# ── 6. build / flash wiring ──────────────────────────────────────────────────

@test "Containerfile: keyutils+attr, stage-ima-policy after stage-ci-sb-keys and before dracut, initramfs checked" {
  cf="$(resolve Containerfile)"
  grep -qE '^\s+keyutils \\$' "$cf"
  grep -qE '^\s+attr \\$' "$cf"
  sb="$(grep -n 'stage-ci-sb-keys.sh /' "$cf" | head -n1 | cut -d: -f1)"
  ima="$(grep -n 'ima/stage-ima-policy.sh /' "$cf" | head -n1 | cut -d: -f1)"
  rmkey="$(grep -n 'rm -f /boot/EFI/yubiOS/secureboot/ci-sb-db.key' "$cf" | head -n1 | cut -d: -f1)"
  drc="$(grep -n 'dracut --no-hostonly' "$cf" | head -n1 | cut -d: -f1)"
  [ "$sb" -lt "$ima" ] && [ "$ima" -lt "$rmkey" ] && [ "$ima" -lt "$drc" ]
  grep -q 'dracut --no-hostonly --force --add yubios-ima' "$cf"
  grep -qF 'grep -q "pre-pivot/61-load-ima-key\.sh"' "$cf"
  grep -qF 'grep -q "usr/lib/yubiOS/ima/yubios-ima\.der"' "$cf"
  grep -qF 'for drv in /usr/lib/systemd/boot/efi/drivers/*.efi' "$cf"
  grep -qF 'cp -f /usr/lib/systemd/boot/efi/drivers/*.efi /boot/EFI/systemd/drivers/' "$cf"
}

@test "Containerfile.dev: re-runs stage-ima-policy.sh (idempotent) and verifies the ESP drivers" {
  cfd="$(resolve Containerfile.dev)"
  grep -q '/usr/lib/yubiOS/ima/stage-ima-policy.sh /' "$cfd"
  ima="$(grep -n 'ima/stage-ima-policy.sh /' "$cfd" | head -n1 | cut -d: -f1)"
  rmkey="$(grep -n 'rm -f /boot/EFI/yubiOS/secureboot/ci-sb-db.key' "$cfd" | head -n1 | cut -d: -f1)"
  [ "$ima" -lt "$rmkey" ]
  grep -qF 'sbverify --cert /usr/lib/yubiOS/secureboot/db.crt "$drv"' "$cfd"
}

@test "flash-device-e2e.sh: stages EFI/systemd/drivers before the sign/verify loop" {
  fl="$(resolve scripts/flash-device-e2e.sh)"
  stage="$(grep -n 'boot/EFI/systemd/drivers"$' "$fl" | head -n1 | cut -d: -f1)"
  loop="$(grep -n 'Signing installed EFI loaders' "$fl" | head -n1 | cut -d: -f1)"
  [ -n "$stage" ] && [ "$stage" -lt "$loop" ]
  grep -qF 'drv_src_dir=/usr/lib/yubiOS/ima' "$fl"
  grep -qF 'yubios-ima-mokvar-${sdboot_arch}.efi' "$fl"
}

# ── 7. CI two-build determinism (stage-ci-sb-keys.sh once -> Build 1 / Build 2) ──────

@test "stage-ima-policy.sh: bash YUBIMOK patcher output equals tools/patch-mokvar-ca.py" {
  make_root
  run "$STAGE_SH" --prepare-only "$R"
  [ "$status" -eq 0 ]
  for suf in x64 aa64; do
    python3 "$PATCH_PY" "$R/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.tmpl" "$R/usr/lib/yubiOS/ima/yubios-ima-ca.der" "$W/py-$suf.efi"
    cmp "$W/py-$suf.efi" "$R/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.patched"
  done
}

@test "stage-ima-policy.sh --prepare-only: only usr/lib/yubiOS/ima material, no /etc, no drivers, no keys" {
  make_root
  run "$STAGE_SH" --prepare-only "$R"
  [ "$status" -eq 0 ]
  [[ "$output" == *"prepare-only"* ]]
  for f in yubios-ima-ca.der yubios-ima.der ima-policy.sig ima-policy.sig.hex \
           yubios-ima-mokvar-x64.efi.patched yubios-ima-mokvar-aa64.efi.patched; do
    [ -s "$R/usr/lib/yubiOS/ima/$f" ]
  done
  [ ! -e "$R/etc" ] && [ ! -e "$R/boot" ] && [ ! -e "$R/usr/lib/systemd" ]
  run find "$R" "$W/tmp" -name '*.key'
  [ -z "$output" ]
  # second prepare is a no-op on the bytes
  before="$(find "$R/usr/lib/yubiOS/ima" -type f -exec sha256sum {} + | sort)"
  run "$STAGE_SH" --prepare-only "$R"
  [ "$status" -eq 0 ]
  [ "$(find "$R/usr/lib/yubiOS/ima" -type f -exec sha256sum {} + | sort)" = "$before" ]
}

# Hermetic stage-ci-sb-keys.sh: swu2f + SoftHSM path with the PKCS#11 bits shimmed. The openssl
# wrapper drops "-provider pkcs11" and swaps the pkcs11: URI for the key "imported" into SoftHSM.
ci_stage_env() {
  REAL_OPENSSL="$(command -v openssl)"
  export REAL_OPENSSL SOFTHSM_KEY="$W/softhsm-imported.pem"
  export YUBIOS_SOFTHSM2_LIB="$W/libsofthsm2.so"
  export OPENSSL_MIN_CNF="$W/openssl-min.cnf"
  printf '[req]\ndistinguished_name = dn\nprompt = no\n[dn]\nCN = stub\n' > "$OPENSSL_MIN_CNF"
  touch "$YUBIOS_SOFTHSM2_LIB"
  cat > "$W/bin/openssl" <<'EOS'
#!/bin/bash
case "${OPENSSL_CONF:-}" in *openssl-pkcs11.cnf) unset OPENSSL_CONF ;; esac
# hosts without a system openssl.cnf (minimal containers): give `openssl req` a [req] section
[ -n "${OPENSSL_CONF:-}" ] || export OPENSSL_CONF="$OPENSSL_MIN_CNF"
args=(); prev=""
for a in "$@"; do
  if [ "$prev" = "-provider" ] && [ "$a" = pkcs11 ]; then unset 'args[${#args[@]}-1]'; prev=""; continue; fi
  case "$a" in pkcs11:*) a="$SOFTHSM_KEY" ;; esac
  args+=("$a"); prev="$a"
done
exec "$REAL_OPENSSL" "${args[@]}"
EOS
  chmod +x "$W/bin/openssl"
  stub softhsm2-util '[ "$1" = --import ] && cp "$2" "$SOFTHSM_KEY"; exit 0'
  stub cert-to-efi-sig-list 'echo "esl:$(sha256sum < "$3")" > "${!#}"'
  stub sign-efi-sig-list 'echo "efisig:$*" > "${!#}"'
  stub ykman 'exit 1'
  stub lsusb 'exit 0'
  stub pcscd 'exit 0'
  # Deterministic stand-in for sbsign: payload + RSA PKCS#1 v1.5 signature with the staged db key.
  stub sbsign 'key=""; out=""; prev=""; for a in "$@"; do [ "$prev" = --key ] && key="$a"; [ "$prev" = --output ] && out="$a"; prev="$a"; done
{ cat "${!#}"; "$REAL_OPENSSL" dgst -sha256 -sign "$key" "${!#}"; } > "$out"'
  stub sbverify 'echo "Signature verification OK"'
}

@test "CI: stage-ci-sb-keys.sh on the workspace once -> Build 1 and Build 2 are byte-identical" {
  ci_stage_env
  WS="$W/workspace"
  mkdir -p "$WS/usr/lib/yubiOS/uki" "$WS/usr/lib/yubiOS/ima"
  cp "$(resolve usr/lib/yubiOS/uki/stage-ci-sb-keys.sh)" "$WS/usr/lib/yubiOS/uki/"
  cp "$STAGE_SH" "$POLICY" "$TMPL_X64" "$TMPL_AA64" "$WS/usr/lib/yubiOS/ima/"
  run env SOURCE_DATE_EPOCH=1767225600 bash "$WS/usr/lib/yubiOS/uki/stage-ci-sb-keys.sh" "$WS"
  echo "$output" | tail -n 25
  [ "$status" -eq 0 ]
  [[ "$output" == *"done (prepare-only)"* ]]
  # runner workspace: Secure Boot + prepared IMA material only, no installed state, no IMA keys
  [ -s "$WS/usr/lib/yubiOS/secureboot/ci-sb-db.key" ] && [ -s "$WS/usr/lib/yubiOS/secureboot/db.crt" ]
  for f in yubios-ima-ca.der yubios-ima.der ima-policy.sig ima-policy.sig.hex \
           yubios-ima-mokvar-x64.efi.patched yubios-ima-mokvar-aa64.efi.patched; do
    [ -s "$WS/usr/lib/yubiOS/ima/$f" ]
  done
  [ ! -e "$WS/etc" ] && [ ! -e "$WS/boot" ] && [ ! -e "$WS/usr/lib/systemd" ]
  run find "$WS/usr/lib/yubiOS/ima" -name '*.key'
  [ -z "$output" ]

  # Build 1 and Build 2: each COPYs the same usr/ and runs the Containerfile step.
  for b in build1 build2; do
    mkdir -p "$W/$b"
    cp -a "$WS/usr" "$W/$b/"
    run env YUBIOS_IMA_ARCH=riscv64 SOURCE_DATE_EPOCH=1767225600 "$STAGE_SH" "$W/$b"
    [ "$status" -eq 0 ]
    [[ "$output" == *"keeping them"* ]]
    [[ "$output" == *"signed yubios-ima-mokvar-x64.efi"* ]]
    [[ "$output" == *"done (prepare+install)"* ]]
  done
  B1="$W/build1" B2="$W/build2"
  n=0
  for rel in usr/lib/yubiOS/ima usr/lib/systemd/boot/efi/drivers boot/EFI/systemd/drivers etc/ima; do
    [ -d "$B1/$rel" ] && [ -d "$B2/$rel" ]
    [ "$(cd "$B1/$rel" && find . -type f | sort)" = "$(cd "$B2/$rel" && find . -type f | sort)" ]
    while IFS= read -r f; do
      cmp -s "$B1/$rel/$f" "$B2/$rel/$f" || { echo "DIFFERS: $rel/$f"; false; }
      n=$((n + 1))
    done < <(cd "$B1/$rel" && find . -type f | sort)
  done
  [ "$n" -ge 15 ]
  cmp -s "$B1/etc/ima/ima-policy" "$POLICY"
  # builds kept the runner's prepared material verbatim (no re-mint inside the builds)
  for f in yubios-ima-ca.der yubios-ima.der ima-policy.sig ima-policy.sig.hex \
           yubios-ima-mokvar-x64.efi.patched yubios-ima-mokvar-aa64.efi.patched; do
    cmp -s "$WS/usr/lib/yubiOS/ima/$f" "$B1/usr/lib/yubiOS/ima/$f"
  done
  # drivers are the pre-patched images signed with the staged ci-sb-db.key
  for suf in x64 aa64; do
    head -c "$(wc -c < "$WS/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.patched")" \
      "$B1/usr/lib/systemd/boot/efi/drivers/yubios-ima-mokvar-$suf.efi" > "$W/payload"
    cmp -s "$W/payload" "$WS/usr/lib/yubiOS/ima/yubios-ima-mokvar-$suf.efi.patched"
  done
}

@test "CI wiring: workflows normalise ownership/mtimes of usr/lib/yubiOS/ima after key staging" {
  for wf in yubiOS-ci.yml ci_dev_image.yml ci_assured_image.yml; do
    f="$(resolve .github/workflows/$wf)"
    grep -qF 'chown -R 0:0 usr/lib/yubiOS/secureboot usr/lib/yubiOS/ima repro-evidence' "$f"
    grep -qF 'find usr/lib/yubiOS/secureboot usr/lib/yubiOS/ima repro-evidence -exec touch' "$f"
  done
  grep -qF 'stage-ima-policy.sh" "${ima_mode[@]}" "$TARGET_ROOT"' "$(resolve usr/lib/yubiOS/uki/stage-ci-sb-keys.sh)"
}

@test "negative control: two builds WITHOUT the shared prepare step mint different IMA material" {
  make_root
  cp -a "$R" "$W/root2"
  run "$STAGE_SH" "$R"
  [ "$status" -eq 0 ]
  run "$STAGE_SH" "$W/root2"
  [ "$status" -eq 0 ]
  run cmp -s "$R/usr/lib/yubiOS/ima/yubios-ima-ca.der" "$W/root2/usr/lib/yubiOS/ima/yubios-ima-ca.der"
  [ "$status" -ne 0 ]
  run cmp -s "$R/usr/lib/yubiOS/ima/ima-policy.sig" "$W/root2/usr/lib/yubiOS/ima/ima-policy.sig"
  [ "$status" -ne 0 ]
}
