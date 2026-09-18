# Wayfinder rounds 5 and 6 post-mortem: why they were unproductive, what round 3 did instead, and the instrument fix (placement/1)

**Date:** 2026-09-17. **Disposition:** PR #243 (round 5) reverted on main (`42a0ce77`); PR #244 (round 6) closed unmerged; AGENT.md lesson 9 ("decline ADD rungs") removed and replaced; instrument gains `rung_key`/`joins` on rungs and a `placement` block on preview and map.

## The comparison

| | Round 3 (PR #232, `ses_f77900b4`) | Round 5 (PR #243) | Round 6 (PR #244) |
|---|---|---|---|
| cycles | 10 | 100 | 100 |
| cycles executing a rung with a geometric prediction | 10 | 2 (both not kept) | 7 ADDs + 0 CHANGE |
| edit generator | the agent read the rung hypothesis + exemplars and **wrote a real document** (HIGH-MEM runner attach, OMN-36 lapse, systemd v262, release census, adjacent-problems notes) or fixed a concrete defect (broken `session/` paths) | the skills lint fixer (`fixer.py`) applied to refs/: mojibake, template paragraphs, duplicate sections, TODO blocks | templated 37-line "coverage notes" quoting exemplar titles |
| files | 8 added, 1 changed | 30 modified (−595 lines), 0 added | 7 added (5 for sector 1, near-identical; 2 for sector 11) |
| ADD measurement | `/api/map/preview` per ADD, exact ledger | n/a | preview ledger `None` on 6/7 (after-map path, name set grew → not-tested) |
| sign agreement | 5/8 exact; two ADDs de-isolated existing docs | none exists (no kept row carried a prediction) | 0/1 (predicted +1, observed −1) |
| isolated count | 61 → 64 with de-isolations recorded | 49 → 41 (lint edits moving bits by accident) | 40 → 39/40 (never moved off) |

Round 3 worked because the rung was treated as a **compass** ("something belongs here, next to these items") and a writer supplied verifiable content. Rounds 5/6 treated the rung as a **label** on an unrelated edit generator.

## What the instrument lacked

1. An ADD rung said `isolated_delta: -1` but never named **which** isolated item the synthetic row would join. The writer had nothing to write *toward*; round 6 wrote toward the exemplars (nearest by bit pattern), which are not the isolate.
2. Nothing reported **where the authored document landed**: achieved bits vs the rung's pattern, achieved sector vs target, whether the intended isolate was reached. Round 6 therefore re-proposed sector 1 five times after five misses.
3. Rungs had no stable identity, so a driver could not tell "the same rung again" from "a new rung".
4. `/api/map` with a grown name set returns `comparison.comparable:false` and drivers read `None`; the exact ledger and placement were only reachable through `/api/map/preview`, which round 6 did not call.

## The fix (placement/1, shipped to main and live)

- `pointmap.js` rungs: `rung_key`, `joins`, `creates_isolate` (ADD), `target_pattern` (CHANGE), `joins_note`; the ADD prompt now names the join target and tells the operator to pass the rung to preview. Ranking, deltas, exemplars, frames and instrument ids are byte-identical (snapshot tests compare after stripping the additive keys).
- `lib/placement.mjs`: `placement(baseline, after, target, action, rung?)` → achieved bits/sector/degree/neighbours, de-isolated and newly-isolated items; with a rung: hamming, `landed`, `sector_match`, `joins_realised/missed`, `flip_realised`, predicted vs actual delta with `sign_exact`, and `verdict` realised/partial/missed. Returned by `/api/map/preview` (optional `rung` input, validated) and by `/api/map` with `baseline_id` for a single ADD or CHANGE.
- Tests: `test-placement.mjs` (9), including "joins equals the isolates de-isolated by the synthetic row, recomputed independently" and "a negative predicted ADD delta must name at least one join".

## The process fix

AGENT.md lesson 9 now reads: execute ADD rungs as real documents, never stubs, never decline by policy; write toward `joins`; verify with preview + rung; one attempt per `rung_key` per chain; a missed rung is revised or recorded content-resistant, not re-proposed. Lesson 22: a wayfinder round is a writing task with a geometric compass; if the fixer is doing the editing it is a sweep and belongs in its own PR with the instrument uninvolved.

## Not changed

Frames, bits, null chain, radius 0.095, rung ranking, ledger semantics, the honesty rules (geometry never authorizes keep/revert; counts only). Round 5's reverted lint fixes are not lost: the same defects can be re-swept in a plain PR with the instrument uninvolved, if wanted.

## 2026-09-18 drift check (wayfinder round 8, cycle 52)

the rounds 5/6 post-mortem: rounds 7 and 8 are its first two live tests; round 7 used rungs and real records (the post-mortem's rule); round 8 discloses its own mid-round re-baseline honestly - the framework is holding; note additive.
