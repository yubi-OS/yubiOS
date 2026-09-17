_Refreshed: 2026-07-23 (renamed from refs/arm64-ftpm-phase-f0.md, no date suffix previously)_

Status check 2026-07-23: Phase F0 (QEMU bring-up) work is superseded in practice by the live ARM64 Phase F integration described in TODO.md's "ARM64 Phase F â fork-CI + integration" section â all component CIs (C1-C6, R1, V1) are green, and INT integration CI is fully restored per the 2026-07-07 root-cause fix (CFG_STMM_VOLATILE_STORAGE). This file's original Phase F0 QEMU-only scope has been absorbed into that broader, now-working pipeline. Kept as historical design rationale for PCR conventions and the fTPM-vs-YubiKey trust split, which remain accurate and unchanged.

# Phase F0: QEMU ARM64 bring-up (ADR-018)

Status: active planning / human-gated validation. Phase F0 proves the ARM64 secure-world stack in QEMU before any irreversible hardware provisioning.

## Goal

Build a reproducible QEMU `virt` ARM64 boot chain that brings up `/dev/tpm0` backed by the yubiOS-owned fTPM and proves PCR extension works.

## Stack

| Layer | Component | Pin / identifier |
|---|---|---|
| BL1/BL2/BL31 | TF-A | `PLAT=qemu ARCH=aarch64 SPD=opteed` |
| BL32 (S-EL1) | OP-TEE OS | `PLATFORM=vexpress-qemu_armv8a` on QEMU `virt` |
| S-EL0 TA | ms-tpm-20-ref fTPM, Early TA | UUID `bc50d971-d4c9-42c4-82cb-343fb7f37896`; ms-tpm-20-ref @ `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` |
| BL33 (NS) | U-Boot, UEFI mode | `CONFIG_TPM2_FTPM_TEE=y`, `CONFIG_MEASURED_BOOT=y`, `CONFIG_EFI_LOADER=y` |
| OS | Linux | `CONFIG_TEE=y CONFIG_OPTEE=y CONFIG_TCG_TPM=y CONFIG_TCG_FTPM_TEE=m` |

Correction retained: the OP-TEE platform is `vexpress-qemu_armv8a`, not `vexpress-qemu_virt`; the QEMU machine is still `virt`.

## Critical risk: Early-TA RPMB bootstrap

The fTPM is built as an Early TA so U-Boot and Linux can use TPM services before a root filesystem exists. The risk is the first persistent NV write to RPMB before `tee-supplicant` is available. F0 should either run `tee-supplicant` from initramfs or defer persistent writes until it is available.

## PCR convention

| PCR | Content |
|---|---|
| 0,1 | System firmware, BL31/BL32/BL33, and config |
| 7 | Secure Boot policy state |
| 8,9 | Kernel, DTB, initramfs measured by U-Boot |
| 10 | IMA runtime log |
| 16 | Debug/resettable PCR used by the F0 verifier |

## Deliverables

- `tests/vm/build-arm64-ftpm-qemu.sh`: reproducible build of the full chain from the pinned OP-TEE `qemu_v8` manifest set plus pinned ms-tpm-20-ref.
- `tests/vm/verify-tpm0-pcr-extend.sh`: in-guest done condition: OP-TEE bus up, `/dev/tpm0` and `/dev/tpmrm0` present, `TPM2_Startup` OK, and a PCR extend changes the PCR value.

## Done condition

`build-arm64-ftpm-qemu.sh` boots QEMU `virt`; inside the guest, `verify-tpm0-pcr-extend.sh` prints `PASS`. This remains human-gated until the firmware path is stable enough to promote.

## fTPM vs YubiKey

The fTPM is for platform integrity, measured boot, and attestation. The YubiKey remains the disk-unlock root through FIDO2 hmac-secret and LUKS2 (ADR-003). If the fTPM becomes the sole unlock gate, yubiOS has recreated the on-device trust anchor it exists to avoid.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.
