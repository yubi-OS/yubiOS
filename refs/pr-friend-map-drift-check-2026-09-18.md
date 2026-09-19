# PR friend-map readiness snapshot — drift check against live main (2026-09-18)

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`).
Origin: wayfinder round 8 rung `add:s4:100000010`, joining
`refs/pr-friend-map-2026-07-17.md` (the isolated campaign-readiness doc this file sits next
to). All observations are live reads on 2026-09-18 at `yubi-OS/yubiOS` `a6fbbdb9`; nothing is
carried over from the friend map's own text.

## What the 2026-07-17 snapshot claimed vs. what main shows now

The friend map's readiness snapshot (research date 2026-07-17) has aged two months. Row by row:

| Snapshot claim (2026-07-17) | Verified state at `a6fbbdb9` (2026-09-18) | Drift |
|---|---|---|
| "README claims: needs qualification — avoid unqualified No TPM / No OEM / sole root / at every layer phrasing" | README tagline is now "*No OEM. No trust anchors you don't control.*" — the unqualified "No TPM" and "sole root" phrasing is gone from the tagline; a groundwork Warning block qualifies install flows explicitly | **partially resolved** — TPM/sole-root phrasing removed; "No OEM" remains as a one-line slogan, defensible as-is |
| "Public security intake: needs hardening — replace placeholder policy" | `.github/SECURITY.md` is a real policy (last reviewed 2026-07-17): private vulnerability reporting preferred, fallback minimal public issue, 7-day best-effort acknowledgement target | **resolved** — the placeholder policy was replaced; note the doc predates the "web commit signoff required" flag now set on the repo |
| "Production claim: not ready — keep groundwork/experimental language" | README badge still says "Status: Groundwork"; SECURITY.md says "pre-launch / groundwork"; 6 releases since the snapshot (v0.8.3 through v0.8.8, latest 2026-09-09) are all still tagged as experimental artifacts in the supported-versions table | **consistent, still true** |
| "Physical YubiKey proof: still a gate" | The rock1 hardware leg ran real-YubiKey FIDO2 enrollment end-to-end (OMN-42 closed 2026-08-01; hardware-leg PASS evidence in run 30697269619); single-board, single-host evidence, not multi-board | **partially moved** — one physical proof point now exists; the friend map's "still a gate" row should read "one hardware proof point landed; board coverage still open" |
| "ARM64 Path A: still a gate" | Unchanged: OMN-36 (release gate on ARM64 Path A hardware evidence) still open | **still true** |

## What changed for the campaign

Two snapshot rows are stale in the direction of *less* gating than the friend map assumes:
the physical-YubiKey row now has a real hardware proof point, and the security-intake row
describes a policy that has since hardened. The campaign's own decision rule (pull owned-channel
and upstream-participation knobs now; earned media waits for physical evidence) is unchanged by
this check; what changes is that the evidence gate the doc named as fully closed has one
verified opening.

## What this record does not claim

No outreach was sent and no channel decision is made here. OMN statuses cited are from the
round's own records, not a fresh Linear sweep; if Linear has moved since 2026-09-17, the drift
table above inherits that staleness.
