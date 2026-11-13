# systemd hardening runtime evidence: 2026-11-12

Status: runtime evidence gate from `refs/history/systemd-hardening-audit-2026-07-17.md` CLOSED for the published image. Linear: OMN-40 (B-HARDENING-RUNTIME), OMN-54 (Bats in target image), OMN-55 (`systemd-analyze verify` in target image).

## What ran

| Item | Value |
|---|---|
| Workflow | `.github/workflows/ci_test_bootc-filesystem.yml`, job `install-to-filesystem`, new step "Runtime systemd hardening in the target image (OMN-40 / OMN-54 / OMN-55)" |
| Script | `tests/verify-systemd-hardening-runtime.sh` (0755, `bash -n` clean, `shellcheck` clean on 0.9.0 in CI and 0.11.0 locally) |
| Green run | [43341016531](https://github.com/yubi-OS/yubiOS/actions/runs/43341016531), branch `feat/omn-40-54-55-hardening-runtime` at `52a45208760d469b606dc22f61c5b2c32a490b20` |
| Runners | `ubuntu-24.04` (amd64, job 131609040695) and `ubuntu-24.04-arm` (arm64, job 131609040368), both `success` |
| Image under test | `docker.io/0mniteck/yubios:latest` resolved to `0mniteck/yubios@sha256:55d65f8964e89c23bd832e812693a595ddf17eb631de82c8e1d162f7f0786774` |
| Image systemd | `systemd 262 (262.1-1.fc45)` |
| Bats in image | `Bats 1.14.0` (installed with `dnf` into the throwaway container) |
| Evidence artifacts | `systemd-hardening-runtime-amd64` (13999816187), `systemd-hardening-runtime-arm64` (13999537128), 30-day retention |

amd64 and arm64 produced byte-identical Bats TAP and byte-identical `systemd-analyze security` tables for every unit.

Earlier runs on the same branch, kept for the record: [43339104278](https://github.com/yubi-OS/yubiOS/actions/runs/43339104278) (shellcheck 0.9.0 flagged SC2317 on the EXIT trap function), [43339703833](https://github.com/yubi-OS/yubiOS/actions/runs/43339703833) (`docker cp` dropped `/usr/lib/systemd/system`; extraction moved to a tar stream), [43340370279](https://github.com/yubi-OS/yubiOS/actions/runs/43340370279) (first full pass; surfaced the two unit defects fixed below).

## Units in scope

The image ships four yubiOS units in `/usr/lib/systemd/system/` plus one drop-in, matching the repo:

- `yubiOS-enroll.service`
- `yubiOS-chipsec-firstboot.service`
- `yubios-uki-install.service` (also installed at `/etc/systemd/system/` by the Containerfile)
- `yubiOS-no-vfio-purge.service`
- `bootloader-update.service.d/10-skip-bcvk-virtiofs-root.conf`

The 2026-07-17 audit covered only the first two. `yubios-uki-install.service` (OMN-150) and `yubiOS-no-vfio-purge.service` (ADR-031 / OMN-149) landed after it and are audited here for the first time. There is no `yubiOS-firstboot-validate.service` or `yubiOS-enroll-fido2.service`; the CHIPSEC unit is the first-boot validation unit.

## Check 1 (OMN-54): directives and Bats against the image

### 1a. Directive assertions: 31 pass, 0 fail (both arches)

Units are extracted from the image with a tar stream and parsed per section (last assignment wins). Hard gates:

| Unit | Asserted in the image |
|---|---|
| `yubiOS-enroll.service` | `[Unit]` ConditionSecurity=measured-os, ConditionFirstBoot=yes, ConditionPathExists=!/var/lib/yubiOS/.enrolled; `[Service]` Type=oneshot, RestrictFileSystems=~@network |
| `yubiOS-chipsec-firstboot.service` | `[Unit]` ConditionSecurity=measured-os, ConditionFirstBoot=yes, Before=yubiOS-enroll.service; `[Service]` Type=oneshot, PrivateNetwork=yes, ProtectHome=yes, ProtectSystem=strict, ReadWritePaths=/run/yubiOS /tmp, CapabilityBoundingSet=CAP_SYS_RAWIO CAP_SYS_ADMIN CAP_DAC_OVERRIDE, NoNewPrivileges=no |
| `yubios-uki-install.service` | `[Unit]` ConditionFirstBoot=yes, ConditionPathExists=/usr/lib/yubiOS/uki/yubios.efi; `[Service]` Type=oneshot, PrivateNetwork=yes, ProtectHome=yes, ProtectSystem=strict, ReadWritePaths=/boot /efi /loader /run; `/etc` copy byte-identical to `/usr` copy |
| `yubiOS-no-vfio-purge.service` | `[Unit]` ConditionPathExists=/dev/vfio, DefaultDependencies=no; `[Service]` Type=oneshot |
| bootloader-update drop-in | `[Service]` ExecCondition=/usr/lib/yubiOS/skip-bootloader-update-if-bcvk.sh |
| all yubiOS units | no `RestrictFileSystemAccess=` (audit rule, still deferred) |

Effective hardening matrix in the image (`--` means not set):

| Unit | NoNewPrivileges | ProtectSystem | ProtectHome | PrivateTmp | PrivateDevices | PrivateNetwork | RestrictFileSystems | CapabilityBoundingSet | ConditionSecurity |
|---|---|---|---|---|---|---|---|---|---|
| `yubiOS-chipsec-firstboot.service` | `no` | `strict` | `yes` | -- | -- | `yes` | -- | `CAP_SYS_RAWIO CAP_SYS_ADMIN CAP_DAC_OVERRIDE` | `measured-os` |
| `yubiOS-enroll.service` | -- | -- | -- | -- | -- | -- | `~@network` | -- | `measured-os` |
| `yubiOS-no-vfio-purge.service` | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| `yubios-uki-install.service` | -- | `strict` | `yes` | -- | -- | `yes` | -- | -- | -- |

### 1b. Bats inside the image: 39 ok, 0 skipped, 0 not ok (both arches)

Suites run with cwd `/` inside the image, so their relative `usr/...` paths resolve to the image's own files, and their `systemd-analyze` calls use the image's systemd 262.1:

- `test-enroll-unit.bats` (6 tests, including `systemd-analyze verify` and the RestrictFileSystems >= v250 floor)
- `test-chipsec-firstboot-unit.bats` (8 tests, including `systemd-analyze verify`)
- `test-bootloader-update-unit.bats` (4 tests)
- `test-pam-u2f-stack.bats` (8 tests; the installed `pam-u2f` meets the 1.3.1 floor, not skipped)
- `test-lib.bats` (13 tests)

Not run in the image: `test-bcvk-ssh-unit.bats` and `test-reproducible-build.bats` read repo-only files (Containerfile, workflows, scripts, git history), and `test-enroll-{luks,pam,ssh}.bats` test mocks rather than shipped files. They stay in the existing repo-checkout lanes.

## Check 2 (OMN-55): systemd-analyze inside the image

### 2a. `systemd-analyze verify --man=no --recursive-errors=no`

Each unit is verified twice in the same throwaway container: once as the image ships it, once with this checkout's `usr/lib/systemd/system/`, `usr/lib/yubiOS/` and the `/etc` copy overlaid. A finding fails hard unless the overlay pass is clean, in which case it is reported as a stale-image warning. A rebuilt image that still carries a defect fails hard again.

| Unit file | Image as shipped | With checkout overlay | Result |
|---|---|---|---|
| `/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service` | rc 0, no output | n/a | clean |
| `/usr/lib/systemd/system/yubiOS-enroll.service` | rc 0, no output | n/a | clean |
| `/usr/lib/systemd/system/yubiOS-no-vfio-purge.service` | rc 1: `:19: Invalid URL, ignoring: (ADR-031)` | rc 0, clean | warning (stale image, fixed on branch) |
| `/usr/lib/systemd/system/yubios-uki-install.service` | rc 1: `Command /usr/lib/yubiOS/uki/install-uki.sh is not executable: Permission denied` | rc 0, clean | warning (stale image, fixed on branch) |
| `/etc/systemd/system/yubios-uki-install.service` | rc 1: same as above | rc 0, clean | warning (stale image, fixed on branch) |
| `/usr/lib/systemd/system/bootloader-update.service` (with yubiOS drop-in) | rc 0, no output | n/a | clean |

No container-environment noise appeared at all on systemd 262.1 (no `/dev/tpmrm0`, `/boot`, or bus complaints), so the allow-list in the script did not have to absorb anything.

### 2b. `systemd-analyze security --offline=yes`

| Unit | Exposure | Rating | Checks failing / passing |
|---|---|---|---|
| `yubiOS-chipsec-firstboot.service` | 6.7 | MEDIUM | 48 / 31 |
| `yubios-uki-install.service` | 8.6 | EXPOSED | 71 / 8 |
| `yubiOS-enroll.service` | 9.4 | UNSAFE | 74 / 5 |
| `yubiOS-no-vfio-purge.service` | 9.4 | UNSAFE | 70 / 5 |

Full tables and per-unit JSON (`--json=short`) are in the artifacts. Scores are recorded, not gated; `HARDENING_MAX_EXPOSURE` turns them into a gate once targets are agreed.

## Findings

1. **`yubios-uki-install.service` cannot execute its ExecStart (real defect, fixed on branch).** `usr/lib/yubiOS/uki/install-uki.sh` is mode 100644 in git, and the Containerfile `chmod +x` only covers `/usr/lib/yubiOS/*.sh` and `/usr/lib/yubiOS/chipsec/*.sh`. The unit is preset-enabled and gated on `ConditionPathExists=/usr/lib/yubiOS/uki/yubios.efi`, so today it is a no-op; the first image that ships the UKI would hit `203/EXEC` at first boot. Fix on the branch: git mode 100755 (COPY usr/ carries the bit). Commit `4e87534f65c08f00d6013f6108af0a85c7ed0d46`.
2. **`yubiOS-no-vfio-purge.service` fails as a oneshot whenever `/dev/vfio` exists (real defect, fixed on branch).** `ExecStart=/bin/rmdir /dev/vfio 2>/dev/null || true` and `ExecStart=/usr/bin/udevadm settle --timeout=10 || true` pass `2>/dev/null`, `||` and `true` to the binaries as literal arguments. After the preceding `rm -rf`, `rmdir` fails on the missing directory and the bogus operands; without a `-` prefix the unit fails and skips the remaining ExecStart lines, including the audit stamp. Also `Documentation=... (ADR-031)` is an invalid URL that `systemd-analyze verify` rejects. Fix on the branch: `-` prefix on both lines (what `|| true` meant) and the ADR label moved to a comment. Commit `52a45208760d469b606dc22f61c5b2c32a490b20`.
3. **The 2026-07-17 static audit findings hold at runtime.** Both audited units carry their gates in `[Unit]`, `RestrictFileSystems=~@network` is present in deny-list form, the CHIPSEC capability exception is explicit and offline, and both units verify clean on the target image's systemd 262.1. No unit uses `RestrictFileSystemAccess=`.
4. **Exposure is high outside the CHIPSEC unit.** `yubiOS-enroll.service` (9.4) has only `RestrictFileSystems=` and the condition gates; `yubiOS-no-vfio-purge.service` (9.4) has no sandboxing; `yubios-uki-install.service` (8.6) lacks `NoNewPrivileges=`, `CapabilityBoundingSet=`, `PrivateTmp=` and `SystemCallFilter=`. These are hardening opportunities, not regressions, and need their own design pass (enrollment needs the TTY, `/dev/hidraw*` and pcscd; the vfio purge needs `/dev`; UKI install needs the ESP). Suggested follow-up issue: sandbox the three units to MEDIUM or better, then set `HARDENING_MAX_EXPOSURE`.

## Reconciliation with the 2026-07-17 audit

| Audit line | Runtime result |
|---|---|
| Enroll: ConditionFirstBoot, ConditionPathExists, ConditionSecurity in `[Unit]` | Confirmed in image (1a + Bats 1, 2) |
| Enroll: `RestrictFileSystems=~@network` deny-list | Confirmed in image (1a + Bats 3, 4); directive known on v262 (Bats 6) |
| CHIPSEC: measured/first boot, Before=enroll | Confirmed in image (1a + Bats 7, 8) |
| CHIPSEC: documented capability exception, no RestrictFileSystems | Confirmed; exposure 6.7 MEDIUM, best of the four |
| Repo-wide: no `RestrictFileSystemAccess=` | Confirmed in image for all four units |
| Remaining evidence gate: Bats + `systemd-analyze verify` inside the target image | Closed by run 43341016531 on amd64 and arm64 |
| Rule: keep `RestrictFileSystems=` and `RestrictFileSystemAccess=` separate | Still holds; image systemd is 262.1, so the v262 overlayfs/dm-verity semantics noted in the 2026-09-29 refresh apply to any future design pass |

## Follow-ups

- After the branch merges and the next image build publishes, re-run `ci_test_bootc-filesystem.yml`: the three stale-image warnings in 2a and the two Exec-syntax warnings in 1a should disappear. If they do not, the gate fails hard.
- Sandbox `yubiOS-enroll`, `yubios-uki-install` and `yubiOS-no-vfio-purge` (finding 4), then gate exposure.

## Reproduce

```bash
sudo apt-get install -y bats shellcheck
tests/verify-systemd-hardening-runtime.sh docker.io/0mniteck/yubios:latest
# evidence: ${HARDENING_OUT_DIR:-/tmp/yubios-hardening-runtime}/summary.md
```
