# spectral-decomposer

A curve-guided-self-ideate tool. Given a corpus matrix, produces a
ranked list of "new idea" candidates in the **lens-format** pioneered by
`skills/curve-compass-skill` (cycle-34 L141-L146) and re-grounded in the
program's harmonic-fit machinery plus the Lean-4-proved
curveball fixed-margin null.

Every candidate IS a measurable experiment. The output `cycle-NN-lens.md`
artifact drops directly into a curve-guided-rsi cycle.

## What it does

1. Loads the corpus as a binary `N × d` coverage matrix.
2. Embeds rows via PCA-top-2 + stereographic lift and reports the **orthonormal
   real spherical-harmonic Parseval shares** `S_ℓ`, ℓ = 0..3: `c_ℓm = (1/N) Σ_i Y_ℓm(p_i)`
   (the SH projection of the empirical point density; `Y_ℓm` carry the √2 factor for m ≠ 0, no extra
   unsigned `P_ℓ^m` term, ℓ = 0 monopole measured), `S_ℓ = Σ_m c_ℓm² / Σ_ℓ' Σ_m c_ℓ'm²`, so
   `S_ℓ ≥ 0` and `Σ S_ℓ = 1`. Real corpus: `[0.232, 0.090, 0.395, 0.284]` (the old tool printed
   `[0.010, 0.016, 0.086, 0.889]`). This is a moment projection, not a least-squares fit; the
   Fibonacci lattice is the uniform-density reference in the selftest (`S_0 = 1`).
3. Ranks the missing cells by the L2 change of the low-ℓ (ℓ ≤ 2) SH reconstruction that closing the
   cell causes (PCA refit, canonical sign; 8 cells per primitive column shortlisted by their
   frozen-frame displacement, then exact refit) — not by column standard deviation.
4. For each of the top-K cells, one candidate whose **delta is the flip itself**:
   - **real** — `dV2_real = V2(M ⊕ e_ij) − V2(M)`, exact.
   - **control** — the same kind of flip on curveball-null matrices (20N trades per draw, Lean §8):
     a zero cell in the same column, in a row of the same coverage, giving the distribution `dV2_null`.
   - **verdict** — `delta_v2_z = (dV2_real − mean(dV2_null)) / sd(dV2_null)`,
     `delta_dBc = 20 log10 |z|`; YES if ≥ +6 dBc (|z| ≥ 2), PARTIAL if ≥ 0 dBc (|z| ≥ 1), else NO.
     JSON `delta` carries `dV2_real`, `expected_delta`, `null_flip_sd`, `delta_v2_z`, `L_real_dBc`
     (level of the flip), `L_control_dBc` (level of the mean null flip), `delta_dBc`, `baseline_L_dBc`.
5. Renders the candidates as a lens-format `cycle-NN-lens.md`.

## Quick start

```bash
./spectral_decomposer.py --selftest
./spectral_decomposer.py --input <corpus.json|zip|csv> --cycle 34
./spectral_decomposer.py --input <corpus.json> --json
```

## Connection to the curved-corpus program

This tool is the deliverable-side analogue of `curve-guided-rsi-self`
and the measurement-side analogue of the cycle-34 lens-format patch
generation in `skills/curve-compass-skill`. A candidate's delta is a
**single-flip z-level**: the flip's effect on V2 against the same kind of flip on the
curveball null, in dB (`20 log10 |z|`). It is **not** the +15.6 dBc corpus detectability
floor (that is the sonometer's whole-corpus level) and it is not `L(M) − L(M0)`. The
previous version compared the corpus with a shuffled copy, so every candidate read the
corpus level (+26…+60 dBc) instead of the flip, although a single flip moves V2 by ≤ 0.14 σ_null.
Honest expectation: most single flips are NOT distinguishable from the null (selftest: ≈ 8% YES
on a pure curveball matrix at the |z| ≥ 2 cut).

## Lean anchors

- **§8 `trade_preserves_rowSum / trade_preserves_colSum`** — the
  curveball null preserves row+column sums; the tool's control arm
  is a curveball-shuffled copy of the corpus, not a re-draw.
- **§9 `trade_reversible / uniform_inflow_constant`** — uniform is
  the canonical null on the fibre; the corpus-sonometer dBc reading
  is calibrated against this null, not against the corpus itself.
- **§10 `stationary_unique_uniform`** — uniqueness of the null
  via the discrete maximum principle; the tool does not generate
  alternative nulls and would reject them if it did.
- **§12 `bpow_add / level_double / level_injective`** — the dBc
  level laws; the tool's delta readout obeys all three (cascade
  additivity, squaring doubles the level, readings are injective).

## Self-test (falsifiable checks)

`--selftest` runs 19 checks and none is an isinstance or format-string check: SH Gram matrix = I
(max deviation 7e-15) and closed-form Y20/Y33; uniform-lattice monopole; a planted ℓ = 3 lobe recovered
at its theoretical share; synthetic and real-corpus shares in [0,1], summing to 1, with
S_3 ∈ [0.15, 0.50]; the sparse-cell weight equals an independent eigh-PCA refit (1e-9); the flip delta
equals the exact `V2(M ⊕ e) − V2(M)`; z uses the null-flip statistics; verdicts match an independent
restatement of the rule; "not every verdict is YES, but some are" plus a bounded false-positive rate on
a pure curveball matrix; the markdown artifact round-trips the candidate numbers. The
`parseval_shares → {"0": −1}` and `verdict = "YES"` mutations are both detected. `--selftest` reads the
real corpus zip (`papers/is-this-x-2026-08-12-Final.zip`, or `--input <zip>`) and FAILS if it is missing.

## Honest negative (what this tool is NOT)

- It is not a substitute for `tools/rsi-descent` — it does not
  iterate cycles, only generates the lens pool for a single cycle.
- It is not an LLM — every candidate is computed from the matrix,
  no language model involved.
- It does not check the caustic detector (Lean §10) — the caveat
  field warns about rank-collapse on the primitive basis.

## Implementation

numpy only. Deterministic given `--seed` (`--draws` null draws, default 40; `--window` 20N trades).
The curveball null is the algorithm shipped in `tools/corpus-sonometer` and `tools/corpus-auditor`.
