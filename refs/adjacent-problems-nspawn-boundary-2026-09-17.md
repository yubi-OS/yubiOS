# Adjacent problems: the nspawn boundary — stated convention, unexercised CI leg

Date: 2026-09-17. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent Round 7 rung
`add:s7:011100101` on frozen frame `e54be63b2d24d20e` (baseline map 128, N=183); joins
`refs/adjacent-problems-container-isolation-2026-09-01.md`. All observations are live reads on
2026-09-17 at `yubi-OS/yubiOS` commit `d313ac867a4064b16b497552f4a8ac0777db8eeb`.

## Lens

```
L?e -- nspawn-boundary
  hypothesis:  the container-isolation family record (2026-09-01) names four isolation
               mechanisms and flags one caveat: "the nspawn-as-portable-service convention
               is stated in the skill, not yet exercised in a CI leg". That caveat is now
               half-stale and the split is the finding: portable-service IS exercised in CI,
               nspawn itself is exercised nowhere.
  method:      grep every workflow and test script on the pinned commit; verify what each
               leg actually boots; record the boundary each tested leg does and does not
               prove; state the flip condition for adding a nspawn leg.
  parameters:  {workflows_grepped: 39, tests_counted: 40, nspawn_mentions_in_workflows: 0,
                sysext_mentions: 19, portable_mentions: 14}
  delta:       {coverage_claim_corrected: true, unexercised_boundary_named: true}
  verdict:     recorded (this file); no CI leg added here
  caveat:      absence-of-grep is absence in the working tree at one SHA, not proof about
               every branch or the forks
```

## Verified coverage state (live, 2026-09-17)

| Layer | Exercised in CI? | Where |
|---|---|---|
| sysext overlay merge + VM boot legs | **yes** | `.github/workflows/ci_test-sysext-portable.yml` job `test-sysext` → `tests/vm/test-sysext-overlay.sh` (workflow blob `f5d3f8c3`, 7,032 B) |
| portable service attach/detach | **yes** | same workflow, second job runs `tests/vm/test-portable-service.sh` |
| VM boot legs runner gating | **yes** | `run_vm_legs: true` dispatches to `["self-hosted","Linux","ARM64","KVM"]` (rock1); amd64 hosted runs loud-skip per the ADR-023 precedent |
| nspawn (`systemd-nspawn`) | **no** | zero mentions across all 39 `.github/workflows/*.yml` at `d313ac86`; zero test scripts under `tests/` (40 files scanned) |

So the family record's caveat needs rewording: the *portable-service substitute* half of the
convention **is** exercised (the attach/detach VM leg from the OMN-156 playbook work), but the
nspawn mechanics it substitutes for — `RootImage=` off the signed mkosi image, `--ephemeral`,
`--boot` — run in zero CI legs. The boundary the corpus claims is tested one level up
(bootc VM) and one level down (unit sandboxing via `systemd-analyze security` in image build),
but the middle layer has no leg.

## Why that gap is worth naming before filling it

The container-isolation family record names four mechanisms and one boundary each:
rootless podman for image build, systemd-nspawn for a hermetic dev environment off the
signed image, bcvk ephemeral VMs for OS test, unit sandboxing with `SystemCallFilter=` for
service confinement. Of those four uses, CI today covers three boundaries and skips the
nspawn use: image build is exercised by every `docker buildx` leg, VM test by the bcvk
leg (`tests/vm/`), and service confinement indirectly by the image build policy. The
dev-environment use ("hermetic dev environment off the signed image") has no leg at all.

The nspawn boundary is also the only one whose failure mode is silent: an nspawn that
refuses `RootImage=` (quota, mount topology, or UKI layout change across systemd majors)
degrades the dev workflow with no test to catch it. The two tested legs (sysext overlay,
portable attach/detach) run inside bcvk VMs booted from the yubiOS image; an image-rooted
nspawn leg would exercise the same signed image through a different boundary, which is
exactly the *substitution* relation the family record names between podman and nspawn.

## Flip conditions

A nspawn dev-environment leg becomes worth shipping when any of: (a) a workflow needs to run
unit tests against the real `/usr` of a pinned image without paying VM boot cost per matrix
cell (the substitution the family table names: nspawn vs. VM is *abstraction* — the VM adds
a kernel boundary); (b) `RootImage=` behavior changes across systemd majors (verify against
the pinned mkosi fork per `PINNED.md`); (c) the portable-service leg is extended to
`machinectl`-level lifecycle where nspawn is the natural host. Until one fires, the honest
record is: boundary named, leg unexercised, cost known (one more VM-boot job on rock1,
`run_vm_legs: true`, same as the sysext legs).

## Boundary with the privilege family

nspawn isolation (what a process sees) sits between rootless podman (what it can do) and
bcvk VMs (what it can even address). The privilege boundary is
`refs/adjacent-problems-rootless-privilege-2026-09-01.md`; the VM boundary is the focal
record itself. This file extends the family along the *testability* axis rather than adding
a fourth mechanism.

## Related problems

- **Container isolation family** (`refs/adjacent-problems-container-isolation-2026-09-01.md`):
  the record whose caveat this file corrects. Relation: *correction*.
- **sysext/portable CI legs** (`.github/workflows/ci_test-sysext-portable.yml`, OMN-156):
  the tested half of the convention. Relation: *complement*.
- **Verification chain** (`refs/adjacent-problems-verification-chain-2026-09-01.md`): a nspawn
  leg would consume the same signed-image digest the build policy admits. Relation:
  *prerequisite*.

Prior art: systemd-nspawn(1); `nspawn-containers` skill (RootImage=, --ephemeral, --boot,
portable-service convention); `tests/vm/test-sysext-overlay.sh` and
`tests/vm/test-portable-service.sh` as the existing shape for VM-booted isolation tests.
