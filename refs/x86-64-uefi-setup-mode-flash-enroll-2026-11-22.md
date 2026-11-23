# x86_64 UEFI Setup-Mode Test, Flash, and Owner Enrollment Architecture (`2026-11-22`)

- **Status:** Implemented (`scripts/flash-device-e2e.sh`, `usr/lib/yubiOS/enroll-sb.sh`, `usr/lib/yubiOS/uki/uki-sync-and-sign.sh`, `tests/vm/test-x86_64-setup-mode-e2e-ci.sh`)
- **Related ADRs:** `ADR-002` (Secure Boot Signing via PIV/CCID), `ADR-003` (LUKS2 + FIDO2 via `systemd-cryptenroll`), `ADR-023` (ARM64 Primary, x86-64 Supported Above UKI), `ADR-024` (CHIPSEC First-Boot Firmware Validation), `ADR-034` (Local Composefs OCI Image Repository & Automatic U2F/HSM UKI Re-Signing)

---

## 1. Architectural Boundary on `x86_64`

On ARM64 boards (`rock5b-rk3588`, `rockpro64-rk3399`), yubiOS builds and flashes the firmware below the kernel (`TF-A BL31 v2.15.0` + `OP-TEE 4.11` hosting `fTPM` and `EDK2 StandaloneMM` + `U-Boot UEFI`) at sector 64 of the target medium.

On `x86_64` hardware (`FLASH_BOARD=x86_64-uefi`), the motherboard's SPI flash holds vendor UEFI firmware. yubiOS establishes owner-held root-of-trust control above the UEFI boundary on any `x86_64` machine that supports **UEFI Setup Mode (`SetupMode=1`)**:

| Layer / Stage | `aarch64` (`rock5b-rk3588` / `rockpro64-rk3399`) | `x86_64` (`x86_64-uefi` Setup Mode) |
|---|---|---|
| **Boot ROM / Firmware** | Owner-built `TF-A BL31` + `OP-TEE 4.11` + `U-Boot UEFI` at sector 64 | Vendor UEFI in `SetupMode=1` + first-boot `CHIPSEC` SPI/SMM audit (`ADR-024`) |
| **UEFI Variable Store** | `OP-TEE StandaloneMM` (`tee_stmm_efi` + `efivarfs`) | Motherboard UEFI NVRAM exposed via `efivarfs` (`SetupMode-8be4df61-...`) |
| **EFI Bootloaders on ESP (`p1`)** | `/EFI/BOOT/BOOTAA64.EFI` & `/EFI/systemd/systemd-bootaa64.efi` | `/EFI/BOOT/BOOTX64.EFI` & `/EFI/systemd/systemd-bootx64.efi` |
| **Type2 UKI (`PE32+`)** | `AA64` (`0xAA64`) signed by U2F/HSM PIV Slot `9a` | `AMD64` (`0x8664`) signed by U2F/HSM PIV Slot `9a` |
| **Initramfs Pre-Drivers (`collect_kargs`)** | `rd.driver.pre=tee,optee,tpm_ftpm_tee,rockchipdrm,...` | `rd.driver.pre=tpm_tis,tpm_crb` |
| **Local OCI Store (`ADR-034`)** | `/var/lib/yubiOS/oci` (`"architecture":"arm64"`) | `/var/lib/yubiOS/oci` (`"architecture":"amd64"`) |
| **Disk & Home Encryption** | `LUKS2` (`p3` -> LVM `usr_a`/`usr_b`/`yubios-root`) + `ext4` `systemd-homed` via FIDO2 `hmac-secret` | Identical (`LUKS2` + `ext4` `systemd-homed` via FIDO2 `hmac-secret`) |

---

## 2. End-to-End `x86_64-uefi` Flash, Enroll, and Test Flow

### 2.1 Disk / USB / NVMe Provisioning (`scripts/flash-device-e2e.sh`)

When `FLASH_BOARD=x86_64-uefi` (or `amd64-uefi`) is selected:
1. **Multi-Arch PKCS#11 Resolution:** Resolves `libykcs11.so`, `pkcs11prov.so`, and `engines-3/pkcs11.so` across `/usr/lib/x86_64-linux-gnu/`, `/usr/lib64/`, and `/usr/lib/aarch64-linux-gnu/`.
2. **No Sector-64 Rockchip SPL Write:** Skips `pull_board_firmware` and skips writing `u-boot-rockchip.bin` at sector 64, preserving clean GPT protective MBR + partition table (`p1` 512 MiB `EFI` vfat, `p2` 8 GiB `yubiOS-root` `ext4 -O verity,^has_journal`, and unallocated space for first-boot `p3` `LUKS2` + LVM).
3. **Architecture-Pinned OCI Pull & `bootc install`:** Pulls the `linux/amd64` digest of `FLASH_OS_IMAGE` (`docker.io/0mniteck/yubios:latest` or `:dev`) and installs the composefs rootfs and `x86_64` Type2 UKI onto `$SD_DEVICE`.
4. **U2F/HSM PIV Slot `9a` Signing:** Mints or exports `PK`, `KEK`, and `db` from the attached U2F/HSM PIV slot `9a` (or test key when `SIGNKEY=test`), stages `/EFI/yubiOS/keys/{PK,KEK,db}.{auth,crt,cer,esl}` + `PK_null.auth`, and signs `/EFI/BOOT/BOOTX64.EFI`, `/EFI/systemd/systemd-bootx64.efi`, and `/EFI/Linux/bootc/bootc_composefs-*.efi` (`sbverify` verified).

### 2.2 First-Boot Enrollment on the Target `x86_64` Machine (`usr/lib/yubiOS/enroll-sb.sh`)

1. The operator enters BIOS/UEFI setup on the `x86_64` machine, clears factory Secure Boot keys to enter **Setup Mode (`SetupMode=1`, `SecureBoot=0`)**, and boots from the provisioned disk with their U2F/HSM attached.
2. `yubiOS-enroll.service` launches on `tty1` + `ttyS0`/`ttyS2` and runs the 5-step ceremony:
   - **Step 1/5 (`enroll-sb.sh all`):** Verifies `SetupMode=1` in `/sys/firmware/efi/efivars/SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c`, generates self-signed `PK`, `KEK`, and `db` certificates from the owner's U2F/HSM PIV slot `9a` (`RSA-2048`), writes `db.auth` -> `KEK.auth` -> `PK.auth` via `efi-updatevar` (flipping `SetupMode: 1 -> 0`), re-signs `BOOTX64.EFI`, `systemd-bootx64.efi`, and the `x86_64` Type2 UKI via `systemd-sbsign --private-key-source provider:pkcs11`, and commits the signed UKI to `oci:/var/lib/yubiOS/oci:yubios-local:latest` (`"architecture":"amd64"`).
   - **Steps 2/5 - 5/5:** Identical to ARM64 (`enroll-luks.sh` `LUKS2` + LVM 3-way `/usr` OverlayFS, `enroll-homed.sh` `LUKS2 + ext4` `systemd-homed`, `enroll-ssh.sh` `ed25519-sk`, and `enroll-pam.sh` `pam-u2f`), plus `yubiOS-chipsec-firstboot.service` (`ADR-024`) verifying `x86_64` SPI flash write-lock (`BIOS_CNTL` / `PR0..PR4`) and SMM isolation (`SMRR`).

### 2.3 Automated CI Verification (`tests/vm/test-x86_64-setup-mode-e2e-ci.sh`)

- Wired into `.github/workflows/ci_test-vm.yml` (`lint-vm-scripts`) and `tests/unit/test-vm-scripts-unit.bats`.
- Synthesizes valid PE32+ (`0x8664` `IMAGE_FILE_MACHINE_AMD64`) EFI binaries for `BOOTX64.EFI`, `systemd-bootx64.efi`, and `bootc_composefs-<digest>.efi`, verifies positive owner PIV slot `9a` signatures and negative rejection of attacker-signed or 1-byte-tampered binaries, exercises `enroll-sb.sh all` + `uki-sync-and-sign.sh` end-to-end on an `x86_64` `SetupMode=1` ESP, and confirms `amd64` local OCI repository creation.
