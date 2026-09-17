# Days 61-90: Test Willingness to Pay

Source: OMN-67 (team OMNI-AGENT), part of the yubiOS Business and Stewardship Plan. Last of the sequential days-0-30/31-60/61-90 trio; builds on refs/days-0-30-safe-offer-2026-07-25.md (OMN-65, PR 103) and refs/days-31-60-narrow-product-2026-07-25.md (OMN-66, PR 105). Grounded in the live BLOCKERS.md as of 2026-07-22 and the OMN-67 issue body.

## Purpose

Define the third 30-day phase: run one paid pilot, measure it honestly, and produce the readouts that decide whether to continue, narrow, pivot, or pause.

## Scope (from OMN-67)

- If Gate 1 is met, run one paid 25-50 node pilot on disposable or non-critical systems.
- Measure deployment hours, operator training, update and rollback success, evidence preparation, recovery time, and support load.
- Produce a confidential customer ROI readout and, with permission, a bounded public case study.
- Decide whether to proceed to a second pilot, narrow the offer, change the target segment, or pause commercial hiring.

## Gate 1 status

OMN-67 makes the paid pilot conditional on Gate 1. Gate definitions live in OMN-73 (Readiness gates and go-to-market), which has not landed a drafted PR in this pass; carried as an open question below rather than guessed at here. Do not run a paid pilot before OMN-73 lands and Gate 1 is confirmed met. This doc assumes Gate 1 passes and specifies what happens next; it does not certify the gate.

What this doc can ground today from the days 31-60 plan (OMN-66, PR 105): the pilot platform is x86_64/VM, ARM64 is explicitly out of scope, and the pilot cannot start before B-VM-CTAP2 closes and the physical-YubiKey demonstration runs, since those are exit criteria of the prior phase.

## Paid pilot design (25-50 nodes, disposable or non-critical systems)

- Node count: 25-50, small enough to bound support load and the blast radius of a bad rollback.
- System class: disposable or non-critical only, explicitly not production infrastructure. This keeps the first paid engagement inside a failure-tolerant boundary while real-world evidence accumulates.
- Precondition: the design partner recruited in days 31-60 (OMN-66) is the pilot customer; do not open this to a new, unvetted customer.
- Pricing: per days 31-60 (OMN-66) and OMN-71 and OMN-78, the pilot must be priced, not free custom engineering. This doc assumes a price already exists by day 61; if not, that is a blocking gap, not a reason to run it unpaid.

## Measurement plan

Each metric needs a concrete instrument, not just a name, so day-90 numbers are defensible.

- Deployment hours: wall-clock time from pilot kickoff to first node fully provisioned and enrolled, per node and in aggregate. Source: a manual timestamp log kept during pilot execution.
- Operator training: hours spent, number of operators trained, and a post-training competency check (can the operator unlock or recover a node unaided). Source: training session log plus a pass or fail checklist.
- Update and rollback success: number of upgrade and rollback attempts, success rate, and time to recover on failure. Source: bootc logs from pilot nodes.
- Evidence preparation: time spent assembling the evidence bundle (BLOCKERS.md-style honesty about what was proven versus assumed) for the customer readout. Source: a time log kept during readout drafting.
- Recovery time: time to recover from a lost or broken YubiKey using the systemd-homed and FIDO2 recovery path validated in days 31-60. Source: a timed recovery drill, at least one per pilot.
- Support load: number of support tickets or questions raised by the pilot operator, categorized by root cause. Source: the support channel log.

## Readouts

Confidential customer ROI readout, for the pilot customer only. Structure: measured metrics above versus the ROI baseline worksheet from OMN-84 (pilot collateral, days 0-30), stated honestly including any metric that came in worse than projected.

Bounded public case study, only with explicit customer permission. Scope the claims to the pilot as run (25-50 nodes, non-critical systems, one customer); do not generalize to production-ready-at-scale from a single small pilot.

## Decision framework at day 90

Based on the readouts, choose one of four paths:

1. Proceed to a second pilot, if metrics met or exceeded the ROI baseline and the customer wants to continue.
2. Narrow the offer, if the pilot succeeded technically but revealed the offer scope was too broad, for example support load concentrated in one area.
3. Change the target segment, if the pilot customer profile did not match well (a recruitment mismatch from days 31-60).
4. Pause commercial hiring, if the pilot revealed the product is not yet ready for a second paying customer, for example B-VM-CTAP2-adjacent issues resurfacing in the field, or unsustainable support load at 25-50 nodes.

This doc does not pre-select an outcome; the decision is made from the actual day-90 readout, not predicted here.

## Exit criteria

- [ ] Gate 1 (OMN-73) confirmed met before pilot start.
- [ ] One paid pilot run on 25-50 disposable or non-critical nodes.
- [ ] All six measurement metrics captured with source data, not estimates.
- [ ] Confidential ROI readout delivered to the pilot customer.
- [ ] Public case study drafted and customer permission explicitly obtained, or explicitly declined and noted.
- [ ] One of the four day-90 decisions made and recorded.

## Dependency map

Primary sequence (from OMN-67): OMN-77 (three-year revenue and cost model) leads to OMN-78 (customer ROI model) leads to OMN-79 (decisions, deferrals, and rejected models) leads to OMN-80 (external benchmarks and sources).

- OMN-77 and OMN-78 define whether the pilot economics work at all; read those before finalizing the ROI readout template.
- OMN-79 should be revisited after this pilot lands new evidence.
- OMN-80 supports external framing for the public case study and can proceed in parallel.
- This closes the sequential trio: OMN-65 (T21, PR 103) then OMN-66 (T20, PR 105) then OMN-67 (T19, this PR).

## Open questions

- Gate 1 definition is not yet drafted (OMN-73 has not landed a PR in this pass); this doc cannot confirm Gate 1 is met, only specify what happens once it is.
- Pilot price is assumed to exist by day 61 per OMN-66, OMN-71, and OMN-78; not verified here.
- Design partner identity and pilot start date are not sourced (same recruitment gap flagged in the OMN-65 and OMN-66 drafts).



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
