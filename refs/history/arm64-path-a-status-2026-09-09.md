# ARM64 Path A Status Refresh (verified 2026-09-09)

Point-in-time refresh of `refs/arm64-path-a-b-board-status-2026-07-23.md` (48 days stale):
the Linear state of every tracked Path A item, verified live via the GraphQL API on
2026-09-09. This doc records states only; the architecture decisions (ADR-018/019/020,
canceled 2026-07-30, post-launch posture) are unchanged.


## Inputs

What the refresh pass consumed, from the pass's own record:

- The Linear GraphQL API read itself: the OMNI-AGENT workspace query over the 8 tracked
  Path A items (OMN-36, OMN-45, OMN-46, OMN-47, OMN-56, OMN-57, OMN-58, OMN-141),
  pulling each item's `state`, `completedAt`, and `dueDate` fields — the three columns
  the tracked-items table reports.
- The staleness baseline being refreshed: `refs/arm64-path-a-b-board-status-2026-07-23.md`,
  48 days older, whose Todo/Backlog split (3 Todo, 5 Backlog) is the figure the deltas
  section measures against.
- The workspace-memory snapshot named in the deltas section (the 2026-08-02 picture),
  which is the second comparison point for "no state movement in 48 days".

Scope of the input set: Linear reads only. No GitHub data, no CI runs, and no hardware
feeds — the doc records tracker state, and its does-not-claim boundary is the
architecture decisions (ADR-018/019/020), which the refresh does not re-open.

## Tracked items (Linear team OMNI-AGENT)

| Item | Title | State (2026-09-09) | completedAt | dueDate |
|---|---|---|---|---|
| OMN-36 | Prove ARM64 Path A production flow on real hardware | Backlog | — | **2026-09-12** |
| OMN-45 | Rehearse sacrificial ROTPK and fuse provisioning | Todo | — | — |
| OMN-46 | Capture OP-TEE, RPMB, fTPM, U-Boot evidence on hardware | Backlog | — | — |
| OMN-47 | Prove signed UKI boot + measurement on target board | Todo | — | — |
| OMN-56 | Select and pin a redistributable RK3588 DDR/TPL source | Todo | — | — |
| OMN-57 | Fail closed when the expected RK3588 DDR/TPL blob is absent | Backlog | — | — |
| OMN-58 | Validate combined ROCK 5B/RockPro64 image on sacrificial hardware | Backlog | — | — |
| OMN-141 | Schedule sacrificial RK3588 burn + name human owner | Backlog | — | — |

## Deltas vs the 2026-07-23 board status

- No state movement in 48 days: the Todo/Backlog split (3 Todo, 5 Backlog) is identical to
  the 2026-08-02 picture recorded in the workspace memory. Nothing in Path A has started.
- **OMN-36's due date is 2026-09-12 — 3 days from this verification — while the item sits in
  Backlog with no human owner and its blocking child (OMN-141, the sacrificial burn) also has
  no scheduled date or owner.** Either the due date slips or the burn gets scheduled this
  week; both cannot hold.
- Hardware-adjacent good news from the same verification pass: rock1 (the ARM64 KVM
  self-hosted runner that Path A's CI legs queue behind) is back online and idle — see
  `refs/blockers-drift-check-2026-09-09.md`. The runner is not the blocker; the sacrificial
  board rehearsal is.

## Dependency map

- Feeds OMN-36's due-date decision and the next BLOCKERS.md review (B-ARM64-PATHA row).
- Companion: `refs/arm64-path-a-b-board-status-2026-07-23.md` (the original board roles doc,
  still the hardware reference), `refs/linear-workspace-sweep-2026-09-09.md` (project-level
  rollup).

## 2026-09-18 drift check (wayfinder round 8, cycle 48)

Path A status record: the round re-cited its blockers (B-ARM64-PATHA active; the 2026-09-12 target date has passed per round-7 records); no new hardware evidence landed this round; content unchanged, note additive.
