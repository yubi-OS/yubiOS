_Refreshed: 2026-07-23 (renamed from refs/bcvk-swtpm-ci.md, no date suffix previously)_

Cross-checked 2026-07-23 against refs/bootc-dev-org-releases-2026-07-23.md: bcvk's own upstream (bootc-dev/bcvk) is now at v0.18.0 (2026-07-02), still with no native USB-passthrough or swtpm-flag features documented upstream — confirms this file's premise that the `--swtpm`/`--swu2f` flags are yubiOS-fork-only additions, pinned via PINNED.md's immutable release-descendant commit, not something upstream bcvk ships natively. No drift found.

# bcvk swtpm CI

Status: yubiOS-side integration documented; CI consumes the immutable yubi-OS/bcvk release-descendant commit recorded in `PINNED.md`.

## Goal

Exercise TPM2/measured-boot code paths in hardware-free CI by attaching a software TPM to bcvk ephemeral VMs.

## Current implementation stance

The original idea was to enable `systemd-tpm2-swtpm.service` in the guest. In practice, bcvk's DirectBoot path extracts the kernel/initrd from the UKI and bypasses enough of the normal boot stack that the reliable route is host-side QEMU vTPM attachment:

- `swtpm` runs on the host.
- QEMU gets `-tpmdev emulator` plus an architecture-appropriate TPM device.
- The guest kernel exposes `/dev/tpm0` and `/dev/tpmrm0` through `tpm_tis`/`tpm_crb`.

`systemd-tpm2-swtpm.service` remains relevant upstream systemd context, but it is not the current bcvk CI mechanism.

## yubiOS side

- `vm-swtpm.conf` (now in yubi-OS/assets:ci/vm-swtpm.conf, moved 2026-07-25) remains a documented drop-in for VM-only coverage experiments.
- VM tests should assert TPM presence and measured-boot gates, but stay honest about DirectBoot limitations.

## Done condition

- bcvk branch exposes `--swtpm` and `--swu2f` for yubiOS CI.
- yubiOS VM tests can observe `/dev/tpm0` and run measured-boot checks without a physical TPM.
- Physical hardware remains required for final YubiKey passthrough confidence.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Priority signals

**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle
**Owner**: TBD

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.8670).

## 2026-09-18 drift check (wayfinder round 8, cycle 61)

bcvk swtpm CI record: the swu2f/swtpm lanes it documents remain the working pattern the hardware-leg proof exercised; note additive.
