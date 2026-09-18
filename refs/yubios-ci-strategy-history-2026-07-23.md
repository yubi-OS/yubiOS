# yubiOS CI Strategy — Historical Origin, Superseded by CI_MAP.md
_Refreshed: 2026-07-23 (supersedes refs/archive-yubiOS-ci-strategy.md, originally updated 2026-05-10)_

## 2026-07-23 status: this document is now historical background only

**The live, authoritative CI reference is `CI_MAP.md` at the repo root, regenerated from the `main` workflow shape as of 2026-07-23.** It documents the actual current state: **20 registered workflows**, with `ci.yml` acting as a **top-level state machine** that dispatches an ordered chain (fetch-dhi-manifest, fetch-fedora-bootc-manifest, fetch-released-tag-ref, ci_firmware-rk, yubiOS-ci, ci_dev_image, ci_mkosi-installer, ci_test_rootless-docker, ci_test_bootc-filesystem, ci_test_pq_tls_verify, and the seven `ci_fork_*` firmware/component lanes) — a far more elaborate orchestration than the single `ci.yml` + `yubiOS.rego` setup described below. `yubiOS-bake.hcl` is now the source of truth for Docker build targets; `PINNED.md` remains the source of truth for approved action SHAs and image digests (same principle as before, just formalized).

**Everything in the "Original ci.yml Issues" table below was fixed years of iterations ago** (PR #12 merged the shellcheck/rego/pinning fixes back in 2026-05-10-ish). The workflow-token blocker (BLOCKER-001, "push to `.github/workflows/` requires manual deploy") **is also resolved** — per memory/PROJECT_RULES.md, the managed GitHub connection now has full workflow-scope write access, so `.github/workflows/*.yml` is edited directly via the API. Do not resurrect the "stage to `2026/` or `refs/` for manual deploy" pattern — that convention was retired 2026-07-09.

**For any current CI question, read `CI_MAP.md` and `PINNED.md` at the repo root, not this file.** This file is kept only as a historical record of the very first CI iteration.

## Original research (2026-05-10, historical only)

## Repo
`yubi-OS/yubiOS` — public, default branch `main`

## Open PRs / Issues (at the time)
- **PR #12**: shellcheck + ci.yml fixes + rego policy — `fix/shellcheck-sc2034-sc2064-sc2027`
- **Issue #11**: shellcheck CI output that triggered PR #12

## Original ci.yml Issues (vs AGENTS.md, all resolved long ago)

| Issue | Detail | Fix |
|---|---|---|
| Floating action refs | `actions/checkout@v4`, `@v6` — not pinned | Pinned to exact SHA |
| Disallowed action | `hadolint/hadolint-action@v3.1.0` — not in allowed-refs list | `apt-get install hadolint` |
| No pinned container | Bare `ubuntu-24.04` runner, no `dhi.io/debian-base` container | `container:` block with pinned image on all jobs |
| Broken YAML structure | Steps nested inside wrong `run:` block | Extracted as proper sibling steps |
| Mixed checkout versions | Inconsistent action versions | All → same pinned SHA |
| `podman build` in container | `podman` absent in `dhi.io/debian-base` | `docker buildx build --policy ...` |

## yubiOS.rego — Docker Build Policy (still the live approach, see docker-build-policy skill + refs/docker-build-policies-reference-2026-07-23.md)

```bash
docker buildx build --policy reset=true,strict=true,filename=yubiOS.rego .
```

## Publish target (accurate as of 2026-06-26, see PINNED.md/CI_MAP.md for current digests)

The production CI (`yubiOS-ci.yml`) publishes the OS image to **Docker Hub `0mniteck/yubios`** via a Bake-driven multi-arch build. Per-build immutable tag `:<commit-sha>`; SLSA provenance + SBOM attestations attached. Registry auth: username `0mniteck42`, `${{ secrets.DOCKER }}`.

---

## Source references
- Live: CI_MAP.md (repo root, regenerated 2026-07-23)
- Live: PINNED.md (repo root)
- refs/docker-build-policies-reference-2026-07-23.md



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.9090, Δ=+0.7964) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Problem Statement


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6732) were identical placeholder copies with no per-file content; merged on 2026-09-18.
