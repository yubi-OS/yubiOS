# Falsification harness coverage: endpoints that can use one effectively

Date: 2026-10-06. Companion to the ENDPOINTS.md Harness column (docs/ENDPOINTS.md,
refresh 2026-10-06). Scope: the steady-orbit worker endpoint surface as of the 51-part
bundle (etag chain through the corrected-hierarchy round).

A falsification harness, per skills/falsification-corpus, is: pre-registered pinned
parameters and predicted bands BEFORE measurement; a synthetic known-answer gold
corpus; gate windows verified against the actual scale lattice pre-run; committed
regression anchors; live-route parity between the worker port and the Python source of
record; and a real-data pass protocol with confound controls named in advance. The
recent instruments (spectral-standard, lens-standard, edge-standard) set the pattern:
a synthetic gold family with exact closed-form answers, a pre-registered gate, and an
anchors.json machine-readable record, all failing loud rather than soft.

Standing lesson that motivates this list: negative verdicts earned under a noisy
instrument are provisional, not terminal (the refs3 lesson — the free-prose scorer band
was 6-8x the true effect). A falsification corpus is how you shrink the instrument
BEFORE trusting a verdict, instead of re-litigating it after.

## Tier 1 - already harness-backed (the pattern-setters)

| Endpoint | Harness |
|---|---|
| POST /api/jev/corpus/spectral/walk, /spectral/series, GET /spectral/selftest | 15/15 gold PASS + 61 anchors; walk gold pinned at merged-gasket level 6 |
| POST /api/jev/corpus/oracle | Gold families with exact closed-form d_f / d_w; Einstein zero-false-"consistent" held 11/11 on real data |
| POST /api/jev/corpus/lens/correct, GET /lens/selftest | 75/75 falsification PASS; preregistration + anchors; cross-talk envelope |
| POST /api/jev/corpus/taste/edge-standard | Falsification-corpus-validated pipeline (v1 gasket gate FAIL caught the design error pre-real-data); 4-fixture parity |
| POST /api/map/control | IS the positive-control falsification endpoint (seeded splice CHANGEs on the frozen frame) |
| POST /api/map/admission, /rayleigh, /azimuth, /axis-redundancy | Matched-null falsification trials (fixed-margin curveball null, positive controls, calibration pack) |

## Tier 2 - high-value candidates with a concrete falsification design

Ordered by expected value per unit of build effort.

### 1. POST /api/jev/corpus/audit (+ /lens) — planted-effect standard candles

- **What to falsify:** that the audit's z / level_dbc recover a KNOWN planted effect, and that the null returns zero at zero amplitude, across the operating range.
- **Harness shape:** the curved-corpus-create skill already generates planted real-SH-signal corpora + matched nulls + a calibration pack (signal-recovery curve, FPR, detection threshold) — nothing runs it as an endpoint-level gate today. Build a ladder of corpora at 4-5 known amplitudes + zero-amplitude controls; gate = measured level within a pinned tolerance of the planted level and FPR <= floor at zero.
- **Cost:** pure compute; the generator exists.
- **Grounding:** knowledge corpora carry the sonometer lineage (papers/data/lean/verify_claims.py CLAIM_8, the +15.6 dBc floor); curved-corpus-create is the named skill.

### 2. POST /api/jev/route — end-to-end routing falsification corpus

- **What to falsify:** the full route path, not just band selection. Band selection was calibrated (6/6 live-route hits), but the gate outcome per class (dispatch / needs_approval / blocked / reroute_not_converged) has no pre-registered corpus.
- **Harness shape:** the gold renders already exist with measured D + d_w (gasket, tri, shuffle, pumpkin_ring, pumpkin_field). Pre-register: family -> expected band -> expected gate outcome; run each through POST /api/jev/route live; assert both steps. Add the convergence-gate negative (a deliberately mis-corrected artifact must land reroute_not_converged, as observed on run cr_b11bbeee22ed5425).
- **Cost:** zero API cost (route dispatch is deterministic; skip the model-dispatch leg or stub it).
- **Grounding:** falsification-corpus skill (gates + anchors), the supersolid gold families (session/supersolid/ artifacts, refs/sierpinski-supersolid-connection-2026-10-06.md addenda).

### 3. POST /api/jev/corpus/scorer/score (+ /scorer/matrix) — extractor gold set

- **What to falsify:** the deterministic per-axis evidence extractor: does it find the evidence it should, and only that?
- **Harness shape:** synthetic docs with planted evidence patterns per axis at known counts (evidence_count ground truth) — gate = per-axis precision/recall above pinned floors; paraphrase-preserved variants gate stability; distractor vocabulary (the axis-vocabulary trap from AGENT.md) gates specificity. This doubles as the v2.3 extractor-recall-pass gold set the refs4 round already called for (3 no-flip cycles were extraction-recall limits).
- **Cost:** ~$0.0002/score on synthetic docs; the whole corpus well under $0.05.
- **Grounding:** scorer parity is byte-exact vs session/r15/scorer_v2.py, but parity of a port is not validity of the extractor — no known-answer set exists.

### 4. GET /api/jev/corpus/visco/prony — synthetic relaxation recovery

- **What to falsify:** the tau-grid + NNLS fit's recovery envelope. Live real-data fits are honest-but-weak (r2 0.069 on the first 35-point series); nothing pins WHERE the estimator is trustworthy.
- **Harness shape:** synthetic series that are exact sums of exponentials at planted (tau, weight) pairs across SNR tiers and point counts (including the <5-point 422 boundary); gate = recovered pairs within pinned tolerance; record the low-SNR / short-series envelope as the honest scope.
- **Cost:** pure compute.
- **Grounding:** knowledge/linear-viscoelasticity/ (Prony-series relaxation surface is missing-link L3), jev-visco-math.js fixture anchors.

### 5. POST /api/jev/corpus/visco/snapback — verdict-class corpus

- **What to falsify:** the stop verdict mapping. The recorded round-3 series is ONE fixture, not a corpus.
- **Harness shape:** synthetic (predicted, realized) series spanning the classes: aligned-meaningful (continue), inverted (halt), zero (no-flip), noisy-null (each tier); gate = verdict matches class at 100% on the noiseless tier and pinned FPR on noisy tiers.
- **Cost:** pure compute.

### 6. GET /api/jev/corpus/visco/hysteresis — analytic rollup fixtures

- **What to falsify:** the supersedes-chain consolidation (consolidateLedgerChains) — the Oct-3 fix that made this route work at all has fixture coverage only via the 102.86 hysteresis anchor.
- **Harness shape:** seeded chains with known closed-loop dissipation sums (1-cycle, multi-cycle, pending, single-row-both shapes, the exact shapes that broke the original route); gate = rollup equals the analytic sum per chain.
- **Cost:** trivial.

### 7. POST /api/jev/corpus/taste/score (+ /taste/matrix) — 8-axis gold corpus

- **What to falsify:** each axis's extraction + band. The validation discipline exists (jitter test, calibration sweeps, gold-set cross-validation, rayleigh admission) but is not packaged as a pre-registered corpus with committed anchors.
- **Harness shape:** synthetic images with known properties: exact mirror-symmetric renders and seeded asymmetry perturbations at known magnitudes (symmetry axis), fractal ladders at known D (fractal band — currently admitted:false pending the human-rated gold set, so the synthetic tier gates extraction while the semantic tier stays open), scale-coherence ladders with known slope. Committed anchors per fixture.
- **Cost:** pure compute for the synthetic tier.
- **Grounding:** knowledge/edge-map-standardization/ (comparability is won/lost at extraction — the same argument applies per-axis), taste-engine skill validation section.

### 8. POST /api/jev/corpus/visco/persistence — planted-noise multi-pass

- **What to falsify:** the persistence statistic's behavior under controlled scorer noise. Known limit: a deterministic scorer collapses recovery fraction R to 1.0 (F3), so the honest target is the inter-pass offset under multi-pass mode with planted noise tiers.
- **Harness shape:** base + loaded corpus pairs with known bit flips; inject controlled perturbations into the re-grade inputs at calibrated magnitudes; gate = persistence reading tracks the planted noise dose monotonically.
- **Cost:** low; needs the multi-pass audit mode.

### 9. POST /api/jev/corpus/classify — adversarial tautology corpus

- **What to falsify:** the tautology/falsifiable/paradox/undecidable boundaries. run-real-statements covers the real corpus distributionally, but no planted-signal set with known verdicts exists.
- **Harness shape:** hand-built exemplar pairs (tautology vs near-tautology-but-falsifiable), paraphrase invariance set, known paradox exemplars, negation/quantifier edge cases; gate = verdict matches the labeled class; determinism across passes (already enforced).
- **Cost:** authoring time only.
- **Grounding:** tools/tautology-discerner (the circularity-audit fix already added held-out/negative-control selftests — extend that pattern to a committed corpus).

### 10. POST /api/map (+ /preview) — planted-placement corpus

- **What to falsify:** the statistical layer the Lean bounds deliberately do not cover: does a document authored for a known (u,v) neighborhood land there?
- **Harness shape:** synthetic texts anchored to chosen cells (the curved-corpus-create planted-signal idea applied to embeddings instead of matrices); frozen frame; gate = placed cell within a pinned geodesic band of the planted cell, FPR at matched-null controls.
- **Cost:** moderate (needs a text-generation pass); highest research upside of the list since the wayfinder's usefulness rides on it.
- **Grounding:** WayfinderBounds.lean covers the integer layer; the SOS-wayfinder runbook (rounds 5-6) is the consumer.

### 11. POST /api/embed + /api/vector/search — retrieval gold pairs

- **What to falsify:** retrieval quality of the chunked/v1 representation.
- **Harness shape:** query <-> doc gold pairs at known relevance tiers + graded distractors; gate = top-k hit rate above floor per tier, zero hits on the distractor tier; determinism check on the content-hash cache path.
- **Cost:** low.

### 12. POST /api/decide — fixed-answer decision battery

- **What to falsify:** decision-model stability and calibration across deploys (the clef migration moved 21.6% of raw probabilities; the 0.55 threshold was chosen from a 50-doc sample).
- **Harness shape:** a fixed battery of questions with known intended answers spanning score/noul/choice, run after every model/threshold change; gate = agreement above floor + calibration error within band; results become the WLF policy-shift study's data (policy_version changes are already logged in jev_policy_changelog).
- **Cost:** ~$0.0002/run.

## Tier 3 - poor fit for falsification (contract tests, not corpora)

Public relays (/api/tts, /api/stt, /api/contact, /api/chat, /api/site-assistant,
/api/brain/preview), site pages and asset pass-throughs, CRUD surfaces (tasks,
approvals, maps, fits, automations, learnings), evolution directives, pause, summary,
webhooks, health endpoints. These have no measurement to falsify; they want contract
tests (schema, auth, idempotency, fail-closed behavior), several of which already exist
as selftest checks. The one borderline: POST /api/jev/route's dispatch leg is
gate-behavior (tier 2 item 2) — its TRANSPORT (bands table, runs listing) is tier 3.

## Build-order recommendation

1. Snapback + hysteresis fixtures (items 5, 6): hours, zero external calls, closes the visco family's fixture gap.
2. Route end-to-end corpus (item 2): the gold renders exist; pre-register and run.
3. Scorer gold set (item 3): directly unblocks the v2.3 extractor-recall pass the refs4 round named.
4. Prony recovery envelope (item 4): pins the estimator before the next real-data round.
5. Audit standard candles (item 1): biggest value, uses the existing curved-corpus-create generator.
6. The rest in priority order as rounds demand them.

Every build follows the falsification-corpus operating procedure: pre-register before
measuring, verify gate windows against the actual scale lattice, commit anchors, run
live-route parity, and log amendments BEFORE the first clean run.
