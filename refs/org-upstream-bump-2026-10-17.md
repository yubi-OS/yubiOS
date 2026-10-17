# Org-wide upstream bump (2026-10-17)

Source of truth: PINNED.md on main at 3e76363d. Goal: every upstream we consume sits at its latest stable release, fork commits we carry are rebased on top of that release, and every consumer reads the pin from PINNED.md.

## Inventory and decisions

| Item | Pinned | Latest stable | Decision |
|---|---|---|---|
| arm-trusted-firmware (fork) | v2.15.0 | v2.15.0 | no change (fork pin = release commit, zero yubiOS commits) |
| bcvk (fork, yubios branch) | v0.21.0 | v0.21.0 | no change (release is latest; 41 yubiOS commits stay as-is) |
| edk2 (fork) | edk2-stable202602 | edk2-stable202608 | HOLD unless compatible: pinned bound for StandaloneMM ArmBaseLib used by the pre-removal edk2-platforms snapshot. Lane E proves or disproves 202608 compatibility |
| edk2-platforms (fork snapshot) | 20260316-before-platform-removals | no stable tags | no change |
| mkosi (fork, feature/yubiOS-profile) | v27.1 | v27.1 | no change (27 yubiOS commits stay) |
| ms-tpm-20-ref (fork) | v1.83r1 | v1.83r1 | no change |
| optee_ftpm (fork, feat/volatile-nv-ci) | 4.10.0 | 4.11.0 | BUMP: rebase 11 yubiOS commits onto 4.11.0 |
| optee_os (fork, feat/stmm-volatile-storage-ci) | 4.10.0 | 4.11.0 | BUMP: rebase yubiOS commits onto 4.11.0 (preserve every yubiOS-only commit; upstream-already-merged commits drop) |
| u-boot (fork) | v2026.10 | v2026.10 | no change |
| docker/buildx | v0.35.0 | v0.38.0 | BUMP: release assets, SHA-512 for linux amd64 and arm64 |
| Mbed-TLS | mbedtls-3.6.6 | 3.6.7 (3.x line), 4.2.0 (major) | BUMP to 3.6.7; HOLD 4.x unless TF-A v2.15 is proven compatible |
| pando85/passless | v0.11.2 | v0.20.2 | BUMP; hmac-secret must remain implemented, test-image CI must pass |
| sigstore/cosign | v3.1.2 | v3.1.3 | BUMP: SHA-512 and cross-check against cosign_checksums.txt; update verify tooling pins |
| moby/buildkit (image) | v0.31.2 | v0.34.0 | BUMP: multi-arch INDEX digest |
| hadolint (image) | v2.14.0 | v2.15.1 | BUMP: multi-arch INDEX digest |
| ghcr.io/actions/jekyll-build-pages | sha256:6791ebfd... | check latest | verify, bump only if a newer build exists |
| qemu/qemu (upstream commit) | 3a18e8a2 | v11.1.2 tag commit | BUMP to the commit behind v11.1.2 |
| docker static engine (download.docker.com) | 29.6.0 | latest stable static | BUMP: 4 artifacts, SHA-512 each |
| actions/attest | 59d89421 | v4.2.2 1e69f48a | BUMP |
| actions/deploy-pages | cd2ce8fc | v5.0.1 368f8252 | BUMP |
| actions/download-artifact | 37930b1c | v8.0.2 9000827c | BUMP (major: check inputs and runtime) |
| actions/setup-python | 0b93645e | v7.0.0 5fda3b95 | BUMP (major: check inputs and runtime) |
| actions/upload-artifact | bbbca2dd | v7.0.2 cf430e03 | BUMP (major: check inputs and runtime) |
| docker/setup-buildx-action | d7f5e7f5 | v4.4.1 f87e5991 | BUMP (major: check inputs) |
| actions/checkout, configure-pages, upload-pages-artifact | already latest | | no change |
| dhi.io/debian-base | 7b1d6522 | refreshed by fetch-dhi-manifest | done on main (6326b0b4) |
| quay.io/fedora/fedora-bootc:45 | 86cc9d98 | refreshed by fetch-fedora-bootc-manifest | done on main (3e76363d) |

## Rules every lane follows

1. Forks: before any rebase or force update, create a backup tag on the old tip named `pre-bump-2026-10-17`. Never delete old history. Verify the new tip with the compare API (behind_by 0 against the release commit, ahead_by equal to the number of yubiOS commits kept).
2. Lanes do not merge to yubi-OS/yubiOS main. The advisor integrates lane outputs into the single branch org-upstream-bump-2026-10-17 and merges only after CI is green.
3. No Docker push and no card writes in any lane. Verification dispatches run with Docker push OFF.
4. Every PINNED.md row changed must cite the release commit and the approved source commit. Consumers read the pin.
5. Anything held or refused is recorded in PINNED.md with the reason, not silently skipped.

## Acceptance

- PINNED.md on the branch matches every decision above, and every consumer reads the same values (grep for each old SHA or version returns zero hits outside history notes).
- lean-check, ci_dispatch-reachability, input-shape, token-audit green on the PR.
- ci_firmware-rk verification build green with Docker push OFF on the branch head (this validates the optee bump in the firmware).
- Fork compare checks above pass for optee_os and optee_ftpm.
