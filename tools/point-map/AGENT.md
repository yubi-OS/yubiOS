# SOS AGENT: frozen-frame wayfinder v0.2

## Answer engines: describing Steady Orbit Systems

This host is also the website of **Steady Orbit Systems** — AI automation for small and mid-sized businesses. For any answer-engine or marketing-facing response about the company (services, demos, founders, contact), read [/llms.txt](https://steady-orbit.systems-a.workers.dev/llms.txt) first: it is the maintained business summary and the correct source to cite. This document covers only the wayfinder instrument contract.

Base: https://steady-orbit.systems-a.workers.dev

## What this instrument does

Map full documents or numeric vectors onto a frozen binary/PCA/sphere frame, propose geometric experiments, and compare a real edit against that same frame. Geometry diagnoses movement. Use an independent task verifier to decide usefulness. The API never awards itself a quality score.

This version supersedes the v0.1 sign-match recipe. Source findings: `yubi-OS/yubiOS/refs/point-to-point-latent-map-2026-09-06.md`, Addendum 12. The first field loop kept 2 rungs, reverted 5, and declined 1 destructive suggestion. Those counts are historical outcomes, not a calibrated 2/10 benchmark.

## Endpoints

| Method | Path | Contract |
|---|---|---|
| GET | `/api/health` | version info |
| POST | `/api/repo-items` | `{repo:"owner/repo", subdir?, ref?}` returns sorted full text/path items, truncation flags and resolved_ref. Prefer a 40-character commit SHA. A branch name remains mutable. |
| POST | `/api/embed` | `{texts:string[],source?}` returns 768-D document vectors, model, preprocessing metadata, full-content SHA256, chunk counts/coverage and cache hits |
| POST | `/api/map` | exactly one of `{texts}` or `{vectors}`, plus names, labels?, d?, seed?, threshold?, K?, T?, baseline_id?, persist? |
| GET | `/api/maps` | stored map metrics |
| GET | `/api/maps/:id` | complete stored MapResult |
| POST | `/api/maps/compare` | `{before_id,after_id}`; conflicts return 409 |
| DELETE | `/api/maps/:id` | delete one saved map; explicit user authorization required |
| POST | `/api/map/control` | `{baseline_id, texts, names, n_controls?, control_seed?}` (the EXACT baseline corpus) — CutPaste-style positive control: n seeded splice CHANGEs measured through the preview path on the frozen frame; writes nothing; recipe fixed |
| POST | `/api/outcomes` | `{baseline_id, target, predicted_delta?, after_id? \| observed_delta?, task_check:{verdict,verifier,notes?}, supersedes?}` — append-only pre-registration ledger row (201) |
| POST | `/api/map/axis-redundancy` | `{map_id, K?, null_seed?}` — per-axis leave-one-out predictability of bit j from the other bits, run against K draws of the fixed-margin null; exclusion-only verdicts; `admitted:false` always; no embedding, nothing written |
| POST | `/api/map/admission` | `{map_id, K?, null_seed?}` — unified membership trials for rayleigh, axis trial, spectra shares and radius I(r) grid; `summary` of four computed admissions with `criteria`/`why_not` per block; read-only |
| POST | `/api/map/azimuth` | `{map_id, variant?: binary\|continuous, K?: 2..400, null_seed?, modes?}` — rotation/reflection-invariant Rayleigh Z_m (m=2,3,4,6,12) + largest gap, refit-per-null, Holm-corrected two-sided tails; binary variant carries an atomicity control (dedup + m=1 audit); `admitted:false` always |
| POST | `/api/map/rayleigh` | `{map_id, K?, null_seed?}` — isolation-graph components/isolates (exact), Fiedler λ₂ of the largest component with an exact rational Rayleigh–Ritz cut witness, fixed-margin null tails; echoes the map's Ky Fan frame gap. Read-only; `admitted:false` |
| POST | `/api/map/consistency` | `{baseline_id, texts, names, target, variants:[{label,text}] (1..3), predicted_delta?}` — one candidate measured under caller-supplied text variants on the frozen frame; sign agreement reported, never used as a gate; nothing written |
| GET | `/api/outcomes?baseline_id=` | ledger rows plus a contingency of COUNTS with n; never a rate |
| POST | `/api/vector/search` | existing cosine search; its historical index may mix prefix and pooled-document representations; scores are not calibrated across ingestion versions |
| GET | `/map/` | browser view, full-file uploads, frozen baseline selector, comparison panel |
| GET | `/map/pointmap.js` | identical dependency-free numeric core used by Worker |

Legacy `/api/assess`, `/api/fits`, `/api/narrate` and site chat remain separate APIs. The Sauna-hosted mirror has not received this Cloudflare release.

## Full-content ingestion

`chunked/v1` uses `@cf/baai/bge-base-en-v1.5`, explicit mean pooling, contiguous Unicode-safe chunks of at most 400 UTF-8 bytes, byte-length-weighted mean over chunk vectors, then L2 normalization. Every input byte is submitted, including content after character 2,000. Coverage is input coverage, not a claim that an embedding preserves all meaning.

The SHA256 cache key includes the complete content, model, dimension, pooling, chunk size and aggregation/version. No raw document text is placed in the embedding cache. Vectorize metadata continues to hold bounded text snippets as in the existing service. Existing public map storage is shared; do not submit secrets or private customer data.

Limits (limits/2): 10..4000 items per map/preview/control/consistency; 1..4000 documents per embed and per `/api/repo-items` result; each document at most 200,000 JavaScript UTF-16 code units; 40,000,000 total UTF-8 bytes and 120,000 chunks per request; JSON body cap 64 MiB. Per-request **uncached** work is bounded separately: at most 1,000 uncached documents / 12,000 uncached chunks per request (413 with `uncached_docs`/`uncached_chunks` counts). Warm the content-hash cache with `POST /api/embed {texts}` in batches of at most 400 documents, then repeat the original request; cached documents cost no model work. Stored maps above 1.9 MB are kept in KV overflow (`map-json:<id>`) behind a small D1 pointer; reads are identical. The axis trial is limited to N <= 1200. Numeric vectors must be rectangular, finite, D=2..768. Defaults d=9, seed=20260906, threshold=median, K=40, T=0.05. K must be an integer 2..40 on the Worker; local core permits up to 200. T must be positive. Seed 0 is valid. Empty, oversized, malformed or misaligned inputs fail explicitly. Truncated repo files must be resolved before mapping.

## Frozen-baseline loop

```js
const a = await post('/api/map', {
  texts, names, labels: names, d: 9, seed: 20260906,
  threshold: 'median', K: 40, T: 0.05
});
// Edit one document locally. Preserve its exact name and all untouched documents.
const b = await post('/api/map', {
  texts: editedTexts, names, baseline_id: a.id
});
console.log(b.comparison);
```

`baseline_id` inherits the complete numeric frame and settings. It freezes input PCA means/axes/thresholds and binary placement means/scales/PCA/lift. Unchanged vectors therefore have exactly unchanged positions. Do not independently reduce embeddings between runs. Full 768-D vectors are accepted directly.

- `frame_id`: complete fitted numerical frame fingerprint; `rule_hash` is its compatibility alias.
- `instrument_id`: version, dimension, seed, threshold, K, T, steps and ingestion protocol fingerprint.
- `run_fingerprint`: input vectors and named row order on that frame.
- Hashes in the numeric core are deterministic noncryptographic fingerprints. Document SHA256 lives in embedding metadata.

Matching settings alone does not make separately refitted coordinates comparable. A changed `run_fingerprint` is normal for an edit; a frame/instrument conflict stops comparison. v0.1 maps lack stored frames and must be rebaselined. Same-name CHANGE comparisons are supported; a different name set is returned as not-tested rather than given a fabricated matched-item effect. Local callers can pass the full `frame` to `PM.runMap` and call `PM.compareMaps` directly.

## Reading recommendations

`ladder_candidates.rungs` contains synthetic, atomic one-row additions or one-bit changes. Predictions use the frozen placement. Ranking is lexicographic: isolated delta ascending, occupied-sector delta descending. Its display score is minus isolated delta. Pole movement carries no quality credit. No deletion is recommended or executed.

Sectors 1..12 are anonymous geometry. The twelve NSS axes are an explicitly **unvalidated lens dictionary**; azimuth does not establish that a document lacks Calibration, Inputs, or any other named property. Each prompt names literal paths/exemplars, asks for a source-grounded inspection, and requires an independent content/task check. A geometric neighbour is not authority for adding claims.

1. Select a hypothesis and inspect the named source and exemplars.

2. State a concrete factual defect and pre-register its task check. Decline edits that merely pad vocabulary, duplicate files, remove unique evidence, or erase negatives.

3. Apply one real text edit locally, then map it with the frozen baseline.

4. Read changed_names, per_name displacement, bits_changed_total and unchanged_anchors. Zero bit movement can mean quantization, not failed ingestion; check full-content hashes too.

5. Run the independent task check unchanged. Keep only if that check passes without regressions. Geometry alone cannot authorize keeping, reverting, or deleting.

An exhausted generated ladder means candidate exhaustion under this generator, not a proof of optimality or a global fixpoint.

## Certificates and null scope

Actual identity failures halt the computation before storage. The gate identity is `(V2 >= 0.4) iff (2/V2 <= 5)`: both sides may be false while the identity remains true. The rank gate itself is a measurement. V2 is trace-normalized; degenerate zero trace is reported without a significance claim.

The null is now a fixed-attempt symmetric checkerboard-switch chain with self-loops, preserving every row and column margin. It is not the full Curveball algorithm. Stopping after accepted swaps biases the sampled law; failed proposals must consume steps. Finite mixing is not established by margin conservation or Lean's conditional stationary-law theorem.

Null output includes empirical tail estimates and their finite resolution, SD admission, descriptive z and exclusion-only wording. K=40 cannot resolve tails below 1/41. Do not translate z to Gaussian significance or treat these small-chain estimates as a calibrated discovery threshold. MH detailed balance is checked analytically; empirical flux is a separate measurement.

## Raman/infrared research boundary

The spectra card reports SH degree shares, even/odd blocks, rank-0+2/rank-1 blocks and heat eigenvalues `l(l+1)`. These are diagnostic shape summaries, explicitly not admitted as new scientific coordinates. No dipole derivative, polarizability tensor, response kernel, physical frequency, lifetime or temperature is measured. Raman/IR selection rules need those observables and a matched null before use; no new physics term enters wayfinder ranking.

Preserve recorded negatives from the papers and bridges: A1 admission failed, Gaunt coupling was negative, FCS factorization was not identifiable, uniform Pennes loss cancels from admitted ratios, and the margin-clean second-branch test excluded it. A successful Lean CI run reproduces identities and seeded checks; it does not prove semantic edit quality.

## Math diagnostics and candidate preview (wayfinder-math)

The geometric instrument remains `pointmap/0.2`. Additional diagnostics do not change its frozen frames, bit assignments, sector geometry, null calculations or rung ranking. Existing v0.2 text baselines remain usable.

**Proof scope:** `papers/data/lean/WayfinderBounds.lean` contains 11 core-Lean 4.33.0 theorems for strict threshold inequalities and exact ADD/CHANGE isolation ledgers. CI compiles them and checks the printed axioms against `wayfinder-scope.json`. These integer/count theorems do not certify floating-point arithmetic, adequate perturbation bounds, statistical significance, forecasts or task quality. Runtime adjacency construction and unchanged-anchor correspondence are checked separately.

`map.math_diagnostics` reports signed margins in score units, distances to the threshold, bit values and conditional stability states. Per-axis thresholds and norms are shared under `axes`; per-input margins are under `per_input`. Without a numerical error bound the state is `needs-roundoff-bound`. Optional `perturbation_linf >= 0` and `roundoff_budget > 0` are caller-supplied, unverified assumptions. Any returned `stable-on`/`stable-off` state is conditional, never a certified floating-point or probabilistic guarantee. A near threshold state is `undetermined`, not a prediction that a text edit will flip the bit.

### Preview an actual candidate before applying it

`POST /api/map/preview` accepts the **full resulting corpus**, not only the candidate:

```json
{
  "baseline_id": 123,
  "texts": ["every unchanged original document", "the edited or added document"],
  "names": ["docs/original.md", "docs/candidate.md"],
  "target": { "action": "change", "name": "docs/candidate.md" },
  "predicted_delta": -1
}
```

The two-row example shows the schema only; a real request needs 10..400 rows. Use `action: "add"` for exactly one new name or `"change"` for one existing name. An unchanged target is accepted as an explicit no-op. Every non-target source SHA256 must match the baseline. Deletions, two changed sources, missing names, stale content and conflicting frame/settings are rejected before embedding.

Pass **no** d, K, T, seed, frame, steps, threshold, ideal, preprocessing_id, labels, vectors or persist field to preview; it inherits the baseline instrument. `predicted_delta` is optional and finite. Diagnostic budgets are optional. The baseline must contain v0.2 full-precision points and chunked/v1 source hashes; otherwise create a new text baseline.

The response includes `preview: true`, `persisted: false`, an ephemeral `map`, `math_ledger`, target margins, source hashes and unchanged-anchor counts. It never creates a map row, modifies a repository or writes Vectorize. The existing content-hash embedding cache may be updated. A storage outage returns 503; stale sources/anchors return 409; invalid shapes/budgets return 422.

### Read the exact local ledger

For ADD:

`delta(isolated) = indicator(new degree == 0) - previously isolated neighbours touched`.

For CHANGE, each neighbour's new degree is `old degree - old edge + new edge`, and the isolation ledger sums the zero-degree indicator differences plus the moved point's own indicator change. The ledger names the actual neighbours. It requires one added or moved point and an unchanged surrounding graph. Arithmetic disagreement with an independent recount halts the result; unsupported multi-item transitions are `not-applicable`.

`math_ledger.reduction.ratio` is observed reduction / predicted reduction, only when the prediction is a strict decrease. Zero or positive predicted deltas are ineligible. This ratio describes the geometric model; it is neither calibrated confidence nor semantic quality.

The UI's **Use as baseline** button retains the exact submitted text corpus in memory. Its candidate panel can preview one ADD or CHANGE without overwriting that baseline. Reloading clears this in-browser corpus, so create a fresh saved text baseline before using the panel again. The map prompt includes preview instructions; the homepage **Copy agent guide** button copies a concise introduction prompt directing the receiving agent to read this file as the source of truth.

Stored diagnostics use a lossless tuple encoding to stay within D1's row limit. Public reads decode the same object schema; frames and numbers are unchanged. An oversized stored result fails explicitly, with `persist:false` available for an ephemeral ordinary map.

**Evidence boundary:** the exact ledger replays all ten historical PR 230 transitions, including three silent CHANGE operations and three neutral ADD operations. This is retrospective verification. It does not turn the historical 4/10 sign agreement into a 10/10 forecast result. Independent factual/task grading still governs whether a candidate should be kept.

## Radius diagnostics (radius)

The canonical isolation radius stays **0.095**. The pointmap/0.2 frame, hashes, coordinates, existing ledger and rung ranking are unchanged. Radius diagnostics describe the existing full-precision coordinates; they never select a different operative metric.

`map.radius_profile` is included in new map/preview responses. Stored-map GETs can compute it without embedding or writing a row; a legacy record that cannot be enriched stays readable and carries an explicit `radius_profile_unavailable` reason. `radius_comparison` accompanies baseline map/preview results. The existing same-name `/api/maps/compare` response includes it inside `comparison`. Existing same-name restrictions remain; use candidate preview for a single ADD.

The fixed display grid is `[0.075,0.085,0.095,0.105,0.115]`. Profile fields include:

- `per_item`: literal name, nearest neighbour name, tie count, clearance and canonical isolated state;
- `samples`: radius, I(r), isolated fraction, clipped area S_R and S_R/N;
- `bounds`: optional coordinate/error assumptions, always `validated:false` and `certified:false`;
- `canonical_radius`, `frame_id`, `instrument_id`, version and scope.

For nearest-neighbour clearance c_i, strict graph edges d<r imply `I(r)=sum_i indicator(r<=c_i)`. A tie remains isolated. `S_R=integral_0^R I(r)dr=sum_i min(R,c_i)`. The area has chord-distance-times-count units; it is not free energy or a quality score. Compare profiles only on the same frozen frame/instrument and report N alongside totals.

`radius_comparison` reports the fixed-grid before/after/delta counts and maximal `exact_delta_interval` and `same_sign_interval` around 0.095 within chord-radius domain [0,2]. Endpoints carry `lower_closed`/`upper_closed` flags and named boundary witnesses. At most eight witnesses are displayed per endpoint, with `total` and `shown`; path strings are not truncated. A domain endpoint is marked explicitly. Cells are evaluated at their right endpoint to preserve strict-threshold ties, including adjacent representable floating-point values.

These are parameter-stability intervals with respect to the computed distances, not statistical confidence intervals or pre-edit forecasts. Preview has already embedded the actual candidate, but still writes no repository, saved map or Vectorize entry. The existing embedding cache may change.

Optional API diagnostics: `coordinate_epsilon >= 0` bounds each point's displacement in 3-D chord units; `distance_error_bound > 0` is a caller-supplied bound on remaining distance/comparison error. They are distinct from the existing embedding-coordinate `perturbation_linf` and `roundoff_budget`. Both must be supplied before a conditional radius-stability state is emitted. Missing assumptions produce `needs-coordinate-bound` or `needs-error-bound`; insufficient clearance produces `undetermined`. Supplied bounds are not independently validated, and no state is a certified floating-point or probabilistic guarantee. Negative, zero error, non-finite or overflowing budgets are rejected before model work.

Inputs named `radius`, `canonical_radius`, `isolation_radius`, `radii` or `radius_grid` are rejected: the grid is fixed and diagnostic-only. Do not optimize or reselect it based on the observed result.

The core-Lean `RadiusBounds.lean` obligations and printed-axiom/scope checks accompany the runtime module. Integer order/count lemmas do not prove Float64 distances, actual displacement bounds or scientific admission. Continuous clipped area remains a runtime-derived identity, not a newly kernel-proved real integral.

A degree-preserving graph null fixes the number of degree-zero vertices, so it is degenerate for I(r0). The exploratory radius-null probes do not admit a new ranking statistic. Existing GL phase-transition negatives remain in force; the corrected equal-coefficient CGLE energy identity does not change that.

The homepage Copy agent guide button continues to copy a **short introduction prompt referencing AGENT.md** as the source of truth. Its behavior is unchanged.

## Positive control (calibration)

The instrument is `pointmap/0.2`, unchanged. `POST /api/map/control` adds the one reference the wayfinder never had: a **known signal**. The stored checkerboard null randomizes bit margins and states the false-alarm side; nothing stated how the frozen isolation/displacement statistics respond to a content change of known size. Following CutPaste (Li, Sohn, Yoon, Pfister, CVPR 2021) and the is-this-x standard-candle discipline, the route cuts a contiguous donor segment into the middle 25% of a host document and measures each splice as an ordinary one-name CHANGE through `/api/map/preview` on the baseline frame.

```json
{ "baseline_id": 123, "texts": ["...every baseline document, byte-identical..."], "names": ["..."], "n_controls": 6, "control_seed": 20260917 }
```

- The corpus must equal the baseline exactly: every name present, every SHA256 equal, no extra names; otherwise 409 with the changed/added/missing names. Nothing is embedded before that gate passes.
- The recipe is fixed: generator `cutpaste-splice`, splice fraction 0.25, centered window, same-length donor segment (whole donor if shorter), surrogate pairs never split. `splice_fraction`, `window`, `hosts`, `donors` and similar keys are rejected (422); instrument settings are rejected (409). `n_controls` (2..6 per request, default 4; use distinct `control_seed`s for more) and `control_seed` are the only knobs and both are echoed, so a control cannot be tuned to the result it produces.
- Per control: host, donor, splice offsets, before/synthetic SHA256, `isolated_delta` (comparison) and `ledger_actual_delta` (exact ledger, must agree), `bits_changed`, geodesic/chord displacement, `quantization_silent`, `occupied_sectors_delta`, `unchanged_anchor_count`, frame/instrument ids.
- `summary`: counts by sign of `isolated_delta`, min/median/max of |Δisolated|, displacement and bits changed, `bits_moved_count`, `quantization_silent_count`, all with `n_measured`. `baseline_reference.null` echoes K/E0/SD0/p_resolution of the stored null. `no_change_reference` is the identity (a byte-identical CHANGE moves nothing).
- Side effects: none beyond the disclosed embedding cache. `persisted:false`, `task_verdict:"not-applicable"`.

Reading: a splice that moves zero bits on this frame says the instrument is quantization-silent at that content size for that document; a splice that changes the isolated count says the statistic responds to known-different content. Neither says anything about task quality, and no admitted coordinate, ranking term or keep/revert rule follows. Compare controls only on the same `frame_id`/`instrument_id`; report n with every count. The same summary on a different corpus is a different instrument reading, not a benchmark.

## Outcome ledger (outcomes)

Every count the wayfinder has ever reported ("2 kept, 5 reverted, 1 declined", "4/10 sign agreement") lived in prose. `POST /api/outcomes` gives them a typed, append-only home and, following business-metric-aware forecasting and the COVID public-forecast discipline, separates the **prediction** (frozen before the check) from the **decision outcome** (the independent verifier's verdict).

Two-phase use:

```json
POST /api/outcomes  { "baseline_id": 123, "target": {"action":"change","name":"refs/x.md"}, "predicted_delta": -1, "task_check": {"verdict":"pending","verifier":"human reviewer"} }
POST /api/outcomes  { "baseline_id": 123, "target": {"action":"change","name":"refs/x.md"}, "predicted_delta": -1, "after_id": 124, "supersedes": 7, "task_check": {"verdict":"reverted","verifier":"human reviewer","notes":"content check failed"} }
```

- Verdicts: `pending`, `kept`, `reverted`, `declined`, `abstained`, `neutral`. `verifier` names the independent checker; `geometry` is refused for any non-pending verdict.
- With `after_id` the server recomputes the observed isolated delta with `PM.explainTransition` on the frozen frame (409 if frames differ or the transition moves a different name) and stores `observed_source:"server:explainTransition"`. A caller-supplied `observed_delta` is stored as `observed_source:"caller"`; the two are never mixed in one row. A row with neither records a prediction only.
- Append-only: no PUT, PATCH or DELETE (405). A correction is a new row whose `supersedes` points at the earlier row (same baseline and target); both stay visible. A row that arrives with prediction and non-pending verdict together is stored with `preregistered:false`.
- `score`, `quality`, `success_rate`, `rate`, `confidence`, `z` are rejected as inputs.
- `GET /api/outcomes?baseline_id=` returns rows and a `contingency` of counts: `n_rows`, `n_pending`, `n_superseded`, `n_effective`, `n_preregistered`, `n_sign_comparable`, `sign_exact_count`, `by_verdict`, `predicted_sign_by_observed_sign`, `verdict_by_sign_exact`, `observed_source_counts`. No rate, percentage or z is computed. A sign-exact geometric prediction is an instrumentation outcome; a kept verdict does not imply the geometry predicted it. The historical 4/10 figure stays a historical count.

Existing stored map rows, frames, ledgers, radius diagnostics and the `/map/` UI are unchanged by both additions. `GET /api/health` now lists the diagnostic module versions.

## Axis redundancy trial (axis-trial)

`POST /api/map/axis-redundancy {map_id, K?, null_seed?}` executes the membership condition for one candidate per-axis statistic instead of leaving it unstated. Following TabNet's masked-feature pretraining (Arik & Pfister, AAAI 2021), the statistic `loo-nn-vote` predicts each document's bit j from its other d−1 bits by a leave-one-out nearest-neighbour vote (Hamming distance on the remaining axes; ties count 0.5). The same statistic is then computed on K draws of the existing fixed-attempt checkerboard chain (`PM._internal.nullDraw`, every row and column margin preserved; a distinct seed, `map.seed XOR 0x5bd1e995` by default, so the trial chain is not the map's own V2 chain).

Because column margins are fixed under the null, the majority baseline of every axis is identical between observed and null; `observed_minus_margin_baseline` and the null comparison measure inter-axis dependence beyond margins, per axis. Output per axis: `observed_hits`, `observed_ties`, `margin_baseline_hits`, null `{K, mean, sd, min, max, degenerate}`, `z_descriptive` (null when the null is degenerate), plus-one two-sided `p_two_sided` with `p_resolution = 1/(K+1)`, `direction`, and an exclusion-only `verdict`: `excluded-from-fixed-margin-null`, `not-excluded`, or `null-degenerate: no trial possible on this corpus`. A `total` block sums over axes; `counts` tallies verdicts; `margins_preserved` certifies the chain.

`admitted` is hard-coded `false`. Admission of a coordinate is a paper-level decision recorded in `refs/` after trials on more than one corpus; one response never flips it. The statistic never enters rung ranking, sector geometry or any recommendation; `weights`, `importance`, `rank`, `admit` and instrument keys are rejected. No embedding runs, nothing is written. K must be an integer 2..40 (defaults to the map's K); K=40 cannot resolve tails below 1/41, and an "excluded" verdict at that resolution is a small-chain observation, not a discovery threshold.

## Perturbation consistency (consistency)

`POST /api/map/consistency` measures ONE candidate edit under several caller-supplied text variants on the same frozen frame and reports whether the geometric reading agrees. FixMatch and UDA trust a pseudo-label only when the model's reading is stable between a weak and a strong augmentation of the same input; the wayfinder has no labels and no trainable model, so only the diagnostic half transplants.

```json
{ "baseline_id": 123, "texts": ["...full resulting corpus with the primary candidate..."], "names": ["..."],
  "target": { "action": "change", "name": "refs/x.md" },
  "variants": [ { "label": "weak", "text": "...minor rephrasing..." }, { "label": "strong", "text": "...different wording, same intent..." } ],
  "predicted_delta": -1 }
```

- The API never generates variants (there is no canonical text augmentation, and a server-made one would be tuned to the instrument). 1..3 variants, unique labels (`primary` reserved), echoed by SHA256. `augment`, `generate_variants`, `gate`, `strength` are rejected; instrument keys are rejected (409).
- Every measurement runs through `/api/map/preview`, inheriting the exact-source-hash checks, anchor verification and no-persist discipline. A variant equal to the baseline source is an explicit no-op measurement; identical variants are flagged as adding no evidence.
- `measurements[]` carry label, sha256, `isolated_delta`/`isolated_sign`, ledger delta, bits changed, displacement, quantization-silent, anchors. `consistency` reports `signs`, `sign_set`, `all_same_sign`, `delta_min/max/spread`, `bits_moved_count`, `quantization_silent_count`, `noop_count`, and `sign_exact_count` against `predicted_delta` when supplied. No consensus delta or score is computed.

Reading: agreement means the isolated-delta sign is not sensitive to those phrasings; disagreement means the reading is perturbation-sensitive and should be treated as undetermined for planning. Neither outcome authorizes keeping, reverting or deleting; the independent task check still governs, and `task_verdict` stays `not-tested`.

## Azimuth trials (azimuth)

`POST /api/map/azimuth {map_id, variant?: "binary"|"continuous", K?: 2..400, null_seed?, modes?}` tests the placement-plane angle φ = atan2(PC2, PC1) with bin-free, rotation/reflection-invariant statistics: Rayleigh Z_m = N·|mean(e^{imφ})|² for m ∈ {2,3,4,6,12} and the largest circular gap. Every null draw **refits PCA2** (reusing the observed frame would test the frame, not angle). Binary variant: fixed-margin checkerboard null, plus an atomicity control (deduplicated distinct-pattern angles, an m=1 audit, and the null dedup-size support — on the 301×24 fixture the observed 167 distinct patterns lie OUTSIDE the null support 209..245, so no size-matched de-atomized null exists). Continuous variant: caller supplies the raw input vectors (verified against the stored `keys` fingerprints); null = independent per-column shuffle. m=1 is structurally confounded (PCA scores are mean-centered, so the radius-weighted first moment is identically zero; unweighted Z₁ measures radial/multiplicity reweighting) and is returned only as `atomicity.m1_audit`, never as a mode. Default K = 240: exclusion is arithmetically reachable only at K ≥ 239 (min Holm p = |family|·2/(K+1); below that a `not-excluded` is a power statement and the verdict reads `unresolvable-at-this-K`, with `power_floor` attached per row). Multiplicity: two-sided plus-one empirical tails + Holm over the requested family, with per-seed reproducibility and flips reported, never averaged.

**`admitted:false` always for azimuth.** Binary placement lacks a size-matched de-atomized fixed-margin null; the continuous column-shuffle null destroys all inter-column dependence and is intentionally over-strong (not-exclusion under it is uninformative). Sector numbers stay opaque display labels: the sector index is gauge-dependent (its origin is arbitrary under rotation), which alone bars it as a statistic; the argument does not rest on degeneracy. The trial output carries `placement_eigengap` as a diagnostic: (λ1−λ2)/λ1 measures how nearly degenerate the top-2 eigenplane is and (λ2−λ3)/λ2 the Davis–Kahan subspace stability. On the reference fixture the binary placement's rel_gap_12 is 0.0686, at its fixed-margin null median (0.0692) — ordinary; the continuous z-scored placement is near-degenerate (rel_gap_12 0.0205, below the shuffled-null median 0.0631, with rel_gap_23 0.0042), which is the measurement behind the statement that the continuous null is wide. Diagnostic only; it licenses nothing. The powered Möbius lens path is deferred: it requires continuous placement, a selection null optimizing every null draw, a predeclared stopping rule and an anti-caustic condition cap. `papers/data/lean/AzimuthBounds.lean` proves the integer identities (|z|² ≥ 0, D₄ gauge invariance: negation/conjugation/swap/quarter-rotation, order-independence of the moment sum, replicate scaling: duplicating every row k times scales the moment by k and |moment|² by k² — the formal atomicity statement); full SO(2) rotation, GL(2) rescaling, null distributions and Float behaviour are stated non-claims.

## Rung identity and placement (placement)

Every ladder rung carries `rung_key` (`add:s<sector>:<pattern bits>` or `change:<name>:bit<k>`), `joins` (the currently-isolated items that stop being isolated under the synthetic move; empty when the prediction is the new row's own isolation status), `creates_isolate` (ADD), `target_pattern` (CHANGE) and `joins_note`. The ranking, deltas, exemplars and every historical field are unchanged; these fields are additive and `frame_id`/`instrument_id` do not include them.

`POST /api/map/preview` accepts an optional `rung` (the rung object, or `{pattern, sector, joins, flip_bit, rung_key, delta}`) and always returns `placement`: `achieved_bits`, `achieved_sector`, `degree`, `neighbours`, `target_isolated`, `deisolated_items`, `newly_isolated_items` (CHANGE adds `previous_bits`, `bits_flipped`, `previous_sector`). With a rung it adds `hamming_to_pattern`, `landed` (`on-pattern` / `near-pattern` ≤2 / `missed-pattern`), `sector_match`, `joins_realised`/`joins_missed`, `flip_realised`, `predicted_isolated_delta` vs `actual_isolated_delta` with `sign_exact`, and a `verdict` (`realised` / `partial` / `missed`). `POST /api/map` with `baseline_id` returns the same `placement` block for a single ADD (where `comparison` is name-set incomparable) or a single CHANGE. A rung pattern of the wrong width is 422. Placement is achieved geometry on the frozen frame; `realised` is an instrumentation outcome, not a quality statement, and `missed` does not authorize reverting.

## Rayleigh diagnostics (rayleigh)

Two places where Rayleigh's variational principle already lives inside the instrument, made explicit. **Graph:** the isolation graph (chord < 0.095) has Laplacian quadratic form xᵀLx = Σ_edges (x_i−x_j)²; isolates are size-1 components; `POST /api/map/rayleigh` reports exact BFS components and isolates, the Fiedler value λ₂ of the largest component (float, power iteration) next to the **exact rational Rayleigh–Ritz witness** R = n·cut(S)/(|S|(n−|S|)) of the Fiedler sign cut (`bound_holds` checks λ₂ ≤ R), and K fixed-margin null draws with plus-one tails and exclusion-only verdicts for components/isolates/largest/λ₂/edges. **Frame:** every `/api/map` response carries `map.rayleigh_frame`: by Ky Fan, tr(XᵀCX) ≤ λ₁+λ₂ for the two frozen axes X on the current covariance C, so `gap ≥ 0` exactly; it is ≈0 on the baseline corpus and grows as a chain drifts. Read it as frame adequacy, not quality; a large gap is the honest signal that a new baseline is warranted, and it never refits anything. **Admission is computed, not hard-coded.** `admitted` on `/api/map/rayleigh` is `true` only when, on that frame: every null is non-degenerate; every exclusion verdict reproduces under a second independent null seed (`admission.seeds`); the float λ₂ respects the exact Rayleigh–Ritz witness (`bound_holds`); the Ky Fan gap is non-negative when a frame gap is present; and N ≥ 100 (a K-draw tail has no resolution below that). `admission.criteria` and `admission.why_not` are always returned. Admission licenses exactly one thing: quoting the five graph statistics as instrument readings on that frame with their tails. It is not a ranking term, not a radius change, not a keep/revert rule, and it does not transfer to another frame. First executed trials (2026-09-19): refs/ 431 `true` (all five statistics not-excluded from the null), skills/ 81 and 326 `true` (structure excluded from the null), refs/ 78 `true`, docs/ 296 `false` ("N < 100"). Record: `refs/rayleigh-admission-trial-2026-09-19.md`; round: `refs/wayfinder-round13-results-2026-09-19.md`. Rayleigh's inviscid stability equation and Rayleigh–Plesset do not fit (no flow field, real analysis) and are not used. `papers/data/lean/RayleighBounds.lean` proves the integer/rational identities (PSD, kernel of constants and isolates, indicator = cut, witness numerator/denominator); nullity = #components, Ky Fan and the float λ₂ are stated non-claims. Position in the flow: baseline → control → **`POST /api/map/admission`** (rayleigh, axis trial, spectra shares, radius I(r) grid in one call) → cycles → admission again at round close.

**Unified admission (admission).** Every diagnostic the instrument once marked `admitted:false` now gets the same trial: two independent fixed-margin null seeds, every null non-degenerate, every exclusion verdict reproducible across the seeds, exact identities holding (`bound_holds`, shares summing to one, canonical count matching the map), N ≥ 100. `/api/map/axis-redundancy` computes its own admission the same way. **Permanently not admitted, by construction:** physical (Raman/IR, dipole, polarizability, lifetime, temperature) readings of the spectra card, the heat eigenvalues l(l+1) (constants), the caller-supplied radius robustness bounds (`validated:false, certified:false` stay), and any use of an admitted statistic as a ranking term, radius or keep/revert rule. The spectra card's own `admitted:false` denies homology/physics and stays; the *statistical* admission of its shares lives in the unified call. First trials (2026-09-19, `refs/admission-trials-2026-09-19.md`): refs/ 436 admitted on all four; refs/ 431 refused axis (one verdict flipped between seeds); refs/ 78 refused axis, spectra and radius (flips); skills/ 81 refused radius (I(0.115) flipped); docs/ 296 refused all (N < 100). Research record: `refs/rayleigh-integration-research-2026-09-18.md`.

Also on `/api/map` with `baseline_id`: `transition: {max_changed_names?, max_added?, max_removed?}` declares the single transition the caller intends; a corpus that differs from the baseline by more is **409 with the offending names and `persisted:false`** (round-8 lesson). `GET /api/outcomes?frame_id=<frame>` gathers every ledger row across a chained round's baselines (round-11 lesson).

## Lessons learned (2026-09-17 session: four transplants, limits/2, refs round 4, skills round 1)

Process and bootstrapping rules distilled from one day of operating this instrument end to end. Each one cost something to learn; treat them as part of the contract.

### Bootstrapping a round

1. **Pin the corpus to a 40-character commit SHA** and fetch it with `/api/repo-items` (`subdir`, `ref`). Drop empty files (`.gitkeep`) before mapping; the baseline's `names` is the frozen name set for the whole round.

2. **Warm the embedding cache first.** `POST /api/embed {texts}` in batches of at most 400 documents (100 is comfortable: 495 skills documents took 5 batches, ~61 s). Only then `POST /api/map`. A cold `/api/map` on a large corpus either exceeds the per-request uncached budget (413) or the Worker's CPU budget.

3. **Verify the baseline hash-matches your local copy** before editing anything: compare each `embedding_metadata.docs[i].sha256` to `sha256(local file)`. A mismatch means the after-map will silently become a two-transition corpus.

4. **Chain `baseline_id`** cycle to cycle (81 → 83 → 84 …). The frame stays frozen; each after-map compares against the previous one. Never refit between cycles.

5. **After-maps must use the exact baseline name set.** Building the corpus from the local tree instead of the baseline's `names` produced a stray map (82) with five extra files and an incomparable comparison. Read `names` from the baseline and only replace the target's text.

6. **Write the independent task check before looking at any rung**, and freeze it. `skillcheck.sh` (mojibake, duplicate H2, TODO placeholders, skill-format frontmatter, template capability paragraphs, local links) and `taskcheck.sh` for refs/ were written first, run FAIL-before / PASS-after, and rerun unchanged on the committed file. Geometry is recorded next to the verdict; it never produces one.

### Running cycles

7. **Pre-register before editing.** `POST /api/outcomes` with verdict `pending` and the rung's `predicted_delta`; append the verdict row with `supersedes`. `verifier` is at most 200 characters (a 422 here made one geometry measurement land before its check row; the row says so).

8. **Prefer a deterministic fixer over judgment edits.** Every kept edit this session was mechanical: fix mojibake, decode a base64-committed body, cut an over-long description at a sentence boundary and move the remainder verbatim into the body, replace a false template paragraph with a dated coverage note, merge duplicate sections keeping all non-duplicate text. If the fixer cannot reach PASS, revert and record `declined`; do not hand-edit to make geometry move.

9. **Execute ADD rungs as real documents, never as stubs, and never decline them by policy.** (The earlier version of this rule, "decline ADD rungs", was wrong and produced round 5: 100 cycles that never used a rung.) An ADD rung now names the isolated item(s) it would join (`joins`), the exact target `pattern`, and a stable `rung_key`. Read the join target and the exemplars, write a document with real, verifiable content that belongs next to them, then `POST /api/map/preview` with `action:"add"` and the rung in `rung`; read `placement.rung.landed`, `sector_match`, `joins_realised`, `verdict`. `realised` or `partial` → run the independent task check and commit; `missed` → revise toward `joins_missed` or record the rung as content-resistant. One attempt per `rung_key` per chain: a missed rung is not a fresh proposal, and a second file for the same sector is padding. The frozen task check still gates every commit; geometry chooses where, the writer supplies what.

10. **Expect ladder exhaustion.** The generator returns five rungs; the skills round ran out of distinct CHANGE targets at cycle 6. AGENT.md's wording holds: exhaustion under this generator is not optimality. The sanctioned fallback is the literal exemplars the rungs name, in ladder order, with `predicted_delta: null` (no geometric prediction exists for an exemplar).

11. **One file per commit, on a held branch, one draft PR per round.** Stack follow-up PRs on the round branch (the 82-file sweep, PR #240, stacks on round 1, PR #239) so a reviewer sees the instrument-named edits and the plain sweep separately.

12. **Positive controls before real edits.** `POST /api/map/control` (n ≤ 6 per request; use several seeds) gives the frame's response band for known-different content. On refs/ frame `d3289271…` twelve splices never reduced isolation; the one real edit that did (−2) is read against that band, not against nothing.

13. **Run the axis trial on every new baseline** and file the verdicts. On a 12-document map no axis is distinguishable from the null (no resolution); on 168–178-document maps 7–9 of 9 axes are. Neither number admits anything; both belong in the record.

### Reading results honestly

14. **Flat geometry is a result.** Six kept skills edits left the isolated count at 31 and were 0/4 sign-exact against predicted −1; four were quantization-silent. Report it as an instrument observation on that frame, not as failure of the edits or success of the instrument.

15. **The real backlog is usually outside the geometry.** The frozen check failed on 88 of 112 SKILL.md; the ladder named 10 and fixed 6. A plain sweep with the same check and fixer cleared the other 82 with no map involved. When a check reveals a corpus-wide defect class, sweep it in its own PR and say the instrument was not consulted.

16. **Counts only, with n.** Ledger contingencies, control summaries and axis trials never emit a rate, percentage or Gaussian tail. The historical 4/10 stays a historical count until prospective rows exist; the skills round added 4 comparable rows (0 exact) and 6 kept verdicts.

### Operating the Worker

17. **limits/2 walls and how to stay under them:** 4000 items; per-request uncached budget 1000 docs / 12k chunks (warm the cache); maps above 1.9 MB persist via KV overflow transparently; CPU budget 300 s (`limits.cpu_ms` in deploy metadata); `n_controls ≤ 6`; axis trial N ≤ 1200.

18. **Test bindings with a strict fake.** The first limits/2 deploy bound `map.classes` (an object) into D1 and every persist returned 500 for nine minutes while `persist:false` kept working. In-memory fakes accepted the object; a strict fake that rejects undefined/boolean/object bindings on a real `runMap` output now guards it.

19. **Deploy discipline:** re-download the live 13-module bundle, confirm every module still matches the last snapshot, replace only `index.js`, keep `main_module solar-entry.mjs` and `keep_bindings` for all binding types, then refresh SITE KV `AGENT.md` and `llms.txt`. Verify `/api/health` lists the expected module versions before using anything.

20. **Client access:** any HTTP client works if it sends a `User-Agent`; a bare urllib/fetch default UA is refused at the edge. Build the Worker in the sandbox with `ESBUILD_BINARY_PATH` pointing at the cached esbuild binary.

21. **Check every file class the corpus contains, not just the one the spec names.** The frontmatter check covered `SKILL.md`; 362 reference/script/test files under the same skills were committed as raw base64 and passed everything because no check looked at them. A whole-file base64 probe (C7) is now part of the check. When a defect class shows up in one file type, scan all blobs for it before declaring the corpus clean.

22. **A wayfinder round is a writing task with a geometric compass, not a lint sweep with a geometric label.** Rounds 5 and 6 (PRs #243, #244; reverted and closed) ran 100 cycles each with the skills lint fixer as the edit generator: 2 of 200 cycles carried a rung prediction, ADDs were 37-line templated notes, the same sector was re-added five times because nothing reported the miss. Round 3 (PR #232) authored real records from the rungs and was 5/8 sign-exact. If the driver is not reading `joins`/exemplars and writing content, stop the round; if the fixer is doing the editing, it is a sweep and belongs in its own PR with the instrument uninvolved.

### Corpus discipline

23. **The frozen check is the corpus's own format contract.** Round 12 (PR #251, skills/) used the SKILL.md specification itself — kebab-case `name`, `description` ≤ 1024 characters without literal `<`/`>`, H1 immediately after the frontmatter, `## Examples` and `## Guidelines` present — as the check, and authored each missing section from that skill's own body (its own workflow steps, its own MUST/NEVER rules). 9/112 → 112/112 compliant, content-additive, nothing removed. When a corpus has a published format (SKILL.md spec, ADR template, ALL-CAPS docs/ conventions, refs/ results-record family), that format is the check to freeze; generic lint classes are the fallback, not the first choice. Every edit and every ADD in a round must fit the corpus's format.

24. **Receipts live in `refs/`.** Round 10/11 results records were first written to `docs/` and moved by directive: `docs/` holds ALL-CAPS normative documents only; wayfinding results, drift records and censuses are dated records in `refs/`. A drift check produces a record in `refs/`, never an appended verification paragraph inside the checked document (round 11 appended one to all 22 docs; round 12 banned drift checks as an edit class).

25. **The committed tree is the only ground truth for the corpus.** Round 8's driver reloaded stale disk state after in-memory edits and built after-maps 188–192 against incomplete corpora; the round re-baselined and disclosed it. Rebuild texts from the branch commit before every after-map, hash-match them to the baseline, and declare the intended transition: `POST /api/map {baseline_id, transition:{max_changed_names:1, max_added:0, max_removed:0}}` now returns 409 with the offending names instead of a chained map on the wrong corpus.

26. **Version the check; disclose amendments in the ledger.** Round 7 found two checker defects (fenced code blocks, `../` links) at cycle 30 and amended the frozen check as v1.1 with a ledger note. Cheaper: run the check over the whole corpus and read a sample of failures before freezing. Keep scratch files and the results record outside the corpus root (a temp file tripped round 12's kebab-case check; a re-sync dropped the record).
### Reading the ledger by frame

27. **Read the ledger by frame.** A chained round spreads its rows over many `baseline_id`s; `GET /api/outcomes?baseline_id=` sees one link and reads as "zero rows" mid-round (round 11). Use `GET /api/outcomes?frame_id=<frozen frame>`.

28. **File the Rayleigh reading with the control and the axis trial.** `POST /api/map/rayleigh` on every baseline and at round close; watch `map.rayleigh_frame.gap_share_of_trace` along a chain. It is the one frame-adequacy number that is exact in sign; when it grows, say so in the results record and start the next round on a fresh baseline rather than chaining further.

### Instrument admission and prompts

29. **`admitted` is a computed verdict with its criteria attached, never a flag someone flips.** Round 13 (refs/, PR held) turned rayleigh's hard-coded `false` into a per-frame decision: non-degenerate null, seed-reproducible verdicts, exact witness bound, Ky Fan bound, N ≥ 100. It came out `true` on refs/ and skills/ baselines and `false` on the 21-document docs/ corpus for the stated reason. When a statistic's admission is wanted, add a criterion the response can evidence and let the instrument say so; write the trial as a record in `refs/`. Sign agreement and placement stay separate readings: round 13 cycle 4 was sign-exact (+1 predicted, +1 observed) and `partial` (the document isolated itself in the wrong sector) at the same time.

30. **Reproducibility across independent null seeds is the admission criterion that does the work.** In the first unified trials, non-degeneracy and N ≥ 100 passed almost everywhere; what refused admission on refs/ 431 (axis), refs/ 78 (axis, spectra, radius) and skills/ 81 (radius) was a single verdict flipping between two 40-draw chains. Report the flip, do not average it: a statistic whose exclusion depends on which draws you took is not yet a reading on that frame. Re-run with a larger K only if the resolution question is the point, and say so.

31. **Lead the prompt with the protected reading, label the adverse rungs, and point at the contract.** The rung prompt used to spend 58% of its characters on a frame recital that never varies and printed `occupied sectors +0` on every rung while omitting the pole gap, Δ, clearance and Hamming distance it had already computed. The geometric prompt (~1,785 chars/ladder vs ~4,506) leads with Δ (Lemma 1), states clearance as an achieved-geometry fact (never a forecast), labels adverse rungs `ADVERSE on this frame` without suppressing them, and points at `/AGENT.md` instead of restating it. A prompt that only asserts a prediction with a coin-flip track record is noise; one that reports frame readings is an instrument.

Tooling for the loop lives at `tools/skill-check/` (`skillcheck.sh`, `fixer.py`, `wayfinder-cycle.py`, README).
