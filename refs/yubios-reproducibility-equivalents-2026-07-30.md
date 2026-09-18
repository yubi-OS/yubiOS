# yubiOS Reproducibility Equivalents — Research Note

**Date:** 2026-07-30
**Trigger:** Deep research on https://github.com/edgelesssys/reproducible-mkosi surfaced as a prior-art candidate for "what could yubiOS borrow?". The follow-up inspection of `yubi-OS/yubiOS` main revealed yubiOS **already implements** the techniques — sometimes with better mechanisms than Edgeless's.
**Status:** Working note — supersedes my earlier chat-summary advice to "borrow #2 (`SOURCE_DATE_EPOCH=0`) + #3 (Nix-pinned mkosi)" into yubiOS.

---

## TL;DR

| Edgeless technique (in `reproducible-mkosi`) | yubiOS equivalent | yubiOS implementation | Notes |
|---|---|---|---|
| `Environment=SOURCE_DATE_EPOCH=0` in `[Content]` of root `mkosi.conf` | `scripts/lib/reproducible-build.sh` `configure_reproducible_build` derives `SOURCE_DATE_EPOCH` from `git show -s --format=%ct "${revision}^{commit}"` (commit committer timestamp) and refuses any caller-supplied value that doesn't match. Exported to `GITHUB_ENV`, propagated to `Containerfile` as `ARG SOURCE_DATE_EPOCH`, surfaced to `yubiOS-bake.hcl` as `variable "SOURCE_DATE_EPOCH"`, and written to OCI image labels via `SOURCE_DATE_ISO8601`. | **Better.** Commit-derived epoch is more correct than `0` (gives every tool a stable reference tied to the revision), and the mismatch guard prevents accidental epoch drift in CI. |
| `flake.nix` pins mkosi to upstream commit `d3b035a1` via `fetchFromGitHub` + sha256 | `yubi-OS/mkosi` fork pinned at source commit `b2b1ea6ad59621a6f955e4cbceee72580a91889a` per `PINNED.md`; `MinimumVersion=26~devel` enforces mkosi v26+; `fetch-released-tag-ref.yml` rolls forward while preserving the yubiOS-specific commits | **Equivalent rigor.** Fork + git SHA pin is at least as deterministic as Nix-pinning and integrates with the existing `fetch-released-tag-ref.yml` automation. Adds no new toolchain (no Nix dependency). |
| `tools/diffimage.sh` — build twice into `build-a/` / `build-b/`, sha256 diff + `veritysetup dump` diff + `systemd-dissect --mtree` diff | `scripts/verify-reproducible-images.sh` — build twice into `yubios-repro-a-$$` / `yubios-repro-b-$$` docker buildx builders + `scripts/verify-reproducible-installer.py` — Python-based comparison of canonical unsigned content. `scripts/build-local-images.sh repro-production` / `repro-dev` modes. `scripts/verify-reproducible-firmware.py` for firmware. | **More sophisticated.** Multiple verification surfaces (image, installer, firmware), each tailored to its artifact. Verification explicitly **excludes the signed envelope** (`yubiOS.efi`, `systemd-bootaa64.efi.signed`, `*.raw`, `ci-secure-boot-cert.pem`) — correct boundary for reproducible-builds semantics. |
| `mkosi.images/system/mkosi.conf:11` `Seed=0e9a6fe0-…` (hard-coded UUID) | `scripts/lib/reproducible-build.sh` derives `YUBIOS_MKOSI_SEED` from `printf 'yubiOS\0%s\0%s\0minimal\0' "$GIT_SHA" "$architecture" \| sha256sum \| cut -c1-32` → UUID v5-style. Distinct per (commit, arch, profile). | **Better.** Per-identity derivation avoids accidental cross-output UUID collision (Edgeless's hard-coded UUID would collide if reused for a different output). |
| `mkosi.conf.d/{fedora,ubuntu}.conf` `RemoveFiles=` lists for ldconfig aux-cache, libdnf5 transaction_history.sqlite, /var/log, /var/cache | `mkosi.finalize` strips `/var/cache/ldconfig/aux-cache`. `Containerfile` strips `/etc/machine-id`, `/var/lib/systemd/random-seed` (with an inline comment documenting the run-30197303995 incident where two isolated builds diverged because of these), dnf caches via `--setopt=history_record=false --setopt=install_weak_deps=False`. PYTHONHASHSEED=0 for pip + compileall. | **Equivalent.** |
| (none — Edgeless uses GRUB/UKI without this concern) | `Containerfile` comment: "systemctl preset-all inside a container build invokes systemd-machine-id-setup, which writes a random /etc/machine-id and /var/lib/systemd/random-seed with fresh random content on every build". bootc regenerates both on first boot. | **Better-documented.** Edgeless doesn't surface the specific test artifact that proves the problem. |
| (uses Nix flakes — large surface area) | (uses Debian + apt + DHI container — small surface area) | **Different design philosophy**, not a yubiOS gap. |

## Why this note exists

Earlier today, a deep-research stream on Edgeless's `reproducible-mkosi` produced a comparison table that listed several yubiOS "gaps":

- `SOURCE_DATE_EPOCH` not pinned in mkosi.conf
- mkosi version not Nix-pinned
- No two-build reproducibility verifier in CI

Those were **correct relative to the `mkosi-image-builder` skill, which is stale** — and **wrong relative to `yubi-OS/yubiOS` main**, where all three are implemented (with better mechanisms in two of three cases). Without this note, a future session re-running the same research would re-discover the same false-positive "gaps" and propose redundant code.

## What we did NOT borrow from Edgeless

After the correction above, Edgeless's contributions are still useful as a **reference catalogue**, not as code to copy:

| Edgeless technique | Why not adopted in yubiOS |
|---|---|
| `mkosi#1834` upstream SOURCE_DATE_EPOCH propagation, `mkosi#1837` repart seed, `mkosi#1982` PAX headers, `mkosi#2163` cpio sort, `systemd#29000` mcopy SDE, `systemd#29606` btrfs hardlink leak, `nixpkgs#252282` dosfstools, `authselect#350` | yubiOS uses `MinimumVersion=26~devel` and `ToolsTree=default`, so it inherits all these upstream fixes by virtue of running on mkosi v26+ — no explicit local configuration needed. |
| `cosign attach attestation` + in-toto + sigstore/Rekor for the OCI image | **Open opportunity, not yet adopted in yubiOS.** Could be added on top of the existing `scripts/build-local-images.sh` flow via `docker-metadata-action` + `actions/attest`. Worth an ADR if pursued. |
| Nix-pinned toolchain across multiple distros | **Open opportunity, not adopted.** If yubiOS ever needs to build Fedora + Ubuntu + Debian images reproducibly (vs Debian-only today), the Nix devShell pattern is a tested option. Not a current gap. |
| Package vendoring (`mkosi.cache/`) | **Open opportunity.** yubiOS currently fetches from live Debian mirrors. If a particular reproducibility guarantee (independent of mirror state) is needed, vendoring would help. Not a current gap. |

## Optional minor refinement

If a future session wants a tiny ergonomic improvement, adding `Environment=SOURCE_DATE_EPOCH=0` to the root `mkosi.conf` `[Content]` section would make `mkosi build` invocations that *don't* source `scripts/lib/reproducible-build.sh` still reproducible. This is a polish item — not a correctness gap, and not strictly necessary since the documented build path is "source the script, then build".

## Source pointers

- `scripts/lib/reproducible-build.sh` — commit-derived `SOURCE_DATE_EPOCH`, mkosi seed derivation, env export, EDK2 stack cookies, reproducibility tree normalization, SHA256SUMS.
- `scripts/verify-reproducible-images.sh` — two-build OCI verification (`yubios-repro-a-$$` / `yubios-repro-b-$$`).
- `scripts/verify-reproducible-installer.py` — unsigned-subject boundary check (canonical unsigned root filesystem, initrd, package manifest). Excludes signed envelope by design.
- `scripts/verify-reproducible-firmware.py` — firmware reproducibility verification.
- `scripts/build-local-images.sh` — `repro-production` / `repro-dev` modes for operator use.
- `Containerfile` — `SOURCE_DATE_EPOCH` ARG, ldconfig aux-cache + machine-id + random-seed cleanup, dnf cache cleanup, PYTHONHASHSEED.
- `yubiOS-bake.hcl` — `SOURCE_DATE_EPOCH` / `SOURCE_DATE_ISO8601` HCL variables wired into OCI image labels.
- `PINNED.md` — `yubi-OS/mkosi` fork pin (`b2b1ea6ad59621a6f955e4cbceee72580a91889a`), `actions/checkout`, container digest table.
- `AGENTS.md` — `source scripts/lib/reproducible-build.sh && configure_reproducible_build . HEAD arm64` is the canonical build entrypoint.
- `mkosi.conf` `MinimumVersion=26~devel` — guarantees mkosi v26+ upstream reproducibility fixes (mkosi#1834, #1837, #1982, #2163, etc.) are inherited.

## Related prior art (from the Edgeless research)

- Flashbots [`mkosi-poc`](https://github.com/flashbots/mkosi-poc) — closest peer (Intel TDX variant).
- Jelly [`arch-mkosi-boxes`](https://github.com/Jellyfrog/arch-mkosi-boxes) — independent Arch reproducibility research.
- Upstream mkosi [`--reproduce` flag (PR #1115)](https://github.com/systemd/mkosi/pull/1115) — when this lands, it would consolidate most of the bespoke reproducibility plumbing.
- [reproducible-builds.org](https://reproducible-builds.org/) — Debian reproducibility foundation.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8668) were identical placeholder copies with no per-file content; merged on 2026-09-18.
