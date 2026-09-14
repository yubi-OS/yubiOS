# Wayfinder round 3: 10-cycle frozen-frame loop results (2026-09-13)

**Instrument:** `steady-orbit.systems-a.workers.dev` pointmap/0.2, per
`refs/point-to-point-latent-map-2026-09-06.md` Addendum 12 and the live AGENT.md (v0.2).
Family: `refs/wayfinder-loop-results-2026-09-09.md` (rounds 1-2).

## Run facts

- **Corpus:** `refs/*.md` at main, pinned SHA `d568b232aeda2d43d6d217f6dc14cfba9847caec` —
  168 files at baseline, 176 after (8 ADDs, 1 CHANGE).
- **Frozen frame:** `a045c8d3f4ff939b` unchanged across all 11 maps (map trail 66 → 76);
  d=9, seed=20260906, threshold=median, K=40, T=0.05, chunked/v1.
- Baseline: V2 = 0.31597, isolated 61, 12/12 sectors occupied, null verdict "excluded at
  the resolution of this null" (z = 3.04, descriptive only).

## Cycle ledger

| Cycle | Rung | Edit | Predicted iso | Observed | Verdict |
|---|---|---|---|---|---|
| 1 | L1 change | broken `session/` references repointed in `cycle4-results-2026-08-06.md` | −1 | 0 (identity ledger, quantization-silent) | KEEP (task check: all refs resolve at pinned tree) |
| 2 | L4 add | `chromium-runner-highmem-2026-09-09.md` | +1 | +1 (ledger exact, new_degree 0) | KEEP (sign-exact) |
| 3 | L2 add | `adjacent-problems-runner-privilege-2026-09-13.md` | +1 | +1 | KEEP (sign-exact) |
| 4 | L5 add | `systemd-v262-refresh-2026-09-13.md` | +1 | **−1** (de-isolated `systemd-upstream-progress-2026-07-21.md`) | KEEP (sign mismatch vs generic rung, ledger exact, movement in the de-isolating direction; task check passed) |
| 5 | L4 add | `arm64-path-a-omn36-lapse-2026-09-13.md` (OMN-36 due 2026-09-12 lapsed in Backlog, assignee now OMNI-AGENT) | +1 | +1 | KEEP (sign-exact) |
| 6 | L2 add | `adjacent-problems-mirror-provenance-2026-09-13.md` | +1 | **−1** (de-isolated `metrics-and-reporting-2026-07-25.md`) | KEEP (same reading as cycle 4) |
| 7 | L5 add | `release-census-2026-09-13.md` (v0.8.7/v0.8.8, assets static, Issue #24 open) | +1 | 0 (new_degree 2, connected on arrival) | KEEP |
| 8 | (change, verification) | live CI-state addendum on `chromium-provenance-overlay-status-2026-09-09.md` (`ci` green, ARM64 build lane 2/2 failed) | — | 0 (silent) | KEEP (task check = live verification) |
| 9 | L3 add | `wayfinder-round3-isolate-census-2026-09-13.md` (62 isolates recomputed from stored coords, classified) | +1 | +1 | KEEP (sign-exact) |
| 10 | L3 add | this record | +1 | see final map | — |

## Instrument readings

- Isolated: 61 → 62 → 63 → 62 → 63 → 62 → 62 → 62 → 63 → final (the two −1s came from ADDs
  connecting existing isolates, not from CHANGEs).
- V2: 0.31597 → 0.3204 (map 73) → 0.32019 (map 75). Gate note unchanged: gate_pass = false
  is the measurement on this coordinate, not evidence about the corpus; the Lean §4 identity
  holds trivially with both sides false.

## Discipline notes

- One declined edit: the repeated L1 rung on `cycle4-results` after cycle 1 — further edits
  to flip bit 1 would have been vocabulary padding (AGENT.md decline rule).
- `task_verdict` remains not-tested: every factual claim in every added doc was verified
  against a live API (GitHub runners, releases, issues, Linear OMN-36, systemd releases,
  chromium-provenance CI) on 2026-09-13, but no independent graded editor scored the edits.
- All changes are append-only or reference-repointing; no deletions.

---

## Completion and errata — 2026-09-13

**Append-only.** The cycle ledger, run facts and instrument readings above are
left exactly as first recorded, including cycle 10's open `see final map` cell.
This section closes that cell and records what the trail does and does not
establish.

### Final map (cycle 10 closed)

| Field | Value |
|---|---:|
| Map id | **76** |
| Items (N) | **176** |
| Isolated I(0.095) | **64** |
| V2 | **0.31855** |
| Frozen frame | `a045c8d3f4ff939b` (unchanged) |

The full isolated series therefore reads
**61 → 62 → 63 → 62 → 63 → 62 → 62 → 62 → 63 → 64**, and the V2 series ends
0.31597 → 0.3204 (map 73) → 0.32019 (map 75) → **0.31855** (map 76).

All eleven stored maps 66–76 were retrieved and each isolation count was
recomputed independently from full-precision stored coordinates; every
recomputation matched the instrument. All eleven maps carry the same frame, and
every point shared between consecutive maps had **exactly zero** coordinate
movement across the whole trail.

Cycle 10's generic rung predicted **+1** and the observed delta is **+1**. That
makes the rung predictions exactly correct on **5 of the 8 ADDs**, and **5 of 9**
across all nine recorded predictions. The ninth recorded operation — the cycle 8
verification CHANGE — was logged without a prediction and is **not** assigned an
invented one here. `task_verdict` remains **not-tested**: a correctly predicted
+1 isolate is an instrumentation success, not a demonstrated quality improvement,
and no independent graded editor scored these edits.

### Operations vs. PR diff: a discrepancy that is recorded, not resolved

These two counts are different things and both are kept:

| View | Count |
|---|---|
| **Runtime operation trail** (this ledger) | **8 ADDs + 2 source-text CHANGEs** |
| **PR 232 file diff** | **8 added files + 1 modified existing file** |

The run-facts line at the top of this document — "176 after (8 ADDs, 1 CHANGE)" —
describes the **PR diff**, not the operation trail. Of the two runtime CHANGEs,
cycle 1 (`cycle4-results-2026-08-06.md` reference repointing) appears in the PR
diff as the one modified file. The cycle 8 runtime CHANGE — the live CI-state
addendum on **`chromium-provenance-overlay-status-2026-09-09.md`** — **does not
appear in the PR 232 diff at all.**

The record does not explain why. No mechanism is asserted here, and in particular
**no claim is made that every runtime source mutation shipped**. Anyone
reconciling the repository against this trail should expect one runtime CHANGE
with no corresponding committed diff hunk and should treat the cause as open.

Both readings are independently useful and neither supersedes the other: the
operation trail is what the instrument measured, the PR diff is what the
repository received.

### Instrument-parameter sensitivity (added after the fact)

The isolation radius **0.095 is canonical and unchanged**. A separate, predeclared
diagnostic sweep over radii 0.075 / 0.085 / 0.095 / 0.105 / 0.115 found that
cycles **6, 9 and 10 reverse the sign** of their isolate delta somewhere on that
grid, and cycle 4 becomes neutral. At r = 0.105 the first and last maps both read
46 isolates.

That is sensitivity to an instrument parameter. It is **not** evidence of physical
glassiness, a thermodynamic transition, or a better radius, and no radius was
selected after seeing these numbers. The radius profile belongs **beside** the
single canonical count, never in place of it.
