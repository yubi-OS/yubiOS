# CHIPSEC portable image and enrollment-result gating (OMN-18)

**Date:** 2026-11-12
**Linear:** OMN-18 `[post-launch] finish CHIPSEC portable image and enrollment-result gating`
**ADR:** ADR-024 (CHIPSEC first-boot firmware validation as a portable service), ADR-010, ADR-016
**Branch:** `feat/omn-18-chipsec-portable-gating`

## What changed

| Area | File | Mode |
|---|---|---|
| Status file + exit contract | `usr/lib/yubiOS/chipsec/run-firstboot-check.sh` | 100755 |
| Enrollment gate | `usr/lib/yubiOS/chipsec/check-enrollment-gate.sh` (new) | 100755 |
| Enrollment wizard gate | `usr/lib/yubiOS/enroll.sh` | 100755 |
| Ordering + ExecCondition | `usr/lib/systemd/system/yubiOS-enroll.service` | 100644 |
| Runtime/state dirs | `usr/lib/systemd/system/yubiOS-chipsec-firstboot.service` | 100644 |
| Portable build profile | `mkosi.conf.d/chipsec-portable/mkosi.conf` (new) | 100644 |
| Portable payload postinst | `mkosi.conf.d/chipsec-portable/mkosi.postinst` (new) | 100755 |
| Portable build helper | `usr/lib/yubiOS/chipsec/build-portable-image.sh` (new) | 100755 |
| Opt-in portable drop-in | `usr/lib/yubiOS/chipsec/yubiOS-chipsec-portable.conf` (new) | 100644 |
| Tests | `tests/unit/test-chipsec-firstboot-unit.bats`, `tests/unit/test-enroll-unit.bats` | 100644 |

## 1. Portable service image (Verity + PKCS#7 signed GPT)

`mkosi --profile chipsec-portable build` (or `usr/lib/yubiOS/chipsec/build-portable-image.sh build`)
produces `mkosi.output/yubios-chipsec-portable.raw`:

- `Format=portable`: mkosi's Discoverable Partitions Specification GPT image
  for portable services (a `disk` image without ESP/bootloader; `Bootable=no`).
- `Verity=signed`: the root partition is paired with `root-verity` (dm-verity
  Merkle tree) and `root-verity-sig` (PKCS#7 signature over the root hash).
  The key pair defaults to the SecureBoot pair (`mkosi.key`/`mkosi.crt`).
  For the owner-held YubiKey PIV slot 9c key, set `VerityKeySource=engine:pkcs11`
  and pass the `pkcs11:` URI as `VerityKey=`.
- The profile is gated by `[Match] Profile=chipsec-portable`, so the default
  and other profiles' image build is unchanged.
- The pinned CHIPSEC `1.13.16` (hash-pinned pip install) comes from the
  existing `mkosi.conf.d/chipsec/install-chipsec.sh`, which applies to every
  profile.
- `mkosi.conf.d/chipsec-portable/mkosi.postinst` runs
  `build-portable-image.sh stage "$BUILDROOT"`, which lays down:
  - `/usr/lib/os-release` (base distro identity kept; `PORTABLE_PRETTY_NAME=`
    and `PORTABLE_PREFIXES=yubios-chipsec` appended)
  - `/usr/lib/extension-release.d/extension-release.yubios-chipsec`
    (`ID=_any`, `ARCHITECTURE=x86-64`, `YUBIOS_CHIPSEC_VERSION=1.13.16`)
  - `/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service`
  - `/usr/lib/yubiOS/chipsec/run-firstboot-check.sh`
- `build-portable-image.sh verify RAW` runs `systemd-dissect --validate` and
  refuses an image without a `root-verity-sig` partition.

### Consuming it: `RootImage=` + `RootImagePolicy=` (opt-in)

`usr/lib/yubiOS/chipsec/yubiOS-chipsec-portable.conf` is a drop-in template
that sits **outside** every unit search path, so the shipped
`yubiOS-chipsec-firstboot.service` keeps running in-image when no `.raw` is
provisioned and stays clean under `systemd-analyze verify` on every systemd
version CI uses. To enable:

```sh
install -m 0644 yubios-chipsec-portable.raw /var/lib/portables/yubios-chipsec.raw
install -D -m 0644 /usr/lib/yubiOS/chipsec/yubiOS-chipsec-portable.conf \
  /etc/systemd/system/yubiOS-chipsec-firstboot.service.d/50-portable.conf
systemctl daemon-reload
```

The drop-in sets:

```ini
[Unit]
ConditionPathExists=/var/lib/portables/yubios-chipsec.raw
[Service]
RootImage=/var/lib/portables/yubios-chipsec.raw
RootImagePolicy=root=signed:usr=signed+absent:=absent
```

`root=signed` means the root partition must exist, be dm-verity protected and
carry a valid PKCS#7 root-hash signature; `=absent` refuses every other DPS
partition (systemd.image-policy(7)). `RootImagePolicy=` needs systemd >= 254;
the yubiOS base runs v261. The Bats test that verifies the drop-in skips on
older hosts rather than passing silently.

`RuntimeDirectory=yubiOS` / `StateDirectory=yubiOS` in the main unit are
bind-mounted into the `RootImage=` namespace by systemd, so the status file
lands on the host `/run/yubiOS` and `/var/lib/yubiOS` in both modes. Inside
the image the wrapper sees the extension-release marker and records
`CHIPSEC_SOURCE=portable`; otherwise `CHIPSEC_SOURCE=in-image`.

**Design note (rejected alternative).** The OMN-18 brief also floated
`MountImages=-/var/lib/portables/yubios-chipsec.raw:/run/portables/yubios-chipsec`
with the in-image wrapper "preferring" the mounted tree. That would execute
the image's Python/CHIPSEC against the host's libraries without a root
switch, which is not a sound execution model. `RootImage=` runs the whole
service inside the verified image, which is the portable-service model.
`portablectl attach` is not used: its unit-prefix rule would need a
lowercase `yubios-chipsec*.service` copy and it would attach a persistent
unit, which ADR-024's one-shot exception forbids.

## 2. Status file contract

`run-firstboot-check.sh` writes, atomically (tmp + rename):

- `${YUBIOS_CHIPSEC_STATE_FILE:-/run/yubiOS/chipsec-firstboot.status}`
- `/var/lib/yubiOS/chipsec-firstboot.status` when `/var/lib/yubiOS` is
  writable (now true under `ProtectSystem=strict` thanks to `StateDirectory=yubiOS`)
- the legacy `/run/yubiOS/chipsec-result` (original ADR-024 contract, unchanged
  fields: `RESULT`, `WPBT_PRESENT`, `REPORT`, `TIMESTAMP`)

```text
RESULT=PASS|WARN|FAILED
TIMESTAMP=2026-11-12T00:00:00Z
DETAILS=<one-line summary>
WPBT_PRESENT=yes|no
CHIPSEC_SOURCE=portable|in-image
REPORT=/run/yubiOS/chipsec-report.json
```

It logs `YUBIOS_CHIPSEC_RESULT=<RESULT>` to stdout and the journal
(`SYSLOG_IDENTIFIER=yubiOS-chipsec`). Exit codes: `0` on PASS or WARN, `1` on
FAILED. (Before this change the wrapper exited 0 even on FAILED.)

Unit changes in `yubiOS-chipsec-firstboot.service` are additive only:
`RuntimeDirectory=yubiOS` (also guarantees `/run/yubiOS` exists before the
`ReadWritePaths=/run/yubiOS /tmp` namespace is set up),
`RuntimeDirectoryPreserve=yes` (the status file outlives the one-shot), and
`StateDirectory=yubiOS`. Every directive asserted by
`tests/verify-systemd-hardening-runtime.sh` is unchanged.

## 3. Enrollment gating

`yubiOS-enroll.service`:

```ini
Wants=yubiOS-chipsec-firstboot.service
After=yubiOS-chipsec-firstboot.service
ExecCondition=/usr/lib/yubiOS/chipsec/check-enrollment-gate.sh
```

`Wants=` (not `Requires=`) so a skipped CHIPSEC unit (VM, ARM64, not
measured-os, not first boot) never cancels enrollment.

`check-enrollment-gate.sh` reads the run status file, falling back to the
`/var/lib` copy:

| Status | Message | Exit | Effect |
|---|---|---|---|
| `RESULT=FAILED` | `FAIL: CHIPSEC first-boot platform check reported FAILED; blocking YubiKey enrollment per ADR-024.` | 1 | `ExecCondition=` skips the unit; `ExecStartPost=` never writes `.enrolled`, so enrollment stays pending |
| `RESULT=WARN` | `WARN: CHIPSEC first-boot platform check reported WARN; proceeding with enrollment (review journal for firmware warnings).` | 0 | enrollment runs |
| `RESULT=PASS` | `PASS: ...` | 0 | enrollment runs |
| no file | `INFO: ...` | 0 | enrollment runs |
| unknown RESULT | `WARN: ...` | 0 | fail-open: only an explicit FAILED verdict blocks |

Exits stay in 0..1 because `ExecCondition=` treats 255 as a unit failure, not
a skip. `enroll.sh` runs the same gate before anything else (manual runs of
the wizard), with an inline fallback that has the same contract if the
helper is missing. `YUBIOS_ENROLL_GATE_ONLY=1` stops the wizard right after
the gate; it exists for the Bats suite only.

**Operator recovery after a FAILED verdict:** fix the firmware finding (see
`journalctl -t yubiOS-chipsec` and `REPORT=`), then either re-run
`/usr/lib/yubiOS/chipsec/run-firstboot-check.sh` or, as a deliberate
override, remove the status files and run `yubiOS-enroll` manually.

## 4. Evidence

- `bats tests/unit/test-chipsec-firstboot-unit.bats tests/unit/test-enroll-unit.bats`:
  43 tests, 43 ok (1 skip: the drop-in `systemd-analyze verify` needs
  systemd >= 254; the sandbox has 252).
- `tests/verify-systemd-hardening-runtime.sh`: Check 1a 31/31 directive
  assertions pass, Check 2a `systemd-analyze verify` clean on every yubiOS
  unit, 0 hard failures. Run against a rootfs staged from this checkout with
  a local engine shim (no Docker in the sandbox); CI re-runs it against the
  built image.
- shellcheck 0.10.0 clean on all new and changed scripts.

## Open items

- Hardware validation of the CHIPSEC run on a real x86_64 measured-boot box
  (ADR-024 status: post-launch).
- Building the `.raw` in CI needs the verity signing key, so no workflow
  builds it yet. Next step: a `ci_build-chipsec-portable.yml` lane with the
  key held in a GitHub environment secret, or YubiKey PKCS#11 on the rock1 runner.
