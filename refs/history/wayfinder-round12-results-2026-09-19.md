# Wayfinder round 12 results: skills/ SKILL.md format compliance (100+ cycles)

Date: 2026-09-19. Family: run-results record (cf. `refs/wayfinder-round8-results-2026-09-18.md`). Origin:
wayfinder round 12, closing record. 100+ iterations on the `skills/` corpus (112 SKILL.md files
at main `a26acda5`), one skill per commit, every cycle pre-registered on the outcomes ledger,
held PR throughout.

## Round rules (per directive)

- Drift checks are NOT an acceptable edit class this round: every edit is format compliance or
  content authoring inside the SKILL.md format (spec 2.2: kebab-case name + description
  ≤1024 chars without literal angle brackets in frontmatter; H1 immediately after frontmatter;
  `## Examples` + `## Guidelines` sections).
- Every Examples/Guidelines section is authored from that skill's own body: the worked setup
  uses the skill's own workflow steps and artifacts; the guidelines are its own MUST/NEVER
  rules; the boundary case names its own trigger discipline. Nothing is template boilerplate.

## Round parameters

| Parameter | Value |
|---|---|
| Baseline map | 326 (frame `e12cb10f28b3f2d4`, N=112, isolated 55, V2 0.3061) |
| Positive control | n=6, seed 20260919: bits moved 5/6, 1 quantization-silent |
| Axis trial | 5/9 axes excluded-from-fixed-margin-null (z 4.15, exclusion-only, nothing admitted) |
| Frozen check at baseline | 9 pass / 103 fail (F5 Examples missing 97, F6 Guidelines missing 97, F3 description angle brackets 20, F4 H1 position 8) |
| Chain | maps 326 → 409+ across the round, frame frozen throughout |

## Cycle outcomes

The end state: every SKILL.md in the corpus passes the frozen format check (the final four
H1-less skills were fixed in the closing batch). Edits are content-additive: no existing
sections removed, no drift checks, no deletions.

## What this record does not claim

Geometry stayed flat on the 112-skill corpus (isolated 54-58 band, V2 0.306-0.313) — the format
additions rarely flip bits on this frame; that is an instrument observation, not an edit
verdict. The Examples/Guidelines content is derived from each skill's own text but remains
agent-authored; the maintainer's review governs whether any specific section is accepted.
