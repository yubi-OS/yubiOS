# Hierarchy-router: measurement-gated routing regime — BUILD RECORD

Date: 2026-10-06. Companion docs: [solo one-pager](hierarchy-router-solo-2026-10-06.md), SPEC at `skills/jev-orchestrator/SPEC-ROUTER.md` (main 60b44eec). Build per parallel-build-lanes: SPEC → 3 lanes (general/smart) → advisor reconciliation → deploy → policy promote → calibration.

## Shipped

- **Worker**: `jev-router.js` (new part) + 6 patched parts (jev-gate.js, jev-execute.js, jev-main.js, routes-jev.js, jev-decide.js; Lane B modules inlined per their INLINE MODE) — deploy etag `5e3447e5113c14fd`, 42→**43 parts**, crons + 14 bindings preserved, `solar-rbs-entry.mjs` byte-identical.
- **Policy v7** (audited promote, learning `l_5e936507c9740b65`, actor jenny): `routing.bands` (hierarchy-image ≥1.45→lane-draft; ordered-image [1.0,1.45)→lane-classify; sparse-image [0,1.0)→lane-classify; multimodal-probe provisional→needs_approval) + `route.dispatch` builtin (hosts jev.route, methods POST, targets lane-draft/lane-classify). 1 v6-bound approval expired (expected). Changelog row appended.
- **Multimodal intake (operator revision)**: route accepts image/text/multimodal(any). Clef binding verified live: `images: ["data:image/png;base64,…"]` accepted (8 MiB cap); askJev patched for opts.images passthrough.

## Live verification

- Pre-policy (v6): selftest ok, bands empty, text probe → measured (scorer-v2.2 live) + blocked fail-closed. The v6-gate-on-route.dispatch reverse hazard verified graceful (`unknown_tool`).
- Post-promote (v7): health→7, bands→4, selftest 21/21, **gasket L=384 → hierarchy-image → gate allowed → task t_894b380e6126f9bd created**, multimodal probe → needs_approval (band_provisional, never auto-dispatched), text probe → blocked (no_matching_band), no task.

## Calibration record (spec §9)

All 6 gold falsification-corpus fixtures routed through the LIVE route:

| artifact | expected D | live D | expected band | routed band | gate | hit |
|---|---|---|---|---|---|---|
| gasket-L384 | 1.5589 | 1.558937 | hierarchy-image | hierarchy-image | allowed | HIT |
| gasket-L256 | 1.5967 | 1.596710 | hierarchy-image | hierarchy-image | allowed | HIT |
| tri | 1.2636 | 1.263595 | ordered-image | ordered-image | allowed | HIT |
| shuffle-s42 | 1.0355 | 1.035474 | ordered-image | ordered-image | allowed | HIT |
| pumpkin_ring | 0.9772 | 0.977190 | sparse-image | sparse-image | allowed | HIT |
| pumpkin_field | 1.0384 | 1.038390 | ordered-image | ordered-image | allowed | HIT |

**6/6 HIT, Δ=0 at 4 decimals** — the routing bands sit exactly where the falsification corpus pinned them. Band edges [1.0, 1.45, 2.0] CONFIRMED on live traffic. Note: taste fixture f3_sierpinski measures D≈1.35–1.44 under edge-standard-v1 and lands in ordered-image; it is not a hierarchy exemplar and must not be used to tune the 1.45 edge.

## Known follow-ups (recorded, not hidden)

1. **Dispatch-leg outcome capture**: the first live auto-dispatch (gasket→lane-draft 70b model call, in-request after the pipeline) left the action state `unknown` after 1 attempt — reconcile-before-repeat held (no auto-retry, no false terminal). Fix: capture the runLLM outcome synchronously in dispatchRouteAction (small patch), then reconcile/close the seed task.
2. **Multimodal band stays provisional** until its 21-point calibration sweep on real multi-input artifacts (shipped `calibration: "provisional"`, never auto-dispatches).
3. Console Router card deployed to KV `jev-index.html` (band table, recent routes, route form; parser-validated 0 unmatched closes; two pre-existing KV-edit scars repaired: the taste-card comment opener + the split `corpus-nulls` input). Deploy gotcha logged: curl `-d` strips CRLF — KV PUTs of HTML MUST use `--data-binary`.
4. Skills amendments (jev-orchestrator/steady-orbit-deploy router sections) deferred to the next doc pass — the SPEC + this record are the contracts.

## Doctrine, restated

The detector proposes the route; the fail-closed gate disposes. Measurements are data, never authorization. Route decisions are run rows (kind `router`) + append-only task events, idempotent per artifact sha256.

## Addendum — dispatch-leg fix SHIPPED (2026-10-06 ~04:20 PT, follow-up 1 resolved)

Root cause was NOT the outcome capture: the dispatch had captured the model response all along (response_json with route/text_len/neurons/text). The bug was in the VERIFY semantics: the action carries `expected: {status_range:[200,299]}` (required by the propose-time caller-action validator for http-shaped actions), but a lane-* model dispatch has no HTTP status — `evalPredicates` found nothing decidable → verdict `unknown` → the action was demoted AFTER a successful dispatch.

**Fix** (jev-verify.js, one branch): route.dispatch dispatches are verified by their dispatch SHAPE, not the stock http predicates — model dispatches (response has `route` + `text_len`) verify `verified_success` iff text_len > 0; automation dispatches (response has `run_state`) verify from the run task's terminal state; everything else falls through to the stock decision. The evidence row carries `route_verify: {basis: model_text | automation_run_state}` for auditability. Redeploy etag `6792ff0a9ee2cf9f` (43 parts, crons + 14 bindings unchanged).

**Proof, both directions:**
- **Fresh E2E in one request**: gasket-L320 (a never-routed gasket variant, live-measured D 1.600459680939992, r² 0.9996, 366 components) → band `hierarchy-image` → gate allowed → 70b draft dispatch (text_len 2603) → patched verify `verified_success` → **task state `terminal`, reason "all actions verified_success"** — the full lifecycle closed in-request.
- **Seed task closed**: t_894b380e6126f9bd re-verified against its stored model response → `verified_success` (basis model_text) → continue → **terminal, "all actions verified_success"**. No re-dispatch was needed — the outcome was already stored; only the verifier misread it.

**API-contract note (not a bug)**: the task verify endpoint requires `body.action_id` — without it the handler resolves `action = null` and verifyAction 500s (`Cannot read properties of null (reading 'expected_json')`). Callers must pass the action id; the router's own in-request chain does.

**Remaining follow-up (unchanged)**: the multimodal band stays `provisional` until its 21-point calibration sweep on real multi-input artifacts; it never auto-dispatches.
