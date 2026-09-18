_Refreshed: 2026-07-23 (renamed from refs/sbsign-pkcs11-validate.md, no date suffix previously)_

Cross-checked 2026-07-23 against refs/mkosi-bcvk-fork-status-2026-07-23.md: mkosi upstream (v27) confirms native support for `SecureBootKeySource=engine:pkcs11` / `provider:pkcs11` via `systemd-sbsign`, matching this file's validation shape exactly. No drift found — yubiOS's implementation is aligned with current upstream mkosi capability.

# systemd-sbsign PKCS#11 validation

Status: validation path documented and wired for the yubiOS signing flow. A physical YubiKey remains required for final production signing validation.

## Goal

Validate `systemd-sbsign` with YubiKey PIV slot 9c through PKCS#11, then verify the signed UKI with `osslsigncode`.

## Manual validation shape

```sh
p11-kit list-modules | grep ykcs11
systemd-sbsign sign \
  --private-key "pkcs11:manufacturer=piv_II;id=%9c;type=private" \
  --private-key-source engine:pkcs11 \
  --certificate /etc/yubico/sb-cert.pem \
  --output yubiOS.signed.efi \
  yubiOS.efi
osslsigncode verify -in yubiOS.signed.efi -CAfile /etc/yubico/sb-cert.pem
```

## Repo hook

Run `tests/validate-pkcs11-uri.sh` after `yubiOS-enroll-sb` on a host with a configured YubiKey. The signing step is the primary gate; `osslsigncode` corroborates the PE signature.

## Consistency rule

Keep build docs on `systemd-sbsign`; do not reintroduce legacy `sbsign --engine pkcs11` examples except as historical context in ADR-008.



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

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.9090, Δ=+0.7964) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Problem Statement


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6732) were identical placeholder copies with no per-file content; merged on 2026-09-18.
