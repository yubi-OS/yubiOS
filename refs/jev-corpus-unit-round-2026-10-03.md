# Conceptualization: the jev-corpus-unit-round skill (2026-10-03)

Skill: `skills/jev-corpus-unit-round/SKILL.md` — the operating procedure for one unit round of the jev-corpus RSI chain.

## Lineage

The runflow this skill encodes was built and validated across nine rounds on 2026-10-03 (refs2-refs9, all on the refs/ corpus of yubi-OS/yubiOS):

- refs2: sign gate + outcomes pre-registration adopted (round 3's missing measurement home).
- refs3: decision-B band gate + the finding that free-prose scorer variance (6-8x the true effect) demanded a better instrument.
- refs4: structured-evidence scorer v2/v2.1 hysteresis (threshold jitter eliminated on edited-row re-scores).
- refs5: harness contracts (outcomes supersedes shares baseline_id+target; realized row before remap; preview single-change; placements 404 workaround).
- refs6: THE GATE-STATISTIC CORRECTION - the audit's dbc field is an L2 share-spectrum distance (negative-when-close), uncorrelated with z; the gate is level_dbc = 20*log10(|z|) UP. Lens skip-list shipped. Frozen task check re-authored in-repo.
- refs7: first corrected-gate round; the pre-registered revert of refs6's merged keep was the round's keep; taskcheck C7 mechanically enforced charters.
- refs8: first structure-level round; the generator's rung join out-predicted caller judgment 5/5; add-check subset defined.
- refs9: the unit protocol (Jenny directive: cycle count 1, whole runflow as one atomic change, frozen baseline re-checked each unit interval) - ran clean end-to-end, +1.0092.

## Design decisions

1. One atomic change per unit. Multi-cycle rounds generated bookkeeping warts and padding pressure; one change per round with a fully-run flow generates one honest measurement and a clean record.
2. The frozen baseline is re-derived at every unit interval - no carryover. Each unit's frame is self-consistent; cross-unit comparison happens through the instruments (hysteresis, prony, mobility), not through the raw frames.
3. The gate is level_dbc UP (the verify_claims.py claim-8 law). The audit's dbc field is documented as a different statistic and retired from gating.
4. The lens is an instrument, not the generator: its real-vs-control deflection is a detectability filter and the cell-mobility series (visco/mobility); the map's rungs (prefer joins) are the candidate source on refs/.
5. The frozen task check (taskcheck_refs.sh C1-C7) is the keep gate - geometry proposes, the check disposes.
6. Rounds land as draft PRs held for review; Jenny merges (GraphQL ready-for-review, then squash).
7. Every unit writes a steps.log repro entry; the record doc on the PR is the round's deliverable.

## What the skill carries beyond the steps

The endpoint quick-reference table, the failure lessons baked into the flow (hysteresis mandatory, nulls>=400, dbc-not-the-gate, supersedes contract, stale-deploy/KV-propagation lags, draft-PR mechanics), and three worked examples (a change unit, an add unit, a revert unit) drawn from the validated rounds.

## Pairs with

jev-corpus (endpoint contracts), steady-orbit-deploy (worker deploys), repo-refs-skill (the refs/ archive), single-action-curve-rsi (the atomic-change philosophy the unit protocol instantiates).
