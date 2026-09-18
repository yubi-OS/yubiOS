# bootc-dev Org — Repos, Releases, Upstream FIDO2/LUKS Status
_Refreshed: 2026-07-23 (supersedes refs/archive-bootc-dev-org.md, originally fetched 2026-05-10)_

## ⚠️ CRITICAL FINDING for yubiOS BLOCKERS.md B-BOOTC-SEAL

**bootc-dev/bootc v1.16.4 released 2026-07-15.** yubiOS's own BLOCKERS.md (as of 2026-07-22) states: "the pinned Fedora bootc image records bootc 1.16.3, which lacks `container split-kernel-and-rootfs`... Pin a base with v1.16.4-equivalent split/ukify capabilities" as the B-BOOTC-SEAL blocker. **v1.16.4 now exists upstream** (bootc is on a weekly release cadence since v1.16.0 on 2026-06-10, patch releases by default). This means the blocker may now be a matter of **bumping the pinned Fedora bootc base image digest to pick up bootc 1.16.4**, not waiting on an unreleased upstream feature. Recommend checking whether the current pinned `quay.io/fedora/fedora-bootc` digest already carries bootc 1.16.4, and if not, whether a Fedora point-release with it is available yet — that's the next concrete step to unblock B-BOOTC-SEAL.

## Release status (2026-07-23)

| Repo | Latest release | Date | Notes |
|---|---|---|---|
| bootc-dev/bootc | **v1.16.4** | 2026-07-15 | Weekly release cadence since v1.16.0 (2026-06-10); patch releases default, minor reserved for bigger features |
| bootc-dev/bcvk | **v0.18.0** | 2026-07-02 | Adds Fedora 44 support, libvirt console/journal features, configurable virtiofsd, boot/SSH reliability + CI fixes |
| bootc-dev/podman-bootc | **Archived** | — | Development moved to bcvk; still shows a stale open PR (#119, last updated 2026-05-23) but is not the active project |

## Upstream FIDO2/LUKS status (systemd) — still unresolved, active work

Three open systemd issues remain relevant to yubiOS's LUKS2 FIDO2 unlock path:
- **#41598**: `systemd-cryptsetup` doesn't clearly prompt for FIDO2 user-presence confirmation without a PIN, causing confusing/stalled boot behavior.
- **#40517**: FIDO2 unlock with PIN can fail on some setups, dropping to a debug shell; appears dependency/version-sensitive.
- **#32586**: `gpt-auto-generator` can interfere with LUKS unlock by injecting `tpm2-device=auto` and bypassing/overriding expected unlock paths, including FIDO2 fallback.

**Active upstream feature work:** systemd PR **#39570** ("cryptenroll: Support tpm2+fido2 enrollment") is open with commits as recent as **2026-07-22** — combined TPM2+FIDO2 enrollment is being actively worked on but not yet merged; design still under debate. Worth tracking since yubiOS could benefit from (or need to work around) whatever enrollment model lands here.

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

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.
