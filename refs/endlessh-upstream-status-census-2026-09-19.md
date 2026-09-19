# skeeto/endlessh upstream status census, 2026-09-19

**Subject:** [skeeto/endlessh](https://github.com/skeeto/endlessh) (default branch
`master`), live-verified 2026-09-19 via `GET /repos/skeeto/endlessh` and
`GET /repos/skeeto/endlessh/commits?per_page=5`. Companion to
[`refs/endlessh-openwrt-fit-2026-07-17.md`](endlessh-openwrt-fit-2026-07-17.md)
(the fit analysis) and [`refs/openwrt-deception-status-2026-09-19.md`](openwrt-deception-status-2026-09-19.md)
(the round-13 census, which covered the yubiOS-side artifacts but not upstream).
This is a states-only record.

## Upstream state (verified live, 2026-09-19)

| fact | value |
|---|---|
| pushed_at | 2024-06-03T13:22:10Z |
| archived | no |
| stars / open issues | 8,560 / 49 |
| default branch | `master` |
| most recent commit | `dfe44eb2c5` — 2021-04-30T14:00:40Z, "Mark file local statistics struct static (#63)" |
| prior commits | `1ecaafd577` (format-string fix, 2021-04-30), `a5913cbbb2` (OpenBSD notes, 2020-12-23), `4cb4fc6eac` (CPPFLAGS, 2020-02-16), `8daa5992f1` (v1.1 bump, 2020-01-31) |

## Reading

- **Upstream is dormant as a packaging target.** No commit since 2021-04-30, no
  release activity since the v1.1 bump (2020-01-31), last push (any branch) in
  June 2024. The repository is alive as a project (issues remain open, not
  archived) but produces nothing new to track.
- **The fit analysis's upstream facts are stable.** The 2026-07-17 analysis
  (single-threaded C, Unlicense, default port 2222, 10 s banner delay,
  MaxClients 4096) was written against this same tree; nothing has moved since
  before that analysis or since. Its upstream facts need no revision.
- **Consequence for the proof plan:** the OpenWrt package in
  [`refs/openwrt-deception-proof-plan-2026-07-17.md`](openwrt-deception-proof-plan-2026-07-17.md)
  cannot track upstream releases (there are none to track). The package should
  vendor or pin the 2021 `master` tree (`dfe44eb2c5`) by commit, the same
  digest-pinning discipline the CI uses for container bases — there is no
  floating upstream line to chase.

## What this record does not claim

- **The OpenWrt package-feed check is inconclusive.** Direct raw-file probes of
  `openwrt/packages` `net/endlessh/Makefile` returned 404, but control probes of
  known-good packages (`nginx`, `haproxy`) also returned 404 from this
  environment, so the probe says nothing about the feed. Verify with a feed
  search from a browser session if the answer matters.
- No assessment of the deception design, no issue opened or changed, no edits
  to the analyzed documents.
