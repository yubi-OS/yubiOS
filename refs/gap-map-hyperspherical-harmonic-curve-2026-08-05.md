# Gap Map: hyperspherical-harmonic-curve

Date: 2026-08-05
Artifact: skills/github-yubios-KS9n5GAT/hyperspherical-harmonic-curve/SKILL.md (v1, 549 lines, cycle-1 RSI)
Mapper: Sauna (autonomous via ideate-solo + advisor + NSS)
Confidence: 3/5 (no prior fit; the variant has not been empirically validated yet)

## Positive space (one sentence)

A sphere-aware Stage-1 variant of `curve-guided-rsi` that fits `γ: S^N → ℝ^D` as a fixed hyperspherical-harmonic basis with a learned Möbius `φ_θ ∈ PSL(2,ℂ)` reparameterization of the domain, replacing the incumbent's flat 2-D Fourier surface with intrinsic-curvature signal from the parameter manifold.

## Intentional narrow scope?

Partially — see `## When NOT to Use` in the SKILL.md (3 structural do-not-use cases). The variant is intentionally narrow on the corpus-audit specialization (it is not a general-purpose curve fitter; that is `learned-latent-curve`'s job). Negative space beyond that narrow scope is real and worth mapping.

## Axis sweep

### 1. Audience
- **Positive:** yubiOS skill corpus auditors who already use `curve-guided-rsi` and want intrinsic-curvature signal in their sparse-cell detector.
- **Negative:** Anyone who wants a general curve fitter, anyone outside the yubiOS corpus audit context, anyone working with non-binary-feature corpora. **Likelihood 4 × Severity 2.** Gap likely to bite non-yubiOS users; severity low because the description frontmatter is clear about the corpus requirement. **Action: Accept** (the description narrows audience correctly).

### 2. Inputs
- **Positive:** 9-D binary primitive-coverage vector per skill, lifted to `D=384` via seeded QR (re-uses `curve-guided-rsi` Stage 1's cached lift).
- **Negative:** The variant does not accept raw corpus text; it requires a pre-computed `Z` matrix. A new user with a fresh corpus cannot use the variant without first running `curve-guided-rsi`. **Likelihood 3 × Severity 3.** This bites the first-time-setup user. **Action: Pair** with `curve-guided-rsi` (already done — `## Interaction with Other Skills` item 1+2).

### 3. Outputs
- **Positive:** Per-dim coefficient tensor `a_{j,l,m}`, bias `b`, optional Möbius parameters `φ_θ`; fitted target `Z = γ(S^N)`; audit-trail key `x ∈ S^N` (domain coordinate, not recovered `(u, v)`).
- **Negative:** No `## Output Schema` section explicitly listing what consumers should expect — downstream code that imports the variant gets the matrix shape implicitly. **Likelihood 3 × Severity 3.** Could bite a downstream consumer trying to validate the output. **Action: Extend** — add an explicit `## Output Contract` section in RSI cycle 2 (deferred).

### 4. Mode
- **Positive:** Batch fit (small `N`, no minibatching needed — same as `learned-latent-curve`). Single-shot re-fit on corpus growth ≥ 25%.
- **Negative:** No streaming / online-fit mode. Each new corpus item triggers a full re-fit (3 fits for the ablation). **Likelihood 2 × Severity 2.** Low likelihood at current corpus sizes; severity low because the ablation is bounded (3 fits). **Action: Accept** — not in MVP scope.

### 5. Assumption set
- **Positive:** Listed in `## Key Assumptions to Validate` of the ideation one-pager — 6 explicit assumptions (basis code correct, Möbius well-posed, sphere beats flat, spectral-mass gate calibrated, Stage-2 cells comparable, PC3 ≥ 0.08).
- **Negative:** The SKILL.md body itself does NOT enumerate the assumptions. They live in the ideation one-pager (`documents/github-yubios-KS9n5GAT/ideate-hyperspherical-harmonic-curve-yubios-solo-2026-08-05.md`). A reviewer reading only the SKILL.md has no list of "what must be true for this to work". **Likelihood 4 × Severity 4.** This is the largest real gap — a reviewer without the one-pager would miss the load-bearing assumptions. **Action: Extend** — add a `## Key Assumptions` section to the SKILL.md body in RSI cycle 2 (deferred).

### 6. Adjacent problems
- **Positive:** Composes with `learned-latent-curve` (curve fitter), `curve-guided-rsi` (audit pipeline), `internal-big-picture` (10-primitive basis), `negative-skill-space` (gap mapper), `recursive-self-improvement` (edit protocol).
- **Negative:** The variant does NOT address: corpus-level Möbius invariance testing across multiple snapshots (a separate "Möbius-equivariance audit" skill would be needed); `(γ, dγ, ∇²γ)` triple extension (explicitly deferred to v2). **Likelihood 2 × Severity 2.** Not biting at v1; not in MVP scope. **Action: Accept** — explicit v2 candidates in the SKILL.md `## Lifecycle` §Edge cases.

### 7. Failure modes
- **Positive:** 5 explicit Red Flags + 12 explicit Anti-patterns + 7 Pre-Fit Validation checks. The variant has the strongest failure-mode coverage of any cycle-1 skill in the corpus.
- **Negative:** No explicit fallback when the matched-parameter ablation returns negative (sphere loses to flat). The SKILL.md says "if the ablation returns negative, curvature is not helping and the SKILL.md body must say so" but does not specify the fallback (ship flat? abort? revert?). **Likelihood 3 × Severity 4.** This is the variant's ship-or-kill moment — a clear fallback path is required. **Action: Extend** — add explicit fallback path in RSI cycle 2 (deferred).

### 8. Lifecycle
- **Positive:** `## Lifecycle` section with drift signals, re-fit cadence (corpus growth + elapsed time + geometry-aware trigger), t-pipeline versioning (full cache version), rollback protocol, 4 edge cases.
- **Negative:** No explicit handling of `cycle-2 → v2` transition; no audit-trail entry format beyond the standard `## Changelog` cycle-1 line. **Likelihood 2 × Severity 2.** Standard RSI protocol applies. **Action: Accept** — handled by `recursive-self-improvement`.

### 9. Composition
- **Positive:** `## Interaction with Other Skills` lists 7 named pairings with operational sequence and cross-reference consistency.
- **Negative:** The pairing with `parallel-deep-research` is implicit (this skill was developed via 4 parallel subagents + advisor) but not named. **Likelihood 1 × Severity 1.** Cosmetic. **Action: Accept.**

### 10. Knowledge sources
- **Positive:** All math claims are cited (Ahlfors, do Carmo, Frankel, Spivak, Helgason, Stein-Weiss, Varshalovich, Huybrechts, Griffiths-Harris). Prior art cites 16 distinct sources in Stream C.
- **Negative:** Two prior-art hits (Closest-1: Spectral Bayesian Regression on the Sphere at arXiv 2601.20528; Closest-2: Generalized Fourier Features for Coordinate-Based Learning of Functions on Manifolds at OpenReview `g6UqpVislvH`) were not depth-fetched — Closest-2 was CAPTCHA-blocked. The novelty verdict depends on these being truly not-novel. **Likelihood 3 × Severity 3.** A reviewer who depth-fetches Closest-2 and finds the variant is covered could invalidate the ship. **Action: Extend** — depth-fetch via `https://api2.openreview.net/notes?forum=g6UqpVislvH` in RSI cycle 2.

### 11. Calibration
- **Positive:** Three tiers of falsifiable calibration: spectral-mass gate `ρ ≥ 0.10` + high-degree mass ≤ 0.40, holdout `R² > 0`, matched-parameter ablation.
- **Negative:** The thresholds (`ρ ≥ 0.10`, high-degree mass ≤ 0.40) are chosen by principle, NOT yet calibrated on a real fit. First-Stage-5 verification will set the actual thresholds. **Likelihood 4 × Severity 3.** A reviewer who fits the model first might find that the actual thresholds need adjustment. **Action: Pair** with the v1-fit cache (will close when first fit lands).

### 12. Recursion
- **Positive:** The skill applies to a corpus (skills); it can also apply to itself recursively (the NSS sweep in this document).
- **Negative:** No explicit recursive-self-application example in the SKILL.md body. The recursion axis (gap-mapping the gap-map) is captured only in this NSS document, not in the skill itself. **Likelihood 2 × Severity 2.** Standard `negative-skill-space` recursion protocol applies. **Action: Accept** — recursion is a `negative-skill-space` skill concern, not this variant's.

## Filtered real gaps (top 5–10, ranked)

1. **No `## Key Assumptions` section in SKILL.md body.** L=4, S=4. Action: **Extend** (RSI cycle 2). — **LARGEST REAL GAP.**
2. **No explicit fallback path when matched-parameter ablation returns negative.** L=3, S=4. Action: **Extend** (RSI cycle 2).
3. **No `## Output Contract` section for downstream consumers.** L=3, S=3. Action: **Extend** (RSI cycle 2).
4. **Two prior-art hits (Closest-1, Closest-2) not depth-fetched.** L=3, S=3. Action: **Extend** — depth-fetch via OpenReview API in RSI cycle 2.
5. **Calibration thresholds (`ρ ≥ 0.10`, high-degree mass ≤ 0.40) are principle-only, not empirically set.** L=4, S=3. Action: **Pair** with v1-fit cache (closes when first fit lands).

## Noted but deferred

- Möbius-equivariance audit skill (separate from this variant) — not in MVP scope.
- `(γ, dγ, ∇²γ)` triple extension — explicit v2 candidate per `## Lifecycle` §Edge cases.
- Streaming/online-fit mode — not in MVP scope.
- Pairing with `parallel-deep-research` — cosmetic, not worth a section.

## Recommended pairings

- **`recursive-self-improvement`** — closes gaps #1, #2, #3 in RSI cycle 2.
- **`prior-art-search` / `novelty-indication`** — closes gap #4 via depth-fetch + Layer-decomposition.
- **`curve-guided-rsi`** — closes gap #5 when the v1 fit lands and the threshold calibration can be measured.
- **`negative-skill-space`** — gap-mapping the gap-map (recursion) catches meta-blind spots not surfaced here.

## Recursive findings (the gap map's own gaps)

- **The mapper and the skill author share context** — this NSS sweep was written by the same agent that wrote the SKILL.md. Per the `negative-skill-space` skill's "Same-blind-spot mapping" anti-pattern, an external review is warranted before RSI cycle 2. **Suggested: have a fresh-context subagent re-map the variant in cycle 2, not the same agent.**
- **The filter for "performative gaps" was liberal.** Gap #11 (`calibration thresholds`) and gap #4 (depth-fetch) could be argued to be performative; they were kept because they have specific bite scenarios.
- **The "What does this NOT cover" sweep did not include** the corpus-audit-with-Möbius-invariance question — that is a separate skill, and the mapper did not surface it as a paired skill that closes a v1 gap. Worth surfacing in cycle 2's re-map.

## Re-evaluation triggers

- **After RSI cycle 2 lands** (closes gaps #1, #2, #3) — re-run NSS on the v2 SKILL.md.
- **After v1 fit lands** — verify gap #5 calibration thresholds were actually met; close or update gap.
- **After depth-fetch of Closest-2** — if the variant IS covered by that paper, downgrade the novelty verdict and surface a `idea-kill` candidate.
- **After `parallel-deep-research` produces the next variant-skill ideation** — if the family's other members (`n-sphere-jet-curve-rsi`, `n-sphere-blaschke-curve`) ship, re-map to surface family-level gaps.
- **6 months from ship date** — per `learned-latent-curve` lifecycle discipline, re-run NSS on the post-ship variant.

## Mapper's honesty notes

- This NSS document was produced by the same agent that wrote the SKILL.md. Per the `negative-skill-space` skill's "Same-blind-spot mapping" anti-pattern, treat all gap scores as ±1.
- Cycle-1 RSI Result is "re-map pending"; the cycle-2 re-map (by a fresh-context subagent) will be the authoritative audit-trail close.
- 5 real gaps is **fewer than the typical 8-12 for cycle-1 skills** — the advisor's 10 revisions applied during the SKILL.md write closed most of the would-be cycle-1 gaps. The remaining 5 are all Extend actions deferred to cycle 2.
- The 5 gaps are listed in **fix-point order**: #1 is the load-bearing one (reviewer readability without the ideation one-pager); #2-#5 are operational.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6466, Δ=+0.5900) were identical placeholder copies with no per-file content; merged on 2026-09-18.

## 2026-09-18 drift check (wayfinder round 8, cycle 67)

gap-map record (round-4 repaired): its sparse-cell priorities fed the hyperspherical-harmonic-curve skill; the round-8 corpus is denser at those cells than at write time; note additive.
