# WIRING: corrected-hierarchy band (lens-standard-v1, Lane I)

Exact orchestrator wiring for the Lane I deliverables. One page per patch site. Companion: `jev-lens.js`, `PREREGISTRATION-corrected-hierarchy-2026-10-06.md`.

## 0. Prerequisite (Lane H, parallel lane)

`jev-lens-math.js` must export the documented surface consumed by `jev-lens.js`'s adapter (`resolveLensSurface`): `warpMask(rows, mode, coef, inverse)`, an estimator bindable as `estimateMode(rows, mode)` (arity 2) or `estimate_coefficient(mode, ref_rows, obs_rows)` (arity 3, Lane F order), the optional `correctLoop(ref_rows, mode, coef)` convenience, and optionally a mode registry (`MODES`/`ABERRATIONS`/...). Until it lands, every lens route and lens feature returns/behaves as follows: routes fail 503 `LENS_NOT_CONFIGURED` (loud, by design), and the router's lens feature fails OPEN to `null` (the pair band simply never matches without the feature; a missing estimator never blocks a route decision). Nothing is substituted locally.

## 1. New part: `parts/jev-lens.js`

Add Lane I's `jev-lens.js` verbatim as a bundle part (registered in `part_names.json` alongside jev-spectral). It imports NOTHING from other parts; all deps arrive via ctx.

## 2. `jev-corpus-routes.js` -- lens delegation

After the spectral/oracle block (`if (p.startsWith("/api/jev/corpus/spectral") || p === "/api/jev/corpus/oracle") { ... }`, currently ending line ~1017), add the mirror block:

```js
if (p.startsWith("/api/jev/corpus/lens")) {
  const lensCtx = {
    edgeStandardize, edgeMeasure, tasteMath,
    recordRun: async (kind, inputHash, result, notes) => {
      try {
        const row = await recordRun(store, hp, kind, inputHash, result, notes || {}, policyVersion);
        return { run_id: row && row.id };
      } catch (e) { return { run_id: null, run_error: String((e && e.message) || e) }; }
    },
    sha256hex, canonicalJson,
    lensMath,        // import { lensMath } from "./jev-lens-math.js" at the top
    lensFixtures,    // import lensFixtures from "./fixtures/lens-fixtures.mjs"
  };
  try {
    const out = await handleLensRequest(req, p, lensCtx);
    return json(out.body, out.status || 200);
  } catch (e) {
    return err("LENS_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
  }
}
```

plus the top-of-file imports: `import { handleLensRequest, lensFeature, DETECT_THRESHOLDS, MODES as LENS_MODES } from "./jev-lens.js";`. `handleLensRequest` itself returns the 503 `LENS_NOT_CONFIGURED` bodies, so the delegation needs no extra guard.

## 3. `jev-router.js` -- `measureImage` lens feature (V5)

In `measureImage`, after the existing spectral sibling block (the `spectral = null` try/catch around `walkCentroidMode`), add the lens sibling with the SAME fail-open discipline:

```js
// V5 lens sibling (2026-10-06): multi-mode lens estimate against the pinned
// reference frame. Fail-open to null like the spectral sibling: a failed
// estimate NEVER fails the image measurement. CPU guard: the estimator runs
// only on grids the correct path would accept (<= 512x512) with 3..4000
// traced components (same window as the walk).
let lens = null;
if (nComp !== null && nComp >= 3 && nComp <= 4000
    && grid.length * (grid[0] ? grid[0].length : 0) <= 512 * 512) {
  try { lens = lensFeature(grid, lensMath, lensRefRows()); } catch { lens = null; }
}
```

- Estimator: the ADAPTER-resolved one from `jev-lens.js` (`lensFeature`), never a router-local reimplementation (harness rule: a router that measures its own mirror is not a measurement).
- Reference rows: `lensRefRows()` reads case[0].`ref_b64` from the lens fixtures module (the pinned un-aberrated gasket gold; Lane F's documented AO-style reference-frame scope note). Missing fixtures -> `lensRefRows()` returns null -> `lens` stays null.
- Add `lens` to the returned `features` object: `features: { fractal_band: {...}, symmetry_present: {...}, coverage, spectral, lens }`. The feature vector stays plain data; `selectBand` needs no change (the clause reads `lens.detect_score` by dot-path, and clauses require a finite number - a null lens feature fails the clause and falls through, fail-closed).
- No band values are encoded here; the band lives only in policy v11.

## 4. `jev-execute.js` -- `dispatchRouteAction` lane-correct branch

Insert a NEW branch between (a) automation targets and (b) the `model_routes` lookup, so a misdeclared `model_routes.lane-correct` can never hijack it:

```js
// --- (b) lane-correct: DETERMINISTIC lens correction (v11, Lane I) ---------
// No model call, no fetch, no credential. Never add lane-correct to
// model_routes: a model must not stand in for the deterministic corrector.
if (target === 'lane-correct') {
  const img = body.artifact_image;
  if (!img || (typeof img.gray_b64 !== 'string' && typeof img.bitmap_b64 !== 'string')
      || !Number.isInteger(img.width) || !Number.isInteger(img.height)) {
    await routeAppendEvent(deps, task, action, 'dispatch_blocked',
      { reason: 'lane_correct_missing_artifact', target }, policy);
    return { dispatched: false, error: 'lane_correct_missing_artifact' };
  }
  if (body.reroute_depth) {  // depth cap 1: a re-route is never correctable
    await routeAppendEvent(deps, task, action, 'dispatch_blocked',
      { reason: 'reroute_depth_exceeded', target }, policy);
    return { dispatched: false, error: 'reroute_depth_exceeded' };
  }
  try {
    const correction = await runLensCorrect(env, deps, img, { parent_run_id: body.artifact_ref });
    // correction: { status, body } from handleLensRequest's contract.
    await routeAppendEvent(deps, task, action, 'dispatch', {
      target, kind: 'lens-correct', verified: correction.status === 200,
      d_before: correction.body && correction.body.d_before,
      d_after: correction.body && correction.body.d_after,
      verdict: correction.body && correction.body.verdict,
    }, policy);
    if (correction.status !== 200) {
      await deps.updateAction(action, { state: 'unknown', updated_at: now() });
      return { dispatched: true, response: correction, verified: false, unknown: true, cost_delta: costDelta };
    }
    const reroute = await recordTerminalReroute(env, deps, body, correction.body);
    await deps.updateAction(action, {
      state: 'dispatched', dispatched_at: now(), attempts: (action.attempts || 0) + 1,
      provider_ref: 'lens-correct:' + (correction.body && correction.body.run_id),
      response_json: JSON.stringify({ correction: correction.body, reroute }), updated_at: now(),
    });
    return { dispatched: true, response: { correction: correction.body, reroute }, provider_ref: 'lens-correct', verified: true, cost_delta: 0 };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    await deps.updateAction(action, { state: 'unknown', updated_at: now() });
    await routeAppendEvent(deps, task, action, 'dispatch_unknown', { error: msg, target, kind: 'lens-correct' }, policy);
    return { dispatched: false, unknown: true, error: msg, cost_delta: costDelta };
  }
}
```

Helper contracts (implemented once, in the same overlay):

- `runLensCorrect(env, deps, img, opts)`: calls the SAME `handleLensRequest` the route surface uses, composed over a minimal ctx (`edgeStandardize`/`edgeMeasure`/`tasteMath` imported at module top, `recordRun` writing kind `lens-correct` with `notes.parent_run_id = opts.parent_run_id`). NO self-HTTP call (the corpus module's compute-not-fetch convention).
- `recordTerminalReroute(env, deps, body, correction)`: re-measures the corrected artifact (the correction body carries `corrected_b64` when requested with `return_corrected: true` -- request it here) through `measureImage` + `selectBand` ONCE, records a run row kind `router` with `notes.stage = "reroute"`, `notes.parent = body.artifact_ref`, `notes.reroute_depth = 1`, and appends the terminal decision. The re-route is TERMINAL: whatever band it selects is recorded and nothing is dispatched from it (no lane-draft, no lane-classify, no lane-correct). If the re-route again selects lane-correct, record `decision: "blocked"`, `reason: "reroute_depth_exceeded"`.

Run rows: the correction is a child `lens-correct` row; the re-route is a child `router` row; the parent task gets one append-only `dispatch` event. Never a model dispatch anywhere in this branch.

## 5. Policy v11 doc diff (audited promote, not a code edit)

From policy v10 (`worker-deploy/policy_v10.json`), exactly three changes:

1. `tools["route.dispatch"].targets`: `["lane-draft","lane-classify"]` -> `["lane-draft","lane-classify","lane-correct"]`. `model_routes` is UNCHANGED (lane-correct deliberately absent; the deterministic branch requires that absence). `schema.properties.target.enum` gains `"lane-correct"` with description `deterministic lens correction; resolved by the execute branch, never a model route`.
2. `routing.bands` gains, as the FIRST entry (pair bands take declared priority):

```json
{"id":"corrected-hierarchy","modality":"image","feature":"pair","min":0,"max":100,
 "all":[{"feature":"fractal_band.D","min":1,"max":1.45},
        {"feature":"lens.detect_score","min":1,"max":1e9},
        {"feature":"spectral.n_components","min":300,"max":100000}],
 "target":"lane-correct","calibration":"provisional",
 "description":"corrected-hierarchy (v11, Lane I): measured-ordered D [1.0,1.45) AND lens detect_score >= 1 AND n_components >= 300 -> deterministic lens correction then ONE terminal re-route. Thresholds T(astig)=7.6e-3 T(sph)=3e-3 T(tref)=5e-6 pre-registered a priori from Lane F selftest noise (see PREREGISTRATION-corrected-hierarchy-2026-10-06.md). Provisional until the calibration protocol passes."}
```

3. `version`: 9 -> 11 (v10 is the live doc; Lane B's v10 promote already consumed version 10). Everything else byte-identical.

Promote through the jev-orchestration audited flow (fail-closed gate, approval binding, append-only audit log) exactly as v9 -> v10 were. The router refuses provisional bands, so promoting v11 with `calibration: "provisional"` enables measurement + recording but NO auto-dispatch until the calibration protocol passes and the band flips to `calibrated` in a v12 promote (or the same promote after a clean calibration run -- one promote per state change, never both).

## 6. Deploy order (the standing lesson: code first, then policy promote)

1. Deploy the worker bundle WITH the new parts (jev-lens route + router lens feature + execute lane-correct branch) while policy v10 is still live. Invariants during this window: v10 has no corrected-hierarchy band, so nothing selects lane-correct; even a somehow-proposed lane-correct action fails `target_not_declared` in both the router (`decideRoute`) and execute (defense in depth). Zero behavior change.
2. Live-verify: GET `/api/jev/corpus/lens/selftest` must return 200 with all 9 checks passing (it will 500 loudly until Lane H's math + fixtures land -- that is the designed signal, not a bug); POST the pinned gasket-spherical-0.06 fixture render to `/api/jev/corpus/lens/correct` and diff `d_before`/`d_after`/estimates against the Python source of record within the fixture tolerance (edge-standard precedent 4.5e-5). A route that was never live-verified is not shipped; the saved bundle + etag is the rollback.
3. Promote policy v11 (targets + provisional band). Verify with the negative controls: un-aberrated gasket, tri-lattice-19, shuffle-s42 route exactly as under v10.
4. Run the calibration protocol (Set A/B/C per the preregistration). On a full clean pass, pin anchors once, then promote the band to `calibrated`.

Never the reverse order: promoting the policy before the code ships creates a band whose target unresolves at dispatch (`target_unresolvable`), and the standing lesson from the earlier policy/code sequencing incidents is that code always lands first.
