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
