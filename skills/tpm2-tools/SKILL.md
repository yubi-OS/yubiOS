---
name: tpm2-tools
description: "Operate, script, and debug the complete 103-command tpm2-tools TSS2 CLI suite on yubiOS (hardware TPM 2.0, ARM64 OP-TEE fTPM via /dev/tpmrm0, and QEMU swtpm in bcvk CI). Covers multiplexed tpm2 dispatch, TCTI configuration, hierarchy and primary key creation, EK/AK provisioning and credential activation, PCR read/extend/eventlog inspection, TPM2 quotes and object/NV certification, transient/persistent context management, sealing/unsealing, all 21 Enhanced Authorization policy commands, NV RAM counters/bitfields/locks, cryptographic signing/encryption/ECDH/two-phase key exchange, and error decoding. Triggers on: tpm2-tools, tpm2, tpm2_pcrread, tpm2_quote, tpm2_createprimary, tpm2_createek, tpm2_createak, tpm2_nvdefine, tpm2_policypcr, tpm2_policyauthorize, tpm2_unseal, tpm2_getcap, tpm2_eventlog, tpm2_rc_decode, TPM2TOOLS_TCTI."
metadata:
  short-description: "Complete 103-command tpm2-tools CLI reference and yubiOS operational guide"
---

# TPM2 Tools (tpm2-tools)

## Overview

`tpm2-tools` is the official TCG Software Stack (TSS2) command-line suite (`tpm2-software/tpm2-tools`, built on `tpm2-tss` ESAPI/FAPI/TCTI) providing 103 commands (`tpm2` multiplexed dispatcher plus 102 `tpm2_*` subcommands). On yubiOS, `tpm2-tools` is the userspace interface for inspecting, provisioning, attesting, and testing platform integrity across bare-metal TPM 2.0 chips, ARM64 OP-TEE firmware TPMs (`tpm_ftpm_tee` on RK3588 ROCK 5B and RK3566 PineTab2), and virtualized `swtpm` instances in `bcvk` / QEMU CI.

This skill is derived from the 103-document Clef-weighted corpus at `yubi-OS/knowledge` (`knowledge/tpm2-tools/001-tpm2.md` through `103-tpm2-zgen2phase.md`, synced at `skills/tpm2-tools/`), where every subcommand has its own dedicated reference document backed by upstream `man/*.1.md` specifications and Clef `@cf/cloudflare/clef` source weighting.

## When to Use

- Running or scripting any of the 103 `tpm2-tools` commands (`tpm2`, `tpm2_pcrread`, `tpm2_quote`, `tpm2_createprimary`, `tpm2_createek`, `tpm2_createak`, `tpm2_nvdefine`, `tpm2_policypcr`, `tpm2_unseal`, `tpm2_getcap`, `tpm2_eventlog`, `tpm2_rc_decode`, etc.).
- Verifying measured boot PCR banks (`sha256` PCRs 0-15) and parsing binary UEFI/ firmware event logs (`/sys/kernel/security/tpm0/binary_bios_measurements`) with `tpm2_eventlog` and `tpm2_pcrread`.
- Generating and verifying hardware-rooted remote attestation quotes (`tpm2_createek`, `tpm2_createak`, `tpm2_makecredential`, `tpm2_activatecredential`, `tpm2_quote`, `tpm2_checkquote`) for `runtime-attestation-keylime` or `audit-evidence-packaging`.
- Authoring Enhanced Authorization (EA) policy sessions (`tpm2_startauthsession`, `tpm2_policypcr`, `tpm2_policyor`, `tpm2_policyauthorize`, `tpm2_policyauthorizenv`, `tpm2_policysigned`) that bind sealed secrets or NV indices to PCR states and rotatable signing keys.
- Managing Non-Volatile (NV) monotonic counters, bitfields, extend indices, and read/write locks (`tpm2_nvdefine`, `tpm2_nvwrite`, `tpm2_nvread`, `tpm2_nvincrement`, `tpm2_nvextend`, `tpm2_nvsetbits`, `tpm2_nvwritelock`, `tpm2_nvreadlock`).
- Debugging TPM2 return codes (`tpm2_rc_decode`), inspecting saved context/public/tpms_attest blobs (`tpm2_print`), or probing algorithm/command/handle capabilities (`tpm2_getcap`, `tpm2_testparms`).

## When NOT to Use

- **Compiling OP-TEE `optee_ftpm` or debugging SMC/RPMB early-boot handoff:** route to `ftpm-optee-tpm` and `arm-trusted-firmware-optee`.
- **Enrolling U2F/HSM FIDO2/PIV tokens for LUKS2 unlock, SSH, PAM, or UKI Secure Boot signing:** route to `yubikey-operations` (in yubiOS, U2F/HSM holds user identity and owner Secure Boot keys on PIV slot 9a, while the TPM/fTPM measures platform state).
- **High-level Keylime registrar/verifier orchestration or Rekor v2 transparency-log bundling:** route to `runtime-attestation-keylime`, `audit-evidence-packaging`, and `sigstore-rekor-v2` (which invoke `tpm2-tools` under the hood).

## Architecture, Multiplexed Dispatch & TCTI Selection

### 1. BusyBox-Style Multiplexed Binary (`001-tpm2.md`)

`tpm2` (`man/tpm2.1.md`) compiles all 102 tools into a single small executable for initrd and embedded images. Every `tpm2_<subcommand>` binary is a soft link to `tpm2`:

```bash
# Equivalent invocations:
tpm2_getrandom --hex 16
tpm2 getrandom --hex 16

tpm2_pcrread sha256:0,4,7,11,14
tpm2 pcrread sha256:0,4,7,11,14
```

### 2. TCTI (TPM Command Transmission Interface) & Resource Manager

Always target the in-kernel TPM resource manager (`/dev/tpmrm0`) rather than raw `/dev/tpm0` so transient object contexts and sessions are automatically isolated and flushed per process:

| Environment | `TPM2TOOLS_TCTI` / `-T` (`--tcti`) Value | Notes |
|---|---|---|
| Bare-metal TPM 2.0 or ARM64 OP-TEE `tpm_ftpm_tee` | `device:/dev/tpmrm0` (default when `/dev/tpmrm0` exists) | Kernel resource manager handles transient slot paging (3 active object slots in TPM SRAM). |
| Raw character device (single-process initrd debug only) | `device:/dev/tpm0` | No kernel context paging; caller must run `tpm2_flushcontext -t` manually to avoid `TPM_RC_OBJECT_MEMORY` (`0x902`). |
| QEMU `swtpm` socket (`bcvk` / VM CI) | `swtpm:path=/run/swtpm/tpm-sock` or `swtpm:host=127.0.0.1,port=2321` | Used in `ci_test-vm.yml` and `ci_test-vgpu-vm.yml` when testing outside guest `/dev/tpmrm0`. |
| Userspace daemon (`tpm2-abrmd`, legacy) | `tabrmd:bus_name=com.intel.tss2.Tabrmd` | Superseded on Linux >= 4.12 by `/dev/tpmrm0`; avoid in yubiOS images. |

### 3. Common Options, Auth Syntax & Specifiers (`man/common/*.md`)

- **TCTI:** `-T` / `--tcti=<tcti-name>[:<config-string>]` or env `TPM2TOOLS_TCTI`.
- **Auth strings (`man/common/authorizations.md`):**
  - Plain string: `str:mysecret` (or bare `mysecret`)
  - Hex bytes: `hex:1a2b3c...`
  - File input: `file:/run/secrets/tpm.auth` or `file:-` (stdin)
  - Policy/HMAC session: `session:/tmp/policy.ctx` (or `session:/tmp/policy.ctx+str:pin` when mixing policy + authValue)
  - PCR session shorthand: `pcr:sha256:0,7=/tmp/pcr.bin`
- **Hierarchies (`-C` / `--hierarchy`):** `o` (`TPM_RH_OWNER`), `p` (`TPM_RH_PLATFORM`), `e` (`TPM_RH_ENDORSEMENT`), `n` (`TPM_RH_NULL`), or permanent handle hex (`0x40000001`).
- **PCR Bank Selection (`man/common/pcr.md`):** `<alg>:<idx1>,<idx2>+...`, e.g. `sha256:0,2,4,7,11,14` or `sha256:all`.
- **Key & Hash Algorithms (`man/common/alg.md`):** `rsa` (`rsa2048`), `ecc` (`ecc256` / `nist_p256`, `ecc384`), `aes` (`aes128cfb`, `aes256cfb`), `keyedhash`, `sha256`, `sha384`, `sha512`, `sm3_256`.
- **Parameter Encryption & Auditing:** `--cphash=<file>` records the command parameter hash without executing on the TPM (when supported) for offline policy signing (`tpm2_policycphash`); `--rphash=<file>` records the response parameter hash.

## Complete 103-Command Reference Matrix (Derived from `yubi-OS/knowledge` Corpus)

Every subcommand below maps 1:1 to its authored document in `yubi-OS/knowledge/tree/main/knowledge/tpm2-tools/` (and `skills/tpm2-tools/`):

| NN | Command | Corpus Doc | Primary Flags | Scope & Function | Clef Outline / Max Source Weight |
|---|---|---|---|---|---|
| `001` | `tpm2` | `001-tpm2.md` | `(positional / common options)` | A single small executable that combines the various tpm2-tools much like a BusyBox that provides a fairly complete environment for any small or embedded system. | 1.6236 / 0.9920 |
| `002` | `tpm2_activatecredential` | `002-tpm2-activatecredential.md` | `-c/--credentialedkey-context, -C/--credentialkey-context, -p/--credentialedkey-auth, -P/--credentialkey-auth, -i/--credential-blob` | Enables access to the credential qualifier to recover the credential secret. | 1.3522 / 0.9903 |
| `003` | `tpm2_certify` | `003-tpm2-certify.md` | `-c/--certifiedkey-context, -C/--signingkey-context, -P/--certifiedkey-auth, -g/--hash-algorithm, -p/--signingkey-auth` | Prove that an object is loaded in the TPM. | 1.8667 / 0.9898 |
| `004` | `tpm2_certifyX509certutil` | `004-tpm2-certifyx509certutil.md` | `-o/--outcert, -d/--days, -i/--issuer, -s/--subject` | Generate partial X509 certificate. | 1.0337 / 0.9921 |
| `005` | `tpm2_certifycreation` | `005-tpm2-certifycreation.md` | `-C/--signingkey-context, -P/--signingkey-auth, -c/--certifiedkey-context, -g/--hash-algorithm, -s/--scheme` | Attest the association between a loaded public area and the provided hash of the creation data. | 1.0571 / 0.9913 |
| `006` | `tpm2_changeauth` | `006-tpm2-changeauth.md` | `-c/--object-context, -p/--object-auth, -C/--parent-context, -r/--private, -S/--session` | Changes authorization values for TPM objects. | 1.8706 / 0.9926 |
| `007` | `tpm2_changeeps` | `007-tpm2-changeeps.md` | `-p/--auth, -S/--session` | Replaces the active endorsement primary seed with a new one generated off the TPM2 RNG. | 0.8473 / 0.9906 |
| `008` | `tpm2_changepps` | `008-tpm2-changepps.md` | `-p/--auth, -S/--session` | Replaces the active platform primary seed with a new one generated off the TPM2 RNG. | 0.7737 / 0.9908 |
| `009` | `tpm2_checkquote` | `009-tpm2-checkquote.md` | `-u/--public, -g/--hash-algorithm, -m/--message, -s/--signature, -f/--pcr` | Validates a quote provided by a TPM. | 1.7514 / 0.9925 |
| `010` | `tpm2_clear` | `010-tpm2-clear.md` | `-c/--auth-hierarchy` | Clears lockout, endorsement and owner hierarchy authorization values and other TPM data. | 1.8929 / 0.9897 |
| `011` | `tpm2_clearcontrol` | `011-tpm2-clearcontrol.md` | `-C/--hierarchy, -P/--auth` | Set/ Clear TPMA_PERMANENT.disableClear attribute to effectively block/ unblock lockout authorization handle for issuing TPM clear. | 0.7732 / 0.9885 |
| `012` | `tpm2_clockrateadjust` | `012-tpm2-clockrateadjust.md` | `-c/--hierarchy, -p/--auth` | Sets the clock rate period on the TPM. | 0.5666 / 0.9875 |
| `013` | `tpm2_commit` | `013-tpm2-commit.md` | `-u/--public, -t/--counter, -p/--auth, -c/--context` | Performs the first part of an ECC anonymous signing operation. | 0.8297 / 0.9906 |
| `014` | `tpm2_create` | `014-tpm2-create.md` | `-C/--parent-context, -P/--parent-auth, -p/--key-auth, -g/--hash-algorithm, -G/--key-algorithm` | Create a child object. | 1.9634 / 0.9910 |
| `015` | `tpm2_createak` | `015-tpm2-createak.md` | `-P/--eh-auth, -p/--ak-auth, -C/--ek-context, -c/--ak-context, -G/--key-algorithm` | Generate attestation key with given algorithm under the endorsement hierarchy. | 1.6666 / 0.9883 |
| `016` | `tpm2_createek` | `016-tpm2-createek.md` | `-P/--eh-auth, -w/--owner-auth, -c/--ek-context, -G/--key-algorithm, -u/--public` | Generate TCG profile compliant endorsement key. | 1.7898 / 0.9881 |
| `017` | `tpm2_createpolicy` | `017-tpm2-createpolicy.md` | `-L/--policy, -g/--policy-algorithm, -l/--pcr-list, -f/--pcr` | Creates simple assertion authorization policies based on multiple PCR indices values across multiple enabled banks. | 1.8577 / 0.9894 |
| `018` | `tpm2_createprimary` | `018-tpm2-createprimary.md` | `-C/--hierarchy, -P/--hierarchy-auth, -p/--key-auth, -g/--hash-algorithm, -G/--key-algorithm` | Create a primary key. | 1.9270 / 0.9907 |
| `019` | `tpm2_dictionarylockout` | `019-tpm2-dictionarylockout.md` | `-s/--setup-parameters, -c/--clear-lockout, -l/--lockout-recovery-time, -t/--recovery-time, -n/--max-tries` | Setup or clear dictionary-attack-lockout parameters. | 0.8363 / 0.9898 |
| `020` | `tpm2_duplicate` | `020-tpm2-duplicate.md` | `-G/--wrapper-algorithm, -G/--key-algorithm, -i/--encryptionkey-in, -o/--encryptionkey-out, -C/--parent-context` | Duplicates a loaded object so that it may be used in a different hierarchy. | 1.4671 / 0.9899 |
| `021` | `tpm2_ecdhkeygen` | `021-tpm2-ecdhkeygen.md` | `-c/--context, -u/--public, -o/--output` | Creates an ephemeral key and uses it to generate the shared secret value using the parameters from a ECC public key. | 0.9129 / 0.9897 |
| `022` | `tpm2_ecdhzgen` | `022-tpm2-ecdhzgen.md` | `-c/--key-context, -p/--key-auth, -u/--public, -k/--public-key, -o/--output` | Recovers the shared secret value (Z) from a public point and a specified private key. | 0.9116 / 0.9888 |
| `023` | `tpm2_ecephemeral` | `023-tpm2-ecephemeral.md` | `-u/--public, -t/--counter` | Creates an ephemeral key for use in a two-phase key exchange protocol. | 0.8320 / 0.9908 |
| `024` | `tpm2_encodeobject` | `024-tpm2-encodeobject.md` | `-C/--parent-context, -P/--auth, -u/--public, -r/--private, -p/--key-auth` | Encode an object into a combined PEM format. | 1.1502 / 0.9899 |
| `025` | `tpm2_encryptdecrypt` | `025-tpm2-encryptdecrypt.md` | `-c/--key-context, -p/--auth, -d/--decrypt, -e/--pad, -o/--output` | Performs symmetric encryption or decryption. | 1.5301 / 0.9856 |
| `026` | `tpm2_eventlog` | `026-tpm2-eventlog.md` | `--eventlog-version` | Display tpm2 event log. | 1.6146 / 0.9905 |
| `027` | `tpm2_evictcontrol` | `027-tpm2-evictcontrol.md` | `-C/--hierarchy, -c/--object-context, -P/--auth, -o/--output` | Make a transient object persistent or evict a persistent object. | 1.8369 / 0.9921 |
| `028` | `tpm2_flushcontext` | `028-tpm2-flushcontext.md` | `-t/--transient-object, -l/--loaded-session, -s/--saved-session` | Remove a specified handle, or all contexts associated with a transient object, loaded session or saved session from the TPM. | 1.2560 / 0.9911 |
| `029` | `tpm2_getcap` | `029-tpm2-getcap.md` | `-l/--list` | Display TPM capabilities in a human readable form. | 1.5075 / 0.9909 |
| `030` | `tpm2_getcommandauditdigest` | `030-tpm2-getcommandauditdigest.md` | `-P/--hierarchy-auth, -c/--key-context, -p/--auth, -q/--qualification, -s/--signature` | Retrieve the command audit attestation data from the TPM. | 0.8592 / 0.9912 |
| `031` | `tpm2_geteccparameters` | `031-tpm2-geteccparameters.md` | `-o/--output` | Retrieves the parameters of an ECC curve identified by its TCG-assigned curveID. | 1.0187 / 0.9909 |
| `032` | `tpm2_getekcertificate` | `032-tpm2-getekcertificate.md` | `-o/--ek-certificate, -X/--allow-unverified, -u/--ek-public, -x/--offline, -E/--encoding` | Retrieve the Endorsement key Certificate. | 1.4076 / 0.9924 |
| `033` | `tpm2_getpolicydigest` | `033-tpm2-getpolicydigest.md` | `-o/--output, -S/--session` | Retrieves the policy digest from session. | 1.2870 / 0.9853 |
| `034` | `tpm2_getrandom` | `034-tpm2-getrandom.md` | `-o/--output, -f/--force, -S/--session` | Retrieves random bytes from the TPM. | 1.6638 / 0.9877 |
| `035` | `tpm2_getsessionauditdigest` | `035-tpm2-getsessionauditdigest.md` | `-P/--hierarchy-auth, -c/--key-context, -p/--auth, -q/--qualification, -s/--signature` | Retrieve the command audit attestation data from the TPM. | 1.0599 / 0.9873 |
| `036` | `tpm2_gettestresult` | `036-tpm2-gettestresult.md` | `(positional / common options)` | Get the result of tests performed by the TPM | 0.7807 / 0.9895 |
| `037` | `tpm2_gettime` | `037-tpm2-gettime.md` | `-c/--key-context, -p/--auth, -P/--endorse-auth, -g/--hash-algorithm, -s/--scheme` | Get the current time and clock from the TPM in a signed form. | 1.4566 / 0.9906 |
| `038` | `tpm2_hash` | `038-tpm2-hash.md` | `-C/--hierarchy, -g/--hash-algorithm, -o/--output, -t/--ticket` | Performs a hash operation with the TPM. | 1.9492 / 0.9883 |
| `039` | `tpm2_hierarchycontrol` | `039-tpm2-hierarchycontrol.md` | `-C/--hierarchy, -P/--hierarchy-auth` | Enable and disable use of a hierarchy and its associated NV storage. | 1.6463 / 0.9911 |
| `040` | `tpm2_hmac` | `040-tpm2-hmac.md` | `-c/--key-context, -p/--auth, -g/--hash-algorithm, -o/--output, -t/--ticket` | Performs an HMAC operation with the TPM. | 1.3664 / 0.9895 |
| `041` | `tpm2_import` | `041-tpm2-import.md` | `-G/--key-algorithm, -g/--hash-algorithm, -i/--input, -C/--parent-context, -U/--parent-public` | Imports an external key into the tpm as a TPM managed key object. | 1.9262 / 0.9916 |
| `042` | `tpm2_incrementalselftest` | `042-tpm2-incrementalselftest.md` | `(positional / common options)` | Request testing of specified algorithm list | 0.7707 / 0.9896 |
| `043` | `tpm2_load` | `043-tpm2-load.md` | `-C/--parent-context, -P/--auth, -u/--public, -r/--private, -n/--name` | Load an object into the TPM. | 1.9689 / 0.9897 |
| `044` | `tpm2_loadexternal` | `044-tpm2-loadexternal.md` | `-C/--hierarchy, -G/--key-algorithm, -u/--public, -r/--private, -p/--auth` | Load an external object into the TPM. | 1.5808 / 0.9915 |
| `045` | `tpm2_makecredential` | `045-tpm2-makecredential.md` | `-e/--encryption-key, -u/--public, -G/--key-algorithm, -s/--secret, -n/--name` | Generate the encrypted-user-chosen-data and the wrapped-secret-data-encryption-key for the privacy-sensitive credentialing process of a TPM object. | 1.3974 / 0.9912 |
| `046` | `tpm2_nvcertify` | `046-tpm2-nvcertify.md` | `-C/--signingkey-context, -P/--signingkey-auth, -c/--nvauthobj-context, -p/--nvauthobj-auth, -g/--hash-algorithm` | Provides attestation of the contents of an NV index. | 1.4280 / 0.9886 |
| `047` | `tpm2_nvdefine` | `047-tpm2-nvdefine.md` | `-C/--hierarchy, -s/--size, -g/--hash-algorithm, -a/--attributes, -P/--hierarchy-auth` | Define a TPM Non-Volatile (NV) index. | 1.9357 / 0.9896 |
| `048` | `tpm2_nvextend` | `048-tpm2-nvextend.md` | `-C/--hierarchy, -P/--auth, -i/--input, -S/--session, -n/--name` | Extend an Non-Volatile (NV) index like it was a PCR. | 1.2504 / 0.9905 |
| `049` | `tpm2_nvincrement` | `049-tpm2-nvincrement.md` | `-C/--hierarchy, -P/--auth, -S/--session, -n/--name` | Increment counter in a Non-Volatile (NV) index. | 0.9093 / 0.9906 |
| `050` | `tpm2_nvread` | `050-tpm2-nvread.md` | `-C/--hierarchy, -o/--output, -P/--auth, -s/--size, -n/--name` | Read the data stored in a Non-Volatile (NV)s index. | 1.9231 / 0.9903 |
| `051` | `tpm2_nvreadlock` | `051-tpm2-nvreadlock.md` | `-C/--hierarchy, -P/--auth, -S/--session, -n/--name` | Lock the Non-Volatile (NV) index for further reads. | 0.7736 / 0.9894 |
| `052` | `tpm2_nvreadpublic` | `052-tpm2-nvreadpublic.md` | `-S/--session, -n/--name` | Display all defined Non-Volatile (NV)s indices. | 1.5205 / 0.9884 |
| `053` | `tpm2_nvsetbits` | `053-tpm2-nvsetbits.md` | `-C/--hierarchy, -P/--auth, -i/--bits, -S/--session, -n/--name` | Bitwise OR bits into a Non-Volatile (NV). | 0.7531 / 0.9910 |
| `054` | `tpm2_nvundefine` | `054-tpm2-nvundefine.md` | `-C/--hierarchy, -P/--auth, -S/--session, -n/--name` | Delete a Non-Volatile (NV) index. | 1.5356 / 0.9912 |
| `055` | `tpm2_nvwrite` | `055-tpm2-nvwrite.md` | `-i/--input, -C/--hierarchy, -P/--auth, -S/--session, -n/--name` | Write data to a Non-Volatile (NV) index. | 1.9163 / 0.9886 |
| `056` | `tpm2_nvwritelock` | `056-tpm2-nvwritelock.md` | `-C/--hierarchy, -P/--auth, -S/--session, -n/--name` | Lock the Non-Volatile (NV) index for further writes. | 0.9256 / 0.9877 |
| `057` | `tpm2_pcrallocate` | `057-tpm2-pcrallocate.md` | `-P/--auth` | Configure PCRs and bank algorithms. | 1.1200 / 0.9903 |
| `058` | `tpm2_pcrevent` | `058-tpm2-pcrevent.md` | `-P/--auth, -S/--session` | Hashes a file and optionally extends a pcr. | 1.3677 / 0.9865 |
| `059` | `tpm2_pcrextend` | `059-tpm2-pcrextend.md` | `-P/--auth, -S/--session` | Extends a PCR. | 1.7943 / 0.9877 |
| `060` | `tpm2_pcrread` | `060-tpm2-pcrread.md` | `-o/--output, -S/--session` | List PCR values. | 1.8795 / 0.9897 |
| `061` | `tpm2_pcrreset` | `061-tpm2-pcrreset.md` | `--cphash` | Reset one or more PCR banks | 1.4394 / 0.9898 |
| `062` | `tpm2_policyauthorize` | `062-tpm2-policyauthorize.md` | `-L/--policy, -S/--session, -i/--input, -q/--qualification, -n/--name` | Allows for mutable policies by tethering to a signing authority. | 1.6488 / 0.9885 |
| `063` | `tpm2_policyauthorizenv` | `063-tpm2-policyauthorizenv.md` | `-C/--hierarchy, -P/--auth, -L/--policy, -S/--session` | Allows for mutable policies by referencing to a policy from an NV index. | 1.1320 / 0.9912 |
| `064` | `tpm2_policyauthvalue` | `064-tpm2-policyauthvalue.md` | `-L/--policy, -S/--session` | Enables binding a policy to the authorization value of the authorized TPM object. | 1.0121 / 0.9909 |
| `065` | `tpm2_policycommandcode` | `065-tpm2-policycommandcode.md` | `-S/--session, -L/--policy` | Restrict TPM object authorization to specific TPM commands. | 1.0285 / 0.9918 |
| `066` | `tpm2_policycountertimer` | `066-tpm2-policycountertimer.md` | `-L/--policy, -S/--session` | Enables policy authorization by evaluating the comparison operation on the TPM parameters time, clock, reset count, restart count and TPM clock safe flag. | 1.2338 / 0.9889 |
| `067` | `tpm2_policycphash` | `067-tpm2-policycphash.md` | `-L/--policy, -S/--session` | Couples a policy with command parameters of the command. | 0.9800 / 0.9908 |
| `068` | `tpm2_policyduplicationselect` | `068-tpm2-policyduplicationselect.md` | `-S/--session, -n/--object-name, -N/--parent-name, -L/--policy` | Restricts duplication to a specific new parent. | 0.9234 / 0.9916 |
| `069` | `tpm2_policylocality` | `069-tpm2-policylocality.md` | `-S/--session, -L/--policy` | Restrict TPM object authorization to specific localities. | 1.5748 / 0.9899 |
| `070` | `tpm2_policynamehash` | `070-tpm2-policynamehash.md` | `-L/--policy, -S/--session, -n/--name` | Couples a policy with names of specific objects. | 1.0009 / 0.9900 |
| `071` | `tpm2_policynv` | `071-tpm2-policynv.md` | `-C/--hierarchy, -P/--auth, -L/--policy, -S/--session, -i/--input` | Evaluates policy authorization by comparing a specified value against the contents in the specified NV Index. | 1.7513 / 0.9871 |
| `072` | `tpm2_policynvwritten` | `072-tpm2-policynvwritten.md` | `-S/--session, -L/--policy` | Restrict TPM object authorization to the written state of an NV index. | 0.9705 / 0.9860 |
| `073` | `tpm2_policyor` | `073-tpm2-policyor.md` | `-L/--policy, -S/--session, -l/--policy-list` | logically OR's two policies together. | 1.8126 / 0.9893 |
| `074` | `tpm2_policypassword` | `074-tpm2-policypassword.md` | `-L/--policy, -S/--session` | Enables binding a policy to the authorization value of the authorized TPM object. | 1.3325 / 0.9863 |
| `075` | `tpm2_policypcr` | `075-tpm2-policypcr.md` | `-L/--policy, -f/--pcr, -l/--pcr-list, -S/--session` | Create a policy that includes specific PCR values. | 1.9388 / 0.9858 |
| `076` | `tpm2_policyrestart` | `076-tpm2-policyrestart.md` | `-S/--session` | Restart an existing session with the TPM. | 1.4933 / 0.9886 |
| `077` | `tpm2_policysecret` | `077-tpm2-policysecret.md` | `-c/--object-context, -S/--session, -L/--policy, -t/--expiration, -x/--nonce-tpm` | Couples the authorization of an object to that of an existing object. | 1.7379 / 0.9890 |
| `078` | `tpm2_policysigned` | `078-tpm2-policysigned.md` | `-L/--policy, -S/--session, -c/--key-context, -g/--hash-algorithm, -s/--signature` | Enables policy authorization by verifying signature of optional TPM2 parameters. The signature is generated by a signing authority. | 1.6755 / 0.9824 |
| `079` | `tpm2_policytemplate` | `079-tpm2-policytemplate.md` | `-L/--policy, -S/--session` | Couples a policy with public template data digest of an object. | 0.8557 / 0.9891 |
| `080` | `tpm2_policyticket` | `080-tpm2-policyticket.md` | `-L/--policy, -S/--session, -n/--name, -q/--qualification` | Enables policy authorization by verifying a ticket that represents a validated authorization that had an expiration time associated with it. | 0.9782 / 0.9902 |
| `081` | `tpm2_print` | `081-tpm2-print.md` | `-t/--type` | Prints TPM data structures | 1.6187 / 0.9915 |
| `082` | `tpm2_quote` | `082-tpm2-quote.md` | `-c/--key-context, -p/--auth, -l/--pcr-list, -m/--message, -s/--signature` | Provide a quote and signature from the TPM. | 1.9182 / 0.9920 |
| `083` | `tpm2_rc_decode` | `083-tpm2-rc-decode.md` | `(positional / common options)` | Decode TPM2 error codes to a human readable format. | 1.0860 / 0.9916 |
| `084` | `tpm2_readclock` | `084-tpm2-readclock.md` | `(positional / common options)` | Retrieves the time information from the TPM. | 0.8513 / 0.9909 |
| `085` | `tpm2_readpublic` | `085-tpm2-readpublic.md` | `-c/--object-context, -n/--name, -o/--output, -t/--serialized-handle, -q/--qualified-name` | Read the public area of a loaded object. | 1.8940 / 0.9926 |
| `086` | `tpm2_rsadecrypt` | `086-tpm2-rsadecrypt.md` | `-c/--key-context, -p/--auth, -o/--output, -s/--scheme, -l/--label` | Performs an RSA decryption operation using the TPM. | 1.2057 / 0.9916 |
| `087` | `tpm2_rsaencrypt` | `087-tpm2-rsaencrypt.md` | `-c/--key-context, -o/--output, -s/--scheme, -l/--label` | Performs an RSA encryption operation using the TPM. | 1.1275 / 0.9926 |
| `088` | `tpm2_selftest` | `088-tpm2-selftest.md` | `-f/--fulltest` | Run TPM's self-test internal routines | 0.8813 / 0.9927 |
| `089` | `tpm2_send` | `089-tpm2-send.md` | `-o/--output` | Send a raw command buffer to the TPM. | 0.8932 / 0.9914 |
| `090` | `tpm2_sessionconfig` | `090-tpm2-sessionconfig.md` | `--enable-continuesession, --disable-continuesession, --enable-auditexclusive, --disable-auditexclusive, --enable-auditreset` | Configure session attributes and print session info from a session file. | 1.2062 / 0.9930 |
| `091` | `tpm2_setclock` | `091-tpm2-setclock.md` | `-c/--hierarchy, -p/--auth` | Sets the time on the TPM. | 0.9480 / 0.9914 |
| `092` | `tpm2_setcommandauditstatus` | `092-tpm2-setcommandauditstatus.md` | `-C/--hierarchy, -P/--hierarchy-auth, -c/--clear-list, -g/--hash-algorithm` | Add or remove TPM2 commands to the audited commands list. | 1.0932 / 0.9928 |
| `093` | `tpm2_setprimarypolicy` | `093-tpm2-setprimarypolicy.md` | `-C/--hierarchy, -P/--auth, -L/--policy, -g/--hash-algorithm` | Sets the authorization policy for the lockout (lockoutPolicy), the platform hierarchy (platformPolicy), the storage hierarchy (ownerPolicy), and the endorsement hierarchy (endorsementPolicy). | 1.3166 / 0.9906 |
| `094` | `tpm2_shutdown` | `094-tpm2-shutdown.md` | `-c/--clear` | Send a shutdown command to the TPM. | 1.2103 / 0.9912 |
| `095` | `tpm2_sign` | `095-tpm2-sign.md` | `-c/--key-context, -p/--auth, -g/--hash-algorithm, -s/--scheme, -d/--digest` | Sign a hash or message using the TPM. | 1.9517 / 0.9928 |
| `096` | `tpm2_startauthsession` | `096-tpm2-startauthsession.md` | `-g/--hash-algorithm, -G/--key-algorithm, -c/--key-context, -S/--session, -n/--name` | Start a session with the TPM. | 1.8647 / 0.9905 |
| `097` | `tpm2_startup` | `097-tpm2-startup.md` | `-c/--clear` | Send a startup command to the TPM. | 1.6725 / 0.9908 |
| `098` | `tpm2_stirrandom` | `098-tpm2-stirrandom.md` | `(positional / common options)` | Add "additional information" into TPM RNG state. | 0.7485 / 0.9911 |
| `099` | `tpm2_testparms` | `099-tpm2-testparms.md` | `(positional / common options)` | Verify that specified algorithm suite is supported by TPM | 1.0223 / 0.9882 |
| `100` | `tpm2_tr_encode` | `100-tpm2-tr-encode.md` | `-c/--object-context, -o/--output` | Encodes a peristent handle and `TPM2B_NAME` as a serialized `ESYS_TR` as output. | 0.9959 / 0.9902 |
| `101` | `tpm2_unseal` | `101-tpm2-unseal.md` | `-c/--object-context, -p/--auth, -o/--output, -S/--session` | Returns a data blob in a loaded TPM object. The data blob is returned in clear. | 1.8805 / 0.9913 |
| `102` | `tpm2_verifysignature` | `102-tpm2-verifysignature.md` | `-c/--key-context, -g/--hash-algorithm, -m/--message, -d/--digest, -s/--signature` | Validates a signature using the TPM. | 1.7701 / 0.9899 |
| `103` | `tpm2_zgen2phase` | `103-tpm2-zgen2phase.md` | `-c/--key-context, -p/--key-auth, -s/--scheme, -t/--counter` | Command to enable the TPM to combine data from the other party with the ephemeral key generated in the first phase of two-phase key exchange protocols. | 0.8528 / 0.9917 |

## Canonical yubiOS Operational Workflows

### Workflow 1: Preflight, Capability Probe & Measured-Boot Verification

```bash
export TPM2TOOLS_TCTI="device:/dev/tpmrm0"

# 1. Verify TPM startup state, self-test status, and fixed properties
tpm2_self_ok() {
  tpm2_getTestResult
  tpm2_getcap properties-fixed
  tpm2_getcap algorithms
  tpm2_getcap pcrs
}

# 2. Read yubiOS measured-boot PCRs (0=CRTM/BIOS, 4=boot manager, 7=Secure Boot policy, 11=UKI, 14=MOK/shim, 15=system)
tpm2_pcrread sha256:0,1,2,4,7,11,14,15 -o /tmp/pcrs.bin

# 3. Parse binary UEFI / firmware event log and cross-check calculated PCR digests
tpm2_eventlog /sys/kernel/security/tpm0/binary_bios_measurements > /tmp/eventlog.yaml

# 4. Decode any hex TPM2 return code during debugging
tpm2_rc_decode 0x000009a2
```

### Workflow 2: EK + AK Provisioning, Credential Activation & Remote Attestation Quote

```bash
# 1. Create Endorsement Key (EK) on Endorsement Hierarchy and Attestation Key (AK) registered to EK
tpm2_createek -c /tmp/ek.ctx -G rsa -u /tmp/ek.pub
tpm2_createak -C /tmp/ek.ctx -c /tmp/ak.ctx -G rsa -g sha256 -s rsassa -u /tmp/ak.pub -n /tmp/ak.name

# 2. Verifier-side: bind a secret credential to (ek.pub, ak.name)
dd if=/dev/urandom bs=1 count=32 of=/tmp/cred.secret 2>/dev/null
tpm2_makecredential -T none -e /tmp/ek.pub -s /tmp/cred.secret -n "$(xxd -p -c 999 /tmp/ak.name)" -o /tmp/cred.blob

# 3. Attester-side: activate credential inside TPM (proves AK resides on the same TPM as EK)
tpm2_startauthsession --policy-session -S /tmp/ek_sess.ctx
tpm2_policysecret -S /tmp/ek_sess.ctx -c e
tpm2_activatecredential -c /tmp/ak.ctx -C /tmp/ek.ctx -i /tmp/cred.blob -o /tmp/cred.recovered -P "session:/tmp/ek_sess.ctx"
tpm2_flushcontext /tmp/ek_sess.ctx
cmp -s /tmp/cred.secret /tmp/cred.recovered

# 4. Generate hardware-signed PCR quote with freshness nonce and verify offline
NONCE="$(tpm2_getrandom --hex 20)"
tpm2_quote -c /tmp/ak.ctx -l sha256:0,4,7,11 -q "$NONCE" -m /tmp/quote.msg -s /tmp/quote.sig -o /tmp/quote.pcrs -g sha256
tpm2_print -t TPMS_ATTEST /tmp/quote.msg
tpm2_checkquote -u /tmp/ak.pub -m /tmp/quote.msg -s /tmp/quote.sig -f /tmp/quote.pcrs -g sha256 -q "$NONCE"
```

### Workflow 3: Sealing a Secret to Signed PCR Policy (`tpm2_policyauthorize`)

Using `tpm2_policyauthorize` (instead of raw `tpm2_policypcr` alone) lets yubiOS `bootc upgrade` sign a new PCR digest when the UKI updates without re-sealing the secret:

```bash
# 1. Generate an external policy-signing keypair (or use U2F/HSM PIV public key)
openssl genrsa -out /tmp/pol_ authority.pem 2048
openssl rsa -in /tmp/pol_authority.pem -pubout -out /tmp/pol_authority.pub
tpm2_loadexternal -C o -G rsa -u /tmp/pol_authority.pub -c /tmp/pol_signer.ctx -n /tmp/pol_signer.name

# 2. Build a trial policy digest for the authorized signer
tpm2_startauthsession -S /tmp/trial.ctx
tpm2_policyauthorize -S /tmp/trial.ctx -L /tmp/authorized_policy.digest -n /tmp/pol_signer.name
tpm2_flushcontext /tmp/trial.ctx

# 3. Create primary storage key and seal secret under the authorized policy digest
tpm2_createprimary -C o -g sha256 -G ecc -c /tmp/prim.ctx
printf "yubios-sealed-volume-secret" | tpm2_create -C /tmp/prim.ctx -g sha256 -L /tmp/authorized_policy.digest -i - -u /tmp/seal.pub -r /tmp/seal.priv
tpm2_load -C /tmp/prim.ctx -u /tmp/seal.pub -r /tmp/seal.priv -c /tmp/seal.ctx

# 4. Sign the current PCR 7+11 digest with the authority key
tpm2_startauthsession -S /tmp/pcr_trial.ctx
tpm2_policypcr -S /tmp/pcr_trial.ctx -l sha256:7,11 -L /tmp/pcr_policy.digest
tpm2_flushcontext /tmp/pcr_trial.ctx
openssl dgst -sha256 -sign /tmp/pol_authority.pem -out /tmp/pcr_policy.sig /tmp/pcr_policy.digest
tpm2_verifysignature -c /tmp/pol_signer.ctx -g sha256 -m /tmp/pcr_policy.digest -s /tmp/pcr_policy.sig -f rsassa -t /tmp/check.ticket

# 5. Satisfy live policy session and unseal
tpm2_startauthsession --policy-session -S /tmp/live.ctx
tpm2_policypcr -S /tmp/live.ctx -l sha256:7,11
tpm2_policyauthorize -S /tmp/live.ctx -i /tmp/pcr_policy.digest -n /tmp/pol_signer.name -t /tmp/check.ticket
tpm2_unseal -c /tmp/seal.ctx -p "session:/tmp/live.ctx"
tpm2_flushcontext /tmp/live.ctx
```

### Workflow 4: NV Monotonic Counter & Anti-Rollback Lock

```bash
# Define a 64-bit monotonic counter at NV index 0x01000010 under Owner hierarchy
tpm2_nvdefine 0x01000010 -C o -s 8 -a "ownerwrite|ownerread|nt=counter"
tpm2_nvincrement 0x01000010 -C o
tpm2_nvreadpublic 0x01000010
tpm2_nvread 0x01000010 -C o | xxd -p
```

## Anti-patterns

- **Using `/dev/tpm0` instead of `/dev/tpmrm0` in multi-process environments:** raw `/dev/tpm0` bypasses the kernel resource manager, exhausting the TPM's 3 transient object slots (`TPM_RC_OBJECT_MEMORY` `0x902`) and leaking active sessions on crash.
- **Sealing secrets directly to brittle raw `tpm2_policypcr` without `tpm2_policyauthorize` or `tpm2_policyor`:** any kernel/UKI update (`bootc upgrade`) changes PCR 4/11 and strands the sealed object unless an authorized signing key or OR-branch fallback is wired.
- **Leaving trial or policy sessions un-flushed:** always run `tpm2_flushcontext <session.ctx>` (or `tpm2_flushcontext -t -l`) after session workflows so session handles do not accumulate.
- **Passing secrets on the command line in multi-user environments:** use `file:/run/...` or `file:-` (stdin) authorization specifiers instead of `str:<secret>` in `ps`-visible argv.
- **Confusing `tpm2_checkquote -T none` with TPM-resident commands:** `tpm2_checkquote`, `tpm2_makecredential`, `tpm2_print`, `tpm2_rc_decode`, `tpm2_eventlog`, and `tpm2_encodeobject` can run completely offline without a physical TPM by passing `-T none` (`--tcti=none`).

## Interaction with Other Skills

- **`ftpm-optee-tpm`** - builds the ARM64 OP-TEE `optee_ftpm` Trusted Application and kernel `tpm_ftpm_tee` driver that expose `/dev/tpmrm0` for `tpm2-tools`.
- **`arm-trusted-firmware-optee`** - manages TF-A BL2/BL31/BL32 measured-boot event log handoff into U-Boot and Linux where `tpm2_eventlog` and `tpm2_pcrread` inspect it.
- **`runtime-attestation-keylime`** - consumes EK/AK certificates and `tpm2_quote` / `tpm2_checkquote` outputs for continuous node attestation.
- **`audit-evidence-packaging`** - packages `tpm2_quote`, `tpm2_certify`, `tpm2_gettime`, and `tpm2_eventlog` outputs into Rekor v2 transparency-anchored audit bundles.
- **`yubikey-operations`** - complements `tpm2-tools`: U2F/HSM PIV slot 9a and FIDO2 handle owner Secure Boot signing and user-present LUKS2/SSH/homed unlock, while `tpm2-tools` manages platform PCR measurement and fTPM attestation.
- **`corpus-recall`** - retrieves any of the 103 per-subcommand deep-dive docs from `yubi-OS/knowledge` (`knowledge/tpm2-tools/<NN>-<slug>.md`).

## Examples

**Worked setup** - end-to-end PCR inspection, quote generation, and offline verification on a yubiOS VM or hardware node:

- Set `export TPM2TOOLS_TCTI="device:/dev/tpmrm0"` (or `swtpm:path=/run/swtpm/tpm-sock` in `bcvk` host-side tests) and run `tpm2_getcap properties-fixed` + `tpm2_pcrread sha256:0,4,7,11` to confirm active banks.
- Provision an EK (`tpm2_createek -c ek.ctx -G rsa -u ek.pub`) and AK (`tpm2_createak -C ek.ctx -c ak.ctx -G rsa -g sha256 -s rsassa -u ak.pub -n ak.name`), then issue a nonce-qualified quote (`tpm2_quote -c ak.ctx -l sha256:0,4,7,11 -q "$NONCE" -m quote.msg -s quote.sig -o quote.pcrs`).
- Verify the quote offline with zero TPM access required via `tpm2_checkquote -T none -u ak.pub -m quote.msg -s quote.sig -f quote.pcrs -g sha256 -q "$NONCE"`.

**In-repo touchpoints** - sections and workflows this skill owns or extends: `tests/vm/test-ftpm-ci.sh`, `tests/vm/test-luks-fido2-ci.sh`, `.github/workflows/ci_test-vm.yml`, `yubi-OS/knowledge/knowledge/tpm2-tools/001-tpm2.md`..`103-tpm2-zgen2phase.md`, and `refs/tpm2-tools-2026-11-15.md`.

**Boundary case** - when a request asks to enroll a U2F/HSM FIDO2 token into LUKS2 or systemd-homed without TPM PCR/quote/NV operations, route to `yubikey-operations` and `systemd-homed` instead of `tpm2-tools`.

## Guidelines

1. Always default to `TPM2TOOLS_TCTI="device:/dev/tpmrm0"` on booted systems so the kernel resource manager isolates transient handles and prevents `TPM_RC_OBJECT_MEMORY` slot exhaustion.
2. Always pass `-T none` (`--tcti=none`) when running offline verifier utilities (`tpm2_checkquote`, `tpm2_makecredential`, `tpm2_print`, `tpm2_rc_decode`, `tpm2_eventlog`, `tpm2_encodeobject`) on hosts without a TPM device.
3. Always flush explicit session files (`tpm2_flushcontext <session.ctx>`) at the end of policy/HMAC workflows, including in shell `trap ... EXIT` handlers.
4. Always prefer `tpm2_policyauthorize` (or `tpm2_policyauthorizenv`) over raw `tpm2_policypcr` when sealing long-lived secrets across atomic `bootc upgrade` UKI rollouts.
5. For command-specific flag edge cases, consult the matching per-subcommand doc `knowledge/tpm2-tools/<NN>-<slug>.md` in `yubi-OS/knowledge` (`001` through `103`).

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.

## Verification

- [ ] `TPM2TOOLS_TCTI` points to `/dev/tpmrm0` (or `-T none` for offline commands).
- [ ] All `tpm2_startauthsession` contexts are paired with `tpm2_flushcontext` cleanup.
- [ ] Quotes (`tpm2_quote`) include a freshness qualification nonce (`-q`) and pass `tpm2_checkquote` against the AK public key and PCR digest file.
- [ ] Sealed objects targeting upgradable UKIs use `tpm2_policyauthorize` / `tpm2_policyauthorizenv` rather than static `tpm2_policypcr` digests alone.

## Changelog

- **2026-11-15 v1.0.0**: Initial release of `tpm2-tools` derived from the 103-doc Clef-weighted `yubi-OS/knowledge` corpus (`PR #365`, merge `f4c8140076`, 103 subcommands `001-tpm2` through `103-tpm2-zgen2phase`, 408 weighted results across 19 Clef requests).
