# Org self-hosted runner fleet census (verified live 2026-09-19)

Point-in-time census of the `yubi-OS` org self-hosted runner fleet, verified live
via the GitHub API (`GET /orgs/yubi-OS/actions/runners`, `GET /repos/yubi-OS/yubiOS/actions/runs`)
on 2026-09-19. Companion to [`refs/chromium-runner-highmem-2026-09-09.md`](chromium-runner-highmem-2026-09-09.md)
(the HIGH-MEM attach that created this fleet) and
[`refs/arm64-path-a-status-2026-09-09.md`](arm64-path-a-status-2026-09-09.md).
This doc records observed states only; no diagnosis of failures is claimed.

## Fleet state (2026-09-19)

| Runner | Labels | Status | Busy at census time |
|---|---|---|---|
| `rock1` | self-hosted, Linux, ARM64, KVM | online | no |
| `ubuntu` | self-hosted, Linux, ARM64, **HIGH-MEM** | online | no |

Both runners online and idle at the census timestamp. The fleet is unchanged in
composition since the 2026-09-09 attach: still exactly two org-level self-hosted
ARM64 runners, the `ubuntu` HIGH-MEM box (62 GiB observed RAM) plus `rock1`.

## Recent workflow runs observed (same API pass)

| workflow | branch | head | result | created (UTC) |
|---|---|---|---|---|
| lean-run | main | `b1dabac0` | success | 2026-09-19T06:13:33Z |
| lean-check | main | `b1dabac0` | **failure** | 2026-09-19T06:13:33Z |
| ci_token-audit | admission-trials-2026-09-19 | `33610523` | success | 2026-09-19T05:54:15Z |
| ci_dispatch-reachability | admission-trials-2026-09-19 | `33610523` | **failure** | 2026-09-19T05:54:15Z |
| ci_input-shape | admission-trials-2026-09-19 | `33610523` | success | 2026-09-19T05:54:15Z |
| lean-run | main | `e289b271` | success | 2026-09-19T05:44:16Z |
| lean-check | main | `e289b271` | success | 2026-09-19T05:44:16Z |
| ci_dispatch-reachability | wayfinder-round13-refs-rayleigh-2026-09-19 | `37931b0c` | **failure** | 2026-09-19T05:33:32Z |

Observed states worth flagging (no diagnosis here, this is a states-only record):

- `lean-check` on main went **success at `e289b271` (05:44Z) → failure at `b1dabac0`
  (06:13Z)**. The failure arrives with the commit that moved main between those
  two SHAs. Worth a follow-up look before the next round of Lean-dependent work.
- `ci_dispatch-reachability` failed on both branches it ran on this morning
  (`37931b0c`, `33610523`); the workflow previously passed after its OMN-159 fix
  landed. Also follow-up material.

## Scope note

Census method covers the org-level runners API only; it does not measure queue
times, runner disk/memory headroom, or per-job runner assignment (the runs API
response used here does not attribute jobs to named runners). Re-census triggers:
any new runner registration, a third label class, or the first fleet-wide outage.
