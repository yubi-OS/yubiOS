# QEMU zstd EFI zboot version-gate audit (B-QEMU-ZBOOT)

_Audited: 2026-11-12 against `yubi-OS/yubiOS:main` @ `c57d441becdf6ff6ffcdc94232d43befd725a9f0`._
_Linear: OMN-39 (keep the workaround explicit), OMN-59 (confirm runner/QEMU versions), OMN-60 (version-gate + removal verification)._
_Supersedes the open questions in `refs/history/zboot-workaround-runner-qemu-audit-2026-07-25.md` (PR #129, merged) and `refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md`._

## Summary

- The self-hosted ARM64 runner `rock1` runs **Ubuntu 26.04.1 LTS** with distro **QEMU 10.2.1** (`qemu-system-arm 1:10.2.1+ds-1ubuntu3.3`, also the current `resolute-updates` candidate). It still **cannot** DirectBoot the yubiOS ARM64 kernel: `unable to handle EFI zboot image with "zstd" compression`.
- The pinned build (`qemu/qemu` `v11.1.2`, commit `4fc49f46dc95d4a27de2509e7fceb2931e91faeb`, per `PINNED.md`) reports `QEMU emulator version 11.1.2`, links `libzstd.so.1`, and reaches `Booting Linux on physical CPU` on the same kernel inside a 5 second non-KVM probe.
- The kernel in `docker.io/0mniteck/yubios:dev` (image id `14bc226c1d73`, digest `sha256:3d8a2868298da01460f847a338efb12c6f5e9aec0abdeb4b8c6740ec4790410d`) is `/usr/lib/modules/7.2.15-300.fc45.aarch64/vmlinuz`: a PE32+ EFI zboot image with `zimg` magic and `zstd` compression.
- Verdict: **workaround still required**. The `Install zstd-capable QEMU for ARM64 DirectBoot` step (`id: qemu-zstd`) in `ci_test-vm.yml` and `ci_test-vgpu-vm.yml` is now version-gated and self-verifying (contract below). The removal condition is detected and announced by CI itself.

## Evidence

All `rock1` commands ran read-only through the `rock1` shell bridge, each preceded by a `=== [HH:MM:SS] argv: ... ===` banner on `/dev/ttyS2` with output tee'd to the same TTY. Temp files lived under `/tmp/omn39-*` and were removed afterwards.

### Runner identity (`rock1`)

| Field | Value |
|---|---|
| `lsb_release -ds` | `Ubuntu 26.04.1 LTS` |
| `/etc/os-release` `VERSION_ID` | `26.04` |
| `uname -srm` | `Linux 7.0.0-28-generic aarch64` |
| Runner labels (matrix) | `self-hosted, Linux, ARM64, KVM` |

### QEMU binaries

| Binary | `--version` | Package / build | `libzstd` linkage | Size |
|---|---|---|---|---|
| `/usr/bin/qemu-system-aarch64` (stock) | `10.2.1 (Debian 1:10.2.1+ds-1ubuntu3.3)` | `qemu-system-arm 1:10.2.1+ds-1ubuntu3.3`, `qemu-system-data 1:10.2.1+ds-1ubuntu3.2`; apt candidate is the same version | yes (`libzstd.so.1`) | 37,072,696 B |
| `/opt/qemu-zstd/4fc49f46.../bin/qemu-system-aarch64` (pinned) | `11.1.2` | source build of `v11.1.2` @ `4fc49f46dc95d4a27de2509e7fceb2931e91faeb`, built 2026-11-05 | yes (`libzstd.so.1`) | 123,214,936 B |

Only one cache directory exists under `/opt/qemu-zstd/` (the pinned commit); the older `3a18e8a2...` cache cited in the 2026-07 docs is gone.

`strings` evidence (filtered on `zboot|zstd|pe_load`):

- Both binaries carry `unpack_efi_zboot_image`, `failed to decompress EFI zboot image`, and `unable to handle EFI zboot image with "%.*s" compression`. The zboot loader exists in 10.2.1, but it only accepts gzip payloads.
- Stock 10.2.1 references zstd only through qcow2 and multifd migration (`qcow2_zstd_compress`, `multifd_zstd_*`). **libzstd linkage alone does not prove zboot zstd support.** That is why the gate requires a version floor plus a live DirectBoot probe and does not trust `ldd`.
- The pinned 11.1.2 build additionally exposes `linux_efi_zboot_header` and `IH_COMP_ZSTD` (unstripped symbols). Distro builds are stripped, so this marker is advisory only and the gate does not depend on it.

### Kernel format (`docker.io/0mniteck/yubios:dev`)

| Field | Value |
|---|---|
| Path | `/usr/lib/modules/7.2.15-300.fc45.aarch64/vmlinuz` |
| `file` | `PE32+ executable for EFI (application), ARM64 (stripped to external PDB), 3 sections` |
| Bytes 4..7 (zboot magic) | `zimg` |
| Bytes 24..31 (compression) | `zstd` |
| Size / sha256 | 17,377,640 B / `ba089fcca6fa89a3c47ff96212c5c6c2ad495ac8bf0d44444b8ce20a23d9e060` |

Older `file(1)` magic does not name zboot; reading the header bytes is the reliable check, so the CI step reads them directly.

### DirectBoot smoke probe

Command (non-KVM, TCG, no initrd, no firmware):

```sh
timeout 5 qemu-system-aarch64 -machine virt -cpu cortex-a57 -m 512M -nographic -no-reboot \
  -kernel vmlinuz -append "console=ttyAMA0 earlycon panic=-1"
```

| QEMU | Exit | First relevant line | Result |
|---|---|---|---|
| stock 10.2.1 | `1` (immediate) | `unable to handle EFI zboot image with "zstd" compression` then `could not load kernel` | FAIL |
| pinned 11.1.2 | `124` (still running at timeout) | `[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x411fd070]` | PASS |

Pass criterion: the guest kernel banner `Booting Linux on physical CPU` appears in the log. Exit 124 is the expected success code because the kernel keeps running until `timeout` kills it.

### Hosted runner reference (`ubuntu-24.04`)

| Series | Pocket | `qemu` source version |
|---|---|---|
| noble (24.04) | release | `1:8.2.2+ds-0ubuntu1` |
| noble (24.04) | security | `1:8.2.2+ds-0ubuntu1.16` |
| noble (24.04) | updates | `1:8.2.2+ds-0ubuntu1.18` |
| resolute (26.04) | updates | `1:10.2.1+ds-1ubuntu3.3` |

Source: Launchpad `getPublishedSources` API, queried 2026-11-12. In both workflows the hosted `ubuntu-24.04` runner only carries the `amd64` matrix leg, the lint job, and the orchestrator callback; the `qemu-zstd` step has `if: matrix.arch == 'arm64'` and never runs there. Noble's 8.2.2 is far below the floor, so if the ARM64 leg ever moves to a hosted `ubuntu-24.04-arm` runner, the gate will activate the pinned build and log why.

## Version-gate contract (step `id: qemu-zstd`)

Inputs (step `env`):

| Variable | Value | Meaning |
|---|---|---|
| `QEMU_ZSTD_COMMIT` | `4fc49f46dc95d4a27de2509e7fceb2931e91faeb` | pinned upstream commit (`v11.1.2`), must match `PINNED.md` |
| `QEMU_ZSTD_VERSION` | `11.1.2` | expected `--version` of the pinned build |
| `QEMU_ZBOOT_FLOOR` | `11.0` | first upstream line with zstd EFI zboot DirectBoot |
| `QEMU_ZBOOT_PROBE_SECS` | `5` | DirectBoot probe window (measured: banner well inside 5 s on `rock1`) |
| `YUBIOS_IMAGE` | `inputs.image` or `docker.io/0mniteck/yubios:dev` | source of the probe kernel |

Steps, on every ARM64 run:

1. **Log runner identity.** `RUNNER_OS=<lsb_release -ds> (<uname -srm>)` and `RUNNER_QEMU_VERSION=<stock version> (package qemu-system-arm <ver>, libzstd linked: yes|no)`. Also written to the job summary.
2. **Kernel inspection.** If `YUBIOS_IMAGE` is already in local podman storage, the step mounts it read-only (`podman image mount`), copies `usr/lib/modules/*/vmlinuz` to a temp dir, and records `kernel_format` (`efi-zboot-zstd`, `efi-zboot-<other>`, `raw-or-other`, or `unknown`). It never pulls; on a cold cache the probes are skipped with a `::notice::`.
3. **Version gate.** Stock QEMU "claims support" only when `RUNNER_QEMU_VERSION >= QEMU_ZBOOT_FLOOR` (`sort -V`) **and** it links `libzstd`. Otherwise it logs:
   `Stock QEMU <ver> < 11.0 (lacks upstream ARM64 zstd EFI zboot DirectBoot loader); activating pinned QEMU workaround @ 4fc49f46dc95d4a27de2509e7fceb2931e91faeb`
4. **Stock probe (only when stock claims support).** Runs the DirectBoot probe against `/usr/bin/qemu-system-aarch64`.
   - Pass: `::notice::REMOVAL CONDITION MET: stock runner QEMU <ver> natively boots ARM64 zstd EFI zboot`, plus a job summary line, and `removal_condition_met=true`.
   - Fail: `::warning::` that stock meets the floor but failed the probe.
   - No kernel available: `::warning::REMOVAL CONDITION UNVERIFIED`.
   The pinned build **stays active** in every case. Removal is a deliberate PR (recipe below), never an implicit switch in CI.
5. **Stale-cache guard.** If `/opt/qemu-zstd/${QEMU_ZSTD_COMMIT}/bin/qemu-system-aarch64` exists but its `--version` is not `QEMU_ZSTD_VERSION` or it does not link `libzstd`, the step warns, purges the prefix, and rebuilds. The rebuild now passes `--enable-zstd` to `configure`, so a missing `libzstd-dev` fails the build loudly instead of producing a silent non-zstd binary.
6. **Post-activation verification.** Hard `::error::` + `exit 1` if the pinned binary does not link `libzstd`, reports the wrong version, or (when the probe kernel is `efi-zboot-zstd`) fails the DirectBoot probe. A broken workaround fails in this step, not as a bounded hang later in bcvk.
7. **Outputs** (unchanged consumers plus new fields): `qemu_prefix` (used by the bcvk `--ro-bind {0}:qemu-zstd` legs and the fTPM leg), `qemu_source=pinned`, `runner_qemu_version`, `kernel_format`, `removal_condition_met`.

`ldd | grep -q` is deliberately avoided: under `set -o pipefail`, an early `grep -q` exit can SIGPIPE `ldd` and make a linked binary look unlinked. The step captures `ldd` output and matches with `case`.

### Dry-run on `rock1` (2026-11-12)

The new step body ran on `rock1` with the purge, apt, build, and `/opt` write paths stubbed out (`GITHUB_OUTPUT` and friends pointed at `/tmp`):

```
RUNNER_OS=Ubuntu 26.04.1 LTS (Linux 7.0.0-28-generic aarch64)
RUNNER_QEMU_VERSION=10.2.1 (package qemu-system-arm 1:10.2.1+ds-1ubuntu3.3, libzstd linked: yes)
Kernel: /usr/lib/modules/7.2.15-300.fc45.aarch64/vmlinuz from docker.io/0mniteck/yubios:dev
Kernel format: efi-zboot-zstd (PE32+ executable for EFI (application), ARM64 (stripped to external PDB), 3 sections)
Stock QEMU 10.2.1 < 11.0 (lacks upstream ARM64 zstd EFI zboot DirectBoot loader); activating pinned QEMU workaround @ 4fc49f46dc95d4a27de2509e7fceb2931e91faeb
qemu-zstd cache HIT: /opt/qemu-zstd/4fc49f46dc95d4a27de2509e7fceb2931e91faeb/bin/qemu-system-aarch64 (11.1.2, libzstd linked)
probe[pinned]: rc=124 (124 = still running at timeout, expected on success)
[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x411fd070]
GITHUB_OUTPUT: runner_qemu_version=10.2.1, kernel_format=efi-zboot-zstd, removal_condition_met=false
```

A full CI run is still needed to confirm the step end to end (bcvk legs consume `qemu_prefix` unchanged).

## Removal verification recipe

Remove the workaround only when **all** of these hold:

1. A green `ci_test-vm.yml` **and** `ci_test-vgpu-vm.yml` ARM64 run on `rock1` logs `REMOVAL CONDITION MET: stock runner QEMU <ver> natively boots ARM64 zstd EFI zboot`, with `kernel_format=efi-zboot-zstd` in the step outputs. Record both run IDs.
2. Reproduce by hand on `rock1` (read-only, banner + tee to `/dev/ttyS2`): `qemu-system-aarch64 --version` shows `>= 11.0`, `dpkg-query -W qemu-system-arm` shows the distro package that ships it, and the DirectBoot probe above prints `Booting Linux on physical CPU` with stock `/usr/bin/qemu-system-aarch64`.
3. Open a removal PR (never push to `main`) that:
   - deletes the `qemu-zstd` step from both workflows;
   - replaces every `steps.qemu-zstd.outputs.qemu_prefix` consumer: drop the `--ro-bind {0}:qemu-zstd` binding and the `/run/host-mounts/qemu-zstd/bcvk-bin` and `/run/host-mounts/qemu-zstd/lib` entries from `PATH` / `LD_LIBRARY_PATH` in the bcvk ephemeral args, and drop `QEMU_ZSTD_PREFIX` from the fTPM leg (it already warns and continues when empty);
   - keeps a slim gate step that still logs `RUNNER_QEMU_VERSION` and fails if stock QEMU drops below `11.0` (regression guard);
   - removes the `qemu/qemu` row from `PINNED.md` and moves `B-QEMU-ZBOOT` to resolved in `docs/BLOCKERS.md`, citing the run IDs from step 1;
   - leaves `/opt/qemu-zstd/` on `rock1` in place until one green run on the removal branch, then deletes it in a separate, announced maintenance step.
4. The removal PR's own ARM64 CI run must pass the bcvk boot legs (`test-luks-fido2-ci.sh`, `test-fido2-enrollment.sh`) and the fTPM leg using stock QEMU only. If any leg regresses, revert the PR; the pinned commit is still in git history and `PINNED.md` history.

## What would move the date

- Ubuntu publishing QEMU `>= 11.0` to `resolute-updates` or `resolute-backports`, or `rock1` moving to a newer series. Both are visible in step 1 of every run.
- The yubiOS kernel changing format (for example a gzip zboot or a raw `Image`). The step logs `kernel_format`; a non-zstd format would make stock 10.2.1 sufficient for DirectBoot, and the probe would show it.

## Not established here

- No end-to-end CI run of the new step yet (dry-run only).
- No test of a stock QEMU `>= 11.0` binary; the "removal condition met" path is exercised only by logic review.
- `ubuntu-24.04` data comes from the Launchpad archive, not from a live hosted runner, because no ARM64 leg runs there.

## References

- `docs/BLOCKERS.md` row `B-QEMU-ZBOOT`
- `PINNED.md` row `qemu/qemu` `v11.1.2` `4fc49f46dc95d4a27de2509e7fceb2931e91faeb`
- `refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md`
- `refs/history/zboot-workaround-runner-qemu-audit-2026-07-25.md` (PR #129)
- Upstream: QEMU `hw/loader: Add support for zboot images compressed with zstd` (QEMU 11.0 line)
- Launchpad `qemu` source publications for `noble` and `resolute`
