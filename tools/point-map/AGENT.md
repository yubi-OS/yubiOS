# SOS AGENT: frozen-frame wayfinder v0.2

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
| POST | `/api/map/consistency` | `{baseline_id, texts, names, target, variants:[{label,text}] (1..3), predicted_delta?}` — one candidate measured under caller-supplied text variants on the frozen frame; sign agreement reported, never used as a gate; nothing written |
| GET | `/api/outcomes?baseline_id=` | ledger rows plus a contingency of COUNTS with n; never a rate |
| POST | `/api/vector/search` | existing cosine search; its historical index may mix prefix and pooled-document representations; scores are not calibrated across ingestion versions |
| GET | `/map/` | browser view, full-file uploads, frozen baseline selector, comparison panel |
| GET | `/map/pointmap.js` | identical dependency-free numeric core used by Worker |

Legacy `/api/assess`, `/api/fits`, `/api/narrate` and site chat remain separate APIs. The Sauna-hosted mirror has not received this Cloudflare release.

## Full-content ingestion

`chunked/v1` uses `@cf/baai/bge-base-en-v1.5`, explicit mean pooling, contiguous Unicode-safe chunks of at most 400 UTF-8 bytes, byte-length-weighted mean over chunk vectors, then L2 normalization. Every input byte is submitted, including content after character 2,000. Coverage is input coverage, not a claim that an embedding preserves all meaning.

The SHA256 cache key includes the complete content, model, dimension, pooling, chunk size and aggregation/version. No raw document text is placed in the embedding cache. Vectorize metadata continues to hold bounded text snippets as in the existing service. Existing public map storage is shared; do not submit secrets or private customer data.

Limits: 10..400 items per map; 1..400 documents per embed; each document at most 200,000 JavaScript UTF-16 code units; 2,000,000 total UTF-8 bytes and 6,000 chunks per request. JSON body cap 8 MiB. Numeric vectors must be rectangular, finite, D=2..768. Defaults d=9, seed=20260906, threshold=median, K=40, T=0.05. K must be an integer 2..40 on the Worker; local core permits up to 200. T must be positive. Seed 0 is valid. Empty, oversized, malformed or misaligned inputs fail explicitly. Truncated repo files must be resolved before mapping.

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


## Math diagnostics and candidate preview (wayfinder-math/1)

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


## Radius diagnostics (radius/1)

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


## Positive control (calibration/1)

The instrument is `pointmap/0.2`, unchanged. `POST /api/map/control` adds the one reference the wayfinder never had: a **known signal**. The stored checkerboard null randomizes bit margins and states the false-alarm side; nothing stated how the frozen isolation/displacement statistics respond to a content change of known size. Following CutPaste (Li, Sohn, Yoon, Pfister, CVPR 2021) and the is-this-x standard-candle discipline, the route cuts a contiguous donor segment into the middle 25% of a host document and measures each splice as an ordinary one-name CHANGE through `/api/map/preview` on the baseline frame.

```json
{ "baseline_id": 123, "texts": ["...every baseline document, byte-identical..."], "names": ["..."], "n_controls": 6, "control_seed": 20260917 }
```

- The corpus must equal the baseline exactly: every name present, every SHA256 equal, no extra names; otherwise 409 with the changed/added/missing names. Nothing is embedded before that gate passes.
- The recipe is fixed: generator `cutpaste-splice/1`, splice fraction 0.25, centered window, same-length donor segment (whole donor if shorter), surrogate pairs never split. `splice_fraction`, `window`, `hosts`, `donors` and similar keys are rejected (422); instrument settings are rejected (409). `n_controls` (2..12, default 6) and `control_seed` are the only knobs and both are echoed, so a control cannot be tuned to the result it produces.
- Per control: host, donor, splice offsets, before/synthetic SHA256, `isolated_delta` (comparison) and `ledger_actual_delta` (exact ledger, must agree), `bits_changed`, geodesic/chord displacement, `quantization_silent`, `occupied_sectors_delta`, `unchanged_anchor_count`, frame/instrument ids.
- `summary`: counts by sign of `isolated_delta`, min/median/max of |Δisolated|, displacement and bits changed, `bits_moved_count`, `quantization_silent_count`, all with `n_measured`. `baseline_reference.null` echoes K/E0/SD0/p_resolution of the stored null. `no_change_reference` is the identity (a byte-identical CHANGE moves nothing).
- Side effects: none beyond the disclosed embedding cache. `persisted:false`, `task_verdict:"not-applicable"`.

Reading: a splice that moves zero bits on this frame says the instrument is quantization-silent at that content size for that document; a splice that changes the isolated count says the statistic responds to known-different content. Neither says anything about task quality, and no admitted coordinate, ranking term or keep/revert rule follows. Compare controls only on the same `frame_id`/`instrument_id`; report n with every count. The same summary on a different corpus is a different instrument reading, not a benchmark.

## Outcome ledger (outcomes/1)

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

## Axis redundancy trial (axis-trial/1)

`POST /api/map/axis-redundancy {map_id, K?, null_seed?}` executes the membership condition for one candidate per-axis statistic instead of leaving it unstated. Following TabNet's masked-feature pretraining (Arik & Pfister, AAAI 2021), the statistic `loo-nn-vote/1` predicts each document's bit j from its other d−1 bits by a leave-one-out nearest-neighbour vote (Hamming distance on the remaining axes; ties count 0.5). The same statistic is then computed on K draws of the existing fixed-attempt checkerboard chain (`PM._internal.nullDraw`, every row and column margin preserved; a distinct seed, `map.seed XOR 0x5bd1e995` by default, so the trial chain is not the map's own V2 chain).

Because column margins are fixed under the null, the majority baseline of every axis is identical between observed and null; `observed_minus_margin_baseline` and the null comparison measure inter-axis dependence beyond margins, per axis. Output per axis: `observed_hits`, `observed_ties`, `margin_baseline_hits`, null `{K, mean, sd, min, max, degenerate}`, `z_descriptive` (null when the null is degenerate), plus-one two-sided `p_two_sided` with `p_resolution = 1/(K+1)`, `direction`, and an exclusion-only `verdict`: `excluded-from-fixed-margin-null`, `not-excluded`, or `null-degenerate: no trial possible on this corpus`. A `total` block sums over axes; `counts` tallies verdicts; `margins_preserved` certifies the chain.

`admitted` is hard-coded `false`. Admission of a coordinate is a paper-level decision recorded in `refs/` after trials on more than one corpus; one response never flips it. The statistic never enters rung ranking, sector geometry or any recommendation; `weights`, `importance`, `rank`, `admit` and instrument keys are rejected. No embedding runs, nothing is written. K must be an integer 2..40 (defaults to the map's K); K=40 cannot resolve tails below 1/41, and an "excluded" verdict at that resolution is a small-chain observation, not a discovery threshold.

## Perturbation consistency (consistency/1)

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

