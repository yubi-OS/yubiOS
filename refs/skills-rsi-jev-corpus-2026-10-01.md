# Skills RSI round via the jev-corpus engine — 2026-10-01

A 10-cycle RSI round on the yubiOS `skills/` corpus run through the chain the operator specified: **jev-corpus audit → lens candidates → jev-orchestrator gated execution → steady-orbit-deploy for any resulting worker change**. AGENT.md is the source of truth for the instrument contracts.

## Setup and corpus identity

- Corpus: `yubi-OS/yubiOS/skills/*/SKILL.md`, pinned to commit `3387086cdaa44125fe19cb5092f84652c70159fc` (lesson 1: pinned SHA, `/api/repo-items`-grade identity; content fetched via codeload tarball).
- 125 skills × 12 NSS axes (audience, inputs, outputs, mode, assumption_set, adjacent_problems, failure_modes, lifecycle, composition, knowledge_sources, calibration, recursion), scored by 10 parallel subagents reading the full pinned text (125/125 rows, no dupes/missing).
- Frozen task check: the repo's own `tools/skill-check/skillcheck.sh` (SKILL.md spec contract, round-12 pattern). Run at round close on all edited files, **repo-rooted**: 6/6 PASS. (A first run over the session copies of the files was meaningless: the check resolves `references/` links against the file's own directory and only runs C4 when the file is named `SKILL.md`.)

## Baseline audit

`POST /api/jev/corpus/audit` (nulls=200), selftest passed first:

- run_id `cr_e8ff16be05bf3aab`, **V2 = 0.3597, z = +10.91, verdict "excluded at the resolution of this null"** — the corpus structure is strongly distinguishable from the fixed-margin null. dBc = −11.031.
- Axis coverage: audience 34/125, inputs 102, outputs 99, mode 73, assumption_set 108, adjacent_problems 111, failure_modes 113, lifecycle 91, composition 122, knowledge_sources 99, **calibration 72, recursion 97**.

## Lens and cycles

`POST /api/jev/corpus/lens` (top=12) returned 12 real + 12 paired-control candidates. The engine's ranking concentrated on the two sparsest axes (calibration, recursion). Ten cycles ran in engine rank order, each cycle: re-lens on the current flipped matrix → author one real text edit from the target skill's own content (lesson 22: a writing task with a geometric compass) → flip the bit → re-audit → create a gated jev task whose single action is the GitHub Contents commit of that edit.

| Cycle | Candidate | Skill × axis | Predicted | Actual ΔdBc | Sign-exact |
|---|---|---|---|---|---|
| 1 | lens-4-10-real | ascii-uart-animator × calibration | +21.57 | −0.514 | no |
| 2 | lens-4-11-real | ascii-uart-animator × recursion | +22.66 | −0.333 | no |
| 3 | lens-14-10-real | cloudflare × calibration | +20.47 | −0.076 | no |
| 4 | lens-1-11-real | agents-sdk × recursion | — | −0.401 | no |
| 5 | lens-14-11-real | cloudflare × recursion | +20.43 | −0.204 | no |
| 6 | lens-21-10-real | continuous-runtime-detection-falco × calibration | +21.69 | +0.453 | yes |
| 7 | lens-26-10-real | custom-connection × calibration | +20.35 | −0.580 | no |
| 8 | lens-26-11-real | custom-connection × recursion | +21.72 | +0.114 | yes |
| 9 | lens-28-0-real | debugging-and-error-recovery × audience | — | +0.045 | yes |
| 10 | lens-28-10-real | debugging-and-error-recovery × calibration | +21.17 | +0.229 | yes |

(Cycles 4 and 9 took the top rank after the previous flip re-ranked the lens; their predicted deltas were in the same +20-23 band.)

## Honest readings

1. **Flat geometry is a result** (lesson 14). Round total: dBc −11.031 → −12.298 (**Δ −1.27 over 10 real edits**), V2 0.3597 → 0.3515, z 10.91 → 11.41. Verdict stayed "excluded at the resolution of this null" at every cycle — the corpus never left the strongly-structured regime.
2. **The lens's `expected_delta` is not a same-protocol forecast.** Every candidate predicts a ≥+6 dBc deflection of the corpus level above the curveball vacuum (detectability floor +15.6). The audit's ΔdBc is a different quantity (the dBc of the re-audit vs the prior audit). Comparing them raw, 4/10 sign-exact. Recorded as counts with n, never as a rate (lesson 16).
3. **Calibration is the corpus's sparsest axis** (72/125) and the lens kept selecting it after each flip. The written sections are content-additive and grounded: each cites numbers the skill's own text already carries (measured FPS/baud math, K_kept=2 vs the 25% re-fit trigger, fit coordinates, credential error-code tables). No templated paragraphs; the 2026-09-17 unsupported-claims precedent is cited where relevant.
4. **Task check stayed independent of geometry** (lesson 6): the frozen skillcheck runs on the committed text and never consulted the audit results.

## Execution and audit trail

- Every cycle's commit action went through the **jev orchestrator gate**: `POST /api/jev/tasks` with one `http.post` action (GitHub Contents API PUT), `expected` predicate `{status_range:[200,299], json_path:"commit.sha"}`. The gate ruled **needs_approval** on all 10 (as designed: repo writes are a human call). Task ids `t_dda8687ef8282dc8` (c01) … `t_e27d831b1207905f` (c10); approvals expire 2026-10-02.
- Cycle-1 candidate pre-registered as a fail-closed `note` directive via `POST /api/jev/evolution/sweep` (sweep `es_664be09e6be8fabd`, fire 2026100101) **before** the edit landed.
- Baseline audit idempotent per input sha256; every cycle's after-audit is a distinct run_id (`cr_6beea5b73497d5b0` … `cr_087880101b383909`), queryable via `GET /api/jev/corpus/runs`.
- **No worker change resulted** from the round (no lens candidate targeted the corpus engine itself), so nothing shipped through steady-orbit-deploy; that leg of the chain was exercised by nothing and is recorded as such.

## Round shipping

Per lesson 11: one file per commit on the held branch `feat/wayfinder-skills-rsi-2026-10-01`, one draft PR per round. 10 cycle commits (one per lens candidate, commit messages name the candidate id) + this record at `refs/skills-rsi-jev-corpus-2026-10-01.md`.

## Unexecuted remainder

Lens reals 11 and 12 (`resend-connection` × calibration and × recursion) were never claimed — the 10-cycle cap stopped the round before them. An exhausted ladder means candidate exhaustion under this generator, not optimality (AGENT.md).