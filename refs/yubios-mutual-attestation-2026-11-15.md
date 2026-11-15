# Prior Art & Architecture Specification: yubiOS Mutual StrongBox Remote Attestation (`yubiOS-attest`)

Date: 2026-11-15
Source: `prior-art-search` + `tpm2-tools` + `systemd-hardening` + `yubikey-operations` + `ftpm-optee-tpm` synthesis
Queries run: 4
Hits fetched in depth: 3

## 1. Search Anchor

How can two yubiOS hosts (each equipped with a hardware TPM 2.0 or ARM64 OP-TEE `tpm_ftpm_tee` fTPM, measured-boot UKI PCRs, and an operator YubiKey exposed via PIV / `ssh-agent`) perform local and mutual peer-to-peer remote attestation via a hardened systemd/D-Bus service using a GrapheneOS Auditor-style single-use pairing ceremony?

## 2. Direct Competitors & Equivalents

- **GrapheneOS Auditor & AttestationServer (`GrapheneOS/Auditor`, `GrapheneOS/AttestationServer`)** - Hardware-backed TOFU pairing and scheduled/QR remote attestation protocol for Android devices using TEE + StrongBox (Titan M) key attestation. https://attestation.app/about and https://github.com/GrapheneOS/Auditor/blob/master/app/src/main/java/app/attestation/auditor/AttestationProtocol.java
  - Key observation: Uses a 65-byte challenge (`1-byte version` + `32-byte challenge_index` + `32-byte fresh challenge nonce`). The `challenge_index` selects a per-Auditor persistent hardware key on the Auditee so one device can pair with multiple Auditors. Initial pairing verifies the hardware certificate chain and pins Verified Boot state, OS version/patch level, and persistent key fingerprint; subsequent audits sign the attestation payload (`osEnforcedFlags`, boot state, pinned cert fingerprint) with the persistent key plus a fresh hardware attestation certificate over the challenge nonce, enforcing strict downgrade protection.
- **Keylime (`keylime/keylime`, `keylime/rust-keylime`)** - CNCF remote boot attestation and runtime integrity monitor built on `tpm2-tools` / `tss-esapi` and Linux IMA. https://github.com/keylime/keylime and https://github.com/keylime/rust-keylime/blob/6071a9d8/dist/systemd/system/keylime_agent.service
  - Key observation: Demonstrates the canonical TPM 2.0 EK-to-AK credential activation flow (`tpm2_createek`, `tpm2_createak`, `tpm2_makecredential`, `tpm2_activatecredential`) and quote + eventlog verification (`tpm2_quote`, `tpm2_checkquote`, `tpm2_eventlog`), but assumes a centralized Registrar + Verifier + Tenant server topology rather than symmetric peer-to-peer host attestation over SSH.
- **Google `go-tpm-tools` (`google/go-tpm-tools`)** - Go library and CLI providing high-level TPM 2.0 attestation protobuf bundles combining multi-bank PCR quotes and raw TCG event logs. https://github.com/google/go-tpm-tools
  - Key observation: Bundles raw `TPMS_ATTEST` structures, signature blobs, PCR bank values, and `/sys/kernel/security/tpm0/binary_bios_measurements` into a single self-contained evidence message verified offline.
- **OpenSSH FIDO2/PIV Agent Signing (`ssh-keygen -Y sign` / `SSH_AUTH_SOCK`)** - OpenSSH >= 8.2 arbitrary message signing (`SSHSIG` format) using keys held in `ssh-agent` (`ed25519-sk`, `ecdsa-sk`, or PKCS#11 PIV slot `9a`). https://sunhick.github.io/posts/advanced-yubikey-5c/
  - Key observation: Allows a forwarded or local `ssh-agent` holding a YubiKey to sign domain-separated (`-n yubios-attest-v1`) attestation transcripts without exposing raw SSH authentication signatures to cross-protocol replay.

## 3. Failed Attempts & Failure Modes

- **`tpm2-abrmd` (TCG Userspace D-Bus Access Broker & Resource Manager, `tpm2-software/tpm2-abrmd`)** - Userspace daemon that brokered raw TSS2 command packets over D-Bus (`com.intel.tss2.Tabrmd`). https://github.com/tpm2-software/tpm2-abrmd/issues/422
  - Key observation: Failed in early-boot and high-load service environments due to D-Bus IPC deadlocks and timeout races (`Failed to create connection with service: Timeout was reached`), and was made obsolete by the Linux kernel's in-tree `/dev/tpmrm0` resource manager (Linux >= 4.12). yubiOS must talk directly to `/dev/tpmrm0` inside the attestation daemon and expose only coarse-grained attestation RPCs over D-Bus / Unix socket.
- **Intel OpenAttestation (OAT) / Static PCR Whitelists** - Early enterprise TPM attestation portals that pinned raw PCR hashes without signed policy rotation (`tpm2_policyauthorize`) or TOFU peer state. https://tpm2-software.github.io/2020/06/12/Remote-Attestation-With-tpm2-tools.html
  - Key observation: Broke on every kernel or UKI upgrade and required heavyweight Java/Tomcat servers; yubiOS solves this by combining TOFU peer pinning (`challenge_index`) with signed UKI PCR 11 / Secure Boot PCR 7 measurements and monotonic anti-rollback counters.
- **Blind `ssh -A` Agent Forwarding to Unverified Peers** - Forwarding raw `SSH_AUTH_SOCK` into a remote host before attesting that host allows a compromised remote root user to use the socket for unauthorized lateral SSH logins.
  - Key observation: `yubiOS-attest` runs the mutual attestation exchange over an SSH stdio pipe (`ssh hostB yubiOS-attest stdio-peer`) and performs `ssh-keygen -Y sign -n yubios-attest-v1` on the local side of the pipe, never exposing raw `SSH_AUTH_SOCK` to the remote host prior to verification.

## 4. Academic & Standards Grounding

- **IETF RATS (RFC 9334 - Remote ATtestation procedureS Architecture)** - Defines Evidence, Attestation Results, Endorsements, Reference Values, and Passport vs Background-Check topologies. https://www.rfc-editor.org/rfc/rfc9334
- **TCG TPM 2.0 Library Specification (Part 1 Architecture & Part 3 Commands)** - Defines `TPM2_MakeCredential`, `TPM2_ActivateCredential`, `TPM2_Quote`, `TPMS_ATTEST` (`TPM_GENERATED_VALUE = 0xff544347`), and NV monotonic counters (`NT_COUNTER`). https://trustedcomputinggroup.org/resource/tpm-library-specification/

## 5. What This Means for `yubiOS-attest` (Filling the Architectural Gaps)

### 5.1 Dual-Root "StrongBox" Composition on yubiOS
On GrapheneOS, StrongBox is a discrete chip (Titan M) corroborating the TEE. On yubiOS, every host has two orthogonal hardware roots of trust that `yubiOS-attest` binds into a single cryptographic transcript:
1. **Platform StrongBox (fTPM / TPM 2.0 via `/dev/tpmrm0`):**
   - Persistent or context-cached Endorsement Key (`EK`, `tpm2_createek`) and restricted signing Attestation Key (`AK`, `tpm2_createak`).
   - Hardware residency proof: during initial pairing, each peer runs `tpm2_makecredential` against the peer's `(ek_pub, ak_name)` and requires the peer to recover the secret via `tpm2_activatecredential` under an endorsement policy session (`tpm2_startauthsession --policy-session` + `tpm2_policysecret -c e`).
   - Fresh quote (`tpm2_quote`) over `sha256:0,1,2,4,7,11,14,15` with qualifying data:
     `extraData = SHA256("yubios-attest-v1" || challenge || challenge_index || peer_binding_hash)`.
   - Monotonic anti-rollback state from `tpm2_readclock` (reset count, restart count, clock ms) plus optional NV counter (`0x01800001` via `tpm2_nvread`) and UEFI/fTPM event log digest (`tpm2_eventlog`).
2. **Owner StrongBox (YubiKey PIV Slot `9a`/`9c` + `ssh-agent`):**
   - **Local PIV Attestation (`--piv-slot 9a|9c`):** signs the serialized attestation bundle digest via PKCS#11 (`libykcs11.so` / `opensc-pkcs11.so`) or slot key and attaches the YubiKey PIV certificate chain (`ykman piv export-cert`).
   - **Paired SSH-Agent StrongBox (`SSH_AUTH_SOCK`):** signs the mutual transcript (`challenge_index_A || challenge_index_B || quote_digest_A || quote_digest_B`) using `ssh-keygen -Y sign -n yubios-attest-v1` with the operator's YubiKey key loaded in `ssh-agent`, verified by the peer via `ssh-keygen -Y verify`.

### 5.2 Single-Use Pairing Code & Mutual Handshake Protocol
1. **`pair-init` (on Host B or Host A):**
   - Daemon generates a 32-byte `challenge_index` (`tpm2_getrandom 32`) and a 120-bit single-use pairing code formatted as `YUBI-XXXX-XXXX-XXXX-XXXX` (5-minute TTL, max 1 redemption attempt).
   - Stores the pending record in `/run/yubiOS-attest/pairings/<code_id>.json` (`0600`).
2. **`pair-ssh` (Host A -> Host B over SSH stdio pipe):**
   - Host A invokes `yubiOS-attest pair-ssh --peer <hostB> --code YUBI-...`.
   - Phase A (Hello & EK/AK Exchange): Host A and Host B exchange `(protocol_version=1, host_id, challenge_index, fresh_nonce, ek_pub, ak_pub, ak_name)` and compute a pairing MAC using `HKDF-SHA256(single_use_code, transcript_hash)`. Host B immediately burns the single-use code (any replay fails closed).
   - Phase B (Mutual `MakeCredential` / `ActivateCredential` Challenge): Host A generates a 32-byte credential secret encrypted to `(ek_pub_B, ak_name_B)` via `tpm2_makecredential`; Host B generates a 32-byte credential secret encrypted to `(ek_pub_A, ak_name_A)`. Both hosts run `tpm2_activatecredential` on their respective fTPMs and return the recovered secrets.
   - Phase C (Mutual Quote + YubiKey Co-Signature + Pinning): Both hosts generate fresh `tpm2_quote` bundles over `sha256:0,1,2,4,7,11,14,15` qualified by the mutual transcript + recovered credential secret, co-sign with YubiKey PIV / `ssh-agent`, verify each other via `tpm2_checkquote` + `ssh-keygen -Y verify`, and write pinned peer records to `/var/lib/yubiOS-attest/peers/<peer_id>.json`.
3. **`mutual-verify` (Subsequent Audits):**
   - Uses the pinned `challenge_index_A` and `challenge_index_B` without needing a new pairing code.
   - Verifies AK quote signature, PCR 0/4/7/11 baseline continuity, monotonic `tpm_clock` / `os_version` non-regression (downgrade detection), and YubiKey `ssh-agent` / PIV co-signature.

### 5.3 Hardened systemd Service & D-Bus / Socket Surface
- **Service Unit:** `usr/lib/systemd/system/yubiOS-attestd.service` (`ConditionSecurity=measured-os`, `Type=notify`, `DynamicUser=no` / `User=yubios-attest`, `Group=tss`, exposure score `< 2.5`).
- **Socket Unit:** `usr/lib/systemd/system/yubiOS-attestd.socket` (`/run/yubiOS-attest/attest.sock`, `SocketMode=0660`, `SocketGroup=yubios-attest`).
- **D-Bus Policy:** `usr/share/dbus-1/system.d/org.yubios.Attest1.conf` owning bus name `org.yubios.Attest1` at `/org/yubios/Attest1`.
- **Drop-in Ordering:** `usr/lib/tmpfiles.d/yubiOS-attest.conf` and `usr/lib/sysusers.d/yubiOS-attest.conf` (named with leading `yubiOS-` so they lexicographically sort after upstream package files per `RULES.md`).

## 6. Sources
- https://attestation.app/about - GrapheneOS Auditor overview, TOFU model, StrongBox Keymaster, and downgrade protection.
- https://github.com/GrapheneOS/Auditor/blob/master/app/src/main/java/app/attestation/auditor/AttestationProtocol.java - Auditor v7 wire protocol (`challenge_index`, `challenge`, persistent hardware key pinning, `osEnforcedFlags`).
- https://tpm2-software.github.io/2020/06/12/Remote-Attestation-With-tpm2-tools.html - Canonical `tpm2-tools` remote attestation workflow (`tpm2_createek`, `tpm2_createak`, `tpm2_makecredential`, `tpm2_activatecredential`, `tpm2_quote`, `tpm2_checkquote`).
- https://github.com/keylime/rust-keylime/blob/6071a9d8/dist/systemd/system/keylime_agent.service - Systemd service structure for Linux TPM 2.0 remote attestation agents.
- https://github.com/tpm2-software/tpm2-abrmd/issues/422 - Why userspace D-Bus TPM command brokers fail vs kernel `/dev/tpmrm0` + high-level attestation RPC.
- https://www.rfc-editor.org/rfc/rfc9334 - IETF RATS Remote Attestation Procedures Architecture.
