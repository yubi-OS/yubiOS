# OpenWrt WireGuard SSH deception LAN — prototype design (design plan only, no live network)

**Status:** prototype design extending existing proof plan; no live network built | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-33](https://linear.app/omni-agent/issue/OMN-33/prototype-openwrt-wireguard-ssh-deception-lan)

## Why this exists, and what it hands off

OMN-33's own description records real prior work: PR #86 added the
`FUTURE.md` milestone, and two existing docs already cover most of the ground —
[refs/openwrt-deception-proof-plan-2026-07-17.md](openwrt-deception-proof-plan-2026-07-17.md)
(package layout, network defaults, evidence-run plan, logging defaults) and
[refs/endlessh-openwrt-fit-2026-07-17.md](endlessh-openwrt-fit-2026-07-17.md)
(why `endlessh` is the right tarpit backend, and what it's *not* enough for).
**This document does not re-derive either** — it extends them with the one
piece OMN-33's own research-next-steps list still names as open: the
**multi-host** aspect of the deception LAN (FUTURE.md's milestone text says
"multi-host SSH decoys/tarpits," but the existing proof plan designs a
single-router decoy pool, not a multi-host topology). This stays a design/
prototype *plan* per the pulpit's own gate — no live network, VM, or router
build happens here.

## 1. What "multi-host" adds over the existing single-router design

The 2026-07-17 proof plan's package (`yubios-endlessh`) runs on one OpenWrt
router, listening on a decoy address pool within its own WireGuard zone. A
genuinely multi-host deception LAN needs one more layer: **multiple decoy
hosts across the WireGuard mesh presenting a consistent, coordinated decoy
surface**, so a probe against any single host doesn't reveal by omission
which one is real.

- **Topology:** each participating OpenWrt router in the WireGuard mesh runs
  the existing `yubios-endlessh` package, but decoy pool addresses are
  allocated from a **shared, mesh-wide plan** rather than each router picking
  its own pool independently — otherwise an attacker who maps the mesh can
  infer the real host by noticing which router's decoy pool looks
  structurally different (e.g. only one router, size, or timing).
- **Coordination surface, not shared state:** this does *not* require a
  central controller or synced database (which would itself become a new
  trust boundary and a new single point of compromise, contrary to
  MISSION.md's stance). Coordination is a **static, owner-authored config
  convention** — the same `decoy_pool` UCI field the existing package already
  validates, just populated from a shared address-planning worksheet the
  owner fills in once, not a runtime protocol between routers.
- **Notification aggregation:** the existing proof plan's "owner-selected
  summary path" (event count/source/decoy tuple) should aggregate across
  hosts at the point the owner already receives notifications, not by adding
  a new cross-host notification relay — reuses the existing notification
  design rather than adding new attack surface for a marginal UX gain.

## 2. What stays exactly as already designed (no changes)

Per the existing docs, unchanged and referenced, not restated:

- Package layout (`package/network/services/yubios-endlessh/` with
  Makefile, init, config, firewall files) — proof plan §"Package proof plan."
- `endlessh` as the tarpit backend, with the explicit caveat it's "not the
  whole honeypot system" — endlessh-fit doc's executive finding.
- Network defaults (WireGuard-zone-only, no WAN bind, no redirect of the real
  SSH endpoint, separate owner break-glass path) — proof plan §"Network
  defaults." Multi-host doesn't relax any of these; each host still enforces
  them independently.
- Logging defaults (metadata only, no passwords/keys/payloads, short
  owner-configurable retention) — proof plan §"Logging defaults," unchanged
  per-host.

## 3. Prototype file skeleton (still design, not implemented)

Extends the proof plan's file list with the one new artifact multi-host
coordination needs — a plain worksheet, not a running service:

```text
package/network/services/yubios-endlessh/       # unchanged, per proof plan
  Makefile
  files/yubios-endlessh.init
  files/yubios-endlessh.config
  files/yubios-endlessh.firewall

docs/deception-lan-decoy-pool-worksheet.md       # NEW — owner-authored,
                                                  # per-router decoy pool
                                                  # assignment; not code,
                                                  # not synced at runtime
```

The worksheet is intentionally a static document, not a config-management
tool — adding tooling to keep it in sync across routers is explicitly
out of scope for the prototype stage; a small mesh can be planned by hand.

## 4. Evidence needed before this leaves prototype/design stage

Per [refs/roadmap-promotion-gates-2026-07-17.md](roadmap-promotion-gates-2026-07-17.md),
nothing here should be described as "implemented" without owner, evidence
target, and recovery plan named — extending the proof plan's existing
single-host evidence-run plan to the multi-host case:

- [ ] At least two OpenWrt hosts (VM or spare router) running the existing
  `yubios-endlessh` package, each with a decoy pool from the shared worksheet.
- [ ] A probe from within the WireGuard mesh against each host's decoy pool,
  confirming decoys look structurally consistent across hosts (same evidence
  categories as the single-host plan: router config, firewall view, scan
  behavior, packet capture, service logs — per-host, per proof plan
  §"Evidence run" — plus a cross-host comparison step).
- [ ] Confirmation that notification aggregation surfaces which host+decoy
  a probe hit, without requiring the owner to check multiple separate
  notification streams.
- [ ] Recovery/rollback: if a router's `yubios-endlessh` misbehaves (e.g. the
  respawn cap from the proof plan's package requirements doesn't hold),
  confirm it fails to "no decoy service" rather than to any state that
  exposes the real SSH endpoint or destabilizes routing on that host.

## 5. Explicitly not done here

- No OpenWrt VM or spare router was built or configured in this session.
- No `yubios-endlessh` package code was written — the Makefile/init/config
  skeleton remains exactly as specified in the existing 2026-07-17 proof plan.
- No packet capture or scan evidence was produced — section 4 is the plan for
  producing it, not the evidence itself.

## Dependencies

- Builds directly on **refs/openwrt-deception-proof-plan-2026-07-17.md** and
  **refs/endlessh-openwrt-fit-2026-07-17.md** — read those first; this
  document only covers the multi-host delta.
- Section 4's evidence plan should be executed as separate follow-up work,
  same as the original proof plan already flagged ("VM/spare-router build and
  packet evidence still required") before promotion out of research/design.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
