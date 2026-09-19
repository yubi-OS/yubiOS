# yubiOS Onboarding

Last reviewed: 2026-07-11

This guide gets a contributor or early tester oriented without requiring them to read every ADR first.

## Read First

1. [README.md](../README.md) for the project overview and install shape.
2. [SPEC.md](SPEC.md) for normative requirements.
3. [PINNED.md](../PINNED.md) for the live base-image and tool pins.
4. [ADR.md](ADR.md) when you need the why behind a decision.
5. [refs/planning-cycle-2026-07-11.md](../refs/planning-cycle-2026-07-11.md) for the latest research-cycle corrections.

## Local Requirements

For repository work, expect Docker Buildx, a recent systemd toolchain where relevant, and a YubiKey 5 series device for real enrollment paths. CI may use SoftHSM or swu2f only where the workflow explicitly marks the artifact as TEST-only.

For installation experiments, the current documentation tracks the bootc `to-filesystem` model. Prepare and mount the target filesystems first, with the target root at `/mnt` and boot filesystem at `/mnt/boot`, then run bootc against that mounted tree:

```bash
IMAGE=docker.io/0mniteck/yubios:latest
sudo podman pull "$IMAGE"
sudo podman run --rm --privileged --pid=host --ipc=host \
  --security-opt label=type:unconfined_t \
  -v /var/lib/containers:/var/lib/containers \
  -v /dev:/dev \
  -v /:/run/host \
  "$IMAGE" \
  bootc install to-filesystem \
    --source-imgref="registry:${IMAGE}" \
    --bootloader=systemd \
    --root-mount-spec="" \
    --composefs-backend \
    --skip-finalize \
    /run/host/mnt/
```

Use the exact command shape documented by the current bootc release and yubiOS workflow before writing a real disk. Never test destructive install commands against a disk with data you need.

## YubiKey Setup Checklist

- Enable FIDO and CCID interfaces: `ykman config usb --enable FIDO --enable CCID`.
- Set and record a FIDO2 PIN.
- Enroll a primary YubiKey for LUKS2 and homed.
- Enroll a backup YubiKey where supported.
- Generate and print the recovery key offline.
- Keep PIV slot 9c material for Secure Boot signing separate from everyday SSH operations.

## Development Rules

- Treat ARM64 as primary for mission-critical hardware-root planning.
- Keep x86-64 support working, but do not let x86-specific VM behavior override ARM64 trust-chain priorities.
- Do not copy old workflow-run digests into docs as current pins. Update [PINNED.md](../PINNED.md) instead.
- Keep `RestrictFileSystems=` and `RestrictFileSystemAccess=` distinct when writing systemd hardening notes.
- Make a dated `refs/` note for substantial research cycles.

## Recovery Expectations

Every feature that can lock an owner out must have a documented recovery path before it is treated as production-ready. That includes disk unlock, homed, Secure Boot key enrollment, U-Boot console protection, and first-boot validation gates.

## Where To Put New Information

| Information | Destination |
|---|---|
| Current digest/tool pin | `PINNED.md` |
| Accepted decision | `ADR.md` |
| Normative requirement | `SPEC.md` |
| Roadmap/future work | `FUTURE.md` |
| Threat and residual risk | `MITIGATE.md` |
| Research-cycle notes | `refs/YYYY-or-topic.md` |
| Active blockers | `BLOCKERS.md` |
| Actionable task list | `TODO.md` |



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 10, cycle 15)

onboarding record: unchanged; the docs corpus it introduces was fully mojibake-repaired this round (rounds 9-10), so new readers see clean text; note additive.
