_Refreshed: 2026-07-23 (renamed from refs/v261-base-image.md, no date suffix previously)_

Cross-checked 2026-07-23 against refs/fedora-bootc-base-images-status-2026-07-23.md: Fedora bootc base-images repo currently tracks Fedora 42/43/44/Rawhide, with `quay.io/fedora/fedora-bootc` as the published image name — consistent with this file's `PINNED.md`-is-source-of-truth guidance. Also cross-checked: Fedora Rawhide's `bootc` package is at 1.16.3 (not yet 1.16.4, despite bootc-dev/bootc releasing 1.16.4 upstream on 2026-07-15) — relevant if this file is ever used to reason about B-BOOTC-SEAL timing.

# v261 base-image bump

Status: completed; keep this note as the historical checklist for future base-image refreshes. Current approved image digests live only in [../PINNED.md](../PINNED.md).

## Current source of truth

- `PINNED.md` owns the live `quay.io/fedora/fedora-bootc:45` OCI index digest.
- `fetch-fedora-bootc-manifest.yml` is the workflow used to refresh that digest.
- `Containerfile` must use the multi-arch index digest from `PINNED.md`, not a copied value from an ADR or old PR note.

## Completed gate

The original v261 gate was:

```sh
docker buildx imagetools inspect quay.io/fedora/fedora-bootc:45
docker run --rm <new-digest> systemd --version
```

The base bump unblocked `ConditionSecurity=measured-os`, `systemd-tpm2-swtpm.service`, and the current yubiOS enrollment-unit hardening work.

## Consistency note

Do not conflate these two systemd controls:

- `RestrictFileSystems=`: older BPF-LSM filesystem-type allow/deny control. yubiOS uses `RestrictFileSystems=~@network` in the enrollment unit.
- `RestrictFileSystemAccess=`: v261 control for restricting execution to signed and verified dm-verity-backed filesystems.

Future work may evaluate the v261 `RestrictFileSystemAccess=` control, but the current shipped unit uses `RestrictFileSystems=`.



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


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8670) were identical placeholder copies with no per-file content; merged on 2026-09-18.
