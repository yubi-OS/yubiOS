# yubi-OS/image-builder-cli Fork — Status Update
_Refreshed: 2026-07-23 (supersedes refs/archive-image-builder-cli-fork.md, originally forked/scoped 2026-05-11)_

## ⚠️ Fork no longer exists

**`yubi-OS/image-builder-cli` returns 404 as of 2026-07-23** — it is not in the current 17-repo yubi-OS org listing either. The fork described in the original research below was removed or never persisted past the initial 2026-05-11 scoping. If this fork is still wanted, it needs to be re-created from `osbuild/image-builder-cli`.

**Bigger context change: the upstream project itself has been absorbed.** Per refs/osbuild-image-builder-2026-07-23.md, `osbuild/image-builder-cli` PR #374 (merged) made `bootc-image-builder` a multi-call binary of ibcli, and `osbuild/bootc-image-builder` is now archived/merged into the unified `osbuild/image-builder` project. **If yubiOS re-forks this tool, fork `osbuild/image-builder` (the current unified project), not the older standalone `image-builder-cli` or `bootc-image-builder` repos** — those are legacy names for what's now one project.

## Recommendation

Given:
1. The fork doesn't currently exist,
2. The upstream tool has consolidated into `osbuild/image-builder`,
3. yubiOS's current CI pipeline doesn't appear to depend on a dedicated image-builder-cli fork (per live CI_MAP.md / workflow list — no `ci_fork_image-builder` workflow exists among the 20 registered workflows),

**this fork looks like it can stay retired** unless there's a specific yubiOS customization need for disk-image generation beyond what `bootc install to-filesystem` / `bcvk to-disk` already cover. Re-fork only if a concrete need for the unified `image-builder` CLI's disk-image types (qcow2, iso, ami, etc.) comes up.

## Original research (2026-05-11, background — describes the pre-consolidation, pre-fork-deletion state)

**Forked from**: osbuild/image-builder-cli (name at the time; now part of osbuild/image-builder)  
**Forked**: 2026-05-11T02:24:14Z  
**Description**: Building operating system artifacts (disk images, ISOs, etc.)  
**License**: Apache 2.0  
**Languages**: Go (55%), Python (41%), Makefile (2%), Dockerfile (1%), Shell (<1%)

### What it was

A modern, stateless CLI tool for building OS images (disk images, ISOs, containers) from blueprint TOML files. Replaces the service-based `osbuild-composer` / `composer-cli` stack. At the time, it was described as what `bootc-image-builder` uses internally — that relationship has since become a full merge (see update above).

### Why the fork was created

- `image-builder-cli` (now `image-builder`) is the tool that turns yubiOS OCI images into bootable disk artifacts (qcow2, raw, ISO)
- Forking would give the ability to add yubiOS-specific image types or customizations (e.g. a `yubios-disk` type that pre-enrolls FIDO2 during image generation)

### Relationship to other forks (still accurate)

| Fork | Purpose |
|---|---|
| `yubi-OS/bootc` | Core bootc runtime fork |
| `yubi-OS/mkosi` | mkosi image builder |
| `yubi-OS/bcvk` | Ephemeral VM testing |
| ~~`yubi-OS/image-builder-cli`~~ | **No longer exists** — disk image builder, retired |

`bcvk` remains the tool actually in active use for ephemeral VM testing and CI disk image builds.

---

## Source references
- https://github.com/osbuild/image-builder (current unified project)
- https://github.com/osbuild/image-builder-cli/pull/374 (consolidation PR)
- https://osbuild.org/docs/on-premises/overview/



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 8, cycle 63)

image-builder fork status record: fork states were re-verified for mkosi/bootc/bcvk this round (pin discipline holding); image-builder itself not re-read this pass, flagged for the next fork audit.
