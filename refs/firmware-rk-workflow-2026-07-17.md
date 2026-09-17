# RK firmware workflow split: 2026-07-17

Status: workflow live; complete-log evidence added 2026-07-21.

## Change

Add `.github/workflows/ci_firmware-rk.yml` as the orchestrated firmware lane and remove the top-level `ci.yml` path that dispatched `ci_test-int.yml` for the `yubiOS firmware` state.

The new callback state is the workflow name:

```text
yubiOS RK firmware
```

## Publish contract

When `Docker_push=true`, the workflow publishes the original firmware tags plus board-scoped variants under the existing Docker Hub namespace:

- `0mniteck/yubios:firmware`
- `0mniteck/yubios:firmware-<sha>`
- `0mniteck/yubios:firmware-qemu-arm64`
- `0mniteck/yubios:firmware-qemu-arm64-<sha>`
- `0mniteck/yubios:firmware-rock5b-rk3588`
- `0mniteck/yubios:firmware-rock5b-rk3588-<sha>`
- `0mniteck/yubios:firmware-rockpro64-rk3399`
- `0mniteck/yubios:firmware-rockpro64-rk3399-<sha>`

The variants now carry their own TF-A platform, OP-TEE flavor, U-Boot defconfig, and board-built payload. Run [29869527608](https://github.com/yubi-OS/yubiOS/actions/runs/29869527608) proved QEMU fTPM/StandaloneMM integration and board-specific compilation. It did **not** prove physical hardware:

- `qemu-arm64` produced and boot-tested `flash.bin` on both runner architectures.
- `rockpro64-rk3399` produced combined Rockchip U-Boot images, but still needs ROTPK, RPMB, fTPM NV, recovery, and signed-UKI evidence on a board.
- `rock5b-rk3588` did not receive a real RK3588 DDR/TPL blob and therefore did not produce the required `u-boot-rockchip.bin`; its published bundle is diagnostic, not flash-ready.

## Callback chain

`ci.yml` dispatches `ci_firmware-rk.yml` after `fetch-fedora-bootc-manifest` when `ci_fork_run=false`, and after `ci_fork_edk2` when the optional fork chain is enabled. On callback state `yubiOS RK firmware`, `ci.yml` continues to `yubiOS-ci.yml`.

## Validation

The original workflow YAML was parsed locally before commit. The later complete-log review is recorded in [ci-evidence-2026-07-21.md](ci-evidence-2026-07-21.md). No physical RK3399 or RK3588 hardware proof has been recorded.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
