# Lane C: how bootc computes composefs digests

Scope: source-level research only. I downloaded tarballs, grepped and read code, and made read-only GitHub API calls. I did not build or run bootc, did not pull or run `fedora-bootc:45`, and did not touch rock1 or any card.

## Versions and provenance

| Item | Value | Source |
|---|---|---|
| bootc main head (API, queried 2026-10-18 ~08:24 PT) | `de7ae55a1c859df999a8d9ccc5eee32372f4c6f0` (2026-10-17) | `GET /repos/bootc-dev/bootc/git/ref/heads/main` |
| bootc main tarball used for grep | codeload `refs/heads/main`, fetched ~08:21 PT | not confirmed to equal `de7ae55`; I did not record its SHA |
| Latest release | `v1.17.1` (2026-10-07), then `v1.17.0`, `v1.16.13` | `GET /repos/bootc-dev/bootc/releases` |
| `digest.rs`, `ukify.rs`, `cli.rs` in v1.17.1 vs main | byte-identical | `diff` of tarballs |
| `boot.rs` in v1.17.1 vs main | differs (not analyzed in full) | `diff` |
| composefs-rs pin (bootc `Cargo.toml:48`, `Cargo.lock:782-784`) | `v0.9.2`, commit `f720d6c79ac6b082fb1e182eed3b291f88e2a7f4`, same in v1.17.1 | `composefs-ctl = { git = ..., tag = "v0.9.2" }` |
| Local source | `session/subagent/composefs-matrix/C/src/` (bootc), `session/subagent/composefs-matrix/C/composefs-rs/` (composefs-rs f720d6c) | |

Caveat: `src/.bootc-dev-infra-commit.txt` contains `0c34c5b…`. That is not a bootc commit, so I ignored it.
Caveat: the codeload extraction failed to create some symlinks (e.g. `AGENTS.md`). None are in the digest code path.

Note: `bootc container compute-composefs-digest` defaults to **EROFS V1** (`cli.rs:450`), and `ukify` embeds **both** V1 and V2 digests by default (`ukify.rs:138-158`). Any matrix must split by EROFS version.

---

## Q1. How `bootc container compute-composefs-digest <path>` is computed

**Verdict: VERIFIED-FROM-CODE.** Fully traced through composefs-rs v0.9.2 source at `f720d6c`. Nothing was executed.

### 1a. Entry point and defaults

`crates/lib/src/cli.rs:437-452` (main, `de7ae55`):
```rust
    ComputeComposefsDigest {
        /// Path to the filesystem root
        #[clap(default_value = "/target")]
        path: Utf8PathBuf,
        ...
        /// EROFS format version to use when computing the composefs digest.
        ...
        #[clap(long, default_value = "v1")]
        erofs_version: ErofsVersionArg,
    },
```
Handler, `cli.rs:2172-2185`: calls `compute_composefs_digest(&path, erofs_version.into(), write_dumpfile_to.as_deref())` and prints the hex.

### 1b. The digest function (bootc side)

`crates/lib/src/bootc_composefs/digest.rs:67-105`:
```rust
    if path.as_str() == "/" {                       // digest.rs:72
        anyhow::bail!("Cannot operate on active root filesystem; mount separate target instead");
    }
    let (_td_guard, repo) = new_temp_composefs_repo(erofs_version)?;
    let dirfd: OwnedFd = rustix::fs::open( path.as_std_path(), ... O_DIRECTORY ...)?;
    let mut fs = composefs::fs::read_container_root(
        dirfd,
        std::path::PathBuf::from("."),
        Some(repo.clone()),
        &composefs::generic_tree::OciTransformOptions::default(),
    ).await.context("Reading container root")?;     // digest.rs:85-92
    fs.transform_for_boot(&repo).context("Preparing for boot")?;   // digest.rs:93
    let id = fs.compute_image_id(erofs_version);     // digest.rs:94
    let digest = id.to_hex();                        // digest.rs:95
```
Repo config, `digest.rs:42-43`: `RepositoryConfig::new(Algorithm::SHA512).set_insecure();` and `config.erofs_formats = FormatConfig::single(erofs_version);`

So bootc itself does **no** path filtering. Everything below is in composefs-rs.

### 1c. Path inclusion and exclusion (composefs-rs `f720d6c`)

**Read step.** `crates/composefs/src/fs.rs:937-948`:
```rust
pub async fn read_container_root<ObjectID: FsVerityHashValue>(...) -> Result<FileSystem<ObjectID>> {
    let mut fs = read_filesystem(dirfd, path, repo).await...;
    fs.transform_for_oci(options)?;
    Ok(fs)
}
```
`read_filesystem_impl` (`fs.rs:807+`) walks the directory. I found no name-based exclusions there. It records `st_dev` (`fs.rs:578`, `608`) but I did not confirm whether `st_dev` affects mount-crossing. Treat "mount points are traversed" as HYPOTHESIS.

**OCI transform step.** `crates/composefs/src/generic_tree.rs:971-984`:
```rust
    pub fn transform_for_oci(&mut self, options: &OciTransformOptions) -> Result<(), ImageError> {
        self.copy_root_metadata_from_usr()?;
        self.canonicalize_run()?;
        match options.xattrs {
            XattrFiltering::AllowlistOnly => self.filter_xattrs(is_allowed_container_xattr),
            XattrFiltering::KeepUserXattrs => self.filter_xattrs(|name| {
                is_allowed_container_xattr(name) || name.as_encoded_bytes().starts_with(b"user.")
            }),
        }
        self.compact();
        Ok(())
    }
```
- `generic_tree.rs:25`: `pub const CONTAINER_XATTR_ALLOWLIST: &[&str] = &["security.capability"];`
- `generic_tree.rs:58-65` (default mode): `/// This is the historical default. It can cause composefs digest mismatches when legitimate \`user.*\` xattrs present in an image are stripped by one composefs-rs version but not another.` followed by `#[default] AllowlistOnly,`. **The default is AllowlistOnly.** Note that `security.selinux` is therefore stripped here and re-added later by selabel.
- `generic_tree.rs:837-856` `copy_root_metadata_from_usr`: root gets `/usr`'s `st_mode`, `st_uid`, `st_gid`, `st_mtim_sec`, **`st_mtim_nsec`**, and xattrs.
- `generic_tree.rs:936-945` `canonicalize_run`: if `/run` exists, `run_dir.stat.st_mtim_sec = usr.st_mtim_sec; run_dir.stat.st_mtim_nsec = usr.st_mtim_nsec; run_dir.clear();`. So `/run` contents are dropped, and its mtime (sec and nsec) is normalized.

**Boot transform step.** `crates/composefs-boot/src/lib.rs:46` and `49-59`:
```rust
const REQUIRED_TOPLEVEL_TO_EMPTY_DIRS: &[&str] = &["boot", "sysroot"];
fn empty_toplevel_dirs<ObjectID: FsVerityHashValue>(fs: &mut FileSystem<ObjectID>) -> Result<()> {
    let usr_mtime = fs.root.get_directory(OsStr::new("usr"))?.stat.st_mtim_sec;
    for d in REQUIRED_TOPLEVEL_TO_EMPTY_DIRS {
        let d = fs.root.get_directory_mut(d.as_ref())?;
        d.stat.st_mtim_sec = usr_mtime;
        d.clear();
    }
    Ok(())
}
```
`composefs-boot/src/lib.rs:101-114` `transform_for_boot`: `get_boot_resources` → `empty_toplevel_dirs` → `self.compact()` → `selabel::selabel(self, repo)`.

**Key detail:** `st_mtim_sec` is overwritten for `/boot` and `/sysroot`, but **`st_mtim_nsec` is not**. The same function sets only seconds, so this is an asymmetry.

**Summary of inclusion and exclusion (by path, verified from the code above):**

| Path | Included? | Notes |
|---|---|---|
| `/` (root dir) | yes | mode/uid/gid/mtime(sec+nsec)/xattrs copied from `/usr` |
| `/usr/**` | yes | everything, including mtimes |
| `/boot` (dir) | dir kept, **children removed** | mtime **seconds** set to `/usr` seconds; **nanoseconds kept** |
| `/sysroot` | same as `/boot` | |
| `/run` | dir kept, **contents removed** | mtime sec+nsec set from `/usr` |
| `/var`, `/tmp`, `/etc`, `/home`, `/opt`, … | yes (all contents and mtimes) | no name-based exclusion found |
| `/dev`, `/proc`, `/sys` | yes if present as dirs in the tree | no name-based exclusion found; **presence of stubs matters** |
| Xattrs | filtered to `security.capability` only (AllowlistOnly default); selabel re-adds `security.selinux` | |

**Mode, uid, gid, mtime, xattrs:**
- Included, per `writer.rs` (EROFS serialization, `crates/composefs/src/erofs/writer.rs`):
  - mode: `inode_mode()` = `file_type() | st_mode` (`writer.rs:838-840`, `1115`)
  - uid/gid: `writer.rs:1119-1120` (extended header); `1092-1093` (compact, u16)
  - mtime seconds: `writer.rs:1121`: `mtime: (self.stat.st_mtim_sec as u64).into(),`
  - mtime nanoseconds: `writer.rs:1106-1111`: `// Epoch2 does not store sub-second mtime precision (mtime_nsec=0). // Epoch1 (V0/V1) preserves full nanosecond precision.` with `FormatEpoch::Epoch1 => self.stat.st_mtim_nsec, FormatEpoch::Epoch2 => 0,`
  - xattrs: `writer.rs:1128` `self.xattrs.write(output, version);`
  - inode numbers: V1 uses BFS index, V2 uses NID (`writer.rs:1099-1104`), so tree shape feeds the digest too.

**V1 vs V2 mtime handling (the critical difference):**

- V1 (`FormatEpoch::Epoch1`): `writer.rs:986-988`
  ```rust
        // V1: compact inodes when possible; V2: always extended
        let use_compact =
            version.epoch() == FormatEpoch::Epoch1 && self.fits_in_compact(min_mtime, size, nlink);
  ```
  `writer.rs:848-856` (`fits_in_compact`): compact only if `st_mtim_sec` **and** `st_mtim_nsec` equal the image-wide `min_mtime`.
  `writer.rs:1784-1787`: `// Epoch1 (V0/V1) uses minimum mtime for reproducibility; Epoch2 (V2) uses 0.` → superblock `build_time` = `min_mtime` for V1, `(0,0)` for V2.
  `writer.rs:1998-2009` `calculate_min_mtime` = lexicographic min of `(st_mtim_sec, st_mtim_nsec)` over **all** inodes; called at `writer.rs:2133`.
- V2 (`FormatEpoch::Epoch2`): always extended inodes, nsec always 0, `build_time` = 0.

**Verdict on the `/boot` question, derived from the code:**
1. Children of `/boot` cannot affect the digest, because `clear()` removes them before serialization (`composefs-boot/src/lib.rs:55`).
2. `/boot`'s own **mtime seconds** cannot affect the digest, because they are overwritten with `/usr`'s seconds (`lib.rs:50, 54`).
3. `/boot`'s own **mtime nanoseconds can** affect the digest under V1. They are not overwritten, and V1 writes them into `/boot`'s extended inode (`writer.rs:1109`). `/boot` is only compact if its `(sec, nsec)` equals the global minimum, which is unlikely.
4. `/boot`'s nanoseconds also participate in the global `min_mtime` (`writer.rs:2001`). If `usr_sec` is the image's earliest second and `/boot`'s nsec is the lowest at that second, it changes `build_time` and therefore every compact/extended decision in the image.
5. Under V2, nsec is zeroed and seconds are normalized. **V2 should be insensitive to `/boot`'s mtime entirely.**

So the user's evidence ("/boot directory mtime affects digest, children don't") is **consistent with the V1 nanosecond path**, not with seconds. This is **inference from code, not an observed test**. Verdict: VERIFIED-FROM-CODE for each mechanism, HYPOTHESIS for it being the cause of the observed mismatch.

**Implications for the matrix:**
- Split variants by EROFS version (V1 vs V2). V2 digests should be invariant to `/boot` mtime changes, and V1 digests should not be.
- Test `/boot` mtime changes with the **same second and different nanoseconds** (expect V1 change only), and with a **different second** (expect no change in either version). Use `touch -d '@<sec>.<nsec>' /rootfs/boot` (fractional `touch -d` is GNU). Also test that changing a child of `/boot` has no effect.
- Test `/usr` nanoseconds, since they set the normalized `/boot` seconds and the root mtime.
- Test any file's nanoseconds in V1. Every non-minimum inode serializes its nsec, so the V1 digest depends on nanoseconds nearly everywhere (`writer.rs:1109`), not just on `/boot`.

---

## Q2. How `bootc install to-filesystem` computes the expected digest it checks the UKI against

**Verdict: VERIFIED-FROM-CODE for the source of the expected digest (OCI image layers, not the target directory). HYPOTHESIS for the exact call chain from `install to-filesystem`.**

### 2a. The expected value is computed from the OCI image, not from `/target`

`crates/lib/src/bootc_composefs/repo.rs:325-368` `prepare_boot_image` (main `de7ae55`):
```rust
/// ... Keeping this sequence next to the pull paths is important: install and
/// update must not independently generate images or recover a different digest.
pub(crate) fn prepare_boot_image(repo, pull_result) -> Result<BootImage> {
    let generated_id = composefs_oci::generate_boot_image(          // repo.rs:333
        repo,
        &pull_result.manifest_digest,
        &composefs_oci::OciTransformOptions::default(),
    )...;
    let fs = create_composefs_filesystem(                          // repo.rs:340
        &**repo,
        &pull_result.config_digest,
        Some(&pull_result.config_verity),
        &composefs_oci::OciTransformOptions::default(),
    )...;
    let entries = get_boot_resources(&fs, &**repo)...;             // repo.rs:348
    let expected_ids = expected_boot_image_ids(..., &generated_id, repo.erofs_version()); // repo.rs:352-357
    let recovered = print_uki_dumpfile_diff_on_mismatch(
        ensure_correct_composefs_digest(repo, &pull_result.manifest_digest, generated_id, expected_ids, &entries),
        repo, &fs,
    )?;                                                            // repo.rs:358-368
```
So the **computed** value comes from the **OCI manifest and layers** in the composefs repo (`generate_boot_image` / `create_composefs_filesystem` take the config digest). The **expected** value is read from the **UKI in the image's own `/boot/EFI/Linux`**, via `get_boot_resources`.

### 2b. Comparison logic

`crates/lib/src/bootc_composefs/boot.rs:1467-1497` `find_expected_composefs_digest`: finds the `PEType::Uki` entry and parses its kernel cmdline into `candidates` (`parse_uki_composefs_candidates`).

`boot.rs:1508-1527` `ensure_correct_composefs_digest`:
```rust
/// Validates that the freshly-generated boot image digest `computed_id`
/// matches what's embedded in the UKI (if any), and if not, searches for an
/// [`composefs_oci::XattrFiltering`] mode whose boot image digest does match
/// via [`composefs_oci::find_matching_boot_image`], before giving up.
///
/// This handles images built with older (or newer) composefs-rs tooling
/// that computed their embedded UKI digest using a different default xattr
/// filtering mode or EROFS format than the one bootc's own build used.
pub(crate) fn ensure_correct_composefs_digest(...) -> Result<RecoveredBootImage> {
    ...
    reconcile_uki_candidates(&expected, expected_ids, |digest| {
        composefs_oci::find_matching_boot_image(repo, manifest_digest, digest)
    })
}
```
Error text when they disagree, `boot.rs:168` and `175`:
- `"The UKI has the wrong composefs= parameter (is '{actual}', should be '{expected}')"`
- `"The UKI '{uki_name}' embedded composefs= digest ({actual:?}) doesn't match any of ..."`

**Important:** bootc already has a fallback that retries other `XattrFiltering` modes (`boot.rs:1500-1506`). Any mismatch must survive that fallback to fail install.

### 2c. Shared install/update path

`repo.rs:327-328`: "install and update must not independently generate images or recover a different digest." `prepare_boot_image` is called from `boot.rs:2125` and `repo.rs:603`. The `install to-filesystem` entry is `install.rs:2667` (`install_to_filesystem`) → `install.rs:2176` (`install_to_filesystem_impl`). **I did not trace the full call chain from `install_to_filesystem_impl` to `boot.rs:2125`.** Verdict: HYPOTHESIS for the exact path, VERIFIED for the shared function.

**Implications for the matrix:**
- The two sides use **different digest sources**: the build side hashes an **on-disk tree** (`/target`, real `stat` with nanoseconds), and the install side hashes **OCI layer tar entries**. Any nanosecond difference between those representations is a candidate root cause (see Q3 and Q4).
- The install side uses `repo.erofs_version()` (`repo.rs:356`), so the EROFS version on the installer host also matters.

---

## Q3. Where `bootc container ukify` must run in a container build, and does the documentation recommend a stage

**Verdict: DOCUMENTED** (`docs/src/building/bootc-sealed-images.7.md:53-102`) **+ VERIFIED-FROM-CODE** for what ukify measures (`ukify.rs:134-180`).

### 3a. The documented pattern (main `de7ae55`)

`docs/src/building/bootc-sealed-images.7.md:53-55`:
> ### Build Pattern: Split the Kernel, Then Generate the UKI in a Separate Stage
> Building a sealed image involves three stages: build the rootfs, split the kernel and initramfs out of it, and generate the signed UKI from the split rootfs in a tools stage:

Stages (`:57-96`):
```dockerfile
FROM <base-image> as rootfs
RUN apt|dnf|zypper install ... && bootc container lint --fatal-warnings
FROM rootfs as split
RUN mkdir /kernel && bootc container split-kernel-and-rootfs --rootfs / --output /kernel
FROM <tools-image> as sealed-uki
RUN --mount=type=bind,from=split,target=/target \
    --mount=type=bind,from=split,source=/kernel,target=/kernel \
    --mount=type=secret,id=secureboot_key \
    --mount=type=secret,id=secureboot_cert <<EORUN
...
bootc container ukify \
  --rootfs /target \
  --kernel-dir "/kernel/${kver}" \
  -- \
  --output "/out/${kver}.efi" \
  --signtool sbsign ...
EORUN
# Final image: the split rootfs (kernel/initramfs already removed) plus the signed UKI
FROM split
COPY --from=sealed-uki /out/*.efi /boot/EFI/Linux/
```

Doc text, `:79-82`: "`bootc container ukify` computes the composefs digest of /target, reads extra kernel arguments from /target/usr/lib/bootc/kargs.d, and invokes the real `ukify` binary with the digest embedded in the cmdline."

Doc text, `:110`: "This is the recommended way to build a UKI for a bootc image. It computes the composefs digest of `--rootfs`...".

Code, `ukify.rs:134-143` and `168-180`: the digest is computed from `rootfs` (`compute_composefs_digest(rootfs, erofs_version, ...)`), `cmd.current_dir(rootfs)`, `--os-release @usr/lib/os-release`.

### 3b. Consequence for `/boot` (the crucial implication)

The UKI is measured against the **`split` stage tree** (bind-mounted at `/target`), but the **final image** is `FROM split` plus `COPY --from=sealed-uki /out/*.efi /boot/EFI/Linux/`.

- Measured tree (what ukify digests): `split` stage, with `/boot` as it exists there.
- Final image (what install digests from OCI layers): `split` plus a new `/boot/EFI/Linux/*.efi` layer.
- The `COPY` creates `/boot/EFI` and so **modifies `/boot`'s mtime**, which the layer records. Children are cleared before hashing, so the `.efi` files don't matter, but **`/boot`'s own nanoseconds do** (Q1, V1).

This pattern alone gives the two sides different `/boot` mtime values. Under V2 the difference cannot matter. Under V1 it can, through `/boot`'s nsec and through the global min. **This is the strongest candidate for the reported mismatch.** Verdict: HYPOTHESIS (it fits the code and the user's observation, but I have not reproduced it).

**Implications for the matrix:**
- Variant families to test: (a) ukify run on the split stage (docs pattern) vs on the final stage; (b) `COPY` into `/boot` before vs after ukify; (c) V1 vs V2 digest; (d) tree produced by podman vs buildah (see Q4, #2194).

---

## Q4. Known issues or PRs about composefs digest sensitivity to `/boot` or directory mtimes

**Verdict: HYPOTHESIS (no issue or PR found that states the `/boot`-mtime or nanosecond mechanism directly).** Searched 11 queries via GitHub search (issues, PRs, both repos). I read the top results only. I did not page further.

Relevant items (open unless stated):

| Item | Title (abridged) | Relevance |
|---|---|---|
| bootc #2194 (open, 2026-07-11) | "Composefs mismatch when built with buildah Github action, but not when built locally via podman" | Build-tool dependence. Consistent with on-disk metadata differences. Not diagnosed in the thread I read. |
| bootc #2334 (open, 2026-08-12) | "Error during upgrade w/ composefs-backend and UKI since 1.16.4: composefs= parameter mismatch" | Same error class. Reporter attributes it to xattr filtering changes (matches the AllowlistOnly comment at `generic_tree.rs:61-63`). |
| bootc #2027 (open) | "Integration tests for composefs UKI" | Suggests no existing test covers digest stability. |
| bootc #1498 (open) | "Sealed image build UX + implementation" | Design context for the docs pattern. |
| bootc #2571 (open PR, 2026-10-17) | "ostree-ext: override root dir metadata on merge commit" | Adjacent: root directory metadata. Not composefs. Not read in full. |
| composefs-rs #132 (closed) | "Incorrect `mtime` when generating EROFS from OCI image" | Directory mtime derived from tar entries (the issue says "latest modification time for a directory"). This is the OCI-side directory mtime path. Resolution not read. |
| composefs-rs #290 (closed) | "`Layer has incorrect checksum` with Ubuntu 26.04 — PAX tar format not round-tripped" | PAX sub-second mtimes in layers (`pax_headers={'mtime': '…'}`). Directly relevant to nanoseconds on the OCI side. |
| composefs-rs #131 (open) | "Where to place the UKI in the container or ignoring specific path when building the composefs image" | Relevant to whether `/boot` (and UKI placement) is excluded. |

**Implications for the matrix:**
- Look for PAX sub-second mtimes in the layers (composefs #290), because they determine whether the OCI-side nanoseconds are zero or not.
- Test podman vs buildah producers (#2194).
- Test AllowlistOnly vs KeepUserXattrs (#2334). The reconciliation in `boot.rs:1500-1526` tries other modes, so a mode mismatch can be recovered.

---

## Answers to the lane questions, summarized

1. **Q1 (compute-composefs-digest):** VERIFIED-FROM-CODE. Hashes the on-disk tree after `transform_for_oci` (xattr allowlist, `/run` cleared, root metadata from `/usr`) and `transform_for_boot` (`/boot` and `/sysroot` children cleared, their mtime seconds normalized, nanoseconds not). Mode, uid, gid, mtime (V1: sec + nsec; V2: sec only), xattrs, and tree shape are all hashed. `/var`, `/tmp`, `/dev`, `/proc`, `/sys` are **not** excluded by name.
2. **Q2 (install expected digest):** VERIFIED-FROM-CODE that the computed value comes from the OCI image layers, and the expected value comes from the UKI embedded in the image's own `/boot/EFI/Linux`. HYPOTHESIS for the exact `install to-filesystem` call chain.
3. **Q3 (ukify placement):** DOCUMENTED. A separate `tools` stage bind-mounts the `split` stage at `/target`, then `FROM split` copies the UKI into `/boot/EFI/Linux`. This makes the measured tree and the final image differ in `/boot`'s mtime. HYPOTHESIS that this causes the observed mismatch.
4. **Q4 (issues):** HYPOTHESIS. No direct match. Related: bootc #2194, #2334, composefs-rs #132, #290, #131.

## Matrix implications (ranked)

1. **V1 vs V2 EROFS** (highest). V1 digests depend on nanoseconds and the global min mtime. V2 digests depend only on seconds. Expect `/boot` nsec changes to break only the V1 karg. ukify embeds both by default, so check which karg fails.
2. **Digest source: on-disk tree vs OCI layers** (highest). The build side hashes `stat` with nanoseconds, the install side hashes tar headers. Variant: `COPY` into `/boot` after ukify (docs pattern) vs before.
3. **`/boot` and `/sysroot` nanoseconds** (high). Same second, different nsec: expect V1 change. Different second: expect no change in either version. Child changes: expect no change.
4. **Any file's nanoseconds under V1** (medium-high). Non-minimum inodes serialize their nsec, and `min_mtime` can shift the layout.
5. **PAX sub-second layer mtimes** (medium). Changes OCI-side nanoseconds (composefs #290).
6. **Xattr mode** (medium). AllowlistOnly default vs KeepUserXattrs. Reconciled by `boot.rs:1500-1526`.
7. **Presence of `/dev`, `/proc`, `/sys`, `/var`, `/tmp` stubs** (medium). Included by the code. Build tools can leave stubs that OCI layers do not have.

## What I could not verify

- The bootc version inside `quay.io/fedora/fedora-bootc:45`. I did not pull or run the image, as instructed. Check it with `rpm -q bootc` in a container, or the Fedora package history, in a separate lane.
- That the bootc main tarball I grepped equals `de7ae55` exactly. The API head was read ~3 minutes after the tarball fetch, and I did not record the tarball's SHA.
- The exact `install to-filesystem` call path from `install.rs:2176` to `boot.rs:2125`.
- `read_filesystem_impl` mount-boundary behavior (whether `/dev`, `/proc`, `/sys` mounts inside `/target` are traversed).
- The `selabel` details (which policy it reads and which xattrs it writes).
- Whether `reconcile_uki_candidates` (`boot.rs:1529-1600`) accepts a match on one of the two karg versions when the other differs.
- Whether the OCI layer mtimes carry nanoseconds for the affected files. This needs `tar -tvf --full-time` on the layers of the failing image, or a PAX check on the layer tar.
- Any behavior at runtime. Everything above is source-level. The matrix needs local experiments: build a small tree, vary `/boot` seconds and nanoseconds with `touch -d '@S.N'`, and run `compute-composefs-digest --erofs-version=v1|v2`, using a bootc binary built from source in the matrix environment.

## Five-line verdict summary

1. **Q1 VERIFIED-FROM-CODE:** `/boot` children are cleared and its mtime *seconds* are set to `/usr`'s, but its *nanoseconds* are kept. V1 EROFS hashes nanoseconds and a global min-mtime; V2 hashes seconds only.
2. **Q2 VERIFIED-FROM-CODE (partly):** install's expected digest comes from the OCI layers via `generate_boot_image`, compared against the UKI cmdline in the image's own `/boot/EFI/Linux` (`repo.rs:333-368`, `boot.rs:1508-1527`). Exact CLI call chain is HYPOTHESIS.
3. **Q3 DOCUMENTED:** `bootc-sealed-images.7.md` runs ukify on a bind-mounted `split` stage, then `FROM split` plus `COPY` into `/boot/EFI/Linux`. That leaves `/boot`'s mtime different between the measured tree and the final image. Strongest candidate for the mismatch (HYPOTHESIS).
4. **Q4 HYPOTHESIS:** no issue explicitly describes `/boot`-mtime sensitivity. Related: bootc #2194, #2334; composefs-rs #132, #290, #131.
5. **Matrix:** split on EROFS V1 vs V2 first. The user's `/boot`-mtime evidence fits V1 nanoseconds, not seconds. V2 should be immune to `/boot` mtime. Verify with the `touch -d '@S.N'` experiment before concluding.
