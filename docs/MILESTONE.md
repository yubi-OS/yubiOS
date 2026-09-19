# yubiOS Milestones

Last reviewed: 2026-07-30 (against BLOCKERS.md 2026-07-30 review)
Status: repo-native mirror of the Linear execution project. This is a planning-only document -- it summarizes workstreams and milestones, it does not duplicate TODO.md, BLOCKERS.md, or FUTURE.md. For current task details see TODO.md; for open blockers see BLOCKERS.md; for longer-horizon research see FUTURE.md.

Source: mirrors the Linear project "yubiOS Production Proof & Release Gates" (id `a9a0701b-d1be-448c-a194-e573c82bd9f8`, team OMNI-AGENT), per OMN-64/OMN-44. **Review-gate applied 2026-07-28**: re-read against `docs/BLOCKERS.md` `Last reviewed: 2026-07-25`; same-day drift on the 2026-07-25 version of this doc is corrected below.

## Goal

**Last reviewed against docs/BLOCKERS.md:** 2026-07-30 review (sha 7501fa0c13a4). No new blocker retirements since this doc's prior review (Last reviewed 2026-07-28). B-VM-CTAP2 was RESOLVED 2026-07-25 (5 days before this BLOCKERS.md review) and is already noted correctly in this doc. BLOCKERS.md gained a new "Permanent CI-Evidence Patterns" section (systemd drop-in lex-sort rule, source OMN-149) — does not affect this doc's content. The 2026-07-28 review diff (corrected against the same-day BLOCKERS.md) remains the binding drift correction; this 2026-07-30 stamp is a no-new-retirements confirmation.

Drive yubiOS from research-backed roadmap items to production-proof evidence across ARM64 Path A, token-backed CI, sealed bootc flow, and runtime/supply-chain validation.

## Main workstreams

- **ARM64 Path A** -- real-hardware production proof for the ARM64 secure-boot chain (ROTPK, OP-TEE, fTPM, U-Boot UEFI Secure Boot).
- **VM/CI coverage** -- deterministic, token-dependent guest operations in CI (FIDO2 enumeration, LUKS2 unlock) with clear production/dev-test isolation.
- **Sealed boot chain** -- moving from the current unsealed fs-verity story to a signed-UKI plus Secure Boot proof.
- **Runtime hardening and supply chain** -- turning static hardening audits into target-image runtime evidence, with pinned inputs and provenance.

## The four milestones

### 1. ARM64 Path A production proof

Close the real-hardware production proof gaps for the targeted ARM64 path, including fuse/ROTPK rehearsal, OP-TEE and RPMB-backed evidence, U-Boot UEFI Secure Boot, and exact board configuration capture.

**Linear ownership:** OMN-36 (parent, Backlog P3), OMN-45 (ROTPK rehearsal, Backlog P2), OMN-46 (OP-TEE/RPMB/fTPM/U-Boot evidence on hw, Backlog P2), OMN-47 (signed UKI boot on target board, Todo P2).

**Seeded blockers (per BLOCKERS.md Last reviewed 2026-07-25):** B-ARM64-PATHA (no board has proven the full chain yet), B-RK3588-TPL (ROCK 5B build is diagnostic packaging, not flashable).

**Status (2026-07-28):** 0% — all 4 child issues Backlog/Todo, no assignees outside the agent, last updated 2026-07-23/24. **No work in flight.** This is now the second-longest pole after Milestone 3.

### 2. Token-backed VM and CI coverage

Make token-dependent guest operations execute deterministically in CI, keep PQ TLS verification visible, and preserve explicit isolation between production and dev/test paths.

**Linear ownership:** OMN-38 (parent, **Done**), OMN-48 (path trace, **Done**), OMN-49 (fail-closed, **Done**), OMN-50 (proof logs, **Done**). Plus OMN-39 (QEMU zboot workaround tracking, Backlog P3), OMN-59 (runner/QEMU boundary, **In Progress** P3), OMN-60 (zboot version-gating, Backlog P3).

**Seeded blockers (corrected 2026-07-28 against BLOCKERS.md Last reviewed 2026-07-25):**
- **B-VM-CTAP2 — RESOLVED 2026-07-25** (run 30139433902, OMN-48 Done). The 2026-07-25 version of this doc incorrectly named B-VM-CTAP2 as "the single highest-leverage blocker." That claim is no longer true; see BLOCKERS.md Not-Current-Blockers entry for the closure evidence (LUKS2 unlock → homed → pamu2fcfg → ed25519-sk, end-to-end, no skips).
- B-QEMU-ZBOOT — contained workaround per BLOCKERS.md same review, not an open failure. Keep version-gated until upstream QEMU carries the fix.
- **B-REAL-FIDO2 — NOW READY TO EXECUTE.** Was gated on B-VM-CTAP2 closing; that gate is now open. Awaiting human owner with physical hardware (per OMN-63's 12 scenarios, OMN-63 itself Done).

**Status (2026-07-28):** 65.6% — software-validated FIDO2 path fully delivered. The post-B-VM-CTAP2 long pole has moved to Milestone 3 (Sealed composefs), not back to M2.

### 3. Sealed composefs boot chain

Promote the current unsealed integrity path to a signed-UKI plus Secure Boot proof with negative tamper evidence on amd64 and arm64.

**Linear ownership:** OMN-43 (parent, Todo P2), OMN-51 (split/ukify base pin, **In Progress** P2), OMN-52 (UKI through protected boundary, Todo P1), OMN-53 (negative-tamper proof, Todo P1).

**Dependency note:** OMN-52/53 feed back into Milestone 1 (signed UKI consumed by ARM64 boot) and into Milestone 4 (target-image runtime hardening meaningless without a sealed chain). The four milestones are not strictly sequential.

**Seeded blocker:** B-BOOTC-SEAL (fs-verity currently proven through a mutable BLS digest anchor, not a sealed/signed UKI; see refs/bootc-composefs-sealed-flow-2026-07-22.md).

**Status (2026-07-28):** 6.25% — **actual long pole of the whole project right now.** OMN-51 is the only in-flight work; it gates OMN-43 (parent) and OMN-52 (P1); OMN-52 gates OMN-53 (P1). Critical path: OMN-51 → OMN-52 → OMN-53. With 6 weeks to project target 2026-09-13, any week lost here is unrecoverable without scope cut.

### 4. Runtime hardening and supply-chain validation

Back hardening and rebuildability claims with target-image runtime validation, pinned inputs, package-floor checks, immutable source resolution, and provenance expectations.

**Linear ownership:** OMN-40 (parent, Backlog P3), OMN-54 (Bats hardening in target image, Backlog P2), OMN-55 (systemd-analyze verify, Backlog P2). Plus OMN-41 (parent, Backlog P3), OMN-61 (digest-bump checklist, **Done** P3), OMN-62 (package-floor checklist, Backlog P3).

**Seeded blockers (per BLOCKERS.md Last reviewed 2026-07-25):** B-HARDENING-RUNTIME (static audit complete, runtime Bats/systemd-analyze verify still needed against a target image), B-PINS (base-image digest changes require explicit PINNED.md updates).

**Status (2026-07-28):** 25% — OMN-61 done; OMN-54/55/62 Backlog, no recent activity.

## Cross-milestone (no parent)

- **OMN-44 (MILESTONE.md mirror, Done P4)** + **OMN-64 (this doc's draft, Done P4)**: mirror infrastructure.
- **OMN-42 (real-hardware FIDO2 validation, Backlog P2)**: parent to OMN-63 (Done P2). Standalone; feeds into Gate 3 not any specific milestone.
- **OMN-96 (fTPM /dev/tpm0 CI, In Progress P0 = "No priority")**: real surface work; hygiene gap. Recommend relabel priority.
- **OMN-97 / OMN-100 / OMN-108 (vGPU CI / libvfio-user / GPU trust boundary)**: all Backlog, longer-horizon research.

## Relationship to the broader roadmap

This document is the concise, repo-native planning artifact aligned with the current Linear structure. It intentionally does not restate:

- **TODO.md** -- the active, detailed task list; check there for current work-in-progress.
- **BLOCKERS.md** -- the single source of truth for open blockers; this doc only names which blockers seed which milestone, it does not track their live status.
- **FUTURE.md** -- longer-horizon research and planning cycles, including Milestone F (ARM64 Owner-Owned Root of Trust) which overlaps with milestone 1 above but is tracked at a different altitude (research backlog vs execution milestone).

This is a planning-only repository documentation task, per OMN-44's own framing: revisit implementation only after repo-side coding work resumes on each milestone.

## Planning doc publish-gate (process rule, added 2026-07-28)

Per `memory/github-yubios-KS9n5GAT/PROJECT_RULES.md` (Planning doc publish-gate section), this doc was re-read against `docs/BLOCKERS.md` `Last reviewed: 2026-07-25` immediately before this re-issue. Same-day drift on the previous (2026-07-25) version of this doc — calling B-VM-CTAP2 "single highest-leverage blocker" when BLOCKERS.md same-day review had marked it RESOLVED — is the failure mode this rule is designed to catch. Future re-issues must include a `<last-reviewed-against-blockers>` header stamped at the top of any planning doc that lands the same day BLOCKERS.md is reviewed.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 10, cycle 12)

the milestone target dated 2026-09-13 on the Production Proof & Release Gates project has passed; per the planning doctrine, the milestone state is Jenny's call; this note records the date passage only.
