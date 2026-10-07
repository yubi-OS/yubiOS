# PRE-REGISTRATION — spectral-standard-v1 falsification corpus

Written 2026-10-06, BEFORE any measurement exists. Lane A's `spectral_standard.py` is not
yet importable in this session; nothing in this document was tuned against a measured value.
Every band below is restated from the SPEC gold table with its a-priori physics justification,
plus a small number of pre-run resolutions (ambiguities in the SPEC that had to be pinned
before first measurement) — each logged explicitly and dated here, per the falsification-corpus
skill's amendments discipline. **Zero post-hoc movement after the first clean run.**

## 0. The never-retune rule

- Any change to a pinned parameter below (ladder, K factor, walkers, PRNG, seed derivation,
  series rank ladder, bands, gate criteria) after the first clean run requires a dated entry in
  `amendments-spectral-2026-10-06.md` **plus a major version bump of the instrument**.
- Band narrowing after seeing results is prohibited. If a band fails, the finding is either
  (a) an instrument bug (fix the instrument, keep the band) or (b) physics (document it, do not
  move the band).
- "First clean run" means: the first run where every row evaluates without an adapter error —
  including rows that FAIL their bands. A failing band is a result; a crashing harness is not.

## 1. Pinned instrument parameters (pre-registered)

| Parameter | Pinned value | A-priori justification |
|---|---|---|
| Walk-step ladder | **[16, 24, 36, 52, 80, 116, 172, 256] steps** = K·[4, 6, 9, 13, 20, 29, 43, 64] with **K = 4** | See §1a below. |
| K factor | **4** | See §1a. |
| Walkers | 64 | SPEC-pinned. Same in Python and JS. |
| PRNG | mulberry32, bit-exact port (32-bit ops, same state update as the JS reference: `a = a + 0x6D2B79F5 \| 0`, `t = imul(a ^ a>>>15, 1\|a)`, `t = t + imul(t ^ t>>>7, 61\|t) ^ t`, output `((t ^ t>>>14)>>>0)/2^32`) | Parity requires identical walk sequences; the exact recurrence must be pinned, not just the name. |
| Seed derivation | `seed_u32 = int(sha256(canonical_input_json).hexdigest()[:8], 16)`; canonical_input_json = compact JSON of the mode + inputs in a pinned field order (documented in the harness header) | SPEC: "seed = input sha-derived". The exact derivation is pinned here so Python and JS agree without a meeting. |
| Walker step rule | non-lazy: each step moves to a uniformly chosen ink-neighbor (`idx = min(int(u * deg), deg-1)` with the next PRNG draw `u`); on a mask, 8-connected ink neighbors; a pixel with no ink neighbor stays in place (stay counts as a step) | Lazy vs non-lazy walks share the anomalous exponent (only the time scale rescales), but the choice must be pinned for parity. The stay rule prevents walkers on isolated pixels from consuming the PRNG differently in the two ports. |
| MSD metric | explicit graphs: chemical (graph-hop) distance²; masks: Euclidean pixel distance² | Chemical and Euclidean metrics coincide on the Sierpinski gasket (d_min = 1: the corner-to-corner shortest path is 2^n hops at level n, matching the 2^n linear scaling), so the gold corpus is metric-agnostic. The convention must still be pinned for arbitrary caller graphs. |
| Return probability | P(0,t) = fraction of the 64 walkers at their starting vertex at step t; ladder rungs with P(0,t) = 0 are dropped from the fit and counted; > 2 dropped rungs → `insufficient` verdict, no number reported | Zero-return rungs would inject −∞ into the log fit. Dropping ≤ 2 is a bounded, pre-registered rule, not a post-hoc trim. |
| r² gate | ≥ 0.98 on every fitted exponent (d_w, d_s walk, α_msd, series α) | Same gate as the taste engine. |
| Series rank ladder | ranks r_i = round(N/8 + (l_i/64)·(3N/8)) for l_i in [4, 6, 9, 13, 20, 29, 43, 64]; requires N ≥ 16, else `insufficient` | See §1b (pre-run resolution A-2). |
| Series mode ordering | series mode consumes the input AS GIVEN (ordered); it must NOT sort internally | Sorting inside the instrument makes the permutation null (row 6) unfailable — see FM-3b. |

### §1a. The K factor, worked a-priori

The ladder must sit inside the gasket's fractal diffusion window. For the level-4 gasket
graph (see §2 for the vertex-count resolution):

- graph diameter = 2⁴ = 16 hops; saturation time t_sat ≈ diameter^d_w = 16^2.322 ≈ 620 steps
  (MSD reaches the system size: r² ≈ 16² → t ≈ 16^(2/0.8614) ≈ 628, same order).
- microscopic crossover: a non-lazy walker leaves the ballistic 2-step regime within a few
  hops; the ladder's bottom rung must sit ≥ 4× above it.
- **K = 4** puts the ladder at t ∈ [16, 256]: bottom rung 16 = 4× the microscopic crossover,
  top rung 256 = 0.41 × t_sat (clear of roll-off), spanning ~1.2 decades of fractal diffusion.
- K = 2 would put the bottom rung at 8 steps (too close to microscopic; risk FM-1). K = 8 puts
  the top rung at 512 ≈ 0.83 × t_sat (too close to saturation; risk FM-2). K = 4 is the only
  integer on the natural scale with ≥ 2× margin on both ends. **Pinned pre-run; not revisited
  after any measurement.**

Consequence (pre-registered, not discovered): walks run on the **level-4** gasket graph.
The level-3 graph saturates at t_sat ≈ 8^2.322 ≈ 55 steps — the top rungs (116, 172, 256)
would sit past saturation and poison the fit (FM-2). Gold rows 2–3 therefore pin level 4.
Level-3 remains in the corpus for row 1 (eigenvalue counting, which has no saturation issue —
the spectrum is computed exactly).

### §1b. Pre-run resolutions (ambiguities in the SPEC, pinned before any measurement)

**A-1. Exact d_s restated.** The SPEC quotes d_s = 1.36507; the exact closed form is
d_s = 2·ln3/ln5 = **1.365212…** (2·1.0986123/1.6094379). The SPEC's 1.36507 is a truncation
artifact. The band [1.295, 1.435] is unchanged — this is a transcription fix, not a gate move.
The pre-registration uses 1.36521.

**A-2. Gasket vertex counts.** The SPEC's gold row 1 says "level 3 (27 vtx) + level 4 (81 vtx)".
The standard corner-sharing Sierpinski gasket graph has V_n = (3^(n+1)+3)/2 vertices:
level 3 → **42**, level 4 → **123**. The numbers 27 and 81 = 3³ and 3⁴ are the **cell counts**
(3^n small triangles), not vertex counts. Resolution: the corpus builds the corner-sharing
graph (vertex counts 42 and 123, asserted in the harness's generator checks); the SPEC's
27/81 are recorded as cell counts. If Lane A built a 27- or 81-vertex graph instead, that is a
construction discrepancy to resolve with the advisor BEFORE the first clean run — this note
exists precisely so the discrepancy surfaces pre-run rather than as a tuned band.

**A-3. Series rank ladder vs window.** The SPEC pins both "ranks r ∈ [N/8, N/2]" and "the same
8-point lattice in rank space". These cannot both hold as a log-lattice: [N/8, N/2] spans a
factor of 4 (2 octaves), too narrow to hold the 8-point 16× log lattice. Resolution (same
anti-pattern-3 class as the edge-standard gate-window amendment): the 8 lattice points are
mapped affinely into the window, r_i = N/8 + (l_i/64)·(3N/8), which lands every rung inside
[N/8, N/2] up to rounding while preserving the lattice's ordering. Logged here, a-priori.

**A-4. Row 6 permutation seeds.** The SPEC says "PERMUTED (null)" (singular). A single
permuted draw could by chance preserve fit quality. Pre-registered: **three** permutation
seeds [42, 2026, 99] (Fisher–Yates with Python `random.Random(seed)`); the row passes iff
EVERY permuted series collapses (|α_perm − α_sorted| ≥ 0.5 OR r²_perm < 0.98). This is an
addition beyond the SPEC, justified a-priori: it strengthens the null without touching any band.

**A-5. Row 7 numeric band.** The SPEC says tri and jitter read "≈ 2.0". Pre-registered band:
**[1.85, 2.15]** — the same ±0.15 as row 5's 2D-lattice band, chosen because these renders are
the same class of compact 2D object with the same discretization scale. This widens nothing
and is fixed before any tri/jitter d_s exists.

**A-6. Row 7 construction.** "Via oracle path" means: render → edge-standard trace → boundary
mask → 8-connected walk graph, mirroring exactly what `POST /oracle` does in production. The
harness imports `edge_standard` from the sibling tools directory (same import pattern as
`gen_v2.py`) and feeds the traced mask to `walk_mask`. If `edge_standard` is not importable,
row 7 reports SKIP(ADAPTER) rather than inventing a substitute path.

**A-7. Log-periodic gate: well-posedness + detector form (anti-pattern 3 check, done
pre-run against exactly-computable corpus data).** Three problems with the first draft
("residual alternation across successive octave bands inside the window") surfaced pre-run:

1. *Window ill-posedness*: eigenvalues across the rank window [N/8, N/2] span only a factor
   ≈ 8 — no multi-band alternation can be defined there. Row 8 therefore evaluates over the
   FULL ordered spectrum (all N ranks), as a diagnostic presence detector — explicitly NOT
   the gated exponent fit of row 1.
2. *Band-count ill-posedness at factor 5*: the level-4 nonzero spectrum spans
   λ_max/λ_min = 212.24 = 5^3.33 — only 3 factor-5 bands, below the ≥ 4 the gate needs.
   (The naive a-priori span estimate 5^4.5 was wrong: it ignored the pre-asymptotic small-k
   regime.) Bands are therefore OCTAVES (factor 2): the level-4 spectrum spans 8^2.77 ≈ 7
   octave bands. The gasket's log-periodic period remains ln 5 in log λ — it shows up as
   the modulation's structure inside the octave bands, not as the banding unit.
3. *Detector form*: a global power-law fit's residuals DRIFT rather than alternate (the
   fitted exponent varies across the pre-asymptotic range; measured band means on the exact
   corpus spectrum are monotone: −0.73, −0.30, +0.03, +0.02 at factor 5). The log-periodic
   signal lives in the CURVATURE of log λ_k vs log k. Final detector: discrete second
   difference of log λ vs log rank over the nonzero spectrum, grouped into consecutive
   octave bands of the value; present iff ≥ 3 sign alternations across ≥ 4 non-empty band
   means. Amplitude/phase are never fitted.

Disclosure: the exact level-4 spectrum is corpus data computable a-priori by anyone — the
detector choice above was made against THAT (no instrument output exists or was used), the
same pre-run privilege as choosing a gate window against a known scale lattice. The corpus
measurements this detector yields are deterministic and pre-computable, so they are pinned
in `anchors_spectral.json` NOW (present = true, 7 octave bands, 4 sign alternations — the
harness's Jacobi spectrum reproduces this exactly; verified twice) rather than left null:
row 8 never passes through Lane A's instrument, so it has no "awaiting-first-measurement"
component. If the level-4 read is judged too coarse by the advisor, the richer variant is
the level-5 gasket (366 vertices — the same 366 as the edge-standard corpus droplets;
span 5^4.32 ≈ 9 octave bands); it requires numpy `eigvalsh` for tractable exactness and is
available as a follow-up, not pinned here.

**A-8. Row 7b contact-graph structural control (addition beyond the SPEC).** The oracle-path
construction (A-6) couples two things the gold table should decouple: whether the walk
instrument measures the gasket, and whether the edge-standard trace preserves walk
connectivity (the traced contour bitmap of a droplet lattice with 2 px inter-droplet gaps may
or may not 8-connect across gaps — unresolvable pre-run, and a dis-connected mask would make
every row-7a class read ≈ 2.0 for a STRUCTURAL reason, indistinguishable from an instrument
bug). Pre-registered control: the same renders' **droplet-center contact graphs** (explicit
graphs; edge iff center distance ≤ min pairwise center distance × 1.05 — the threshold is
derived from the generated geometry, never tuned) run through `walk_graph`. Prediction: the
gasket contact graph reads d_s ∈ [1.295, 1.435] and the tri contact graph ∈ [1.85, 2.15].
Row 7a remains the production-path prediction; 7b isolates measurement from tracing. If 7a
fails while 7b passes, the defect is in the trace/mask path (connectivity), not the walk
instrument — the exact attribution the matched control exists to provide (anti-pattern 6).

## 2. Gold corpus — pre-registered bands

Physics sources (a-priori, closed forms):
- d_f = ln3/ln2 = 1.584963 (gasket Hausdorff / box dimension)
- d_w = ln5/ln2 = 2.321928 (walk dimension; resistance renormalization factor 5/2 per level)
- d_s = 2·ln3/ln5 = 1.365212 (spectral dimension = 2·d_f/d_w, the Einstein relation)
- 1D chain: d_w = 2, d_s = 1 (P(0,t) ~ t^(−1/2))
- 2D lattice: d_w = 2, d_s = 2 (P(0,t) ~ t^(−1))
- Einstein gate: verdict `consistent` iff |d_s − 2·D/d_w| ≤ 0.10 with all three inputs at r² ≥ 0.98; D comes from the caller (edge-standard, stamped `source: caller`) — never back-solved from the walk (FM-11).

| # | Gold | Quantity | Predicted band | Gate |
|---|---|---|---|---|
| 1 | Gasket graph level 3 (42 vtx, 27 cells) + level 4 (123 vtx, 81 cells), Laplacian eigenvalues exact | d_s (series counting, d_s = 2/α) | d_s ∈ **[1.295, 1.435]** (1.36521 ± 0.07) | band + r² ≥ 0.98, per graph |
| 2 | Gasket graph, walk mode, level 4 | d_w | **[2.22193, 2.42193]** (2.32193 ± 0.10) | band + r² ≥ 0.98 |
| 3 | Gasket graph, walk mode, level 4 | α_msd = 2/d_w | **[0.82135, 0.90135]** (0.86135 ± 0.04) | band + r² ≥ 0.98 |
| 4 | 1D chain (path graph, N = 256) | d_s | **[0.90, 1.10]** | band + r² ≥ 0.98 |
| 5 | 2D 4-connected lattice patch (32×32 = 1024 vtx) | d_s | **[1.85, 2.15]** | band + r² ≥ 0.98 |
| 6 | Gasket level-4 eigenvalue series, permuted (seeds 42, 2026, 99) | counting exponent | **MUST collapse**: for EVERY permuted run, \|α_perm − α_sorted\| ≥ 0.5 OR r²_perm < 0.98 | null gate; survival of ANY permutation = harness failure (instrument reads sample size) |
| 7 | Falsification renders (tri, gasket render, jitter ×5 seeds) via oracle path | d_s (walk) | gasket render ∈ **[1.295, 1.435]**; tri ∈ **[1.85, 2.15]**; jitter ∈ **[1.85, 2.15]** | D's order-blindness must REPRODUCE in d_s: jitter ≈ lattice is the predicted null, not a bug |
| 8 | Log-periodic modulation on exact level-4 eigenvalues | wiggle presence | residual alternation present: **≥ 3 sign alternations across ≥ 4 non-empty octave bands** of the discrete curvature of log λ vs log rank over the FULL spectrum (final form per A-7) | secondary gate; corpus-side computation (never passes through the instrument); presence boolean only — amplitude/phase are NEVER fitted |

Chain size N = 256 and patch size 32×32 are pinned here (SPEC left them open): both give
≥ 16 ranks so the rank ladder is well-posed, and both keep the eigenvalue computation exact
(tridiagonal / Kronecker-friendly spectra are NOT required — the instrument computes the
counting exponent from the values it is given; the corpus supplies exact spectra).

## 3. Predicted failure modes (what a BROKEN instrument reads)

Recorded pre-run so the harness can attribute a failure to the instrument rather than to
physics. Each entry names the signature it would leave in the gold table.

- **FM-1 — ladder inside the microscopic regime (K too small).** Gasket d_w reads ≈ 2.0 and
  α_msd ≈ 1.0 with HIGH r² (ballistic walk on short times is a clean power law with the wrong
  exponent). Signature: rows 2–3 fail low with excellent fits.
- **FM-2 — ladder crossing saturation (K too large, or walks on the level-3 graph).** MSD
  rolls off at the top rungs → α drops → d_w inflated; return probability plateaus (walkers
  trapped) → d_s-walk deflated; r² degrades at the top rungs. Signature: row 2 fails HIGH while
  row 1 (counting) passes — a clean instrument-bug fingerprint, since rows 1 and 2 share no
  estimator.
- **FM-3a — window reads sample size.** The permutation null survives (α_perm ≈ α_sorted with
  high r²): the counting fit is reading the number of points, not the spectrum's structure.
- **FM-3b — the unfailable null (evil twin).** If series mode silently SORTS its input, the
  permutation null can NEVER fail — the row is vacuous and proves nothing. The harness detects
  this explicitly: if the null cannot fail under any of the three pinned permutations while
  row 1 passes, row 6 is reported `INVALID-INSTRUMENT (null unfailable)`, not PASS.
- **FM-4 — connectivity bug on masks.** Wrong connectivity (4-connected mask graphs, or
  8-connected where the row-5 patch is 4-connected) shifts the graph topology. Detector: the
  explicit-graph controls (rows 4–5) are connectivity-forced and must hit their exact bands;
  a mask-side bug shows as row 7 drifting while rows 1–5 hold.
- **FM-5 — PRNG drift / non-determinism.** Two identical runs of the same input return
  different d_w → determinism check fails. Cross-port drift shows at the route layer as
  |d_w^JS − d_w^Py| > 1e-9 (parity discipline; the JS port is wrong until proven otherwise).
- **FM-6 — return-probability estimator bug.** Averaging per-walker return indicators
  incorrectly (endpoint-only, max-over-time, or per-time-step average instead of
  ensemble-at-time-t) biases d_s systematically. Detector: the chain (row 4) has d_s = 1.0
  EXACTLY; any estimator bias moves it out of [0.90, 1.10].
- **FM-7 — log-base confusion.** log10 vs ln in any fit rescales exponents by ln 10 ≈ 2.303.
  Detector: rows 4–5 (known exact answers 1.0 / 2.0) blow out grossly; nothing else fails so
  politely.
- **FM-8 — silent degenerate inputs.** A series shorter than 16 values, a mask with < 2 ink
  pixels, or a single-vertex graph must RAISE, not return a number. Returning a number is the
  spectral analogue of the edge-standard silent-empty-mask lesson. The harness asserts the
  raise for four degenerate inputs.
- **FM-9 — gate rounding (the fmt() lesson, applied to the harness itself).** Exponents
  rounded to 2 decimals can hide a band violation (1.4349 vs 1.4351). All machine-readable
  outputs carry full float precision; rendered decimals belong to the UI layer only. The
  harness compares unrounded values.
- **FM-10 — metric mismatch.** Using graph hops where Euclidean is pinned (or vice versa)
  moves the gasket's d_w off-band while the abstract-graph rows stay clean (d_min = 1 makes
  the gasket itself immune — which is exactly why the MISMATCH must be caught by convention,
  not by the gold table).
- **FM-11 — Einstein-gate circularity (added beyond the SPEC).** If the oracle back-solves D
  from the walk (D = d_s·d_w/2) instead of taking the caller's D, the verdict is `consistent`
  BY CONSTRUCTION on every input and the gate is unfalsifiable. Detector: the harness runs the
  oracle composition with a deliberately wrong caller D (D_caller = 1.0) and requires the
  verdict to flip to `inconsistent`. A trivially-consistent oracle is an instrument bug, not a
  physics result.
- **FM-12 — adapter drift.** The harness measures through Lane A's public functions only; if
  the module surface differs from the documented adapter contract (§5 of the harness header),
  the harness must FAIL LOUDLY with the module's actual callables listed — never silently
  reimplement the measurement locally (a harness that measures is a second instrument, and the
  corpus would then be validating the harness against itself).

## 4. Gate evaluation order (per the falsification-corpus pipeline)

1. Generator checks (vertex counts, cell counts, determinism, degenerate-input raises) —
   runnable pre-measurement, no instrument needed.
2. First clean run → results JSON per class → `--write-anchors` fills `anchors_spectral.json`
   expected values (previously null, `_status: awaiting-first-measurement`).
3. `--selftest` thereafter asserts the filled anchors at regression tolerance 1e-9
   (deterministic instrument ⇒ byte-stable outputs; the parity floor is the same 1e-9).
4. Advisor review of the first run's table before any real-data claim.
5. Live-route parity (Python source of record vs deployed JS port) after deploy — INTEGRATION.md.
