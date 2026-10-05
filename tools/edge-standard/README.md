# edge-standard

The `edge-standard-v1` standardized edge-map pipeline — the Python source of record
for the steady-orbit worker's `POST /api/jev/corpus/taste/edge-standard` route and the
taste engine's `fractal_band` axis. Instrument doc: `refs/edge-map-standard-2026-10-05.md`.
Grounding corpus: `yubi-OS/knowledge/edge-map-standardization/` (draft PR #83).

Pipeline (pinned; changes to TARGET_COVERAGE=0.06, MIN_COMPONENT=12, or the
4..64/8-scale box-counting window are major version bumps):

    raw gray -> ink-normalization threshold (argmin |coverage - 0.06|, ties smaller t)
    -> 4-connected components -> Moore outer-boundary tracing (1-px contours,
    < 12 px dropped) -> box-counting measurement (log N vs log(1/s), r2 gate 0.98)

Files:
- `edge_standard.py` — Python source of record (stdlib only). `--selftest` runs
  the 4-fixture parity checks + independent property tests.
- `edge_fixtures.json` — fixture pack with expected outputs generated from this
  source of record (incl. the normalization property: f1/f2 same shape, different
  gray levels -> identical traced grid + identical D).
- `jev-taste-math.js` / `jev-edge-standard.js` — the JS worker port (pure modules,
  no env access), shipped here so CI runs the cross-implementation parity.
- `test_parity_edge.test.js` / `test_e2e_edge.test.js` — node --test suites
  (13 parity + 5 e2e checks, max |dD| 4.4e-16 vs the Python source).

CI: wired into `.github/workflows/lean-check.yml` (verify-tools job).
