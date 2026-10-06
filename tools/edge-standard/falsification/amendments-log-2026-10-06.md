# Falsification-corpus amendments (logged 2026-10-06, BEFORE any v2 measurement)

All amendments justified a-priori from the count model (advisor review, smart lane).
Zero post-hoc movement permitted after v2 numbers exist.

1. GATE WINDOW: "local slope over s ~ 16-64" is ill-posed on the pinned scale set
   [4,6,9,13,20,29,43,64]. Amended gate window = {13,20,29,43,64} (2.30 octaves,
   fully inside the v2 clean point regime since s >= 13 > finest spacing 8 > d).
   Center 1.585 +/- 0.05, r2 >= 0.98 unchanged.
2. L-CONVERGENCE CALIBRATION (make-or-break, runs BEFORE gate evaluation): the same
   generator at L=256 and L=384 (6 depths, 366 droplets, same r). If the gated slope
   drifts with L, the gate center is re-expressed as 1.585 + measured bias(r/L),
   recorded as a calibration amendment. Rationale: thickened point sets carry a
   positive finite-diameter bias (+0.1..+0.35 candidate range) not resolvable
   analytically.
3. WHOLE-WINDOW D is a diagnostic, not gated: expected 1.30-1.45 (r=3) / ~1.45-1.55
   (r=2); contour contamination confined to s=4 (marginally 6).
4. COMPONENT-COUNT ASSERTION: components == 366 on every gasket run; drops logged.
5. NON-EMPTY ASSERTION: every run asserts a non-empty mask (binary renders above
   ~12% ink silently threshold to an empty set under the argmin rule).
6. LATTICE s* DIAGNOSTIC re-expressed as plateau detection: N(43) within ~20% of
   the component count (19), since 13-64 blends three regimes (measured 1.4667 is
   a blend artifact, model-reproduced).
7. SHUFFLE CONSTRAINTS pre-registered: min pairwise center distance >= d+2 (34 px;
   we pin 40), border margin >= 64 px. Seeds unchanged.
8. PUMPKIN CLASSES (pumpkin_ring = 6 droplets at the |Y_3^3| maxima; pumpkin_field =
   orthographic |Y_3^3| render): EXPLORATORY, explicitly non-gated, added
   post-registration by operator directive; carry no falsification weight.
   pumpkin_field logs achieved threshold + coverage every run.
9. GASKET v1 RESULT stands as recorded: design error (size grading + coarse
   hierarchy inside the window), instrument exonerated. v1 numbers: D 0.9478,
   local {13..64} 1.1149.
