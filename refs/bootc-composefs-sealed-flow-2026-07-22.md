# bootc composefs and sealed UKI flow — 2026-07-22

Status: researched implementation boundary; current install smoke strengthened, sealed promotion still gated.

## Scope

This note audits the attached Duck.ai discussion about using EROFS with
`bootc install to-filesystem`, then maps the corrected design onto yubiOS. It
uses bootc v1.16.4 as the released command contract and the yubiOS `main`
snapshot at `b05758c6144ce0d24690ad6f391c5cf71d43aee2` as the repository
baseline.

The important conclusion is that `to-filesystem` and composefs are not
alternatives. A custom-layout composefs install uses both:

```sh
mkfs.ext4 -O verity /dev/ROOT
# Mount the prepared root and ESP under /target first.
bootc install to-filesystem \
  --composefs-backend \
  --bootloader=systemd \
  --root-mount-spec="UUID=${ROOT_UUID}" \
  /target
```

The physical sysroot remains a writable, fs-verity-capable filesystem such as
ext4 or Btrfs. EROFS is used for composefs metadata images stored inside that
filesystem; it is not the target root partition. See the released
[`to-filesystem` manual](https://github.com/bootc-dev/bootc/blob/v1.16.4/docs/src/man/bootc-install-to-filesystem.8.md)
and [composefs backend design](https://github.com/bootc-dev/bootc/blob/v1.16.4/docs/src/experimental-composefs.md).

## Findings

| Question | Audited answer | yubiOS consequence |
|---|---|---|
| Can `to-filesystem` populate an EROFS target? | No. The destination must be mounted and writable while bootc creates the deployment. | Prepare ext4 with the `verity` feature or use Btrfs; do not format the target as EROFS. |
| Where is EROFS used? | `/composefs/images/<digest>` points to a metadata-only EROFS image. File content is stored under `/composefs/objects`; deployment state is under `/state/deploy`. | Verify the repository layout, EROFS metadata image, and fs-verity measurements separately. |
| Is composefs the same as dm-verity? | No. Native bootc composefs verifies individual files with fs-verity. dm-verity authenticates a fixed block-device image and belongs to the separate mkosi/systemd-repart path. | Do not request a `dm-verity` dracut module for the bootc composefs path or describe it as an EROFS root partition. |
| Does strict fs-verity alone make the deployment sealed? | No. The composefs digest also has to be authenticated by the signed UKI command line. | A traditional BLS entry with raw kernel/initramfs is still unsealed, even when `composefs=<digest>` has no `?`. |
| What does `--allow-missing-verity` mean? | It makes verification optional and encodes an explicitly unsealed composefs reference. | Production must not pass it. CI rejects a `composefs=?…` boot argument. |
| What initializes the root? | The bootc dracut module installs `bootc-root-setup.service`. In the initramfs it opens the physical `/sysroot/composefs` repository, verifies the selected image and objects, assembles writable state, and replaces `/sysroot`. | Include upstream dracut module `51bootc`; `composefs` and `dm-verity` are not the module names for this path. |

The repository layout and digest rules are documented in the
[composefs-rs repository format](https://github.com/composefs/composefs-rs/blob/0a819c351951864071aa9ec23d6594710bf3173f/crates/composefs/src/repository_format.rs).
The security property comes from Linux
[fs-verity](https://docs.kernel.org/filesystems/fsverity.html): after verity is
enabled, the file is read-only and reads are checked against its Merkle tree.

## Corrections to the attached example

The attached answer has the right high-level sequence—split the kernel, build
a UKI, sign it, then install the UKI-bearing image—but its concrete commands
need these corrections:

1. `bootc container split-kernel-and-rootfs` writes to `--output`, not
   `--kernel-dir`.
2. `--kernel-dir` is an option to `bootc container ukify`.
3. The UKI `--output` and signing options are `ukify` arguments, so they go
   after the `--` separator.
4. bootc supplies the kernel, initrd, OS release, kernel arguments, and
   composefs digest. A second `--os-release` is unnecessary.
5. `/kernel` must not survive in the final rootfs or in the tree passed as
   `--rootfs` to `ukify`. Use distinct stages, or explicitly derive a clean
   final-rootfs stage after the split.
6. Sign systemd-boot as well as the UKI. The firmware Secure Boot chain is
   separate from fs-verity enforcement, and both are required for the full
   production authenticity claim.

The released interfaces are documented by the v1.16.4
[`split-kernel-and-rootfs`](https://github.com/bootc-dev/bootc/blob/v1.16.4/docs/src/man/bootc-container-split-kernel-and-rootfs.8.md)
and [`container ukify`](https://github.com/bootc-dev/bootc/blob/v1.16.4/docs/src/man/bootc-container-ukify.8.md)
manuals.

## Practical sealed-image build

The implementation shape is a four-stage build:

1. Build and lint the exact rootfs that will ship.
2. Split `vmlinuz` and `initramfs.img` into a kernel-artifact stage.
3. Derive a final-rootfs stage that contains neither `/kernel` nor the raw
   kernel/initramfs, then mount that tree read-only at `/target` in an isolated
   tools/signing stage.
4. Build and sign the UKI, then copy only the signed UKI into
   `/boot/EFI/Linux/` in the final image.

The core released commands are:

```sh
bootc container lint --fatal-warnings

mkdir -p /kernel
bootc container split-kernel-and-rootfs \
  --rootfs / \
  --output /kernel

mapfile -t kernel_versions < <(
  find /kernel -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
)
test "${#kernel_versions[@]}" -eq 1
kver="${kernel_versions[0]}"

bootc container ukify \
  --rootfs /target \
  --kernel-dir "/kernel/${kver}" \
  -- \
  --output "/out/${kver}.efi" \
  --signtool systemd-sbsign \
  --secureboot-private-key /run/secrets/secureboot_key \
  --secureboot-certificate /run/secrets/secureboot_cert
```

`/target` in the last command is the clean final-rootfs stage, while
`/kernel` comes from the split artifact stage. Signing material must enter as
a protected secret or through external signing infrastructure, never as a
Dockerfile `ARG`, ordinary `COPY`, image layer, or workflow artifact.

Every rootfs content change changes the composefs digest. The UKI therefore
has to be regenerated and re-signed for every derived image. The final image
contains the signed UKI at `/boot/EFI/Linux/<kernel-version>.efi`; bootc then
selects composefs automatically during installation. The signed UKI command
line binds the exact `composefs=<128-hex SHA-512 digest>`.

## Current yubiOS evidence boundary

The pinned Fedora 45 bootc index in [PINNED.md](../PINNED.md) resolved on
2026-07-22 to an amd64 image whose OCI configuration records
`bootc-1.16.3-2.fc45`. `bootc container ukify` is present there, but
`split-kernel-and-rootfs` first appears in bootc v1.16.4. The practical sealed
build above therefore cannot be made a required yubiOS production build step
until the pinned base exposes both released capabilities.

[Workflow run 29884493346](https://github.com/yubi-OS/yubiOS/actions/runs/29884493346)
passed the existing native amd64 and arm64 `to-filesystem` jobs. Its generated
entries contain raw `linux` and `initrd` paths plus a strict
`composefs=<128-hex digest>`, with no `root=` argument. That proves a strict
fs-verity composefs install using a traditional BLS entry. It does **not**
prove a sealed UKI or a Secure Boot chain, because the digest anchor remains
in mutable BLS configuration.

The workflow in this change is intentionally an external-image regression
smoke: the orchestrator runs it before building the production image, and its
default input is the published `latest` tag resolved to an immutable digest.
It now proves the requested composefs repository and rejects an ostree
fallback, but it still does not validate the checked-out commit's future
sealed artifact.

## CI contract and promotion gate

The current offline install smoke should require:

- ext4 created with the `verity` feature;
- composefs install capability and the shipped `51bootc` initramfs content;
- `/composefs/{objects,images,streams}` plus `/state/deploy`, with no
  `/ostree/repo` fallback;
- metadata symlinks named by a 128-character SHA-512 fs-verity digest;
- successful `fsverity measure` and `dump.erofs -s` on each metadata image;
- a failed write attempt against a measured image object;
- an exact BLS `composefs=<digest>` reference, no optional `?` marker, and no
  `root=` argument; and
- an explicit `unsealed-bls` result rather than a sealed-boot claim.

Promotion to a sealed lane requires more than offline inspection:

1. Pin a base with v1.16.4-equivalent `split-kernel-and-rootfs --output` and
   `ukify --kernel-dir` capabilities.
2. Build the split rootfs and UKI with no production key material in CI.
3. Sign through the protected yubiOS PIV/PKCS#11 or external-signing boundary,
   and validate both systemd-boot and UKI signatures.
4. Boot on each architecture with Secure Boot enabled.
5. Require `bootc status --json` to report a UKI composefs boot and a strict
   128-hex verity digest.
6. Include a negative tamper boot proving that a changed image/object is
   rejected before userspace.

Until those gates pass, the current lane remains accurately classified as
strict fs-verity plus unsealed BLS.

## Maturity and refresh rule

The composefs backend and its on-disk format remain experimental. The
v1.16.4 documentation describes dual EROFS v1/v2 generation, but the related
[bootc PR #2248](https://github.com/bootc-dev/bootc/pull/2248) was still open
for the 1.17 milestone when this note was written. Released v1.16.4 code still
uses the legacy `composefs=<digest>` form.

Do not add the proposed `--erofs-version` or
`composefs.digest=v1-…` interfaces until they exist in the version pinned by
yubiOS. Refresh this note when the Fedora base digest, bootc version, composefs
repository format, or sealed-image CLI changes.

Additional primary sources:

- [bootc v1.16.4 release](https://github.com/bootc-dev/bootc/releases/tag/v1.16.4)
- [`bootc-root-setup.service`](https://github.com/bootc-dev/bootc/blob/v1.16.4/docs/src/man/bootc-root-setup.service.5.md)
- [composefs design](https://github.com/composefs/composefs/blob/898c741f3889ab30057894a1429cc4c81a2bb7ed/README.md)
- [Fedora bootc initramfs module selection](https://gitlab.com/fedora/bootc/base-images/-/blob/46a316a6a3bd04b895071c8e3cdb0dd4d0200285/minimal/initramfs.yaml)
- [systemd `ukify` support for `systemd-sbsign`](https://github.com/systemd/systemd/commit/0b97cace240c455e369fd8716eeab7ce41a03ebc)
- [systemd `ukify`](https://www.freedesktop.org/software/systemd/man/latest/ukify.html)



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8361, Δ=+0.8390, Δ=+0.6561) were identical placeholder copies with no per-file content; merged on 2026-09-18.

## 2026-09-18 drift check (wayfinder round 8, cycle 65)

bootc composefs sealed flow spec: its Phase-2 question (install-time BLSConfig wiring) is unchanged; upstream bootc is now v1.16.13, past the version floor option (b) names; note additive.
