# Wayfinder math integration: proved ledgers and actual-text preview

## Scope

Adds `wayfinder-math/1` diagnostics to the existing `pointmap/0.2` instrument. Frame IDs, instrument IDs, bits, placement, null calculations and rung ranking are preserved. No Navier–Stokes/Euler dependency, fluid-state model, new physics score or automatic keep/revert rule is introduced.

Research: [Navier–Stokes and wayfinder mathematical assessment](navier-stokes-wayfinder-math-2026-09-10.md). Operational contract: [AGENT.md](../tools/point-map/AGENT.md).

## Kernel-checked statements

`papers/data/lean/WayfinderBounds.lean` now has eleven checked theorems on core Lean 4.33.0:

- `stable_on`, `stable_off`, `crossing_on_iff`, `crossing_off_iff`;
- `old_vertex_after_add`, `after_old_count`, `add_isolation_delta`;
- `chg_hit_eval`, `change_neighbour_ledger`, `change_isolation_delta`, `change_neutral`.

The proof commit `c25ac928689b322ebcf98e399d5f2f21e8710021` passed [Lean CI run 34567362278](https://github.com/yubi-OS/yubiOS/actions/runs/34567362278), including the original measurement and recorded-negative gates. A separate scope manifest maps statements to runtime predicates. The checker parses the kernel's printed axiom sets and rejects missing declarations, unknown axioms and proof placeholders; it does not confuse comment text with theorem dependencies.

These are exact integer/count statements. Floating-point error bounds, adjacency construction and source-to-row correspondence are separate runtime obligations. None of the theorems certifies semantic edit quality or forecasting accuracy.

## Direct runtime additions

**Signed margins.** `PM.projectionMargins` reports signed threshold clearance and axis norms. The public result shares axis metadata once and records per-input margins. With missing roundoff assumptions the result is `needs-roundoff-bound`; near-threshold cases are `undetermined`. Optional positive API `roundoff_budget` and nonnegative `perturbation_linf` are caller-supplied, unverified bounds. A displayed stable state remains conditional and is never labeled a certified numerical proof.

**Exact local isolation ledgers.** `PM.explainTransition` verifies the frame/instrument, full-precision points and unique names, and independently recounts isolation. For one ADD:

`isolation delta = indicator(new degree = 0) - previous isolated neighbours touched`.

For one CHANGE, neighbour degrees are recomputed as `old degree - old edge + new edge`, plus the moved point's own degree. The ledger names the affected neighbours. A mismatch with independent recounting halts before persistence. Multi-item changes and removals are outside this certificate and report not-applicable.

**Reduction ratio.** Observed/predicted reduction is exposed only for a strictly negative predicted isolation delta. Positive and zero predictions are ineligible. It is geometric model bookkeeping, never calibrated confidence or task quality.

## Actual-text preview

`POST /api/map/preview` accepts a saved text baseline, the full resulting `texts`/`names`, and one target `{action: "add"|"change", name}`. It validates all unchanged source SHA256s before model work and verifies their full points/bits afterwards. Stale inputs, missing evidence, altered surrounding documents, mismatched settings or anchor drift return explicit errors.

Preview does not write a repository, D1 map row or Vectorize. The existing content-hash embedding cache may be populated. It returns an ephemeral map, target margins, the exact local ledger, source hashes and unchanged-anchor counts. Storage outages are 503 rather than false missing-baseline responses.

The UI saves a frozen copy of the corpus when the operator chooses a saved text baseline. Preview cannot overwrite that corpus or its ID. The candidate panel distinguishes neutral ADDs from unmoved CHANGEs, renders escaped literal paths, and preserves the independent task-check boundary.

## Guide and encoding safeguards

The map's copyable prompt includes the actual-text preview step. The homepage Copy agent guide button now fetches the authoritative `/AGENT.md` instead of maintaining a second hardcoded recipe. It works independently of iframe loading, including on mobile. Fetch/copy failures show an error and link; success is shown only after clipboard success or a successful fallback return.

Desktop and mobile browser checks compared copied text byte-for-byte with the updated guide. The served assets remain UTF-8; all unrelated homepage text and legacy site endpoints are preserved.

## Verification before publication

- Existing numerical suite: 57 passed.
- Existing API suite: 36 passed (includes one explanatory marker).
- Existing archive suite: 10 passed.
- New math suite: 71 passed, including 38,172 exhaustive graph cases and all ten recorded transitions 51–61.
- New preview suite: 41 passed against real math helpers, with explicit AI/cache/DB boundary doubles.
- Storage suite: 7 checks passed; 400×768, d=24 stores 1,294,143 bytes rather than the 2,100,906-byte expanded JSON, without losing numerical precision or changing the public schema.
- Browser suite: 60 checks passed, including mobile reachability, candidate-state preservation, error handling, escaped paths and exact guide copying.
- Fresh-context general/smart adversarial review: initial BLOCK exposed a D1 row-size regression and failure/labeling issues; the corrected version received PASS.

Storage packing is lossless tuple encoding. Every map read path expands it to the same public objects. Results exceeding the 1.9 MB safe storage cap fail explicitly instead of omitting diagnostics. Existing legacy maps remain readable.

## Evidence boundary

The ten exact historical ledger replays remain retrospective. Three zero outcomes were unchanged CHANGE points; three were ADDs that joined already-connected neighbours. No new prospective edit benchmark is counted here, and the historical 4/10 sign agreement is not relabeled as 10/10 prediction.

The final publication/deployment receipt is appended after remote CI and live verification. Existing `CurvedCorpus.lean`, measurement checks and all recorded scientific negatives are retained.


## Final publication and live verification

- PR [#231](https://github.com/yubi-OS/yubiOS/pull/231) merged as `41d5d47889e9c83b760944067ff8a2f87be0b176`.
- Integrated branch CI: [https://github.com/yubi-OS/yubiOS/actions/runs/34570655611](https://github.com/yubi-OS/yubiOS/actions/runs/34570655611) passed all three jobs.
- Main merge CI: [34570898261](https://github.com/yubi-OS/yubiOS/actions/runs/34570898261) passed.
- Cloudflare Worker deployment `3413a5a0f7f44d45a9dc0f904632ee13` verified on the existing origin. All six public assets matched source SHA256.
- Live API created text baseline **65** from 12 real refs documents. Stored diagnostic packing round-tripped exactly.
- Preview noop: HTTP 200, `CHANGE`, isolated delta +0, 12 unchanged anchors, 9 target margin axes, no persisted map.
- Preview change: HTTP 200, `CHANGE`, isolated delta +2, 11 unchanged anchors, 9 target margin axes, no persisted map.
- Preview add: HTTP 200, `ADD`, isolated delta +1, 12 unchanged anchors, 9 target margin axes, no persisted map.
- Saved map count did not change across the three previews. No repository or Vectorize writes occurred. Stale second-source mutation returned 409; zero roundoff budget returned 422.
- Historical maps 51→52 still compare on the old frame and produce the exact -2 ledger.
- The candidate texts were deliberately mechanical smoke tests; their +2/+1 isolation changes are recorded, not presented as improvements. No new prospective ten-edit success rate is claimed.
