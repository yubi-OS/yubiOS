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
