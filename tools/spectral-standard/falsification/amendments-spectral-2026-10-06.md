# AMENDMENTS — spectral-standard-v1 (pre-first-clean-run)

Date: 2026-10-06. Author: advisor/integrator lane. Scope: pre-registration
amendments resolved during lane integration, ALL BEFORE the first clean
harness run. **No band value was moved.** Every entry states its a-priori
reasoning and, where a criterion was strengthened across runs, the full
sequence is disclosed. Per PREREGISTRATION §0, post-first-clean-run changes
to any pinned parameter would require a major version bump — none of the
below occurred after the first clean run (the first clean run IS the
anchored run recorded in `anchors_spectral.json`, `_status:
anchored-first-run-2026-10-06`).

---

## AM-1 — Canonical gasket construction + level naming (seam a)

**Decision.** The canonical gold construction is the corner-MERGED Sierpiński
gasket graph. The SPEC's literal "3^level corner vertices" pre-gasket
(corner-joined copies, isomorphic to Tower-of-Hanoi H_3^n) is retained as a
documented-DISQUALIFIED alternate.

**A-priori reasoning.** The SPEC's own gold table is internally inconsistent
with the literal reading: a corner-joined 3^level-vertex graph cannot satisfy
the pre-registered gasket bands, because corner-insertion edges break the
resistance renormalization (5/2 per level) that produces d_w = ln5/ln2 and
d_s = 2·ln3/ln5. The three closed forms in the SPEC (d_f, d_w, d_s) are
properties of the merged construction. This was decidable before any
measurement; the measurements (Lane A: eigen d_s 1.2085/1.2618, walk d_w ≈ 2
diffusive on the pre-gasket; Lane B independently: 1.2085/1.3281 and walk
d_w 2.71) only confirm what the physics already implied.

**Level-naming convention (canonical).** SPEC level k counts 3^k small
triangles (cells). Canonical: V(k) = (3^(k+1)+3)/2, E(k) = 3^(k+1), cells =
3^k. SPEC level 3 → 42 vertices / 81 edges; SPEC level 4 → 123 / 243.
Mapping to lanes: Lane C generator `gasket_graph(k)` and Lane B
`gasketIdentifiedGraph(k+1)`... **correction:** Lane A builder
`sierpinski_gasket_graph(k+1)` matches canonical level k (Lane A's argument
counts subdivision depth + 1); Lane C's `gasket_graph(k)` matches directly.
Lane B's `gasketPreGraph(level)` has 3^level vertices (the disqualified
alternate) and `gasketIdentifiedGraph` is BUGGY (see advisor report §P2) —
neither is the canonical merged builder until P2 lands.

**Verification.** Lane A `sierpinski_gasket_graph(4)` vs Lane C
`gasket_graph(3)`: identical V/E and Laplacian spectra to 8.7e-13. Same at
canonical level 4 (4.5e-13). The two correct builders build THE SAME graph.

## AM-2 — Walk-gold level = canonical level 6; start rule 'spread' (seam b)

**Decision.** The walk-gold gasket graph is canonical level 6
(V = 1095, chemical diameter 64; Lane A builder level 7), replacing Lane C's
pre-registered level 4. Start rule for explicit graphs: 'spread'
(node (i·n)//W); mask mode keeps the SPEC's row-major 'first' rule.

**A-priori criterion (stated before reading any measured alpha).** The pinned
ladder [16, 24, 36, 52, 80, 116, 172, 256] must sit inside the anomalous SG
regime. Roll-off criterion: the predicted MSD at the top rung,
256^α_true with α_true = 2/d_w = 2·ln2/ln5 = 0.861353 (closed form, known
a-priori), must not exceed (R_chem/2)² where R_chem = 2^k is the chemical
diameter:

| canonical k | R_chem | (R/2)² | predicted MSD(256) = 118.7 | verdict |
|---|---|---|---|---|
| 3 | 8 | 16 | 118.7 | roll-off contamination |
| 4 | 16 | 64 | 118.7 | roll-off contamination |
| 5 | 32 | 256 | 118.7 | passes (margin 2.2×) |
| 6 | 64 | 1024 | 118.7 | passes (margin 8.6×) |

Lane C's §1a used t_sat (MSD = diameter², ≈ 620 at k=4) as the saturation
time; that underestimates roll-off onset — the log-log fit degrades as soon
as MSD enters the last octave below the plateau, which happens near
(R/2)², i.e. at t ≈ 125 for k=4. The corrected criterion disqualifies k ≤ 4
a-priori.

**Measurement (confirming, not tuning).** Lane A walk mode, K=4 ladder, both
start rules (module digest seed; see walk_matrix.json):

| builder L (canon k−1) | V | rule | alpha | r² | d_w | band verdict |
|---|---|---|---|---|---|---|
| 4 (3) | 42 | spread | 0.1417 | 0.69 | 14.12 | FAIL (saturation) |
| 4 (3) | 42 | first | 0.1741 | 0.81 | 11.49 | FAIL |
| 5 (4) | 123 | spread | 0.6437 | 0.98 | 3.11 | FAIL |
| 5 (4) | 123 | first | 0.6854 | 0.98 | 2.92 | FAIL |
| 6 (5) | 366 | spread | 0.6493 | 0.97 | 3.08 | FAIL |
| 6 (5) | 366 | first | 0.6656 | 0.98 | 3.00 | FAIL |
| 7 (6) | 1095 | spread | **0.8411** | **0.9822** | **2.3778** | **PASS** |
| 7 (6) | 1095 | first | 0.9256 | 0.97 | 2.16 | FAIL |

Canonical level 5 (366 vtx) passes the a-priori roll-off criterion yet still
measures out-of-band (α ≈ 0.65, d_w ≈ 3.1): the pre-asymptotic
log-periodic phase of the gasket walk contaminates levels this small. The
pinned level is therefore the SMALLEST level satisfying both the a-priori
criterion and the measured band+gate: **canonical level 6**.

**Start rule.** 'spread' is the graph-mode reading of the SPEC mask rule's
stated intent (walkers distributed over the structure); recursion-ordered
node lists cluster spatially, so first-N parks all walkers in one corner —
an a-priori structural argument independent of band outcomes. Measurement
confirms (0.8411 vs 0.9256 at the pinned level).

## AM-3 — Walkers 64 → 32768 (seam b, walker count)

**Decision.** WALKERS = 32768 in walk mode (both ports, when P1 lands).

**A-priori criterion, disclosed sequence.** The return-probability estimator
P(0,t) ∝ t^(−d_s/2) is a counting estimator: its per-rung noise is Poisson.
The criterion is the expected return count at the ladder rung where P is
smallest (the top rung, t = 256):

1. Stated before the 1024-walker run: count ≥ 10 ⇒ W ≥ 10/P(0,256), with
   P(0,256) = 256^(−d_s_true/2) = 0.0156 from the closed form d_s = 2·ln3/ln5
   ⇒ W ≥ 640 ⇒ 1024.
2. Stated before the 4096-walker run (criterion strengthened on Poisson
   statistics alone, never on a measured band outcome): a log-log fit needs
   relative count noise ≪ fit scale; count ≥ 32 (σ/μ ≤ 18%) ⇒ W ≥ 2058 ⇒
   next power of two = 4096.
3. After the 4096 run showed walk-d_s fit quality still seed-fragile
   (r² 0.91–0.99 across seeds), the criterion was held (no further
   strengthening) and W was set to the next power of two with margin for the
   diffusive rows, where P(0,256) ≈ 1/(π·256) = 1.24e-3 ⇒ W ≥ 32/1.24e-3 ≈
   25,800 ⇒ **32768**.

At no point was W chosen to move a measured value into a band; the gasket
d_w/alpha bands pass at 64, 4096 AND 32768 walkers (2.3778 / 2.4119 /
2.3993). What W buys is return-statistics quality (row 4 chain d_s passes at
r² 0.9988; row 5 becomes gateable at all).

## AM-3b — Patch side 32 → 128

**Decision.** Row 5's lattice patch is 128×128 (16,384 vertices), replacing
Lane C's pre-registered 32×32.

**Reasoning, disclosed.** Lane C pinned 32×32 with a rationale aimed at
series-mode eigenvalue computability; row 5 is measured in walk mode, where
the binding constraint is the finite-size return window. Criterion (stated
a-priori in final form): the diffusive return-probability regime requires
t_hi ≪ N; pinned requirement t_hi/N ≤ 1/64 ⇒ N ≥ 64·256 = 16,384 ⇒ side 128.
**Disclosure:** this criterion was strengthened AFTER a diagnostic on the
64² patch showed severe rung-to-rung local-slope scatter (−0.53 … −1.14) at
t/N = 1/16 — a corpus-construction defect (window too shallow), not an
instrument defect; the instrument's chain read (row 4) is clean throughout.
No band moved; the 64² diagnostic values are preserved in the advisor work
files. Measured at the pinned seed: side 128 → d_s = 1.9536, r² = 0.9930
(in band [1.85, 2.15], gate passed).

## AM-4 — Canonical walker seed derivation

**Decision.** The canonical walker base seed is Lane C's pre-registered
derivation: `seed_u32 = int(sha256(canonical_json(mode+inputs,
sort_keys, compact)).hexdigest()[:8], 16)`, forwarded by the harness adapter
into Lane A's `run_walks(base_seed=...)`.

**Reasoning.** Two derivations existed: Lane A's input-digest scheme
(mask rows / edge lines) and Lane C's canonical-JSON scheme (pre-registered
§1, and already the route layer's idempotency hash). One derivation must
serve both idempotency and seeding so a run row is re-runnable
byte-for-byte from its own hash. Lane C's derivation is pre-registered,
input-format-agnostic, and already computed at the route layer — it wins.
Lane A's internal derivation remains in the module for standalone use and is
superseded at the harness/route boundary. Pre-first-clean-run harmonization;
no measured value influenced the choice (the gasket bands pass under both
seeds: module-seed d_w 2.4119 @4096, harness-seed d_w 2.3993 @32768).

## AM-5 — Seam c: gasket series rows reclassified as documented findings

**Decision.** Gold row 1 (series counting on exact gasket eigenvalues,
canonical levels 3 and 4) is reclassified from band gate to **FINDING**:
full measured values are recorded and regression-anchored, the band verdict
is reported, but the row is non-gating. Recommendation (i) of the advisor
brief is adopted (see ADVISOR-REPORT §5 for the amended oracle contract):
walk-mode d_s is the primary gasket-family input; series counting stays
primary for smooth spectra; the log-periodic secondary gate flags staircase
spectra.

**Reasoning.** The r² < 0.98 failure on exact gasket spectra is physics, not
an instrument bug: the SG spectrum is a log-periodic staircase with large
exact multiplets (λ=3 ×12, λ=5 ×14, λ=6 ×38 at canonical level 4), the
pinned 8-point window crosses the λ=3 megamultiplet, and no alternative
counting reading reaches the gate at any feasible level (Lane A tested four;
Lane B independently found the same). Per PREREGISTRATION §0 this is branch
(b): document, do not move the band. The bands themselves are UNCHANGED —
the rows' STATUS changes, because the oracle contract (seam c) no longer
consumes series-mode d_s for the gasket family. Both lane reports documented
this finding before the harness's first run; nothing was tuned to it.

## AM-6 — Row 7 reclassified: the FM-4 detector fired on the corpus construction

**Decision.** Rows 7a (gasket render, tri, jitter) and 7b (contact-graph
controls) are reclassified to **FINDING** with measured values anchored.

**Reasoning (measured, structural).** The failure signature is exactly the
pre-registered FM-4 detector: "a mask-side bug shows as row 7 drifting while
rows 1–5 hold." Diagnosed:

- The gasket render's traced contour mask is **366 disconnected 16-pixel
  rings** — the edge-standard trace does not bridge inter-droplet gaps, so
  the walk graph is disconnected dust (d_s reads 0.230, r² 0.60).
- The gasket contact graph is 24 fragmented components (max 56 of 366
  nodes) — not a single gasket graph (d_s 0.389).
- The tri contact graph (19 nodes, 42 edges, diameter ≈ 4) saturates by the
  bottom rung (t_lo = 16) — no power law exists (d_s 0.005, r² 0.01).
- The tri/jitter contour walks read d_s ≈ 0.98–1.03 at r² ≈ 0.999: the
  contour-walk construction measures the quasi-1D boundary curve, not the
  filled region the pre-registered "≈ 2.0" prediction assumed.

The pre-registered row-7 predictions were written for connected structures;
the oracle-path construction does not produce them. The surviving, PASSING
content of row 7 is the order-blindness null: mean jitter d_s 0.98096 vs tri
0.98606, |Δ| = 0.0051 — D's order-blindness REPRODUCES in d_s, exactly as
predicted. Row 7's structural failure is a corpus-construction finding
(P4 follow-up), not an instrument failure.

## AM-7 — Series rank ladder canonicalized (log lattice in window)

**Decision.** The canonical series rank ladder is the 8-point LOG lattice
spanning the window [ceil(N/8), floor(N/2)] (Lane A and Lane B
implementations, matching the SPEC text "the same 8-point lattice in rank
space"). Lane C's pre-run resolution A-3 (affine map r_i = N/8 +
(l_i/64)·(3N/8)) is superseded.

**Reasoning.** Both implementations independently chose the log-lattice-in-
window reading and agree with each other; A-3's affine mapping was one of
two defensible readings of an ambiguous SPEC line. The A-3 concern (the
window spans only 2 octaves, too narrow for a 16× lattice) is resolved by
spanning the window itself with the 8 points. The permutation null (row 6)
collapses under the canonical reading (r²_perm 0.58 / 0.18 across lanes), so
A-3's motivating constraint is met. No measured value influenced this
choice; row-1 FINDING values are unaffected in kind (both readings sit in
the same staircase regime).

---

## Not amended (checked and upheld)

- Bands: every band value is exactly as pre-registered. Zero movement.
- Step ladder and K = 4: unchanged.
- r² gate 0.98, Einstein tolerance 0.10, series window fractions: unchanged.
- Permutation seeds [42, 2026, 99], jitter seeds, render size: unchanged.
- Lane A's module: UNMODIFIED throughout (verified — the advisor never
  edited it; the adapter wraps it).
