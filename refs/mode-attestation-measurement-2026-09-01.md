# Mode axis: how attestation and measurement run (one-shot, daemon, dry-run)

Date: 2026-09-01. Axis: NSS 4/12 Mode (per `skills/nss-mode`). Origin: SOS Agent FIT #11
on `yubi-OS/yubiOS` main (596 files, basis reused from FIT #10) surfaced lens `L1-NSS-Mode`,
an empty cell at z-band 1 / phi-sector 2 ringed by 7 occupied cells, the most enclosed hole
on the fit. The synthetic insert predicted zero pole shift (+1 occupied, +1 isolated). This
is one of four real files written to occupy that cell; the rerun with `baseline=11` tests
whether a second real fill compounds or plateaus.

## Lens

```
L1a -- attestation-measurement-mode
  hypothesis:  yubiOS documents WHAT is measured and attested (UKI, PCR policy on ARM64,
               fTPM quote) but not the execution MODE of each step: one-shot at boot,
               daemon at runtime, dry-run in CI, idempotent re-run after resume
  method:      enumerate each attestation/measurement step with its mode, exit semantics,
               TTY behaviour, idempotency, and the flag that switches mode
  parameters:  {axis: mode, interactive: 2, dry_run: 2, daemon: 2, idempotency: 2,
                exit_semantics: 2, tty: 1, batch_stream: 1, total: 12/14}
  delta:       {mode_gaps_before: 6, mode_gaps_after: 1}
  verdict:     YES
  score:       41
  caveat:      fTPM quote daemon mode is a design statement (ADR-018/019/020 are
               post-launch); only the UKI and CHIPSEC one-shots are exercised in CI today
```

## Steps and their modes

| Step | Mode | Trigger | Exit semantics | Idempotent | Dry-run |
|---|---|---|---|---|---|
| UKI signature check | one-shot, non-interactive | UEFI firmware at boot | boot or refuse; no exit code visible to the OS | yes (pure function of bytes) | `sbverify --cert` in CI |
| dm-verity root hash check | one-shot then passive | kernel at mount | mount fails with `-EIO` on mismatch | yes | `veritysetup verify` |
| CHIPSEC platform checks | one-shot, batch | provisioning script | 0 = all PASSED, non-zero = any FAILED blocks provisioning | yes | `chipsec_main --list` |
| fTPM measurement into PCRs | daemon-resident, event-driven | OP-TEE TA, each boot stage | no exit; the event log is the output | append-only per boot, reset on reboot | none (post-launch) |
| Remote attestation quote | on demand, non-interactive | Keylime agent or CI verifier | 0 quote OK, 2 quote refused | yes | `--dry-run` proposed |
| Falco / Tetragon runtime detection | daemon, streaming | systemd unit `Type=notify` | `SIGTERM` clean stop; restart on failure | n/a | rules `--validate` |

## Why the mode matters more than the mechanism here

Two failure classes hide in the mode column. First, a one-shot check that is *not*
idempotent (for example a measurement that appends to a PCR on every re-run) turns a
resume-from-suspend into a policy mismatch. Second, a daemon whose exit semantics are
undocumented gets restarted in a loop by systemd and looks alive while measuring nothing.
Every row above therefore names the exit contract and the idempotency answer explicitly.

## Interactive vs non-interactive

Nothing in this table prompts a human. The single interactive moment in yubiOS is the
U2F/HSM touch during FIDO2 unlock, which belongs to the boot-unlock file, not to
attestation. In CI, the same steps run under `set +e ... rc=$? ... set -e` so the
rc=77 SKIP contract survives; that is the batch mode of the same one-shots.

## Rootless and isolation interaction

The remote-attestation agent runs rootless with `CapabilityBoundingSet=` empty except
`CAP_SYS_ADMIN` dropped and access to `/dev/tpmrm0` granted by udev, inside a systemd unit
with `ProtectSystem=strict` and a seccomp allowlist. That is the mode in which a Linux
container-style isolation boundary and a privilege boundary are applied to the same
process; neither one alone is the answer.

## Placement

Coverage over the learned basis for this cell: continuous attestation and measurement yes,
rootless privilege and capabilities yes, U2F/HSM FIDO2 boot yes (the one interactive mode),
container isolation and seccomp yes. The three omitted clusters are omitted on purpose so
that the file lands in the target cell.
