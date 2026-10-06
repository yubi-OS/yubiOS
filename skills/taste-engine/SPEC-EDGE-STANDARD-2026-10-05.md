# SPEC-EDGE-STANDARD — edge-standard-v1 (2026-10-05)

The standardized edge-map pipeline for image-derived fractal-dimension measurement, per the IBSI mechanism and the `edge-map-standardization` corpus findings (yubi-OS/knowledge PR #83, held draft). Goal: make real-photo measured D comparable across sources so the taste engine's `fractal_band` axis can be admitted on real-photo artifact classes.

## What the corpus dictates (design constraints, each corpus-grounded)

1. **Measure contour-class structure, not dense texture edges** (doc 03): the preference band 1.3–1.5 was established on isolated contours / curated stimuli (Hagerhall silhouettes; painting studies on curated stimuli). Dense photo edge maps are a different measured set. The pipeline's output class is ISOLATED CONTOURS.
2. **Pin ink density** (doc 02): box counting counts occupied boxes; edge-pixel count is an input to the estimate. The pipeline normalizes edge maps to a TARGET ink coverage and records achieved coverage alongside every D. Smallest box size must stay above stroke width (crossover argument) → strokes are 1 px.
3. **Pin the box-counting window** (doc 04): fixed scale ladder, least-squares regression on log N vs log(1/s), reported r², grid anchored at origin (documented choice; grid-translation mitigation out of scope for v1).
4. **Pin the whole preprocessing chain with stage order** (doc 05): resize policy → grayscale (already applied upstream) → threshold selection → contour trace → bitmap emit. Any change is a major version bump.
5. **Fixtures with expected values + cross-implementation parity** (doc 06): synthetic fixtures with known D + Python source of record ↔ JS worker port parity, CI-failable.
6. **Real-photo transfer is a hypothesis** (doc 07): the pipeline enables the matched-D validation; it does not by itself admit the axis.

## The pipeline (edge-standard-v1, pinned)

Input: raw 8-bit grayscale bytes (W×H) — decode/rescale is upstream (ffmpeg `-f rawvideo -pix_fmt gray`); the standard starts at the gray image.

1. **Resize** (if needed): area-average downsample to a working grid of at most 512×512 (nearest preserved aspect handled by caller; the standard consumes whatever W×H arrives and does NOT resize unless > 512 in a dimension, in which case box-average to fit 512 keeping aspect, zero-pad to square at the END).
2. **Threshold selection (ink normalization)**: sweep candidate thresholds over the 256 gray levels; for each, binarize (gray >= t → ink 1); pick the t whose ink coverage is CLOSEST to TARGET_COVERAGE = 0.06 (6% of pixels); ties → smaller t. Emit `chosen_threshold`, `achieved_coverage`.
   - Coverage floor guard: if even t=1 gives coverage < 0.01, emit `under_inked: true` and still emit the bitmap (callers decide).
3. **Contour trace**: connected-component labeling (4-connectivity) of the ink mask; for each component, trace its OUTER boundary (Moore-neighborhood tracing, deterministic start = first ink pixel in row-major order); paint boundary pixels (1 px) on a blank grid; drop components smaller than MIN_COMPONENT = 12 boundary pixels.
4. **Emit**: 512×512 (or native-size) 1-px contour bitmap + `pipeline: "edge-standard-v1"`, `chosen_threshold`, `achieved_coverage`, `n_components`, `traced_pixels`.
5. **Measurement** (separate function, same module): `boxCountingDim(grid, 4, 64, 8)` — the same ladder semantics as jev-taste-math.js (scales round+dedupe+clamp; slope of log N vs log(1/s); r² gate 0.98).

## Deliverables

- **Lane A (Python source of record)**: `edge_standard.py` — stdlib only: `thresholdForCoverage(gray, w, h, target=0.06)`, `traceContours(mask, w, h, min_component=12)`, `standardize(gray_bytes, w, h) -> {bitmap(grid), meta}`, `measure(grid)`. Tests: synthetic fixtures (circle → contour D ≈ 1.0; Sierpinski triangle depth 7 → D ≈ 1.5–1.7; two images same shape different gray levels → SAME D after normalization; coverage targeting within ±0.5%).
- **Lane B (JS worker port)**: `jev-edge-standard.js` — identical algorithm, exports the same function names in JS style; NO env access. Tests mirror Lane A's.
- **Lane C (fixtures + parity pack)**: `edge_fixtures.json` — 4 synthetic raw-gray fixtures (64×64: bright circle on dark bg, dim circle same shape, noisy blob, Sierpinski) with expected outputs computed by Lane A's code (threshold chosen, coverage, traced pixel count, D within stated tolerance); plus the encoding contract for raw gray bytes (row-major, 1 byte/pixel).
- **Advisor**: reconcile contracts, run all suites, add e2e (gray bytes → standardize → measure → D reported; parity JS vs Python on all fixtures), produce integration report + worker wiring instructions for a new route `POST /api/jev/corpus/taste/edge-standard` (accepts `{gray_b64, width, height}` or `{bitmap_b64 passthrough}`, returns standardized bitmap + features + pipeline metadata) wired through the taste deps chain like the other taste routes.

## Boundaries

- Always: pure stdlib / no-env modules; deterministic (no randomness); every output records the pipeline id + params.
- Ask-first: changing TARGET_COVERAGE, MIN_COMPONENT, or the scale window (major version bump).
- Never: silently re-scaling D values to "fix" band membership; adaptive threshold that targets a D outcome (the threshold targets COVERAGE only, decided before any D is computed).

## Success criteria

- Same shape at different gray levels → same threshold chosen → same D (the doc-02 normalization property).
- Fixture parity JS vs Python within 1e-9 on D, exact on threshold/coverage/pixel counts.
- Re-run of the 18-image real-photo trial through edge-standard-v1 produces per-class D distributions + a recorded admission verdict in the refs doc.
