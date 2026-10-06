# Wayfinder round 7 results: refs/ corpus at frame e54be63b2d24d20e

Date: 2026-09-18. Origin: SOS Agent frozen-frame wayfinder round 7 on `yubi-OS/yubiOS/refs`,
pinned at `d313ac867a4064b16b497552f4a8ac0777db8eeb` (main, 2026-09-17T20:20Z). Family:
run-results record (cf. `refs/cycle4-results-2026-08-06.md`,
`refs/cycle5-results-2026-08-06.md`). Executed on a held PR, one file per cycle, every cycle
pre-registered on the outcomes ledger before any edit.

## Round parameters

| Parameter | Value |
|---|---|
| Baseline map | 128 (frame `e54be63b2d24d20e`, N=183, isolated 43, V2 0.30276, 12/12 sectors) |
| Positive control | n=6, seed 20260917, cutpaste-splice/1: isolated deltas {-2, 0, 0, 0, 0, 0}; bits moved 4/6; 2 quantization-silent |
| Axis trial | 4/9 axes excluded-from-fixed-margin-null (z 0.22-3.88, exclusion-only, nothing admitted) |
| Frozen task check | 62 pass / 121 fail at baseline; v1.1 amendment disclosed at cycle 30 (fenced code blocks skipped for C2/C3/C4; `../` links normalized against the repo tree) |
| Chain | maps 128 to 171, `baseline_id` chained every cycle, frame frozen throughout |

## Cycle outcomes

100 cycles executed. Kept edits land one commit each on the held branch; declined cycles
commit nothing (the edit was never applied). Four rungs were offered by the ladders across
the round; outcomes:

| Rung | Cycle | Outcome |
|---|---|---|
| `add:s7:011100101` (joins container-isolation) | 1 | Executed: `refs/adjacent-problems-nspawn-boundary-2026-09-17.md` (real record: portable-service CI is exercised, nspawn is not; corrects the focal doc's stale caveat). Preview missed twice (hamming 3, then 4 after one revision toward joins); landed sector 11, degree 2, actual isolated delta 0. Kept on task-check and fact grounds; recorded honestly as not sign-exact. |
| `add:s2:001010000` (results-record family) | 100 | Executed: this record. |
| `add:s9:000110011` (exemplar `refs/first-90-days-2026-07-25.md`) | - | Declined content-resistant: a new planning document would duplicate the family (2026-07-25 and 2026-07-28 successors already exist) without new facts. Declining per the discipline against padding. |

The remaining cycles were defect-class repairs driven by the frozen task check, each measured
through preview + after-map with `predicted_delta: null` (no geometric prediction exists for a
deterministic defect fix):

1. **Double-encoded UTF-8 mojibake** (C1): targeted per-sequence latin-1 to utf-8 repair; zero
   residual after repair; all other bytes untouched. Em dashes, curly quotes, and accented
   names (Kuhl, Kunze) restored.
2. **Stale template clauses** (C3): unfilled "refine per file context" promises appended by
   repo-refs-skill Mode D batches and never refined; removed.
3. **Byte-identical duplicate sections** (C2): later identical copies removed; differing copies
   merged by judgment (cycles 97-99: ci-evidence, arxiv-2607.09967) preserving both provenance
   lines and pointing at the operative conclusions.
4. **Unfilled placeholder cells** (C3): converted to explicit unfilled markers (cycle 98,
   first-90-days-2026-07-28); no plans were invented.

## Geometric reading

Movement was flat-to-minor: isolated 43 (baseline) moved within the positive-control band
{-2, 0} across the round (after-maps read 44-46, closing at 43); V2 0.30276 to 0.298.
Sign-exact predictions: cycle 1 predicted -1, observed 0 (not sign-exact). Defect repairs
carried no prediction. Per AGENT.md, flat geometry is an instrument observation on this
frame; it neither fails the edits nor validates the instrument.

## What this record does not claim

The instrument's geometry never authorized keeping or reverting: every kept edit passed the
frozen task check with facts verified live. The remaining check-failing backlog (mostly
differing duplicate-header copies needing per-file judgment merges, plus files whose
placeholders are load-bearing quotes) is listed in the PR body and is available for a
follow-up sweep in its own PR. Outcomes ledger rows live on baselines 128-171; counts are in
the PR body; no rates are computed.
