# Rayleigh admission trial on refs/ (rayleigh/1, baseline map 431, 2026-09-19)

Date: 2026-09-19. Family: instrument trial record (cf. `refs/wayfinder-rounds-7-12-audit-2026-09-18.md`, `refs/rayleigh-integration-research-2026-09-18.md`). Origin: wayfinder round 13 cycle 3, rung `add:s8:111100101` (predicted isolated delta +1, no join target). This record is the executed membership trial the is-this-x admission rule requires before a statistic may be reported: "no coordinate is admitted without a demonstrated non-degenerate null, a construction under which the statistic provably could have taken a different value."

## Instrument state

| Item | Value |
|---|---|
| Corpus | `refs/*.md` at main `06bb5786` (223 documents, 0 truncated) |
| Baseline | map **431**, frame `e5294e0212451a45`, instrument `6782a97ca9c308de`, N=223, isolated 23, 12/12 sectors, stored V2 null z=+2.38 |
| Ky Fan frame gap at baseline | `gap_share_of_trace` 0 (the frozen axes are the top-2 eigenvectors of this corpus by construction); top-2 share 0.2623 |
| Positive control (cutpaste-splice/1, n=6, seed 20260919) | isolated delta {negative 1, zero 4, positive 1}, 0 quantization-silent |
| Axis trial (loo-nn-vote/1, K=40) | 7/9 axes excluded-from-fixed-margin-null, total z +5.31, `admitted:false` (axis trial unchanged) |
| Isolation graph | 370 edges, **66 components**, **23 isolates** (equal to the instrument's own isolated count), largest component 11 |
| Fiedler value of largest component | λ₂ = 0.687469 (float, power iteration) |
| Exact Rayleigh–Ritz witness of the Fiedler sign cut | R = 11/8 = 1.375; `bound_holds` = True |

## Null trial (fixed-attempt checkerboard chain on the bit matrix, K=40, two independent seeds 611376315 / 1530568878)

| statistic | observed | z (seed a / seed b) | verdict (a / b) | null non-degenerate | reproducible |
|---|---|---|---|---|---|
| components | 66 | 1.05 / 1.21 | not-excluded / not-excluded | yes | yes |
| isolates | 23 | 0.24 / 0.35 | not-excluded / not-excluded | yes | yes |
| largest | 11 | -1.92 / -1.59 | not-excluded / not-excluded | yes | yes |
| lambda2 | 0.687469 | 1.2 / 1.96 | not-excluded / not-excluded | yes | yes |
| edges | 370 | -0.68 / -0.75 | not-excluded / not-excluded | yes | yes |

Every null is non-degenerate (the statistic could have taken another value under margin-preserving randomization) and every exclusion verdict reproduces across two independent chains. On this corpus none of the five statistics is excluded from the fixed-margin null: the refs/ isolation graph's component structure is what a margin-matched random bit matrix also produces. That is the reading, and it is exactly the kind of negative the admission rule exists to record.

## Admission decision (computed by the instrument, not asserted here)

Criteria and values returned by `POST /api/map/rayleigh {map_id: 431}`: `null_nondegenerate_all` True, `verdicts_reproducible_all` True, `witness_bound_holds` True, `ky_fan_bound_holds` True, `n_at_least_100` True → **`admitted: true`** for reporting on frame `e5294e0212451a45`.

Admission licenses exactly one thing: the five graph statistics may be quoted as instrument readings on this frame with their null tails attached. It is not a ranking term, not a radius change, not a keep/revert rule, and it does not transfer to another frame without its own trial (the same call on the 12-document smoke map returned `admitted:false`, reason "N < 100").

## What is proved and what is measured

Proved (core Lean 4.33.0, `papers/data/lean/RayleighBounds.lean`, kernel-checked in `lean-check.yml`): the Laplacian quadratic form is PSD; constants and isolated-vertex indicators are in its kernel; xᵀLx of a 0/1 indicator equals the cut size; the witness x = n·1_S − k·1 has xᵀLx = n²·cut and ‖x‖² = n·k·(n−k). Measured (stdlib Python, `papers/data/lean/verify_rayleigh_claims.py`, CI `verify-measurements`): nullity(L) = BFS components by exact Fraction rank on every fixture and 30 random graphs; quad(1_S) = cut(S) on 200 random graphs; the float Fiedler estimate never exceeds the exact witness on any fixture. Not proved: nullity = #components in general, Ky Fan, the float λ₂. Not used: Rayleigh's inviscid stability equation, Rayleigh–Plesset.

## What this record does not claim

Nothing about document quality, ranking, or which edits to keep. Counts and z values are descriptive; K=40 resolves no tail below 1/41. The 66-component / 23-isolate structure is a fact about this frame's isolation graph, not about the refs/ corpus's meaning.
