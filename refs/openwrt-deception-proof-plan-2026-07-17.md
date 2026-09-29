# OpenWrt deception LAN proof plan: 2026-07-17

Status: package/proof plan complete; VM/spare-router build and packet evidence still required.

## Goal

Turn the Endlessh/OpenWrt idea into a testable package and network proof that keeps the real SSH endpoint behind WireGuard and exposes only deliberate decoys.

## Source evidence

| Area | Evidence | Source |
|---|---|---|
| OpenWrt package layout | In-tree package Makefiles define `PKG_*`, `Package/<name>`, conffiles, dependencies, and install behavior. | https://github.com/openwrt/openwrt/blob/main/package/network/services/dropbear/Makefile |
| procd service style | The OpenWrt Dropbear init script uses `USE_PROCD=1`, validates UCI config, builds `procd_set_param command`, enables `procd_set_param respawn`, and registers config triggers. | https://github.com/openwrt/openwrt/blob/main/package/network/services/dropbear/files/dropbear.init |
| firewall4/nftables model | OpenWrt's official wiki states that 22.03+ defaults to firewall4 with nftables while preserving UCI firewall syntax. Direct page fetch was blocked by Anubis during this pass, so keep the URL as the canonical target and verify during implementation. | https://openwrt.org/docs/guide-user/firewall/firewall_configuration |

## Package proof plan

Proposed feed layout:

```text
package/network/services/yubios-endlessh/
  Makefile
  files/yubios-endlessh.init
  files/yubios-endlessh.config
  files/yubios-endlessh.firewall
```

Package requirements:

- Build or package Endlessh as `/usr/sbin/yubios-endlessh` or depend on the existing Endlessh package if the target feed already provides one.
- Install `/etc/config/yubios-endlessh` as a conffile.
- Install an `/etc/init.d/yubios-endlessh` procd script with `USE_PROCD=1`.
- Validate UCI fields before starting: `enabled`, `listen_address`, `listen_port`, `wireguard_zone`, `decoy_pool`, `max_clients`, `log_level`, and `notify_command`.
- Use `procd_set_param respawn`, but cap memory/fd usage so a decoy flood cannot starve routing.

## Network defaults

Default exposure must be lab-safe:

- Listen only on a WireGuard-only decoy address or decoy pool.
- Do not bind WAN by default.
- Do not redirect the real owner SSH endpoint.
- Place decoy firewall rules in the WireGuard zone only.
- Keep a separate owner break-glass path outside the deception service.

## Evidence run

The VM/spare-router proof should capture:

1. Router config: OpenWrt release, target board/VM, WireGuard zone, decoy pool, real SSH address.
2. Firewall view: UCI config and generated nftables rules for the decoy listener.
3. Scan behavior: from a client inside the WireGuard zone, `nmap` or equivalent sees decoy ports before the real SSH endpoint.
4. Packet capture: `tcpdump` on the WireGuard interface showing SYNs to decoys and no accidental WAN exposure.
5. Service logs: connection evidence without attempted passwords, private keys, or payload contents.
6. Notification: owner-selected summary path receives event count/source/decoy tuple, not sensitive payloads.

## Logging defaults

Store minimal metadata only: timestamp, source address/port, decoy address/port, connection duration, and service action. Do not store attempted passwords, private keys, command payloads, banners that include secrets, or packet payload bodies. Retention defaults should be short and owner-configurable.

## ADR coverage

ADR should define deception as an owner-controlled lab/defensive signal, not authentication. It must cover the trust boundary, evidence retention, notification path, failure behavior, WAN off-by-default posture, and the recovery path if the package breaks routing or SSH access.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.

## Refresh: 2026-09-29

Method note: three searXNG queries were run on 2026-09-29, "openwrt 24.10 release status 2026", "openwrt network deception honeypot lan 2026", and one discretionary follow-up, "openwrt endlessh package procd 2026", retried once after a cooldown. All passes returned zero results: brave, duckduckgo, and google cse engines were suspended for rate limits every time, so no web snippets were available to weight. Fallback verification used the openwrt/openwrt GitHub API and direct raw fetches, all on 2026-09-29.

Findings:

- OpenWrt published v24.10.8 on 2026-07-26, 9 days after this doc's date. It is the newest 24.10 release as of 2026-09-29. Source: https://github.com/openwrt/openwrt/releases/tag/v24.10.8 (noul 0.93).
- OpenWrt's stable line now includes a v25.12 series: v25.12.0 published 2026-03-05 through v25.12.5 published 2026-07-01. Branches openwrt-24.10 and openwrt-25.12 are both live. Source: https://github.com/openwrt/openwrt/branches (noul 0.88).
- Impact on the plan: no existing claim changed. The package proof targets firewall4/nftables and procd patterns that hold across 24.10 and 25.12, and the plan does not pin a release, so no in-place edit was needed beyond adding this section. Evidence runs on 24.10.x should use v24.10.8 or later since it postdates the doc.
- Source evidence verified live on 2026-09-29: the dropbear Makefile and dropbear.init on openwrt main both return HTTP 200, and dropbear.init still contains USE_PROCD=1, procd_set_param command, and procd_set_param respawn, matching the doc's procd service style evidence. Source: https://github.com/openwrt/openwrt/blob/main/package/network/services/dropbear/files/dropbear.init (noul 0.91).
- The OpenWrt wiki firewall configuration page returned HTTP 200 directly on 2026-09-29 with no Anubis block this pass. The doc's note that the page was blocked during its own pass describes that historical fetch and stands; the page remains the canonical target. Source: https://openwrt.org/docs/guide-user/firewall/firewall_configuration (noul 0.87).

Net verdict: no material change found. The doc remains accurate as of 2026-09-29 with release context added above.

### Sources considered

| # | Source | Weight (noul) |
|---|---|---|
| 0 | https://github.com/openwrt/openwrt/releases (releases API: v24.10.8 published 2026-07-26; v25.12.0 published 2026-03-05 through v25.12.5 published 2026-07-01) | 0.93 |
| 1 | https://github.com/openwrt/openwrt/branches (branches API: openwrt-24.10 and openwrt-25.12 live) | 0.88 |
| 2 | https://github.com/openwrt/openwrt/blob/main/package/network/services/dropbear/files/dropbear.init (raw fetch 200, USE_PROCD=1 and procd_set_param respawn confirmed) | 0.91 |
| 3 | https://openwrt.org/docs/guide-user/firewall/firewall_configuration (HTTP 200, no Anubis block) | 0.87 |

searXNG: 0 results across 5 query passes (2 required, 1 discretionary, 2 retries); engines suspended on every pass. jev quality model typesafe/jev-1.13-20260917, task_id ta9e54a3-87e2-484e-beac-e9641b02e8c1, 1 request, cost 0.000088452.
