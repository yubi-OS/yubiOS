<div align="center">

<img src="https://raw.githubusercontent.com/yubi-OS/assets/main/ads/yubiOS_Technical_Preview.jpg" alt="yubiOS Technical Preview — Assume Nothing. Prove Everything." width="100%" style="border-radius:12px;"/>

# yubiOS Operational Playbook: Fork, Flash, Enroll, Desktop & Upgrade Lifecycle

**Last updated:** 2026-11-19 · [**Technical Preview Quick Start (`TECHNICAL_PREVIEW.md`)**](TECHNICAL_PREVIEW.md) · [**Live Hardware Asciicast Demo**](https://asciinema.org/a/y9sHQPQTIbTWNIyr)

</div>

**Retained hardware logs:**
- [`refs/logs/fvf13-224bf224.new`](refs/logs/fvf13-224bf224.new) — 5-step YubiKey enrollment, local composefs OCI commit, and enforcing UEFI Secure Boot on Radxa ROCK 5B (`rk3588`, 16 GB RAM, 119.1 GB microSD)
- [`refs/logs/fvf14-a76322cd.new`](refs/logs/fvf14-a76322cd.new) — Full 3-boot ROCK 5B capture including GNOME Wayland desktop session (`gdm-wayland-session`, `gnome-shell`), Antimony Browser `v156.0.8078.47-1`, and `systemd-homed` login

**Related ADRs:** [ADR-002](docs/ADR.md#adr-002-secure-boot-signing-via-piv-ccid-not-fido2-hidraw), [ADR-003](docs/ADR.md#adr-003-luks2--fido2-via-systemd-cryptenroll-no-tpm), [ADR-009](docs/ADR.md#adr-009-systemd-homed-for-per-user-luks2fido2-home-directories), [ADR-014](docs/ADR.md#adr-014-rootless-docker-in-docker-on-hardened-dhi-base), [ADR-018](docs/ADR.md#adr-018-yubios-owned-arm64-secure-world-stack-tf-a--op-tee--ftpm), [ADR-019](docs/ADR.md#adr-019-dual-root-of-trust-provisioning-paths-fuse-enforcing-vs-measuredattested), [ADR-020](docs/ADR.md#adr-020-u-boot-as-the-arm64-uefi-firmware--authenticated-variable-store-op-tee-standalonemm), [ADR-032](docs/ADR.md#adr-032-kernelrootfs-split-as-a-first-class-yubios-principle), [ADR-034](docs/ADR.md#adr-034-local-composefs-oci-image-repository-and-automatic-yubikey-uki-re-signing-on-kernel-and-os-updates)

---

## 0. Fork -> Build/Deploy -> Flash Quick Reference

1. **Fork & Clone:**
   ```bash
   gh repo fork yubi-OS/yubiOS --clone=true
   cd yubiOS
   ```
2. **Build & Publish Firmware + OS Images via CI (or Pull Pre-Built):**
   ```bash
   # Build & push ARM64 board firmware (u-boot-rockchip.bin + u-boot-rockchip-spi.bin -> :firmware-<board>):
   gh workflow run ci_firmware-rk.yml -f Docker_push=true

   # Build & push production (:latest) and dev (:dev) OS images on rock1 (using the physical
   # YubiKey or swu2f fallback to stage initial Secure Boot keys into the image and workflow artifact):
   gh workflow run yubiOS-ci.yml -f Docker_push=true
   gh workflow run ci_dev_image.yml -f Docker_push=true

   # Or pull & verify the official signed image directly:
   docker pull docker.io/0mniteck/yubios:latest
   IMAGE_REF=docker.io/0mniteck/yubios:latest bash tests/verify-oci-attestations.sh
   ```
3. **Flash to SD Card (`ci_flash-device-e2e.yml` or `scripts/flash-device-e2e.sh`):**
   ```bash
   # Via GitHub Actions on your flashing runner:
   gh workflow run ci_flash-device-e2e.yml \
     -f SIGNKEY=production \
     -f board=rock5b-rk3588 \
     -f sd_device=/dev/mmcblk1 \
     -f image=docker.io/0mniteck/yubios:dev \
     -f sign_with_yubikey=true

   # Or directly from a Linux terminal:
   sudo env \
     FLASH_SIGNKEY=production \
     FLASH_BOARD=rock5b-rk3588 \
     FLASH_SD_DEVICE=/dev/mmcblk1 \
     FLASH_OS_IMAGE=docker.io/0mniteck/yubios:dev \
     FLASH_SIGN_WITH_YUBIKEY=true \
     bash scripts/flash-device-e2e.sh
   ```

---

## 1. Live Hardware Walkthrough & Asciicast Demo

The end-to-end hardware bring-up, 5-step physical YubiKey enrollment, local composefs OCI repository commit (`oci:/var/lib/yubiOS/oci:yubios-local:latest`), enforcing UEFI Secure Boot reboot, and GNOME Wayland desktop login on the **Radxa ROCK 5B (`rk3588`, 16 GB RAM)** are captured in full in:

- **Asciicast recording:** **[https://asciinema.org/a/y9sHQPQTIbTWNIyr](https://asciinema.org/a/y9sHQPQTIbTWNIyr)**
- **Raw UART captures in-repo:** [`refs/logs/fvf13-224bf224.new`](refs/logs/fvf13-224bf224.new) (`5,622` lines) and [`refs/logs/fvf14-a76322cd.new`](refs/logs/fvf14-a76322cd.new) (`23,167` lines)

### Key Timeline Across `fvf13-224bf224.new` & `fvf14-a76322cd.new`

| Phase | Log Lines | Verified Hardware Event |
|---|---|---|
| **1. First Boot (SetupMode=1)** | `fvf13 L0068`–`L0119` | `U-Boot SPL 2027.01-rc2-gc03e3e65990b` -> `BL31: v2.15.0(release):yubiOS-ac450f98c1db` -> OP-TEE `4.11` (`fTPM` + `StandaloneMM`, `optee@30000000` `36,864 KiB` `no-map` reserved) -> `YUBIOS_TPM_OK` -> `secureboot: Secure boot disabled` (initial un-enrolled state) |
| **2. Composefs Root Setup** | `fvf13 L0993`–`L1000` | `bootc-root-setup.service` mounts `composefs` on `/` (`verity=require`) from `/dev/mmcblk1p2` (`/sysroot`) |
| **3. Step 1/5: Secure Boot (`enroll-sb.sh`)** | `fvf13 L1835`–`L1907` | Mints self-signed `PK`, `KEK`, and `db` from YubiKey PIV slot `9a` (`pkcs11:id=%01;type=private`), writes them through OP-TEE StandaloneMM (`efi-updatevar`, flipping `SetupMode: 1 -> 0`), re-signs `systemd-bootaa64.efi`, `BOOTAA64.EFI`, and `bootc_composefs-<digest>.efi` via `systemd-sbsign` + `sbverify`, and commits the signed UKI to `oci:/var/lib/yubiOS/oci:yubios-local:latest` |
| **4. Step 2/5: LUKS2 + LVM + 3-Way `/usr` OverlayFS (`enroll-luks.sh`)** | `fvf13 L1909`–`L2051` | Creates `/dev/mmcblk1p3` (`110.6G`), formats LUKS2 (`crypt`), enrolls physical YubiKey FIDO2 `hmac-secret` (slot 1) + offline recovery key (slot 2), creates LVM VG `lvm` (`usr_a` `1.1G` `1%`, `usr_b` `1.1G` `1%`, `yubios-root` `106.1G` `96%`, `2%` free), and mounts the 3-way `/usr` OverlayFS (`lowerdir=/run/yubiOS/ab/usr-b/lower:/run/yubiOS/ab/usr-base,upperdir=/run/yubiOS/ab/usr-a/upper,workdir=/run/yubiOS/ab/usr-a/work`) on `/usr` and `/dev/lvm/yubios-root` on `/var/home` |
| **5. Step 3/5: `systemd-homed` FIDO2 (`enroll-homed.sh`)** | `fvf13 L2053`–`L2243` | Creates LUKS2+BTRFS home `/var/home/yubios.home` (`104G`, UID `60345`, group `wheel`) unlocked by physical YubiKey FIDO2 |
| **6. Step 4/5: OpenSSH `ed25519-sk` Resident Key (`enroll-ssh.sh`)** | `fvf13 L2245`–`L2288` | Generates resident `ed25519-sk` SSH key (`-O resident -O verify-required -O application=ssh:yubiOS`) on the YubiKey |
| **7. Step 5/5: PAM U2F (`enroll-pam.sh`)** | `fvf13 L2290`–`L2338` | Registers physical YubiKey U2F credential via `pamu2fcfg` into `/etc/yubico/u2f_keys` |
| **8. Second Boot (Enforcing UEFI Secure Boot + Kernel Lockdown)** | `fvf14 L3182`–`L5049` | `YUBIOS_TPM_OK` -> `secureboot: Secure boot enabled` -> `Kernel is locked down from EFI Secure Boot mode` -> `integrity: Loading X.509 certificate: UEFI:db` (`YUBIOS db`) -> `systemd-cryptsetup@crypt.service` unlocks `/dev/mmcblk1p3` via YubiKey FIDO2 touch + PIN -> `yubiOS-lvm-usr-overlay.service` mounts `/usr` 3-way OverlayFS and `/var/home` |
| **9. GNOME Wayland Desktop & Antimony Browser** | `fvf14 L5402`–`L14864` | `gdm.service` starts, user `yubios` unlocks `/dev/mapper/home-yubios` (`/var/home/yubios`) via YubiKey FIDO2, and `gdm-wayland-session` + `gnome-shell` launch the GNOME Wayland desktop with Antimony Browser (`/usr/bin/antimony`) |

---

## 2. Stage 1: SD Card / Disk Provisioning Lifecycle

Provisioning writes a clean GPT disk layout and board firmware without mutating the sealed composefs rootfs:

```text
Sector 64      : u-boot-rockchip.bin (TPL/SPL + TF-A BL31 v2.15.0 + OP-TEE 4.11 fTPM/StMM + U-Boot UEFI BL33)
Sector 32768+  : GPT Partition Table
  ├─ p1 (512M) : EFI System Partition (vfat, label EFI, mounted at /run/yubiOS/efi with /EFI bind-mounted at /boot/EFI)
  │              ├─ /EFI/BOOT/BOOTAA64.EFI & /EFI/systemd/systemd-bootaa64.efi
  │              ├─ /EFI/Linux/bootc/bootc_composefs-<digest>.efi (Type2 UKI with .splash BMP)
  │              └─ /loader/entries/bootc_yubios-45-1.conf
  ├─ p2 (8G)   : yubiOS-root (ext4 -O verity,^has_journal, mounted at /sysroot)
  │              ├─ /sysroot/composefs/images/<digest> (composefs EROFS + fs-verity objects)
  │              ├─ /sysroot/boot/loader -> loader.1 (ext4 symlink for libostree + ostree-1.conf)
  │              └─ /sysroot/ostree/repo & /sysroot/ostree/deploy/default/deploy/<csum>.0
  └─ p3 (rest) : Created on first boot during Step 2/5 of yubiOS-enroll (LUKS2 `crypt` -> LVM `lvm`)
```

What `scripts/flash-device-e2e.sh` executes:
1. **Safety guards:** Verifies `$FLASH_SD_DEVICE` is a removable disk and does not back `/`, `/boot`, `/mnt/extended`, `/var/lib/containers`, or `/var/tmp`.
2. **Pulls digest-pinned artifacts:** Pulls `$FLASH_OS_IMAGE` and `docker.io/0mniteck/yubios:firmware-${FLASH_BOARD}` and verifies the `RKNS` magic (`524b4e53`) and SHA-256 of `u-boot-rockchip.bin`.
3. **Installs composefs + libostree sysroot:** Formats `p1` (`vfat`) and `p2` (`ext4 -O verity,^has_journal`), runs `bootc install to-filesystem --composefs-backend`, signs all EFI binaries on `p1` with the YubiKey PIV slot `9a` key, and initializes `/sysroot/boot/loader -> loader.1` and `/sysroot/ostree/repo` (`ex-integrity.composefs=true` per [ostreedev.github.io/ostree/composefs](https://ostreedev.github.io/ostree/composefs/)).
4. **Writes board firmware:** Writes `u-boot-rockchip.bin` at sector `64` (`seek=64`) and verifies readback SHA-256.

---

## 3. Stage 2: First-Boot YubiKey Enrollment Lifecycle (`yubiOS-enroll`)

On first boot (when `/var/lib/yubiOS/.enrolled` is absent and `yubiOS-chipsec-firstboot.service` passes), `yubiOS-enroll.service` orders `Before=gdm.service display-manager.service`, exits Plymouth (`plymouth quit`), switches VT 1 to foreground, and runs `usr/lib/yubiOS/enroll.sh` inside a dual-console Python PTY multiplexer (`YUBIOS_DUAL_CONSOLE_MUX`) so the wizard renders and accepts input simultaneously on **both HDMI video (`/dev/tty1`) and serial UART (`/dev/ttyS2`)**:

1. **Step 1/5 — Secure Boot Signing (`usr/lib/yubiOS/enroll-sb.sh`):**
   - Verifies `SetupMode=1` and an RSA-2048 key in YubiKey PIV slot `9a`.
   - Generates self-signed `PK.crt`, `KEK.crt`, and `db.crt` + signed `.auth` bundles via PKCS#11 (`pkcs11:id=%01;type=private`).
   - Enrolls `PK`, `KEK`, and `db` into OP-TEE StandaloneMM via `efi-updatevar` and asserts `SetupMode=0`.
   - Re-signs `systemd-boot`, fallback `BOOT*.EFI`, and the composefs UKI on `/boot/EFI` using `systemd-sbsign`, verifies each with `sbverify --cert db.crt`, and invokes `/usr/lib/yubiOS/uki/uki-sync-and-sign.sh --from-signed-esp` to commit the signed UKI into the local composefs OCI repository (`/var/lib/yubiOS/oci`).
2. **Step 2/5 — Disk Encryption & 3-Way `/usr` OverlayFS (`usr/lib/yubiOS/enroll-luks.sh`):**
   - Allocates partition `p3` (`100%` of remaining disk space), formats it as LUKS2 (`crypt`), and creates LVM VG `lvm` with logical volumes:
     - `usr_a` (`1%VG`, `ext4 -O verity`)
     - `usr_b` (`1%VG`, `ext4 -O verity`)
     - `yubios-root` (`96%VG`, `btrfs`)
     - `2%VG` unallocated reserve
   - Enrolls an offline recovery key and the physical YubiKey FIDO2 `hmac-secret` token (`systemd-cryptenroll --fido2-device=auto --fido2-with-client-pin=yes --fido2-with-user-presence=yes`).
   - Starts `yubiOS-lvm-usr-overlay.service`, mounting the 3-way OverlayFS (`lowerdir=/run/yubiOS/ab/usr-b/lower:/run/yubiOS/ab/usr-base,upperdir=/run/yubiOS/ab/usr-a/upper,workdir=/run/yubiOS/ab/usr-a/work`) directly onto `/usr` and `/dev/lvm/yubios-root` onto `/var/home`.
3. **Step 3/5 — Per-User Encrypted Home (`usr/lib/yubiOS/enroll-homed.sh`):**
   - Creates `/var/home/<user>.home` (`btrfs` inside LUKS2) unlocked by the user's YubiKey FIDO2 credential via `homectl create`.
4. **Step 4/5 — OpenSSH Resident Key (`usr/lib/yubiOS/enroll-ssh.sh`):**
   - Mints a discoverable `ed25519-sk` resident key (`-O resident -O verify-required -O application=ssh:yubiOS`) on the YubiKey.
5. **Step 5/5 — PAM U2F (`usr/lib/yubiOS/enroll-pam.sh`):**
   - Enrolls `pamu2fcfg` credentials into `/etc/yubico/u2f_keys` (`auth required pam_u2f.so`).

---

## 4. Stage 3: Post-Enrollment Boot, Splash, Desktop Session (GNOME + Antimony), & libostree State

On every subsequent boot:
1. **Firmware, UEFI Secure Boot, & Boot Splash:**
   - TF-A BL31 + OP-TEE (`fTPM` + `StandaloneMM`) + U-Boot UEFI verify `systemd-boot` and the Type2 UKI against StandaloneMM `db`.
   - `systemd-stub` displays the embedded `.splash` BMP (`/usr/share/yubiOS/splash/yubios-owner-orbit.bmp`) and hands off to Plymouth (`spinner` theme with `yubios-owner-orbit` `header-image.png` and `watermark.png`) for the graphical FIDO2 LUKS2 PIN + YubiKey touch prompt.
2. **Composefs & libostree Registration (`yubiOS-ostree-composefs-sync.service`):**
   - Mounts the `vfat` ESP at `/run/yubiOS/efi`, bind-mounts `/sysroot/boot` (`ext4`, holding the `loader -> loader.1` symlink and `ostree-1.conf`) at `/boot`, bind-mounts `/run/yubiOS/efi/EFI` at `/boot/EFI`, populates `/sysroot/ostree/repo` and `/sysroot/ostree/deploy/default/deploy/<csum>.0` (including `usr/lib/os-release`, `etc/yum.repos.d`, and `usr/share/rpm/rpmdb.sqlite`), and writes the `a{sv}` GVariant (`backing-root-device-inode`) to `/run/ostree-booted` so `ostree admin status`, `rpm-ostree status`, `rpm-ostree search`, and `bootc status` work seamlessly.
3. **GNOME Wayland Desktop, Default Wallpaper, & Antimony Browser:**
   - `gdm.service` launches the GNOME Wayland desktop session (`gnome-shell`, `ptyxis`, `nautilus`, `gnome-control-center`) with the **yubiOS Aurora Ridge 4K** default wallpaper (`/usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg`) and the provenance-gated **Antimony Browser** (`antimony-stable-156.0.8078.47-1`, installed under `/usr/lib/opt/antimony` and symlinked at `/usr/bin/antimony` and `/usr/bin/antimony-stable`).

---

## 5. Stage 4: Day-2 Upgrade & Local Composefs OCI Repository Lifecycle ([ADR-034](docs/ADR.md#adr-034-local-composefs-oci-image-repository-and-automatic-yubikey-uki-re-signing-on-kernel-and-os-updates))

Any update to the kernel, initramfs, or UKI — whether triggered via `rpm-ostree`, `bootc`, or `dnf`/`rpm` inside the 3-way `/usr` OverlayFS — converges on `/usr/lib/yubiOS/uki/uki-sync-and-sign.sh` (`/usr/bin/yubiOS-uki-sync`):

```text
rpm-ostree upgrade / install ─┐
bootc upgrade / switch       ─┼─► 05-rpmostree.install (same-FS dracut, no EXDEV)
dnf / rpm kernel update      ─┤   95-yubios-uki-resign.install
yubiOS-enroll (enroll-sb.sh) ─┘   yubiOS-uki-resign.path / .service
                                         │
                                         ▼
                        /usr/lib/yubiOS/uki/uki-sync-and-sign.sh
                          1. Build Type2 UKI with .splash BMP (ukify / bootc container ukify)
                          2. Sign with YubiKey PIV slot 9a db key (systemd-sbsign + sbverify)
                          3. Commit to local OCI layout (/var/lib/yubiOS/oci:yubios-local:latest)
                          4. Deploy signed UKI + Type2 BLSConfig to ESP (/boot/EFI/Linux/bootc/)
```

### Day-2 Commands

```bash
# Check libostree, rpm-ostree, and bootc status
ostree admin status
rpm-ostree status
bootc status

# Search package metadata or upgrade
rpm-ostree search gnome
bootc upgrade

# Manually trigger UKI re-build, YubiKey slot 9a signing, and local OCI commit
yubiOS-uki-sync --reason manual-upgrade

# Inspect the local composefs OCI repository (/var/lib/yubiOS/oci)
cat /var/lib/yubiOS/oci/last-deployed.json
cat /var/lib/yubiOS/oci/index.json
```
