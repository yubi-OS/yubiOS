# edge-standard falsification corpus

Deterministic regression corpus for the edge-standard-v1 pipeline
(`tools/edge-standard/edge_standard.py` — Python source of record; the taste
engine's pinned box-counting measure). The corpus encodes the supersolid
droplet-morphology falsification test from the validated 2026-10-06 run as
anchored `--selftest` assertions, so any pipeline or generator drift fails CI
instead of silently moving a measured D.

## What the corpus is

Ten 512×512 grayscale renders across five design classes, each exercising a
different failure mode of a fractal-dimension measure:

| class | design | what it tests |
|---|---|---|
| `gasket-v2-L384` | Sierpinski droplet lattice, 6 depths, 366 uniform r=3 droplets, L=384 | the primary gate: self-similar D ≈ log3/log2 ≈ 1.585 with a clean local slope |
| `gasket-v2-L256` | same generator at L=256 | L-convergence pair — pins the r/L render bias (−0.099) that re-expresses the gate center |
| `tri` | 19-droplet triangular patch (a=52, dy=45, r=16) | order-vs-disorder discriminator (measured Δ0.23 over shuffle, not the predicted near-degeneracy) |
| `shuffle` ×5 seeds | 19 droplets, rejection sampling, min sep 40, margin 64, `random.Random(seed)` for seeds [42, 1337, 2026, 7, 99] | the disorder control; per-seed D regression |
| `pumpkin_ring` | 6 droplets at the \|Y₃³\| maxima (k·π/3, R=200, r=16) | low-D sparse ring; exploratory, non-gated |
| `pumpkin_field` | orthographic \|Y₃³\| render, R_s=240 | continuum-gradient render; exploratory, non-gated; exercises the threshold-selection path (argmin rule picks t=172 here) |

Every render goes through the FULL pipeline (ink-normalized threshold →
4-connectivity labeling → Moore outer-boundary trace → 1-px contour bitmap →
log-spaced box counting over scales [4, 6, 9, 13, 20, 29, 43, 64]).

## Anchors (from the validated v2 run)

Machine-readable in [`anchors.json`](anchors.json); whole-window D tolerance
±0.002, gate slope tolerance ±0.002.

| class | whole-window D | slope {13,20,29,43,64} | r² | comps |
|---|---|---|---|---|
| gasket-v2 L=384 | 1.5589 | **1.5968** | 0.999 | 366 |
| gasket-v2 L=256 | 1.5967 | 1.4858 | 0.995 | 366 |
| tri | 1.2636 | 1.4667 | 0.988 | 19 |
| shuffle-s42 | 1.0355 | 1.0467 | 0.998 | 19 |
| shuffle-s1337 | 1.0305 | 1.0714 | 0.999 | 19 |
| shuffle-s2026 | 1.0302 | 1.0483 | 0.998 | 19 |
| shuffle-s7 | 1.0404 | 1.0853 | 0.992 | 19 |
| shuffle-s99 | 1.0456 | 1.0999 | 0.992 | 19 |
| pumpkin_ring | 0.9772 | 0.8685 | 0.983 | 6 |
| pumpkin_field | 1.0384 | 1.0452 | 0.999 | 6 |

Gate (amended pre-v2, logged in
[amendments-log-2026-10-06.md](amendments-log-2026-10-06.md)): local slope
over scales {13, 20, 29, 43, 64} at L=384 within 1.5968 ± 0.002, r² ≥ 0.98.

Beyond the anchors, the selftest asserts the two silent-failure guards from
the run lessons: non-empty mask on every render (lesson 3 — binary renders
above ~12% ink threshold to an empty set under the argmin rule) and exact
component counts (lesson 5 — MIN_COMPONENT can silently drop classes; the
isolated r=2 disk traces 0 boundary px, which is why the gasket pins r=3,
asserted directly).

## Running the selftest

```sh
python3 tools/edge-standard/falsification/gen_v2.py --selftest
```

Pure stdlib, no environment access, deterministic. Regenerates every class at
512×512, runs the full pipeline by importing `edge_standard` from the parent
directory, and prints PASS/FAIL per check. Exit 0 = all anchors reproduce,
exit 1 = any drift. Runtime ≈ 3 s.

Wired into CI as one `verify-tools` step in `.github/workflows/lean-check.yml`
(see the proposed diff in `lean-check-diff.md`).

## Canonical record

The measured run, gate amendments, and interpretation live in
`refs/sierpinski-supersolid-connection-2026-10-06.md` on yubi-OS/yubiOS main
(6 addenda), plus the solo run log. The amendments log is duplicated in this
directory because the gate window and calibration are load-bearing for the
anchors here — do not move an anchor without a logged amendment first.
