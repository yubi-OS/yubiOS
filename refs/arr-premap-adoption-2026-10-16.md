# Adoption record: exact-predicate Delaunay for the steady-orbit walk graph (2026-10-16)

Decision (Jenny, 2026-10-16): adopt the exact-predicate Delaunay, deploy, and merge PR #319 first. PR #319 (docs, specs and feasibility) is merged, squash commit db404b6e.

## What shipped

- Worker deploy etag: eb4862465f3375c35f0a6de776838f9960b8bdd58c88c2935397a4376240510a. 61 modules, which is the 60 pre-deploy parts plus one new part.
- Changed parts:
  - jev-spectral-centroid.js: bowyerWatsonDelaunay keeps its input contract and return shape, and delegates the triangulation to jev-delaunay-exact.js. The Bowyer-Watson body is removed.
  - jev-spectral.js: walkPoints uses the exact graph and the 4 dp coordinates, and reports delaunay "exact-sos-v1". The selftest follows the same graph and coordinates.
  - fixtures/spectral-fixtures.mjs: the c2 edges and the c2 walk (trace and d_w) are regenerated on the canonical graph. The regeneration first reproduced the old fixture on the old graph (trace exact, d_w equal to 1e-9).
- New part: jev-delaunay-exact.js (lane A2 build, exact integer predicates, Simulation of Simplicity tie-break, 4 dp rounding).
- Every other part is byte-identical to the pre-deploy snapshot.
- Bindings: 15 live. 14 explicit plus secret_text kept (AE_SQL_TOKEN). Crons unchanged: "0 * * * *" and "*/5 * * * *".
- Rollback: session/deploy-2026-10-16/pre/ holds bundle.raw, the 60 parts and manifest.json (sha256 per part), settings.json and schedules.json. Rollback re-PUTs those parts with the same metadata, including keep_bindings ["secret_text"].

## Verification (live, after the 25 second stale window)

- /api/jev/health: ok, policy_version 23, not paused.
- /api/jev/corpus/spectral/selftest: 9 of 9 pass.
- /api/jev/route/selftest: ok.
- Walk on the 366 gasket centres, points mode: d_w 2.765024 to 2.897099. n_edges 1031 to 1039. Matches the canonical value from lane A2.
- Oracle mask centroid d_w on the five gold renders, before to after. Each post-deploy value matched the local prediction to six decimals. D is unchanged on all five.

| Artifact | D | d_w before | d_w after | Traced droplets |
|---|---|---|---|---|
| shuffle-s42 | 1.035474 | 4.175736 | 3.481099 | 19 |
| pumpkin_field | 1.038390 | 7.770301 | 6.584950 | 6 |
| pumpkin_ring | 0.977190 | 4.505589 | 4.843677 | 6 |
| gasket-v2-L384 | 1.558937 | 2.255452 | 2.043963 | 366 |
| tri | 1.263595 | 2.958820 | 2.881828 | 19 |

- Wall time for the 366-point walk on the live worker, three calls: 1.03 s, 1.04 s, 0.65 s. This is wall time. Workerd CPU time is not exposed, and the worker has no custom limits (settings limits: null).

## What changed for consumers

- Router: the six gold artifacts keep their lanes. The gasket's d_w is now 2.04, below the 2.4 threshold on hierarchy-confirmed, so it routes through hierarchy-image, which the calibration record already names for it. Both bands target lane-draft. The other gold artifacts are not affected by a d_w clause: the pair bands require at least 300 traced droplets, and shuffle, pumpkin and tri have 19 or 6.
- Oracle: d_w values in the centroid walk move as the table shows. The Einstein verdicts did not change on the gold set (insufficient on gasket and shuffle, inconsistent on pumpkin and tri).

## Open items (not done in this deploy)

1. The 2.4 walk threshold in the pair bands (hierarchy-confirmed and hierarchy-spectral) was calibrated on the incomplete graph. It needs recalibration on canonical values before any real arrangement of 300 or more droplets relies on it.
2. Walk-leg hierarchy sign. On the canonical graph at N = 366, the clean gasket has the lower d_w (2.90) against jittered (3.71) and uniform random (3.83). The old graph already had this ordering (2.77 against 3.33 and 3.45). The sign is inverted on both graphs, and this deploy does not change it. It needs more seeds and a pre-registered sign before any claim.
3. Trefoil. The d_w jump under the trefoil arm (+1.45 on the canonical graph) is carried by 10 long forced edges that the old graph omitted. Removing them takes the jump to +0.68.
4. Falsification anchors. The spectral anchors in tools/spectral-standard (C2 d_w 2.70487 and related walk gates) were computed on the incomplete graph and need re-anchoring.
5. Python source of record. tools/spectral-standard/centroid_walk.py still uses the Bowyer-Watson graph. The canonical Python twin is lane A2's delaunay_exact.py. Committing it to the repo needs Jenny to name the exact files.
6. AGENT.md drift, which predates this deploy. The live KV copy is 92,569 bytes and the git mirror tools/point-map/AGENT.md is 85,085 bytes. They first differ at byte 21,861. The mirror rule says they must match. Neither copy was changed in this deploy. Jenny to choose the canonical copy.

## Provenance

- Build and advisor record: session/arr-premap/ (SPEC, feasibility check, integration report).
- Pre-deploy snapshot and post-deploy checks: session/deploy-2026-10-16/ (pre/, candidate/, baseline/).
- Merged feasibility record: refs/arr-premap-feasibility-2026-10-16.md (PR #319).
