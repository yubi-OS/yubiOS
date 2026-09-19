# yubiOS TODO

Last reviewed: 2026-08-24
Status: active task list
Latest CI-infra evidence (2026-08-24): all 7 failing infra workflows on main green again (SHA pins 5a50b96c, reachability parser + drift script + ci.yml groups 66f47bf7); bcvk fork release [v0.18.0-yubios.1](https://github.com/yubi-OS/bcvk/releases/tag/v0.18.0-yubios.1) cut at pinned source 34fb0b6b with amd64+arm64 binaries + SHA256SUMS (OMN-105/106 Done); lifecycle/sysext lanes green in ADR-023 gated mode with fixture images yubios-sysext-test:v1 / yubios-portable-svc-test:v1 (e587593f); vgpu lint gate fixed (ebf9223a); BLOCKERS.md adds B-ROCK1-OFFLINE (both self-hosted runners offline, all VM-boot verification queued).
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

- [x] Create one Linear issue per ADR and mark Accepted ones Done: ADR-001..017, 021..026, 028..032 -> Done; ADR-018, ADR-019, ADR-020, ADR-027 -> Backlog (still Proposed).
- [x] ADR-032 (Kernel+Rootfs Split) accepted 2026-07-29 (commit `a1940330` via PR #143); corresponding Linear OMN-51 marked Done.
- [ ] ADR-033 (Misbehavior-Triggered PCI-Mediation Cutoff) opened as PR #151 (`feat/adr-033-misbehavior-cutoff-policy`, faithful to `refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md` [SOLO] V3 finalist + `refs/adr-033-prior-art-search-2026-07-28.md`); status Pending until Jenny reviews + merges; companion Linear cluster OMN-144..147 already re-parented to ADR-031.
- [x] Correct the ADR-024 numbering collision: the vGPU/vfio-user trust boundary decision was mislabeled "candidate ADR-024" in refs/vgpu-vfio-user-trust-boundary-2026-07-25.md and in an earlier FUTURE.md edit. ADR-024 is the chipsec first-boot validation ADR; the GPU trust boundary landed as **ADR-031**. Fixed the stale FUTURE.md cross-reference and relabeled OMN-101 accordingly.
- [ ] Open a follow-up ADR (or amend ADR-031) once the IOMMU passthrough access gate (ADR-031 rule 2) has real enforcement code and hardware evidence, not just accepted design -- see OMN-101/OMN-108.
- [ ] Promote ADR-018/019/020 (ARM64 secure-world stack, dual root-of-trust paths, U-Boot UEFI+StandaloneMM) from Proposed to Accepted once the Milestone F hardware proof lands (see Current ARM64 Tasks below); update their Linear issues from Backlog to Done at the same time, not before.
- [ ] Promote ADR-027 (U-Boot FIDO2/U2F console gate) from idea-stage only after the USB HID threat model and recovery design named in FUTURE.md's Deferred Ideas are written.
- [ ] Keep new ADRs and their Linear issues created together going forward -- an ADR without a tracking issue is easy to lose track of once it leaves this file.

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
- [ ] Add `unzip` (or `python3 -m zipfile` / `bsdtar`) to the rock1 apt install in `.github/workflows/ci_test-vgpu-vm.yml`; B-VGPU-VM-UNZIP blocks the sealed-UKI BLSConfig verification path (OMN-150 Phase 2 / B-BOOTC-SEAL) AND the negative-tamper-boot proof. Run 30697269619 hit the gap at step 24 with `unzip: command not found` (exit 127). Same workflow file already installs `binutils fdisk jq docker.io containerd runc` -- extend that line.
- [x] Validate the bcvk virtiofs-root `bootloader-update.service` guard: run 29872832727 reached the guest assertions without the old DirectBoot/virtiofs failure.
- [x] Validate the bcvk root SSH credential path: run 29872832727 authenticated and ran the ARM64 guest-side assertions.
- [x] Confirm `tests/vm/test-fido2-enrollment.sh` still runs when token-dependent operations skip: run 29872832727 executed the enrollment-surface script after the passless layer found no CTAP2 device.
- [x] Make a swu2f CTAP2 token enumerate inside the ARM64 bcvk guest, then require the LUKS2 FIDO2, homed, and OpenSSH `ed25519-sk` operations to execute instead of skip. Run 30697269619 PASSes both `test-luks-fido2-ci.sh` and `test-fido2-enrollment.sh` against the in-guest passless CTAP2 authenticator on the ARM64 guest: `PASS: swtpm + swu2f CTAP2 + LUKS2 FIDO2 + homed FIDO2 verified` and `PASS: enrollment surface + CTAP2 registration + OpenSSH ed25519-sk verified`. Closes OMN-48 / yubiOS#25 on the production arm64 guest (not just the dev image). Tracked in Linear OMN-89 (Done) comment c74cec44.
- [x] Add a native arm64 build/publish leg and multi-architecture manifest merge to `.github/workflows/ci_mkosi-installer.yml`; run 29876111887 proved only the amd64 path, and the workflow now stages both architectures before merging public tags.
- [ ] Keep `dev`/`dev-<sha>` swu2f images isolated from production build and publish paths.
- [ ] Treat old-sha workflow reruns as historical unless the workflow is rerun against current `main`.
- [x] All workflows are `workflow_dispatch`-only -- no `on: push` triggers (group-routing redesign landed in PR #145). To run a workflow or chain, dispatch `ci.yml` with the appropriate `group:` choice.
- [x] Keep Docker Build Policy wiring centralized in `yubiOS-bake.hcl`: every build target inherits the explicit `yubiOS.rego` filename with `reset=true` and `strict=true`, without relying on automatic `Dockerfile.rego` loading. See [refs/docker-bake-consolidation-2026-07-17.md](../refs/docker-bake-consolidation-2026-07-17.md).
- [x] Add board variant fields to real-hardware firmware workflows before hardware lanes land: `rock5b-rk3588` as the Path A variant and `rockpro64-rk3399` as another Path A variant. See `.github/workflows/ci_firmware-rk.yml` and [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md).
- [x] Validate the documented `bootc install to-filesystem` path on a fresh VM or disposable disk, including external partition preparation, mounted `/mnt`, `--skip-finalize`, and omitted `root=` via `--root-mount-spec=""`: [run 29884493346](https://github.com/yubi-OS/yubiOS/actions/runs/29884493346) passed on native amd64 and arm64.
- [x] Strengthen the external-image `to-filesystem` smoke so it requires an ext4 `verity` feature, the composefs repository instead of an ostree fallback, measurable EROFS metadata images, a rejected protected-object write, and a strict digest-bound BLS entry classified as unsealed.
- [ ] Promote a sealed composefs lane only after the pinned base exposes the released v1.16.4 split/ukify capabilities; build and sign the exact rootfs UKI, boot it with Secure Boot on both architectures, assert UKI composefs status, and retain a negative tamper-boot proof.
- [x] PR #143 (commit `a1940330`, merged 2026-07-29) shipped the kernel-side artifact split per ADR-032: `0mniteck/yubios:uki-<sha>-<arch>` published as a separate OCI artifact, `Containerfile.uki`, `usr/lib/yubiOS/uki/install-uki.sh` documented, `usr/lib/bootc/install/50-yubiOS.toml` kargs pinned. Phase 2 (install-time BLSConfig wiring) is the remaining work — see `refs/kernel-rootfs-split-2026-07-29.md`. Closes OMN-51.

## Current ARM64 Tasks

- [x] Choose the first Path A board for production-root proof: Radxa ROCK 5B / RK3588 is on pause; ROCKPro64 / RK3399 is supported per ADR-029.
- [ ] Rehearse ROTPK/fuse provisioning on sacrificial hardware before production language.
- [ ] Prove OP-TEE, StandaloneMM, RPMB-backed variables, fTPM NV, and U-Boot UEFI on ROCKPro64 hardware first, then carry the supported evidence to ROCK 5B.
- [ ] Record exact TF-A, OP-TEE, StandaloneMM/RPMB, and U-Boot config evidence for Path A, including `CFG_RPMB_FS`, `CONFIG_EFI_MM_COMM_TEE`, and `CONFIG_SUPPORT_EMMC_RPMB`.
- [ ] Supply ROCK 5B builds with a licensed, immutable, checksum-verified RK3588 DDR/TPL blob and require `u-boot-rockchip.bin`; run 29869527608 published a diagnostic bundle without that bootable image.
- [x] Document Path A vs Path B status per board, starting with `rock5b-rk3588` and `rockpro64-rk3399`: [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md).

## Current Security Tasks

- [x] Audit services for `ConditionSecurity=measured-os` where enrollment or signing behavior must not run on an unmeasured boot: [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md).
- [x] Audit `RestrictFileSystems=` separately from the v261 `RestrictFileSystemAccess=` control: [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md).
- [x] Keep CHIPSEC first-boot validation scoped as a one-shot exception and document firmware-warning behavior: the unit and Bats coverage enforce the one-shot exception, while `run-firstboot-check.sh` documents `PASS`/`WARN`/`FAILED` semantics and informational WPBT/Computrace evidence.
- [ ] Add or refresh real-hardware YubiKey validation evidence for FIDO2 unlock and homed flows.
- [x] Keep recovery paths documented before enabling any feature that can lock an owner out: [refs/roadmap-promotion-gates-2026-07-17.md](../refs/roadmap-promotion-gates-2026-07-17.md).

## Current Supply-Chain Tasks

- [ ] Update [PINNED.md](../PINNED.md) for every base-image/tool digest change.
- [x] Pin the BuildKit daemon independently, derive `SOURCE_DATE_EPOCH` from the source commit, clamp OCI/layer timestamps, and enforce two isolated OCI-layout builds for production and dev: [refs/reproducible-builds-2026-07-22.md](../refs/reproducible-builds-2026-07-22.md).
- [ ] Replace live Fedora/Debian repository resolution with immutable snapshots plus exact package/toolchain closure before claiming later rebuildability.
- [x] Separate installer and TF-A signature-bearing envelopes—including the root-resident `systemd-boot*.efi.signed` file—from canonical unsigned subjects in the blocking ARM64 comparisons; retain both envelope digests without treating random keys/signatures as equality subjects.
- [x] Preseed pinned EDK2 with commit- and platform-scoped deterministic stack-cookie lists, then enforce two clean ARM64 component builds for every firmware board.
- [ ] Approve a checksum-pinned RK3588 DDR/TPL input before firmware equality can cover the final bootable ROCK 5B image.
- [ ] Verify package floors after digest bumps: systemd target, pam-u2f >= 1.3.1, OpenSSL 3.5+, and Go 1.24+ where relevant.
- [x] Keep production, installer, firmware, and dev/test artifacts clearly labeled and non-overlapping: [refs/firmware-rk-workflow-2026-07-17.md](../refs/firmware-rk-workflow-2026-07-17.md).
- [ ] Preserve provenance/SBOM expectations for published artifacts.
- [x] Keep production bootc (`latest`, `<sha>`), dev/test (`dev`, `dev-<sha>`), and installer (`installer`, `installer-<sha>`) tags board-neutral unless the OS or installer artifact actually diverges by board. Firmware is now the only board-scoped tag family.
- [x] Publish board-scoped firmware tags under the existing `0mniteck/yubios` namespace: `firmware-rock5b-rk3588`, `firmware-rock5b-rk3588-<sha>`, `firmware-rockpro64-rk3399`, and `firmware-rockpro64-rk3399-<sha>`, plus the QEMU baseline tags documented in [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md).

## Watch List

- Run 29525332901 proved the ARM64 lane can boot the dev image to Fedora login with the pinned QEMU workaround; keep watching for runner QEMU refreshes before removing that workaround.
- Run 29872832727 retired the old root-SSH and DirectBoot bootloader-update blockers. Its remaining VM gap was narrower: passless starts, but no CTAP2 token enumerates, so token-dependent assertions skip.
- Run 30697269619 (commit b7f9d467 on main) retires the residual CTAP2-skip leg on rock1: both `test-luks-fido2-ci.sh` and `test-fido2-enrollment.sh` reach their final `PASS:` assertions against the in-guest passless authenticator (not the dev image only). Its remaining gap is the sealed-UKI negative-tamper-boot leg (step 24+), blocked by B-VGPU-VM-UNZIP rather than by harness or guest bugs. Use this run as the canonical VM e2e evidence reference until the next green redline.
- Run 29869527608 proves the QEMU fTPM/StandaloneMM integration and board-specific compilation, but not physical-board behavior. ROCK 5B additionally lacks the required real DDR/TPL input and combined boot image.
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

## Retired From Active TODO

- Treating OpenSSL PQ hybrid support as future-only: current OpenSSL 3.5+ defaults already include `X25519MLKEM768`.
- Treating swu2f Layer 2 as merely planned: the TEST-only dev image path exists and must stay isolated.
- Repeating old digest examples from workflow logs as current pins: use [PINNED.md](../PINNED.md).
- Describing ARM64 as secondary: ADR-023 makes ARM64 primary and x86-64 supported secondary.

## Today's BLOCKERS.md diff (2026-08-01 review)

Per the planning-cycle doctrine (BLOCKERS.md review-gate rule), the 2026-08-01 review added:

- New active blocker row **B-VGPU-VM-UNZIP**: rock1 self-hosted runner has no `unzip` binary installed; sealed-UKI BLSConfig verification path (OMN-150 Phase 2 / B-BOOTC-SEAL) and the negative-tamper-boot proof cannot complete on rock1. Run [30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) hit the gap at step 24 (`unzip: command not found`, exit 127). Tracked in Linear OMN-150 comment d2e627de.
- New **"Self-hosted runner host-deps gap"** entry in "Permanent CI-Evidence Patterns": workflow steps that shell out to binaries not in the apt install list fail with `127 (command not found)` even when every other layer is correct; yubiOS verification recipe is to list every CLI tool in the workflow's apt install block or use `python3 -m zipfile` / `python3 -m tarfile` as a zero-dependency fallback.
- `B-VM-CTAP2` second-pass arm64 proof logged under "Not Current Blockers": run 30697269619 is the first arm64-only end-to-end VM e2e PASS with the in-guest passless CTAP2 authenticator actually enumerated (no skip paths). Linear OMN-48 / yubiOS#25 stays closed; OMN-89 carries the hardware-leg proof point.

No previously active blockers were retired in this review. OMN-150 stays in Backlog until B-VGPU-VM-UNZIP is closed and the negative-tamper-boot proof lands.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
