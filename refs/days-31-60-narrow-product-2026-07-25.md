# Days 31-60: Prove the Narrow Product

Source: [OMN-66](https://linear.app/omni-agent/issue/OMN-66) (team OMNI-AGENT), part of the yubiOS Business and Stewardship Plan. Builds on [refs/days-0-30-safe-offer-2026-07-25.md](days-0-30-safe-offer-2026-07-25.md) (OMN-65, PR #103). Grounded in the live BLOCKERS.md as of 2026-07-22.

## Purpose

Define the second 30-day phase: narrow the claim to one pilot platform, retire or explicitly reclassify the blockers that gate it, produce a real (not simulated) FIDO2 demonstration, and stand up the operational muscle (pricing, triage, incident response) a paying design partner would expect.

## Scope (from OMN-66)

- Retire or reclassify the VM, physical-token, runtime-hardening, and release blockers for one pilot platform.
- Publish a reproducible physical-YubiKey and recovery demonstration with exact evidence and limits.
- Recruit two design partners matching the initial customer profile.
- Price the pilot; do not default to unpaid custom engineering.
- Establish vulnerability triage, release severity, escalation, backup, and incident communications exercises.

## Pilot platform recommendation

x86_64 / VM-validated path, not ARM64 hardware. Per BLOCKERS.md, ARM64 (B-ARM64-PATHA) has no board proving ROTPK/fuse provisioning, OP-TEE, RPMB-backed StandaloneMM, fTPM NV, U-Boot UEFI, or signed UKI boot end to end, and B-RK3588-TPL means the ROCK 5B build is not a flashable image yet. The VM lane is closer: B-VM-SSH and B-VM-BOOTLOADER-UPDATE are already retired (run 29872832727), and B-QEMU-ZBOOT is a known, contained workaround, not an open failure. Narrowing the pilot to x86_64 with VM-proven boot plus LUKS2 is the fastest path to a defensible working claim.

## Blocker retirement / reclassification plan for the pilot platform

| ID | Current state (BLOCKERS.md, 2026-07-22) | Action for the pilot narrowing |
|---|---|---|
| B-VM-CTAP2 | Run 29872832727 reached the ARM64 guest and ran enrollment-surface checks, but no FIDO2 token enumerated; LUKS2 FIDO2, homed, and ed25519-sk skip as a result. | Must fix before pilot claim: repair the bcvk/swu2f device path, assert token discovery before token-dependent tests, keep logs proving each op ran. This is the hardest blocker on the pilot critical path. |
| B-REAL-FIDO2 | SoftHSM and swu2f exercise interfaces; no physical-YubiKey run yet validates unlock, homed, resident SSH, PAM presence, PIV signing, recovery, failure handling. | Reclassify from blocked-on-VM-software-gap to gated-on-B-VM-CTAP2-closing-first; sequence the physical-hardware demo right after B-VM-CTAP2 goes green. |
| B-HARDENING-RUNTIME | Static audit complete ([refs/systemd-hardening-audit-2026-07-17.md](systemd-hardening-audit-2026-07-17.md)); runtime Bats checks and systemd-analyze verify not yet run against a target image. | Run before pilot: execute the Bats suite and systemd-analyze verify on the actual pilot image, not just statically. Do not claim RestrictFileSystemAccess= enforcement until this runs. |
| B-BOOTC-SEAL | Pinned bootc 1.16.3 lacks container split-kernel-and-rootfs; strict fs-verity is proven through a mutable BLS digest anchor, not a sealed/signed UKI. | Reclassify as a release blocker, not a pilot blocker: the pilot can ship with the current mutable-anchor fs-verity story documented as a known limit, while the sealed-UKI work continues on its own track ([refs/bootc-composefs-sealed-flow-2026-07-22.md](bootc-composefs-sealed-flow-2026-07-22.md)). |
| B-RK3588-TPL, B-ARM64-PATHA | ARM64 hardware not production. | Out of scope for this pilot platform choice, explicitly excluded, not silently dropped. |
| B-QEMU-ZBOOT, B-PINS | Contained workarounds, not open failures. | No action needed for pilot; keep the workaround explicit and PINNED.md current. |

## Physical-YubiKey and recovery demonstration

Cannot be executed by this agent (no physical hardware access). This section specifies what reproducible means so the demo is falsifiable, not a claim:

- Preconditions: B-VM-CTAP2 closed (software coverage proven) before attempting the hardware run, per BLOCKERS.md and B-REAL-FIDO2 sequencing.
- Evidence to capture per run: exact YubiKey model and firmware, host OS build (git SHA plus image digest), each operation command and full output (enroll, LUKS2 unlock, systemd-homed login, PAM presence check, PIV signing, recovery-path exercise, one deliberate failure case such as wrong key or unplugged key).
- Limits to state explicitly: a single YubiKey model and firmware tested is not a hardware compatibility matrix; a lab bench run is not a fleet-scale reliability claim; recovery tested once is not a statistically validated recovery rate.
- Owner: needs a human with physical YubiKey and target hardware; flagged as an open item below.

## Design partner recruitment

- Target profile per OMN-65: release engineering, security platform, firmware, and regulated-lab operators (same profile as the days 0-30 interview list).
- Goal: 2 design partners who will run the pilot on real infrastructure, not just review docs.
- Recruitment channel and candidate list are not sourced in this pass; carried as an open question (also flagged in the OMN-65 draft) pending Jennyâs network or a targeted outreach list.

## Pilot pricing

- Doctrine: price the pilot; do not default to unpaid custom engineering. Concrete pricing structure is OMN-71 (offer and pricing architecture) and OMN-78 (customer ROI model) territory; this doc records the constraint, not the number, to avoid duplicating work already scoped to those issues.
- Minimum bar before recruiting design partners: a priced pilot SOW draft must exist (OMN-84, pilot collateral) so the ask to design partners includes a price, not a blank.

## Operational readiness for a paying pilot

- Vulnerability triage: define an intake path (where a partner reports a finding), a severity rubric, and a target response-time SLA per severity.
- Release severity: define what blocks a release (any BLOCKERS.md row still active for the pilot platform blocks release; a reclassified-out-of-scope row does not).
- Escalation: define who gets paged for a pilot-affecting incident and within what time window.
- Backup: define what pilot-partner data or state needs backing up, and the restore-test cadence.
- Incident communications: define the template and channel for notifying a design partner of an incident, plus the internal post-incident review step.
- None of these five exist yet in the repo as of this draft; treat as new artifacts to create, not existing docs to link.

## Exit criteria

- [ ] B-VM-CTAP2 closed with logged evidence of FIDO2 token enumeration in the VM lane.
- [ ] Physical-YubiKey demonstration run and documented (or explicitly still pending, with owner named).
- [ ] B-HARDENING-RUNTIME runtime checks executed against the pilot image.
- [ ] B-BOOTC-SEAL explicitly reclassified as release-track, not pilot-blocking, with the limit documented.
- [ ] 2 design partners recruited.
- [ ] Priced pilot SOW exists (depends on OMN-71/OMN-84).
- [ ] Vulnerability triage, release severity, escalation, backup, and incident-comms procedures drafted.

## Dependency map

Primary sequence (from OMN-66): OMN-73 (readiness gates and go-to-market) -> OMN-76 (first 90 days) -> OMN-74 (team, budget, use of funds) -> OMN-75 (metrics and reporting).

- OMN-73 defines the gate criteria this docâs exit criteria should ultimately reconcile with.
- This doc (T20) sits between T21 (OMN-65, days 0-30, PR #103) and T19 (OMN-67, days 61-90) in the sequential trio; do T19 next once this lands.

## Open questions

- Design partner candidate list is not sourced (same gap noted in the OMN-65 draft).
- Physical-YubiKey demonstration needs a human with hardware access; not executable from this session.
- Exact pilot price is deferred to OMN-71/OMN-78, intentionally not duplicated here.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.8361). TODO: refine per file context.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.8390). TODO: refine per file context.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-3 7-D Mode D batch (Δ=+0.6561). TODO: refine per file context.
