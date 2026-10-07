# SPEC: spectral-standard-v1 + hierarchy-oracle-v1

Date: 2026-10-06. Status: build spec for the parallel-build-lanes round. Sources: `refs/hierarchy-oracle-2026-10-06.md` (ideation one-pager, clef MVP choice V1_plus_V6 p 0.686), 3 research lanes (2026-10-06), the falsification-corpus skill, the taste-engine skill.

## Goal

Extend the validated hierarchy detector with its spectral sibling, compose the **two-axis hierarchy oracle** (geometric D + spectral d_s, gated by the Einstein relation), and make the calibration inherited: the gold family is the Sierpinski gasket with exact closed forms for all three exponents (d_f = ln3/ln2 ≈ 1.585, d_w = ln5/ln2 ≈ 2.32193, d_s = 2·ln3/ln5 ≈ 1.36507).

## Deliverables

1. **Python source of record** `tools/spectral-standard/spectral_standard.py` — stdlib only, deterministic, no env access (house rule, mirrors edge_standard.py).
2. **JS worker port** `jev-spectral-math.js` (+ route wiring spec for `jev-corpus-routes.js`) with fixture parity against the Python source.
3. **Falsification harness** `tools/spectral-standard/falsification/` with pre-registered bands + selftest (CI-guarded, mirrors gen_v2.py --selftest pattern).
4. **Oracle composition contract** (route shape below; deployment via steady-orbit-deploy after lanes + advisor).

## Instrument contract (pinned — any change to these is a major version bump)

### Modes

- **walk mode** (input: binary mask or explicit graph): build a graph on ink (8-connected for masks), run seeded random walks, measure:
  - d_w from mean-square displacement: ⟨r²(t)⟩ ∝ t^(2/d_w)
  - d_s from return probability: P(0,t) ∝ t^(−d_s/2)
- **series mode** (input: any 1D ordered series — Laplacian eigenvalues, PSD bins): integrated counting exponent, log N(ω ≤ x) vs log x over the pinned window.

### Pinned parameters

- **Walk-step ladder: the taste scale lattice [4, 6, 9, 13, 20, 29, 43, 64]** — the same 8-point log ladder as the box-counting window, times a step-scale factor so a level-4+ gasket's hierarchy is inside the window. Pre-registered in the harness; never retuned to an outcome.
- **Walkers**: 64 walkers, deterministic seeded PRNG (mulberry32, seed = input sha-derived), same PRNG in JS and Python (parity requires identical walks).
- **r² gate ≥ 0.98** on every fitted exponent (same gate as taste).
- **Series counting window**: middle band of the ordered series — ranks r ∈ [N/8, N/2] pre-registered (edge effects excluded), fit over the same 8-point lattice in rank space.

### Outputs (deterministic)

`{mode, d_w, d_w_r2, d_s, d_s_r2, alpha_msd, einstein: {d_s, two_D_over_d_w, delta, verdict: consistent|inconsistent|insufficient}, log_periodic: {present: bool, method: "residual-octave-alternation"}, run_id}`

Einstein gate: verdict `consistent` iff |d_s − 2·D/d_w| ≤ 0.10 with all three inputs measured at r² ≥ 0.98. D comes from the caller (edge-standard features, stamped `source: caller` per taste doctrine) or a paired edge-standard call in oracle mode.

## Gold corpus (pre-registered bands — log BEFORE any measurement, per falsification-corpus skill)

| # | Gold | Quantity | Predicted band |
|---|---|---|---|
| 1 | Gasket graph level 3 (27 vtx) + level 4 (81 vtx), Laplacian eigenvalues computed exactly (Jacobi, fraction or float64 with residual check) | d_s (counting) | 1.365 ± 0.07 → [1.295, 1.435] |
| 2 | Gasket graph, walk mode | d_w | ln5/ln2 = 2.32193 ± 0.10 |
| 3 | Gasket graph, walk mode | MSD exponent α = 2/d_w | 0.861 ± 0.04 |
| 4 | 1D chain (path graph) | d_s | 1.0 ± 0.10 |
| 5 | 2D 4-connected lattice patch | d_s | 2.0 ± 0.15 |
| 6 | Eigenvalue series PERMUTED (null) | counting exponent | MUST collapse: |α_perm − α_sorted| ≥ 0.5 OR fit r² < 0.98 — if the exponent survives permutation the window is reading sample size → harness failure |
| 7 | Falsification renders (tri, gasket render, jitter) via oracle path | d_s (walk) | gasket render ∈ [1.295, 1.435]; tri and jitter both ≈ 2.0 (D's order-blindness must REPRODUCE in d_s — jitter ≈ lattice is the predicted null, not a bug) |
| 8 | Log-periodic modulation on exact gasket eigenvalues | wiggle presence | residual alternation across successive octave bands must be present (secondary gate; never a fit parameter) |

## Route contracts (bearer-auth, scorer pattern, steady-orbit worker)

- `POST /api/jev/corpus/spectral/walk` `{mask_b64, width, height} | {edges: [[a,b],...]}` → walk-mode outputs, run row kind `spectral-walk`
- `POST /api/jev/corpus/spectral/series` `{values: number[]}` → series-mode outputs, run row kind `spectral-series`
- `POST /api/jev/corpus/oracle` `{image: {width, height, bitmap_b64}}` → runs edge-standard internally + spectral walk on the traced mask, returns both feature sets + einstein verdict, run row kind `oracle`
- `GET /api/jev/corpus/spectral/selftest` → gold-corpus checks, 200 all-pass / 500 failing

Run rows: `jev_corpus_runs`, idempotent per input sha256, policy_version stamped. Every instruction/measurement carries rendered decimals (the fmt() lesson). Verdicts are data, never authorization — the oracle proposes nothing by itself.

## Parity discipline

- JS `jev-spectral-math.js` imports nothing worker-specific; pure functions; fixtures shared with Python (JSON).
- Walk mode: identical PRNG, identical walker seeds → byte-identical step sequences; parity check = same d_w to 1e-9.
- Series mode: exact match on counting table to 1e-12.
- On mismatch the JavaScript is wrong until proven otherwise (house rule).

## Test requirements

- Python selftest ≥ 20 checks (gold table + permutation null + determinism + empty-input failures).
- Node parity suite over the fixture pack.
- Live-route verification after deploy (stale-deploy ~20s lesson; selftest passing does not mean routes work).

## Out of scope (this build)

Powered-lens actuation (V3), router pair-bands (V4), intake surface (V5), console card, any `admitted` flip (the oracle is a consistency instrument, not a taste axis). These are follow-ons gated on this MVP measuring clean.
