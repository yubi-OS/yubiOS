# Paper refinement findings — is-this-x-2026-08-12-Final (local run, repo 7d095ae)

## Numeric cross-check of tables against evidence bundle
20/20 table values reproduce from `is-this-x-2026-08-12-Final.zip` results JSON (tab:nulls, tab:percorpus, tab:finitesize).

| check | from JSON | in paper | match |
|---|---|---|---|
| real V2 | 0.723529 | 0.7235293730732693 | ✓ |
| curveball mean | 0.70918 | 0.70918 | ✓ |
| curveball sd | 0.0011832 | 0.001183 | ✓ |
| curveball z | 12.1272 | 12.13 | ✓ |
| z curveball (fixed row+col margins) | 12.1272 | 12.13 | ✓ |
| z swap chain (fixed row+col margins) | 29.4408 | 29.44 | ✓ |
| z row margins only | 49.1391 | 49.14 | ✓ |
| z column permutation | 214.792 | 214.79 | ✓ |
| z iid Bernoulli shuffle | 206.699 | 206.7 | ✓ |
| z yubios_2286 | 12.1229 | 12.12 | ✓ |
| z yubios_eligible | 8.41435 | 8.41 | ✓ |
| z yubios_deferred | 11.6451 | 11.65 | ✓ |
| z yubios_skills | 2.12026 | 2.12 | ✓ |
| z yubios_docs | -0.101487 | -0.1 | ✓ |
| z yubios_refs | 11.5068 | 11.51 | ✓ |
| z yubios_self | 5.80958 | 5.81 | ✓ |
| z yubios_1391_cycle18 | 11.2791 | 11.28 | ✓ |
| z cis_447 | 14.925 | 14.93 | ✓ |
| z scap_ssg_2107 | 21.5393 | 21.54 | ✓ |
| z scap_ssg_rules_dir | 12.9153 | 12.92 | ✓ |

## Issues to fix in the tex

1. **eq:yubios-residual (~line 249)** — ΔV2 printed +0.014415; 0.723529−0.709180 = +0.014349 (full precision +0.014349). z=+12.13 is consistent with the corrected ΔV2 (12.127).

## Reproduction notes from local CI (lean-run.yml)

1. corpus-auditor on the real matrix reproduces V2 = 0.7235293731 exactly, but at the CI's `--nsamp 20` gives z = +10.99 (the gate is z > 6). The paper's +12.13 uses 200 curveball samples, so the CI run is not a reproduction of the headline z. To pin it, raise `--nsamp` to 200 or assert z within a stated band.
2. The corpus-sonometer gives L = +23.95 dBc with seed 20260822 and 12 draws, against a published +21.68 (gate > +15.6). The gap is about 2.3 dB. The curved-corpus addendum should state the value CI actually reproduces, or the draw count that yields +21.68.
3. The 48 FPR-calibration trials at s = 0 (N = 512, d = 9) give an empirical rate of 4/48 = 8.3% at z > 1.645. That is consistent with a nominal 5% at this n (binomial 95% CI ≈ 2–20%), so it is not flagged as a defect.

## Figures added (none existed in this paper)

- Fig. A — null ladder (tab:nulls) + finite-size residual (tab:finitesize).
- Fig. B — per-corpus z vs curveball null (tab:percorpus) + standard-candle detection power from `signal_recovery.json`.

---

# curved-corpus-unified-2026-08-22-v2.tex — G1 tables vs `papers/data/g1/g1-results.json`

- 23/24 table cells reproduce (Leg 1 to 5 dp, Leg 2 to 3 dp). Text claims checked: Leg 1 ratio range [1.000, 1.028] ✓ (JSON: 1.0000–1.0278); A₁(0.005) ≈ 0.59 ✓ (0.5919); "ℓ=3 outlives ℓ=2 at every t" ✓.
1. **tab:leg2, t = 0.100, ℓ = 2:** printed 0.014; JSON value 0.013464 rounds to **0.013**.
- New figure: G1 Leg 1 (synthetic lattice vs heat kernel) and Leg 2 (real corpus vs closed form), with A₁(0.005) marked. This paper had no figures.
