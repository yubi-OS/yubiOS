# PINNED.md pin-resolution audit (verified 2026-09-18)

Date: 2026-09-18. Family: integrity audit record. Origin: wayfinder round 8 — the natural
follow-up to `refs/fedora-bootc-digest-drift-check-2026-09-18.md`: audit the pin inventory
itself, not just the citations. All observations are live reads on 2026-09-18 at `a6fbbdb9`.

| Pin | Resolution check 2026-09-18 | Verdict |
|---|---|---|
| `quay.io/fedora/fedora-bootc:45@sha256:c7e6b357...` (Containerfile) | **HTTP 404** — the manifest is gone (this round's digest drift check) | **STALE — actionable** |
| quay `:45` tag | HTTP 200, new index (4 children) | resolution available for the bump |
| dhi.io debian-base pin (v2026.03.14 trixie-dev) | registry auth via CI secrets; not resolved anonymously this pass | not re-verified |

The pin-resolution audit found exactly one stale pin (fedora-bootc) — the same digest-rotation
incident class the corpus has tracked since July. The recovery is the standard
`fetch-fedora-bootc-manifest.yml` dispatch; a scheduled weekly check would close the class.

## What this record does not claim

The dhi.io pin was not resolved (registry auth is CI-only); only the quay pins were checked
live this pass. The audit is point-in-time and should be re-run after any fetch-group dispatch.
