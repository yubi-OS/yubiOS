# mkosi + bcvk Fork Status
_Refreshed: 2026-07-23 (supersedes refs/archive-mkosi-bcvk-plan.md, originally updated 2026-05-10)_

## 2026-07-23 update

**mkosi PKCS#11 UKI signing: confirmed supported upstream, and already implemented in yubiOS.** mkosi is currently at **v27** and supports PKCS#11-backed Secure Boot signing via `SecureBootKeySource=engine:pkcs11` and provider-based key sources (`provider:pkcs11`), covering Secure Boot signing, verity signing, and expected-PCR signing. `systemd-sbsign` is the preferred tool (`sbsign` fallback). **This matches what yubiOS already shipped**: refs/sbsign-pkcs11-validate.md and the merged PR #29 (sbsign-migration) + PR #32 (PKCS#11 URI validation) already implement exactly this path. No gap here â upstream and yubiOS are aligned.

**bcvk YubiKey USB passthrough: still NOT implemented upstream**, confirming this remains yubiOS-fork-only work. Current bcvk release (**v0.18.0**, 2026-07-02) adds Fedora 44 support, libvirt console/journal improvements, configurable virtiofsd, SSH reliability fixes â no USB passthrough of any kind. A bcvk issue (#214, about apple/container support) references missing support for passing **additional block devices**, not USB devices specifically. **This confirms yubi-OS/bcvk PR #2 ("feat(usb-passthrough): YubiKey USB passthrough for ephemeral VMs") is still necessary fork-only work** â consistent with its current "parked" status (per 2026-07-23 org audit) rather than something upstream will solve for yubiOS.

**bcvk `to-disk` / native-to-disk: confirmed standard, stable feature** â installs a container image to a persistent disk image via an ephemeral VM. Matches the existing yubiOS usage pattern below.

---

## Original research (2026-05-10, background â still structurally accurate)

## Context

These two forks are **build + test infrastructure** for yubiOS â the FIDO2-first immutable OS where a YubiKey replaces the TPM at every trust boundary.

| Fork | Upstream | Role in yubiOS |
|------|----------|----------------|
| `yubi-OS/mkosi` | `systemd/mkosi` | Build-time: constructs OCI images, UKI signing, dm-verity |
| `yubi-OS/bcvk` | `bootc-dev/bcvk` | Dev/test: runs yubiOS as ephemeral VM, hardware-in-the-loop testing |

## mkosi fork

### What yubiOS needed from this fork (status: PIV/PKCS11 signing now confirmed live, see update above)

#### 1. PIV/PKCS11 UKI signing â **DONE**, matches upstream capability
The yubiOS trust chain uses YubiKey PIV slot 9c (CCID) for Secure Boot signing via `systemd-sbsign` + PKCS#11, exactly as upstream mkosi now documents.

#### 2. FIDO2 enrollment hook
After image construction, an optional enrollment script sets up `systemd-cryptenroll --fido2-device=auto` binding so first boot prompts for YubiKey tap to seal the LUKS slot.

#### 3. yubiOS mkosi.conf.d profile
A `mkosi.conf.d/yubiOS/` directory setting `Bootloader=uki`, `SecureBootKey=` pointing to PIV slot, `Packages=` list (`pam-u2f`, `yubikey-manager`, `libfido2`, `opensc`), `KernelCommandLine=` with `rd.luks.options=fido2-device=auto`.

## bcvk fork

### Direction: native-first, QEMU as fallback â confirmed still correct

The native path (privileged podman container calling `bootc install to-disk` directly, no QEMU/virtiofsd/SSH) remains the right approach for flashing yubiOS to real hardware. `bcvk to-disk` (ephemeral-VM based) remains correct for building disk image files for cloud/VM import.

### Command decision matrix (unchanged)

| Use case | Command |
|---|---|
| Flash yubiOS to USB/NVMe (bare metal) | `bcvk native-to-disk` |
| Build a disk image file for cloud/VM import | `bcvk to-disk` |
| Dev testing in ephemeral QEMU VM | `bcvk ephemeral run` |

### YubiKey USB passthrough â confirmed fork-only, still open

Still tracked as yubiOS's own PR #2 on `yubi-OS/bcvk` (`feature/yubikey-usb-passthrough`), currently **parked** per Jenny's 2026-07-23 org-state decision. No upstream movement expected â revisit if/when hardware-in-the-loop CTAP2 testing (B-VM-CTAP2 / B-REAL-FIDO2) becomes the active priority.

---

## Priority order (updated)

1. ~~bcvk: YubiKey USB passthrough~~ â parked, not currently prioritized
2. ~~mkosi: yubiOS mkosi.conf.d profile~~ â done
3. ~~mkosi: PIV/PKCS11 UKI signing~~ â done, matches upstream
4. Current focus per live BLOCKERS.md: B-VM-CTAP2 (software CTAP2 enumeration fix), B-HARDENING-RUNTIME, B-BOOTC-SEAL â see refs/org-state-audit-2026-07-23.md

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

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
