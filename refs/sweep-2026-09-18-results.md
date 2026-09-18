# Sweep results: refs/ frozen-check backlog cleared in one PR (2026-09-18)

Date: 2026-09-18. Family: run-results record (cf. `refs/cycle4-results-2026-08-06.md`,
`refs/cycle5-results-2026-08-06.md`, `refs/wayfinder-round7-results-2026-09-18.md`). Origin:
the post-round-7 backlog named in `refs/wayfinder-round7-results-2026-09-18.md`, executed as a
separate sweep PR with the wayfinder instrument uninvolved, per the rounds 5/6 post-mortem rule.

## Result

Sweep PR merged as `a6fbbdb9` on `yubi-OS/yubiOS` main (2026-09-18, squash of
`wayfinder-sweep-refs-2026-09-18`): **70 files repaired, 70 commits, one file per commit**.
The frozen task check (v1.1) went from 71 failing of 185 at post-round-7 main to
**0 failing of 185** — verified on the sweep branch head before the merge.

## Defect classes repaired

| Class | n files | Fix |
|---|---|---|
| C2 Mode-D template stub sections (`## Recommendation` / `## Cross-references` x2-x3) | 25 | Merged each group into one section preserving every distinct batch-provenance line and all non-placeholder text |
| C1 double-encoded UTF-8 mojibake | 57 (57 with other classes) | Targeted per-sequence latin-1 to utf-8 repair; zero residual; other bytes untouched |
| C3 stale "refine per file context" clauses + unfilled placeholder cells | 43 | Clauses removed; cells marked explicitly unfilled; nothing invented |
| C6 control characters | 1 | Stripped |

## What this record does not claim

The sweep was never measured through the wayfinder: no preview, no after-map, no rung. That is
the point of the instrument-uninvolved rule — the repairs are content-governed (frozen check
FAIL-before/PASS-after per file), and any geometric reading of them would be decoration.
Corpus size 183 -> 185 across the round (the two wayfinder ADDs of round 7), with every doc
passing the frozen check at the end.
