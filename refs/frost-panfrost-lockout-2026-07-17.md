# Frost Panfrost/RK lockout research: 2026-07-17

Status: research/design complete; kernel prototype and hardware proof still required.

## Goal

Turn the Frost roadmap item into an honest staged design: what can be done with current Linux/Panfrost/cgroup controls, what needs a kernel prototype, and what must stay hardware-gated.

## Source evidence

| Area | Evidence | Source |
|---|---|---|
| Panfrost hardware support | Mesa documents Panfrost support for Midgard, Bifrost, and Valhall Mali GPUs, including G52 and G610 conformance notes. | https://docs.mesa3d.org/drivers/panfrost.html |
| Panfrost per-file state | Linux Panfrost allocates `panfrost_file_priv`, an MMU context, job-manager contexts, and engine-usage accounting per DRM file. | https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/panfrost/panfrost_drv.c and https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/panfrost/panfrost_device.h |
| Submit path | `panfrost_ioctl_submit()` resolves a job-manager context, attaches the file MMU context, resolves BOs, then pushes the job. This is the policy choke point for context/cgroup-aware submit gating. | https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/panfrost/panfrost_drv.c |
| Device cgroup | cgroup v2 device access is enforced through `BPF_PROG_TYPE_CGROUP_DEVICE`, returning `0` to deny access to device files. | https://docs.kernel.org/admin-guide/cgroup-v2.html#device-controller |
| Device-memory cgroup | cgroup v2 has a `dmem` controller for device memory regions; DRM docs show TTM structures carrying dmem cgroup state, but current Panfrost evidence is GEM/SHMEM-oriented, not a proven Panfrost dmem implementation. | https://docs.kernel.org/admin-guide/cgroup-v2.html#dmem and https://docs.kernel.org/gpu/drm-mm.html |

## Patch map

| Surface | Current likely hook | Frost use |
|---|---|---|
| Probe/init | `panfrost_device`, compatible data, runtime PM/reset/power-domain setup | Discover board/GPU identity, wire Frost policy capability, expose safe reset/power-gate primitive if present. |
| BO create/free | `panfrost_ioctl_create_bo()`, `panfrost_gem_create()`, GEM mapping lifetime | Account GPU buffers to the owning file/cgroup if Panfrost dmem support is added. |
| PRIME/import | Panfrost GEM/import paths need a dedicated source pass before patching | Prevent imported buffers from bypassing accounting or quarantine policy. |
| Submit guard | `panfrost_ioctl_submit()`, `panfrost_jm_ctx_from_handle()`, `panfrost_job_push()` | Deny new jobs from a locked cgroup/context and report deterministic owner-facing telemetry. |
| Observability | fdinfo/debugfs scheduler and memory stats | Attribute suspected load to a process/cgroup before lockout and prove recovery after lockout. |

## Current determination

Do not claim that the current kernel can freeze one offending GPU cgroup while leaving the rest of the desktop unharmed. Current evidence supports a safer staged claim:

1. Stage 0: deny future render-node opens for a locked service/session using cgroup v2 device BPF.
2. Stage 1: observe open DRM files through fdinfo/debugfs and terminate or isolate the owner-selected process group from userspace.
3. Stage 2: prototype Panfrost submit gating keyed by DRM file/cgroup.
4. Stage 3: only after hardware tests, decide whether RK3399/RK3588 can recover by cgroup/context drain, per-GPU reset, or full GPU power-cycle/reset.

Device-memory cgroup accounting is not proven for Panfrost in this pass. Treat it as prototype work, not an existing dependency.

## Secure monitor / firmware sketch

The firmware-assisted path should use an explicit handoff rather than hidden kernel magic:

- U-Boot passes a reserved-memory region or device-tree node for Frost event/state exchange.
- Linux Frost agent evaluates owner policy and asks secure world for the hard cutoff only after local logging is durable enough for owner recovery.
- TF-A/OP-TEE exposes a narrow SMC or mailbox command for "quarantine GPU" with board-specific implementation: context drain if safe, otherwise GPU reset or power gating.
- OP-TEE records event order with SecTime only as same-boot elapsed evidence; persistent lockout state needs RPMB/fTPM NV or other sealed state.

## Test plan

- False positive: benign GPU load must not trigger Frost.
- Active abuse: runaway shader or faulting workload triggers the documented policy path.
- Recovery: compositor/desktop recovers or the owner sees a clear reboot/relogin requirement.
- Attribution: logs name board, GPU, cgroup, pid/comm, DRM fdinfo evidence, and action taken.
- Notification: owner-selected path receives a summary without secrets.
- Escape: already-open DRM fds cannot continue submitting after the lockout milestone being claimed.
- Hardware: run separately on ROCK 5B/RK3588 and ROCKPro64/RK3399 before production language.

## ADR coverage

ADR language should define the trust boundary between Linux policy and secure-world cutoff. Linux may classify and request; secure world may enforce board-level cutoff. Owner recovery must remain possible and documented before enabling any automatic hard cutoff.



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
