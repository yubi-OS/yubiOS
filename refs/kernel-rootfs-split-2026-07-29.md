# Kernel+rootfs split — research and design note (2026-07-29)

> Companion to [ADR-032](../docs/ADR.md). Read this for the upstream-source citations, the surveyed alternatives, and the Phase 1/Phase 2 cut. ADR-032 is the policy decision; this note is the ground truth that produced it.

## Summary

yubiOS needs the kernel (UKI) and the rootfs to be independently addressable as build artifacts. The current build pipeline conflates them in the bootc OCI image; the mkosi disk-image path already separates them but ships them bundled inside the `installer` OCI artifact (`docker.io/0mniteck/yubios:installer-<sha>`). This note proposes lifting the signed UKI out of the `installer` payload and publishing it as a separate artifact (`0mniteck/yubios:uki-<sha>`), per [ADR-022](../docs/ADR.md) per-artifact tag scheme, and pinning the bootc install cmdline so both paths produce a runtime-equivalent kernel. The install-time BLSConfig wiring to use the pre-built UKI is staged as Phase 2 because bootc 1.16.3 has no project-authored BLSConfig drop-in intake.

## What three existing ADRs already establish

| ADR | What it implies |
|---|---|
| [ADR-006](../docs/ADR.md) | mkosi path emits 3 separate artifacts (`signed UKI .efi` + `dm-verity root` + `composefs image`); bootc path emits a monolithic OCI image. The split is implicit in the contrast. |
| [ADR-013](../docs/ADR.md) | A/B updates are 4 separate artifacts: new `/usr` partition, verity data, PKCS#7 signature, and a new UKI in the ESP. The kernel is structurally separable from the rootfs. |
| [ADR-022](../docs/ADR.md) | `0mniteck/yubios` already publishes kernel and rootfs as separate OCI tags: `firmware`, `installer` (UKI), `latest` (bootc OS image), `dev` (test-only). The tag scheme acknowledges the split. |

Phrase "kernel+rootfs split" is **not** present in `docs/ADR.md` anywhere — grep across the file confirms 0 occurrences. ADR-032 names the pattern as a first-class principle.

## bootc 1.16.3 — what changed and what didn't

`bootc-dev/bootc` v1.16.3 (released 2026-07-02) added the **`uki` key in BLSConfig** via [PR #2269](https://github.com/bootc-dev/bootc/pull/2269). Concretely:

- `crates/lib/src/parsers/bls_config.rs`: new `EFIKey` enum with `Efi(Utf8PathBuf)` and `Uki(Utf8PathBuf)` variants. Parser accepts both `efi ...` and `uki ...` lines. Cannot mix with `linux`. The `EFIKey::for_bootloader` helper selects `Uki` for `systemd-boot` + systemd ≥ 258, and `Efi` otherwise (GrubCC always emits `Efi` per issue #2268).
- `crates/lib/src/bootc_composefs/boot.rs`: `BOOTC_UKI_DIR: &str = "EFI/Linux/bootc"` (deliberately NOT the standard `/EFI/Linux/` directory systemd-boot auto-discovers — the comment says *"we want to be able to control the ordering of UKIs so we put them in a directory that's not the directory specified by the BLS spec"*). The BLS `.conf` filename pattern is `bootc_<os_id>-<version>-<priority>.conf` with hyphens in `os_id` replaced by underscores (grub's RPM-style filename parser).
- `crates/lib/src/bootloader.rs`: cached `bootctl_systemd_version()` probe via `OnceLock<u32>` to decide the BLS variant.

**What v1.16.3 does NOT have:**

1. **No project-authored BLSConfig drop-in intake.** bootc writes the BLS `.conf` itself at install time; there's no `/usr/lib/bootc/install/loader-entries/*.conf` mirror of the secureboot-keys flow (`/usr/lib/bootc/install/secureboot-keys`). A yubiOS drop-in would need either a FinalizeScript that runs at *image build time* (the only finalize hook bootc has, per `mkosi.finalize` documentation) or a bootc-side patch mirroring the secureboot-keys flow. The first-boot approach (a systemd unit that runs after install and copies the UKI + writes the BLS `.conf`) is also viable but happens after boot, not "at install time" in the bootc sense.
2. **No `bootc container split-kernel-and-rootfs` subcommand** — that lands in v1.16.4. v1.16.3 has `bootc container ukify` (which generates a UKI from the OCI image's kernel/initrd) but the split command that keeps `/kernel` outside the digested final rootfs (the `B-BOOTC-SEAL` close-out path) is v1.16.4+.

The pre-built UKI artifact published by `yubios-uki` (Phase 1 of this work) is therefore **parallel** to the bootc install-time UKI, not a replacement, until one of these lands.

## v1.16.4 — what's coming (relevant but not required)

[PR #2200](https://github.com/bootc-dev/bootc/pull/2200) ("UKI Cleanup") and [PR #2305](https://github.com/bootc-dev/bootc/pull/2305) ("composefs/bls: Add user provided kargs") landed in v1.16.4 (released 2026-07-15). PR #2305 is the user-provided-kargs path for BLS entries written by the composefs flow; it enables runtime-cmdline tweaks without regenerating the UKI. yubiOS does not need to bump the base to use v1.16.4 for Phase 1; v1.16.4 is the enabler for the full `B-BOOTC-SEAL` close-out (per `docs/ARCHITECTURE.md` L244-278).

## yubiOS-side seams (where the split touches the codebase)

Surveyed via [the yubios-uki-report subagent investigation](#). Concretely:

| File / location | What it does | What changes for the split |
|---|---|---|
| `Containerfile` | Builds the bootc OCI image from `quay.io/fedora/fedora-bootc:45@sha256:f6b5b7...` | Unchanged (Phase 1). The bootc image stays monolithic — kernel + rootfs in one OCI image. |
| `Containerfile.dev` | Builds `yubios:dev-<sha>` from `_yubios-base` with swu2f additions | Unchanged. |
| `mkosi.conf` + `mkosi.conf.d/**` | mkosi `minimal` profile builds a DPS-partitioned disk image with embedded UKI + `SplitArtifacts=uki,partitions` | Unchanged. The signed UKI that comes out of this path is what the new `yubios-uki` artifact packages. |
| `yubiOS-bake.hcl` | HCL Bake graph; no `yubios-uki` target today | **New `yubios-uki` target** that packages the signed UKI as a separate OCI artifact. |
| `usr/lib/bootc/install/50-yubiOS.toml` | bootc install config (bootloader=systemd, block=direct, rootfs=ext4) | **Add `[install] kargs = ["root=dissect", "mount.usr=dissect", "rw", "audit=0"]`** so bootc's auto-generated UKI matches mkosi's cmdline. |
| `ci_mkosi-installer.yml` | Builds the mkosi `minimal` disk image; SoftHSM PKCS#11 mock of YubiKey PIV slot 9c; verifies with `sbverify`; publishes `installer-<sha>` | **Extended**: also extract the signed UKI into a separate `inst/uki/` payload and publish `uki-<sha>` via Bake. |
| `docs/BLOCKERS.md` `B-BOOTC-SEAL` | Active blocker on bootc composefs fsverity chain | **Updated**: Phase 1 closes the artifact-split half. Phase 2 (BLSConfig wiring to use the pre-built UKI) remains. |

## Phase 1 — what this PR ships

1. **New `yubios-uki` bake target** (`yubiOS-bake.hcl`) publishing `docker.io/0mniteck/yubios:uki-<sha>-<arch>` as a tiny OCI image containing `/usr/lib/yubiOS/uki/yubios.efi` + `/usr/lib/yubiOS/uki/ci-secure-boot-cert.pem` + `/usr/lib/yubiOS/uki/MANIFEST.txt`.
2. **New `Containerfile.uki`** — `FROM scratch` + `COPY --from=uki-context / /usr/lib/yubiOS/uki/` (the `uki-context` is the prepared `inst/uki/` payload from ci_mkosi-installer.yml). Lifted the same `FROM scratch` + `COPY /installer/` pattern that the existing `installer` target uses.
3. **Extended `ci_mkosi-installer.yml`** — the "Assemble /installer payload + MANIFEST" step additionally copies the signed UKI + cert into `inst/uki/` and writes a MANIFEST.txt. A new bake step publishes the `yubios-uki` target via `docker buildx bake --file yubiOS-bake.hcl yubios-uki`.
4. **Updated `usr/lib/bootc/install/50-yubiOS.toml`** with `[install] kargs = [...]` so bootc's auto-generated UKI matches the mkosi cmdline at install time.
5. **New `usr/lib/yubiOS/uki/install-uki.sh`** (Phase 2 deliverable — not yet wired into a bootc install hook) documenting the install-time copy of the pre-built UKI to `/EFI/Linux/bootc/bootc_composefs-<digest>.efi` and the BLS `.conf` write with the `uki` key.
6. **ADR-032 (Kernel+Rootfs Split as a First-Class Principle)** appended to `docs/ADR.md`.
7. **Updated `docs/BLOCKERS.md` `B-BOOTC-SEAL`** — split artifact now shipped, install-time wiring deferred.

## Phase 2 — what doesn't ship in this PR

The install-time wiring: a yubiOS BLSConfig drop-in that bootc 1.16.3 picks up. Requires one of:

- **(A)** A bootc-side patch mirroring the secureboot-keys flow: add `/usr/lib/bootc/install/loader-entries/*.conf` as an intake path, copy on install.
- **(B)** A yubiOS first-boot systemd unit that invokes `usr/lib/yubiOS/uki/install-uki.sh` after install completes. Simpler, but the UKI is copied "post-install" not "at-install" — A/B updates via systemd-sysupdate would need to call the same unit.
- **(C)** Base bump to fedora-bootc carrying bootc v1.16.4+ and use `bootc container split-kernel-and-rootfs` + `bootc container ukify` as the sealed-flow enabler (`docs/ARCHITECTURE.md` L244-278).

The right combination is likely (A) + (C), but (A) is a yubi-OS/bootc fork PR; (C) is a Fedora rebuild that lags v1.16.4 release by 1-2 weeks. Neither is in scope for this PR.

## Verification

After merge:

- `0mniteck/yubios:uki-<sha>-<arch>` is pullable.
- `docker pull 0mniteck/yubios:uki-<sha>-amd64 && docker run --rm ... ls /usr/lib/yubiOS/uki/` shows `yubios.efi` + `ci-secure-boot-cert.pem` + `MANIFEST.txt`.
- `sbverify --cert yubios.efi_ci-secure-boot-cert.pem yubios.efi` (on a SoftHSM-built CI image) returns `Signature verification OK` — confirms the PKCS#11 signing path is intact end-to-end.
- `bootc install to-disk` against a `_yubios-base`-derived image with the updated `50-yubiOS.toml` produces a UKI whose `.cmdline` PE section contains `root=dissect mount.usr=dissect rw audit=0` (verifiable with `objdump -s -j .cmdline`).
- A follow-up PR (Phase 2) wires `install-uki.sh` and proves `bootc container ukify --rootfs /target --kernel-dir ... -- --output /out/yubios.efi --signtool systemd-sbsign ...` works inside the fedora-bootc:45 buildroot without an extra pkcs11-provider/softhsm2 packaging step.

## Sources

- [bootc-dev/bootc v1.16.3 release notes](https://github.com/bootc-dev/bootc/releases/tag/v1.16.3) — uki BLSConfig key
- [bootc-dev/bootc PR #2269](https://github.com/bootc-dev/bootc/pull/2269) — the uki BLSConfig implementation diff
- [bootc-dev/bootc v1.16.4 release notes](https://github.com/bootc-dev/bootc/releases/tag/v1.16.4) — UKI Cleanup + user kargs follow-ons
- [bootc-dev/bootc PR #2200](https://github.com/bootc-dev/bootc/pull/2200) — UKI Cleanup
- [bootc-dev/bootc PR #2305](https://github.com/bootc-dev/bootc/pull/2305) — composefs/bls user-provided kargs
- [bootc-dev/bootc v1.16.3 crates/lib/src/install/config.rs](https://github.com/bootc-dev/bootc/blob/v1.16.3/crates/lib/src/install/config.rs) — install config schema
- [yubi-OS/yubiOS docs/ADR.md](https://github.com/yubi-OS/yubiOS/blob/main/docs/ADR.md) — ADR-006, ADR-013, ADR-022, ADR-032
- [yubi-OS/yubiOS docs/BLOCKERS.md](https://github.com/yubi-OS/yubiOS/blob/main/docs/BLOCKERS.md) — B-BOOTC-SEAL
- [yubi-OS/yubiOS refs/bootc-composefs-sealed-flow-2026-07-22.md](https://github.com/yubi-OS/yubiOS/blob/main/refs/bootc-composefs-sealed-flow-2026-07-22.md) — sealed-flow research note
- [UAPI BLS spec](https://uapi-group.org/specifications/specs/boot_loader_specification/) — `.conf` field semantics



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.7834, Δ=+0.8394, Δ=+0.6471) were identical placeholder copies with no per-file content; merged on 2026-09-18.
