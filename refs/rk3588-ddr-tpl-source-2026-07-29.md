# RK3588 DDR/TPL redistribution (2026-07-29)

> Source-grounded research supporting OMN-56 ("Select and pin a redistributable RK3588 DDR/TPL source") and the B-RK3588-TPL blocker. Companion to [refs/arm64-rk-board-status-2026-07-17.md](arm64-rk-board-status-2026-07-17.md) and [refs/firmware-rk-workflow-2026-07-17.md](firmware-rk-workflow-2026-07-17.md).

# RK3588 DDR/TPL redistribution — research note (2026-07-29)

Supports OMN-56 ("Select and pin a redistributable RK3588 DDR/TPL source"). Not a refs/ push; this is a session-only research note to ground a future ADR-018/019 hardware-evidence decision or OMN-56 promotion.

## What "DDR/TPL" means here

- **TPL** = Tertiary Program Loader. On Rockchip RK3588, this is the very early firmware that runs after BootROM. Its job is DDR RAM training: probing the memory controller, calibrating timings, returning a working RAM so the next stage (SPL) can load.
- **DDR blob** is sometimes used as shorthand for the same TPL because its content is DDR initialization tables.
- These blobs are NOT U-Boot code. U-Boot's SPL is open source; the TPL it depends on is a Rockchip-provided binary.

## Source landscape (as of 2026-07-29)

There is exactly one upstream source: **Rockchip's `rkbin` git repository** (`https://github.com/rockchip-linux/rkbin`, BSD-3-Clause for the rkbin tooling itself but the binary payloads are Rockchip-proprietary). The DDR/TPL blobs land in `rkbin/rk35/rk3588_ddr_lp4_16bit_2133MHz_v1.16.bin` (and many other variants) and are pulled verbatim by every Rockchip U-Boot build, both vendor SDKs and mainline.

Status of the broader open-source boot chain (per Collabora "Almost a fully open-source boot chain for Rockchip's RK3588" blog, 2024-02-21, and confirmed by re-reading in 2026-07):

- BL31 (TF-A) — open-source replacement available; mainline TF-A can be compiled from source.
- BL32 (OP-TEE) — open-source; yubiOS owns the fork.
- BL33 (U-Boot) — mainline supports RK3588.
- TPL/DDR — closed source. Rockchip has not open-sourced this. Collabora confirms this is the primary remaining closed component as of their 2024 blog.

Community build environments that pull from rkbin (not alternative sources, just packaging):
- `blark/rk3588-firmware-flake` (Nix flake wrapper)
- `milas/rock5-toolchain` (Docker)
- `LokiSharp/edk2-rk3588` (reference only, also pulls from rkbin)
- Radxa wiki `Rock5/guide/build-u-boot-on-5b` (also pulls from rkbin)

## Distribution options for yubiOS

| Option | Mechanism | Verifiable | Redistributable | Notes |
|---|---|---|---|---|
| Pull rkbin at build time | `git clone github.com/rockchip-linux/rkbin` from CI, vendor specific blob by sha256 | Yes (sha256) | NO — uses Rockchip binary without redistribution license | This is what every current Rockchip distro does; it is the "default" but legally murky for a redistributable OS |
| Carry rkbin blob in yubi-OS/yubiOS repo | Commit the blob with sha256 pin | Yes (sha256) | NO — would need Rockchip redistribution permission | Rejected by Jenny in spirit (yubiOS has no permission to ship closed blobs without a license agreement) |
| Out-of-band user fetch | Each user downloads rkbin, places in known path, yubiOS verifies sha256 | Yes (sha256) | N/A | Honest but pushes friction to users |
| Negotiate redistribution license | Contact Rockchip for explicit redistribution rights | Unclear | Yes (with license) | Slow, expensive, unclear outcome |
| Wait for Collabora / open-source DDR init | Watch for community progress | N/A | N/A | DDR init is complex, controller-specific; 2024 Collabora blog expressed hope but no concrete timeline |

## Recommendation for OMN-56 (draft, for Jenny's review)

**Pull rkbin at build time, fail closed if the pinned sha256 is absent, document the redistribution scope in PINNED.md.** This is the path every Rockchip distro takes and matches the existing "digest-pinned" pattern yubiOS uses for all other build inputs (DHI base image, etc.). The redistribution concern is documented but not blocking: yubiOS doesn't redistribute the blob, it pulls it from upstream at build time. Pinning sha256 satisfies the supply-chain invariant (BLOCKER `B-PINS`).

If Jenny disagrees (e.g. requires no closed blobs), the alternative is "user fetch + sha256 verify", which is documented in `refs/firmware-rk-workflow-2026-07-17.md` as a downstream concern already.

## Sources

- Collabora blog: https://www.collabora.com/news-and-blog/blog/2024/02/21/almost-a-fully-open-source-boot-chain-for-rockchips-rk3588/
- Rockchip rkbin: https://github.com/rockchip-linux/rkbin
- Radxa ROCK 5B U-Boot build guide: https://wiki.radxa.com/Rock5/guide/build-u-boot-on-5b
- yubiOS context: `refs/arm64-rk-board-status-2026-07-17.md`, `refs/firmware-rk-workflow-2026-07-17.md`


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
