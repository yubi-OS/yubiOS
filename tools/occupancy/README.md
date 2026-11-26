# Paper V replay

From the repository root, use Node.js and Python 3 with NumPy and SciPy. The study uses no npm packages.

```sh
python3 tools/occupancy/replay.py --output /tmp/yubios-occupancy-run \
  --check-report papers/data/occupancy/results.json
```

Choose a new or empty output directory. The runner verifies the published fixture SHA-256 and vector shapes, rebuilds the reference frame, and independently analyses the original and repeat responses. Each pass writes its maps, per-query choices, allocations and test statistics. The top-level summary reports the first pass with cross-pass diagnostics. The comparison checks each recorded discrete outcome and uses small numerical tolerances for floating-point output.

## Data and assumptions

[The fixture](../../papers/data/occupancy/cloudflare-bge-m3.zip) contains the 108 authored sensor notes, both passes of their dense Cloudflare BGE-M3 vectors and the inference metadata. The 72-row file consists of 36 reference and 36 A notes. The 36-row confirmation file is holdout B. The six classes occur once per station. The scoring tools fit their frame and scales using reference notes. The separately reported semantic-frame comparison splits the same 36 references into 18 anchors and 18 retrieval examples.

The primary and repeat passes both reported CLS pooling. Replaying these observations requires no account or credentials. For a fresh measurement, extract the two JSONL files, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in your own shell, then run once per input, choosing distinct output paths. Only the text field is sent. Add `--request-mean` for the second request configuration. The program prints the pooling value reported for each batch.

```sh
python3 tools/occupancy/reembed.py dataset.jsonl new-vectors.json.gz
python3 tools/occupancy/reembed.py confirmation.jsonl new-confirmation-vectors.json.gz
```

## Reuse the scorer

```sh
python3 tools/occupancy/occupancy.py inputs.json --power rms --temperature 0.05
```

The JSON object needs `reference_vectors`, `reference_labels` and `query_vectors`. Optional `query_amounts` supplies one nonnegative number per query and defaults to one. Optional `priors` follows the sorted class order. Use `--power native` for the untransformed benchmark or `--fixed-temperature` for the bandwidth control. RMS mode requires a defined reference pole, finite chart coordinates and a nondegenerate reference spread. Results include the class order, normalized probabilities, top choices, allocated class amounts and the input total. Equal scores select the first class in that order. Individual historical experiments preserve their original tie order.

## Instruments

| File | Measurement |
| --- | --- |
| [map.mjs](map.mjs) | Reference-frozen point map, focal ladder and two PCA-sphere powers |
| [analyze.py](analyze.py) | Recognition baselines, concentration, station controls and class-bank replication |
| [confirmation.py](confirmation.py) | Fresh holdout and matched semantic-frame/PCA comparison |
| [ambient.py](ambient.py) | Full-dimensional spherical power, orthogonal tangent control, packing and paired comparisons |
| [spectral.py](spectral.py) | Pair enumerator, fixed-margin controls, angular shares, signed Walsh contrasts and degree ablations |
| [occupancy.py](occupancy.py) | Reusable Gibbs allocation to sorted class banks |
| [check.py](check.py) | Independent adapter replay, blocked labels and note/byte conservation |
| [reembed.py](reembed.py) | Optional new model requests |
| [replay.py](replay.py) | Fixture integrity, both passes and recorded result comparison |

The scope manifest and [CI workflow](../../.github/workflows/lean-occupancy.yml) specify the proof checks. From `papers/data/lean`, with the pinned toolchain and dependencies available, `lake build OccupancyBounds` builds the proof library. The workflow also promotes warnings to errors, replays the kernel, verifies statement pins and checks compiler-enumerated axiom dependencies. The [paper](../../papers/conserved-occupancy-2026-11-25.pdf) identifies the measured outcomes and the hypotheses of the algebraic identities.
