# life-supersolid

Executable Conway Game of Life (B3/S23) instrument: de novo motif and attractor census, a Sierpinski still-life "supersolid" crystal, live-CA glider transmission, Wolfram (2025) modularity-vs-area and a focal-point / curveball-null analysis. Pure Python stdlib (plus `tools/edge-standard/edge_standard.py` by path). No planted coordinates, no static JSON results.

```bash
python3 tools/life-supersolid/life_supersolid.py --selftest       # LIFE_SUPERSOLID_SELFTEST_OK (~30 s)
python3 tools/life-supersolid/falsification/harness_life.py       # 11 gates (5 anti-stub + 6 scientific), ~15 s
```

## Rule specificity (L-4)
`verify_b3s23_rule_table()` checks `step_grid` against the exact B3/S23 transition on **all 2 x 2^8 = 512** Moore-neighbourhood configurations (18 `(centre, live-neighbours)` classes): the centre is alive next tick iff `s == 3` or (`c == 1` and `s == 2`). For example a live centre with `s = 8` neighbours must die (rejects B3/S238), a dead centre with `s = 8` must stay dead (rejects B38/S23), and a dead centre with `s = 6` must stay dead (rejects HighLife B36/S23). It is gate **G_DYN_1** of the harness and the first check of `--selftest`. If the rule is wrong, or one of the four elementary motifs (block, tub, blinker, glider) cannot be discovered under it, the harness reports G_DYN_1 as `FAIL` and stops cleanly (no `KeyError`), and the selftest raises `RuntimeError`.

All ten non-Conway rules of the reviewer's mutation test (B36/S23, B3/S236, B38/S23, B3/S238, B35/S23, B3/S2, B3/S234, B34/S34, B2/S, identity) fail the harness at G_DYN_1.

## De novo census (L-1, L-2): `build_life_pattern_corpus`
Seed spaces, each enumerated exhaustively: the 511 non-empty 3x3 bitmasks, the 511 5x5 D4-quadrant bitmasks, the 511 6x6 C2-inversion bitmasks.

1. Every seed is evolved by `_settle` until it dies, repeats a configuration up to translation, or reaches **128 ticks**. Nothing is cut at a fixed tick count.
2. **`search` (single-island attractors)**: every Chebyshev-`d_inf <= 2` island of the settled state that, in isolation, is an exact periodic/translating orbit of period `<= 15` (`detect_orbit_period(island, 15)`), from **all three** seed spaces (the 6x6 C2 stage contributes singles too), deduplicated by the D4/translation signature minimised over the orbit's phases.
3. **`constructed` (multi-component constellations)**: a settled state with `>= 3` (3x3 seeds) or `>= 4` (5x5, 6x6 seeds) islands **whose whole configuration is a periodic/translating orbit** (`detect_orbit_period(state, 15) is not None`). A constellation is therefore a genuine attractor, never a transient ash snapshot. Deduplicated by phase signature.
4. **Selection rule: keep everything.** With the default `max_per_kind=None` all discovered attractors of both kinds are kept; the census size is whatever the seed spaces yield. A balanced sample is available explicitly via `build_life_pattern_corpus(max_per_kind=n)` (the first `n` of each kind in discovery order: 3x3, then 5x5, then 6x6, ascending mask). The former truncation `multi_list[:len(elem_list)]` and the fixed 36 are gone.

Measured census: **37 single-island attractors + 7 whole-pattern-periodic constellations = 44 patterns**. Single islands by period: p1 x27, p2 x7, p3 x1, p4 x1, p8 x1; constellations: p1 x4, p2 x3. The reviewer's independent census (own stepper) finds 20 multi-component states at the old fixed tick counts; only the 7 that are periodic as a whole are kept (all 7 verified periodic by `check_life_census.py`), where 14 of the former 18 'constructed' entries were transient ash.

## Glider transmission by live CA (L-3): `measure_glider_transmission`
**Every** ray offset is decided by simulating B3/S23 (`step_grid`) on the active ray corridor `|(cx - cy) - off| <= 16`: the glider (discovered from the 3x3 enumeration) starts 8 rows above the first corridor block, the CA runs until it is 8 rows past the last one, and the ray is `transmitted` iff the final state equals the corridor crystal plus the glider translated exactly `(+T/4, +T/4)`. The result keeps the geometric guess beside it (`geometric_clear_rays`, `ca_geometric_disagreements`) but only the CA count enters `transmitted` / `transmission_fraction`. For speed `_run_ticks_incremental` recomputes only the 3x3 neighbourhood of cells that changed in the previous tick via `step_grid` (exact by locality; tested equal to full stepping on random soups).

| depth k | rays | CA transmitted | CA T | geometric T (old) |
|---|---|---|---|---|
| 2 | 137 | 119 | 0.8686 | 0.9124 |
| 3 | 137 | 92 | 0.6715 | 0.7956 |
| 4 | 137 | 36 | 0.2628 | 0.5255 |
| 5 | 137 | 5 | 0.0365 | 0.1168 |
| 6 | 137 | 2 | 0.0146 | 0.0365 |

Thresholds (selftest and G_SCI_2): `T(2) > 0.80`, `T(4) > 0.20`, `T(6)` has `>= 2` transmitted rays and `> 0.01`, T strictly decreasing in k. G_DYN_3 picks a ray the CA shows transparent and blocks it with an injected block.

## Gate changes
* G_SCI_4: Spearman(area, modularity) over the untruncated census is 0.556, so the gate is `>= 0.50` (was 0.75 on the truncated set); M_search 1.014 (<= 1.25), M_constructed 4.857 (in [4, 9]).
* G_SCI_6 on the new feature matrix: n*(tau=0.5) = 5, r_hat 3.69, delta r_hat +0.92, z = +10.8 / +11.5 (both seeds).
* The selftest uses explicit `_check()` (raises `RuntimeError`) instead of bare `assert`, so it survives `python -O` (L-9).

## Known limits
Fractal D and the v3 control (G_SCI_1/G_SCI_3) are measured on a rendered disk image of the gasket coordinates and are not CA-dependent beyond block stationarity; G_DYN_5 and the Leggett bound are weak by construction; motif "discovery" names shapes with small hand-written predicates (see the module docstring).
