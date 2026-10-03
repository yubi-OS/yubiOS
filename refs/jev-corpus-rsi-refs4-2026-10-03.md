# jev-corpus RSI round refs4 — the decisive-scorer round on refs/ (2026-10-03)

Round: refs4 (6th chain round), stacked on refs3 (branch `jev-corpus-rsi-refs4-2026-10-03`
off refs3 head `b7146ab4`; this PR targets the refs3 branch). Protocol: scorer v2.2 with
the plain sign gate — keep iff the realized dBc delta is negative. The K-pass protocol is
demoted to verification (2 scorer passes per edited row; bits must agree).

## The mid-round frame change (disclosed)

The round started under scorer v2.1 (the multipass-audit baseline, dBc -23.6662). Cycle 1
produced a suspicious all-zero reading; diagnosis found two real instrument defects:

1. **Extraction garbage**: the pinned evidence regexes matched appended drift-check
   boilerplate ("Context: template Mode-D stub sections ... Δ=+0.4361 ... Verdict:
   REVISE") on ~50 docs — 114 garbage evidence lines feeding the jev state (worst:
   calibration 54 lines/29 docs, mode 48/37, outputs 12/12). Those lines are not the
   documents' subject matter.
2. **The threshold sits in a dense region**: the 1,967 jev probability readings from the
   v2.1 re-score are continuous across [0.15, 0.85] with no gap — 39% of readings in
   [0.3, 0.7) — so threshold placement is genuinely arbitrary there and the matrix is
   sensitive to it. (This also explains the 7 all-zero v2.1 docs: strict evidence
   readings, not scorer failure.)

Amendment **scorer v2.2** (disclosed, deployed etag `f65179a9…`, parity re-verified):
a boilerplate stoplist in the extractor. Full re-score: 248/248 docs in 47s ($0.055).
**Fresh v2.2 baseline: density 0.4775, audit dBc -22.3044** (V2 0.3572, z 5.27, verdict
excluded, run `cr_48e4b096b858f842`), 8 all-zero docs, lens proposes 15 candidates —
composition (axis 8) and recursion (axis 11) fills on exactly those all-zero docs.

Cycle 1 is recorded under v2.1; cycles 2-10 under v2.2. One scorer per round is the
discipline for the NEXT round; this round's frame change is part of its record.

## Baseline instruments

- Control on map 547 (frozen frame from the refs3 chain): isolated deltas [1, 0, 0].
- Admission: rayleigh TRUE, axis_trial FALSE, spectra TRUE, radius_profile TRUE,
  azimuth FALSE.
- Frozen task check v1 (same classes as refs2/refs3).

## The 10 cycles

| cycle | doc | axis | flips | passes agree | realized dBc delta | verdict |
|---|---|---|---|---|---|---|
| 1 (v2.1) | refs/pr-campaign-research-2026-07-16.md | 8 composition | none (all-zero read) | yes | +0.0000 | reverted (no-flip) |
| 2 | refs/pr-campaign-research-2026-07-16.md | 8 composition | [8] | yes | **+0.4319** | reverted (regression) |
| 3 | refs/pr-campaign-research-2026-07-16.md | 11 recursion | none (heading-only capture) | yes | +0.0000 | reverted (no-flip) |
| 4 | refs/roadmap-promotion-gates-2026-07-17.md | 8 | — | — | — | **declined**: frozen-check-blocked (pre-existing C3 placeholder defect at baseline; sweep-class backlog, outside this round's edit class) |
| 5 | refs/roadmap-promotion-gates-2026-07-17.md | 11 | — | — | — | **declined**: same doc, same pre-existing defect |
| 6 | refs/skills-sync-state-2026-09-18.md | 8 composition | [8] | yes | **-0.1607** | **KEPT** (commit t_234308291742e8ea, approve ap_29e4a592ec56d95b, byte-verified) |
| 7 | refs/skills-sync-state-2026-09-18.md | 11 recursion | [2, 8, 11] (outputs collateral via "verdict" in the section text) | yes | +0.2412 | reverted (regression) |
| 8 | refs/tests-census-2026-09-18.md | 8 composition | [5, 8, 9] (adjacent_problems + outputs collateral) | **no** | +0.4603 | reverted (regression; pass disagreement noted) |
| 9 | refs/tests-census-2026-09-18.md | 11 recursion | none (all-zero read) | yes | +0.0000 | reverted (no-flip) |
| 10 | refs/wayfinder-round3-isolate-census-2026-09-13.md | 11 recursion | [8, 10, 11] (composition + calibration collateral) | yes | +0.3531 | reverted (regression) |

Plus 6 lens candidates declined without edits: the companion records
(companion-systemd-homed x2, companion-yubios-stress-test x2) and the remaining
companion cells — charter conflicts (their own "adds the geometric context and
cross-link, nothing more" contracts), same as refs2/refs3.

Chain: dBc -22.3044 -> **-22.4651** (one kept edit).

## What the round found

1. **The decisive scorer produces unambiguous verdicts.** Every measured flip was
   either decisively wrong-signed (+0.24..+0.46, four of them) or decisively right-signed
   (-0.16, one) — no band ambiguity anywhere. The noise floor that softened refs2 and
   blurred refs3 is gone; what remains is the corpus's actual response to these edits.
2. **On the all-zero census/companion docs, composition/recursion fills mostly move dBc
   the WRONG way** (4 of 5 decisive readings positive). The one keep is skills-sync-state's
   composition fill. There is no noise left to blame: under this scorer, that class of
   edit on that class of doc is a measured regression, and the sign gate correctly
   reverted all four.
3. **No-flips are extraction-recall limits, not scorer failures.** Cycles 3 and 9 authored
   genuinely grounded sections whose phrasing missed the extractor's keyword tokens (only
   the heading line was captured; jev correctly refuses to credit a bare heading). The
   recall gap is a known refinement surface for the extractor, recorded honestly rather
   than tuned around.
4. **Collateral flips are real and visible.** Cycles 7, 8, 10 each flipped extra axes
   because the authored sections used vocabulary the other axes' patterns match
   ("verdict", "inventory claims"). The scorer reads what the text actually says; the
   measured delta includes the collateral. Recorded per cycle.

## What this round does not claim

- No claim that the kept edit is "good" beyond the sign gate and the frozen check —
  the scorer says its direction is negative; usefulness is the reviewer's call.
- The 68-file frozen-check backlog (incl. roadmap-promotion-gates' C3) is untouched:
  sweep-class job for its own PR with the instrument uninvolved.
- The frame change mid-round (v2.1 -> v2.2) means cycle 1's row is not comparable to
  cycles 2-10; it is kept in the ledger as the v2.1-era reading that triggered the
  diagnosis.

## Recommendation for the next round

The axis-fill class on refs/ is now measured three ways: refuted under the free-prose
scorer (rounds 3, refs2), mixed under v2.1/v2.2 single-flip measurements (refs3), and
DECISIVELY mostly-wrong-signed under the clean v2.2 scorer (this round: 4 regressions,
1 keep, on the exact candidates the lens ranks highest). What survives: structure-level
edits (new documents joining isolated neighbours, per the placement contract) — the
class-round evidence from round 3's geometry says ADDs that join isolates are the only
edit family that ever moved the geometry meaningfully on refs/. Second: the extractor's
recall gap (cycles 3, 9) is worth a v2.3 pass before any further recursion-axis rounds —
sections written in the corpus's own axis vocabulary get read; sections that paraphrase
do not.
