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

## 2026-09-18 drift check (wayfinder round 8, cycle 64)

v261 base image bump record: the bump is historical; the current fedora-bootc digest question is tracked by this round's pin-resolution audit (the pin is stale, 404 on quay); note additive.

## Refresh: 2026-09-29

Method note: the searXNG dig ran 3 queries ("fedora rawhide systemd version 2026", "systemd v262 release date changelog", plus one fallback query "systemd 262 released fedora") and returned zero results on all three; every upstream engine was suspended or timed out. The evidence below comes from direct primary-source fetches instead. Fedora rawhide's `systemd.spec` on src.fedoraproject.org was behind an Anubis bot challenge, so no claim is made here about which systemd version rawhide currently ships. Quality weights are noul probabilities from typesafe/jev-1.13.

Findings (one line of fact + source + weight):

1. systemd v262 released upstream on 2026-09-22; v262-rc3 on 2026-09-15; v261.3 stable patch on 2026-09-10; v260.5 on 2026-09-10. Source: https://api.github.com/repos/systemd/systemd/releases (noul 0.87) and https://github.com/systemd/systemd/releases/tag/v262 (noul 0.90). The doc's v261 anchor stays accurate; v261.3 is the newest v261.x. No direct evidence that `RestrictFileSystemAccess=` semantics changed, so no in-place edits were made.
2. The v262 changelog announces two v263 removals relevant to image-based OS tooling: the experimental systemd-sysupdated D-Bus API (clients move to Varlink against systemd-sysupdate directly, updatectl gets reworked) and systemd-logind's `/run/boot-loader-entries/` compatibility interface (UAPI.1 itself stays). Source: https://github.com/systemd/systemd/releases/tag/v262 (noul 0.90). Watch item for future yubiOS image-refresh tooling design.
3. `quay.io/fedora/fedora-bootc:45` has moved since the pin: the upstream tag now resolves to index digest `sha256:efccfcd332447...` (last modified 2026-09-29), while `PINNED.md` pins `sha256:c7e6b357...` (re-resolved 2026-08-05). Source: https://quay.io/api/v1/repository/fedora/fedora-bootc/tag/ (noul 0.83) and https://raw.githubusercontent.com/yubi-OS/yubiOS/main/PINNED.md (noul 0.83). Consistent with the 2026-09-18 drift check note that the pin is stale. `PINNED.md` remains the source of truth; re-resolve with `fetch-fedora-bootc-manifest.yml`, never copy a digest from this doc.
4. quay.io now also publishes a `:46` tag (index digest `sha256:1f38166e...`, updated 2026-09-29) alongside `:43`, `:44`, `:45`, and `:rawhide`; all refreshed 2026-09-29. Source: https://quay.io/api/v1/repository/fedora/fedora-bootc/tag/ (noul 0.83). The 2026-07-23 cross-check above said the base-images repo tracked Fedora 42/43/44/Rawhide; a `:46` tag existing upstream as of today is new information but the dated statement is left untouched.

Verdict: no material change to the doc's own claims. `PINNED.md` is still the source of truth, the completed v261 gate text is historical record, and the `RestrictFileSystems=` vs `RestrictFileSystemAccess=` consistency note is unchanged. The stale pin drift (finding 3) is the one actionable item and it is owned by the pin-resolution audit, not this doc.

Sources considered (all weighted, noul):

| # | Source | URL | noul |
|---|--------|-----|------|
| 0 | systemd v262 release tag page | https://github.com/systemd/systemd/releases/tag/v262 | 0.90 |
| 1 | systemd releases API (v262 2026-09-22, v262-rc3 2026-09-15, v261.3 2026-09-10) | https://api.github.com/repos/systemd/systemd/releases | 0.87 |
| 2 | quay.io registry API tag listing for fedora/fedora-bootc | https://quay.io/api/v1/repository/fedora/fedora-bootc/tag/ | 0.83 |
| 3 | yubi-OS/yubiOS PINNED.md | https://raw.githubusercontent.com/yubi-OS/yubiOS/main/PINNED.md | 0.83 |
| 4 | src.fedoraproject.org rawhide systemd.spec (blocked by Anubis bot check, no content) | https://src.fedoraproject.org/rpms/systemd/raw/rawhide/f/systemd.spec | 0.16 |

searXNG attempts returned no results and are not cited.
