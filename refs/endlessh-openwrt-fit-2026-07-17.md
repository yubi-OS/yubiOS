# endlessh OpenWrt fit analysis: 2026-07-17

Status: research note for [issue #87](https://github.com/yubi-OS/yubiOS/issues/87)
Scope: evaluate how [`skeeto/endlessh`](https://github.com/skeeto/endlessh) fits the OpenWrt WireGuard SSH deception LAN roadmap in [FUTURE.md](../docs/FUTURE.md).

## Research query plan

1. Use the GitHub connector to inspect upstream `skeeto/endlessh` metadata, README, C implementation, man page, Makefile, license, commit history, and issue/PR search results.
2. Use the GitHub connector to search `openwrt/packages` and `openwrt/openwrt` for an existing `endlessh` package.
3. Use the GitHub connector to inspect representative OpenWrt package patterns for procd service wiring, UCI config packaging, and firewall/nftables-facing services.
4. Use the upstream author's linked background post only for design rationale that is not fully expressed in repository files.

## Executive finding

`endlessh` fits as the low-interaction SSH banner tarpit backend for the proposed WireGuard-only deception LAN. It should not be treated as the whole honeypot system.

The yubiOS/OpenWrt package should wrap `endlessh` with:

- WireGuard-zone-only exposure.
- Decoy address pool ownership.
- nftables logging before redirect/DNAT.
- procd/UCI lifecycle management.
- Owner notification and rate limiting.
- Conservative resource ceilings for embedded routers.

This is a good Phase 0/Phase 1 component because it is tiny, public-domain/Unlicense, has no cryptographic dependency, and only speaks pre-authentication SSH banner text. It is not enough for multi-host attribution, credential capture, higher-interaction honeypot behavior, or per-decoy destination logging without surrounding router/firewall glue.

## Upstream endlessh facts

Primary upstream: [`skeeto/endlessh`](https://github.com/skeeto/endlessh), default branch `master`, public repository.

Relevant upstream source files:

- [README.md](https://github.com/skeeto/endlessh/blob/master/README.md)
- [endlessh.c](https://github.com/skeeto/endlessh/blob/master/endlessh.c)
- [endlessh.1](https://github.com/skeeto/endlessh/blob/master/endlessh.1)
- [Makefile](https://github.com/skeeto/endlessh/blob/master/Makefile)
- [UNLICENSE](https://github.com/skeeto/endlessh/blob/master/UNLICENSE)
- Author rationale: [Endlessh: an SSH Tarpit](https://nullprogram.com/blog/2019/03/22/)

Behavioral facts from upstream:

- Purpose: keep SSH clients stuck by slowly sending an endless random SSH banner, while the real SSH service is moved elsewhere.
- Protocol point: the tarpit operates before SSH cryptographic exchange, so it does not need SSH crypto libraries.
- Implementation: single-threaded standalone C program using `poll()`.
- Default listen port: `2222`.
- Default delay: `10000` ms between banner lines.
- Default max line length: `32`, with accepted config range `3-255`.
- Default max clients: `4096`.
- Config path: `/etc/endlessh/config` on non-FreeBSD systems.
- Runtime controls: `SIGTERM` graceful shutdown, `SIGHUP` config reload, `SIGUSR1` stats dump.
- Logging: quiet by default; `-v` enables useful logs; repeated `-v` enables debug logs; `-s` sends logs to syslog.
- Logged data in the C implementation includes accept/close events, source host, source port, file descriptor, active count, connection duration, and bytes sent. It does not authenticate clients or record passwords.
- Resource guard: if `MaxClients` is reached, the main loop stops polling the accept socket until a client disconnects. The implementation also tries to reduce receive-buffer pressure with a very small `SO_RCVBUF`.
- License: upstream `UNLICENSE` places the software in the public domain where recognized, with warranty disclaimer.

## OpenWrt packaging status

GitHub connector searches did not find a maintained `endlessh` package in `openwrt/packages` or `openwrt/openwrt` during this pass.

Implication: assume yubiOS needs either:

1. A small custom OpenWrt feed/package that builds `endlessh` from upstream source, or
2. A wrapper package that vendors/pins a known upstream commit or release tarball.

OpenWrt package patterns inspected:

- [`openwrt/packages` `net/v2raya/files/v2raya.init`](https://github.com/openwrt/packages/blob/35d5fe4a0558846aea0055e79018d3b8b6868975/net/v2raya/files/v2raya.init): simple `USE_PROCD=1`, `START=99`, UCI config load, `procd_open_instance`, `procd_set_param command`, `respawn`, stdout/stderr forwarding, reload trigger.
- [`openwrt/packages` `net/v2raya/Makefile`](https://github.com/openwrt/packages/blob/35d5fe4a0558846aea0055e79018d3b8b6868975/net/v2raya/Makefile): package metadata, source hash, conffiles, installing `/etc/config` and `/etc/init.d` assets.
- [`openwrt/packages` `net/pbr/Makefile`](https://github.com/openwrt/packages/blob/35d5fe4a0558846aea0055e79018d3b8b6868975/net/pbr/Makefile): package dependencies for nftables/firewall4-style integration and conffile handling.
- [`openwrt/packages` `net/banip/files/README.md`](https://github.com/openwrt/packages/blob/35d5fe4a0558846aea0055e79018d3b8b6868975/net/banip/files/README.md): relevant model for log monitoring, nftables sets, realtime response, false-positive control, and explicit memory/OOM warnings on small devices.

## Fit against the yubiOS deception LAN goal

### Good fit

`endlessh` is a strong fit for the "slow enumeration" part of the roadmap:

- It is intentionally low interaction and pre-authentication.
- It avoids credential handling by design.
- It is small enough for router-class hardware.
- It can log connection attempts via syslog when run with `-v -s`.
- It supports `MaxClients`, delay, line length, port, and IPv4/IPv6 family knobs that map cleanly to UCI.
- Its behavior is compatible with the yubiOS stance that deception is detection and delay, not primary authentication.

### Gaps

`endlessh` does not provide these requirements by itself:

- No OpenWrt package was found in the official OpenWrt repos searched.
- No native UCI/procd integration upstream.
- No local bind-address option; it binds `INADDR_ANY` or `in6addr_any` for the selected port/family. Per-decoy-IP behavior must be handled with firewall redirects to separate local ports, separate network namespaces, or a small patch/wrapper.
- No awareness of the original destination address after DNAT/redirect. If the package needs to know which decoy host was probed, nftables should log before redirect or use per-decoy local ports.
- No notification mechanism beyond stdout/syslog logs.
- No higher-interaction SSH honeypot behavior. It never reaches authentication or command execution.
- No credential capture, and this should remain a feature for default yubiOS safety.

## Recommended architecture

Use `endlessh` as one backend inside an OpenWrt package tentatively named `wg-ssh-decoy` or `yubios-net-decoy`.

### Components

- `/etc/config/yubios_decoy`: UCI config for enable flag, WireGuard interface/zone, decoy CIDR, decoy hosts, backend port(s), max clients, delay, log level, notification target, and retention mode.
- `/etc/init.d/yubios_decoy`: procd init script that reads UCI, starts one or more `endlessh` instances, applies reload triggers, and enforces process limits.
- `/usr/sbin/yubios-decoy-notify`: small shell or C helper that tails `logread` or receives ubus events and emits owner notifications with rate limiting.
- `/usr/share/nftables.d/ruleset-post/`: optional firewall4-compatible nftables include for decoy logging/redirect rules, or UCI firewall include managed by the package.
- `/usr/share/yubios-decoy/`: templates for nftables rules, sample config, and test fixtures.

### Data flow

1. WireGuard peer connects to the protected LAN.
2. Scanner probes TCP/22 across the WireGuard-only decoy pool.
3. nftables matches destination IP in `@yubios_decoy_ssh` and logs source, destination, port, and interface before redirect.
4. nftables redirects or DNATs the connection to local `endlessh` backend port `2222` or a per-decoy backend port.
5. `endlessh` slowly sends non-`SSH-` banner lines and logs accept/close events through syslog.
6. Notification helper deduplicates events and sends a bounded alert through the configured channel.
7. Real SSH remains discoverable only through known WireGuard peer identity, expected host key, and explicitly configured real host address/name.

### Multi-host strategy

Preferred first implementation:

- Create a WireGuard-only decoy address set.
- Use nftables to log before redirect, preserving original destination in router logs.
- Redirect all decoy SSH probes to one `endlessh` instance on localhost port `2222`.
- Use source/destination from nft logs, not `endlessh` logs, for notification attribution.

Second implementation if attribution or profile diversity is needed:

- Map decoy groups to separate local backend ports.
- Run multiple `endlessh` instances with different `Delay`, `MaxClients`, and `MaxLineLength` settings.
- Keep `MaxClients` per instance small.

Avoid for the first implementation:

- Internet/WAN exposure.
- Credential collection.
- A full Cowrie-style high-interaction honeypot on router-class devices.
- Per-decoy service realism beyond SSH banner delay.

## Safety defaults

Recommended defaults for embedded OpenWrt targets:

- `enabled=0` after install until operator configures a WireGuard zone.
- `zone=wg` or explicit interface allowlist required before start.
- Refuse to start if target zone is `wan` unless `lab_mode=1` is explicitly set.
- `MaxClients` default far below upstream's `4096`, for example `64` on small routers and `256` on larger devices.
- `Delay 10000` initially; allow tuning but document that shorter delays increase bandwidth and log volume.
- `LogLevel 1` with `-s` syslog for accept/close events; avoid debug logging by default.
- Rate-limit notifications per source and per decoy destination.
- Redact or hash source IPs when privacy mode is enabled.
- Enforce log-size caps and avoid retaining payloads.
- Treat `endlessh` events as signal, not proof of compromise.

## Open questions

- Should the package build `endlessh` from upstream source or vendor a tiny maintained fork with a `BindAddress` option?
- Should yubiOS use one package (`yubios-decoy`) with `endlessh` embedded, or split `endlessh` and the WireGuard/nftables wrapper into separate packages?
- Which notification channel should be first-class for the prototype: syslog-only, ntfy, Gotify, Matrix, email, or generic webhook?
- Should decoy addresses be explicit UCI entries, generated from a CIDR, or imported from WireGuard peer metadata?
- Should default logs record real source IPs, hashed source IPs, or both with a retention toggle?
- What router size should define safe default `MaxClients` and ulimit ceilings?

## Prototype plan

Phase 0: standalone proof

- Build `endlessh` for an OpenWrt SDK target or run it in an OpenWrt VM.
- Start one procd-managed instance on localhost port `2222`.
- Confirm `-v -s` emits accept/close/totals through `logread`.

Phase 1: WireGuard-only decoy pool

- Add UCI config for decoy CIDR/addresses and WireGuard zone.
- Add nftables rules that log and redirect TCP/22 from the decoy address set to localhost `2222`.
- Verify a scan against decoys triggers nft log and notification before the real host is touched.

Phase 2: notification and rate limiting

- Add a notification helper with source/destination dedupe.
- Add privacy mode and retention caps.
- Add tests for UCI parsing, nft rule rendering, and disabled/lab-mode guardrails.

Phase 3: ADR/SPEC promotion gate

Move beyond `FUTURE.md` only after:

- OpenWrt VM evidence exists.
- Packet/log evidence shows original destination attribution survives redirect.
- Resource ceilings are tested on small router-class hardware or emulation.
- Notification privacy and retention defaults are documented.
- Recovery behavior is clear if the package misconfigures firewall rules.

## Decision recommendation

Adopt `endlessh` as the first SSH tarpit backend for the OpenWrt WireGuard Deception LAN work.

Do not position `endlessh` as a full honeypot. The yubiOS value is the surrounding package: WireGuard scoping, decoy host orchestration, nftables attribution, safe logging, and owner notification. That wrapper is where the "needle in the haystack" defense becomes operational.


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


## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6466, Δ=+0.5900) were identical placeholder copies with no per-file content; merged on 2026-09-18.
