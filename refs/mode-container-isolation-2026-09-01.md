# Mode axis: isolation boundaries by execution mode (container, nspawn, VM, unit)

Date: 2026-09-01. Axis: NSS 4/12 Mode. Origin: SOS Agent FIT #11 lens `L1-NSS-Mode`
(cell z-band 1 / phi-sector 2, ring 7); one of four files filling the cell for the
`baseline=11` comparison rerun.

## Lens

```
L1d -- isolation-mode
  hypothesis:  the isolation file written for the previous cell says WHICH boundary
               answers WHICH threat; this one says in which MODE each boundary runs
               (one-shot, ephemeral, persistent, boot-in-container) and what that mode
               implies for cleanup and idempotency
  method:      one row per boundary with mode, lifetime, cleanup contract, exit semantics
  parameters:  {axis: mode, one_shot: 2, ephemeral: 2, persistent: 2, cleanup: 2,
                exit_semantics: 2, idempotency: 1, tty: 1, total: 12/14}
  delta:       {mode_gaps_before: 5, mode_gaps_after: 1}
  verdict:     YES
  score:       40
  caveat:      `virbr0 DOWN` as a cleanup signal is an observation from rock1, not a test
```

## Boundaries by mode

| Boundary | Mode | Lifetime | Cleanup contract | Exit semantics |
|---|---|---|---|---|
| podman container (build) | one-shot, `--rm` | one build | image layers persist, container does not | build tool's rc propagates |
| systemd-nspawn (dev) | ephemeral, `--ephemeral --boot` | one session | overlay discarded at exit | container's PID 1 rc |
| bcvk VM (test) | ephemeral | one test | disk image discarded; `virbr0` returns to DOWN | rc=77 SKIP honoured |
| bcvk VM (native flash) | one-shot, destructive | until reboot | none: the target disk IS the output | non-zero aborts before write |
| systemd unit sandbox | persistent daemon | until stop | `RuntimeDirectory=` removed on stop | `SuccessExitStatus=` |

## Mode-specific hazards

Ephemeral boundaries hide state leaks: a `bcvk` VM that leaves `virbr0` UP after exit means
a previous run was killed mid-cleanup, and the next run inherits its network namespace.
Persistent boundaries hide the opposite: a unit sandbox with `PrivateTmp=` that is
restarted keeps nothing, so anything the service expected to survive a restart was never
saved. One-shot destructive mode has no hazard to hide; it has a confirmation gate instead
(`bootc install to-filesystem` is preferred over `to-disk` in CI for exactly this reason).

## Privilege and measurement crossings

Rootless is the constant across the container and nspawn rows (user namespaces,
`--private-users`); the VM rows need `sudo` for KVM and are the only place CI escalates.
Seccomp is applied per row: podman's default profile, nspawn's `--system-call-filter=`,
the unit's `SystemCallFilter=@system-service`. A Linux boundary without a stated mode is
a boundary whose cleanup nobody owns. Measurement daemons (Falco, Tetragon) run in the
persistent row and observe the other four; the U2F/HSM never enters any of them, which is
the boot file's point.

## Placement

Coverage: continuous attestation and measurement (the observers), rootless privilege and
capabilities (the constant), U2F/HSM FIDO2 boot (excluded from every boundary by design),
container isolation and seccomp (focal). Omitted clusters omitted so the file lands in cell
z1/phi2.
