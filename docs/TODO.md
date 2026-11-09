# yubiOS TODO

Last reviewed: 2026-11-08
Status: active task list
Latest hardware and firmware evidence (2026-11-08):
- **ROCK 5B (`rk3588`):** PRs #310 to #326 merged 2026-10-10 to 2026-10-18 (rkbin DDR/TPL pin, OP-TEE DT node, `SPD=opteed`, DYNAMIC_SHM, owner-key PIV 9a signing, UKI mtime fix, org-wide upstream bump). ROCK 5B booted CI-built firmware to OP-TEE and fTPM init (`YUBIOS_TPM_OK`, run 38126763632, 2026-10-11). The composefs digest mismatch (`B-UKI-COMPOSEFS`) was closed by the 6-commit single-layer final image series (`e8a524360d`..`6414edfee4`, merged `d4b95e208f` on 2026-10-20, Linear OMN-168 Done), and on 2026-10-21 the 59.5 GB SD card on `rock1` was written and sha256-verified with ROCK 5B firmware `50115cfb…` at sector 64, GPT from sector 32768, and `bootc install` of image `3aa4dc1d` (`INSTALL_RC=0`, composefs digest match `719d600a…`, ESP populated), then pulled for physical board boot.
- **PineTab2 (`rk3566`):** Flipper One (`rk3576`) vs `rk3566` DDR-init deep research ([refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md](../refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md), `653b26afa3`) confirmed `rk3576` still relies on Rockchip's binary DDR blob while Pavel Golikov's 18-patch `rk3568`/`rk3566` open-source U-Boot TPL DRAM driver (`1056 MHz` cap) is hardware-validated. Merged to `yubi-OS/u-boot:main` via [PR #1](https://github.com/yubi-OS/u-boot/pull/1) (`5c7fe6ca3b`, 2026-11-05), ported `rk3568`/`rk3566` platform flavors to `yubi-OS/optee_os` (`b619831e8a` on `feat/stmm-volatile-storage-ci-4.11`), merged `v0.22.0` into `yubi-OS/bcvk:yubios` (`1f7c73769a`), and wired `pinetab2-rk3566` (`requires_rockchip_tpl: false`) into `.github/workflows/ci_firmware-rk.yml` (`3d46182203`, `933f20df39`). [Run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234) completed green across all 26 jobs and published `docker.io/0mniteck/yubios:firmware-pinetab2-rk3566` (Linear OMN-167).
Latest CI-infra and VM e2e evidence (2026-11-08):
- All 5 build-group workflows completed green with `Docker_push=true` on 2026-11-05/08: `ci_firmware-rk.yml` ([run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234)), `yubiOS-ci.yml` ([run 42126088386](https://github.com/yubi-OS/yubiOS/actions/runs/42126088386)), `ci_dev_image.yml` ([run 42124843614](https://github.com/yubi-OS/yubiOS/actions/runs/42124843614) and [run 42472594071](https://github.com/yubi-OS/yubiOS/actions/runs/42472594071) at `3ebf154f4f`), `ci_mkosi-installer.yml` ([run 42124847863](https://github.com/yubi-OS/yubiOS/actions/runs/42124847863)), and `ci_build-test-fixtures.yml` ([run 42124851372](https://github.com/yubi-OS/yubiOS/actions/runs/42124851372)).
- `ci_test_sealed-uki-vm.yml` ([run 42296684302](https://github.com/yubi-OS/yubiOS/actions/runs/42296684302), 2026-11-06, commit `470ca60904`) completed green across all 5 jobs after clearing `fedora-bootc:45`'s pre-existing `/target/boot/EFI/Linux/*.efi` before `bootc container ukify`.
- `B-ROCK1-DISK`, `B-PASSLESS-RPID`, and `B-VGPU-VM-UNZIP` are all resolved and verified green on `rock1` (2026-11-08, commits `470ca60904`, `bad063d7e1`, `68d3956d4051`, `fed887e010c6`, `8f662a6c434a`, `58234795b29c`, `c612e010a95c`): `ci_test-vm.yml` ([run 42492516043](https://github.com/yubi-OS/yubiOS/actions/runs/42492516043)) passed all 3 jobs (`lint-vm-scripts`, `amd64`, and `arm64`: `test-ftpm-qemu-ci.sh`, `test-luks-fido2-ci.sh`, and `test-fido2-enrollment.sh` all PASS); `ci_dev_image.yml` ([run 42539185884](https://github.com/yubi-OS/yubiOS/actions/runs/42539185884) at `c612e010a95c`) published the single-layer `0mniteck/yubios:dev` image with `SOURCE_DATE_EPOCH` composefs digest pinning and a matching UKI; and `ci_test-vgpu-vm.yml` ([run 42530951994](https://github.com/yubi-OS/yubiOS/actions/runs/42530951994) and [run 42546834473](https://github.com/yubi-OS/yubiOS/actions/runs/42546834473) at `c612e010a95c`) passed all 33 steps on `rock1`, including Step 24 (`Lay down signed UKI`), Step 25 (`bootc install to-filesystem`), Step 29 (`Baseline PASS`), and Step 32 (`Negative 2 PASS: dm-verity/composefs refused tampered composefs=…`) (Linear OMN-53 Done, OMN-151 Done, OMN-169 Done).
- Platform & ecosystem docs synced on `main` through `f9cd9d00a4` (2026-11-08): Steady Orbit `/jev/` Multi-Harness switching, Clairic+Clef 4-Layer Ontology Engine (`335e37b0b3`, `04ca9f7222`), Agentic Coding Workbench (`c84e3e18f9`, `6efb46829d`), `/forecasts/` workstation + Stage 05 $200 Slip Tracker (`6477363501`, `73633594c1`), Common-Threads Wave 7 (`0b2638230b`, `43d7728a02`), and Pfister Round 2 (`f9cd9d00a4`, 301 Funnel targets, Linear OMN-172 Done); Antimony `v156.0.8078.47-r1` released on `yubi-OS/chromium-provenance` (PR #2 `c2789f3690`, `c7fc5df699`, Linear OMN-165); `yubi-OS/knowledge` at 351 corpora + `glass-design-skill` (PR #364 `b25001ece0`); and `yubi-OS/craft-web-builds` created 2026-11-08 for the 16-app ArtCraft WASM universal Rust bridge and CI matrix (Linear OMN-173).
Latest requested-run evidence review: [refs/ci-evidence-2026-07-21.md](../refs/ci-evidence-2026-07-21.md), covering the complete logs of runs 29869480442, 29869503301, 29869527608, 29872130447, 29872433355, 29872832727, 29876111887, and 29876466349.
Latest upstream progress review: [refs/systemd-upstream-progress-2026-07-21.md](../refs/systemd-upstream-progress-2026-07-21.md).
Latest targeted audit: [refs/systemd-v262-audit-2026-07-14.md](../refs/systemd-v262-audit-2026-07-14.md).
Latest broad research note: [refs/research-refresh-2026-07-11.md](../refs/research-refresh-2026-07-11.md).
Latest VM e2e evidence: [run 30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) on rock1 (self-hosted ARM64 KVM); commit b7f9d467 on main; both `tests/vm/test-luks-fido2-ci.sh` and `tests/vm/test-fido2-enrollment.sh` PASS in the ARM64 bcvk guest -- swtpm + swu2f CTAP2 enumeration + LUKS2 FIDO2 enroll/unlock + homed FIDO2 home create + 5 `yubiOS-enroll-*` commands + ed25519-sk SSH keygen all execute (no skips). Hardware leg against `/dev/sda` also PASSes (`New FIDO2 token enrolled as key slot 2`). Sealed-UKI negative-tamper-boot leg blocked by a new rock1 host-deps gap (B-VGPU-VM-UNZIP), not by docker-storage (see OMN-151 disambiguation).
Latest VM e2e evidence: [run 29872832727](https://github.com/yubi-OS/yubiOS/actions/runs/29872832727); root SSH and the DirectBoot bootloader-update guard passed, while guest CTAP2 enumeration remained absent.
Latest sealed-UKI source for the Negative 2 leg: [run 30652859000](https://github.com/yubi-OS/yubiOS/actions/runs/30652859000) (V83 on branch `sealed-uki-vm-lane-v2`, SHA `1d0666d7`); produces `sealed-uki-artifacts-arm64` consumed by `ci_test-vgpu-vm.yml` step 24. Run 30697269619 hit B-VGPU-VM-UNZIP at the unzip extraction step.
Latest bootc install evidence: [run 29884493346](https://github.com/yubi-OS/yubiOS/actions/runs/29884493346); native amd64 and arm64 fresh-runner legs installed digest `sha256:22140ef11deebac5643544434af1263368b72fa791fe53e98add677bbcadc08e` onto externally prepared DPS partitions, retained `/mnt` under `--skip-finalize`, and emitted no `root=` in the generated BLS entries.
Latest composefs audit: [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md); the current install evidence is strict fs-verity through an unsealed BLS entry, while the sealed target requires a signed UKI that authenticates the composefs digest.
Latest roadmap research pass: [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md), [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md), [refs/openwrt-deception-proof-plan-2026-07-17.md](../refs/openwrt-deception-proof-plan-2026-07-17.md), and [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md).
Latest firmware workflow split: [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md).

Use this file for current work. Completed historical context belongs in merged PRs, ADRs, or dated refs.

## FUTURE.md Coverage Map

Use this map to keep [FUTURE.md](FUTURE.md) roadmap entries tied to active TODO work instead of letting roadmap-only sections drift.

| FUTURE.md section | Current TODO.md coverage | Follow-up |
|---|---|---|
| Near-Term Planning Cycle | Covered by Current Documentation Tasks | Keep dated `refs/` planning-cycle notes scoped to each research pass |
| Milestone F: ARM64 Owner-Owned Root Of Trust | Covered by Current ARM64 Tasks and [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md) | Continue ROCK 5B/RK3588 Path A proof and ROCKPro64/RK3399 secondary evidence |
| Milestone SecTime: Secure-World Time Evidence | Covered by [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md) | Hardware TA/smoke-test evidence remains open |
| Milestone Frost: Firmware-Assisted GPU Resource Lockout | Covered by [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md) | Kernel prototype and RK hardware recovery proof remain open |
| Milestone CI: Keep The Test Lanes Honest | Covered by Current CI Tasks and [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md) | Keep PQ TLS, QEMU zstd EFI zboot, VM e2e, firmware callback, and dev/prod isolation checks visible |
| Milestone Docs: Prevent Snapshot Drift | Covered by Current Documentation Tasks | Keep refs, PINNED, CITATION, CI_MAP, and hardening terminology aligned |
| Milestone Net: OpenWrt WireGuard Deception LAN | Covered by [refs/openwrt-deception-proof-plan-2026-07-17.md](../refs/openwrt-deception-proof-plan-2026-07-17.md) | Build the VM/spare-router proof and packet evidence |
| Post-Launch Hardware Work | Covered by promotion gates and ARM64 board-status refs | Promote individual items only when they have a board target, evidence target, and recovery plan |
| Deferred Ideas | Watch-list only | Keep `systemd-sysinstall`, LUO/KHO, U-Boot FIDO2/U2F, and ORAS media types out of active scope until promoted |
| Exit Criteria For Moving Work Out Of FUTURE | Covered by [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md) | Require trust boundary, recovery, evidence, pins, notification/retention policy, and prod/test separation before promotion |

## Current ADR Governance Tasks (added 2026-07-25)

Every ADR in [ADR.md](ADR.md) (ADR-001 through ADR-031) now has a matching Linear tracking issue in OMN (issues OMN-109 through OMN-138, plus OMN-101 relabeled). Accepted ADRs are marked Done; Proposed/idea-stage ADRs stay in Backlog until decided.

- [x] Create one Linear issue per ADR and mark Accepted ones Done: ADR-001..017, 021..026, 028..032 -> Done (including dedicated OMN-166 in the ADR project for ADR-032 alongside OMN-51); ADR-018 (OMN-126), ADR-019 (OMN-127), ADR-020 (OMN-128), ADR-027 (OMN-135), ADR-033 (OMN-144) -> Backlog (still Proposed; restored OMN-126/127/128/135 from Canceled to Backlog and assigned OMN-144 to the ADR project on 2026-11-08).
- [x] ADR-032 (Kernel+Rootfs Split) accepted 2026-07-29 (commit `a1940330` via PR #143); corresponding Linear OMN-51 and OMN-166 marked Done.
- [x] ADR-033 (Misbehavior-Triggered PCI-Mediation Cutoff) merged 2026-07-30 via PR #151 (`feat/adr-033-misbehavior-cutoff-policy`, faithful to `refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md` [SOLO] V3 finalist + `refs/adr-033-prior-art-search-2026-07-28.md`); companion Linear cluster OMN-144..147 re-parented to ADR-031, with OMN-145/146/147 Done and OMN-144 in Backlog until runtime/hardware enforcement lands.
- [x] Correct the ADR-024 numbering collision: the vGPU/vfio-user trust boundary decision was mislabeled "candidate ADR-024" in refs/vgpu-vfio-user-trust-boundary-2026-07-25.md and in an earlier FUTURE.md edit. ADR-024 is the chipsec first-boot validation ADR; the GPU trust boundary landed as **ADR-031**. Fixed the stale FUTURE.md cross-reference and relabeled OMN-101 accordingly.
- [ ] Open a follow-up ADR (or amend ADR-031) once the IOMMU passthrough access gate (ADR-031 rule 2) has real enforcement code and hardware evidence, not just accepted design -- see OMN-101/OMN-108.
- [ ] Promote ADR-018/019/020 (ARM64 secure-world stack, dual root-of-trust paths, U-Boot UEFI+StandaloneMM) from Proposed to Accepted once the Milestone F hardware proof lands (see Current ARM64 Tasks below); update their Linear issues from Backlog to Done at the same time, not before.
- [ ] Promote ADR-027 (U-Boot FIDO2/U2F console gate) from idea-stage only after the USB HID threat model and recovery design named in FUTURE.md's Deferred Ideas are written.
- [ ] Keep new ADRs and their Linear issues created together going forward -- an ADR without a tracking issue is easy to lose track of once it leaves this file.
- [ ] Amend ADR-002 from PIV slot 9c to slot 9a for owner Secure Boot signing (PR #318, merged 2026-10-17). ADR-002's decision text still names slot 9c.
- [ ] Record the 2026-10-11 Path B decision (TBB/ROTPK rehearsal deferred, Path A stays open as the proof) in ADR-019 and the ARM64 board refs.

## Current Documentation Tasks

- [x] Add a dated planning-cycle note for the 2026-07-11 research pass: [refs/planning-cycle-2026-07-11.md](../refs/planning-cycle-2026-07-11.md).
- [x] Add a scheduled upstream research refresh note: [refs/research-refresh-2026-07-11.md](../refs/research-refresh-2026-07-11.md).
- [x] Refresh refs that described v261, swu2f, swtpm, PKCS#11 signing, and zstd EFI zboot as future or stale.
- [x] Remove obsolete workflow-token warning language from repo guidance.
- [x] Make [PINNED.md](../PINNED.md) the explicit live source for image digests.
- [x] Before systemd v262 adoption, audit docs/code for `/run/boot-loader-entries/`, `systemd-sysupdated` D-Bus, and `updatectl` assumptions: [refs/systemd-v262-audit-2026-07-14.md](../refs/systemd-v262-audit-2026-07-14.md).
- [x] Record the 2026-07-16 VM e2e milestone from run 29525332901: [refs/vm-e2e-run-29525332901.md](../refs/vm-e2e-run-29525332901.md).
- [x] Switch the active install docs from `bootc install to-disk` to `bootc install to-filesystem --root-mount-spec=""` so DPS auto-discovery remains explicit.
- [x] Keep future planning cycles dated and scoped under `refs/`: see the 2026-07-17 SecTime, Frost, OpenWrt, roadmap-gate, hardening, ARM64 board, and firmware workflow refs.
- [x] Record the complete requested-run review separately from green/red workflow status: [refs/ci-evidence-2026-07-21.md](../refs/ci-evidence-2026-07-21.md).
- [x] Add a dated systemd-family upstream snapshot and area-scaled contributor map: [refs/systemd-upstream-progress-2026-07-21.md](../refs/systemd-upstream-progress-2026-07-21.md) and [assets/upstream-contributor-bubbles.svg](https://github.com/yubi-OS/assets/blob/main/upstream-contributor-bubbles.svg).
- [x] Audit the attached EROFS/bootc proposal against released bootc and composefs behavior, correct the practical split/ukify flow, and separate native bootc composefs from the mkosi dm-verity path: [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md).
- [ ] Reconcile the remaining composefs/dm-verity conflation in normative ADR, SPEC, threat-model, and mitigation text after the two build paths and migration policy are approved.

## Current Roadmap Research Tasks

These items map [FUTURE.md](FUTURE.md) sections that were missing or only partially represented in the active TODO list.

### Milestone SecTime

- [x] Add a source-backed `refs/` note identifying the active OP-TEE secure time configuration for RK3399 and RK3588, including `CFG_SECURE_TIME_SOURCE_CNTPCT`, AArch64 timer handling, and TF-A `SPD=opteed` integration: [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md).
- [x] Define what yubiOS may safely claim from secure-world time: monotonic within a boot, suspend/resume behavior, normal-world tamper resistance, and power-loss/reboot limits: [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md).
- [x] Add or design an OP-TEE TA/smoke test that records monotonic secure-world reads and expected failure behavior on ROCK 5B/RK3588 and ROCKPro64/RK3399: [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md).
- [x] Draft ADR coverage for which decisions may rely on secure-world time and which require stronger counters, sealed state, or remote-attestation freshness: [refs/sectime-rk-secure-time-2026-07-17.md](../refs/sectime-rk-secure-time-2026-07-17.md).

### Milestone Frost

- [x] Add a source-backed `refs/` map of current Panfrost/Rockchip kernel patch points for probe/init, BO create/free, PRIME import, and submit guarding: [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md).
- [x] Determine whether the target kernel can use DRM device-memory cgroup accounting for Panfrost, or whether a minimal cgroup-aware BO accounting prototype is required first: [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md).
- [x] Sketch the U-Boot device-tree/reserved-memory handoff plus secure-monitor SMC or mailbox interface for context quarantine, IOMMU revocation, GPU reset, or power gating: [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md).
- [ ] Prove whether RK3399/RK3588 lockout can target an offending cgroup/context or must fall back to full-GPU reset behavior. Requires kernel prototype plus RK hardware recovery evidence.
- [x] Define tests for false positives, graphics stack recovery, telemetry, logs, owner notification, and owner recovery after a Frost event: [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md).
- [x] Draft ADR coverage for the trust boundary between Linux policy, OP-TEE/TF-A hard cutoff, and user recovery: [refs/frost-panfrost-lockout-2026-07-17.md](../refs/frost-panfrost-lockout-2026-07-17.md).

### Milestone Net

- [x] Turn [refs/endlessh-openwrt-fit-2026-07-17.md](../refs/endlessh-openwrt-fit-2026-07-17.md) into an OpenWrt package proof plan with feed/package layout, UCI config, procd service behavior, firewall/nftables integration, and WireGuard-zone defaults: [refs/openwrt-deception-proof-plan-2026-07-17.md](../refs/openwrt-deception-proof-plan-2026-07-17.md).
- [ ] Build an OpenWrt VM or spare-router proof with a WireGuard-only decoy address pool and an owner-selected notification path.
- [ ] Capture packet-level evidence that scans hit decoys before the real SSH endpoint is discoverable.
- [x] Define logging defaults that avoid storing attempted passwords, private keys, or sensitive payloads, while still preserving useful owner notification evidence: [refs/openwrt-deception-proof-plan-2026-07-17.md](../refs/openwrt-deception-proof-plan-2026-07-17.md).
- [x] Draft ADR coverage for the deception trust boundary, notification model, evidence retention, lab-mode exposure, and failure behavior: [refs/openwrt-deception-proof-plan-2026-07-17.md](../refs/openwrt-deception-proof-plan-2026-07-17.md).

### FUTURE Promotion Gates

- [x] Before moving any FUTURE item into ADR, SPEC, or implementation, record its trust boundary, recovery behavior, evidence target, required pins/upstream sources, notification/evidence-retention policy when relevant, and production/test artifact separation: [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md).
- [x] Keep post-launch hardware and deferred ideas watch-listed until a specific owner, board or deployment target, evidence target, and recovery plan exist: [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md).

## Current CI Tasks

- [ ] Keep PQ TLS verification visible in CI for OpenSSL 3.5+ and Go 1.24+ defaults; run 29876466349 negotiated TLS 1.3 `X25519MLKEM768`. When the repo toolchain reaches Go 1.26, include `SecP256r1MLKEM768` and `SecP384r1MLKEM1024` in accepted hybrid-group checks.
- [ ] Keep the QEMU zstd EFI zboot workaround version-gated until runner QEMU contains upstream zstd EFI zboot loader support.
- [x] `unzip` is in the `ci_test-vgpu-vm.yml` `Install extra deps` apt block, `B-ROCK1-DISK` is fixed via `/mnt/extended` bind-mounts for `/var/lib/containers` and `/var/tmp` (`470ca60904`, `fed887e010c6`), and `ci_test-vgpu-vm.yml` completed 100% green across all 33 steps on `rock1` in [run 42530951994](https://github.com/yubi-OS/yubiOS/actions/runs/42530951994) and [run 42546834473](https://github.com/yubi-OS/yubiOS/actions/runs/42546834473) (`B-VGPU-VM-UNZIP` retired; OMN-53, OMN-151, OMN-169 Done).
- [x] Validate the bcvk virtiofs-root `bootloader-update.service` guard: run 29872832727 reached the guest assertions without the old DirectBoot/virtiofs failure.
- [x] Validate the bcvk root SSH credential path: run 29872832727 authenticated and ran the ARM64 guest-side assertions.
- [x] Confirm `tests/vm/test-fido2-enrollment.sh` still runs when token-dependent operations skip: run 29872832727 executed the enrollment-surface script after the passless layer found no CTAP2 device.
- [x] Make a swu2f CTAP2 token enumerate inside the ARM64 bcvk guest, then require the LUKS2 FIDO2, homed, and OpenSSH `ed25519-sk` operations to execute instead of skip. Run 30697269619 PASSes both `test-luks-fido2-ci.sh` and `test-fido2-enrollment.sh` against the in-guest passless CTAP2 authenticator on the ARM64 guest: `PASS: swtpm + swu2f CTAP2 + LUKS2 FIDO2 + homed FIDO2 verified` and `PASS: enrollment surface + CTAP2 registration + OpenSSH ed25519-sk verified`. After the 2026-10-17 bump to `passless v0.20.2` (PR #324), commit `bad063d7e1` (2026-11-08) patched `soft-fido2-ctap 0.17.0` `GetInfo` via `cargo vendor` so `hmac-secret` is advertised again, and commit `68d3956d4051` passed `-o pam.yubios.local -i pam.yubios.local` to `pamu2fcfg` (`B-PASSLESS-RPID` closed; verified green in `ci_test-vm.yml` [run 42492516043](https://github.com/yubi-OS/yubiOS/actions/runs/42492516043) and `ci_test-vgpu-vm.yml` [run 42546834473](https://github.com/yubi-OS/yubiOS/actions/runs/42546834473), OMN-169 Done).
- [x] Add a native arm64 build/publish leg and multi-architecture manifest merge to `.github/workflows/ci_mkosi-installer.yml`; run 29876111887 proved only the amd64 path, and the workflow now stages both architectures before merging public tags ([run 42124847863](https://github.com/yubi-OS/yubiOS/actions/runs/42124847863) green across all 9 jobs on 2026-11-05).
- [ ] Keep `dev`/`dev-<sha>` swu2f images isolated from production build and publish paths.
- [ ] Treat old-sha workflow reruns as historical unless the workflow is rerun against current `main`.
- [x] All workflows are `workflow_dispatch`-only -- no `on: push` triggers (group-routing redesign landed in PR #145). To run a workflow or chain, dispatch `ci.yml` with the appropriate `group:` choice.
- [x] Keep Docker Build Policy wiring centralized in `yubiOS-bake.hcl`: every build target inherits the explicit `yubiOS.rego` filename with `reset=true` and `strict=true`, without relying on automatic `Dockerfile.rego` loading. See [refs/docker-bake-consolidation-2026-07-17.md](../refs/docker-bake-consolidation-2026-07-17.md).
- [x] Add board variant fields to real-hardware firmware workflows before hardware lanes land: `rock5b-rk3588` as the Path A variant, `rockpro64-rk3399` as the secondary Path A variant, and `pinetab2-rk3566` (`requires_rockchip_tpl: false`, open-source U-Boot TPL) added 2026-11-05 (`3d46182203`). See `.github/workflows/ci_firmware-rk.yml`, [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md), and [refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md](../refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md).
- [x] Validate the documented `bootc install to-filesystem` path on a fresh VM or disposable disk, including external partition preparation, mounted `/mnt`, `--skip-finalize`, and omitted `root=` via `--root-mount-spec=""`: [run 29884493346](https://github.com/yubi-OS/yubiOS/actions/runs/29884493346) passed on native amd64 and arm64.
- [x] Strengthen the external-image `to-filesystem` smoke so it requires an ext4 `verity` feature, the composefs repository instead of an ostree fallback, measurable EROFS metadata images, a rejected protected-object write, and a strict digest-bound BLS entry classified as unsealed.
- [x] Resolve `B-UKI-COMPOSEFS` (installer vs UKI composefs digest mismatch) and re-verify `ci_test_sealed-uki-vm.yml` on `main`: 6-commit single-layer final image series merged in `d4b95e208f` (2026-10-20), verified `INSTALL_RC=0` with matching composefs digest (`719d600a…`) on the `rock1` SD card write (2026-10-21, OMN-168 Done), and `ci_test_sealed-uki-vm.yml` [run 42296684302](https://github.com/yubi-OS/yubiOS/actions/runs/42296684302) (commit `470ca60904`, 2026-11-06) passed all 5 jobs on `main`.
- [x] Complete the `ci_test-vgpu-vm.yml` Negative 2 composefs-tamper leg on `rock1` (`OMN-53`, `OMN-151`) and mirror `Containerfile`'s single-layer UKI + `SOURCE_DATE_EPOCH` composefs digest pinning into `Containerfile.dev` (`c612e010a95c`, `ci_dev_image.yml` [run 42539185884](https://github.com/yubi-OS/yubiOS/actions/runs/42539185884)): verified 100% green on `rock1` in [run 42530951994](https://github.com/yubi-OS/yubiOS/actions/runs/42530951994) and [run 42546834473](https://github.com/yubi-OS/yubiOS/actions/runs/42546834473).
- [ ] Complete Phase 2 install-time `BLSConfig` drop-in wiring (`OMN-150`, `B-BOOTC-SEAL`) once upstream `bootc` exposes a project-authored `BLSConfig` drop-in intake.
- [x] PR #143 (commit `a1940330`, merged 2026-07-29) shipped the kernel-side artifact split per ADR-032: `0mniteck/yubios:uki-<sha>-<arch>` published as a separate OCI artifact, `Containerfile.uki`, `usr/lib/yubiOS/uki/install-uki.sh` documented, `usr/lib/bootc/install/50-yubiOS.toml` kargs pinned. Phase 2 (install-time BLSConfig wiring) is the remaining work — see `refs/kernel-rootfs-split-2026-07-29.md`. Closes OMN-51 / OMN-166.

- [ ] Fix or retire the five failing `diag_sign-matrix` variants (ec-provider, rsa2048-engine, rsa2048-sbsign-engine, and two ossl signcode variants). They install current Fedora packages at runtime (systemd 262-3 from updates-testing, softhsm 2.7.0-2, pkcs11-provider 1.2.0-3), so the workflow has never been green and its exit 1 hides regressions. The production SoftHSM signing path is not affected.
- [x] Fix `B-PASSLESS-RPID` in `tests/vm/test-fido2-enrollment.sh` and `tests/vm/test-luks-fido2-ci.sh` (`68d3956d4051`): pass `-o pam.yubios.local -i pam.yubios.local` to `pamu2fcfg` so `passless v0.20.2`'s `ValidatedRpId` accepts the registration credential; verified green in `ci_test-vm.yml` [run 42492516043](https://github.com/yubi-OS/yubiOS/actions/runs/42492516043) and `ci_test-vgpu-vm.yml` [run 42546834473](https://github.com/yubi-OS/yubiOS/actions/runs/42546834473) (OMN-169 Done).
- [x] Lean CI gates hardened over PRs #299 to #302 and extended with the `timesfm-clairic-clef` 8-gate cascade selftest (`PR #328`, `4815c3ae6a`, 2026-10-21): sorry gate, Lean-driven theorem enumeration, axiom coverage, statement and definitions pins, pinned toolchain, and leanchecker kernel replay ([run 42453950298](https://github.com/yubi-OS/yubiOS/actions/runs/42453950298) green at `f9cd9d00a4`).
- [x] `ci_dispatch-reachability` restored by PR #303: `autoinstall-verify.yml` was in no ci.yml group, so every PR touching `.github/workflows/` failed from 2026-10-07.
- [x] Docker Hub CI repositories (`yubios`, `yubios-sysext-test`, `yubios-portable-svc-test`, `build-cache`) were deleted in error on 2026-10-06 and recreated by `ci_docker-repos-ensure`. The 2026-10-06 relaunch pushed them again (builders 4/4). Descriptions were rebuilt from CI_MAP because the originals were not captured.
- [x] Firmware lane: the ROCK 5B combined loader builds from the pinned rkbin input (PR #310), with the OP-TEE DT node (PR #311, pinned as a git-am patch in PR #314), `SPD=opteed` (PR #312), and non-secure DDR registration for DYNAMIC_SHM (PR #313). The `--allow-downgrades` workaround was reverted in PR #325 after the upstream bump (PR #324). On 2026-11-05 (`3d46182203`, `933f20df39`), `pinetab2-rk3566` (`requires_rockchip_tpl: false`, blob-free open-source U-Boot TPL from `yubi-OS/u-boot` PR #1 `5c7fe6ca3b` + `rk3568`/`rk3566` OP-TEE flavor from `yubi-OS/optee_os` `b619831e8a`) was added to `ci_firmware-rk.yml` and published to Docker Hub ([run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234) green across all 26 jobs).

## Current ARM64 Tasks

- [x] Choose the first Path A board for production-root proof: Radxa ROCK 5B / RK3588 is the active bring-up board again since 2026-10-10 (it was on pause); ROCKPro64 / RK3399 stays the secondary board per ADR-029; PineTab2 / RK3566 added 2026-11-05 as the first blob-free open-source TPL Rockchip target (OMN-167).
- [ ] Rehearse ROTPK/fuse provisioning on sacrificial hardware before production language. Deferred 2026-10-11 (OMN-45 in Backlog): Path B first, with TBB flags live only in the QEMU lane. Reopen when Path A moves forward.
- [ ] Prove OP-TEE, StandaloneMM, RPMB-backed variables, fTPM NV, and U-Boot UEFI on hardware (OMN-36, OMN-46, OMN-47, OMN-58). Progress: ROCK 5B reaches OP-TEE and fTPM init with CI-built firmware (`YUBIOS_TPM_OK`, 2026-10-11) and had its 59.5 GB SD card written on `rock1` on 2026-10-21 (`INSTALL_RC=0`, composefs match `719d600a…`, firmware `50115cfb…` at sector 64). PineTab2 (`rk3566`) open-TPL firmware image (`0mniteck/yubios:firmware-pinetab2-rk3566`) built and passed two-build reproducibility on 2026-11-05 (run `42124835234`). Still open on hardware: physical OS boot verification on ROCK 5B, UART/USB-boot installer validation on PineTab2, StandaloneMM owner-key enrollment (`B-OWNER-KEYS`), RPMB-backed variable storage, fTPM NV persistence, and ROCKPro64 (`rk3399`) bring-up.
- [ ] Record exact TF-A, OP-TEE, StandaloneMM/RPMB, and U-Boot config evidence for Path A, including `CFG_RPMB_FS`, `CONFIG_EFI_MM_COMM_TEE`, and `CONFIG_SUPPORT_EMMC_RPMB`. Progress: `SPD=opteed` (PR #312), OP-TEE DT node (PR #311, pinned as a git-am patch in PR #314), non-secure DDR registration for DYNAMIC_SHM (PR #313), and `rk3568`/`rk3566` OP-TEE + open-TPL U-Boot configs (`3d46182203`). The hardware RPMB config evidence itself is still open.
- [x] Supply ROCK 5B builds with a licensed, immutable, checksum-verified RK3588 DDR/TPL blob and require `u-boot-rockchip.bin`. Done in PR #310 (rkbin pinned at `3e288fe8`, checksum fail-closed, OMN-56/OMN-57 Done). The 2026-10-11 build booted the board. The license call is the owner's.
- [x] Port blob-free open-source U-Boot TPL DRAM initialization (`1056 MHz` cap) and OP-TEE `rk3568`/`rk3566` platform support for PineTab2 (`pinetab2-rk3566`), eliminating the proprietary Rockchip DDR blob on RK3566: [yubi-OS/u-boot PR #1](https://github.com/yubi-OS/u-boot/pull/1) (`5c7fe6ca3b`), `yubi-OS/optee_os` (`b619831e8a`), `ci_firmware-rk.yml` (`3d46182203`, [run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234)), and [refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md](../refs/flipper-one-rk3576-rk3566-ddr-2026-11-05.md) (OMN-167).
- [x] Document Path A vs Path B status per board, starting with `rock5b-rk3588` and `rockpro64-rk3399`: [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md).

## Current Security Tasks

- [x] Audit services for `ConditionSecurity=measured-os` where enrollment or signing behavior must not run on an unmeasured boot: [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md).
- [x] Audit `RestrictFileSystems=` separately from the v261 `RestrictFileSystemAccess=` control: [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md).
- [x] Keep CHIPSEC first-boot validation scoped as a one-shot exception and document firmware-warning behavior: the unit and Bats coverage enforce the one-shot exception, while `run-firstboot-check.sh` documents `PASS`/`WARN`/`FAILED` semantics and informational WPBT/Computrace evidence.
- [ ] Add or refresh real-hardware YubiKey validation evidence for FIDO2 unlock and homed flows. Partly done: LUKS2 FIDO2 enroll and unlock passed on rock1 (2026-08-01, slot 2, issue #20 closed). Still open: homed on hardware with retained logs, PAM presence, resident SSH keys, PIV signing, recovery and failure paths (B-REAL-FIDO2).
- [x] Keep recovery paths documented before enabling any feature that can lock an owner out: [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md).
- [ ] Run the owner-key ceremony on a YubiKey: attach it to rock1, add the StandaloneMM enrollment step to `enroll-sb.sh`, run it attended, then amend ADR-002 for slot 9a (B-OWNER-KEYS).

## Current Supply-Chain Tasks

- [ ] Update [PINNED.md](../PINNED.md) for every base-image/tool digest change.
- [x] Pin the BuildKit daemon independently, derive `SOURCE_DATE_EPOCH` from the source commit, clamp OCI/layer timestamps, and enforce two isolated OCI-layout builds for production and dev: [refs/reproducible-builds-2026-07-22.md](../refs/reproducible-builds-2026-07-22.md).
- [ ] Replace live Fedora/Debian repository resolution with immutable snapshots plus exact package/toolchain closure before claiming later rebuildability. Promoted to blocker B-REPRO-MIRROR on 2026-10-18.
- [x] Separate installer and TF-A signature-bearing envelopes—including the root-resident `systemd-boot*.efi.signed` file—from canonical unsigned subjects in the blocking ARM64 comparisons; retain both envelope digests without treating random keys/signatures as equality subjects.
- [x] Preseed pinned EDK2 with commit- and platform-scoped deterministic stack-cookie lists, then enforce two clean ARM64 component builds for every firmware board.
- [x] Approve a checksum-pinned RK3588 DDR/TPL input before firmware equality can cover the final bootable ROCK 5B image. Pinned in PR #310 (rkbin `3e288fe8`, fail-closed). Firmware equality for the final image still depends on B-REPRO-MIRROR.
- [ ] Verify package floors after digest bumps: systemd target, pam-u2f >= 1.3.1, OpenSSL 3.5+, and Go 1.24+ where relevant.
- [x] Keep production, installer, firmware, and dev/test artifacts clearly labeled and non-overlapping: [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md).
- [x] Preserve provenance/SBOM expectations for published artifacts: SLSA L3, SPDX SBOM, and cosign wired by OMN-157 (Done 2026-08-06). Open follow-ups: digest-pin `buildkit-syft-scanner`, and run `tests/verify-oci-attestations.sh` end to end.
- [x] Keep production bootc (`latest`, `<sha>`), dev/test (`dev`, `dev-<sha>`), and installer (`installer`, `installer-<sha>`) tags board-neutral unless the OS or installer artifact actually diverges by board. Firmware is now the only board-scoped tag family.
- [x] Publish board-scoped firmware tags under the existing `0mniteck/yubios` namespace: `firmware-rock5b-rk3588`, `firmware-rock5b-rk3588-<sha>`, `firmware-rockpro64-rk3399`, `firmware-rockpro64-rk3399-<sha>`, `firmware-pinetab2-rk3566`, and `firmware-pinetab2-rk3566-<sha>` (added 2026-11-05 in `3d46182203`, [run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234)), plus the QEMU baseline tags documented in [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md).

## Watch List

- Run 29525332901 proved the ARM64 lane can boot the dev image to Fedora login with the pinned QEMU workaround; keep watching for runner QEMU refreshes before removing that workaround.
- Run 29872832727 retired the old root-SSH and DirectBoot bootloader-update blockers. Its remaining VM gap was narrower: passless starts, but no CTAP2 token enumerates, so token-dependent assertions skip.
- Run 30697269619 (commit b7f9d467 on main) retires the residual CTAP2-skip leg on rock1: both `test-luks-fido2-ci.sh` and `test-fido2-enrollment.sh` reach their final `PASS:` assertions against the in-guest passless authenticator (not the dev image only). After the 2026-10-17 bump to `passless v0.20.2`, commit `bad063d7e1` (2026-11-08) restored `hmac-secret` in `soft-fido2-ctap` `GetInfo` (`test-luks-fido2-ci.sh` PASS in [run 42476660637](https://github.com/yubi-OS/yubiOS/actions/runs/42476660637)), while `test-fido2-enrollment.sh` needs a slash-free `-o` origin for `pamu2fcfg` (`B-PASSLESS-RPID`, OMN-169).
- Run 29869527608 proves the QEMU fTPM/StandaloneMM integration and board-specific compilation, but not physical-board behavior. Its ROCK 5B DDR/TPL input is now pinned (PR #310), the 2026-10-11 build booted the board, and the 2026-11-05 [run 42124835234](https://github.com/yubi-OS/yubiOS/actions/runs/42124835234) extended the 2-build reproducibility and publish matrix to `pinetab2-rk3566` (blob-free open-source U-Boot TPL).
- `rock1` root is 12 GB; `ci_test-vgpu-vm.yml` and `ci_test-vm.yml` now bind-mount `/mnt/extended/containers` onto `/var/lib/containers` (`470ca60904`, 2026-11-06; 74–79 GB free on `/mnt/extended`), retiring `B-ROCK1-DISK` as long as `/mnt/extended` remains mounted.
- One of the two ARM64 self-hosted hosts (`ubuntu`) has hard-halted several times under sustained I/O (2026-10-04 to 2026-10-07); its 179 GB -> 36 GB cleanup completed on 2026-10-23, and a custom `7.3.3-yubios73` kernel install for Snapdragon X Elite `fastrpc`/NPU testing was launched on 2026-11-08 with stock `-43` retained as the GRUB default. Keep unthrottled heavy I/O off it.
- `.github/workflows/ci_firmware-rk.yml` is the orchestrated firmware lane. The removed `ci_test-int.yml` workflow is historical context only; do not restore its `yubiOS firmware` state to the top-level `ci.yml` chain.
- systemd v262 removes `/run/boot-loader-entries/` support and the experimental `systemd-sysupdated` D-Bus API; the 2026-07-14 audit found no repo dependency, but future update UX should stay on UAPI.1/BLS and Varlink/systemd-sysupdate rather than removed interfaces or unaudited `updatectl` assumptions.
- systemd v262 renames `systemd-sysupdate.service`/`.timer` to `systemd-sysupdate-update.service`/`.timer`; verify compatibility symlinks before adding units against the old names.
- Go 1.26 expands default hybrid PQ TLS key exchanges beyond `X25519MLKEM768`; tests should assert acceptable policy rather than a single hard-coded group.
- `bootc install to-filesystem --root-mount-spec=""` is now the documented install baseline for DPS auto-discovery; keep watching for installer UX that can prepare and mount the target filesystems safely.
- `systemd-sysinstall` may become useful for guided install UX, but the current repart/bootc model remains the baseline.
- LUO/KHO may matter for appliance/server deployments, but A/B reboot remains correct for the current desktop/laptop thesis.
- U-Boot FIDO2/U2F console authentication remains idea-stage until USB HID, crypto, and recovery risks are audited.
- ORAS artifact media types may replace `FROM scratch` carrier images when registry support and UX improve.
- systemd v262 is active upstream work rather than the current pinned baseline; track credential-sealing compatibility, the sysupdate unit rename, cryptenroll's first-boot/Varlink work, and the FIDO2 zero-length-HMAC rejection in [refs/systemd-upstream-progress-2026-07-21.md](../refs/systemd-upstream-progress-2026-07-21.md).

## Decisions Recorded Since 2026-08-24

- 2026-10-10: the ROCK 5B RK3588 DDR/TPL input is pinned and published (PR #310). The license of the Rockchip blob is the owner's call.
- 2026-10-11: Path B first. TBB and ROTPK rehearsal are deferred, and TBB flags stay in the QEMU lane only. Path A stays open as the proof.
- 2026-10-11: owner keys only. No CI keys in any shipped build (PR #315 reverted by PR #317).
- 2026-10-11: PIV slot 9a for the owner PK/KEK/db chain and UKI signing (PR #318, merged 2026-10-17). Supersedes ADR-002's slot 9c; amendment pending.
- 2026-10-11: StandaloneMM stays in the rockchip builds. Owner keys enroll into StandaloneMM at provisioning, superseding the earlier plan to keep variables in a U-Boot file store on the ESP.
- 2026-10-11: no Secure Boot recovery path. Reflash is the recovery route.
- 2026-10-16: the install route is `bootc install to-filesystem` with a GPT the installer creates, not bcvk native-to-disk. The bcvk fork has no offset option, and a raw write would overwrite firmware at sector 64.
- 2026-10-20: the production bootc image ships as a single-layer `FROM scratch` stage (`6414edfee4` / `d4b95e208f`) with `/`, `/run`, and `/boot` mtimes clamped to `SOURCE_DATE_EPOCH` so the layer-derived `bootc install` composefs digest matches the merged-filesystem digest sealed into the UKI (`B-UKI-COMPOSEFS` closed; verified `INSTALL_RC=0` on `rock1` SD card write 2026-10-21).
- 2026-11-05: PineTab2 (`rk3566`) uses Pavel Golikov's 18-patch open-source U-Boot TPL DRAM driver (`1056 MHz` cap, `yubi-OS/u-boot` PR #1 `5c7fe6ca3b`) and `rk3568`/`rk3566` OP-TEE platform flavors (`yubi-OS/optee_os` `b619831e8a`) with `requires_rockchip_tpl: false` — no proprietary Rockchip DDR blob in the RK3566 chain (`u-boot-rockchip-spi.bin` is never `dd`'d raw to SD).
- 2026-11-06: `ci_test-vgpu-vm.yml` and `ci_test-vm.yml` bind-mount `/mnt/extended/containers` onto `/var/lib/containers` on `rock1` and stage VM disks under `/mnt/extended/tmp` (`470ca60904`), resolving `B-ROCK1-DISK` without repartitioning the 12 GB root disk.

## Retired From Active TODO

- Treating OpenSSL PQ hybrid support as future-only: current OpenSSL 3.5+ defaults already include `X25519MLKEM768`.
- Treating swu2f Layer 2 as merely planned: the TEST-only dev image path exists and must stay isolated.
- Repeating old digest examples from workflow logs as current pins: use [PINNED.md](../PINNED.md).
- Describing ARM64 as secondary: ADR-023 makes ARM64 primary and x86-64 supported secondary.
- Treating ROCK 5B as paused: it is the active bring-up board again (2026-10-10).
- Treating the RK3588 DDR/TPL input as missing: pinned in PR #310.
- Treating rock1 as offline or blocked on 12 GB root `ENOSPC`: `rock1` is online and bind-mounts `/mnt/extended/containers` onto `/var/lib/containers` (`470ca60904`, 2026-11-06).
- Treating `B-UKI-COMPOSEFS` as open: closed by the single-layer final image (`d4b95e208f`, 2026-10-20) and verified `INSTALL_RC=0` on `rock1` (2026-10-21, OMN-168 Done).
- Treating RK3566 (`pinetab2-rk3566`) as requiring a proprietary Rockchip DDR TPL blob: `yubi-OS/u-boot` PR #1 (`5c7fe6ca3b`) and `ci_firmware-rk.yml` (`3d46182203`, run `42124835234`) build and publish a blob-free open-source TPL (`requires_rockchip_tpl: false`).
- Treating the owner Secure Boot slot as 9c: PR #318 moved it to 9a; the ADR-002 amendment is pending.

## Today's BLOCKERS.md diff (2026-08-01 review)

Per the planning-cycle doctrine (BLOCKERS.md review-gate rule), the 2026-08-01 review added:

- New active blocker row **B-VGPU-VM-UNZIP**: rock1 self-hosted runner has no `unzip` binary installed; sealed-UKI BLSConfig verification path (OMN-150 Phase 2 / B-BOOTC-SEAL) and the negative-tamper-boot proof cannot complete on rock1. Run [30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) hit the gap at step 24 (`unzip: command not found`, exit 127). Tracked in Linear OMN-150 comment d2e627de.
- New **"Self-hosted runner host-deps gap"** entry in "Permanent CI-Evidence Patterns": workflow steps that shell out to binaries not in the apt install list fail with `127 (command not found)` even when every other layer is correct; yubiOS verification recipe is to list every CLI tool in the workflow's apt install block or use `python3 -m zipfile` / `python3 -m tarfile` as a zero-dependency fallback.
- `B-VM-CTAP2` second-pass arm64 proof logged under "Not Current Blockers": run 30697269619 is the first arm64-only end-to-end VM e2e PASS with the in-guest passless CTAP2 authenticator actually enumerated (no skip paths). Linear OMN-48 / yubiOS#25 stays closed; OMN-89 carries the hardware-leg proof point.

No previously active blockers were retired in this review. OMN-150 stays in Backlog until B-VGPU-VM-UNZIP is closed and the negative-tamper-boot proof lands.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 10, cycle 13)

the TODO surface is the register's companion; no agent edits this round; recorded as part of the docs/ round-10 sweep for inventory completeness.

## 2026-09-18 drift check (wayfinder round 11, cycle 19)

TODO.md: the register's companion; no agent edits; inventory completeness.

## Today's TODO.md diff (2026-10-18 review)

Checked against main (head `f99e5213`), the PRs merged between 2026-09-01 and 2026-10-18 (#223 to #326), and Linear state for the referenced OMN issues.

- Evidence header updated for PRs #310 to #326 and the ROCK 5B boot.
- ADR-033 marked merged (PR #151, 2026-07-30). New ADR items: the ADR-002 slot 9a amendment and the Path B record.
- Current CI: the unzip item now reads as fixed in code with verification blocked by disk. Added the diag_sign-matrix fix-or-retire item, two closed items (Lean gate hardening, ci_dispatch-reachability), and the Docker Hub restore.
- ARM64: ROCK 5B is active again, the DDR/TPL pin is done, OP-TEE and fTPM init reached on hardware, and the rehearsal deferral is recorded.
- Security: the YubiKey item is narrowed, and the owner-key ceremony is added.
- Supply chain: the reproducibility item is promoted to B-REPRO-MIRROR, the DDR/TPL approval is done, and OMN-157 is marked done with its follow-ups.
- Decisions recorded since 2026-08-24 are listed in a new section. Watch and retired lists updated. Linear reconciled to this register on 2026-10-18: OMN-53 reopened to In Progress, OMN-56 Done, OMN-151 commented.

## Today's TODO.md diff (2026-11-08 review)

Checked against `main` (head `3ebf154f4f`), all PRs and commits between 2026-10-18 and 2026-11-08 (#327, #328, `d4b95e208f`, `3d46182203`, `470ca60904`, `bad063d7e1`, `f9cd9d00a4`), org repositories (`yubi-OS/u-boot` PR #1, `yubi-OS/bcvk` `v0.22.0`, `yubi-OS/optee_os` `rk3568`/`rk3566`, `yubi-OS/chromium-provenance` PR #2 / `v156.0.8078.47-r1`, `yubi-OS/knowledge` PR #364, `yubi-OS/craft-web-builds`), and the Linear workspace (`OMN-1`..`OMN-173`).

- **Evidence header updated (2026-11-08):** records the `B-UKI-COMPOSEFS` single-layer fix (`d4b95e208f`, 2026-10-20) and `rock1` 59.5 GB SD card write (`INSTALL_RC=0`, 2026-10-21); the PineTab2 (`rk3566`) blob-free open-source U-Boot TPL (`yubi-OS/u-boot` PR #1 `5c7fe6ca3b`), `rk3568`/`rk3566` OP-TEE platform flavors (`yubi-OS/optee_os` `b619831e8a`), and `ci_firmware-rk.yml` green run `42124835234`; all 5 build-group runs green on 2026-11-05/08; `ci_test_sealed-uki-vm.yml` green run `42296684302` (`470ca60904`); `B-ROCK1-DISK` fix (`470ca60904`) + `soft-fido2-ctap` `GetInfo` `hmac-secret` fix (`bad063d7e1`) with `test-luks-fido2-ci.sh` passing in run `42476660637` and surfacing `B-PASSLESS-RPID`; and the Steady Orbit `/jev/` + `/forecasts/` + Antimony `v156.0.8078.47-r1` + `craft-web-builds` state.
- **ADR Governance:** recorded `OMN-166` (Done, dedicated ADR-032 row in the ADR project), `OMN-147` (Done), `OMN-144` assigned to the ADR project, and `OMN-126`/`127`/`128`/`135` (`ADR-018`/`019`/`020`/`027`) restored from Canceled to Backlog.
- **Current CI:** marked `B-UKI-COMPOSEFS` + `ci_test_sealed-uki-vm.yml` (`42296684302`) and `B-ROCK1-DISK` (`470ca60904`) done; added `B-PASSLESS-RPID` (`pamu2fcfg` origin on `passless v0.20.2`, OMN-169); updated Lean CI (`PR #328`, `42453950298`) and `ci_firmware-rk.yml` (`pinetab2-rk3566`, `42124835234`).
- **Current ARM64 & Supply Chain:** added the completed `pinetab2-rk3566` open-TPL port and firmware tag family (`firmware-pinetab2-rk3566`, `firmware-pinetab2-rk3566-<sha>`), updated ROCK 5B SD-install progress, and linked Linear `OMN-167`, `OMN-168`, `OMN-170`, `OMN-171`.
- **Decisions, Watch List, and Retired:** added the 2026-10-20 single-layer composefs decision, the 2026-11-05 PineTab2 open-TPL decision, and the 2026-11-06 `rock1` `/mnt/extended/containers` bind-mount decision; retired `B-UKI-COMPOSEFS` and `B-ROCK1-DISK`.

