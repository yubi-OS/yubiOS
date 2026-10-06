# PINNED.md - yubiOS approved refs & digests

_Last reviewed: 2026-08-04 during the OMN-157 SLSA L3+SBOM+cosign wiring._

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
| `https://download.docker.com/linux/static/stable/x86_64/docker-29.6.0.tgz` | `linux/amd64` | `42401384ef853dab0a1986a7990420e77d3ee2bc39e178f8817d27ba6c4403998b7aacf3c28c7172135cdeec281cd328a8f2af949b5f57db44a211a093cfd20b` |
| `https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.6.0.tgz` | `linux/amd64` | `184b583a0f325bef12feaf1ca175ff5ea4a65a168f2136eb1daf9c2ae646eecf02134ed65766c8800bd8eb03ac4d338d1e5d700248bc33632027b5b0b52de48a` |
| `https://github.com/docker/buildx/releases/download/v0.35.0/buildx-v0.35.0.linux-amd64` | `linux/amd64` | `710f4f48a101af939c4a4cace5ca93ab8c1a1a9ae244a4ef73b2a900f228614472b635bd202fae383c851686d383a37cdeddf45e6d54b36cae8458826c272262` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-29.6.0.tgz` | `linux/arm64` | `04713ac54030bed8b2c096280d034b02f5430ed73ba8bcc4a686f7bbbf4a3444eb027847e896cd9ee91c3237dbe1c25a4cfca43d1dcd922a1a10009c960ace0b` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-rootless-extras-29.6.0.tgz` | `linux/arm64` | `37649acdaacc597c115d2f19b71a4729a0119c6debbba4b4af18da2fd497ac28f5691df13137b7fc59903551ab0e08868f4b976a9a5704e2b7958b3b5b0cc0af` |
| `https://github.com/docker/buildx/releases/download/v0.35.0/buildx-v0.35.0.linux-arm64` | `linux/arm64` | `6dc0d4ed11a7bbd8148dab8897594d7050e7f3bc43e6d130e629aa443e50266e77beed8816737e5dc34b7d43617e7a4eef8121561042ef9a87479aea14383058` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.2/cosign-linux-amd64` | `linux/amd64` | `01174ede4958413aca502e7eafdff34a5a7fab39c25af66b84c24b98e354e5cf2631bf2c07ecdd8c684dfab843f9694237606706eeafc20ae30ed5ed831f1d60` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.2/cosign-linux-arm64` | `linux/arm64` | `635c9d2d661dc300ce8038f5f922af90886faa8b7baacdbb7f6de9f734b80d18bb13b4d34854720fd6d0a63839b8899d2b4fdea2811c0d7e07a802cdb518df24` |

> cosign v3.1.2 SHA-512 self-computed locally from the upstream binary; cross-validate against the upstream SHA-256 in `cosign_checksums.txt` at the same release URL when bumping versions.

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
| `yubi-OS/bcvk` | `bootc-dev/bcvk` | `v0.18.0` (fork release `v0.18.0-yubios.1`) | `2d86c4cb3c82db57814558bd577d97a2ac6174ca` | `34fb0b6bfff0f59d4ff4a985dab895a7b87a2c5c` | `yubios` branch: release plus yubiOS swtpm/swu2f support (former pin), native-to-disk installer (PR #1), YubiKey USB passthrough for ephemeral VMs (PR #2), `--extra-qemu-arg` CLI option (PR #8, retires ci_test-vgpu-vm.yml in-run patch), and ephemeral SSH/vsock concurrent poll fix; merged together via direct merge commits. Component validation and VM harness. |
| `yubi-OS/edk2` | `tianocore/edk2` | `edk2-stable202602` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | Newest stable EDK2 release compatible with the StandaloneMM pre-removal platform snapshot; component validation and firmware build. |
| `yubi-OS/edk2-platforms` | `tianocore/edk2-platforms` | `20260316-before-platform-removals` | `cc384840c440415a091623a7658112fedc416094` | `cc384840c440415a091623a7658112fedc416094` | StandaloneMM platform build compatibility snapshot. |
| `yubi-OS/mkosi` | `systemd/mkosi` | `v26` | `84af20892b61c8e177e391f997ded8b4cb5514f2` | `b2b1ea6ad59621a6f955e4cbceee72580a91889a` | Release plus yubiOS profile; component validation, summary, and installer build. |
| `yubi-OS/ms-tpm-20-ref` | `microsoft/ms-tpm-20-ref` | `v1.83r1` | `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` | `98b60a44aba79b15fcce1c0d1e46cf5918400f6a` | TPM reference validation and fTPM firmware build. |
| `yubi-OS/optee_ftpm` | `OP-TEE/optee_ftpm` | `4.10.0` | `a09269b15de635e1816fe832e26adfbfb44c5455` | `5e09cdbe1bcb1bc3bcf4875ebafb4e1a1154417c` | Release plus yubiOS volatile NV support; component validation and TA build. |
| `yubi-OS/optee_os` | `OP-TEE/optee_os` | `4.10.0` | `753afbbee1682f5d16fd30e87b31058a4fd4f4b8` | `440b10c3f9b1c8501f2550e282ae071bb5424972` | Release plus yubiOS volatile StMM storage; component validation, TA dev kit, and BL32 build. |
| `yubi-OS/u-boot` | `u-boot/u-boot` | `v2026.07` | `ece349ade2973e220f524ce59e59711cc919263f` | `ece349ade2973e220f524ce59e59711cc919263f` | U-Boot component validation and firmware BL33 build. |

## External GitHub Source Refs

Workflows use the immutable commit in the third column. Branches and tags are retained only as provenance labels for maintainers.

| Repository | Reviewed branch/tag | Pinned commit | Workflow role |
|------------|---------------------|---------------|---------------|
| `docker/buildx` | `v0.35.0` | `a319e5b15052cf6557ceb666eb8ff6e32380b782` | Buildx release assets; payloads are additionally pinned by SHA-512 above. |
| `Mbed-TLS/mbedtls` | `mbedtls-3.6.6` | `0bebf8b8c7f07abe3571ded48a11aa907a1ffb20` | TF-A trusted-board-boot dependency. |
| `pando85/passless` | `v0.11.2` | `b67ccdf22e18cf21bcd140e03d22af413342d605` | TEST-image in-guest CTAP2 authenticator; yubiOS enables soft-fido2's implemented `hmac-secret` extension at build time. |
| `qemu/qemu` | upstream commit | `3a18e8a25992d1643707e2cebdd6e9bb2bd7d3b9` | ARM64 zstd-capable DirectBoot QEMU. |

Dynamic refs such as `github.sha`, `github.ref_name`, `target_ref`, and `ci_chain_ref` select commits within `yubi-OS/yubiOS` for the triggering run and the internal workflow chain. They are runtime identities, not external dependency refs; the default `actions/checkout` behavior checks out the triggering commit.

## Container Images

| Image | Pinned Digest | Notes |
|-------|---------------|-------|
| `docker.io/moby/buildkit:v0.31.2` (multi-arch INDEX) | `sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec` | BuildKit daemon used by every `docker-container` Buildx builder. Buildx 0.35.0 is only the client and does not pin this daemon implicitly. |
| `dhi.io/debian-base` (multi-arch INDEX) | `sha256:4440cf16b142316744a7fd1c5070eb23df54c7c335d8684c8d72864f0f3eb30e` | **Canonical for workflows + Containerfile `FROM` where DHI is used.** OCI image index for `trixie-debian13-dev`; auto-resolves per runner arch. |
| child `linux/amd64` | `sha256:503cd6ca90125a687c0974938d54f5664dc64f360ca4a774a2e126d366ab16bb` | Resolved automatically; do not pin directly unless an amd64-only job requires it. |
| child `linux/arm64` | `sha256:4ba9e9aa5a847950064c1fcc4dea2a0147147a0526c29e1164d9d52701c7fb42` | Resolved automatically. |
| `quay.io/fedora/fedora-bootc:45` (multi-arch INDEX) | `sha256:d3a7b4a7f60d06868d5d1193204872e711f5271ff54add6a82dcec62a68268aa` | **Containerfile `FROM` base.** OCI image index; auto-resolves per arch. Re-resolved 2026-10-06 via MASTER GIT SU (fetch-fedora-bootc-manifest blocked on dead org WORKFLOW PAT). Refresh with `fetch-fedora-bootc-manifest`. |
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
- cosign v3.1.2 is the canonical signing binary; downstream verification tooling MUST pin to v3.1.2 SHA-512 above. The yubiOS verifier (`tests/verify-oci-attestations.sh`) keys its identity regex to `^https://github\.com/yubi-OS/yubiOS/\.github/workflows/(yubiOS-ci|ci_dev_image|ci_mkosi-installer)\.yml@refs/(heads|tags)/.+$`; a future publisher workflow must add its filename to that set in the verifier script.
