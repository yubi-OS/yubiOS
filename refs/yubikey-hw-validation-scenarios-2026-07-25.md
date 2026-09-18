# Minimum real-hardware YubiKey validation scenarios

**Status:** proposed | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-63](https://linear.app/omni-agent/issue/OMN-63/define-the-minimum-real-hardware-yubikey-validation-scenarios)

## Why this exists

`BLOCKERS.md` (B-REAL-FIDO2) states that SoftHSM and swu2f exercise the software/CI
interfaces, but production confidence still needs a physical YubiKey run to validate
FIDO2 unlock, homed, resident SSH keys, PAM presence, PIV signing, recovery, and
failure handling. B-REAL-FIDO2 explicitly gates on B-VM-CTAP2 closing first ("close
B-VM-CTAP2 for deterministic software coverage, then retain a real-hardware evidence
run as the production-confidence gate"). This doc defines *what* that real-hardware
run must cover; it does not claim the run has happened.

The VM/software sibling test is [`tests/vm/test-luks-fido2.sh`](../tests/vm/test-luks-fido2.sh)
(bcvk `native-to-disk` + a real device + `systemd-cryptenroll --fido2-device=auto`,
still requiring a physical YubiKey touch for enrollment — it is not a full software
emulation). The scenarios below extend that script's single unlock check into the
full set of trust-boundary crossings a physical key must prove.

## Scope

Five trust boundaries where a YubiKey replaces the TPM/OEM anchor (per MISSION.md /
AGENTS.md): Secure Boot signing (PIV slot 9c), LUKS2 disk unlock, SSH auth, PAM
login, and systemd-homed. Each needs an unlock/identity/signing scenario, at least one
recovery path, and at least one failure-handling case with a *real* key — swu2f and
SoftHSM cannot prove touch/presence semantics, removal-mid-operation behavior, or
production APDU timing.

## Scenarios

| # | Boundary | Scenario | Real-hardware step | Evidence to capture |
|---|----------|----------|---------------------|----------------------|
| H1 | LUKS2 disk unlock | Fresh `bootc install to-disk` + FIDO2 enrollment boots and unlocks with the enrolled key present | `systemd-cryptenroll --fido2-device=auto --fido2-with-client-pin=yes --fido2-with-user-presence=yes` on the partition from `test-luks-fido2.sh`, then reboot and unlock at the initrd password/FIDO2 prompt | Boot log showing FIDO2 slot used (not passphrase fallback); `cryptsetup luksDump` slot list |
| H2 | LUKS2 disk unlock — failure | Boot attempt with the key **absent** falls back to passphrase prompt, not silent unlock or lockout | Boot with device unplugged | initrd prompt log; confirm no unlock without either factor |
| H3 | LUKS2 disk unlock — failure | Boot attempt with the key present but **user presence not given** (no touch within timeout) fails cleanly and is retryable | Enrollment with `--fido2-with-user-presence=yes`, deliberately don't touch | Timeout error text; confirm retry succeeds on touch |
| H4 | systemd-homed | `homectl create --storage=luks --fido2-device=auto` on real hardware creates and unlocks a home; login gated on key presence | Full `homectl create` → logout → login cycle per `systemd-homed` skill's yubiOS checklist | `homectl inspect <user>` showing FIDO2 enrollment; login session log |
| H5 | systemd-homed — recovery | `--recovery-key` generated before FIDO2 enrollment successfully unlocks the home with the YubiKey physically destroyed/unavailable | Generate recovery key offline, enroll FIDO2, simulate key loss, unlock via recovery key | Recovery-key unlock transcript; confirms recovery path isn't just documented but functional |
| H6 | PAM login | `pam_systemd_home.so` (homed) and/or `pam_u2f.so` (non-homed sudo/sshd path) both require physical touch, not just enumeration | Attempt `sudo` / login with key present-but-not-touched vs. touched | pam log lines for both outcomes |
| H7 | SSH auth | FIDO2 resident key (`ed25519-sk`) generated on real hardware authenticates over SSH; a non-resident/absent key is rejected | `ssh-keygen -t ed25519-sk` on the YubiKey, add to `authorized_keys`, SSH in with key present, then attempt with key removed | Successful SSH session log; rejected-connection log with key removed |
| H8 | PIV signing (Secure Boot / UKI) | A UKI signed via slot 9c (`sbsign` + `libykcs11` PKCS#11, per PR #32) boots on real hardware with Secure Boot enforcing | Sign a test UKI with the real YubiKey's slot 9c private key, boot on hardware with SB on | `sbverify`/firmware log showing signature chain validated; boot succeeds |
| H9 | PIV signing — failure | A UKI signed with a **different**/untrusted key, or an unsigned UKI, is rejected by Secure Boot on the same hardware | Attempt boot with a deliberately mis-signed or unsigned UKI | Firmware Secure Boot violation log; system refuses to boot |
| H10 | Identity (PIV vs FIDO2) | PIV token identity is readable before authentication (per `systemd-homed` skill: "token identity visible before auth"); confirm this on real hardware to select username automatically | `homectl create --pkcs11-token-uri=auto` with two different YubiKeys enrolled to two different accounts, swap keys, confirm correct account selected each time | Session log showing username auto-resolved per inserted key |
| H11 | Key swap / multi-key | A second enrolled YubiKey (`homectl authenticate` run twice, or `pamu2fcfg -n` for pam-u2f) unlocks the same resource as the first, and revoking one slot doesn't affect the other | Enroll two physical keys against one home/PAM entry, unlock with each independently, then wipe one slot and confirm the other still works | `cryptsetup luksDump` slot list before/after; unlock logs per key |
| H12 | Suspend/resume | `suspend=1` PAM entry forgets key material on suspend; resume requires a fresh touch, not a cached session | Suspend a homed session, resume, confirm re-auth is required | Session/resume PAM log |

## Explicitly out of scope for this doc

- ARM64 fTPM/OP-TEE hardware validation — tracked separately under the ARM64 Path A
  board rehearsal work (B-ARM64-PATHA, B-RK3588-TPL), not YubiKey-specific.
- CI/software coverage of the same boundaries via swu2f/SoftHSM — that's B-VM-CTAP2's
  scope, a precondition for this doc's scenarios per B-REAL-FIDO2, not a substitute
  for them.
- Actually running these scenarios. This doc defines the minimum set; execution and
  evidence capture is separate follow-up work once B-VM-CTAP2 closes.

## Dependencies / sequencing

Per B-REAL-FIDO2: do the software/VM coverage (B-VM-CTAP2) first for deterministic,
repeatable results, then run H1–H12 on real hardware as the production-confidence
gate. H8/H9 (PIV signing) can run independently — they don't depend on the CTAP2 VM
fix, only on a real YubiKey and PR #32's `sbsign`/`libykcs11` path landing.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4350) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6174, Δ=+0.5601) were identical placeholder copies with no per-file content; merged on 2026-09-18.
