---
name: falsification-corpus
description: "Build and run a falsification corpus: a known-answer synthetic corpus that stress-tests ANY pinned-scale measurement instrument (box-counting D, texture metrics, coverage-normalized pipelines) before it touches real data. Covers the full pipeline -- pre-registration of pinned parameters and predicted bands BEFORE measurement, generator design with scale-band pinning and ink-coverage arithmetic, gate windows verified against the actual scale lattice pre-run, advisor review, L-convergence calibration of render bias, live-route parity between instrument port and source of record, and a real-data pass protocol (dimensionality check first, confound controls named in advance). Use when validating a measurement instrument, building synthetic ground-truth corpora, designing pass/fail gates for numeric pipelines, or testing whether an instrument's normalization can silently destroy a class. Triggers on 'falsification corpus', 'known-answer corpus', 'gate design', 'L-convergence', 'instrument falsification', 'pre-registration', 'scale-band pinning'."
---

# Falsification Corpus

## What it is

A known-answer corpus: synthetic classes with analytically-known or pinned expected values, run through the instrument BEFORE real data, so every failure is attributable to the instrument, not the data. Distilled from the 2026-10-06 supersolid falsification-corpus run (edge-standard-v1 vs fractal droplets; canonical record `refs/sierpinski-supersolid-connection-2026-10-06.md` on yubi-OS/yubiOS).

Doctrine: the instrument never validates itself. Only a corpus with known answers can pass or fail it, and every gate is written before any measurement.

## When to use it

- A measurement instrument (or a change to one) is about to be trusted on real data.
- A normalization rule, component filter, or quality gate was edited and you must prove it did not silently change semantics.
- Two implementations of the same instrument must be shown equivalent.
- A published claim rests on a morphology read and you must test whether the data can even support it.

NOT for: scoring taste axes (taste-engine), authoring research corpora (knowledge-corpus-mint), or general statistical testing. The corpus exists to falsify an instrument, not to train one.

## The pipeline (in order; no step is optional)

### 1. Pre-registration

Before ANY measurement, write down and commit:

- The instrument's pinned parameters (e.g. edge-standard-v1: MAX_GRID=512, TARGET_COVERAGE=0.06, MIN_COMPONENT=12, window 4..64 px at 8 log scales [4,6,9,13,20,29,43,64]).
- The predicted band for each generator class, on the pinned scale set, with the exact subset of scales the gate uses.
- The pass/fail gate: band, r2 floor, evaluation scale, and which classes it applies to.
- An amendments log file, dated, empty until needed.

Prediction comes before measurement, always. A gate tuned after seeing results is not a gate.

### 2. Generator design

- **Scale-band pinning**: the corpus structure must SPAN the instrument's window. Count your hierarchy depths against the scale lattice and confirm each level's contour-to-point transition size sits outside the pinned scales -- if a transition lands inside the window, every level contaminates the same band.
- **Uniform element size << finest spacing**: never size-grade elements by hierarchy depth. All elements one radius; the radius small compared to the smallest gap at the finest scale. Size-graded elements put each level's transition inside the window and collapse the measurement (measured: D 0.9478 on a gasket that should read ~1.585).
- **Ink-coverage arithmetic**: compute the render's ink coverage against the instrument's normalization target BEFORE rendering. If your binary masks can exceed the normalization band, the normalization rule can threshold them to an empty set silently. (Measured: binary renders above ~12% ink were argmin-thresholded to t=255 -- empty mask, no error.)

  Worked arithmetic (from the run): 366 droplets at r=3 on a 384-canvas give ink area ~ 366 * pi * 9 ~ 10,348 px ~ 7.0% of 147,456 -- inside the 6%-normalization argmin band and safely under the ~12% empty-mask cliff. Do this division per class BEFORE rendering; a class whose ink falls outside the band is a design bug, not a run finding.

- **MIN_COMPONENT-style element checks, done empirically**: run the instrument's component filters on each generator class pre-run and confirm every element survives. An isolated small disk can trace zero boundary pixels and vanish (measured: r=2 disk -> 0 boundary px, r=3 -> 16). Do not trust the generator's intent; check the instrument's view.

Render discipline: fixed canvas (pinned grid, e.g. 512x512), deterministic seeds, raw 8-bit gray row-major, and the same encoding path for every class so parity comparisons are like-for-like.

### 3. Gate design

- Verify the gate window is well-posed ON THE PINNED SCALE LATTICE before running. "s ~ 16-64" is ill-posed when the lattice is [4,6,9,13,20,29,43,64] -- no two-octave span exists there. Enumerate the lattice, compute the actual span, and reject windows that do not exist on it.
- If a gate must be amended, amend PRE-RUN with a-priori justification, log it in the amendments file with the date, and then never move it post-hoc. Post-hoc gate movement converts a falsification test into a rubber stamp.

### 4. Advisor review before build

Route the generator design and gate through an independent advisor before building anything. The advisor's job is to catch structural confounds (see anti-pattern 6) and ill-posed windows while they are still cheap to fix. Log the advisor's predictions too -- they are falsifiable, and recording their failures keeps future reviews honest (measured: two advisor bias models predicted the wrong sign of render bias).

### 5. L-convergence calibration before gate evaluation

Render bias is r/L-dependent -- it depends on element radius over canvas size, and it can cross zero. Calibrate by running the SAME generator at two canvas sizes (e.g. L=256 and L=384) and measuring the slope drift; do not model its sign analytically (measured: -0.099 at L=256, +0.012 at L=384; the analytic models were wrong in sign). Evaluate the gate at the converged L, and record the drift as part of the corpus's uncertainty.

### 6. Live-route parity

If the instrument has two implementations (a Python source of record and a deployed port), run identical renders through both and assert agreement before any real-data claims. Compare the scalar AND the quality flags (measured: max delta 4.5e-5 on synthetic classes, 4.9e-5 on real panels -- and the r2 quality gate fired at half-res on real data exactly as designed). Parity runs also validate the transport path (encoding, resolution, thresholding) that local-only parity misses.

### 7. Real-data pass protocol

- **Dimensionality check FIRST.** Before promising a 2D morphology read from any dataset, verify the data is actually 2D. Real public data can be structurally 1D (measured: a waveguide polariton platform's "images" are 1D profiles; strips read D 1.237-1.498 with no threshold signature).
- **Name confound controls in advance.** Real data has extents, densities, and orderings your synthetic corpus decoupled on purpose. If your classes differ in both order and extent, a measured difference is unattributable (measured: tri vs shuffle predicted near-degenerate, measured difference 0.23 -- but the patches also differed 236px vs 384px in extent). Matched-extent controls are part of the corpus, not an afterthought.
- Report single-trial noise honestly. One real panel is one sample.

## Anti-patterns (each one cost a fix or a review)

1. **Size-grading elements by hierarchy depth** -- puts every level's contour-to-point transition inside the pinned window; the read collapses. Fix: uniform elements << finest spacing.
2. **Silent empty masks from normalization rules** -- coverage-based thresholding can return an empty set with no error when ink exceeds the band. Fix: assert non-empty masks on every run.
3. **Gate windows written against imagined scales** -- a window that has no realization on the actual scale lattice is unfalsifiable and unfailable. Fix: enumerate the lattice; check the window pre-run.
4. **Post-hoc gate movement** -- adjusting the gate after seeing results destroys the test. Fix: pre-run amendments only, with a-priori justification, dated in the log.
5. **Trusting analytic bias models over measured convergence** -- sign errors in modeled bias are common; measured L-convergence is ground truth. Never evaluate a gate at an uncalibrated L.
6. **Near-degeneracy predictions without matched-extent controls** -- if you predict two classes read nearly equal, the corpus must hold extent fixed or the prediction is untestable.
7. **Promising a 2D read on structurally 1D data** -- check dimensionality before committing the real-data pass.
8. **Asserting class survival from generator intent** -- component filters silently drop classes; only empirical per-class element checks catch it.

## Corpus artifacts (keep all of these)

- **Generators** -- one deterministic function per class, seeds recorded; versioned alongside the instrument.
- **Results JSON** -- per class: D, slope subset, r2, component count, and the render parameters that produced it.
- **Amendments log** -- dated, append-only, every pre-run gate change with its a-priori justification.
- **Parity manifests** -- the identical renders and per-class deltas between port and source of record.
- **Renders** -- the actual bitmaps (PGM/PNG), so any result is re-runnable without re-deriving the generator.

Every artifact carries the instrument version it ran under; a result without a version stamp is uninterpretable.

## Examples

**Validate a box-counting instrument before trusting it on physics data** -- pre-register edge-standard-v1's pinned parameters, generate a Sierpinski gasket (uniform r=3, 6 depths) with predicted local slope 1.585 +/- 0.05 over scales {13,20,29,43,64}, run it, and gate at the L where slope drift is converged (measured: 1.5968 at L=384, PASS; r2 0.999).

**Catch a normalization rule that eats a class** -- before the main run, render a high-coverage class and assert the returned mask is non-empty and the component count matches the generator's (measured: >12% ink silently returned an empty mask; the assertion caught it).

**Prove the port equals the source of record** -- render the same four generator classes to bitmaps, POST each to the live route AND run the Python source of record locally, assert max |delta D| below 1e-4 plus identical r2 verdicts (measured: 4.5e-5).

**Reject untestable real data early** -- given a published dataset claimed as 2D morphology, load one panel, compute its dimensional signature and strip behavior, and if it is structurally 1D, say so before running the corpus pass (measured: a waveguide platform's data is 1D profiles only).

**Amend a gate the right way** -- discover pre-run that the pre-registered window has no two-octave span on the pinned lattice; write the corrected window, the a-priori reason, and the date into the amendments log, then run once. Never re-open it after results arrive.

## Guidelines

1. Pre-register pinned parameters, predicted bands, and gates before any measurement; the amendments log starts empty and every entry is dated.
2. Verify every gate window against the actual pinned scale lattice; an unrepresentable window is not a gate.
3. Assert component counts and non-empty masks on every run, for every class -- normalization and component filters fail silently.
4. Calibrate render bias by L-convergence (same generator, two canvas sizes); never trust an analytic bias model's sign.
5. Run live-route parity on identical renders before any real-data claim; compare the scalar and the quality flags.
6. Check real-data dimensionality first; name confound controls (especially matched extent) before the real-data pass, not after.
7. A near-degeneracy prediction without matched-extent controls is unfalsifiable -- add the control or withdraw the prediction.
8. Do the ink-coverage arithmetic per class before rendering; a class outside the normalization band is a design bug.
9. Instrument parameter changes are major version bumps; corpus results are stamped with the version they ran under.
10. Keep renders, results JSON, and the amendments log versioned together; reruns must be byte-reproducible from recorded seeds.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.

## Changelog

- **v1** (2026-10-06): distilled from the supersolid falsification-corpus run against edge-standard-v1 (canonical record `refs/sierpinski-supersolid-connection-2026-10-06.md` on yubi-OS/yubiOS). All measured anchors, anti-patterns, and failure examples come from that run; nothing is projected.
