# Adjacent problems: self-hosted runner privilege and CI compute isolation

Date: 2026-09-13. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent wayfinder round-3
cycle 3, L2 rung (frozen frame `a045c8d3f4ff939b`, sector 2). Nearest neighbours:
`refs/adjacent-problems-container-isolation-2026-09-01.md`,
`refs/adjacent-problems-rootless-privilege-2026-09-01.md`,
`refs/negative-skill-space-2026-07-28.md`. Live event that made the family current:
`refs/chromium-runner-highmem-2026-09-09.md`.

## Lens

```
L2 -- runner-privilege
  hypothesis:  the org now runs untrusted-input CI (Chromium provenance work) on two
               self-hosted ARM64 runners plus GitHub-hosted fallback, but no document says
               which compute boundary answers which threat or why the others were rejected
               per use
  method:      name the family, 4 alternatives, rejection criteria per use, flip conditions,
               boundary with the isolation and privilege families
  parameters:  {axis: adjacent_problems, total: 18/20}
```

## Focal problem

A self-hosted runner is a long-lived machine that executes repo-triggered code. On this org
the trust question is asked three ways: the HIGH-MEM runner runs Chromium builds with a
toolchain it cannot self-install (no passwordless sudo), rock1 doubles as CI runner and
serial/audio lab host, and GitHub-hosted large runners are the documented fallback for full
Chromium builds. Each puts a different wall between the job, the host, and the org token.

## Problem family

Family: **CI compute trust boundary** (who can run what on which machine, and what the job
can reach). Boundary with **privilege minimisation** (what a process can do once running,
per `adjacent-problems-rootless-privilege-2026-09-01.md`): runner admission happens BEFORE
any process exists. Boundary with **isolation** (what a process can see): a runner that
executes PR-triggered code on a persistent host erodes isolation regardless of unit-level
sandboxing. Org rule that raises the bar for every option: all GitHub Actions pinned to
full 40-char SHAs.

## Alternative solutions and why not, per use

| Use | Chosen | Alternatives considered | Why not |
|---|---|---|---|
| Chromium arm64 bring-up | HIGH-MEM self-hosted (`ubuntu`) | GitHub large runner; rock1 | large runner is the fallback for full builds (cost, per OMN-165 blockers); rock1 is the lab host with serial/audio attached |
| Full Chromium builds | GitHub large runner (fallback, not yet adopted) | HIGH-MEM; upstream-provided binaries | 12-core bring-up lane cannot do routine full builds; OMN-165 still owes the decision |
| Lab-host CI (serial, UART, audio) | rock1, scoped to its workflows | HIGH-MEM; ephemeral VMs | rock1's value is the hardware attached to it; a VM loses /dev/ttyS2 and the ES8316 |
| Untrusted PR-triggered jobs | not admitted on self-hosted | workflow-scoped labels; ephemeral runners | persistent hosts + PR code is the classic runner-compromise path; HIGH-MEM is already restricted to the Chromium main-branch workflow as partial mitigation |

Relation types: HIGH-MEM vs large runner is *substitution* (same job class, different
custody); rock1 vs HIGH-MEM is *segmentation* (different job classes on different hosts);
ephemeral-runner admission is *alternative* at the same layer. Prior art: GitHub's own
hardening guidance for self-hosted runners; the org)s SHA-pinning rule.

## Related problems

- **Supply-chain build gate** (`yubiOS.rego`, digest-pinned bases). Relation: *prerequisite*:
  the runner builds images only after the policy admits inputs.
- **Runner tool bootstrap without sudo** (HIGH-MEM one-time installer). Relation:
  *intersection*: privilege boundary set at provision time, not per job.
- **Chromium provenance overlay** (`refs/chromium-provenance-overlay-status-2026-09-09.md`).
  Relation: *the workload that created this family*.

## Flip conditions

HIGH-MEM would give way to a GitHub large runner for full builds when a routine arm64 build
exceeds the bring-up lane's disk or wall-clock budget twice in a row. rock1 would be
withdrawn from CI entirely if it ever needs to run untrusted PR-triggered code — its serial
and audio lab roles are not worth sharing a boundary with PR input.

## Curve placement

Coverage: verification chain (build policy), rootless privilege (the no-sudo provision
step), corpus/curve (this cell via the series format), runner/CI isolation (focal),
YubiKey boot (not touched — rock1's lab roles documented in their own skills).

## 2026-09-18 drift check (wayfinder round 8, cycle 58)

runner-privilege record: the HIGH-MEM runner grouping and group-restricted access it documents are unchanged.
