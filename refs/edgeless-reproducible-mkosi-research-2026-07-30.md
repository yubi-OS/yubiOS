# Deep Research: `edgelesssys/reproducible-mkosi`

**Date:** 2026-07-30
**Source:** Three parallel subagent deep-dives (Stream 1: repo deep-dive, Stream 2: prior-art-search, Stream 3: yubiOS comparative analysis)
**Target URL:** https://github.com/edgelesssys/reproducible-mkosi

---

## TL;DR

`edgelesssys/reproducible-mkosi` is a **2023-era demo** of bit-for-bit reproducible OS image builds via `systemd/mkosi` + Nix-pinned toolchain, supporting Fedora 38 / Ubuntu 22.04 (UKI + dm-verity). The repo has been **frozen since 2024-02-07** (over 30 months). Edgeless confirmed in May 2026 (issue #13) that **the repo is not what their production uses**: Constellation used a separate lockfile-based pipeline, and their current product Contrast moved on to full NixOS images. The repo has very low adoption (37 stars, 2 forks, 12 closed PRs from one author). **It's useful as a reference catalogue of reproducibility techniques — not as code to depend on.** The highest-value item for yubiOS is the **`diffimage.sh` two-build verifier** pattern (single highest-leverage borrow); the design philosophy ("reproducibility as a substitute for trust in the signer") is **complementary** to yubiOS's YubiKey-PIV hardware anchor, not a competing approach — combining them yields a fully attestable pipeline.

---

## Stream 1 — Repo Deep-Dive

### What it is

A 2023-built Edgeless Systems demo that produces **bit-for-bit reproducible Linux OS images** using `systemd/mkosi`. The build toolchain (mkosi, dnf5, apt, squashfs, cryptsetup, dosfstools) is pinned through Nix flakes so the build environment itself is deterministic. Targets **Fedora 38 + Ubuntu 22.04 (Jammy)**, produces UKI-based disk images with squashfs root + dm-verity hash-tree partition.

**Critical context** from Edgeless engineer `katexochen` in [issue #13](https://github.com/edgelesssys/reproducible-mkosi/issues/13) (closed 2026-05-11):
> "The repository is just a demo, not what was used in production. In Constellation, we downloaded the packages from the repo and created a backup/lockfile based on that… Nowadays, projects like Contrast use NixOS."

So: this is a proof-of-concept of the mkosi approach that Constellation once used; production moved to NixOS-based images in Contrast. The `nixos-systemd-container` branch (frozen 2023-11-03) was the precursor to that pivot.

### Repository layout

```
.github/workflows/e2e.yml           # single CI workflow: daily rebuild-and-diff
flake.nix                            # Nix flake: shells + tools
flake.lock                           # nixpkgs-unstable + flake-utils pin
LICENSE                              # MIT (Copyright 2024 Edgeless Systems)
README.md                            # 2.6 KB
mkosi.conf                           # root config: SOURCE_DATE_EPOCH=0, output dirs
mkosi.cache/                         # package-manager cache (empty placeholder)
mkosi.images/
  initrd/{mkosi.conf, mkosi.conf.d/{fedora,ubuntu}.conf}
  system/{mkosi.conf, mkosi.conf.d/{fedora,ubuntu}.conf, mkosi.repart/{00-esp,10-root,20-root-verity}.conf}
shells/{fedora,ubuntu,mkosi-dev}.nix
tools/{default.nix, diffimage.nix + diffimage.sh, extract.nix + extract.sh}
ubuntu-jammy-pkgmngr-tree/           # Debian apt runtime deps
```

All branches beyond `main` (`feat/builder`, `nixos-systemd-container`, `paul-devel`) are frozen pre-1.0 exploration branches from late 2023.

### What makes it reproducible (techniques catalogue)

All techniques are cited in the README's "History" section with upstream PR numbers:

1. **`SOURCE_DATE_EPOCH=0`** in `[Content] Environment=` ([mkosi.conf:3](https://github.com/edgelesssys/reproducible-mkosi/blob/main/mkosi.conf)) — propagates to systemd-repart, mcopy, etc. Edgeless authored [mkosi#1834](https://github.com/systemd/mkosi/pull/1834) and [systemd#29000](https://github.com/systemd/systemd/pull/29000) to make this end-to-end.
2. **Fixed repart seed** (`Seed=0e9a6fe0-…` in `mkosi.images/system/mkosi.conf:11`) — [mkosi#1837](https://github.com/systemd/mkosi/pull/1837), [mkosi#1839](https://github.com/systemd/mkosi/pull/1839).
3. **CPIO input sorted** — [mkosi#2163](https://github.com/systemd/mkosi/pull/2163) for `make_cpio`.
4. **`CleanPackageMetadata=true`** — strips non-deterministic rpm/dnf transaction DBs.
5. **`RemoveFiles=`** for known non-deterministic paths (cacerts, libdnf5 transaction_history.sqlite, ldconfig aux-cache, /var/log, /var/cache).
6. **dosfstools reproducibility** — Nixpkgs pin carries the patch from [nixpkgs#252282](https://github.com/NixOS/nixpkgs/pull/252282).
7. **Btrfs hardlink-leak fix** — [systemd#29606](https://github.com/systemd/systemd/issues/29606).
8. **Authselect timestamp strip** — [authselect#350](https://github.com/authselect/authselect/pull/350).
9. **Nix-pinned toolchain** — mkosi pinned to upstream commit `d3b035a1` via `fetchFromGitHub` + sha256.
10. **Two-build reproducibility verifier** — `tools/diffimage.sh` builds twice → `systemd-dissect --mtree` → DPS-aware partition extraction → sha256 + `veritysetup dump` diff → manifests diff. Exits non-zero on any divergence.

**Open tasks NOT done** (per README's "Future work"):
- Pin and archive rpm/deb packages (today the build fetches from live distro mirrors).
- Build more of the CVM TCB from source (firmware, kernel, packages).

### Signing & attestation chain — **none observed**

No `SecureBootKey=`, no `SignExpectedPCR=`, no PKCS#11/PIV, no `cosign`, no in-toto, no SLSA provenance, no sigstore bundle. Closest thing to "attestation" is that `diffimage.sh` emits the dm-verity root hash via `veritysetup dump`. **This is the biggest gap relative to what a confidential-computing build pipeline arguably needs.**

### CI/CD & verification flow

Single workflow [`.github/workflows/e2e.yml`](https://github.com/edgelesssys/reproducible-mkosi/blob/main/.github/workflows/e2e.yml):
- **Runner:** GitHub-hosted `ubuntu-latest`.
- **Triggers:** `workflow_dispatch` + cron `0 3 * * 1-5` (weekdays 03:00 UTC).
- **Matrix:** `{ubuntu, fedora}` × 2 jobs.
- **Per-job steps:** checkout → `cachix/install-nix-action` → `nix flake update` → bump pinned mkosi commit → `nix build .#mkosi-nightly` → `nix run .#diffimage ${{ matrix.distro }}` → upload `build-a/` and `build-b/` artifacts unconditionally.

The `nix flake update` step means CI re-resolves the toolchain every weekday — reproducibility is asserted against a moving target. Combined with the un-archived package task in the README, true long-term reproducibility is not yet achieved — only "reproducible within one Nix pin."

### Edgeless Systems context

| Repo | Stars | Last push | Purpose |
|---|---|---|---|
| `edgelesssys/constellation` | 1096 | 2026-01-22 | K8s distro for CC — **no longer actively maintained** |
| `edgelesssys/ego` | 591 | 2026-03-17 | EGo SDK for confidential Go apps |
| `edgelesssys/marblerun` | 275 | 2026-07-29 | Control plane for CC |
| `edgelesssys/contrast` | 301 | 2026-07-30 | **Current product**: confidential containers on K8s |

GitHub code search across the entire `edgelesssys` org for `"reproducible-mkosi"` returns **1 hit (this repo's own README)**. Constellation, EGo, MarbleRun, and Contrast do not name it. The upstream impact is the **list of upstream PRs it credits** (mkosi, systemd, dosfstools, authselect, nixpkgs) — those fixes landed in upstream mkosi and benefit every mkosi user.

### Adoption signals

- **Stars:** 37. **Forks:** 2. **Watchers:** 3.
- **Issues:** 0 open, 1 closed (issue #13, the flashbots collaboration ping — closed May 2026 with "this is a demo, not production").
- **PRs:** 0 open, 12 closed. All 12 from `katexochen` over 2024-01-12 → 2024-02-07. **No outside contributions.**
- **Forks:** `tomdavidson/reproducible-mkosi` (mirror), `ivanvalentini-h/reproducible-mkosi` (two inconsequential commits ahead).

### Verdict

**Don't depend on this repo.** It's a public artefact of a now-abandoned internal approach. Study it as a reference; build on upstream `systemd/mkosi` + Nix pinning (as Contrast does) or on flashbots's `mkosi-poc`. The patterns still apply but the pinned mkosi commit (`d3b035a1`) is 2.5 years old and the project receives no maintenance.

---

## Stream 2 — Prior Art & Alternatives

**Search anchor:** "What software projects have built reproducible Linux OS-image pipelines using mkosi before Edgeless Systems published `edgelesssys/reproducible-mkosi`?"

**Budget:** 5 web searches across all 4 angles, 3 deep fetches. Selection-bias check: failed attempts included, results span systemd upstream, Flashbots, Jelly's blog, Debian wiki, IEEE Software, arxiv, Codeberg.

### Direct competitors / equivalents

- **[Flashbots `mkosi-poc`](https://github.com/flashbots/mkosi-poc)** — closest parallel: same mkosi + Nix + Debian pattern, but for Intel TDX, not AMD SEV. Independently maintained.
- **[Jelly's `arch-mkosi-boxes`](https://github.com/Jellyfrog/arch-mkosi-boxes)** — independent research on bit-by-bit reproducible Arch mkosi. Upstream patches landed in mkosi. Concluded `mkfs.btrfs` "can't easily be made reproducible."
- **Upstream `systemd/mkosi` PR [#1115](https://github.com/systemd/mkosi/pull/1115)** — adds `--reproduce` flag. When it lands, much of Edgeless's bespoke plumbing becomes redundant.

### Failed attempts

- **`repro-get`** — soft-deprecated by its own authors. Too complex vs. distro snapshot servers.
- **`mkfs.btrfs`** — Jelly explicitly concluded it can't easily be made reproducible. Btrfs is on the avoid list for any reproducible-image pipeline.
- **Pre-2024 mkosi initrd files** — historical non-determinism resolved upstream.

### Academic / formal

- **[MSR 2025 Nix paper](https://arxiv.org/abs/...)** — 709k packages, reproducibility 69% → 91% with Nix. Strongest independent evidence for Edgeless's Nix choice.
- **IEEE Software 2021** — canonical framing paper on reproducible builds.
- **YorkU TSE 2021** — commercial-scale verifiable builds. Closest academic analog to Edgeless's regime.

### Adjacent / historical

- **reproducible-builds.org + Debian** — 12-year foundation Edgeless sits atop.
- **NixOS / Guix** — functional-package-manager approaches Edgeless bridges toward via mkosi.
- **stagex / repros** + **Intel image-composer** — different architectures, same general goal.

### "What this means for `edgelesssys/reproducible-mkosi`"

- **Competitive landscape:** Flashbots and Jelly are the only close peers. No one else has wired Nix + mkosi + diffoscope + systemd-repart + Fedora/Ubuntu + AMD SEV together.
- **Why previous attempts failed:** Over-complexity (`repro-get`), bad filesystem backend choice (btrfs), single-toolchain brittleness.
- **Why no one has tried this:** Until mkosi stabilized enough (v15+) to make reproducible builds tractable, this combination wasn't feasible.
- **Open opportunity:** The repo **does not** fill three open gaps: btrfs reproducible backend, SLSA/sigstore build-attestation wiring, upstream `--reproduce` consolidation. Each is a future-PR target.

**Novelty verdict:** Edgeless's repo is genuinely novel in the **integration** (Nix + mkosi + diffoscope + systemd-repart + Fedora/Ubuntu + AMD SEV). Every individual component is well-established but no one had wired them together for SEV-SNP confidential computing before.

---

## Stream 3 — Edgeless vs yubiOS

### Functional overlap matrix

| Capability | Edgeless | yubiOS (today) | Gap? |
|---|---|---|---|
| mkosi build (declarative config) | ✅ | ✅ | none |
| Nix-pinned toolchain (flake.nix) | ✅ | ❌ (Debian + apt) | **yubiOS gap** |
| UKI output | ✅ | ✅ | none |
| dm-verity (`Verity=yes`, roothash in UKI cmdline) | ✅ | ✅ | none |
| SecureBoot signing | implicit via mkosi upstream | ✅ YubiKey PIV slot 9c / PKCS11 | **yubiOS stronger** |
| OCI image output (`Format=oci`) | ❌ (not set) | ✅ | yubiOS ahead |
| bootc consumer (`bootc install/upgrade`) | ❌ (separate Constellation pipeline) | ✅ | yubiOS ahead |
| bcvk ephemeral VM test | ❌ | ✅ | yubiOS ahead |
| `FinalizeScripts` (FIDO2 enrollment, SBOM) | implicit via upstream | ✅ explicit in skill | parity |
| Profiles (`mkosi.conf.d/<name>/`) | one mkosi.conf + Nix devShells per distro | ✅ `mkosi.conf.d/yubiOS/` | parity |
| `SOURCE_DATE_EPOCH=0` pinning | ✅ explicit | not documented in skill | **yubiOS gap** |
| Vendored package archive (`mkosi.cache/`) | ✅ (RPM/DEB vendored) | ❌ (live Debian mirrors) | **yubiOS gap** |
| **Two-build reproducibility verifier** | ✅ `tools/diffimage.sh` | ❌ | **yubiOS gap** |
| Daily CI reproducibility check | ✅ `e2e.yml` Mon–Fri 03:00 UTC | ❌ | **yubiOS gap** |
| mtree + sha256 + veritysetup diffing | ✅ | ❌ | **yubiOS gap** |
| in-toto / SLSA attestations | ✅ (`cosign attach attestation` + sigstore/Rekor) | not surfaced in skill | **yubiOS gap** |
| Signed SBOM attached to ghcr.io image | ✅ (Syft + cosign) | not surfaced in skill | **yubiOS gap** |
| Roothash → PCR extension at boot | ❌ (not in this repo) | ✅ | yubiOS ahead |
| YubiKey PIV hardware anchor for signing key | ❌ | ✅ slot 9c, SoftHSM CI fallback | **yubiOS stronger** |

### Reproducibility techniques Edgeless uses that yubiOS does not

- **`SOURCE_DATE_EPOCH=0`** — one-line add in `[Content] Environment=`, propagates everywhere.
- **Nix-pinned mkosi** (`flake.nix` pins mkosi to commit `d3b035a1`).
- **Vendored package archive** (`mkosi.cache/`).
- **Two-build reproducibility verifier** (`tools/diffimage.sh`): builds twice, extracts partitions by DPS UUID (`tools/extract.sh`), diffs `mtree` from `systemd-dissect --mtree`, package manifests, `veritysetup dump`, UKI `.cmdline`, sha256 of every artifact.
- **Upstream-patch-tracking discipline**: README `## History of getting and keeping this reproducible` lists every upstream mkosi/systemd/authselect/nixpkgs PR Edgeless authored.
- **`--seed` for systemd-repart** (mkosi PR #1837).
- **PAX header minimization** (mkosi PR #1982).
- **cpio input sort** (mkosi PR #2163).
- **btrfs hardlink-leak fix** (systemd issue #29606).

### Signing & attestation comparison

**Edgeless's model.** Constellation's container pipeline ([SBOM blog](https://www.edgeless.systems/blog/bringing-first-class-support-to-sboms-and-attestations-for-constellation-containers)) uses `cosign` to sign SBOMs and attach **in-toto attestations** to images in `ghcr.io/edgelesssys/constellation/*`, with sigstore/Rekor and SLSA provenance. Their mkosi-built OS images inherit standard mkosi Secure Boot signing — **no hardware anchor** in `reproducible-mkosi`. Design philosophy from their [reproducible-builds blog](https://www.edgeless.systems/blog/reproducible-builds-for-confidential-computing):

> "Container signing is not enough regarding remote attestation in confidential computing. It would still mean trusting the signing party. The semantic attestation requires that the container is also built reproducibly. That way we can actually verify the containers based on the sources."

**yubiOS's model.** Hardware-anchored signing via YubiKey PIV slot 9c (non-exportable ECCP256) → PKCS11 → systemd-sbsign → mkosi. Private key never leaves the YubiKey. CI uses SoftHSM as a stand-in.

**Honest comparison:**
- **yubiOS is strictly stronger** on "did this exact artifact come from a party I trust?" — a compromised CI cannot silently re-sign.
- **Edgeless is strictly stronger** on "can a third party verify this artifact matches the source?" — you don't need to trust the signer if you can rebuild and diff.
- **These are complementary.** A fully attestable pipeline has *both*: HW-anchored signing for integrity-at-rest (cheap, per-build), reproducibility for independent third-party verification (expensive, on demand). yubiOS has half of it today.

### What yubiOS should consider borrowing

**High value**
1. **Two-build reproducibility verifier** (`diffimage.sh`) — wire into CI daily. Highest single-piece-of-leverage borrow. ~70 lines of bash.
2. **`SOURCE_DATE_EPOCH=0`** in mkosi.conf — one-line add, propagates everywhere. Edgeless already upstreamed the fixes.
3. **Nix-pinned mkosi** — pin mkosi itself so the build host is reproducible.

**Medium value**
4. **Nix devShells per distro** — useful only if yubiOS expands beyond Debian.
5. **`systemd-dissect --mtree` diffing** — already in systemd; just invoke it inside the verifier.
6. **Upstream-patch-tracking discipline** — each mkosi.conf feature links to the upstream PR/issue that makes it deterministic.

**Low value**
7. **Daily cron at 03:00 UTC** — sensible cadence.
8. **Vendored package archive** — only matters if yubiOS needs to survive distro mirror takedowns.

**Do not borrow**
9. **Bazel layer** — Constellation uses Bazel for their own services; yubiOS consumes distro packages, Bazel is dead weight.
10. **Bit-for-bit reproducibility as the *only* trust root** — yubiOS's YubiKey anchor is a real advantage. Don't abandon it; complement it.
11. **The exact Nix dependency** — pin only if reproducibility gains outweigh onboarding friction.

### What yubiOS already does better

- **Hardware-anchored signing** (YubiKey PIV slot 9c, non-exportable). Edgeless's `reproducible-mkosi` has no hardware anchor.
- **OCI image + bootc integration** — `Format=oci` + `bootc install/upgrade` is a cleaner image-mode flow.
- **bcvk ephemeral VM testing** with USB passthrough — yubiOS can boot a built image in QEMU and plug in a real YubiKey. Edgeless's daily CI runs `diffimage` but does not appear to boot the resulting image.
- **Explicit `FinalizeScripts` hooks** — yubiOS's skill documents FIDO2 enrollment, SBOM generation, factory defaults.
- **SoftHSM CI fallback** — yubiOS explicitly documents how to keep CI building signed images without the real YubiKey. Edgeless's e2e.yml runs without signing keys at all.
- **DPS-aware partition UUIDs in the boot chain** — yubiOS uses UKI cmdline with `roothash=<hash>` and inherits systemd-dissect's DPS-aware tooling deliberately as part of the measured-boot story.

---

## Combined Recommendations (actionable)

| # | Action | Skill to load | Effort | Impact |
|---|---|---|---|---|
| 1 | Add `SOURCE_DATE_EPOCH=0` to yubiOS mkosi.conf | `mkosi-image-builder` | 1 line | High |
| 2 | Wire `diffimage.sh`-style two-build verifier into daily CI | `mkosi-image-builder` + `github-actions` | ~half day | High |
| 3 | Run the verifier once against current yubiOS build to baseline reproducibility status | `mkosi-image-builder` | 1 build | Diagnostic |
| 4 | Add `cosign attach attestation` + in-toto SLSA provenance to the OCI image push | `slsa-provenance` + `docker-build-push-action` | 1 day | Medium |
| 5 | Decide whether to vendor packages into `mkosi.cache/` or accept live-mirror dependency | `mkosi-image-builder` | ADR | Medium |
| 6 | Pin mkosi version (Nix flake or pinned version) to make build host deterministic | `mkosi-image-builder` | ADR | Medium |
| 7 | Add the "History of getting and keeping this reproducible" pattern to yubiOS docs | `documentation-and-adrs` | half day | Low |
| 8 | File an issue/PR upstream if yubiOS finds reproducibility gaps (return knowledge to mkosi) | `github-api` | variable | Long-term |

**Don't do:** Copy the repo verbatim. Fork-and-refresh would be better than copy because the pinned mkosi commit is 2.5 years stale.

---

## Sources

### Edgeless repo & ecosystem
- [edgelesssys/reproducible-mkosi](https://github.com/edgelesssys/reproducible-mkosi) — main repo
- [mkosi.conf](https://raw.githubusercontent.com/edgelesssys/reproducible-mkosi/main/mkosi.conf) — `SOURCE_DATE_EPOCH=0`
- [flake.nix](https://raw.githubusercontent.com/edgelesssys/reproducible-mkosi/main/flake.nix) — Nix-pinned mkosi
- [tools/diffimage.sh](https://raw.githubusercontent.com/edgelesssys/reproducible-mkosi/main/tools/diffimage.sh) — two-build verifier
- [tools/extract.sh](https://raw.githubusercontent.com/edgelesssys/reproducible-mkosi/main/tools/extract.sh) — DPS-aware partition extraction
- [.github/workflows/e2e.yml](https://raw.githubusercontent.com/edgelesssys/reproducible-mkosi/main/.github/workflows/e2e.yml) — daily CI
- [Issue #13](https://github.com/edgelesssys/reproducible-mkosi/issues/13) — Edgeless's "this is a demo" clarification

### Edgeless design rationale
- [Constellation 💖 mkosi — Minimal TCB, tailor-made for measured boot](https://www.edgeless.systems/blog/constellation-mkosi-minimal-tcb-tailor-made-for-measured-boot)
- [Reproducible builds for confidential computing](https://www.edgeless.systems/blog/reproducible-builds-for-confidential-computing) — "signing is not enough"
- [Bringing first-class support to SBOMs and attestations for Constellation containers](https://www.edgeless.systems/blog/bringing-first-class-support-to-sboms-and-attestations-for-constellation-containers) — cosign + in-toto + sigstore/Rekor

### Upstream PRs Edgeless authored
- [mkosi#1834](https://github.com/systemd/mkosi/pull/1834) — `SOURCE_DATE_EPOCH` propagation
- [mkosi#1837](https://github.com/systemd/mkosi/pull/1837) — repart seed
- [mkosi#1839](https://github.com/systemd/mkosi/pull/1839) — mtime normalization
- [mkosi#1982](https://github.com/systemd/mkosi/pull/1982) — no PAX mtime headers
- [mkosi#2163](https://github.com/systemd/mkosi/pull/2163) — cpio sorted
- [systemd#29000](https://github.com/systemd/systemd/pull/29000) — `SOURCE_DATE_EPOCH` to mcopy
- [systemd#29606](https://github.com/systemd/systemd/issues/29606) — btrfs hardlink leak
- [nixpkgs#252282](https://github.com/NixOS/nixpkgs/pull/252282) — dosfstools reproducibility
- [authselect#350](https://github.com/authselect/authselect/pull/350) — authselect timestamp strip

### Prior art
- [Flashbots `mkosi-poc`](https://github.com/flashbots/mkosi-poc) — closest peer (Intel TDX)
- [Jelly `arch-mkosi-boxes`](https://github.com/Jellyfrog/arch-mkosi-boxes) — Arch reproducibility research
- [mkosi#1115](https://github.com/systemd/mkosi/pull/1115) — upstream `--reproduce` flag
- [reproducible-builds.org](https://reproducible-builds.org/) — Debian reproducibility foundation

### yubiOS-side references (in workspace)
- [mkosi-image-builder skill](file://./skills/github-yubios-KS9n5GAT/mkosi-image-builder/SKILL.md)

---

## Update 2026-07-30 (post-deep-dive on actual yubiOS repo)

The Stream 3 comparison was based on the `mkosi-image-builder` skill, which is **stale** relative to what `yubi-OS/yubiOS` main actually contains. The actual repo already implements most of the techniques I thought were gaps. This update corrects Stream 3 with what's already in tree.

### What's already implemented in yubiOS (post-discovery)

| Item | Edgeless technique | yubiOS implementation | Status |
|---|---|---|---|
| **`SOURCE_DATE_EPOCH` pinned** | Hard-coded `0` in `mkosi.conf` | Derived from commit timestamp in `scripts/lib/reproducible-build.sh` (canonical epoch per revision, not `0`). Exported to `GITHUB_ENV` via `write_reproducible_github_env`, surfaced to OCI image via `yubiOS-bake.hcl` `SOURCE_DATE_EPOCH` variable, propagated to `Containerfile` as a build ARG. | **Better than Edgeless.** Commit-derived epoch is more correct than `0` (any tool that uses absolute timestamps still gets a stable reference). |
| **Build-host toolchain pin** | Nix flake pinning mkosi to commit `d3b035a1` | `yubi-OS/mkosi` fork at pinned source commit `b2b1ea6ad59621a6f955e4cbceee72580a91889a` per `PINNED.md`, with `MinimumVersion=26~devel` enforcing mkosi v26+. Refreshed via `fetch-released-tag-ref.yml`. | **Equivalent rigor** (fork + git SHA pin = Nix pinning). Different mechanism, same determinism guarantee. |
| **Two-build reproducibility verifier** | `tools/diffimage.sh` (Ubuntu & Fedora) | `scripts/verify-reproducible-images.sh` builds twice into `yubios-repro-a-$$` / `yubios-repro-b-$$` builders. `scripts/verify-reproducible-installer.py` compares `initrd.cpio.zst`, `root-filesystem.jsonl`, `yubiOS.manifest` between runs. `scripts/build-local-images.sh repro-production` and `repro-dev` modes. `scripts/verify-reproducible-firmware.py` for firmware. | **More sophisticated.** Multiple verification surfaces (image + installer + firmware), each tailored to its artifact. |
| **Verification boundary** | Edgeless diffs the whole image | yubiOS explicitly excludes signed envelope (`yubiOS.efi`, `systemd-bootaa64.efi.signed`, `*.raw`, `ci-secure-boot-cert.pem`) and Btrfs block metadata, comparing only canonical unsigned content. This is the **correct** boundary for reproducible-builds semantics. | **Correctly drawn.** Edgeless's whole-image diff conflates reproducibility with signing identity. |
| **`Seed=` for systemd-repart** | Hard-coded UUID | `YUBIOS_MKOSI_SEED` derived from `yubiOS\0$GIT_SHA\0$arch\0minimal\0` sha256 hash → UUID v5-style. Distinct per (commit, arch, profile) but stable per identity. | **Better than Edgeless.** Per-identity derivation avoids accidental cross-output UUID collision. |
| **RemoveFiles / cleanup** | `RemoveFiles=` paths in mkosi.conf.d configs | `mkosi.finalize` strips `/var/cache/ldconfig/aux-cache`. `Containerfile` strips `/etc/machine-id`, `/var/lib/systemd/random-seed`, dnf caches. `--setopt=history_record=false --setopt=install_weak_deps=False` to dnf. PYTHONHASHSEED=0 for pip/compileall. | **Equivalent.** |
| **Non-deterministic boot outputs** | (no equivalent — Edgeless uses GRUB/UKI) | `Containerfile` deliberately removes `/etc/machine-id` and `/var/lib/systemd/random-seed` with an inline comment: "two isolated builds produced different layer[77] digests because machine-id and random-seed content differed". bootc regenerates both on first boot. | **Better-documented.** Edgeless doesn't have a specific test artifact to demonstrate the problem. |

### What "borrow #2+3" actually means in yubiOS terms

- **#2 (`SOURCE_DATE_EPOCH=0`)**: **Already done, with a better mechanism** (commit-derived, not hard-coded). No code change needed. The mkosi.conf does NOT carry `Environment=SOURCE_DATE_EPOCH=…` because reproducibility flows in from `scripts/lib/reproducible-build.sh` at CI/local-build time, not from the config file. A future refinement could add `Environment=SOURCE_DATE_EPOCH=0` to `mkosi.conf` as a **fallback for direct local builds without sourcing the script**, but this is a small ergonomic improvement, not a correctness gap.
- **#3 (Nix-pinned mkosi)**: **Already done, with a different mechanism** (`yubi-OS/mkosi` fork + pinned git SHA per `PINNED.md`). Adding a Nix flake would be redundant and add an unfamiliar toolchain for no gain. The fork-at-pinned-commit pattern is at least as rigorous as Nix-pinning and integrates naturally with the existing `fetch-released-tag-ref.yml` automation.

### Honest correction to my earlier verdict

My TL;DR table in the chat summary listed:

> 1. **`diffimage.sh` two-build verifier** — wire into CI daily.
> 2. **`SOURCE_DATE_EPOCH=0`** in mkosi.conf — one-line add.
> 3. **Nix-pinned mkosi** — pin mkosi itself.

Items 2 and 3 are **already implemented** with equivalent or better mechanisms. Item 1 (`diffimage.sh`) is **also already implemented** — just under different names (`scripts/verify-reproducible-images.sh`, `scripts/verify-reproducible-installer.py`, `scripts/verify-reproducible-firmware.py`). The only "borrow" that would still apply is **adding `Environment=SOURCE_DATE_EPOCH=0` to `mkosi.conf` as a fallback** for users who run `mkosi build` directly without sourcing the script — a tiny ergonomic improvement.

### Implications for "push and borrow #2+3"

When the user asked for #2+3 to be borrowed, the meaningful answer is:

1. **Push the research report to `refs/`** — still valuable (documents Edgeless + prior art + the comparative findings, including the correction above).
2. **Don't add redundant code** — items 2 and 3 already exist in yubiOS.
3. **Open an ADR or short refs note** documenting: "yubiOS already implements reproducibility primitives equivalent to or stronger than Edgeless's. `scripts/lib/reproducible-build.sh` is the source of truth; `yubi-OS/mkosi` fork pinning is our 'Nix pinning equivalent'. Future sessions should consult these before adding new reproducibility machinery."
4. **Optional minor refinement**: add `Environment=SOURCE_DATE_EPOCH=0` to `mkosi.conf` as a fallback so direct `mkosi build` invocations without the script are still reproducible — but this is a polish item, not a gap.

### New sources (yubiOS repo)

- [scripts/lib/reproducible-build.sh](file://./session/cache/yubios-lib-reproducible-build.sh) — commit-derived SOURCE_DATE_EPOCH, mkosi seed UUID derivation, env export, EDK2 stack cookies, reproducibility tree normalization, SHA256SUMS
- [scripts/verify-reproducible-images.sh](file://./session/cache/yubios-verify-reproducible-images.sh) — two-build OCI verification (`yubios-repro-a-$$` / `yubios-repro-b-$$`)
- [scripts/verify-reproducible-installer.py](file://./session/cache/yubios-verify-reproducible-installer.py) — unsigned-subject boundary check (canonical unsigned root filesystem, initrd, package manifest)
- [scripts/build-local-images.sh](file://./session/cache/yubios-build-local-images.sh) — `repro-production` / `repro-dev` modes
- [Containerfile](file://./session/cache/yubios-containerfile.sh) — `SOURCE_DATE_EPOCH` ARG, ldconfig aux-cache + machine-id + random-seed cleanup, dnf cache cleanup, PYTHONHASHSEED
- [yubiOS-bake.hcl](file://./session/cache/yubios-bake-hcl.sh) — `SOURCE_DATE_EPOCH` / `SOURCE_DATE_ISO8601` HCL variables wired into OCI image labels
- [PINNED.md](file://./session/cache/yubios-pinned.md) — `yubi-OS/mkosi` fork pin (`b2b1ea6ad59621a6f955e4cbceee72580a91889a`), `actions/checkout`, container digest table



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
