# edge-map-standard — the standardized edge-map pipeline (2026-10-05)

Instrument doc for `edge-standard-v1`, the standardized edge-map pipeline behind the taste engine's `fractal_band` axis. Conceptual companion: `refs/natural-taste-engine-2026-10-05.md` (addenda 2-4 carry the build + validation story). Grounding corpus: `yubi-OS/knowledge/edge-map-standardization/` (draft PR #83, held for review).

## The problem it solves

Measured fractal dimension of an image's edge map is **pipeline-dependent**: the edge operator, its thresholds, the stroke width, and the ink density are all inputs to the box-counting estimate. The 2026-10-05 trial-1 (18 real photos through ffmpeg edgedetect + ad-hoc threshold) read D 1.5-1.6 — systematically above the empirical-aesthetics band — purely from extraction choices. Trial-2 through edge-standard-v1 read the same photos at 1.11-1.40. Comparability is won or lost at extraction, not counting.

## The pipeline contract (edge-standard-v1, pinned)

Input: raw 8-bit grayscale bytes (W x H), row-major. (Decode/rescale is upstream: `ffmpeg -f rawvideo -pix_fmt gray`.)

1. **Downsample** (only if a dimension exceeds 512): box-average to fit within 512 keeping aspect, dims = floor(w*scale) x floor(h*scale).
2. **Threshold selection (ink normalization)**: sweep t over 0..255; coverage(t) = fraction of pixels with gray >= t; pick the t minimizing |coverage - 0.06| (TARGET_COVERAGE = 6%); ties go to the smaller t. Emit `chosen_threshold` and `achieved_coverage`.
3. **Ink mask**: gray >= threshold.
4. **Contour trace**: 4-connected component labeling (row-major scan order); per component, Moore outer-boundary tracing (canonical backtrack-relative: start = component's first ink pixel in row-major order, initial backtrack = WEST, scan clockwise-after the backtrack; stop on state recurrence or 4*w*h cap); paint 1-px boundary pixels; drop components with < 12 traced pixels (MIN_COMPONENT).
5. **Emit**: 0/1 grid + meta `{pipeline: "edge-standard-v1", chosen_threshold, achieved_coverage, n_components_traced, traced_pixels, w, h, under_inked}`.
6. **Measure** (same module): `boxCountingDim(grid, 4, 64, 8)` — scale ladder [4,6,9,13,20,29,43,64] (round+dedupe+clamp log-spaced), boxes anchored floor(x/s)/floor(y/s) at origin, least-squares regression of log N vs log(1/s), D = slope, r2 gate 0.98.

**Boundaries**: any change to TARGET_COVERAGE, MIN_COMPONENT, or the scale window is a major version bump (it invalidates every prior measurement). The threshold targets COVERAGE only, decided before any D is computed — never tune parameters toward a D outcome.

## What the corpus dictates (why these choices)

- The preference band was established on **isolated contour statistics** (Hagerhall silhouettes, curated painting stimuli), not dense texture edge maps — so the output class is 1-px isolated contours (corpus doc 03).
- Ink density and stroke width are inputs to box counting — normalize coverage, pin 1-px strokes, keep the smallest box above stroke width (doc 02's crossover argument).
- Box-counting standards: pinned scale window, pinned regression, reported r2 (doc 04).
- IBSI mechanism: pinned chain + fixture images with expected values + cross-implementation parity (doc 06).

## Sources of record + parity

- Python source of record: `edge_standard.py` (stdlib-only; validated 34/34 checks) — canonical instance `session/taste/build-edge/`.
- JS worker port: `jev-edge-standard.js` module part on the steady-orbit worker (imports `boxCountingDim` from `jev-taste-math.js`).
- Fixture pack `edge_fixtures.json`: 4 synthetic raw-gray fixtures with expected outputs generated from the Python source (f1_disk, f2_disk_dim — the normalization property: same shape at different gray levels -> identical traced grid + identical D; f3_sierpinski_leaves D 1.5926; f4_two_level). Parity: threshold exact, coverage/traced/grid-sha exact, max |dD| 4.4e-16. All 4 parity-PASS against the live worker.
- Live route: `POST /api/jev/corpus/taste/edge-standard` `{gray_b64, width, height}` (or bitmap passthrough) -> standardized bitmap + fractal/symmetry features + run row kind `edge-standard` (deploy etag 26e837ed, 43 parts).

## Validation record

- Trial-2 (18 real Wikimedia photos, 3 classes): D moved from 1.5-1.6 (unstandardized) to 1.11-1.40 at pinned ~6% coverage; 8/18 in-band; two urban images saturate at threshold 255 (under-inked guard recorded).
- Paintings cross-validation (Viengkham & Spehar 2018, 123 paintings through the live route): our contour-class D spans 1.029-1.487 (mean 1.278) vs their band means 1.154/1.418/1.711 — systematically lower and compressed, as the contour-vs-cluster regime difference predicts; 48/123 in our 1.3-1.5 region, 0 above 1.5. The supplementary ordering is not band-ordered, so per-image rank tests need the authors' data (requested 2026-10-05).

## Honest limits

- The pipeline makes measurements COMPARABLE; it does not by itself admit the taste axis. Band location on our contour-class scale is a human-preference question (contour-class peaks may sit below 1.3 per Isherwood 2016).
- Under-inked saturation: images where even t=255 leaves coverage far from target get flagged (`under_inked`), and their D should not be read against the band.
- The full painting rating data is not published (OSF umbrella carries a different study); the data request to the authors is the free path to the per-image test.
