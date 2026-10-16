# Feasibility check: arrangement response and hierarchy premap (2026-10-16)

Scope: read the live worker docs, reproduce the source of record, port-test the deployed JS, and check the research. No deploy, no KV or D1 writes, no changes to the worker. All evidence below was generated in session/arr-premap/work/ and session/arr-premap/fresh/.

## 0. Verdict

| Line | Verdict | Condition or blocker |
|---|---|---|
| A, arrangement-response-v1 | GO for the D leg and the pixel arm. HOLD the walk-leg verdicts. | The walk exponent's arrangement response depends on the Delaunay tie-break implementation (section 3). Pin it or report it as implementation-dependent. |
| B, premap-v1 | GO, gold-family MVP only. | D reference only at depth 6 (section 5). Identity frame only; registration is Phase 2 (section 7). |

## 1. What the live surface offers (read only)

- Fetched 2026-10-16: AGENT.md 92,569 B, ENDPOINTS.md 133,890 B, repo tree 2,242 entries.
- Neither document mentions arrangement. The arrangement round exists only in the repo: tools/lens-standard/arrangement_warp.py, falsification/ARRANGEMENT-RESPONSE-2026-10-06.md, PREREGISTRATION-arrangement-response-2026-10-06.md (merged via PR #292).
- Live routes that matter: POST /api/jev/corpus/oracle (gray, bitmap, gold), POST /api/jev/corpus/spectral/walk (points mode), POST /api/jev/corpus/lens/correct, POST /api/jev/route, and their GET selftests.
- Worker settings (read-only GET): no custom limits set (`limits: null`), compatibility 2026-09-01, usage model standard, 15 bindings. Neither line needs a new binding. Both only need a run row through the existing recordRun path.
- Source of record for the JS ports: tools/lens-standard/jev-lens-math.js, tools/spectral-standard/jev-spectral-centroid.js and jev-spectral-math.js, tools/edge-standard/jev-edge-standard.js.

## 2. Source-of-record reproduction (Python, sandbox)

Staged tools/lens-standard/lens_standard.py, arrangement_warp.py, tools/spectral-standard/centroid_walk.py and spectral_standard.py, tools/edge-standard/edge_standard.py, unchanged from main. Run: work/py/repro.py.

| Quantity | Record (ARRANGEMENT-RESPONSE) | Reproduced |
|---|---|---|
| clean d_w (W 4096, K 4, spread, seed 42) | 2.7812 | 2.781185 (r2 0.98859) |
| astig 0.1 dD_w | -0.0528 | -0.0528 |
| Delaunay edges, clean | not recorded | 1025 |

The source of record reproduces.

## 3. JS port against the source of record (Node 24, sandbox)

Ran the deployed JS modules unchanged over the full pinned matrix (work/bench/matrix_js.mjs). Python values from the record.

| Arm | D (JS) | D (record) | dD (JS) | dD (record) | dD_w (JS) | dD_w (Python) | JS edges |
|---|---|---|---|---|---|---|---|
| clean | 1.5589 | 1.5589 | | | d_w 2.7650 | d_w 2.7812 | 1031 (Python 1025) |
| astig 0.1 | 1.5124 | 1.5124 | -0.0465 | -0.0465 | -0.0016 | -0.0528 | 1031 |
| astig 0.2 | 1.4493 | 1.4493 | -0.1097 | -0.1097 | -0.0157 | -0.0597 | 1031 |
| trefoil 1e-4 | 1.5108 | 1.5108 | -0.0481 | -0.0481 | +0.0424 | +0.0112 | 1031 |
| trefoil 1.5e-4 | 1.4909 | 1.4909 | -0.0681 | -0.0681 | +0.0293 | -0.0110 | 1032 |
| spherical 0.06 | 1.5327 | 1.5327 | -0.0262 | -0.0262 | +0.0817 | -0.0479 | 1039 |

Findings:

1. The D leg is implementation-invariant. Every arm matches the record to 4 decimals. This is expected, since no Delaunay is involved.
2. The walk leg is not. Clean d_w differs by 0.016. The arm responses differ by up to 0.051 (astig 0.1), change sign for trefoil 1.5e-4 and spherical 0.06, and the spherical arm exceeds the 0.05 band in JS (+0.0817) but not in Python (-0.0479).
3. The record's per-arm A1 verdicts (2 marginal fails in Python) are not reproduced by the JS port (0 fails on astig, 1 fail on spherical). The headline "walk exponent nearly affine invariant, hierarchy signal more than 10 times larger" holds in magnitude: |dD_w| at most 0.082 against a 0.66 gasket-vs-lattice separation, roughly 8 to 11 times. The per-arm pass or fail pattern does not hold.
4. Edge sets differ. The JS Delaunay returns 1031 edges on the clean gasket and Python returns 1025. Diff: the 6 JS-only edges all sit at degenerate corner configurations of the coarse gasket (examples: (346,189)-(364,220), (214,106)-(190,147), (298,106)-(316,137)). Collinear and cocircular ties are resolved differently by the two implementations.

Conclusion for Line A: the walk leg cannot carry a stable pass or fail verdict until the tie-break is pinned. The D leg and the pixel arm can ship as planned.

## 4. The JS renderer cannot draw warped centers

`renderDisks` in jev-lens-math.js loops from `Math.max(0, cy - r)` with fractional bounds. For any warped center it throws: `Cannot set properties of undefined (setting '256.05')`. A float-safe rasterizer that follows the Python to_rows rule (trunc bounds, pixel set when the squared distance is at most r squared) reproduces the arm D values in section 3 exactly. Lane A1 must ship that rasterizer. Gasket integer renders are identical under both rules.

## 5. Gasket depth ladder (premap feasibility)

`genGasket(512, 384, 3, depth)` for depth 1 to 6 (work/bench/ladder.mjs):

| Depth | N | (3^k+3)/2 | Nested in next | D | r2 | d_w |
|---|---|---|---|---|---|---|
| 1 | 3 | 3 | yes | 0.4463 | 0.4982 | not computed |
| 2 | 6 | 6 | yes | 0.4112 | 0.6817 | not computed |
| 3 | 15 | 15 | yes | 0.4818 | 0.9093 | not computed |
| 4 | 42 | 42 | yes | 0.6690 | 0.9794 | not computed (N below 300) |
| 5 | 123 | 123 | yes | 1.1178 | 0.9638 | not computed (N below 300) |
| 6 | 366 | 366 | yes | 1.5589 | 0.9964 | 2.7650 (JS) |

Findings:

- Counts match (3^k+3)/2 and every level nests in the next. This makes containment a usable identification rule.
- Only depth 6 gives a D reference at r2 of 0.98 or above in the pinned 4 to 64 window at L=384. Depths 1 to 5 fail that gate. The premap therefore reports a D band only at depth 6. Shallower levels report identification and holes only.
- The walk needs N of about 300 or more (AM-6). Only depth 6 qualifies in this family.

## 6. Cost (Node, single run, not the workerd runtime)

| Step | Time |
|---|---|
| genGasket(6) | 2 ms |
| renderDisks, integer centers | 8 ms |
| measureD, first call (JIT) | 134 ms |
| measureD, arm | 49 ms |
| bowyerWatsonDelaunay, 366 points | 83 ms (1031 edges) |
| randomWalks, W 4096, 256 steps | 34 ms (clean), 133 ms (arm) |

One arrangement arm is about 190 ms. The default matrix (five arms, clean, and pixel arms) is about 1.5 s in Node. The worker's documented default CPU budget is far above that. The number has to be measured under workerd before any deploy, so this is a feasibility estimate, not a limit check.

## 7. Research (established versus open)

Source pass: parallel deep research, two lanes, medium effort. Full citations are in the research transcripts; the load-bearing ones follow.

Established:
- Bi-Lipschitz maps preserve Hausdorff and box dimension (standard dimension theory; Deng and Ngai, DOI 10.1155/2014/549741).
- Origin-anchored box counting depends on grid placement, and offset averaging is the standard fix (Bouda, Caplan and Saiers, DOI 10.3389/fpls.2016.00149). Matches our 0.03 translation sensitivity.
- Delaunay edges flip at cocircular events under point motion (Rubin, DOI 10.1007/s00454-013-9512-2). Matches section 3.
- Gasket exponents: d_f = ln3/ln2, d_w = ln5/ln2, d_s = 2 ln3 / ln5 (Barlow and Perkins, DOI 10.1007/BF00318785; Fukushima and Shima, DOI 10.1007/BF00249784).
- Collage theorem and the inverse IFS problem (Barnsley, Ervin, Hardin and Lancaster, PNAS 1986, DOI 10.1073/pnas.83.7.1975).
- Affine partial registration with trimming (Dong, Cai and Du, DOI 10.1049/iet-cvi.2016.0058; Du et al., DOI 10.1016/j.patrec.2010.01.020).
- Prediction-then-measurement discipline (Nosek et al., DOI 10.1073/pnas.1708274114).

Open or model-dependent:
- A canonical finite-resolution correction for droplet rasterization. Not established; the research pass found no universal law.
- Whether a recomputed Delaunay graph of an affinely stretched hierarchical set keeps its walk exponent. Not established in general; the research pass says it is model-dependent, and section 3 measures that.
- Unique recovery of an IFS from a finite, noisy, partial point set. Not identifiable in general. Holdout prediction is the only defensible test.

Note on the tie-break fix: Simulation of Simplicity (Edelsbrunner and Mücke, ACM TOG 1990) is the standard way to make degenerate predicates deterministic. The DOI I recall is 10.1145/77635.77639. I have not re-verified it in this session, so verify before citing it externally.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Walk leg verdicts differ by implementation | Line A reports unstable A1 results | Gate A6 and the canonical Delaunay candidate. Report A1 as implementation-dependent until A6 passes. |
| Pinning a new Delaunay changes spectral consumers | d_w values shift for oracle, router, and the 2.4 pair-band | Major version bump, anchor re-derivation, router band recheck. Jenny's decision. |
| JS renderer throws on fractional centers | Arrangement arm cannot run | Float-safe rasterizer with Python parity hash. |
| Only depth 6 has a valid D reference | Premap D band is absent at shallower levels | Report `not_available` with the reason. No silent nulls. |
| Containment fails under displacement | Premap cannot identify real panels | Identity frame only in Phase 1. Registration is Phase 2. |
| CPU budget under workerd unmeasured | A five-arm call could exceed the budget | Measure before deploy. Cap arms at 12. Consider one arm per call. |
| Fills read as evidence | Premap predictions treated as measurements | Output labeled prediction. No route to dispatch. |

## 9. Decisions for Jenny

1. Canonical Delaunay. Adopt an exact-predicate, symbolic-perturbation Delaunay as a spectral-standard-v2 (re-anchor, router recheck), or keep the deployed graph and record its implementation sensitivity as a finding? Lanes build the candidate either way; the choice gates any deploy.
2. Scope of Line B. Build the identity-frame gold MVP now (recommended), or wait for registration?
3. Nothing is deployed in this build. Deploy needs a separate go after the advisor report.

## 10. Addendum after the build lanes (2026-10-16)

Lane A2 found a defect beyond tie-breaking. An independent check confirms it.

- Independent check (work/bench/mustedges.mjs, no implementation in the loop). On the clean 366-droplet gasket, 1014 pairs have an open empty-circle interval, so every triangulation must contain them. 50 more pairs are degenerate candidates. The deployed JS graph (1031 edges) misses 8 of the 1014 forced edges. The recorded Python graph (1025 edges) misses 14. Neither graph has an edge outside the forced set plus the degenerate candidates.
- Lane A2 built an exact-integer Delaunay with a Simulation of Simplicity tie-break. It returns 1039 edges on the clean set, which matches the Euler count and contains every forced edge. The JS and Python outputs match on 33 of 33 sets.
- Consequence. Every walk-leg consumer runs on an incomplete graph: the oracle centroid walk, the spectral walk in points mode, the router's d_w measurement and its pair-band clauses. The walk anchors and walk gates in the falsification record were computed on the same incomplete graphs.
- Under the canonical graph, A1 fails on all four gated arms in both languages: astig 0.1 -0.0513, astig 0.2 -0.0712, trefoil 1e-4 +1.4507, trefoil 1.5e-4 +1.1863. The record's reading ("walk exponent nearly affine invariant, trefoil passes") does not hold on a complete graph. The clean canonical d_w is 2.8971, against the record's 2.7812.
- Input-order sensitivity is real and not gated. Four orderings give clean d_w 2.853 to 2.911 and trefoil dD_w +1.51 to +1.65.

Verdict update.
- Line A's D leg and pixel arm stand.
- Line A's walk leg is now a correctness defect in deployed code plus an open instrument question. The fix changes d_w for every consumer, so it needs Jenny's decision and a re-anchor. Nothing is deployed in this build.
- The hierarchy claim on the walk leg has not been tested on the complete graph. The advisor runs that check as an exploratory item (gasket against jittered gasket against uniform random, same N).

Line B finding from lane B1.
- Containment has no size floor. One observed point on a depth-1 site returns level 1. Fix before the harness runs: a minimum of 6 observed points (the depth-2 template size), logged as a pre-run amendment. No trial in the frozen matrix falls below 17 points, so no trial changes. The tri "40 percent" reading (keep 8 of 19) is flagged in the pre-registration and stays until the advisor confirms it.

Lane results (all lanes returned; files under session/subagents/<session>/arr-premap/lane-*).
- A1: 57 tests, 51 pass, 6 todo (the walk gap tests). D matches the record for every arm to about 1e-15. Raster sha256 matches Python. Pixel-arm dD matches Lane F to six decimals. Gate A2 fails on all five arms (arrangement arm carries 40 to 107 percent of the pixel dD, against the one-third gate). The deployed warpMask drops out-of-canvas ink silently, so A3 cannot see pixel-arm drops.
- A2: canonical exact Delaunay, edge parity 33 of 33, walks agree to 0.0 between languages, reproduction of the record on the recorded graphs passes (deviation 5e-5).
- B1: 120 tests pass. Template parity 6 of 6. Negatives null on all 20 trials (largest negative f 0.0055). Holes exact. Depth-6 template D 1.5589, r2 0.99636. The predicted band is not_available below depth 6, as designed.
- B2: pre-registration written first (76 lines, frozen values copied verbatim from SPEC 3.3). Route and harness written. Stub tests 70 of 70. The harness has not run against the real module. The advisor runs it after the floor amendment is logged.
