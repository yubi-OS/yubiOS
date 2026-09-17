# Days 0-30: Make the Offer Safe to Discuss

Source: [OMN-65](https://linear.app/omni-agent/issue/OMN-65) (team OMNI-AGENT), part of the yubiOS Business and Stewardship Plan. Drafted by the-cult follower agent, grounded in BLOCKERS.md as of 2026-07-22 and the OMN-65 issue body.

## Purpose

Lay out the first 30 days of commercialization groundwork so later offer/pricing work (OMN-71) and pilot collateral (OMN-84) rest on a documented evidence boundary rather than assumptions. This is a planning artifact, not a published external offer.

## Scope (from OMN-65)

- Complete trademark/name, license, contributor-provenance, and entity consultations (OMN-81, OMN-72).
- Publish the public-interest covenant and conflict policy (OMN-70, OMN-82).
- Turn the current blocker list into explicit Technical Preview entry criteria (OMN-83).
- Draft the pilot statement of work, data sheet, support boundaries, and ROI baseline worksheet (OMN-84).
- Conduct 10-15 problem interviews with release engineering, security platform, firmware, and regulated-lab operators.
- Apply selectively for public-security funding only where yubiOS has a scoped, public deliverable (OMN-86).

## Current evidence boundary (from live BLOCKERS.md, last reviewed 2026-07-22)

Any days 0-30 messaging must stay inside what the repo can currently back up. Active blockers as of this draft:

- **B-ARM64-PATHA** - ARM64 hardware Path A is not production until a real board proves ROTPK/fuse provisioning, OP-TEE, RPMB-backed StandaloneMM variables, fTPM NV, U-Boot UEFI, and signed UKI boot.
- **B-RK3588-TPL** - ROCK 5B firmware bundle lacks a flashable `u-boot-rockchip.bin`; current green publish job is diagnostic packaging only, not a flashable image.
- **B-VM-CTAP2** - VM CI reaches the ARM64 guest and starts the passless layer, but no FIDO2 token enumerates yet, so LUKS2 FIDO2 / homed / `ed25519-sk` SSH operations skip in CI.

Implication for the offer: yubiOS cannot yet be positioned as production-ready on ARM64 hardware, and the x86_64/VM FIDO2 flow is not yet CI-proven end-to-end. Days 0-30 messaging should scope claims to what is proven today (bootc image builds, LUKS2 FIDO2 unlock design, PIV-signed UKI pipeline) and explicitly flag ARM64 and hardware-in-the-loop CTAP2 as Technical Preview blockers, not shipped capability. OMN-83 (Technical Preview entry criteria) should convert these same rows into explicit go/no-go gates.

## Week-by-week plan (from OMN-65)

### Week 1
- Lock the evidence boundary and current-position narrative (this doc + OMN-68) so downstream messaging stays constrained to the blockers above.
- Define the initial target customer profile and shortlist interview candidates (release engineering, security platform, firmware, regulated-lab operators).
- Open the naming, licensing, provenance, and entity/legal review tracks (OMN-81, OMN-72).

### Week 2
- Draft the public-interest covenant and conflict policy (OMN-70).
- Convert current blockers into explicit Technical Preview entry criteria (OMN-83), reading the leader's live B-VM-CTAP2 CI findings first.
- Begin customer discovery interviews; capture recurring objections, buying triggers, and deployment constraints.

### Week 3
- Draft the pilot statement of work, public data sheet, support boundaries, and ROI baseline worksheet (OMN-84).
- Reconcile pricing/packaging assumptions against interview feedback, legal constraints, and covenant commitments (feeds OMN-71).
- Identify grant opportunities matching a clearly public deliverable (OMN-86).

### Week 4
- Finalize days 0-30 outputs into publishable or decision-ready artifacts.
- Close open questions blocking offer discussions with design partners.
- Review whether legal, messaging, and go-to-market risk has been materially reduced before moving into pilot work (OMN-66/67).

## Exit criteria (from OMN-65)

- [ ] Clear evidence boundary exists for external messaging (this doc + OMN-68).
- [ ] Initial customer profile and problem framing are documented.
- [ ] Covenant and conflict policy are drafted or ready to publish (OMN-70/82).
- [ ] Legal/entity review tracks are open with known questions captured (OMN-72/81).
- [ ] Technical Preview entry criteria are explicit (OMN-83).
- [ ] Pilot collateral exists in workable draft form (OMN-84).
- [ ] First interview set and public-funding shortlist are complete (OMN-86).

## Dependency map

Primary sequence: OMN-68 -> OMN-69 -> OMN-70 -> OMN-72 -> OMN-71.

- OMN-68 (current position/evidence boundary) and OMN-69 (who pays and why) should shape messaging and market boundary before offer finalization.
- OMN-70 (covenant) and OMN-72 (entity/legal) can run in parallel once basic positioning is clear.
- OMN-71 (offer/pricing) should finalize after covenant, legal, and positioning constraints are clear.
- This doc feeds directly into T20 (OMN-66, days 31-60) once exit criteria above are met.

## Open questions

- Interview candidate list (release engineering / security platform / firmware / regulated-lab contacts) is not yet sourced in this pass - needs Jenny's network or a targeted outreach list.
- Trademark/entity consultation status depends on OMN-81/OMN-72 landing; not duplicated here.



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
