# Research refresh: 2026-07-11 scheduled pass

Status: completed for `docs/research`.  
Scope: upstream drift check for active TODO lanes after the 2026-07-11 planning-cycle note.

## Query plan

- Check current systemd release state and announced removals that could affect boot/update docs.
- Re-check OpenSSL and Go post-quantum TLS defaults against official docs.
- Re-check bootc install behavior for partition discovery and root-mount semantics.
- Re-check Docker Build policy and Bake policy wiring against Docker docs.
- Re-check QEMU EFI zboot zstd support status against QEMU upstream evidence.
- Re-check ARM64 Path A building blocks: TF-A, OP-TEE StandAloneMM/RPMB, and U-Boot UEFI variable services.

## Findings

| Area | Current finding | Repo impact |
|---|---|---|
| systemd release drift | The systemd repository shows `systemd-stable v261.1` as the latest stable release, and the v261 release notes announce that the future v262 release intends to remove `/run/boot-loader-entries/` support and the experimental `systemd-sysupdated` D-Bus API. | Repo search did not find current references to those removed interfaces. Track a v262 audit anyway before adopting v262 docs or packages. |
| systemd measured boot | v261 adds `systemd-pcrosseparator.service`, which measures an early-userspace separator into PCRs, and the planning-cycle note already captured `ConditionSecurity=measured-os` and `RestrictFileSystemAccess=`. | Keep the measured-boot TODO active. New PCR separator behavior can affect policies, especially software TPM or OS-provided TPM flows. |
| OpenSSL PQ TLS | OpenSSL 3.5 docs say `X25519MLKEM768` is first in the default TLS 1.3 group list and list the hybrid groups `X25519MLKEM768`, `SecP256r1MLKEM768`, and `SecP384r1MLKEM1024`. | CI should keep checking hybrid PQ visibility without hard-coding only one acceptable group forever. |
| Go PQ TLS | Go 1.24 introduced default `X25519MLKEM768`; Go 1.26 release notes say `SecP256r1MLKEM768` and `SecP384r1MLKEM1024` are now enabled by default too. | Update TODO language so future Go 1.26 validation accepts the expanded default hybrid group set when the repo toolchain reaches it. |
| bootc install | bootc docs state `bootc install` has `to-disk` and `to-filesystem`; `to-filesystem` installs into an externally prepared and mounted filesystem tree. For yubiOS DPS auto-discovery, use `to-filesystem --root-mount-spec=""` with a Boot Loader Interface-capable bootloader. | The active install docs now prefer `to-filesystem` and leave validation of the externally prepared target layout as the next task. |
| Docker Build policy | Docker Build policies validate build inputs before builds execute. Bake `target.policy` uses the same keys as the `docker buildx build --policy` flag (`filename`, `reset`, `disabled`, `strict`, `log-level`) and auto-loads `Dockerfile.rego` beside the Dockerfile when present. | If yubiOS moves policy configuration into Bake, keep the current strict/reset behavior and avoid duplicate-policy assumptions. |
| QEMU zstd EFI zboot | QEMU upstream carried a Jan. 20, 2026 pull item adding support for zstd-compressed EFI zboot images; QEMU master also contains zstd handling in the EFI zboot loader path. | Keep the CI workaround version-gated and retire it only after the runner QEMU version contains that upstream support. |
| ARM64 Path A | TF-A 2.15.0 is current in the docs and contains RK3588 changes plus build-system breaking changes such as bundled Mbed TLS and default LTO. OP-TEE and U-Boot docs show StandAloneMM/RPMB EFI variable storage depends on OP-TEE RPMB configuration and U-Boot `CONFIG_EFI_MM_COMM_TEE`/RPMB support. | Path A board notes should capture exact TF-A/OP-TEE/U-Boot versions and config evidence, not just a high-level "OP-TEE works" statement. |

## TODO changes to carry forward

- Add a v262-facing documentation audit item for `/run/boot-loader-entries/`, `systemd-sysupdated`, and `updatectl` assumptions.
- Expand PQ TLS TODO language for Go 1.26 hybrid group defaults while preserving the OpenSSL 3.5+/Go 1.24+ floor.
- Keep QEMU zstd EFI zboot workaround retirement tied to runner QEMU evidence.
- Validate the documented `bootc install to-filesystem --root-mount-spec=""` path on a disposable target after external partition preparation is scripted or otherwise proven.
- Add explicit ARM64 Path A evidence items for TF-A, OP-TEE, StandAloneMM/RPMB, and U-Boot config.

## Sources

- https://github.com/systemd/systemd/releases
- https://github.com/systemd/systemd/releases/tag/v261
- https://docs.openssl.org/3.5/man3/SSL_CONF_cmd/
- https://go.dev/doc/go1.26
- https://go.dev/src/crypto/tls/common.go
- https://bootc.dev/bootc/bootc-install.html
- https://docs.docker.com/build/policies/usage/
- https://docs.docker.com/build/bake/reference/
- https://lists.nongnu.org/archive/html/qemu-devel/2026-01/msg04080.html
- https://github.com/qemu/qemu/blob/master/hw/core/loader.c
- https://trustedfirmware-a.readthedocs.io/en/latest/change-log.html
- https://optee.readthedocs.io/en/latest/building/efi_vars/stmm.html
- https://docs.u-boot.org/en/v2024.04/develop/uefi/uefi.html



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.8429). TODO: refine per file context.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.4201). TODO: refine per file context.
