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

## What this record does not claim

No byte-level sync verification: head SHA pinning is the starting point for the sha256 audit
the sync doctrine requires, not a substitute for it. Skill counts were not compared across
repos beyond the yubiOS-side number above.
