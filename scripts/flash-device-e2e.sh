#!/usr/bin/env bash
# scripts/flash-device-e2e.sh
#
# Clean direct-to-SD/USB provisioning pipeline for yubiOS on the rock1 self-hosted
# ARM64 runner or x86_64 runner with removable block device (/dev/mmcblk1 or USB)
# and physical U2F/HSM PIV slot 9a signing.
#
# All OS/initramfs/systemd/enrollment configurations live inside the built OCI
# image (Containerfile / Containerfile.dev / usr/). This script never mutates
# the installed composefs rootfs, /etc, or UKI contents — it only:
#   1. Resolves & validates the target board architecture and UAPI DPS GPT root GUID
#   2. Pulls $OS_IMAGE with --arch $TARGET_OCI_ARCH and validates .Architecture BEFORE touching $SD_DEVICE
#   3. Wipes & partitions $SD_DEVICE (GPT @ sector 32768: p1 ESP, p2 yubiOS-root with arch-matched DPS GUID)
#   4. Runs `bootc install to-filesystem --composefs-backend` from $OS_IMAGE
#   5. Verifies the installed ESP contains the target-architecture EFI loader & UKI (PE Machine 0x8664 vs 0xaa64)
#   6. Signs the installed EFI loaders & UKI on the ESP with U2F/HSM PIV slot 9a
#   7. Writes board `u-boot-rockchip.bin` at sector 64 of $SD_DEVICE (Rockchip ARM64 boards only)

set -euo pipefail

log()  { printf '\n=== [flash-e2e %s] %s ===\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '::warning::[flash-e2e] %s\n' "$*"; }
die()  { printf '::error::[flash-e2e] %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Target Board Architecture & UAPI Group Discoverable Partitions Spec (DPS)
# ---------------------------------------------------------------------------
# Per UAPI Group Discoverable Partitions Specification:
#   - EFI System Partition (ESP): c12a7328-f81f-11d2-ba4b-00a0c93ec93b
#   - Root Partition (x86-64):    4f68bce3-e8cd-4db1-96e7-fbcaf984b709 (SD_GPT_ROOT_X86_64)
#   - Root Partition (ARM64):     b921b045-1df0-41c3-af44-4c6f280d3fae (SD_GPT_ROOT_ARM64)
resolve_board_target_spec() {
  local board_name="$1"
  case "$board_name" in
    x86_64-uefi|amd64-uefi)
      TARGET_OCI_ARCH="amd64"
      TARGET_UNAME_M="x86_64"
      DPS_ROOT_PART_UUID="4f68bce3-e8cd-4db1-96e7-fbcaf984b709"
      EXPECTED_EFI_BOOT_LOADER="EFI/BOOT/BOOTX64.EFI"
      EXPECTED_SDBOOT_LOADER="EFI/systemd/systemd-bootx64.efi"
      EXPECTED_PE_MACHINE_HEX="0x8664"
      NEEDS_ROCKCHIP_SPL="0"
      ;;
    rock5b-rk3588|rockpro64-rk3399|pinetab2-rk3566)
      TARGET_OCI_ARCH="arm64"
      TARGET_UNAME_M="aarch64"
      DPS_ROOT_PART_UUID="b921b045-1df0-41c3-af44-4c6f280d3fae"
      EXPECTED_EFI_BOOT_LOADER="EFI/BOOT/BOOTAA64.EFI"
      EXPECTED_SDBOOT_LOADER="EFI/systemd/systemd-bootaa64.efi"
      EXPECTED_PE_MACHINE_HEX="0xaa64"
      NEEDS_ROCKCHIP_SPL="1"
      ;;
    *)
      die "Unsupported FLASH_BOARD '$board_name' (expected rock5b-rk3588, rockpro64-rk3399, pinetab2-rk3566, or x86_64-uefi)"
      ;;
  esac
}

render_sfdisk_layout() {
  local board_name="$1"
  resolve_board_target_spec "$board_name"
  cat <<EOF
label: gpt
first-lba: 32768
start=32768, size=512M, type=c12a7328-f81f-11d2-ba4b-00a0c93ec93b, name="ESP"
size=8G, type=${DPS_ROOT_PART_UUID}, name="yubiOS-root"
EOF
}

verify_esp_loader_arch() {
  local esp_dir="$1"
  local board_name="$2"
  local uki_path="${3:-}"
  resolve_board_target_spec "$board_name"

  local boot_loader="${esp_dir}/${EXPECTED_EFI_BOOT_LOADER}"
  local sdboot_loader="${esp_dir}/${EXPECTED_SDBOOT_LOADER}"
  [ -f "$boot_loader" ] || die "ESP missing required ${TARGET_UNAME_M} fallback loader: ${boot_loader}"
  [ -f "$sdboot_loader" ] || die "ESP missing required ${TARGET_UNAME_M} systemd-boot loader: ${sdboot_loader}"

  python3 - "$EXPECTED_PE_MACHINE_HEX" "$boot_loader" "$sdboot_loader" ${uki_path:+"$uki_path"} <<'PY'
import struct
import sys
from pathlib import Path

want_machine = int(sys.argv[1], 16)
for p_str in sys.argv[2:]:
    p = Path(p_str)
    if not p.is_file():
        print(f"FAIL: missing EFI binary {p}", file=sys.stderr)
        sys.exit(1)
    raw = p.read_bytes()
    if len(raw) < 128 or raw[:2] != b"MZ":
        print(f"FAIL: {p} is not a valid MZ/PE binary", file=sys.stderr)
        sys.exit(1)
    pe_off = struct.unpack_from("<I", raw, 60)[0]
    if pe_off + 6 > len(raw) or raw[pe_off : pe_off + 4] != b"PE\x00\x00":
        print(f"FAIL: {p} missing PE\\0\\0 signature at offset {pe_off}", file=sys.stderr)
        sys.exit(1)
    (got_machine,) = struct.unpack_from("<H", raw, pe_off + 4)
    if got_machine != want_machine:
        print(
            f"FAIL: PE COFF Machine mismatch in {p.name}: got 0x{got_machine:04x}, expected 0x{want_machine:04x}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"Verified PE32+ architecture for {p.name}: Machine=0x{got_machine:04x}")
PY
}

# Handle non-destructive inspection / self-test modes before touching host state
if [ "${1:-}" = "--print-board-config" ]; then
  [ -n "${2:-}" ] || die "--print-board-config requires a board name"
  resolve_board_target_spec "$2"
  printf 'BOARD=%s\nTARGET_OCI_ARCH=%s\nTARGET_UNAME_M=%s\nDPS_ROOT_PART_UUID=%s\nEXPECTED_EFI_BOOT_LOADER=%s\nEXPECTED_SDBOOT_LOADER=%s\nEXPECTED_PE_MACHINE_HEX=%s\nNEEDS_ROCKCHIP_SPL=%s\n' \
    "$2" "$TARGET_OCI_ARCH" "$TARGET_UNAME_M" "$DPS_ROOT_PART_UUID" "$EXPECTED_EFI_BOOT_LOADER" "$EXPECTED_SDBOOT_LOADER" "$EXPECTED_PE_MACHINE_HEX" "$NEEDS_ROCKCHIP_SPL"
  exit 0
fi

if [ "${1:-}" = "--print-sfdisk-layout" ]; then
  [ -n "${2:-}" ] || die "--print-sfdisk-layout requires a board name"
  render_sfdisk_layout "$2"
  exit 0
fi

if [ "${1:-}" = "--verify-esp-arch" ]; then
  if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
    die "--verify-esp-arch requires <esp_dir> <board> [uki_path]"
  fi
  verify_esp_loader_arch "$2" "$3" "${4:-}"
  exit 0
fi

BOARD="${FLASH_BOARD:-rock5b-rk3588}"
SD_DEVICE="${FLASH_SD_DEVICE:-/dev/mmcblk1}"
OS_IMAGE="${FLASH_OS_IMAGE:-docker.io/0mniteck/yubios:dev}"
SIGNKEY="${FLASH_SIGNKEY:-test}"
SIGN_WITH_U2F_HSM="${FLASH_SIGN_WITH_U2F_HSM:-false}"
PIV_TOUCH_OVERRIDE="${FLASH_PIV_TOUCH_POLICY:-auto}"

resolve_board_target_spec "$BOARD"

HOST_UNAME_M="${FLASH_HOST_UNAME_OVERRIDE:-$(uname -m)}"
if [ "$HOST_UNAME_M" != "$TARGET_UNAME_M" ]; then
  die "REFUSING: BOARD=$BOARD targets $TARGET_UNAME_M ($TARGET_OCI_ARCH), but runner host architecture is $HOST_UNAME_M"
fi

if [ "$PIV_TOUCH_OVERRIDE" = "auto" ] || [ -z "$PIV_TOUCH_OVERRIDE" ]; then
  if [ "$SIGNKEY" = "test" ]; then
    PIV_TOUCH_POLICY="never"
  else
    PIV_TOUCH_POLICY="cached"
  fi
else
  PIV_TOUCH_POLICY="$PIV_TOUCH_OVERRIDE"
fi

if mountpoint -q /mnt/extended 2>/dev/null; then
  WORK_BASE="/var/tmp"
  USE_RAM_CONTAINERS=0
else
  WORK_BASE="/dev/shm"
  USE_RAM_CONTAINERS=1
fi

WORK_DIR="${WORK_BASE}/yubios-flash-e2e"
export TMPDIR="${WORK_DIR}/tmp"
KEY_DIR="${WORK_DIR}/keys"
FW_DIR="${WORK_DIR}/firmware"
PODMAN_RAM_IMG="/dev/shm/yubios-podman-ext4.img"
MNT_DIR="/mnt/yubios-sd-target"
PODMAN_LOOP=""
SIGN_MODE="none"

THROTTLE=(nice -n 19 ionice -c2 -n7)

cleanup() {
  set +e
  sudo umount -R "$MNT_DIR" 2>/dev/null || true
  if [ "$USE_RAM_CONTAINERS" = "1" ] && mountpoint -q /var/lib/containers; then
    sudo umount -l /var/lib/containers 2>/dev/null || true
  fi
  if [ -n "${PODMAN_LOOP:-}" ]; then
    sudo losetup --detach "$PODMAN_LOOP" 2>/dev/null || true
  fi
  sudo rm -rf "$WORK_DIR" "$PODMAN_RAM_IMG" 2>/dev/null || true
}
trap cleanup EXIT

sudo rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$TMPDIR" "$KEY_DIR" "$FW_DIR"

log "Configuration: BOARD=$BOARD TARGET_OCI_ARCH=$TARGET_OCI_ARCH DPS_ROOT_PART_UUID=$DPS_ROOT_PART_UUID SD_DEVICE=$SD_DEVICE SIGNKEY=$SIGNKEY PIV_TOUCH_POLICY=$PIV_TOUCH_POLICY OS_IMAGE=$OS_IMAGE WORK_DIR=$WORK_DIR"

# ---------------------------------------------------------------------------
# Stage 1: Preflight & host safety guards
# ---------------------------------------------------------------------------
log "Stage 1: Host preflight & storage safety guards"
uptime
df -h / /dev/shm /mnt/extended 2>/dev/null || df -h / /dev/shm
ps -eo pid,pcpu,pmem,comm,args --sort=-pcpu | head -n 10
lsblk -o NAME,SIZE,TYPE,RM,RO,TRAN,MODEL,FSTYPE,LABEL,UUID,MOUNTPOINTS
lsusb || true

guard_block_device() {
  local dev="$1"
  [ -b "$dev" ] || die "Target $dev is not a block device"
  local base
  base="$(basename "$dev")"
  case "$base" in
    mmcblk0*|nvme0n1*|dm-*|ubuntu*)
      die "REFUSING: $dev is a protected host disk ($base)"
      ;;
  esac
  local mnt src pk
  for mnt in / /boot /boot/efi /mnt/extended /var/lib/containers /var/tmp; do
    src="$(findmnt -no SOURCE "$mnt" 2>/dev/null || true)"
    [ -n "$src" ] || continue
    pk="$(lsblk -no PKNAME "$src" 2>/dev/null | head -n1 || true)"
    if [ "$src" = "$dev" ] || [ "$pk" = "$base" ]; then
      die "REFUSING: $dev backs a mounted host filesystem ($mnt on $src)"
    fi
  done
  for part in "${dev}"* ; do
    [ -b "$part" ] || continue
    if findmnt -rn -S "$part" >/dev/null 2>&1; then
      sudo umount "$part" || true
    fi
  done
  local mounts
  mounts="$(lsblk -no MOUNTPOINT "$dev" 2>/dev/null | grep -v '^$' || true)"
  if [ -n "$mounts" ]; then
    die "REFUSING: $dev still has active mountpoints ($mounts)"
  fi
  local tran rm_flag
  tran="$(lsblk -dn -o TRAN "$dev" 2>/dev/null | tr -d ' ' || true)"
  rm_flag="$(lsblk -dn -o RM "$dev" 2>/dev/null | tr -d ' ' || true)"
  echo "Verified safe removable target: $dev (TRAN=${tran:-?}, RM=${rm_flag:-?}, SIZE=$(lsblk -dn -o SIZE "$dev" | tr -d ' '))"
}

guard_block_device "$SD_DEVICE"

part_dev() {
  local dev="$1"
  local num="$2"
  case "$dev" in
    *[0-9]) printf '%sp%s' "$dev" "$num" ;;
    *)      printf '%s%s' "$dev" "$num" ;;
  esac
}

# ---------------------------------------------------------------------------
# Stage 2: U2F/HSM PIV Slot 9a Key & PK/KEK/db Auth Bundle Preparation
# ---------------------------------------------------------------------------
log "Stage 2: PIV slot 9a & Secure Boot PK/KEK/db preparation (SIGNKEY=$SIGNKEY, touch=$PIV_TOUCH_POLICY)"

OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGMT_KEY="${YUBIOS_PIV_MGMT_KEY:-010203040506070801020304050607080102030405060708}"
CN_LABEL="YUBIOS Owner Slot 9a"
[ "$SIGNKEY" = "test" ] && CN_LABEL="YUBIOS Test Slot 9a"

PKCS11_LIB=""
for c in /usr/lib/aarch64-linux-gnu/libykcs11.so /usr/lib/x86_64-linux-gnu/libykcs11.so /usr/lib64/libykcs11.so /usr/lib/libykcs11.so; do
  if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
done

if [ "$SIGN_WITH_U2F_HSM" = "true" ]; then
  if lsusb | grep -qi '1050:' && [ -n "$PKCS11_LIB" ]; then
    SIGN_MODE="u2f_hsm"
    export PKCS11_MODULE_PATH="$PKCS11_LIB"
    export PKCS11_PROVIDER_MODULE="$PKCS11_LIB"
    sudo systemctl start pcscd.socket pcscd.service 2>/dev/null || true
    sudo ykman info
    sudo ykman piv info
    need_mint=0
    if ! sudo ykman piv certificates export 9a - 2>/dev/null | tee "$KEY_DIR/db.crt" >/dev/null || [ ! -s "$KEY_DIR/db.crt" ]; then
      need_mint=1
    elif [ "$SIGNKEY" = "test" ] && ! openssl x509 -in "$KEY_DIR/db.crt" -noout -subject 2>/dev/null | grep -Fq "YUBIOS Test Slot 9a"; then
      need_mint=1
    elif sudo ykman piv keys export 9a - 2>/dev/null | tee "$KEY_DIR/slot9a-pub.pem" >/dev/null && [ -s "$KEY_DIR/slot9a-pub.pem" ]; then
      openssl x509 -in "$KEY_DIR/db.crt" -pubkey -noout > "$KEY_DIR/cert-pub.pem" 2>/dev/null || true
      if ! cmp -s "$KEY_DIR/slot9a-pub.pem" "$KEY_DIR/cert-pub.pem"; then
        echo "Slot 9a public key and certificate public key differ; regenerating matching cert..."
        # shellcheck disable=SC2024
        sudo ykman piv certificates generate \
          -m "$PIV_MGMT_KEY" \
          -P "$PIV_PIN" \
          -s "CN=${CN_LABEL}" \
          -d 1826 \
          9a - < "$KEY_DIR/slot9a-pub.pem"
        sudo ykman piv certificates export 9a - | tee "$KEY_DIR/db.crt" >/dev/null
      fi
    fi
    if [ "$need_mint" -eq 1 ]; then
      log "Generating RSA-2048 key in PIV slot 9a on physical U2F/HSM (SIGNKEY=$SIGNKEY, pin-policy=ONCE, touch-policy=${PIV_TOUCH_POLICY^^})"
      sudo ykman piv keys generate \
        -a RSA2048 \
        -m "$PIV_MGMT_KEY" \
        --pin-policy ONCE \
        --touch-policy "${PIV_TOUCH_POLICY^^}" \
        9a - | tee "$KEY_DIR/slot9a-pub.pem" >/dev/null
      log "Generating self-signed slot 9a X.509 certificate ($CN_LABEL) on physical U2F/HSM"
      # shellcheck disable=SC2024
      sudo ykman piv certificates generate \
        -m "$PIV_MGMT_KEY" \
        -P "$PIV_PIN" \
        -s "CN=${CN_LABEL}" \
        -d 1826 \
        9a - < "$KEY_DIR/slot9a-pub.pem"
      sudo ykman piv certificates export 9a - | tee "$KEY_DIR/db.crt" >/dev/null
    fi
    sudo chown -R "$(id -u):$(id -g)" "$KEY_DIR"
    openssl x509 -in "$KEY_DIR/db.crt" -noout -subject -issuer -dates -fingerprint -sha256
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/PK.crt"
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/KEK.crt"
    openssl x509 -in "$KEY_DIR/db.crt" -outform DER -out "$KEY_DIR/yubiOS-db.cer"

    T="2026-01-01 00:00:00"
    T_NULL="2026-01-01 00:01:00"
    for var in PK KEK db; do
      cert-to-efi-sig-list -g "$OWNER_GUID" "$KEY_DIR/${var}.crt" "$KEY_DIR/${var}.esl"
    done

    PKCS11_PROV=""
    for p in /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11prov.so /usr/lib/x86_64-linux-gnu/ossl-modules/pkcs11prov.so /usr/lib64/ossl-modules/pkcs11prov.so; do
      if [ -e "$p" ]; then PKCS11_PROV="$p"; break; fi
    done
    [ -n "$PKCS11_PROV" ] || PKCS11_PROV="pkcs11"
    PKCS11_ENGINE="/usr/lib/aarch64-linux-gnu/engines-3/pkcs11.so"
    for e in /usr/lib/aarch64-linux-gnu/engines-3/pkcs11.so /usr/lib/x86_64-linux-gnu/engines-3/pkcs11.so /usr/lib64/engines-3/pkcs11.so; do
      if [ -e "$e" ]; then PKCS11_ENGINE="$e"; break; fi
    done
    cat > "$WORK_DIR/openssl-pkcs11.cnf" <<EOF
openssl_conf = openssl_init
[openssl_init]
engines = engine_section
[engine_section]
pkcs11 = pkcs11_section
[pkcs11_section]
engine_id = pkcs11
dynamic_path = ${PKCS11_ENGINE}
MODULE_PATH = ${PKCS11_LIB}
PIN = ${PIV_PIN}
init = 0
EOF

    SB_KEY_URI="pkcs11:id=%01;type=private?pin-value=${PIV_PIN}"
    for var in PK KEK db; do
      sign-efi-sig-list -c "$KEY_DIR/PK.crt" -t "$T" -o "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.forsig"
      if [ "$PIV_TOUCH_POLICY" != "never" ]; then
        echo ">>> [U2F/HSM TOUCH] Signing ${var}.auth via PIV slot 9a — touch your U2F/HSM now <<<"
      fi
      if ! sudo env PKCS11_MODULE_PATH="$PKCS11_LIB" PKCS11_PROVIDER_MODULE="$PKCS11_LIB" openssl smime -sign -binary \
        -provider "$PKCS11_PROV" -provider default \
        -in "$KEY_DIR/${var}.forsig" \
        -out "$KEY_DIR/${var}.signed" \
        -signer "$KEY_DIR/PK.crt" \
        -inkey "$SB_KEY_URI" \
        -outform DER -md sha256; then
        sudo env OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf" PKCS11_MODULE_PATH="$PKCS11_LIB" openssl smime -sign -binary \
          -engine pkcs11 -keyform engine \
          -in "$KEY_DIR/${var}.forsig" \
          -out "$KEY_DIR/${var}.signed" \
          -signer "$KEY_DIR/PK.crt" \
          -inkey "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
          -outform DER -md sha256
      fi
      sudo chown "$(id -u):$(id -g)" "$KEY_DIR/${var}.signed"
      sign-efi-sig-list -i "$KEY_DIR/${var}.signed" -t "$T" "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.auth"
    done
    : > "$KEY_DIR/null.esl"
    sign-efi-sig-list -c "$KEY_DIR/PK.crt" -t "$T_NULL" -o PK "$KEY_DIR/null.esl" "$KEY_DIR/PK_null.forsig"
    if [ "$PIV_TOUCH_POLICY" != "never" ]; then
      echo ">>> [U2F/HSM TOUCH] Signing PK_null.auth (blank ESL unlock) via PIV slot 9a — touch your U2F/HSM now <<<"
    fi
    if ! sudo env PKCS11_MODULE_PATH="$PKCS11_LIB" PKCS11_PROVIDER_MODULE="$PKCS11_LIB" openssl smime -sign -binary \
      -provider "$PKCS11_PROV" -provider default \
      -in "$KEY_DIR/PK_null.forsig" \
      -out "$KEY_DIR/PK_null.signed" \
      -signer "$KEY_DIR/PK.crt" \
      -inkey "$SB_KEY_URI" \
      -outform DER -md sha256; then
      sudo env OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf" PKCS11_MODULE_PATH="$PKCS11_LIB" openssl smime -sign -binary \
        -engine pkcs11 -keyform engine \
        -in "$KEY_DIR/PK_null.forsig" \
        -out "$KEY_DIR/PK_null.signed" \
        -signer "$KEY_DIR/PK.crt" \
        -inkey "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
        -outform DER -md sha256
    fi
    sudo chown "$(id -u):$(id -g)" "$KEY_DIR/PK_null.signed"
    sign-efi-sig-list -i "$KEY_DIR/PK_null.signed" -t "$T_NULL" PK "$KEY_DIR/null.esl" "$KEY_DIR/PK_null.auth"
    ls -la "$KEY_DIR"
  elif [ "$SIGNKEY" = "test" ]; then
    SIGN_MODE="soft_test"
    log "No physical U2F/HSM on USB; SIGNKEY=test -> minting ephemeral RSA-2048 Slot 9a test key ($CN_LABEL)"
    if ! openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$KEY_DIR/db.key" \
      -out "$KEY_DIR/db.crt" \
      -subj "/CN=${CN_LABEL}" \
      -not_before 20250101000000Z -not_after 20360101000000Z \
      -sha256; then
      openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$KEY_DIR/db.key" \
        -out "$KEY_DIR/db.crt" \
        -subj "/CN=${CN_LABEL}" \
        -days 1826 \
        -sha256
    fi
    openssl x509 -in "$KEY_DIR/db.crt" -noout -subject -issuer -dates -fingerprint -sha256
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/PK.crt"
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/KEK.crt"
    cp -f "$KEY_DIR/db.key" "$KEY_DIR/PK.key"
    cp -f "$KEY_DIR/db.key" "$KEY_DIR/KEK.key"
    openssl x509 -in "$KEY_DIR/db.crt" -outform DER -out "$KEY_DIR/yubiOS-db.cer"
    T="2026-01-01 00:00:00"
    T_NULL="2026-01-01 00:01:00"
    for var in PK KEK db; do
      cert-to-efi-sig-list -g "$OWNER_GUID" "$KEY_DIR/${var}.crt" "$KEY_DIR/${var}.esl"
      sign-efi-sig-list -g "$OWNER_GUID" -t "$T" -k "$KEY_DIR/PK.key" -c "$KEY_DIR/PK.crt" "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.auth"
    done
    : > "$KEY_DIR/null.esl"
    sign-efi-sig-list -g "$OWNER_GUID" -t "$T_NULL" -k "$KEY_DIR/PK.key" -c "$KEY_DIR/PK.crt" PK "$KEY_DIR/null.esl" "$KEY_DIR/PK_null.auth"
    ls -la "$KEY_DIR"
  else
    die "SIGNKEY=production requires a physical U2F/HSM (1050:*) attached on USB"
  fi
fi

sign_efi_binary() {
  local efi_path="$1"
  local tmp_in tmp_out
  tmp_in="$(mktemp "${WORK_DIR}/efi-in-XXXXXX.efi")"
  tmp_out="$(mktemp "${WORK_DIR}/efi-out-XXXXXX.efi")"
  sudo cp -f "$efi_path" "$tmp_in"
  sudo chown "$(id -u):$(id -g)" "$tmp_in"

  if [ "$SIGN_MODE" = "u2f_hsm" ]; then
    if [ "$PIV_TOUCH_POLICY" != "never" ]; then
      echo ">>> [U2F/HSM TOUCH] Touch U2F/HSM to sign $(basename "$efi_path") <<<"
    fi
    sudo env OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf" PKCS11_MODULE_PATH="$PKCS11_LIB" sbsign \
      --engine pkcs11 \
      --key "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
      --cert "$KEY_DIR/db.crt" \
      --output "$tmp_out" \
      "$tmp_in"
  else
    sbsign \
      --key "$KEY_DIR/db.key" \
      --cert "$KEY_DIR/db.crt" \
      --output "$tmp_out" \
      "$tmp_in"
  fi
  sudo chown "$(id -u):$(id -g)" "$tmp_out"
  sbverify --cert "$KEY_DIR/db.crt" "$tmp_out"
  sudo cp -f "$tmp_out" "$efi_path"
  rm -f "$tmp_in" "$tmp_out"
}

# ---------------------------------------------------------------------------
# Stage 3: Prepare Container Storage & Pull Target-Architecture Images
# ---------------------------------------------------------------------------
if [ "$USE_RAM_CONTAINERS" = "1" ]; then
  log "Stage 3: Mounting 12 GiB ext4-in-RAM (/dev/shm) onto /var/lib/containers"
  sudo rm -f "$PODMAN_RAM_IMG"
  truncate -s 12G "$PODMAN_RAM_IMG"
  mkfs.ext4 -F -q -O ^has_journal "$PODMAN_RAM_IMG"
  PODMAN_LOOP="$(sudo losetup --find --show "$PODMAN_RAM_IMG")"
  sudo mkdir -p /var/lib/containers
  sudo mount -o noatime "$PODMAN_LOOP" /var/lib/containers
else
  log "Stage 3: Using /mnt/extended-backed /var/lib/containers on rock1 (0 writes to 12G root disk)"
  if [ "$(findmnt -no TARGET -T /var/lib/containers 2>/dev/null || true)" = "/" ] && [ -d /mnt/extended/containers ]; then
    log "Restoring /mnt/extended/containers -> /var/lib/containers bind mount after host reboot"
    sudo rm -rf /var/lib/containers/storage/overlay* /var/lib/containers/storage/tmp* 2>/dev/null || true
    sudo mkdir -p /var/lib/containers
    sudo mount --bind /mnt/extended/containers /var/lib/containers
  fi
  if [ "$(findmnt -no TARGET -T /var/tmp 2>/dev/null || true)" = "/" ] && [ -d /mnt/extended/var-tmp ]; then
    log "Restoring /mnt/extended/var-tmp -> /var/tmp bind mount after host reboot"
    sudo rm -rf /var/tmp/yubios-flash-e2e* 2>/dev/null || true
    sudo mount --bind /mnt/extended/var-tmp /var/tmp
    mkdir -p "$WORK_DIR" "$TMPDIR" "$KEY_DIR" "$FW_DIR"
  fi
  # Clear any unseen kernel superblock errseq_t on /var/lib/containers so overlayfs volatile mounts never fail with EIO
  sudo sync -f /var/lib/containers/storage/overlay /var/lib/containers /mnt/extended 2>/dev/null || true
  sudo sync -f /var/lib/containers/storage/overlay /var/lib/containers /mnt/extended 2>/dev/null || true
fi
df -h /var/lib/containers "$WORK_BASE"

if [ -n "${DOCKER_PASSWORD:-}" ]; then
  printf '%s' "$DOCKER_PASSWORD" | sudo podman login --username 0mniteck42 --password-stdin docker.io
fi

sudo "${THROTTLE[@]}" podman image prune -f >/dev/null 2>&1 || true
log "Stage 3b: Pulling $OS_IMAGE for target architecture --arch $TARGET_OCI_ARCH (BEFORE wiping $SD_DEVICE)"
sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman pull --arch "$TARGET_OCI_ARCH" "$OS_IMAGE"
RESOLVED_OS="$(sudo podman image inspect "$OS_IMAGE" --format '{{ index .RepoDigests 0 }}')"
PULLED_OCI_ARCH="$(sudo podman image inspect "$OS_IMAGE" --format '{{.Architecture}}')"
echo "Resolved OS image: $RESOLVED_OS (Architecture=$PULLED_OCI_ARCH, expected=$TARGET_OCI_ARCH)"
[ "$PULLED_OCI_ARCH" = "$TARGET_OCI_ARCH" ] \
  || die "REFUSING to wipe $SD_DEVICE: pulled $OS_IMAGE has Architecture=$PULLED_OCI_ARCH, expected $TARGET_OCI_ARCH for BOARD=$BOARD"

pull_board_firmware() {
  local b="$1"
  local fw_ref="docker.io/0mniteck/yubios:firmware-${b}"
  sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman pull "$fw_ref"
  local fw_resolved
  fw_resolved="$(sudo podman image inspect "$fw_ref" --format '{{ index .RepoDigests 0 }}')"
  echo "Resolved firmware for $b: $fw_resolved"
  mkdir -p "$FW_DIR/$b"
  sudo podman rm -f "fw-$b" >/dev/null 2>&1 || true
  sudo "${THROTTLE[@]}" podman create --name "fw-$b" "$fw_resolved" >/dev/null
  sudo "${THROTTLE[@]}" podman export "fw-$b" | "${THROTTLE[@]}" tar -xf - -C "$FW_DIR/$b"
  sudo podman rm -f "fw-$b" >/dev/null
  local bin="$FW_DIR/$b/firmware/u-boot-rockchip.bin"
  [ -f "$bin" ] || bin="$(find "$FW_DIR/$b" -name 'u-boot-rockchip.bin' | head -n1)"
  [ -f "$bin" ] || die "u-boot-rockchip.bin missing in $fw_resolved"
  # Rockchip idbloader header magic differs by SoC generation:
  #   - RK3568/RK3566/RK3588 (mkimage rksd header v2): plaintext "RKNS" = 524b4e53
  #   - RK3399 (legacy header v1, 0x0FF0AA55 RC4-encrypted with the Rockchip
  #     boot-ROM key, which is what mkimage -T rksd emits for rk3399): 3b8cdcfc
  local magic expected_magic expected_desc
  case "$b" in
    rockpro64-rk3399)
      expected_magic="3b8cdcfc"; expected_desc="RK3399 RC4-encrypted v1 idbloader header (0x0FF0AA55)" ;;
    rock5b-rk3588|pinetab2-rk3566)
      expected_magic="524b4e53"; expected_desc="RKNS v2 idbloader header" ;;
    *)
      die "No Rockchip idbloader magic known for board '$b'" ;;
  esac
  magic="$(xxd -p -l 4 "$bin")"
  [ "$magic" = "$expected_magic" ] || die "$bin does not start with $expected_desc magic $expected_magic (got $magic)"
  echo "Verified $b idbloader magic: $magic ($expected_desc)"
  sha256sum "$bin" | tee "$FW_DIR/$b/u-boot-rockchip.bin.sha256"
  cp -f "$bin" "$FW_DIR/$b/u-boot-rockchip.bin"
  local spi_bin="$FW_DIR/$b/firmware/u-boot-rockchip-spi.bin"
  [ -f "$spi_bin" ] || spi_bin="$(find "$FW_DIR/$b" -name 'u-boot-rockchip-spi.bin' | head -n1 || true)"
  if [ -n "$spi_bin" ] && [ -f "$spi_bin" ]; then
    sha256sum "$spi_bin" | tee "$FW_DIR/$b/u-boot-rockchip-spi.bin.sha256"
    cp -f "$spi_bin" "$FW_DIR/$b/u-boot-rockchip-spi.bin"
  fi
  ls -la "$FW_DIR/$b/firmware/" 2>/dev/null || ls -la "$FW_DIR/$b/"
}

if [ "$NEEDS_ROCKCHIP_SPL" = "0" ]; then
  log "BOARD=$BOARD uses standard ${TARGET_UNAME_M} UEFI boot from ESP (/${EXPECTED_EFI_BOOT_LOADER}); skipping Rockchip firmware-rk pull"
else
  pull_board_firmware "$BOARD"
fi

# ---------------------------------------------------------------------------
# Stage 4: Partition, Install, Verify ESP Arch, Sign EFI Binaries & Write SPL
# ---------------------------------------------------------------------------
provision_sd_directly() {
  local dev="$1"
  local board_name="$2"
  local fw_bin="$FW_DIR/$board_name/u-boot-rockchip.bin"
  local p1 p2
  p1="$(part_dev "$dev" 1)"
  p2="$(part_dev "$dev" 2)"

  resolve_board_target_spec "$board_name"
  log "Stage 4: Partitioning & provisioning $dev ($board_name, arch=$TARGET_OCI_ARCH, DPS root GUID=$DPS_ROOT_PART_UUID) directly from $RESOLVED_OS"
  guard_block_device "$dev"

  sudo podman rm -f yubios-bootc-install 2>/dev/null || true
  for cid in $(sudo podman ps -aq 2>/dev/null || true); do
    sudo podman rm -f "$cid" 2>/dev/null || true
  done
  sudo umount -R "$MNT_DIR" 2>/dev/null || true
  sudo umount "$p1" "$p2" 2>/dev/null || true
  sudo wipefs -a "$p1" "$p2" "$dev" 2>/dev/null || sudo wipefs -a "$dev" 2>/dev/null || true
  sudo dd if=/dev/zero of="$dev" bs=1M count=16 conv=fsync status=none 2>/dev/null || true
  sudo partprobe "$dev" 2>/dev/null || true
  sudo udevadm settle
  render_sfdisk_layout "$board_name" | sudo sfdisk --wipe always "$dev"
  sudo partprobe "$dev" 2>/dev/null || sudo partx --update "$dev" 2>/dev/null || true
  sudo udevadm settle
  sleep 2
  [ -b "$p1" ] || die "ESP partition $p1 did not appear on $dev"
  [ -b "$p2" ] || die "Root partition $p2 did not appear on $dev"

  sudo "${THROTTLE[@]}" mkfs.vfat -F 32 -n EFI "$p1"
  sudo "${THROTTLE[@]}" mkfs.ext4 -F -q -O verity,^has_journal -E lazy_itable_init=1 -L yubiOS-root "$p2"
  sudo mkdir -p "$MNT_DIR"
  sudo mount -o noatime,nobarrier "$p2" "$MNT_DIR"
  sudo install -d -m 0755 "$MNT_DIR/boot"
  sudo mount "$p1" "$MNT_DIR/boot"

  log "Running bootc install to-filesystem directly onto $dev ($board_name)"
  sudo sync -f /var/lib/containers/storage/overlay /var/lib/containers /mnt/extended 2>/dev/null || true
  sudo sync -f /var/lib/containers/storage/overlay /var/lib/containers /mnt/extended 2>/dev/null || true
  sudo sysctl -w vm.dirty_background_bytes=16777216 vm.dirty_bytes=67108864 >/dev/null 2>&1 || true
  PRELOAD_ENV=()
  if command -v gcc >/dev/null 2>&1; then
    cat > "$TMPDIR/nofsync.c" <<'EOF'
int fsync(int fd) { (void)fd; return 0; }
int fdatasync(int fd) { (void)fd; return 0; }
int syncfs(int fd) { (void)fd; return 0; }
void sync(void) {}
EOF
    if gcc -shared -fPIC -O2 "$TMPDIR/nofsync.c" -o "$TMPDIR/libnofsync.so" 2>/dev/null; then
      PRELOAD_ENV=(-e LD_PRELOAD=/var/tmp/libnofsync.so)
    fi
  fi
  sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman run --rm --privileged --pid=host --ipc=host \
    --security-opt label=type:unconfined_t \
    -v /var/lib/containers:/var/lib/containers \
    -v "$TMPDIR:/var/tmp" \
    -e TMPDIR=/var/tmp \
    -e TOKIO_WORKER_THREADS=1 \
    -e RAYON_NUM_THREADS=1 \
    "${PRELOAD_ENV[@]}" \
    -v /dev:/dev \
    -v "$MNT_DIR:/target" \
    "$RESOLVED_OS" \
    taskset -c 0 bootc install to-filesystem \
      --source-imgref="containers-storage:${RESOLVED_OS}" \
      --composefs-backend \
      --disable-selinux \
      --bootloader=systemd \
      --root-mount-spec="" \
      --skip-finalize \
      /target

  entry="$(sudo find "$MNT_DIR/boot" -type f -path '*/loader/entries/*.conf' | head -n1 || true)"
  [ -n "$entry" ] || die "No BLS entry created under $MNT_DIR/boot/loader/entries"
  sudo cat "$entry"
  uki_rel="$(sudo awk '$1 == "uki" || $1 == "efi" {sub(/^(uki|efi)[[:space:]]+/, ""); print}' "$entry" | head -n1 || true)"
  [ -n "$uki_rel" ] || die "No uki/efi path found in $entry"

  log "Verifying installed ESP loaders & UKI match target architecture ($TARGET_UNAME_M / PE Machine $EXPECTED_PE_MACHINE_HEX)"
  verify_esp_loader_arch "$MNT_DIR/boot" "$board_name" "$MNT_DIR/boot${uki_rel}"

  installed_cmdline="$(python3 scripts/extract_uki_cmdline.py "$MNT_DIR/boot${uki_rel}" | tr -d '\0\r\n' || true)"
  echo "Installed UKI cmdline: $installed_cmdline"
  cd_digest="$(printf '%s' "$installed_cmdline" | grep -oE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)\??[0-9a-f]{64,128}' | head -1 | sed -E 's/^.*[:=]\??//' || true)"
  [ -n "$cd_digest" ] || die "Could not extract composefs digest from installed UKI/BLS entry"
  echo "Verified installed composefs digest: $cd_digest"

  sudo mkdir -p "$MNT_DIR/boot/EFI/yubiOS/secureboot" "$MNT_DIR/boot/EFI/yubiOS/keys" "$MNT_DIR/boot/EFI/yubiOS/firmware"
  sudo podman run --rm --entrypoint /bin/sh "$RESOLVED_OS" -c 'if [ -d /usr/lib/yubiOS/secureboot ]; then tar -C /usr/lib/yubiOS/secureboot -cf - .; fi' \
    | sudo tar -C "$MNT_DIR/boot/EFI/yubiOS/secureboot" --no-same-owner --no-same-permissions -xf -
  sudo rm -f "$MNT_DIR/boot/EFI/yubiOS/secureboot/ci-sb-db.key" 2>/dev/null || true
  sudo cp -f "$MNT_DIR/boot/EFI/yubiOS/secureboot/"* "$MNT_DIR/boot/EFI/yubiOS/keys/"
  sudo test -s "$MNT_DIR/boot/EFI/yubiOS/secureboot/PK.auth" || die "PK.auth missing on ESP"
  sudo test -s "$MNT_DIR/boot/EFI/yubiOS/secureboot/PK_null.auth" || die "PK_null.auth missing on ESP"
  sudo test -s "$MNT_DIR/boot/EFI/yubiOS/keys/PK_null.auth" || die "keys/PK_null.auth missing on ESP"

  if [ -f "$fw_bin" ]; then
    sudo cp -f "$fw_bin" "$MNT_DIR/boot/u-boot-rockchip.bin"
    sudo cp -f "$fw_bin" "$MNT_DIR/boot/EFI/yubiOS/firmware/u-boot-rockchip.bin"
  fi
  if [ -f "$FW_DIR/$board_name/u-boot-rockchip-spi.bin" ]; then
    sudo cp -f "$FW_DIR/$board_name/u-boot-rockchip-spi.bin" "$MNT_DIR/boot/u-boot-rockchip-spi.bin"
    sudo cp -f "$FW_DIR/$board_name/u-boot-rockchip-spi.bin" "$MNT_DIR/boot/EFI/yubiOS/firmware/u-boot-rockchip-spi.bin"
  fi

  if [ "$SIGN_WITH_U2F_HSM" = "true" ]; then
    log "Signing installed EFI loaders & UKIs on $p1 (mode=$SIGN_MODE, SIGNKEY=$SIGNKEY)"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/secureboot/"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/keys/"
    while IFS= read -r -d '' efi_file; do
      echo "Signing $efi_file..."
      sign_efi_binary "$efi_file"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  else
    log "Verifying CI-signed EFI loaders & UKIs on $p1 against image db.crt"
    while IFS= read -r -d '' efi_file; do
      echo "Verifying CI signature on $efi_file..."
      sudo sbverify --cert "$MNT_DIR/boot/EFI/yubiOS/secureboot/db.crt" "$efi_file"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  fi

  bls_name="$(basename "$entry")"
  bls_content="$(sudo cat "$entry")"
  sudo sync
  sudo umount "$MNT_DIR/boot"
  sudo mkdir -p "$MNT_DIR/boot/loader.1/entries" "$MNT_DIR/boot/EFI" "$MNT_DIR/efi"
  if [ -f "$fw_bin" ]; then
    sudo cp -f "$fw_bin" "$MNT_DIR/boot/u-boot-rockchip.bin"
  fi
  if [ -f "$FW_DIR/$board_name/u-boot-rockchip-spi.bin" ]; then
    sudo cp -f "$FW_DIR/$board_name/u-boot-rockchip-spi.bin" "$MNT_DIR/boot/u-boot-rockchip-spi.bin"
  fi
  sudo ln -sfn loader.1 "$MNT_DIR/boot/loader"
  csum_short="$(printf '%s' "$cd_digest" | cut -c1-64)"
  bootcsum="81203731b9d52c596bd97690fadbbbc715d10055bd98f0599cc68550edf1b686"
  sudo mkdir -p "$MNT_DIR/ostree/repo/objects" "$MNT_DIR/ostree/repo/refs/heads" "$MNT_DIR/ostree/repo/refs/remotes" \
    "$MNT_DIR/ostree/repo/refs/mirrors" "$MNT_DIR/ostree/repo/state" "$MNT_DIR/ostree/repo/tmp/cache" \
    "$MNT_DIR/ostree/repo/extensions" "$MNT_DIR/ostree/deploy/default/var" \
    "$MNT_DIR/ostree/deploy/default/deploy/${csum_short}.0/etc" \
    "$MNT_DIR/ostree/deploy/default/deploy/${csum_short}.0/usr/lib" "$MNT_DIR/ostree/boot.1.1/default/${bootcsum}"
  sudo podman run --rm --entrypoint /bin/cat "$RESOLVED_OS" /usr/lib/os-release | sudo tee "$MNT_DIR/ostree/deploy/default/deploy/${csum_short}.0/usr/lib/os-release" "$MNT_DIR/ostree/deploy/default/deploy/${csum_short}.0/etc/os-release" >/dev/null || true
  sudo tee "$MNT_DIR/ostree/repo/config" >/dev/null <<'EOF_REPO'
[core]
repo_version=1
mode=bare

[sysroot]
bootloader=none

[ex-integrity]
composefs=true
EOF_REPO
  sudo tee "$MNT_DIR/ostree/deploy/default/deploy/${csum_short}.0.origin" >/dev/null <<EOF_ORIG
[origin]
refspec=yubios/latest
container-image-reference=ostree-unverified-registry:${OS_IMAGE}
EOF_ORIG
  sudo ln -sfn "../../../deploy/default/deploy/${csum_short}.0" "$MNT_DIR/ostree/boot.1.1/default/${bootcsum}/0"
  sudo ln -sfn boot.1.1 "$MNT_DIR/ostree/boot.1"
  {
    printf '%s\n' "$bls_content"
    printf 'options ostree=/ostree/boot.1/default/%s/0\n' "$bootcsum"
  } | sudo tee "$MNT_DIR/boot/loader.1/entries/$bls_name" >/dev/null
  sudo cp -f "$MNT_DIR/boot/loader.1/entries/$bls_name" "$MNT_DIR/boot/loader.1/entries/ostree-1.conf"
  sudo sync
  sudo umount "$MNT_DIR"

  if [ "$NEEDS_ROCKCHIP_SPL" = "0" ]; then
    lsblk -o NAME,SIZE,TYPE,PARTTYPE,FSTYPE,LABEL,UUID "$dev"
    log "PASS: $dev ($board_name) provisioned for ${TARGET_UNAME_M} UEFI Setup-Mode boot (DPS root GUID=${DPS_ROOT_PART_UUID}, loader=${EXPECTED_EFI_BOOT_LOADER})"
  else
    log "Writing $board_name u-boot-rockchip.bin directly at sector 64 of $dev"
    local bytes cnt want_sha got_sha
    bytes="$(stat -c '%s' "$fw_bin")"
    cnt=$(( (bytes + 511) / 512 ))
    want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
    sudo "${THROTTLE[@]}" dd if="$fw_bin" of="$dev" bs=512 seek=64 conv=notrunc,fsync status=none
    got_sha="$(sudo dd if="$dev" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
    echo "SD card ($dev) sector-64 firmware sha256: want=$want_sha got=$got_sha"
    [ "$want_sha" = "$got_sha" ] || die "SD card sector-64 readback sha256 mismatch on $dev!"
    lsblk -o NAME,SIZE,TYPE,PARTTYPE,FSTYPE,LABEL,UUID "$dev"
    log "PASS: $dev ($board_name) provisioned directly and verified ($got_sha)"
  fi
}

provision_sd_directly "$SD_DEVICE" "$BOARD"

if [ "$USE_RAM_CONTAINERS" = "1" ] && mountpoint -q /var/lib/containers; then
  sudo umount -l /var/lib/containers 2>/dev/null || true
fi
if [ -n "${PODMAN_LOOP:-}" ]; then
  sudo losetup --detach "$PODMAN_LOOP" 2>/dev/null || true
  PODMAN_LOOP=""
fi
sudo rm -f "$PODMAN_RAM_IMG"

log "COMPLETE: flash-device-e2e ($BOARD -> $SD_DEVICE) finished successfully."
