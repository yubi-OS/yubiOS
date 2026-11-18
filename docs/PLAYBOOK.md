# yubiOS Operational Playbook: Flash, Enroll, Deployment & Upgrade Lifecycle

**Last updated:** 2026-11-17
**Live hardware demo (asciicast):** [https://asciinema.org/a/y9sHQPQTIbTWNIyr](https://asciinema.org/a/y9sHQPQTIbTWNIyr)
**Retained hardware log:** [`refs/logs/fvf13-224bf224.new`](../refs/logs/fvf13-224bf224.new) (Radxa ROCK 5B `rk3588`, 16 GB RAM, 119.1 GB microSD)
**Related ADRs:** [ADR-002](ADR.md#adr-002-secure-boot-signing-via-piv-ccid-not-fido2-hidraw), [ADR-003](ADR.md#adr-003-luks2--fido2-via-systemd-cryptenroll-no-tpm), [ADR-009](ADR.md#adr-009-systemd-homed-for-per-user-luks2fido2-home-directories), [ADR-018](ADR.md#adr-018-yubios-owned-arm64-secure-world-stack-tf-a--op-tee--ftpm), [ADR-019](ADR.md#adr-019-dual-root-of-trust-provisioning-paths-fuse-enforcing-vs-measuredattested), [ADR-020](ADR.md#adr-020-u-boot-as-the-arm64-uefi-firmware--authenticated-variable-store-op-tee-standalonemm), [ADR-032](ADR.md#adr-032-kernelrootfs-split-as-a-first-class-yubios-principle), [ADR-034](ADR.md#adr-034-local-composefs-oci-image-repository-and-automatic-yubikey-uki-re-signing-on-kernel-and-os-updates)

---

## 1. Live Hardware Walkthrough & Asciicast Demo

The end-to-end hardware bring-up, 5-step physical YubiKey enrollment, local composefs OCI repository commit (`oci:/var/lib/yubiOS/oci:yubios-local:latest`), and enforcing UEFI Secure Boot reboot on the **Radxa ROCK 5B (`rk3588`, 16 GB RAM)** are captured in full in:

- **Asciicast recording:** **[https://asciinema.org/a/y9sHQPQTIbTWNIyr](https://asciinema.org/a/y9sHQPQTIbTWNIyr)**
- **Raw UART capture in-repo:** [`refs/logs/fvf13-224bf224.new`](../refs/logs/fvf13-224bf224.new) (`5,622` lines)

### Key Timeline in `fvf13-224bf224.new` ([asciinema.org/a/y9sHQPQTIbTWNIyr](https://asciinema.org/a/y9sHQPQTIbTWNIyr))

| Phase | Log Lines (`fvf13-224bf224.new`) | Verified Hardware Event |
|---|---|---|
| **1. First Boot (SetupMode=1)** | `L0068`–`L0119` | `U-Boot SPL 2027.01-rc2-gc03e3e65990b` -> `BL31: v2.15.0(release):yubiOS-ac450f98c1db` -> OP-TEE `4.11` (`fTPM` + `StandaloneMM`, `optee@30000000` `36,864 KiB` `no-map` reserved) -> `YUBIOS_TPM_OK` -> `secureboot: Secure boot disabled` (initial un-enrolled state) |
| **2. Composefs Root Setup** | `L0993`–`L1000` | `bootc-root-setup.service` mounts `composefs:40cf629c9d07...` on `/` (`verity=require`) from `/dev/mmcblk1p2` (`/sysroot`) |
| **3. Step 1/5: Secure Boot (`enroll-sb.sh`)** | `L1835`–`L1907` | Mints self-signed `PK`, `KEK`, and `db` from YubiKey PIV slot `9a` (`pkcs11:id=%01;type=private`), writes them through OP-TEE StandaloneMM (`efi-updatevar`, flipping `SetupMode: 1 -> 0`), re-signs `systemd-bootaa64.efi`, `BOOTAA64.EFI`, and `bootc_composefs-40cf629c....efi` via `systemd-sbsign` + `sbverify`, and commits the signed UKI to `oci:/var/lib/yubiOS/oci:yubios-local:latest` (`manifest sha256:3604413f...`) |
| **4. Step 2/5: LUKS2 + LVM + 3-Way `/usr` OverlayFS (`enroll-luks.sh`)** | `L1909`–`L2051` | Creates `/dev/mmcblk1p3` (`110.6G`), formats LUKS2 (`crypt`), enrolls physical YubiKey FIDO2 `hmac-secret` (slot 1) + offline recovery key (slot 2), creates LVM VG `lvm` (`usr_a` `1.1G` `1%`, `usr_b` `1.1G` `1%`, `yubios-root` `106.1G` `96%`, `2%` free), and mounts the 3-way `/usr` OverlayFS (`lowerdir=/run/yubiOS/ab/usr-b/lower:/run/yubiOS/ab/usr-base,upperdir=/run/yubiOS/ab/usr-a/upper,workdir=/run/yubiOS/ab/usr-a/work`) on `/usr` and `/dev/lvm/yubios-root` on `/var/home` |
| **5. Step 3/5: `systemd-homed` FIDO2 (`enroll-homed.sh`)** | `L2053`–`L2243` | Creates LUKS2+BTRFS home `/var/home/yubios.home` (`104G`, UID `60345`, group `wheel`) unlocked by physical YubiKey FIDO2 |
| **6. Step 4/5: OpenSSH `ed25519-sk` Resident Key (`enroll-ssh.sh`)** | `L2245`–`L2288` | Generates resident `ed25519-sk` SSH key (`-O resident -O verify-required -O application=ssh:yubiOS`) on the YubiKey |
| **7. Step 5/5: PAM U2F (`enroll-pam.sh`)** | `L2290`–`L2338` | Registers physical YubiKey U2F credential via `pamu2fcfg` into `/etc/yubico/u2f_keys` |
| **8. Second Boot (Enforcing UEFI Secure Boot + Kernel Lockdown)** | `L2863`–`L4603` | `YUBIOS_TPM_OK` -> `secureboot: Secure boot enabled` -> `Kernel is locked down from EFI Secure Boot mode` -> `integrity: Loading X.509 certificate: UEFI:db` (`YUBIOS db`) -> `systemd-cryptsetup@crypt.service` unlocks `/dev/mmcblk1p3` via YubiKey FIDO2 touch + PIN -> `yubiOS-lvm-usr-overlay.service` mounts `/usr` 3-way OverlayFS and `/var/home` |
| **9. Runtime Verification (`lsblk`, `mount`, `homectl`, `enP4p65s0`, `/var/lib/yubiOS/oci`)** | `L4609`–`L5170` | Verifies block tree (`mmcblk1p1` `/boot`, `mmcblk1p2` `/sysroot`, `mmcblk1p3` -> `crypt` -> `lvm-{usr_a,usr_b,yubios--root}`), unlocks `/var/home/yubios` (`homectl` state `active` on `/dev/mapper/home-yubios`), verifies `enP4p65s0` 1 Gbps Ethernet (`ping 1.1.1.1` `0%` loss), and inspects `/var/lib/yubiOS/oci/{blobs,composefs,index.json,last-deployed.json,oci-layout}` |

---

## 2. Stage 1: SD Card / Disk Provisioning Lifecycle

Provisioning writes a clean GPT disk layout and board firmware without mutating the sealed composefs rootfs:

```text
Sector 64      : u-boot-rockchip.bin (TPL/SPL + TF-A BL31 v2.15.0 + OP-TEE 4.11 fTPM/StMM + U-Boot UEFI BL33)
Sector 32768+  : GPT Partition Table
  ├─ p1 (512M) : EFI System Partition (vfat, label EFI, mounted at /boot)
  │              ├─ /EFI/BOOT/BOOTAA64.EFI & /EFI/systemd/systemd-bootaa64.efi
  │              ├─ /EFI/Linux/bootc/bootc_composefs-<digest>.efi (Type2 UKI)
  │              └─ /loader/entries/bootc_yubios-45-1.conf
  ├─ p2 (8G)   : yubiOS-root (ext4 -O verity,^has_journal, mounted at /sysroot)
  │              ├─ /sysroot/composefs/images/<digest> (composefs EROFS + fs-verity objects)
  │              └─ /sysroot/ostree/repo & /sysroot/ostree/deploy/default/deploy/<csum>.0 (.ostree.cfs)
  └─ p3 (rest) : Created on first boot during Step 2/5 of yubiOS-enroll (LUKS2 `crypt` -> LVM `lvm`)
```

### Automated CI Flash (`rock1`)

Dispatch `.github/workflows/ci_flash-device-e2e.yml` (or run `scripts/flash-device-e2e.sh` directly on the flashing host):

```bash
FLASH_SIGNKEY=production \
FLASH_BOARD=rock5b-rk3588 \
FLASH_SD_DEVICE=/dev/mmcblk1 \
FLASH_OS_IMAGE=docker.io/0mniteck/yubios:dev \
FLASH_SIGN_WITH_YUBIKEY=true \
bash scripts/flash-device-e2e.sh
```

What `scripts/flash-device-e2e.sh` executes:
1. **Safety guards:** Verifies `$FLASH_SD_DEVICE` is a removable disk and does not back `/`, `/boot`, `/mnt/extended`, `/var/lib/containers`, or `/var/tmp`.
2. **Pulls digest-pinned artifacts:** Pulls `$FLASH_OS_IMAGE` and `docker.io/0mniteck/yubios:firmware-${FLASH_BOARD}` and verifies the `RKNS` magic (`524b4e53`) and SHA-256 of `u-boot-rockchip.bin`.
3. **Installs composefs + libostree sysroot:** Formats `p1` (`vfat`) and `p2` (`ext4 -O verity,^has_journal`), runs `bootc install to-filesystem --composefs-backend`, and runs `/usr/lib/yubiOS/ostree-composefs-sync.sh --provision-target` so both `/sysroot/composefs` and `/sysroot/ostree/repo` (`ex-integrity.composefs=true` per [ostreedev.github.io/ostree/composefs](https://ostreedev.github.io/ostree/composefs/)) are populated.
4. **Writes board firmware:** Writes `u-boot-rockchip.bin` at sector `64` (`seek=64`) and verifies readback SHA-256.

---

## 3. Stage 2: First-Boot YubiKey Enrollment Lifecycle (`yubiOS-enroll`)

On first boot (when `/var/lib/yubiOS/.enrolled` is absent and `yubiOS-chipsec-firstboot.service` passes), `yubiOS-enroll` (`usr/lib/yubiOS/enroll.sh`) guides the owner through 5 hardware-backed ceremonies:

1. **Step 1/5 — Secure Boot Signing (`usr/lib/yubiOS/enroll-sb.sh`):**
   - Verifies `SetupMode=1` and an RSA-2048 key in YubiKey PIV slot `9a`.
   - Generates self-signed `PK.crt`, `KEK.crt`, and `db.crt` + signed `.auth` bundles via PKCS#11 (`pkcs11:id=%01;type=private`).
   - Enrolls `PK`, `KEK`, and `db` into OP-TEE StandaloneMM via `efi-updatevar` and asserts `SetupMode=0`.
   - Re-signs `systemd-boot`, fallback `BOOT*.EFI`, and the composefs UKI on `/boot` using `systemd-sbsign`, verifies each with `sbverify --cert db.crt`, and invokes `/usr/lib/yubiOS/uki/uki-sync-and-sign.sh --from-signed-esp` to commit the signed UKI into the local composefs OCI repository (`/var/lib/yubiOS/oci`).
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

## 4. Stage 3: Post-Enrollment Boot, Desktop Session (GNOME + Antimony), & libostree State

On every subsequent boot:
1. **Firmware & UEFI Secure Boot:** TF-A BL31 + OP-TEE (`fTPM` + `StandaloneMM`) + U-Boot UEFI verify `systemd-boot` and the Type2 UKI against StandaloneMM `db`, booting Linux with `secureboot: Secure boot enabled` and `Kernel is locked down from EFI Secure Boot mode`.
2. **Composefs & libostree Registration:**
   - `/usr/lib/ostree/prepare-root.conf` (`[composefs] enabled = yes` per [ostreedev.github.io/ostree/composefs](https://ostreedev.github.io/ostree/composefs/)) and `yubiOS-ostree-composefs-sync.service` ensure `/sysroot/ostree/repo`, `/sysroot/ostree/deploy/default/deploy/<csum>.0`, and `/run/ostree-booted` (`backing-root-device-inode` GVariant `a{sv}`) are active so both `rpm-ostree` and `bootc` recognize the booted deployment.
3. **LUKS2 + LVM + 3-Way `/usr` OverlayFS + `systemd-homed`:**
   - `systemd-cryptsetup@crypt.service` unlocks `/dev/mmcblk1p3` via YubiKey FIDO2 touch + PIN, activates `lvm-{usr_a,usr_b,yubios--root}`, mounts the 3-way `/usr` OverlayFS and `/var/home`, and unlocks `/var/home/<user>` on login via `pam_systemd_home.so`.
4. **GNOME Wayland Desktop & Antimony Browser:**
   - `gdm.service` launches the GNOME Wayland desktop session (`gnome-shell`, `ptyxis`, `nautilus`, `gnome-control-center`) with the provenance-gated **Antimony Browser** (`antimony-stable-156.0.8078.47-1`, installed under `/usr/lib/opt/antimony` and symlinked at `/usr/bin/antimony` and `/usr/bin/antimony-stable`).

---

## 5. Stage 4: Day-2 Upgrade & Local Composefs OCI Repository Lifecycle ([ADR-034](ADR.md#adr-034-local-composefs-oci-image-repository-and-automatic-yubikey-uki-re-signing-on-kernel-and-os-updates))

Any update to the kernel, initramfs, or UKI — whether triggered via `rpm-ostree`, `bootc`, or `dnf`/`rpm` inside the 3-way `/usr` OverlayFS — converges on `/usr/lib/yubiOS/uki/uki-sync-and-sign.sh` (`/usr/bin/yubiOS-uki-sync`):

```text
rpm-ostree upgrade / install ─┐
bootc upgrade / switch       ─┼─► 05-rpmostree.install (same-FS dracut, no EXDEV)
dnf / rpm kernel update      ─┤   95-yubios-uki-resign.install
yubiOS-enroll (enroll-sb.sh) ─┘   yubiOS-uki-resign.path / .service
                                         │
                                         ▼
                        /usr/lib/yubiOS/uki/uki-sync-and-sign.sh
                          1. Build Type2 UKI (ukify / bootc container ukify)
                          2. Sign with YubiKey PIV slot 9a db key (systemd-sbsign + sbverify)
                          3. Commit to local OCI layout (/var/lib/yubiOS/oci:yubios-local:latest)
                          4. Deploy signed UKI + Type2 BLSConfig to ESP (/boot/EFI/Linux/bootc/)
```

### Upgrade Commands

- **Check `libostree` / `rpm-ostree` & `bootc` status:**
  ```bash
  rpm-ostree status
  bootc status
  ```
- **Upgrade or layer packages via `rpm-ostree` or `bootc` (with automatic YubiKey PIV slot `9a` UKI re-signing):**
  ```bash
  rpm-ostree upgrade
  # or
  bootc upgrade
  # Re-sync and sign the staged UKI into /var/lib/yubiOS/oci and /boot if prompted:
  yubiOS-uki-sync --reason manual-upgrade
  ```
- **Inspect the local composefs OCI repository (`/var/lib/yubiOS/oci`):**
  ```bash
  cat /var/lib/yubiOS/oci/last-deployed.json
  cat /var/lib/yubiOS/oci/index.json
  ```
