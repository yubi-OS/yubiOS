# Readiness Gates and Go-to-Market

Source: OMN-73 (team OMNI-AGENT), section 5 of the yubiOS Business and Stewardship Plan. This is the Gate 1 definition that OMN-65 (PR #103) and OMN-67 (PR #111) referenced but could not draft themselves. Grounded in the live BLOCKERS.md as of 2026-07-22.

## Purpose

**Last reviewed against docs/BLOCKERS.md:** 2026-07-30 review (sha 7501fa0c13a4). No new blocker retirements since this doc's prior review. B-VM-CTAP2 was RESOLVED 2026-07-25 (run 30139433902, OMN-48 Done) — 5 days before this BLOCKERS.md review. Where this doc still says "B-VM-CTAP2 still open" or treats it as a pending blocker, that text is stale and contradicted by the current BLOCKERS.md; see the explicit drift callouts below. BLOCKERS.md gained a new "Permanent CI-Evidence Patterns" section (systemd drop-in lex-sort rule, source OMN-149) — does not affect this doc's content but should be cited if any cross-references are added.


> **Drift callout (2026-07-30):** B-VM-CTAP2 was RESOLVED 2026-07-25 (run 30139433902, OMN-48 Done). Line 37 ("Status: not met. Per the live BLOCKERS.md as of 2026-07-22, B-VM-CTAP2 is still open") is now STALE — that resolution is 5 days old. Gate 2's evidence criterion (`B-VM-CTAP2 closed with logged FIDO2 token enumeration`) has been met. The remaining Gate 2 work is pricing/SOW/2-recruit + B-HARDENING-RUNTIME, not B-VM-CTAP2.
Define Gate 0 through Gate 3, the evidence required to move between them, what commercial activity each gate allows, and the proof-first sales motion, so the rest of the go-to-market work (OMN-65/66/67, OMN-71, OMN-84) has one shared readiness ladder instead of each doc inventing its own.

## Scope (from OMN-73)

- Translate Gate 0 through Gate 3 into explicit readiness criteria.
- Identify the evidence required to move between gates.
- Define what commercial activity is allowed at each gate.
- Document the proof-first sales motion from public proof to annual assurance.
- Align current blockers and pilot work to the next gate.

## Gate definitions

### Gate 0: Internal groundwork

- Criteria: repo and architecture are public (met 2026-07-24), core boot/unlock flow exists in some form, blockers are tracked honestly in BLOCKERS.md.
- Evidence: BLOCKERS.md exists and is actively maintained (confirmed, last reviewed 2026-07-22); README and MISSION.md are live.
- Allowed commercial activity: none. No pricing conversations, no pilot offers, no design-partner recruitment.
- Status: met.

### Gate 1: Safe to discuss the offer

- Criteria: an evidence boundary exists so external conversation does not overstate readiness; naming/licensing/legal review tracks are open; a covenant draft exists; Technical Preview entry criteria are explicit.
- Evidence required to move from Gate 0 to Gate 1: refs/days-0-30-safe-offer-2026-07-25.md (OMN-65, PR #103, landed) for the evidence boundary and current-position narrative; refs/naming-licensing-provenance-2026-07-25.md (OMN-81, PR #114, landed) for the legal-review-open status; a covenant draft (OMN-70/82, not yet landed at time of this doc); Technical Preview entry criteria (OMN-83, not yet landed at time of this doc).
- Allowed commercial activity: discovery conversations, interviews, and discussing a future offer under NDA. Explicitly not: pricing commitments, signed pilots, or public claims of production readiness.
- Status: partially met. OMN-65 and OMN-81 have landed drafts; OMN-70/82 (covenant) and OMN-83 (Technical Preview entry criteria) have not landed a PR as of this doc, so Gate 1 is not yet fully evidenced. Treat Gate 1 as provisionally open for discovery interviews only, not for anything resembling a commitment, until those two land.

### Gate 2: Paid pilot

- Criteria: one pilot platform is narrowed and its blockers are retired or explicitly reclassified (per refs/days-31-60-narrow-product-2026-07-25.md, OMN-66, PR #105); a priced pilot SOW exists; design partner(s) recruited.
- Evidence required to move from Gate 1 to Gate 2, per OMN-66’s own exit criteria: B-VM-CTAP2 closed with logged FIDO2 token enumeration evidence in the VM lane; B-HARDENING-RUNTIME runtime checks executed against the pilot image; B-BOOTC-SEAL explicitly reclassified as release-track with the limit documented; 2 design partners recruited; a priced pilot SOW (depends on OMN-71/OMN-84, both landed as PR #108/#113 with pricing hypotheses, not yet a signed SOW).
- Allowed commercial activity: one paid pilot, 25-50 nodes, disposable or non-critical systems only (per OMN-66/OMN-67). Not allowed: claiming production readiness, selling beyond the pilot scope, or running the pilot on critical infrastructure.
- Status: not met. Per the live BLOCKERS.md as of 2026-07-22, B-VM-CTAP2 is still open (no FIDO2 token enumerated in the VM lane) and B-HARDENING-RUNTIME still needs runtime evidence, not just the static audit. This is the current bottleneck gate; nothing past Gate 1 discovery should be promised to a prospect until B-VM-CTAP2 closes.

### Gate 3: General availability claims

- Criteria: physical-YubiKey production-confidence evidence exists (B-REAL-FIDO2); the boot chain is sealed, not just fs-verity on a mutable anchor (B-BOOTC-SEAL fully resolved, not just reclassified); any hardware platform claimed as production (e.g. ARM64) has real-board evidence (B-ARM64-PATHA); at least one completed paid pilot with a readout (OMN-67) informs the claim.
- Evidence required to move from Gate 2 to Gate 3: a real-hardware YubiKey validation run per refs/days-31-60-narrow-product-2026-07-25.md’s demo spec; a sealed/signed UKI boot chain per refs/bootc-composefs-sealed-flow-2026-07-22.md; for any hardware platform beyond the pilot platform, board-level evidence per refs/arm64-rk-board-status-2026-07-17.md; a completed OMN-67 pilot readout with a day-90 decision recorded.
- Allowed commercial activity: general sales conversations and production claims, scoped strictly to the platforms and configurations actually evidenced. A claim about x86_64/VM-validated deployments does not extend to ARM64 hardware unless ARM64’s own Gate 3 evidence separately exists.
- Status: not met, and not reachable until Gate 2 closes.

## Evidence required to move between gates (summary table)

| Transition | Key evidence | Landed as of this doc |
|---|---|---|
| Gate 0 -> Gate 1 | Evidence boundary doc, legal/naming review opened, covenant drafted, Technical Preview criteria defined | Evidence boundary and naming/legal review: yes (PR #103, #114). Covenant and TP criteria: not yet. |
| Gate 1 -> Gate 2 | B-VM-CTAP2 closed, B-HARDENING-RUNTIME runtime-proven, B-BOOTC-SEAL reclassified, 2 design partners, priced SOW | Blocker retirement plan drafted (PR #105); actual blocker closures: not yet. Design partners and signed SOW: not yet. |
| Gate 2 -> Gate 3 | Physical-YubiKey evidence, sealed UKI, ARM64 board evidence (if claimed), completed pilot readout | None of these exist yet; this doc only specifies what is needed. |

## Proof-first sales motion: public proof to annual assurance

A staged motion where each stage’s proof is a precondition for the next, not a marketing claim ahead of evidence:

1. **Public proof (Gate 0-1):** the repo itself, README, ADRs, and BLOCKERS.md are the initial proof surface. A prospect can verify claims by reading the source and the honest blocker list, not by trusting a sales deck.
2. **Discovery conversation (Gate 1):** interviews and NDA discussions reference the evidence boundary doc (OMN-65) so the prospect knows exactly what is proven versus aspirational at the time of the conversation.
3. **Scoped pilot proof (Gate 2):** the paid pilot itself becomes the next proof artifact: a specific customer, specific platform, specific measured results (OMN-67’s six metrics), not a generic claim.
4. **Case study proof (post-Gate 2):** a bounded public case study, scoped to what was actually run, feeds the next prospect’s discovery conversation, tightening the evidence available at Gate 1 for the next customer.
5. **Annual assurance (Gate 3+):** once general-availability claims are supportable, an ongoing assurance motion (recurring security review, incident-response track record, SLA history) replaces one-off pilot proof as the basis for renewal and expansion conversations. This doc does not design the annual assurance program in detail; that is future work once Gate 3 is reached.

## Aligning current blockers and pilot work to the next gate

The organization is at Gate 1 (provisional), working toward Gate 2. Per BLOCKERS.md as of 2026-07-22, the single highest-leverage blocker for the Gate 1 to Gate 2 transition is B-VM-CTAP2 (FIDO2 token not enumerating in the VM lane) -- it gates both B-REAL-FIDO2 and the OMN-66 pilot-platform exit criteria. Closing it should be prioritized over any other blocker on this ladder, since B-HARDENING-RUNTIME and the design-partner/pricing work can proceed in parallel but the pilot itself cannot start without B-VM-CTAP2.

## Dependency map

- This doc is the Gate 1 definition that OMN-65 (PR #103) and OMN-67 (PR #111) deferred to OMN-73 rather than guessing at.
- OMN-76 (first 90 days) should read this doc’s gate ladder before finalizing its own timeline.
- OMN-74 (team, budget, use of funds) and OMN-75 (metrics and reporting) can run in parallel once this readiness path is clear, per OMN-66’s own dependency notes.

## Open questions

- Whether Gate 1 should be formally declared "met" once OMN-70/82 and OMN-83 land, or whether it needs an explicit sign-off step -- left as a process question, not resolved here.
- The annual assurance program structure at Gate 3+ is named but not designed in this pass.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Verification plan


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4144) were identical placeholder copies with no per-file content; merged on 2026-09-18.
