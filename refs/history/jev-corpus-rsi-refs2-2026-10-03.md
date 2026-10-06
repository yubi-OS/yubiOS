# jev-corpus RSI round refs2 — sign-gate refutation on refs/ (2026-10-03)

Round: refs2 (4th chain round, 2nd on refs/). Corpus: `yubi-OS/yubiOS` `refs/` at main
`233e293ff6ea3de47e6b71f351285882d08eb2cf` — 247 md docs (one non-md `.json` data file
excluded). Contract: `/AGENT.md` jev-corpus chain runbook + the round-3 sign gate.
Skills: `jev-corpus`, `jev-orchestrator`. History wipe per directive before the round:
617 jev history rows deleted (tasks 39, events 407, actions 33, approvals 29, corpus
runs 92, evolution directives/events/sweeps 23/99/21, learnings 3, leads 5);
`jev_automations` (2) and `jev_policy_changelog` (1) kept; policy KV untouched.

| round | corpus | PR | dBc start -> end | outcome |
|---|---|---|---|---|
| 1 | 125 skills x 12 axes | #276 | -11.03 -> -12.30 | success |
| 2 | 35 worker modules x 12 axes | #277 | not-excluded frame | success |
| 3 | 244 refs/ docs x 12 axes | #278 | -11.11 -> -10.46 | REGRESSION, closed refuted |
| **refs2 (this)** | **247 refs/ docs x 12 axes** | **this PR** | **-12.4695 -> -12.4695** | **refuted by the sign gate at cycles 1-3; cycles 4-10 declined** |

## Baseline (frozen before cycle 1)

- Scoring: pinned scoring prompt v1 (12 NSS axes, strict borderline=0), 8 parallel
  scorer lanes. Matrix 247x12, density 0.6586. Per-axis ones: audience 44, inputs 183,
  outputs 213, mode 156, assumption_set 134, adjacent_problems 126, failure_modes 192,
  lifecycle 110, composition 221, knowledge_sources 245, calibration 192, recursion 136.
- Audit (200 nulls): V2 0.3457, z 10.63, verdict **excluded at the resolution of this
  null**, **dBc -12.4695** (run `cr_3f86b4c77524d903`). Already more negative than
  round 3's -11.11 start: the corpus grew 3 docs and re-scored under the pinned prompt.
- Lens (top 12): 12 real candidates, **all axis-1 (inputs) fills**, expected_delta
  +23.2..+26.0 (dBc-flip units), paired controls all NO. Atom plan converged
  (finalDelta 402.6, 881 flips), top-10 flips span 6 different axes.
- Map: baseline id **541**, frame `f61e2303998d8d0e`, instrument `6782a97ca9c308de`,
  N=247, isolated 57, V2 0.29872. Positive control n=3 (seed 20261003): splices moved
  isolation 0/-2/0 with bits_changed 0-4 — the control band the real edits are read against.
- Admission at baseline: rayleigh TRUE, axis_trial TRUE, radius_profile TRUE,
  spectra false, azimuth false. Rayleigh admitted (null non-degenerate, verdicts
  reproducible, witness + Ky Fan bounds hold, N>=100).
- Frozen task check v1 (`taskcheck_refs.sh`: C1 mojibake, C2 dup H2, C3 placeholders,
  C5 bad ../ links, C6 control chars) written BEFORE cycle 1; baseline 67/247 files
  FAIL (the round-7-era defect backlog — recorded, not this round's edit class).

## Cycles 1-3: measured, sign-gated, all REVERTED

Every cycle: grounded section authored from the doc's own subject -> frozen check ->
2 independent regrade passes -> /api/map/preview -> outcomes ledger pending row ->
gated jev commit task (approved per the round directive; rounds 1-3 precedent) ->
chained re-map -> full re-audit -> **sign gate** -> snapback -> persistence -> realized
ledger row. Sign gate: improvement = dBc MORE NEGATIVE; positive realized delta ->
revert the edit, restore the matrix, re-audit, record.

| cycle | doc | axis | predicted (lens/atom units) | realized dBc delta | verdict |
|---|---|---|---|---|---|
| 1 | refs/chipsec-issue24-state-check-2026-09-18.md | 1 inputs | +23.79 | **+0.2235** | reverted (t_950a19dabded1df5 / revert t_1d4030a45a16806e) |
| 2 | refs/workflow-census-2026-09-18.md | 1 inputs | +25.28 | **+0.3958** | reverted (t_c7498c64acbbacd4 / revert redo t_43ed3b4f3d4c2754 after the first revert commit silently failed to land) |
| 3 | refs/zernike-fit-2026-08-24.md | 0 audience | +0.2965 (atom geodesic) | **+0.4034** | reverted (t_de6cd3a37a7c6648 / revert t_406ea8e03bcbb019) |

All three edits were source-grounded (each section names the doc's own reads, counts,
and baselines — not generic prose), passed the frozen check, and persisted under
re-grading (`/visco/persistence`: persisted 1.0, max_bit_disagreement 1 per cycle).
Snapback after each cycle: no_snapback (predictions and realized share the sign — the
failure is direction, not inversion; the instrument distinguishes the two honestly).

What the three measurements establish: on the refs/ corpus under the pinned scorer,
a single grounded axis-fill moves dBc POSITIVE (worse) regardless of axis density —
inputs (183/247, dense) twice, audience (44/247, sparsest) once. Cycle 3's flip was
also quantization-silent on the frozen frame (bits [] moved): the geometric placement
did not move at all, so the dBc move is pure matrix-structure response. This is the
per-cycle measurement round 3 lacked: round 3's +0.64 realized total is reproduced in
kind (+0.22/+0.40/+0.40) and now has a home in the outcomes ledger.

## Re-lens after the reverts (the runbook's prescribed step)

`POST /api/jev/corpus/lens {top: 40}`: **38 of 40 candidates are axis-1 (inputs)
again; the other 2 are axis-3 (mode)**. No calibration, lifecycle, or other class
exists in the lens's proposal space for this corpus. With 3 measured wrong-signed
flips across 3 axes and a candidate space that is 95% the refuted class, continuing
to commit-and-revert would repeat round 3's failure mode with more churn. Per the
sign gate ("stop the round there, revert, record, re-lens"), cycles 4-10 are
inspected declines, not edits.

## Cycles 4-10: inspected declines (no commits)

| cycle | doc | proposed axis | decline reason |
|---|---|---|---|
| 4 | refs/lean-ci-state-2026-09-18.md | 3 mode (lens's only non-inputs class) | the doc's conclusions table IS its mode content; a Mode section would restate the table (padding) |
| 5 | refs/linear-workspace-sweep-2026-09-09.md | 1 inputs | an Inputs section would restate the GraphQL workspace facts already tabulated (padding) |
| 6 | refs/mitigation-coverage-check-2026-09-18.md | 1 inputs | inputs would restate the exemplar docs + MITIGATE.md rows already named (padding) |
| 7 | refs/companion-systemd-homed-reference-2026-07-23-r8.md | 1 inputs | the record's own charter: "adds the geometric context and cross-link, nothing more" — an axis-fill violates it (content-resistant by design) |
| 8 | refs/companion-yubios-stress-test-assertions-2026-08-07-r8.md | 1 inputs | same charter conflict as cycle 7 |
| 9 | refs/adjacent-problems-mirror-provenance-2026-09-13.md | 1 inputs | axis-doc whose subject is alternatives; inputs fill is padding |
| 10 | refs/adjacent-problems-runner-privilege-2026-09-13.md | 1 inputs | same |

## Visco close-out

- Snapback series (3 measured cycles): no inversion runs; verdict no_snapback.
- Hysteresis rollup and Prony fit: see the endpoints' live responses recorded in the
  round log; with only 3 effective (reverted) cycles the series is short by design —
  the gate stopped it early, which is the gate working.

## Scorer variance (reported per the roundbook)

Each cycle re-graded its edited row with 2 independent passes under the pinned prompt.
Inter-pass disagreement was 1 bit per cycle (persisted 1.0 on the flipped cell every
time); a recursion-axis disagreement between the baseline scorer and both regrade
passes on cycle 1's doc was observed and NOT applied to the matrix (it is scorer
variance on an untouched cell, not an edit effect) — exactly the trap the roundbook's
"matrix re-scoring is a measurement" lesson names.

## What this round does not claim

- No claim that the refs/ corpus cannot be improved — only that the lens/atom
  single-flip edit class, under the pinned 12-axis scorer, moves dBc the wrong way
  on this corpus, measured per cycle with the sign gate and the outcomes ledger.
- No claim about geometric usefulness of the reverted sections (they are honest
  content and remain in the branch history via the revert pairs).
- The 67-file frozen-check backlog (mojibake/placeholders) is untouched: it is a
  sweep-class job for its own PR with the instrument uninvolved (lesson 15/22).

## Recommendation for the next round on refs/

Do not re-run axis-fill rounds on refs/ under this scorer. Two directions survive the
evidence: (1) the rate-dependent/stochastic scorer (2026-10-02 decision B) — the
2026-10-02 replay showed R is trivial under a deterministic scorer and the corpus
level's sign behavior may be a scorer-frame property; (2) an edit class that changes
corpus STRUCTURE (new docs joining isolated neighbours, per the placement contract)
rather than filling cells in existing rows. Round 1's success on skills/ came from
calibration fills on a corpus where calibration was sparse (it is dense here).
