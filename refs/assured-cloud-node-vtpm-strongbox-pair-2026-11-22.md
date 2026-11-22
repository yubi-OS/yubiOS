# 3rd Bake/Build CI Path (`:assured`) & Triadic Cloud vTPM to Local Hardware StrongBox Pair Attestation (`2026-11-22`)

- **Status:** Implemented (`Containerfile.assured`, `yubiOS-bake.hcl`, `.github/workflows/ci_assured_image.yml`, `usr/lib/yubiOS/attest/`, `tests/unit/test_yubios_attest.py`)
- **Related PRs & ADRs:** Extends PR #330 (`yubios-attest`), `ADR-002`, `ADR-014` (Rootless Docker-in-Docker BuildKit), `ADR-018`/`ADR-019`/`ADR-020` (ARM64 fTPM + StandaloneMM), `ADR-034` (Composefs Local OCI & UKI Re-Signing)

---

## 1. The 3rd Main Buildx Bake & CI Path (`yubios-assured`)

Alongside `yubiOS-ci.yml` (`Containerfile` -> `:latest` / `:<sha>`) and `ci_dev_image.yml` (`Containerfile.dev` -> `:dev` / `:dev-<sha>`), yubiOS now defines a **3rd parallel Buildx Bake image path** for **Cloud Assured Nodes**:

| Image Stream | Workflow | Dockerfile | Bake Target / Group | Tag Namespace | Purpose & Security Boundary |
|---|---|---|---|---|---|
| **1. Production (`default`)** | `yubiOS-ci.yml` | `Containerfile` | `yubios` / `yubios-ci` / `yubios-repro` | `:latest`, `:<sha>` | Physical owner-enrolled desktop/server with physical U2F/HSM at console |
| **2. Dev/Test (`dev`)** | `ci_dev_image.yml` | `Containerfile.dev` | `yubios-dev` / `yubios-dev-ci` / `yubios-dev-repro` | `:dev`, `:dev-<sha>` | TEST-ONLY (`passless` `swu2f` + serial root autologin for headless CI) |
| **3. Cloud Assured (`assured`)** | `ci_assured_image.yml` | `Containerfile.assured` | `yubios-assured` / `yubios-assured-ci` / `yubios-assured-repro` | `:assured`, `:assured-<sha>` | Multi-arch (`amd64` + `arm64`) headless cloud node with Shielded vTPM remote attestation bridged to a 2-node Local Hardware StrongBox Pair |

Like `yubios-dev`, `yubios-assured` declares `contexts = { yubios-base = "target:_yubios-base" }` in `yubiOS-bake.hcl`, so `yubiOS-ci.yml`, `ci_dev_image.yml`, and `ci_assured_image.yml` run side-by-side in parallel from the checked-out commit without waiting on `:latest` to propagate to Docker Hub.

---

## 2. Multi-Arch Cloud Execution & Minimum Hardware Stack (`amd64` + `arm64`)

Cloud instances executing inside a remote datacenter cannot have a physical USB YubiKey plugged into the rack, yet still expose a hardware-anchored or hypervisor-isolated **TPM 2.0 (`vTPM` / `NitroTPM`)** and **UEFI Secure Boot + Measured Boot**:

| Cloud Provider | `linux/amd64` (`x86_64`) Instance Families | `linux/arm64` (`aarch64`) Instance Families | Minimum Hardware & Firmware Stack Used by `:assured` |
|---|---|---|---|
| **Google Cloud (GCP)** | **Shielded VMs** (`N2D`, `C3`, `C3D`, `C4`; plus Confidential VM AMD SEV-SNP / Intel TDX) | **Shielded VMs** (`C4A` Axion Neoverse-V2, `T2A` Ampere Altra) | UEFI Secure Boot + **vTPM 2.0** (`/dev/tpm0`, `/dev/tpmrm0` via `tpm_crb`/`tpm_tis`), TCG2 event log (`/sys/kernel/security/tpm0/binary_bios_measurements`), `gve` / `virtio_scsi` / `nvme` |
| **AWS EC2** | `m6i` / `c7i` / `m7a` with **NitroTPM** | `m7g` / `c7g` / `c8g` (Graviton3/4) with **NitroTPM** | UEFI Secure Boot + **NitroTPM 2.0** (`/dev/tpmrm0`), `nvme` / `ena` |
| **Azure** | **Trusted Launch** Gen2 VMs (`Dsv5` / `Dasv5`) | **Trusted Launch** Ampere Altra (`Dpsv5`) | UEFI Secure Boot + **vTPM 2.0** (`/dev/tpmrm0`) |

### `Containerfile.assured` Hardening Invariants
1. **No Test-Only Bypasses:** `yubios-assured-smoke` fails the build if `passless` (`swu2f`) or `10-yubiOS-test-autologin.conf` is present.
2. **Initramfs vTPM & Cloud I/O Drivers (`54-yubiOS-assured-cloud-tpm.conf`):** Bakes `tpm`, `tpm_tis`, `tpm_tis_core`, `tpm_crb`, `tpm_ftpm_tee`, `virtio_pci`, `virtio_blk`, `virtio_scsi`, `virtio_net`, `nvme`, and `gve` into the UKI initramfs.
3. **Headless `multi-user.target` + `yubiOS-attestd` (`--node-role cloud-vtpm`):** Masks `gdm.service` and enables `yubiOS-attestd.socket` and `yubiOS-attestd.service` in `cloud-vtpm` mode.

---

## 3. Triadic Attestation Protocol: Cloud vTPM <-> Assured Local StrongBox Pair

Because the Cloud Assured Node (`C`) has a **vTPM (`EK_C`, `AK_C`, `PCRs 0..7, 11, 14, 15`)** but no physical USB YubiKey, owner authority is anchored to an **Assured Local Node Pair (`A` + `B`)** running together with **two distinct physical hardware strongboxes** (each holding a TPM/fTPM AND a physical U2F/HSM YubiKey with PIV slot `9a` + resident `ed25519-sk` SSH key):

```text
+----------------------------------+         +----------------------------------+
| Local StrongBox Node A           |         | Local StrongBox Node B           |
| (e.g. ROCK 5B arm64 or x86 PC)   |<------->| (e.g. RockPro64 or 2nd StrongBox)|
| - fTPM / TPM2 (EK_A, AK_A, PCRs) | Mutual  | - fTPM / TPM2 (EK_B, AK_B, PCRs) |
| - YubiKey #1 (PIV 9a + SSH-sk)   | Pair AB | - YubiKey #2 (PIV 9a + SSH-sk)   |
+----------------------------------+         +----------------------------------+
                 \                                             /
                  \   1. ActivateCredential(EK_A, EK_B)       /
                   \  2. Dual StrongBox Quotes (PIV_A+PIV_B) /
                    \ 3. Challenge Cloud vTPM (EK_C, AK_C)  /
                     v                                     v
            +-------------------------------------------------------+
            | Cloud Assured Node C (yubios:assured, amd64 or arm64) |
            | (e.g. GCP C4A/T2A Arm64 or N2D/C3 AMD64 Shielded VM)  |
            | - Shielded vTPM (/dev/tpmrm0: EK_C, AK_C, PCRs 0..15) |
            | - yubiOS-attestd --node-role cloud-vtpm               |
            | - Enforces 2-of-2 Distinct StrongBox Pair Quorum      |
            +-------------------------------------------------------+
```

1. **Prerequisite (`pair-ssh` between `A` and `B`):** Local Node `A` and Local Node `B` complete mutual hardware StrongBox pairing (`pair-ssh` / `mutual-verify` from PR #330), establishing a shared `mutual_binding_ab` digest.
2. **Triadic Pairing (`yubiOS-attest pair-cloud-quorum`):**
   - Cloud Node `C` generates a single-use Crockford Base32 pairing code (`pair-init`) and issues two independent `MakeCredential` challenges: `cred_blob_for_a` encrypted to `(EK_A, AK_name_A)` and `cred_blob_for_b` encrypted to `(EK_B, AK_name_B)`.
   - Local Nodes `A` and `B` each recover their secret inside their respective local TPMs (`ActivateCredential`), while issuing a reverse `MakeCredential` challenge (`cred_blob_for_cloud`) encrypted to the Cloud Node's vTPM `(EK_C, AK_name_C)`.
   - Cloud Node `C` verifies:
     - Both `A` and `B` recovered their TPM residency secrets,
     - `A` and `B` have distinct `EK` fingerprints and **two distinct physical YubiKey PIV slot `9a` public keys** (`piv_fp_a != piv_fp_b`),
     - Both `bundle_a` and `bundle_b` carry valid `TPMS_ATTEST` quotes (`PCRs 0, 4, 7, 11`) and valid YubiKey PIV signatures bound to the 3-node transcript `quorum-v1 | quorum_mac | secret_a | secret_b | secret_cloud | mutual_binding_ab`.
   - Cloud Node `C` activates `cred_blob_for_cloud` in its vTPM and returns its vTPM-signed `TPMS_ATTEST` bundle, which both `A` and `B` verify and pin (`node_a_verified_cloud_vtpm`, `node_b_verified_cloud_vtpm`).
3. **Continuous Day-2 Verification (`yubiOS-attest verify-cloud-quorum`):**
   - Re-attests `A`, `B`, and `C` simultaneously on a fresh 3-way nonce transcript (`nonce_a | nonce_b | cloud_nonce`), enforcing `PCR 0, 4, 7, 11` continuity and monotonic counter/clock anti-rollback across all three nodes.
