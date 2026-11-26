# Multimodal occupancy instrument

This instrument follows the five-paper program on 480 observed digit samples drawn from independently collected handwriting and speech corpora. It measures the representation at three stages: the native measurement grid, the Cloudflare text embedding of that grid and a reference-frozen focal map of the embedding. The same ten digit labels permit both within-modality recognition and cross-modal transfer. See the [frozen protocol](PROTOCOL.md), [results and interpretation](../../papers/data/multimodal-digits/STUDY.md) and [source attribution](../../papers/data/multimodal-digits/SOURCES.md).

## Run from the repository root

Use Python 3 with NumPy and SciPy, and Node.js with ES modules. The study inputs are under `papers/data/multimodal-digits`. To verify the sample design, raw-grid baselines, acquisition receipts and conservation totals:

```sh
python3 tools/multimodal-occupancy/check_study.py papers/data/multimodal-digits
```

The two measured embedding banks are committed alongside `records.jsonl`. To reproduce the observed results from a clean checkout, run:

```sh
python3 tools/multimodal-occupancy/run.py --output /tmp/digit-replay \
  --check-report papers/data/multimodal-digits/results.json
```

Use a new or empty output directory. It receives the four-direction results JSON and one JSONL decision file per direction. Each decision identifies its source observation, truth, group, predicted labels, and the powered probabilities in the report's class order. All intermediate fits take source references only. The check compares discrete endpoints exactly and floating-point results with the tolerances from Paper V. The existing Lean checks still verify the algebra. Scientific conclusions depend on the observed data and its sampling.

## Repeat the provider measurement

The acquisition in this PR used Cloudflare Workers AI directly: 40 requests of 12 texts, each returning 12 × 1,024 coordinates and reporting CLS pooling. No pooling override was requested. Each bank stores the observations as little-endian float32 with the corresponding SHA-256 input IDs. The provider model ID is recorded; this API response did not identify an immutable backend revision.

To repeat acquisition with your own Cloudflare credentials, copy the records into a new directory and run the following. The new measurement receives its own receipts and file hashes. Its values can differ from the observed run.

```sh
mkdir -p /tmp/new-digit-study
cp papers/data/multimodal-digits/records.jsonl /tmp/new-digit-study/
# Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment.
python3 tools/multimodal-occupancy/vectors.py acquire /tmp/new-digit-study/records.jsonl \
  /tmp/new-digit-batches /tmp/new-digit-study
python3 tools/multimodal-occupancy/run.py --data /tmp/new-digit-study --output /tmp/new-digit-results
```

For source reconstruction download the [UCI ZIP](https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip) and check out [FSDD](https://github.com/Jakobovski/free-spoken-digit-dataset/tree/26eb9aaf76e81b692f806f9140c2d2777410d7a1) at the indicated commit. The adapter checks both versions and rejects modified recordings. Run `python3 tools/multimodal-occupancy/prepare.py UCI.zip FSDD_CHECKOUT /tmp/records.jsonl` and compare the output to the committed manifest. The voice adapter averages 32 ms Hann-window STFT power into eight frequency bands and eight time intervals, scales the top 60 dB relative to the clip maximum, and rounds to the same 0–16 range as the ink grids. All 480 text payloads are distinct.

## How the five papers enter the computation

| Program component | Instrument and recorded readout |
| --- | --- |
| I. Learned curves and atoms | Reference PC1 parameter and degree-three real spherical-harmonic ridge fit (regularization 0.001). Project held-out points using the frozen range, report clamping and chord residuals. Count beneficial single-bit moves on the point map. |
| II. Matched nulls and Boltzmann shells | Compute collision pairs, V2 and adjacent-gap ratios against 99 fixed-margin Curveball draws. Keep the sign of z alongside the sonometer level in dBc. Report actual compass-chain and analytic mean shell, detailed-balance check and ideal linear-potential binomial shell weights. |
| III. Spherical power and README diffusion | Compare angular power shares on served and reference-RMS globes through degree three. At t = 0.1, multiply each share by exp(−2ℓ(ℓ+1)t), in units of the original truncated total power. This is predicted heat evolution. It is separate from the measured lens effect. |
| IV. Focal point and resolution | Use the repository point-map and its half-bit reference ladder through seven axes; retain frame ID, prefix counts and margin-based reference certificates. Compute greedy packing on both globes and both ambient charts. |
| V. Conserved occupancy and signed recognition | Use the Paper V scorer for native and powered allocations. Compare against nearest-neighbour and centroid baselines, fixed and median-energy-adjusted temperature, and paired held-out changes. Reconstruct direct Hamming Gibbs class scores from signed Walsh degrees, compute degree-only and omit-degree recognition, and verify the Krawtchouk pair counts directly. |

As secondary controls, split each source bank into disjoint anchors and retrieval observations, then compare class-oriented and PCA Hamming frames at matched dimension (ten axes here, one per digit) against the retrieval-bank embedding centroid. For speech, remove reference-speaker directions and repeat Gibbs scoring. The handwriting tables identify the official writer-independent split but omit row-level writer IDs, so individual writer effects cannot be estimated. These controls were added after the primary protocol was written.

## Reuse with another measurement bank

Supply one JSONL row per observation using the same fields as the manifest: modality, reference/test split, source ID, independent group, label, unit, scalar amount, an equal-length numeric grid serialized as text, and its exact input SHA-256. The two study adapters also include a source SHA-256. Reference banks need multiple nondegenerate dimensions and representatives of every query class; source IDs and text hashes must be unique. Groups must be disjoint between reference and test within each modality. Cross-modal comparisons require comparable label sets and equally sized numeric inputs. This implementation evaluates grids; image decoding, audio feature extraction and text serialization belong to the source adapter. The public study checker is deliberately specific to the two frozen datasets.
