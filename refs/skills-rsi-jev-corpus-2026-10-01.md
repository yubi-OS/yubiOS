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
## Addendum — first live approval surfaced a credential scope gap (15:02Z)

The round was designed so the commits land through the gate, and the first live approval exercised exactly that path:

- Cycle-1 approval `ap_5676039fa77a1e62` was **granted in the /jev/ console (actor "Shant")**; approve auto-dispatched the bound action (POST GitHub Contents PUT, stable id `jev-t_dda8687ef8282dc8-1`).
- The dispatch came back **404 Not Found**; the independent verify marked **confirmed_failure** with the expected predicate `{status_range:[200,299], json_path:"commit.sha"}` failing both checks. `continue` honestly left the task in `gated` with the failed action.
- Diagnosis: the worker's `GITHUB_API_KEY` credential **works for GET** (prior worker tasks verified GETs end-to-end) but **404s on the write**. A GitHub fine-grained PAT without `Contents: write` on the target repo answers an unauthorized PUT with 404, not 403 — this matches the known unverified-writes risk noted when the credential was scoped. Fix is on the operator side: replace the `GITHUB_API_KEY` secret in the Cloudflare Secrets Store with a token carrying Contents write on `yubi-OS/yubiOS`; the binding resolves at runtime, no redeploy needed.
- The remaining 9 gated tasks are intentionally **held unapproved** until the credential is fixed — approving them now would burn 9 identical 404s. Approvals bind the exact payload, so after the secret update the same tasks dispatch the same bytes.
- This failure is itself a valid chain result: gate → approval → dispatch → independent verify → honest `confirmed_failure`, no retry spam, no silent fallback around the gate.


## Addendum 2 — root cause corrected: POST vs PUT, policy v5, all 10 commits landed (15:45Z)

Addendum 1's diagnosis ("GITHUB_API_KEY write-scope gap") was **wrong**. The corrected chain, each step verified live:

1. **Real root cause**: every cycle action declared `"method": "POST"` against the GitHub Contents API, which only accepts PUT (and GET/DELETE). GitHub answers POST on that route with `404 Not Found` — the exact body the dispatch recorded. The credential was never the problem.
2. **Confirmation probes (worker-side, gated)**: `GET /user` -> login `0mniteck` (verified_success); `GET /repos/yubi-OS/yubiOS` -> `permissions.push: true`; a probe task declaring `method: PUT` under policy v4's POST-only `http.post` was **blocked with `method_not_allowed`** — which exposed the second constraint.
3. **Policy v5** promoted via the audited improve flow: learning `l_087eda59277032e1` ("Allow PUT on http.post for GitHub Contents writes") -> `POST /api/jev/learnings/:id/promote` actor jenny -> version 5, `http.post.methods = ["POST","PUT"]`.
4. **Execution**: 14 superseded tasks closed `cancelled`; 10 fresh PUT tasks created; approvals executed on the operator's standing go. First pass 6/10 `verified_success`; the 4 failures were **stale-sha 409s** (c02/c05/c08 edit files their sibling cycle had already committed; c10 one 500) — re-created with fresh blob shas fetched from the branch, all 4 then `verified_success`.
5. **Final state**: all 10 lens-candidate commits on `feat/wayfinder-skills-rsi-2026-10-01` (c01 `15270f85e8`, c02 `7aa59b29a5`, c03 `0a0f472f8a`, c04 `22f5fd2cc5`, c05 `4f56639d6d`, c06 `1d5924deac`, c07 `c24f385643`, c08 `4d5ec97a1e`, c09 `2af3cfdd14`, c10 `f6a1a29e3d`), every one gated -> approved -> dispatched -> independently verified. Total jev spend for the round: **$0.0210**, 29 tasks, every one closed in a terminal state (28 allowed, 1 blocked probe).

**Lessons for the next round**: (a) GitHub Contents writes are PUT — declare `"method": "PUT"`, not the tool name's implied POST; (b) a file edited by two cycles needs a fresh blob sha fetched from the branch head before the second commit; (c) the audited promote flow handled a real mid-round policy change cleanly and expired nothing it shouldn't.
