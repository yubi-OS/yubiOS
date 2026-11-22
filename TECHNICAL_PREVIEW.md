<div align="center">

<img src="https://raw.githubusercontent.com/yubi-OS/assets/main/ads/yubiOS_Technical_Preview.jpg" alt="yubiOS Technical Preview — Assume Nothing. Prove Everything." width="100%" style="border-radius:12px;"/>

# yubiOS Technical Preview

**Assume Nothing. Prove Everything. Your keys. Your machine. Verifiably yours.**

[![License: LGPL-2.1](https://img.shields.io/badge/license-LGPL--2.1-magenta?style=flat-square)](LICENSE)
[![Release: v0.8.94](https://img.shields.io/badge/release-v0.8.94-blueviolet?style=flat-square)](https://github.com/yubi-OS/yubiOS/releases)
[![U2F/HSM 5](https://img.shields.io/badge/YubiKey-5%20series-ff1493?style=flat-square)](https://www.yubico.com)
[![Hardware Demo](https://img.shields.io/badge/asciinema-Hardware%20Demo-00d787?style=flat-square)](https://asciinema.org/a/y9sHQPQTIbTWNIyr)

[**Quick Start (Fork -> Deploy -> Flash)**](#quick-start-fork--builddeploy--flash--enroll) · [**Step 1: Fork**](#step-1-fork--configure-the-repository) · [**Step 2: Build or Pull**](#step-2-build-or-pull-the-yubios-image) · [**Step 3: Flash SD / Disk**](#step-3-flash-to-sd-card-or-disk) · [**Step 4: Enroll U2F/HSM**](#step-4-first-boot--5-step-u2fhsm-enrollment) · [**Step 5: Day-2 Upgrades**](#step-5-boot-desktop--day-2-upgrades) · [**Operational Playbook**](PLAYBOOK.md)

</div>

---

## Overview

**yubiOS** is an immutable, [bootc](https://github.com/bootc-dev/bootc)-delivered Linux operating system where a physical **U2F/HSM 5** replaces OEM and vendor trust anchors at every boundary:

| Trust Boundary | Mechanism | Hardware Anchor |
|---|---|---|
| **1. UEFI Secure Boot & Type2 UKI** | `systemd-boot` + Type2 UKI (`.linux` + `.initrd` + `.cmdline` + `.splash`) verified by OP-TEE `StandaloneMM` | **U2F/HSM PIV Slot `9a`** (`RSA-2048`, `systemd-sbsign` + `PKCS#11`) |
| **2. Root Integrity (`/` & `/usr`)** | Read-only `composefs` (`verity=require`) + 3-way A/B `/usr` OverlayFS on LVM (`usr_a`, `usr_b`) | **Composefs SHA-512 Digest** embedded in signed UKI `.cmdline` |
| **3. Disk Encryption (`crypt`)** | LUKS2 partition (`p3`) + LVM VG `lvm` (`usr_a`, `usr_b`, `yubios-root`) | **U2F/HSM FIDO2 `hmac-secret`** (`systemd-cryptenroll`, PIN + touch) |
| **4. User Home Directory** | Per-user LUKS2 + BTRFS volume (`/var/home/<user>.home`) | **U2F/HSM FIDO2** (`systemd-homed` + `pam_systemd_home.so`) |
| **5. SSH & Local Privilege (`sudo`)** | Discoverable `ed25519-sk` resident SSH key + `pam_u2f.so` | **U2F/HSM FIDO2 / U2F** (`verify-required`, physical touch per action) |
| **6. Measured Boot & Runtime Integrity** | TF-A `BL31` + OP-TEE `4.11` `fTPM` (PCRs `0..7`, `11`) + Linux IMA SHA-256 (`ima_policy=tcb`) | **OP-TEE `fTPM` (`/dev/tpmrm0`)** + **U2F/HSM Attestation** |

---

## Hardware & Host Prerequisites

1. **U2F/HSM 5 Series** (firmware `>= 5.2.3` for `ed25519-sk` and FIDO2 `hmac-secret`):
   - Set a FIDO2 PIN (minimum 8 characters) before starting:
     ```bash
     ykman fido access change-pin
     ```
   - Ensure PIV slot `9a` holds an `RSA-2048` key (the automated flasher can also mint one on the attached U2F/HSM when `SIGNKEY=production` or `SIGNKEY=test` is used):
     ```bash
     ykman piv keys generate --algorithm RSA2048 --pin-policy ONCE --touch-policy CACHED 9a pubkey.pem
     ykman piv certificates generate --subject "CN=yubiOS Slot 9a" 9a pubkey.pem
     ```
2. **Target Hardware or VM:**
   - **Primary ARM64 SBC:** Radxa ROCK 5B (`rk3588`, 16 GB RAM recommended), Pine64 RockPro64 (`rk3399`), or Pine64 PineTab2 (`rk3566`) with a microSD card (`>= 32 GB`, `64 GB+` recommended).
   - **x86_64 / ARM64 UEFI VM:** QEMU/KVM with `bcvk` (`v0.22.0-yubios.1`), `swtpm`, and either physical U2F/HSM USB passthrough (`--u2f-hsm`) or software FIDO2 (`--swu2f`).
3. **Flashing / Build Host:**
   - Any Linux host (`x86_64` or `aarch64`, Ubuntu 24.04 / 26.04 or Fedora 43+) with `podman` or `docker`, `parted`, `e2fsprogs`, `dosfstools`, `sbsigntools`, `efitools`, and `yubikey-manager`.

---

## Quick Start: Fork -> Build/Deploy -> Flash -> Enroll

```text
┌──────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐
│ 1. Fork Repository   │────►│ 2. Build / Deploy Image  │────►│ 3. Flash SD Card / Disk  │────►│ 4. Boot & Enroll U2F/HSM │
│ github.com/yubi-OS/  │     │ GitHub Actions CI or     │     │ ci_flash-device-e2e.yml  │     │ Dual HDMI + UART Wizard  │
│ yubiOS -> your-fork  │     │ build-local-images.sh    │     │ or flash-device-e2e.sh   │     │ 5-Step Hardware Ceremony │
└──────────────────────┘     └──────────────────────────┘     └──────────────────────────┘     └──────────────────────────┘
```

---

## Step 1: Fork & Configure the Repository

1. **Fork on GitHub:**
   Click **Fork** on [`https://github.com/yubi-OS/yubiOS`](https://github.com/yubi-OS/yubiOS) (or use the GitHub CLI):
   ```bash
   gh repo fork yubi-OS/yubiOS --clone=true
   cd yubiOS
   ```
2. **Configure GitHub Actions (Optional, for CI Image Publishing & Automated SD Flashing):**
   - In your fork on GitHub, open **Settings -> Secrets and variables -> Actions** and add:
     - `DOCKER`: Your Docker Hub Personal Access Token (used by `yubiOS-ci.yml` and `ci_dev_image.yml` when `Docker_push=true`).
   - If you attach a self-hosted ARM64 flashing runner (such as a RockPro64 or workstation with an SD card reader and U2F/HSM attached), register it under **Settings -> Actions -> Runners** with labels `[self-hosted, Linux, ARM64, KVM]`.

---

## Step 2: Build or Pull the yubiOS Image

Choose one of the three paths below:

### Option 2A: Pull the Official Signed & Attested Image (Fastest)

```bash
# Pull the production image (or :dev for serial root-autologin + swu2f test tooling)
docker pull docker.io/0mniteck/yubios:latest

# Verify the cosign signature, SPDX SBOM, and SLSA v1.0 provenance attestations
IMAGE_REF=docker.io/0mniteck/yubios:latest bash tests/verify-oci-attestations.sh
```

### Option 2B: Build & Publish Firmware + OS Images via GitHub Actions on Your Fork

Trigger the rootless BuildKit CI pipelines for both the **ARM64 board firmware** (`ci_firmware-rk.yml`) and the **OS images** (`yubiOS-ci.yml` and `ci_dev_image.yml`) directly from the **Actions** tab or via `gh`:

```bash
# 1. Refresh upstream Fedora bootc & DHI base digests (if needed)
gh workflow run fetch-fedora-bootc-manifest.yml
gh workflow run fetch-dhi-manifest.yml

# 2. Build & push the ARM64 Secure World + U-Boot UEFI firmware bundles
#    (TF-A BL31 v2.15.0 + OP-TEE 4.11 fTPM/StandaloneMM + EDK2 StMM + U-Boot UEFI BL33)
#    Publishes docker.io/0mniteck/yubios:firmware-{rock5b-rk3588,rockpro64-rk3399,pinetab2-rk3566,qemu-arm64}
#    containing u-boot-rockchip.bin and u-boot-rockchip-spi.bin
gh workflow run ci_firmware-rk.yml -f Docker_push=true

# 3. Build & push the production OS image (:latest and :<sha>)
#    The arm64 leg runs on rock1 using the attached physical U2F/HSM (or opts for the
#    swu2f path if no U2F/HSM is attached) to stage the initial Secure Boot keys into
#     the image and export them in reproducibility-production-arm64-<sha>
gh workflow run yubiOS-ci.yml -f Docker_push=true

# 4. Build & push the dev/test OS image (:dev and :dev-<sha>)
#    Also stages initial Secure Boot keys via rock1's U2F/HSM (or swu2f fallback)
#    and exports them in reproducibility-dev-arm64-<sha>
gh workflow run ci_dev_image.yml -f Docker_push=true
```

#### Initial Secure Boot Keys & Firmware Binaries on `/boot`

- **Hardware U2F/HSM on `rock1` (with `swu2f` Fallback):** During `yubiOS-ci.yml` and `ci_dev_image.yml`, `usr/lib/yubiOS/uki/stage-ci-sb-keys.sh` runs on `rock1` and uses the attached physical U2F/HSM PIV slot `9a` (or opts for the `swu2f` path when no physical U2F/HSM is present) to stage `PK.{crt,esl,auth}`, `KEK.{crt,esl,auth}`, `db.{crt,esl,auth}`, and `yubiOS-db.cer`.
- **Included in the Image & Workflow Artifact Export:**
  - Baked into the OCI image at `/usr/lib/yubiOS/secureboot/`, `/boot/EFI/yubiOS/secureboot/`, and `/boot/EFI/yubiOS/keys/`.
  - Saved in the workflow artifact (`reproducibility-production-arm64-<sha>` and `reproducibility-dev-arm64-<sha>`) under `secureboot/` and `EFI/yubiOS/{secureboot,keys}/`.
- **Deployed to `/boot` After `bootc install`:**
  - `scripts/flash-device-e2e.sh` and `yubiOS-ostree-composefs-sync.service` deploy the Secure Boot keys to both `/boot/EFI/yubiOS/secureboot/` and `/boot/EFI/yubiOS/keys/` (matching `enroll-sb.sh`, so Secure Boot can be enrolled before first boot or via `yubiOS-enroll-sb prebuilt`).
  - `scripts/flash-device-e2e.sh` also saves `/boot/u-boot-rockchip.bin` and `/boot/u-boot-rockchip-spi.bin` (plus `/boot/EFI/yubiOS/firmware/`) directly onto `/boot`.

Every CI build enforces:
- **OPA/Rego Build Policy (`yubiOS.rego`):** Rejects any unpinned or floating base image before a single layer executes.
- **ADR-014 Rootless Docker-in-Docker:** Runs BuildKit inside a rootless daemon on the digest-pinned `dhi.io/debian-base` container.
- **Two-Build Bit-for-Bit Reproducibility Gate:** Builds the image twice in isolated containers at `SOURCE_DATE_EPOCH` and asserts identical OCI digests and embedded composefs UKI digests.

### Option 2C: Build Locally from Source with Docker Bake

On an Ubuntu 26.04 host with `docker` installed:

```bash
# Build production + dev OCI images locally
./scripts/build-local-images.sh images

# Or build a single target:
./scripts/build-local-images.sh production
./scripts/build-local-images.sh dev
./scripts/build-local-images.sh firmware-rock5b-rk3588
```

---

## Step 3: Flash to SD Card or Disk

You can provision a bootable microSD card either through the **GitHub Actions Flash Workflow** (on your self-hosted flashing runner) or **directly from a Linux terminal**.

### Option 3A: One-Click Flash via GitHub Actions (`ci_flash-device-e2e.yml`)

Insert your microSD card (e.g. `/dev/mmcblk1`) and U2F/HSM into your flashing host, then dispatch `ci_flash-device-e2e.yml`:

```bash
gh workflow run ci_flash-device-e2e.yml \
  -f SIGNKEY=production \
  -f board=rock5b-rk3588 \
  -f sd_device=/dev/mmcblk1 \
  -f image=docker.io/0mniteck/yubios:dev \
  -f sign_with_u2f_hsm=true
```

> **Touch Prompt:** When `SIGNKEY=production` is selected, touch your U2F/HSM when the LED flashes during Stage 2 (`PK.auth` / `KEK.auth` / `db.auth` signing) and Stage 4 (`systemd-boot` and Type2 UKI signing).

### Option 3B: Direct CLI Flash on Any Linux Host (`scripts/flash-device-e2e.sh`)

Run `scripts/flash-device-e2e.sh` directly against your removable SD card block device (replace `/dev/mmcblk1` with your SD card device and `rock5b-rk3588` with `rock5b-rk3588`, `rockpro64-rk3399`, or `pinetab2-rk3566`):

```bash
sudo env \
  FLASH_SIGNKEY=production \
  FLASH_BOARD=rock5b-rk3588 \
  FLASH_SD_DEVICE=/dev/mmcblk1 \
  FLASH_OS_IMAGE=docker.io/0mniteck/yubios:dev \
  FLASH_SIGN_WITH_U2F_HSM=true \
  bash scripts/flash-device-e2e.sh
```

#### What the Flasher Writes to the SD Card

```text
Sector 64      : u-boot-rockchip.bin (TPL/SPL + TF-A BL31 v2.15.0 + OP-TEE 4.11 fTPM/StMM + U-Boot UEFI BL33)
Sector 32768+  : GPT Partition Table
  ├─ p1 (512M) : EFI System Partition (vfat, label EFI)
  │              ├─ /EFI/BOOT/BOOTAA64.EFI & /EFI/systemd/systemd-bootaa64.efi (signed by U2F/HSM 9a)
  │              ├─ /EFI/Linux/bootc/bootc_composefs-<digest>.efi (Type2 UKI with .splash + .cmdline, signed)
  │              ├─ /EFI/yubiOS/keys/{PK,KEK,db}.{auth,crt,cer,esl}
  │              └─ /loader/entries/bootc_yubios-45-1.conf
  ├─ p2 (8G)   : yubiOS-root (ext4 -O verity,^has_journal, mounted at /sysroot)
  │              ├─ /sysroot/composefs/images/<digest> (composefs EROFS + fs-verity objects)
  │              ├─ /sysroot/boot/loader -> loader.1 (libostree BLS symlink + ostree-1.conf)
  │              └─ /sysroot/ostree/repo & /sysroot/ostree/deploy/default/deploy/<csum>.0
  └─ p3 (rest) : Unallocated free space (claimed on first boot by Step 2/5 of yubiOS-enroll for LUKS2 + LVM)
```

---

## Step 4: First Boot & 5-Step U2F/HSM Enrollment

1. Move the flashed microSD card and your **U2F/HSM 5** to the target board (e.g. Radxa ROCK 5B), connect **HDMI** (and/or UART serial at `1500000 8N1`), and power on.
2. **Dual-Console Enrollment Wizard (`yubiOS-enroll.service`):**
   - On first boot, `yubiOS-enroll` automatically launches **before** `gdm.service` and mirrors all output and PIN prompts across **both the HDMI monitor (`/dev/tty1`) and the serial console (`/dev/ttyS2`)** via its built-in PTY multiplexer (`YUBIOS_DUAL_CONSOLE_MUX`). You can type on either a USB keyboard or serial UART.
3. **Complete the 5 Hardware Ceremonies:**
   - **Step 1/5 — Secure Boot Signing (`yubiOS-enroll-sb`):**
     Enrolls `PK`, `KEK`, and `db` into OP-TEE StandaloneMM (`SetupMode: 1 -> 0`), re-signs `systemd-boot` and the Type2 UKI with your U2F/HSM PIV slot `9a` key (enter PIV PIN + touch U2F/HSM), and commits the signed UKI to the on-device local OCI store (`oci:/var/lib/yubiOS/oci:yubios-local:latest`).
   - **Step 2/5 — Disk Encryption & 3-Way `/usr` OverlayFS (`yubiOS-enroll-luks`):**
     Creates partition `p3` across all remaining disk space, formats it as LUKS2 (`crypt`), initializes LVM VG `lvm` (`usr_a` `1%`, `usr_b` `1%`, `yubios-root` `96%`, `2%` free), prints your offline recovery key, enrolls your U2F/HSM FIDO2 `hmac-secret` token (enter FIDO2 PIN + touch U2F/HSM), and mounts the writable 3-way `/usr` OverlayFS and `/var/home`.
   - **Step 3/5 — Encrypted User Home (`yubiOS-enroll-homed`):**
     Creates your LUKS2+BTRFS home directory (`/var/home/yubios.home`) unlocked by your U2F/HSM FIDO2 credential.
   - **Step 4/5 — OpenSSH Resident Key (`yubiOS-enroll-ssh`):**
     Generates a hardware-resident `ed25519-sk` SSH key on the U2F/HSM (touch U2F/HSM twice).
   - **Step 5/5 — PAM U2F (`yubiOS-enroll-pam`):**
     Enrolls your U2F/HSM for `sudo` and local login authentication (`/etc/yubico/u2f_keys`).
4. **Reboot:**
   Once all 5 steps complete, reboot the board:
   ```bash
   systemctl reboot
   ```

---

## Step 5: Boot Desktop & Day-2 Upgrades

On the second (and every subsequent) boot:

1. **Enforcing UEFI Secure Boot & Boot Splash:**
   - U-Boot UEFI verifies `systemd-boot` and the Type2 UKI against StandaloneMM `db`, displays the **yubiOS Owner Orbit** boot splash (`.splash` + Plymouth), and boots Linux in enforcing Secure Boot lockdown (`secureboot: Secure boot enabled`).
2. **FIDO2 LUKS2 Unlock:**
   - Enter your FIDO2 PIN and touch your U2F/HSM at the boot prompt to unlock `/dev/mapper/crypt`, activate `lvm-{usr_a,usr_b,yubios--root}`, and mount the 3-way `/usr` OverlayFS.
3. **GNOME Wayland Desktop & Antimony Browser:**
   - Log in as `yubios` at the GDM screen (unlocked via `pam_systemd_home.so` + U2F/HSM FIDO2) into the **GNOME Wayland desktop** featuring the **Aurora Ridge 4K** default wallpaper and the provenance-gated **Antimony Browser** (`/usr/bin/antimony`).
4. **Day-2 Upgrades & Automatic U2F/HSM UKI Re-Signing ([ADR-034](docs/ADR.md#adr-034-local-composefs-oci-image-repository-and-automatic-u2fhsm-uki-re-signing-on-kernel-and-os-updates)):**
   ```bash
   # Check libostree / rpm-ostree & bootc deployment status
   ostree admin status
   rpm-ostree status
   bootc status

   # Search or layer packages, or upgrade the bootc/ostree image
   rpm-ostree search gnome
   bootc upgrade

   # Inspect the on-device local composefs OCI repository (/var/lib/yubiOS/oci)
   cat /var/lib/yubiOS/oci/last-deployed.json
   ```

---

## Deeper Documentation

- [**Operational Playbook (`PLAYBOOK.md`)**](PLAYBOOK.md) — Full stage-by-stage architecture, UART log breakdown (`fvf13` & `fvf14`), and [live asciinema hardware demo](https://asciinema.org/a/y9sHQPQTIbTWNIyr).
- [**Architecture Decision Records (`docs/ADR.md`)**](docs/ADR.md) — ADR-001 through ADR-034.
- [**Pinned Supply-Chain Digests (`PINNED.md`)**](PINNED.md) — Every pinned base image, fork commit, action SHA, and release binary hash.
