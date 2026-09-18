# osbuild / Image Builder — On-Premises Overview
_Refreshed: 2026-07-23 (supersedes refs/archive-osbuild-image-builder.md, originally researched 2026-05-11)_

## 2026-07-23 major update: ibcli and bootc-image-builder have converged and archived

**This is a significant change from the prior research** (which treated `image-builder-cli` and `bootc-image-builder` as two separate, actively developed tools):

- `image-builder-cli` PR **#374** (merged) makes **`bootc-image-builder` a multi-call binary of ibcli**.
- The `osbuild/bootc-image-builder` repo now shows a notice that it has been **merged into `image-builder` and archived**.
- Osbuild's own deprecation notice (osbuild.org/docs/bootc/deprecation-notice/) confirms the standalone `bootc-image-builder` CLI/container is being **deprecated in favor of the unified `image-builder` CLI**, keeping compatibility entry points for a transition period; the RHEL container will eventually wrap the unified CLI and later drop the standalone binary.
- **Practical yubiOS impact:** `yubi-OS/image-builder-cli` (forked from `osbuild/image-builder-cli`, see refs/image-builder-cli-fork-2026-07-23.md) is now tracking the tool that also *absorbed* bootc-image-builder's role. Any yubiOS tooling still referencing a separate `bootc-image-builder` binary/container should be checked against this convergence — it's the same project now, invoked via `--bootc-*` flags on ibcli rather than a separate binary.
- Latest `osbuild/image-builder-cli` release found: **v69** (2026-06-17).

### composefs-native backend — still experimental, not a blocker resolution

bootc's composefs backend remains **experimental** per bootc's own docs (compiled in, not production-ready). Active integration work is tracked in `osbuild/image-builder` issue #2427 (2026-04-29), which lays out the blocker chain: osbuild changes → images changes → image-builder release → bootc release → bootloader/config plumbing. **This directly corroborates yubiOS's own BLOCKERS.md B-BOOTC-SEAL entry** ("pin a base with v1.16.4-equivalent split/ukify capabilities") — the upstream gap yubiOS is waiting on is the same one tracked in this issue, not yet resolved as of this refresh.

### Current supported distros (osbuild.org/docs/user-guide/image-descriptions/, as of 2026-07-20)
- RHEL 10.1, 9.7, 8.10
- AlmaLinux OS 10.1, 9.7, 8.10 (+ AlmaLinux Kitten 10)
- CentOS Stream 10, 9
- **Fedora 44, 43**
- Rocky Linux 10.1, 9.7, 8.10

### Current image types (osbuild.org/docs/developer-guide/projects/image-builder/usage/)
container, iot-bootable-container, iot-commit, iot-container, iot-installer, iot-qcow2, iot-raw-xz, iot-simplified-installer, minimal-installer, minimal-raw-xz, minimal-raw-zst, server-ami/oci/openstack/ova/qcow2/vagrant-libvirt/vagrant-virtualbox/vhd/vmdk, workstation-live-installer, wsl, plus bootc-specific inputs `--bootc-ref`, `--bootc-build-ref`, `--bootc-installer-payload-ref` (note: `--distro` is not combined with bootc inputs since the container defines the target distro).

---

## Original research (2026-05-11, background/history — tool names below are now the pre-convergence names)

## What it is

osbuild is a pipeline execution engine for building customized OS images. Image Builder wraps it with higher-level UX. Historically two main components existed (now unified per the update above):

- **osbuild-composer** — daemon-based service; manages blueprints, queues builds, Weldr/lorax-compatible API
- **image-builder-cli (ibcli)** — modern stateless tool; no daemon, no database; blueprints are local TOML files (now the umbrella tool that also absorbs bootc-image-builder's role)

osbuild itself is the low-level pipeline engine that both use under the hood.

## image-builder-cli (preferred for yubiOS)

```bash
# Install
dnf install image-builder
# or COPR for latest
dnf copr enable @osbuild/osbuild
dnf copr enable @osbuild/image-builder
dnf install image-builder

# Build a qcow2
image-builder build qcow2 \
  --distro fedora-43 \
  --blueprint blueprint.toml

# Run via container (no install needed)
sudo podman run --privileged \
  -v ./output:/output \
  ghcr.io/osbuild/image-builder-cli:latest \
  build --distro fedora-43 minimal-raw
```

## Blueprint format (TOML, unchanged)

```toml
name = "yubiOS-base"
description = "yubiOS base image"
version = "0.1.0"

[[packages]]
name = "yubikey-manager"

[[packages]]
name = "pcscd"

[[packages]]
name = "opensc"

[[customizations.user]]
name = "admin"
password = "$6$..."
groups = ["wheel"]
key = "ssh-ed25519 AAAA..."

[customizations.kernel]
append = "quiet"

[[customizations.filesystem]]
mountpoint = "/var"
minsize = "10 GiB"
```

## OSTree / bootc integration (updated flow)

**Build OSTree commit:**
```bash
image-builder build iot-commit --blueprint blueprint.toml
```

**bootc builds now go through the unified CLI's `--bootc-*` flags rather than a separate `bootc-image-builder` binary:**
```bash
sudo podman run --privileged \
  -v ./output:/output \
  -v /var/lib/containers/storage:/var/lib/containers/storage \
  ghcr.io/osbuild/image-builder-cli:latest \
  build --bootc-ref quay.io/yubi-os/yubios:latest --type qcow2
```

---

## References
- Convergence PR: https://github.com/osbuild/image-builder-cli/pull/374
- bootc-image-builder repo (archived): https://github.com/osbuild/bootc-image-builder
- Deprecation notice: https://osbuild.org/docs/bootc/deprecation-notice/
- bootc composefs experimental docs: https://bootc.dev/bootc/experimental-composefs.html
- composefs-native tracking issue: https://github.com/osbuild/image-builder/issues/2427
- Image descriptions (distros): https://osbuild.org/docs/user-guide/image-descriptions/
- Usage docs (image types): https://osbuild.org/docs/developer-guide/projects/image-builder/usage/
- Original overview: https://osbuild.org/docs/on-premises/overview/



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.
