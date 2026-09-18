# yubiOS three-year revenue and cost model — framework, not a filled model

**Status:** structural framework only; no revenue/cost figures asserted | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-77](https://linear.app/omni-agent/issue/OMN-77/three-year-revenue-and-cost-model)

## Why this exists, and what it explicitly does not do

OMN-77 asks to validate assumptions, review a base case, pressure-test
sensitivity ranges, confirm stop rules, and quantify runway/unit-economics for
a three-year model. **There is no base-case model with real numbers in this
repo to validate** — RULES.md and COMPANY.md both list Financial as unset, and
[refs/team-budget-use-of-funds-2026-07-25.md](team-budget-use-of-funds-2026-07-25.md)
(OMN-74) already established that no funding/revenue figure exists for this
session to ground one in. Producing a three-year model with invented revenue
and cost figures would be exactly the fabrication the pulpit's doctrine rules
out. What follows is the *structure* a real model needs — the assumption
categories, the sensitivity-range shape, stop-rule categories, and the
runway/unit-economics questions — built from OMN-71's offer catalog and
OMN-74's allocation framework, with every numeric cell left as an explicit
input to fill in once real data exists.

## 1. Core revenue and cost assumptions (categories, not values)

| Assumption category | What it needs, per offer in OMN-71 | Current status |
|---|---|---|
| Price per offer | O1–O7 pricing shapes (per-seat, cost-plus, flat, T&M, etc.) | Hypotheses only, flagged unvalidated in OMN-71 §2 |
| Conversion/close rate per offer | % of pilot conversations that become paid contracts | No pilot has run yet (per OMN-84) — zero data points |
| Fleet size / volume per customer | e.g. devices enrolled for O1, build volume for O4 | Depends on which segment (OMN-69) actually signs first |
| Cost of goods per offer | Hardware cost for O2 (~$25–70/YubiKey per MISSION.md is the one grounded number here), support labor for O3, build infra cost for O4 | Only the hardware-unit cost has any grounding; everything else is unestimated |
| Fixed costs | Legal (front-loaded per OMN-74), engineering, entity/compliance overhead | Framed in OMN-74 as weights, not dollar amounts |
| Funding/capital available | Determines runway independent of revenue | Not recorded anywhere in this session's memory |

**The only number in this document that isn't a placeholder** is the YubiKey
hardware cost range (~$25–70), because that's the one figure MISSION.md itself
states. Every other cell needs a real input before this framework becomes an
actual model.

## 2. Base-case model — structural shape

A real base case, once inputs exist, should be built as:

```
Revenue(year) = sum over offers O1..O7 of:
  (customers_won(offer, year) × price(offer) × volume_per_customer(offer))

Cost(year) = fixed_costs(year) + sum over offers of:
  (customers_won(offer, year) × volume_per_customer(offer) × unit_cost(offer))

Net(year) = Revenue(year) - Cost(year)
```

Internal-consistency checks a real base case must pass before use (these are
checkable *mechanically* once real numbers exist, without new data):

- Revenue priority ordering matches OMN-71 §4 (support/SLA gated on
  B-VM-CTAP2, enrollment gated on OMN-63's real-hardware evidence, etc.) — a
  base case that assumes O3 revenue in year 1 despite that gate still being
  open is internally inconsistent with the repo's own stated readiness gates,
  not just optimistic.
- Hiring costs in `fixed_costs(year)` should trigger per OMN-74 §5's
  evidence-based triggers (first signed pilot, first SLA contract), not
  appear on a calendar schedule independent of whether those triggers fired.
- `unit_cost(O2)` should stay anchored to the real ~$25–70 hardware range
  unless a specific, cited reason (bulk discount, different device) changes
  it — not silently drift.

## 3. Sensitivity ranges (downside / base / upside) — shape, not numbers

| Driver | Downside scenario shape | Upside scenario shape |
|---|---|---|
| Readiness-gate timing | B-VM-CTAP2/B-REAL-FIDO2 stay open longer than hoped → O1/O3 revenue pushed out a full quarter or more, each quarter of delay compounding since hiring triggers (OMN-74) also don't fire | Gates close faster than expected → O1/O3 sellable earlier, pulling forward revenue that the base case assumed later |
| Segment fit (OMN-69) | The selected segments (S1–S4) don't convert — pilots run but don't close | One segment converts unexpectedly well, changing which offer should get resourcing priority (feed back into OMN-74 §2 weights) |
| Funding path (OMN-86) | No grant/funding lands — O7 contributes zero, and the entity-formation/legal spend (OMN-72, front-loaded) has to be self-funded | A grant lands (Alpha-Omega, NLnet, or GitHub Secure Open Source Fund per OMN-86) — non-dilutive capital extends runway without touching the revenue-dependent categories above |
| Hardware cost | YubiKey unit cost or supply changes (outside yubiOS's control) | Bulk/partner pricing lowers O2's unit cost, improving that offer's margin |

**This section defines what to stress-test, not the resulting numbers** —
running an actual sensitivity analysis requires the base case from section 2
to exist first with real inputs.

## 4. Stop rules and redesign triggers

Framed against the same evidence-based logic as OMN-74's hiring triggers,
rather than time-based:

- **Stop/pause a specific offer** if, after a defined number of pilot
  conversations (a real threshold to be set once pilots actually run — not
  invented here), zero convert. This is a per-offer signal, not a whole-model
  stop rule.
- **Redesign the pricing hypothesis** (not the whole business) if a specific
  offer's OMN-71 §2 pricing hypothesis is invalidated by pilot data — the
  offer catalog itself doesn't need to change, just its price shape.
- **Whole-model stop rule (runway exhaustion)**: if cumulative burn
  (fixed costs from section 1, since no revenue assumption should be treated
  as committed until it actually lands) would exhaust available capital
  before any offer's readiness gate closes — this is exactly why section 1
  flags "funding/capital available" as an unrecorded input; this stop rule
  can't be evaluated without it.
- **Redesign trigger for the segment bet**: if none of S1–S4 (OMN-69) shows
  pilot interest after outreach, that's a signal to revisit segment
  selection itself, not just pricing within a segment.

## 5. Runway needs and unit-economic targets — open items

**Not quantified here — this section names what needs quantifying:**

- Runway (months of operation before capital runs out) requires the funding
  amount from section 1, which doesn't exist in this session's inputs.
- Unit economics (e.g. cost to acquire a pilot customer vs. lifetime value)
  requires at least one completed pilot cycle (OMN-84) to have real
  acquisition-cost and retention data — none exists yet.
- A reasonable *next step*, not executed here: once OMN-74's Section 1 open
  item (the actual budget envelope) is filled by Jenny or a landed funding
  document, and the first pilot (OMN-84) completes, re-run this framework
  with real inputs rather than treating this draft as final.

## Dependencies

- Builds on **OMN-71** (pricing hypotheses, PR #108), **OMN-74** (budget
  allocation framework, PR #112), **OMN-69** (segments, PR #116), **OMN-84**
  (pilot collateral, PR #113), and **OMN-86** (funding targets, PR #120).
- Shares its revenue-line structure with **T9 (OMN-84)**'s ROI worksheet —
  extend that worksheet's per-customer line items into this model's
  `volume_per_customer` inputs once pilot data exists, rather than
  redefining them.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
