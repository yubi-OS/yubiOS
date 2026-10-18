# yubiOS Blockers

Last reviewed: 2026-10-18
Status: active blocker register

This file lists current blockers only. Historical blockers that were resolved by merged work should move into ADRs, refs, or PR history rather than staying in the active list.

## Active Blockers

| ID | Area | Blocker | Current next step |
|---|---|---|---|
| B-ARM64-PATHA | ARM64 hardware | Path A is not production until a real board proves owner-key enrollment into StandaloneMM, RPMB-backed variables, fTPM NV, U-Boot UEFI, and signed UKI boot. Status 2026-10-18: ROCK 5B / RK3588 boots CI-built firmware and reaches OP-TEE and fTPM init (`YUBIOS_TPM_OK`, 2026-10-11). The ROTPK/TBB rehearsal is deferred (Path B first, decision 2026-10-11), so Path A stays open as the proof. Board roles are documented in [refs/arm64-rk-board-status-2026-07-17.md](../refs/arm64-rk-board-status-2026-07-17.md). | Write the StandaloneMM enrollment step for the owner keys and prove it on ROCK 5B, then prove signed UKI boot there. Carry the evidence to ROCKPro64 / RK3399, which has not started and likely needs the same `SPD=opteed` change. |
| B-QEMU-ZBOOT | VM CI | zstd EFI zboot still depends on a pinned QEMU workaround until runner QEMU carries the upstream fix; run 29525332901 proved the workaround is no longer the active failure for the ARM64 lane. | Keep the workaround explicit, keep the stale-cache skip, and revisit removal only after runner image refresh. |
| B-PINS | Supply chain | Base-image digest changes require explicit [PINNED.md](../PINNED.md) updates and package-floor checks. | Treat stale run-specific digests as historical evidence only. |
| B-REPRO-MIRROR | Reproducible builds | The two-build reproducibility gate can fail when the two builds resolve different package versions from live repositories. On 2026-10-17 (run 39100931710) the arm64 comparison failed because glibc was 2.44-1 in one build and 2.44-2 in the other; rerun attempt 2 passed. An earlier kernel 7.2.9 vs 7.2.11 mismatch looks like the same class. | Pin the Fedora package set to an immutable snapshot (kojipkgs compose or a shared mirror). This promotes the TODO item on immutable snapshots to a blocker. |
| B-HARDENING-RUNTIME | systemd hardening | Static hardening audit is complete in [refs/systemd-hardening-audit-2026-07-17.md](../refs/systemd-hardening-audit-2026-07-17.md), but runtime evidence still needs the target image/base to run the Bats unit checks and `systemd-analyze verify`. | Run the hardening tests in a target image/base before adding `RestrictFileSystemAccess=` or claiming runtime enforcement beyond the existing `RestrictFileSystems=~@network` enrollment control. |
| B-REAL-FIDO2 | E2E unlock | Narrowed 2026-10-18. Physical-YubiKey LUKS2 FIDO2 enroll and unlock passed on the rock1 hardware leg (2026-08-01, slot 2, issue #20 closed). Still unproven on hardware: systemd-homed FIDO2 with retained logs, PAM presence, resident SSH keys, PIV signing (see B-OWNER-KEYS), recovery, and failure handling. | Run the remaining operations in one attended YubiKey session on rock1, keeping the evidence format of the 2026-08-01 run. |
| B-OWNER-KEYS | Secure Boot ownership | The owner PK/KEK/db chain has never been enrolled on hardware. PR #318 (merged 2026-10-17) rewrote `enroll-sb.sh` for PIV slot 9a signing only, but the script has never run on a YubiKey and has no StandaloneMM enrollment step yet. The YubiKey was not visible on rock1 as of 2026-10-16. ADR-002 still names slot 9c. | Attach a YubiKey to rock1 for an attended run (PIN and touch by the owner, only public material returned). Add the StandaloneMM enrollment step, run `enroll-sb.sh`, then amend ADR-002 for slot 9a. |
| B-BOOTC-SEAL | bootc composefs | Phase 1 (artifact split) is shipped: the pre-built PKCS#11-signed UKI is now published as a separate OCI artifact (`docker.io/0mniteck/yubios:uki-<sha>-<arch>`) per ADR-022 + ADR-032, alongside the bootc `latest`/`<sha>` rootfs image. PR #143 (commit `a1940330`, merged 2026-07-29) closed OMN-51 and the artifact-split half of `B-BOOTC-SEAL`. New files: `Containerfile.uki`, `usr/lib/yubiOS/uki/install-uki.sh`, `refs/kernel-rootfs-split-2026-07-29.md`; modified: `yubiOS-bake.hcl` (new `yubios-uki` target), `usr/lib/bootc/install/50-yubiOS.toml` (added `[install] kargs`), `docs/ADR.md` (ADR-032 appended), `docs/BLOCKERS.md` (this row). What remains (Phase 2): install-time BLSConfig wiring so the pre-built UKI is selected at install instead of the bootc-auto-generated UKI — bootc 1.16.3 has no project-authored BLSConfig drop-in intake. Also still open: prove Secure Boot on amd64 and arm64, retain negative tamper-boot evidence, decide between bootc-side patch (option A) or fedora-bootc v1.16.4+ bump (option C). Status 2026-10-18: the install rehearsal now fails on the composefs digest (B-UKI-COMPOSEFS). OMN-53 is closed Done in Linear, but this row still requires Secure Boot and negative tamper boots on both architectures, so the row stays open. See [refs/kernel-rootfs-split-2026-07-29.md](../refs/kernel-rootfs-split-2026-07-29.md) and [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md). | Complete the install-time BLSConfig wiring to use the pre-built UKI artifact (Phase 2 of ADR-032): either (a) bootc-side patch mirroring the secureboot-keys flow at `/usr/lib/bootc/install/loader-entries/*.conf`, or (b) bump the base to a fedora-bootc carrying bootc v1.16.4+ for `bootc container split-kernel-and-rootfs`. Then require Secure Boot and negative tamper boots on amd64 and arm64. See [refs/kernel-rootfs-split-2026-07-29.md](../refs/kernel-rootfs-split-2026-07-29.md) and [refs/bootc-composefs-sealed-flow-2026-07-22.md](../refs/bootc-composefs-sealed-flow-2026-07-22.md). |
| B-UKI-COMPOSEFS | Sealed install path | The owner install rehearsal fails its composefs digest check. The UKI embeds digest `0235777b`, while `bootc install` computes `a3156f14` on the final image. The rehearsal on image `fa02a222`, built after PR #326 merged on 2026-10-18, still returned INSTALL_RC=1. The leading theory is that the UKI stage digests the image before the final stage adds `/boot` content. That theory is not verified. | Pin `/boot` mtime to `SOURCE_DATE_EPOCH` in the staged copy and recompute `bootc container compute-composefs-digest` on the final image. If that does not match, move the UKI stage to digest the final image. Rerun the rehearsal after each change. No SD card write until it returns INSTALL_RC=0. |
| B-VGPU-VM-UNZIP | vGPU VM e2e (sealed-UKI leg) | rock1 self-hosted runner has no `unzip` binary in its apt install list. Step 24 of `.github/workflows/ci_test-vgpu-vm.yml` (`Lay down signed UKI from sealed-UKI VM artifact`) downloaded `sealed-uki-artifacts-arm64` from sealed-UKI source run [30652859000](https://github.com/yubi-OS/yubiOS/actions/runs/30652859000) cleanly, then failed at line 25 of the step script with `/home/shant/actions-runner/_work/_temp/<tmp>.sh: line 25: unzip: command not found` and exit 127. Every prior step (11 image pull, 13/14 preconditions, 15 hardware leg PASS, 16 VM guest PASS, 17 enrollment surface PASS, 20-22 disk prep, 23 digest sanity) was green. The single missing apt package cascades to skip steps 25-32 (the entire sealed-UKI BLSConfig leg) and fails step 31 (teardown) on the way out. | FIXED IN CODE (2026-08-24 review): `unzip` is in the workflow's `Install extra deps` apt block, which runs before the sealed-UKI extract step. Verification run 32732596620 (allow_real_u2f=true) was queued behind `B-ROCK1-OFFLINE`, now resolved. The next arm64 KVM attempt on 2026-10-06 failed on disk during the image pull, before step 24 (`B-ROCK1-DISK`). Confirm steps 21/33/37 and the Negative 2 refusal on rock1, then retire this row. A 2026-09-18 drift note says the retirement condition was met on 2026-09-09. This register records no passing run of those steps, so the row stays open. |
| B-ROCK1-DISK | CI capacity | rock1 is the only KVM-capable self-hosted runner, and its root filesystem is 12 GB. On 2026-10-06 each attempt of the arm64 KVM leg in `ci_test-vgpu-vm.yml` died with ENOSPC while pulling `yubios:dev` (about 2.5 to 3 GB unpacked, 5 to 6 GB at peak). The failed pulls left untagged overlay residue that `podman system prune` does not reclaim; only `podman system reset` clears it. The run was parked at about 4.9 GB free. | Choose one: a larger root disk, a second KVM runner with more storage, or podman graphroot on a larger card. Run `podman system reset` only after the owner's go. |

## Not Current Blockers

These are no longer active blockers after the latest docs and CI work:

- **B-RK3588-TPL RESOLVED (2026-10-10).** PR #310 pinned rockchip-linux/rkbin at `3e288fe8` with the DDR/TPL checksum and fails closed when the input is missing. The combined ROCK 5B loader booted the board on 2026-10-11 (run 38126763632). The license for the Rockchip blob is the owner's call, and the pin is recorded in PINNED.md.
- **B-ROCK1-OFFLINE RESOLVED (2026-09-24 to 2026-10-06).** rock1 re-registered as a self-hosted runner on 2026-09-24 and has run as a systemd unit since 2026-10-01. The 2026-10-06 arm64 KVM attempt reached the image-pull step, so the runner was live. The active constraint is now B-ROCK1-DISK.

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

### Self-hosted runner disk exhaustion (est. 2026-10-06, source: B-ROCK1-DISK)

A failed container pull on a small self-hosted root filesystem leaves partial overlay layers. Those layers are untagged, so `podman system prune` reports nothing reclaimed. Only `podman system reset` (which clears all podman storage on that host) frees them. In practice every retry starts from the reduced free space, so the loop does not converge.

**Recipe:** before dispatching an image-heavy leg on a self-hosted runner, check `df -h` and size the check against the unpacked image, not the compressed pull. On ENOSPC, stop retrying. Reclaim with `podman system reset` only after an owner decision.

**Source:** B-ROCK1-DISK. 2026-10-06 `ci_test-vgpu-vm.yml` arm64 KVM attempts on rock1 (podman exit 125, ENOSPC during the `yubios:dev` pull).

### Two-build divergence from live package repositories (est. 2026-10-17, source: B-REPRO-MIRROR)

Two builds of the same commit can resolve different package versions when the package repositories update between them. The comparison then fails on content unrelated to the code. On 2026-10-17 a glibc 2.44-1 vs 2.44-2 split surfaced as a `libdnf5` `nevras.toml` diff inside a 2 GB layer, and a rerun passed.

**Recipe:** a reproducibility failure whose diff is limited to package-manager metadata or versions is a resolution problem first. Compare the resolved package set in both builds before reading the diff as a code change. The durable fix is an immutable package snapshot, not a retry.

**Source:** B-REPRO-MIRROR. yubiOS-ci run 39100931710 (arm64 two-build comparison).

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

## 2026-09-18 drift check (wayfinder round 10, cycle 11)

the register's two stale rows (B-VGPU-VM-UNZIP retirement condition met 2026-09-09; B-ROCK1-OFFLINE naming the retired GPU runner) were already flagged by this round's refs-side drift check; this addendum records the flag inside the register itself as a review-request note, not a row edit (register edits belong to the next review).

## 2026-09-18 drift check (wayfinder round 11, cycle 22)

the register: the two stale rows remain flagged in-register (round 10); no register edit this round; the register review remains the prescribed next step.

## Today's BLOCKERS.md diff (2026-10-18 review)

Checked against main (head `f99e5213`), the PRs merged between 2026-09-01 and 2026-10-18 (#223 to #326), and Linear state for the referenced OMN issues.

- **Moved to Not Current:** B-RK3588-TPL (PR #310 and the 2026-10-11 boot) and B-ROCK1-OFFLINE (runner re-registered; the constraint is now B-ROCK1-DISK).
- **Narrowed or updated:** B-ARM64-PATHA (ROCK 5B reaches OP-TEE and fTPM init), B-REAL-FIDO2 (physical LUKS2 FIDO2 proven, remaining operations listed), B-BOOTC-SEAL (status line added), B-VGPU-VM-UNZIP (fix in code; verification blocked by disk, not by unzip).
- **New active rows:** B-OWNER-KEYS, B-UKI-COMPOSEFS, B-REPRO-MIRROR, B-ROCK1-DISK.
- **Formatting fix:** blank lines that split the active table after B-BOOTC-SEAL and B-ROCK1-OFFLINE were removed, so those rows render as table rows.
- **New permanent CI-evidence patterns:** self-hosted runner disk exhaustion; two-build divergence from live package repositories.
- **Linear reconciled to this register (2026-10-18):** OMN-53 reopened to In Progress (its Secure Boot and negative tamper scope is not met). OMN-56 set to Done (PR #310). OMN-151 commented with the disk root cause and stays In Progress. OMN-150 stays Backlog, which matches the open Phase 2 work.
