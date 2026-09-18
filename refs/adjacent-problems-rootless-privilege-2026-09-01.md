# Adjacent problems: rootless builds and runtime privilege

Date: 2026-09-01. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent FIT #10 lens
`L4-NSS-Adjacent_problems` on `yubi-OS/yubiOS` (591 files); one of five files written to fill
the empty cell at z-band 0 / phi-sector 3. Nearest neighbours on the curve: `Makefile`,
`.github/workflows/yubiOS-ci.yml`.

## Lens

```
L4b -- rootless-privilege
  hypothesis:  ADR-014 (rootless buildx) and the systemd hardening skill each state their
               choice; neither enumerates the rejected privilege models side by side
  method:      name the family (privilege minimisation), 4 alternatives, rejection criteria,
               flip conditions, boundary with the isolation family
  parameters:  {axis: adjacent_problems, total: 17/20}
  delta:       {adj_gaps_before: 5, adj_gaps_after: 1, dim_closed: 4, family_named: true,
                alternatives_count: 4}
  verdict:     YES (measured 2026-09-02, FIT #11 vs FIT #10, same basis)
  score:       42
  measured:    {pole_shift_geodesic: 0.2807 rad (predicted 0.1892), occupied: 24 -> 25 (+1, as
               predicted), isolated: 8 -> 8 (predicted +1; five co-located docs are not
               isolated from each other), holdout_r2: 0.9986 -> 0.9977 (-0.0009, predicted
               -0.0024), holes_on_curve: 15 -> 14, cell_hit: z0/phi3 at [0.4169, -0.2122,
               -0.8838] for all five files, PR #227}
  caveat:      CI-runner context (bare ubuntu-24.04, sudo env PATH) verified from
               memory of PR #132, not re-read from main this turn
```

## Focal problem

Two places in yubiOS need privilege they must not keep: the image builder (Docker Buildx,
`bcvk`, `mkosi`) and the services inside the booted image (systemd units). The chosen model
is *rootless by default, capabilities by exception*: rootless dockerd for builds (ADR-014),
`ProtectSystem=strict` plus `NoNewPrivileges=yes` plus an explicit `CapabilityBoundingSet=`
for units, and `sudo env "PATH=$PATH:/usr/sbin:/sbin"` wrapping only the podman + bcvk
invocations that genuinely need the rootful store.

## Problem family

Family: **privilege minimisation**. Boundary with the **isolation** family: isolation asks
"what can this process see?" (namespaces, seccomp, container boundaries); privilege asks
"what can this process do to what it sees?" (capabilities, uid 0, ambient caps). A rootless
container can still be badly isolated; an isolated container can still run as root.

## Alternative solutions and why not

1. **Rootful daemon, unprivileged client.** Relation: *alternative*. Rejected: the daemon socket
   is a root-equivalent handoff; any client compromise is root. Prior art: Docker daemon attack
   surface docs; ADR-014.
2. **setuid helpers per operation** (newuidmap style, but for the whole build). Relation:
   *substitution*. Rejected: setuid binaries multiply the audited surface; rootless podman
   already confines setuid use to `newuidmap`/`newgidmap`. Prior art: shadow-utils man pages.
3. **Ambient capabilities on the builder** (`CAP_SYS_ADMIN` granted, root dropped). Relation:
   *alternative*. Rejected: `CAP_SYS_ADMIN` is root by another name. Prior art:
   capabilities(7), Brauner's "CAP_SYS_ADMIN: the new root" (LWN 2012).
4. **Full VM per build step** (`bcvk` ephemeral VM for every stage). Relation: *abstraction*.
   Rejected for builds, adopted for tests: the cost is minutes per step, and the VM boundary
   is an isolation answer to a privilege question.

## Related problems

- **Verification chain at the builder link**
  (`refs/adjacent-problems-verification-chain-2026-09-01.md`). Relation: *intersection*.
- **Container isolation** (`refs/adjacent-problems-container-isolation-2026-09-01.md`).
  Relation: *boundary family*, see above.
- **YubiKey boot unlock without root**: `systemd-cryptenroll --fido2-device` runs as root at
  enrol time only; unlock at boot happens in the initrd before any unprivileged user exists.
  Relation: *analogy* (privilege confined to a moment, not a lifetime).
- **Runtime monitoring of privilege use** is a sibling problem this file does not solve;
  see the Falco skill for the ongoing view.

## Flip conditions

Rootless buildx would be abandoned only if a required BuildKit feature had no rootless path
(none identified as of ADR-014). Unit hardening would be relaxed per-unit only with a
`systemd-analyze security` score recorded before and after in the PR body.

## Curve placement

Coverage over the learned primitives of the yubiOS corpus: verification chain (builder link),
rootless privilege and capabilities (focal), corpus/curve (this note occupies a sparse cell
on the fitted curve), YubiKey boot (the enrol-time exception), container isolation (the
boundary family). Omitted clusters are omitted on purpose.
## 2026-09-18 drift check (wayfinder round 8, cycle 75)

rootless-privilege record: the corpus's least-privilege skills and the OMN-157 cosign hardening it sits next to are unchanged; note additive.
