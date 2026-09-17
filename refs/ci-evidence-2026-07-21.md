# CI Evidence Review â 2026-07-21

Status: point-in-time evidence from the complete logs of eight requested workflow runs

This note records what the reviewed runs actually prove, and what they do not. All 41 jobs in the eight runs completed successfully. The review used each job's full log, including skipped test output and warnings; a green workflow alone is not treated as proof of hardware behavior.

## Run index

| Run | Workflow evidence | What the complete logs establish | Residual limitation |
|---|---|---|---|
| [29869480442](https://github.com/yubi-OS/yubiOS/actions/runs/29869480442) | DHI base manifest refresh | The pinned DHI index resolved to `sha256:4440cf16b142316744a7fd1c5070eb23df54c7c335d8684c8d72864f0f3eb30e`, with both amd64 and arm64 children; `PINNED.md` was already current and the callback succeeded. | This validates manifest resolution, not rebuild equivalence of the image behind the digest. |
| [29869503301](https://github.com/yubi-OS/yubiOS/actions/runs/29869503301) | Fedora bootc manifest refresh | The pinned Fedora index resolved to `sha256:c7e6b35744792c2fc22c6e345d8a820ca83e08b94819f6c06fad4048810c96be`, with both amd64 and arm64 children; `PINNED.md` was current and the callback succeeded. | Package floors still need rechecking whenever the digest changes. |
| [29869527608](https://github.com/yubi-OS/yubiOS/actions/runs/29869527608) | ARM64 firmware orchestration | StandaloneMM built on both runner architectures; `qemu-arm64`, `rock5b-rk3588`, and `rockpro64-rk3399` built on both; both QEMU fTPM lanes found the Early TA, probed a functional fTPM, found no known failure signatures, and loaded StandaloneMM; all three strict-policy Bake publications passed. | The ROCK 5B bundle is not flash-ready: its log records a missing real RK3588 DDR/TPL blob and no `u-boot-rockchip.bin`. Neither physical board has RPMB-backed StandaloneMM/fTPM NV proof. |
| [29872130447](https://github.com/yubi-OS/yubiOS/actions/runs/29872130447) | Production CI | ShellCheck and Hadolint were clean; mkosi summarized native amd64 and arm64 outputs; unit suites passed on both architectures; rootless Docker plus the named hardened Buildx builder ran Bake with strict `yubiOS.rego` policy; per-architecture images merged into a verified amd64+arm64 manifest. | Rootless Docker logged its expected no-cgroups warning. The unit RPM floor assertion skipped where the DHI test container lacked `rpm`; package-floor proof therefore remains tied to the image checks that actually have RPM. |
| [29872433355](https://github.com/yubi-OS/yubiOS/actions/runs/29872433355) | Development image | Native amd64 and arm64 rootless Bake builds passed strict policy, published per-architecture staging tags, and merged a verified multi-architecture `dev` manifest. | `dev` is TEST-only and must not be treated as production evidence. |
| [29872832727](https://github.com/yubi-OS/yubiOS/actions/runs/29872832727) | VM end-to-end | The native ARM64 KVM guest reached the assertion scripts. Root SSH authentication and the bcvk virtiofs-root bootloader-update guard worked, and the enrollment-surface script ran. bcvk exposed both `--swtpm` and `--swu2f`. | The amd64 leg remains intentionally skipped for the open bcvk/virtiofsd issue. The ARM64 passless layer started, but no CTAP2 token enumerated, so LUKS2 FIDO2, homed, and `ed25519-sk` operations skipped. Direct-kernel boot also does not satisfy `ConditionSecurity=measured-os`, as expected. |
| [29876111887](https://github.com/yubi-OS/yubiOS/actions/runs/29876111887) | mkosi installer | The amd64 disk image built; `systemd-sbsign` PKCS#11 signing through SoftHSM was explicitly verified; the compressed artifact uploaded; rootless Bake passed strict policy and published the installer OCI image. | The published image was amd64-only. This review adds the missing native arm64 matrix and manifest merge. SoftHSM proves the interface, not a physical YubiKey or production key ceremony. |
| [29876466349](https://github.com/yubi-OS/yubiOS/actions/runs/29876466349) | Post-quantum TLS | Strict-policy Bake passed and the live endpoint negotiated TLS 1.3 with `X25519MLKEM768`; the callback succeeded. | This is a regression assertion for the current stack, not a claim that every client or future base will retain the same default. |

## State changes justified by the logs

- Retire the old `B-VM-SSH` and `B-VM-BOOTLOADER-UPDATE` blockers: run 29872832727 reached guest assertions using root public-key authentication and did not fail the DirectBoot/virtiofs bootloader-update guard.
- Keep a narrower VM CTAP2 blocker: the passless service ran, but the guest did not enumerate a FIDO2 token, so the cryptenroll, homed, and security-key SSH operations did not execute.
- Add an RK3588 firmware-input blocker: the ROCK 5B workflow produces a diagnostic bundle, but without a real DDR/TPL blob it is not a flashable production U-Boot artifact.
- Keep real YubiKey and real ARM board validation open. SoftHSM, swu2f, QEMU, and cross/native compile evidence are useful CI layers, not substitutes for owner-held hardware and physical boot-chain proof.
- Record production and dev image builds as native two-architecture Bake paths with strict policy enforcement; add the same two-architecture publication shape to the installer.

## Reproducibility interpretation

Digest-pinned inputs, checksum-verified downloads, a single Bake graph, and default-deny policy are prerequisites for bit-for-bit reproduction and make policy violations fail closed. They do not alone prove that two builds are byte-identical: package repositories, generated timestamps, provenance attestations, compression, and builder versions can all introduce variation. A release should claim bit-for-bit reproducibility only after two isolated rebuilds compare the intended payload digests (separately from intentionally varying attestations) and the comparison is retained as evidence.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.8429). TODO: refine per file context.


## Recommendation

**Verdict**: REVISE — context-dependent
**One-line**: TBD per file context.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.4201). TODO: refine per file context.
