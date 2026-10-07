# Preregistration — POST /api/jev/corpus/scorer/score extractor gold set (slice + full-build design)

Written 2026-10-06 (Lane D, parallel build). Written BEFORE any slice measurement.
Instrument: structured-evidence scorer v2.2 — deterministic per-axis extraction over
12 axes (audience, inputs, outputs, mode, assumption_set, adjacent, failure_modes,
lifecycle, composition, knowledge_sources, calibration, recursion) + ONE batched
decision-model call per doc; hysteresis p >= 0.55 (true) / p <= 0.45 (false).
What is falsified: the extractor's per-axis recall and specificity (refs Tier-2 item 3;
the refs4 lesson — 3 no-flip cycles were extraction-recall limits, and v2.2 added a
boilerplate stoplist after the extractor missed evidence on heading-only docs).

## 1. This slice (executed today)

12 synthetic docs, all authored by hand (no generator model in the loop):

- **I1-I4 — inputs-axis planted**: each doc has a dedicated `## Inputs` markdown
  section listing N concrete, canonical input sources (environment variables by name,
  CLI arguments, config file paths, stdin, request-body fields). Planted counts:
  I1=3, I2=4, I3=5, I4=2 inputs items. Other 11 axes carry NO deliberate evidence.
- **C1-C4 — composition-axis planted**: each doc has a dedicated `## Composition`
  section with explicit caller/callee and dependency statements ("calls X",
  "called by Y", "depends on Z", "sibling module W"). Planted counts: C1=2, C2=3,
  C3=4, C4=5 composition items. Other 11 axes carry NO deliberate evidence.
- **D1-D4 — distractor-vocabulary (cross-axis trap)**: docs whose prose USES
  inputs/composition vocabulary in non-evidence positions (e.g., "the module's
  lifecycle had many inputs over its history", "philosophical composition of the
  essay", "this document is an input to the review process") while planting NO
  actual per-axis evidence for any of the 12 axes. Ground truth: inputs
  evidence_count = 0 and composition evidence_count = 0 on D1-D4.

## 2. Gates (pinned before measurement)

- **Recall floor**: on I1-I4, inputs evidence_count >= ceil(0.75 * planted_N);
  on C1-C4, composition evidence_count >= ceil(0.75 * planted_N). (0.75 floor
  a-priori: the refs4 failure was recall collapse to 0 on real docs; 0.75 tolerates
  one miss in a 4-5-item section while still catching that failure mode.)
- **Specificity**: on D1-D4, inputs AND composition evidence_count <= 1 AND no
  true flip (p < 0.55) on either axis. A distractor that accumulates planted-strength
  evidence from vocabulary alone is a specificity FAIL (the axis-vocabulary trap).
- **Collateral precision (report-only in this slice)**: evidence counted on the 11
  non-planted axes of I/C docs is recorded but not gated (no calibrated expectation
  yet; the full build gates it).
- Slice PASS = all 8 planted docs meet the recall floor AND all 4 distractors meet
  specificity. No post-hoc window movement; misses are findings.

## 3. Full-build design (sized, not executed)

- ~64 docs: per-axis families x 3 count tiers (2/4/6) for all 12 axes (36 planted),
  paraphrase-preserved variants of 12 of them (stability gate: same verdict, p drift
  <= 0.15), 12 distractor-vocabulary docs spanning all axes, 4 heading-only docs
  (the refs4 failure shape: evidence present ONLY under headings, terse bullets),
  plus 2 all-axes-planted docs. Cost ~$0.02 at $0.0002/score.
- Full gates: per-axis recall floor 0.75 on every planted family; distractor
  specificity 0 planted-axis credits; paraphrase verdict-stability >= 11/12;
  heading-only recall floor 0.75 (directly reproves the v2.2 regression shape).

## 4. Known limitations pre-declared

- The extractor's counting rules are not readable from the repo (the worker bundle's
  scorer module is not in the tarball; the Python source of record
  session/r15/scorer_v2.py predates this session). Planted items are therefore
  authored at maximum canonical explicitness (dedicated headings, one item per
  bullet, concrete named sources). If recall still fails on canonical phrasing,
  that is a stronger finding, not a weaker one.
- A single response-shape probe (1 tiny neutral doc, no planted evidence) will be
  run before the slice to learn the response schema (rows/counts/p fields); it is
  logged in amendments-log.md and its result is NOT used as a corpus datum.
- evidence_count ground truth = deliberately planted items, not the extractor's
  internal notion of a unit; a mismatch on an edge item is recorded as an honest
  ambiguity rather than silently absorbed.
