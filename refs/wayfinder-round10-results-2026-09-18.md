# Wayfinder round 10 results: docs/ corpus at frame 988e8997623c442c

_Moved from docs/ to refs/ 2026-09-18 per Jenny directive: wayfinding receipts live in refs/._

Date: 2026-09-18. Family: run-results record (cf. `docs/` sibling rounds; refs/ results:
`refs/wayfinder-round8-results-2026-09-18.md`). Origin: round 10, cycle 20 — the closing record.
Same protocol: 20 iterations on the `docs/` corpus (21 docs), one file per commit, every cycle
pre-registered on the outcomes ledger.

## Round parameters

| Parameter | Value |
|---|---|
| Baseline map | 278 (frame `988e8997623c442c`, N=21, isolated 21/21, V2 0.41451) — post-round-9 main `427f9b9d` |
| Positive control | n=6, seed 20260919: bits moved 2/6, 4 quantization-silent |
| Axis trial | 0/9 axes excluded-from-null (z 0.14) — at N=21 the trial has no resolution; recorded, nothing admitted |
| Frozen check at baseline | 8 fail / 21 (mojibake 8 incl. 2 with differing duplicate-header sections) |

## Cycle outcomes

| Class | Cycles |
|---|---|
| Mojibake repairs kept (one commit each) | PR.md, SELF.md, SER.md, SOUL.md, THREAT_MODEL.md, TODO.md |
| Judgment merge kept | MITIGATE.md — the two "What yubiOS Cannot Fully Prevent" sections were complementary (gap table + boundary bullets), merged keeping all content |
| Flagged, not merged | SPEC.md — the file holds TWO complete spec versions concatenated (the second starts at the second "## 1. Scope", ~14.9 KB). Choosing the canonical version is a maintainer editorial call; the round flagged it in the file and declined the mechanical merge |
| Drift-check addenda kept | BLOCKERS.md (two stale rows flagged in-register), MILESTONE.md (2026-09-13 target passed), TODO.md, CITATION.md, ONBOARDING.md, LEARN.md, MAINTAINER.md, SER.md, ARCHITECTURE.md |

## Actionable findings

1. **SPEC.md has two complete spec versions concatenated** — needs a maintainer decision on
   which is canonical before any merge (the round refused to guess).
2. The two stale BLOCKERS.md rows (from the round-8 drift check) are now flagged in-register.

## What this record does not claim

Geometry stayed flat (isolated 21 at the 21-doc baseline; V2 0.401 across the round) — the
21-doc corpus is too small for the axis trial to resolve anything, and that is an instrument
observation, not an edit verdict. The task check governed every commit; counts only, no rates.
