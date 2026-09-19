# tools/point-map instrument census (verified 2026-09-18)

Date: 2026-09-18. Family: census record. Origin: wayfinder round 8 cycle 27 — the instrument
this round runs on deserves the same inventory discipline it imposes. Observations live at
`a6fbbdb9`.

| Read | Value |
|---|---|
| Blobs under `tools/point-map/` | 64 |
| `scripts/` blobs at the pin | 18 |
| Lean proof workflows on main | lean-check and lean-run, both **success** on `d313ac86` and `42a0ce77` (runs API read this pass) |

The instrument's own repo state is part of the corpus's verification chain: the wayfinder
rounds' math diagnostics (`WayfinderBounds.lean`, radius scope) compile in CI, and the census
pins that surface at the round's pin. The module versions the round observed at
`/api/health` (`pointmap/0.2`, `wayfinder-math/1`, `radius/1`, `calibration/1`, `outcomes/1`,
`axis-trial/1`, `consistency/1`, `limits/2`) are the operating versions for every map in this
round's chain.

## What this record does not claim

No instrument-verification claim: the Lean CI's scope theorem is an integer/count statement, not
a floating-point or semantic guarantee. The census inventories; it does not re-audit.
