# Zboot Workaround Runner/QEMU Audit

Source: OMN-59 (team OMNI-AGENT), confirming the exact runner/QEMU version window still requiring the pinned zstd EFI zboot workaround (B-QEMU-ZBOOT in BLOCKERS.md). Directly checked live CI run logs from today, 2026-07-25, not just prior docs.

## Purpose

Confirm the exact runner and QEMU versions that still require the workaround, and record fresh evidence, per OMN-39’s own step 1 ("confirm the exact runner and QEMU versions that still require the workaround") and OMN-59’s scope.

## What was already known (refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md)

- yubiOS pins QEMU commit 3a18e8a25992d1643707e2cebdd6e9bb2bd7d3b9 for the ARM64 bcvk lane in `.github/workflows/ci_test-vm.yml`.
- That commit is Daan De Meyer’s own zstd EFI zboot fix, merged upstream and shipped as part of the QEMU 11.0 release line.
- As of the 2026-07-23 update to that doc, the open question was whether the self-hosted `rock1` runner’s installed QEMU is already at 11.0+, which would make the pinned-workaround step potentially removable.
- Run 29525332901 (2026-07-16) reported "QEMU emulator version 10.2.50" from the pinned-commit build.

## Fresh evidence checked today (2026-07-25)

Pulled the arm64 job logs directly from the two most recent `ci_test-vm.yml` runs at time of this audit:

- **Run 30137570839** (2026-07-25T01:00:12Z, ~40 minutes before this doc, overall conclusion: failure): arm64 job log reports "QEMU emulator version 10.2.50".
- **Run 30134249985** (2026-07-24T23:37:00Z, overall conclusion: success): arm64 job log also reports "QEMU emulator version 10.2.50".

Both runs are from the pinned-commit build path (`3a18e8a25992d1643707e2cebdd6e9bb2bd7d3b9`), confirming the pinned build still resolves to QEMU 10.2.50, not the 11.0 release. This is fresh, same-day evidence, not a stale reference to a nine-day-old run.

## Answer to OMN-59’s question

**The exact version window that still needs the workaround, as of 2026-07-25:** the self-hosted `rock1` ARM64 runner’s environment does not carry QEMU 11.0 or later; the pinned-commit build path yields QEMU 10.2.50. The workaround (pinning the specific upstream fix commit rather than relying on the runner’s own QEMU package) is therefore still necessary, because the runner cannot yet reach the fix through its own package manager alone.

This resolves the open question from refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md’s own recommended next step ("checking the self-hosted rock1 runner’s installed QEMU version against 11.0") with a direct answer: not yet at 11.0, still 10.2.50 via the pin.

## Removal condition (per OMN-39’s scope)

Per OMN-39/OMN-60’s doctrine (keep the workaround version-gated, define removal verification), removal should require: the `rock1` runner’s distro-packaged QEMU reaches 11.0+ without the pin, AND a CI run on that unpinned QEMU reproduces the same successful zstd EFI zboot handling that the pinned commit currently provides. This audit does not check whether the runner’s distro package (as opposed to the pinned build) has reached 11.0 -- that would require inspecting the runner’s package manager state directly, which this agent has no access to from the GitHub API alone.

## What this audit does NOT establish

- Whether the rock1 runner’s own OS-level QEMU package (independent of the CI-time pinned build) has been updated to 11.0+. That is a separate question from what the CI workflow currently builds and uses.
- Whether removing the pin today would break the build -- not tested here, since testing that would require actually removing the pin in a real CI run, which is out of scope for a research/audit task per doctrine (no CI changes without the pulpit assigning the CI task).

## Dependency map

- Directly answers OMN-39’s step 1 and feeds OMN-60 (keep the workaround version-gated, define removal verification).
- Cites the same B-QEMU-ZBOOT row in BLOCKERS.md that OMN-73’s readiness gates doc (PR #118) and OMN-68’s evidence boundary doc (PR #119) already reference as a contained, non-blocking workaround.

## Open questions

- The runner’s own distro QEMU package version (separate from the CI-pinned build) was not checked in this pass -- would need direct runner access, not just workflow log inspection.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8670) were identical placeholder copies with no per-file content; merged on 2026-09-18.
