#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# ADR-034 / OMN-191 VM e2e test with swu2f (tests/vm/test-uki-local-oci-ci.sh)
#
# Boots yubiOS in a bcvk ephemeral VM (`--swtpm --swu2f`) and verifies all
# ADR-034 kernel/package UKI re-sign hooks and local composefs OCI repository
# assertions inside the live VM alongside the in-guest swu2f CTAP2 authenticator:
#   1. swu2f Layer 2 (passless) CTAP2 hmac-secret enumeration + pamu2fcfg +
#      OpenSSH ed25519-sk keygen inside the guest.
#   2. 05-rpmostree.install same-FS dracut initramfs generation across a tmpfs
#      /tmp + overlayfs /usr mount boundary (zero EXDEV os error 18).
#   3. 95-yubios-uki-resign.install + uki-sync-and-sign.sh Type2 UKI assembly,
#      real systemd-sbsign PE signing + sbverify verification, local composefs
#      OCI Image Layout v1.0.0 repository (/var/lib/yubiOS/oci) commit (with
#      sha256-verified blobs, index.json tags yubios-local:latest /
#      yubios-local:<kver> / yubios-uki:<composefs_digest>, last-deployed.json),
#      and ESP /EFI/Linux/bootc/bootc_composefs-<digest>.efi + Type2 BLSConfig.
#   4. enroll-sb.sh resign integration committing the initial signed ESP UKI into
#      /var/lib/yubiOS/oci and updating last-deployed.json.
#   5. Fail-closed negative check: refuses unsigned UKI update when .sb-enrolled
#      is present but db.crt is missing.

set -euo pipefail

IMAGE="${YUBIOS_IMAGE:-docker.io/0mniteck/yubios:dev}"
VMID=""
SSH_WAIT_SECS="${YUBIOS_SSH_WAIT_SECS:-300}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# Optional opt-out for the real-YubiKey guard: --allow-real-u2f as first argv.
# shellcheck disable=SC2034
if [[ "${1:-}" == "--allow-real-u2f" ]]; then
  # shellcheck disable=SC2034
  ALLOW_REAL_U2F=1
  shift
fi

if [[ "${1:-}" == "--self-test" ]]; then
  echo "SELF-TEST: verifying syntax of ADR-034 scripts"
  for s in \
    "${REPO_ROOT}/usr/lib/yubiOS/uki/uki-sync-and-sign.sh" \
    "${REPO_ROOT}/usr/lib/kernel/install.d/05-rpmostree.install" \
    "${REPO_ROOT}/usr/lib/kernel/install.d/95-yubios-uki-resign.install" \
    "${REPO_ROOT}/usr/lib/yubiOS/enroll-sb.sh"; do
    test -x "$s"
    bash -n "$s"
  done
  echo "PASS: ADR-034 self-test syntax verified"
  exit 0
fi

# shellcheck source=tests/vm/bcvk-ssh-lib.sh
. "${SCRIPT_DIR}/bcvk-ssh-lib.sh"
# shellcheck source=tests/vm/lib/real-u2f-guard.sh
. "${SCRIPT_DIR}/lib/real-u2f-guard.sh"

log()  { printf '\n=== %s ===\n' "$*"; }
skip_unsupported_zboot() {
  printf 'SKIP: %s\n' "bcvk/QEMU cannot DirectBoot this ARM64 EFI zboot kernel because it is zstd-compressed."
  exit 77
}
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing host tool: $1"; }

BCVK_EXTRA_ARGS=()
if [[ -n "${BCVK_EPHEMERAL_EXTRA_ARGS:-}" ]]; then
  read -r -a BCVK_EXTRA_ARGS <<<"${BCVK_EPHEMERAL_EXTRA_ARGS}"
fi

cleanup() { [[ -n "$VMID" ]] && podman rm -f "$VMID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "host preflight"
need bcvk
bcvk ephemeral run --help 2>&1 | grep -q -- '--swtpm' || die "pinned bcvk source lacks --swtpm"
bcvk ephemeral run --help 2>&1 | grep -q -- '--swu2f' || die "pinned bcvk source lacks --swu2f"

assert_passless_only

g() { bcvk_ssh "$VMID" "$@"; }

log "boot ephemeral VM (--swtpm --swu2f)"
VMID="$(bcvk ephemeral run "${BCVK_EXTRA_ARGS[@]}" --detach --ssh-keygen --swtpm --swu2f "$IMAGE")"
[[ -n "$VMID" ]] || die "bcvk ephemeral run returned no VM id"
echo "VM id: $VMID"
if ! wait_for_bcvk_ssh "$VMID" "$SSH_WAIT_SECS"; then
  logs="$(bcvk_podman_logs_tail "$VMID" 200)"
  if grep -Fq 'unable to handle EFI zboot image with "zstd" compression' <<<"$logs"; then
    skip_unsupported_zboot
  fi
  die "guest did not become reachable over ssh after ${SSH_WAIT_SECS}s"
fi

log "sync ADR-034 checkout files into guest /run/yubios-adr034-checkout (via argv base64; bcvk_ssh podman exec does not forward stdin)"
TAR_B64="$(tar -C "$REPO_ROOT" -czf - \
  usr/lib/yubiOS/uki/uki-sync-and-sign.sh \
  usr/lib/yubiOS/uki/install-uki.sh \
  usr/lib/kernel/install.d/05-rpmostree.install \
  usr/lib/kernel/install.d/95-yubios-uki-resign.install \
  usr/lib/rpm/macros.d/macros.yubios-uki \
  usr/lib/systemd/system/yubiOS-uki-resign.service \
  usr/lib/systemd/system/yubiOS-uki-resign.path \
  usr/lib/yubiOS/enroll-sb.sh \
  usr/lib/yubiOS/ab-etc-merge.sh \
  tests/unit/test-uki-sync-and-sign.bats | base64 -w0)"

g "mkdir -p /run/yubios-adr034-checkout && printf '%s' '${TAR_B64}' | base64 -d | tar -C /run/yubios-adr034-checkout -xzf - && test -x /run/yubios-adr034-checkout/usr/lib/yubiOS/uki/uki-sync-and-sign.sh" \
  || die "failed to unpack ADR-034 checkout files inside guest"

log "1. swu2f Layer 2: start in-guest CTAP2 authenticator (passless) and verify FIDO2 + ed25519-sk"
g 'command -v passless >/dev/null' || die "passless missing from guest image"
g 'command -v fido2-token >/dev/null' || die "fido2-token missing from guest image"
g 'set -eu
   modprobe uhid
   test -c /dev/uhid
   rm -rf /run/passless-ci
   install -d -m 0700 /run/passless-ci/storage /run/passless-ci/config
   if ! systemctl is-active --quiet passless-ci.service; then
     systemd-run --quiet --unit=passless-ci.service --property=Type=exec \
       --setenv=HOME=/root \
       --setenv=XDG_DATA_HOME=/run/passless-ci \
       --setenv=XDG_CONFIG_HOME=/run/passless-ci/config \
       --setenv=PASSLESS_E2E_AUTO_ACCEPT_UV=1 \
       --setenv=PASSLESS_TEST_VENDOR_ID=0x15d9 \
       --setenv=PASSLESS_TEST_PRODUCT_ID=0x0a37 \
       --setenv=PASSLESS_LOG_STYLE=never \
       /usr/bin/passless --backend-type local \
         --local-path /run/passless-ci/storage -v
   fi
   for _ in $(seq 1 45); do
     udevadm settle 2>/dev/null || true
     if fido2-token -L 2>/dev/null | tee /run/passless-ci/devices | grep -q .; then
       cat /run/passless-ci/devices
       break
     fi
     sleep 1
   done
   for d in $(fido2-token -L | cut -d: -f1); do
     fido2-token -I "$d" 2>/dev/null | tee /run/passless-ci/token-info
     grep -qi "hmac-secret" /run/passless-ci/token-info && exit 0
   done
   exit 1' || die "swu2f CTAP2 hmac-secret authenticator failed to enumerate in guest"

g 'pamu2fcfg -u ci-adr034 -o pam.yubios.local -i pam.yubios.local > /tmp/adr034_u2f_keys && test -s /tmp/adr034_u2f_keys' \
  || die "pamu2fcfg failed against swu2f authenticator"
g 'rm -f /tmp/adr034_sk /tmp/adr034_sk.pub && ssh-keygen -t ed25519-sk -N "" -f /tmp/adr034_sk </dev/null && test -s /tmp/adr034_sk.pub' \
  || die "ssh-keygen -t ed25519-sk failed against swu2f authenticator"
echo "swu2f CTAP2 + pamu2fcfg + ed25519-sk verified in guest"

log "2. Mount 3-way OverlayFS + verify ADR-034 kernel/package UKI re-sign hooks and local composefs OCI repository in guest"
g 'set -euo pipefail
   WORK=/run/yubios-adr034-test
   rm -rf "$WORK"
   mkdir -p "$WORK/usr-base" "$WORK/usr-b/lower" "$WORK/usr-a/upper" "$WORK/usr-a/work" "$WORK/usr-merged"
   mkdir -p "$WORK/esp/EFI/systemd" "$WORK/esp/EFI/BOOT" "$WORK/esp/EFI/Linux/bootc" "$WORK/esp/loader/entries"
   mkdir -p "$WORK/oci" "$WORK/keys" "$WORK/state" "$WORK/efivars" "$WORK/bin"

   cp -a /run/yubios-adr034-checkout/usr/. "$WORK/usr-base/"
   cp -f /usr/lib/yubiOS/lib.sh "$WORK/usr-base/lib/yubiOS/lib.sh"
   cp -f /usr/lib/os-release "$WORK/usr-base/lib/os-release"
   set -- /usr/lib/modules/*/
   KVER="$(basename "$1")"
   mkdir -p "$WORK/usr-base/lib/modules/$KVER"
   cp -f "/usr/lib/modules/$KVER/vmlinuz" "$WORK/usr-base/lib/modules/$KVER/vmlinuz"

   mount -t overlay overlay \
     -o "lowerdir=$WORK/usr-b/lower:$WORK/usr-base,upperdir=$WORK/usr-a/upper,workdir=$WORK/usr-a/work" \
     "$WORK/usr-merged"
   trap "umount -l \"$WORK/usr-merged\" 2>/dev/null || true" EXIT

   test "$(findmnt -n -o FSTYPE "$WORK/usr-merged")" = "overlay"
   echo "Mounted 3-way overlayfs on $WORK/usr-merged (kver=$KVER)"

   openssl genrsa -out "$WORK/keys/slot9a.key" 2048 2>/dev/null
   openssl rsa -in "$WORK/keys/slot9a.key" -pubout -out "$WORK/keys/slot9a-pub.pem" 2>/dev/null
   openssl req -new -x509 -sha256 -key "$WORK/keys/slot9a.key" -subj "/CN=YUBIOS db/" -days 365 -out "$WORK/keys/db.crt"
   touch "$WORK/state/.sb-enrolled"
   touch "$WORK/libykcs11.so"

   printf "%s\n" \
     "#!/bin/bash" \
     "[ \"\$1 \$2 \$3 \$4\" = \"piv keys export 9a\" ] || exit 3" \
     "cp -f \"$WORK/keys/slot9a-pub.pem\" \"\$5\"" > "$WORK/bin/ykman"

   printf "%s\n" \
     "#!/bin/bash" \
     "echo \"\$*\" | grep -q \"pkcs11:id=%01;type=private\" || { echo \"missing slot 9a URI\" >&2; exit 1; }" \
     "echo \"\$*\" | grep -q \"provider:pkcs11\" || { echo \"missing provider:pkcs11\" >&2; exit 1; }" \
     "out=\"\"; prev=\"\"" \
     "for a in \"\$@\"; do [ \"\$prev\" = \"--output\" ] && out=\"\$a\"; prev=\"\$a\"; done" \
     "in_pe=\"\${!#}\"" \
     "exec /usr/lib/systemd/systemd-sbsign sign --private-key \"$WORK/keys/slot9a.key\" --private-key-source file --certificate \"$WORK/keys/db.crt\" --certificate-source file --output \"\$out\" \"\$in_pe\"" > "$WORK/bin/systemd-sbsign"

   printf "%s\n" \
     "#!/bin/bash" \
     "set -euo pipefail" \
     "out=\"\${!#}\"" \
     "case \"\$out\" in \"$WORK/usr-merged/lib/modules/$KVER/\"*) ;; *) echo \"FAIL: dracut output \$out not on same FS\" >&2; exit 18 ;; esac" \
     "printf \"initramfs-cpio-payload-for-%s\n\" \"$KVER\" > \"\$out\"" > "$WORK/bin/dracut"

   chmod +x "$WORK/bin/ykman" "$WORK/bin/systemd-sbsign" "$WORK/bin/dracut"

   export PATH="$WORK/bin:$PATH:/usr/lib/systemd"
   export YUBIOS_LIB_SH="$WORK/usr-merged/lib/yubiOS/lib.sh"
   export YUBIOS_UKI_SYNC_SH="$WORK/usr-merged/lib/yubiOS/uki/uki-sync-and-sign.sh"
   export YUBIOS_SB_KEYDIR="$WORK/keys"
   export YUBIOS_SB_ENROLLED_MARK="$WORK/state/.sb-enrolled"
   export YUBIOS_EFIVARS="$WORK/efivars"
   export YUBIOS_ESP="$WORK/esp"
   export YUBIOS_OCI_DIR="$WORK/oci"
   export YUBIOS_MODULES_DIR="$WORK/usr-merged/lib/modules"
   export YUBIOS_OS_RELEASE="$WORK/usr-merged/lib/os-release"
   export YUBIOS_PKCS11_LIB="$WORK/libykcs11.so"
   export YUBIOS_COMPOSEFS_DIGEST="e28bd60d1a8c71ac85caf471b58884f8063cccb9084fda20b6c82f76b43fe952"

   echo "--- Assertion 2a: 05-rpmostree.install runs on 3-way overlayfs without EXDEV, builds real UKI via ukify, signs with real systemd-sbsign, and verifies with real sbverify ---"
   "$WORK/usr-merged/lib/kernel/install.d/05-rpmostree.install" add "$KVER" /boot/entry "$WORK/usr-merged/lib/modules/$KVER/vmlinuz"
   test -s "$WORK/usr-merged/lib/modules/$KVER/initramfs.img"
   UKI_ESP="$WORK/esp/EFI/Linux/bootc/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
   test -s "$UKI_ESP"
   sbverify --cert "$WORK/keys/db.crt" "$UKI_ESP"

   echo "--- Assertion 2b: Local composefs OCI Image Layout v1.0.0 repository (/var/lib/yubiOS/oci) integrity ---"
   test -f "$WORK/oci/oci-layout"
   test -f "$WORK/oci/index.json"
   test -f "$WORK/oci/last-deployed.json"
   test -s "$WORK/oci/composefs/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
   sbverify --cert "$WORK/keys/db.crt" "$WORK/oci/composefs/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi"
   python3 -c "import json, hashlib, os, sys
oci_dir, kver, cfs = sys.argv[1], sys.argv[2], sys.argv[3]
layout = json.load(open(os.path.join(oci_dir, \"oci-layout\")))
assert layout.get(\"imageLayoutVersion\") == \"1.0.0\", layout
idx = json.load(open(os.path.join(oci_dir, \"index.json\")))
refs = {m[\"annotations\"][\"org.opencontainers.image.ref.name\"]: m for m in idx[\"manifests\"]}
assert \"yubios-local:latest\" in refs, refs
assert f\"yubios-local:{kver}\" in refs, refs
assert f\"yubios-uki:{cfs}\" in refs, refs
for fn in os.listdir(os.path.join(oci_dir, \"blobs\", \"sha256\")):
    p = os.path.join(oci_dir, \"blobs\", \"sha256\", fn)
    h = hashlib.sha256(open(p, \"rb\").read()).hexdigest()
    assert h == fn, f\"blob hash mismatch: {h} != {fn}\"
man_sha = refs[\"yubios-local:latest\"][\"digest\"].split(\":\", 1)[1]
man = json.load(open(os.path.join(oci_dir, \"blobs\", \"sha256\", man_sha)))
assert man[\"annotations\"][\"containers.bootc\"] == \"1\"
assert man[\"annotations\"][\"ostree.bootable\"] == \"true\"
assert man[\"annotations\"][\"org.yubios.uki.kver\"] == kver
assert man[\"annotations\"][\"org.yubios.uki.composefs\"] == cfs
assert man[\"annotations\"][\"org.yubios.uki.signer\"] == \"piv-slot-9a\"
last = json.load(open(os.path.join(oci_dir, \"last-deployed.json\")))
assert last[\"kver\"] == kver and last[\"composefs_digest\"] == cfs and last[\"signer\"] == \"piv-slot-9a\"
print(\"OCI repository verified:\", len(os.listdir(os.path.join(oci_dir, \"blobs\", \"sha256\"))), \"content-addressed blobs\")
" "$WORK/oci" "$KVER" "$YUBIOS_COMPOSEFS_DIGEST"

   echo "--- Assertion 2c: 95-yubios-uki-resign.install updates UKI and BLS entry ---"
   "$WORK/usr-merged/lib/kernel/install.d/95-yubios-uki-resign.install" add "$KVER" /boot/entry "$WORK/usr-merged/lib/modules/$KVER/vmlinuz"
   grep -q "95-yubios-uki-resign:${KVER}" "$WORK/oci/last-deployed.json"
   set -- "$WORK/esp/loader/entries/"bootc_yubios-*-1.conf
   BLS_CONF="$1"
   test -s "$BLS_CONF"
   grep -q "uki /EFI/Linux/bootc/bootc_composefs-${YUBIOS_COMPOSEFS_DIGEST}.efi" "$BLS_CONF"

   echo "--- Assertion 2d: enroll-sb.sh resign signs loader + UKI and commits to local OCI repo ---"
   if [ -f /usr/lib/systemd/boot/efi/systemd-bootaa64.efi ]; then
     cp -f /usr/lib/systemd/boot/efi/systemd-bootaa64.efi "$WORK/esp/EFI/systemd/systemd-bootaa64.efi"
     cp -f /usr/lib/systemd/boot/efi/systemd-bootaa64.efi "$WORK/esp/EFI/BOOT/BOOTAA64.EFI"
   elif [ -f /usr/lib/systemd/boot/efi/systemd-bootx64.efi ]; then
     cp -f /usr/lib/systemd/boot/efi/systemd-bootx64.efi "$WORK/esp/EFI/systemd/systemd-bootx64.efi"
     cp -f /usr/lib/systemd/boot/efi/systemd-bootx64.efi "$WORK/esp/EFI/BOOT/BOOTX64.EFI"
   fi
   "$WORK/usr-merged/lib/yubiOS/enroll-sb.sh" resign
   grep -q "\"reason\":\"enroll-sb-resign\"" "$WORK/oci/last-deployed.json"
   sbverify --cert "$WORK/keys/db.crt" "$UKI_ESP"

   echo "--- Assertion 2e: Negative fail-closed test when .sb-enrolled exists but db.crt is missing ---"
   mv "$WORK/keys/db.crt" "$WORK/keys/db.crt.bak"
   if "$WORK/usr-merged/lib/yubiOS/uki/uki-sync-and-sign.sh" --reason "negative-missing-dbcrt" --kver "$KVER"; then
     echo "FAIL: expected uki-sync-and-sign.sh to fail when db.crt is missing on an enrolled system" >&2
     exit 1
   fi
   mv "$WORK/keys/db.crt.bak" "$WORK/keys/db.crt"
   sbverify --cert "$WORK/keys/db.crt" "$UKI_ESP"
   echo "Negative fail-closed check passed; signed ESP UKI preserved."
' || die "in-guest ADR-034 UKI re-sign + local composefs OCI store assertions failed"

log "PASS: swu2f + ADR-034 kernel/package UKI re-sign hooks + local composefs OCI repository verified in VM"
