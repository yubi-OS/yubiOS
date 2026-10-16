# PREREG-premap-2026-10-16

Lane: B2 (premap-v1 route, harness, pre-registration). Date: 2026-10-16.
Status: frozen at write time. Any change needs an amendment logged in section 8 before the harness is re-run.
Parent: SPEC-arr-premap-2026-10-16.md, section 3.3. Sections 1 to 4 below copy section 3.3 verbatim. Section 6 fixes the harness details that section 3.3 leaves open. Those details are written here before the harness runs.

Execution: The harness is executed only after the module is integrated, by the advisor. Lane B2 does not run the harness against the real premap module and does not measure any gasket or holdout data.

## 1. Frozen values

Frozen values: tol 0.5; fracMin 0.98; D_BAND 0.05; template r2 gate 0.98; depths {4, 5, 6}; missing fractions {0.2, 0.4, 0.6}; seeds {1, 2, 3, 4, 5}.

## 2. Trial matrix

Trials:
- Gasket trials: 3 depths times 3 fractions times 5 seeds = 45.
- Negatives: tri, 40 percent subsets, 5 seeds = 5. Uniform random sets with N in {42, 123, 366}, 5 seeds each = 15. Total negatives 20.
- Depth-6 fill trials with measure=true: 3 fractions times 5 seeds = 15.

Trial counts: 45 gasket, 20 negatives (5 tri, 15 uniform), 15 depth-6 fill. Total 80 runPremap calls.

## 3. Gates

- P1 identification. Gasket trials: identified level equals the template depth for at least 43 of 45 (95 percent).
- P1n negatives. Level null on 20 of 20.
- P2 holes (bookkeeping). Predicted hole set equals the template sites absent from the observation (exact set equality, tol 0.5) on 45 of 45. Report this as bookkeeping, not as a finding.
- P3 fill sign. On the 15 depth-6 fill trials, sign_agree true for at least 14 of 15 (90 percent). Control_agree is reported, not gated.
- P4 (informational). predicted_band status for depths 4, 5, 6. Expected not_available, not_available, measured.

## 4. Scope statement

Scope statement the pre-registration must carry: at the identity frame, P2 holds by construction, and P3 checks that the template fill reproduces the template reading. Neither shows that premap fills improve real arrangements. Registration for real data is out of scope and is the first open gate in the report.

## 5. Verdict rules

- P1, P1n, P2 and P3 are reported as PASS or FAIL with the count behind the verdict.
- P4 is informational. It reports matches_expected per depth and carries no pass or fail gate.
- A trial that throws counts as a failure for every gate it feeds. It is recorded with its error text and is never dropped.
- A verdict is not_evaluated when the run uses a plan other than the frozen plan in section 2. It is invalid_templates when a template count check in 6.1 fails.

## 6. Harness implementation details (fixed before the run)

6.1 Templates. Gasket sites come from genGasket(512, 384, 3, depth) in jev-lens-math.js, for depths 4, 5 and 6. The harness checks site counts of 42, 123 and 366 before any trial runs. Tri sites come from genTri(512), with a check of 19 sites (TRI_ROWS sums to 19). The harness takes templates from the source of record, not from the premap module under test.

6.2 Trial keys and seeds. Each trial has a key string. Gasket: "gasket|d=<depth>|f=<fraction>|s=<seed>". Tri negative: "neg_tri|f=0.4|s=<seed>". Uniform negative: "neg_uniform|N=<N>|s=<seed>". Fill: "fill6|f=<fraction>|s=<seed>". The trial seed is the 32-bit FNV-1a hash of the key string (offset basis 2166136261, prime 16777619, multiply with Math.imul, result as unsigned). The trial seed is passed to mulberry32 for the subset draw and the uniform draw. It is also passed as input.seed to runPremap, which uses it for the control fill.

6.3 Observed subsets. Gasket and tri negatives use a Fisher-Yates shuffle of the site indices, drawn from mulberry32(trial seed): for i from n-1 down to 1, j = floor(rng() * (i+1)), swap i and j. Gasket: drop the first m = Math.round(f * n) shuffled indices. Observed points are the remaining sites, in template order, with integer coordinates. Tri negative: keep the first k = Math.round(0.4 * n) shuffled indices, in template order. For the 19 tri sites this keeps 8 sites.

6.4 Uniform negatives. Draw N points in order: x = 512 * rng(), then y = 512 * rng(). Points are not rounded.

6.5 Fill trials. Each fill trial reuses the observed set and the trial seed of the gasket trial with the same depth-6 fraction and seed. The only change is measure set to true. The 15 fill trials are separate runPremap calls, so the total is 80 calls.

6.6 Expected holes and P2. "Within tol" means Euclidean distance at most tol (0.5), for every use in this plan. Expected holes are template sites with no observed point within tol 0.5. P2 for a trial holds when the predicted holes and the expected holes have equal counts, every expected hole has a predicted hole within tol 0.5, and every predicted hole has an expected hole within tol 0.5. P2 is evaluated on the 45 gasket trials only.

6.7 Level checks. P1 counts gasket trials where identification.level equals the template depth. P1n counts negative trials where identification.level is null. A missing or non-numeric level on a gasket trial counts as a failure.

6.8 P4 expectations. Depth 4 expects not_available, depth 5 expects not_available, depth 6 expects measured. matches_expected is true for a depth only when every gasket trial at that depth matches.

6.9 P3 reading. P3 counts fill trials where fill_measure.sign_agree is strictly true. A fill trial with a null fill_measure, an indeterminate result, or a null sign_agree counts as not agreeing. control_agree is counted and reported and is not gated.

6.10 Plan integrity. The frozen plan is the set of 80 trials in section 2, built by the harness from these rules. A run with any other plan records plan_frozen false and reports every verdict as not_evaluated.

6.11 renderDisksFloat source. The results file records which renderer ran. When the CLI is given a lane A1 arrangement module, its renderDisksFloat is injected. Otherwise the harness uses its inline copy of the section 1 raster rule from SPEC. The source is recorded either way.

6.12 Reading of "40 percent subsets". Section 2 says "tri, 40 percent subsets". This plan reads it as keeping 40 percent of the tri sites, which is 8 of 19 sites. The advisor confirms this reading before the run. A different reading needs an amendment logged in section 8 first.

## 7. Outcome reading

- A FAIL is reported as a FAIL with its count. No tol, fracMin, band, gate or trial is retuned after seeing output (SPEC section 0 rule 3 and section 6).
- P2 is reported as bookkeeping and is not presented as a finding.
- Control_agree is reported with its count and is not used in the P3 verdict.
- Real-data registration is out of scope (section 4). Nothing in the run supports a claim about real arrangements.

## 8. Amendments

Advisor entries, written 2026-10-16 before the first run of harness_premap.mjs against the real module. The run that produced premap-results-2026-10-16.json is the first run that uses them.

### Amendment 1: size floor for identification (pinned, logged before the run)

- Change. identifyLevel returns level null with reason "too_few_observed" when the number of observed points is below MIN_OBSERVED = 6 (the depth-2 template size). This holds whatever the containment fractions say. by_depth is still reported. The floor is a constant in premap.js, not an option, so no caller can retune it.
- Reason. Containment alone has no size floor. One observed point on a depth-1 site returned level 1 (LANE-B1-REPORT open issue 1). A level read from one or two points is not evidence of a template.
- Frozen-trial check. The floor changes no frozen trial. Observed counts from the section 6.3 rules: gasket depth 4 keeps 34, 25, 17 (missing 0.2, 0.4, 0.6); depth 5 keeps 98, 74, 49; depth 6 keeps 293, 220, 146, and the fill trials reuse these sets. Tri negatives keep round(0.4 times 19) = 8. Uniform negatives keep 42, 123, 366. The smallest frozen count is 8 (tri negatives). The smallest gasket count is 17. The floor of 6 sits below both.
- Correction. The feasibility check addendum (section 10) said no frozen trial falls below 17 points. That holds for the gasket trials only. The tri negatives keep 8 points, and the floor does not change them.
- Scope. The floor applies to every caller of identifyLevel: runPremap, the route, and the harness.

### Advisor confirmation of section 6.12 (tri "40 percent" reading)

6.12 (tri negatives keep round(0.4 times 19) = 8 of 19 sites): confirmed by advisor, no change.

### Non-amendment integration edits (no frozen value changed)

- holes.reason. When identification.level is null, runPremap reports holes {count: null, sites: [], reason} with the identification reason, so too_few_observed and no_template stay distinct. Under the frozen plan the reason is no_template for every negative, as before.
- Renderer. harness_premap.mjs uses renderDisksFloat from ../shared/disks.js. The inline copy is removed and the results file records this source. The shared function is the B1 and A1 raster, which are hash-identical on the gasket and tri (see advisor integration report).
- Route. premap-route.js accepts holes {count: null, sites: []} only when identification.level is null. Without this change every negative would return a 500 PREMAP_RESULT_INVALID.
