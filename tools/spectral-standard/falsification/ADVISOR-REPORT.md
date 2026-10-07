# ADVISOR REPORT — spectral-standard-v1 integration (2026-10-06)

Advisor/integrator lane for the spectral-standard-v1 parallel build. Inputs:
SPEC (`session/SPEC-spectral-oracle-2026-10-06.md`), Lane A (Python source of
record), Lane B (JS port), Lane C (falsification harness + integration
contract). Companion document: `amendments-spectral-2026-10-06.md` (AM-1…
AM-7, all pre-first-clean-run, no band moved). **No repo was pushed and no
API was called** — everything below ran locally.

---

## 1. Verdict

**GO for the PR**, with Lane B landing behind two small patches (P1, P2) or
with its known defects documented in the PR body — the Python source of
record, the harness, and the anchors are clean and reproducible.

| Battery | Result |
|---|---|
| Lane A selftest | **42/42 PASS, exit 0** (~6 s) |
| Lane B `node --test` | **38/38 PASS, exit 0** |
| mulberry32 cross-parity | **BIT-EXACT** (4096 draws × seeds 0/1/42/12345, IEEE-754 equality) |
| Seed-42 walk replay cross-port | **node-identical** (Lane B PRNG over Lane A's L7 fixture: 1095 vtx / 2187 edges / 256 steps) |
| As-delivered harness vs Lane A | **exit 4 (FM-12)** — surface mismatch, documented §4 |
| Amended harness (adapter) first clean run | **15/15 rows PASS** (7 as documented FINDINGs) → **anchors written** |
| Anchored selftest | **61/61 PASS, exit 0** (all anchors reproduce at 1e-9) |

## 2. The three seams — canonical resolutions

### Seam (a): gasket graph construction → **corner-merged is canonical**

- **Lane A's evidence wins** (it measured both constructions with the
  finished instrument): the SPEC-literal 3^level corner-joined pre-gasket
  reads eigen d_s 1.2085 (L3) / 1.2618 (L4) — outside the pre-registered
  [1.295, 1.435] — and walk d_w ≈ 2 (diffusive) at levels 5–6, far outside
  [2.20, 2.45]. Lane B independently measured 1.2085 / 1.3281 and walk
  d_w 2.71 on the same construction. The corner-merged gasket satisfies all
  three closed forms (d_f = ln3/ln2, d_w = ln5/ln2, d_s = 2·ln3/ln5) — the
  corner-insertion edges of the pre-gasket break the 5/2 resistance
  renormalization that produces them. The pre-gasket is kept as
  `sierpinski_triangle_graph` (A) / `gasketPreGraph` (B) with the measured
  disqualification in its docstring.
- **Canonical level naming** (AM-1): SPEC level k = 3^k cells;
  V = (3^(k+1)+3)/2, E = 3^(k+1). SPEC L3 → 42 vtx / 81 edges; SPEC L4 →
  123 / 243. Lane C's generator `gasket_graph(k)` matches directly; Lane A's
  builder argument is offset by one (`sierpinski_gasket_graph(k+1)`).
- **Builder equality verified**: Lane A `sierpinski_gasket_graph(4)` vs
  Lane C `gasket_graph(3)` — identical V/E and Laplacian spectra to
  **8.7e-13** (and 4.5e-13 at canonical level 4). Same graph.
- **Lane B defect found (P2)**: `gasketIdentifiedGraph` computes union-find
  merges but **never applies them to the edge list** — it returns the
  disjoint union of 3^L triangles (V = 81, E = 81, every vertex degree 2 at
  L3; disconnected). Its report and fixture label this "42 vtx G_3", and its
  parity test passed vacuously (asserted n == fixture n, both 81). All Lane
  B walk/series fixtures that matter use `gasketPreGraph` (correct
  pre-gasket) or the grid, so **no gold number changes** — but the
  identified-graph deliverable is wrong until P2 lands.

### Seam (b): walk gold → **canonical level 6, start rule 'spread', 32768 walkers**

Decided from measurement under an a-priori criterion, logged as AM-2/AM-3
with the full disclosure sequence.

- **A-priori roll-off criterion** (stated before reading any measured
  alpha): predicted MSD at the top rung, 256^α_true = 118.7 (α_true =
  2·ln2/ln5 = 0.861353, closed form), must be ≤ (R_chem/2)². This
  disqualifies canonical levels ≤ 4 a-priori and corrects Lane C's §1a
  (which used t_sat = MSD=diameter² and thereby underestimated roll-off
  onset). Lane C's pre-registered level 4 fails this criterion before any
  measurement.
- **Measurement matrix** (Lane A walk mode, K=4 ladder, both start rules;
  full table in `work/walk_matrix.json`): canonical levels 3/4/5 FAIL under
  both rules (α 0.14–0.67, d_w 2.9–14); canonical level 5 passes the
  a-priori criterion yet still measures out-of-band (α ≈ 0.65 —
  pre-asymptotic log-periodic phase contamination). **Canonical level 6
  (V=1095) + 'spread' is the smallest level×rule that passes**: α = 0.8411,
  d_w = 2.3778, r² = 0.9822 at 64 walkers (Lane A's registered value,
  reproduced); 'first' at the same level FAILS (0.9256).
- **Walker count 64 → 32768** (AM-3): a-priori return-count criterion
  (expected returns ≥ 32 at the smallest-P ladder rung; diffusive
  P(0,256) ≈ 1/(π·256) ⇒ W ≥ ~26k). The gasket d_w/alpha bands pass at 64,
  4096 AND 32768 walkers — the amendment buys return-statistics quality,
  not band entry. Final anchored values: **d_w = 2.399315 (r² 0.999954)**,
  **α = 0.833571 (r² 0.999954)**.
- **Consequence adopted**: at 32768 walkers, walk-mode d_s finally gates on
  r²: chain d_s = 0.9488 (r² 0.9988, band [0.9,1.1] PASS); patch (128²)
  d_s = 1.9536 (r² 0.9930, band PASS). Walk-mode d_s on the gasket measures
  1.14–1.25 at high statistics (r² ≥ 0.98 at 4096) — a documented
  pre-asymptotic bias vs the closed form 1.36521 (see §5 contract line).
- **Patch side 32 → 128** (AM-3b, corpus fix): the 64² patch's return curve
  showed rung-to-rung slope scatter (−0.53…−1.14) at t/N = 1/16; at t/N ≤
  1/64 (128²) it reads in-band and past the gate.

### Seam (c): counting r² < 0.98 on gasket spectra → **recommendation (i), adopted**

This is a real instrument finding, not a bug: the SG spectrum is a
log-periodic staircase with large exact multiplets; the pinned 8-point
window crosses the λ=3 megamultiplet; Lane A tested four counting readings
(none reach r² ≥ 0.98 at any feasible level) and Lane B independently
confirmed. Gold #8 confirms the wiggle is real (7 octave bands, 4
alternations — reproduced by the harness exactly as pre-anchored).

**Decision: option (i).** Walk-mode d_s becomes the primary oracle input
for the gasket family; series counting stays primary for smooth spectra
(chains, lattice patches, PSDs); the staircase is handled by the
log-periodic secondary gate. A multiplet-aware estimator is a v1.1 spec
change (major bump) and is listed out of scope (P4).

## 3. Cross-parity results (exact deltas)

1. **mulberry32**: bit-exact between Lane A (Python) and Lane B (JS) —
   4096 draws per seed for seeds 0, 1, 42, 12345 compared as exact IEEE-754
   doubles (zero mismatches). Lane A's selftest independently verified its
   implementation against node-generated ground truth; Lane B's fixture
   anchors agree with Lane A's truth table.
2. **Seed-42 walk trace**: Lane A's fixture (`walk_seed42`: merged gasket
   builder L7 edge list, 257-position node sequence from node 0) replayed
   in node with **Lane B's** `mulberry32` over Lane A's adjacency:
   **node-identical**. The PRNG + step rule (one draw per move,
   `floor(r·deg)`, deg-0 consumes no draw, sorted adjacency) are
   cross-port exact.
3. **Walk-stream convention divergence (real seam, resolved)**: Lane A uses
   per-walker streams `mulberry32((base_seed + i) & 0xFFFFFFFF)` with
   spread/first start rules; Lane B uses ONE shared `mulberry32(seed)`
   stream with `start = w % n`. These are different pinned conventions —
   byte-parity of full walk ensembles between the current ports does NOT
   hold (both are internally deterministic and both measure in-band, so no
   measured verdict changes). **Canonical = Lane A's convention** (Python
   is the source of record; house rule: on mismatch the JavaScript is wrong
   until proven otherwise). Lane B rework = follow-up patch **P1**.
4. **Seed-derivation divergence (resolved, AM-4)**: Lane A derives its base
   seed from an input digest; Lane C pre-registered
   `sha256(canonical_json)[:8]`. Canonical = Lane C's (pre-registered,
   input-format-agnostic, already the route layer's idempotency hash — one
   hash serves idempotency AND seeding). The adapter forwards it into
   `run_walks`; Lane A's internal derivation remains for standalone use.
5. **Series semantics**: both lanes consume the series AS GIVEN (no
   internal sort) — the permutation null collapses under both (r²_perm
   0.585 / 0.181). Minor divergence: Lane A computes the true prefix count
   #{j ≤ r: x_j ≤ x_r}; Lane B hard-codes N = r (identical for ascending
   input, differs on permuted input). Canonical = Lane A's true prefix
   count; folded into P1.
6. **Rank-ladder divergence (resolved, AM-7)**: Lane C's pre-registered
   A-3 affine ladder vs both implementations' 8-point log lattice spanning
   [ceil(N/8), floor(N/2)]. Canonical = the log lattice (both
   implementations agree with each other and with the SPEC text); A-3's
   motivating constraint (permutation null must be failable) holds under
   it.
7. **Pinned walk ladder**: identical on both sides —
   [16, 24, 36, 52, 80, 116, 172, 256] (K = 4 × [4,6,9,13,20,29,43,64]).

## 4. Harness results

**As-delivered run** (Lane C harness, `--module` Lane A): exit **4**,
FM-12 surface mismatch — precisely: the harness discovers
`walk_mask`/`walk_graph`/`series`/`einstein` and passes
`(steps, walkers, seed)` kwargs; Lane A exposes
`measure_walk_mask`/`measure_walk_graph`/`series_fit`/`measure_series`/
`einstein_verdict` with pinned internal parameters and different output key
names (`alpha_msd_r2` vs the harness's `alpha_r2` alias list); Lane A also
requires coords for explicit graphs. Documented for follow-up; never
silently worked around.

**Caller-side fix (only)**: `harness_adapter.py` (in
`work/harness/`, ships as `falsification/harness_adapter.py`) delegates
EVERY number to Lane A's own functions — it forwards the harness's walkers
and seed into `run_walks`, checks `steps` against the module's pinned
ladder, applies Lane A's start-rule convention, remaps output keys, and
raises on coord-less graphs. Lane A's module was **never edited**
(sha-identical copy in the workbench).

**Two harness-side corrections** during integration (caller-side, logged):
row 6 / row 8 rebuilt their own canonical-level-4 graph after the walk-gold
level changed (they had assumed `edges4` was that graph); row 4/5 call
sites now pass the route-contract coords.

**Final gold table** (amended harness, first clean run — full text in
`work/harness/gold_table_final.txt`):

| ST | Row | Measured | Band | r² | Verdict |
|---|---|---|---|---|---|
| FINDING | row1-L3-d_s | 1.334812 | [1.295,1.435] in-band | 0.9467 | AM-5 staircase finding |
| FINDING | row1-L4-d_s | 1.493125 | OUT | 0.9601 | AM-5 staircase finding |
| PASS | row2-d_w | **2.399315** | [2.22193,2.42193] | **0.999954** | walk gold (canon L6, spread, 32768w) |
| PASS | row3-alpha_msd | **0.833571** | [0.82135,0.90135] | **0.999954** | walk gold |
| PASS | row4-chain-d_s | 0.948750 | [0.90,1.10] | 0.998814 | walk d_s gates at 32768w |
| PASS | row5-patch-d_s | 1.953583 | [1.85,2.15] | 0.992962 | 128² patch (AM-3b) |
| PASS | row6-permutation-null | min gap 0.083, r²_perm 0.58/…/collapse | all 3 seeds collapse | — | null failable |
| FINDING | row7a-gasket-render-d_s | 0.230451 | OUT | 0.5956 | AM-6: FM-4 fired (366 disconnected 16-px rings) |
| FINDING | row7a-tri-d_s | 0.986063 | OUT | 0.9991 | AM-6: contour walk reads quasi-1D boundary |
| FINDING | row7a-jitter-d_s | mean 0.980962 | OUT | — | **order-blindness null REPRODUCED** (\|jitter−tri\| = 0.0051) |
| FINDING | row7b-contact-gasket-d_s | 0.389096 | OUT | 0.9711 | AM-6: contact graph = 24 fragmented components |
| FINDING | row7b-contact-tri-d_s | 0.005137 | OUT | 0.0142 | AM-6: 19-node graph saturates below t_lo |
| PASS | row8-log-periodic | present=True | 7 bands / 4 alternations | — | matches pre-anchored A-7 values exactly |
| PASS | determinism-rerun | bitwise-identical | — | — | FM-5 clean |
| PASS | fm11-einstein-wrongD-flip | verdict=inconsistent | — | — | no trivially-consistent oracle |

15/15 rows passed (7 as documented FINDINGs) → `--write-anchors` filled
`anchors_spectral.json` (`_status: anchored-first-run-2026-10-06`), and
`--selftest` reproduced every anchor at 1e-9: **61/61, exit 0**.

Notable physics findings recorded along the way (all in the anchors/work
files): walk-mode d_s on the gasket carries a pre-asymptotic bias
(1.14–1.25 vs 1.36521) even at high walker counts; series mode on the
closed-form 32² grid spectrum reads 2.47 (same staircase class) — series
counting is genuinely only trustworthy on smooth spectra, reinforcing the
seam-c decision.

## 5. Amended oracle contract (v1, as amended — verbatim)

> **d_s estimator routing (seam c, AM-5).** For spectra flagged
> log-periodic (secondary gate present) — the Sierpiński-gasket family and
> any staircase spectrum — the primary d_s is the WALK-mode return-
> probability fit, P(0,t) ∝ t^(−d_s/2), at the pinned walker count and
> ladder. For smooth spectra (chains, lattice patches, PSDs) the primary
> d_s is the series counting fit, d_s = 2·α_λ, over the pinned rank window.
> A gasket-family series measurement is always reported with
> `low_confidence: true` and is never gated. The Einstein gate consumes
> d_s from the primary estimator of the input's family; on gasket-family
> inputs at v1 walker statistics the walk d_s carries a documented
> pre-asymptotic bias (measured 1.14–1.25 vs closed form 1.365212), so
> verdicts on gasket inputs are expected `insufficient` (low confidence) or
> `inconsistent` (bias) — **verdicts are data, never authorization.**

Division of labor:

- **D**: computed by the caller (edge-standard's box-counting measure),
  stamped `source: caller`, NEVER back-solved from the walk (FM-11; the
  harness's wrong-D flip check passes).
- **d_w, alpha_msd (and walk d_s)**: computed by the spectral walk (Lane A
  module / JS port) from the pinned ladder, walkers, PRNG, and seed
  derivation.
- **series d_s**: computed by the series counting fit (same modules).
- **Einstein gate**: lives in the spectral module
  (`einstein_verdict` / `einsteinVerdict`), invoked by the /oracle route
  composer with the caller's D; verdict `consistent` iff
  |d_s − 2·D/d_w| ≤ 0.10 with all three inputs at r² ≥ 0.98, else
  `insufficient` (any missing/low-confidence input) or `inconsistent`.
- **`POST /api/jev/corpus/oracle` returns verbatim** (Lane C INTEGRATION §1,
  blessed unchanged, one run row per image):
  `{mode:"oracle", edge:{D, r2, counts, scales, ...}, spectral:{d_w,
  d_w_r2, d_s, d_s_r2, alpha_msd, log_periodic}, einstein:{d_s,
  two_D_over_d_w, delta, verdict}, run_id, run_row_id, policy_version}` —
  machine fields unrounded, rendered decimals from one shared `fmt()` in
  separate `_str` fields.

## 6. Files that land on the PR branch

Layout `tools/spectral-standard/` (repo: yubi-OS/yubiOS):

| File | Source | Status |
|---|---|---|
| `spectral_standard.py` | Lane A | **land as-is** (unmodified) |
| `fixtures_spectral.json` | Lane A | land as-is |
| `gen_fixtures.py` | Lane A | land (provenance) |
| `jev-spectral-math.js` | Lane B | land **after P1+P2** (or land with the two defects called out in the PR body and fixed in a stacked PR) |
| `spectral_fixtures.json` | Lane B | regenerate post-P1/P2 |
| `gen_fixtures.mjs` | Lane B | land |
| `test_parity_spectral.test.js` | Lane B | land; strengthen the identified-graph asserts with P2 |
| `package.json` | Lane B | land |
| `INTEGRATION.md` | Lane C | land (route wiring + oracle composition; §3 one-run-row blessed) |
| `falsification/PREREGISTRATION-spectral-2026-10-06.md` | Lane C | land, with AM-1…AM-7 referenced |
| `falsification/harness_spectral.py` | Lane C + AM edits | land (amended copy in `work/harness/`) |
| `falsification/harness_adapter.py` | advisor | land (new; caller-side surface adapter) |
| `falsification/anchors_spectral.json` | Lane C | land **anchored** (first clean run; `_status: anchored-first-run-2026-10-06`) |
| `falsification/ADVISOR-REPORT.md` | advisor | this report |
| `falsification/amendments-spectral-2026-10-06.md` | advisor | the amendments log |

Not landed: Lane C's console-card sketch (§7, deferred by its own terms);
powered-lens/router/intake (SPEC out-of-scope list).

## 7. Follow-up patches (explicitly OUT OF SCOPE here)

- **P1 — Lane B walk-stream rework.** Port Lane A's pinned walk convention:
  per-walker streams `mulberry32((base_seed + i) & 0xFFFFFFFF)`, base seed
  from `sha256(canonical_json)[:8]` (AM-4), start rules spread (graphs) /
  first (masks), true prefix counting in series mode. Regenerate
  `spectral_fixtures.json` and update the walk tests. All Lane B walk
  fixtures are currently at the shared-stream/64-walker convention and must
  be regenerated at 32768 walkers (AM-3).
- **P2 — Lane B `gasketIdentifiedGraph` fix.** Apply the union-find merges
  to the edge list (or rebuild by subdivision with a shared-vertex map).
  Expected: V = 3, 6, 15, 42, 123; regenerate `gasket_g3_identified_eigs`
  (currently 81 vtx / 81 edges, mislabeled); fix REPORT.md's "42 vtx" claim;
  strengthen the test to assert absolute vertex counts, not fixture echo.
- **P3 — Route wiring + deploy** (post-PR): implement
  `/api/jev/corpus/spectral/walk|series`, `/oracle`, `/selftest` per
  INTEGRATION.md; deploy via steady-orbit-deploy; live-verify every route
  per §5 (wait out the ~20 s stale window, assert run rows + policy_version
  + parity |d_w^route − d_w^py| ≤ 1e-9).
- **P4 — v1.1 candidates (each a major bump)**: multiplet-aware series
  estimator or widened series window for staircase spectra; longer/doubled
  ladder for the walk d_s return fit (pre-asymptotic bias);
  contour-connectivity fix for the row-7 oracle path (bridge inter-droplet
  gaps or walk fill masks instead of contours); walk-mode d_s on gaskets to
  closed-form agreement.
- **P5 — row-7 corpus rebuild**: connected render constructions (fill masks
  or gap-bridged traces) so rows 7a/7b can gate as originally intended.

## 8. Evidence index (this session, no repo writes)

- `session/subagent/advisor/amendments-spectral-2026-10-06.md` — AM-1…AM-7
- `session/subagent/advisor/work/walk_matrix.json` — seam-b measurement matrix
- `session/subagent/advisor/work/harness/` — harness workbench: amended
  harness, adapter, Lane A module copy (unmodified), anchored
  `anchors_spectral.json`, `gold_table_run1.txt` (4096w), 
  `gold_table_run2.txt` (32768w, pre-row7-reclass), `gold_table_final.txt`
- `session/subagent/advisor/work/b_dump.json`, `b_replay.json`,
  `dump_b.mjs`, `dump_replay.mjs` — cross-parity artifacts
- Lane originals (read-only): `session/subagents/ses_eef1bca67ffe…/lane-a/`,
  `…ses_eef1bca76ffe…/lane-b/`, `…ses_eef1bca15ffe…/lane-c/`
