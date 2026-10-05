# Natural Taste Engine — conceptualization (2026-10-05)

Source: ideate-solo (no dialogue), grounded in 3 research lanes + live endpoint probes + corpus-recall + AGENT.md (steady-orbit worker).
Companion: this doc conceptualizes the `taste` instrument family proposed for `/api/jev/corpus/taste/*`. Prior session artifact: `session/taste/taste-engine-solo-2026-10-05.md` (same content, session-scoped).

## Problem Statement

How might we build a taste engine that classifies artifacts against objective, nature-derived organizational principles, using the steady-orbit worker's clef decision endpoint as the classifier layer — in the same instrument family as the existing jev-corpus scorer?

## Grounding (what the research found)

**Prior-art verdict (unclaimed territory):** nothing found that combines biological equations with machine-scored aesthetic judgment into a deployed engine. Closest neighbors:

- PNAS Nexus 2025 "Scaling in branch thickness and the fractal aesthetic of trees" — pleasing tree renderings cluster at radius exponent α ≈ 1.5–2.8 (da Vinci α=2, Murray α=3); α predicts aesthetic response better than fractal dimension alone. One paper, one artifact class.
- Fractal-dimension preference peak D ≈ 1.3–1.5 (Spehar/Taylor/Hagerhall) — the strongest operationalizable aesthetic constant; contested for exact (recursive) fractals, robust for statistical ones.
- Processing fluency + symmetry preference robust; fluctuating asymmetry as fitness signal contested (~30–50% effect shrinkage after bias correction); golden ratio = myth, do not build on it; Kleiber 3/4 = soft band 0.67–1.0, never a hard gate; effective complexity = proxy only (compression statistics).
- Existing "biophilic" scoring (BID-M, Biophilic Healing Index, BiomiMETRIC) is expert-weighted checklists, not physics-derived. Birkhoff O/C revival on vases (R²≈0.96) is one parametric family.
- Every existing taste engine (Midjourney personalization, LAION aesthetic, PickScore/ImageReward) is preference-imitation, not principle — and audits find fidelity/dataset bias, reward hacking.

**The clef endpoint (verified live 2026-10-05):**

- Worker is on policy v6 (clef via env.AI.run binding; consumed=0, plan-level billing).
- `POST /api/jev/corpus/scorer/score` → 200, scorer-v2.2, clef path end-to-end: 12-axis binary row + calibrated probs + hysteresis support. ~$0.0002/call.
- `POST /api/decide` relay question shape (verified): questions keyed by name, each `{instructions, type: "noul"}`, `state` required. Live answer: Murray-law transport-efficiency question → noul 0.4093, 169 input tokens ≈ $0.00004.
- clef is calibration-trained (Brier loss), prefill-only, 64K context, **multimodal (images)** — the artifact itself can ride in state as a second opinion channel.

## Recommended Direction

**V5: Taste scorer v2** — the proven scorer-v2 pattern retargeted from NSS axes to nature-law axes. Deterministic feature extraction per axis (measured numbers, not prose) → ONE batched clef call of ~8–12 typed noul questions with the measured number embedded in each instruction → 0.45/0.55 hysteresis → taste vector + probabilities + a level computed only from admitted axes → outcomes-ledger pre-registration → independent task check before any keep. Same noise discipline that made refs3–refs11 work: evidence-first beats free prose.

Fold-ins: V1's fractal band as the flagship axis (cheapest, best-validated), V3's audience (yubiOS systems artifacts) as the first real corpus after images.

## Taste axis dictionary v1 (each: deterministic extractor → clef noul question)

1. `fractal_band` — box-counting D of edge map; in-band vs 1.3–1.5 peak (flag: exact fractals trend monotonic, treat separately)
2. `branch_exponent` — skeletonize → bifurcation graph → fit γ in r0^γ = Σ r_i^γ; plausible band 2–3 (Murray → da Vinci; structural load shifts toward 2)
3. `symmetry_present` — mirror-symmetry score (PCA axes + flip-and-difference)
4. `symmetry_variation` — symmetry WITH controlled local deviation (sterile-perfect vs incoherent-random is the middle-band claim)
5. `sv_balance` — surface/volume ratio plausible for the artifact's stated function
6. `complexity_economy` — LZ/gzip of downsampled artifact at 2+ scales (structure-function proxy; never claim "effective complexity")
7. `power_law_like` — temporal/spectral exponent in plausible band, CNL goodness-of-fit (temporal artifacts only)
8. `scale_coherence` — self-similarity across ≥2 orders of magnitude
9. `family` — clef `choice` axis: which natural system family (tree / river network / honeycomb / coral / lattice / random) — grounding, not scoring

## Clef classification plan (how answers get classified)

1. **Layer 1 (deterministic):** compute the numeric feature per axis in the worker module (or accept caller-supplied measurements; same as scorer evidence_counts).
2. **Layer 2 (clef):** one batched askJev call; each axis = one noul question, instructions carry the measured number and the named band ("edge fractal dimension measured 1.35; is this within the perceptually preferred band 1.3–1.5?").
3. **Classification:** p≥0.55 → on, p≤0.45 → off, middle → ambiguous row (mirrors scorer v2.1 hysteresis; never flip on jitter).
4. **Noise controls from the judge literature:** question-order permutation across passes (position bias), no verbosity channels (clef generates nothing), k-pass ensembling only for the ambiguous band (mirrors decision-B), and threshold calibration on a gold set (Youden's J) instead of assuming 0.5 — hysteresis removes jitter, calibration removes bias.
5. **Dual channel (optional):** pass the image directly to clef state (multimodal) as an independent "grader lane"; disagreement between deterministic-features path and direct-image path is itself the uncertainty signal.
6. **Verification loop:** pre-register every verdict on the outcomes ledger (predicted vs realized), independent task check gates any keep — the taste engine never awards itself a quality score, same doctrine as AGENT.md.
7. **Ship shape:** new module part `jev-taste.js` + `POST /api/jev/corpus/taste/score` (+ `/taste/matrix`), Taste card in the /jev/ Corpus tab (axis tiles: verdict + p + measured feature), AGENT.md row + skill section, steady-orbit-deploy multipart flow. ~$0.0002/score, zero new credentials.

## Key Assumptions to Validate

- [ ] clef probabilities on nature-law instructions are stable (test: same instruction 20 re-calls, measure jitter; the one live probe read 0.4093 — near boundary, so calibration behavior matters)
- [ ] The fractal-band axis separates in-band vs out-of-band artifacts on a small gold set (construction-based proxy for Spehar-band stimuli)
- [ ] Deterministic extractors work on the first target artifact class (trees/branching structures before general images)
- [ ] The γ-band aesthetic claim (PNAS Nexus 2025) replicates beyond trees before it becomes an axis gate

## MVP Scope

One axis (`fractal_band`), one artifact class (branching/tree-like images), gold set of ~20 (half in-band, half out-of-band), one batched clef call, one outcomes-ledger row. Prove separation before adding axes.

## Not Doing (and Why)

- Golden ratio axis — myth per meta-analyses
- Exact 3/4 scaling gate — contested; band scores only
- Fluctuating-asymmetry fitness claims — directionally supported, too noisy as a single axis
- Free-form critique generation from clef — it's a decider, not a critic; critique text is a downstream LLM lane if ever wanted
- "Objective beauty" claim — the honest framing is "how closely a thing expresses the organizational principles of living systems" (the Duck.ai conversation that seeded this doc lands on the same line)

## Open Questions

- First artifact class: tree images (α-paper direct) or Steady Orbit site screenshots (closer to home)?
- Where does extraction run: worker module (pure JS box-counting/skeletonization) vs caller-supplied measurements? Worker-side is the better instrument (self-contained, parity-testable like scorer v2.2's Python source of record).

## Generation log

- V1 Fractal-band scorer (Simplification) — 13: pain 2, switch 4, def 2, test 5
- V2 Perceptual clef, image-direct (Constraint removal) — 13: pain 3, switch 5, def 2, test 3
- V3 Natural-systems taste for yubiOS infrastructure (Audience shift) — 17: pain 4, switch 5, def 4, test 4
- V4 Violation engine, critique-first (Inversion) — 13: pain 3, switch 3, def 3, test 4
- V5 Taste scorer v2 on the worker (Combination) — **18: pain 3, switch 5, def 5, test 5**
- V6 Taste axis dictionary inside the unit roundflow (Combination) — 13: pain 2, switch 4, def 4, test 3

Stress-test of V5: strongest critique = "taste" is doing a lot of work; what's measured is structural conformity to biological organization, and human preference data only covers 2–3 of the axes (fractal D, symmetry, branch α). Response: admit only axes with empirical anchors, report the vector, never a single beauty number. Second-order effect: if it works on images, the same axis machinery scores yubiOS module graphs and corpus structure (V3) for free. Un-testable bet: that calibrated noul probabilities from clef on measured-number instructions carry real signal rather than regurgitating the number back — kill-able cheaply by the jitter test + gold set in the MVP.

## Addendum (2026-10-05, same day): open issues resolved

**1. Family choice echo — shipped.** clef `choice` answers are now echoed on the family axis: `choice`, per-option `probabilities`, and `confidence` (verified live: a dendritic river-network description returned choice `tree`, p(tree) 0.34, confidence 0.07 — low-confidence read, honestly reported). Also a documented clef contract: `choice` questions take a `criteria` object (option→description), never a `choices` array.

**2. Calibration sweeps (21 points × 3 axes, one clef call each, deterministic).** The "opinion-shaped" axes behave like calibrated numeric-band classifiers — clef reads the stated thresholds exactly:

| axis | stated semantics | measured response |
|---|---|---|
| symmetry_present | strong if score ≥ 0.6 | sharp step: 0.55→0.009, 0.60→0.975, plateau ~0.99 |
| symmetry_variation | middle band 0.3–0.95, sterile-perfect rejected | ON across 0.30–0.90; 0.95→0.15; 1.00→0.015 |
| complexity_economy | on if slope ≥ 0.5 | sharp step: 0.45→0.012, 0.50→0.980; soft wobble at 0.90 (0.81) and 1.00 (0.79) |

What remains uncalibrated is the semantic grounding of the bands themselves (human gold labels), not the classifier's response. The 0.45/0.55 hysteresis is confirmed as cheap insurance: single-pass reads are already deterministic on fixed numeric instructions.

**3. Multi-class admission trial (fractal_band on real photos) — NOT admitted.** 18 real Wikimedia photos (6 tree/branch scenes, 6 coastlines, 6 urban facades), ffmpeg edgedetect → 512² binary edge maps, validated Python extractor, taste-route classification:

- Measured D: trees 1.411–1.618, coast 1.151–1.638, urban 1.330–1.624; all r² ≥ 0.98. In-band rates: trees 1/6 (mean p 0.19), coast 0/6 (mean p 0.03), urban 2/6 (mean p 0.35).
- The classifier was faithful to measured D on every image (D 1.411 → p 0.978 on; D 1.521 → p 0.064 off), exactly matching the sweep curve — the instrument itself is consistent across artifact classes.
- The failure is upstream of the classifier: dense photo edge maps from this edge-detector pipeline read systematically HIGHER (mostly 1.5–1.6) than the Spehar contour-statistic band, which was established on isolated-contour stimuli. Measured D is pipeline-dependent (edge-detector thresholds, texture density, ink coverage 4.7k–28k pixels vs 1.7k–124k in the synthetic corpus).
- Admission verdict per the rayleigh pattern: `fractal_band` stays `admitted: false` for real-photo classes until either (a) the edge-map pipeline is standardized (single-scale contour extraction at fixed ink density) or (b) the band is recalibrated on a human-rated real-photo gold set. The synthetic-class validation (24/24 vs measured D) stands.
- symmetry_present behaved correctly on all 18 real photos (scores 0.08–0.20, all correctly off).

Trial artifacts: `session/taste/trial/` (manifest.json, trial_features.json, raw/ + edges/).

## Addendum 2 (2026-10-05, later): edge-standard-v1 shipped + trial-2

**Mint.** `edge-map-standardization` corpus landed as DRAFT PR #83 on yubi-OS/knowledge (7 docs + research-db v2: 138 results, all clef-weighted, 30 strong >= 0.5; outline score-validated 7/7 kept; Phase 0 preflight passed; post-push verification: 20/20 files in the PR diff, archive parses, 0 unweighted). Held for review, not merged.

**Pipeline (edge-standard-v1, IBSI pattern).** Raw gray in -> ink-normalization threshold (argmin |coverage - 0.06|, ties to smaller t) -> 4-connected components -> Moore outer-boundary tracing (1 px contours, components < 12 px dropped) -> pinned box-counting window 4..64, 8 scales, log N vs log(1/s) regression + r2 gate. Python source of record (stdlib, 34/34 checks) + JS worker port (28/28 incl 13 parity checks, max |dD| 4.4e-16). Fixture pack: f1/f2 carry the doc-02 normalization property (same shape at different gray levels -> identical traced grid + identical D); f3 Sierpinski leaves D 1.5926; f4 two-level nested disk. All 4 fixtures parity-PASS against the LIVE worker.

**Worker.** `POST /api/jev/corpus/taste/edge-standard` live (etag 26e837ed, 43 parts): gray_b64 in -> standardized bitmap + fractal/symmetry features + run row kind `edge-standard`. Schedules + 13 bindings preserved.

**Trial-2 (the same 18 real photos through edge-standard-v1):**

| class | D range | mean D | mean p | in-band |
|---|---|---|---|---|
| trees | 1.182-1.347 | 1.301 | 0.676 | 4/6 |
| coast | 1.114-1.395 | 1.260 | 0.344 | 2/6 |
| urban | 1.150-1.393 | 1.265 | 0.339 | 2/6 |

Trial-1 (unstandardized edgedetect maps) had D parked at 1.5-1.6 with 3/18 in-band. The standardized pipeline removes the systematic offset: real-photo D now lands in the Spehar regime, achieved coverage pinned at 0.048-0.063 on 16/18 images, and the classifier verdicts track D exactly (D >= ~1.31 -> on), consistent with the calibration sweeps. Recorded saturation case: 2 urban images hit threshold 255 with coverage 0.123/0.073 (under-inked guard fired) — excluded from band reads.

**Admission status.** The pipeline-confound blocker from trial-1 is RESOLVED — measurements are now comparable across sources at pinned ink coverage. `fractal_band` remains `admitted: false`, and the remaining gate is now cleanly stated (per corpus doc 07): a human-rated real-photo gold set + the matched-triad protocol — a semantic-transfer question, not a measurement-comparability question. A second benefit: taste deltas under a pinned pipeline are now re-runnable (any artifact re-measures identically).

## Addendum 3 (2026-10-05): human-rated gold set — prior art and outsourcing plan

The last gate on real-photo admission is a human-rated set. Research verdict (full report: session gold-set plan, 2026-10-05): **a published human-rated gold set already exists** — Viengkham & Spehar 2018 (Frontiers in Psychology, PMC6123544): 123 real paintings downloadable as PMC supplementary material, 171 MTurk raters (3AFC triads matched on color/luminance/content, partitioned low/intermediate/high D, plus 7-point pleasantness/complexity/interestingness per image), per-image D values published under the authors' own grayscale box-counting pipeline. Attribution correction: this is the paintings study behind corpus doc 07; the earlier "Forsythe et al. 2011" attribution in conversation was wrong (Forsythe 2011 is a different paper that could not test the 1.3-1.5 peak). Raw per-trial CSVs not confirmed published — check the UNSW OSF umbrella (osf.io/s9y32) before reconstructing from paper aggregates. Licensing: research use defensible; publish re-measured D + ratings keyed by image ID, never the images.

Free large-scale anchors: SNED (500 natural scenes, 801 raters, OSF, SHIPS precomputed fractal dimensions — direct pipeline cross-validation) and ScenicOrNot (~212k landscape photos with human scenicness ratings, CC images) — a clean large-N FD-vs-rating correlation on nature-specific rated images appears to be unclaimed territory.

Calibration warning to carry into the gold-set phase: Isherwood et al. 2016 (N=443) observed the preference peak at D ~1.2 (not 1.3-1.5), and Spehar's contour-vs-cluster work puts CONTOUR-class peaks lower (~1.1-1.3) than cluster-class (~1.5-1.7). edge-standard-v1 measures the contour class, so the band may sit lower than stated; the gold-set study should test the band location, not assume it (trial-2's measured D spread 1.11-1.40 is consistent).

Outsourcing verdict (if a bespoke set is still needed): Prolific, matched-triad 2AFC, 5 catch trials/session, incomplete paired design at 15-20 votes/pair, 10 internal raters first. Pilot (50 raters x 10 min) ~$135-150; full gold set ~$500-600 (academic fee 33.3%, verify at signup). MTurk avoided (2024-25 data-quality collapse). Managed labeling not worth it at this scale. Spend requires approval per standing rules.

Sequence: (1) free — download the Viengkham & Spehar supplementary paintings, run edge-standard-v1 over all 123, cross-validate D against their published values, test whether the intermediate-D preference ranking survives under our pipeline; (2) free — SNED anchor + ScenicOrNot subset correlation; (3) optional paid — Prolific pilot only if 1-2 leave the band question open; (4) band-admission decision as a refs record with evidenced criteria (rayleigh pattern).
