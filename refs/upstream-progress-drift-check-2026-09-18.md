# Upstream progress snapshot — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`).
Origin: wayfinder round 8 exemplar fallback on `refs/systemd-upstream-progress-2026-07-21.md`
(the dated upstream snapshot). All observations are live reads on 2026-09-18 via the GitHub API.

## Where the tracked upstreams moved since the 2026-07-21 snapshot

| Upstream | Snapshot commit (2026-07-21) | Live state 2026-09-18 | Movement |
|---|---|---|---|
| `bootc-dev/bootc` | `18b96d7b` | Releases now through **v1.16.13** (2026-09-15), v1.16.12 (2026-09-10), v1.16.11 (2026-09-03) | the v1.16.4+ milestone the corpus tracks for `bootc container split-kernel-and-rootfs` (OMN-150 Phase 2's option C) is well past — the bootc-side bump path is version-unblocked upstream |
| `systemd/mkosi` | `e1e9eafc` | main at `847d113863af` (2026-09-09) | moved; the yubiOS mkosi fork stays pinned per `PINNED.md` |
| `containers/composefs` | `898c741f` | main at `ec2573a0f68f` (2026-07-28) | moved once, early in the window, then quiet |
| `systemd/systemd` | `eb032670` | the releases API returned 404 for this repo at read time (systemd ships tags, not standard release objects); tag-level comparison not re-derived here | not re-verified |

## What this changes for the corpus

The OMN-150 Phase 2 tracker (install-time BLSConfig wiring, Backlog + post-launch) names
"fedora-bootc bump to bootc v1.16.4+" as one of its two unblock paths. Upstream bootc is now
at v1.16.13 — three minor versions past that floor — so the version-floor half of that option
is no longer the constraint; the remaining question is only whether the fedora-bootc
distribution images have absorbed it. That is a fedora-bootc manifest check, not a bootc check,
and is not performed here.

## What this record does not claim

The 2026-07-21 doc's contributor-count method and its commit-window claims are historical
measurements and are not re-derived here (reproducing them requires the same inclusive-UTC
window queries; only the current HEAD/release positions were read). Nothing here updates
`PINNED.md`, which remains the authoritative pin record.
