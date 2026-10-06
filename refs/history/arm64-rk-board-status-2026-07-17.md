# ARM64 RK board status: 2026-07-17

Status: workflow evidence updated 2026-07-21; Path A hardware proof still required.

## Board matrix

| Board | SoC | yubiOS role | Current status |
|---|---|---|---|
| Radxa ROCK 5B | RK3588 | Primary Path A board | Run 29869527608 compiled board components but lacked the required real DDR/TPL input and combined `u-boot-rockchip.bin`. Needs that input plus sacrificial ROTPK/fuse, RPMB, fTPM NV, U-Boot UEFI, and signed-UKI proof. |
| ROCKPro64 | RK3399 | Supported secondary Path A board | Run 29869527608 produced combined Rockchip images. Physical ROTPK/fuse, RPMB, fTPM NV, recovery, and signed-UKI evidence remain open. |
| QEMU ARM64 virt | vexpress-qemu_armv8a | CI firmware baseline | Run 29869527608 passed fTPM/StandaloneMM boot assertions on both runner architectures. It is not proof of RPMB-backed real hardware behavior. |

## Path A vs Path B

Path A means owner-owned root of trust on real hardware: TF-A trusted-board-boot, OP-TEE as BL32, StandaloneMM with RPMB-backed variables, fTPM NV backed by real persistent storage, U-Boot UEFI, and a signed UKI boot path.

Path B means CI or emulated firmware can prove build shape and integration behavior but not hardware-backed persistence, fuses, RPMB, or owner root-of-trust custody.

ROCK 5B and ROCKPro64 stay Path B for production claims until the board-specific evidence is recorded in `refs/`.

## Firmware tags

`ci_firmware-rk.yml` publishes:

- `0mniteck/yubios:firmware`
- `0mniteck/yubios:firmware-<sha>`
- `0mniteck/yubios:firmware-qemu-arm64`
- `0mniteck/yubios:firmware-qemu-arm64-<sha>`
- `0mniteck/yubios:firmware-rock5b-rk3588`
- `0mniteck/yubios:firmware-rock5b-rk3588-<sha>`
- `0mniteck/yubios:firmware-rockpro64-rk3399`
- `0mniteck/yubios:firmware-rockpro64-rk3399-<sha>`

The board tags now carry board-specific compile outputs. They remain pre-production: QEMU is the only boot-tested variant, ROCK 5B lacks a required firmware input, and ROCKPro64 has no retained physical-board proof. See [ci-evidence-2026-07-21.md](ci-evidence-2026-07-21.md).


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Priority signals

**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle
**Owner**: TBD

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.4834).

## Refresh: 2026-09-29

Dig outcome: no material change found against this document's own claims. The board matrix (Run 29869527608 outputs, Path A vs Path B split, pre-production board tags) is yubiOS-internal evidence and no upstream source found contradicts it. Path A hardware proof remains the open item. No existing analysis was edited; everything below is appended context.

Findings observed on 2026-09-29:

- kernel.org (fetched directly, primary): mainline is 7.3-rc5, stable 7.2.8 and 7.1.13, longterm series include 6.12.111 and 6.18.54. Context for which kernel floors the Path A firmware chain would target next. https://www.kernel.org/ (jev weight: n/a, primary source outside the dig batch)
- Kernel Recipes 2026 session "Decoding with Rockchip" (2026-09-17): RK3588 and RK3576 video decoder mainline work presented; listed under Collabora's related posts. https://www.collabora.com/news-and-blog/blog/2026/03/02/running-mainline-linux-u-boot-and-mesa-on-rockchip-a-year-in-review/ (jev weight 0.81)
- TECH VEDA (2026-09-29): frames RK3588 mainline video decoding as a continuing thread and reports Linux 7.3 at rc5 with a mid-October final release projection; corroborates kernel.org. https://www.techveda.live/2026/09/29/slab-tiny-boot-option/ (jev weight 0.76, aggregator)
- Nothing found indicating upstream RK3399 / ROCKPro64 status changes since 2026-07-17. The Path A open items (real DDR/TPL input, ROTPK/fuse, RPMB, fTPM NV, signed UKI) remain as stated.

Context predating this doc's 2026-07-17 date, retained for orientation (not counted as changes since then):

- Pengutronix RK3588 Secure Boot deep dive (2026-06-19): BootROM verifies the RSA key hash in OTP eFuses, then the signed firmware header chain; barebox integration covered; presented at Embedded Recipes 2026. https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html (jev weight 0.85)
- Collabora year-in-review (2026-03-02): Vulkan 1.4 conformance on RK3588 Mali, the Rocket NPU driver, multimedia progress, RK3576 support. https://www.collabora.com/news-and-blog/blog/2026/03/02/running-mainline-linux-u-boot-and-mesa-on-rockchip-a-year-in-review/ (jev weight 0.81)
- CNX Software (2026-02-27): RK3588 and RK3576 H.264/HEVC hardware decoders merged in mainline Linux. https://www.cnx-software.com/2026/02/27/rockchip-rk3588-rk3576-h-264-and-h-265-video-decoders-mainline-linux/ (jev weight 0.87)
- Embedded Recipes 2026 held 27-28 May 2026 in Nice, France; RK3588 Secure Boot sessions on the program. https://embedded-recipes.org/2026/schedule/ (jev weight 0.81)

Sources considered (18 dig results, jev noul weights):

- 0.86 Collabora: Mainline video capture and camera support for Rockchip RK3588 (2026-04-13) https://www.collabora.com/news-and-blog/news-and-events/mainline-video-capture-and-camera-support-for-rockchip-rk3588.html
- 0.87 CNX Software: RK3588/RK3576 H.264 and H.265 video decoders mainline (2026-02-27) https://www.cnx-software.com/2026/02/27/rockchip-rk3588-rk3576-h-264-and-h-265-video-decoders-mainline-linux/
- 0.52 Frigate discussion: RK3588 mainline kernel hardware acceleration status https://github.com/blakeblackshear/frigate/discussions/18311
- 0.15 TECH VEDA (kernel news digest) https://www.techveda.live/2026/09/29/slab-tiny-boot-option/
- 0.12 Radxa forum: new kernels for ROCK 5B / RK3588 https://forum.radxa.com/t/will-be-new-kernels-for-rock-5b-rk3588/31128
- 0.12 Collabora: Running mainline Linux, U-Boot, Mesa on Rockchip, year in review (2026-03-02) https://www.collabora.com/news-and-blog/blog/2026/03/02/running-mainline-linux-u-boot-and-mesa-on-rockchip-a-year-in-review/
- 0.85 Pengutronix: Secure Boot on Rockchip RK3588 (2026-06-19) https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html
- 0.76 TECH VEDA: slab_tiny targets 7.4 (2026-09-29) https://www.techveda.live/2026/09/29/slab-tiny-boot-option/
- 0.81 Collabora: Mainline video capture and camera support for Rockchip RK3588 (2026-04-13) https://www.collabora.com/news-and-blog/news-and-events/mainline-video-capture-and-camera-support-for-rockchip-rk3588.html
- 0.81 Embedded Recipes 2026 schedule https://embedded-recipes.org/2026/schedule/
- 0.13 Reddit: RK3588 mainline Linux support status https://www.reddit.com/r/linux/comments/1hj93kw/rockchip_rk3588_mainline_linux_support_current/
- 0.11 CNX Software: RK3588 mainline Linux support, status and future work (2024-12-21) https://www.cnx-software.com/2024/12/21/rockchip-rk3588-mainline-linux-support-current-status-and-future-work-for-2025/
- 0.46 Radxa forum: mainline U-Boot and kernel restarts during boot (2026-04-14) https://forum.radxa.com/t/mainline-u-boot-and-kernel-restarts-during-boot/30664
- 0.10 Reddit: RK3588 mainline Linux support status https://www.reddit.com/r/linux/comments/1hj93kw/rockchip_rk3588_mainline_linux_support_current/
- 0.11 Collabora: Almost a fully open-source boot chain for RK3588 (2024-02-21) https://www.collabora.com/news-and-blog/blog/2024/02/21/almost-a-fully-open-source-boot-chain-for-rockchips-rk3588/
- 0.67 CNX Software: RK3588 mainline Linux support, status and future work (2024-12-21) https://www.cnx-software.com/2024/12/21/rockchip-rk3588-mainline-linux-support-current-status-and-future-work-for-2025/
- 0.25 Interfacing Linux: EDK2 UEFI for the ROCK 5 ITX (2025-08-25) https://interfacinglinux.com/2025/08/25/edk2-uefi-for-the-rock-5-itx/
- 0.33 DietPi forum: compaction disabled on Rockchip kernel https://dietpi.com/forum/t/why-is-compaction-disabled-on-the-rockchip-kernel/25175

Refresh performed by a repo-refs-skill refresh agent; jev quality model typesafe/jev-1.13-20260917, one batched call, task ta2e16e1-b34b-4d1b-98ba-77978f29df3a.
