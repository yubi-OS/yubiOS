# tests/ corpus census (verified 2026-09-18)

Date: 2026-09-18. Family: census record. Origin: wayfinder round 8 cycle 23. Observations live
at `a6fbbdb9`.

| Read | Value |
|---|---|
| Blobs under `tests/` | 40 |
| Existing VM boot-test lanes | `tests/vm/` (the shape an image-rooted nspawn leg would follow, per `refs/adjacent-problems-nspawn-boundary-2026-09-17.md`) |

The tests corpus is the machine half of the corpus's verification claims; this census pins its
inventory at the round's pin. The count (40) matches the round-2 records' count — no test
scripts have been added since the round-2 sweep.

## What this record does not claim

No test-quality judgment: a census is an inventory. The 40 blobs include fixtures and helpers,
not only runnable legs. Coverage claims live in the blockers register, not here.
