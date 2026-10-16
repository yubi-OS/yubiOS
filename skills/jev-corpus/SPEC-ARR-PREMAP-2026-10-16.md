# SPEC: arrangement-response-v1 (Line A) and premap-v1 (Line B)

Date: 2026-10-16. Status: session-only build spec. Building this changes nothing on the steady-orbit worker. Parents: tools/lens-standard/falsification/ARRANGEMENT-RESPONSE-2026-10-06.md (source of record: tools/lens-standard/arrangement_warp.py), refs/hierarchy-router-2026-10-06.md, session/arr-premap/feasibility-check-2026-10-16.md, session/arr-premap/ideate-solo-arr-premap-2026-10-16.md.

## 0. Rules every lane follows

1. No worker contact. No network calls to Cloudflare, no KV, no D1, no deploy. Tests run offline in node 24 and python3.
2. Deps-injected modules. A deliverable module takes its dependencies as arguments and never imports an absolute path. A test file may import the staged real modules by absolute path (see section 0.1).
3. Pinned constants are copied, not retuned (section 1). A change needs an amendment logged before the re-run.
4. Fail closed. Invalid input throws a typed error that the route maps to 422 with a code. A stage that cannot measure returns an explicit status, never a silent null.
5. Output is data. Nothing here dispatches, approves, or routes.
6. Writes. Lane outputs go to session/subagent/arr-premap/<lane>/. The advisor copies them to session/arr-premap/build/.
7. Style. No em dashes in any file. Contractions in prose.

### 0.1 Staged inputs (read only)

- Real JS ports: /var/workspace/session/arr-premap/work/tools/
  - lens-standard/jev-lens-math.js (exports genGasket, genTri, renderDisks, warpMask, measureD, checkCoef, goldRender, trefoilBeta is NOT exported)
  - spectral-standard/jev-spectral-centroid.js (exports bowyerWatsonDelaunay)
  - spectral-standard/jev-spectral-math.js (exports graphFromEdges, randomWalks, walkDimensions, mulberry32)
  - edge-standard/jev-edge-standard.js (exports standardize, measure)
  - edge-standard/jev-taste-math.js (imported by edge-standard)
- Python sources of record: /var/workspace/session/arr-premap/work/py/tools/
  - lens-standard/lens_standard.py (gen_gasket(size, L, r, depths), gen_tri, _forward_point, warp_mask, render_disks, measure_D)
  - lens-standard/arrangement_warp.py (arrangement_warp, to_rows, walk_dw, run_arm)
  - spectral-standard/centroid_walk.py, spectral-standard/spectral_standard.py
  - edge-standard/edge_standard.py
- Ran and reproduced the record: work/py/repro.py, work/bench/matrix_js.mjs. Use them as references.
- Import from a test file, for example: `import { genGasket } from '/var/workspace/session/arr-premap/work/tools/lens-standard/jev-lens-math.js';`

## 1. Pinned constants and shared rules

- SIZE 512. CENTER 255.5 (= (SIZE-1)/2). ASTIG_KAPPA 0.5. MAX_ASTIG 0.5. MAX_SPHERICAL 0.3. MAX_TREFOIL 2.0e-4. TREFOIL_ZOOM_K 460. Spherical R2 = 256*256.
- Trefoil zoom: beta(t) = K|t| / (1 - K|t|) for t != 0, else 0.
- Gasket: GASKET_L 384, GASKET_R 3, depth parameter 1 to 6. Integer midpoint recursion identical to genGasket (JS) and gen_gasket (Python). Vertices deduped, keeping the coarsest depth. Counts: depth 1 to 6 give 3, 6, 15, 42, 123, 366.
- Tri: TRI_ROWS [3,4,5,4,3], TRI_A 52, TRI_DY 45, TRI_R 16 (all for SIZE 512).
- Walk: K 4. LADDER = [4,6,9,13,20,29,43,64] times 4. walkers 4096 default. seed 42 default. start rule 'spread'. Points rounded to 4 decimal places before the Delaunay and the walk.
- D: edge-standard-v1 through measureD (standardize, then measure with window 4 to 64, 8 scales). D_BAND = 0.05.
- Raster rule for a disk with float centre (cx, cy) and radius r: rows y from max(0, trunc(cy - r - 1)) to min(size-1, trunc(cy + r + 1)), and x likewise. A pixel is 255 iff (x - cx)^2 + (y - cy)^2 <= r^2. This matches Python to_rows and render_disks. The JS renderDisks in jev-lens-math.js is NOT valid for fractional centres (it throws), so any warped centre needs this rule. Integer-centre gasket renders are identical under both rules.
- Anchors (pinned, for tests): clean gasket D 1.558937 (4 dp 1.5589). Tri D 1.263595.

## 2. Line A: arrangement-response-v1

### 2.1 Lane A1, module `arrangement.js` and route module `arrangement-route.js`

`arrangement.js` exports:
- `forwardPoint(mode, c, dx, dy)` returns [dx2, dy2]. Same formulas as Python _forward_point: astig (1+c)dx, (1+0.5c)dy; spherical g = 1 + c(r^2)/R2 with r = hypot(dx,dy), output g*dx, g*dy; trefoil sx = dx + c(dy^2 - dx^2), sy = dy + 2c dx dy, z = 1 + beta(c), output z*sx, z*sy. Unknown mode throws.
- `renderDisksFloat(size, disks, gray = 255)` returns rows, following the section 1 raster rule.
- `arrangementWarp(disks, mode, coef, ty = 0)` returns { disks, dropped }. For each disk: dx = x - 255.5, dy = (y + ty) - 255.5, (ndx, ndy) = forwardPoint, nx = 255.5 + ndx, ny = 255.5 + ndy. Drop (count) if nx - r < 0 or nx + r > 512 or ny - r < 0 or ny + r > 512. Otherwise keep [nx, ny, r].
- `pixelWarpRows(rows, mode, coef, deps)` returns deps.warpMask(rows, mode, coef) (the deployed warpMask in jev-lens-math.js).
- `runArrangementResponse(input, deps)` returns the result object in section 2.2.
- `GATE_BANDS` = { A1: 0.05, A2_ratio: 3, A4: { anchor: 2.7812, band: 0.10 }, A5: { anchor: 1.558937, band: 1e-4 }, A6: 0.01 }.

Deps object: `{ measureD(rows) -> {D, r2}, walkDw(points) -> {d_w, d_w_r2}, warpMask(rows, mode, coef) -> rows, checkCoef(mode, coef) (throws on envelope), genGasket(size) -> disks, genTri(size) -> disks, walkDwCanonical?(points) -> {d_w} }`. walkDwCanonical is optional and enables gate A6.

`arrangement-route.js` exports `handleArrangementRequest(req, deps) -> { status, body }`, plus `handleArrangementSelftest(deps) -> { status, body }`.

### 2.2 Route contract

`POST /api/jev/corpus/arrangement/response`. Body (JSON object):
- `family`: "gasket" or "tri" (default "gasket"). Ignored when `disks` is present.
- `disks`: optional array of 1 to 800 entries, each [x, y, r] with x and y finite in [0, 512] and r a number from 1 to 64. Presence sets the family to "points".
- `arms`: optional array of 1 to 12 objects {mode, coef}. Default is the pinned matrix: astig 0.1, astig 0.2, trefoil 0.0001, trefoil 0.00015, spherical 0.06.
- `arm_types`: optional subset of ["arrangement", "pixel"]. Default both.
- `walkers`: integer 1 to 4096, default 4096. `seed`: finite number, default 42.

Response 200:
```
{ pipeline: "arrangement-response-v1", family, n_disks,
  clean: { D, D_r2, d_w, d_w_r2, low_confidence_d_w },
  arms: [ { arm_type, mode, coef, n_kept, dropped, D, dD,
            d_w, dD_w, low_confidence_d_w,       // arrangement arm only
            pixel_dD, ratio } ],                   // pixel arm dD, and ratio where defined
  gates: { A1: [...], A2: [...], A3: [...], A4, A5, A6: { status } },
  run_id }
```
The pixel arm reports D and dD only (no walk). `low_confidence_d_w` is true when d_w_r2 < 0.98.

Errors (422 unless noted): INVALID_FAMILY, INVALID_ARMS, INVALID_ARM_TYPES, INVALID_DISKS, INVALID_COEF (message from checkCoef), INVALID_WALKERS, INVALID_SEED; 413 TOO_MANY_DISKS; 500 MEASUREMENT_FAILED with the message. Never a silent null.

`GET /api/jev/corpus/arrangement/selftest` runs the lane A1 anchors (section 2.5) and returns { ok, checks: [{name, ok, detail}] }.

### 2.3 Gates (every gate result is a field, never a thrown error)

- A1, walk affine invariance. Applies to astig and trefoil arms. PASS if |dD_w| <= 0.05. Spherical is reported, not gated.
- A2, decomposition ratio. Applies where a pixel arm exists. PASS if |dD_arr| <= |dD_pix| / 3.
- A3, no drops. PASS if dropped == 0. Otherwise status "dropped" with the count.
- A4, walk anchor. Clean d_w within 0.10 of 2.7812.
- A5, D anchor. Clean gasket D within 1e-4 of 1.558937. Tri: within 1e-4 of 1.263595.
- A6, tie-break invariance. Status "not_measured" unless deps.walkDwCanonical is supplied. Then PASS if |dD_w(this) - dD_w(canonical)| <= 0.01 for every walk-measured arm.

### 2.4 Lane A2, canonical Delaunay candidate (session-only, diagnostic)

Files: `delaunay_exact.py` (stdlib Python) and `delaunay-exact.js` (ESM, BigInt).

Contract:
- Input: point list in input order. Round each coordinate to 4 decimal places first (the walk convention), then convert to an integer n = round(x * 10^4). Round half to even in Python. Write the JS rounding helper to match, and test it on exact .5 cases.
- Predicates: exact integer orientation and in-circle determinants (Python int, JS BigInt).
- Degeneracies: Simulation of Simplicity (Edelsbrunner and Mücke 1990) with the point index as the perturbation order. Document the sign rules in the file header. The DOI in the feasibility check is recalled from memory and unverified, so cite it as "Edelsbrunner and Mücke 1990, ACM TOG" in any output.
- Algorithm: incremental Bowyer-Watson with exact predicates. Output undirected edges, canonically sorted, no duplicates.
- Built-in validation: the Euler check E = 3n - 3 - h, and an exact empty-circumcircle check using the non-SoS test (ties allowed).

Required outputs, written to a report JSON:
1. Edge-set comparison on: the clean gasket; the five arm point sets (rounded to 4 dp); 20 seeded random sets of 40 to 300 points. Report symmetric differences against the recorded Python edge count (1025 on clean) and the deployed JS count (1031 on clean).
2. JS and Python canonical edge sets must match exactly on every set in item 1.
3. The walk (W 4096, K 4, spread, seed 42) on the canonical graph, clean and every arm, computed by the Python walk and the JS walk. The two must agree to 1e-9. Then the A1 verdict per arm under the canonical graph.
4. Pre-registration `PREREG-canonical-delaunay-2026-10-16.md`, written BEFORE step 3 runs. It states the candidate rule, the adoption rule (adopt only if item 2 holds on every set and A6 is defined), and how each outcome will be read.

### 2.5 Tests for lane A1 (`arrangement.test.mjs`, node --test)

Required (must pass):
- forwardPoint parity against a Python fixture. Lane A1 generates the fixture with _forward_point over at least 200 random (mode, coef, dx, dy) tuples. Tolerance 1e-12 relative.
- renderDisksFloat parity. The sha256 of the rows for astig 0.1 and trefoil 1e-4 equals the Python to_rows output sha256 for the same warped disks. Lane A1 computes the Python hashes.
- D anchors: clean 1.558937 within 1e-4, and each arm's D within 5e-5 of 1.5124 (astig 0.1), 1.4493 (astig 0.2), 1.5108 (trefoil 1e-4), 1.4909 (trefoil 1.5e-4), 1.5327 (spherical 0.06).
- Pixel-arm dD within 0.002 of Lane F's recorded values: astig 0.1 -0.094, astig 0.2 -0.276, trefoil 1e-4 -0.050, trefoil 1.5e-4 -0.092, spherical 0.06 -0.024. If the pixel arm fails this, report it as a finding and do not adjust the anchor.
- arrangementWarp drop counting on a constructed disk that crosses the edge.
- Validation: each error code from section 2.2.
- Gate logic with stub deps for each of A1 to A6, including the not_measured path for A6.
- handleArrangementSelftest returns ok:true when every anchor above passes.

Known-gap tests (must be present; must NOT be weakened or deleted):
- The walk anchor and per-arm d_w values, compared to the Python record: clean d_w 2.781185; dD_w astig 0.1 -0.0528, astig 0.2 -0.0597, trefoil 1e-4 +0.0112, trefoil 1.5e-4 -0.0110, spherical 0.06 -0.0479. Write each as `test(name, { todo: 'implementation-dependent Delaunay tie-break, see feasibility check section 3' }, fn)`. Node runs and reports these as TODO, so they do not claim parity. The JS port is expected to fail them. Record the actual values in the lane report.

## 3. Line B: premap-v1

### 3.1 Lane B1, module `premap.js`

Exports:
- `gasketTemplate(depth)` returns genGasket(512, 384, 3, depth) as [[x, y, r]...]. Parity: sorted site sets equal Python gen_gasket(512, depths=depth) for depths 1 to 6 (counts 3, 6, 15, 42, 123, 366), and each depth nests in the next.
- `templateSites(depth)` returns [[x, y]...] from gasketTemplate.
- `identifyLevel(points, { tol = 0.5, fracMin = 0.98, maxDepth = 6 })` returns { level, reason, by_depth: [{depth, N, f, c}] }. For each depth k: f_k = fraction of observed points within tol of some site of T_k; c_k = fraction of T_k sites within tol of some observed point. level = smallest k in 1..maxDepth with f_k >= fracMin. If none, level null and reason "no_template".
- `predictHoles(points, level, { tol = 0.5 })` returns the sites of T_level with no observed point within tol.
- `predictedBand(level, deps)`. If level != 6, return { status: "not_available", reason: "template_depth_below_6_low_confidence" }. If level == 6, measure the template with deps.measureD(renderDisksFloat(512, gasketTemplate(6))) to get D_T and r2_T. If r2_T < 0.98, return not_available with reason "template_r2_below_0.98". Otherwise { status: "measured", D_template: D_T, band: [D_T - 0.05, D_T + 0.05] }.
- `controlFill(points, level, count, rng)` returns `count` uniform random points in [0, 512)^2, excluding any point within 3 px of a template site of T_level. rng is an injected function returning a number in [0, 1). The lane uses mulberry32 from jev-spectral-math.js, or an identical copy with a parity test.
- `runPremap(input, deps)` returns the result object in section 3.2.

Deps object: `{ measureD, rng(seed), renderDisksFloat (optional, else the module's own) }`.

### 3.2 Route contract

`POST /api/jev/corpus/hierarchy/premap`. Body:
- `points`: array of 1 to 800 [x, y] pairs, finite, 0 <= x, y <= 512. Errors 422 INVALID_POINTS, 413 TOO_MANY_POINTS.
- `tol`: number in (0, 2], default 0.5. Error 422 INVALID_TOL.
- `measure`: boolean, default false. Error 422 INVALID_BODY otherwise.
- `seed`: finite number, default 42. Error 422 INVALID_SEED.

Response 200:
```
{ pipeline: "premap-v1", n_observed, tol,
  identification: { level, reason, by_depth },
  holes: { count, sites: first 400 },
  predicted_band: { status, ... },
  fill_measure: null | { D_observed, r2_observed, D_filled, r2_filled, D_control,
                         predicted_sign, realized_sign, control_sign,
                         sign_agree, control_agree, indeterminate },
  run_id }
```
fill_measure is computed only when measure is true, level is not null, and holes.count > 0. predicted_sign = sign(D_T - D_observed) when predicted_band.status is "measured" and |D_T - D_observed| > 0.05. Otherwise predicted_sign is "indeterminate", sign_agree and control_agree are null, and indeterminate is true. control_sign is sign(D_control - D_observed).

`GET /api/jev/corpus/hierarchy/selftest` runs: template counts and nesting; identification on fixed subsets (depths 4, 5, 6 at missing fractions 0.2, 0.4, 0.6, seed 1); negatives (tri and uniform random) return null; hole recovery is exact on depth-6 minus 40 percent; predictedBand policy (depth 6 measured, depth 5 not_available). Returns { ok, checks }.

### 3.3 Pre-registration (frozen; lane B2 writes PREREG-premap-2026-10-16.md before the harness runs)

Frozen values: tol 0.5; fracMin 0.98; D_BAND 0.05; template r2 gate 0.98; depths {4, 5, 6}; missing fractions {0.2, 0.4, 0.6}; seeds {1, 2, 3, 4, 5}.
Trials:
- Gasket trials: 3 depths times 3 fractions times 5 seeds = 45.
- Negatives: tri, 40 percent subsets, 5 seeds = 5. Uniform random sets with N in {42, 123, 366}, 5 seeds each = 15. Total negatives 20.
- Depth-6 fill trials with measure=true: 3 fractions times 5 seeds = 15.

Gates:
- P1 identification. Gasket trials: identified level equals the template depth for at least 43 of 45 (95 percent).
- P1n negatives. Level null on 20 of 20.
- P2 holes (bookkeeping). Predicted hole set equals the template sites absent from the observation (exact set equality, tol 0.5) on 45 of 45. Report this as bookkeeping, not as a finding.
- P3 fill sign. On the 15 depth-6 fill trials, sign_agree true for at least 14 of 15 (90 percent). Control_agree is reported, not gated.
- P4 (informational). predicted_band status for depths 4, 5, 6. Expected not_available, not_available, measured.

Scope statement the pre-registration must carry: at the identity frame, P2 holds by construction, and P3 checks that the template fill reproduces the template reading. Neither shows that premap fills improve real arrangements. Registration for real data is out of scope and is the first open gate in the report.

### 3.4 Harness `harness_premap.mjs`

Generates the trials with mulberry32 seeded per trial. Runs runPremap with the real staged measureD and renderDisksFloat, injected in the harness only. Writes `premap-results-2026-10-16.json` with per-trial rows and the P1 to P4 verdicts. The harness never reads or writes the worker.

### 3.5 Tests (lane B1: `premap.test.mjs`; lane B2: `premap-route.test.mjs` and a harness smoke test)

B1 required: template parity for depths 1 to 6; identification on the fixed selftest subsets; negatives; hole exactness; predictedBand policy; controlFill exclusion radius; route validation codes (422 and 413); fail-closed behavior.
B2 required: handler contract with stub premap deps; the harness runs 3 trials end to end without error.

## 4. Lane returns

Each lane returns: files written (paths), test counts (pass, fail, todo), exported names, parity results, open issues, and any amendment. A lane does not return until its required tests pass. Known-gap and TODO tests are the only permitted non-passing tests, and only as specified.

## 5. Advisor (integration, smart)

- Reconcile. Duplicated helpers (the float raster, forwardPoint, gasket template) go into one shared file, build/worker-candidates/shared/disks.js. The two lanes' private copies must hash identically, and the advisor checks that.
- Run every suite together: all node tests, the Python selftest for the A2 twin, and the harness. Record counts.
- Write `INTEGRATION-arr-premap-2026-10-16.md`. It holds the per-gate verdicts, restates the implementation-dependence finding with numbers, gives the P1 to P4 results, and lists what is not done.
- Write a diff-ready route wiring patch for jev-corpus-routes.js (delegate lines only) at build/worker-candidates/PATCH-routes.diff. Do not apply it to any deployed bundle.
- Write a deploy checklist (build/worker-candidates/DEPLOY-CHECKLIST.md): module parts to add, bindings (none new), run kinds (arrangement, premap), D1 impact (run rows only), the verification plan after approval, and the rollback path. The checklist is not executed.

## 6. Boundaries

- Always: pin constants, fail closed, log amendments before re-runs, keep TODO gap tests.
- Ask first (Jenny): any change to a deployed walk or Delaunay value, adopting the canonical Delaunay, any deploy, any real-data registration method, any change to the D window, L, the 0.98 gate, or the 0.05 band.
- Never: touch the worker, KV, D1, or any yubi-OS repo source. Retune a pinned constant after seeing output. Weaken or delete a failing gap test. Drop disks or points silently.

## 7. Success criteria

- Line A: the JS D leg reproduces the record for every arm to 4 dp. The pixel arm reproduces Lane F. Raster parity holds. The route, validation, and gates are implemented. If A2 completes, canonical edge parity holds JS to Python on every listed set. Gap tests are reported honestly.
- Line B: template parity 6 of 6. Gates P1, P1n, P2, P3, and P4 are computed and reported as pass or fail, with no silent nulls.
- Advisor: all suites green, the integration report and deploy checklist written, and nothing deployed.
