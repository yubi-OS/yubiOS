# Arrangement response and hierarchy premap, two build lines [SOLO]

Date: 2026-10-16
Source: ideate-solo (no dialogue). Inputs: ENDPOINTS.md and AGENT.md (live fetch 2026-10-16), tools/lens-standard/falsification/ARRANGEMENT-RESPONSE-2026-10-06.md, refs/hierarchy-router-2026-10-06.md, and three research passes (box-counting sensitivity, IFS and hierarchy completion, Delaunay and spectral dimension).
Scope class: medium
Variations generated: 7
Finalists: V2 (Line A walk leg), V3 (Line B premap). V1 is the Line A backbone.

## Problem statement

How might the Cloudflare oracle answer its next instrument question (what does it read when only the droplet arrangement moves), and how might the proven hierarchy detector premap a missing hierarchy level, without changing the live deployment?

## Variations (five lenses, one lens per variation)

- V1, arrangement arm only (Simplification). Add one arrangement-warp route beside the existing pixel-warp, read D and d_w per arm.
- V2, canonical tie-break first (Inversion: fix the instrument before measuring the response). Pin a degeneracy-exact Delaunay so the walk leg stops depending on the implementation.
- V3, containment premap (Combination: detector times template ladder). Identify the shallowest gasket template that contains every observed site, predict the holes, pre-register a D band at depth 6.
- V4, learned IFS registration (Constraint removal: no fixed template, fit the map). Fit an IFS or affine registration from partial observations.
- V5, arrangement response as the error budget (Combination: Line A times Line B). Carry measured arrangement sensitivity into premap bands.
- V6, route-integrated fills (Audience shift: fills become gated router lane actions). Premap output dispatches through policy.
- V7, real supersolid panels as the premap test set (Audience shift: research imagery as ground truth).

## Scores (painkiller / switching / defensibility / testability, 1 to 5 each)

| Variation | Pain | Switch | Defend | Test | Sum | Status |
|---|---|---|---|---|---|---|
| V1 | 3 | 5 | 2 | 5 | 15 | backbone for Line A |
| V2 | 5 | 3 | 4 | 4 | 16 | finalist, Line A walk leg |
| V3 | 4 | 4 | 3 | 5 | 16 | finalist, Line B |
| V4 | 2 | 2 | 2 | 1 | 7 | dropped (below 8) |
| V5 | 3 | 4 | 3 | 4 | 14 | Phase 2 hook |
| V6 | 4 | 2 | 3 | 2 | 11 | blocked by the deploy hold |
| V7 | 4 | 4 | 4 | 2 | 14 | Phase 2 (needs registration) |

Justifications for scores above 4 or below 2:
- V2 painkiller 5: the walk leg's A1 verdicts flip between two implementations of the same algorithm. The feasibility benchmark measured this (session/arr-premap/feasibility-check-2026-10-16.md section 3). This is a measured defect, not a guess.
- V2 switching 3: pinning a new Delaunay changes the walk graph for every consumer, so it is a major version bump with anchor re-derivation.
- V3 testability 5: gasket holdouts have exact ground truth.
- V4 testability 1: inverse IFS recovery from a finite, noisy, partial point set is not identifiable in general (research pass 2).
- V6 switching 2: needs a deploy, a policy change, and the dispatch path.

## Stress test of the finalists

V2
- Strongest critique: the exact graph is a different object from the deployed graph. The gasket's true walk dimension is ln5/ln2 = 2.3219, and the measured 2.77 is a finite-size value. Pinning one tie-break does not make the finite-size value correct, only reproducible.
- Second-order effects: router pair-bands gate on d_w at 2.4 and the gasket sits near 2.77, so a 0.02 shift is harmless today but must be re-checked on any graph change. Every spectral consumer inherits the change.
- Untestable bet: that the canonical graph is the one the theory describes for a physical droplet arrangement. Testable only in the gold family.

V3
- Strongest critique: at the identity frame the premap is bookkeeping. Real panels need registration, and containment breaks under any displacement larger than the tolerance.
- Second-order effects: once a premap exists, its fills could be mistaken for measurements. They must never feed the router as evidence. Fills are predictions, not observations.
- Untestable bet: that real hierarchical occupancy is gasket-like enough for containment to identify its level. Not testable without ground truth.

## Converge

Line A is V1 as the decomposition backbone plus V2 as the walk-leg gate. Line B is V3, with V5 kept as the Phase 2 error-budget hook. The fill is the arrangement response with additions instead of displacements, so Line B reuses Line A's vocabulary without its registration problem at the identity frame.

## Recommended direction

Build two lines in parallel, both session-only.

Line A (arrangement-response-v1). Port the three-arm experiment (clean, pixel warp, arrangement warp) to a route. Report D and d_w per arm and gate them with the pre-registered A1 to A5. Add A6, a tie-break invariance gate, and build a canonical exact-predicate Delaunay as a session-only candidate, with a Python twin. A1 verdicts are reported as implementation-dependent until A6 passes.

Line B (premap-v1). Given observed sites in the canvas frame, identify the shallowest gasket template that contains all of them, predict the hole sites, and report a D band only where the template passes its own r-squared gate (depth 6 at L=384). Gate it on a frozen gold holdout with negatives.

## Key assumptions to validate

- [ ] The implementation difference in d_w is caused only by degenerate Delaunay tie-breaks. Test: an exact-predicate Delaunay gives identical edge sets in JS and Python on the clean set, all five arm sets, and 20 random sets.
- [ ] Under a canonical graph, the arrangement response on the walk leg is at most 0.05 for affine arms. Test: A1 under the canonical graph, Python and JS agreeing to 1e-9.
- [ ] Containment identifies the gasket level from random 20 to 60 percent subsets. Test: 45 gold trials, gate P1 at 95 percent or better, and tri and random negatives at 100 percent null.
- [ ] Only depth 6 gives a valid D reference at L=384 (r-squared at or above 0.98). Measured in the feasibility check: depth 4 gives 0.9794, depth 5 gives 0.9638, depth 6 gives 0.9964. Test: the predictedBand policy.
- [ ] Template fills reproduce the template D sign on depth 6. Test: gate P3 at 90 percent or better, with the random-fill control reported.
- [ ] Real panels need registration before any premap claim. Not tested in this build. Named as the first open gate.

## MVP scope

Line A: arrangement-response-v1 module and route (JS, deps-injected), gates A1 to A5 plus A6 as not-measured in the worker, canonical exact-predicate Delaunay candidate with a Python twin and a pre-registration written before its run. Session-only.

Line B: premap-v1 module and route, selftest, gold holdout harness with a frozen pre-registration and negatives. Session-only.

## Not doing (and why)

- Any deploy, KV write, D1 write, or policy change. Jenny holds the deploy.
- Replacing the deployed walk graph. That is a major version bump and needs her decision.
- Registration for real panels (V4, V7). Research pass 2 says it is open, and it is Phase 2.
- Routing fills through the gate (V6). Blocked by the hold and by the design rule that fills are predictions, not evidence.
- Retuning L, the D window, the 0.98 gate, or the 0.05 band after seeing any output.

## Open questions

- Adopt the canonical Delaunay as spectral-standard-v2 (re-anchor everything), or keep the deployed graph and record its implementation sensitivity as a finding? Jenny's call.
- Is a larger canvas template (L above 384) worth a major bump to get a valid D reference at depths 3 to 5? The current pinned L gives no valid reference there.
- Does the arrangement response become the error budget for Phase 2 premap bands (V5)?

## Generation log (for review)

- Variations generated: V1 to V7 (above), five lenses covered: Simplification (V1), Inversion (V2), Combination (V3, V5), Constraint removal (V4), Audience shift (V6, V7).
- Dropped below threshold: V4 (sum 7).
- Finalists: V2 (16), V3 (16). V1 (15) is the backbone.
- Stress-test critique of the winner (V3): containment is brittle under any displacement beyond tolerance, and bookkeeping at the identity frame is not a physical result.
