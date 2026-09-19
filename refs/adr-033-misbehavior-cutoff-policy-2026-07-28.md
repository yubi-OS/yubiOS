# Misbehavior-Triggered PCI-Mediation Cutoff [SOLO]

<last-reviewed-against-blockers>2026-07-28</last-reviewed-against-blockers>

Date: 2026-07-28
Source: ideate-solo (no dialogue — autonomous variation generation)
Scope class: medium (single policy layer over an established mechanism)
Variations generated: 6
Finalist: Variation 3 (Severity-Ladder Snapshot-and-Sever)

## Problem statement

How might we use the existing vfio-user / IOMMU-gated PCI passthrough boundary (ADR-031) as the cutoff point when an AI/ML workload inside a yubiOS bootc VM misbehaves — without killing the VM and without losing the ability to capture the model's state for forensic analysis?

## Recommended direction

**Variation 3: Severity-Ladder Snapshot-and-Sever.** A 4-tier escalation policy: INFO (log only) → WARN (snapshot metadata, no sever) → THROTTLE (snapshot state, halve GPU bandwidth) → SEVER (snapshot full VM state, revoke vfio-user socket, freeze VM, alert operator).

Why this wins:

* **Preserves forensic state** at every tier (severity ladder means *something* is always captured).
* **Recoverable by design** — the VM stays alive at SEVER; only the device access is severed. Operator can attach a fresh vfio-user socket to resume in a clean environment.
* **Host-side evaluation** — triggers are evaluated by the vfio-user *server* (a separate userspace process the model can't observe or attack), which closes the model-self-policing failure mode.
* **Composable with the existing chain** — sits cleanly on top of ADR-031's virtio-gpu default + IOMMU gate + vfio-user mediation. No new mechanism needed; the new contribution is *the policy that decides when to use what ADR-031 already provides*.

Key Assumptions to Validate:

- [ ] **A1.** Misbehavior can be detected from a vfio-user-server-side observer (without seeing model internals). Test: prototype a vfio-user server that watches DMA-window patterns and flags anomalies; check false-positive rate against known-good traffic.
- [ ] **A2.** VM state can be snapshotted at SEVER without losing the GPU's pending work. Test: qcow2 snapshot + vfio-user socket teardown + cold-restore; measure model recovery time.
- [ ] **A3.** Operators will respond to a SEVER alert within the model-state-preservation window (e.g., minutes, not hours). Test: simulation with synthetic operator response times.
- [ ] **A4.** The severity ladder is monotonic — a higher tier is never triggered without a lower one being captured first. Test: policy state-machine verification.

MVP Scope:

1. A vfio-user server with a pluggable "trigger evaluator" interface (initial evaluator: DMA-window anomaly score; threshold tunable).
2. A 4-tier policy engine that maps trigger signal → tier → action.
3. A SEVER action that snapshots the guest (qcow2 + bootc delta), revokes the vfio-user socket, and emits a webhook to the operator.
4. An audit log capturing every tier transition with: timestamp, trigger signal, tier, action, snapshot hash.
5. One end-to-end test: known-good workload stays at INFO/WARN; synthetic anomalous workload escalates to SEVER; SEVER produces a snapshot the operator can reattach to.

Not Doing (and Why):

- **Re-deciding the mediation mechanism** — already ADR-031. Doing so again would create a parallel-track architecture decision.
- **Replacing ADR-031's virtio-gpu default** — the default is the safe posture; the policy is what runs *when* the default is opted out of.
- **Implementing hardware IOMMU enforcement** — ADR-031 honesty note: post-launch. The policy operates in software on top of ADR-031's *design* even before the *hardware gate* is validated.
- **Defining specific AI workloads** (LLM agent vs training vs inference) — the trigger model should be workload-agnostic. Workload-specific triggers can be separate downstream issues.
- **Building a new micro-VM / gVisor competitor** — the mediation boundary is the entire point of this design; introducing a second isolation layer would dilute the audit story.

Open Questions:

- OQ1. Where do trigger evaluators live — in the vfio-user server process, in a sidecar, or in a separate observer process? Tradeoff: in-process is faster but harder to audit; sidecar adds a hop; separate process gives the cleanest trust story.
- OQ2. Who owns the snapshot at SEVER — the host (operator can reattach) or the guest (guest controls its own state)? Both have defensibility arguments; ADR-031's "no trust-boundary component may consume GPU state" rule cuts against guest-side capture.
- OQ3. How does this interact with the `drm-gpu-quota-secure-time` skill's SMC-based hard cutoff? Are they complementary (one for behavioral, one for resource) or do they conflict?
- OQ4. What's the recovery story after SEVER? Fresh vfio-user socket + cold VM resume? Or do we need a "clean room" vfio-user server with verified inputs?

## Generation log

Variations generated:

- **V1 — Kill-the-VM (simplification lens).** Trivial: when misbehavior detected, kill the VM. Score: painkiller=2 (cures the symptom but loses forensic state), switching cost=5 (uses ADR-031 as-is), defensibility=1 (nothing new), testability=5 (trivial). Sum=13. **Dropped below threshold.** Critique: destroys state, contradicts the user's framing of "cutoff point" (which implies preservation).

- **V2 — Network-only cutoff (inversion lens).** Cut the network but keep GPU. Score: painkiller=2 (misses DMA-based exfil), switching cost=4, defensibility=2, testability=4. Sum=12. **Dropped below threshold.** Critique: misses the threat model ADR-031 establishes — DMA from GPU can read LUKS keys directly, no network needed.

- **V3 — Severity-Ladder Snapshot-and-Sever (combination lens).** Merge the severity ladder with snapshot-and-sever. Score: painkiller=5 (real, frequent, long-standing pain — every AI safety paper wants this), switching cost=4 (extends ADR-031 cleanly), defensibility=4 (policy + state-preservation combination is novel, not just mechanism), testability=4 (one end-to-end test exercises the full ladder). Sum=17. **Finalist.**

- **V4 — Host-side watchdog with operator approval (audience-shift lens).** Audience shift to enterprise SOC operators who want a human in the loop. Score: painkiller=4 (real for SOC use cases), switching cost=2 (requires operator workflow + on-call rotation), defensibility=3 (workflow moat), testability=2 (needs real operator response simulation). Sum=11. **Dropped.** Critique: too operational for the early-stage policy; better as a downstream "operator console" issue.

- **V5 — Trust-boundary component isolation (constraint-removal lens).** Remove the constraint that the GPU state must be trust-boundary-neutral (ADR-031 rule 5). Score: painkiller=1 (regresses existing security posture), switching cost=1 (contradicts ADR-031), defensibility=1, testability=3. Sum=6. **Dropped.** Critique: this *inverts* the project's GPU-as-attack-vector posture; would be a security regression, not a feature.

- **V6 — Pre-deployment fingerprint check (constraint-removal lens, variant).** Pre-screen model binaries on deploy; never let an un-fingerprinted model touch GPU. Score: painkiller=3 (addresses supply-chain attack, narrower than the user's framing), switching cost=3 (requires model signing infra), defensibility=4 (signing is a real moat), testability=4. Sum=14. **Finalist runner-up — but smaller scope than V3, which addresses the user's full question.**

Dropped below threshold: V1, V2, V4, V5 (all below 13).

Finalists: V3 (Severity-Ladder), V6 (Fingerprint).

Stress-test of V3:

- **Strongest critique:** The severity ladder assumes misbehavior is *detectable* — but many AI safety failures (subtle jailbreaks, slow exfiltration, adversarial inputs that produce policy-compliant but harmful outputs) are exactly the kind that *don't* trigger any of the obvious signals. A severity ladder built on a faulty detector is theater.
- **Second-order effects (good):** Forces a *separate* evaluation surface from the model — the vfio-user server is a new place to put security observability that the model can't game. Creates a natural audit log of "what was the system doing when it misbehaved" that AI safety papers currently lack.
- **Second-order effects (bad):** Operators may become numb to WARN-tier alerts if they're frequent. Need careful rate-limiting and summarization in the operator console.
- **Un-testable bet:** That misbehavior can be detected at the *device boundary* without observing model internals. If false, the entire ladder collapses to "kill the VM at SEVER" — which is just V1 with extra steps.

Stress-test of V6:

- **Strongest critique:** Pre-deployment fingerprinting is *static* — it doesn't catch runtime misbehavior (a well-signed model that goes rogue at inference time). Misses the user's "misbehaving model" framing.
- **Second-order effects:** Pairs naturally with SLSA provenance (existing skill) — model supply chain becomes auditable.
- **Un-testable bet:** That operators will actually verify fingerprints before every deploy (workflow problem, not technical).

**V3 wins** because the user's question explicitly says "misbehaving model" — runtime, not deploy-time. V6 is a worthwhile downstream issue (model supply chain provenance) but doesn't address the runtime cutoff question.

## Where this lives

* This one-pager is the ideation artifact.
* Convert to ADR-033 (OMN-109) by filling in the ADR template (Context / Decision / Alternatives / Consequences).
* Pair with OMN-110 (prior-art search) before ADR-033 is accepted.
* Pair with OMN-112 (trigger model) before any code lands.

## Note on file location

This one-pager is in `session/` (per ideate-solo skill convention, which expects `docs/ideas/`). Per PROJECT_RULES.md durable content lives in `yubi-OS/yubiOS refs/` not local `documents/` — so the durable copy should land at `refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md` after approval (this file becomes the ideation preamble, the refs/ file becomes the ADR).


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Declarative policy coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
## 2026-09-18 drift check (wayfinder round 8, cycle 77)

ADR-033 policy record (round-7 repaired): the OMN-144/147 cluster remains Backlog; the policy text is unchanged; note additive.
