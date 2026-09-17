# yubiOS decisions, deferrals, and rejected models â decision log

**Status:** decision log compiled from landed drafts; contradiction-checked | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-79](https://linear.app/omni-agent/issue/OMN-79/decisions-deferrals-and-rejected-models)

## Why this exists

OMN-79 asks to make adoption, deferral, and rejection decisions explicit, check
the plan for contradictions, and publish a reusable decision log. This
compiles what's actually been drafted across the OMNI-AGENT backlog's business
docs (all opened as PRs, none merged yet) into one reference â it doesn't
introduce new decisions, it makes the existing ones checkable in one place, per
OMN-79's own framing.

## 1. Adopted now

| Decision | Source |
|---|---|
| Commercial layer sells services/hardware/support around the trust chain, never access to it | [refs/operating-covenant-2026-07-25.md](operating-covenant-2026-07-25.md) (OMN-70) Â§2 |
| No phone-home telemetry by default | Covenant Â§3, consistent with MISSION.md |
| Trust-chain conflicts resolved against MISSION.md with no self-carve-out; commercial conflicts resolved against covenant Â§2 | [refs/covenant-conflict-policy-2026-07-25.md](covenant-conflict-policy-2026-07-25.md) (OMN-82) Â§2 |
| Seven-offer initial catalog (managed enrollment, hardware bundles, support/SLA, managed CI, consulting, training, grants/pilots) | [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md) (OMN-71) Â§1 |
| Revenue priority ordered by readiness-gate proximity, not assumed offer size | OMN-71 Â§4 |
| Four initial customer segments (individual devs, small security-conscious teams, public-interest orgs, ARM64 device builders) | [refs/who-pays-and-why-2026-07-25.md](who-pays-and-why-2026-07-25.md) (OMN-69) Â§1 |
| Large-enterprise-with-existing-TPM-infra segment explicitly not pursued first | OMN-69 Â§1, "Not selected" note |
| Legal counsel (contractor) hired first, before any engineering hire | [refs/team-budget-use-of-funds-2026-07-25.md](team-budget-use-of-funds-2026-07-25.md) (OMN-74) Â§3 |
| Hiring triggers are evidence-based (first signed pilot, first SLA contract), not calendar-based | OMN-74 Â§5 |
| Five real public-security funding programs screened and prioritized; Sovereign Tech Fund deferred (see Â§2) | [refs/public-security-funding-targets-2026-07-25.md](public-security-funding-targets-2026-07-25.md) (OMN-86) Â§1/Â§4 |

## 2. Explicitly deferred, pending evidence

| Deferred item | What evidence unblocks it | Source |
|---|---|---|
| Year 1 budget envelope (specific dollar figure) | A real funding/revenue number from Jenny or a landed funding document | OMN-74 Â§1 |
| Three-year revenue/cost model base case (specific figures) | The budget envelope above, plus completed pilot data | [refs/three-year-revenue-cost-model-2026-07-25.md](three-year-revenue-cost-model-2026-07-25.md) (OMN-77) Â§1/Â§5 |
| Runway and unit-economics targets | At least one completed pilot cycle | OMN-77 Â§5 |
| Entity type selection (LLC, sole proprietorship, etc.) | Jenny's actual tax/liability situation and funding path; not decidable by this session | [refs/entity-governance-legal-2026-07-25.md](entity-governance-legal-2026-07-25.md) (OMN-72) Â§1 |
| Advisory/governance structure beyond single-founder | Team growth past one person | OMN-72 Â§2 |
| Sovereign Tech Fund application | yubiOS shipping a stable, non-prototype deliverable (the fund excludes prototypes) | OMN-86 Â§1, Sovereign Tech Fund row |
| OTF FOSS Sustainability Fund application | A concrete at-risk-user use case mapping to OTF's mission, not a generic pitch | OMN-86 Â§1/Â§3 |
| Section 4 of the covenant (reconciliation with pricing model) | OMN-71/69 landing as merged, reviewable work â drafted but not yet merged | Covenant Â§4, echoed in [refs/covenant-conflict-policy-2026-07-25.md](covenant-conflict-policy-2026-07-25.md) Â§4 |
| Naming/trademark resolution ("yubiOS" vs. Yubico) | Real trademark counsel, not AI-assisted research | [refs/naming-licensing-provenance-2026-07-25.md](naming-licensing-provenance-2026-07-25.md) (OMN-81) Â§1 |
| Per-fork license verification (bootc/mkosi/bcvk/TF-A/OP-TEE/U-Boot/ms-tpm-20-ref) | Pulling each fork's actual LICENSE file | OMN-81 Â§2 |
| Pricing hypotheses for all seven offers | Real customer conversations in a paid pilot | OMN-71 Â§2, OMN-84 Â§4 |

## 3. Explicitly rejected as the primary path

| Rejected model | Why | Source |
|---|---|---|
| Selling a stronger/different trust-chain mechanism as a paid tier | Directly conflicts with covenant Â§2's "not allowed" list and the conflict policy's no-self-carve-out rule | Covenant Â§2, conflict policy Â§1 |
| Withholding security fixes from non-paying users / early access for paying customers | Conflicts with covenant Â§3 Disclosure ("fixes ship to everyone simultaneously") | Covenant Â§3, echoed in OMN-84's data-sheet template |
| Requiring customer key-material custody as a condition of any paid offer | Conflicts with covenant Â§2 | Covenant Â§2, OMN-71 offer screening, OMN-74 role framing |
| Telemetry-on-by-default for the OS itself | Conflicts with covenant Â§3 and MISSION.md's stated stance | Covenant Â§3 |
| Competing first for large-enterprise customers with existing TPM/HSM infrastructure | MISSION.md's own stated edge narrows there; not the initial target | OMN-69 Â§1 "Not selected" |
| A funder buying roadmap priority or a governance seat over trust-chain decisions | Screened out by OMN-86 Â§2's criteria, derived from covenant/conflict-policy roadmap-control commitments | OMN-86 Â§2 |
| Treating AI-assisted contributions as needing no provenance trail | The existing `Assisted-by` / no-auto-`Signed-off-by` convention is kept, not dropped, even though it's informal | OMN-81 Â§3 |

## 4. Contradiction check

Checked the adopted/deferred/rejected items above against each other and
against MISSION.md/covenant directly:

- **No contradiction found** between OMN-71's revenue-priority ordering
  (support/SLA gated on B-VM-CTAP2) and OMN-74's hiring-trigger logic (support
  hire triggered by first SLA contract) â both are gated on the same
  readiness-gate-then-contract sequence, consistently.
- **No contradiction found** between the covenant's "no telemetry by default"
  and O1/O4's hosted/managed offers, since those offers' service-operation
  data collection is explicitly scoped as data about a chosen paid product,
  not OS-level telemetry (covenant Â§3, restated in OMN-84's data sheet
  template) â the distinction is maintained consistently across both
  documents, not just asserted once.
- **Flagged, not a contradiction â a sequencing dependency**: OMN-70's own Â§4
  says its reconciliation-with-pricing section can't complete until OMN-71/69
  land; OMN-82's Â§4 repeats the same dependency. Both PRs (#106, #107) were
  opened before OMN-71/69 (#108, #116) â this is a normal draft-then-
  reconcile order, not a contradiction, but the reconciliation itself hasn't
  happened yet and shouldn't be assumed done just because all the docs now
  exist. **This is the one open follow-up this decision log surfaces**: once
  OMN-71/69 are confirmed landed (not just drafted), someone should actually
  re-read covenant Â§4 / conflict-policy Â§4 against the real offer catalog and
  close that loop, rather than leaving four documents that all say "pending"
  indefinitely.
- **No contradiction found** in the "who decides" framing â OMN-72 Â§2
  references OMN-82's single-founder decision-authority framing rather than
  proposing a competing governance structure.

## 5. Reusable form

The tables in sections 1â3 are the reusable decision log â copy a row's
pattern (`Decision | Source`, or `Rejected model | Why | Source`) when a new
decision needs recording, rather than starting a new document format. Update
this file (or its eventual promoted, merged version) when:
- A deferred item (Â§2) gets its blocking evidence and becomes either adopted
  or rejected.
- A new decision is made that could contradict an existing row â re-run
  section 4's check against the new decision before publishing it.

## Dependencies

References, without duplicating, **OMN-70/82** (PR #106/#107), **OMN-71**
(PR #108), **OMN-69** (PR #116), **OMN-74** (PR #112), **OMN-77** (PR #122),
**OMN-84** (PR #113), **OMN-86** (PR #120), **OMN-81** (PR #110), and
**OMN-72** (PR #117). This document should be re-checked once any of those
PRs actually merges to main, since it's currently compiled from open-PR state.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
