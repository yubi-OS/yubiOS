# Radxa ROCK 5B (`rk3588`) Full 5-Step YubiKey Enrollment, Enforcing UEFI Secure Boot Milestone, and Local Composefs OCI UKI Upgrade Architecture (2026-11-17)

## 1. Executive Summary

On 2026-11-17, the physical Radxa ROCK 5B (`rk3588`, 16 GB RAM) booted the yubiOS SD image flashed by `ci_flash-device-e2e.yml` on `rock1`, completed all 5 stages of the attended `yubiOS-enroll` ceremony against a physical YubiKey 5, and rebooted multiple times under enforcing UEFI Secure Boot (`SetupMode=0`, `secureboot: Secure boot enabled`, `Kernel is locked down from EFI Secure Boot mode`) with FIDO2 LUKS2 unlock (`crypt` -> LVM `lvm-{usr_a,usr_b,yubios--root}` -> 3-way `/usr` OverlayFS) and `systemd-homed` BTRFS home mount (`/var/home/yubios`).

This milestone retires **`B-OWNER-KEYS`** ([OMN-171](https://linear.app/omni-agent/issue/OMN-171)) and **`B-REAL-FIDO2`** ([OMN-141](https://linear.app/omni-agent/issue/OMN-141)), closes **[OMN-47](https://linear.app/omni-agent/issue/OMN-47)** (`Prove signed UKI boot and measurement behavior on the target board`) and **[OMN-58](https://linear.app/omni-agent/issue/OMN-58)** (`Validate the combined ROCK 5B/RockPro64 image on sacrificial hardware`), promotes **ADR-018** ([OMN-126](https://linear.app/omni-agent/issue/OMN-126)), **ADR-019** ([OMN-127](https://linear.app/omni-agent/issue/OMN-127)), and **ADR-020** ([OMN-128](https://linear.app/omni-agent/issue/OMN-128)) to **Accepted**, and establishes **ADR-034** ([OMN-191](https://linear.app/omni-agent/issue/OMN-191)) for automatic YubiKey UKI re-signing and the on-device composefs OCI image repository (`/var/lib/yubiOS/oci`).

---

## 2. Evidence from `fvf11-4f6f49f9.new` and `fvf12-948afc8e.new`

| Subsystem / Gate | Log Anchor (`fvf11-4f6f49f9.new` / `fvf12-948afc8e.new`) | Verified Outcome |
|---|---|---|
| **TF-A BL31 + OP-TEE 4.11 (`fTPM` + `StandaloneMM`) + U-Boot UEFI** | `fvf11` L103-L108, L2892-L2900; `fvf12` L98-L106, L2712-L2720 | `BL31: v2.15.0(release):yubiOS-ac450f98c1db`, `U-Boot 2027.01-rc2-gc03e3e65990b`, `YUBIOS_TPM_OK`, `EFI v2.11 by Das U-Boot` |
| **OP-TEE TZDRAM + SHMEM `/reserved-memory` (`optee@30000000`)** | `fvf11` L119, L2914; `fvf12` L120, L2736, L7258 | `OF: reserved mem: 0x0000000030000000..0x00000000323fffff (36864 KiB) nomap non-reusable optee@30000000` — zero `Asynchronous SError Interrupt` panics during `systemd-homework` |
| **ROCK 5B `&sdhci` (`fe2e0000.mmc`) pinctrl fix** | `fvf11` L978-L984; `fvf12` L913-L925 | `sdhci-dwcmshc fe2e0000.mmc: allocated mmc-pwrseq`, `mmc0: CQHCI version 5.10`, `mmc0: SDHCI controller on fe2e0000.mmc [fe2e0000.mmc] using ADMA` (zero `-EINVAL` pin conflicts) |
| **`authselect-apply-changes.service` masked** | `fvf11` L1145 | `Unit /etc/systemd/system/authselect-apply-changes.service is masked, ignoring.` — `/etc/pam.d/{system-auth,password-auth}` preserved as regular files with `pam_systemd_home.so` and `pam_u2f.so` |
| **Step 1/5: Secure Boot PIV Slot `9a` (`B-OWNER-KEYS`, `OMN-171`)** | `fvf11` L1843-L2067 | Generated self-signed `PK`, `KEK`, `db` on YubiKey PIV slot `9a` (`pkcs11:id=%01;type=private`), wrote `PK`/`KEK`/`db` via `efi-updatevar` through OP-TEE StandaloneMM (`SetupMode: 1 -> 0`), re-signed `systemd-bootaa64.efi`, `BOOTAA64.EFI`, and `bootc_composefs-e28bd60d1a8c….efi` via `systemd-sbsign` + `sbverify` |
| **Step 2/5: LUKS2 FIDO2 + LVM + 3-Way `/usr` OverlayFS** | `fvf11` L2075-L2189; `fvf12` L4190-L4215 | `/dev/mmcblk1p3` (`110.6G`) formatted LUKS2 (`crypt`), enrolled FIDO2 `hmac-secret` (slot 1) + recovery key (slot 2), created LVM VG `lvm` (`usr_a` `1.1G`, `usr_b` `1.1G`, `yubios-root` `106.1G`), mounted 3-way `/usr` OverlayFS and `/var/home` |
| **Step 3/5: `systemd-homed` LUKS2 FIDO2 (`B-REAL-FIDO2`)** | `fvf11` L2191-L2231; `fvf12` L4415-L4529 | Created `/var/home/yubios.home` (`103.6G` BTRFS on `/dev/lvm/yubios-root`) and unlocked/mounted `/dev/mapper/home-yubios` at `/var/home/yubios` on login |
| **Step 4/5: OpenSSH `ed25519-sk` Resident Key (`B-REAL-FIDO2`)** | `fvf11` L2233-L2273 | Generated resident `ed25519-sk` key (`ssh:yubiOS`, `verify-required`) on YubiKey and installed public keystub into `authorized_keys` |
| **Step 5/5: PAM U2F (`B-REAL-FIDO2`)** | `fvf11` L2275-L2305 | Registered YubiKey U2F credential via `pamu2fcfg` into `/etc/yubico/u2f_keys` for `yubios` and `root` |
| **Enforcing UEFI Secure Boot Reboot (`OMN-47`, `OMN-58`)** | `fvf11` L2908-L2909; `fvf12` L114-L115, L2730-L2731, L7252-L7253 | `secureboot: Secure boot enabled`, `Kernel is locked down from EFI Secure Boot mode`, `integrity: Loading X.509 certificate: UEFI:db` (`YUBIOS db: 26397b6d544f0671e7764758f74263a2a1c64385`) |

---

## 3. Kernel/Package Update Gap Surfaced in `fvf12-948afc8e.new` & ADR-034 Solution

In `fvf12-948afc8e.new` (L4552-L6675), running `dnf` upgraded `kernel-*` from `7.3.3-300.fc45.aarch64` to `7.3.4-300.fc45.aarch64` inside the writable `/usr` OverlayFS (`lvm-usr_a`):
1. `/usr/lib/kernel/install.d/05-rpmostree.install` failed with `error: rpm-ostree kernel-install: Adding kernel: Running dracut: Invalid cross-device link (os error 18)` because `rpm-ostree kernel-install` attempts to `rename()` the generated initramfs from `/tmp` (`tmpfs`) across a mount boundary into `/usr/lib/modules/<kver>/initramfs.img` (`overlayfs`).
2. Neither `dnf`/`rpm` nor `rpm-ostree`/`bootc` had a post-update hook to assemble a new Type2 UKI (`ukify` / `bootc container ukify`), sign it with the attached YubiKey PIV slot `9a` `db` key (`systemd-sbsign`), commit it into a local composefs OCI image repository (`/var/lib/yubiOS/oci`), and deploy it to the ESP.

### ADR-034 Architecture Shipped
- **`/usr/lib/kernel/install.d/05-rpmostree.install` (and `/etc/kernel/install.d/05-rpmostree.install`):** Generates `/usr/lib/modules/<kver>/initramfs.img` via `dracut --no-hostonly --force --kver "<kver>"` into a same-filesystem temporary file `/usr/lib/modules/<kver>/.initramfs.img.tmp.$$` and atomically `mv`s it in place, eliminating `EXDEV` (`os error 18`), then triggers `uki-sync-and-sign.sh`.
- **`/usr/lib/kernel/install.d/95-yubios-uki-resign.install` + `/usr/lib/rpm/macros.d/macros.yubios-uki` + `yubiOS-uki-resign.{path,service}`:** Hooks both `dnf`/`rpm` and `rpm-ostree`/`bootc` kernel/module updates to run `/usr/lib/yubiOS/uki/uki-sync-and-sign.sh`.
- **`/usr/lib/yubiOS/uki/uki-sync-and-sign.sh` (`/usr/bin/yubiOS-uki-sync`) & `/var/lib/yubiOS/oci`:**
  - Assembles the Type2 UKI (`bootc container ukify` or `ukify build`) embedding the composefs digest (`composefs=<digest>`) and yubiOS kargs.
  - Re-signs the UKI and ESP loaders with the attached YubiKey PIV slot `9a` `db` key (`systemd-sbsign` + `sbverify --cert db.crt`).
  - Commits the signed UKI into a standard OCI Image Layout v1.0.0 repository at `/var/lib/yubiOS/oci` (`index.json` tags `yubios-local:latest`, `yubios-local:<kver>`, `yubios-uki:<composefs_digest>`, `containers.bootc="1"`, `ostree.bootable="true"`).
  - Deploys `/EFI/Linux/bootc/bootc_composefs-<composefs_digest>.efi` and updates `/loader/entries/bootc_yubios-<version>-1.conf` on the ESP, both on every kernel/package update and at the end of initial `yubiOS-enroll` (`enroll-sb.sh`).
