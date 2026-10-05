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
