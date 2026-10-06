# skills/ corpus + mirror sync state (verified 2026-09-18)

Date: 2026-09-18. Family: sync-state record (the 2026-09-06 sync doctrine's check:
`yubi-OS/agent-skills` is the source of truth; `yubi-OS/yubiOS/skills` mirrors it). Origin:
wayfinder round 8 cycle 21. Observations live at `a6fbbdb9` (yubiOS) and `yubi-OS/agent-skills`
main `b82c7504151e`.

| Read | Value |
|---|---|
| SKILL.md files under `skills/` on yubiOS main | 112 |
| tests/ blobs | 40 |
| `.github/workflows/` files | 39 |
| `yubi-OS/agent-skills` main HEAD | `b82c7504151e` |

The 2026-09-06 sync doctrine pinned the last verified sync at agent-skills `0e5da5b4`. This
record pins the head SHAs both sides were at on 2026-09-18 so the next sync audit can diff from
here; verifying byte-level sync requires the blob-by-blob sha256 discipline the sync doctrine
itself mandates, which this record does not run.

## Composition

How this record composes with the surfaces it names, from its own table and text:

- Upstream input: the 2026-09-06 sync doctrine it verifies — this record is that
  doctrine's round-8 check, pinning the two head SHAs (`a6fbbdb9` on yubiOS,
  `b82c7504151e` on agent-skills) the doctrine's audit needs.
- Downstream consumer: the next sync audit, which diffs from exactly these pinned SHAs
  instead of re-discovering heads; the record states this role in its own closing line.
- Sibling records: the round's other census records (workflow-census, tests-census,
  docs-census) — same family, same pin, same read-then-count method, so a drift in one
  census's count is checkable against the others' pins.

This maps the record's own named surfaces; it adds no new sync claims.

## What this record does not claim

No byte-level sync verification: head SHA pinning is the starting point for the sha256 audit
the sync doctrine requires, not a substitute for it. Skill counts were not compared across
repos beyond the yubiOS-side number above.
