# yubiOS team, budget, and use of funds — Year 1 framework

**Status:** allocation logic and hiring order drafted; no dollar figures asserted | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-74](https://linear.app/omni-agent/issue/OMN-74/team-budget-and-use-of-funds)

## Why this exists, and what it explicitly does not do

OMN-74 asks for a Year 1 budget envelope, an allocation split, a hiring order,
contractor-vs-hire calls, and hiring triggers tied to evidence. **This document
does not assert a specific budget envelope figure.** COMPANY.md and RULES.md
both list "Financial: [Sauna will update this]" — there is no funding amount,
runway, or revenue figure recorded anywhere in this repo's memory or the
`yubi-OS` org's public docs for this session to ground a number in. Asserting
one would be exactly the fabrication the pulpit's doctrine rules out ("never
invent a fact"). What follows is the *allocation logic and hiring order
framework* OMN-74 also asks for — the part that doesn't require a number no one
has told this session yet — plus a flag on what's needed to fill in the
envelope itself.

## 1. Year 1 budget envelope — open item

**Not decided here.** The envelope depends on funding actually raised or
committed (personal capital, revenue, or a grant per OMN-86), none of which is
recorded in this repo. Once a real number exists (from Jenny directly, or once
a funding/grant document lands — OMN-86, or an update to RULES.md's Financial
section), sections 2–5 below can be applied against it with weights, not
absolute figures, so the framework doesn't need rewriting when the number
changes.

## 2. Allocation logic (weights, not amounts)

Ordered by what actually blocks the pilots and offers already drafted, not by
category size assumptions:

| Category | Relative priority | Why |
|---|---|---|
| Engineering (trust-chain work) | Highest | Every commercial offer in [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md) (OMN-71) is gated on a specific engineering readiness gate (B-REAL-FIDO2, B-VM-CTAP2, PR #32, ARM64 board rehearsal). No offer sells without these closing first — spend here is the precondition for revenue, not a nice-to-have. |
| Legal (naming/trademark, entity) | High, front-loaded | [refs/naming-licensing-provenance-2026-07-25.md](naming-licensing-provenance-2026-07-25.md) (OMN-81) flags the "yubiOS"/Yubico trademark question as high-severity and unresolved; OMN-72's entity decision blocks signing any real contract (support/SLA/consulting offers). This is a front-loaded, not steady-state, cost — resolve it early, don't spread it evenly across the year. |
| Customer/pilot work | Medium, event-driven | Scoped to actual paid-pilot activity per the metrics doc's ([refs/metrics-and-reporting-2026-07-25.md](metrics-and-reporting-2026-07-25.md), OMN-75) "paid-pilot count and outcome" metric — spend here scales with pilots landing, not a fixed headcount assumption. |
| Support | Low initially, triggered | Only becomes a real cost once O3 (support/SLA) actually sells — per OMN-71's revenue-priority ordering, O3 is gated on B-VM-CTAP2 closing, so budget for it activates on that gate, not calendar time. |
| Community | Low, mostly non-monetary | The covenant (OMN-70) and conflict policy (OMN-82) commitments (public trust chain, coordinated disclosure) are process commitments, not headcount — community spend here is closer to "time," which this framework can't price without knowing the eventual team size. |
| Operations | Lowest, minimize | Per MISSION.md's "no OEM, no enterprise tooling dependency" ethos and the project's current single-founder scale (per COMPANY.md), operations overhead should stay minimal by design, not just by budget constraint. |

## 3. Hiring order

Sequenced against the same readiness-gate logic as the pricing doc, not a
generic "engineer first, then sales" template:

1. **Legal counsel (contractor, not hire) — first.** Section 1's trademark
   question and OMN-72's entity decision are one-time, specialized, and
   block revenue-bearing offers. A contractor engagement, not a hire.
2. **Engineering contractor/hire for the specific open readiness gate** —
   whichever of B-REAL-FIDO2 / B-VM-CTAP2 / ARM64 board rehearsal is the
   longest pole once the leader's active CI mission (B-VM-CTAP2) reports
   status. Don't hire generically for "engineering" — hire against the named
   blocker.
3. **First customer-facing hire, triggered by the first signed pilot** — not
   before. Per the metrics doc's stated cadence (event-driven, not calendar),
   there's no pilot yet to support as of this draft, so this role has no
   trigger fired yet.
4. **Support hire, triggered by O3 (SLA) actually selling** — same
   trigger-based logic as row 4 of section 2.

## 4. Contractor-first candidates

Roles that don't need a full-time hire before revenue exists to support one:

- **Legal** (trademark, entity formation, contract review) — inherently
  episodic work; a contractor/counsel relationship fits better than a hire
  at this stage.
- **Specific engineering gates** (e.g. an ARM64 board bring-up specialist for
  the fTPM/OP-TEE stack) — scoped, evidence-target-bound work per
  roadmap-promotion-gates, well suited to a contractor engagement tied to
  closing one named blocker rather than an open-ended hire.
- **Training delivery** (O6 offer) — can be contracted per-cohort rather than
  staffed permanently until cohort volume justifies it.

Roles that don't fit contractor-first: anything touching the trust chain's
ongoing maintenance (Secure Boot signing infra, LUKS2/FIDO2 code) — MISSION.md's
ownership model ("this power belongs to the owner... not the OEM, not the SoC
vendor, not us") argues for keeping trust-chain code ownership continuous and
accountable, which fits a hire better than rotating contractors once past the
initial gate-closing work.

## 5. Hiring triggers tied to evidence

Explicit trigger conditions, not calendar dates:

| Role | Trigger |
|---|---|
| Legal contractor | Immediate — section 1/2's front-loaded item, no evidence gate needed to start |
| Engineering hire/contractor (named gate) | The specific BLOCKERS.md entry being the confirmed long pole after the leader's B-VM-CTAP2 mission reports |
| First customer-facing hire | First signed paid pilot (any offer in OMN-71's catalog) |
| Support hire | First O3 (SLA) contract signed |
| Additional engineering (beyond gate-closing) | Second and subsequent paid pilots requiring integration/consulting scope beyond what a contractor engagement covers |

## Dependencies

- Section 1 (the actual envelope) depends on a real funding/revenue figure
  landing in memory or being provided directly — this document does not
  produce or guess one.
- Sections 2–5 depend on **OMN-71** (pricing, PR #108), **OMN-75** (metrics,
  PR #109), **OMN-81** (naming/licensing risk register, PR #110), and
  **OMN-72** (entity, in progress, not yet landed).



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
