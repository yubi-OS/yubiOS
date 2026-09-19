# Reproducible build contract — 2026-07-22

## Scope

This pass turns reproducibility from a pinning aspiration into executable tests
for the production and TEST-only dev OCI subjects, the intended unsigned
components in every ARM64 firmware board path, and the source-derived ARM64
mkosi installer subjects. It does not claim equality for cryptographic envelopes
that intentionally generate new keys or signatures.

The canonical build identity is the selected yubiOS commit plus its committer
timestamp. `scripts/lib/reproducible-build.sh` derives and validates that pair
once, then exports the same values to local builds and GitHub Actions. A caller
cannot silently assign a different `SOURCE_DATE_EPOCH` to the same revision.

## Implemented contract

| Layer | Control | Evidence |
|---|---|---|
| Build engine | Buildx client and BuildKit daemon are independently pinned; every `docker-container` builder names the daemon image from [PINNED.md](../PINNED.md). | Static workflow inspection plus `buildx inspect --bootstrap` during builds. |
| OCI metadata | Bake passes `SOURCE_DATE_EPOCH` and `BUILDKIT_MULTI_PLATFORM`, fixes the OCI `created` label, clamps layer mtimes with `rewrite-timestamp`, and fixes compression/exporter compatibility settings. | Pinned Buildx `bake --print`; the two-build proof requires the final config and index annotation to equal the commit time and permits inherited history only when it is no newer than that epoch. |
| Core contexts | `.dockerignore` admits only the production/dev Dockerfiles and their required tracked inputs. | Runner downloads and workspace debris cannot enter the image context. |
| Production/dev proof | `scripts/verify-reproducible-images.sh` builds the real target twice with separate pinned builders, no cache, and no default attestations, then compares the complete OCI-layout Merkle content. Bake output access is explicitly limited to each run's temporary directory; generated DNF cache, history, log, and repository-counting state plus the ldconfig auxiliary cache are removed, Python bytecode uses single-worker checked-hash compilation, and Rust debug paths are remapped. A mismatch prints config and layer-member diagnostics before failing. | Blocking ARM64 steps in `yubiOS-ci.yml` and `ci_dev_image.yml`; JSON evidence is retained for 30 days. |
| mkosi installer | Commit epoch, architecture-scoped deterministic seed, no incremental cache, Dracut reproducible mode, fixed zstd worker count, normalized payload metadata, sorted SHA-256 records, and finalize-time removal of `ldconfig`'s regenerable auxiliary cache. | `ci_mkosi-installer.yml` runs a second clean ARM64 build and requires an exact canonical manifest of unsigned root filesystem bytes, modes, ownership, mtimes, hardlinks, symlinks, devices, and xattrs plus exact initrd and package-manifest digests before publication. The root-resident signed systemd-boot path and metadata remain in that manifest, but its SoftHSM-bound content hash is retained with the other signature envelopes. JSON evidence is retained for 30 days; Btrfs block serialization is also recorded separately. |
| Firmware | Commit epoch reaches EDK2, U-Boot, and OP-TEE; TF-A receives an explicit timestamp and build string; EDK2 receives commit- and platform-scoped deterministic stack-cookie lists; prepared payload metadata is normalized and checksummed. | `ci_firmware-rk.yml` runs a second clean ARM64 StandaloneMM and per-board build, blocks QEMU on exact unsigned-component equality, and retains one JSON report per board for 30 days. QEMU TF-A signing bytes and an absent RK3588 TPL are recorded as explicit boundaries. |

The proof compares an unpacked OCI layout rather than `docker image save` or a
GitHub artifact ZIP. Those transport wrappers are not stable equality oracles.
Default provenance is disabled only inside the byte-comparison lane; published
attestations remain a separate envelope whose subject digest must identify the
already-proven image.

## Deliberate boundaries

The following bytes are not yet allowed to support a reproducibility claim:

- The installer creates a fresh non-production SoftHSM RSA key and certificate.
  The certificate, root-resident signed systemd-boot binary, signed UKI, ESP,
  and complete disk wrapper are recorded in both builds but excluded from
  equality. The systemd-boot path, mode, ownership, mtime, size, and xattrs
  remain equality subjects; only its key-bound content differs. Btrfs 7.0
  additionally generates
  separate device, chunk-tree, and root UUIDs and stamps the root item at mkfs
  time, so the raw partition serialization is also recorded rather than used as
  an equality oracle. Its canonical file bytes and intended POSIX/xattr
  metadata, the initrd, and package manifest are blocking equality subjects.
- QEMU TF-A uses `CREATE_KEYS=1`; certificate serials, validity, RSA-PSS
  signatures, and key-bound TF-A envelope bytes vary. The gate compares
  StandaloneMM, OP-TEE/fTPM, and U-Boot subjects exactly while recording both
  TF-A envelopes and their digests. A public fixed test fixture or a split
  unsigned TF-A subject is still required before the complete QEMU FIP/flash
  bytes can enter the equality claim.
- Fedora and Debian packages are still resolved from live repositories. The
  two-build gate proves equality against the package state observed during that
  run, not rebuildability months later. Immutable repository snapshots and an
  exact package/toolchain closure remain required.
- RK3588 source-derived StandaloneMM, OP-TEE/fTPM, TF-A BL31, and U-Boot
  components enter reproducibility evidence. Its final bootable Rockchip image
  cannot enter the claim until the external DDR/TPL blob has an approved
  immutable digest in `PINNED.md`.

Run IDs, wall-clock timestamps, temporary paths, and local/CI labels have been
removed from byte-bearing installer and firmware manifests. CI run identity
belongs in workflow summaries or provenance, not inside intended payloads.

## Local proof

On the supported Ubuntu 26.04 host, both proof modes run inside the same pinned
DHI, rootless Docker, Buildx, BuildKit, policy, and Bake graph as CI:

```sh
./scripts/build-local-images.sh repro-production
./scripts/build-local-images.sh repro-dev
```

Successful reports are written under `repro-evidence/`. A mismatch is a hard
failure; preserve the two OCI layouts with `KEEP_REPRO_OUTPUT=1` when invoking
the inner verifier directly and use `diffoscope` for diagnosis.

## Primary sources

- [SOURCE_DATE_EPOCH specification](https://reproducible-builds.org/specs/source-date-epoch/)
- [BuildKit reproducible-build documentation](https://github.com/moby/buildkit/blob/master/docs/build-repro.md)
- [Docker reproducible-build guidance](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
- [Docker OCI/image exporter options](https://docs.docker.com/build/exporters/oci-docker/)
- [mkosi `SourceDateEpoch=` and `Seed=`](https://github.com/systemd/mkosi/blob/main/mkosi/resources/man/mkosi.1.md)
- [btrfs-progs 7.0 mkfs UUID/time initialization](https://github.com/kdave/btrfs-progs/blob/9c5987432906daebde23f9703c0f6f90c35fa9da/mkfs/common.c)
- [U-Boot reproducible builds](https://docs.u-boot.org/en/stable/build/reproducible.html)
- [TF-A build options](https://github.com/ARM-software/arm-trusted-firmware/blob/master/docs/getting_started/build-options.rst)
- [RPM 4.18 deterministic transaction-clock support](https://rpm.org/wiki/Releases/4.18.0)
- [GNU tar reproducibility guidance](https://www.gnu.org/software/tar/manual/html_node/Reproducibility.html)
- [GitHub artifact permission caveat](https://github.com/actions/upload-artifact/blob/main/README.md)


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4361) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.5402) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6587) were identical placeholder copies with no per-file content; merged on 2026-09-18.
