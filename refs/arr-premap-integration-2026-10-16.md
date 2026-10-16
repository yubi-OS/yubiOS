# INTEGRATION: arrangement-response-v1 (Line A) and premap-v1 (Line B)

Date: 2026-10-16. Author: advisor (integration lane). Session-only build. No worker, KV, D1, GitHub, or Cloudflare call. Nothing deployed. Offline runs only (Node 24.20.0, Python 3.14.7).

Output root: `session/subagent/arr-premap/advisor/`. The build-root copy (`session/arr-premap/build/`) was NOT written by the advisor, because the advisor write scope is `session/subagent/` only. The lead copies this root into `session/arr-premap/build/` (see section 7).

## 0. What is where

| Path (under advisor/) | Content |
|---|---|
| `lane-a1/`, `lane-a2/`, `lane-b1/`, `lane-b2/` | Unchanged copies of the lane outputs. `manifest.sha256` in each. Copy verified identical to the originals (diff -r). |
| `worker-candidates/shared/disks.js` | The one renderDisksFloat, forwardPoint, gasketSites, gasketTemplate (SPEC section 5). Tests: `shared/disks.test.mjs`. |
| `worker-candidates/arrangement/` | Line A candidate. arrangement.js imports the shared helpers. Lane tests unchanged. |
| `worker-candidates/premap/` | Line B candidate. premap.js (shared helpers, Amendment 1 floor, holes reason), premap-route.js (null-level holes), harness_premap.mjs (shared renderer), PREREG with section 8 amendment log. New tests: `premap-amendment1.test.mjs`, `premap-integration.test.mjs`. |
| `worker-candidates/glue/jev-arr-glue.js` | Deps builders for the two routes (deployed walk, deployed measure, shared renderer). |
| `worker-candidates/routes/jev-corpus-routes.js` | Patched copy of the deployed routes part (reference). |
| `worker-candidates/PATCH-routes.diff` | Diff for jev-corpus-routes.js (delegate lines only). `git apply --check` passes against the pre-deploy part. NOT applied. |
| `worker-candidates/parts-staging/` | Flat bundle staging: 60 deployed parts plus the 7 new or changed parts, with import rewrites. Used for the offline import check. |
| `worker-candidates/DEPLOY-CHECKLIST.md` | Deploy checklist. NOT EXECUTED. Delaunay section at the top. |
| `results/premap-results-2026-10-16.json` | The single frozen harness run (section 4). |
| `analysis/` | Scripts and JSON for T2 (raster parity), T6 (gate table), T9 (forced-edge classification). |
| `exploratory/` | Pre-declared readings (`PREDECLARED-T7-T8.md`, sha256 75e0ef22...), T7 and T8 scripts and JSON. |
| `logs/` | Every test and run log cited below. |
| `staged-inputs.sha256` | Hashes of the staged JS and Python sources of record (read only). |

## 1. Verdict per line against the SPEC success criteria (SPEC section 7)

### Line A: arrangement-response-v1

| Criterion | Result | Evidence |
|---|---|---|
| JS D leg reproduces the record for every arm to 4 dp | PASS | clean 1.558937; astig 0.1 1.5124136 (record 1.5124); astig 0.2 1.4492639 (1.4493); trefoil 1e-4 1.5108395 (1.5108); trefoil 1.5e-4 1.4908528 (1.4909); spherical 0.06 1.5327455 (1.5327). `analysis/gate-table.json`. |
| Pixel arm reproduces Lane F | PASS | pixel dD -0.094016, -0.275691, -0.050175, -0.092404, -0.024446 against record -0.094, -0.276, -0.050, -0.092, -0.024. |
| Raster parity (Python and JS, hash identical) | PASS | section 2. |
| Route, validation, gates implemented | PASS | A1 suite: 51 pass, 0 fail, 6 todo (the walk gap tests). |
| Canonical edge parity JS to Python on every listed set (if A2 completes) | PASS (lane-reported) | A2 report: 33 of 33 sets. The advisor reran the A2 Python selftest (48 of 48) and the A2 JS tests (13 of 13). The advisor did not rerun the 33-set edge-parity script. |
| Gap tests reported honestly | PASS | Six todo tests kept as todo. Measured values in section 3.2. |
| Walk leg reproduces the record | NOT MET | The walk verdicts depend on the deployed Delaunay defect (section 3). Under the canonical graph, A1 fails on all four gated arms. |

**Line A verdict.** GO for the D leg, the pixel arm, the raster, and the route. HOLD for the walk leg until Jenny decides the Delaunay question (section 8, decision 1).

### Line B: premap-v1

| Criterion | Result | Evidence |
|---|---|---|
| Template parity 6 of 6 | PASS | Counts 3, 6, 15, 42, 123, 366. Each depth nests in the next. Ordered output equals the staged genGasket at every depth (`analysis/raster-parity.json`, `gasket_template_checks`). |
| P1, P1n, P2, P3, P4 computed and reported as pass or fail, no silent nulls | PASS | Section 4. No error rows. Every verdict has its count. |
| Identity frame only; no claim about real arrangements | PASS | Scope stated in the PREREG (section 4 of the PREREG). Registration for real data not done. |

**Line B verdict.** PASS for the identity-frame gold MVP. Registration for real data is the first open gate, not done here.

### Advisor

| Criterion | Result |
|---|---|
| All suites green | PASS. Node: 290 pass, 0 fail, 6 todo (A1 walk gap tests). Python A2 selftest: 48 pass. |
| Integration report and deploy checklist written | PASS (this file; `DEPLOY-CHECKLIST.md`). |
| Nothing deployed | PASS. |

## 2. Shared helper consolidation (T2)

Before consolidation there were three private raster copies (A1 `renderDisksFloat` in arrangement.js, B1 `renderDisksFloat` in premap.js, B2 `renderDisksFloatInline` in the harness), two forwardPoint and gasket copies (B1 `buildGasketSites`/`gasketTemplate` and A1's forwardPoint), and the staged JS genGasket.

Now there is one of each in `worker-candidates/shared/disks.js`. arrangement.js and premap.js import from it. The harness imports it. The B2 test import name `renderDisksFloatInline` is kept as an alias to the same function.

Raster comparison (`analysis/raster_parity.mjs`, `analysis/py_raster_hashes.py`). sha256 over the canonical '1'/'0' rows (lens_standard.canonical_mask convention):

| Set | n | Ink | Python (independent run) | JS A1 original | JS B1 original | JS B2 original | Shared | Pixel diffs |
|---|---|---|---|---|---|---|---|---|
| clean gasket | 366 | 10614 | bf3f7398... | same | same | same | same | 0 |
| tri | 19 | 15143 | 6138abea... | same | same | same | same | 0 |
| astig 0.1 | 366 | 10348 | d7bc75d0... | same | same | same | same | 0 |
| astig 0.2 | 366 | 10295 | 7af8c432... | same | same | same | same | 0 |
| trefoil 1e-4 | 366 | 10338 | b25c418c... | same | same | same | same | 0 |
| trefoil 1.5e-4 | 366 | 10337 | 0a44ce55... | same | same | same | same | 0 |
| spherical 0.06 | 366 | 10365 | 98c426e4... | same | same | same | same | 0 |

- The Python hashes match A1's recorded `raster-hashes.json` on all seven sets.
- A1's recorded astig 0.1 hash `d7bc75d0...` and trefoil 1e-4 hash `b25c418c...` match Python. This is the check the SPEC asks for.
- B1's raster matches A1's on the gasket and the tri (0 pixel diffs).
- The warp disks from the candidate arrangement equal the original on all five arms.
- forwardPoint: the A1 fixture (324 tuples, tolerance 1e-12) passes on the shared copy through the candidate suite.

Candidate suites after consolidation: A1 51 pass, B1 120 pass, B2 stub 70 pass, shared 13 pass, integration and Amendment 1 23 pass.

## 3. Walk leg and the Delaunay defect (T6, T7, T8, T9)

### 3.1 The defect and its evidence

- Deployed code: `bowyerWatsonDelaunay` (bundle part `jev-spectral-centroid.js`, sha256 `bc9c04d8...`). The staged port (`work/tools/spectral-standard/jev-spectral-centroid.js`, sha256 `6fcc76ac...`) is the same code. The only differences are the trailing newline and the `jev-lens-math.js` import path in the lens part.
- Independent check (`work/bench/mustedges.mjs`, run unchanged from the staged folder, reproduced here): on the clean 366-droplet gasket, 1014 pairs are forced (an open empty-circle interval), 50 are degenerate candidates. The deployed JS graph (1031 edges) misses 8 forced edges. The recorded Python graph (1025 edges) misses 14. The JS graph has 0 edges outside the forced and degenerate sets.
- Our own classification (`analysis/forced-classify.json`): the canonical graph (1039 edges) misses 0 forced edges.

### 3.2 Consumers reached (deployed bundle, pre-deploy parts)

- `jev-spectral.js` calls `bowyerWatsonDelaunay` at lines 45 and 166. This is the spectral walk in points mode and the oracle.
- `jev-spectral-centroid.js` builds the graph at line 384. `walkCentroidMode` is exported at line 448.
- `jev-router.js` imports `walkCentroidMode` (line 41) and calls it at line 341 for the V4 pair-band `spectral.d_w` clause.
- `jev-corpus-routes.js` reaches all of these through `/api/jev/corpus/spectral/*` and `/api/jev/corpus/oracle`.
- `jev-lens.js` is NOT a consumer. It only references the sibling module in a comment.

### 3.3 Gate table A1 to A6 (T6)

Source: `analysis/gate-table.json`, from the candidate `arrangement.js` run twice: once on the recorded (deployed) graph, once on the canonical graph (`delaunay-exact.js`). D values do not depend on the graph, so the A2 and A5 rows are the same in both columns.

| Gate | Arm | Recorded (deployed) graph | Canonical graph |
|---|---|---|---|
| A1 (band 0.05) | astig 0.1 | PASS, dD_w -0.001647 | FAIL, dD_w -0.051347 (over by 0.0013) |
| A1 | astig 0.2 | PASS, dD_w -0.015675 | FAIL, dD_w -0.071193 |
| A1 | trefoil 1e-4 | PASS, dD_w +0.042440 | FAIL, dD_w +1.450679 |
| A1 | trefoil 1.5e-4 | PASS, dD_w +0.029286 | FAIL, dD_w +1.186312 |
| A1 | spherical 0.06 | reported, dD_w +0.081709 | reported, dD_w +2.801672 |
| A2 (ratio 1/3) | all five | FAIL. Signed ratio 0.495, 0.398, 0.959, 0.737, 1.071 | same (pixel and arrangement D are graph-free) |
| A3 (no drops) | all five | PASS, 0 dropped | PASS, 0 dropped |
| A4 (walk anchor 2.7812 +/- 0.10) | clean | PASS, d_w 2.765024 (diff 0.016) | FAIL, d_w 2.897099 (diff 0.116) |
| A5 (D anchor 1.558937 +/- 1e-4) | clean | PASS, D 1.558937 | PASS, D 1.558937 |
| A6 (agreement with canonical, 0.01) | arm diffs | FAIL: 0.0497, 0.0555, 1.4082, 1.1570, 2.7200 | not informative (self-comparison, PASS) |

Canonical clean d_w: 2.897099 (r2 0.98676). The deployed clean d_w is 2.765024. The record's 2.781185 sits between them and matches neither exactly.

The record's per-arm reading ("astig fails, trefoil passes") does not reproduce on the recorded JS graph either. The JS graph passes all four. On the canonical graph all four fail.

### 3.4 Trefoil diagnostic (T8, pre-declared reading)

Pre-declared in `exploratory/PREDECLARED-T7-T8.md` before the run. Extra edges are canonical edges absent from the recorded Python graph of the same arm: 60 edges for trefoil 1e-4. Lengths 24.3 to 402.6 px (median 110.1).

- Classification (`analysis/forced-classify.json`): 58 of the 60 are forced. The other 2 are beyond the top 30 and were not classified by the tolerance check. All top 30 are forced.
- The top 10 extra edges are 286 to 403 px long, and all are forced. They are not tie-break artifacts.

| Removed (arm graph only) | Edges | d_w | dD_w (against canonical clean) |
|---|---|---|---|
| k = 0 (canonical arm) | 1084 | 4.347779 | +1.450679 |
| k = 10 (top 10 by length) | 1074 | 3.575243 | +0.678143 |
| k = 30 | 1054 | 2.982225 | +0.085125 |
| k = 60 (all extra = recorded Python arm graph) | 1024 | 2.792416 | -0.104683 |

Pre-declared reading: "carried by the long extra edges" if removing the top 10 reduces dD_w by at least 0.5 x 1.4507 = 0.7253. Observed reduction 0.7725 (about 53 percent of the jump). **The reading holds.** The jump is carried by a small set of long, forced canonical edges that the recorded graph omits.

Caveat: the k = 60 row compares a recorded arm graph with a canonical clean graph. The sign flip in that row mixes two graphs and should not be read as a result on its own. The gate is not changed.

### 3.5 Walk hierarchy check (T7, pre-declared reading)

Pre-declared in `exploratory/PREDECLARED-T7-T8.md` before the run. Sets: (a) clean gasket, (b) gasket with each point jittered by a uniform offset in [-7.5, 7.5) per axis (seed 42), (c) 366 uniform random points in [0, 512)^2 (seed 42). Walk W 4096, K 4, spread, seed 42.

| Set | Canonical d_w | Canonical r2 | Canonical E | Deployed d_w | Deployed r2 |
|---|---|---|---|---|---|
| (a) clean gasket | 2.897099 | 0.98676 | 1039 | 2.765024 | 0.99155 |
| (b) jittered gasket | 3.711553 | 0.96545 (low) | 1082 | 3.327606 | 0.97327 |
| (c) uniform random | 3.825096 | 0.95654 (low) | 1080 | 3.448428 | 0.96177 |

Pre-declared reading: the hierarchy reading survives on the canonical graph only if (i) d_w(a) - d_w(c) >= 0.15 and (ii) d_w(a) - d_w(b) > 0.

- (i) fails: a - c = -0.928.
- (ii) fails: a - b = -0.814.
- **Result: the reading does not survive.**

The observed separation is large, but its sign is opposite to the one the pre-declared rule assumed. The clean gasket has the LOWER walk exponent. This sign was not pre-declared, so the advisor does not reinterpret the verdict. It is a finding that needs Jenny's read, more seeds, and a pre-registered sign before any claim.

Why the jittered set moves so far: the clean gasket's nearest-neighbour distance is 11.66 px (median, minimum 11.66, maximum 12.00). The jitter (up to about 10.6 px diagonal) is comparable to that spacing, so the jittered set loses the hierarchy almost entirely and approaches the random set. Walk option check: the default ladder and the explicit pinned ladder give the same clean d_w (2.8970993450106555 both ways).

Low confidence: b and c have d_w_r2 below 0.98, flagged per the SPEC rule. The random set has N = 366, which is above the N of about 300 the record uses (AM-6). The low r2 is therefore a fit-quality caveat. This run cannot establish saturation.

## 4. Harness results (T5, one frozen run)

Command (the lead can re-check it, but it was run once):
`node harness_premap.mjs ./premap.js --lens <staged jev-lens-math.js> --spectral <staged jev-spectral-math.js> --arrangement ../arrangement/arrangement.js --out results/premap-results-2026-10-16.json` (run from `worker-candidates/premap/`).

Output: `results/premap-results-2026-10-16.json`. `plan_frozen: true`. Renderer: the shared renderDisksFloat through the candidate arrangement module. Trials: 80 (gasket 45, tri negatives 5, uniform negatives 15, depth-6 fill 15). Error rows: 0. Template counts 42, 123, 366 and tri 19 pass.

| Gate | Rule | Result | Count |
|---|---|---|---|
| P1 identification | gasket level equals depth, at least 43 of 45 | **PASS** | 45 / 45 |
| P1n negatives | level null on 20 of 20 | **PASS** | 20 / 20 |
| P2 holes (bookkeeping) | predicted holes equal absent template sites, 45 of 45 | **PASS** | 45 / 45 |
| P3 fill sign | sign_agree true on at least 14 of 15 | **PASS** | 15 / 15 |
| P3 control (reported, not gated) | control_agree | reported | 0 / 15 |
| P4 (informational) | depth 4 and 5 not_available, depth 6 measured | matches expected | depth 4: 15 not_available; depth 5: 15 not_available; depth 6: 15 measured |

Observed minimum counts of observed points: gasket 17, tri 8, uniform 42, fill 146.

Reading the verdicts, honestly:
- P3 is a reproduction check, as the PREREG scope says. Filling the holes restores the full template, so D_filled equals the template D (1.5589370) in all 15 trials. P3 therefore largely repeats P2. The control fill moves D the other way (control_sign -1 in all 15), which shows the template fill is not just any extra points. control_agree is 0 of 15, which is reported and not gated.
- P2 is bookkeeping, not a finding.
- No gate was retuned. No trial was dropped.

### 4.1 Smoke runs (not the frozen run)

`premap-integration.test.mjs` runs `runHarness` on a 3-trial gasket subset and a 1-trial fill subset (both with `plan_frozen: false`). Those runs wrote no results file and their output was not used. They check only that the real module runs through the harness without an error row.

### 4.2 Amendment log (PREREG-premap-2026-10-16.md section 8)

- **Amendment 1 (logged before the harness run).** identifyLevel returns null with reason `too_few_observed` below MIN_OBSERVED = 6, the depth-2 template size. Reason: containment has no size floor, so one observed point on a depth-1 site identified level 1 (B1 open issue 1). The floor changes no frozen trial (checked by arithmetic in `premap-amendment1.test.mjs`).
- **Correction to the feasibility addendum.** Section 10 said no frozen trial falls below 17 points. That is true for the gasket trials. The tri negatives keep 8 points (round(0.4 x 19)). The floor of 6 is below both.
- **Section 6.12 (tri "40 percent" reading, keep 8 of 19): confirmed by advisor, no change.**
- **Non-amendment integration edits (no frozen value changed).** holes.reason follows the identification reason. The harness uses the shared renderer. The route accepts null-level holes (section 6).

## 5. Premap route and selftest wiring (T4)

B1 result shape against B2 expectations:

| Field | B1 returns | B2 expects | Match |
|---|---|---|---|
| identification | level, reason, by_depth | same | yes |
| holes (level set) | {count, sites, reason: null} | {count, sites} | yes |
| holes (level null) | {count: null, sites: [], reason} | {count, sites} with count an integer | **no, fixed** (section 6) |
| predicted_band | status, D_template, r2_template, band | status measured or not_available | yes |
| fill_measure | the 11 FILL_KEYS | the same 11 keys | yes |
| run_id | null (route sets it) | route sets it | yes |

`premap-selftest.js` is exposed to the route as `deps.premap.selftest` (`premap-integration.test.mjs`: 19 checks, all pass through the route with the real module).

Test results with the real module wired in:
- B2 stub suite, unchanged: 70 of 70 pass after the route edit.
- Integration suite (route to real module): 12 of 12 pass. It covers the selftest, depth-6 POST with and without measure, the uniform negative, the single-point floor, a six-point level 2, full observation, 413 for 801 points, and two fail-closed stubs.

## 6. Lane discrepancies and how each was resolved

1. **A1 pixel drops are silent.** The deployed `warpMask` drops out-of-canvas ink without a count, so gate A3 cannot see pixel-arm drops. No recorded arm drops ink, so no gate changes. **Not fixed** (deployed code). A counted variant is a follow-up.
2. **A1 says trefoilBeta is not exported.** It is exported at jev-lens-math.js line 302. The shared copy now holds the formula once, so the question is moot.
3. **B2 selftest dependency.** The route needs `deps.premap.selftest`, which lived in premap-selftest.js. **Resolved.** Wired and tested (section 5).
4. **B2 route rejected the B1 null-level holes shape.** The B2 route returned 500 PREMAP_RESULT_INVALID on every negative. **Resolved** in the candidate route: a null level accepts `{count: null, sites: []}` (the B1 shape) or `{count: 0, sites: []}` (the B2 stub shape). The response always reports `count: null`. Any site list with a null level is rejected. The B2 test that encoded the count-0 shape still passes unchanged.
5. **B1 floor.** Containment without a size floor (B1 open issue 1). **Resolved** as Amendment 1, logged before the run.
6. **Renderer copies.** Three raster copies and two gasket or forward copies. **Resolved** with one shared module. Hash-identical on seven sets, zero pixel diffs (section 2).
7. **Feasibility addendum: "no trial below 17".** Wrong for the tri negatives (8 points). **Corrected** in PREREG section 8. No trial changes.
8. **Lane report paths.** The lane reports cite `session/subagent/arr-premap/<lane>/`, which did not exist. The files are under `session/subagents/<session>/arr-premap/<lane>/`. The advisor copies are byte-identical to those.
9. **A2 Amendment 1 (its own PREREG section 8).** A2 made a selftest-only edit after its walk runs and says the outputs were identical before and after. The advisor did not re-verify that claim.
10. **Walk ladder.** A1 passes `steps` explicitly, A2 uses the default. Verified the same clean d_w (2.8970993450106555). No change.
11. **Walk input rounding.** A1 rounds with `Math.round(x*1e4)/1e4`, A2 with exact half-even. A2 found no exact tie in the six walk sets. No change.
12. **Trefoil extra edges.** Two of the 60 are not classified by the tolerance check. Both sit beyond the top 30, which are all forced. No effect on the T8 reading.
13. **P3 interpretation.** The lane reported P3 as a fill-sign test. The advisor's reading is that it reproduces the template (section 4). No change to the gate.

## 7. What is NOT done

- **No deploy.** Nothing uploaded. The routes patch is checked (`git apply --check`) but not applied. The parts are checked for import, not run under workerd.
- **No registration for real data.** The premap identity frame is the only scope. Registration is the first open gate.
- **No canonical Delaunay adoption.** The canonical graph is a diagnostic. No consumer changed.
- **No re-anchoring.** The walk anchor (2.7812) and the walk gates are unchanged.
- **No workerd CPU measurement.** Node only.
- **Build-root copy not written.** The advisor write scope is `session/subagent/`. The lead copies `advisor/` into `session/arr-premap/build/`.
- **A6 not wired on the live route.** It needs the canonical Delaunay part.
- **The arrangement response does not label its walk graph.** Recommended before go.
- **Edelsbrunner and Mücke 1990 DOI is unverified.** Cited as "Edelsbrunner and Mücke 1990, ACM TOG" only.

## 8. Open decisions for Jenny

1. **Canonical Delaunay.** Adopt the canonical graph for spectral consumers now (with re-anchoring, a version bump, and a router recheck), or keep the deployed graph and record the finding? The deployed graph omits 8 forced edges on the clean gasket (JS) and 14 (recorded Python). Advisor recommendation: do not change consumers in this deploy. Ship the two routes with the walk leg labelled implementation-dependent, and take adoption as a separate change.
2. **Walk-leg verdicts.** Under the canonical graph, A1 fails on all four gated arms (the record reads them as passing). Which graph should the A1 gates in the response report, and should A6 be wired on the live route?
3. **Hierarchy sign (T7).** The clean gasket has the lower walk exponent than the jittered and random sets, by 0.8 to 0.9. The pre-declared reading assumed the opposite sign. Decide whether to re-register the walk hierarchy claim on the canonical graph with more seeds before any claim.
4. **Trefoil (T8).** The trefoil walk jump is carried by forced long edges that the recorded graph omits. This is the strongest evidence for decision 1.
5. **Deploy go.** Approve the seven new parts and the routes patch (`DEPLOY-CHECKLIST.md`), after a workerd CPU measurement and the walk-graph label.
6. **Pixel warp drops.** Change the deployed `warpMask` to counted drops (a deployed-code change), or leave it and document the A3 blind spot?
7. **Registration for real data.** Phase 2, out of scope here. Decide the method before any real-data claim.

## 9. Test totals (every suite, after the final run)

| Suite | Pass | Fail | Todo | Notes |
|---|---|---|---|---|
| B1 `premap.test.mjs` (candidate) | 120 | 0 | 0 | |
| B2 `premap-route.test.mjs` (stub, candidate) | 70 | 0 | 0 | unchanged test file |
| `premap-amendment1.test.mjs` | 11 | 0 | 0 | new |
| `premap-integration.test.mjs` | 12 | 0 | 0 | new |
| `shared/disks.test.mjs` | 13 | 0 | 0 | new |
| A1 `arrangement.test.mjs` (candidate) | 51 | 0 | 6 | walk gap tests, as specified |
| A2 `delaunay-exact.test.mjs` | 13 | 0 | 0 | |
| A2 `delaunay_exact.py --selftest` | 48 | 0 | n/a | Python |
| **Node total** | **290** | **0** | **6** | |

Plus one harness frozen run (section 4), with P1 45/45, P1n 20/20, P2 45/45, P3 15/15, and P4 matching expected.
