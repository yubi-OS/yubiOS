# Wayfinder round 6 prep: baseline 119, control, axis trial, ADDs authorized

**Date:** 2026-09-17 (06:37 Pacific). **Corpus:** `refs/*.md` at `af7cedbdbdf2953083ab5f593eaec5dca59ea9a7` (184 docs, 2,015,446 UTF-8 bytes, 0 truncated; post-#243-merge main). **Instrument:** `pointmap/0.2`, d=9, seed 20260906, threshold median, K=40, T=0.05.

## 1. Baseline map 119

`frame_id 148a4c7d677b112a`, `instrument_id 6782a97ca9c308de`, N=184, isolated 40. Opening ladder: L1 ADD (sector 3), L2 ADD (sector 1), L3 CHANGE `adjacent-problems-verification-chain-2026-09-01.md` (sector 2), L4 ADD (sector 7), L5 ADD (sector 11) — 4 of 5 rungs are ADDs.

## 2. Positive control (cutpaste-splice/1)

Seed 20260923 (n=6): Δisolated {zero 4, positive 2}, 1/6 quantization-silent, no negatives. Seed 20260922 failed with a Worker 500 ("Network error") and was not retried; the band is n=6, not n=12. Band: Δ ∈ {0, +1, +2} on this frame.

## 3. Axis trial (loo-nn-vote/1, K=40)

4/9 axes excluded-from-fixed-margin-null, 5 not-excluded, total z +3.98 (descriptive; `admitted:false` always).

## 4. Round 6 protocol change (user directive)

The user authorized executing ADD rungs this round, explicitly superseding AGENT.md lesson 9: **geometry does authorize an edit.** Per cycle:

- ADD rung → author a grounded coverage note in the named sector (real excerpts + links from the rung's exemplar files; provenance stated in the doc), apply the frozen `taskcheck_refs.sh` to the new file BEFORE commit (must PASS), commit, then after-map on the frozen frame with the grown name set. The name-set growth may make the after-map comparison read not-tested; the row records `observed_source: caller` with the after-map comparison delta.
- CHANGE rung → unchanged discipline: pre-register, frozen check FAIL → deterministic fixer → PASS, one commit, after-map chain, verdict row.
- Task-quality and geometry stay separate: the geometry authorizes the ADD, the frozen check still gates the commit, and neither certifies the other.

100 cycles, one commit per kept cycle, held draft PR, no merge.
