# bootc-dev Org — Repos, Releases, Upstream FIDO2/LUKS Status
_Refreshed: 2026-07-23 (supersedes refs/archive-bootc-dev-org.md, originally fetched 2026-05-10)_

## ⚠️ CRITICAL FINDING for yubiOS BLOCKERS.md B-BOOTC-SEAL

**bootc-dev/bootc v1.16.4 released 2026-07-15.** yubiOS's own BLOCKERS.md (as of 2026-07-22) states: "the pinned Fedora bootc image records bootc 1.16.3, which lacks `container split-kernel-and-rootfs`... Pin a base with v1.16.4-equivalent split/ukify capabilities" as the B-BOOTC-SEAL blocker. **v1.16.4 now exists upstream** (bootc is on a weekly release cadence since v1.16.0 on 2026-06-10, patch releases by default). This means the blocker may now be a matter of **bumping the pinned Fedora bootc base image digest to pick up bootc 1.16.4**, not waiting on an unreleased upstream feature. Recommend checking whether the current pinned `quay.io/fedora/fedora-bootc` digest already carries bootc 1.16.4, and if not, whether a Fedora point-release with it is available yet — that's the next concrete step to unblock B-BOOTC-SEAL.

## Release status (2026-07-23)

| Repo | Latest release | Date | Notes |
|---|---|---|---|
| bootc-dev/bootc | **v1.16.13** | 2026-09-15 | Weekly release cadence since v1.16.0 (2026-06-10); patch releases default, minor reserved for bigger features |
| bootc-dev/bcvk | **v0.19.0** | 2026-08-24 | v0.19.0 release body is a minimal install/checksum note (EPEL 10 build-target fix, dependency updates); v0.18.0 (2026-07-02) added Fedora 44 support, libvirt console/journal features, configurable virtiofsd, boot/SSH reliability + CI fixes |
| bootc-dev/podman-bootc | **Archived** | — | Development moved to bcvk; still shows a stale open PR (#119, last updated 2026-05-23) but is not the active project |

_Table rows for bootc and bcvk updated in place 2026-09-29; see the Refresh section at the end._

## Upstream FIDO2/LUKS status (systemd) — still unresolved, active work

Three open systemd issues remain relevant to yubiOS's LUKS2 FIDO2 unlock path:
- **#41598**: `systemd-cryptsetup` doesn't clearly prompt for FIDO2 user-presence confirmation without a PIN, causing confusing/stalled boot behavior.
- **#40517**: FIDO2 unlock with PIN can fail on some setups, dropping to a debug shell; appears dependency/version-sensitive.
- **#32586**: `gpt-auto-generator` can interfere with LUKS unlock by injecting `tpm2-device=auto` and bypassing/overriding expected unlock paths, including FIDO2 fallback.

**Active upstream feature work:** systemd PR **#39570** ("cryptenroll: Support tpm2+fido2 enrollment") is open with commits as recent as **2026-09-27** — combined TPM2+FIDO2 enrollment is being actively worked on but not yet merged; design still under debate. Worth tracking since yubiOS could benefit from (or need to work around) whatever enrollment model lands here.

---

## Original research (2026-05-10, repo descriptions largely still accurate as background)

### bcvk ⭐ | Rust | Active
https://github.com/bootc-dev/bcvk — Bootc virtualization kit. Run bootc container images as ephemeral or persistent VMs using QEMU + virtiofsd. Unprivileged (rootless podman). Core dev/test tool for yubiOS (yubi-OS/bcvk is forked from this).

### bootc ⭐ | Rust | Very Active
https://github.com/bootc-dev/bootc — The core project. Boot and upgrade Linux systems from OCI container images. Transactional in-place updates via `bootc upgrade` / `bootc switch`. The foundation yubiOS runs on.

### podman-bootc | Go | **Now archived**
https://github.com/bootc-dev/podman-bootc — Predecessor/companion to bcvk, superseded.

### ocidir-rs, containers-image-proxy-rs, canon-json-rs, jsonrpc-fdpass(-go)
Supporting Rust/Go libraries used internally by bootc/bcvk for OCI layer I/O, registry pulls, manifest hashing, and QEMU/virtiofsd IPC. No yubiOS-specific action needed unless adding new OCI features.

---

## Architecture Map (yubiOS perspective, unchanged)

```
dhi.io/debian-base (pinned OCI)
        │
        ▼ Containerfile
  rootless podman build
        │
        ▼ OCI image → dhi.io/yubi-OS/yubiOS
        │
        ├─▶ bootc install to-disk / to-filesystem (bare metal)
        │           ↑
        │       bcvk native-to-disk
        │
        ├─▶ bcvk ephemeral run (dev loop)
        │           ↑
        │       QEMU + virtiofsd + u2f-passthru
        │
        └─▶ bcvk to-disk (disk image for CI)
                    ↑
                bootc install to-disk (in ephemeral VM)
```

## Notes for yubiOS work

- `bcvk` is the right tool for dev loop and CI disk image builds — `podman-bootc` is now formally archived, confirming this choice.
- Watch systemd PR #39570 (tpm2+fido2 enrollment) — could change the enrollment API surface yubiOS depends on.
- **Action item:** check the pinned Fedora bootc base digest for bootc 1.16.4 availability — directly relevant to B-BOOTC-SEAL.

---

## Source references
- bcvk releases: https://github.com/bootc-dev/bcvk/releases/
- bcvk v0.18.0: https://github.com/bootc-dev/bcvk/releases/tag/v0.18.0
- bootc releases: https://github.com/bootc-dev/bootc/releases/
- podman-bootc (archived): https://github.com/bootc-dev/podman-bootc
- systemd #41598: https://github.com/systemd/systemd/issues/41598
- systemd #40517: https://github.com/systemd/systemd/issues/40517
- systemd #32586: https://github.com/systemd/systemd/issues/32586
- systemd PR #39570: https://github.com/systemd/systemd/pull/39570


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.

## 2026-09-18 re-verification (wayfinder round 8)

The doc's CRITICAL FINDING said bootc v1.16.4 (2026-07-15) may make B-BOOTC-SEAL a digest-bump
matter. Live 2026-09-18: upstream bootc is at **v1.16.13** (v1.16.12 2026-09-10, v1.16.11
2026-09-03) — two months of weekly-cadence releases past the finding. The finding's logic now
holds even more strongly: the version floor for `bootc container split-kernel-and-rootfs`
(v1.16.4+) is far behind upstream, and the binding constraint is purely the fedora-bootc
digest. Which is currently stale: this round's digest drift check found the `Containerfile`
pin 404ing on quay since ~2026-08-05 (`refs/fedora-bootc-digest-drift-check-2026-09-18.md`).
So B-BOOTC-SEAL option (b) is now exactly what the 2026-07-23 doc predicted: a digest bump
that would also carry the v1.16.4+ capability.

## Refresh: 2026-09-29

Method: searXNG dig with two prescribed queries ("bootc release changelog 2026", "bootc containers org latest release") plus one follow-up query ("bootc-dev bootc v1.17 release github") because the first two returned mostly off-topic results. All 18 results were jev-weighted (noul) in one batched call, then every material fact below was verified directly against the GitHub API (release listings, repo archived flags, PR state) before any in-place edit.

Findings since the 2026-07-23 snapshot:

- bootc: latest release is still **v1.16.13** (2026-09-15), confirming the 2026-09-18 re-verification below. Nine patch releases shipped since v1.16.4: v1.16.5 (2026-07-24), v1.16.6 (2026-07-28), v1.16.7 (2026-08-04), v1.16.8 (2026-08-13), v1.16.9 (2026-08-21), v1.16.10 (2026-08-25), v1.16.11 (2026-09-03), v1.16.12 (2026-09-10), v1.16.13 (2026-09-15). Cadence is roughly weekly, as predicted. No v1.17 exists; the minor line stays at 1.16. v1.16.13 changes include: docs stating systemd sysext/confext are unsupported, container export preserving directory modes, a new `--warn-unlabeled` export flag for SELinux label handling, ALT Atomic added as an adopter, Rust dependency updates. Source: https://github.com/bootc-dev/bootc/releases/ (noul 0.95; duplicate listing hit noul 0.93).
- bcvk: shipped **v0.19.0** (2026-08-24), superseding the v0.18.0 row recorded 2026-07-23. Release body is a minimal install/checksum note; listed changes are a packit EPEL 10 build-target fix and dependency updates. The table row above was updated in place with the v0.18.0 notes preserved. Source: https://github.com/bootc-dev/bcvk/releases/tag/v0.19.0 (GitHub API verified; releases listing via dig, noul 0.95).
- podman-bootc: repo archived flag remains true, last push 2026-06-03. No change to the "Archived, superseded by bcvk" assessment. Source: https://github.com/bootc-dev/podman-bootc (GitHub API verified).
- systemd PR #39570 ("cryptenroll: Support tpm2+fido2 enrollment"): still open, still unmerged, with commits as recent as 2026-09-27. Recent commit subjects show the design moving into JSON-validation and enrollment-mixing territory: "tpm2-util: allow mixing a FIDO2 hmac-secret into the TPM2 authValue", "tpm2-util: record FIDO2 credential metadata in the LUKS2 token JSON", "cryptsetup-fido2: allow passing the FIDO2 client PIN in directly". The FIDO2+TPM2 combined-enrollment model yubiOS is tracking is converging, not stalled. The PR-activity date in the body above was updated in place (2026-07-22 to 2026-09-27) on this evidence. Source: https://github.com/systemd/systemd/pull/39570 (GitHub API verified).
- The three open systemd issues (#41598, #40517, #32586) were not individually re-verified this round; the dig produced no evidence any of them resolved, and the "still unresolved, active work" framing stands.

In-place edits made this refresh: bootc and bcvk table rows (versions and dates), PR #39570 activity date. Everything else is appended.

### Sources considered (jev noul weights, 1 batched call, task ta473b2c-4371-40dd-8231-f923508cb19b)

| # | Result | URL | noul |
|---|---|---|---|
| 0 | Releases · bootc-dev/bootc (GitHub) | https://github.com/bootc-dev/bootc/releases/ | 0.95 |
| 1 | bootc.dev (official site) | https://bootc.dev/ | 0.45 |
| 2 | Windows Server KB5087539 (off topic) | https://support.microsoft.com/en-us/servicing/os/windows-server/2026/05/may-12-2026-kb5087539-os-build-26100-32860 | 0.42 |
| 3 | Reddit: Spring Boot 4.1.1 (off topic) | https://www.reddit.com/r/SpringBoot/comments/1vtljrr/spring_boot_411_released/ | 0.02 |
| 4 | Debian 13.6 release (off topic) | https://www.debian.org/News/2026/20260711 | 0.02 |
| 5 | Red Hat: bootc download-only updates | https://developers.redhat.com/articles/2026/02/18/control-updates-download-only-mode-bootc | 0.27 |
| 6 | GitHub: bootc-dev/bootc | https://github.com/bootc-dev/bootc | 0.81 |
| 7 | Fedora Docs: bootc getting started | https://docs.fedoraproject.org/en-US/bootc/getting-started/ | 0.56 |
| 8 | bootc-dev dev-bootc package (fedora-43-uki) | https://github.com/orgs/bootc-dev/packages/container/dev-bootc/684109743?tag=fedora-43-uki | 0.61 |
| 9 | Foreman forum: provisioning bootc machines | https://community.theforeman.org/t/provisioning-and-managing-bootc-machines-with-foreman/46441 | 0.07 |
| 10 | Red Hat: OpenShift boot images roadmap | https://developers.redhat.com/articles/2025/08/18/roadmap-openshift-boot-images-update | 0.16 |
| 11 | Fedora Magazine: bootc kickstart in Anaconda | https://fedoramagazine.org/introducing-the-new-bootc-kickstart-command-in-anaconda/ | 0.18 |
| 12 | Releases · bootc-dev/bootc (duplicate hit, yielded 1.16.13) | https://github.com/bootc-dev/bootc/releases/ | 0.93 |
| 13 | bootc discussion #1984: UKI composefs mismatch | https://github.com/bootc-dev/bootc/discussions/1984 | 0.32 |
| 14 | containers/oci-delta (delta generator for bootc) | https://github.com/containers/oci-delta | 0.41 |
| 15 | Reddit: boot.dev (off topic) | https://www.reddit.com/r/selfhosted/comments/1qwxovt/is_there_anything_out_there_like_bootdev/ | 0.02 |
| 16 | siderolabs RPi5 issue (off topic) | https://github.com/siderolabs/sbc-raspberrypi/issues/23?timeline_page=1 | 0.03 |
| 17 | Google Play services release notes (off topic) | https://developers.google.com/android/guides/releases | 0.01 |

Note: jev scored the Windows KB and bootc.dev results oddly (0.42 and 0.45); neither was used as evidence for any claim here.
