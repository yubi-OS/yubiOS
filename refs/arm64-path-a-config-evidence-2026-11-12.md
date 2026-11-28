# ARM64 Path A Config Evidence: TF-A, OP-TEE, StandaloneMM/RPMB, U-Boot (2026-11-12)

**Scope:** Exact build-time configuration of the yubiOS ARM64 firmware stack across the four `ci_firmware-rk.yml` targets (`pinetab2-rk3566`, `rock5b-rk3588`, `rockpro64-rk3399`, `qemu-arm64`), read from source at pinned commits. Closes the evidence-recording half of `docs/TODO.md` line 145 ("Record exact TF-A, OP-TEE, StandaloneMM/RPMB, and U-Boot config evidence for Path A, including `CFG_RPMB_FS`, `CONFIG_EFI_MM_COMM_TEE`, and `CONFIG_SUPPORT_EMMC_RPMB`"). Hardware RPMB proof itself stays open (OMN-36, OMN-46, OMN-47, OMN-58).

**Framing (ADR-019, amended 2026-11-12):** Technical Preview ships Path B (measured + attested). Path A (fuse-enforcing, RPMB-locked variables, persistent fTPM NV) stays the production gate. Nothing below claims Path A is achieved on any board; this file records what the build does today and what must change for Path A.

**Sources (all read 2026-11-12/13 via the GitHub API):**

| Source | Ref |
|---|---|
| `yubi-OS/yubiOS` `.github/workflows/ci_firmware-rk.yml`, `PINNED.md`, `docs/ADR.md`, `docs/TODO.md` | `main` @ `d81d4635b8136ae81b3594e413fc283a572720e4` |
| `yubi-OS/optee_os` `core/arch/arm/plat-rockchip/conf.mk`, `mk/config.mk`, `core/arch/arm/arm.mk`, `core/arch/arm/plat-vexpress/conf.mk`, `core/kernel/otp_stubs.c`, `plat-rockchip/platform_rk3588.c`, `platform_rk3568.c` | `b619831e8a89645b43ff7c7459265019292de50b` |
| `yubi-OS/u-boot` `configs/{rock5b-rk3588,rockpro64-rk3399,pinetab2-rk3566,qemu_arm64}_defconfig`, `lib/efi_loader/Kconfig`, `arch/arm/mach-rockchip/Kconfig` | `5c7fe6ca3b1a13458e426c7d66cd461d0d76fe83` |
| `yubi-OS/optee_ftpm` `platform/NVMem.c`, `sub.mk` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` |
| Last green firmware run with all four boards | [run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234) (`success`, head `3d46182203d1`, 2026-11-05) |

---

## TL;DR

1. **`CFG_RPMB_FS=y CFG_REE_FS=n` is already passed in every lane** (all four boards, both OP-TEE builds, `ci_firmware-rk.yml` L690 and L740). The Path B / Path A split lives in two yubiOS fork flags: `CFG_STMM_VOLATILE_STORAGE=y` (OP-TEE, L691/L741) and `CFG_FTPM_VOLATILE_NV=y` (fTPM TA, L714). Both make the secure world skip RPMB entirely and keep state in RAM. Path A means dropping both flags, nothing more on the OP-TEE side, plus a one-time controlled RPMB key program.
2. **`CONFIG_EFI_MM_COMM_TEE=y` is set for all four boards** via the `yubios_ftpm.config` fragment (L631-646) merged onto each defconfig. `CONFIG_EFI_VARIABLES_PRESEED` is structurally blocked by Kconfig (`depends on !EFI_MM_COMM_TEE`, `lib/efi_loader/Kconfig` L234), which is why PR #317 had to revert PR #315.
3. **`CONFIG_SUPPORT_EMMC_RPMB=y` is present on `rock5b-rk3588` (L63) and `pinetab2-rk3566` (L62) and absent on `rockpro64-rk3399`.** RockPro64 cannot exercise U-Boot `mmc rpmb` until the fragment or defconfig adds it.
4. **`CONFIG_EFI_SECURE_BOOT` is set nowhere.** It `depends on EFI_LOADER && FIT_SIGNATURE` (Kconfig L53-55); the Rockchip defconfigs carry only `CONFIG_SPL_FIT_SIGNATURE=y`, and the fragment adds neither symbol. Owner `db` enforcement in U-Boot needs `CONFIG_FIT_SIGNATURE=y` + `CONFIG_EFI_SECURE_BOOT=y` added.
5. **TF-A `SPD=opteed` and non-secure DDR registration apply to RK3588 only** (L817-820, L733-735). RK3399 and RK3568 BL31 builds get no SPD, and their OP-TEE builds get no `CFG_DRAM_BASE`/`CFG_NSEC_DDR_*`, which is the exact pair of defects PRs #312 and #313 fixed on ROCK 5B. Expect the same `uid mismatch` / no-`DYNAMIC_SHM` symptoms on PineTab2 and RockPro64 hardware.
6. **RPMB key root differs per SoC.** RK3588 derives a TRNG HUK and writes it to secure OTP on first request (`platform_rk3588.c`); RK3568 reads a HUK from secure OTP; RK3399 has no platform override, so OP-TEE's weak stub returns an **all-zero HUK** (`core/kernel/otp_stubs.c` L22-24). An RPMB key derived from a zero HUK is a known constant. RockPro64 cannot be a Path A RPMB board until a real HUK provider lands.
7. **TF-A Trusted Board Boot runs in the QEMU lane only** (`TRUSTED_BOARD_BOOT=1 GENERATE_COT=1 CREATE_KEYS=1`, L805), with throwaway keys from `CREATE_KEYS=1` and no `ROT_KEY` passed. Rockchip boots go BootROM → TPL → SPL (FIT) → BL31/BL32/BL33, so TF-A BL1/BL2 TBB does not sit on that path; the Rockchip Path A equivalent is BootROM secure boot with an OTP key hash plus SPL FIT signature verification.

---

## 1. Component & Fork Pin Table

| Component | yubi-OS fork | Upstream release | Upstream SHA | Pinned SHA (CI) | yubiOS delta at pin | Where pinned |
|---|---|---|---|---|---|---|
| TF-A (BL31; BL1/BL2 + FIP on QEMU) | `yubi-OS/arm-trusted-firmware` | `v2.15.0` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | none (release ref) | `PINNED.md` L62; `ci_firmware-rk.yml` L80 `TFA_REF` |
| mbed TLS (TF-A TBB, QEMU lane) | upstream `Mbed-TLS/mbedtls` | `mbedtls-3.6.7` | `068ff080b369adfac81509f9b57b2afabaf82dc5` | same | none; 4.x held (TF-A v2.15.0 requires major 3) | `PINNED.md` L90-91; L88 `MBEDTLS_REF` |
| EDK2 StandaloneMM (`BL32_AP_MM.fd`) | `yubi-OS/edk2` | `edk2-stable202602` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | same | HOLD at 202602 (202608 moves `ArmBaseLib`) | `PINNED.md` L64; L84 `EDK2_REF` |
| EDK2-platforms (`PlatformStandaloneMmRpmb.dsc`) | `yubi-OS/edk2-platforms` | `20260316-before-platform-removals` | `cc384840c440415a091623a7658112fedc416094` | same | none | `PINNED.md` L65; L85, L124 `ACTIVE_PLATFORM` |
| OP-TEE OS (BL32) | `yubi-OS/optee_os` | `4.11.0` | `f54190f22611dd5ad5d22546fd4209aa100f56bd` | `b619831e8a89645b43ff7c7459265019292de50b` | 4 commits ahead: `0a949c7fb1` `CFG_STMM_VOLATILE_STORAGE`; `8ae22c9282` rk3568/rk3566 flavor (OP-TEE PR #7791); `b619831e8a` rk3568 otp.h/sgrf.h bridge; `d01c2215aa` fork CI | `PINNED.md` L69; L81 `OPTEE_OS_REF` |
| fTPM TA (`optee_ftpm`, UUID `bc50d971-d4c9-42c4-82cb-343fb7f37896`) | `yubi-OS/optee_ftpm` | `4.11.0` | `f09f4cdad21028289d4e8fc573893b75f7228dc7` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` | 3 commits ahead: `eccc5d3a72` `CFG_FTPM_VOLATILE_NV`; `b78d47800c` define gate fix; `6e4c90f7f0` fork CI | `PINNED.md` L68; L82, L87 |
| ms-tpm-20-ref | `yubi-OS/ms-tpm-20-ref` | `v1.83r1` | `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` | same | none | `PINNED.md` L67; L86 `MS_TPM_REF` |
| U-Boot (TPL/SPL/BL33 UEFI) | `yubi-OS/u-boot` | `v2026.10` | `5508406582f6f7120dce0c4b3059819a41788db2` | `5c7fe6ca3b1a13458e426c7d66cd461d0d76fe83` | upstream `main` + PineTab2 CI + Golikov 18-patch RK3568/RK3566 open TPL (PR #1) | `PINNED.md` L70; L83 `UBOOT_REF` |
| U-Boot ROCK 5B OP-TEE DT node | in-repo patch `firmware/u-boot/0001-rock5b-add-optee-firmware-node.patch` | n/a | n/a | sha256 `40711776d4f03f3e7b030602a2b66fd02c4f375a0ae6bc86a28d713f21ef5bc0` | applied with `git am` on `rock5b-rk3588` only (PRs #311, #314) | L852-870 |
| rkbin DDR/TPL (RK3588 only) | upstream `rockchip-linux/rkbin` | n/a | `3e288fe814e059dd06833495f845cab04ac20a5c` | same; file `bin/rk35/rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.24.bin`, sha256 `2853a0da7ab895af43d50615af73eccf0694115dd0202483ee1c93c9071a42c3` | proprietary blob, checksum fail-closed (PR #310) | `PINNED.md` L137; L840-850 |

Every fork fetch in `ci_firmware-rk.yml` asserts `test "$(git -C <repo> rev-parse HEAD)" = "$<REF>"` after a depth-1 fetch, so a moved branch cannot change what builds.

---

## 2. Per-Stage Config Matrix

Matrix values from `ci_firmware-rk.yml` L326-482 (Stage 2 build) and L1265-1301 (Stage 4 publish):

| Board | `uboot_defconfig` | `optee_platform` / `optee_flavor` | `tfa_plat` | `requires_rockchip_tpl` | ADR-029 role |
|---|---|---|---|---|---|
| `pinetab2-rk3566` | `pinetab2-rk3566_defconfig` | `rockchip` / `rk3568` | `rk3568` | `false` | blob-free target board |
| `rock5b-rk3588` | `rock5b-rk3588_defconfig` | `rockchip` / `rk3588` | `rk3588` | `true` | furthest hardware bring-up, closed DDR blob |
| `rockpro64-rk3399` | `rockpro64-rk3399_defconfig` | `rockchip` / `rk3399` | `rk3399` | `false` | open-source regression baseline |
| `qemu-arm64` | `qemu_arm64_defconfig` | `vexpress-qemu_armv8a` / `''` | `qemu` | `false` | CI baseline, TBB exercised |

### Stage 1: DRAM / TPL initialization

| Board | DRAM init source | Exact evidence |
|---|---|---|
| `pinetab2-rk3566` | Open-source U-Boot TPL, LPDDR4, `1056 MHz` cap | Defconfig sets `CONFIG_ROCKCHIP_RK3568=y` (L9), `CONFIG_RAM_ROCKCHIP_LPDDR4=y` (L103), `CONFIG_SPL_RAM=y` (L80), no `ROCKCHIP_EXTERNAL_TPL`. TPL comes from `arch/arm/mach-rockchip/Kconfig` `ROCKCHIP_RK3568`: `imply TPL if !ROCKCHIP_EXTERNAL_TPL`, `imply TPL_RAM`. Driver `drivers/ram/rockchip/sdram_rk3568.c` plus `sdram-rk3568-lpddr4-detect-1056.inc` from u-boot PR #1 (`5c7fe6ca3b`), Golikov series `20260517-rk3568-raminit-v1`, patch 18/18 caps RK3566 at 1056 MHz. Reproducible twice in run `42124835234`. |
| `rockpro64-rk3399` | Open-source U-Boot TPL (`sdram_rk3399.c`) | Defconfig `CONFIG_ROCKCHIP_RK3399=y` (L12), `CONFIG_TPL=y` (L30), `CONFIG_RAM_ROCKCHIP_LPDDR4=y` (L71). |
| `rock5b-rk3588` | Proprietary `rkbin` blob as `ROCKCHIP_TPL` | `ROCKCHIP_RK3588` Kconfig `imply ROCKCHIP_EXTERNAL_TPL`. CI fetches `rkbin@3e288fe8` file above, `sha256sum --check --strict`, exports `ROCKCHIP_TPL` (L840-850). Without it the build writes `rk-tpl-required.txt` and exits 0 with no image (L888-899); with it the log is grepped fail-closed for `missing external blobs|faked external blobs|non-functional` (L903). |
| `qemu-arm64` | n/a (QEMU `virt` RAM) | TF-A BL1 is the entry; no TPL. |

CI echoes the resulting `.config` lines to `u-boot-config-summary.txt` (L883-884): `CONFIG_ROCKCHIP_RK(3399|3568|3588)=y`, `CONFIG_ROCKCHIP_EXTERNAL_TPL=y`, `CONFIG_TPL=y`, `CONFIG_RAM_ROCKCHIP_LPDDR4=y`, `CONFIG_SPL_ATF=y`, `CONFIG_TPM2_FTPM_TEE=y`. That artifact is the post-`olddefconfig` ground truth per run.

### Stage 2: TF-A (BL31)

Common args (L775-781): `PLAT=$TFA_PLAT ARCH=aarch64`, reproducible `BUILD_MESSAGE_TIMESTAMP`/`BUILD_STRING`. RK3399 adds `LD=ld.bfd` and patches the M0 Makefile `-O3` → `-Os` (L771-775, L782-789).

| Board | Make target | `SPD` | BL32 handoff | TBB / CoT | Evidence |
|---|---|---|---|---|---|
| `qemu-arm64` | `all fip` | `opteed` | `BL32=tee-header_v2.bin BL32_EXTRA1=tee-pager_v2.bin BL32_EXTRA2=tee-pageable_v2.bin BL32_RAM_LOCATION=tdram`, `BL33=u-boot.bin` | `TRUSTED_BOARD_BOOT=1 GENERATE_COT=1 CREATE_KEYS=1 MBEDTLS_DIR=… DEBUG=1`; no `ROT_KEY`, so keys are generated per build | L792-810; FIP checked for BL32 + BL33 entries (L830-838) |
| `rock5b-rk3588` | `bl31` | `opteed` | SPL (FIT) loads BL31 `bl31.elf` and BL32 `tee.elf` via binman `BL31=… TEE=…` (L887) | none on this path | L817-826 (PR #312, fixed `uid mismatch`) |
| `rockpro64-rk3399` | `bl31` | **none** (`spd_args=()`) | same binman `TEE=` handoff | none | L817-826 |
| `pinetab2-rk3566` | `bl31` | **none** | same | none | L817-826 |

**ADR-019 reading.** "TBB flags live in the QEMU lane" holds: `ci_firmware-rk.yml` builds TBB there, and ADR-019 cites `ci_test-vm.yml` for boot. Those keys are ephemeral `CREATE_KEYS=1` output and prove the CoT code path, never an owner root. On Rockchip, the boot ROM hands to TPL/SPL, so a Path A board needs: owner ROTPK hash in Rockchip OTP (OP-TEE rk3588 has `CFG_RK_SECURE_BOOT ?= y` with `CFG_RK_SECURE_BOOT_SIMULATION ?= y`, `plat-rockchip/conf.mk` L200-204, so nothing is burned today), a signed idbloader, and `SPL_FIT_SIGNATURE` verifying BL31/BL32/BL33. ROTPK provisioning stays deferred (OMN-45).

**Open defect for RK3399/RK3568 bring-up:** with no `SPD=opteed`, BL31 has no OP-TEE dispatcher, the same condition that produced the ROCK 5B `uid mismatch` before PR #312. Fix: extend L818 to `rk3399|rk3568`.

### Stage 3: OP-TEE (BL32) + Early TAs (StandaloneMM + fTPM)

Two OP-TEE invocations per lane: `ta_dev_kit` (L670-698) then the full BL32 rebuild (L723-757). The fTPM TA build sits between (L700-721).

**Flags passed by CI (identical across all four boards unless noted):**

| Flag | Value passed | Upstream default (`mk/config.mk` @ `b619831e8a`) | Effect | Line |
|---|---|---|---|---|
| `PLATFORM` / `PLATFORM_FLAVOR` | `rockchip`/`rk3568\|rk3588\|rk3399`; `vexpress-qemu_armv8a` | n/a | platform select | L682-686, L729-732 |
| `CFG_RPMB_FS` | `y` | `n` (L170) | RPMB secure-storage FS compiled in | L690, L740 |
| `CFG_REE_FS` | `n` | `y` (L161) | no `/data/tee` REE FS fallback; RPMB is the only `TEE_STORAGE_PRIVATE` | L690, L740 |
| `CFG_REE_FS_INTEGRITY_RPMB` | not passed | `$(CFG_RPMB_FS)` → `y` (L174) | inert with `CFG_REE_FS=n` | n/a |
| `CFG_RPMB_FS_DEV_ID` | not passed | `0` (L180) | tee-supplicant opens `/dev/mmcblk0rpmb` | n/a |
| `CFG_RPMB_WRITE_KEY` | not passed | `n` (L232) | OP-TEE never programs the RPMB key | n/a |
| `CFG_RPMB_WRITE_KEY_CID` | not passed | `""` (L238) | n/a while `WRITE_KEY=n` | n/a |
| `CFG_RPMB_TESTKEY` | not passed | `n` (L222) | key derives from platform HUK | n/a |
| `CFG_RPMB_RESET_FAT` | not passed | `n` (L219) | FAT preserved across boots | n/a |
| `CFG_RPMB_ANNOUNCE_PROBE_CAP` | not passed | `y` (L246) | kernel may use in-kernel RPMB routing instead of tee-supplicant | n/a |
| `CFG_STMM_VOLATILE_STORAGE` | `y` | fork flag, off unless set | **StMM `EFI_VARS` lives in a 256 KiB RAM buffer; RPMB never touched** (`core/arch/arm/kernel/stmm_sp.c`, commit `0a949c7fb1`) | L691, L741 |
| `CFG_STMM_PATH` | `$STMM_FD` (`BL32_AP_MM.fd`) | empty | forces `CFG_WITH_STMM_SP=y` (L946-947) | L746 |
| `CFG_STMM_FFA_VERSION` | not passed | `12` (L943) | forces `CFG_EFILIB=y` | n/a |
| `CFG_STMM_HEAP_PAGE_COUNT` | not passed | `402` (L962) | upstream comment: Secure Boot builds (AuthVariableLib + VarCheckPolicyLib) typically need about 800 | n/a |
| `CFG_EARLY_TA` / `EARLY_TA_PATHS` | `y` / `$FTPM_TA` | `n` (L444) | fTPM folded into BL32 as an Early TA | L690, L743 |
| `CFG_IN_TREE_EARLY_TAS` | rk3568 conf.mk adds `trusted_keys/f04a0fe7-…` | n/a | rk3566/rk3568 only | conf.mk L222 |
| `CFG_CORE_DYN_SHM` | `y` | `y` (L784) | needs NS DDR registered to be advertised | L744 |
| `CFG_CORE_HEAP_SIZE` / `CFG_TEE_RAM_VA_SIZE` | `524288` / `0x00400000` | platform | StMM needs this headroom | L692, L742 |
| `CFG_TEE_CORE_LOG_LEVEL` / `CFG_TEE_TA_LOG_LEVEL` | `3` / `3` | platform | debug logs on | L693, L745 |
| `CFG_DRAM_BASE` / `CFG_DRAM_SIZE` / `CFG_NSEC_DDR_1_BASE` / `CFG_NSEC_DDR_1_SIZE` | `0x40000000` / `0xb0000000` / `0x100000000` / `0x2fc000000` | unset | non-secure DDR registration so `DYNAMIC_SHM` is advertised | L733-735, **rk3588 only** (PR #313) |
| `CFG_SCTLR_ALIGNMENT_CHECK` | not passed | `n` (`core/arch/arm/arm.mk` L116) | alignment checks off on all lanes | n/a |
| `CFG_SECURE_TIME_SOURCE_CNTPCT` | not passed | forced `y` by platform | `plat-rockchip/conf.mk` L4 (all Rockchip flavors); `plat-vexpress/conf.mk` L47 | n/a |

**fTPM TA build** (L713-718): `CFG_FTPM_VOLATILE_NV=y TA_DEV_KIT_DIR=… CFG_MS_TPM_20_REF=$ms-tpm-20-ref CROSS_COMPILE_ta_arm64=aarch64-linux-gnu- CFG_ARM64_ta_arm64=y`. With `CFG_FTPM_VOLATILE_NV=y`, `_plat__NvInitFromStorage()` manufactures fresh RAM-only state each boot and `_plat__NvWriteBack()` drops writes (`platform/NVMem.c`, commit `eccc5d3a72`), and `TA_FLAGS` uses `TA_FLAG_DEVICE_ENUM` instead of `TA_FLAG_DEVICE_ENUM_TEE_STORAGE_PRIVATE`.

**Per-platform OP-TEE facts (`plat-rockchip/conf.mk` @ `b619831e8a`):**

| Flavor | Cores | TZDRAM / SHMEM | HUK source (RPMB key root) | Other |
|---|---|---|---|---|
| `rk3588` (L192-215) | 8, GICv3, `CFG_AUTO_MAX_PA_BITS`, `CFG_CRYPTO_WITH_CE`, `CFG_ROCKCHIP_OTP=y` | `0x30000000`+32 MiB / `0x32000000`+4 MiB | `platform_rk3588.c` `tee_otp_get_hw_unique_key()`: reads HUK from OTP; if absent, generates from TRNG and **writes it to secure OTP** (`persist_huk()` → `rockchip_otp_write_secure()`), an irreversible write on first HUK request | `CFG_RK_SECURE_BOOT=y`, `CFG_RK_SECURE_BOOT_SIMULATION=y` |
| `rk3568` (L217-232, used for rk3566) | 4, GICv3 | same | `platform_rk3568.c` L179: reads HUK from secure OTP, treats all-zero as absent | early console on UART2 1.5 Mbaud |
| `rk3399` (L86-98) | 6, GICv3, `CFG_CRYPTO_WITH_CE` | same | **no override**: `core/kernel/otp_stubs.c` weak stub `memset`s the HUK to zero | longest mainline history |
| `vexpress-qemu_armv8a` | QEMU | platform defaults | stub | CI baseline |

#### Path B (current CI) vs Path A (hardware eMMC RPMB)

| Setting | Path B / CI today (all 4 lanes) | Path A hardware RPMB target |
|---|---|---|
| `CFG_RPMB_FS` | `y` | `y` |
| `CFG_REE_FS` | `n` | `n` |
| `CFG_STMM_VOLATILE_STORAGE` | `y` (EFI vars in RAM) | **removed** (StMM `FFA_SVC_RPMB_READ/WRITE` → `TEE_STORAGE_PRIVATE_RPMB`) |
| `CFG_FTPM_VOLATILE_NV` (fTPM TA) | `y` (NV in RAM, manufactured per boot) | **removed** (NV persisted through TEE storage → RPMB) |
| `CFG_RPMB_FS_DEV_ID` | `0` (default, unused) | index of the eMMC under Linux; confirm per board (`/dev/mmcblkNrpmb`) |
| `CFG_RPMB_WRITE_KEY` | `n` | `y` only in a one-off provisioning build on a controlled bench, with `CFG_RPMB_WRITE_KEY_CID` pinned to the target eMMC CID; the shipped build stays `n` (upstream warning, `mk/config.mk` L224-232) |
| `CFG_RPMB_TESTKEY` | `n` | `n` |
| HUK | unused in practice | real per-device secret: RK3588 OTP (decide before first boot of a non-volatile build, since it burns OTP), RK3568 OTP, RK3399 **blocked** (zero HUK) |
| `CFG_STMM_HEAP_PAGE_COUNT` | `402` | raise toward `800` if StMM init exhausts heap once AuthVariableLib handles owner PK/KEK/db |
| `CFG_TEE_*_LOG_LEVEL` | `3` | lower for production |
| NS DDR registration | rk3588 only | all Rockchip flavors |

### Stage 4: U-Boot UEFI (BL33)

Every board runs `make <defconfig>` → `merge_config.sh -m … yubios_ftpm.config` → `make olddefconfig` (L654-656 QEMU, L880-882 Rockchip). Fragment content (L631-646), verbatim:

```
CONFIG_TEE=y
CONFIG_OPTEE=y
CONFIG_TPM=y
CONFIG_TPM_V2=y
CONFIG_TPM2_FTPM_TEE=y
CONFIG_EFI_LOADER=y
CONFIG_EFI_MM_COMM_TEE=y
CONFIG_EFI_TCG2_PROTOCOL=y
CONFIG_HASH=y
CONFIG_MEASURED_BOOT=y
CONFIG_CMD_TPM=y
CONFIG_BOOTDELAY=1
CONFIG_BOOTCOMMAND="tpm2 init && tpm2 startup TPM2_SU_CLEAR && tpm2 self_test full && echo YUBIOS_TPM_OK; bootefi bootmgr"
# CONFIG_UNIT_TEST is not set
```

| Symbol | `pinetab2-rk3566` | `rock5b-rk3588` | `rockpro64-rk3399` | `qemu-arm64` | Source |
|---|---|---|---|---|---|
| `CONFIG_OPTEE` / `CONFIG_TEE` | y | y | y | y | fragment |
| `CONFIG_TPM2_FTPM_TEE` | y | y | y | y (alongside defconfig `CONFIG_TPM2_MMIO=y`, L73) | fragment |
| `CONFIG_EFI_MM_COMM_TEE` | y | y | y | y | fragment; Kconfig L146-148 `depends on OPTEE` |
| `CONFIG_EFI_TCG2_PROTOCOL`, `CONFIG_MEASURED_BOOT` | y | y | y | y | fragment |
| `CONFIG_SUPPORT_EMMC_RPMB` | **y** (defconfig L62) | **y** (defconfig L63) | **absent** | absent (no eMMC) | defconfigs |
| `CONFIG_MMC_HS200_SUPPORT` | implied (`ROCKCHIP_RK3568`: `imply MMC_HS200_SUPPORT if MMC_SDHCI_ROCKCHIP`; defconfig sets `MMC_SDHCI_ROCKCHIP=y`) | implied (same rule under `ROCKCHIP_RK3588`) | not set in defconfig | n/a | `mach-rockchip/Kconfig` |
| `CONFIG_CMD_MMC` | y | y | y | n/a | defconfigs |
| `CONFIG_CMD_EFIDEBUG` | not set | not set | not set | y (L37) | defconfigs |
| `CONFIG_FIT_SIGNATURE` | not set (`SPL_FIT_SIGNATURE=y` L23) | not set (`SPL_FIT_SIGNATURE=y` L23) | not set | not set | defconfigs |
| `CONFIG_EFI_SECURE_BOOT` | **not reachable** | **not reachable** | **not reachable** | **not reachable** | Kconfig L53-55 `depends on EFI_LOADER && FIT_SIGNATURE` |
| `CONFIG_EFI_VARIABLES_PRESEED` | blocked | blocked | blocked | blocked | Kconfig L231-234 `depends on !EFI_MM_COMM_TEE` |
| `CONFIG_SPL_ATF` | y (L35) | y (L34) | `SPL_ATF_NO_PLATFORM_PARAM=y` (L29) | n/a | defconfigs |
| OP-TEE DT node | not patched | `0001-rock5b-add-optee-firmware-node.patch` | not patched | QEMU DT | L852-870 |

**Why `CONFIG_EFI_VARIABLES_PRESEED` must stay unset (PR #315 → PR #317).** PR #315 (merged 2026-10-12 00:25Z) embedded an `efi.var` seed and `CONFIG_EFI_VARIABLE_NO_STORE`/`PRESEED` defconfig lines in the Rockchip builds. PR #317 (merged 03:25Z the same day) reverted it for two stated reasons: the seed carried 0mniteck's keys instead of owner keys, and `NO_STORE` conflicts with the StMM variable store (ADR-020). Kconfig makes the conflict mechanical: `EFI_MM_COMM_TEE` and `EFI_VARIABLE_NO_STORE` are members of the same `choice` (L114-171), and `EFI_VARIABLES_PRESEED` carries `depends on !EFI_MM_COMM_TEE` (L234). A preseeded PK/KEK/db also locks those variables against change (Kconfig help L236-239), which defeats owner enrollment through the yubiOS enroll flow (`B-OWNER-KEYS`, SIGN.md). Owner keys enter at provisioning, through StMM, into RPMB.

**Open items for Path A in U-Boot:**
1. Add `CONFIG_SUPPORT_EMMC_RPMB=y` to the fragment (covers RockPro64 with an eMMC module).
2. Add `CONFIG_FIT_SIGNATURE=y` and `CONFIG_EFI_SECURE_BOOT=y` to the fragment, then confirm both survive `olddefconfig` in `u-boot-config-summary.txt` (extend the L883 grep).
3. Add `CONFIG_CMD_EFIDEBUG=y` to the fragment so `efidebug` works on hardware.
4. Port the OP-TEE DT node (`linaro,optee-tz`) to PineTab2 and RockPro64 U-Boot DTs if their upstream DTs lack it (PR #311 failure mode: `err=-19` on TEE probe).

---

## 3. Hardware RPMB & Path A Promotion Checklist

Run per board. Record each output (with board serial, eMMC CID, firmware sha256 and `yubios_commit`) in a dated `refs/` file before any Path A claim, per ADR-019.

### 3.0 Build prerequisites (CI change, separate PR)

- [ ] Hardware lane variant drops `CFG_STMM_VOLATILE_STORAGE=y` and `CFG_FTPM_VOLATILE_NV=y`; QEMU lane keeps both.
- [ ] `SPD=opteed` for `rk3399` and `rk3568` (L818).
- [ ] NS DDR registration for `rk3399` and `rk3568` (per-board RAM size).
- [ ] Fragment adds `CONFIG_SUPPORT_EMMC_RPMB=y`, `CONFIG_FIT_SIGNATURE=y`, `CONFIG_EFI_SECURE_BOOT=y`, `CONFIG_CMD_EFIDEBUG=y`.
- [ ] RK3399 HUK provider (or drop RockPro64 from Path A RPMB scope).
- [ ] RK3588 OTP HUK write accepted as an owner decision before the first non-volatile boot (or confirm it already fired on the 2026-10-11 ROCK 5B boot by reading OTP state).

### 3.1 U-Boot console (eMMC visible, RPMB reachable)

```
=> mmc list
=> mmc dev 0                 # eMMC index on the board
=> mmc info                  # expect "RPMB size" and HS200 bus mode on rk3566/rk3588
=> mmc rpmb counter          # needs CONFIG_SUPPORT_EMMC_RPMB; fails before key programming
=> tpm2 init && tpm2 startup TPM2_SU_CLEAR && tpm2 self_test full   # YUBIOS_TPM_OK path
=> efidebug query            # needs CONFIG_CMD_EFIDEBUG
=> printenv -e -n PK         # empty before owner enrollment
```

### 3.2 Linux (eMMC RPMB, tee-supplicant routing)

```
ls -l /dev/mmcblk*rpmb /dev/tee0 /dev/teepriv0
cat /sys/class/mmc_host/mmc*/mmc*:*/cid          # pin into CFG_RPMB_WRITE_KEY_CID for provisioning
mmc rpmb read-counter /dev/mmcblk0rpmb             # mmc-utils; "key not programmed" before provisioning
systemctl status tee-supplicant                    # or: tee-supplicant -d
journalctl -b | grep -Ei 'optee|rpmb|tee-supplicant'
dmesg | grep -Ei 'optee|rpmb'                       # in-kernel routing when CFG_RPMB_ANNOUNCE_PROBE_CAP=y
```

Pass condition: OP-TEE log shows RPMB FS init (FAT created on first boot, found on later boots), and `read-counter` increments across a write.

### 3.3 RPMB key programming (one-off, controlled bench)

- [ ] Boot a provisioning build with `CFG_RPMB_WRITE_KEY=y CFG_RPMB_WRITE_KEY_CID='"<CID>"'`.
- [ ] Confirm `mmc rpmb read-counter` now returns a counter.
- [ ] Re-flash the production build (`CFG_RPMB_WRITE_KEY=n`) and confirm RPMB FS still opens (key re-derived from HUK).
- [ ] Record: this step is irreversible on the eMMC part.

### 3.4 UEFI variables persist in RPMB (StMM)

```
efi-readvar                                  # efitools; PK/KEK/db/dbx
efivar -l | grep -Ei 'PK|KEK|db'
mokutil --sb-state
# enroll owner PK/KEK/db through the yubiOS enroll flow (PIV 9a chain, ADR-002), then:
reboot
efi-readvar -v db                            # owner cert still present after power cycle
```

Pass condition: variables survive a full power cycle, and a direct eMMC user-area wipe does not remove them.

### 3.5 fTPM NV persistence

```
tpm2_getcap properties-fixed | grep -i manufacturer
tpm2_pcrread sha256:0,1,2,3,4,5,6,7
tpm2_nvdefine 0x1500016 -C o -s 32 -a "ownerread|ownerwrite"
echo -n yubios-rpmb-probe | tpm2_nvwrite 0x1500016 -C o -i -
reboot
tpm2_nvread 0x1500016 -C o -s 17             # expect yubios-rpmb-probe
tpm2_nvundefine 0x1500016 -C o
```

Pass condition: the NV index survives reboot, which the current `CFG_FTPM_VOLATILE_NV=y` build cannot do by design.

### 3.6 Secure Boot enforcement

- [ ] Signed UKI under owner `db` boots.
- [ ] Unsigned or wrongly signed UKI is rejected by U-Boot (`CONFIG_EFI_SECURE_BOOT=y` required).
- [ ] `tpm2_pcrread sha256:7` changes when `db` changes.

### 3.7 Root of trust (deferred, OMN-45)

- [ ] Sacrificial board: owner key hash burned to Rockchip OTP, `CFG_RK_SECURE_BOOT_SIMULATION=n` on RK3588.
- [ ] BootROM rejects an unsigned idbloader.
- [ ] SPL rejects an unsigned FIT (`SPL_FIT_SIGNATURE`).

---

## 4. Status by board (2026-11-12)

| Board | Builds in CI | On hardware | Path A RPMB readiness |
|---|---|---|---|
| `rock5b-rk3588` | yes, with rkbin | OP-TEE + fTPM init, `YUBIOS_TPM_OK` (2026-10-11); SD written on `rock1` 2026-10-21 | U-Boot RPMB on; SPD + NS DDR fixed; needs volatile flags dropped and OTP HUK decision |
| `pinetab2-rk3566` | yes, blob-free, 2x reproducible | UART/USB-boot validation pending | U-Boot RPMB on; needs SPD, NS DDR, DT node check, volatile flags dropped |
| `rockpro64-rk3399` | yes, blob-free | bring-up pending | blocked: zero HUK, no U-Boot RPMB, no SPD, no NS DDR |
| `qemu-arm64` | yes, TBB exercised | n/a | no eMMC; stays on volatile flags by design |

## Related

- `docs/ADR.md` ADR-018, ADR-019 (amended 2026-11-12), ADR-020, ADR-029
- `refs/technical-preview-entry-criteria-2026-11-12.md`
- `refs/arm64-rk-board-status-2026-07-17.md`
- `refs/rk3588-ddr-tpl-source-2026-07-29.md`
- `refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md`
- PRs #310, #311, #312, #313, #314, #315, #317; `yubi-OS/u-boot` PR #1
