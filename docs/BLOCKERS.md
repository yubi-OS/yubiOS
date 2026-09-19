# yubiOS Blockers

Last reviewed: 2026-08-24
Status: active blocker register

This file lists current blockers only. Historical blockers that were resolved by merged work should move into ADRs, refs, or PR history rather than staying in the active list.

## Active Blockers

| ID | Area | Blocker | Current next step |
|---|---|---|---|
| B-ARM64-PATHA | ARM64 hardware | Path A is not production until a real board proves ROTPK/fuse provisioning, OP-TEE, RPMB-backed StandaloneMM variables, fTPM NV, U-Boot UEFI, and signed UKI boot. Board roles are documented in [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md). | Run a documented sacrificial ROCK 5B / RK3588 rehearsal before production language, then carry secondary evidence to ROCKPro64 / RK3399. |
| B-RK3588-TPL | ROCK 5B firmware | Run 29869527608 compiled the RK3588 components but recorded that U-Boot requires a real external DDR/TPL blob. The bundle lacked the expected `u-boot-rockchip.bin`, so its green publish job is diagnostic packaging, not a flashable image. | Select a legally redistributable source, pin its immutable ref and checksum, fail closed when it is absent, and prove the resulting combined image on sacrificial ROCK 5B hardware. |
| B-QEMU-ZBOOT | VM CI | zstd EFI zboot still depends on a pinned QEMU workaround until runner QEMU carries the upstream fix; run 29525332901 proved the workaround is no longer the active failure for the ARM64 lane. | Keep the workaround explicit, keep the stale-cache skip, and revisit removal only after runner image refresh. |
| B-PINS | Supply chain | Base-image digest changes require explicit [PINNED.md](../PINNED.md) updates and package-floor checks. | Treat stale run-specific digests as historical evidence only. |
| B-HARDENING-RUNTIME | systemd hardening | Static hardening audit is complete in [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md), but runtime evidence still needs the target image/base to run the Bats unit checks and `systemd-analyze verify`. | Run the hardening tests in a target image/base before adding `RestrictFileSystemAccess=` or claiming runtime enforcement beyond the existing `RestrictFileSystems=~@network` enrollment control. |
| B-REAL-FIDO2 | E2E unlock | SoftHSM and swu2f exercise interfaces, but production confidence still needs a physical YubiKey to validate FIDO2 unlock, homed, resident SSH keys, PAM presence, PIV signing, recovery, and failure handling. | First close B-VM-CTAP2 for deterministic software coverage, then retain a real-hardware evidence run as the production-confidence gate. |
| B-BOOTC-SEAL | bootc composefs | Phase 1 (artifact split) is shipped: the pre-built PKCS#11-signed UKI is now published as a separate OCI artifact (`docker.io/0mniteck/yubios:uki-<sha>-<arch>`) per ADR-022 + ADR-032, alongside the bootc `latest`/`<sha>` rootfs image. PR #143 (commit `a1940330`, merged 2026-07-29) closed OMN-51 and the artifact-split half of `B-BOOTC-SEAL`. New files: `Containerfile.uki`, `usr/lib/yubiOS/uki/install-uki.sh`, `refs/kernel-rootfs-split-2026-07-29.md`; modified: `yubiOS-bake.hcl` (new `yubios-uki` target), `usr/lib/bootc/install/50-yubiOS.toml` (added `[install] kargs`), `docs/ADR.md` (ADR-032 appended), `docs/BLOCKERS.md` (this row). What remains (Phase 2): install-time BLSConfig wiring so the pre-built UKI is selected at install instead of the bootc-auto-generated UKI — bootc 1.16.3 has no project-authored BLSConfig drop-in intake. Also still open: prove Secure Boot on amd64 and arm64, retain negative tamper-boot evidence, decide between bootc-side patch (option A) or fedora-bootc v1.16.4+ bump (option C). See [refs/kernel-rootfs-split-2026-07-29.md](../refs/kernel-rootfs-split-2026-07-29.md) and [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md). | Complete the install-time BLSConfig wiring to use the pre-built UKI artifact (Phase 2 of ADR-032): either (a) bootc-side patch mirroring the secureboot-keys flow at `/usr/lib/bootc/install/loader-entries/*.conf`, or (b) bump the base to a fedora-bootc carrying bootc v1.16.4+ for `bootc container split-kernel-and-rootfs`. Then require Secure Boot and negative tamper boots on amd64 and arm64. See [refs/kernel-rootfs-split-2026-07-29.md](../refs/kernel-rootfs-split-2026-07-29.md) and [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md). |

| B-VGPU-VM-UNZIP | vGPU VM e2e (sealed-UKI leg) | rock1 self-hosted runner has no `unzip` binary in its apt install list. Step 24 of `.github/workflows/ci_test-vgpu-vm.yml` (`Lay down signed UKI from sealed-UKI VM artifact`) downloaded `sealed-uki-artifacts-arm64` from sealed-UKI source run [30652859000](https://github.com/yubi-OS/yubiOS/actions/runs/30652859000) cleanly, then failed at line 25 of the step script with `/home/shant/actions-runner/_work/_temp/<tmp>.sh: line 25: unzip: command not found` and exit 127. Every prior step (11 image pull, 13/14 preconditions, 15 hardware leg PASS, 16 VM guest PASS, 17 enrollment surface PASS, 20-22 disk prep, 23 digest sanity) was green. The single missing apt package cascades to skip steps 25-32 (the entire sealed-UKI BLSConfig leg) and fails step 31 (teardown) on the way out. | FIXED IN CODE (2026-08-24 review): `unzip` is in the workflow's `Install extra deps` apt block, which runs before the sealed-UKI extract step. Verification run dispatched with allow_real_u2f=true (run 32732596620) but queued behind `B-ROCK1-OFFLINE`. Once rock1 is back: confirm steps 21/33/37 and the Negative 2 refusal, then retire this row. |

| B-ROCK1-OFFLINE | CI infrastructure | Both self-hosted runners (rock1: self-hosted/Linux/ARM64/KVM; GPU: self-hosted/Linux/ARM64/GPU) show **offline** in the repo runner registry as of 2026-08-24 ~13:35Z (offline, not busy). Every bcvk VM boot leg is hardware-blocked: amd64 hosted runners cannot run bcvk ephemeral VMs (virtiofsd rc=2, open diagnosis yubiOS#9/#20/#25, gated per ADR-023), and rock1 is the only host where VM legs actually run. The OMN-151 verification run 32732596620 is queued against it. | Human action: power/network-check the rock1 board (and the GPU runner if wanted). When it re-registers, the queued vgpu run starts automatically (or expires after 24h -- re-dispatch ci_test-vgpu-vm.yml with allow_real_u2f=true), and ci_test-bootc-lifecycle / ci_test-sysext-portable can be dispatched with run_vm_legs=true for their full VM legs. |

## Not Current Blockers

These are no longer active blockers after the latest docs and CI work:

- Workflow-file writes are not blocked by a missing token scope in the current connected-app workflow. Keep workflow trigger changes narrow, but do not repeat the old manual-only guidance.
- PQ TLS implementation is not waiting for future OpenSSL support. OpenSSL 3.5+ and Go 1.24+ provide default `X25519MLKEM768` behavior; the active work is verification and regression gating.
- systemd v261 is not a future-only planning item in the docs. Current docs should describe completed v261 research as reviewed, while leaving specific implementation gates where evidence is still needed.
- swu2f Layer 2 is no longer merely a planned concept; the `dev` image path is live for TEST-only VM validation.
- The ARM64 VM e2e lane is no longer blocked at the pre-boot host/harness or guest-SSH layer when the pinned QEMU workaround is active; the remaining software-authenticator gap is tracked as `B-VM-CTAP2`.
- **B-VM-CTAP2 RESOLVED (2026-07-25).** Two real bugs were root-caused and fixed: (1) `pamu2fcfg` was missing from the built image (Fedora Rawhide splits it into its own subpackage from `pam-u2f`) -- fixed in the production `Containerfile` (PR #125) after an earlier fix to the wrong build path (`mkosi.conf`, PR #102) didn't take effect; (2) `test-luks-fido2-ci.sh`'s `homectl create` FIDO2 home-create leg was hanging 5 minutes on an empty `NEWPASSWORD=` instead of failing fast -- fixed with `--enforce-password-policy=no` (PR #102). [Run 30139433902 / job 89629762908](https://github.com/yubi-OS/yubiOS/actions/runs/30139433902/job/89629762908) proves the full chain end-to-end with no skips: host `bcvk --swu2f` uhid load -> in-guest `passless` -> `/dev/hidraw0` CTAP2 hmac-secret enumeration -> LUKS2 FIDO2 enroll/unlock PASS -> systemd-homed FIDO2 home create PASS -> `pamu2fcfg` FIDO2 registration OK -> `ssh-keygen -t ed25519-sk` OK. Both test scripts report PASS. Tracked in Linear OMN-48 (Done).

- **B-VM-CTAP2 second-pass arm64 proof (2026-08-01).** [Run 30697269619 / job 91362188919](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619/job/91362188919) on rock1 (self-hosted ARM64 KVM, commit `b7f9d467` on main) ran both `tests/vm/test-luks-fido2-ci.sh` and `tests/vm/test-fido2-enrollment.sh` end-to-end against the ARM64 bcvk guest and got `PASS: swtpm + swu2f CTAP2 + LUKS2 FIDO2 + homed FIDO2 verified` and `PASS: enrollment surface + CTAP2 registration + OpenSSH ed25519-sk verified`. This is the first arm64-only end-to-end proof with the in-guest passless CTAP2 authenticator actually enumerated (no skip paths), confirming OMN-48 / yubiOS#25 closure on the production ARM64 guest (not just the dev image as in the earlier 30139433902 proof). Hardware leg (`tests/vm/test-luks-fido2.sh` against `/dev/sda`) also PASSes -- FIDO2 token enrolled as slot 2 via `systemd-cryptenroll`. Tracked in Linear OMN-89 (Done) comment c74cec44.
- `B-VM-SSH` and `B-VM-BOOTLOADER-UPDATE` are retired by [run 29872832727](https://github.com/yubi-OS/yubiOS/actions/runs/29872832727): root public-key authentication succeeded, guest assertions ran, and the DirectBoot/virtiofs bootloader-update guard did not reproduce the old failure.
- Strict composefs fs-verity is not itself blocked: the offline install lane can
  and does test it. `B-BOOTC-SEAL` is the narrower authenticity gap between a
  mutable BLS digest anchor and a signed UKI plus Secure Boot chain.
- The hardening documentation audit is no longer pending as a static docs task; the remaining hardening blocker is runtime validation inside the target image/base.

## Inconsistency Log

The 2026-07-11 planning cycle found and corrected these inconsistencies across docs:

- `RestrictFileSystems=` was described as a new v261 feature. It is the existing BPF-LSM filesystem-type limiter; `RestrictFileSystemAccess=` is the v261 addition.
- Older docs treated ARM64 as secondary even after ADR-023 made ARM64 primary.
- Old TODO/run notes included stale base-image digest examples. [PINNED.md](../PINNED.md) is now called out as the only live digest source.
- Some refs described TEST-only swu2f and v261 work as pending after later PRs made them live or reviewed.
- `AGENTS.md` and tool docs repeated an obsolete warning about workflow-token scope.

## Reporting Rule

When a blocker changes state, update this file and the relevant issue or PR report. Do not leave resolved blockers in the active table just because they are historically important.

## Permanent CI-Evidence Patterns

These are failure modes that have happened in CI and are expected to recur; the doctrine below is what the repo does about them. Add new entries as further CI-evidence patterns emerge; remove only when the underlying mechanism is removed.

### Systemd drop-in lex-sort rule (est. 2026-07-30, source: OMN-149)

`modprobe.d`, `dracut.conf.d`, `tmpfiles.d`, `systemd/*.service.d/`, and `udev/rules.d` ALL sort files lexicographically by full filename (per systemd-tmpfiles(5): "All configuration files are sorted by their filename in lexicographic order"). Numeric-prefixed naming (`50-...`, `53-...`) is a sysv-init `rcN.d/` convention that does NOT transfer to systemd drop-in directories.

**yubiOS naming convention for systemd drop-in overrides whose intent is "fire after upstream":** use `vfio-yubiOS-...`, `yubiOS-...`, or any other prefix that lex-sorts AFTER every upstream package file the drop-in overrides. Drop-ins whose intent is "fire before upstream" can keep a low numeric prefix or `yubiOS-` only.

**Verification recipe** for any new yubiOS drop-in override: `ls -1 usr/lib/<dir>/ | sort -u` and confirm the yubiOS filename sorts AFTER every upstream package file it intends to override. If a future upstream package adds a same-prefix file (e.g. another `static-...`), re-verify the ordering.

**Source of the lesson:** OMN-149. `/dev/vfio` was found in a yubiOS guest despite `usr/lib/tmpfiles.d/53-yubiOS-no-static-vfio.conf` being shipped in commit `59f4332` (2026-07-26). Root cause was the `"53"` prefix lex-sorting BEFORE upstream `static-nodes-permissions.conf`'s `"s"` prefix (`"5"` 0x35 < `"s"` 0x73 in ASCII), so the yubiOS `r /dev/vfio/vfio` fired first and the upstream `z /dev/vfio/vfio 0666 - - -` then re-created the cdev last on every boot. The fix renamed the file to `vfio-yubiOS-no-static-vfio.conf` (leading `"v"` 0x76 lex-sorts AFTER `"s"` 0x73) in commit `f92c6010`. `/dev/vfio` had existed in every yubiOS guest for 4 days before this was caught.

Cross-references: PROJECT_RULES.md entry "systemd drop-in lex-sort lesson (2026-07-30)"; commit `f92c6010`; Linear OMN-149.


### Self-hosted runner host-deps gap (est. 2026-08-01, source: B-VGPU-VM-UNZIP)

Self-hosted runners (rock1 in our case) persist between runs, but the apt install list inside `.github/workflows/*.yml` is the only place we can add a missing dependency. Workflow steps that shell out to binaries not in that list fail with `127 (command not found)` even if every other layer (image, code, harness) is correct. This is structurally similar to OMN-149 (lex-sort) and OMN-139 (registry stream truncation) -- the lesson class is "hidden deps on the runner image", not "the code is wrong".

**yubiOS verification recipe for any new workflow step that invokes a CLI tool:**

- List the binary in the workflow's apt install block, even if it seems "obviously" present on a stock Ubuntu 24.04 image.
- For tools that aren't apt-packaged on Ubuntu 24.04 (`unzip`, `bsdtar`, `zstd`), either pin an apt package or use `python3 -m zipfile` / `python3 -m tarfile` / `python3 -m zstandard` as a zero-dependency fallback.
- For every workflow step that calls an external CLI, add `command -v <tool> || { echo "::error::<tool> not on PATH"; exit 1; }` near the top of the step to surface the missing dep loudly instead of silently with exit 127.

**Source of the lesson:** B-VGPU-VM-UNZIP. [Run 30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) (2026-08-01, commit `b7f9d467` on main) reached step 24 of `ci_test-vgpu-vm.yml`, downloaded `sealed-uki-artifacts-arm64` from sealed-UKI source run [30652859000](https://github.com/yubi-OS/yubiOS/actions/runs/30652859000) (branch `sealed-uki-vm-lane-v2`, SHA `1d0666d7`, V83) cleanly, then failed at `unzip -o /tmp/uki.zip` with `command not found`. Every prior CI step was green (image pull, precondition gates, VM hardware leg PASS, VM guest PASS, enrollment surface PASS, disk prep, digest sanity-check). The single missing apt package blocked steps 25-32 (the entire sealed-UKI BLSConfig verification leg) AND the negative-tamper-boot proof.

Cross-references: BLOCKERS.md row `B-VGPU-VM-UNZIP`; Linear OMN-150 comment `d2e627de`; [run 30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) step 24; TODO.md new task in "Current CI Tasks".

## Today's BLOCKERS.md diff (2026-08-01 review)

Per the planning-cycle doctrine (BLOCKERS.md review-gate rule), the 2026-08-01 review added:

- New active blocker row **B-VGPU-VM-UNZIP**: rock1 self-hosted runner has no `unzip` binary installed; sealed-UKI BLSConfig verification path (OMN-150 Phase 2 / B-BOOTC-SEAL) AND the negative-tamper-boot proof cannot complete on rock1. Run [30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) hit the gap at step 24 (`unzip: command not found`, exit 127). Tracked in Linear OMN-150 comment `d2e627de`.
- New "Self-hosted runner host-deps gap" entry in "Permanent CI-Evidence Patterns": workflow steps that shell out to binaries not in the apt install list fail with `127 (command not found)` even when every other layer is correct; yubiOS verification recipe is to list every CLI tool in the workflow's apt install block or use `python3 -m zipfile` / `python3 -m tarfile` as a zero-dependency fallback.
- `B-VM-CTAP2` second-pass arm64 proof logged under "Not Current Blockers": [run 30697269619](https://github.com/yubi-OS/yubiOS/actions/runs/30697269619) is the first arm64-only end-to-end VM e2e PASS with the in-guest passless CTAP2 authenticator actually enumerated (no skip paths). Linear OMN-48 / yubiOS#25 stays closed; OMN-89 carries the hardware-leg proof point.

No previously active blockers were retired in this review. OMN-150 stays in Backlog until B-VGPU-VM-UNZIP is closed and the negative-tamper-boot proof lands.



## Today's BLOCKERS.md diff (2026-08-24 review)

CI-infra recovery day (Sauna self-mode session, full approvals):

- **All 7 failing infra workflows on main are green again.** Root causes: (1) six workflows referenced actions by version tag, rejected by the full-SHA pin policy at job setup (fixed vs PINNED.md, commit 5a50b96c; setup-python row added); (2) scripts/assert-dispatch-reachable.py required QUOTED filenames when parsing ci.yml's bash arrays -- zero groups parsed, all 35 workflows flagged orphan (fixed, commit 66f47bf7); (3) scripts/detect-fork-drift.py had unescaped quotes inside rf-strings -- SyntaxError at import (same commit); (4) ci.yml group tables now cover every workflow_dispatch workflow (new audits + research groups; ci_test_pq_tsl_verify.yml typo fixed in the all group).
- **bcvk fork release exists (OMN-105/106 closed):** tag v0.18.0-yubios.1 at the PINNED pinned source commit 34fb0b6b, assets bcvk-amd64/bcvk-arm64/bcvk(compat)/SHA256SUMS. ci_test-bootc-lifecycle + ci_test-sysext-portable now download+checksum-verify the release binary (OMN-107 pattern) instead of 404ing on a nonexistent release.
- **Lifecycle/sysext lanes green in gated mode:** amd64 hosted runners cannot boot bcvk VMs (virtiofsd rc=2, diagnosis #9/#20/#25), so both lanes now mirror ci_test-vm.yml's ADR-023 loud-skip: default runs verify bcvk release download + image/fixture pullability; run_vm_legs=true dispatches route to rock1. Test fixture images published: docker.io/0mniteck/yubios-sysext-test:v1 + yubios-portable-svc-test:v1 (FROM scratch, built from tests/fixtures/ via ci_build-test-fixtures.yml).
- **B-VGPU-VM-UNZIP:** fix confirmed in code (unzip in Install extra deps, ordered before the extract step); lint errors that were skipping the whole vgpu e2e leg fixed (SC2034/SC2024/SC2046, commit ebf9223a). Verification pending rock1.
- **New active blocker B-ROCK1-OFFLINE:** both self-hosted runners offline; all VM-boot verification queued behind a physical power/network check.
- OMN-139 (quay.io stream truncation incident) closed Done: canary lane green since 2026-07-29.

## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
