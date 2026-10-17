# PINNED.md - yubiOS approved refs & digests

_Last reviewed: 2026-10-06 during the upstream release-ref audit._

All GitHub Actions, internal yubi-OS fork refs, external GitHub source refs, container image references, and directly downloaded workflow artifacts used across the yubi-OS org must appear here before being added to any workflow or Containerfile. Non-pinned refs such as mutable tags and branch names are not permitted.

**This file is the single source of truth.** AGENTS.md, ADRs, research notes, and workflows may point here, but they should not duplicate the live digest list.

---

## GitHub Actions

| Action | Pinned SHA |
|--------|------------|
| `0mniteck/.pki` | `*` (org-internal workflows only, ref matches `.github/*/*@*`) |
| `actions/attest` | `59d89421af93a897026c735860bf21b6eb4f7b26` |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/configure-pages` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/deploy-pages` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` |
| `actions/download-artifact` | `37930b1c2abaa49bbe596cd826c3c89aef350131` |
| `actions/setup-python` | `0b93645e9fea7318ecaed2b359559ac225c90a2b` |
| `actions/upload-artifact` | `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` |
| `actions/upload-pages-artifact` | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `docker/setup-buildx-action` | `d7f5e7f509e45cec5c76c4d5afdd7de93d0b3df5` |

## Direct Workflow Downloads

Every `wcurl` payload is verified with GNU `sha512sum --check --strict` before it is extracted, installed, or executed.

| Artifact URL | Platform | Pinned SHA-512 |
|--------------|----------|----------------|
| `https://download.docker.com/linux/static/stable/x86_64/docker-29.9.1.tgz` | `linux/amd64` | `f508d7befbb25a9993b762d6b8b5e626d7382884c63d8d6f0db0bc8d7e27b6a7bcaac4f353e79fe2eeaef8233d817e430982138cf94e86aee2ca9ebb975d9323` |
| `https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.1.tgz` | `linux/amd64` | `16ec64b59b207eb6d937b18fa8880dd1b345603f6a2b481d67f9f6fba9a00d19f1d09552fe5b4d75aa4b1e108854306c25519f1489a7a2972c7f94229805573c` |
| `https://github.com/docker/buildx/releases/download/v0.38.0/buildx-v0.38.0.linux-amd64` | `linux/amd64` | `fa2a4b38d084304e3993161a7cb5beb46c38f311ca5697dc57e97bf6e4f3505e66d9b4b089faf138e499565fca83620aa0a73a571141111cbd4d1877fe0e692b` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-29.9.1.tgz` | `linux/arm64` | `f1dbaee45f65122a3edbf59f8f9e7ea77212a300cfabdf54beeb5a115b18536e7d846a0a0b15adffa1e5fb56a9bc7d82fba350ef662c448935d372c98996a34e` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-rootless-extras-29.9.1.tgz` | `linux/arm64` | `20c59b7b4d680c0cd811fb17c138e5fea4cbac0528837fd9c81a8316cb151338ef8cbf5c55697228b8b32aea81f05e561693525a0cb51c8696889f011e21a07c` |
| `https://github.com/docker/buildx/releases/download/v0.38.0/buildx-v0.38.0.linux-arm64` | `linux/arm64` | `ce6749dafc2f662a4fc12857803250608e5b911f69c94f8fb93c55c7a334090527ecf0867476d252a22d31cd2e0af9ca2e4a478e49ea9b14c232cd3138922183` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64` | `linux/amd64` | `299a32c20b9a6ae981e5decd5a3d91b0f1dfc03c6f38e90f0adfa92b993bfd38faecdd99d80e749b8b9f34e4516c09928cbe785ad6c150db8f3a6a4a84ff5e53` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-arm64` | `linux/arm64` | `d372dead7e417d60a1e02c34183f32ae171ac82d1085cc5180032dcd38db792ae6ed562de5cfedfd77cf0f8def35a54313253601bffab77e075ea3239ecd99ad` |

> cosign v3.1.3 SHA-512 self-computed from the downloaded upstream binaries on 2026-10-17 and cross-validated against the SHA-256 in the v3.1.3 `cosign_checksums.txt` (amd64 `4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71`, arm64 `c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a`) and the GitHub release asset digests; repeat this cross-check when bumping versions.

## Internal yubi-OS Fork Refs

CI consumes the immutable source commit in the fifth column from the yubi-OS
fork, never the mutable tag. `fetch-released-tag-ref.yml` resolves the newest
stable upstream tag in each configured release family, peels annotated tags,
and proves that both the release commit and approved source commit can be
fetched from the fork with complete trees. When those commits are equal, the
workflow rolls every textual use automatically. EDK2 is bounded to
`edk2-stable202602`, the newest stable release that still provides the
StandaloneMM `ArmBaseLib` consumed by the paired pre-removal edk2-platforms
snapshot. When a yubiOS-specific source
commit extends the release, the workflow preserves it and requires the newest
release to remain its ancestor; this prevents a refresh from silently removing
bcvk device support, the mkosi profile, or OP-TEE volatile test storage. The
EDK2-platforms row uses its upstream pre-removal compatibility tag because that
project does not publish EDK2-style stable release tags.

| Fork repository | Upstream source | Upstream release/reference | Release commit in fork | Pinned source commit | Workflow role |
|-----------------|-----------------|----------------------------|------------------------|----------------------|---------------|
| `yubi-OS/arm-trusted-firmware` | `ARM-software/arm-trusted-firmware` | `v2.15.0` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | TF-A component validation and firmware assembly. |
| `yubi-OS/bcvk` | `bootc-dev/bcvk` | `v0.21.0` | `3292e7a9836a3bd5f04e5912e846d1198c6c9b25` | `bbd00ad7dfc031c4046d00b2f3c71ff4d48eb714` | `yubios` branch: release plus yubiOS swtpm/swu2f support (former pin), native-to-disk installer (PR #1), YubiKey USB passthrough for ephemeral VMs (PR #2), `--extra-qemu-arg` CLI option (PR #8, retires ci_test-vgpu-vm.yml in-run patch), and ephemeral SSH/vsock concurrent poll fix; merged together via direct merge commits. Component validation and VM harness. |
| `yubi-OS/edk2` | `tianocore/edk2` | `edk2-stable202602` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | Newest stable EDK2 release compatible with the StandaloneMM pre-removal platform snapshot; component validation and firmware build. |
| `yubi-OS/edk2-platforms` | `tianocore/edk2-platforms` | `20260316-before-platform-removals` | `cc384840c440415a091623a7658112fedc416094` | `cc384840c440415a091623a7658112fedc416094` | StandaloneMM platform build compatibility snapshot. |
| `yubi-OS/mkosi` | `systemd/mkosi` | `v27.1` | `ecf7f5702bb2052b7a69cab3fe7d37bc3b9ad77b` | `25c40d44732f2aed0d0c81eedb0ce57d57c79068` | Release plus yubiOS profile; component validation, summary, and installer build. |
| `yubi-OS/ms-tpm-20-ref` | `microsoft/ms-tpm-20-ref` | `v1.83r1` | `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` | `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` | TPM reference validation and fTPM firmware build. |
| `yubi-OS/optee_ftpm` | `OP-TEE/optee_ftpm` | `4.10.0` | `a09269b15de635e1816fe832e26adfbfb44c5455` | `d1cf4a04cb0ba8974051816623e039a1206f7cca` | Release plus yubiOS volatile NV support; component validation and TA build. |
| `yubi-OS/optee_os` | `OP-TEE/optee_os` | `4.10.0` | `753afbbee1682f5d16fd30e87b31058a4fd4f4b8` | `440b10c3f9b1c8501f2550e282ae071bb5424972` | Release plus yubiOS volatile StMM storage; component validation, TA dev kit, and BL32 build. |
| `yubi-OS/u-boot` | `u-boot/u-boot` | `v2026.10` | `5508406582f6f7120dce0c4b3059819a41788db2` | `5508406582f6f7120dce0c4b3059819a41788db2` | U-Boot component validation and firmware BL33 build. |

## External GitHub Source Refs

Workflows use the immutable commit in the third column. Branches and tags are retained only as provenance labels for maintainers.

| Repository | Reviewed branch/tag | Pinned commit | Workflow role |
|------------|---------------------|---------------|---------------|
| `docker/buildx` | `v0.38.0` | `0dbe87f36ed472fe36b6796c3f70b4210a731fc5` | Buildx release assets; payloads are additionally pinned by SHA-512 above. |
| `Mbed-TLS/mbedtls` | `mbedtls-3.6.7` | `068ff080b369adfac81509f9b57b2afabaf82dc5` | TF-A trusted-board-boot dependency; the TF-A v2.15.0 build gate requires mbedTLS major 3 (`drivers/auth/mbedtls/mbedtls_common.mk`). |
| `pando85/passless` | `v0.20.2` | `55139d3e209c62e040806c66181b835d1375971e` | TEST-image in-guest CTAP2 authenticator; yubiOS enables soft-fido2 0.17.0's implemented `hmac-secret` extension at build time. |
| `qemu/qemu` | `v11.1.2` | `4fc49f46dc95d4a27de2509e7fceb2931e91faeb` | ARM64 zstd-capable DirectBoot QEMU (zstd zboot loader support is contained in v11.1.2). |

Dynamic refs such as `github.sha`, `github.ref_name`, `target_ref`, and `ci_chain_ref` select commits within `yubi-OS/yubiOS` for the triggering run and the internal workflow chain. They are runtime identities, not external dependency refs; the default `actions/checkout` behavior checks out the triggering commit.

## Container Images

| Image | Pinned Digest | Notes |
|-------|---------------|-------|
| `docker.io/moby/buildkit:v0.31.2` (multi-arch INDEX) | `sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec` | BuildKit daemon used by every `docker-container` Buildx builder. Buildx 0.35.0 is only the client and does not pin this daemon implicitly. |
| `dhi.io/debian-base` (multi-arch INDEX) | `sha256:7b1d6522b9a4e72e2ca3537c031ca3650c654ec81c181447bf952069eb827226` | **Canonical for workflows + Containerfile `FROM` where DHI is used.** OCI image index for `trixie-debian13-dev`; auto-resolves per runner arch. |
| child `linux/amd64` | `sha256:3a7b23112b81b75fd1b54ab058bc6a67ff9351ecee870571ff7409a5f2905673` | Resolved automatically; do not pin directly unless an amd64-only job requires it. |
| child `linux/arm64` | `sha256:66459a4ed5daf0b1c8f33a856e6c5c66ecc500dc995bf6c632efcd7d17b57c22` | Resolved automatically. |
| `quay.io/fedora/fedora-bootc:45` (multi-arch INDEX) | `sha256:86cc9d98ef210b71a6c4eeec4b7d04e7fef0a4415184c2322a14c879df189f45` | **Containerfile `FROM` base.** OCI image index; auto-resolves per arch. Re-resolved 2026-10-17 via MASTER GIT SU (fetch-fedora-bootc-manifest blocked on dead org WORKFLOW PAT). Refresh with `fetch-fedora-bootc-manifest`. |
| `ghcr.io/actions/jekyll-build-pages` | `sha256:6791ebfd912185ed59bfb5fb102664fa872496b79f87ff8b9cfba292a7345041` | Pages build image. |
| `ghcr.io/hadolint/hadolint:v2.14.0-debian` | `sha256:158cd0184dcaa18bd8ec20b61f4c1cabdf8b32a592d062f57bdcb8e4c1d312e2` | Hadolint image. |

> Superseded single-arch or rotated digests kept for audit only:
> `62bc0610151db7155b7225f1a03c299bf109ab0b884da6777d1f808c7834d4ea`,
> `9415967aa0ed8adea8b5c048994259d1982026dca143d0303c7bbe0e11ed67d3`,
> `b7b34d8720b2e0ccaba980fd92347e7820051496ca0e639704172c6f3fb8877d`,
> `8a1c786152eaf72346a339ae2b869f5f7445cd311700f932f8bc94433a0e7d1b`.

---

## Policy

- All container image `FROM` statements in Containerfiles, `uses:` entries, external GitHub source refs, and direct workflow downloads must reference an identity pinned here.
- Every `wcurl` request must be followed by a matching `sha512sum --check --strict` verification before the payload is consumed.
- Versioned GitHub release URLs may retain their tag-shaped path only when the downloaded bytes are independently pinned and checked by SHA-512.
- For multi-arch jobs, reference the OCI index digest so it auto-resolves per runner architecture; do not pin a single-arch child in a matrix job.
- Mutable tags such as `:latest`, `:main`, or branch refs are rejected by `yubiOS.rego` and AGENTS.md policy.
- To add or roll a ref: obtain the digest, update this file, update repo references to the old digest, update `yubiOS.rego` if a new registry is introduced, and open a PR.
- Use `fetch-released-tag-ref` for yubi-OS fork release refs, `fetch-dhi-manifest` for `dhi.io/debian-base`, and `fetch-fedora-bootc-manifest` for `quay.io/fedora/fedora-bootc:45`.
- Digests are verified at build time by the explicit `yubiOS.rego` `target.policy` inherited from `yubiOS-bake.hcl` (`reset=true`, `strict=true`).
- cosign v3.1.3 is the canonical signing binary; downstream verification tooling MUST pin to v3.1.3 SHA-512 above. The yubiOS verifier (`tests/verify-oci-attestations.sh`) keys its identity regex to `^https://github\.com/yubi-OS/yubiOS/\.github/workflows/(yubiOS-ci|ci_dev_image|ci_mkosi-installer)\.yml@refs/(heads|tags)/.+$`; a future publisher workflow must add its filename to that set in the verifier script.

## Rockchip DDR/TPL blob (RK3588)

Pulled at build time by `ci_firmware-rk.yml`, which fails closed on a sha256 mismatch. Not vendored in this repo.

| Source | Ref | Path | sha256 | Consumers |
|---|---|---|---|---|
| `rockchip-linux/rkbin` | `3e288fe814e059dd06833495f845cab04ac20a5c` | `bin/rk35/rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.24.bin` | `2853a0da7ab895af43d50615af73eccf0694115dd0202483ee1c93c9071a42c3` | `ROCKCHIP_TPL` for the RK3588 (`rock5b-rk3588`) legs |

Redistribution: the blob is Rockchip-proprietary. The packed `u-boot-rockchip.bin` embeds it, so publishing that image needs the licence decision first. See `refs/rk3588-ddr-tpl-source-2026-07-29.md`.
