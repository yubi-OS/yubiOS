# Technical Preview Entry Criteria & Readiness Checklist (2026-11-12)

**Linear:** OMN-83 ("Turn blockers into Technical Preview entry criteria")
**Target tag:** `v0.8.92` (Technical Preview)
**Baseline:** `yubi-OS/yubiOS:main` at `6dcf38f283942c9f90f6f18c1897fcde57cd4d41`; [docs/BLOCKERS.md](../docs/BLOCKERS.md) and [docs/TODO.md](../docs/TODO.md) as last reviewed 2026-11-12
**Governing ADRs:** [ADR-002](../docs/ADR.md#adr-002-secure-boot-signing-via-piv-ccid-not-fido2-hidraw) (PIV slot `9a`), ADR-019 (Path B for Technical Preview, Path A for production), ADR-029 (pairwise Rockchip board paths)

---

## Decision summary

Technical Preview ships on **Path B** (measured and attested boot without irreversible eFuse burning, ADR-019). It is gated by three tiers:

| Tier | Meaning | State on 2026-11-12 |
|---|---|---|
| **Tier 1** | CI-enforced gates, green on `main` | 6 of 6 met |
| **Tier 2** | Attended hardware gates required before tagging `v0.8.92` | 0 of 3 met |
| **Tier 3** | Deferred past Technical Preview (Path A / production hardware lock) | Not required for Preview |

**Go/no-go rule:** tag `v0.8.92` when every Tier 1 gate is still green on the tagging commit and every Tier 2 gate has a retained evidence artifact linked from a dated `refs/` note. Tier 3 items must not block the tag and must not be claimed in Preview release notes.

**Claim boundary for Preview material:** describe the boot chain as "measured and attested". Do not describe any board as having a "fuse-enforced" or "hardware-enforced boot-ROM" root of trust until Tier 3 Path A evidence exists for that board.

---

## Gate Tier 1 — Completed & CI-Enforced Technical Preview Gates (green on `main`)

Each gate must stay green on the tagging commit. A regression in any Tier 1 lane is a release blocker.

| # | Gate | Blocker IDs retired | Linear (Done) | Enforcing evidence |
|---|---|---|---|---|
| 1.1 | **Sealed UKI + composefs Type2 `BLSConfig`.** UKI built in the `FROM rootfs AS uki` stage, single-layer `FROM scratch` image, `SOURCE_DATE_EPOCH` composefs digest pinning, install-time Type2 UKI `BLSConfig`. | `B-BOOTC-SEAL`, `B-UKI-COMPOSEFS` | OMN-51, OMN-53, OMN-150, OMN-151, OMN-166, OMN-168, OMN-169 | `d4b95e208f` (2026-10-20), `c612e010a95c`; `ci_test_sealed-uki-vm.yml` run `42296684302` (`INSTALL_RC=0`, digest match); `ci_test-vgpu-vm.yml` Negative 2 composefs-tamper leg |
| 1.2 | **Software FIDO2 + `swtpm` + OP-TEE fTPM VM e2e.** `passless` + `swu2f` authenticators, LUKS2 FIDO2, homed, `ed25519-sk`, fTPM/StandaloneMM boot in QEMU, pinned QEMU `11.1.2` for zstd EFI zboot. | `B-VM-CTAP2`, `B-PASSLESS-RPID`, `B-QEMU-ZBOOT` | OMN-39, OMN-48, OMN-59, OMN-60, OMN-107, OMN-162 | `ci_test-vm.yml` run `42492516043` on `rock1` (`amd64` + `arm64`, `test-ftpm-qemu-ci.sh`); run `30697269619` (CTAP2 legs PASS, not skip); `68d3956d4051`, `fed887e010c6` |
| 1.3 | **In-image runtime systemd hardening.** `tests/verify-systemd-hardening-runtime.sh`, full Bats suite, `systemd-analyze verify` and `security` inside the built image. | `B-HARDENING-RUNTIME` | OMN-40, OMN-54, OMN-55 | `f98c1cb09071`, `728f9aa6887a`; `ci_test_bootc-filesystem.yml`; [refs/systemd-hardening-runtime-evidence-2026-11-12.md](systemd-hardening-runtime-evidence-2026-11-12.md) |
| 1.4 | **Two-build reproducibility & digest-pinned supply chain.** Two independent builds compare byte-identical; base-image digests change only with a [PINNED.md](../PINNED.md) update. | `B-REPRO-MIRROR`, `B-PINS` | OMN-157, OMN-170 | Two-build reproducibility gate in CI; PINNED.md package-floor checks. See open note below. |
| 1.5 | **CHIPSEC portable service & first-boot enrollment gating.** `yubiOS-chipsec-firstboot.service` one-shot writes `/run/yubiOS/chipsec-result`; enrollment is gated on it. | — | OMN-18 (ADR-024) | `tests/unit/test-chipsec-firstboot-unit.bats`, `tests/unit/test-enroll-unit.bats`, `tests/vm/test-portable-service.sh` (`ci_test-sysext-portable.yml`) |
| 1.6 | **3-board Rockchip firmware matrix.** `rock5b-rk3588`, `rockpro64-rk3399`, and blob-free `pinetab2-rk3566` built and published under ADR-029's pairwise open-source framing. | `B-RK3588-TPL` | OMN-56, OMN-57 | `ci_firmware-rk.yml` at `3d46182203`, run `42124835234` (two-build reproducible; `pinetab2-rk3566` and `rockpro64-rk3399` with `requires_rockchip_tpl: false`; `rock5b-rk3588` on the `rkbin` pin `3e288fe8`, PR #310) |

**Open note on 1.4:** `docs/BLOCKERS.md` still lists `B-REPRO-MIRROR` and `B-PINS` as active (live-repo package drift, e.g. glibc `2.44-1` vs `2.44-2` in run `39100931710`; rerun passed). The gate counts as met for Preview when the tagging commit's two-build comparison passes on the first attempt or on a documented rerun with the drift class named. Pinning Fedora to an immutable snapshot (OMN-170) is the durable fix and should land before Preview if it can; if it does not, the release notes name the rerun.

---

## Gate Tier 2 — Attended Hardware Gates Required Before Tagging `v0.8.92`

Each Tier 2 gate needs one attended session and a retained evidence artifact (UART/console log, command transcript, public-material-only outputs) linked from a dated `refs/` note. Only public key material leaves the YubiKey.

### 2.1 `B-OWNER-KEYS` (OMN-171): owner Secure Boot ceremony on PIV slot `9a`

- **Pre-work:** add the StandaloneMM enrollment step to `usr/lib/yubiOS/enroll-sb.sh` (PR #318 rewrote it for slot `9a` signing on 2026-10-17; it has never run on a YubiKey).
- **Ceremony:** attach the owner YubiKey to `rock1`; owner enters PIN and touches for each signature. Mint or confirm the RSA-2048 slot `9a` key, build PK/KEK/db in setup mode, enroll through StandaloneMM, verify each signature against `db.crt`.
- **Pass criteria:** `enroll-sb.sh enroll` exits 0; PK/KEK/db certificates and the signed UKI verify against `db.crt`; the transcript shows slot `9a`, PIN policy ALWAYS, touch policy ALWAYS.
- **Doc follow-up:** ADR-002 already names slot `9a` (amended 2026-11-12); move `B-OWNER-KEYS` to "Not Current Blockers" once the evidence lands.

### 2.2 `B-REAL-FIDO2`: attended physical-YubiKey session on `rock1`

- **Builds on:** the 2026-08-01 physical LUKS2 FIDO2 enroll + unlock pass (slot 2, issue #20 closed).
- **Must capture, with retained logs, in one session:** `systemd-homed` FIDO2 home create + unlock; PAM user-presence (`pam-u2f`); resident `ed25519-sk` SSH key generate + login; recovery path (recovery key / second token); failure handling (wrong token, no touch, removed token).
- **Pass criteria:** every operation reaches its final assertion on hardware, in the 2026-08-01 evidence format.

### 2.3 Target-board Path B boot capture (ADR-019 / ADR-029)

- **Board:** `ROCK 5B` (`rock5b-rk3588`) and/or `PineTab2` (`pinetab2-rk3566`). Per ADR-029, PineTab2 is the front-runner for first full open-source stack; capturing it here would make it the reference flagship candidate.
- **Must capture on UART/console:** the written SD/USB installer booting TF-A -> OP-TEE (fTPM + StandaloneMM) -> U-Boot UEFI -> signed UKI -> sealed composefs root -> userspace login.
- **Starting point:** ROCK 5B already reaches OP-TEE and fTPM init (`YUBIOS_TPM_OK`, 2026-10-11) and has a written 59.5 GB SD card (`INSTALL_RC=0`, composefs digest `719d600a…`, 2026-10-21) awaiting physical boot. PineTab2 has the CI-built blob-free loader (`firmware-pinetab2-rk3566`) awaiting its first UART capture via `rock1` (CH340, 1500000 8N1).
- **Pass criteria:** retained log shows each stage handoff and a userspace prompt; fTPM PCR event log is present.

---

## Gate Tier 3 — Deferred to Post-Preview / Production Hardware Lock (Path A)

Nice to have for Preview, required before any production hardware-root claim. Not entry criteria for `v0.8.92`.

| # | Item | Linear / ADR | Why deferred |
|---|---|---|---|
| 3.1 | Sacrificial ROTPK eFuse provisioning rehearsal | OMN-45, ADR-019 Path A | Irreversible; Preview runs on Path B with TBB flags exercised continuously in the QEMU lane (`ci_test-vm.yml`) |
| 3.2 | Hardware eMMC RPMB key programming and write-lock verification | OMN-36, OMN-46, OMN-47, OMN-58 | RPMB key programming is one-time per device; StandaloneMM variables and fTPM NV run unlocked for Preview |
| 3.3 | `SecTime` / `Frost` / `Net` hardware enforcement proofs | ADR-031, ADR-033, OMN-144 | Design and research are complete ([refs/sectime-rk-secure-time-2026-07-17.md](sectime-rk-secure-time-2026-07-17.md)); hardware TA and enforcement evidence remain open |

`B-ARM64-PATHA` stays in `docs/BLOCKERS.md` as the production blocker that Tier 3 retires. Tier 2.3 narrows it but does not close it.

---

## Readiness checklist

- [x] 1.1 Sealed UKI + composefs Type2 `BLSConfig`
- [x] 1.2 Software FIDO2 + `swtpm` + OP-TEE fTPM VM e2e
- [x] 1.3 In-image runtime systemd hardening
- [x] 1.4 Two-build reproducibility & digest-pinned supply chain (see open note)
- [x] 1.5 CHIPSEC portable service & first-boot enrollment gating
- [x] 1.6 3-board Rockchip firmware matrix
- [ ] 2.1 `B-OWNER-KEYS` slot `9a` ceremony + StandaloneMM enrollment on `rock1`
- [ ] 2.2 `B-REAL-FIDO2` attended session with retained logs
- [ ] 2.3 Target-board Path B boot capture (`rock5b-rk3588` and/or `pinetab2-rk3566`)
- [ ] Re-confirm all Tier 1 lanes green on the tagging commit
- [ ] Release notes state Path B ("measured and attested") and list Tier 3 as deferred

## Sources

- [docs/BLOCKERS.md](../docs/BLOCKERS.md) (last reviewed 2026-11-12)
- [docs/TODO.md](../docs/TODO.md)
- [docs/ADR.md](../docs/ADR.md): ADR-002, ADR-018, ADR-019, ADR-020, ADR-024, ADR-029, ADR-031, ADR-033
- [refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md](flipper-one-rk3576-rk3566-ddr-2026-11-05.md)
- [refs/history/arm64-rk-board-status-2026-07-17.md](history/arm64-rk-board-status-2026-07-17.md)
- `yubi-OS/u-boot` PR #1 (`5c7fe6ca3b`), `yubi-OS/optee_os` `b619831e8a`, `yubi-OS/yubiOS` PR #310, PR #318, `3d46182203`, run `42124835234`
