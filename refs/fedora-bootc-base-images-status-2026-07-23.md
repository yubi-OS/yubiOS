# Upstream Fedora/CentOS bootc Base Image Repos
_Refreshed: 2026-07-23 (supersedes refs/archive-bootc-upstream-base-images.md, originally scoped 2026-05-11)_

## 2026-07-23 update — nuances the B-BOOTC-SEAL finding from refs/bootc-dev-org-releases-2026-07-23.md

**Correction/nuance:** that file flagged bootc-dev/bootc **v1.16.4 released 2026-07-15** as potentially unblocking B-BOOTC-SEAL. This refresh found the **Fedora packaging side is not there yet**: Fedora Rawhide currently ships **`bootc-1.16.3-2.fc45`** (rebuilt 2026-07-15 for the Fedora 45 Mass Rebuild, but still version 1.16.3, not 1.16.4). So **the upstream bootc release exists, but Fedora's packaged bootc binary inside `quay.io/fedora/fedora-bootc` has not yet picked it up** — B-BOOTC-SEAL likely still needs to wait on a Fedora package bump, not just a digest re-pin. Worth checking Fedora Rawhide bootc package status again on the next refresh cycle; this is the concrete blocker-clearing signal to watch for.

**Current Fedora bootc base-images repo status** (gitlab.com/fedora/bootc/base-images):
- Tracks Fedora **42, 43, 44, and Rawhide** simultaneously.
- Published image: **`quay.io/fedora/fedora-bootc`** with tags `42`, `43`, `44`, `rawhide` (variant tags for standard/minimal/minimal-plus per the docs).
- Repo builds for Rawhide by default; can target other Fedora versions.

**`clevis-dracut` / `clevis-pin-tpm2` status — confirmed still present**, same as prior research: they remain part of the standard image path (`clevis-dracut-21-14.fc44` includes a TPM2 dracut module; `clevis-21-14.fc44` depends on `clevis-pin-tpm2`). **yubiOS still needs to be aware of this if the boot chain ever shares dracut modules with clevis-based unlock** — yubiOS's FIDO2 YubiKey unlock path replaces TPM2 unlock entirely, so this should be a non-issue as long as clevis units aren't accidentally enabled, but worth a one-time sanity check against the live pinned image.

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
- **Action item for next refresh: check whether Fedora Rawhide's bootc package has moved past 1.16.3 to 1.16.4+** — that's the concrete unlock signal for B-BOOTC-SEAL.
- The `minimal-plus` tier is what Fedora IoT and CoreOS share; if yubiOS wants an IoT-adjacent image, that's the right upstream base.
- Be aware of `clevis-dracut`/`clevis-pin-tpm2` presence in the boot chain — verify they're not conflicting with the YubiKey FIDO2 unlock path on the live pinned image.

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

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.

## Refresh: 2026-09-29

Deep-research refresh via searXNG dig (3 queries, 18 results) with jev quality weighting. Append-only; analysis above unchanged unless noted.

**B-BOOTC-SEAL signal resolved: Fedora packaging moved past 1.16.3.** Fedora Rawhide now ships `bootc-1.16.13-1.fc46` (https://packages.fedoraproject.org/pkgs/bootc/bootc/fedora-rawhide.html, fetched directly 2026-09-29). Upstream bootc released 1.16.5 (2026-07-24) through 1.16.14 (2026-09-23) in the window since the last refresh (https://github.com/bootc-dev/bootc/releases). The 2026-07-23 action item, check whether Rawhide's bootc package moved past 1.16.3, is answered: it moved 10 minor versions. The concrete blocker-clearing signal this doc asked to watch for has fired. If B-BOOTC-SEAL is still open, the Fedora-package-bump blocker no longer explains it; recheck the seal workstream itself on the next cycle.

**Fedora CoreOS corroborates the package bump.** CoreOS build 44.20260817.3.2 bumped bootc 1.16.7-1.fc44 to 1.16.10-1.fc44 and is built on a quay.io/fedora bootc base container image (https://builds.coreos.fedoraproject.org/browser, jev noul 0.62; https://fedoraproject.org/coreos/release-notes/, jev noul 0.60 and 0.72). Independent confirmation that Fedora-packaged bootc is well past 1.16.3.

**New adjacent item: Fedora Hummingbird.** Fedora Hummingbird is a rolling, image-based OS built on bootc, live at quay.io/hummingbird-community/bootc-os (https://fedoramagazine.org/fedora-hummingbird-linux-taking-the-hummingbird-model-to-the-full-os/, May 2026, jev noul 0.42). Not a change to the official base-images repo and not adopted as a yubiOS base, but it is a new Fedora-adjacent bootc OS image in the landscape this doc tracks.

**No material change found to tier structure.** Nothing in the dig indicates new tiers, tier renames, or digest-policy changes for quay.io/fedora/fedora-bootc or quay.io/centos-bootc. The Fedora docs base-images page (https://docs.fedoraproject.org/en-US/bootc/base-images/, jev noul 0.85) remains live, with a search snippet showing a 2026-09-21 build timestamp. Direct fetch of that page was blocked by an Anubis proof-of-work challenge, so the full current tier list was not re-verified; tier claims above stand as verified on 2026-07-23.

### Sources considered (jev noul weight, query order)

Query "fedora bootc base images quay.io 2026":
1. Base images, Fedora Docs, docs.fedoraproject.org/en-US/bootc/base-images/, 0.85
2. Building a hardened, image-based foundation for AI agents, Red Hat blog, www.redhat.com/en/blog/building-hardened-image-based-foundation-ai-agents, 0.86
3. osbuild/bootc-image-builder, github.com/osbuild/bootc-image-builder, 0.09
4. Taking the Hummingbird model to the full operating system, fedoramagazine.org, 0.42
5. Getting Started with Bootable Containers, docs.fedoraproject.org/en-US/bootc/getting-started/, 0.09
6. Bootc and OSTree: Modernizing Linux System Deployment, a-cup-of.coffee/blog/ostree-bootc/, 0.76

Query "centos stream bootc image tiers 2026":
7. CentOS Connect 2026, www.centos.org/events/connect-2026/, 0.11
8. Bootc and boot with custom kernel, discussion.fedoraproject.org, 0.11
9. Taking the Hummingbird model to the full operating system, fedoramagazine.org, 0.13
10. bootc: Managing Your CentOS Deployments, youtube.com, 0.08
11. Debian vs Ubuntu 2026, tech-insider.org, 0.08 (off-topic)
12. Fedora Hummingbird: Is This the End of Traditional Linux?, fosslinux.com, 0.05

Query "fedora rawhide bootc package version 1.16" (own query, opened to chase the B-BOOTC-SEAL action item):
13. Releases, bootc-dev/bootc, github.com/bootc-dev/bootc/releases/, 0.07
14. Fedora CoreOS Release Notes, fedoraproject.org/coreos/release-notes/, 0.60
15. Fedora CoreOS Release Notes (testing), fedoraproject.org/coreos/release-notes/?stream=testing, 0.72
16. CoreOS Builds Browser, builds.coreos.fedoraproject.org/browser, 0.62
17. CoreOS Builds Browser (aarch64 stable), builds.coreos.fedoraproject.org/browser?stream=stable&arch=aarch64, 0.70
18. Releases/41/ChangeSet, Fedora Project Wiki, fedoraproject.org/wiki/Releases/41/ChangeSet, 0.63

Also fetched directly outside the dig: https://github.com/bootc-dev/bootc/releases.atom and https://packages.fedoraproject.org/pkgs/bootc/bootc/fedora-rawhide.html (primary sources for the 1.16.5..1.16.14 release range and the Rawhide package version above).
