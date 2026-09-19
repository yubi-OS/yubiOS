# Round 8 citation-integrity audit (2026-09-18)

Date: 2026-09-18. Family: corpus-integrity audit record. Origin: wayfinder round 8 cycle 14 —
the round's drift-check records cite a growing set of commit SHAs and run IDs; this record
verifies each cited object resolves, so a later reader can trust the round's citations without
re-deriving them.

## Commit SHAs cited by round-8 records

| SHA | Cited in | Resolves? |
|---|---|---|
| `3dabe892` (run 29869527608 head) | board-status drift check | **yes** |
| `959ead70`, `e7078f90`, `d5581f08`, `e2462889` (digest refresh commits) | digest + package-floor drift checks | **yes** (all four) |
| `a6fbbdb9` (round-8 pin), `d313ac86` (round-7 pin), `42a0ce77` (lean-check run head) | round params + re-verification sections | **yes** |
| chromium-provenance `839369e2`, `650a324b`, `2ffa9be3` | chromium drift check | **yes** (all three) |
| `yubi-OS/mkosi` `e1e9eafc`; upstream `847d1138`; `yubi-OS/bootc` `18b96d7b`; `yubi-OS/bcvk` `fc6602f0`; upstream bcvk `7dc47c9a` | fork-status drift check | **yes** (all five) |

Outcome: every cited SHA resolves at its read time.

## What this record does not claim

Run IDs (34408180552, 30697269619, 29869527608, etc.) were verified where this round fetched
them live; the audit above covers commit objects only, not runs, issues, or tags. Citation
integrity is per-read-time: a SHA can resolve today and be unreachable from a future default
branch (history rewrite), which is why the records also name the repositories they cite.
