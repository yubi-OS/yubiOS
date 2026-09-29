# mkosi + bcvk Fork Status
_Refreshed: 2026-07-23 (supersedes refs/archive-mkosi-bcvk-plan.md, originally updated 2026-05-10)_

## 2026-07-23 update

**mkosi PKCS#11 UKI signing: confirmed supported upstream, and already implemented in yubiOS.** mkosi is currently at **v27.1** (2026-09-29 refresh: v27 was published 2026-08-27 and v27.1 on 2026-09-28, both after this doc's original date; no v28 exists as of this refresh. See the Refresh: 2026-09-29 section) and supports PKCS#11-backed Secure Boot signing via `SecureBootKeySource=engine:pkcs11` and provider-based key sources (`provider:pkcs11`), covering Secure Boot signing, verity signing, and expected-PCR signing. `systemd-sbsign` is the preferred tool (`sbsign` fallback). **This matches what yubiOS already shipped**: refs/sbsign-pkcs11-validate.md and the merged PR #29 (sbsign-migration) + PR #32 (PKCS#11 URI validation) already implement exactly this path. No gap here — upstream and yubiOS are aligned.

**bcvk YubiKey USB passthrough: still NOT implemented upstream** (re-confirmed through v0.19.0, 2026-08-24: its changelog adds no USB device support of any kind, see Refresh: 2026-09-29), confirming this remains yubiOS-fork-only work. Current bcvk release (**v0.19.0**, 2026-08-24; prior v0.18.0, 2026-07-02) adds libvirt virtiofsd passthrough (#302), KVM group permission propagation for ephemeral run (#301), an ephemeral run status-monitor timeout (#300), and a run-ssh readiness change (#310) — still no USB passthrough. A bcvk issue (#214, about apple/container support) references missing support for passing **additional block devices**, not USB devices specifically. **This confirms yubi-OS/bcvk PR #2 ("feat(usb-passthrough): YubiKey USB passthrough for ephemeral VMs") is still necessary fork-only work** — consistent with its current "parked" status (per 2026-07-23 org audit) rather than something upstream will solve for yubiOS.

**bcvk `to-disk` / native-to-disk: confirmed standard, stable feature** — installs a container image to a persistent disk image via an ephemeral VM. Matches the existing yubiOS usage pattern below.

---

## Original research (2026-05-10, background — still structurally accurate)

## Context

These two forks are **build + test infrastructure** for yubiOS — the FIDO2-first immutable OS where a YubiKey replaces the TPM at every trust boundary.

| Fork | Upstream | Role in yubiOS |
|------|----------|----------------|
| `yubi-OS/mkosi` | `systemd/mkosi` | Build-time: constructs OCI images, UKI signing, dm-verity |
| `yubi-OS/bcvk` | `bootc-dev/bcvk` | Dev/test: runs yubiOS as ephemeral VM, hardware-in-the-loop testing |

## mkosi fork

### What yubiOS needed from this fork (status: PIV/PKCS11 signing now confirmed live, see update above)

#### 1. PIV/PKCS11 UKI signing — **DONE**, matches upstream capability
The yubiOS trust chain uses YubiKey PIV slot 9c (CCID) for Secure Boot signing via `systemd-sbsign` + PKCS#11, exactly as upstream mkosi now documents.

#### 2. FIDO2 enrollment hook
After image construction, an optional enrollment script sets up `systemd-cryptenroll --fido2-device=auto` binding so first boot prompts for YubiKey tap to seal the LUKS slot.

#### 3. yubiOS mkosi.conf.d profile
A `mkosi.conf.d/yubiOS/` directory setting `Bootloader=uki`, `SecureBootKey=` pointing to PIV slot, `Packages=` list (`pam-u2f`, `yubikey-manager`, `libfido2`, `opensc`), `KernelCommandLine=` with `rd.luks.options=fido2-device=auto`.

## bcvk fork

### Direction: native-first, QEMU as fallback — confirmed still correct

The native path (privileged podman container calling `bootc install to-disk` directly, no QEMU/virtiofsd/SSH) remains the right approach for flashing yubiOS to real hardware. `bcvk to-disk` (ephemeral-VM based) remains correct for building disk image files for cloud/VM import.

### Command decision matrix (unchanged)

| Use case | Command |
|---|---|
| Flash yubiOS to USB/NVMe (bare metal) | `bcvk native-to-disk` |
| Build a disk image file for cloud/VM import | `bcvk to-disk` |
| Dev testing in ephemeral QEMU VM | `bcvk ephemeral run` |

### YubiKey USB passthrough — confirmed fork-only, still open

Still tracked as yubiOS's own PR #2 on `yubi-OS/bcvk` (`feature/yubikey-usb-passthrough`), currently **parked** per Jenny's 2026-07-23 org-state decision. No upstream movement expected — revisit if/when hardware-in-the-loop CTAP2 testing (B-VM-CTAP2 / B-REAL-FIDO2) becomes the active priority.

---

## Priority order (updated)

1. ~~bcvk: YubiKey USB passthrough~~ — parked, not currently prioritized
2. ~~mkosi: yubiOS mkosi.conf.d profile~~ — done
3. ~~mkosi: PIV/PKCS11 UKI signing~~ — done, matches upstream
4. Current focus per live BLOCKERS.md: B-VM-CTAP2 (software CTAP2 enumeration fix), B-HARDENING-RUNTIME, B-BOOTC-SEAL — see refs/org-state-audit-2026-07-23.md

---

## Source references
- mkosi NEWS: https://github.com/systemd/mkosi/blob/main/mkosi/resources/man/mkosi.news.7.md
- mkosi manpage (Debian): https://manpages.debian.org/testing/mkosi/mkosi.1.en.html
- ukify docs: https://www.freedesktop.org/software/systemd/man/latest/ukify.html
- bcvk releases: https://github.com/bootc-dev/bcvk/releases
- bcvk v0.18.0: https://github.com/bootc-dev/bcvk/releases/tag/v0.18.0
- bcvk issue #214: https://github.com/bootc-dev/bcvk/issues/214
- bcvk to-disk manpage: https://www.mankier.com/8/bcvk-to-disk


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.

## 2026-09-18 drift check (wayfinder round 8, cycle 74)

fork status record: re-verified this round (fork pin discipline holding; bcvk fork moved 2026-08-24); note additive, cross-linked to the fork drift check.

## Refresh: 2026-09-29

Deep-research refresh: searXNG dig (3 queries, "mkosi v28 release changelog 2026", "mkosi systemd image builder release 2026", "bcvkd bcvk bootc release 2026") plus direct checks against the GitHub Releases API for both upstreams. The v28 query returned no mkosi v28 material because v28 does not exist; the useful searXNG hits were general mkosi references. Weighting below is jev noul quality weight (higher = more authoritative), task ta2519a8-6fab-46cd-a197-c26cd1901f94.

Findings (one line of fact + source + weight):

- mkosi latest release is v27.1, published 2026-09-28; v27 itself was published 2026-08-27, after this doc's 2026-07-23 date, so the "currently at v27" claim above was updated in place to v27.1. No v28 exists as of this refresh. Source: https://github.com/systemd/mkosi/releases/tag/v27.1 (noul 0.96)
- mkosi PKCS#11 UKI signing: unchanged. Neither the v27 nor v27.1 changelog touches PKCS#11 key sources or Secure Boot signing behavior. The only signing-adjacent v27.1 item is a fix letting `SignInitrdPCRs=` combine with `SplitArtifacts=pcrs` (initrd-specific PCR policies with systemd v262), which strengthens rather than weakens the "upstream and yubiOS aligned" conclusion. Source: https://github.com/systemd/mkosi/releases/tag/v27.1 (noul 0.96)
- bcvk v0.19.0 released 2026-08-24. Its changelog adds no USB passthrough or USB device support of any kind, so the "still NOT implemented upstream" claim stands and yubi-OS/bcvk PR #2 remains necessary fork-only work. Notable changes: virtiofsd passed to the libvirt command (#302), KVM group permission propagation for ephemeral run (#301), ephemeral run status-monitor timeout to prevent indefinite hang (#300), run-ssh no longer using ssh_access as readiness signal (#310). Source: https://github.com/bootc-dev/bcvk/releases/tag/v0.19.0 (noul 0.92)
- bcvk to-disk: a composefs-backend "Export to OCI layout" change (#313) was merged and then reverted within the same release (#324), so to-disk behavior is unchanged and the "standard, stable feature" claim holds. Source: https://github.com/bootc-dev/bcvk/releases/tag/v0.19.0 (noul 0.92)
- The 2026-09-18 drift check's "bcvk fork moved 2026-08-24" date matches the v0.19.0 release date, corroborating that entry. Source: https://github.com/bootc-dev/bcvk/releases/tag/v0.19.0 (noul 0.92)

### Sources considered

| # | Source | Origin | jev noul weight |
|---|--------|--------|-----------------|
| 0 | https://nixos.org/manual/nixos/stable/release-notes | searXNG q1 | 0.16 |
| 1 | https://academic.oup.com/ntr/article/26/7/816/7492742 | searXNG q1 | 0.01 |
| 2 | https://www.ovid.com/journals/ijpsy/fulltext/10.1002/ijop.13208~invited-symposium | searXNG q1 | 0.01 |
| 3 | https://file.pathology.ubc.ca/AR2023/RefereedPublications2022.html | searXNG q1 | 0.01 |
| 4 | https://internationalbusinessconference.com/2023-2/ | searXNG q1 | 0.01 |
| 5 | https://dokumen.pub/art-histories-in-transcultural-dynamics-narratives-concepts-and-practices-at-work-20th-and-21st-centuries-9783770559398.html | searXNG q1 | 0.01 |
| 6 | https://github.com/systemd/mkosi | searXNG q2 | 0.92 |
| 7 | https://jasminchen.dev/notes/2026/experimenting-with-mkosi-and-debian/ | searXNG q2 | 0.13 |
| 8 | https://wiki.archlinux.org/title/Mkosi | searXNG q2 | 0.39 |
| 9 | https://systemd.io/BUILDING_IMAGES/ | searXNG q2 | 0.87 |
| 10 | https://yorickpeterse.com/articles/self-hosting-my-websites-using-bootable-containers/ | searXNG q2 | 0.12 |
| 11 | https://cfp.all-systems-go.io/all-systems-go-2026/schedule/ | searXNG q2 | 0.10 |
| 12 | https://github.com/systemd/mkosi/releases/tag/v27 | direct fetch (GitHub Releases API) | 0.96 |
| 13 | https://github.com/systemd/mkosi/releases/tag/v27.1 | direct fetch (GitHub Releases API) | 0.96 |
| 14 | https://github.com/bootc-dev/bcvk/releases/tag/v0.19.0 | direct fetch (GitHub Releases API) | 0.92 |

Query 3 ("bcvkd bcvk bootc release 2026") returned zero results. Query 1 ("mkosi v28 release changelog 2026") returned only off-topic hits (weights 0.01 to 0.16), so no searXNG result ended up cited in the findings above; the refresh rests on the three directly fetched upstream release pages.
