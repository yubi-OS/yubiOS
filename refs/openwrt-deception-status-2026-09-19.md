# OpenWrt WireGuard deception LAN: status census at main 06bb5786 (2026-09-19)

Date: 2026-09-19. Family: status/drift record (cf. `refs/blockers-drift-check-2026-09-09.md`, `refs/arm64-path-a-status-2026-09-09.md`). Origin: wayfinder round 13 cycle 1, rung `add:s7:101110101`, whose join target is `refs/endlessh-openwrt-fit-2026-07-17.md`. Every fact below was read live from GitHub on 2026-09-19; nothing is inferred from the older documents' own status lines.

## What exists for this track

| Artifact | State on 2026-09-19 | Source |
|---|---|---|
| `refs/endlessh-openwrt-fit-2026-07-17.md` | research note; concludes `endlessh` (skeeto, Unlicense, single-threaded C, default port 2222, 10 s banner delay, `MaxClients` 4096) fits as the low-interaction SSH banner tarpit backend behind a WireGuard-only zone, and is not a whole honeypot | the document |
| `refs/openwrt-deception-proof-plan-2026-07-17.md` | status line: "package/proof plan complete; VM/spare-router build and packet evidence still required"; sections Goal, Source evidence, Package proof plan, Network defaults, Evidence run, Logging defaults | the document |
| `refs/openwrt-wireguard-deception-lan-prototype-2026-07-25.md` | "prototype design extending existing proof plan; no live network built"; owner the-cult FOLLOWER_2; tracker Linear OMN-33; last touched by commit `a6fbbdb9` (2026-09-18, a round-8 drift addendum), content commits `10cb4c4b` (2026-07-25) and `910b2579` (2026-08-06) | the document; `GET /commits?path=` |
| `docs/FUTURE.md` "Milestone Net: OpenWrt WireGuard Deception LAN" | present; links the fit analysis; design bullets: OpenWrt feed/package with UCI + procd + nftables, WireGuard-zone binding by default, decoy pools via loopback aliases / DNAT, `endlessh`-style tarpit first, higher-interaction mode only with explicit storage/CPU/legal policy | `docs/FUTURE.md` at main |
| Issue #87 "Prototype OpenWrt WireGuard SSH deception LAN" | **closed** 2026-07-25T01:56:44Z, opened 2026-07-17, labels `documentation`, `research`, `AGENT`, 2 comments | `GET /issues/87` |
| Package Makefile, procd init script, UCI config, nftables rules, workflow or VM test for this track | **none.** A recursive tree scan of main `06bb5786` for `endlessh`, `openwrt`, `decept` returns exactly 3 blobs, all three the refs/ documents above | `GET /git/trees/main?recursive=1` |

## Reading

The track is documentation-complete and implementation-absent. The proof plan's own open item ("VM/spare-router build and packet evidence still required") has been open since 2026-07-17; the prototype design (2026-07-25) explicitly extends the plan without building a network; issue #87 was closed the same day the design landed, so no open issue tracks the missing evidence run. Anyone resuming this track starts from three consistent design documents and zero code; the first real artifact would be the OpenWrt package skeleton the proof plan already specifies.

## What this record does not claim

It does not assess whether the design is right, does not open or reopen an issue, and does not edit the three documents (the fit analysis still carries three template capability paragraphs under the frozen check; that is a separate CHANGE, not this record). Dates and states are point-in-time reads; re-derive, do not quote, after 2026-09-19.
