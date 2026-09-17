# Upstream Fedora/CentOS bootc Base Image Repos
_Refreshed: 2026-07-23 (supersedes refs/archive-bootc-upstream-base-images.md, originally scoped 2026-05-11)_

## 2026-07-23 update â nuances the B-BOOTC-SEAL finding from refs/bootc-dev-org-releases-2026-07-23.md

**Correction/nuance:** that file flagged bootc-dev/bootc **v1.16.4 released 2026-07-15** as potentially unblocking B-BOOTC-SEAL. This refresh found the **Fedora packaging side is not there yet**: Fedora Rawhide currently ships **`bootc-1.16.3-2.fc45`** (rebuilt 2026-07-15 for the Fedora 45 Mass Rebuild, but still version 1.16.3, not 1.16.4). So **the upstream bootc release exists, but Fedora's packaged bootc binary inside `quay.io/fedora/fedora-bootc` has not yet picked it up** â B-BOOTC-SEAL likely still needs to wait on a Fedora package bump, not just a digest re-pin. Worth checking Fedora Rawhide bootc package status again on the next refresh cycle; this is the concrete blocker-clearing signal to watch for.

**Current Fedora bootc base-images repo status** (gitlab.com/fedora/bootc/base-images):
- Tracks Fedora **42, 43, 44, and Rawhide** simultaneously.
- Published image: **`quay.io/fedora/fedora-bootc`** with tags `42`, `43`, `44`, `rawhide` (variant tags for standard/minimal/minimal-plus per the docs).
- Repo builds for Rawhide by default; can target other Fedora versions.

**`clevis-dracut` / `clevis-pin-tpm2` status â confirmed still present**, same as prior research: they remain part of the standard image path (`clevis-dracut-21-14.fc44` includes a TPM2 dracut module; `clevis-21-14.fc44` depends on `clevis-pin-tpm2`). **yubiOS still needs to be aware of this if the boot chain ever shares dracut modules with clevis-based unlock** â yubiOS's FIDO2 YubiKey unlock path replaces TPM2 unlock entirely, so this should be a non-issue as long as clevis units aren't accidentally enabled, but worth a one-time sanity check against the live pinned image.

---

## Original research (2026-05-11, background/structure unchanged)

## gitlab.com/fedora/bootc/base-images

**Purpose**: Build and maintain Fedora bootc base images via `rpm-ostree compose image`  
**Language**: Shell, YAML, Just (task runner)  
**CI**: GitLab CI (Tekton + Konflux for official builds; local `just` for dev)

### Key files
| File | Purpose |
|---|---|
| `Containerfile` | Multi-stage OCI build (includes `chunked` build target via chunkah) |
| `Justfile` | Task runner: `just build`, `just build-minimal`, `FEDORA_VERSION=43 just build` |
| `bootc-base-imagectl` | Shell script: rechunk, build OCI base images from rpm-ostree commits |
| `fedora-{N}.yaml` | Per-version treefile stubs (with repo overrides for Pungi path) |
| `standard.yaml`, `minimal.yaml`, `minimal-plus.yaml` | Image tier manifest definitions |
| `iot.yaml`, `fedora-iot.yaml` | IoT variant |
| `.tekton/` | Konflux CI pipeline definitions (official Red Hat build system) |
| `renovate.json` | Automated dependency bumps (Renovate bot) |

### Published images
- `quay.io/fedora/fedora-bootc:42`, `:43`, **`:44`** (current), `:rawhide`
- Dev builds: `quay.io/bootc-devel/fedora-bootc-{version}-{tier}`

---

## gitlab.com/redhat/centos-stream/containers/bootc

**Purpose**: CentOS Stream bootc base images (upstream for RHEL Image Mode)  
**Branches**: `main` (redirect shell, git submodule to fedora/bootc/base-images), `c9s`, `c10s`

### Published images
- `quay.io/centos-bootc/centos-bootc:stream9`
- `quay.io/centos-bootc/centos-bootc:stream10`

### Relationship to Fedora
CentOS builds extend/adapt the Fedora image process via a git submodule. RHEL Image Mode is downstream of CentOS Stream 9/10.

---

## yubiOS implications

- yubiOS currently derives from `quay.io/fedora/fedora-bootc` (Fedora standard tier), per PINNED.md.
- **Action item for next refresh: check whether Fedora Rawhide's bootc package has moved past 1.16.3 to 1.16.4+** â that's the concrete unlock signal for B-BOOTC-SEAL.
- The `minimal-plus` tier is what Fedora IoT and CoreOS share; if yubiOS wants an IoT-adjacent image, that's the right upstream base.
- Be aware of `clevis-dracut`/`clevis-pin-tpm2` presence in the boot chain â verify they're not conflicting with the YubiKey FIDO2 unlock path on the live pinned image.

---

## Source references
- https://gitlab.com/fedora/bootc/base-images
- https://fedora.gitlab.io/bootc/docs/bootc/base-images/
- https://gitlab.com/redhat/centos-stream/containers/bootc
- https://packages.fedoraproject.org/pkgs/bootc/bootc/fedora-rawhide.html
- https://packages.fedoraproject.org/pkgs/clevis/clevis-dracut/fedora-44.html
- https://packages.fedoraproject.org/pkgs/clevis/clevis/fedora-44.html



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
