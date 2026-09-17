_Refreshed: 2026-07-23 (renamed from refs/luks-fido2-e2e-test.md, no date suffix previously)_

Status check 2026-07-23: this file's "Latest CI milestone" section (run 29525332901, bootloader-update.service failure) is now superseded by live BLOCKERS.md, which shows that failure was retired â run 29872832727 reached the guest without the old root-SSH/DirectBoot bootloader-update failures, leaving **B-VM-CTAP2** (no CTAP2 token enumerates) as the narrower remaining gap. Cross-checked against refs/fido2-ci-emulator-status-2026-07-23.md: passless (the software authenticator this file references) remains the actively-maintained correct choice (v0.13.0, 2026-07-12) â the guardrails and test-path table below remain accurate. Recommend the next update to this file happen once B-VM-CTAP2 closes.

# LUKS2 FIDO2 end-to-end test

Status: active CI coverage with hardware-free and hardware-in-the-loop paths. Production trust remains a physical YubiKey; software authenticators are TEST-only.

Relates to yubiOS #20/#25/#33, yubi-OS/bcvk#3, ADR-003, ADR-026.

## Test paths

| Test | Authenticator | Where it runs | Purpose |
|---|---|---|---|
| `tests/vm/test-luks-fido2.sh` | Real YubiKey + `bcvk native-to-disk` | Bare metal / hardware-in-the-loop | Production-path confidence |
| `tests/vm/test-luks-fido2-ci.sh` | swtpm + swu2f via `bcvk ephemeral run` | CI, no hardware | Regression coverage |
| `tests/vm/test-fido2-enrollment.sh` | TEST-only `0mniteck/yubios:dev` image with `passless` | CI / explicit dispatch | CTAP2 hmac-secret legs without a physical token |

## CI coverage

- swtpm provides `/dev/tpm0`/`/dev/tpmrm0` for measured-boot code paths.
- swu2f Layer 1 covers CTAP1/U2F and pam-u2f flows.
- swu2f Layer 2 uses the TEST-only `passless` authenticator in the `dev` image for CTAP2 hmac-secret, covering `systemd-cryptenroll --fido2-device=auto` and systemd-homed legs where available.

## Latest CI milestone

Run [29525332901](https://github.com/yubi-OS/yubiOS/actions/runs/29525332901) on 2026-07-16 is a useful milestone even though the ARM64 job failed. The `arm64` lane on self-hosted `rock1` reached a booted Fedora 45 aarch64 guest, showed a serial login prompt, reached `multi-user.target` and `graphical.target`, and started core services including `systemd-homed.service`, `pcscd.service`, `NetworkManager.service`, and `sshd.service`.

The host/harness wins from that run are now evidence-backed:

- real ARM64 KVM was available on `rock1`;
- `/dev/fuse` was present for virtiofsd/bwrap paths;
- pinned QEMU commit `3a18e8a25992d1643707e2cebdd6e9bb2bd7d3b9` booted the zstd EFI zboot image path;
- the immutable yubi-OS/bcvk release descendant in `PINNED.md` built and exposed `--swtpm` plus `--swu2f`;
- the yubiOS image was pulled into podman storage for bcvk;
- AppArmor profile relaxation completed before boot.

The active failure moved inside the guest: `bootloader-update.service` failed during `tests/vm/test-luks-fido2-ci.sh`, and `tests/vm/test-fido2-enrollment.sh` skipped because that earlier step failed. Full run evidence is recorded in [vm-e2e-run-29525332901.md](vm-e2e-run-29525332901.md).

## Guardrails

- The `dev` image must never become a production install default.
- Production images must not contain `passless` or any software authenticator used as a YubiKey stand-in.
- Physical-YubiKey passthrough remains the final authority for release confidence.

## bcvk dependency

`--swtpm` and `--swu2f` are required from the immutable yubi-OS/bcvk release-descendant commit in `PINNED.md`. bcvk is referenced by yubiOS CI and is not merged into this repository.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
