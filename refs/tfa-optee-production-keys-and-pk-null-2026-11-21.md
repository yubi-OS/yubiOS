# TF-A, OP-TEE, and UEFI Secure Boot Production Key Hierarchy (PIV Slot 9a + SoftHSM2 Fallback & Enforced-Boot `PK_null.auth`)

Date: 2026-11-21
Linear: OMN-45, OMN-46
Repos: `yubi-OS/yubiOS`, `yubi-OS/optee_os`, `yubi-OS/arm-trusted-firmware`, `yubi-OS/u-boot`

## 1. Summary of Upstream Default Keys & Production Replacements

Upstream ARM Trusted Firmware-A (TF-A), OP-TEE OS, and Rockchip U-Boot SPL ship with developer keys or stubbed entropy sources by default. Every layer must chain to the owner's U2F/HSM PIV slot `9a` (or the deterministic `swu2f` + SoftHSM2 PKCS#11 slot `9a` fallback in headless CI) before production hardware lockdown.

| Layer / Component | Upstream Default / Dev Behavior | Production Risk if Left Default | yubiOS Production Configuration |
|---|---|---|---|
| **UEFI Secure Boot (`PK`, `KEK`, `db`)** | U-Boot `efi_init_variables()` seeds initial `/EFI/yubiOS/secureboot/{db,KEK,PK}.auth` into StMM on first boot (`SetupMode=0`, `SecureBoot=1`), blocking `enroll-sb.sh` if `SetupMode=1` is required upfront | Either first boot runs un-enforced (`SetupMode=1`), or `enroll-sb.sh` cannot transition from initial keys to owner hardware keys | **Path 1 (`PK_null.auth`)**: ship initial `PK.auth` (`T_INIT = EPOCH - 120s`) + pre-signed `0`-byte `null.esl` (`PK_null.auth` at `T_NULL = EPOCH - 60s`). First boot runs enforced (`SetupMode=0`); `enroll-sb.sh` applies `PK_null.auth` (`SetupMode=0 -> 1`), enrolls owner PIV slot `9a` keys (`SetupMode=1 -> 0`), and deletes `PK_null.auth`. |
| **OP-TEE TA Signing (`TA_SIGN_KEY` / `TA_PUBLIC_KEY`)** | `TA_SIGN_KEY ?= keys/default_ta.pem` (public RSA-2048 private key committed in `optee_os`), `CFG_REE_FS_TA ?= y`, `CFG_INSECURE ?= y` (`mk/config.mk:254, 1076`) | Any normal-world root process can sign a malicious `.ta` with the public `keys/default_ta.pem` and execute code in Secure-EL0 (`S-EL0`) | Stage RSA-2048 key in U2F/HSM PIV slot `9a` (`libykcs11.so` when USB VID `1050` is attached; `swu2f` + SoftHSM2 `libsofthsm2.so` fallback in CI). Pass `TA_PUBLIC_KEY=$WORK_DIR/slot9a-pub.pem`, sign `optee_ftpm` via PKCS#11, and set **`CFG_REE_FS_TA=n`** + **`CFG_INSECURE=n`**. |
| **OP-TEE Hardware Unique Key (`HUK`)** | `rk3588` (`platform_rk3588.c:1372`) generates 128-bit HUK from `TRNG_S` (`0xfe370000`) and writes to Secure OTP (`ROCKCHIP_OTP_HUK_INDEX`). `rk3399` and `rk3568` fall back to `core/kernel/otp_stubs.c` (`16` zero bytes) | On platforms using `otp_stubs.c`, the derived eMMC RPMB HMAC key and Secure Storage Key (`SSK`) are static/predictable from the public eMMC CID | Keep `rk3588` hardware `TRNG_S` -> Secure OTP HUK path active (`CFG_ROCKCHIP_OTP=y`). Gate `rk3399`/`rk3568` production RPMB claims on wiring Secure OTP HUK reads into `tee_otp_get_hw_unique_key()`. |
| **OP-TEE Rockchip OTP Secure Boot Fuse Gate** | `core/arch/arm/plat-rockchip/conf.mk:206-210` sets `CFG_RK_SECURE_BOOT ?= y` and `CFG_RK_SECURE_BOOT_SIMULATION ?= y` | Setting `CFG_RK_SECURE_BOOT_SIMULATION=n` burns one-way SoC OTP fuses permanently | Wire `CFG_RK_SECURE_BOOT=y` and control `CFG_RK_SECURE_BOOT_SIMULATION` via workflow input `burn_otp_fuses` (**default `false` -> `CFG_RK_SECURE_BOOT_SIMULATION=y`**). Never set `burn_otp_fuses=true` until rehearsing on a sacrificial board (OMN-45). |
| **TF-A Trusted Board Boot (`ROT_KEY` / CoT)** | Without `ROT_KEY`, TF-A uses `arm_rotprivk_rsa.pem` or generates ephemeral keys via `CREATE_KEYS=1` (`cert_create -n`) | FIP certificates chain to a public sample key or an un-retained throwaway build key | Stage slot `9a` key via `scripts/lib/stage-firmware-pkcs11-keys.sh` (physical U2F/HSM `1050:*` when present, else deterministic SoftHSM2 token `yubiOS-ci`), pass `ROT_KEY` / CoT keys to TF-A `cert_create`, and record `rotpk_sha256.hex` + `rotpk_sha256.bin`. |

---

## 2. Path 1: Enforced First-Boot + `PK_null.auth` Blank ESL Auto-Unlock

### 2.1 Why First Boot Starts in `SetupMode=0`
On Rockchip ARM64 boards (`rock5b-rk3588`, `rockpro64-rk3399`, `pinetab2-rk3566`), U-Boot's `efi_init_variables()` (`lib/efi_loader/efi_variable_tee.c`) checks `!efi_secure_boot_enabled()` at boot and loads three exact paths from the ESP into OP-TEE StandaloneMM (`StMM`):

1. `/EFI/yubiOS/secureboot/db.auth` -> `db` (`EFI_IMAGE_SECURITY_DATABASE_GUID`)
2. `/EFI/yubiOS/secureboot/KEK.auth` -> `KEK` (`EFI_GLOBAL_VARIABLE_GUID`)
3. `/EFI/yubiOS/secureboot/PK.auth` -> `PK` (`EFI_GLOBAL_VARIABLE_GUID`)

Because `PK.auth` is enrolled before `systemd-boot` and the UKI execute, the board boots into Linux with **UEFI Secure Boot enforced (`SetupMode=0`, `SecureBoot=1`)** from the very first boot.

### 2.2 Pre-Signed `PK_null.auth` Unlock Ticket (`stage-ci-sb-keys.sh` & `flash-device-e2e.sh`)
In UEFI (`EFI_VARIABLE_TIME_BASED_AUTHENTICATED_WRITE_ACCESS`), clearing `PK` in User Mode (`SetupMode=0`) requires a signed variable update whose payload is a `0`-byte signature list (`null.esl`), signed by the currently active `PK` with an `EFI_TIME` timestamp strictly newer than the stored `PK` variable's timestamp:

```sh
INIT_EPOCH=$(( EPOCH - 120 ))
NULL_EPOCH=$(( EPOCH - 60 ))
T_STR="$(date -u -d "@${INIT_EPOCH}" '+%Y-%m-%d %H:%M:%S')"
T_NULL_STR="$(date -u -d "@${NULL_EPOCH}" '+%Y-%m-%d %H:%M:%S')"

: > null.esl
sign-efi-sig-list -c PK.crt -t "$T_NULL_STR" -o PK null.esl PK_null.forsig
openssl smime -sign -binary -provider pkcs11 -provider default \
  -in PK_null.forsig -out PK_null.signed \
  -signer PK.crt -inkey "$sb_key_uri" -outform DER -md sha256
sign-efi-sig-list -i PK_null.signed -t "$T_NULL_STR" PK null.esl PK_null.auth
```

This guarantees the strict timestamp ordering across every stage, even on boards booting offline without an RTC coin cell:

$$
T_{\text{INIT}} = \text{EPOCH} - 120 < T_{\text{NULL}} = \text{EPOCH} - 60 < \text{EPOCH} \le T_{\text{ENROLL}}
$$

### 2.3 In-OS Null -> Owner Re-Enrollment (`usr/lib/yubiOS/enroll-sb.sh`)
When `/usr/lib/yubiOS/enroll.sh` invokes `/usr/lib/yubiOS/enroll-sb.sh` on the booted board:
1. If `SetupMode=0` and `/var/lib/yubiOS/.sb-enrolled` does not exist, `phase_enroll` locates `PK_null.auth` (checking `$ESP/EFI/yubiOS/keys/PK_null.auth`, `$ESP/EFI/yubiOS/secureboot/PK_null.auth`, `$KEYDIR/PK_null.auth`, and `/usr/lib/yubiOS/secureboot/PK_null.auth`) and runs:
   ```sh
   efi-updatevar -f "$pk_null" PK
   ```
2. StMM verifies `PK_null.auth` against the active initial `PK`, clears `PK`, and transitions `SetupMode` from `0` to `1` inside the running Secure Boot-enforced OS.
3. `phase_enroll` mints and signs the owner's `PK.auth`, `KEK.auth`, and `db.auth` using the physical U2F/HSM PIV slot `9a` (`pkcs11:id=%01;type=private`) at `T="$(date -u '+%Y-%m-%d %H:%M:%S')"`, writes them to StMM (`SetupMode` -> `0`), overwrites `/boot/EFI/yubiOS/{secureboot,keys}/{PK,KEK,db}.auth`, and deletes `PK_null.auth` + `null.esl` from `/var/lib/yubiOS/secureboot/` and `/boot/EFI/yubiOS/{secureboot,keys}/`.
4. Even though `/usr/lib/yubiOS/secureboot/PK_null.auth` remains in the read-only composefs `/usr` image, it is cryptographically inert once the owner's `PK` is enrolled in StMM because StMM rejects any `PK` update not signed by the active owner `PK`.

---

## 3. OP-TEE & TF-A PKCS#11 Key Ceremony (`scripts/lib/stage-firmware-pkcs11-keys.sh`)

### 3.1 Dual-Path Hardware / SoftHSM2 PKCS#11 Selection
Matches `usr/lib/yubiOS/uki/stage-ci-sb-keys.sh`:
1. **Physical U2F/HSM present (`1050:*` on USB):**
   - Uses `libykcs11.so` against PIV slot `9a` (`pkcs11:id=%01;type=private?pin-value=${PIV_PIN}`).
   - Exports `slot9a-pub.pem` (`TA_PUBLIC_KEY`) and `slot9a-cert.pem`.
2. **Headless CI fallback (no physical U2F/HSM attached):**
   - Starts `passless` (`swu2f` on `/dev/uhid` when present) and initializes a SoftHSM2 token (`yubiOS-ci`, slot `9a` / `id=%01`, `libsofthsm2.so`).
   - Derives the fallback RSA-2048 keypair deterministically from `GITHUB_SHA` + `SOURCE_DATE_EPOCH` before importing it into SoftHSM2 (`softhsm2-util --import`), so the two isolated ARM64 builds (`arm64` and `arm64-repro`) embed identical `TA_PUBLIC_KEY` modulus/exponent bytes in `tee-header_v2.bin` and pass `scripts/verify-reproducible-firmware.py`.

### 3.2 OP-TEE Build Hardening (`ci_firmware-rk.yml`)
- Passes `TA_PUBLIC_KEY="$FW_KEY_DIR/slot9a-pub.pem"`, `TA_SIGN_KEY="$FW_KEY_DIR/ta-sign-key.pem"` (backed by the slot `9a` key and verified via PKCS#11 `openssl pkeyutl -sign` + `sign_encrypt.py verify`), **`CFG_REE_FS_TA=n`**, and **`CFG_INSECURE=n`** to `optee_os`.
- Passes **`CFG_RK_SECURE_BOOT=y`** and **`CFG_RK_SECURE_BOOT_SIMULATION=y`** (when `burn_otp_fuses != 'true'`), keeping OTP fuse writes in simulation mode until explicitly enabled for the OMN-45 hardware fuse rehearsal.

### 3.3 TF-A CoT & ROTPK Digest Output
- Replaces `CREATE_KEYS=1` in TF-A with explicit key arguments (`ROT_KEY`, `TRUSTED_WORLD_KEY`, `NON_TRUSTED_WORLD_KEY`, `SCP_BL2_KEY`, `BL31_KEY`, `BL32_KEY`, `BL33_KEY`) backed by the staged slot `9a` key.
- Computes the 256-bit SHA-256 digest over the DER SubjectPublicKeyInfo of `slot9a-pub.pem` (`rotpk_sha256.hex` and `rotpk_sha256.bin`) and records `rotpk_sha256`, `key_source` (`u2f_hsm_slot9a` or `swu2f_softhsm2_slot9a`), `optee_cfg_insecure=n`, `optee_cfg_ree_fs_ta=n`, and `otp_fuse_simulation` (`y` by default) in `firmware-manifest.txt`.
