# GlobalPlatform TEE Protection Profile (`TEE PP`) Security Target & TOE Boundary Specification (`OMN-203`)

- **Document ID:** `ST-YUBIOS-OPTEE-ARM64-V0.1`
- **Date:** `2026-11-22`
- **Linear Issue:** [`OMN-203`](https://linear.app/omni-agent/issue/OMN-203/campaign-1-dollar10000-goal-accredited-3rd-party-security-lab-pre) (`[Campaign 1 · $10,000 Goal] Accredited 3rd-Party Security Lab Pre-Testing & GlobalPlatform TEE PP Security Target`)
- **Protection Profile Reference:** GlobalPlatform Trusted Execution Environment Protection Profile (`TEE PP`, Common Criteria v3.1 R5 / ISO/IEC 15408, certified under ANSSI / SOG-IS MRA)
- **Target Assurance Level:** `EAL2+` (Evaluation Assurance Level 2 augmented with `AVA_VAN_AP.3` focused vulnerability analysis against the GlobalPlatform TEE Attack Catalog `TEE AP`)
- **Related ADRs:** `ADR-002`, `ADR-018` (yubiOS-Owned ARM64 Secure-World Stack: TF-A + OP-TEE + fTPM), `ADR-019` (Dual Root-of-Trust Provisioning Paths), `ADR-020` (U-Boot UEFI + OP-TEE StandaloneMM Authenticated Variable Store), `ADR-034` (Local Composefs OCI Repository & U2F/HSM UKI Re-Signing)

---

## 1. Security Target Introduction (ST_INT)

### 1.1 ST and TOE Identification

| Field | Specification |
|---|---|
| **ST Title** | Security Target for yubiOS ARM64 Secure World (`TF-A BL31` + `OP-TEE OS 4.11` with `fTPM` and `EDK2 StandaloneMM`) |
| **ST Version** | `v0.1` (Phase 1 Accredited Lab Pre-Assessment Draft) |
| **TOE Name** | `yubiOS ARM64 Secure World TEE v0.8.94` |
| **Reference Hardware Platforms** | Primary: **Radxa ROCK 5B (`Rockchip RK3588`, 4x Cortex-A76 + 4x Cortex-A55, ARMv8.2-A TrustZone)**. Secondary: **Pine64 RockPro64 (`Rockchip RK3399`, 2x Cortex-A72 + 4x Cortex-A53, ARMv8-A TrustZone)**. |
| **Pinned Source Revisions (`PINNED.md`)** | `yubi-OS/arm-trusted-firmware` (`BL31 v2.15.0(release):yubiOS-ac450f98c1db`), `yubi-OS/optee_os` (`4.11` `yubios` branch), `yubi-OS/ms-tpm-20-ref` / `optee_ftpm` (`fTPM` early TA), `yubi-OS/edk2` (`StandaloneMM` StMM RPMB/authenticated variable service) |
| **Developer / Sponsor** | yubi-OS Open-Source Project (Crowdfunded Phase 1 `$10,000` Accredited Lab Pre-Test -> Phase 2 `~$100,000` Full Certification) |

### 1.2 TOE Overview

The Target of Evaluation (**TOE**) is the open-source ARM64 Trusted Execution Environment (TEE) firmware and runtime isolation boundary shipped in **yubiOS**. It executes in ARM TrustZone Secure World (`S-EL3` and `S-EL1` / `S-EL0`) and provides isolated cryptographic, platform-measurement, and authenticated UEFI Secure Boot variable services to the Rich Execution Environment (**REE**, comprising `U-Boot 2027.01-rc2` UEFI in `NS-EL2` and the `yubiOS` Linux `7.3.x` kernel in `NS-EL1`).

Unlike conventional mobile TEE deployments where the vendor holds all provisioning keys behind closed NDAs, the yubiOS TOE is architected to pair its **Platform Integrity Root** (OP-TEE `fTPM` + `StandaloneMM`) with an external, owner-held **Identity Root** (a physical **U2F/HSM 5** hardware token held by the machine owner).

---

## 2. Target of Evaluation (TOE) Physical & Logical Boundaries

### 2.1 In-Scope TOE Components (Inside the Evaluation Boundary)

```text
+-----------------------------------------------------------------------------------+
|                      ARMv8-A / ARMv8.2-A SoC (RK3588 / RK3399)                    |
|                                                                                   |
|   SECURE WORLD (TOE BOUNDARY)                  NON-SECURE WORLD (REE - UNTRUSTED) |
|  +-----------------------------------------+  +--------------------------------+  |
|  | S-EL0 Trusted Applications / Services   |  | NS-EL0 Userland (yubiOS)       |  |
|  |  1. fTPM Early TA (ms-tpm-20-ref)       |  |  - yubiOS-enroll (Slot 9a/FIDO)|  |
|  |     - PCRs 0..7, 11 extend & quote      |  |  - yubios-attestd (PCR+PIV)    |  |
|  |     - NV storage over RPMB              |  |  - efi-updatevar / sbverify    |  |
|  |  2. EDK2 StandaloneMM (StMM SP)         |  +--------------------------------+  |
|  |     - UEFI Auth Variables (PK/KEK/db)   |  | NS-EL1 / NS-EL2 (U-Boot/Linux) |  |
|  |     - SetupMode 1 -> 0 enforcement      |  |  - U-Boot UEFI Secure Boot     |  |
|  +-----------------------------------------+  |  - Linux tpm_ftpm_tee driver   |  |
|  | S-EL1 OP-TEE OS 4.11 Kernel             |  |  - optee.ko SMC tee-supplicant |  |
|  |  - Securecarveout: 0x30000000..323fffff |  +--------------------------------+  |
|  |    (36,864 KiB no-map reserved DRAM)    |                 ^                    |
|  |  - GP TEE Internal Core API             |                 | SMC / FFA          |
|  |  - Cryplib (LibTomCrypt / MbedTLS)      |                 v                    |
|  |  - RPMB HMAC-SHA256 authenticated I/O   |  +--------------------------------+  |
|  +-----------------------------------------+  | External Hardware Interfaces   |  |
|  | S-EL3 ARM Trusted Firmware-A (BL31 2.15)|  |  - eMMC RPMB partition         |  |
|  |  - Secure Monitor Call (SMC) dispatcher |  |  - OTP eFuse ROTPK (Path A)    |  |
|  |  - TZMA / Firewalls / CNTPCT secure clk |  |  - Physical U2F/HSM (USB CCID) |  |
|  +-----------------------------------------+  +--------------------------------+  |
+-----------------------------------------------------------------------------------+
```

1. **S-EL3 Monitor (`TF-A BL31 v2.15.0`):**
   - Initializes TrustZone memory firewalls, configures secure interrupts, provides the CNTPCT-backed secure time source (`CFG_SECURE_TIME_SOURCE_CNTPCT`), and dispatches SMC calls between `NS-EL1`/`NS-EL2` and `S-EL1` (`optee_os`).
2. **S-EL1 TEE Kernel (`OP-TEE OS 4.11`):**
   - Occupies the dedicated `36,864 KiB` (`0x30000000..0x323fffff`) `no-map` reserved physical memory region (removed from the Linux kernel linear map in the device tree, verified in `fvf13-224bf224.new` L0094).
   - Enforces MMU separation between S-EL1 kernel space, each S-EL0 Trusted Application (`fTPM` and `StandaloneMM`), and Non-Secure DRAM.
   - Implements the GlobalPlatform TEE Internal Core API and authenticated eMMC Replay Protected Memory Block (**RPMB**) framing using HMAC-SHA-256 derived from the hardware Unique Chip ID / HUK.
3. **S-EL0 Trusted Service 1: `fTPM` Early TA (`optee_ftpm` / `ms-tpm-20-ref`):**
   - Compiled into the OP-TEE core early-TA store so it is available to `U-Boot` (`tpm2_ftpm_tee`) before any normal-world `tee-supplicant` starts.
   - Maintains TPM 2.0 hierarchies, PCR banks (`SHA-256` `PCRs 0..7, 11`), Endorsement/Attestation Keys (`EK`/`AK`), and TPM2 Quote generation (`TPM2_Quote`) consumed by `yubios-attest`.
4. **S-EL0 Trusted Service 2: `EDK2 StandaloneMM` (`StMM`):**
   - Executes in isolated S-EL0 context to service UEFI Runtime Variable requests (`GetVariable`, `SetVariable`, `QueryVariableInfo`) over FF-A / SMC from `U-Boot` and Linux (`efivarfs`).
   - Enforces PKCS#7 / time-based authenticated variable verification (`EFI_VARIABLE_TIME_BASED_AUTHENTICATED_WRITE_ACCESS`) for `PK`, `KEK`, `db`, and `dbx`, transitioning `SetupMode: 1 -> 0` when the owner enrolls their U2F/HSM PIV Slot `9a` certificates during `yubiOS-enroll-sb` (`fvf13` L1835-L1907).

### 2.2 Out-of-Scope (Non-TOE Environment, Treated as Untrusted or Operational Environment)

- **Rich Execution Environment (REE):** `U-Boot` (`NS-EL2`) and the Linux kernel + userland (`NS-EL1`/`NS-EL0`) are outside the TOE and modeled as untrusted callers under the GlobalPlatform `TEE PP` threat model. Even if the REE kernel is compromised at runtime, it must not be able to read or corrupt S-EL1/S-EL0 memory, forge an `fTPM` quote, or bypass `StandaloneMM` signature checks on `PK`/`KEK`/`db`.
- **Owner U2F/HSM Token:** External CCID/FIDO2 hardware token (`YubiKey 5 series`). Acts as an external cryptographic authority whose public certificates (`PK.crt`, `KEK.crt`, `db.crt`) are enrolled into `StandaloneMM` and whose PIV signature binds remote attestation in `yubios-attest`.

---

## 3. Assets, Threats & Security Objectives (Mapped to GlobalPlatform `TEE PP`)

### 3.1 Protected Assets

| Asset ID | Asset | Storage / Location | Security Property |
|---|---|---|---|
| **A.TEE_CODE** | `TF-A BL31`, `OP-TEE OS 4.11`, `fTPM` TA, and `StandaloneMM` binaries | FIP image (`u-boot-rockchip.bin` / SPI / eMMC) & `0x30000000` secure DRAM | Integrity & Authenticity (verified via ROTPK in Path A) |
| **A.TEE_RAM** | Runtime heap, stack, and page tables of `OP-TEE`, `fTPM`, and `StandaloneMM` | `0x30000000..0x323fffff` (`no-map` TZASC-protected DRAM) | Confidentiality & Integrity against REE / DMA |
| **A.SB_VARS** | UEFI Secure Boot authenticated databases (`PK`, `KEK`, `db`, `dbx`, `SetupMode`) | `StandaloneMM` variable store backed by eMMC RPMB | Integrity, Authenticity, & Rollback Protection |
| **A.FTPM_STATE** | `fTPM` NV indices, `EK`/`AK` private keys, and PCR values (`PCRs 0..7, 11`) | `fTPM` S-EL0 memory + encrypted/MACed RPMB frames | Confidentiality (keys), Integrity & Monotonicity (PCRs/NV) |
| **A.HUK_RPMB** | Hardware Unique Key (HUK) and derived 256-bit RPMB HMAC key | SoC OTP / Secure World key ladder | Confidentiality & Non-Exportability |

### 3.2 Threat Model (GlobalPlatform `TEE PP` + `AVA_VAN_AP.3` Attack Catalog)

1. **T.REE_COMPROMISE (Privileged REE Attacker):** A root-level attacker in Linux (`NS-EL1`) attempts to map `0x30000000` via `/dev/mem` or DMA, send malformed SMC/shared-memory buffers to `optee.ko`, or overwrite `PK`/`db` without a valid U2F/HSM PIV Slot `9a` signature.
2. **T.RPMB_REPLAY (Normal-World Storage Interposition):** Because eMMC RPMB frames route through the normal-world `tee-supplicant` block driver, a compromised REE attempts to replay old RPMB frames (e.g., reverting `SetupMode=0` back to `SetupMode=1`) or corrupt NV writes.
3. **T.TA_ISOLATION (Cross-TA / Buffer Confusion):** A vulnerability or malformed input in one S-EL0 service attempts to read memory belonging to another S-EL0 service (`fTPM` vs. `StandaloneMM`) or escalate to S-EL1.
4. **T.SIDE_CHANNEL_FAULT (`AVA_VAN_AP.3`):** Timing side-channels on RSA-2048/ECDSA/HMAC verification in `StandaloneMM` or `fTPM`, cache-timing attacks across Cortex-A76/A55 cores, or voltage/clock glitching during boot-time signature checks.

---

## 4. Security Functional Requirements (SFRs) Mapped to `TEE PP`

| SFR Class | Requirement | yubiOS Implementation & Verification Evidence |
|---|---|---|
| **`FDP_IFC.1` / `FDP_IFF.1`** | Subset Information Flow Control (REE <-> TEE SMC & Shared Memory) | `OP-TEE` validates every shared-memory parameter (`MSG_OP_...`) against non-secure DRAM bounds (`core_mmu_is_ns_ddr`) before dereferencing; rejects overlapping or secure-range pointers. |
| **`FDP_ACC.1` / `FDP_ACF.1`** | Security Attribute Access Control (S-EL0 TA Isolation) | `fTPM` (UUID `bc50d971-d4c9-42c4-82cb-343fb7f37896`) and `StandaloneMM` run in separate S-EL0 virtual address spaces with `ASLR` and strict syscall filtering. |
| **`FCS_COP.1` / `FCS_CKM.1`** | Cryptographic Operations & Key Generation | Constant-time RSA-2048/SHA-256 PKCS#7 verification in `StandaloneMM`; TPM 2.0 ECC-P256 / RSA-2048 quote signing in `fTPM`; HMAC-SHA-256 RPMB frame authentication. |
| **`FDP_SDI.2` / `FRP_rol.1`** | Stored Data Integrity & Rollback Prevention (RPMB) | eMMC RPMB hardware write counter + HMAC-SHA-256 prevents normal-world `tee-supplicant` from replaying older `PK`/`db` or `fTPM` NV states (`OMN-46`). |
| **`FPT_INI.1` / `FPT_TST.1`** | Trusted Boot Initialization & Self-Test | `TF-A BL2/BL31` verifies `OP-TEE` FIP payload (anchored to OTP eFuse ROTPK in Path A, `OMN-45`); `OP-TEE` initializes `fTPM` and emits `YUBIOS_TPM_OK` before `U-Boot` BL33 runs. |

---

## 5. Phase 1 ($10,000) Accredited Lab Pre-Test Plan (`OMN-203` Execution Checklist)

1. **Work Package 1 (`$4,500`) - Accredited Lab TOE & Architecture Review:**
   - Deliver this `ST-YUBIOS-OPTEE-ARM64-V0.1` draft, the pinned `yubi-OS/optee_os` (`4.11`) + `yubi-OS/arm-trusted-firmware` (`v2.15.0`) source trees, and two pre-provisioned **Radxa ROCK 5B (`rk3588`, 16 GB)** boards to the selected GlobalPlatform-accredited security laboratory.
   - Review the HUK derivation path and TZASC/firewall configuration on `RK3588` and `RK3399` against `TEE PP` `AVA_VAN_AP.3` requirements.
2. **Work Package 2 (`$2,500`) - Automated Conformance & Fuzzing Harness in CI:**
   - Wire OP-TEE `xtest` (including regression suites `1000..8000`, GlobalPlatform TEE Internal Core API conformance tests, and `pkcs11`/`ftpm` suites) plus an SMC shared-memory boundary fuzzer into `yubi-OS/yubiOS` GitHub Actions CI.
3. **Work Package 3 (`$2,000`) - Sacrificial Hardware Fuse (`OMN-45`) & eMMC RPMB (`OMN-46`) Closure:**
   - Attach eMMC module on ROCK 5B (`fe2e0000.mmc`), program the RPMB key, and capture power-loss persistence and replay-rejection logs (`OMN-46`).
   - Rehearse and record irreversible OTP eFuse ROTPK burning on a sacrificial ROCK 5B board (`OMN-45`) to close the `B-ARM64-PATHA` hardware gate.
4. **Work Package 4 (`$1,000`) - Pre-Assessment Report Publication & Campaign 2 Gate:**
   - Publish the accredited laboratory's Pre-Assessment Gap Report and finalized `ST v1.0` in `yubi-OS/yubiOS/refs/`, opening **Campaign 2 (`~$100,000` goal, `OMN-206`)** for formal GlobalPlatform Certification Body filing and 3-month full evaluation.
