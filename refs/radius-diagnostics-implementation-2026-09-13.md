# Radius diagnostics: implementation and verification

## Scope

Adds diagnostic-only `radius/1` profiles and transition intervals to the existing wayfinder. The operative isolation radius stays **0.095**. The `pointmap.js` core and homepage short-introduction prompt remain byte-identical to the pre-change deployment. No new physical field, ranking score, automatic keep/delete rule or claimed forecasting improvement is introduced.

Research: [Landau and radius stability](landau-radius-research-2026-09-13.md). API contract: [AGENT.md](../tools/point-map/AGENT.md).

## Runtime mathematics

`lib/radius-diagnostics.mjs` computes full-precision nearest-neighbour clearances using the same `Math.hypot` chord function as the core. For clearance c_i and the existing strict edge test d<r:

- I(r) = Σ indicator(r≤c_i); ties remain isolated.
- S_R = Σ min(R,c_i), the clipped integral of I(r).
- S_R/N is reported separately so changing corpus size is visible.

Profiles use the fixed grid 0.075, 0.085, 0.095, 0.105, 0.115. Transitions give maximal same-delta and same-sign intervals containing 0.095 within domain [0,2]. Cells use their right endpoint, not the midpoint: a midpoint between adjacent representable floats can round to the excluded left boundary. Brackets, domain endpoints and named witnesses are explicit. Each endpoint shows at most eight witnesses with total/shown counts; full names are preserved.

These are intervals relative to computed distances, not statistical confidence intervals or exact-arithmetic proofs. Optional coordinate displacement and distance-error bounds are caller assumptions. Missing bounds produce an unavailable/undetermined state; `validated` and `certified` remain false. Invalid, zero error or overflowing budgets fail before model work. Attempts to set a different operative radius or grid are rejected.

## Kernel obligations

`RadiusBounds.lean` compiles on core Lean **4.33.0**. The proof-only branch commit `715b92346b446f634cd43d57687329fe8c848add` passed [CI run 34797739861](https://github.com/yubi-OS/yubiOS/actions/runs/34797739861), all three jobs.

Eighteen declarations cover strict-edge/isolated complementarity, equality at a threshold, radius antitonicity, count bounds, conditional perturbation bands and integer clipped-length/area bounds. The existing printed-axiom checker checks a separate `radius-scope.json`; permitted kernel assumptions were retained. No old step, test or recorded-negative gate was removed or relaxed.

Continuous clipped integrals, Float64 chord distances, genuine displacement/error bounds, nearest-neighbour construction and scientific admission remain runtime or modeling obligations. No GL/vortex/phase theorem is claimed.

## API and UI

New maps and previews carry `map.radius_profile`. Baseline map and candidate-preview results also carry `radius_comparison`. The existing compatible-name compare endpoint adds radius comparison inside its response. Saved-map GETs can enrich old v0.2 records without embedding or writing a row; if enrichment fails, the original record remains readable with an explicit `radius_profile_unavailable` reason. Mutation/preview paths still reject inconsistent geometry.

Preview retains source SHA256 and unchanged-anchor checks and creates no repository, saved-map or Vectorize record. Only the disclosed embedding cache may change. Existing storage packing preserves the radius fields without changing old frame IDs.

The UI displays profiles, canonical counts, fractions, clipped/normalized areas, correctly bracketed transition intervals and named boundary witnesses. Missing/legacy profiles are handled explicitly. No radius slider or “best radius” selection was added. The homepage Copy agent guide remains the short introduction referencing the canonical AGENT.md; its full-file-copy behavior was not reintroduced.

## Reference corrections

Dated errata were appended to the historical GL note: equal nonzero b=c can retain a Lyapunov functional under the stated deterministic/boundary assumptions, and 2/9≈0.2222 is an isotropic covariance floor, not a 0.78 ceiling. Existing corpus phase-transition falsifications remain retired.

The round-three record is completed with map 76: 176 items, 64 isolates, V2=0.31855. It distinguishes eight ADDs/two runtime CHANGEs from the PR's eight added/one modified files and leaves the unaccounted runtime CHANGE unexplained. Census entries overlap: 66 entries, 62 unique items, four cross-class duplicates; the isolate count is unchanged.

## Local verification

The complete existing backend test chain passed, with new suites added rather than replacing old gates. Relevant results:

- Radius suite: **76/76**, including all maps 66–76, permutations, rotations, coincidences, strict ties, adjacent Float64 breakpoints, bounded perturbations and witness caps.
- Extra regressions: **13 boundary/read-path checks**, **10,201 integer rectangle cases**, **1,024 simple graphs** across 533 degree sequences; isolate count is invariant for a fixed degree sequence, so that null is degenerate for this statistic.
- Preview suite: **43/43**, including real radius-module outputs, unchanged frame/bits/coordinates/ranking under diagnostic budgets and pre-model rejection of radius overrides.
- Storage: **8 checks**, full 400×768,d=24 case stores **1,404,802 bytes** with the profile, below the unchanged 1.9 MB safe cap; fields round-trip losslessly.
- Existing browser suite: **59/59**, preserving short-introduction copying and old UI behavior.
- Radius browser suite: **86/86**, including intervals, domain ends, conditional states, named witnesses, escaped markup, mobile layout and unchanged baselines.
- Fresh-context general/smart review: initial findings were corrected; follow-up review returned **PASS**. The fixes retained scope labeling and made legacy read-time enrichment explicit/nonfatal while keeping preview fail-closed.

Browser/API fixtures are labeled test doubles. Historical exact replays remain retrospective. Final remote CI, deployment and live-verification receipts follow below after publication.


## Final publication and live verification

- PR [#233](https://github.com/yubi-OS/yubiOS/pull/233) merged as `e9f999126db145ff481658d4fb6fb68f4b7cf649`. Integrated branch [CI](https://github.com/yubi-OS/yubiOS/actions/runs/34799688203) and merge [CI 34799911896](https://github.com/yubi-OS/yubiOS/actions/runs/34799911896) passed all jobs.
- Cloudflare deployment `8fc5fed208814cdf9085033211c0b4da` is live. Four updated public assets matched SHA256; core JavaScript and the homepage short-introduction source remain byte-identical to pre-change.
- Historical map76 now returns the verified profile `[74,70,64,46,38]` at radii `[.075,.085,.095,.105,.115]`; original bits, full points and frame remain unchanged.
- Live noop preview against old text baseline65: HTTP200, canonical delta +0, 12 unchanged anchors, correctly bracketed same-sign interval, persisted=false.
- Live change preview against old text baseline65: HTTP200, canonical delta +2, 11 unchanged anchors, correctly bracketed same-sign interval, persisted=false.
- Live add preview against old text baseline65: HTTP200, canonical delta +1, 12 unchanged anchors, correctly bracketed same-sign interval, persisted=false.
- Saved map count stayed 76 before and after previews: zero new rows. Radius override, zero distance-error bound and negative coordinate bound returned422.
- These candidate texts are mechanical smoke tests, not a new forecast-quality benchmark. No +2/+1 geometry change is presented as an improvement.
