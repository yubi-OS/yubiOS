# actions/checkout includeIf investigation — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`).
Origin: wayfinder round 8 exemplar fallback — the round's rungs name
`refs/actions-checkout-v6-includeif-investigation-2026-07-29.md` as an exemplar, and its
time-sensitive claims are all live-verifiable. All observations are live reads on 2026-09-18
at `yubi-OS/yubiOS` `a6fbbdb9` and on `actions/checkout` upstream.

## The investigation's claims, re-verified

| Investigation claim (2026-07-29) | Live state 2026-09-18 | Verdict |
|---|---|---|
| Upstream issue [#2393](https://github.com/actions/checkout/issues/2393) OPEN since 2026-03-25 | **still open**, 9 comments, last updated 2026-08-25 | unchanged |
| Fix PR [#2394](https://github.com/actions/checkout/pull/2394) OPEN, unmerged, in no tag | **still true** — PR #2394 open, not merged, last updated 2026-04-28 | unchanged |
| "no v6 release currently shipped (v6.0.0-v6.1.0) fixes it" | Latest releases: v7.0.1 (2026-07-20), v6.1.0, v5.1.0, v4.4.0, v3.7.0, v2.8.0 — with the fix PR still open, the investigation's verdict still holds; v7.0.1 (2026-07-20) is now the newest tag the org can pin | **still true, with v7.0.1 available** |
| Documented workaround: pin to v5 (`http.extraheader` direct) | The org's workflows currently use three checkout pins: `3d3c42e5` (47 uses), `de0fac2e` (7 uses), `11d5960a` (9 uses) — i.e., **three distinct pins coexist** on main | **new finding: pin sprawl** |

## The new finding: three concurrent checkout pins

The investigation's own org context said "all 22 sibling workflows" — there are now 39 workflow
files with 63 checkout uses across three distinct SHAs. Per the org's digest/SHA-pinning rule,
a mixed pin state is its own drift finding: `de0fac2e` (v6.0.2, the version the investigation
shows carries the includeIf bug) still covers 7 uses. Whether those 7 hit the symlinked-path
runner depends on the runner image; the investigation's mechanism analysis says the failure
needs a symlinked checkout path, which the current `ubuntu-24.04` images may or may not trigger.

## What this record does not claim

No claim that v7.0.1 or v6.1.0 fixes the includeIf bug: the fix PR is still open, and no
release note was checked for it. The org pin inventory is a snapshot of `a6fbbdb9`; the count
(47/9/7) changes with every workflow edit and should be re-derived, not quoted, after this
date.
