# Wayfinder round 13 results: refs/ with placement/1 and rayleigh/1 (baseline 431, frame e5294e0212451a45)

Date: 2026-09-19. Family: run-results record (cf. `refs/wayfinder-round8-results-2026-09-18.md`). Origin: round 13 closing record. Purpose of the round: test the two new instrument layers end to end on `refs/` (placement/1: `rung_key`/`joins` on rungs and `placement` on preview/map; rayleigh/1: Rayleigh-quotient graph and frame diagnostics with a computed admission), prove what can be proved (Lean + exact-arithmetic CI), and decide `admitted` from evidence instead of hard-coding it. Held PR, one file per commit, every cycle pre-registered.

## Round parameters

| Parameter | Value |
|---|---|
| Corpus | `refs/*.md` at main `06bb5786` — 223 documents, 0 truncated |
| Baseline | map **431**, frame `e5294e0212451a45`, instrument `6782a97ca9c308de`, N=223, isolated 23, 12/12 sectors, stored V2 null z=+2.38, Ky Fan frame gap 0 |
| Positive control (cutpaste-splice/1, n=6, seed 20260919) | Δisolated {negative 1, zero 4, positive 1}, 0 quantization-silent |
| Axis trial (loo-nn-vote/1, K=40) | 7/9 axes excluded-from-fixed-margin-null, total z +5.31 (`admitted:false`, unchanged design) |
| Rayleigh reading at baseline | 370 edges, 66 components, 23 isolates, largest component 11, λ₂ 0.6875 ≤ exact witness 11/8; all five statistics `not-excluded` from the fixed-margin null on both seeds; **`admitted: true`** on this frame (record: `refs/rayleigh-admission-trial-2026-09-19.md`) |
| Frozen check | `tools/skill-check/skillcheck.sh` C1–C7 (v1 + C7), frozen before the ladder was read |
| Chain | 431 → 432 → 433 → 434 → 435 → (this record), `transition` guard declared on every after-map, frame frozen throughout |

## Cycles

| # | action | file | rung_key | predicted Δiso | observed Δiso | placement landed / verdict | isolated after | components / isolates | Ky Fan gap share | result |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ADD | `openwrt-deception-status-2026-09-19.md` | `add:s7:101110101` | -1 | 0 | missed-pattern / missed | 23 | 66 / 23 | 5e-06 | kept |
| 2 | CHANGE | `release-gate-checklist-v2-2026-08-04.md` | `change:refs/release-gate-checklist-v2-2026-08-04.md:bit5` | -1 | 0 | near-pattern / missed | 23 | 66 / 23 | 5e-06 | kept |
| 3 | ADD | `rayleigh-admission-trial-2026-09-19.md` | `add:s8:111100101` | 1 | -1 | missed-pattern / missed | 22 | 66 / 22 | 5.1e-05 | kept |
| 4 | CHANGE | `who-pays-and-why-2026-07-25.md` | `change:refs/who-pays-and-why-2026-07-25.md:bit1` | 1 | 1 | near-pattern / partial | 23 | 67 / 23 | 5.5e-05 | kept |

Cycle 1 wrote a live-verified status census toward the join target `endlessh-openwrt-fit-2026-07-17.md`; the document landed in sector 11 with degree 7 (hamming 5 from the rung's pattern) and did not reach the isolate: **missed**, kept on fact grounds, recorded as not sign-exact. Cycles 2 and 4 were CHANGE rungs whose targets carried real defects under the frozen check (template capability paragraphs); the deterministic fixer cleared them; placement recorded that neither flip the rung asked for was realised (`flip_realised:false`), and cycle 4's own predicted +1 came true for the wrong reason (the document moved to sector 2 and became a new isolate) — sign-exact and `partial` at once, which is exactly why sign agreement and placement are reported separately. Cycle 3 (the admission-trial record) landed in the predicted sector 8 and de-isolated `refs/stress-test-ledger-2026-09-18.md`, giving −1 against a predicted +1: **missed** on pattern, useful in fact.

## Cross-corpus admission trials (same call, five stored baselines)

| map | corpus | N | components / isolates | largest | λ₂ | witness bound | verdicts (seed a) | admitted |
|---|---|---|---|---|---|---|---|---|
| 431 | refs/ round-13 baseline | 223 | 66 / 23 | 11 | 0.687469 | True | components:not-excl; isolates:not-excl; largest:not-excl; lambda2:not-excl; edges:not-excl | **True**  |
| 81 | skills/ round-1 baseline | 495 | 88 / 31 | 45 | 45 | True | components:excluded; isolates:not-excl; largest:excluded; lambda2:excluded; edges:excluded | **True**  |
| 326 | skills/ round-12 baseline | 112 | 78 / 55 | 5 | 5 | True | components:not-excl; isolates:not-excl; largest:not-excl; lambda2:excluded; edges:not-excl | **True**  |
| 296 | docs/ round-11 baseline | 21 | 20 / 19 | 2 | 2 | True | components:not-excl; isolates:not-excl; largest:not-excl; lambda2:not-excl; edges:not-excl | **False** (N < 100: a K-draw tail has no resolution at this size) |
| 78 | refs/ round-4 baseline | 178 | 86 / 39 | 7 | 7 | True | components:not-excl; isolates:not-excl; largest:not-excl; lambda2:excluded; edges:excluded | **True**  |

Reading: admission is a per-frame decision and it comes out differently per corpus for the right reasons. On refs/ (431, 78) the graph statistics are indistinguishable from the fixed-margin null and every criterion holds. On the skills/ baselines the structure is far from the null (a 45-document clique of identical bit patterns on map 81) and the criteria still hold. On docs/ (N=21) the trial refuses: below 100 documents a 40-draw tail has no resolution. The flag went from a hard-coded `false` to a computed value that is `true` where the evidence supports reporting and `false` where it cannot.

## What "admitted" now means, and what it does not

`admitted:true` licenses quoting the five isolation-graph statistics (components, isolates, largest component, λ₂, edges) as instrument readings on that frame with their null tails. It is not a ranking term, it does not change the radius, it does not authorize keeping or reverting, and it does not transfer to another frame without its own trial. The criteria are explicit in every response (`admission.criteria`, `admission.why_not`) and are the executed form of the papers' membership condition: a demonstrated non-degenerate null under which the statistic could have taken another value, reproduced under an independent seed, with the exact witness bound holding for the float estimate.

## Proved vs measured (CI, `lean-check.yml`)

Proved in core Lean 4.33.0 (`papers/data/lean/RayleighBounds.lean`, 15 theorems, no sorry, printed-axiom gate against `rayleigh-scope.json`): the Laplacian quadratic form is PSD; constants and isolated-vertex indicators lie in its kernel; xᵀLx of a 0/1 indicator equals the cut size; the centered-indicator witness has xᵀLx = n²·cut and ‖x‖² = n·k·(n−k). Measured by `verify_rayleigh_claims.py` (stdlib, exact Fraction arithmetic) in `verify-measurements`: nullity(L) = BFS components on every fixture map and 30 random graphs; quad(1_S) = cut(S) on 200 random graphs; the float Fiedler estimate never exceeds the exact witness on any fixture. Not proved: nullity = #components in general, Ky Fan, the float λ₂. Not used: Rayleigh's inviscid stability equation, Rayleigh–Plesset.

## What this record does not claim

Counts only; no sign-agreement rate (this round adds 4 sign-comparable rows: 1 exact). Flat isolated count (23 → 22 → 23) is an instrument observation. The two fixer CHANGEs are defect repairs the rungs happened to name, not wayfinding successes. The Ky Fan gap stayed ≤ 5.5e-5 across the chain: the frozen frame is adequate for this corpus at this size, which says nothing about the edits.
