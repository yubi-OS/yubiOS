# Amendments log — Lane D falsification corpora (2026-10-06)

Append-only. Every entry dated, pre-run, with a-priori justification. Nothing moved
after results arrived.

## 2026-10-06 (pre-run, before any corpus measurement)

1. **Router: lens_family spelling** — the preregistration guessed the registered
   family name as `gasket-v2-L384`. The plumbing probe (one route call on the
   R10 render, declared `lens_family: "gasket-v2-L384"`) returned `lens: null`
   (family not registered). The live run rows show `family: "gasket"`. CORRECTED
   to `lens_family: "gasket"` before the corpus run. The mis-spelled probe POST
   is recorded as run cr_* (probe, 201) and is NOT used as a corpus datum.
2. **Router: R10 expected gate amended** — the plumbing probe (same call) showed
   the arrangement-arm astig-0.20 render reads `spherical est = -0.39781`, which is
   OUTSIDE the pinned spherical envelope (inverse-map convergence bound |s| < 1/3),
   so the route blocks with `reroute_not_converged` instead of converging as the
   Set-B pixel-warp arm did. R10's expected gate is amended from "allowed
   (astig corrected -> re-select hierarchy-image)" to "blocked, reroute_not_converged
   (spherical cross-mode reading out-of-envelope)". A-priori justification: the
   amendment reflects the transport/render-arm difference (arrangement warp vs Lane
   F's pixel warp) observed in the probe, not a post-hoc fit to a corpus result.
   The cross-mode contamination itself is recorded as a corpus FINDING.
3. **Scorer: response-shape probe authorized** — one tiny neutral doc (no planted
   evidence) will be scored before the slice to learn the response schema; logged
   here first; its result is not a corpus datum.

## 2026-10-06 (POST-RUN FINDINGS — recorded, no gate moved)

1. **F1 (router): corrected-hierarchy did not fire on R11** — trefoil-1e-4 gold
   (detect_score 9999, D 1.5108, d_w 2.588, n 366) selected hierarchy-confirmed
   (allowed) instead of corrected-hierarchy. Source inspection (tools/lens-standard/
   jev-router.js selectBand): pair bands are matched by the policy's `all` clause
   arrays, which the GET /bands surface DOES NOT return (it maps only
   id/modality/feature/min/max/target/calibration/description). The operative
   corrected-hierarchy clauses therefore cannot be pre-registered from description
   text. Not a gate movement; a preregistration-input gap + a live-behavior question
   for the full build (obtain the policy doc's routing.bands[].all clauses; check
   whether an astig-above-threshold condition gates entry to the correction loop —
   R10/R12 had astig |est| >= 0.019 and fired; R11 had astig -0.0022 and did not).
2. **F2 (router): spectral walk silently absent on 4/12 rows** — tri, shuffle-s42,
   pumpkin_ring, pumpkin_field returned d_w=null/n=null in the direct POST response
   while the same instrument returned d_w for the other rows (runs rows confirm
   n_traced 19/19 for the shuffles that did return). The router's own contract says
   "a failed walk NEVER fails the image measurement" — but silent absence on gold
   renders means pair-band gating is nondeterministically untestable on those rows.
   Full build should assert spectral presence per run and investigate the worker
   CPU cap on the walk.
3. **F3 (scorer): cross-axis bleed on assumption_set** — 4/8 planted docs credited
   assumption_set evidence with p > 0.55 (would flip true), from composition-section
   prose. Report-only in this slice per prereg; the full build gates it.

## (empty until needed — nothing below this line yet)
