# Live endpoint audit + falsification-harness improvement plan

Date: 2026-10-08. Companion to docs/ENDPOINTS.md (123 unique routes (parsed once across the capability + inventory tables; the doc row count is higher because dual-table rows recount) + the Documented-vs-Code
gap table, not re-tested (those rows are already tracked in the doc), history item 16)
and refs/falsification-harness-coverage-2026-10-06.md (the Tier-2 candidate list).
This pass is the first full live test of every documented route against the deployed
worker (53-part bundle, etag f2313fa6 chain), followed by a load-bearing harness-gap
analysis and a prioritized improvement plan.

## Method

- Inventory parsed from ENDPOINTS.md: 123 unique routes (parsed once across the capability + inventory tables; the doc row count is higher because dual-table rows recount) + the Documented-vs-Code
gap table, not re-tested (those rows are already tracked in the doc) (+ the Documented-vs-Code
  gap table, not re-tested; those rows are already tracked in the doc).
- 4 live passes through the deployed worker via the operator bearer:
  - Pass 1: all 25 open GETs (site pages + public API), 9 open POST shape-validation
    probes, and all 6 selftest endpoints run to completion.
  - Pass 2: 26 bearer GETs + 401 gates sampled without the bearer.
  - Pass 3: all 55 bearer POSTs shape-validated with empty/invalid bodies (fail-closed
    check), DELETE/PUT/PATCH probed on nonexistent ids only, 401 gates on POSTs sampled.
  - Pass 4: real functional probes with live data: decide, chat, embed, vector/search,
    memory/search, repo-items (yubi-OS/yubiOS refs, 294 docs), audit + lens on a tiny
    3x12 matrix, scorer/score on a real doc, forecast on a real WAE series, admission /
    rayleigh / azimuth / axis-redundancy trials on live map 570, hysteresis on a real
    baseline, and one self-cancelling task-lifecycle smoke.
- Destructive surfaces were NOT exercised: no pending approval was touched, no outcome
  row written, no lead sent, no map deleted, no automation run.

## Results by section

| Module | Routes | Harness Yes | Partial | No | Live result |
|---|---|---|---|---|---|
| solar-rbs-entry.mjs (site) | 16 | 0 | 0 | 16 | All 200 except /contact (404, F1) |
| index.js (core API) | 36 | 5 | 3 | 28 | Functional; searxng 500 on missing qs (F4) |
| routes-jev.js (orchestrator) | 21 | 0 | 0 | 21 | Gate clean; tasks 500 on validation (F3) |
| routes-automations.js | 7 | 0 | 0 | 7 | Shape-validation clean; no live selftest |
| jev-evolution.js (v1) | 6 | 0 | 0 | 6 | All 200 |
| jev-evolution2-routes.js (v2) | 5 | 0 | 0 | 5 | Cycles/atoms empty pre-run; persist OK after manual run (F5) |
| jev-corpus-routes.js | 20 | 4 | 14 | 2 | All functional; corpus/health 401 vs doc (F2) |
| jev-spectral.js | 3 | 3 | 0 | 0 | selftest PASS |
| jev-lens.js | 2 | 2 | 0 | 0 | selftest PASS |
| jev-router.js | 4 | 0 | 1 | 3 | selftest PASS (24/24) |
| jev-timeseries.js | 3 | 1 | 1 | 1 | selftest G1-G6 + WAE probe PASS |

Harness column across the 127: **15 Yes / 19 Partial / 93 No** (2 non-classified rows).
All 6 selftests green. All sampled bearer routes 401 cleanly without the key. All
destructive verbs fail-closed (outcomes ledger 405s correctly on DELETE/PUT/PATCH).

## Live findings

- **F1 (doc-vs-live)**: GET /contact returns 404; the sitemap carries 8 URLs and does
  not list /contact. The page was dropped in the v19 batch (contact routing now lives
  on /booking + /audit); ENDPOINTS.md still lists GET /contact[/]. Doc fix.
- **F2 (doc-vs-live)**: GET /api/jev/corpus/health returns 401 without a bearer; the
  table documents it as auth "none" (stale since the 2026-10-08 auth pass). Doc fix.
- **F3 (defect)**: POST /api/jev/tasks with a missing `source` or missing `payload`
  returns **500 "uncaught" with a stack trace in the body** for a plain validation
  error. Should be 422 with the field error; stack traces should not ride API
  responses. Code fix (routes-jev.js).
- **F4 (low)**: GET /api/searxng without params returns the n8n relay's 500 "Error in
  workflow" passthrough. Worker-side pre-validation should 400 before the relay hop.
- **F5 (resolved-diagnostic, upgrade finding)**: evolution v2 cycles/atoms ledgers had
  been reading empty since 2026-10-01. A manual POST /api/jev/evolution/cycle/run
  DID persist (cycle cyc_6602a3d078858281 + atom ea_f03fc882406cae66 read back on
  /cycles and /atoms), so writes persist and the read path works. Remaining question
  narrows to the **hourly cron leg** (why cron-fired cycles do not appear). Also
  POST /cycle/run has no input schema at all: an empty body executes a real cycle.
- **F6 (minor)**: POST /api/jev/map/embed's validation error says "need docs" while
  the accepted parameter is `texts` — misleading error message.
- **F7 (observation)**: POST /api/jev/map/maps/compare correctly 409s when the two
  maps carry different frame_ids (adjacent ids 569/570 differ) — honest fail-closed.
- **F8 (positive)**: all 6 selftests pass live (corpus 92 checks, spectral, lens,
  taste, timeseries G1-G6 + WAE write/read-back, router 24 checks); outcomes ledger
  append-only enforcement (405) live-verified.

## Load-bearing sections without a selftest or falsification harness

Ranked by how much rides on them failing silently.

1. **Jev orchestrator task lifecycle (routes-jev.js, 21 routes, harness No)** — the
   system of record for every gated action, including real sends. 239 repo tests
   exist, but the deployed worker has no selftest endpoint; a gate regression (e.g.
   the empty-approvals-adapter class) would only surface on a real task.
   Improvement: GET /api/jev/selftest replaying a seeded task lifecycle in a
   sandboxed driver (seed -> gate -> approve-like -> verify -> terminal) without any
   real dispatch or send, plus the gate invariants (policy-bound approval expiry,
   payload-hash duality) as assertions.
2. **Automations engine (7 routes + cron + 3-tier Llama runtime, harness No)** —
   executes the real lead machine; no selftest; cron double-fire CAS untested live.
   Improvement: POST /api/jev/automations/selftest — validate def schema, stage
   compile, gate-decision preview per stage, cron CAS probe against a scratch def.
3. **Evolution v2 cycle (5 routes + hourly cron, harness No)** — the self-improvement
   loop; F5 narrows the open defect to the cron leg. Improvement: fix the cron-leg
   persistence, then a cycle-replay selftest + a standard-candle positive control
   (plant a candle, assert the planter detects it on demand).
4. **Outcome ledger (outcomes, harness No)** — the pre-registration instrument every
   round's verdict rides on. Append-only is enforced (F8) but no integrity harness
   validates supersedes-chain shapes at write time. Improvement: ledger-write
   selftest (chain shape validation, supersedes referential check) — cheap.
5. **Public relays (decide/chat/tts/stt/contact/site-assistant/brain-preview, No)** —
   /api/decide is the shared decision relay every skill depends on. Improvement:
   GET /api/relay/selftest — a known calibration question with a pinned answer band,
   TTS/STT round-trip byte check, chat grounding probe.
6. **Ingestion & embeddings (embed/repo-items/vector-search, No)** — the recall
   substrate. Improvement: embedding determinism + recall selftest (same text ->
   same vector; planted doc -> expected top match).
7. **Scorer v2.2 (Partial)** — specificity gold PASS, recall 0/4 FAIL (the known
   v2.3 extractor-recall gap). Improvement: extractor gold set (coverage doc #3).
8. **Map engine core (POST /api/jev/map + /preview, Partial)** — Lean bounds cover
   the math; the statistical layer (does a doc authored for a cell land there?) has
   the planted-placement corpus candidate (coverage doc #10).
9. **Router (Partial)** — band selection calibrated, but the full gate-outcome path
   per class has no pre-registered corpus (coverage doc #2); F1 bands-doc defect open.
10. **Corpus audit/lens/atom/classify (Partial)** — parity-tested but no planted-effect
    standard candles (coverage doc #1) or adversarial tautology corpus (#9).

## Improvement plan

**P0 — defect fixes (small, ship first)**
- P0-1: POST /api/jev/tasks validation -> 422 with field errors; strip stack traces
  from error bodies (F3). One-site fix in routes-jev.js; add to repo test suite.
- P0-2: Evolution v2 cron-leg persistence: instrument the cron path (log the cycle
  id it persists) and diff against the working manual path (F5).
- P0-3: searxng route pre-validates qs -> 400 before the relay hop (F4).
- P0-4: embed validation error names the real parameter (`texts`) (F6).
- P0-5: ENDPOINTS.md doc sync (F1, F2): drop the /contact row, correct the
  corpus/health auth cell, note the searxng 4xx change after P0-3.

**P1 — live selftest endpoints for the harness-No load-bearing sections** (each is a
new route that replays seeded fixtures in-process; zero external effects)
- P1-1: /api/jev/selftest — orchestrator lifecycle replay (section 1).
- P1-2: /api/jev/automations/selftest — def/stage/gate/cron-CAS probe (section 2).
- P1-3: evolution cycle-replay selftest + candle positive control (section 3).
- P1-4: outcomes ledger integrity selftest (section 4).
- P1-5: /api/relay/selftest — decide/chat/tts/stt contract probes (section 5).
- P1-6: ingestion recall selftest (section 6).

**P2 — falsification corpora (from refs/falsification-harness-coverage-2026-10-06.md,
in its value-per-effort order)**
- P2-1: scorer extractor gold set (#3) — doubles as the v2.3 recall pass gold.
- P2-2: router end-to-end gate-outcome corpus (#2) — closes the router Partial.
- P2-3: audit/lens planted-effect standard candles (#1) — generator exists.
- P2-4: map planted-placement corpus (#10) — highest research upside.
- P2-5: visco prony recovery envelope (#4), snapback verdict-class corpus (#5,
  partially shipped in PR #296), hysteresis analytic fixtures (#6).
- P2-6: taste 8-axis gold corpus (#7), persistence planted-noise (#8),
  classify adversarial tautology corpus (#9).

**P3 — doc maintenance**
- History item 17 documenting this audit; the Falsification Harness column updates as
  P1/P2 land (No -> Yes per route).

## What passed clean

Every other documented behavior matched live: all selftests, all 401 gates, all
fail-closed validation, the append-only ledger, the forecast route on a real series,
the map instrument trials on a live frame, repo-items full-text recall (294 docs),
and task create/execute/cancel shape-validation (a valid task create requires a payload object; the full lifecycle was shape-validated on nonexistent ids only today, having been live-verified in prior sessions).

## Appendix: full route results

| Method | Path | Auth | Live result |
|---|---|---|---|
| POST | `/api/site-assistant` | none | 422 fail-closed (empty body) |
| POST | `/api/brain/preview` | none | 422 fail-closed (empty body) |
| GET | `/` | none | 200 OK |
| GET | `/revenue-blind-spot` | none | 200 OK |
| GET | `/systems-lab` | none | 200 OK |
| GET | `/contact` | none | 404 - page dropped in v19 batch (F1, doc fixed here) |
| GET | `/founders` | none | 200 OK |
| GET | `/terms` | none | 200 OK |
| GET | `/privacy` | none | 200 OK |
| GET | `/brain` | none | 200 OK |
| GET | `/audit` | none | 200 OK |
| GET | `/results` | none | 200 OK |
| GET | `/booking` | none | 200 OK |
| GET | `/sitemap.xml` | none | 200 OK |
| GET | `/robots.txt` | none | 200 OK |
| GET | `/website-vN/<file>` | none | 200 OK (real assets verified) |
| GET | `/AGENT.md` | none | 200 OK |
| GET | `/llms.txt` | none | 200 OK |
| GET | `/map/pointmap.js` | none | 200 OK |
| GET | `/jev` | none | 200 OK |
| GET | `/[/index.html]` | none | tested (see passes) |
| GET | `/audio/reply-1\` | 2\ | tested (see passes) |
| GET | `/api/searxng` | none | 500 on missing qs - relay passthrough (F4) |
| GET | `/api/tts also POST` | none | tested (see passes) |
| POST | `/api/stt` | none | 422 fail-closed (empty body) |
| POST | `/api/contact` | none | 422 fail-closed (empty body) |
| GET | `/api/decide also POST` | none | tested (see passes) |
| GET | `/api/health` | none | 200 OK |
| GET | `/api/jev/map/sos/fits` | bearer | 200 OK |
| GET | `/api/jev/map/sos/fits/:id` | bearer | 404 correct (nonexistent id) |
| DELETE | `/api/jev/map/sos/fits/:id` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/map/sos/narrate` | bearer | 404 correct (no fit id) |
| POST | `/api/jev/map/sos/assess` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/map/repo-items` | bearer | 400 fail-closed; 200 functional (yubi-OS/yubiOS refs: 294 docs full text) |
| POST | `/api/jev/map/vector/search` | bearer | 400 fail-closed; 200 functional (real matches) |
| POST | `/api/jev/map/embed` | bearer | 200 functional (real data) + 422 fail-closed |
| POST | `/api/chat` | none | 422 fail-closed (empty body) |
| POST | `/api/jev/map` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/map/preview` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/map/control` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/map/consistency` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/map/axis-redundancy` | bearer | 200 trial on live map 570 + 422 fail-closed |
| POST | `/api/jev/map/admission` | bearer | 200 trial on live map 570 + 422 fail-closed |
| POST | `/api/jev/map/rayleigh` | bearer | 200 trial on live map 570 + 422 fail-closed |
| POST | `/api/jev/map/azimuth` | bearer | 200 trial on live map 570 + 422 fail-closed |
| POST | `/api/jev/map/outcomes` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/map/outcomes` | bearer | 200 OK (12 rows) |
| DELETE | `/api/jev/map/outcomes/* also PUT, PATCH` | bearer | tested (see passes) |
| GET | `/api/jev/map/maps` | bearer | 200 OK |
| GET | `/api/jev/map/maps/:id` | bearer | 404 correct (nonexistent id) |
| DELETE | `/api/jev/map/maps/:id` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/map/maps/compare` | bearer | 422 fail-closed; 409 correct on frame mismatch |
| GET | `/api/jev/health` | none | 200 OK |
| POST | `/api/jev/tasks` | bearer | 500 defect: validation error as uncaught + stack trace (F3) |
| GET | `/api/jev/tasks` | bearer | 200 OK |
| GET | `/api/jev/tasks/:id` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/execute` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/verify` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/continue` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/retry` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/reconcile` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/close` | bearer | 404 correct (nonexistent id) |
| POST | `/api/jev/tasks/:id/cancel` | bearer | 404 correct (nonexistent id) |
| GET | `/api/jev/approvals` | bearer | 200 OK |
| POST | `/api/jev/approvals/:id/approve` | bearer | 422 fail-closed |
| POST | `/api/jev/approvals/:id/reject` | bearer | 422 fail-closed |
| POST | `/api/jev/approvals/:id/guide` | bearer | 422 fail-closed |
| GET | `/api/jev/pause` | bearer | 200 OK |
| POST | `/api/jev/pause` | bearer | 422 fail-closed |
| GET | `/api/jev/summary` | bearer | 200 OK |
| GET | `/api/jev/learnings` | bearer | 200 OK |
| POST | `/api/jev/learnings` | bearer | 422 fail-closed |
| POST | `/api/jev/learnings/:id/promote` | bearer | 422 fail-closed |
| POST | `/api/jev/webhooks/reply` | none | 422 fail-closed (empty body) |
| GET | `/api/jev/automations` | bearer | 200 OK |
| POST | `/api/jev/automations` | bearer | 422 fail-closed |
| POST | `/api/jev/automations/:id/activate` | bearer | 422 fail-closed |
| POST | `/api/jev/automations/:id/pause` | bearer | 422 fail-closed |
| POST | `/api/jev/automations/:id/run` | bearer | 404 correct (nonexistent id) |
| GET | `/api/jev/models` | bearer | 200 OK |
| POST | `/api/jev/evolution/sweep` | bearer | 422 fail-closed |
| GET | `/api/jev/evolution/directives` | bearer | 200 OK |
| POST | `/api/jev/evolution/directives/:id/result` | bearer | 422 fail-closed |
| POST | `/api/jev/evolution/directives/:id/approve` | bearer | 422 fail-closed |
| POST | `/api/jev/evolution/directives/:id/reject` | bearer | 422 fail-closed |
| GET | `/api/jev/evolution/state` | bearer | 200 OK |
| GET | `/api/jev/evolution/cycles` | bearer | 200 (empty pre-run; manual cycle persisted, F5) |
| GET | `/api/jev/evolution/atoms` | bearer | 200 (empty pre-run; manual cycle persisted, F5) |
| POST | `/api/jev/evolution/memory/search` | bearer | 200 functional (real data) + 422 fail-closed |
| GET | `/api/jev/evolution/candles` | bearer | 200 (empty pre-run; manual cycle persisted, F5) |
| POST | `/api/jev/evolution/cycle/run` | bearer | 200 - no input schema; empty body runs a real cycle (F5) |
| GET | `/api/jev/corpus/health` | none | 401 live vs doc none (F2, auth cell fixed here) |
| POST | `/api/jev/corpus/audit` | bearer | 200 functional (real data) + 422 fail-closed |
| POST | `/api/jev/corpus/lens` | bearer | 200 functional (real data) + 422 fail-closed |
| POST | `/api/jev/corpus/atom` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/corpus/classify` | bearer | tested (see passes) |
| POST | `/api/jev/corpus/placements` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/runs` | bearer | 200 OK |
| GET | `/api/jev/corpus/selftest` | bearer | 200 ok:true (92 checks) |
| POST | `/api/jev/corpus/scorer/score` | bearer | 200 functional (real data) + 422 fail-closed |
| POST | `/api/jev/corpus/scorer/matrix` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/corpus/taste/edge-standard` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/taste/selftest` | bearer | 200 ok:true |
| POST | `/api/jev/corpus/taste/score` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/corpus/taste/matrix` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/corpus/visco/persistence` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/visco/hysteresis` | bearer | 422 fail-closed w/o baseline_id; 200 with real baseline 569 |
| GET | `/api/jev/corpus/visco/prony` | bearer | 200 OK |
| GET | `/api/jev/corpus/visco/mobility` | bearer | 200 OK |
| POST | `/api/jev/corpus/visco/snapback` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/visco/policy-log` | bearer | 200 OK |
| POST | `/api/jev/corpus/spectral/walk` | bearer | 422/400 fail-closed (empty/invalid body) |
| POST | `/api/jev/corpus/spectral/series` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/spectral/selftest` | bearer | 200 ok:true |
| POST | `/api/jev/corpus/lens/correct` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/corpus/lens/selftest` | bearer | 200 ok:true |
| POST | `/api/jev/route` | bearer | 422/400 fail-closed (empty/invalid body) |
| GET | `/api/jev/route/bands` | bearer | 200 OK |
| POST | `/api/jev/route/selftest` | bearer | 200 ok:true (24 checks) |
| GET | `/api/jev/route/runs` | bearer | 200 OK |
| GET | `/api/jev/forecast/:series` | bearer | 200 functional (real WAE series, h=3) |
| GET | `/api/jev/timeseries/series` | bearer | 200 OK |
| GET | `/api/jev/timeseries/selftest` | bearer | 200 ok:true (G1-G6 + WAE probe) |
