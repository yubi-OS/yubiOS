# PREREG: canonical Delaunay candidate (lane A2)

Date: 2026-10-16. Status: session-only, diagnostic. Nothing here is deployed, adopted, or published.

Written after edge parity ran (spec item 3) and before any walk value on the canonical graph was computed (spec item 5). No canonical walk value appears in this file, and none had been computed when it was written.

## 0. What already ran (disclosed before this registration)

1. Edge parity (item 3, edge-parity.report.json). The canonical Python and canonical JS edge sets match exactly on all 33 sets: the clean gasket, the five arm sets, 20 seeded random sets (40 to 300 points), and 7 extra stress sets. Every canonical run passed its built-in validation.
2. Recorded graphs are not Delaunay on general-position sets. On random_01, random_05, random_10 and random_18 (n of 56 to 75), an independent O(n^4) brute-force Delaunay (harness/brute_check.py, data/brute_check.json) matches the canonical graph exactly. The staged Python Bowyer-Watson misses 1 to 4 of the brute-force edges on each. On random_01, a float convex hull has 10 vertices, so Euler gives E = 212 (canonical), not 210 (staged Python).
3. The clean-gasket counts are: canonical 1039, recorded Python 1025, deployed JS 1031. The recorded 1025 and 1031 are reproduced by the staged Python and deployed JS (edge_parity: old_python_reproduces_recorded and old_js_reproduces_recorded).

Consequence: the recorded graphs are not a valid Delaunay graph on general-position sets. A6 (section 5) therefore compares against the canonical graph, and a gap there mixes a tie-break effect with a non-Delaunay defect. The report must say so.

## 1. Frozen implementation

Files and SHA-256 at registration (data/frozen-hashes.txt):
- delaunay_exact.py: 3815bcfa51039ad04e4b66c9fea9183915819df5ef94645ebfb65511e9e5bfee
- delaunay-exact.js: ce7217829e39077292de2f6cd05836baf3b573ce17fc144a88d4ea886f8cf1e6
- data/sets.json: b18911fc6d77b223dedb07bad6f798edda68a7d6909a08df1391bfb2156a3956

Candidate rule:
- Input: point list in input order. Each coordinate is rounded with round(x, 4) (Python) or the exact half-to-even helper (JS), then converted to an integer count of 1e-4 units, n = round(y * 10000) half to even. The two definitions agree (selftest and JS tests).
- Dedupe: keep the first occurrence of each integer pair.
- Predicates: exact integer orient and incircle. Simulation of Simplicity (Edelsbrunner and Mucke 1990, ACM TOG; not re-verified externally) for exact zeros: point i (0-based, deduplicated order) is perturbed as x_i + eps^(2^(2i)), y_i + eps^(2^(2i+1)). The sign is that of the lowest-exponent nonzero coefficient. Super-triangle vertices (-M,-M), (3M,-M), (-M,3M) with M = 2^80 units, indices n to n+2.
- Algorithm: incremental Bowyer-Watson in input order.
- Output: undirected edges, sorted, on deduplicated indices.
- Validation (any failure raises): nonzero base area; edge multiplicity 1 or 2; boundary edges equal the exact convex-hull boundary including points on hull edges; Euler E = 3n - 3 - h_b; exact empty circumcircle with ties allowed.

Walk protocol (pinned, not retuned): W = 4096 walkers, K = 4, ladder [16, 24, 36, 52, 80, 116, 172, 256], start rule 'spread', seed 42, Euclidean MSD over coordinates (units / 1e4), d_w = 2 / alpha_MSD, r2 reported. The Python walk is the staged walk_centroid_mode (spectral_standard run_walks and _walk_measurements). The JS walk is graphFromEdges, randomWalks, and walkDimensions from the staged jev-spectral-math.js, with coords set.

## 2. Walk sets

- Canonical graph: clean gasket and the five arms (astig 0.1, astig 0.2, trefoil 1e-4, trefoil 1.5e-4, spherical 0.06). Each language walks its own canonical edges.
- Recorded graphs, comparison only (for A6 and the reproduction check): the staged Python bowyer_watson_delaunay edges, walked by the Python walk on the same points, and the deployed JS bowyerWatsonDelaunay edges, walked by the JS walk. Points are rounded as in walk_dw.
- Random sets are not walked. Spec item 5 names the clean gasket and the arms only.

## 3. Reproduction check (R), registered before the canonical read

The walk harness must reproduce the record before any canonical value is read.
- Python on the recorded Python graph: clean d_w 2.781185 (record 2.7812), and dD_w astig 0.1 -0.0528, astig 0.2 -0.0597, trefoil 1e-4 +0.0112, trefoil 1.5e-4 -0.0110, spherical 0.06 -0.0479. Tolerance 1e-4.
- JS on the recorded JS graph: clean d_w 2.7650, and dD_w astig 0.1 -0.0016, astig 0.2 -0.0157, trefoil 1e-4 +0.0424, trefoil 1.5e-4 +0.0293, spherical 0.06 +0.0817 (feasibility check section 3). Tolerance 1e-4. The JS arm values were computed with a different rounding helper, so a small offset is possible. A larger offset is a finding to report, not a reason to adjust.

Reading: R fails means the walk harness is wrong. Stop and fix it before reading canonical values. Fixing it is not an amendment, but it is logged in the report.

## 4. Gates on the canonical graph (read per language)

- P-E (edge parity). Canonical Python equals canonical JS exactly on every set in item 3. Already satisfied (section 0).
- P-W (walk parity). On the canonical graph, |d_w(py) - d_w(js)| <= 1e-9 and |dD_w(py) - dD_w(js)| <= 1e-9 for the clean gasket and each arm. Pass means the two walk implementations agree on identical graphs. Fail means a walk-code divergence, not a Delaunay one. No adoption in that case.
- A1 on the canonical graph, per language. PASS if |dD_w| <= 0.05 for astig 0.1, astig 0.2, trefoil 1e-4 and trefoil 1.5e-4. Spherical is reported, not gated. If P-W passes, one verdict per arm covers both languages.
- A4 on the canonical graph. Report whether clean d_w is within 0.10 of 2.7812. The anchor is a pinned record value and is not retuned.

## 5. A6 interpretation (fixed here)

A6 in spec section 2.3 says: PASS if |dD_w(this) - dD_w(canonical)| <= 0.01 for every walk-measured arm. This lane reads it as follows.
- "This" is an implementation I, either the staged Python recorded graph or the deployed JS recorded graph. dD_w(I, a) = d_w(I, a) - d_w(I, clean), computed with I's own graph and its own language's walk.
- "Canonical" is the same quantity on the canonical graph. dD_w(canon, a) = d_w(canon, a) - d_w(canon, clean).
- Every walk-measured arm is covered. All five arms are walked, so spherical 0.06 is included in A6 even though A1 does not gate it.
- A6 PASS for I means I's arm responses are within 0.01 of canonical on all five arms. A6 is a tie-break sensitivity gate. It does not show that the canonical graph is correct.
- Caveat: for the recorded graphs, the difference includes the non-Delaunay defect in section 0. A FAIL cannot be attributed to tie-break choice alone, and the report will say so.
- A6 is evaluated only after P-E, P-W and R pass. If one of them fails, A6 is reported as not_measured with the reason.

## 6. Outcome readings (fixed before the run)

1. R fails: stop, fix the harness, report. No canonical reading.
2. R passes, P-W fails: walk code diverges on identical graphs. Canonical verdicts are not language-stable. No adoption recommendation.
3. R and P-W pass: canonical A1 verdicts are language-stable.
   3a. Every gated arm passes on canonical: the canonical graph gives a reproducible arrangement-invariant walk leg under this rule. This is a property of one graph under one rule and one input order.
   3b. One or more gated arms fail on canonical: report which arms and by how much. The verdict is then rule-dependent at this resolution. Do not retune.
4. A6 for the recorded Python graph and the deployed JS graph:
   4a. PASS on all five arms: the recorded values are within 0.01 of canonical on those arms. The tie-break does not change the verdict at that tolerance.
   4b. FAIL on any arm: report the arm, both values, the difference, and whether the recorded graph's non-Delaunay defect (section 0) could account for it. Do not attribute the gap to tie-break alone.
5. Adoption recommendation. The lane recommends the canonical rule as the A6 reference only if P-E, P-W and R all pass and A6 is defined. Adoption of the canonical rule for deployed spectral consumers is Jenny's decision (SPEC section 6, ask first). This lane does not deploy, adopt, or change any deployed value.

## 7. Scope statements

- The canonical graph is one reproducible graph under one rule and one input order. It is not the physically correct Delaunay graph of the gasket or of any arm. The gasket's true walk dimension is ln5 / ln2 = 2.3219. The measured values are finite-size, and this lane does not claim to recover that value.
- The canonical graph depends on input order, because the perturbation is keyed on the index. Only the stated order is tested here. Permutation sensitivity is open (report section, open issues).
- No sign or magnitude prediction is registered for the canonical walk values. The record and the feasibility check give the recorded-graph values only.
- The 4-dp rounding is part of the rule. Tie cases are resolved by exact half to even on the binary value, not by a tolerance.

## 8. Amendment 1 (logged after the walk runs)

- Change: the Python selftest now names the Euler identity and the empty-circumcircle check explicitly, for the grid cases and the 120 random points. Spec section 2.4 asks for these checks in --selftest. The algorithm, predicates, rounding, SoS rule, and output code did not change. The JS port gained one `export` on the Predicates class, for test access only.
- Reason for the timing: the spec requires the checks by name in --selftest. The edit was not visible to the walk runs, and it was made after them, so it is logged here instead of hidden.
- Hashes after the amendment (data/frozen-hashes-after-amendment-1.txt): delaunay_exact.py 03de952e9fa16add294d1d708a6024a919db3ce37d056607f91a719e0d076df5; delaunay-exact.js 4ad97e24688b09640a615f989629ff634fbf819b55a6111f1922a538083f719c; data/sets.json unchanged, b18911fc6d77b223dedb07bad6f798edda68a7d6909a08df1391bfb2156a3956.
- Evidence that no output changed: before and after the edit, the canonical and recorded edge lists are identical on all 33 sets. The JS walk output is identical on re-run. The Python walk output is identical on re-run except the canonical_seconds timing field. The walk report and gate verdicts are unchanged.
