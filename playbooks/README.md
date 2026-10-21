# yubiOS Operational Playbooks

Operator-view runbooks, one per recurring failure mode. Format proven by
[`refs/debug-with-cli-2026-08-01.md`](../refs/debug-with-cli-2026-08-01.md).

`refs/` = research. `docs/BLOCKERS.md` = current state. `playbooks/` = the next action.

## Index

| Playbook | Read when | Source |
|---|---|---|
| [drop-in-override-naming](drop-in-override-naming.md) | adding/renaming a drop-in under `usr/lib/{modprobe,dracut,tmpfiles,systemd/*.service.d,udev/rules}.d/` | OMN-149, `59f4332`→`f92c6010` |
| [digest-bump-recovery](digest-bump-recovery.md) | `quay.io/fedora/fedora-bootc:45@sha256:…: not found` | OMN-139 + 2 re-resolutions in 7 days |
| [dispatch-chain-verification](dispatch-chain-verification.md) | about to report any dispatch/chain/merge green | PR #150 cycle |
| [hw-device-and-allow-real-u2f](hw-device-and-allow-real-u2f.md) | dispatching `ci_test-vm.yml` / `ci_test-vgpu-vm.yml` self-mode | PR #144, `5200f0b`, `5342867` |
| [github-token-vs-secrets](github-token-vs-secrets.md) | writing any `token:` / `GH_TOKEN:` line | PR #148, `a49e95db` |
| [sealed-uki-vm-debug](sealed-uki-vm-debug.md) | `ci_test_sealed-uki-vm.yml` fails | V25–V39 journal, PR #154 + PR #155 |
| [fido2-vm-e2e-recipe](fido2-vm-e2e-recipe.md) | the FIDO2/LUKS2/homed VM lane regresses | run 30139433902 |
| [steady-orbit-api](steady-orbit-api.md) | deploying, operating, or debugging the 67-part `steady-orbit` CF Worker and `/jev/` API | PR #328 (`eb743c07`), run 39585507995, etag `356cb5c1` |

## How to use

1. Match on **failure mode**, not workflow name.
2. Read **Context** first. If it doesn't describe your situation, stop — file a Linear issue instead.
3. Run **Mechanism** verbatim.
4. Check **Verified working**. If its evidence predates the code you're touching, re-verify.

**Covers:** CI/CD failure modes that have fired ≥ 2 times, plus the verify-before-claim doctrine.
**Does not cover:** one-offs (commit messages / Linear comments); SRE/production runbooks (yubiOS is pre-launch); architecture rationale (`docs/ADR.md`); blocker state (`docs/BLOCKERS.md`); the test scripts' own correctness (separate audit, gated on real-board work).

## Format spec

```
# <Title> (<date>)
## Context                     when this applies
## Decision                    the chosen approach
## Mechanism                   copy-pasteable commands
## Verified working (<date>)   the commit / run / PR that proved it
## Cross-references            Linear, commits, PRs, refs/, other playbooks
```

Optional where they earn it: `Alternatives Considered`, `Tradeoffs`, `Operational`.
Filename `lowercase-hyphenated.md`, **no date suffix** (unlike `refs/`) — playbooks are revised in place.

Hard rules: never cite a run ID, SHA, or PR you have not fetched this session. Every playbook must name ≥ 1 commit/run/PR under `Verified working` — if you can't, it's research, put it in `refs/`.

## Relationship to BLOCKERS.md

[`docs/BLOCKERS.md` → **Permanent CI-Evidence Patterns**](../docs/BLOCKERS.md) is the authoritative register of recurring failure modes. Playbooks operationalize its entries; they do not replace them. Worked example: BLOCKERS.md holds the lex-sort doctrine, [drop-in-override-naming](drop-in-override-naming.md) holds the recipe. When a playbook uncovers a new permanent pattern, add it to BLOCKERS.md **and** cross-link both ways in the same PR.

## Maintenance

Jenny adds to `playbooks/` as new failure modes emerge — a mode qualifies once it has fired twice. Agents draft; **Jenny merges**.

**Not here?** Don't improvise a playbook mid-incident. Fix the incident, then file `playbook: <failure mode>` on team OMNI-AGENT with the run ID and root cause. Known uncovered ground: [`refs/testing-production-gaps-2026-08-01.md`](../refs/testing-production-gaps-2026-08-01.md).
