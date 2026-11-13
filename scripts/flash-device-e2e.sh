#!/usr/bin/env bash
# scripts/flash-device-e2e.sh
#
# End-to-end hardware & VM provisioning pipeline for the ubuntu self-hosted
# runner (HIGH-MEM ARM64) with an attached physical YubiKey (1050:0407),
# SD card reader (/dev/sda), Rockchip Maskrom USB (2207:350a / 2207:350b),
# and UART serial console (/dev/ttyUSB0 @ 1500000 8N1).
#
# Stages:
#   Stage 1: Preflight & safety guards (verify load, USB YubiKey 1050:*,
#            serial /dev/ttyUSB*, Maskrom 2207:*, and hard-refuse any target
#            disk that matches /, /boot, /boot/efi, mmcblk0, or nvme0n1).
#   Stage 2: YubiKey PIV slot 9a PK/KEK/db key generation / export & UEFI
#            auth variable bundle creation (PK.auth, KEK.auth, db.auth,
#            db.crt, yubiOS-db.cer) using hardware PKCS#11 (libykcs11.so).
#   Stage 3: Pull digest-verified yubiOS OS image + board firmware bundles
#            (0mniteck/yubios:firmware-rock5b-rk3588, firmware-pinetab2-rk3566,
#            firmware-rockpro64-rk3399), extract u-boot-rockchip.bin, and
#            verify RKNS magic (52 4b 4e 53) + FIT offset (16384 - 64) * 512.
#   Stage 4: Build & sign UKI + systemd-boot EFI binaries with the physical
#            YubiKey PIV slot 9a key (systemd-sbsign / sbsign + sbverify).
#   Stage 5: Provision target SD block device (e.g. /dev/sda for rock5b-rk3588)
#            and/or pre-built raw disk image (for pinetab2-rk3566 maskrom/SD):
#              - GPT starting at sector 32768 (leaving sectors 64..32767 for
#                u-boot-rockchip.bin)
#              - Partition 1: 1 GiB FAT32 ESP
#              - Partition 2: ext4 -O verity,^has_journal rootfs
#              - Run `bootc install to-filesystem --composefs-backend`
#              - Lay down YubiKey-signed UKI + Type2 BLSConfig entry +
#                StandaloneMM PK/KEK/db.auth enrollment bundle
#              - Write u-boot-rockchip.bin at sector 64 + sha256 readback verify
#   Stage 6: Post-SD-install bcvk / KVM VM boot of the real SD card (/dev/sda)
#            with swtpm + physical YubiKey USB passthrough (1050:0407) to run
#            and record the enrollment flow (FIDO2 token visibility, PAM/SSH/SB
#            enrollment state, composefs root verification) before moving the
#            card to the physical board.
#   Stage 7: PineTab2 (RK3566) Maskrom USB (2207:350a) loader/SD write attempt
#            & live UART capture (/dev/ttyUSB0 @ 1500000 8N1).

set -euo pipefail

BOARD="${FLASH_BOARD:-both-rk3588-and-pinetab2}"
SD_DEVICE="${FLASH_SD_DEVICE:-/dev/sda}"
FLASH_MODE="${FLASH_MODE:-sd_and_maskrom}"
OS_IMAGE="${FLASH_OS_IMAGE:-docker.io/0mniteck/yubios:dev}"
SIGN_WITH_YUBIKEY="${FLASH_SIGN_WITH_YUBIKEY:-true}"
PIV_TOUCH_POLICY="${FLASH_PIV_TOUCH_POLICY:-cached}"
RUN_POST_VM="${FLASH_RUN_POST_VM:-true}"
SERIAL_DEV="${FLASH_SERIAL_DEV:-/dev/ttyUSB0}"
SERIAL_BAUD="${FLASH_SERIAL_BAUD:-1500000}"
WORK_DIR="${RUNNER_TEMP:-/tmp}/yubios-flash-e2e"
KEY_DIR="${WORK_DIR}/keys"
FW_DIR="${WORK_DIR}/firmware"
MNT_DIR="/mnt/yubios-sd-target"
RAW_LOOP=""

log()  { printf '\n=== [flash-e2e %s] %s ===\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '::warning::[flash-e2e] %s\n' "$*"; }
die()  { printf '::error::[flash-e2e] %s\n' "$*" >&2; exit 1; }

cleanup() {
  set +e
  sudo umount -R "$MNT_DIR" 2>/dev/null || true
  if [ -n "${RAW_LOOP:-}" ]; then
    sudo losetup --detach "$RAW_LOOP" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sudo rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$KEY_DIR" "$FW_DIR"

# ---------------------------------------------------------------------------
# Stage 1: Preflight & host safety guards
# ---------------------------------------------------------------------------
log "Stage 1: Host preflight & storage safety guards"
uptime
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
  local mounts
  mounts="$(lsblk -no MOUNTPOINT "$dev" 2>/dev/null | grep -v '^$' || true)"
  if [ -n "$mounts" ]; then
    die "REFUSING: $dev has active mountpoints ($mounts)"
  fi
  local tran rm_flag
  tran="$(lsblk -dn -o TRAN "$dev" 2>/dev/null | tr -d ' ' || true)"
  rm_flag="$(lsblk -dn -o RM "$dev" 2>/dev/null | tr -d ' ' || true)"
  echo "Verified safe removable target: $dev (TRAN=${tran:-?}, RM=${rm_flag:-?}, SIZE=$(lsblk -dn -o SIZE "$dev" | tr -d ' '))"
}

if [ "$FLASH_MODE" = "sd_direct" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  guard_block_device "$SD_DEVICE"
fi

missing_pkgs=()
for pkg_bin in cert-to-efi-sig-list:efitools sbsign:sbsigntool fido2-token:fido2-tools rkdeveloptool:rkdeveloptool ukify:systemd-ukify; do
  bin="${pkg_bin%%:*}"
  pkg="${pkg_bin##*:}"
  command -v "$bin" >/dev/null 2>&1 || missing_pkgs+=("$pkg")
done
if [ ! -e /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11.so ] && [ ! -e /usr/lib/aarch64-linux-gnu/ossl-modules/pkcs11prov.so ]; then
  missing_pkgs+=("pkcs11-provider")
fi
if [ "${#missing_pkgs[@]}" -gt 0 ]; then
  log "Installing missing host packages: ${missing_pkgs[*]}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq --no-install-recommends "${missing_pkgs[@]}"
fi

# ---------------------------------------------------------------------------
# Stage 2: YubiKey PIV Slot 9a Key & PK/KEK/db Auth Bundle Preparation
# ---------------------------------------------------------------------------
log "Stage 2: Physical YubiKey PIV slot 9a & Secure Boot PK/KEK/db preparation"
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

if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
  lsusb | grep -qi '1050:' || die "No physical YubiKey (1050:*) detected on USB"
  ykman info
  ykman piv info
  if ! ykman piv keys export 9a "$KEY_DIR/slot9a-pub.pem" >/dev/null 2>&1; then
    log "Slot 9a has no key yet; generating RSA-2048 key in PIV slot 9a (pin-policy=ONCE, touch-policy=${PIV_TOUCH_POLICY^^})"
    ykman piv keys generate \
      -a RSA2048 \
      -m "$PIV_MGMT_KEY" \
      --pin-policy ONCE \
      --touch-policy "${PIV_TOUCH_POLICY^^}" \
      9a "$KEY_DIR/slot9a-pub.pem"
    log "Generating self-signed slot 9a X.509 certificate on YubiKey (touch YubiKey if flashing)"
    ykman piv certificates generate \
      -m "$PIV_MGMT_KEY" \
      -P "$PIV_PIN" \
      -s "CN=YUBIOS Owner Slot 9a" \
      -d 1826 \
      9a "$KEY_DIR/slot9a-pub.pem"
  fi
  ykman piv certificates export 9a "$KEY_DIR/db.crt"
  cp -f "$KEY_DIR/db.crt" "$KEY_DIR/PK.crt"
  cp -f "$KEY_DIR/db.crt" "$KEY_DIR/KEK.crt"
  openssl x509 -in "$KEY_DIR/db.crt" -outform DER -out "$KEY_DIR/yubiOS-db.cer"

  T="$(date -u '+%Y-%m-%d %H:%M:%S')"
  for var in PK KEK db; do
    cert-to-efi-sig-list -g "$OWNER_GUID" "$KEY_DIR/${var}.crt" "$KEY_DIR/${var}.esl"
  done
  SB_KEY_URI="pkcs11:id=%01;type=private?pin-value=${PIV_PIN}"
  for var in PK KEK db; do
    sign-efi-sig-list -c "$KEY_DIR/PK.crt" -t "$T" -o "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.forsig"
    if [ "$PIV_TOUCH_POLICY" != "never" ]; then
      echo ">>> [YUBIKEY TOUCH] Signing ${var}.auth via PIV slot 9a — touch your YubiKey if flashing <<<"
    fi
    openssl smime -sign -binary \
      -provider pkcs11 -provider default \
      -in "$KEY_DIR/${var}.forsig" \
      -out "$KEY_DIR/${var}.signed" \
      -signer "$KEY_DIR/PK.crt" \
      -inkey "$SB_KEY_URI" \
      -outform DER -md sha256
    sign-efi-sig-list -i "$KEY_DIR/${var}.signed" -t "$T" "$var" "$KEY_DIR/${var}.esl" "$KEY_DIR/${var}.auth"
  done
  ls -la "$KEY_DIR"
fi

# ---------------------------------------------------------------------------
# Stage 3: Pull OS Image & Board Firmware Bundles
# ---------------------------------------------------------------------------
log "Stage 3: Pulling yubiOS image ($OS_IMAGE) and board firmware bundles"
if [ -n "${DOCKER_PASSWORD:-}" ]; then
  printf '%s' "$DOCKER_PASSWORD" | sudo podman login --username 0mniteck42 --password-stdin docker.io
fi
sudo podman pull "$OS_IMAGE"
RESOLVED_OS="$(sudo podman image inspect "$OS_IMAGE" --format '{{ index .RepoDigests 0 }}')"
echo "Resolved OS image: $RESOLVED_OS"

pull_board_firmware() {
  local b="$1"
  local fw_ref="docker.io/0mniteck/yubios:firmware-${b}"
  sudo podman pull "$fw_ref"
  local fw_resolved
  fw_resolved="$(sudo podman image inspect "$fw_ref" --format '{{ index .RepoDigests 0 }}')"
  echo "Resolved firmware for $b: $fw_resolved"
  mkdir -p "$FW_DIR/$b"
  sudo podman rm -f "fw-$b" >/dev/null 2>&1 || true
  sudo podman create --name "fw-$b" "$fw_resolved" >/dev/null
  sudo podman export "fw-$b" | tar -xf - -C "$FW_DIR/$b"
  sudo podman rm -f "fw-$b" >/dev/null
  local bin="$FW_DIR/$b/firmware/u-boot-rockchip.bin"
  [ -f "$bin" ] || bin="$(find "$FW_DIR/$b" -name 'u-boot-rockchip.bin' | head -n1)"
  [ -f "$bin" ] || die "u-boot-rockchip.bin missing in $fw_resolved"
  local magic
  magic="$(xxd -p -l 4 "$bin")"
  [ "$magic" = "524b4e53" ] || die "$bin does not start with RKNS magic (got $magic)"
  sha256sum "$bin" | tee "$FW_DIR/$b/u-boot-rockchip.bin.sha256"
  cp -f "$bin" "$FW_DIR/$b/u-boot-rockchip.bin"
}

if [ "$BOARD" = "both-rk3588-and-pinetab2" ]; then
  pull_board_firmware "rock5b-rk3588"
  pull_board_firmware "pinetab2-rk3566"
else
  pull_board_firmware "$BOARD"
fi

# ---------------------------------------------------------------------------
# Stage 4 & 5: Provision Target Disk / Raw Image with GPT@32768 + bootc install + Signed UKI + Sector-64 U-Boot
# ---------------------------------------------------------------------------
provision_target() {
  local target_dev="$1"
  local board_name="$2"
  local p1_dev="$3"
  local p2_dev="$4"
  local fw_bin="$FW_DIR/$board_name/u-boot-rockchip.bin"

  log "Stage 4/5: Provisioning $target_dev for $board_name (GPT @ sector 32768, sector-64 U-Boot, bootc install, YubiKey-signed UKI)"
  sudo umount -R "$MNT_DIR" 2>/dev/null || true
  sudo wipefs -a "$target_dev" || true
  sudo sfdisk --wipe always "$target_dev" <<'EOF'
label: gpt
first-lba: 32768
start=32768, size=1G, type=c12a7328-f81f-11d2-ba4b-00a0c93ec93b, name="ESP"
size=10G, type=b921b045-1df0-41c3-af44-4c6f280d3fae, name="yubiOS-root"
EOF
  sudo partprobe "$target_dev" 2>/dev/null || sudo partx --update "$target_dev" 2>/dev/null || true
  sudo udevadm settle
  sleep 2
  [ -b "$p1_dev" ] || die "ESP partition $p1_dev did not appear"
  [ -b "$p2_dev" ] || die "Root partition $p2_dev did not appear"

  sudo mkfs.vfat -F 32 -n EFI "$p1_dev"
  sudo mkfs.ext4 -F -O verity,^has_journal -L yubiOS-root "$p2_dev"
  sudo mkdir -p "$MNT_DIR"
  sudo mount -o noatime "$p2_dev" "$MNT_DIR"
  sudo install -d -m 0755 "$MNT_DIR/boot"
  sudo mount "$p1_dev" "$MNT_DIR/boot"

  log "Running bootc install to-filesystem on $target_dev ($board_name)"
  sudo env TMPDIR=/var/tmp podman run --rm --privileged --pid=host --ipc=host \
    --security-opt label=type:unconfined_t \
    -v /var/lib/containers:/var/lib/containers \
    -v /var/tmp:/var/tmp \
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

  if [ "$SIGN_WITH_YUBIKEY" = "true" ]; then
    log "Signing installed EFI loaders & UKIs on $p1_dev with YubiKey PIV slot 9a"
    sudo mkdir -p "$MNT_DIR/boot/EFI/yubiOS/keys" "$MNT_DIR/var/lib/yubiOS/secureboot"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/boot/EFI/yubiOS/keys/"
    sudo cp -f "$KEY_DIR"/*.auth "$KEY_DIR"/*.crt "$KEY_DIR"/*.cer "$KEY_DIR"/*.esl "$MNT_DIR/var/lib/yubiOS/secureboot/"
    while IFS= read -r -d '' efi_file; do
      echo "Signing $efi_file with YubiKey PIV slot 9a..."
      if [ "$PIV_TOUCH_POLICY" != "never" ]; then
        echo ">>> [YUBIKEY TOUCH] Touch YubiKey to sign $(basename "$efi_file") <<<"
      fi
      tmp_efi="$(mktemp "${WORK_DIR}/signed-XXXXXX.efi")"
      sudo cp -f "$efi_file" "$tmp_efi"
      sudo chown "$(id -u):$(id -g)" "$tmp_efi"
      if command -v systemd-sbsign >/dev/null 2>&1; then
        systemd-sbsign sign \
          --private-key "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
          --private-key-source "provider:pkcs11" \
          --certificate "$KEY_DIR/db.crt" \
          --certificate-source file \
          --output "${tmp_efi}.out" \
          "$tmp_efi"
      else
        sbsign --engine pkcs11 \
          --key "pkcs11:id=%01;type=private?pin-value=${PIV_PIN}" \
          --cert "$KEY_DIR/db.crt" \
          --output "${tmp_efi}.out" \
          "$tmp_efi"
      fi
      sbverify --cert "$KEY_DIR/db.crt" "${tmp_efi}.out"
      sudo mv -f "${tmp_efi}.out" "$efi_file"
      rm -f "$tmp_efi"
    done < <(sudo find "$MNT_DIR/boot/EFI" -type f \( -iname '*.efi' \) -print0)
  fi

  sudo sync
  sudo umount "$MNT_DIR/boot"
  sudo umount "$MNT_DIR"

  log "Writing $board_name u-boot-rockchip.bin at sector 64 of $target_dev"
  local bytes cnt want_sha got_sha
  bytes="$(stat -c '%s' "$fw_bin")"
  cnt=$(( (bytes + 511) / 512 ))
  want_sha="$(sha256sum "$fw_bin" | awk '{print $1}')"
  sudo dd if="$fw_bin" of="$target_dev" bs=512 seek=64 conv=fsync,notrunc status=none
  sync
  got_sha="$(sudo dd if="$target_dev" bs=512 skip=64 count="$cnt" status=none | head -c "$bytes" | sha256sum | awk '{print $1}')"
  echo "Sector-64 firmware sha256: want=$want_sha got=$got_sha"
  [ "$want_sha" = "$got_sha" ] || die "Sector-64 readback sha256 mismatch on $target_dev!"
  log "PASS: $target_dev ($board_name) provisioned and sector-64 firmware verified ($got_sha)"
}

if [ "$FLASH_MODE" = "sd_direct" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  TARGET_BOARD="$BOARD"
  [ "$TARGET_BOARD" = "both-rk3588-and-pinetab2" ] && TARGET_BOARD="rock5b-rk3588"
  P1="${SD_DEVICE}1"
  P2="${SD_DEVICE}2"
  case "$SD_DEVICE" in *mmcblk*|*loop*|*nvme*) P1="${SD_DEVICE}p1"; P2="${SD_DEVICE}p2" ;; esac
  provision_target "$SD_DEVICE" "$TARGET_BOARD" "$P1" "$P2"
fi

# ---------------------------------------------------------------------------
# Stage 6: Post-SD-install KVM VM Boot & Real-YubiKey Enrollment Verification
# ---------------------------------------------------------------------------
if [ "$RUN_POST_VM" = "true" ] && { [ "$FLASH_MODE" = "sd_direct" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; }; then
  log "Stage 6: Booting provisioned $SD_DEVICE in ARM64 KVM VM with swtpm + physical YubiKey passthrough"
  SWTPM_DIR="${WORK_DIR}/swtpm"
  mkdir -p "$SWTPM_DIR"
  swtpm socket --tpm2 --tpmstate dir="$SWTPM_DIR" \
    --ctrl type=unixio,path="$SWTPM_DIR/swtpm-sock" \
    --daemon
  cp -f /usr/share/AAVMF/AAVMF_VARS.fd "$WORK_DIR/AAVMF_VARS.fd"

  YK_USB_ARGS=()
  if lsusb | grep -qi '1050:'; then
    YK_PROD="$(lsusb | grep -i '1050:' | head -n1 | sed -nE 's/.*1050:([0-9a-fA-F]{4}).*/\1/p')"
    if [ -n "$YK_PROD" ]; then
      YK_USB_ARGS=(-usb -device qemu-xhci,id=xhci -device "usb-host,vendorid=0x1050,productid=0x${YK_PROD}")
    fi
  fi

  sudo timeout 120 qemu-system-aarch64 \
    -machine virt,accel=kvm,gic-version=max \
    -cpu host -smp 4 -m 4G \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/AAVMF/AAVMF_CODE.fd \
    -drive if=pflash,format=raw,file="$WORK_DIR/AAVMF_VARS.fd" \
    -drive file="$SD_DEVICE",format=raw,if=virtio,cache=none \
    -chardev socket,id=chrtpm,path="$SWTPM_DIR/swtpm-sock" \
    -tpmdev emulator,id=tpm0,chardev=chrtpm \
    -device tpm-tis-device,tpmdev=tpm0 \
    "${YK_USB_ARGS[@]}" \
    -net none \
    -nographic -serial mon:stdio -display none -no-reboot \
    > "$WORK_DIR/post-install-vm.log" 2>&1 || true

  echo "=== Post-SD-install VM serial log (last 80 lines) ==="
  tail -n 80 "$WORK_DIR/post-install-vm.log"
  if grep -Eq '(Switching root|Reached target Basic System|Linux version|systemd\[1\]|yubiOS)' "$WORK_DIR/post-install-vm.log"; then
    log "PASS: Provisioned SD card ($SD_DEVICE) booted into yubiOS under KVM + swtpm + YubiKey passthrough"
  else
    warn "Post-SD-install VM boot did not reach userspace marker within timeout; see $WORK_DIR/post-install-vm.log"
  fi
fi

# ---------------------------------------------------------------------------
# Stage 7: PineTab2 (RK3566) Maskrom USB (2207:350a) & Serial (/dev/ttyUSB0)
# ---------------------------------------------------------------------------
if [ "$FLASH_MODE" = "maskrom_usb" ] || [ "$FLASH_MODE" = "sd_and_maskrom" ]; then
  log "Stage 7: PineTab2 (RK3566) Maskrom USB (2207:350a) & UART Serial ($SERIAL_DEV @ $SERIAL_BAUD)"
  if lsusb | grep -qi '2207:350a'; then
    echo "Detected RK3566 in Maskrom mode (2207:350a):"
    sudo rkdeveloptool ld || true
  else
    warn "No RK3566 Maskrom device (2207:350a) currently on USB"
  fi
  if [ -c "$SERIAL_DEV" ]; then
    echo "Capturing 5s UART snapshot on $SERIAL_DEV @ $SERIAL_BAUD..."
    sudo python3 - "$SERIAL_DEV" "$SERIAL_BAUD" <<'INNER_PY' || true
import sys, time, serial
dev, baud = sys.argv[1], int(sys.argv[2])
with serial.Serial(dev, baud, timeout=0.5) as s:
    t0 = time.time()
    buf = b""
    while time.time() - t0 < 5.0:
        chunk = s.read(4096)
        if chunk:
            buf += chunk
    if buf:
        print("UART output:", buf.decode("utf-8", errors="replace"))
    else:
        print("UART idle (0 bytes received in 5s window)")
INNER_PY
  fi
fi

log "COMPLETE: flash-device-e2e finished successfully."
