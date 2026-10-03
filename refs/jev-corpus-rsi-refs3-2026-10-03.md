# jev-corpus RSI round refs3 — decision-B test on refs/ (2026-10-03)

Round: refs3 (5th chain round, 3rd on refs/). Corpus: `yubi-OS/yubiOS` `refs/` at main
`425ea2ef17e2849783c83a838af58939cfc1bb8e` — 248 md docs (247 from the refs2 round + the
merged refs2 results record). Protocol: **decision B** (2026-10-02 option B, shipped
2026-10-03) — each edited row re-graded with K=3 independent passes (canonical + 2 blind
regrades), re-audited via the new `POST /api/jev/corpus/audit {passes:[...]}` multipass
mode (deploy etag `adae39aaa563…`), and gated by the band rule: keep only if every pass's
dBc delta is negative AND |mean delta| > inter_pass_offset_dbc.

| round | corpus | PR | dBc start -> end | outcome |
|---|---|---|---|---|
| 1 | skills/ 125x12 | #276 | -11.03 -> -12.30 | success |
| 2 | worker modules 35x12 | #277 | not-excluded frame | success |
| 3 | refs/ 244x12 | #278 | -11.11 -> -10.46 | REGRESSION (single-scorer) |
| refs2 | refs/ 247x12 | #279 (merged 55c110ca) | -12.4695 -> -12.4695 | refuted by single-scorer sign gate |
| **refs3 (this)** | **refs/ 248x12** | **this PR** | **-12.1790 -> -12.1790** | **decision-B test: 4/4 measured cycles elastic-by-uncertainty; 6 declines** |

## Baseline (frozen before cycle 1)

- Matrix 248x12 under pinned scoring prompt v1 (the refs2 matrix + one blind-scored row
  for the new refs2 record doc; density 0.6593).
- Audit (200 nulls): V2 0.3460, z 10.52, verdict excluded, **dBc -12.1790**
  (run `cr_2ecf2c9425422d52`).
- Map **546**, frame `1e7fd90f58fcd460`, N=248, isolated 48. Positive control n=3
  (seed 20261003): isolated deltas [1, 0, 0].
- Admission: rayleigh TRUE, axis_trial FALSE, spectra TRUE, radius_profile TRUE,
  azimuth FALSE (axis_trial flipped vs the refs2 baseline — the new record doc moved
  an axis verdict across seeds; recorded per lesson 30, not averaged).
- Frozen task check v1 (same classes as refs2): 68/248 baseline failures (the standing
  mojibake/placeholder backlog, not this round's class).

## The question this round answers

refs2 measured three grounded axis-fill edits under the SINGLE-scorer sign gate and
reverted all three (+0.2235, +0.3958, +0.4034). Round 3's replay (F1) had already shown
scorer variance of 5.77 dBc between full-corpus grader passes, so the question: are
single-flip dBc effects at the 0.2-0.4 scale real signal or scorer noise? Decision B's
answer is the per-pass band, measured row-scoped (only the edited row's bits vary across
passes — a much tighter band than the full-corpus 5.77).

## Cycles 1-4: measured under the decision-B band

| cycle | doc | axis | per-pass dBc deltas | mean | band (inter_pass_offset) | verdict |
|---|---|---|---|---|---|---|
| 1 | refs/chipsec-issue24-state-check-2026-09-18.md | 1 inputs | +0.105, +0.251, **-0.225** | +0.044 | 0.476 | **elastic** (mixed signs) |
| 2 | refs/workflow-census-2026-09-18.md | 1 inputs | -0.164, -0.187, **+0.257** | -0.031 | 0.443 | **elastic** (mixed signs) |
| 3 | refs/zernike-fit-2026-08-24.md | 0 audience | -0.001, +0.365, -0.125 | +0.080 | 0.490 | **elastic** (mixed signs) |
| 4 | refs/arm64-path-a-status-2026-09-09.md | 1 inputs | -0.185, -0.230, -0.620 | **-0.345** | 0.436 | **elastic** (all-negative consensus, but \|mean\| < band) |

All four edits were source-grounded (each section names the doc's own reads, counts and
baselines), passed the frozen task check, and — per the band rule — NONE was shipped:
three showed mixed per-pass signs (the scorer cannot agree on the direction), and cycle 4
showed all-pass negative consensus whose magnitude still sits inside the band. Every cycle
was pre-registered in the outcomes ledger (pending row -> realized row with per-pass
deltas in the notes), snapback ran each cycle (no_snapback; inversion runs [[2],[4]]
noted on the predicted-vs-realized series), and the persistence endpoint received all
3 passes per cycle.

## What the decision-B test found

1. **refs2's plastic refutations soften to band-undetermined.** The two edits refs2
   reverted as wrong-signed (cycles 1-2 here are the SAME edits re-measured) show mixed
   per-pass dBc signs under K=3: the deterministic single-scorer reading (+0.22, +0.40)
   is inside the row-scoped scorer band (0.44-0.49), not above it.
2. **The row-scoped band is ~0.44-0.49 dBc** — an order of magnitude tighter than round
   3's full-corpus 5.77 (which scored every doc), but the same order as the edit effects
   themselves (0.03-0.34). At this noise floor, single axis-fill edits on refs/ are not
   resolvable as improvements or regressions.
3. **Cycle 4 is the strongest candidate the round produced**: all three independent
   passes agreed the dBc moved MORE NEGATIVE (mean -0.345), the only all-consensus
   direction in either refs round — but the band rule correctly declines to certify it
   at 0.345 < 0.436. It is the natural first candidate for a K>3 re-measurement.
4. Snapback reported inversion runs on cycles 2 and 4 (predicted-vs-realized sign flips
   across the series) without halting: consistent with per-cycle elastic readings, and
   the instrument distinguished them from a round-level inversion.

## Cycles 5-10: inspected declines (no commits, reasons carry over from refs2)

| cycle | doc | proposed axis | decline reason |
|---|---|---|---|
| 5 | refs/lean-ci-state-2026-09-18.md | 3 mode | the conclusions table IS the mode content; a Mode section would restate it |
| 6 | refs/0pointer-poettering-systemd-vision-2026-07-23.md | 1 inputs | sources-consulted content overlaps knowledge_sources; inputs fill would be padding |
| 7 | refs/linear-workspace-sweep-2026-09-09.md | 1 inputs | would restate the GraphQL workspace facts already tabulated |
| 8 | refs/mitigation-coverage-check-2026-09-18.md | 1 inputs | would restate the exemplar docs + MITIGATE rows already named |
| 9 | refs/companion-systemd-homed-reference-2026-07-23-r8.md | 1 inputs | the record's own charter: "adds the geometric context and cross-link, nothing more" |
| 10 | refs/companion-yubios-stress-test-assertions-2026-08-07-r8.md | 1 inputs | same charter conflict |

## Visco close-out

- Snapback series (4 measured cycles): verdict no_snapback, inversion runs [[2],[4]].
- Hysteresis (`?baseline_id=546`) and Prony over the runs history: honest empties —
  the band rule shipped no edits, so there is no prediction-vs-realized dissipation to
  roll up; the series is short by design.

## What this round does not claim

- No claim that axis-fill edits improve or regress refs/: the round's finding is that
  at the measured row-scoped scorer band, they are UNRESOLVABLE — which retires the
  refs2 "plastic refutation" reading for this class and replaces it with a measured
  noise floor.
- No claim about cycle 4's direction beyond what the passes said: all-negative
  consensus at sub-band magnitude is a lead, not a result.
- The 68-file frozen-check backlog (mojibake/placeholders) is untouched: sweep-class
  job for its own PR with the instrument uninvolved.

## Recommendation for the next round on refs/

- Re-measure cycle 4's candidate (arm64-path-a inputs fill) at K=5-8 passes: it is the
  only all-consensus-negative candidate in three rounds of refs/ measurements, and the
  K-pass band estimate tightens with more passes. If its mean stays negative and clears
  a K=8 band, it is the first shippable axis-fill on this corpus.
- If the K=8 band still swallows the effect, the class is genuinely sub-noise on refs/
  and the instrument needs a different edit class (structure-level: new docs joining
  isolates) or a lower-noise scorer — not more single-flip rounds.

## Addendum: the K=8 re-measurement (recommended follow-up, executed same session)

The record's recommendation was to re-measure cycle 4's candidate (arm64-path-a inputs
fill) at K=5-8. Executed at the endpoint's K=8 cap: 8 independent grader passes over the
same edit (7 fresh blind subagent passes + the conservative canonical row), frozen check
PASS, pre-registered before the audit.

| pass | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| dBc delta vs baseline | -0.185 | -0.230 | **+0.145** | -0.058 | -0.071 | -0.071 | -0.071 | **+0.145** |

- mean delta **-0.0495**, inter_pass_offset (max-min) 0.3747, sd of pass deltas 0.1264
- **The K=3 all-negative consensus did NOT survive K=8.** Six passes read negative, two
  read positive (both +0.145). The K=3 consensus was a small-sample artifact, not signal:
  with more independent passes the direction is no longer consistent, and the mean
  collapses from -0.345 toward zero.
- Gate verdict: **elastic-band-undetermined** at K=8 — the edit was NOT shipped, the
  local file restored, and the realized row landed in the outcomes ledger with the
  per-pass deltas in the notes.

**Class verdict (the record's own fork, second branch): the axis-fill class is genuinely
sub-noise on refs/ under this scorer.** Three independent K-measurements of the same
class (K=3 x4 cycles, K=8 on the strongest candidate) never produced a sign consensus
that survives additional passes; the effects (0.03-0.35) sit inside the row-scoped
scorer spread (0.37-0.49). The recommendation now moves to the two directions that
survive the evidence:

1. **Structure-level edits**: new documents joining isolated neighbours (the placement
   contract), which change corpus structure rather than filling cells in existing rows.
2. **A lower-noise scorer**: the pass spread comes from grader disagreement on what
   "substantive coverage" means for prose docs (the blind passes disagreed with the
   canonical row on 2-6 axes per cycle). Tightening the scoring prompt or scoring from
   structured evidence instead of prose judgment would shrink the band itself.

Single-flip axis-fill rounds on refs/ are retired: refuted under the single-scorer sign
gate (rounds 3, refs2) and unresolvable under the decision-B band (refs3, K=3 and K=8).

## Addendum 2: the K=5 fresh-pass test (Jenny directive, same session)

The K=8 addendum recommended retiring the class; Jenny asked to test K=5 next. Executed as
a FRESH replication (5 new blind grader passes, canonical row excluded — an independent
sample, not a subset of the K=8 passes), same edit, frozen check PASS, pre-registered.

| pass | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| dBc delta vs baseline | -0.230 | -0.618 | -0.230 | -0.230 | -0.058 |

- All five fresh passes read NEGATIVE (5/5 — the direction replicates), mean **-0.2729**,
  offset (max-min) **0.5598**, sd 0.1848.
- Gate: **elastic-band-undetermined** — |mean| 0.273 sits inside the fresh-sample band
  0.56. NOT shipped. (Note the band is wider here than at K=8 because this sample carries
  its own -0.62 outlier pass; max-min grows with any new extreme draw.)
- Free subset analysis over the K=8 sample (computed from the 8 measured per-pass dBc
  values, no new audits): **all 56 possible K=5 subsets verdict elastic; only 6/56 have
  an all-negative sign at all, and none clear the band.** No cherry-picked subset of the
  existing data would have shipped this edit — the gate is robust to subset selection.
- Ledger: pending row 1300 -> realized row with the per-pass deltas; persistence with all
  5 passes; snapback no_snapback (inversion runs [[2],[4]]).

### What the three K-measurements say together

| measurement | passes | sign split | mean delta | band | verdict |
|---|---|---|---|---|---|
| K=3 (canonical + 2 blind) | 3 | 3 neg / 0 pos | -0.345 | 0.436 | elastic |
| K=8 (canonical + 7 blind) | 8 | 6 neg / 2 pos | -0.049 | 0.375 | elastic |
| K=5 fresh (5 blind) | 5 | 5 neg / 0 pos | -0.273 | 0.560 | elastic |

The DIRECTION leans negative in every sample (13 of 16 total passes read negative), but
the MAGNITUDE never separates from the pass spread: the effect, if real, is smaller than
the grader's disagreement about what the row covers. The class verdict stands — axis-fill
on refs/ is sub-noise under this scorer — with one refinement the K=5 sample adds: the
direction is consistently negative-leaning, so the effect is more plausibly a small real
improvement swamped by scorer noise than a zero effect. That is exactly the case a
LOWER-NOISE scorer (the surviving recommendation) is for: shrink the band until a -0.27
mean is resolvable. Structure-level edits remain the other path.
