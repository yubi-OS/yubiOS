# Wayfinder round 6 results: 100 cycles on refs/ with geometry-authorized ADDs (baseline 119, frame 148a4c7d677b112a)

**Date:** 2026-09-17 (07:00 Pacific). **Corpus:** `refs/*.md` at `af7cedbd` — 184 docs at the frozen baseline, 191 after 7 executed ADDs. **Protocol change (user directive):** ADD rungs executed this round; AGENT.md lesson 9 superseded for this round only (geometry authorizes an edit). The frozen task check still gated every commit; geometry and task quality stayed separate.

## Cycle totals (100/100)

| result | n |
|---|---|
| kept ADD (geometry-authorized, one commit each) | 7 |
| abstained (frozen check PASS; no defect to state) | 49 |
| declined, fixer could not reach PASS (reverted) | 43 |
| declined, authored ADD failed the frozen check (not committed) | 1 |

Outcomes ledger (baselines 119-127): **207 rows**, verdicts {'pending': 103, 'abstained': 53, 'declined': 44, 'kept': 7}, preregistered 206/207.

## Executed ADDs

| cyc | sector | file | pred | preview ledger | after-map isolated |
|---|---|---|---|---|---|
| 3 | 1 | wayfinder-round6-add-sector1-2026-09-17-c3.md | -1 | None | 39 |
| 4 | 1 | wayfinder-round6-add-sector1-2026-09-17-c4.md | -1 | None | 39 |
| 5 | 1 | wayfinder-round6-add-sector1-2026-09-17-c5.md | -1 | None | 39 |
| 6 | 1 | wayfinder-round6-add-sector1-2026-09-17-c6.md | -1 | None | 39 |
| 7 | 1 | wayfinder-round6-add-sector1-2026-09-17-c7.md | -1 | None | 39 |
| 9 | 11 | wayfinder-round6-add-sector11-2026-09-17-c9.md | 1 | None | 40 |
| 10 | 11 | wayfinder-round6-add-sector11-2026-09-17-c10.md | 1 | -1 | 39 |

Notes on the ADD record:

- **Cycles 3-7 authored five near-identical sector-1 notes and 9-10 two sector-11 notes because the one-ADD-per-sector guard did not exist yet**: the ladder re-proposed the same sparse-sector rung after every after-map and the (then) driver executed each proposal. The guard landed at cycle 10; a reviewer may want to collapse the five sector-1 docs to one. No deletion was executed (AGENT.md: no deletions).

- The one preview-measured ADD (sector 11, cycle 10) returned **exact-ledger Δ −1 vs predicted +1**: a sign mismatch, one row. Pre-patch ADDs (cycles 3-9) carry prediction-only rows because their after-map comparisons read not-tested (name set grew).

- After-map isolated never moved off 40 (map 125) across all ADDs: each authored note landed in an already-occupied neighborhood on the frozen frame. All ADD geometry sits inside the positive-control band (Δ ∈ {0, +1, +2}, n=6).

## CHANGE outcomes: zero kept

Round 5 already fixed every file the deterministic fixer can reach, so every CHANGE rung/exemplar/sweep target this round either abstained (frozen check PASS, no defect to state) or declined. Decline root causes (same two classes as round 5): (1) residual partial mojibake that is not deterministically recoverable without a judgment call; (2) the C6 check artifact — repo-relative links (`../docs/BLOCKERS.md`, `../PINNED.md`, `../papers/…`) that resolve in the full repo but not under this refs/-only mirror.

## Instrument readings

- Positive control (cutpaste-splice/1, seed 20260923, n=6): Δisolated {zero 4, positive 2}, 1/6 quantization-silent, no negatives. Seed 20260922 control request 500'd at the Worker edge and was not retried; the band is n=6.

- Axis trial (loo-nn-vote/1, K=40): 4/9 axes excluded-from-fixed-margin-null, 5 not-excluded, total z +3.98 (descriptive, `admitted:false` always).

## Incidents (on the record)

- First ADD implementation crashed on a missing repo-path prefix in the blob call; 5 driver restarts created 5 orphaned pending rows (248-252), closed via supersedes rows 253-256. The driver now asserts status on every git call and dedupes pending rows.

- The repeated-ADD gap (above) was closed by the one-ADD-per-sector-per-pass guard at cycle 10, after 7 ADD commits had already landed.

