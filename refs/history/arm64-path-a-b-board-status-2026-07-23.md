_Refreshed: 2026-07-23 (renamed from refs/path-a-b-board-status.md; original content dated 2026-07-11, retained below)_

Status check 2026-07-23: cross-checked against live BLOCKERS.md — B-ARM64-PATHA and B-RK3588-TPL (tracked in the yubiOS Master Roadmap project, see refs/org-state-audit-2026-07-23.md) match this file's classification exactly: RK3588 is the Path A candidate but not yet production (no ROTPK/fuse rehearsal on real hardware; ROCK 5B specifically blocked on a missing licensed DDR/TPL blob per B-RK3588-TPL), ROCKPro64/RK3399 is the supported stepping-stone per ADR-029. No drift found — board classification below remains accurate.

# ARM64 Path A / Path B Board Status

Status: planning reference
Date: 2026-07-11

This note addresses the active TODO item to document Path A versus Path B status per board. It is intentionally scoped to board classification and evidence gaps; it does not claim production readiness for any board.

## Classification Rules

- **Path A** means an owner-owned root of trust can be enforced before the OS is trusted: owner-provisioned ROTPK, TF-A Trusted Board Boot, OP-TEE, RPMB-backed secure storage, fTPM/TCG2 measurement, U-Boot UEFI Secure Boot, and the same signed yubiOS UKI used across architectures.
- **Path B** means the board can provide useful development, measurement, or attestation evidence, but not a fully owner-enforced boot-time rejection path.
- A board must stay out of production language until fuse/provisioning state, debug lockdown, RPMB behavior, Secure Boot variables, recovery behavior, and UKI boot evidence are recorded.

## Current Board Matrix

| Board / family | Current path | Why | Evidence still needed |
|---|---|---|---|
| RK3588 family | Path A candidate | Preferred flagship family for owner-owned ARM64 root-of-trust proof. | Select exact board, rehearse ROTPK/fuse provisioning on sacrificial hardware, prove OP-TEE + StandaloneMM + RPMB-backed variables + fTPM NV, validate U-Boot UEFI Secure Boot and TCG2, boot signed yubiOS UKI, document recovery. |
| RK3399 family | Path A stepping-stone candidate | Useful for rehearsing TF-A and OP-TEE lineage before the preferred RK3588 proof. | Confirm exact board support, repeat provisioning rehearsal, validate RPMB/secure storage behavior, document deltas from RK3588. |
| Raspberry Pi 5 | Path B documentation target | Valuable developer target, but not the preferred owner-owned Path A production proof. | Document measured/attested development limits, avoid production-root claims, define what evidence is useful for CI or development. |
| QEMU virt | Path B / CI evidence only | Good for firmware fold, fTPM functional checks, and workflow regression tests. | Keep volatile-NV and QEMU-only assumptions visible; do not treat as hardware proof. |
| x86-64 PC firmware | Supported secondary platform above UKI | Useful for shared signed UKI and userspace validation, but lower firmware and OEM TPM remain outside owner control. | Keep owner-controlled-root claims bounded above OEM firmware; validate shared artifacts and recovery paths. |

## Promotion Checklist

A board can move toward production Path A language only when all of the following are recorded in repo evidence:

- Exact board model, firmware versions, and provisioning commands.
- ROTPK/fuse rehearsal on sacrificial hardware, including read-back evidence and abort/recovery behavior.
- OP-TEE boot with RPMB-backed secure storage.
- StandaloneMM-backed UEFI variable persistence.
- fTPM NV persistence and TCG2 measurement visibility.
- U-Boot UEFI Secure Boot enforcement with owner keys.
- Same signed yubiOS UKI booting as the x86-64 path.
- Recovery procedure for failed provisioning, failed Secure Boot enrollment, lost token, and bad update.
- Clear statement of remaining debug, firmware, or SoC trust assumptions.

## Next Action

Select the first concrete RK3588 board for sacrificial provisioning rehearsal, then create a board-specific evidence note under `refs/` before using production-root language.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Declarative policy coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.

## 2026-09-18 drift check (wayfinder round 8, cycle 82)

Path A/B board status record (round-7 repaired): board roles unchanged; the HIGH-MEM runner facts re-cited from the round-2 records; note additive.

## Refresh: 2026-09-29

Deep-research refresh via searXNG (2 prescribed queries plus 1 targeted query on the B-RK3588-TPL DDR/TPL blob blocker), with each result quality-weighted by the DefAPI jev noul decision model. Verdict: no material upstream change found since the 2026-07-23 status check. The board matrix, promotion checklist, and classification rules remain accurate as of 2026-09-29; nothing met the bar for an in-place factual correction, so this section is additive only.

Findings considered and rejected as material changes:

- Pengutronix published "Secure Boot on Rockchip RK3588" (2026-06-19): documents the RK3588 boot ROM key and OP-TEE OS signing path, notes signing tools are not yet integrated into U-Boot, and that rkimage can re-sign existing U-Boot images. Dated before the 2026-07-23 refresh, so it is corroborating context for the Path A candidate framing, not a change: owner-controlled RK3588 secure boot is being built out but is not yet turnkey. https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html (jev noul 0.40)
- Third-party repo schneid-l/u-boot-rockchip (activity 2026-09-17) ships pre-built signed U-Boot binaries for mainline-supported Rockchip ARM64 boards, auto-built from upstream sources, but still consumes the rkbin DDR/TPL blob for RK3588 boards (e.g. Orange Pi 5). Not an upstream project, does not resolve the licensed-blob dependency behind B-RK3588-TPL. https://github.com/schneid-l/u-boot-rockchip (jev noul 0.38)
- OpenWrt 25.12.0-rc1 changelog shows continued rkbin TPL blob packaging for rk3576 and arm-trusted-firmware version bumps; RK3576 is adjacent to but not one of this doc's boards, and the blob-packaging pattern reinforces rather than changes the RK3588 blob assessment. https://openwrt.org/releases/25.12/changelog-25.12.0-rc1 (jev noul 0.39)
- Trusted Firmware-A stable docs (2.15.0) still describe Rockchip SoC integration as BL31/BL32 paired with U-Boot or Coreboot; no RK3588-specific ROTPK/fuse provisioning workflow change surfaced. https://trustedfirmware-a.readthedocs.io/en/stable/plat/rockchip.html (jev noul 0.40)

Standing status: RK3588 remains the Path A candidate blocked on the licensed DDR/TPL blob (B-RK3588-TPL), RK3399 remains the Path A stepping stone per ADR-029, Raspberry Pi 5 and QEMU virt remain Path B, and the next action is unchanged: select the first RK3588 board for sacrificial ROTPK/fuse provisioning rehearsal.

### Sources considered

Weights are jev noul values from a single batched decide call (task_id ta024a2d-6d83-4aad-956e-5b6fa9ebcd85).

Query "RK3588 U-Boot OP-TEE mainline support 2026":

- Secure Boot on Rockchip RK3588, Pengutronix blog: https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html (0.40)
- Embedded Recipes 2026 schedule (secure boot session): https://embedded-recipes.org/2026/schedule/ (0.40)
- Upstream support for Rockchip RK3588: progress and future plans, Collabora: https://www.collabora.com/news-and-blog/news-and-events/rockchip-rk3588-upstream-support-progress-future-plans.html (0.40)
- Rockchip RK3588 mainline Linux support, CNX Software: https://www.cnx-software.com/2024/12/21/rockchip-rk3588-mainline-linux-support-current-status-and-future-work-for-2025/ (0.39)
- Rockchip RK3576 mainline support, Flipper One docs: https://docs.flipper.net/one/cpu-software/rk3576-mainlining (0.39)
- Armbian forum, how to enter U-Boot environment: https://forum.armbian.com/topic/56107-how-to-enter-to-u-boot-enviroment/ (0.39)

Query "rockchip arm64 secure boot TF-A 2026":

- schneid-l/u-boot-rockchip (pre-built signed U-Boot binaries): https://github.com/schneid-l/u-boot-rockchip (0.38)
- Rockchip SoCs, Trusted Firmware-A 2.15.0 docs: https://trustedfirmware-a.readthedocs.io/en/stable/plat/rockchip.html (0.40)
- DRTM on ARM, TrenchBoot blueprint: https://trenchboot.org/blueprints/DRTM_On_ARM/ (0.40)
- Gahing's Space (Rockchip firmware/embedded Linux blog): https://blog.gahingwoo.com/ (0.40)
- TF-A mailing list archive (latest): https://lists.trustedfirmware.org/archives/list/tf-a@lists.trustedfirmware.org/latest?count=200 (0.40)
- Arch Linux ARM on Odroid M1S install guide, ODROID forum: https://forum.odroid.com/viewtopic.php?t=50877 (0.40)

Query "Rockchip RK3588 DDR TPL blob licensing U-Boot 2026":

- schneid-l/u-boot-rockchip (duplicate of above): https://github.com/schneid-l/u-boot-rockchip (0.38)
- ROCKNIX/rk3588-uboot: https://github.com/ROCKNIX/rk3588-uboot (0.39)
- Gentoo forum, bootloader for quartz64-a: https://forums.gentoo.org/viewtopic.php?t=1164578 (0.40)
- OpenWrt v25.12.0-rc1 changelog: https://openwrt.org/releases/25.12/changelog-25.12.0-rc1 (0.39)
- Rockchip RK3566 orangepi-build notes, cnblogs: https://www.cnblogs.com/zyly/p/18294036 (0.39)
- Rockchip Linux Developer Guide V2.0.1 (Scribd copy): https://www.scribd.com/document/927338308/Rockchip-Developer-Guide-Linux-Software-En (0.40)
