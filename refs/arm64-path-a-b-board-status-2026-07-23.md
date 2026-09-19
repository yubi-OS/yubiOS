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
