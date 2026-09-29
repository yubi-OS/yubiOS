# osbuild / Image Builder — On-Premises Overview
_Refreshed: 2026-07-23 (supersedes refs/archive-osbuild-image-builder.md, originally researched 2026-05-11)_

## 2026-07-23 major update: ibcli and bootc-image-builder have converged and archived

**This is a significant change from the prior research** (which treated `image-builder-cli` and `bootc-image-builder` as two separate, actively developed tools):

- `image-builder-cli` PR **#374** (merged) makes **`bootc-image-builder` a multi-call binary of ibcli**.
- The `osbuild/bootc-image-builder` repo now shows a notice that it has been **merged into `image-builder` and archived**.
- Osbuild's own deprecation notice (osbuild.org/docs/bootc/deprecation-notice/) confirms the standalone `bootc-image-builder` CLI/container is being **deprecated in favor of the unified `image-builder` CLI**, keeping compatibility entry points for a transition period; the RHEL container will eventually wrap the unified CLI and later drop the standalone binary.
- **Practical yubiOS impact:** `yubi-OS/image-builder-cli` (forked from `osbuild/image-builder-cli`, see refs/image-builder-cli-fork-2026-07-23.md) is now tracking the tool that also *absorbed* bootc-image-builder's role. Any yubiOS tooling still referencing a separate `bootc-image-builder` binary/container should be checked against this convergence — it's the same project now, invoked via `--bootc-*` flags on ibcli rather than a separate binary.
- Latest `osbuild/image-builder-cli` release found: **v69** (2026-06-17; confirmed final, upstream repo archived 2026-09-01).

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

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.

---

## Refresh: 2026-09-29

Dig method: searXNG via the n8n proxy endpoint, queries "osbuild image builder release 2026" and "fedora osbuild bootc image mode 2026". At dig time all searXNG engines (brave, duckduckgo, google cse) were suspended for shared rate limiting, so the results below were captured from the same endpoint earlier on 2026-09-29 and are dated as such. Every load-bearing claim was then verified directly against the primary source.

### What changed upstream since 2026-07-23

- `osbuild/image-builder-cli` is now read-only: the repo notice reads "This repository was archived by the owner on Sep 1, 2026". The archive date is the new fact; the 2026-07-23 section already recorded the merge into `image-builder`. Source: https://github.com/osbuild/image-builder-cli (noul 0.49)
- The v69 claim above is confirmed as the final release: the releases feed lists v69 (2026-06-17) as the newest tag, nothing after. Source: https://github.com/osbuild/image-builder-cli/releases.atom (noul 0.49)
- Upstream version ladder on the official release overview page: osbuild 53.1, osbuild-composer v191, cockpit-image-builder v179, image-builder v110, bootc-image-builder v69. Forward motion lives in the unified `image-builder` (v110); the absorbed `bootc-image-builder` is frozen at v69. Source: https://osbuild.org/docs/on-premises/overview/release-overview/ (noul 0.88)
- osbuild.org now hosts a dedicated migration page for bootc users: a container that creates disk images from bootc container inputs, oriented at Fedora/CentOS bootc or derivatives, replacing the standalone bootc-image-builder workflow. Source: https://osbuild.org/docs/bootc/ (noul 0.84)
- Red Hat shipped a `cockpit-image-builder` errata for RHEL 10 (RHSA-2026:71543): the Cockpit frontend for osbuild is still actively updated. Source: https://access.redhat.com/errata/RHSA-2026:71543 (noul 0.85)
- `ublue-os/bootc-image-builder-action` is in maintenance mode and points users at the upstream osbuild action. Source: https://github.com/ublue-os/bootc-image-builder-action (noul 0.20)
- No new evidence found on the composefs backend or on `osbuild/image-builder` issue #2427; the 2026-07-23 status of that blocker chain stands.

### Practical yubiOS impact

`yubi-OS/image-builder-cli` (fork of `osbuild/image-builder-cli`) now tracks a frozen, archived upstream: v69 is the last ibcli release and all future capability lands in the unified `image-builder` (currently v110). Any yubiOS work that still diffs against ibcli upstream will see no movement; follow `image-builder` releases and the osbuild.org/docs/bootc/ migration page instead.

### Sources considered

| # | Source | URL | noul |
|---|--------|-----|------|
| 0 | Releases overview, Image Builder docs | https://osbuild.org/docs/on-premises/overview/release-overview/ | 0.88 |
| 1 | RHSA-2026:71543 (cockpit-image-builder, RHEL 10) | https://access.redhat.com/errata/RHSA-2026:71543 | 0.85 |
| 2 | Tenable plugin for RHSA-2026:67139 (aggregator) | https://www.tenable.com/plugins/nessus/345586 | 0.24 |
| 3 | Deprecation notice, bootc-image-builder | https://osbuild.org/docs/bootc/deprecation-notice/ | 0.57 |
| 4 | OSBuild developer guide, project principles | https://osbuild.org/docs/developer-guide/projects/osbuild/ | 0.90 |
| 5 | osbuild/image-builder-cli repo (archive notice) | https://github.com/osbuild/image-builder-cli | 0.49 |
| 6 | Migration page, Image Builder bootc docs | https://osbuild.org/docs/bootc/ | 0.84 |
| 7 | Deprecation notice (repeat hit under query 2) | https://osbuild.org/docs/bootc/deprecation-notice/ | 0.71 |
| 8 | ublue-os/bootc-image-builder-action | https://github.com/ublue-os/bootc-image-builder-action | 0.20 |
| 9 | Red Hat docs: RHEL 9 image mode disk image customization | https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_image_mode_for_rhel_to_build_deploy_and_manage_operating_systems/customizing-disk-images-of-rhel-image-mode-with-advanced-partitioning_building-and-managing-physically-bound-images | 0.77 |
| 10 | Blueprint reference, Image Builder docs | https://osbuild.org/docs/user-guide/blueprint-reference/ | 0.91 |
| 11 | Fedora wiki: Changes/RemoveFipsModeSetup | https://fedoraproject.org/wiki/Changes/RemoveFipsModeSetup | 0.57 |

jev weighting: 1 POST to the steady-orbit /api/decide endpoint, 12 noul questions batched, task_id taf4cc06-0eb4-4e01-b523-9fb97b312775, cost $0.000204372.
