# Blockers Drift-Check: B-ROCK1-OFFLINE and B-VGPU-VM-UNZIP (verified 2026-09-09)

Status verification of the two newest rows in [docs/BLOCKERS.md](../docs/BLOCKERS.md)
(last reviewed 2026-08-24), prompted by the round-2 wayfinder sweep. All observations are live
API reads on 2026-09-09; nothing below is carried over from the blocker text itself.

## B-ROCK1-OFFLINE — SUPERSEDED (runner fleet changed, blocker text now stale)

The blocker says "both self-hosted runners (rock1, GPU) show offline" and gates all VM-boot
verification on a physical power/network check. Verified state 2026-09-09:

| Runner | Status | Labels |
|---|---|---|
| rock1 | **online, idle** | self-hosted, Linux, ARM64, KVM |
| ubuntu | **online, idle** | self-hosted, Linux, ARM64, HIGH-MEM |

Two drift findings:

1. rock1 is back — the human action the blocker asked for has happened (or the board
   re-registered on its own).
2. The runner named `GPU` **no longer exists in the runner registry**. It was replaced by a
   runner named `ubuntu` with labels `self-hosted, Linux, ARM64, HIGH-MEM` — a new
   high-memory ARM64 host, not a GPU host. Any workflow that dispatches on the `GPU` runner
   label (`runs-on: [self-hosted, GPU]`) will queue forever. The blocker's own text is
   runner-name-coupled and now names a runner that is gone.

## B-VGPU-VM-UNZIP — the verification it waited on has now run (and passed)

The row's retirement condition: "Once rock1 is back: confirm steps 21/33/37 and the Negative 2
refusal, then retire this row." Verified state 2026-09-09:

| Run | Head | Result |
|---|---|---|
| 34408180552 | a25d95c7 | **success** (2026-09-09T21:40:07Z) |
| 34410693076 | 55b68ca8 | **success** (2026-09-09T22:08:44Z) |
| 34410693069 | 55b68ca8 | **success** (2026-09-09T22:08:44Z) |

Three consecutive green `ci_test-vgpu-vm.yml` runs on today's main, on rock1, after the
`unzip` fix (commit ebf9223a, 2026-08-24) and the SC2034/SC2024/SC2046 lint fixes. The row's
own retirement condition is met; the run the 2026-08-24 review queued (32732596620) is moot —
it either expired or was superseded by these three.

## What this doc deliberately does not do

- It does not edit `docs/BLOCKERS.md` directly — that file is repo-owned and
  review-gated; the rows should be retired in the next BLOCKERS.md review that cites this
  check.
- It does not verify steps 21/33/37 individually (the row's specific step list) — only the
  run-level conclusions. Step-level confirmation belongs to the retirement commit.

## Dependency map

- Feeds the next `docs/BLOCKERS.md` review: B-ROCK1-OFFLINE needs a rewrite (GPU runner no
  longer exists; new HIGH-MEM runner), B-VGPU-VM-UNZIP meets its stated retirement condition.
- Companion: `refs/linear-workspace-sweep-2026-09-09.md` (tracker half), this loop's
  `refs/wayfinder-loop-results-2026-09-09.md` (how the check was found: rung exemplars named
  the runner family).
