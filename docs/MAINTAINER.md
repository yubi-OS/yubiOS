# Maintainer Playbook

Last reviewed: 2026-07-11

yubi-OS org and project yubiOS is Maintained-By:
 - Shant Tchatalbachian (0mniteck) shant@omniteck.com
 - +18186415757 (sms)
 - Omniteck.42 (signal)

This file captures recurring maintainer rules for yubiOS documentation, CI, and planning work.

## Branch And PR Policy

- Wiki and docs planning work uses `docs/research`.
- Focused implementation branches should be named after the work they carry.
- Do not delete branches as part of routine docs or CI work.
- When a change should land, open a PR with a concrete summary, validation, and known inconsistencies.

## Source Of Truth

| Topic | File |
|---|---|
| Current base and tool pins | `PINNED.md` |
| Accepted architecture decisions | `ADR.md` |
| Normative behavior | `SPEC.md` |
| Threat mitigations and residual risk | `MITIGATE.md` |
| Future work | `FUTURE.md` |
| Active blockers | `BLOCKERS.md` |
| Active tasks | `TODO.md` |
| Research-cycle evidence | `refs/` |

Do not let historical run output, old PR notes, or stale TODO fragments override the current source-of-truth files.

## Research Cycle Checklist

1. Read the task-specific file, then `AGENTS.md`, `PINNED.md`, and relevant ADRs/refs.
2. Gather primary upstream sources for claims that may have changed.
3. Record dated findings under `refs/` when the work spans more than one file.
4. Name planning-cycle notes `refs/planning-cycle-YYYY-MM-DD.md`, keep each note scoped to that research cycle, and link source-of-truth files instead of copying live pin tables.
5. Update docs that repeat the affected claim.
6. Flag inconsistencies instead of quietly smoothing over unresolved conflicts.
7. Open a PR, merge when appropriate, and create or update an issue with the outcome.

## Current Consistency Flags

- `RestrictFileSystems=` is the existing BPF-LSM filesystem-type limiter, not the systemd v261 addition. v261 introduced `RestrictFileSystemAccess=`.
- `PINNED.md` is the live digest source. Historical digests in ADRs and old workflow logs are not current pins.
- ARM64 is primary for the owner-owned root-of-trust thesis; x86-64 is supported and secondary.
- TEST-only swu2f/dev images must remain isolated from production tags.

## CI Triage Rules

- Retry only likely-transient failures and avoid retry loops.
- Deterministic failures should become fixes or documented blockers.
- Old-sha reruns do not validate current `main`.
- Workflow trigger edits should be narrow and path-scoped.
- CI outcomes should be summarized in the issue or PR that motivated the work.

## Release Hygiene

- A release or publish path must cite the branch, commit, workflow run, and artifact/tag.
- Digest bumps should update [PINNED.md](../PINNED.md) and include evidence that required package floors still hold.
- New artifacts need explicit production/test classification before publication.



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

## 2026-09-18 drift check (wayfinder round 10, cycle 17)

maintainer doc: unchanged; the Jenny-merges rules it encodes were honored by every round (all agent PRs held for review, merged by the maintainer); note additive.

## 2026-09-18 drift check (wayfinder round 11, cycle 12)

MAINTAINER.md (round-10 cycle-17 drift-checked): the Jenny-merges discipline held through rounds 9-11 (all three PRs merged by Jenny); note additive.
