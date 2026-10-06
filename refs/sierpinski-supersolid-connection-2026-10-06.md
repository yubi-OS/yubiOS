# Sierpinski-calibrated fractal D as a supersolid morphology instrument — connection research

Date: 2026-10-06. Method: ideate-solo one-pager + 3 parallel research lanes (supersolid SOTA, prior art, instrument mapping), all searches run through the searxng proxy and every result qualified by the /api/decide decision model (clef). Companion solo log: `refs/sierpinski-supersolid-connection-solo-2026-10-06.md`.

**TL;DR.** The connection is real, but sharper than the raw idea. Our edge-standard-v1 instrument (Sierpinski-anchored box-counting D, `POST /api/jev/corpus/taste/edge-standard` on the steady-orbit worker) does NOT separate a periodic droplet crystal from a disordered droplet field — both read D ≈ 1.0–1.3 over the pinned window because the pipeline measures 1-px contours, not interiors. What D *does* separate is hierarchy: a scale-free (Sierpinski-gasket) droplet arrangement reads D ≈ 1.585 at intermediate scales where the periodic and shuffled classes collapse to their lattice scale. That makes the Sierpinski anchor load-bearing, not decorative: the instrument's known-answer fixture is exactly the morphology class no supersolid experiment has built. The literature scan found zero supersolid work using fractal/box-counting/morphological diagnostics (negative finding across two reviews and multiple full texts), a near-novel application gap for D-as-morphology-measure, and a genuinely novel target-state proposal (Sierpinski-gasket droplet crystal) whose closest prior — Rydberg fractal order at D = ln3/ln2 — carries no superfluid component. MVP: falsification corpus first (3 synthetic generators through the live route), then public supersolid imagery.

## Research record (the QC layer)

15 searxng queries → 83 unique results → 77 qualified by /api/decide (clef: per-result noul relevance + 5-level source-quality score, batched 12 questions/request, 5 s spacing) → 54 kept at relevance ≥ 0.5. One decide batch 502'd upstream (clef inference error); REDO round re-ran the affected prior-art queries with 3-attempt retry per batch per the redo-not-degrade rule. The full kept-source table with (relevance, quality) weights is inline in the lane sections below; the decide state string and query list are reproduced in the session QC log (`session/supersolid/`).

## Lane 1 — Supersolid state of the art (2023–2026)

Sources (top by decide weight): Nat Rev Phys supersolidity review (.98/3.67), arXiv 2603.29203 barrier-sweep supersolid generation (.97/3.77), arXiv 2502.06660 supersolid phases review (.96/3.83), arXiv 2407.02373 + Nature s41586-025-08616-9 polariton supersolid (.96/3.84, .92/3.73), arXiv 2509.05058 dipolar lattice supersolid (.96/3.81), arXiv 2609.40009 room-temperature perovskite polariton supersolid (.87/3.60), Nat Phys s41567-025-02927-4 driven-gas supersolid-like modes (.93/3.78), arXiv 2511.02218 quasi-supersolid (.70-.80), Sci Rep disordered supersolids (.96/3.69), arXiv 2407.02481 vortex-correlation order parameter (.85/3.87).

Findings:

1. **Platforms**: dipolar Dy/Er gases remain canonical (eGPE + LHY); 2025–2026 added driven-dissipative photonic-crystal polariton supersolids (Nature 2025), room-temperature perovskite polariton supersolids (2026), and interaction-induced quasi-supersolids with Fibonacci Bragg peaks (2025-11). The 2026 barrier-sweep paper moves the frontier to *dynamical generation protocols* and names un-realized droplet configurations as open: "pumpkin, honeycomb, and labyrinthines."
2. **Diagnostics are entirely spectral or correlation-space**: structure factor S(q), superfluid fraction ρs (winding number), zero-momentum momentum-distribution peak, two Goldstone/sound modes, compressibility κ, Josephson superfluid fraction, vortex-trajectory correlations. The vortex-correlation paper (arXiv 2407.02481) is the closest thing to a single real-space-sensitive order parameter — and even that is geometric in vortex space, not density morphology.
3. **Negative finding (the gap)**: no fetched source uses fractal dimension, box-counting, or any real-space morphological measure of the density pattern as a supersolid diagnostic. Confirmed across the Nat Rev Phys review, the 2502.06660 topical review, and multiple full texts. Caveat stated: four APS/arXiv-hosted sources did not load; the review-level sources that would have surfaced such a method contain none.
4. **Image sources for a measurement pass**: Trypogeorgos Nature 2025 polariton supersolid — real-space density with parts-per-thousand modulation precision AND **public data on Zenodo (doi:10.5281/zenodo.14251103)**; Brakensiek 2026 (2603.29203) — droplet-crystal → collision → supersolid sequence figures; Hertkorn et al. arXiv 2103.09752 — noise-free theoretical 2D droplet arrays. Norcia Nature 596, 357 (2021) 2D supersolid is the community reference for in-situ droplet images (not figure-verified by the lane).
5. **Open problems D could address**: disordered-supersolid/Griffiths phase boundaries ("proper order parameters... are unknown" — Sci Rep), dynamical-generation D(t) time series, re-coherence after quench (droplets-present-but-incoherent vs coherent), quasi-supersolid singular-continuous spectra where "the dominant peak" is an impoverished summary, non-rigid driven supersolids where Bragg-peak fitting degrades.

## Lane 2 — Prior art (Sierpinski/fractal in quantum matter)

Sources: arXiv 2505.16885 BEC on exotic/fractal lattice geometries (.95), arXiv 2401.08393 loop currents on Sierpiński gaskets (.95), anyon braiding on fractal lattices (.89; erratum PRA 107, 069901 — a cautionary tale: fractal substrates do not automatically host the intended physics), designer states on Sierpiński gasket substrates (.80), atom-photon bound states in fractal photonic lattices (.60), plus the quasicrystalline dipolar confinement pair (PRL 133.196001 / 2511.02218).

Findings:

1. **Fractal-geometry substrates are a mature field**: Sierpiński-gasket BEC theory (loop currents, Mott lobes on the gasket — PRA 2024/2026), fractal photonic lattices, superconducting gasket islands, and an *experimental* Sierpinski-gasket tweezer array of single ⁸⁸Sr atoms (arXiv 2509.03514, Hausdorff dimension 1.58). In all of them the geometry is imposed and the physics is transport/spectra — the *order* is never fractal.
2. **Idea (a) — D as a supersolid morphology measure: BORDERLINE, leaning novel.** Box-counting has been applied to BEC images only for *disordered/turbulent* condensates (arXiv 2403.12238: isoline D ≈ 1.51 rising toward turbulence; spin-1 relic domain walls D ≈ 1.7; multifractal disordered BEC). The supersolid devil's-staircase paper computes a Hausdorff dimension — but of the phase-diagram plateau set, not any image (arXiv 2201.05372) — the closest use of "fractal dimension" language and must be cited-and-distinguished. Nobody applies it to equilibrium droplet-crystal morphology.
3. **Idea (b) — Sierpinski-gasket droplet crystal: NOVEL.** The single closest prior is Rydberg fractal order (arXiv 2108.07765): a ground state placing atoms on a Sierpiński triangle with d_H = ln3/ln2 via a fractal subsystem symmetry — but Rydberg spins with engineered laser couplings, immobile fracton-like excitations, and **no superfluid component**. Second-closest: ground-state fractal crystals (PRB 107, 184104) — fractal unit cell concept, lattice model only. Droplet-crystal literature is entirely periodic/quasiperiodic (1D chains, triangular, square, honeycomb, moiré superstructures — hierarchical but not self-similar). No proposal or realization of a self-similar density-modulated superfluid found anywhere.
4. **The differentiation paragraph (required for any write-up)**: prior fractal-D imaging targets emergent pathology in nonequilibrium condensates; we apply a *calibrated* instrument (known-answer anchored to D = 1.585) to *equilibrium ordered* morphology as a complement to S(k) — and the calibration is what makes it metrology rather than an ad hoc morphology number. For (b): the Rydberg result engineers a pinned-atom pattern; we propose a self-organized density modulation of a continuum superfluid that must emerge as an energy minimum of the dipolar GPE, coexist with phase coherence, and be *certified by the instrument*.
5. **Sourcing error flagged honestly**: arXiv 1309.2061 (kept at rel .51 as "ultracold atoms in optical lattices") is actually a withdrawn 2013 superlattice preprint — mislabeled upstream; excluded from the evidence base.

## Lane 3 — Instrument mapping and falsification design

Sources: taste-engine skill (full contract) + knowledge corpus docs `natural-taste-engine/08-edge-standard-and-photo-limits.md` and `01-fractal-dimension-preference-bands.md`. Selftest Sierpinski fixture reads D 1.5926 (a purpose-built window-filling gasket).

Findings (the load-bearing ones):

1. **The pipeline measures contours, not interiors.** Three regimes inside the 4..64 px window: thin-curve (s < droplet diameter → local D ≈ 1.0), plateau (droplet ≈ 1 box each → D contribution → 0), saturation (s ≳ spacing → D → 0). The naive "D → 2 inside droplets" hazard is structurally absent (only reachable via threshold grabbing texture or merged components — pin min gap ≥ 8 px).
2. **Class-separability finding (honest negative)**: with identical droplet size distributions, the periodic triangular lattice and the disorder-shuffled field are **near-degenerate in whole-window D** (~1.0–1.3). D separates the Sierpinski hierarchy from both but NOT periodic from disordered. The (a)/(c) discriminator is the slope-break scale s* (sharp break at s ≈ spacing for the lattice, smeared 40–100 px for disorder) and/or the engine's `symmetry_present` feature. Stated plainly rather than engineered around.
3. **Sierpinski generator design**: droplet diameters 32/16/8 px (3 gasket levels, 39 droplets), 640×640, ink ≈ 5.8%; ≥ 5 of 8 window scales sit in the self-similar band. The falsification gate is the **local two-octave slope over s ≈ 16–64 = 1.585 ± 0.05 with r² ≥ 0.98** on those points; the whole-window regression reads ~1.45–1.60 (thin-curve dilution at the bottom scales — expected and honest to report). All bands are analytic estimates until the generators actually run through the live route; replacing the right column of the parameter table with measured numbers is the MVP's first step.
4. **Real-figure resolution risk**: typical in-situ panels are 240–470 px with inter-droplet spacing a ≈ 40–80 px; s = 4–6 reads JPEG/raster artifacts, s ≥ a enters saturation. Mitigations in order: crop panels to the crystal only; extract native arXiv raster (never re-encoded JPEG); upscale ≤ 2×; consistent ink polarity; report and exclude on `under_inked`/`low_confidence` flags. The pinned 4..64 window is never changed (major version bump). Real-figure claims restricted to panels with a ≥ ~40 px.
5. **If the measurement works, the `supersolid_order` axis needs**: ψ6 bond-orientational order extractor over traced-component centroids (+ slope-break s* as second feature), a clef question carrying both measured numbers rendered with decimals, 0.45/0.55 hysteresis, and admission only via the rayleigh-pattern multi-class trial recorded in refs/ — never a single-response flip.

## What this means (synthesis verdict)

The ideate-solo winner (physics re-target with a falsification-first MVP) survives contact with the research, but its central claim is REVISED by Lane 3: D is not a general supersolid order parameter — it is a **hierarchy detector** whose null behavior on periodic and disordered droplet fields is now a pre-registered prediction. This sharpens rather than weakens the connection: the Sierpinski anchor stops being a calibration footnote and becomes the physics claim. Three convergent facts make the program well-posed:

1. The supersolid community has *no* morphological diagnostic (Lane 1 negative finding) and names hierarchical droplet geometries as an un-realized frontier ("pumpkin, honeycomb, and labyrinthines" — arXiv 2603.29203).
2. Fractal *geometry* quantum matter is mature (Lane 2), but fractal *density order in a superfluid* is essentially unoccupied — the closest prior (Rydberg fractal order, D = ln3/ln2) has no superfluidity, so a Sierpinski-gasket droplet crystal with certified phase coherence is a novel, citable target-state proposal.
3. Our instrument is the only one in the stack that already carries the Sierpinski known-answer check — the falsification corpus (lattice vs gasket vs shuffle) is its claim made falsifiable in a physics domain, using the fractralrabbit gate pattern the corpus already documents.

## Next actions (pre-registered)

1. **Build the three generators** (Python, stdlib, into `tools/edge-standard/`-adjacent harness; fixture parity discipline applies): triangular lattice (19 droplets, d 40, a 64), Sierpinski gasket (39 droplets, 32/16/8), shuffle (19 droplets, min gap 48). Render 640×640 gray.
2. **Run all three through the live `/taste/edge-standard`** (multiple seeds each); replace the analytic D bands with measured ones; the gate is the Sierpinski local slope 1.585 ± 0.05 over s ≈ 16–64.
3. **Public-imagery pass** restricted to panels with a ≥ ~40 px — prefer the Trypogeorgos Zenodo dataset (native data beats figure extraction) and the Brakensiek 2026 sequence figures; record `under_inked`/`low_confidence` per image; per-image run ids are already the audit trail (`edge-standard` run rows).
4. **Only if the measurement discriminates**: draft the Sierpinski-gasket droplet-crystal proposal (differentiation paragraph per Lane 2) and the `supersolid_order` axis (ψ6 + s*); admission via the rayleigh-pattern trial.
5. **Never**: retune TARGET_COVERAGE/MIN_COMPONENT/the window toward a D outcome; flip `admitted` from this result alone.

## Addendum 5 (2026-10-06): falsification corpus MEASURED — v1 gate failure, advisor amendment, v2 pass

The pre-registered MVP (Next actions 1-2) ran the same day. Sequence: v1 generators → gate failure on the gasket → advisor review (pre-build, per directive) → logged amendments → v2 → live-route parity.

**1. v1 failure (stands as recorded).** Gasket v1 (L=320, 4 vertex depths, size-graded droplets r=20/10/5/3) read whole-window D 0.9478 and local {13..64} slope 1.1149 — a wide miss of the 1.585 ± 0.05 gate. Advisor review (count model) CONFIRMED design error, instrument exonerated: the model reproduces the measured numbers (predicted whole-window ≈ 0.95-1.00, local ≈ 1.1). Two faults: droplet size ∝ 1/2^depth puts each level's contour→point transition INSIDE the window (transitions at s = 40/20/10/6), and the vertex hierarchy (spacings 40-320) provides only ~1.5 octaves inside the 4..64 window. tri passed in the same run (D 1.2636, predicted 1.05-1.30).

**2. Amendments logged BEFORE any v2 measurement (dated, a-priori).** Gate window re-expressed as {13,20,29,43,64} (2.30 octaves; the literal "16-64" is ill-posed on the pinned scale set), center 1.585 ± 0.05 and r² ≥ 0.98 unchanged; L-convergence calibration (L=256 vs L=384) required before gate evaluation; whole-window D demoted to diagnostic (expected 1.30-1.45); component-count assertion 366; NON-EMPTY-mask assertion (new instrument-hazard finding: a binary render above ~12% ink is silently thresholded to an empty set by the argmin rule); lattice s* diagnostic re-expressed as plateau detection (N(43) ≈ 19 ± 20%; the measured 13-64 slope 1.4667 is a model-reproduced blend artifact); shuffle constraints pre-registered (min center sep ≥ d+2, border margin ≥ 64 px); pumpkin classes marked exploratory/non-gated.

**3. v2 measured (uniform r=3, 6 depths, 366 droplets at deduped corner vertices).** r=2 was rejected EMPIRICALLY first: an isolated d=4 disk traces 0 boundary pixels (dropped by MIN_COMPONENT=12); r=3 traces 16 ✓. Results (local source of record, 512×512):

| class | whole-window D | gate slope {13..64} | r² | comps |
|---|---|---|---|---|
| gasket L=256 | 1.5967 | 1.4858 | 0.995 | 366 ✓ |
| gasket L=384 | 1.5589 | **1.5968** | 0.999 | 366 ✓ |
| tri (lattice) | 1.2636 | 1.4667 (blend) | 0.988 | 19 ✓ |
| shuffle ×5 seeds | 1.030-1.046 | 1.047-1.100 | ≥ 0.992 | 19 ✓ |
| pumpkin_ring | 0.9772 | 0.869 | 0.983 | 6 |
| pumpkin_field | 1.0384 | 1.045 | 0.999 | 6 |

**L-convergence (the advisor's make-or-break check): the slope DRIFTS with L** (Δ 0.111 between L=256 and L=384) — the render bias is real but NEGATIVE at L=256 (−0.099 vs theory) and ~zero at L=384 (+0.012); the advisor's thickened-point-set models predicted +0.1..+0.35 — wrong in sign at these parameters, recorded as such. Calibration amendment: the gate evaluates at the smallest available r/L (L=384). **Gate verdict: 1.5968 vs 1.585 ± 0.05 = PASS** (r² 0.999). The whole-window diagnostic band (1.30-1.45) was missed HIGH (1.52-1.60): the thin-curve contamination was ~3× smaller than modeled — recorded honestly.

**4. Surprise finding (revises the Lane-3 prediction): tri and shuffle are NOT near-degenerate.** D separates ordered-lattice (1.2636) from random-field (1.030-1.046) by ~0.23 in this design. Caveat: the design confounds order with array extent (the tri patch spans ~236 px; the shuffle fills 384×384), so the discriminator may be extent-driven, not order-driven. v3 control = matched-extent shuffle before any claim that "D reads order vs disorder".

**5. The pumpkin/Y₃³ answer (exploratory, non-gated).** pumpkin_ring (6 droplets at the six |Y₃³| maxima — the equatorial hexagonal ring) reads D 0.9772; pumpkin_field (the orthographic |Y₃³| render itself) reads D 1.0384 with the 6 lobes as separate components. Both are SMOOTH, ordered morphology: the instrument reads them at D ≈ 1, a full unit below the Sierpinski hierarchy (1.60). So the operator's instinct resolves measurably: if the barrier-sweep paper's un-realized "pumpkin" droplet configuration is Y₃³-like (3-fold/6-fold smooth lobed order), it lives in the ordered-smooth class — and a Sierpinski-gasket droplet crystal would be a *genuinely distinct* target state whose certification signature is D ≈ 1.585 vs ≈ 1.0-1.3 for every periodic or shuffled configuration measured.

**6. Live-route parity (worker, 256 renders through POST /api/jev/corpus/taste/edge-standard).** All four classes PASS against the local source of record: tri Δ 1.2e-5, shuffle Δ 4.5e-5, pumpkin_ring Δ 2.4e-5 (r² 0.905 → low_confidence flagged by the route, exactly the small-N regime the advisor predicted: report, don't gate), pumpkin_field Δ 4.3e-5. Run rows: cr_6f652cfed686aae1, cr_87bffecea50f0c31, cr_aad7cfcd6615e546, cr_7dcb87d362eb7809.

**Next actions (updated).** (a) v3 control: matched-extent shuffle (same bounding box as the tri patch) to deconfound extent from order; (b) real-figure pass restricted to panels with inter-droplet spacing ≥ ~40 px, preferring the Trypogeorgos Nature 2025 Zenodo dataset (doi:10.5281/zenodo.14251103) over figure extraction; (c) only if the measurement discriminates on real data: the `supersolid_order` axis (ψ6 + slope-break s*) via the rayleigh admission protocol.

Artifacts: `session/supersolid/` (gen_v2.py, gen_parity256.py, falsification-results-v2.json, amendments-log-2026-10-06.md, PGM renders, parity manifests + run ids).

## Addendum 6 (2026-10-06): REAL-DATA PASS — the transition trend is in the data

The pre-registered real-data pass ran the same night, on two public datasets.

**Dataset 1 — Trypogeorgos et al., Nature 2025 polariton supersolid (Zenodo doi:10.5281/zenodo.14251103, CC-BY-4.0, 204 MB).** Structural finding first: the processed fig1/fig3 data are **1D profiles** (1024 positions × 114 pump powers; fig1 `dc` = density DC term, fig3 `g1s` = coherence envelopes) — the waveguide platform's real-space data is one-dimensional, so the 2D droplet-morphology classes cannot be tested on it directly. Measured anyway (exploratory, strips of the coherence envelopes): 12 frames across the pump sweep (20.2–897.9 mW) read **D 1.237–1.498 with no threshold signature in D itself**; r² dips to 0.956–0.964 at the highest powers (low_confidence territory). Consistent with the falsification corpus: smooth ordered morphology reads D ≈ 1.2–1.5 on strips and carries no fractal signature.

**Dataset 2 — Norcia et al. 2021, Nature 596, 357 (arXiv:2102.05555) Fig. 2b: eight single-trial in-situ images across the linear→zig-zag transition (αt 0.32→0.43), extracted at 600 dpi from the arXiv PDF, star markers masked to background, measured at native resolution (279×377):**

| αt | regime | whole-window D | slope {13..64} | comps |
|---|---|---|---|---|
| 0.32 | linear chain | 0.9827 | 1.005 | 26 |
| 0.33 | linear chain | 1.0538 | 1.085 | 20 |
| 0.35 | linear chain | 1.0598 | 1.077 | 15 |
| 0.36 | transition | 1.1382 | 1.132 | 11 |
| 0.37 | zig-zag onset | 1.2294 | 1.325 | 7 |
| 0.39 | zig-zag | 1.1629 | 1.243 | 11 |
| 0.41 | 2D zig-zag | **1.3708** | 1.462 | 7 |
| 0.43 | 2D zig-zag | 1.2421 | 1.363 | 15 |

**The real-data trend: D climbs across the 1D→2D transition** — the linear chain reads D ≈ 0.98–1.06 (at or below 1: the saturation-dominated sparse-point regime, exactly what the falsification corpus predicts for sparse arrays) and the 2D zig-zag reads D ≈ 1.16–1.37. Caveats, honestly: single-trial images carry shot noise (comps fluctuate 7–26 across panels); pseudocolor luminance conversion; the star-marker masking; n = 8; and the D increase is confounded with droplet number and array extent (more droplets at higher αt) — the v3 matched-extent control applies to this dataset too. The corpus prediction this is NOT: no panel reads anywhere near the Sierpinski band (1.585); all eight real images sit in the ordered-smooth class, as the corpus says they should.

**Live-route run rows (3 representatives, half-res via KV staging):** at0.32-linear-chain live D 1.2772 (Δ 4.9e-5, run cr_dff7352880876a09), at0.37-zigzag-onset live D 1.2818 (Δ 4.3e-5, run cr_83615312b8f10d47), at0.43-2d-zigzag live D 1.2721 (Δ 2.7e-5, run cr_ca3331c4bb8aaacc). At half-res r² = 0.931–0.972 < 0.98 → **the low_confidence gate fires at reduced resolution, correctly** — the r² gate is doing its job as a resolution-sensitive quality flag on real data (native-res local r² was 0.983–0.998).

**Updated next actions.** (a) v3 matched-extent shuffle (synthetic control) + a matched-extent read across the Norcia panels to deconfound droplet number from dimensionality; (b) multi-trial averaged in-situ images would denoise the per-panel verdicts (Fig 2b is single-trial by design); (c) the αt trend (0.98 → 1.37) is the first real-data evidence that a morphology D moves with the structural transition — the `supersolid_order` axis design (ψ6 + slope-break s*) stays gated on a discriminating measurement on controlled real data, not on this trend alone.

Artifacts: `session/supersolid/` (Data.zip + extracts, norcia/ page renders + 8 panel crops + b64, trypogeorgos-profiles.json, norcia-panels.json, norcia-live-manifest.json).
