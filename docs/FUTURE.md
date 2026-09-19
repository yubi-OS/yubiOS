# Future Work

Last reviewed: 2026-07-21
Status: roadmap and research backlog

This file tracks future work that is not yet the normative baseline. Active requirements belong in [SPEC.md](SPEC.md); accepted decisions belong in [ADR.md](ADR.md); open blockers belong in [BLOCKERS.md](BLOCKERS.md).

## Near-Term Planning Cycle

The current evidence refresh is [refs/ci-evidence-2026-07-21.md](../refs/ci-evidence-2026-07-21.md), paired with the systemd-family progress snapshot in [refs/systemd-upstream-progress-2026-07-21.md](../refs/systemd-upstream-progress-2026-07-21.md). The earlier planning baseline remains [refs/planning-cycle-2026-07-11.md](../refs/planning-cycle-2026-07-11.md).

## Milestone F: ARM64 Owner-Owned Root Of Trust

Goal: prove the production Path A story on real ARM64 hardware.

1. Radxa ROCK 5B / RK3588 is selected as primary; ROCKPro64 / RK3399 is supported secondary (ADR-029).
2. Resolve the ROCK 5B DDR/TPL input with a licensed, immutable, checksum-verified blob and require a real `u-boot-rockchip.bin` before calling its bundle bootable.
3. Rehearse TF-A Trusted Board Boot and ROTPK provisioning on sacrificial hardware.
4. Bring up OP-TEE, StandaloneMM, RPMB-backed UEFI variables, and ms-tpm-20-ref fTPM.
5. Validate U-Boot UEFI Secure Boot and TCG2 measurement into the fTPM.
6. Boot the same signed yubiOS UKI used by x86-64 and prove `/usr` verification plus FIDO2 unlock.
7. Document exact board provisioning evidence before using production language.

Path B remains useful for measured/attested development and CI, but it must be described as evidence-and-sealing rather than boot-time rejection.

## Milestone SecTime: Secure-World Time Evidence

Goal: verify whether RK3399/RK3588 yubiOS boards can make trustworthy time claims from the secure world before those claims are used for attestation, logs, replay windows, or freshness policy.

Research shape:

- Audit the TF-A, U-Boot, and OP-TEE board configuration for the secure time path, starting with `CFG_SECURE_TIME_SOURCE_CNTPCT`, OP-TEE AArch64 timer handling, and TF-A `SPD=opteed` integration.
- Distinguish an ARM generic timer counter read from secure world from a board-backed secure RTC, RPMB monotonic counter, or normal-world/REE time fallback.
- Define what "secure enough" means for yubiOS: monotonic within a boot, stable across suspend/resume, resistant to normal-world tampering, and explicit about power-loss and reboot limits.
- Add an OP-TEE smoke test or TA-level probe that records monotonic reads and failure behavior on RK3399 and RK3588 hardware.
- Keep policy claims out of [SPEC.md](SPEC.md) until the clock source, rollback behavior, and recovery path are source-backed and board-tested.

Evidence needed before promotion:

- Source-backed note under `refs/` identifying the active OP-TEE secure time configuration for RK3399 and RK3588.
- Hardware log showing secure-world monotonic reads across boot, suspend/resume, and expected failure cases.
- ADR coverage for which security decisions may rely on secure-world time and which must use a stronger counter, sealed state, or remote attestation freshness.
- Recovery guidance for boards with only REE-backed time or with ambiguous secure clock wiring.

## Milestone Frost: Firmware-Assisted GPU Resource Lockout

Goal: research a Panfrost-centered "Frost" path that can observe, limit, quarantine, or reset GPU resource abuse on RK3399/RK3588 without treating U-Boot as a runtime policy engine.

Research shape:

- Treat Linux DRM/Panfrost and cgroup v2 as the accounting and policy layer. Prefer the emerging DRM device-memory cgroup path when available; otherwise prototype minimal cgroup-aware Panfrost BO accounting.
- Hook BO allocation, PRIME import, BO destruction, and an optional submit guard rather than relying on userspace ioctl policy alone.
- Use U-Boot for early setup only: reserved memory, device-tree nodes, control mailbox metadata, and handoff to Linux plus secure monitor firmware.
- Define a secure monitor or firmware interface, such as SMC or a shared mailbox, for hard actions: context quarantine, IOMMU revocation, GPU reset, or power gating.
- Stage enforcement from observe, warn, and deny-allocation modes to cgroup/context quarantine, then full GPU reset or power-cycle only for repeated or unsafe violations.
- Separate device-memory limits from GPU time scheduling so the milestone is clear about what Frost protects and what remains future scheduler work.

Evidence needed before promotion:

- Source-backed map of current Panfrost/Rockchip kernel patch points for probe/init, BO create/free, PRIME import, and submit guarding.
- RK3399/RK3588 proof showing whether lockout can target an offending cgroup/context or must fall back to safe full-GPU reset behavior.
- Device-tree, reserved-memory, and control-mailbox sketch with recovery and failure behavior.
- Tests for false positives, graphics stack recovery, telemetry, logs, and owner notification.
- ADR coverage of the trust boundary between Linux policy, OP-TEE/TF-A hard cutoff, and user recovery.

### Related: vGPU / vfio-user trust boundary CI (2026-07-25)

Frost's lockout design (above) governs *how much* GPU a workload may consume.
A separate, now-landed piece of work governs *what kind of GPU access* a
default yubiOS image exposes at all -- the attack-surface question that has to
be settled before a lockout policy is meaningful. Full analysis and rules
(ADR-031): [refs/vgpu-vfio-user-trust-boundary-2026-07-25.md](../refs/vgpu-vfio-user-trust-boundary-2026-07-25.md).

Headline rule: a GPU sits inside the memory domain a YubiKey unseals secrets
into, so unmitigated `vfio-pci` passthrough is a key-extraction primitive.
Default images ship `virtio-gpu` only; passthrough is opt-in, IOMMU-gated,
and policy-gated, never a default. Userspace device models use vfio-user
(mutual distrust by spec, unprivileged, no kernel VFIO modules). No
trust-boundary component (Secure Boot, LUKS2 FIDO2, homed, pam-u2f, fTPM PCR)
may depend on GPU state.

Implementation landed with that ref:

- `.github/workflows/ci_test-vgpu-vm.yml` -- re-runs the entire `ci_test-vm.yml`
  suite (fTPM, LUKS2 FIDO2, homed, pam-u2f) with `YUBIOS_VGPU=1`, proving a
  vGPU is a no-op for every trust-boundary leg, plus two new legs below.
- `tests/vm/test-vgpu-virtio-ci.sh` -- host device-model probe, then a guest
  leg asserting DRM nodes/driver bound *and* the negative VFIO surface (no
  `/dev/vfio`, nothing bound to `vfio-pci`, no `vfio_pci` module).
- `tests/vm/test-vfio-user-host-ci.sh` -- real vfio-user client/server
  handshake (QEMU `vfio-user-pci`, upstream since 10.1, against a pinned
  nutanix/libvfio-user sample server) with zero kernel VFIO modules loaded.
- Both follow the 0-pass / 77-loud-SKIP / else-fail contract used across
  `tests/vm/*`, and needed a CI-only `--extra-qemu-arg` patch to the pinned
  yubi-OS/bcvk fork so an ephemeral guest can have a QEMU device attached
  (open question in the ref: upstream this as a real bcvk PR).
- Tracking issue: [OMN-108](https://linear.app/omni-agent/issue/OMN-108/gpu-trust-boundary-vfio-uservirtio-gpu-default-design-vgpu-e2e-ci).

## Milestone CI: Keep The Test Lanes Honest

- Keep native ARM64 KVM evidence visible for the dev/swu2f VM leg.
- Require CTAP2 enumeration and token-dependent guest operations; run 29872832727 reached the guest but skipped those operations because no token appeared.
- Keep the zstd EFI zboot workaround pinned until the runner QEMU version has the upstream fix.
- Keep PQ TLS verification in CI so future base-image bumps cannot silently lose ML-KEM hybrid defaults.
- Keep production, dev, and installer publication natively multi-architecture; the 2026-07-21 installer refresh closes the amd64-only gap seen in run 29876111887.
- Treat x86-64 VM issues as supported-platform compatibility work, not blockers for the ARM64 ownership thesis unless they affect shared artifacts.

## Milestone Docs: Prevent Snapshot Drift

- Add dated planning notes under `refs/` for each substantial research cycle.
- Avoid hardcoding run-specific image digests outside [PINNED.md](../PINNED.md) unless the text clearly marks them as historical evidence.
- Keep `RestrictFileSystems=` and `RestrictFileSystemAccess=` distinct in all hardening docs.
- Prefer primary upstream sources in [CITATION.md](CITATION.md), then link repo-specific evidence from ADRs and refs.

## Milestone Net: OpenWrt WireGuard Deception LAN

Goal: research an OpenWrt project or package that turns a WireGuard-protected LAN into a deliberate "needle in the haystack" environment for SSH discovery attempts. The package should expose many low-risk decoy SSH endpoints, slow enumeration with tarpits where safe, and notify the owner when an agent or attacker probes for the real host.

Current fit analysis: [refs/endlessh-openwrt-fit-2026-07-17.md](../refs/endlessh-openwrt-fit-2026-07-17.md).

Research shape:

- Package as an OpenWrt feed/package with UCI configuration, procd services, firewall/nftables integration, and optional LuCI only after the CLI path is stable.
- Bind to the WireGuard zone by default. Do not expose the deception surface on WAN unless an operator explicitly enables a lab mode.
- Support multi-host deception through loopback aliases, WireGuard-only decoy address pools, or nftables DNAT to lightweight responders.
- Evaluate an `endlessh`-style banner tarpit for delay, plus a higher-interaction honeypot mode only when storage, CPU, and legal/logging policy are explicit.
- Notify through syslog/ubus plus owner-selected channels such as ntfy, Gotify, Matrix, email, or a webhook, with rate limits and deduplication.
- Keep real host discovery dependent on known WireGuard peer identity, SSH host-key verification, and yubiOS/YubiKey controls. Deception is detection and delay, not primary authentication.

Safety constraints:

- Do not store attempted passwords, private keys, or sensitive payloads by default; hash or redact evidence when retention is needed.
- Keep strict CPU, memory, connection, and log-size ceilings so a tarpit cannot become a self-DoS.
- Separate protected-LAN mode from internet-facing lab mode in package defaults and documentation.
- Document privacy, legal, recovery, and false-positive handling before recommending deployment.

Evidence needed before promotion:

- OpenWrt VM or spare-router proof with a decoy address pool and owner notification path.
- Packet-level test evidence showing scans hit decoys before the real SSH endpoint is discoverable.
- Reproducible package build recipe, config lint, and firewall rule tests.
- ADR coverage for the trust boundary, notification model, evidence retention, and failure behavior.

## Post-Launch Hardware Work

| Work item | Status | Notes |
|---|---|---|
| RK3588 Path A production proof | Planned | Workflow compiles components, but the ROCK 5B bundle still needs real DDR/TPL plus fuse/RPMB/OP-TEE validation on hardware |
| RK3399 supported-secondary proof | Planned | Workflow produces combined Rockchip images; physical ROTPK/RPMB/OP-TEE evidence remains open |
| RPi 5 Path B documentation | Planned | Valuable dev target, not owner-owned Path A |
| Firmware OCI artifact hardening | Ongoing | Real hardware firmware tags should drop volatile CI flags |
| U-Boot FIDO2/U2F console gate | Idea-stage | Needs USB HID threat model and recovery design before implementation |
| Attestation service | Research | Must inherit PQ TLS requirements and fTPM evidence model |

## Deferred Ideas

- `systemd-sysinstall` as an optional guided installer path beyond current bootc and repart flows.
- LUO/KHO live-update research for appliance or server deployments where a short reboot is unacceptable.
- FIDO2-wrapped Secure Boot signing keys if upstream tools gain a clean hidraw path; PIV remains the current accepted route.
- ORAS artifact media types for non-OS OCI artifacts when registry UX is friendlier than `FROM scratch` carrier images.

## Exit Criteria For Moving Work Out Of FUTURE

Move an item into [ADR.md](ADR.md), [SPEC.md](SPEC.md), or implementation only when the following are true:

- The trust boundary is clear.
- Recovery and failure behavior are documented.
- CI or real-hardware evidence is defined.
- Required pins and upstream source references are recorded.
- Notification and evidence-retention policies are defined when detection or deception is involved.
- The change does not introduce a silent production/test artifact crossover.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 11, cycle 7)

FUTURE.md: the lead rung of round 9 named this file (change:bit0, delta 0); it passed the frozen check without repair; this drift check records that and nothing more.
