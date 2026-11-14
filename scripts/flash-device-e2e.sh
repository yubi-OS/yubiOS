#!/usr/bin/env bash
# scripts/flash-device-e2e.sh
#
# Clean direct-to-SD provisioning pipeline for yubiOS on the rock1 self-hosted
# ARM64 runner (or ubuntu HIGH-MEM runner) with SD card slot (/dev/mmcblk1)
# and physical YubiKey PIV slot 9a signing.
#
# All OS/initramfs/systemd/enrollment configurations live inside the built OCI
# image (Containerfile / Containerfile.dev / usr/). This script never mutates
# the installed composefs rootfs, /etc, or UKI contents — it only:
#   1. Pulls the published $OS_IMAGE and board firmware bundle
#   2. Wipes & partitions $SD_DEVICE (GPT @ sector 32768: p1 ESP, p2 yubiOS-root)
#   3. Runs `bootc install to-filesystem --composefs-backend` from $OS_IMAGE
#   4. Signs the installed EFI loaders & UKI on the ESP with YubiKey PIV slot 9a
#   5. Writes board `u-boot-rockchip.bin` at sector 64 of $SD_DEVICE

set -euo pipefail

BOARD="${FLASH_BOARD:-rock5b-rk3588}"
SD_DEVICE="${FLASH_SD_DEVICE:-/dev/mmcblk1}"
OS_IMAGE="${FLASH_OS_IMAGE:-docker.io/0mniteck/yubios:dev}"
SIGNKEY="${FLASH_SIGNKEY:-test}"
SIGN_WITH_YUBIKEY="${FLASH_SIGN_WITH_YUBIKEY:-true}"
PIV_TOUCH_OVERRIDE="${FLASH_PIV_TOUCH_POLICY:-auto}"
# RUN_POST_VM="${FLASH_RUN_POST_VM:-false}"

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

log()  { printf '\n=== [flash-e2e %s] %s ===\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '::warning::[flash-e2e] %s\n' "$*"; }
die()  { printf '::error::[flash-e2e] %s\n' "$*" >&2; exit 1; }

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

log "Configuration: BOARD=$BOARD SD_DEVICE=$SD_DEVICE SIGNKEY=$SIGNKEY PIV_TOUCH_POLICY=$PIV_TOUCH_POLICY OS_IMAGE=$OS_IMAGE WORK_DIR=$WORK_DIR"

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
# Stage 2: YubiKey PIV Slot 9a Key & PK/KEK/db Auth Bundle Preparation
# ---------------------------------------------------------------------------
log "Stage 2: PIV slot 9a & Secure Boot PK/KEK/db preparation (SIGNKEY=$SIGNKEY, touch=$PIV_TOUCH_POLICY)"

OWNER_GUID="${YUBIOS_OWNER_GUID:-1404b45e-798b-4249-b5cd-b7f961b44894}"
PIV_PIN="${YUBIOS_PIV_PIN:-123456}"
PIV_MGMT_KEY="${YUBIOS_PIV_MGMT_KEY:-010203040506070801020304050607080102030405060708}"
CN_LABEL="YUBIOS Owner Slot 9a"
[ "$SIGNKEY" = "test" ] && CN_LABEL="YUBIOS Test Slot 9a"

PKCS11_LIB=""
for c in /usr/lib/aarch64-linux-gnu/libykcs11.so /usr/lib64/libykcs11.so /usr/lib/libykcs11.so; do
  if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
done

if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
  if lsusb | grep -qi '1050:' && [ -n "$PKCS11_LIB" ]; then
    SIGN_MODE="yubikey"
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
        cat "$KEY_DIR/slot9a-pub.pem" | sudo ykman piv certificates generate \
          -m "$PIV_MGMT_KEY" \
          -P "$PIV_PIN" \
          -s "CN=${CN_LABEL}" \
          -d 1826 \
          9a -
        sudo ykman piv certificates export 9a - | tee "$KEY_DIR/db.crt" >/dev/null
      fi
    fi
    if [ "$need_mint" -eq 1 ]; then
      log "Generating RSA-2048 key in PIV slot 9a on physical YubiKey (SIGNKEY=$SIGNKEY, pin-policy=ONCE, touch-policy=${PIV_TOUCH_POLICY^^})"
      sudo ykman piv keys generate \
        -a RSA2048 \
        -m "$PIV_MGMT_KEY" \
        --pin-policy ONCE \
        --touch-policy "${PIV_TOUCH_POLICY^^}" \
        9a - | tee "$KEY_DIR/slot9a-pub.pem" >/dev/null
      log "Generating self-signed slot 9a X.509 certificate ($CN_LABEL) on physical YubiKey"
      cat "$KEY_DIR/slot9a-pub.pem" | sudo ykman piv certificates generate \
        -m "$PIV_MGMT_KEY" \
        -P "$PIV_PIN" \
        -s "CN=${CN_LABEL}" \
        -d 1826 \
        9a -
      sudo ykman piv certificates export 9a - | tee "$KEY_DIR/db.crt" >/dev/null
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
  elif [ "$SIGNKEY" = "test" ]; then
    SIGN_MODE="soft_test"
    log "No physical YubiKey on USB; SIGNKEY=test -> minting ephemeral RSA-2048 Slot 9a test key ($CN_LABEL)"
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$KEY_DIR/db.key" \
      -out "$KEY_DIR/db.crt" \
      -subj "/CN=${CN_LABEL}" \
      -days 1826 \
      -sha256
    openssl x509 -in "$KEY_DIR/db.crt" -noout -subject -issuer -dates -fingerprint -sha256
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/PK.crt"
    cp -f "$KEY_DIR/db.crt" "$KEY_DIR/KEK.crt"
    cp -f "$KEY_DIR/db.key" "$KEY_DIR/PK.key"
    cp -f "$KEY_DIR/db.key" "$KEY_DIR/KEK.key"
    openssl x509 -in "$KEY_DIR/db.crt" -outform DER -out "$KEY_DIR/yubiOS-db.cer"
    T="$(date -u '+%Y-%m-%d %H:%M:%S')"
    for var in PK KEK db; do
      cert-to-efi-sig-list -g "$OWNER_GUID" "$KEY_DIR/${var}.crt" "$KEY_DIR/${var}.esl"
      sign-efi-sig-list -g "$OWNER_GUID" -t "$T" -k "$KEY_DIR/PK.key" -c "$KEY_DIR/PK.crt" "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.auth"
    done
    ls -la "$KEY_DIR"
  else
    die "SIGNKEY=production requires a physical YubiKey (1050:*) attached on USB"
  fi
fi

sign_efi_binary() {
  local efi_path="$1"
  local tmp_in tmp_out
  tmp_in="$(mktemp "${WORK_DIR}/efi-in-XXXXXX.efi")"
  tmp_out="$(mktemp "${WORK_DIR}/efi-out-XXXXXX.efi")"
  sudo cp -f "$efi_path" "$tmp_in"
  sudo chown "$(id -u):$(id -g)" "$tmp_in"

  if [ "$SIGN_MODE" = "yubikey" ]; then
    if [ "$PIV_TOUCH_POLICY" != "never" ]; then
      echo ">>> [YUBIKEY TOUCH] Touch YubiKey to sign $(basename "$efi_path") <<<"
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
# Stage 3: Prepare Container Storage & Pull Images
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
fi
df -h /var/lib/containers "$WORK_BASE"

if [ -n "${DOCKER_PASSWORD:-}" ]; then
  printf '%s' "$DOCKER_PASSWORD" | sudo podman login --username 0mniteck42 --password-stdin docker.io
fi

log "Stage 3b: Pulling $OS_IMAGE and firmware-$BOARD"
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

pull_board_firmware "$BOARD"

# ---------------------------------------------------------------------------
# Stage 4: Partition, Install, Sign EFI Binaries & Write U-Boot on $SD_DEVICE
# ---------------------------------------------------------------------------
provision_sd_directly() {
  local dev="$1"
  local board_name="$2"
  local fw_bin="$FW_DIR/$board_name/u-boot-rockchip.bin"
  local p1 p2
  p1="$(part_dev "$dev" 1)"
  p2="$(part_dev "$dev" 2)"

  log "Stage 4: Partitioning & provisioning $dev ($board_name) directly from $RESOLVED_OS"
  guard_block_device "$dev"

  sudo wipefs -a "$p1" "$p2" "$dev" 2>/dev/null || sudo wipefs -a "$dev" 2>/dev/null || true
  sudo sfdisk --wipe always "$dev" <<'EOF'
label: gpt
first-lba: 32768
start=32768, size=512M, type=c12a7328-f81f-11d2-ba4b-00a0c93ec93b, name="ESP"
size=8G, type=b921b045-1df0-41c3-af44-4c6f280d3fae, name="yubiOS-root"
EOF
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
    "${PRELOAD_ENV[@]}" \
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
  [ -n "$uki_rel" ] || die "No uki/efi path found in $entry"
  installed_cmdline="$(python3 scripts/extract_uki_cmdline.py "$MNT_DIR/boot${uki_rel}" | tr -d '\0\r\n' || true)"
  echo "Installed UKI cmdline: $installed_cmdline"
  cd_digest="$(printf '%s' "$installed_cmdline" | grep -oE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)\??[0-9a-f]{64,128}' | head -1 | sed -E 's/^.*[:=]\??//' || true)"
  [ -n "$cd_digest" ] || die "Could not extract composefs digest from installed UKI/BLS entry"
  echo "Verified installed composefs digest: $cd_digest"

  if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
    log "Signing installed EFI loaders & UKIs on $p1 (mode=$SIGN_MODE, SIGNKEY=$SIGNKEY)"
    sudo mkdir -p "$MNT_DIR/boot/EFI/yubiOS/keys"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/keys/"
    while IFS= read -r -d '' efi_file; do
      echo "Signing $efi_file..."
      sign_efi_binary "$efi_file"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  fi

  sudo sync
  sudo umount "$MNT_DIR/boot"
  sudo umount "$MNT_DIR"

  log "Writing $board_name u-boot-rockchip.bin directly at sector 64 of $dev"
  local bytes cnt want_sha got_sha
  bytes="$(stat -c '%s' "$fw_bin")"
  cnt=$(( (bytes + 511) / 512 ))
  want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
  sudo "${THROTTLE[@]}" dd if="$fw_bin" of="$dev" bs=512 seek=64 conv=notrunc,fsync status=none
  got_sha="$(sudo dd if="$dev" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
  echo "SD card ($dev) sector-64 firmware sha256: want=$want_sha got=$got_sha"
  [ "$want_sha" = "$got_sha" ] || die "SD card sector-64 readback sha256 mismatch on $dev!"
  lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,UUID "$dev"
  log "PASS: $dev ($board_name) provisioned directly and verified ($got_sha)"
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

# ---------------------------------------------------------------------------
# Stage 5: Post-SD-install VM Boot & Enrollment Flow Execution
# ---------------------------------------------------------------------------
# Commented out per hardware bring-up directive: first-boot Secure Boot key
# enrollment writes to the board's StandaloneMM/OP-TEE variable store, which
# is not present in a generic QEMU VM.

log "COMPLETE: flash-device-e2e ($BOARD -> $SD_DEVICE) finished successfully."
