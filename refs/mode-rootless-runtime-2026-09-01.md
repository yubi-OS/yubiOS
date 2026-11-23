# Mode axis: rootless build and runtime, interactive vs batch vs daemon

Date: 2026-09-01. Axis: NSS 4/12 Mode. Origin: SOS Agent FIT #11 lens `L1-NSS-Mode` (cell
z-band 1 / phi-sector 2, ring 7); one of four files filling the cell for the `baseline=11`
comparison rerun.

## Lens

```
L1b -- rootless-runtime-mode
  hypothesis:  ADR-014 fixes the privilege model (rootless) but the mode in which rootless
               tooling runs differs between a developer shell, a CI batch job, and a
               systemd daemon, and those differences are what break
  method:      one table per mode: who owns the daemon socket, how PATH is resolved, how
               exit codes propagate, what is idempotent
  parameters:  {axis: mode, interactive: 2, batch: 2, daemon: 2, exit_semantics: 2,
                idempotency: 2, tty: 2, dry_run: 1, total: 13/14}
  delta:       {mode_gaps_before: 5, mode_gaps_after: 1}
  verdict:     YES
  score:       43
  caveat:      the developer-shell column reflects rock1 and a Fedora workstation, not
               macOS (no Mac in the fleet)
```

## The three modes

| Concern | Interactive shell | CI batch (`ubuntu-24.04` runner) | systemd daemon on yubiOS |
|---|---|---|---|
| Docker/podman daemon owner | the user (`dockerd-rootless.sh`, `$XDG_RUNTIME_DIR`) | `runner` user; rootless store not visible to `bcvk` | `podman.socket` user unit, `DynamicUser=` where possible |
| Privilege escalation | none | `sudo env "PATH=$PATH:/usr/sbin:/sbin"` around podman + bcvk only | none; `NoNewPrivileges=yes` |
| PATH resolution | login shell | appended, never replaced (PR #132 lesson) | `ExecSearchPath=` |
| TTY | yes; progress bars, prompts | no; `NO_COLOR=1`, `--quiet` | no; journald |
| Exit semantics | human reads it | `set +e; ...; rc=$?; set -e`; rc=77 means SKIP not FAIL | `SuccessExitStatus=` lists 77 |
| Idempotency | developer's problem | required: every step re-runnable after a runner restart | required: `Restart=on-failure` assumes it |
| Dry-run | `bcvk ... --dry-run` where supported | `--check` legs in `validate-input-shape` | `systemd-analyze verify` |

## What each mode gets wrong on its own

The interactive mode hides privilege problems because the developer is already in the
right groups. The batch mode hides TTY problems because nothing prompts; then a tool that
insists on a prompt hangs the job for six hours. The daemon mode hides exit-code problems
because systemd restarts the unit and the failure becomes a heartbeat. yubiOS therefore
requires that every rootless tool be run in at least two of the three modes before it is
wired into a workflow, and that the rc=77 SKIP contract be honoured in all three.

## FIDO2 and isolation crossings

Rootless enrolment of a U2F/HSM (`systemd-cryptenroll --fido2-device=auto`) is the one
step that needs root and a touch at the same time: interactive by necessity, so it is never
run in batch or daemon mode; CI uses a software authenticator inside the `bcvk` VM instead.
Containers built in batch mode inherit the runner's seccomp default profile; the Linux
isolation boundary is the same in all three modes, which is what makes the privilege
differences visible.

## Placement

Coverage: continuous attestation and measurement (the daemon column), rootless privilege
and capabilities (focal), U2F/HSM FIDO2 boot (the interactive exception), container
isolation and seccomp (the constant). Omitted clusters omitted so the file lands in cell
z1/phi2.
