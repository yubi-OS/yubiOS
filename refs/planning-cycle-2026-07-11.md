# Planning cycle: 2026-07-11 docs and research pass

Status: completed for this documentation branch.  
Branch: `docs/research`  
Scope: markdown consistency, refs research refresh, and source-of-truth cleanup for yubiOS docs.

## Planning cycle

1. Read repo guidance first: `AGENTS.md`, `PINNED.md`, the local `agent_files/INDEX.md`, and the shared `yubi-OS/agent-skills` guidance.
2. Use the planning/documentation skills from the attached agent files, with `skill-creator` guidance for keeping skill-routing notes concise instead of copying whole skill bodies into repo docs.
3. Inventory markdown files and recent PRs before editing.
4. Verify unstable external facts against primary or near-primary upstream sources.
5. Update docs so current facts live in the right source of truth and historical values are labeled as historical.
6. Flag inconsistencies rather than silently smoothing over unresolved design or CI risks.

## Research findings

| Area | Finding | Source |
|---|---|---|
| systemd v261 | v261 added `ConditionSecurity=measured-os`, LUO/KHO FD-store preservation via `FileDescriptorStorePreserve=yes`, `systemd-pcrosseparator.service`, and `RestrictFileSystemAccess=`. | https://github.com/systemd/systemd/releases/tag/v261 |
| systemd filesystem controls | `RestrictFileSystems=` is a valid older BPF-LSM filesystem-type limiter added before v261; v261's newer control is `RestrictFileSystemAccess=` for verified dm-verity-backed execution. Docs must not conflate them. | https://www.freedesktop.org/software/systemd/man/systemd.exec.html |
| OpenSSL PQ TLS | OpenSSL 3.5 changed default TLS groups/keyshares to prefer hybrid PQC and offer `X25519MLKEM768` plus `X25519`. | https://openssl-library.org/news/openssl-3.5-notes/ |
| Go PQ TLS | Go 1.24 supports `X25519MLKEM768` and enables it by default when `crypto/tls.Config.CurvePreferences` is nil. | https://go.dev/doc/go1.24 |
| bootc install | yubiOS now documents `bootc install to-filesystem --root-mount-spec=""` for the active install path so the target root is externally prepared and DPS auto-discovery can omit the `root=` kernel argument. | https://bootc.dev/bootc/bootc-install.html |
| QEMU ARM64 zboot/zstd | QEMU gained a direct-loader fix for EFI zboot images compressed with zstd; yubiOS CI's pinned QEMU workaround is a harness fix, not a production compression rollback. | https://lists.nongnu.org/archive/html/qemu-devel/2026-01/msg04080.html |

## 2026-07-16 VM e2e addendum

Run [29525332901](https://github.com/yubi-OS/yubiOS/actions/runs/29525332901) turned the VM e2e planning state from host-bring-up uncertainty into guest-level triage. The primary ARM64 job still failed, but the useful wins are now documented in [vm-e2e-run-29525332901.md](vm-e2e-run-29525332901.md):

- `rock1` provided real ARM64 KVM and `/dev/fuse` for the bcvk/virtiofsd path.
- The pinned zstd-capable QEMU build (`3a18e8a25992d1643707e2cebdd6e9bb2bd7d3b9`, reporting QEMU `10.2.50`) carried the ARM64 DirectBoot path past the former zstd EFI zboot failure.
- `yubi-OS/bcvk@feat/swtpm-ci` built and exposed the `--swtpm` and `--swu2f` flags as a real regression gate.
- The yubiOS image pull, AppArmor relaxation, and VM boot completed far enough to reach Fedora 45 aarch64 login plus `multi-user.target` and `graphical.target`.
- The active failure is now `bootloader-update.service` inside the guest; the enrollment-surface test skipped behind that failed boot step.

Planning update: keep QEMU zstd workaround maintenance on the watch list, but prioritize diagnosing `bootloader-update.service` and rerunning the LUKS/FIDO2 and enrollment surfaces after that guest-level failure is fixed or explicitly classified.

## Inconsistencies flagged

| File(s) | Inconsistency | Resolution in this docs pass |
|---|---|---|
| `AGENTS.md`, `SAUNA_TOOLS.md`, historical notes in `BLOCKERS.md` | Old guidance said workflow-file writes were blocked by missing `workflow` scope, while current guidance says Workflows: Write is granted. | Marked the old token-scope blocker as resolved and routed workflow writes through the connected GitHub app / granted SU path. |
| `README.md`, `TODO.md`, `BLOCKERS.md`, `ADR.md`, `SPEC.md`, `MITIGATE.md` | `RestrictFileSystems=` was described as a v261 feature in some places. | Clarified that yubiOS currently uses `RestrictFileSystems=~@network`; v261 additionally introduced `RestrictFileSystemAccess=`. |
| `README.md`, `TODO.md`, older knowledge index | Hard-coded yubiOS output-image digest/run numbers were presented as current even after newer commits landed. | Moved docs toward `PINNED.md` for base/action pins and toward workflow/Docker Hub state for release image freshness. |
| `refs/luks-fido2-e2e-test.md` | swu2f Layer 2 was still described as pending, while ADR-026 and recent PRs describe the `dev` image path as live. | Updated the ref to distinguish production YubiKey trust from TEST-only swu2f coverage. |
| `refs/arm64-ftpm-phase-f0.md` | Mojibake in em dash/arrow characters made the doc harder to read. | Replaced with ASCII punctuation. |
| `refs/v261-base-image.md` | Still framed the v261 base bump as future work. | Reframed as historical/completed and pointed at `PINNED.md`. |

## Follow-ups

- Diagnose `bootloader-update.service` from run 29525332901 and decide whether the image, VM test image, or failed-unit policy needs the fix.
- Rerun `ci_test-vm.yml` after the bootloader-update decision so `tests/vm/test-fido2-enrollment.sh` is no longer hidden behind the earlier boot failure.
- Audit code and tests for the distinction between `RestrictFileSystems=` and `RestrictFileSystemAccess=` before adding the newer v261 control anywhere.
- Re-check the Docker Hub `0mniteck/yubios:latest` digest after the next green `yubiOS-ci.yml` publish; avoid treating old run-specific digests as evergreen docs facts.
- Validate the `bootc install to-filesystem --root-mount-spec=""` path on a disposable target after the external partition-preparation step is scripted or otherwise proven.
- Keep `PINNED.md` as the single source of truth for base images and GitHub Action SHAs; do not duplicate digest tables in `AGENTS.md` or research notes.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
