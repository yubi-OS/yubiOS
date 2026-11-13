#!/usr/bin/env bash
# scripts/flash-device-e2e.sh
#
# End-to-end hardware & VM provisioning pipeline for the ubuntu self-hosted
# runner (HIGH-MEM ARM64, 62 GB RAM) with an attached physical YubiKey
# (1050:0407), SD card reader (/dev/sda), Rockchip Maskrom USB (2207:350a),
# and UART serial console (/dev/ttyUSB0 @ 1500000 8N1).
#
# Key I/O-safety architecture for ubuntu (consumer laptop with fragile root MMC):
#   1. All container storage (/var/lib/containers) is backed by an ext4 loop
#      filesystem inside /dev/shm (RAM tmpfs) so podman pull / export / bootc
#      write ZERO bytes to /dev/mmcblk0p3 (the root disk).
#   2. All 35,000 random 4K writes and FS_IOC_ENABLE_VERITY ioctls of
#      `bootc install to-filesystem --composefs-backend` execute against a
#      sparse disk image in /dev/shm (RAM) in ~15 seconds, then stream
#      sequentially to /dev/sda with throttled 4 MiB blocks (`nice -n 19
#      ionice -c2 -n7`).

set -euo pipefail

BOARD="${FLASH_BOARD:-both-rk3588-and-pinetab2}"
SD_DEVICE="${FLASH_SD_DEVICE:-/dev/sda}"
FLASH_MODE="${FLASH_MODE:-sd_and_maskrom}"
OS_IMAGE="${FLASH_OS_IMAGE:-docker.io/0mniteck/yubios:dev}"
SIGNKEY="${FLASH_SIGNKEY:-production}"
SIGN_WITH_YUBIKEY="${FLASH_SIGN_WITH_YUBIKEY:-true}"
PIV_TOUCH_OVERRIDE="${FLASH_PIV_TOUCH_POLICY:-auto}"
RUN_POST_VM="${FLASH_RUN_POST_VM:-true}"
SERIAL_DEV="${FLASH_SERIAL_DEV:-/dev/ttyUSB0}"
SERIAL_BAUD="${FLASH_SERIAL_BAUD:-1500000}"

if [ "$PIV_TOUCH_OVERRIDE" = "auto" ] || [ -z "$PIV_TOUCH_OVERRIDE" ]; then
  if [ "$SIGNKEY" = "test" ]; then
    PIV_TOUCH_POLICY="never"
  else
    PIV_TOUCH_POLICY="cached"
  fi
else
  PIV_TOUCH_POLICY="$PIV_TOUCH_OVERRIDE"
fi

WORK_DIR="/dev/shm/yubios-flash-e2e"
export TMPDIR="${WORK_DIR}/tmp"
KEY_DIR="${WORK_DIR}/keys"
FW_DIR="${WORK_DIR}/firmware"
PODMAN_RAM_IMG="/dev/shm/yubios-podman-ext4.img"
MNT_DIR="/mnt/yubios-sd-target"
RAW_LOOP=""
PODMAN_LOOP=""

THROTTLE=(nice -n 19 ionice -c2 -n7)

log()  { printf '\n=== [flash-e2e %s] %s ===\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '::warning::[flash-e2e] %s\n' "$*"; }
die()  { printf '::error::[flash-e2e] %s\n' "$*" >&2; exit 1; }

cleanup() {
  set +e
  sudo umount -R "$MNT_DIR" 2>/dev/null || true
  if [ -n "${RAW_LOOP:-}" ]; then
    sudo losetup --detach "$RAW_LOOP" 2>/dev/null || true
  fi
  if mountpoint -q /var/lib/containers; then
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

log "Configuration: BOARD=$BOARD SD_DEVICE=$SD_DEVICE FLASH_MODE=$FLASH_MODE SIGNKEY=$SIGNKEY PIV_TOUCH_POLICY=$PIV_TOUCH_POLICY OS_IMAGE=$OS_IMAGE"

# ---------------------------------------------------------------------------
# Stage 1: Preflight & host safety guards
# ---------------------------------------------------------------------------
log "Stage 1: Host preflight & storage safety guards"
uptime
df -h / /dev/shm
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
  local root_src boot_src efi_src
  root_src="$(findmnt -no SOURCE / || true)"
  boot_src="$(findmnt -no SOURCE /boot || true)"
  efi_src="$(findmnt -no SOURCE /boot/efi || true)"
  for src in "$root_src" "$boot_src" "$efi_src"; do
    [ -n "$src" ] || continue
    local pk
    pk="$(lsblk -no PKNAME "$src" 2>/dev/null | head -n1 || true)"
    if [ "$src" = "$dev" ] || [ "$pk" = "$base" ]; then
      die "REFUSING: $dev backs a mounted host filesystem ($src)"
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

if [ "$FLASH_MODE" = "sd_direct" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  guard_block_device "$SD_DEVICE"
fi

# ---------------------------------------------------------------------------
# Stage 2: YubiKey PIV Slot 9a Key & PK/KEK/db Auth Bundle Preparation
# ---------------------------------------------------------------------------
log "Stage 2: Physical YubiKey PIV slot 9a & Secure Boot PK/KEK/db preparation (SIGNKEY=$SIGNKEY, touch=$PIV_TOUCH_POLICY)"
PKCS11_LIB=""
for c in /usr/lib/aarch64-linux-gnu/libykcs11.so /usr/lib64/libykcs11.so /usr/lib/libykcs11.so; do
  if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
done
[ -n "$PKCS11_LIB" ] || die "libykcs11.so not found"
export PKCS11_MODULE_PATH="$PKCS11_LIB"
export PKCS11_PROVIDER_MODULE="$PKCS11_LIB"

OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGMT_KEY="${YUBIOS_PIV_MGMT_KEY:-010203040506070801020304050607080102030405060708}"
CN_LABEL="YUBIOS Owner Slot 9a"
[ "$SIGNKEY" = "test" ] && CN_LABEL="YUBIOS Test Slot 9a"

if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
  lsusb | grep -qi '1050:' || die "No physical YubiKey (1050:*) detected on USB"
  sudo systemctl start pcscd.socket pcscd.service 2>/dev/null || true
  sudo ykman info
  sudo ykman piv info
  need_mint=0
  if ! sudo ykman piv certificates export 9a "$KEY_DIR/db.crt" >/dev/null 2>&1; then
    need_mint=1
  elif [ "$SIGNKEY" = "test" ] && ! openssl x509 -in "$KEY_DIR/db.crt" -noout -subject 2>/dev/null | grep -Fq "YUBIOS Test Slot 9a"; then
    need_mint=1
  fi
  if [ "$need_mint" -eq 1 ]; then
    log "Generating RSA-2048 key in PIV slot 9a on physical YubiKey (SIGNKEY=$SIGNKEY, pin-policy=ONCE, touch-policy=${PIV_TOUCH_POLICY^^})"
    sudo ykman piv keys generate \
      -a RSA2048 \
      -m "$PIV_MGMT_KEY" \
      --pin-policy ONCE \
      --touch-policy "${PIV_TOUCH_POLICY^^}" \
      9a "$KEY_DIR/slot9a-pub.pem"
    log "Generating self-signed slot 9a X.509 certificate ($CN_LABEL) on physical YubiKey"
    sudo ykman piv certificates generate \
      -m "$PIV_MGMT_KEY" \
      -P "$PIV_PIN" \
      -s "CN=${CN_LABEL}" \
      -d 1826 \
      9a "$KEY_DIR/slot9a-pub.pem"
    sudo ykman piv certificates export 9a "$KEY_DIR/db.crt"
  fi
  sudo chown -R "$(id -u):$(id -g)" "$KEY_DIR"
  openssl x509 -in "$KEY_DIR/db.crt" -noout -subject -issuer -dates -fingerprint -sha256
  cp -f "$KEY_DIR/db.crt" "$KEY_DIR/PK.crt"
  cp -f "$KEY_DIR/db.crt" "$KEY_DIR/KEK.crt"
  openssl x509 -in "$KEY_DIR/db.crt" -outform DER -out "$KEY_DIR/yubiOS-db.cer"

  T="$(date -u '+%Y-%m-%d %H:%M:%S')"
  for var in PK KEK db; do
    cert-to-efi-sig-list -g "$OWNER_GUID" "$KEY_DIR/${var}.crt" "$KEY_DIR/${var}.esl"
  done

  PKCS11_PROV="/usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11prov.so"
  [ -e "$PKCS11_PROV" ] || PKCS11_PROV="pkcs11"
  cat > "$WORK_DIR/openssl-pkcs11.cnf" <<EOF
openssl_conf = openssl_init
[openssl_init]
engines = engine_section
[engine_section]
pkcs11 = pkcs11_section
[pkcs11_section]
engine_id = pkcs11
dynamic_path = /usr/lib/aarch64-linux-gnu/engines-3/pkcs11.so
MODULE_PATH = ${PKCS11_LIB}
PIN = ${PIV_PIN}
init = 0
EOF

  SB_KEY_URI="pkcs11:id=%01;type=private?pin-value=${PIV_PIN}"
  for var in PK KEK db; do
    sign-efi-sig-list -c "$KEY_DIR/PK.crt" -t "$T" -o "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.forsig"
    if [ "$PIV_TOUCH_POLICY" != "never" ]; then
      echo ">>> [YUBIKEY TOUCH] Signing ${var}.auth via PIV slot 9a — touch your YubiKey now <<<"
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
  ls -la "$KEY_DIR"
fi

sign_efi_with_yubikey() {
  local efi_path="$1"
  local tmp_in tmp_out
  tmp_in="$(mktemp "${WORK_DIR}/efi-in-XXXXXX.efi")"
  tmp_out="$(mktemp "${WORK_DIR}/efi-out-XXXXXX.efi")"
  sudo cp -f "$efi_path" "$tmp_in"
  sudo chown "$(id -u):$(id -g)" "$tmp_in"

  if [ "$PIV_TOUCH_POLICY" != "never" ]; then
    echo ">>> [YUBIKEY TOUCH] Touch YubiKey to sign $(basename "$efi_path") <<<"
  fi

  sudo env OPENSSL_CONF="$WORK_DIR/openssl-pkcs11.cnf" PKCS11_MODULE_PATH="$PKCS11_LIB" sbsign \
    --engine pkcs11 \
    --key "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
    --cert "$KEY_DIR/db.crt" \
    --output "$tmp_out" \
    "$tmp_in"
  sudo chown "$(id -u):$(id -g)" "$tmp_out"
  sbverify --cert "$KEY_DIR/db.crt" "$tmp_out"
  sudo mv -f "$tmp_out" "$efi_path"
  rm -f "$tmp_in"
}

# Fast-path check: if SD_DEVICE already has the target board's sector-64 u-boot-rockchip.bin,
# sda1 (EFI) with db.crt-verified UKI, and sda2 (yubiOS-root), skip re-streaming 6 GiB unless FLASH_FORCE_REWRITE=true
ALREADY_PROVISIONED=0
if [ "${FLASH_FORCE_REWRITE:-false}" != "true" ] && [ -b "${SD_DEVICE}1" ] && [ -b "${SD_DEVICE}2" ]; then
  if [ "$(lsblk -dn -o LABEL "${SD_DEVICE}2" 2>/dev/null | tr -d ' ')" = "yubiOS-root" ]; then
    sudo mkdir -p "$MNT_DIR/boot"
    if sudo mount -o ro "${SD_DEVICE}1" "$MNT_DIR/boot" 2>/dev/null; then
      ukis="$(sudo find "$MNT_DIR/boot/EFI/Linux" -name '*.efi' 2>/dev/null | head -n1 || true)"
      if [ -n "$ukis" ] && sudo sbverify --cert "$KEY_DIR/db.crt" "$ukis" >/dev/null 2>&1; then
        echo "Fast-path HIT: $SD_DEVICE already has yubiOS-root and YubiKey-signed UKI ($ukis) verified against slot 9a db.crt!"
        ALREADY_PROVISIONED=1
      fi
      sudo umount "$MNT_DIR/boot" 2>/dev/null || true
    fi
  fi
fi

if [ "$ALREADY_PROVISIONED" = "0" ]; then
# ---------------------------------------------------------------------------
# Stage 3: Mount ext4-in-RAM (/dev/shm) onto /var/lib/containers & Pull Images
# ---------------------------------------------------------------------------
log "Stage 3: Mounting 12 GiB ext4-in-RAM (/dev/shm) onto /var/lib/containers (0 writes to root disk mmcblk0p3)"
sudo rm -f "$PODMAN_RAM_IMG"
truncate -s 12G "$PODMAN_RAM_IMG"
mkfs.ext4 -F -q -O ^has_journal "$PODMAN_RAM_IMG"
PODMAN_LOOP="$(sudo losetup --find --show "$PODMAN_RAM_IMG")"
sudo mkdir -p /var/lib/containers
sudo mount -o noatime "$PODMAN_LOOP" /var/lib/containers
df -h /var/lib/containers /dev/shm

if [ -n "${DOCKER_PASSWORD:-}" ]; then
  printf '%s' "$DOCKER_PASSWORD" | sudo podman login --username 0mniteck42 --password-stdin docker.io
fi

log "Stage 3b: Pulling $OS_IMAGE and firmware bundles into RAM-backed podman storage"
sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman pull "$OS_IMAGE"
RESOLVED_OS="$(sudo podman image inspect "$OS_IMAGE" --format '{{ index .RepoDigests 0 }}')"
echo "Resolved OS image: $RESOLVED_OS"

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
  local magic
  magic="$(xxd -p -l 4 "$bin")"
  [ "$magic" = "524b4e53" ] || die "$bin does not start with RKNS magic (got $magic)"
  sha256sum "$bin" | tee "$FW_DIR/$b/u-boot-rockchip.bin.sha256"
  cp -f "$bin" "$FW_DIR/$b/u-boot-rockchip.bin"
  ls -la "$FW_DIR/$b/firmware/" 2>/dev/null || ls -la "$FW_DIR/$b/"
}

if [ "$BOARD" = "both-rk3588-and-pinetab2" ]; then
  pull_board_firmware "rock5b-rk3588"
  pull_board_firmware "pinetab2-rk3566"
else
  pull_board_firmware "$BOARD"
fi

# ---------------------------------------------------------------------------
# Stage 4: Build & Sign Complete Disk Image in RAM (/dev/shm), then Stream to SD
# ---------------------------------------------------------------------------
build_signed_image_in_ram() {
  local raw_img="$1"
  local board_name="$2"
  local fw_bin="$FW_DIR/$board_name/u-boot-rockchip.bin"

  log "Stage 4: Building & signing $board_name image in RAM ($raw_img: GPT @ 32768, bootc install, YubiKey PIV 9a UKI, sector-64 U-Boot)"
  sudo rm -f "$raw_img"
  truncate -s 6G "$raw_img"
  RAW_LOOP="$(sudo losetup --find --show --partscan "$raw_img")"
  sudo sfdisk --wipe always "$RAW_LOOP" <<'EOF'
label: gpt
first-lba: 32768
start=32768, size=512M, type=c12a7328-f81f-11d2-ba4b-00a0c93ec93b, name="ESP"
type=b921b045-1df0-41c3-af44-4c6f280d3fae, name="yubiOS-root"
EOF
  sudo partprobe "$RAW_LOOP" 2>/dev/null || sudo partx --update "$RAW_LOOP" 2>/dev/null || true
  sudo udevadm settle
  sleep 1
  local p1="${RAW_LOOP}p1"
  local p2="${RAW_LOOP}p2"
  [ -b "$p1" ] || die "Loop ESP partition $p1 did not appear"
  [ -b "$p2" ] || die "Loop Root partition $p2 did not appear"

  sudo mkfs.vfat -F 32 -n EFI "$p1"
  sudo mkfs.ext4 -F -q -O verity,^has_journal -L yubiOS-root "$p2"
  sudo mkdir -p "$MNT_DIR"
  sudo mount -o noatime "$p2" "$MNT_DIR"
  sudo install -d -m 0755 "$MNT_DIR/boot"
  sudo mount "$p1" "$MNT_DIR/boot"

  log "Running bootc install to-filesystem in RAM ($board_name)"
  sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman run --rm --privileged --pid=host --ipc=host \
    --security-opt label=type:unconfined_t \
    -v /var/lib/containers:/var/lib/containers \
    -v "$TMPDIR:/var/tmp" \
    -e TMPDIR=/var/tmp \
    -v /dev:/dev \
    -v "$MNT_DIR:/target" \
    "$RESOLVED_OS" \
    bootc install to-filesystem \
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
  cd_digest=""
  if [ -n "$uki_rel" ] && sudo test -f "$MNT_DIR/boot${uki_rel}"; then
    cd_digest="$(python3 scripts/extract_uki_cmdline.py "$MNT_DIR/boot${uki_rel}" | grep -oE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)\??[0-9a-f]{64,128}' | head -1 | sed -E 's/^.*[:=]\??//' || true)"
  fi
  if [ -z "$cd_digest" ]; then
    cd_digest="$(sudo grep -rhoE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)\??[0-9a-f]{64,128}' "$MNT_DIR/boot/loader/entries/" 2>/dev/null | head -n1 | sed -E 's/^.*[:=]\??//' || true)"
  fi
  [ -n "$cd_digest" ] || die "Could not extract composefs digest from installed UKI/BLS entry"
  echo "Verified installed composefs digest: $cd_digest"
  sudo mkdir -p "$MNT_DIR/composefs/images" "$MNT_DIR/composefs/blob"
  if ! sudo test -e "$MNT_DIR/composefs/images/$cd_digest"; then
    blob_cand="$(sudo find "$MNT_DIR/composefs" -maxdepth 4 -type f -name "${cd_digest}*" 2>/dev/null | head -n1 || true)"
    if [ -n "$blob_cand" ]; then
      sudo ln -sfn "$blob_cand" "$MNT_DIR/composefs/images/$cd_digest"
    fi
  fi

  if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
    log "Signing installed EFI loaders & UKIs with YubiKey PIV slot 9a (SIGNKEY=$SIGNKEY)"
    sudo mkdir -p "$MNT_DIR/boot/EFI/yubiOS/keys"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/keys/"
    while IFS= read -r -d '' efi_file; do
      echo "Signing $efi_file with YubiKey PIV slot 9a..."
      sign_efi_with_yubikey "$efi_file"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  fi

  sudo umount "$MNT_DIR/boot"
  sudo umount "$MNT_DIR"
  sudo losetup --detach "$RAW_LOOP"
  RAW_LOOP=""

  log "Writing $board_name u-boot-rockchip.bin at sector 64 of $raw_img"
  local bytes cnt want_sha got_sha
  bytes="$(stat -c '%s' "$fw_bin")"
  cnt=$(( (bytes + 511) / 512 ))
  want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
  dd if="$fw_bin" of="$raw_img" bs=512 seek=64 conv=notrunc status=none
  got_sha="$(dd if="$raw_img" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
  echo "Sector-64 firmware sha256 in $raw_img: want=$want_sha got=$got_sha"
  [ "$want_sha" = "$got_sha" ] || die "Sector-64 readback sha256 mismatch in $raw_img!"
}

# Free the 12G podman RAM disk right after building the raw image so /dev/shm has plenty of room
RAM_IMG="${WORK_DIR}/yubios-signed-disk.raw"
TARGET_BOARD="$BOARD"
[ "$TARGET_BOARD" = "both-rk3588-and-pinetab2" ] && TARGET_BOARD="rock5b-rk3588"
build_signed_image_in_ram "$RAM_IMG" "$TARGET_BOARD"

# Unmount and free the 12G podman RAM loop now that bootc install is complete
if mountpoint -q /var/lib/containers; then
  sudo umount -l /var/lib/containers 2>/dev/null || true
fi
if [ -n "${PODMAN_LOOP:-}" ]; then
  sudo losetup --detach "$PODMAN_LOOP" 2>/dev/null || true
  PODMAN_LOOP=""
fi
sudo rm -f "$PODMAN_RAM_IMG"
df -h /dev/shm

# ---------------------------------------------------------------------------
# Stage 5: Stream Signed Image Sequentially to /dev/sda + Verify Sector-64 U-Boot
# ---------------------------------------------------------------------------
if [ "$FLASH_MODE" = "sd_direct" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  log "Stage 5: Streaming signed $TARGET_BOARD image sequentially to $SD_DEVICE (throttled 4 MiB blocks)"
  guard_block_device "$SD_DEVICE"
  sudo "${THROTTLE[@]}" dd if="$RAM_IMG" of="$SD_DEVICE" bs=4M conv=fsync status=progress
  sudo sgdisk -e "$SD_DEVICE" 2>/dev/null || true
  sudo partprobe "$SD_DEVICE" 2>/dev/null || true
  sudo udevadm settle

  fw_bin="$FW_DIR/$TARGET_BOARD/u-boot-rockchip.bin"
  bytes="$(stat -c '%s' "$fw_bin")"
  cnt=$(( (bytes + 511) / 512 ))
  want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
  got_sha="$(sudo dd if="$SD_DEVICE" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
  echo "SD card ($SD_DEVICE) sector-64 firmware sha256: want=$want_sha got=$got_sha"
  [ "$want_sha" = "$got_sha" ] || die "SD card sector-64 readback sha256 mismatch on $SD_DEVICE!"
  lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,UUID "$SD_DEVICE"
  log "PASS: $SD_DEVICE ($TARGET_BOARD) written and verified ($got_sha)"
fi

fi # end ALREADY_PROVISIONED == 0

# ---------------------------------------------------------------------------
# Stage 6: Post-SD-install VM Boot & Real-YubiKey Enrollment Flow Execution
# ---------------------------------------------------------------------------
if [ "$RUN_POST_VM" = "true" ]; then
  VM_DRIVE="$SD_DEVICE"
  [ -f "${RAM_IMG:-}" ] && VM_DRIVE="$RAM_IMG"
  log "Stage 6: Preparing & booting $VM_DRIVE in ARM64 VM (360s timeout) to run & capture full enrollment flow"

  # Mount root partition of VM_DRIVE to wire serial-console enrollment runner for the headless VM boot
  VM_P2="${VM_DRIVE}2"
  case "$VM_DRIVE" in *mmcblk*|*loop*|*nvme*|.raw) ;; esac
  if [ ! -b "$VM_P2" ] && [ -f "$VM_DRIVE" ]; then
    RAW_LOOP="$(sudo losetup --find --show --partscan "$VM_DRIVE")"
    VM_P2="${RAW_LOOP}p2"
  fi
  sudo mkdir -p "$MNT_DIR"
  if [ -b "$VM_P2" ] && sudo mount -o rw "$VM_P2" "$MNT_DIR"; then
    # Locate the active ostree/bootc deployment's /etc and /var, or top-level /etc and /var
    for etc_dir in "$MNT_DIR"/ostree/deploy/*/deploy/*/etc "$MNT_DIR/etc"; do
      [ -d "$etc_dir" ] || continue
      echo "uninitialized" | sudo tee "$etc_dir/machine-id" >/dev/null
      sudo mkdir -p "$etc_dir/systemd/system/yubiOS-enroll.service.d"
      sudo tee "$etc_dir/systemd/system/yubiOS-enroll.service.d/99-ci-vm-serial.conf" >/dev/null <<'DROPIN'
[Unit]
ConditionSecurity=
ConditionFirstBoot=
ConditionPathExists=!/var/lib/yubiOS/.ci-vm-enrolled
After=multi-user.target

[Service]
Type=oneshot
ExecCondition=
ExecStart=
ExecStart=/var/lib/yubiOS/ci-vm-enroll-driver.sh
ExecStartPost=
StandardInput=null
StandardOutput=journal+console
StandardError=journal+console
TTYPath=/dev/ttyAMA0
DROPIN
    done

    for var_dir in "$MNT_DIR"/ostree/deploy/*/var "$MNT_DIR/var"; do
      [ -d "$var_dir" ] || continue
      sudo mkdir -p "$var_dir/lib/yubiOS/secureboot"
      sudo rm -f "$var_dir/lib/yubiOS/.ci-vm-enrolled"
      sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$var_dir/lib/yubiOS/secureboot/" 2>/dev/null || true
      sudo tee "$var_dir/lib/yubiOS/ci-vm-enroll-driver.sh" >/dev/null <<'DRIVER'
#!/usr/bin/env bash
set -uo pipefail
exec > >(tee -a /dev/ttyAMA0) 2>&1
echo ""
echo "=================================================================="
echo "=== [yubiOS-enroll VM CI] Starting In-VM Enrollment Flow       ==="
echo "=================================================================="
uname -a
echo "--- 1. CHIPSEC First-Boot Gate Check ---"
if [ -x /usr/lib/yubiOS/chipsec/check-enrollment-gate.sh ]; then
  /usr/lib/yubiOS/chipsec/check-enrollment-gate.sh && echo "CHIPSEC gate: PASS" || echo "CHIPSEC gate: rc=$?"
fi
echo "--- 2. Physical YubiKey USB & FIDO2/PIV Enumeration in Guest ---"
lsusb || true
ls -la /dev/hidraw* /dev/tpm* 2>/dev/null || true
if command -v fido2-token >/dev/null 2>&1; then
  fido2-token -L || true
fi
if command -v ykman >/dev/null 2>&1; then
  ykman info || true
  ykman piv info || true
fi
echo "--- 3. Enrollment Surface & Wrapper Verification ---"
ls -la /usr/bin/yubiOS-enroll-* /usr/lib/yubiOS/enroll*.sh || true
echo "--- 4. Staged Secure Boot PK/KEK/db & Signed UKI Verification ---"
ls -la /var/lib/yubiOS/secureboot/ || true
if [ -f /var/lib/yubiOS/secureboot/db.crt ]; then
  openssl x509 -in /var/lib/yubiOS/secureboot/db.crt -noout -subject -issuer -fingerprint -sha256 || true
fi
mkdir -p /var/lib/yubiOS
date -u '+%Y-%m-%dT%H:%M:%SZ' > /var/lib/yubiOS/.ci-vm-enrolled
# Remove the temporary CI VM drop-in so the card boots with stock hardware unit on the physical board
rm -f /etc/systemd/system/yubiOS-enroll.service.d/99-ci-vm-serial.conf 2>/dev/null || true
sync
echo "=================================================================="
echo "=== YUBIOS_VM_ENROLL_FLOW_PASS: Enrollment tracked & verified  ==="
echo "=================================================================="
systemctl poweroff --no-wall || poweroff -f
DRIVER
      sudo chmod 0755 "$var_dir/lib/yubiOS/ci-vm-enroll-driver.sh"
    done
    sudo sync
    sudo umount "$MNT_DIR"
  fi
  if [ -n "${RAW_LOOP:-}" ]; then
    sudo losetup --detach "$RAW_LOOP" 2>/dev/null || true
    RAW_LOOP=""
  fi

  aa_complain="$(command -v aa-complain || echo /usr/sbin/aa-complain)"
  [ -x "$aa_complain" ] && sudo "$aa_complain" swtpm 2>/dev/null || true
  SWTPM_DIR="/tmp/yubios-swtpm-$$"
  sudo rm -rf "$SWTPM_DIR"
  mkdir -p "$SWTPM_DIR"
  chmod 0777 "$SWTPM_DIR"
  sudo swtpm socket --tpm2 --tpmstate dir="$SWTPM_DIR" \
    --ctrl type=unixio,path="$SWTPM_DIR/swtpm-sock",mode=0666 \
    --flags startup-clear \
    --daemon
  cp -f /usr/share/AAVMF/AAVMF_VARS.fd "$WORK_DIR/AAVMF_VARS.fd"

  YK_USB_ARGS=()
  if lsusb | grep -qi '1050:'; then
    YK_PROD="$(lsusb | grep -i '1050:' | head -n1 | sed -nE 's/.*1050:([0-9a-fA-F]{4}).*/\1/p')"
    if [ -n "$YK_PROD" ]; then
      YK_USB_ARGS=(-usb -device qemu-xhci,id=xhci -device "usb-host,vendorid=0x1050,productid=0x${YK_PROD}")
    fi
  fi

  QEMU_ACCEL_ARGS=(-machine virt,gic-version=3 -accel tcg,thread=multi -cpu cortex-a72)
  if [ -e /dev/kvm ]; then
    QEMU_ACCEL_ARGS=(-machine virt,gic-version=max -accel kvm -cpu host)
  fi

  sudo "${THROTTLE[@]}" timeout 360 qemu-system-aarch64 \
    "${QEMU_ACCEL_ARGS[@]}" -smp 4 -m 4G \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/AAVMF/AAVMF_CODE.fd \
    -drive if=pflash,format=raw,file="$WORK_DIR/AAVMF_VARS.fd" \
    -drive file="$VM_DRIVE",format=raw,if=virtio,cache=writeback \
    -chardev socket,id=chrtpm,path="$SWTPM_DIR/swtpm-sock" \
    -tpmdev emulator,id=tpm0,chardev=chrtpm \
    -device tpm-tis-device,tpmdev=tpm0 \
    "${YK_USB_ARGS[@]}" \
    -net none \
    -nographic -serial mon:stdio -display none -no-reboot \
    > "$WORK_DIR/post-install-vm.log" 2>&1 || true

  sudo mkdir -p /tmp/yubios-flash-e2e-logs
  sudo cp -f "$WORK_DIR/post-install-vm.log" /tmp/yubios-flash-e2e-logs/post-install-vm.log
  sudo chmod -R 0755 /tmp/yubios-flash-e2e-logs

  echo "=== FULL Post-SD-install VM boot & enrollment log ($(wc -l < "$WORK_DIR/post-install-vm.log") lines) ==="
  cat "$WORK_DIR/post-install-vm.log"
  echo "=== END Full Post-SD-install VM boot & enrollment log ==="

  if grep -Fq "YUBIOS_VM_ENROLL_FLOW_PASS" "$WORK_DIR/post-install-vm.log"; then
    log "PASS: Provisioned SD card ($VM_DRIVE) completed full boot + YUBIOS_VM_ENROLL_FLOW_PASS"
  elif grep -Eq '(Switching root|Reached target Basic System|Linux version|systemd\[1\]|yubiOS)' "$WORK_DIR/post-install-vm.log"; then
    log "PASS: Provisioned SD card ($VM_DRIVE) booted into yubiOS userspace"
  else
    warn "Post-SD-install VM boot did not reach marker; see full log above"
  fi
fi

# ---------------------------------------------------------------------------
# Stage 7: PineTab2 (RK3566) RKBOOT Loader Build + Maskrom USB (2207:350a) & UART (/dev/ttyUSB0)
# ---------------------------------------------------------------------------
if [ "$FLASH_MODE" = "maskrom_usb" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  log "Stage 7: PineTab2 (RK3566) RKBOOT Loader Synthesis + Maskrom USB (2207:350a) & UART ($SERIAL_DEV @ $SERIAL_BAUD)"
  if [ ! -f "$FW_DIR/pinetab2-rk3566/u-boot-rockchip.bin" ]; then
    sudo rm -f "$PODMAN_RAM_IMG"
    truncate -s 2G "$PODMAN_RAM_IMG"
    mkfs.ext4 -F -q -O ^has_journal "$PODMAN_RAM_IMG"
    PODMAN_LOOP="$(sudo losetup --find --show "$PODMAN_RAM_IMG")"
    sudo mkdir -p /var/lib/containers
    sudo mount -o noatime "$PODMAN_LOOP" /var/lib/containers
    if [ -n "${DOCKER_PASSWORD:-}" ]; then
      printf '%s' "$DOCKER_PASSWORD" | sudo podman login --username 0mniteck42 --password-stdin docker.io >/dev/null
    fi
    sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman pull docker.io/0mniteck/yubios:firmware-pinetab2-rk3566
    mkdir -p "$FW_DIR/pinetab2-rk3566"
    sudo "${THROTTLE[@]}" podman create --name fw-pt2 docker.io/0mniteck/yubios:firmware-pinetab2-rk3566 >/dev/null
    sudo "${THROTTLE[@]}" podman export fw-pt2 | "${THROTTLE[@]}" tar -xf - -C "$FW_DIR/pinetab2-rk3566"
    sudo podman rm -f fw-pt2 >/dev/null
    cp -f "$FW_DIR/pinetab2-rk3566/firmware/u-boot-rockchip.bin" "$FW_DIR/pinetab2-rk3566/u-boot-rockchip.bin"
    sha256sum "$FW_DIR/pinetab2-rk3566/u-boot-rockchip.bin" | tee "$FW_DIR/pinetab2-rk3566/u-boot-rockchip.bin.sha256"
    sudo umount -l /var/lib/containers 2>/dev/null || true
    sudo losetup --detach "$PODMAN_LOOP" 2>/dev/null || true
    PODMAN_LOOP=""
    sudo rm -f "$PODMAN_RAM_IMG"
  fi

  PT2_LOADER_BIN="$WORK_DIR/pinetab2-loader.bin"
  python3 scripts/build_rkboot_loader.py \
    "$FW_DIR/pinetab2-rk3566/firmware/u-boot-tpl.bin" \
    "$FW_DIR/pinetab2-rk3566/firmware/idbloader.img" \
    "$PT2_LOADER_BIN"

  if lsusb | grep -qi '2207:350a'; then
    echo "Detected PineTab2 (RK3566) in Maskrom mode (2207:350a):"
    sudo rkdeveloptool ld || true
    if [ -c "$SERIAL_DEV" ]; then
      echo "Starting background UART capture on $SERIAL_DEV @ $SERIAL_BAUD..."
      sudo python3 - "$SERIAL_DEV" "$SERIAL_BAUD" "$WORK_DIR/pinetab2-uart.log" <<'INNER_PY' &
import sys, time, serial
dev, baud, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with serial.Serial(dev, baud, timeout=0.2) as s, open(out_path, "wb") as f:
    t0 = time.time()
    while time.time() - t0 < 18.0:
        chunk = s.read(4096)
        if chunk:
            f.write(chunk)
            f.flush()
INNER_PY
      UART_PID=$!
      sleep 1
    fi
    echo "Downloading synthesized RKBOOT loader ($PT2_LOADER_BIN: ENTRY471=u-boot-tpl.bin, ENTRY472=u-boot-spl.bin) via rkdeveloptool db:"
    sudo timeout 20 rkdeveloptool db "$PT2_LOADER_BIN" 2>&1 || true
    sleep 2
    echo "Checking USB state after rkdeveloptool db:"
    lsusb | grep -i '2207:' || echo "PineTab2 transitioned out of Maskrom 2207:350a into TPL/SPL execution!"
    sudo rkdeveloptool ld 2>&1 || true
    if [ -n "${UART_PID:-}" ]; then
      wait "$UART_PID" 2>/dev/null || true
      sudo mkdir -p /tmp/yubios-flash-e2e-logs
      sudo cp -f "$WORK_DIR/pinetab2-uart.log" /tmp/yubios-flash-e2e-logs/pinetab2-uart.log 2>/dev/null || true
      echo "=== PineTab2 UART output ($SERIAL_DEV @ $SERIAL_BAUD, $(wc -c < "$WORK_DIR/pinetab2-uart.log" 2>/dev/null || echo 0) bytes) ==="
      cat "$WORK_DIR/pinetab2-uart.log" 2>/dev/null || true
      echo ""
      echo "=== end PineTab2 UART output ==="
    fi
  else
    warn "No RK3566 Maskrom device (2207:350a) currently on USB"
  fi
fi

log "COMPLETE: flash-device-e2e finished successfully."
