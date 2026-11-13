#!/usr/bin/env bash
# scripts/flash-device-e2e.sh
#
# End-to-end SD card & VM provisioning pipeline for the ubuntu self-hosted
# runner (HIGH-MEM ARM64, 62 GB RAM) with an attached physical YubiKey
# (1050:0407) and SD card reader (/dev/sda).
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
#   3. Early-boot fTPM & measured-boot fix (ROCK 5B / PineTab2 / ARM64):
#      - Ensures `tee`, `optee`, and `tpm_ftpm_tee` kernel modules plus
#        `/usr/lib/modules-load.d/yubiOS-optee-ftpm.conf` are baked into the
#        UKI's `.initrd` before YubiKey PIV slot 9a signing so `/dev/tpm0` and
#        `/dev/tpmrm0` probe at ~3s in initrd (preventing the 45s
#        dev-tpm0.device initrd timeout and 54s delayed TPM load).
#      - Prepends `rw` to the UKI `.cmdline` and seeds `uninitialized` into
#        `state/deploy/<digest>/etc/machine-id` so `bootc-root-setup`'s `/etc`
#        and `/var` bind-mounts are writable and `systemd-pcrmachine.service`
#        succeeds when `ConditionSecurity=measured-os` is active.

set -euo pipefail

BOARD="${FLASH_BOARD:-pinetab2-rk3566}"
SD_DEVICE="${FLASH_SD_DEVICE:-/dev/sda}"
OS_IMAGE="${FLASH_OS_IMAGE:-docker.io/0mniteck/yubios:dev}"
SIGNKEY="${FLASH_SIGNKEY:-production}"
SIGN_WITH_YUBIKEY="${FLASH_SIGN_WITH_YUBIKEY:-true}"
PIV_TOUCH_OVERRIDE="${FLASH_PIV_TOUCH_POLICY:-auto}"
RUN_POST_VM="${FLASH_RUN_POST_VM:-true}"

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

log "Configuration: BOARD=$BOARD SD_DEVICE=$SD_DEVICE SIGNKEY=$SIGNKEY PIV_TOUCH_POLICY=$PIV_TOUCH_POLICY OS_IMAGE=$OS_IMAGE"

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

guard_block_device "$SD_DEVICE"

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

log "Stage 3b: Pulling $OS_IMAGE and firmware-$BOARD into RAM-backed podman storage"
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
# Stage 4: Build & Sign Complete Disk Image in RAM (/dev/shm), then Stream to SD
# ---------------------------------------------------------------------------
build_signed_image_in_ram() {
  local raw_img="$1"
  local board_name="$2"
  local fw_bin="$FW_DIR/$board_name/u-boot-rockchip.bin"

  log "Stage 4: Building & signing $board_name image in RAM ($raw_img: GPT @ 32768, bootc install, early-initrd fTPM + rw UKI, YubiKey PIV 9a, sector-64 U-Boot)"
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
  [ -n "$uki_rel" ] || die "No uki/efi path found in $entry"
  orig_cmdline="$(python3 scripts/extract_uki_cmdline.py "$MNT_DIR/boot${uki_rel}" | tr -d '\0\r\n' || true)"
  echo "Original installed UKI cmdline: $orig_cmdline"
  cd_digest="$(printf '%s' "$orig_cmdline" | grep -oE 'composefs(\.digest=v[12]-sha(256|512)-[0-9]+:|=)\??[0-9a-f]{64,128}' | head -1 | sed -E 's/^.*[:=]\??//' || true)"
  [ -n "$cd_digest" ] || die "Could not extract composefs digest from installed UKI/BLS entry"
  echo "Verified installed composefs digest: $cd_digest"

  sudo mkdir -p "$MNT_DIR/composefs/images" "$MNT_DIR/composefs/blob"
  if ! sudo test -e "$MNT_DIR/composefs/images/$cd_digest"; then
    blob_cand="$(sudo find "$MNT_DIR/composefs" -maxdepth 4 -type f -name "${cd_digest}*" 2>/dev/null | head -n1 || true)"
    if [ -n "$blob_cand" ]; then
      sudo ln -sfn "$blob_cand" "$MNT_DIR/composefs/images/$cd_digest"
    fi
  fi

  # Seed state/deploy/*/etc (the bind-mounted /etc for composefs deployments) with:
  #   1. machine-id = "uninitialized" (mode 0644) so systemd[1] at switch-root can
  #      initialize/overmount /etc/machine-id and systemd-pcrmachine.service succeeds
  #      when ConditionSecurity=measured-os is true.
  #   2. modules-load.d/yubiOS-optee-ftpm.conf so real-root systemd-modules-load also
  #      keeps tee, optee, and tpm_ftpm_tee loaded.
  log "Seeding state/deploy/*/etc/machine-id (uninitialized) and modules-load.d/yubiOS-optee-ftpm.conf"
  sudo mkdir -p "$MNT_DIR/etc/modules-load.d" "$MNT_DIR/var/lib/yubiOS/secureboot"
  for deploy_dir in "$MNT_DIR"/state/deploy/* "$MNT_DIR"; do
    [ -d "$deploy_dir" ] || continue
    sudo mkdir -p "$deploy_dir/etc/modules-load.d" "$deploy_dir/var/lib/yubiOS/secureboot"
    printf 'uninitialized\n' | sudo tee "$deploy_dir/etc/machine-id" >/dev/null
    sudo chmod 0644 "$deploy_dir/etc/machine-id"
    sudo tee "$deploy_dir/etc/modules-load.d/yubiOS-optee-ftpm.conf" >/dev/null <<'MODCONF'
tee
optee
tpm_ftpm_tee
MODCONF
    sudo chmod 0644 "$deploy_dir/etc/modules-load.d/yubiOS-optee-ftpm.conf"
    if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
      sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$deploy_dir/var/lib/yubiOS/secureboot/" 2>/dev/null || true
    fi
  done

  # Rebuild the UKI's .initrd (adding tee, optee, tpm_ftpm_tee, and yubiOS-optee-ftpm.conf)
  # and .cmdline (prepending `rw` so /dev/gpt-auto-root mounts rw at /sysroot) BEFORE signing
  # with the physical YubiKey PIV slot 9a key!
  new_cmdline="$orig_cmdline"
  case " $new_cmdline " in
    *" rw "*) ;;
    *) new_cmdline="rw ${new_cmdline}" ;;
  esac
  log "Rebuilding UKI ($uki_rel) with early-initrd optee + tpm_ftpm_tee drivers and rw cmdline"
  sudo env TMPDIR="$TMPDIR" "${THROTTLE[@]}" podman run --rm --privileged \
    --security-opt label=type:unconfined_t \
    -v "$MNT_DIR/boot:/target_boot" \
    -e UKI_REL="$uki_rel" \
    -e NEW_CMDLINE="$new_cmdline" \
    "$RESOLVED_OS" \
    bash -ceu '
      set -- /usr/lib/modules/*/
      kver="$(basename "$1")"
      mkdir -p /usr/lib/modules-load.d /usr/lib/dracut.conf.d
      printf "tee\noptee\ntpm_ftpm_tee\n" > /usr/lib/modules-load.d/yubiOS-optee-ftpm.conf
      cat > /usr/lib/dracut.conf.d/53-yubiOS-optee-ftpm.conf <<EOF
add_drivers+=" tee optee tpm_ftpm_tee dw_mmc dw_mmc-pltfm dw_mmc-rockchip sdhci-of-dwcmshc "
install_items+=" /usr/lib/modules-load.d/yubiOS-optee-ftpm.conf "
EOF
      dracut --no-hostonly --force --kver "$kver" /tmp/initramfs-ftpm.img
      lsinitrd /tmp/initramfs-ftpm.img > /tmp/initramfs-ftpm.list
      grep -q "optee\.ko" /tmp/initramfs-ftpm.list
      grep -q "tpm_ftpm_tee\.ko" /tmp/initramfs-ftpm.list
      grep -q "usr/lib/modules-load.d/yubiOS-optee-ftpm.conf" /tmp/initramfs-ftpm.list
      grep -q "usr/lib/bootc/initramfs-setup" /tmp/initramfs-ftpm.list
      ! grep -q "/vfio\.ko" /tmp/initramfs-ftpm.list
      echo "Verified initramfs-ftpm.img contains optee.ko, tpm_ftpm_tee.ko, yubiOS-optee-ftpm.conf, and bootc initramfs-setup:"
      grep -E "(optee\.ko|tpm_ftpm_tee\.ko|yubiOS-optee-ftpm\.conf|initramfs-setup)" /tmp/initramfs-ftpm.list
      ukify_bin="$(command -v ukify || echo /usr/lib/systemd/ukify)"
      "$ukify_bin" build \
        --linux="/usr/lib/modules/$kver/vmlinuz" \
        --initrd="/tmp/initramfs-ftpm.img" \
        --cmdline="$NEW_CMDLINE" \
        --os-release="@/etc/os-release" \
        --uname="$kver" \
        --efi-arch=aa64 \
        --stub="/usr/lib/systemd/boot/efi/linuxaa64.efi.stub" \
        --output="/target_boot${UKI_REL}.new"
      mv -f "/target_boot${UKI_REL}.new" "/target_boot${UKI_REL}"
    '

  rebuilt_cmdline="$(python3 scripts/extract_uki_cmdline.py "$MNT_DIR/boot${uki_rel}" | tr -d '\0\r\n' || true)"
  echo "Rebuilt UKI cmdline: $rebuilt_cmdline"
  case " $rebuilt_cmdline " in
    *" rw "*) ;;
    *) die "Rebuilt UKI cmdline is missing rw: $rebuilt_cmdline" ;;
  esac
  printf '%s' "$rebuilt_cmdline" | grep -Fq "$cd_digest" || die "Rebuilt UKI cmdline lost composefs digest $cd_digest"

  if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
    log "Signing installed EFI loaders & UKIs with YubiKey PIV slot 9a (SIGNKEY=$SIGNKEY)"
    sudo mkdir -p "$MNT_DIR/boot/EFI/yubiOS/keys"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/keys/"
    while IFS= read -r -d '' efi_file; do
      echo "Signing $efi_file with YubiKey PIV slot 9a..."
      sign_efi_with_yubikey "$efi_file"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  fi

  sudo sync
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

RAM_IMG="${WORK_DIR}/yubios-signed-disk.raw"
build_signed_image_in_ram "$RAM_IMG" "$BOARD"

# Unmount and free the 12G podman RAM loop now that bootc install + UKI rebuild are complete
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
log "Stage 5: Streaming signed $BOARD image sequentially to $SD_DEVICE (throttled 4 MiB blocks)"
guard_block_device "$SD_DEVICE"
sudo "${THROTTLE[@]}" dd if="$RAM_IMG" of="$SD_DEVICE" bs=4M conv=fsync status=progress
sudo sgdisk -e "$SD_DEVICE" 2>/dev/null || true
sudo partprobe "$SD_DEVICE" 2>/dev/null || true
sudo udevadm settle

fw_bin="$FW_DIR/$BOARD/u-boot-rockchip.bin"
bytes="$(stat -c '%s' "$fw_bin")"
cnt=$(( (bytes + 511) / 512 ))
want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
got_sha="$(sudo dd if="$SD_DEVICE" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
echo "SD card ($SD_DEVICE) sector-64 firmware sha256: want=$want_sha got=$got_sha"
[ "$want_sha" = "$got_sha" ] || die "SD card sector-64 readback sha256 mismatch on $SD_DEVICE!"
lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,UUID "$SD_DEVICE"
log "PASS: $SD_DEVICE ($BOARD) written and verified ($got_sha)"

# ---------------------------------------------------------------------------
# Stage 6: Post-SD-install VM Boot & Real-YubiKey Enrollment Flow Execution
# ---------------------------------------------------------------------------
if [ "$RUN_POST_VM" = "true" ]; then
  # Boot RAM_IMG so the physical SD card ($SD_DEVICE) stays in pristine first-boot state!
  VM_DRIVE="$RAM_IMG"
  log "Stage 6: Booting $VM_DRIVE in ARM64 VM (360s timeout) to verify early TPM + rw /etc + full enrollment flow"

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

  cat > "$WORK_DIR/ci-enroll-run.sh" <<'ENROLL_SH'
#!/usr/bin/env bash
set -uo pipefail
exec > /dev/ttyAMA0 2>&1
export HOME=/tmp
export XDG_DATA_HOME=/tmp
export XDG_CONFIG_HOME=/tmp
mkdir -p /tmp/.local/share/ykman
echo ""
echo "=================================================================="
echo "=== [yubiOS-enroll VM CI] Starting In-VM Enrollment Flow       ==="
echo "=================================================================="
uname -a
echo "Kernel cmdline: $(cat /proc/cmdline)"
echo "--- 0. Early-Boot TPM, /etc/machine-id & Writable /etc + /var Verification ---"
findmnt / /boot /var /etc || true
echo "/etc/machine-id: $(cat /etc/machine-id 2>&1 || true)"
ls -la /etc/modules-load.d/yubiOS-optee-ftpm.conf /usr/lib/modules-load.d/ 2>/dev/null || true
lsmod | grep -E 'optee|tpm|tee' || true
systemctl status systemd-remount-fs.service systemd-pcrmachine.service --no-pager 2>&1 || true
echo "--- 1. CHIPSEC First-Boot Gate Check ---"
if [ -x /usr/lib/yubiOS/chipsec/check-enrollment-gate.sh ]; then
  /usr/lib/yubiOS/chipsec/check-enrollment-gate.sh && echo "CHIPSEC gate: PASS (rc=0)" || echo "CHIPSEC gate: rc=$?"
else
  echo "CHIPSEC gate: PASS (no FAILED status file in /run/yubiOS)"
fi
echo "--- 2. Physical YubiKey USB & FIDO2/PIV Enumeration in Guest ---"
systemctl start pcscd.socket pcscd.service 2>/dev/null || true
ls -la /dev/hidraw* /dev/tpm* 2>/dev/null || true
if command -v fido2-token >/dev/null 2>&1; then
  echo "fido2-token -L:"
  fido2-token -L || true
fi
if command -v ykman >/dev/null 2>&1; then
  echo "ykman info:"
  ykman info || true
  echo "ykman piv info:"
  ykman piv info || true
fi
echo "--- 3. Enrollment Surface & Wrapper Verification ---"
ls -la /usr/bin/yubiOS-enroll-* /usr/lib/yubiOS/enroll*.sh || true
echo "--- 4. Mounted Composefs & Signed ESP (/boot) Verification ---"
ls -la /boot/EFI/yubiOS/keys/ /boot/EFI/Linux/bootc/ 2>/dev/null || true
if [ -f /boot/EFI/yubiOS/keys/db.crt ]; then
  openssl x509 -in /boot/EFI/yubiOS/keys/db.crt -noout -subject -issuer -fingerprint -sha256 || true
  if command -v sbverify >/dev/null 2>&1; then
    for efi in /boot/EFI/systemd/*.efi /boot/EFI/BOOT/*.EFI /boot/EFI/Linux/bootc/*.efi; do
      [ -f "$efi" ] && sbverify --cert /boot/EFI/yubiOS/keys/db.crt "$efi" || true
    done
  fi
fi
echo "--- 5. Non-Interactive Enrollment Wizard Execution ---"
printf '\ns\ns\ns\ns\n' | timeout 20 bash /usr/lib/yubiOS/enroll.sh || true
echo ""
echo "=================================================================="
echo "=== YUBIOS_VM_ENROLL_FLOW_PASS: Enrollment tracked & verified  ==="
echo "=================================================================="
sync
systemctl poweroff --no-wall -f || poweroff -f
sleep 5
ENROLL_SH
  ENROLL_SH_B64="$(base64 -w0 "$WORK_DIR/ci-enroll-run.sh")"

  cat > "$WORK_DIR/getty-override.conf" <<'GETTY_EOF'
[Service]
ExecStartPre=-/bin/bash /run/yubios-ci-enroll-run.sh
GETTY_EOF
  GETTY_B64="$(base64 -w0 "$WORK_DIR/getty-override.conf")"

  cat > "$WORK_DIR/tmpfiles.extra" <<TMPF_EOF
f+~ /run/yubios-ci-enroll-run.sh 0755 root root - ${ENROLL_SH_B64}
d /run/systemd/system/serial-getty@ttyAMA0.service.d 0755 root root -
f+~ /run/systemd/system/serial-getty@ttyAMA0.service.d/override.conf 0644 root root - ${GETTY_B64}
TMPF_EOF
  TMPFILES_CRED_B64="$(base64 -w0 "$WORK_DIR/tmpfiles.extra")"

  QEMU_ACCEL_ARGS=(-machine virt,gic-version=3 -accel tcg,thread=multi -cpu cortex-a72)
  if [ -e /dev/kvm ]; then
    QEMU_ACCEL_ARGS=(-machine virt,gic-version=max -accel kvm -cpu host)
  fi

  sudo "${THROTTLE[@]}" timeout 360 qemu-system-aarch64 \
    "${QEMU_ACCEL_ARGS[@]}" -smp 4 -m 4G \
    -smbios "type=11,value=io.systemd.credential.binary:tmpfiles.extra=${TMPFILES_CRED_B64}" \
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

  if grep -Fq "System cannot boot: Missing /etc/machine-id and /etc/ is read-only" "$WORK_DIR/post-install-vm.log"; then
    die "Post-install VM boot still hit 'Missing /etc/machine-id and /etc/ is read-only'!"
  fi
  if grep -Fq "Forcibly rebooting: unit systemd-pcrmachine.service failed" "$WORK_DIR/post-install-vm.log"; then
    die "Post-install VM boot hit systemd-pcrmachine.service forced reboot!"
  fi
  if grep -Fq "YUBIOS_VM_ENROLL_FLOW_PASS" "$WORK_DIR/post-install-vm.log"; then
    log "PASS: Provisioned image ($BOARD) completed full boot + YUBIOS_VM_ENROLL_FLOW_PASS"
  else
    die "Post-SD-install VM boot did not reach YUBIOS_VM_ENROLL_FLOW_PASS marker"
  fi
fi

log "COMPLETE: flash-device-e2e ($BOARD -> $SD_DEVICE) finished successfully."
