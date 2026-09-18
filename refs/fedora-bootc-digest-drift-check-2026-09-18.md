# Fedora-bootc digest pin — 2026-09-18 drift check: the pinned manifest 404s on quay

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`).
Origin: wayfinder round 8 exemplar fallback on `refs/fedora-bootc-base-images-status-2026-07-23.md`
and the digest-rotation history it tracks. All observations are live reads on 2026-09-18 at
`yubi-OS/yubiOS` `a6fbbdb9` and against quay.io.

## Finding: the Containerfile pin is stale (manifest gone)

| Check (2026-09-18) | Result |
|---|---|
| `Containerfile` FROM at `a6fbbdb9` | `quay.io/fedora/fedora-bootc:45@sha256:c7e6b35744792c2fc22c6e345d8a820ca83e08b94819f6c06fad4048810c96be` |
| quay manifest for that digest (OCI index Accept) | **HTTP 404 — not found** |
| quay `:45` tag, same request | **HTTP 200** — index resolves with 4 manifest children (`0157de4d`, `ac6f851f`, `5c1a944b`, `62c290f5`) |
| Last "Refresh pinned Fedora bootc digest" commit | `959ead70` (2026-08-05T18:57:06Z); prior refreshes `e7078f90` (2026-08-04), `d5581f08`/`e2462889` (2026-08-01) |

So the pin has been pointing at a rotated-away digest since at least the 2026-08-05 refresh
(44 days at this read). The next `yubiOS-ci` / `ci_dev_image` build on main will fail at image
pull with the familiar `sha256:X: not found` until `fetch-fedora-bootc-manifest.yml` re-resolves
the tag and bumps `Containerfile` + `PINNED.md` in one commit (the recovery workflow for this
recurring incident, per the playbook).

## Why the auto-refresh has not fired

The refresh workflow is dispatch-driven (it exists to be run on demand), not scheduled — and the
round-7 corpus records show the cadence: three refreshes in five days in early August, then
nothing. The quay rotation did not stop; the pin silently went stale. A scheduled weekly refresh
(or a weekly digest-resolution check that opens a PR on drift) would close this incident class.

## What this record does not claim

The 404 was checked twice with the OCI index Accept header and once as part of a tag-vs-digest
comparison; it is a point-in-time read. Whether the digest was deleted by quay retention or
never existed under that exact name is not distinguished here. The `:45` tag's four children are
not individually verified against the amd64/arm64 pair the CI expects.
