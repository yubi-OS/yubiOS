# Citing yubiOS

If you reference yubiOS in academic or technical work, please cite the project and,
where relevant, the primary sources below that ground its design.

## Cite this project

> Tchatalbachian, S. (2026). *yubiOS: A FIDO2-first immutable operating system with a hardware
> security key as the sole root of trust.* yubi-OS. https://github.com/yubi-OS/yubiOS

```bibtex
@software{yubios2026,
  author  = {Tchatalbachian, Shant},
  title   = {{yubiOS}: A {FIDO2}-first immutable operating system with a
             hardware security key as the sole root of trust},
  year    = {2026},
  url      = {https://github.com/yubi-OS/yubiOS},
  note    = {YubiKey replaces the TPM at every trust boundary:
             Secure Boot signing, disk encryption, SSH, and PAM}
}
```

---

## Primary sources grounding the design

### Authentication: FIDO2 / WebAuthn / CTAP

- W3C. *Web Authentication: An API for accessing Public Key Credentials (WebAuthn) — Level 2.* W3C Recommendation, 2021. https://www.w3.org/TR/webauthn-2/
- FIDO Alliance. *Client to Authenticator Protocol (CTAP) 2.1.* FIDO Alliance Proposed Standard, 2021. https://fidoalliance.org/specs/fido-v2.1-ps-20210615/
- IETF. Pechanec, J. & Moustakas, D. *RFC 7512: The PKCS #11 URI Scheme.* 2015. https://www.rfc-editor.org/rfc/rfc7512

### Trusted boot, measured boot, and platform integrity

- Arbaugh, W. A., Farber, D. J., & Smith, J. M. (1997). *A Secure and Reliable Bootstrap Architecture.* IEEE Symposium on Security and Privacy. (Foundational chain-of-trust boot.)
- Sailer, R., Zhang, X., Jaeger, T., & van Doorn, L. (2004). *Design and Implementation of a TCG-based Integrity Measurement Architecture.* USENIX Security Symposium. (IMA / PCR measurement.)
- Parno, B., McCune, J. M., & Perrig, A. (2011). *Bootstrapping Trust in Modern Computers.* Springer. (Survey of TPM-rooted trust; motivates the YubiKey-as-RoT substitution.)
- Trusted Computing Group. *TPM 2.0 Library Specification.* https://trustedcomputinggroup.org/resource/tpm-library-specification/
- UEFI Forum. *Unified Extensible Firmware Interface (UEFI) Specification, v2.10.* (Secure Boot `db`/`KEK`/`PK`, Authenticode PE signing.) https://uefi.org/specifications

### Firmware-supply-chain hardening (NIST)

- NIST SP 800-147. *BIOS Protection Guidelines.* https://csrc.nist.gov/pubs/sp/800/147/final
- NIST SP 800-155 (Draft). *BIOS Integrity Measurement Guidelines.*
- NIST SP 800-193. *Platform Firmware Resiliency Guidelines.* https://csrc.nist.gov/pubs/sp/800/193/final

### Image-based OS, immutability, and the systemd model

- Poettering, L. *Fitting Everything Together.* 0pointer.net, 2022. https://0pointer.net/blog/fitting-everything-together.html
- Poettering, L. *Brave New Trusted Boot World.* 0pointer.net, 2022. https://0pointer.net/blog/brave-new-trusted-boot-world.html
- systemd project. *systemd-sbsign(1), systemd-cryptenroll(1), systemd-homed(8), systemd-repart(8), Unified Kernel Image (UKI) & Discoverable Partitions Specification.* https://www.freedesktop.org/software/systemd/man/latest/
- Linux kernel. *fs-verity: read-only file-based authenticity protection* and *dm-verity.* https://www.kernel.org/doc/html/latest/filesystems/fsverity.html

### Disk encryption

- Broz, M. et al. *LUKS2 On-Disk Format Specification.* cryptsetup project. https://gitlab.com/cryptsetup/cryptsetup
- Fruhwirth, C. (2005). *New Methods in Hard Disk Encryption.* Institute for Computer Languages, TU Wien. (LUKS design rationale, XTS/sector tweaking.)

### Software supply chain & provenance

- OpenSSF. *SLSA: Supply-chain Levels for Software Artifacts (v1.0).* https://slsa.dev/spec/v1.0/
- Sigstore project. *cosign / Rekor transparency log.* https://docs.sigstore.dev/

### Referenced security advisory

- Yubico. *YSA-2025-01: pam-u2f partial authentication bypass (CVE-2025-23013).* https://www.yubico.com/support/security-advisories/ysa-2025-01/

---

_Internal design rationale lives in [ADR.md](ADR.md); the firmware-supply-chain threat
model this project closes is in [MITIGATE.md](MITIGATE.md); the post-launch ARM64
secure-world plan is in [FUTURE.md](FUTURE.md)._

# Citations And Primary Sources

Last reviewed: 2026-07-11

This file lists the main upstream sources used by the yubiOS docs. Prefer primary upstream documentation, release notes, standards, and source repositories when updating architectural claims.

## systemd

- systemd v261 release: https://github.com/systemd/systemd/releases/tag/v261
- `systemd.exec(5)` sandboxing directives: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
- `systemd-cryptenroll(1)`: https://www.freedesktop.org/software/systemd/man/latest/systemd-cryptenroll.html
- `systemd-repart(8)`: https://www.freedesktop.org/software/systemd/man/latest/systemd-repart.html
- `systemd-sbsign(1)`: https://www.freedesktop.org/software/systemd/man/latest/systemd-sbsign.html
- Discoverable Partitions Specification: https://systemd.io/DISCOVERABLE_PARTITIONS
- Automatic Boot Assessment: https://systemd.io/AUTOMATIC_BOOT_ASSESSMENT

## FIDO2, YubiKey, And Local Auth

- Yubico PIV tool documentation: https://developers.yubico.com/yubico-piv-tool/
- Yubico pam-u2f security advisory YSA-2025-01: https://www.yubico.com/support/security-advisories/ysa-2025-01/
- OpenSSH 8.2 FIDO2 release notes: https://www.openssh.com/txt/release-8.2
- libfido2 project: https://github.com/Yubico/libfido2

## bootc, OCI, And Build Tooling

- bootc install documentation: https://bootc.dev/bootc/bootc-install.html
- bootc upstream repository: https://github.com/containers/bootc
- fedora-bootc registry source: https://quay.io/repository/fedora/fedora-bootc
- composefs upstream: https://github.com/containers/composefs
- Docker Buildx build policies: https://docs.docker.com/build/policies/intro/
- Docker attestations: https://docs.docker.com/build/attestations/

## TLS And Post-Quantum Defaults

- OpenSSL 3.5 release notes: https://openssl-library.org/news/openssl-3.5-notes/
- OpenSSL 3.5 group configuration documentation: https://docs.openssl.org/3.5/man3/SSL_CONF_cmd/
- Go 1.24 release notes: https://go.dev/doc/go1.24
- Go issue for default hybrid TLS group: https://github.com/golang/go/issues/69985

## Firmware, ARM64, And TPM Work

- ARM Trusted Firmware-A: https://trustedfirmware-a.readthedocs.io/
- OP-TEE documentation: https://optee.readthedocs.io/
- OP-TEE fTPM project: https://github.com/OP-TEE/optee_ftpm
- Microsoft TPM 2.0 reference implementation: https://github.com/microsoft/ms-tpm-20-ref
- U-Boot documentation: https://docs.u-boot.org/
- U-Boot EFI documentation: https://docs.u-boot.org/en/latest/develop/uefi/index.html
- U-Boot measured boot documentation: https://docs.u-boot.org/en/latest/develop/measured_boot.html

## Virtualization And zstd EFI zboot

- QEMU zstd EFI zboot patch discussion: https://lists.nongnu.org/archive/html/qemu-devel/2026-01/msg04080.html
- QEMU project: https://www.qemu.org/docs/master/
- swtpm project: https://github.com/stefanberger/swtpm

## yubiOS Internal References

- Planning cycle for this refresh: [refs/planning-cycle-2026-07-11.md](../refs/planning-cycle-2026-07-11.md)
- v261 base-image research: [refs/v261-base-image.md](../refs/v261-base-image-bump-2026-07-23.md)
- ARM64 fTPM planning: [refs/arm64-ftpm-phase-f0.md](../refs/arm64-ftpm-phase-f0-2026-07-23.md)
- zstd EFI zboot planning: [refs/zstd-efi-zboot-bcvk.md](../refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md)
- swtpm CI planning: [refs/bcvk-swtpm-ci.md](../refs/bcvk-swtpm-ci-2026-07-23.md)
- LUKS FIDO2 E2E planning: [refs/luks-fido2-e2e-test.md](../refs/luks-fido2-e2e-test-2026-07-23.md)
- PKCS#11 signing validation: [refs/sbsign-pkcs11-validate.md](../refs/sbsign-pkcs11-validate-2026-07-23.md)



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
