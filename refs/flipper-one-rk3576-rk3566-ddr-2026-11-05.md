# Flipper One RK3576 vs. RK3566 Open-Source DDR Initialization Research (2026-11-05)

**Author:** Shant Tchatalbachian  
**Date:** 2026-11-05  
**Scope:** Evaluation of Flipper One's RK3576 open-source boot chain effort, exact `rkbin` DDR blobs, community open-source DDR init repositories (`OpenHorse/rk3576-dram-init`, `kendun555-svg/ddr-trainer`), architectural comparison between RK3576 and RK3566/RK3568, and the direct blob-free U-Boot TPL path for yubiOS on RK3566 (PineTab2).

---

## TL;DR

1. **Flipper One still ships Rockchip's proprietary DDR binary blob in production.** In `flipperdevices/flipperone-linux-build-scripts/build-uboot.sh` (line 64) and `flipperdevices/rkbin/RKBOOT/RK3576MINIALL.ini`, Flipper One packages `bin/rk35/rk3576_ddr_lp4_2112MHz_lp5_2736MHz_v1.15.bin` (80,619 bytes, git blob SHA `0004af92b6945fff360e6220e7d2c69ce9883578`), loaded into SRAM at `0x3FF81000` alongside `rk3576_boost_v1.03.bin` (2,604 bytes at `0x3FFC0000`).
2. **Neither community open-source RK3576 DDR project works on real hardware today.**
   - **Johan Axelsson's `OpenHorse/rk3576-dram-init`** (`[RFC PATCH v1 00/14] arm: rockchip: rk3576: BLOB-free TPL DRAM init`, updated through `patches-v3` on July 3, 2026 at commit `0a5f302`) builds cleanly from TRM Part 1 & Part 2, but its timing tables (`sdram-rk3576-lpddr4*.inc`, `sdram-rk3576-lpddr5.inc`) hold uncalibrated TRM reset defaults and cannot initialize DRAM on hardware.
   - **`kendun555-svg/ddr-trainer`** (standalone C trainer claiming Capstone disassembly of `v1.09`) hardcodes **RK3588** MMIO base addresses (`0xF7000000` for DDRMC0, `0xFF010000` for CRU, `0xFF100000` SRAM load) in `rk3576_ddr.h` (lines 53-60), which immediately fault on RK3576.
3. **RK3576 and RK3566 are from different SoC generations and cannot share DDR binaries or register tables.**
   - **RK3566's true twin is the RK3568** (2021, 22nm HKMG, 4x Cortex-A55, single-channel Synopsys uMCTL2 at `0xFE100000`, DDR3/4/LP3/LP4/4X PHY at `0xFE110000`, up to 1056 MHz on RK3566 and 1560 MHz on RK3568).
   - **RK3576 is an 8nm RK3588-generation derivative** (2024, 4x Cortex-A72 + 4x Cortex-A53, dual independent channels at `0x28000000` / `0x29000000`, LPDDR4/4X/5 combo PHY at `0x2A020000` / `0x2A030000`, up to 2736 MHz LPDDR5).
4. **The porting direction runs the opposite way: RK3568/RK3566 already has a hardware-tested open U-Boot TPL driver.**
   - Eight days before the RK3576 RFC, on **May 17, 2026**, **Pavel Golikov** (`<paullo612@ya.ru>`) published `[PATCH RFC 00/18] rockchip: rk3568: add DRAM controller driver and initialize DRAM at TPL stage` (`20260517-rk3568-raminit-v1`).
   - Axelsson's RK3576 RFC was explicitly modeled on Golikov's RK3568 driver. Unlike the unvalidated RK3576 port, **Golikov's RK3568/RK3566 TPL driver is hardware-validated on 4 GB LPDDR4**, and **Patch 18/18** (`Limit maximum DDR frequency to 1056 MHz`) directly enables RK3566 support.

---

## 1. Stream 1: Flipper One Blog, Forum, and Repository Audit

### 1.1 The May 21, 2026 Announcement and Dual-SoC Architecture
On May 21, 2026, Flipper Devices published *"Flipper One, we need your help"* on `blog.flipper.net`, `forum.flipper.net`, and `docs.flipper.net/one/`, accompanied by Collabora's engineering post *"Collabora + Flipper: Opening up the RK3576"*. Flipper One is an open-hardware Linux handheld/cyberdeck combining two processors:
- **Application Processor:** Rockchip **RK3576** (4x Cortex-A72 @ 2.2 GHz + 4x Cortex-A53 @ 2.0 GHz, Mali-G52 MC3 GPU, 6 TOPS NPU, 8 GB LPDDR5).
- **System Co-processor:** Raspberry Pi **RP2350** running FreeRTOS (controls power rails, USB-C PD battery bank mode, keyboard/touchpad, and display sequencing).

Flipper Devices and Collabora committed to eliminating all proprietary boot blobs:
- **BL31 (EL3 Secure Monitor):** Replaced `rk3576_bl31_v*.elf` with mainline ARM Trusted Firmware-A (`PLAT=rk3576`, `USE_BL31=opensource` default in `build-uboot.sh`).
- **BL32 (Secure World TEE):** Replaced `rk3576_bl32_v*.bin` via community contributor Jiaxing Woo (`@gahingwoo`), who brought up OP-TEE on Radxa ROCK 4D (`Issue #57`) and merged upstream `OP-TEE/optee_os#7821` on June 16, 2026, followed by `#7841` for OTP HUK derivation and `RKRNG` TRNG support.
- **TPL / DDR Trainer (`ddr.bin`):** Identified by Flipper and Collabora as *"the one last binary blob in the boot chain."*

### 1.2 Exact DDR Binary Blob Used by Flipper One
In `flipperdevices/flipperone-linux-build-scripts` (branch `dev`) and `flipperdevices/rkbin` (branch `master`):
- **Primary blob path:** `bin/rk35/rk3576_ddr_lp4_2112MHz_lp5_2736MHz_v1.15.bin` (80,619 bytes, git blob SHA `0004af92b6945fff360e6220e7d2c69ce9883578`).
- **Companion boost stub:** `bin/rk35/rk3576_boost_v1.03.bin` (2,604 bytes, git blob SHA `0917386af17e80793b42ae92ba2ca38e6c03d6c7`).
- **Packaging config (`RKBOOT/RK3576MINIALL.ini`):** Loads `FlashBoost` at SRAM `0x3FFC0000` (`LOADER1`) and `FlashData` (`rk3576_ddr_lp4_2112MHz_lp5_2736MHz_v1.15.bin`) at SRAM `0x3FF81000` (`LOADER2`).
- **Build script (`build-uboot.sh` lines 64 & 148):**
  ```bash
  ROCKCHIP_TPL=`realpath "$RKBIN_DIR"/bin/rk35/rk3576_ddr_*.bin | tail -n1`
  local -a blobs=(BL31="$BL31" ROCKCHIP_TPL="$ROCKCHIP_TPL" TEE="$TEE")
  ```

### 1.3 Inside Issue #56 ("DDR memory init code is a blob")
Opened May 13, 2026 by Flipper firmware engineer Alexander Charkov (`@alchark`), Issue #56 remains **OPEN**:
- **Licensing barrier:** `@alchark` quoted the `rkbin/LICENSE` restriction (`you may NOT: (a) decompile, reverse-engineer, dissemble, or attempt to derive any source code from the Software`) and stated Flipper Devices would first try to convince Rockchip to open the source rather than reverse-engineer it as a company.
- **May 17, 2026 (`@zhovner`, Pavel Zhovner):** Listed two immediate tasks: documenting the RK3576 boot flow (`flipperone-docs#52`) and clarifying Rockchip's position on publishing `rkbin` from their internal Gerrit.
- **May 18, 2026 (`@alchark`):** Linked Pavel Golikov's upstream RK3566/RK3568 U-Boot RFC (`20260517-rk3568-raminit-v1`), noting: *"RK3576 uses a different version of the memory controller though, and our LPDDR5 memory is also different from what that patch series addresses, yet there must be commonalities."*
- **May 24, 2026 (`@orangecms`, `oreboot` maintainer):** Noted prior translation of RK356x DRAM init into Rust for `oreboot` (presented at MRMCD) and offered to collaborate.
- **May 25, 2026 (`@Paullo612`, Pavel Golikov):** Noted that RK3588 is architecturally closer to RK3576 than RK3568 is, because RK3588 has 4 pairs of the same controller/PHY while RK3576 has 2 pairs.
- **May 26, 2026 (`@alchark`):** Linked Johan Axelsson's newly posted RK3576 U-Boot TPL RFC (`20260525012824.121-1-johan.axelsson@proton.me`).

---

## 2. Stream 2: Prior Art & Open-Source Rockchip DRAM Init Landscape

### 2.1 Pavel Golikov's Working RK3568 / RK3566 U-Boot TPL Series (`20260517-rk3568-raminit-v1`)
On May 17, 2026, Pavel Golikov (`<paullo612@ya.ru>`) posted the 18-patch series `[PATCH RFC 00/18] rockchip: rk3568: add DRAM controller driver and initialize DRAM at TPL stage`:
- **Driver structure:** Extends `drivers/ram/rockchip/sdram_rk3568.c` under `CONFIG_TPL_BUILD` and reuses the Synopsys uMCTL2 protocol controller helpers in `drivers/ram/rockchip/sdram_pctl_px30.c`.
- **Hardware validation:** Tested and booting on real RK3568 hardware with **4 GB LPDDR4** (`rk356x-generic`). Also includes generated DDR4 timing tables across 10 frequencies (324, 396, 528, 630, 780, 920, 1056, 1184, 1332, 1560 MHz).
- **Direct RK3566 compatibility (Patch 18/18):** `rockchip: rk3568: Limit maximum DDR frequency to 1056 MHz` caps the frequency table at 1056 MHz (LPDDR4-2112), matching the RK3566 silicon limit so the same open TPL driver covers both RK3566 and RK3568.

### 2.2 Johan Axelsson's RK3576 Series (`OpenHorse/rk3576-dram-init`)
Posted May 25, 2026 (RFC v1, 14 patches; RFC v2 on May 28, 10 patches; `patches-v3` on June 24 / July 3, 2026, 4 incremental patches):
- Explicitly cites Golikov's `20260517-rk3568-raminit-v1` as its architectural template (`docs/rk3568-raminit-rfc/README.md`).
- Uses `tools/ddr-extract/` (wrapping Jonas Karlman's `ddrbin_tool.py`) to read plaintext parameter blocks (`fsp0_freq = 528 MHz`, `odt_en_freq = 800 MHz`, `per_bank_ref_en = 1`, `derate_en = 1`, PHY drive 30 ohm, PHY ODT 40 ohm) without disassembling code.
- **Why it does not boot hardware yet:** As documented in `OpenHorse/rk3576-dram-init/README.md` and `docs/rkbin-param-gap-analysis.md`, the `.inc` timing tables hold TRM reset values duplicated across all 4 FSP banks, `DDRCTL_ADDRMAP*` geometry programming is unwired, and U-Boot maintainers held the series until Golikov's RK3568 series lands.

### 2.3 Why `kendun555-svg/ddr-trainer` Cannot Be Used
`kendun555-svg/ddr-trainer` (updated September 24, 2026) claims to be an open LPDDR4X trainer disassembled from `rk3576_ddr_..._v1.09.bin`. Inspection of `rk3576_ddr.h` (lines 53-60) shows it defines:
- `DDRMC0_BASE = 0xF7000000UL`, `DDRMC1_BASE = 0xF7200000UL`
- `DDRPHY0_BASE = 0xF7400000UL`, `DDRPHY1_BASE = 0xF7600000UL`
- `CRU_BASE = 0xFF010000UL`, `PMUGRF_BASE = 0xFF080000UL`, SRAM `0xFF100000`
Those are **RK3588** addresses. On RK3576 (and on RK3566), every register access in `kendun555-svg/ddr-trainer` hits unmapped space.

---

## 3. Stream 3: Architectural Comparison (RK3566/RK3568 vs. RK3576) & yubiOS Roadmap

### 3.1 Authoritative Hardware & MMIO Comparison

| Subsystem / Attribute | RK3566 (Twin: RK3568) | RK3576 (Lineage: RK3588) | Cross-Port Verdict |
| :--- | :--- | :--- | :--- |
| **Process & CPU** | 22nm HKMG · 4x Cortex-A55 @ 1.8 GHz | 8nm FinFET · 4x A72 @ 2.2 GHz + 4x A53 @ 2.0 GHz + Cortex-M0 | Different SoC generation |
| **BootROM TPL Load** | `0xFDCC0000` (single TPL binary) | `0x3FF81000` (`ddr.bin`) + `0x3FFC0000` (`boost.bin`) | Incompatible SRAM entry & header |
| **DDR Controller (uMCTL2)** | 1 channel · `0xFE100000` (`sdram_pctl_px30.h` layout) | 2 channels · `0x28000000` (Ch0) & `0x29000000` (Ch1) | Disjoint MMIO & register offsets |
| **DDR PHY IP** | DDR3/DDR4/LPDDR3/LPDDR4/4X PHY @ `0xFE110000` | LPDDR4/4X/5 Combo PHY @ `0x2A020000` & `0x2A030000` | Incompatible PHY IP & training regs |
| **Max DDR Clock** | 1056 MHz (RK3566) / 1560 MHz (RK3568) | 2112 MHz (LPDDR4X) / 2736 MHz (LPDDR5) | Different FSP & VCO ranges |
| **Clock / DDR PLLs** | Single DPLL in `SYS_CRU` @ `0xFDD20000` | Per-channel `DDR0_CRU` (`0x27210000`) & `DDR1_CRU` (`0x27220000`) | Incompatible PLL equations |
| **DRAM Geometry Reg** | `PMU_GRF` `OS_REG2` @ `0xFDC20208` | `PMU1_GRF` `OS_REG2` @ `0x26026208` | Same bitfield encoding, different base |

### 3.2 Current yubiOS State (`yubi-OS/u-boot` & `yubi-OS/yubiOS`)
- In `yubi-OS/u-boot` (branch `artifact/spi-bin`, workflow `.github/workflows/ci_pinetab2.yml`), PineTab2 (`pinetab2-rk3566_defconfig`) already builds open-source TF-A (`PLAT=rk3568`) and open-source OP-TEE (`PLATFORM_FLAVOR=rk3568`, PR #7791) from source, and only fetches `bin/rk35/rk3566_ddr_1056MHz_v1.26.bin` (59,240 bytes, git blob SHA `a019743ffaf5a33c228c07bd7064cce1a9d5429d`) as `ROCKCHIP_TPL`.
- In `yubi-OS/yubiOS` (`.github/workflows/ci_firmware-rk.yml`), `rockpro64-rk3399` builds 100% from source (`requires_rockchip_tpl: false` via `sdram_rk3399.c`), while `rock5b-rk3588` gates on pinned `rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.24.bin`.

### 3.3 Actionable Roadmap for Blob-Free RK3566 (PineTab2) in yubiOS
1. **Import Pavel Golikov's 18-patch `20260517-rk3568-raminit-v1` series into `yubi-OS/u-boot`** on a test branch (`feat/rk3566-open-tpl`) on top of `v2026.10` (`5508406582f6f7120dce0c4b3059819a41788db2`).
2. **Switch `configs/pinetab2-rk3566_defconfig` to source-built TPL:**
   - Remove `CONFIG_ROCKCHIP_EXTERNAL_TPL=y`.
   - Enable `CONFIG_TPL=y`, `CONFIG_TPL_RAM=y`, and `CONFIG_ROCKCHIP_SDRAM_COMMON=y` with Patch 18/18's 1056 MHz cap active.
   - Drop the `ROCKCHIP_TPL="../rkbin/rk3566_ddr.bin"` argument in `.github/workflows/ci_pinetab2.yml` so `binman` packs `tpl/u-boot-tpl.bin` into `idbloader.img` and `u-boot-rockchip.bin`.
3. **Validate on PineTab2 via SD/USB boot and UART (`rock1` CH340 at 1500000 8N1):** Confirm open TPL completes LPDDR4 training at 1056 MHz, writes DRAM geometry to `0xFDC20208`, and boots SPL → TF-A BL31 → OP-TEE BL32 → U-Boot BL33 without any `rkbin` binary.

---

## 4. Sources
- Flipper Devices blog, *"Flipper One: we need your help"* (2026-05-21): https://blog.flipper.net/flipper-one-we-need-your-help/
- Collabora blog, *"Collabora + Flipper: Opening up the RK3576"* (2026-05-21): https://www.collabora.com/news-and-blog/news-and-events/collabora-flipper-opening-up-the-rk3576.html
- Flipper One RK3576 Mainlining Docs: https://docs.flipper.net/one/cpu-software/rk3576-mainlining
- Flipper One Boot Flow Docs: https://docs.flipper.net/one/hardware/rk3576/boot-flow
- `flipperdevices/flipperone-linux-build-scripts` (`build-uboot.sh` & Issue #56): https://github.com/flipperdevices/flipperone-linux-build-scripts/issues/56
- `flipperdevices/flipperone-linux-build-scripts` Issue #57 (OP-TEE for RK3576): https://github.com/flipperdevices/flipperone-linux-build-scripts/issues/57
- `flipperdevices/rkbin` (`RKBOOT/RK3576MINIALL.ini` & `bin/rk35/`): https://github.com/flipperdevices/rkbin
- Johan Axelsson / OpenHorse, `OpenHorse/rk3576-dram-init`: https://github.com/OpenHorse/rk3576-dram-init
- Johan Axelsson, `[RFC PATCH v1 00/14] arm: rockchip: rk3576: BLOB-free TPL DRAM init` (2026-05-25): https://lists.denx.de/pipermail/u-boot/2026-May/619706.html
- Pavel Golikov, `[PATCH RFC 00/18] rockchip: rk3568: add DRAM controller driver and initialize DRAM at TPL stage` (2026-05-17): https://www.mail-archive.com/u-boot@lists.denx.de/msg574495.html
- Pavel Golikov, `[PATCH RFC 18/18] rockchip: rk3568: Limit maximum DDR frequency to 1056 MHz` (2026-05-17): https://lists.denx.de/pipermail/u-boot/2026-May/618887.html
- `kendun555-svg/ddr-trainer`: https://github.com/kendun555-svg/ddr-trainer
