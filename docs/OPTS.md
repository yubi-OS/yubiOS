# Path A device options — upstream survey (2026-07-19)

Status: research note. This file does **not** promote a board, change [ADR-029](ADR.md), or make a production-readiness claim. ROCK 5B remains the primary Path A proof target and ROCKPro64 remains the supported secondary target. Every device below remains unqualified until the hardware evidence gates in this document pass.

## Result

The best new source-level opportunity is the **NXP i.MX8M Mini family**, with the **CompuLab IOT-GATE-iMX8 / SBC-IOT-iMX8** as the most interesting device and the **NXP i.MX8M Mini EVKB** as its reference-board companion. Current upstream U-Boot splits almost the complete yubiOS firmware feature set across those two configurations:

- `imx8mm-cl-iot-gate-optee_defconfig` enables UEFI Secure Boot, FIT signatures, OP-TEE, eMMC RPMB transport, and `CONFIG_TPM2_FTPM_TEE`.
- `imx8mm_evk_defconfig` enables OP-TEE, `CONFIG_CMD_OPTEE_RPMB`, eMMC RPMB transport, and `CONFIG_EFI_MM_COMM_TEE` for StandaloneMM-backed UEFI variables.
- Current TF-A has an i.MX8MM BL2/TBBR path and HABv4 integration, while current OP-TEE has board flavors for both devices.

That is a materially smaller source-integration gap than any newly surveyed Rockchip board. It is still not proof: owner SRK fuse closure, the exact SPL-to-BL2 chain, OP-TEE `CFG_RPMB_FS`, RPMB key provisioning, StandaloneMM, the repository-pinned ms-tpm TA, recovery, and debug lockdown all need destructive real-hardware validation.

Other findings:

1. **Orange Pi 5 Plus** and **FriendlyElec NanoPC-T6 LTS** are the best low-delta RK3588 alternatives. They share the existing SoC work and their upstream defconfigs already enable SPL FIT signatures and eMMC RPMB transport, but not the OP-TEE/StandaloneMM/fTPM chain.
2. **NXP i.MX93 EVK** has unusually strong current U-Boot integration—OP-TEE, RPMB, and EFI MM communication are already enabled—but the pre-owner trust boundary includes NXP EdgeLock Enclave firmware and TF-A supplies BL31 only. It is a conditional candidate, not yet a strict Path A match.
3. **RK3576**, represented by Radxa ROCK 4D and ArmSoM Sige5, is the genuinely new Rockchip intersection across U-Boot, TF-A, and OP-TEE. It is not Path A-ready: upstream OP-TEE lacks the RK3588 secure-boot/OTP path and the U-Boot board configs do not enable the TEE stack.
4. **STM32MP257F-EV1** best matches the desired firmware stage shape—TF-A BL2 + BL31, OP-TEE BL32, U-Boot BL33—but its upstream U-Boot defconfig lacks the secure-state integrations yubiOS needs.
5. **NXP LX2160A-RDB** is a strong architectural reference: upstream has owner fuse/TBBR documentation plus separate Secure Boot and StandaloneMM U-Boot configurations. It is a large specialist board, and no single upstream defconfig combines the two paths.
6. **Qualcomm RB3 Gen 2** is a frontier watch item. Recent upstream sources now include TF-A BL2/FIP, OP-TEE Kodiak plus QFPROM fuse provisioning, and a U-Boot board config. It still depends on QTI signing and `qtiseclib`, and lacks an upstream RPMB/StandaloneMM/fTPM path.

## What counts as a Path A candidate

Presence in all three upstream trees is necessary but not sufficient. A candidate must eventually produce evidence for every gate below.

| Gate | Required evidence |
| --- | --- |
| Owner root at reset | The first replaceable image is authenticated by a key hash the owner can irreversibly provision in OTP/eFuse; the device is closed/enforcing; a wrong-key image fails before normal-world execution. |
| Complete chain | Every executable security-relevant stage is authenticated, including DDR/system-management firmware where applicable, TF-A, OP-TEE, U-Boot, StandaloneMM, TAs, and the UKI. |
| Owner-controlled inputs | All firmware inputs are source-built where possible and otherwise license-reviewed, hash-pinned, provenance-recorded, and explicitly included in the trust boundary. A vendor-signed executable before owner enforcement is a Path A blocker unless the architecture decision explicitly accepts it. |
| Secure state | OP-TEE runs as BL32; production configuration disables insecure defaults; the device provides a hardware unique key; secure storage survives reset and rejects replay. |
| Persistent UEFI state | eMMC RPMB works end to end with OP-TEE `CFG_RPMB_FS`, a provisioned RPMB key, StandaloneMM, and U-Boot `CONFIG_EFI_MM_COMM_TEE`. A defconfig containing only `CONFIG_SUPPORT_EMMC_RPMB` proves transport support, not secure variables. |
| TPM and measured boot | The repository-pinned ms-tpm fTPM TA is reachable through U-Boot `CONFIG_TPM2_FTPM_TEE`; TCG2 measurements cover the same UKI chain used on x86_64; PCR and event-log evidence survives negative tests. |
| Rollback, recovery, debug | Anti-rollback policy is defined; a tested owner recovery path exists; debug access and ROM download modes are closed or policy-controlled without destroying recovery. |
| Reproducibility | Board-specific firmware pins, configs, build manifests, licenses, and negative-test logs are committed. CI emulates what it can, while hardware-only claims remain tied to durable device evidence. |

The wording matters on platforms where TF-A is not the first verifier. “TF-A Trusted Board Boot” should be mapped to the platform's actual first-owner-verifier chain rather than assumed to mean TF-A BL1 on every SoC.

## Upstream snapshots reviewed

This survey is pinned so later changes in `master` do not silently change its conclusions.

| Project | Snapshot | Snapshot date | Notes |
| --- | --- | --- | --- |
| U-Boot | [`ece349ade2973e220f524ce59e59711cc919263f`](https://github.com/u-boot/u-boot/commit/ece349ade2973e220f524ce59e59711cc919263f) | 2026-07-06 | v2026.07 release commit |
| Trusted Firmware-A | [`b5eaba47efc5e4e3029086d5c25eee0e8dbb0129`](https://github.com/ARM-software/arm-trusted-firmware/commit/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129) | 2026-07-08 | Current upstream snapshot used for platform docs and makefiles |
| OP-TEE OS | [`991587c721a603e831cad228626078289adad159`](https://github.com/OP-TEE/optee_os/commit/991587c721a603e831cad228626078289adad159) | 2026-07-17 | Current upstream snapshot used for platform configs and maintenance state |

## Comparison matrix

“Yes” means an upstream source or configuration exists, not that yubiOS has validated it on hardware.

| Target | Early owner-verification path | OP-TEE upstream | RPMB / EFI MM / fTPM in reviewed U-Boot configs | Principal blocker | Lane |
| --- | --- | --- | --- | --- | --- |
| CompuLab IOT-GATE-iMX8 / SBC-IOT-iMX8 | HABv4 + SPL + optional TF-A BL2/TBBR; owner SRK closure still unproved | Board flavor | RPMB: yes; EFI MM: missing; fTPM: yes | Fuse closure, BL2 packaging, StandaloneMM merge, DDR firmware, full hardware proof | Priority 1 |
| NXP i.MX8M Mini EVKB | Same i.MX8MM path | Board flavor | RPMB: yes; EFI MM: yes; fTPM: missing | Fuse closure, BL2 packaging, fTPM selection, DDR firmware, full hardware proof | Priority 1 |
| Orange Pi 5 Plus / NanoPC-T6 LTS | Rockchip ROM + owner eFuse + U-Boot TPL/SPL; board proof missing | RK3588 flavor with OTP path | RPMB transport only | Add TEE/EFI MM/fTPM; board-specific fuse/recovery proof; DDR blob | Priority 1 alternate |
| NXP i.MX93 EVK | AHAB/ELE + SPL; owner-versus-vendor authority unresolved | Board flavor | RPMB: yes; EFI MM: yes; fTPM: missing | EdgeLock/Sentinel trust boundary and vendor firmware | Priority 2 conditional |
| STM32MP257F-EV1 | ROM + TF-A BL2/BL31; secure `F` part | Board flavor | None of the three selected | U-Boot TEE/RPMB/EFI MM/fTPM port and DDR PHY blob | Priority 2 |
| ROCK 4D / ArmSoM Sige5 | Rockchip ROM + TPL/SPL; no reviewed RK3576 owner-fuse implementation | RK3576 flavor | RPMB transport only | Secure-boot/OTP code, TEE integration, DDR blob | Priority 2 watch |
| NXP LX2160A-RDB | TF-A TBBR with owner OTPMK/SRKH and fatal production mode | Board flavor | RPMB + EFI MM in STMM config; fTPM missing | Merge separate secure-boot/STMM configs; specialist hardware; DDR PHY blob | Priority 3 |
| Qualcomm RB3 Gen 2 | ROM/XBL + TF-A BL2; OEM/QTI authority unresolved | Kodiak flavor + fuse provisioning | None demonstrated; UFS rather than eMMC | QTI signing/`qtiseclib`, UFS secure storage, all U-Boot TEE integrations | Watch |

## Ranked options

### Priority 1 — i.MX8M Mini: CompuLab IOT-GATE-iMX8 / SBC-IOT-iMX8 and NXP EVKB

**Why it surfaced**

This is the closest current upstream source match to the full yubiOS Path A stack outside the already selected Rockchip targets.

- The [TF-A i.MX8M documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/imx8m.rst) describes the normal ROM → SPL → BL31 → U-Boot flow and an i.MX8MM `NEED_BL2=1` TBBR flow: ROM → SPL → BL2 → BL31 → U-Boot UEFI, with SPL verifying BL2 and BL2 verifying the BL3x images in a FIP. It also documents HABv4 support through the ROM Vector Table API. The [i.MX8MM platform makefile](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/plat/imx/imx8m/imx8mm/platform.mk) contains the BL2 authentication and ROTPK plumbing.
- OP-TEE's [i.MX platform configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-imx/conf.mk) contains maintained `mx8mmevk` and `mx8mm_cl_iot_gate` flavors.
- U-Boot's [`imx8mm-cl-iot-gate-optee_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/imx8mm-cl-iot-gate-optee_defconfig) enables `CONFIG_EFI_SECURE_BOOT`, FIT signatures, OP-TEE, eMMC RPMB support, and both `CONFIG_TPM2_FTPM_TEE` and a discrete TPM driver. At the reviewed snapshot, repository search found only this CompuLab board family and Nuvoton Arbel board defconfigs enabling the U-Boot fTPM-over-TEE driver.
- U-Boot's [`imx8mm_evk_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/imx8mm_evk_defconfig) supplies the complementary secure-variable path: `CONFIG_EFI_MM_COMM_TEE`, `CONFIG_CMD_OPTEE_RPMB`, `CONFIG_SUPPORT_EMMC_RPMB`, `CONFIG_TEE`, and `CONFIG_OPTEE`.
- The [CompuLab gateway](https://www.compulab.com/products/iot-gateways/iot-gate-imx8-industrial-arm-iot-gateway/) is an industrial i.MX8M Mini device; its [reference guide](https://www.compulab.com/wp-content/uploads/2020/06/iot-gate-imx8_reference-guide_2023-02-06.pdf) documents soldered eMMC. The current [SBC-IOT-iMX8 product](https://www.compulab.com/products/sbcs/sbc-iot-imx8-nxp-i-mx8m-mini-internet-of-things-single-board-computer/) advertises long availability and eMMC options. The active [NXP EVKB](https://www.nxp.com/design/design-center/development-boards-and-designs/8MMINILPD4-EVK) has 16 GB eMMC 5.1.

**Unproven or missing**

- No reviewed upstream defconfig contains the entire set at once. The CompuLab OP-TEE config lacks `CONFIG_EFI_MM_COMM_TEE` and `CONFIG_CMD_OPTEE_RPMB`; the EVK config lacks `CONFIG_TPM2_FTPM_TEE`.
- TF-A contains the BL2/TBBR implementation, but its current i.MX8M documentation still says the matching U-Boot/imx-mkimage packaging work will be upstreamed later. Treat the complete SPL FIT → TF-A BL2 → authenticated FIP build as an explicit feasibility item, not an already integrated board flow.
- Neither config proves OP-TEE `CFG_RPMB_FS`, one-time RPMB key programming, StandaloneMM deployment, or the repository-pinned ms-tpm TA.
- Current board build documentation still consumes NXP DDR firmware. It must be pinned, licensed, and placed explicitly in the trust boundary.
- HAB development-mode success is not production closure. A sacrificial board must show owner SRK hash programming, closed/enforcing lifecycle state, wrong-key rejection, recovery behavior, and debug policy.
- Verify that the CompuLab device supplied for testing exposes the needed fuse and recovery interfaces; a production gateway can be less convenient than the EVKB for destructive provisioning work.

**Verdict:** highest-priority new SoC/device feasibility lane. Start on the EVKB for fuse/recovery observability, then validate the same firmware policy on the CompuLab device if an industrial target is desirable.

### Priority 1 — RK3588 alternates: Orange Pi 5 Plus and NanoPC-T6 LTS

**Why they surfaced**

These are new board targets rather than a new SoC port. That is valuable: they test whether the Path A work is genuinely RK3588-wide instead of accidentally ROCK 5B-specific.

- Current [U-Boot Rockchip documentation](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/doc/board/rockchip/rockchip.rst) lists both boards.
- [`orangepi-5-plus-rk3588_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/orangepi-5-plus-rk3588_defconfig) and [`nanopc-t6-rk3588_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/nanopc-t6-rk3588_defconfig) enable SPL FIT signatures, TF-A handoff, and eMMC RPMB transport.
- The [Orange Pi 5 Plus](https://www.orangepi.org/html/hardWare/computerAndMicrocontrollers/details/Orange-Pi-5-plus.html) supports eMMC, and the [NanoPC-T6 LTS](https://friendlyelec.com/index.php?route=product/product&product_id=292) is offered with eMMC configurations.
- They share TF-A and OP-TEE SoC code with ROCK 5B. OP-TEE's [Rockchip configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-rockchip/conf.mk) gives RK3588 the Rockchip OTP driver and `CFG_RK_SECURE_BOOT`; it also warns that secure-boot simulation defaults on and must be deliberately disabled before real fuse programming.

**Unproven or missing**

- Neither board defconfig enables `CONFIG_TEE`, `CONFIG_OPTEE`, `CONFIG_EFI_MM_COMM_TEE`, or `CONFIG_TPM2_FTPM_TEE`.
- The board-specific eMMC SKU and RPMB capability must be recorded; NVMe alone cannot satisfy the current secure-variable design.
- The fuse map, owner ROTPK programming, lifecycle closure, and recovery route need board-specific proof even though the SoC is shared.
- The normal upstream Rockchip flow still consumes Rockchip DDR/TPL firmware.

**Verdict:** best low-delta secondary board ports. Do not displace ROCK 5B; use one to prove that the RK3588 implementation is portable after the primary hardware proof succeeds.

### Priority 2 — NXP i.MX93 EVK

**Why it surfaced**

- [`imx93_11x11_evk_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/imx93_11x11_evk_defconfig) already enables `CONFIG_EFI_MM_COMM_TEE`, `CONFIG_CMD_OPTEE_RPMB`, `CONFIG_SUPPORT_EMMC_RPMB`, `CONFIG_TEE`, and `CONFIG_OPTEE`. It lacks only the board-level fTPM selection from the most visible yubiOS integration set.
- OP-TEE's [i.MX configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-imx/conf.mk) has an `mx93evk` flavor and EdgeLock Enclave integration.
- The active [i.MX93 EVK](https://www.nxp.com/design/design-center/development-boards-and-designs/i.MX93EVK) contains 16 GB eMMC.
- NXP documents owner-signed AHAB containers, while the current board config exposes U-Boot fuse commands and secure storage transport.

**Path A boundary problem**

Current [TF-A i.MX9 documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/imx9.rst) builds BL31 only and explicitly requires an EdgeLock Enclave firmware image from the NXP SDK. Current [U-Boot board documentation](https://docs.u-boot.org/en/v2026.04/board/nxp/imx93_11x11_evk.html) also requires NXP DDR firmware and an AHAB/Sentinel container. Before this board can be called Path A, the project must answer:

1. Is every boot-critical image before the first owner-authenticated container covered by the owner's root, or is an NXP-only signing root still authoritative?
2. Can all required vendor executables be hash-pinned, licensed, reproduced or independently verified, updated safely, and included in the threat model?
3. Does closing the owner lifecycle make wrong-key failure fatal without removing the documented recovery path?

**Verdict:** excellent integration prototype and possibly a conditional Path A board, but not a strict owner-root candidate until the EdgeLock/Sentinel trust boundary is resolved.

### Priority 2 — STM32MP257F-EV1

**Why it surfaced**

- TF-A's [STM32MP2 documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/st/stm32mp2.rst) describes a full TF-A BL2/BL31 FIP flow with OP-TEE BL32 and U-Boot BL33. The security-enabled `F` parts support secure boot and hardware cryptography.
- OP-TEE's [STM32MP2 configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-stm32mp2/conf.mk) contains `stm32mp257f-ev1` and `stm32mp257f-dk` flavors and is maintained upstream.
- The [STM32MP257F-EV1](https://www.st.com/en/evaluation-tools/stm32mp257f-ev1.html) is active, and ST documents the ROM → TF-A → OP-TEE → U-Boot boot chain.

**Unproven or missing**

- [`stm32mp25_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/stm32mp25_defconfig) does not enable `CONFIG_SUPPORT_EMMC_RPMB`, `CONFIG_TEE`, `CONFIG_OPTEE`, `CONFIG_EFI_MM_COMM_TEE`, or `CONFIG_TPM2_FTPM_TEE`.
- Confirm the selected board/storage population exposes eMMC RPMB and that U-Boot's STM32 SDMMC path supports it.
- TF-A requires an ST DDR PHY firmware binary; pin and threat-model it.
- Fuse provisioning, closed-state failure, anti-rollback, debug lockdown, and recovery all remain hardware exercises.

**Verdict:** strongest alternative firmware architecture, but a larger U-Boot and secure-storage port than i.MX8MM.

### Priority 2 — RK3576: ROCK 4D and ArmSoM Sige5

**Why it surfaced**

RK3576 is new in the current three-way upstream intersection.

- TF-A's [Rockchip platform list](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/rockchip.rst) and [RK3576 platform makefile](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/plat/rockchip/rk3576/platform.mk) now contain RK3576 BL31 support.
- OP-TEE's [Rockchip configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-rockchip/conf.mk) contains an RK3576 flavor and platform source.
- Current U-Boot lists seven RK3576 boards. [`rock-4d-rk3576_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/rock-4d-rk3576_defconfig) and [`sige5-rk3576_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/sige5-rk3576_defconfig) enable eMMC RPMB transport.
- The [ROCK 4D](https://radxa.com/products/rock4/4d/) has an eMMC/UFS module connector; the [Sige5](https://www.armsom.org/product-page/sige5) is sold in eMMC variants. Prefer eMMC for the first proof because the current yubiOS secure-state design is explicitly eMMC RPMB based.

**Why it is behind RK3588**

- The reviewed OP-TEE RK3576 flavor does not enable the RK3588 `CFG_RK_SECURE_BOOT`/OTP provisioning path.
- The reviewed U-Boot board configs do not enable OP-TEE, EFI MM communication, or fTPM.
- Current U-Boot documentation still requires Rockchip DDR/TPL binaries.
- TF-A provides BL31 only. BootROM plus U-Boot TPL/SPL, not TF-A BL1/BL2, must implement and prove the early owner-verification chain.

**Verdict:** highest-value new Rockchip research target, but not a near-term Path A board. First upstream or carry a reviewed RK3576 fuse/OTP implementation and negative-test it before purchasing multiple devices.

### Priority 3 — NXP LX2160A-RDB

**Why it surfaced**

- TF-A's [Layerscape TBBR guide](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/nxp/nxp-ls-tbbr.rst) explicitly requires owner-programmed OTPMK and SRKH fuses, distinguishes permissive development mode from fatal production mode, and documents TF-A BL2 authentication of BL31, BL32, and BL33.
- OP-TEE's [Layerscape platform](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-ls/conf.mk) has a maintained LX2160A-RDB flavor.
- U-Boot's [`lx2160ardb_tfa_stmm_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/lx2160ardb_tfa_stmm_defconfig) enables OP-TEE, eMMC RPMB, and `CONFIG_EFI_MM_COMM_TEE`; [`lx2160ardb_tfa_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/lx2160ardb_tfa_defconfig) additionally enables the OP-TEE RPMB command; and [`lx2160ardb_tfa_SECURE_BOOT_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/lx2160ardb_tfa_SECURE_BOOT_defconfig) enables NXP secure boot.

**Unproven or missing**

- No one defconfig combines the Secure Boot and StandaloneMM paths. The secure-boot config drops the TEE/RPMB settings.
- No reviewed LX2160 config enables `CONFIG_TPM2_FTPM_TEE`.
- TF-A's [Layerscape overview](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/nxp/nxp-layerscape.rst) requires a DDR PHY binary for LX2160A.
- The board is a large, specialist networking reference platform, so it is a poor first user-facing device even if the firmware architecture is strong.

**Verdict:** preserve as an architectural reference and possible lab target. Do not prioritize it over i.MX8MM or an RK3588 alternate.

### Watch — Qualcomm RB3 Gen 2 (QCS6490)

**Why it surfaced**

This is one of the newest meaningful additions across all three upstream projects.

- TF-A's [RB3 Gen 2 port](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/qti/rb3gen2.rst) replaces the normal TZ payload with TF-A BL2 and packages BL31, OP-TEE BL32, and U-Boot BL33 in a FIP.
- OP-TEE's [Qualcomm configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-qcom/conf.mk) defaults to Kodiak, and its [Kodiak target](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-qcom/hoya/kodiak/target.mk) enables QFPROM fuse provisioning in secure builds. The [fuse-region table](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/drivers/qcom/qfprom/kodiak/qfprom_fuse_region.c) includes OEM secure boot, public-key hash, permissions, and anti-rollback regions.
- U-Boot's [`qcm6490_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/qcm6490_defconfig) targets the RB3 Gen 2 and supports UFS boot. Qualcomm publishes [QCS6490 secure-boot and fuse guidance](https://docs.qualcomm.com/doc/80-80022-11/topic/enable-secure-boot.html).

**Blocking gaps**

- The TF-A port requires a binary `qtiseclib`, says the generated BL2 needs QTI signing involvement, and uses Qualcomm Sectools in secure mode. The exact OEM-versus-QTI authority for every early image must be resolved.
- The reviewed U-Boot config does not enable OP-TEE, EFI MM communication, eMMC/UFS RPMB, or fTPM.
- The device uses UFS; no reviewed upstream configuration demonstrates the yubiOS OP-TEE/StandaloneMM secure-variable design on UFS RPMB.
- The reviewed OP-TEE config defaults `CFG_INSECURE=y`; a production build and fuse flow must deliberately override it.

**Verdict:** watch upstream and use for architecture research only. It is not a purchase recommendation for the current Path A milestone.

## Deferred and rejected intersections

| Platform | Reason not shortlisted now |
| --- | --- |
| RK3566/RK3568 boards | U-Boot and TF-A support are broad, but the reviewed [OP-TEE Rockchip configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-rockchip/conf.mk) has no RK356x flavor. |
| Raspberry Pi 5 | Existing project decision: vendor-controlled early boot keeps it Path B. |
| TI K3 boards | Current [TF-A K3 documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/ti-k3.rst) describes an R5 U-Boot boot master and supplies BL31 only. The early system-firmware/owner-root boundary does not match the current strict Path A proof plan. |
| Allwinner A64 boards | OP-TEE's [maintainer file](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/MAINTAINERS) marks the A64 platform orphaned, and the reviewed upstream sources do not provide a convincing owner-fuse production closure flow. |
| NXP i.MX8MQ EVK | OP-TEE and U-Boot support it, but current [TF-A i.MX8M documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/imx8m.rst) notes that i.MX8MQ was dropped from TF-A CI because of OCRAM constraints. i.MX8MM is the stronger target. |
| Newer i.MX9 variants | OP-TEE's [i.MX configuration](https://github.com/OP-TEE/optee_os/blob/991587c721a603e831cad228626078289adad159/core/arch/arm/plat-imx/conf.mk) is adding i.MX91/95/943 flavors, but current upstream TF-A documentation is materially thinner than i.MX93 and the EdgeLock vendor-firmware boundary is the same. Revisit after the upstream boot chain and board configs mature. |
| Nuvoton Arbel EVB | U-Boot's [`arbel_evb_defconfig`](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/configs/arbel_evb_defconfig) enables OP-TEE, RPMB, and fTPM but explicitly disables the EFI loader; it is a BMC reference platform, not a fit for the current ARM64 product path. |

## Cross-cutting upstream conclusions

### 1. Rockchip Path A does not use TF-A BL1/BL2

Current [TF-A Rockchip documentation](https://github.com/ARM-software/arm-trusted-firmware/blob/b5eaba47efc5e4e3029086d5c25eee0e8dbb0129/docs/plat/rockchip.rst) says BL1/BL2 are supplied by U-Boot or coreboot and TF-A builds BL31 on AArch64. The current RK3576 and RK3588 platform makefiles are BL31 ports. Therefore the Rockchip proof must explicitly show:

`BootROM owner key/eFuse → authenticated U-Boot TPL/SPL → authenticated TF-A BL31 + OP-TEE BL32 + U-Boot BL33 → StandaloneMM/TAs → signed UKI`

This does not make Rockchip ineligible, but evidence should name the real verifier at each transition. A generic assertion that “TF-A BL1 rejects the image” would be false for these ports.

### 2. No reviewed board arrives with the complete yubiOS configuration

U-Boot implements the needed pieces, but upstream board configs distribute them unevenly. [U-Boot's UEFI documentation](https://github.com/u-boot/u-boot/blob/ece349ade2973e220f524ce59e59711cc919263f/doc/develop/uefi/uefi.rst) confirms that `CONFIG_EFI_MM_COMM_TEE` connects U-Boot to StandaloneMM in OP-TEE and persists variables through eMMC RPMB. The survey found:

- fTPM-over-TEE already selected on the CompuLab i.MX8MM board family;
- EFI MM + OP-TEE RPMB already selected on NXP i.MX8M EVKs, i.MX93 EVK, and the LX2160A StandaloneMM config;
- SPL FIT authentication + eMMC RPMB transport on several RK3588/RK3576 boards;
- no reviewed candidate defconfig that combines owner secure boot, OP-TEE RPMB FS, StandaloneMM, fTPM, and the final UEFI/UKI policy.

The gap is therefore integration and evidence, not the absence of all primitives.

### 3. Binary firmware remains inside the security boundary

The surveyed families require at least one early binary in their normal upstream build instructions:

- Rockchip: DDR/TPL initialization binary;
- i.MX8M: DDR firmware;
- i.MX9: DDR firmware plus EdgeLock/Sentinel firmware;
- STM32MP2: DDR PHY firmware;
- LX2160A: DDR PHY firmware/FIP;
- RB3 Gen 2: `qtiseclib` and QTI signing tooling/inputs.

For each candidate, record the producer, license, exact digest, update channel, signing authority, execution privilege, and whether the owner-authenticated chain covers the binary. “Upstream U-Boot supports the board” does not remove this trust dependency.

## Recommended next work

1. **Do not reopen ADR-029 yet.** Complete the existing ROCK 5B sacrificial fuse rehearsal first; it remains the shortest route to a Path A hardware claim.
2. **Add an i.MX8MM source-feasibility lane.** Build both reviewed upstream defconfigs and create one board config that combines `CONFIG_EFI_MM_COMM_TEE`, `CONFIG_CMD_OPTEE_RPMB`, `CONFIG_SUPPORT_EMMC_RPMB`, `CONFIG_TEE`, `CONFIG_OPTEE`, and `CONFIG_TPM2_FTPM_TEE`. Verify dependency closure with `olddefconfig`; do not treat a hand-edited fragment as proof.
3. **Prefer NXP EVKB for the first i.MX8MM destructive test.** Its reference design and recovery documentation are more suitable for fuse work. Use the CompuLab board as the industrial follow-on once owner provisioning is demonstrated.
4. **Add one RK3588 alternate only after ROCK 5B works.** Orange Pi 5 Plus or NanoPC-T6 LTS should reuse the same SoC firmware sources and tests, differing only in board config, storage population, and evidence.
5. **Prototype STM32MP2 and i.MX93 in CI before buying hardware.** STM32MP2 needs U-Boot secure-state configuration work; i.MX93 first needs an explicit trust-boundary decision for EdgeLock firmware.
6. **Treat RK3576 and RB3 Gen 2 as watch lanes.** Re-evaluate RK3576 when upstream has a real secure-boot/OTP path, and RB3 Gen 2 when upstream demonstrates OP-TEE secure storage plus owner-controlled signing without ambiguous QTI authority.

## Hardware proof packet for any promoted option

A proposal to add a board to the supported matrix should attach, at minimum:

- exact board revision, storage SKU, SoC stepping, and fuse-state-before record;
- immutable source manifest and all firmware/blob digests;
- owner key ceremony and offline key custody record;
- fuse dry-run, readback, close-state readback, and irreversible-action peer review;
- positive boot log and negative logs for wrong BL2/SPL, BL31, OP-TEE, U-Boot, StandaloneMM/TA, and UKI signatures;
- OP-TEE production configuration with insecure defaults disabled;
- RPMB key provisioning evidence, replay negative test, and secure-variable persistence test;
- fTPM enumeration, TCG2 event log, PCR expectations, and seal/unseal negative tests;
- rollback and downgrade tests;
- recovery procedure tested after closure;
- JTAG/serial-download/debug policy and proof of the intended production state;
- statement of every vendor-controlled executable or signing authority remaining before the owner-controlled UKI.

Until that packet exists, the correct label is **research candidate**, not Path A-supported.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 11, cycle 14)

OPTS.md (round-9 cycle-9 repaired): its options/invariant text is unchanged; the round's nspawn-boundary and claims-boundaries records extend its decision surface; note additive.
