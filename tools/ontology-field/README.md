# Ontology field instrument

Measure how six known ontology families occupy a frozen embedding field. The command returns a whole-field report and draws PCA planes, PCA spheres and signed cell residuals before and after the lens. It runs offline against the measured bank. [Study, figures and interpretation](../../papers/data/ontology-field/STUDY.md) · [Frozen protocol and production routes](../../papers/data/ontology-field/PROTOCOL.md)

From the repository root, use Python 3 with NumPy, SciPy and Matplotlib, and Node.js. Replay all coordinates, class amounts, spectral terms and nulls and render both figures into a temporary directory:

```sh
out=$(mktemp -d)
OPENBLAS_NUM_THREADS=1 python3 tools/ontology-field/run.py \
  --check papers/data/ontology-field/results.json --output "$out/results.json" --atlas "$out/atlas.png"
```

The globe figure is saved as `spheres.png` beside the atlas. Frozen thresholds and axes use references only. The numerical check uses Paper V's comparator, which requires identical discrete outcomes and tolerates small floating-point variation. The two null seeds test sensitivity to the randomization stream. They share an observed field.

## Rebuild the inputs

Download the pinned CSV from the protocol and rebuild its manifest with `python3 tools/ontology-field/prepare.py schemaorg-current-https-types.csv /tmp/definitions.jsonl`. Compare its bytes with the committed manifest. The acquisition sent only the cleaned definitions to Workers AI, eight at a time. Model output was converted to little-endian float32. The locally recorded batch metadata links the response coordinates and input sequence by SHA-256. The original connector response exposed pooling and shape. It did not supply an immutable model revision or HTTP response headers.

To obtain a new bank, supply your Workers AI account ID and API token as `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. This command creates a new directory, preserves the individual responses' vector rows and hashes, and packs the bank. Fresh runs may differ as the served model changes.

```sh
python3 tools/ontology-field/acquire.py papers/data/ontology-field/definitions.jsonl /tmp/fresh-ontology-bank
OPENBLAS_NUM_THREADS=1 python3 tools/ontology-field/run.py --data /tmp/fresh-ontology-bank \
  --output /tmp/fresh-field.json --atlas /tmp/fresh-atlas.png
```

The committed report is specific to the six-family protocol. The mathematical operations are in `measure.py`; the repository point-map cross-check lives in `pointmap.mjs`. Cell tables and point coordinates in the JSON use manifest order; class-count arrays use the report's `families` order. Cell index = 4 × vertical bin + horizontal bin, ordered from the lower left. A sphere class of −1 means no reference center within chord 0.095. Empty or fixed-null cells have a null z value.

The pinned SOS implementation linked from the frozen protocol requires repository access. Anonymous readers can inspect the public [endpoint catalogue](https://steadyorbitsystems.com/ENDPOINTS.md) and [agent guide](https://steadyorbitsystems.com/AGENT.md) for the deployment route contracts.
