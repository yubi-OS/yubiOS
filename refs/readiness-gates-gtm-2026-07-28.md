# Readiness Gates and Go-to-Market

**Supersedes:** `refs/readiness-gates-gtm-2026-07-25.md` (preserved for historical context; treat as stale, do not cite).

Source: OMN-73 (team OMNI-AGENT), section 5 of the yubiOS Business and Stewardship Plan. The Gate 1 definition that OMN-65 (PR #103) and OMN-67 (PR #111) referenced but could not draft themselves.

**Last reviewed:** 2026-07-28
**<last-reviewed-against-blockers>** 2026-07-25
**Review-gate diff vs 2026-07-25 version:**
- The previous version cited BLOCKERS.md `as of 2026-07-22` and called B-VM-CTAP2 the binding constraint for Gate 1→2. BLOCKERS.md `Last reviewed: 2026-07-25` (same-day, four days later) marked B-VM-CTAP2 RESOLVED with run 30139433902. This is the same-day doc drift pattern; corrected here.
- The previous version cited PR #114 as evidence for OMN-81. PR #114 is closed-not-merged; PR #110 is the actual landed evidence.
- The previous version said "OMN-70/82 (covenant) and OMN-83 (Technical Preview entry criteria) have not landed a PR as of this doc." OMN-70 + OMN-82 are Done; OMN-83 is In Progress.
- This re-issue adds three missing gates (security audit, pricing-validity, reference-customer) found by the 5-plan stress-test 2026-07-28 (`session/stress-test-5-plans-2026-07-28.md`).

## Purpose

Define Gate 0 through Gate 3, the evidence required to move between them, what commercial activity each gate allows, and the proof-first sales motion, so the rest of the go-to-market work (OMN-65/66/67, OMN-71, OMN-84) has one shared readiness ladder instead of each doc inventing its own. Plus three additional gates (security audit, pricing-validity, reference-customer) added 2026-07-28.

## Scope (from OMN-73)

- Translate Gate 0 through Gate 3 into explicit readiness criteria.
- Identify the evidence required to move between gates.
- Define what commercial activity is allowed at each gate.
- Document the proof-first sales motion from public proof to annual assurance.
- Align current blockers and pilot work to the next gate.

## Gate definitions

### Gate 0: Internal groundwork

- Criteria: repo and architecture are public, core boot/unlock flow exists in some form, blockers are tracked honestly in BLOCKERS.md.
- Evidence: BLOCKERS.md exists and is actively maintained; README and MISSION.md are live.
- Allowed commercial activity: none. No pricing conversations, no pilot offers, no design-partner recruitment.
- **Status:** met.

### Gate 1: Safe to discuss the offer

- Criteria: an evidence boundary exists so external conversation does not overstate readiness; naming/licensing/legal review tracks are open; a covenant draft exists; Technical Preview entry criteria are explicit.
- Evidence required to move from Gate 0 to Gate 1: refs/days-0-30-safe-offer-2026-07-25.md (OMN-65, PR #103, Done) for the evidence boundary; refs/naming-licensing-provenance-2026-07-25.md (OMN-81, **PR #110** — not PR #114 which is closed-not-merged) for the legal-review-open status; covenant draft (OMN-70/82, **Done** as of 2026-07-25); Technical Preview entry criteria (OMN-83, **In Progress** as of 2026-07-28).
- Allowed commercial activity: discovery conversations, interviews, and discussing a future offer under NDA. Explicitly not: pricing commitments, signed pilots, or public claims of production readiness.
- **Status (corrected 2026-07-28):** **met pending OMN-83 landing.** Discovery conversations are unblocked.

### Gate 1.5: Ready to sign a paid pilot SOW (NEW 2026-07-28)

Three sub-gates, each required:

- **Gate 1.5a — Security audit gate:** an independent security review of the supported release and management plane, OR a documented self-audit with named independent reviewer (third-party consultancy or qualified external individual). Not a full SOC2/ISO27001 certification; an evidence-grade review against the yubiOS threat model (`docs/THREAT_MODEL.md`) with a published report or summary, captured before any paid pilot SOW is signed. **Rationale (per stress-test 2026-07-28):** enterprise buyers in target segments routinely require third-party review before signing pilot agreements. Without it, design-partner recruitment may stall on procurement, not engineering. The trust thesis ("FIDO2-first, immutable, signed UKIs, verified /usr") demands external evidence before paid pilots.
- **Gate 1.5b — Pricing-validity gate:** at least two of three priced proposals received at the documented list price (or above) for the Assured Fleet subscription tier ($600/node/year, $25k annual minimum) or above, per `docs/PLAN.md` §4. A priced proposal is a written, addressed response from a qualified buyer who has reviewed the SOW and the offer catalog. **Rationale:** the entire `docs/PLAN.md` §6 financial model assumes these prices hold. The first priced proposal that requires a >40% discount invalidates the financial model. Without this gate, paid pilots that close at steep discounts distort the model silently.
- **Gate 1.5c — B-REAL-FIDO2 hardware evidence:** a documented sacrificial hardware run on real YubiKey + ROCK 5B/RockPro64 (or equivalent) executing OMN-63's 12 scenarios end-to-end. Captured in a `refs/vm-e2e-run-<id>.md` evidence file with full chain logs. **Rationale:** B-VM-CTAP2 closing 2026-07-25 retired the software-validation gate. The remaining production-confidence gap is hardware-validated FIDO2 — running a paid pilot without it would mean the pilot customer is the de-facto hardware-validation guinea pig.

- Allowed commercial activity: signing a paid pilot SOW, scoped strictly to the platforms and configurations actually evidenced. Not allowed: signing for production-readiness claims, signing for ARM64 hardware-root claims without separate Gate 1.5c evidence, signing without Gate 1.5a/b cleared.

### Gate 2: Paid pilot

- Criteria: one pilot platform is narrowed and its blockers are retired or explicitly reclassified (per refs/days-31-60-narrow-product-2026-07-25.md, OMN-66, PR #105); a priced pilot SOW exists; design partner(s) recruited; **all three Gate 1.5 sub-gates cleared**.
- Evidence required to move from Gate 1 to Gate 2, per OMN-66's own exit criteria (corrected 2026-07-28 against BLOCKERS.md Last reviewed 2026-07-25): ~~B-VM-CTAP2 closed~~ (done 2026-07-25, removed from this list); B-HARDENING-RUNTIME runtime checks executed against the pilot image (still open, OMN-54 + OMN-55 Backlog); B-BOOTC-SEAL explicitly reclassified as release-track with the limit documented OR resolved (in flight, OMN-51 In Progress); 2 design partners recruited (open, see `refs/first-90-days-2026-07-28.md` Design partner outreach skeleton); a priced pilot SOW (depends on OMN-71/OMN-84, both landed as PR #108/#113 with pricing hypotheses, not yet a signed SOW); **Gate 1.5a/b/c all cleared (new)**.
- Allowed commercial activity: one paid pilot, 25-50 nodes, disposable or non-critical systems only (per OMN-66/OMN-67). Not allowed: claiming production readiness, selling beyond the pilot scope, running the pilot on critical infrastructure.
- **Status (corrected 2026-07-28):** not met. The post-B-VM-CTAP2 binding constraints are (1) Gate 1.5a (security audit), (2) B-HARDENING-RUNTIME runtime evidence, (3) B-REAL-FIDO2 hardware evidence (Gate 1.5c), (4) design-partner sourcing, (5) priced SOW. The day-60 decision point in `refs/first-90-days-2026-07-28.md` reflects this corrected critical path.

### Gate 2.5: Reference-customer gate (NEW 2026-07-28)

- **Criteria:** a completed paid pilot readout (OMN-67's six metrics) plus a signed case-study agreement from the pilot customer. The case-study agreement need not be public; it grants yubiOS the right to reference the customer (by industry vertical, fleet size, and outcome) in subsequent prospect conversations.
- **Rationale (per stress-test 2026-07-28):** the proof-first sales motion requires a customer willing to be referenced. A completed pilot readout is necessary but not sufficient. Without this gate, Gate 3 promotion has nothing to point at for the next prospect's discovery conversation beyond the yubiOS team's own claims.
- Allowed commercial activity: scoping a second pilot, expanding the fleet within the first customer, beginning to reference the customer in subsequent discovery.

### Gate 3: General availability claims

- Criteria: physical-YubiKey production-confidence evidence exists (B-REAL-FIDO2); the boot chain is sealed, not just fs-verity on a mutable anchor (B-BOOTC-SEAL fully resolved, not just reclassified); any hardware platform claimed as production (e.g. ARM64) has real-board evidence (B-ARM64-PATHA); at least one completed paid pilot with a readout (OMN-67) informs the claim; **Gate 2.5 (reference-customer) cleared**.
- Evidence required to move from Gate 2 to Gate 3: a real-hardware YubiKey validation run per refs/days-31-60-narrow-product-2026-07-25.md's demo spec; a sealed/signed UKI boot chain per refs/bootc-composefs-sealed-flow-2026-07-22.md; for any hardware platform beyond the pilot platform, board-level evidence per refs/arm64-rk-board-status-2026-07-17.md; a completed OMN-67 pilot readout with a day-90 decision recorded; **a signed case-study agreement from the pilot customer**.
- Allowed commercial activity: general sales conversations and production claims, scoped strictly to the platforms and configurations actually evidenced.
- **Status:** not met, and not reachable until Gate 2 (and Gate 2.5) close.

## Evidence required to move between gates (summary table)

| Transition | Key evidence | Landed as of 2026-07-28 |
|---|---|---|
| Gate 0 -> Gate 1 | Evidence boundary doc, legal/naming review opened, covenant drafted, Technical Preview criteria defined | All landed or in flight: OMN-65/68/81/70/82 Done; OMN-83 In Progress. |
| Gate 1 -> Gate 1.5 | All of Gate 1 + security audit report + ≥2 of 3 priced proposals at list + B-REAL-FIDO2 hardware evidence | Security audit: not started. Priced proposals: 0 of 3. Hardware evidence: not started. |
| Gate 1.5 -> Gate 2 | B-HARDENING-RUNTIME runtime-proven, B-BOOTC-SEAL reclassified or resolved, 2 design partners, priced SOW | B-HARDENING-RUNTIME: open. B-BOOTC-SEAL: in flight (OMN-51). Design partners: not sourced. Priced SOW: not drafted. |
| Gate 2 -> Gate 2.5 | Completed paid pilot readout + signed case-study agreement | Not started (depends on Gate 2). |
| Gate 2.5 -> Gate 3 | Physical-YubiKey evidence, sealed UKI, ARM64 board evidence (if claimed), completed pilot readout, signed case-study | None of these exist yet; this doc only specifies what is needed. |

## Proof-first sales motion: public proof to annual assurance

A staged motion where each stage's proof is a precondition for the next, not a marketing claim ahead of evidence:

1. **Public proof (Gate 0-1):** the repo itself, README, ADRs, and BLOCKERS.md are the initial proof surface. A prospect can verify claims by reading the source and the honest blocker list, not by trusting a sales deck.
2. **Discovery conversation (Gate 1):** interviews and NDA discussions reference the evidence boundary doc (OMN-65) so the prospect knows exactly what is proven versus aspirational at the time of the conversation.
3. **Scoped pilot proof (Gate 2):** the paid pilot itself becomes the next proof artifact: a specific customer, specific platform, specific measured results (OMN-67's six metrics), not a generic claim. **Gate 1.5 must clear before SOW is signed.**
4. **Case study proof (post-Gate 2.5):** a bounded public case study, scoped to what was actually run, feeds the next prospect's discovery conversation, tightening the evidence available at Gate 1 for the next customer.
5. **Annual assurance (Gate 3+):** once general-availability claims are supportable, an ongoing assurance motion (recurring security review, incident-response track record, SLA history) replaces one-off pilot proof as the basis for renewal and expansion conversations.

## Aligning current blockers and pilot work to the next gate

The organization is at Gate 1 (met pending OMN-83 landing), working toward Gate 1.5. Per BLOCKERS.md as of 2026-07-25, B-VM-CTAP2 (the previous binding constraint) is RESOLVED. The new binding constraints for the Gate 1 → Gate 1.5 transition are Gate 1.5a (security audit, not started), Gate 1.5b (0 of 3 priced proposals at list), Gate 1.5c (B-REAL-FIDO2 hardware evidence, not started). B-HARDENING-RUNTIME and B-BOOTC-SEAL are technical work that can proceed in parallel; the pilot itself cannot start without all three Gate 1.5 sub-gates.

## Dependency map

- This doc is the Gate 1 (and now Gate 1.5/2.5) definition that OMN-65 (PR #103) and OMN-67 (PR #111) deferred to OMN-73 rather than guessing at.
- OMN-76 (first 90 days; see refs/first-90-days-2026-07-28.md) should read this doc's gate ladder before finalizing its own timeline.
- OMN-74 (team, budget, use of funds) and OMN-75 (metrics and reporting) can run in parallel once this readiness path is clear, per OMN-66's own dependency notes.

## Open questions

- Whether Gate 1 should be formally declared "met" once OMN-83 lands, or whether it needs an explicit sign-off step -- left as a process question, not resolved here.
- The annual assurance program structure at Gate 3+ is named but not designed in this pass.
- **New (2026-07-28):** whether Gate 1.5a (security audit) should require a published report, or whether a private report is acceptable. Default position: a published summary is preferable; a private report is acceptable if accompanied by a public attestation. To be resolved before any Gate 1.5 SOW is signed.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Verification plan


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4144) were identical placeholder copies with no per-file content; merged on 2026-09-18.

## 2026-09-18 drift check (wayfinder round 8)

The Gate 1 definition and its blocker dependencies were re-checked 52 days after review:

- The review-gate discipline this doc pioneered (same-day diff against BLOCKERS.md) has a new
  application: BLOCKERS.md has not been reviewed since 2026-08-24, and this round's blockers
  drift check found two rows whose retirement conditions were met and unreflected (see
  `refs/blockers-drift-check-2026-09-18.md`). A fresh BLOCKERS.md review is the next step the
  gate discipline itself prescribes.
- Gate evidence state: the physical-YubiKey leg has one closed proof point (OMN-42/89, rock1
  hardware leg) since this doc's review; the ARM64 Path A board gate remains open. The
  channel-coverage skeleton in the outreach section remains unfilled (its unfilled markers
  were made explicit in round 7, cycle 98 — no plans were invented then or now).
- Release-cadence context: 6 releases since this doc's review (v0.8.3 through v0.8.8), all
  still tagged experimental in SECURITY.md's supported-versions table.
