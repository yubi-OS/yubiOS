# AGENTS.md

This file provides guidance to AI coding agents working on yubiOS and the supporting yubi-OS repositories. Prefer the skills and knowledge referenced here over ad-hoc instructions, but keep repository-specific guidance in this file and reusable skill-routing guidance in the skill files.

Warning: rate-limit GitHub API calls to avoid lockout. Batch independent reads, avoid repeated URL opens, and keep work scoped to the current task.

## Session start

1. Read this file first, then [PINNED.md](PINNED.md), then the task-specific docs or workflow files.
2. Import any explicitly provided `SESSION_*.zip` artifacts before relying on old cache state.
3. Re-scan relevant knowledge and skills for drift. Use `skill-creator` guidance when improving agent skill files, but do not copy full skill bodies into repo docs.
4. Reassess [TODO.md](docs/TODO.md), [BLOCKERS.md](docs/BLOCKERS.md), and `refs/` notes when a planning or research task updates project state.

## Repository overview

Primary repo: https://github.com/yubi-OS/yubiOS

FIDO2-first immutable OS: U2F/HSM as root of trust for Secure Boot, disk encryption, SSH, and PAM. The design avoids mandatory TPM, OEM, or distribution-controlled trust anchors.

## Hands-off repos

Do not use or modify any repository whose repository name contains a period. This does not restrict folders or files inside an allowed repository.

## Project repository list

| Repo | Purpose | Status |
|---|---|---|
| `yubi-OS/yubiOS` | Main project | Active |
| `yubi-OS/bootc` | Bootable OCI images fork | Active |
| `yubi-OS/bcvk` | Bootc virtualization kit fork | Active; referenced by yubiOS CI |
| `yubi-OS/mkosi` | OS image builder fork | Active |
| `yubi-OS/particleos` | Reference implementation fork | Reference only |
| `yubi-OS/arm-trusted-firmware` | TF-A BL31 / TBB fork | ARM64 fTPM stack |
| `yubi-OS/optee_os` | OP-TEE secure-world OS fork | ARM64 fTPM stack |
| `yubi-OS/optee_ftpm` | fTPM TA fork | ARM64 fTPM stack |
| `yubi-OS/u-boot` | BL33 + UEFI provider fork | ARM64 fTPM stack |
| `yubi-OS/ms-tpm-20-ref` | TPM 2.0 reference fork | ARM64 fTPM stack |
| `yubi-OS/edk2` | StandaloneMM variable service source | ARM64 support |
| `yubi-OS/edk2-rk3588` | RK3588 EDK2 reference | Reference only |

Hands off: `.example`, `.github`, `yubi-OS.github.io`, and any other repo name containing `.`.

## Source of truth rules

- [PINNED.md](PINNED.md) is the single source of truth for approved GitHub Action SHAs and container image digests.
- Do not duplicate digest tables in this file. Show shape/examples only.
- Current workflow-file writes are permitted through the connected GitHub app / granted workflow-capable path. Historical notes about missing `workflow` scope are resolved unless a live connector error proves otherwise.
- Draft/staging workflow notes belong in `refs/`; production workflows live under `.github/workflows/`.

## Default image shape

Use the multi-arch OCI index digest from [PINNED.md](PINNED.md):

```sh
docker pull dhi.io/debian-base:trixie-debian13-dev@sha256:<PINNED_INDEX_DIGEST>
source scripts/lib/reproducible-build.sh
configure_reproducible_build . HEAD arm64
ARCH=amd64 PLATFORM=linux/amd64 \
  docker buildx bake --file yubiOS-bake.hcl yubios-ci
```

`yubiOS-bake.hcl` is canonical for non-fork container builds. Its inherited
`target.policy` loads `yubiOS.rego` with `reset=true` and `strict=true`; do not
duplicate or bypass that policy in workflow-local `buildx build` commands.

Workflow containers must use the pinned index digest and Docker Hub credentials from repository secrets:

```yaml
container:
  credentials:
    username: 0mniteck42
    password: ${{ secrets.DOCKER }}
  image: docker://dhi.io/debian-base@sha256:<PINNED_INDEX_DIGEST>
```

ARM64 runner policy is workflow-specific. Current docs distinguish non-KVM ARM64 lanes from VM/KVM lanes; check the workflow before changing runner labels.

## Deep research links

- https://www.freedesktop.org/software/systemd/man/systemd.exec.html
- https://www.freedesktop.org/software/systemd/man/systemd.unit.html
- https://www.freedesktop.org/software/systemd/man/systemd.service.html
- https://man7.org/linux/man-pages/man7/systemd.directives.7.html
- https://github.com/systemd/systemd/releases/tag/v261
- https://0pointer.net/blog/fitting-everything-together.html
- https://docs.docker.com/build/policies/intro/
- https://openssl-library.org/news/openssl-3.5-notes/
- https://go.dev/doc/go1.24
- https://bootc.dev/bootc/bootc-install.html
- https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event

## Planning-cycle notes

The latest documentation/research planning pass is in [refs/planning-cycle-2026-07-11.md](refs/planning-cycle-2026-07-11.md). Use it before repeating the same drift audit.
