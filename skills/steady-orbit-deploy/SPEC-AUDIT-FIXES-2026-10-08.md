# SPEC-AUDIT-FIXES-2026-10-08 — endpoint-audit P0 fixes + live selftest endpoints

Date: 2026-10-08. Implements the P0 + P1 layers of `refs/endpoint-live-audit-harness-plan-2026-10-08.md` (draft PR #305). Companion to `refs/falsification-harness-coverage-2026-10-06.md` (Tier-2 candidates; P2 corpora are a later round, NOT this build).

Source of record for every lane: the live bundle extracted at `session/build-selftests/bundle/` (53 parts, pulled 2026-10-08 ~18:20Z from the deployed worker). Read the actual parts before editing anything; do not work from memory of the code.

## Invariants (non-negotiable)

1. **Selftests never write production state.** No D1 writes, no Vectorize writes (except the one idempotent canary in the map selftest, deterministic id `e<FNV>`), no lead sends, no automation runs, no pending-approval touches. In-process selftests run against `dbx.js memoryDriver()` and `jev-evolution.js memoryEvolutionDriver()` — never `d1Driver(env.DB)`.
2. **No stack traces in any error body.** The generic 500 path in routes-jev.js and index.js must never include a `stack` field.
3. **Fail-closed preserved everywhere.** A gate/config failure ends blocked, never dispatch. No existing behavior changes except the four named P0 fixes.
4. **All new routes are bearer-gated** via the same `requireOperatorAuth` pattern the 2026-10-08 auth pass used (they are operator diagnostics, not site tools).
5. **Entry module `solar-rbs-entry.mjs` ships byte-identical.** No new page routes.
6. **Cost caps:** the relay selftest makes at most ONE TTS call, ONE decide call, ONE chat call, one STT attempt per invocation, and each must be skippable (report `skipped` with reason, never fail the suite on an upstream blip unless the contract itself is broken).

## P0 fixes (Lane A)

### P0-1: POST /api/jev/tasks returns 500 + stack on validation errors

- Site: `routes-jev.js` — the POST handler at `if (p === "/api/jev/tasks" && req.method === "POST")` calls `readJson` then `runPipeline(env, deps, body)`. Validation lives in the ingest layer (`ingestTask` dep; find its module — it throws plain `Error("source must be one of: ...")` and `Error("payload must be a plain JSON object")`), which escapes `runPipeline` and is caught by the generic handler that answers `500 {"error":"uncaught", stack}`.
- Fix shape: at the route boundary, wrap the ingest stage so that validation throws become `422 {"error":{"code":"INVALID_BODY","message":<the thrown message>}}` with NO task row created and NO stack. Distinguish validation throws from real failures: prefer adding a `status`/`code` marker on the throw inside the ingest module (e.g. throw an object carrying `validation: true`) and mapping on that; a blanket try/catch that converts everything to 422 is WRONG (real 500s must stay 500s). Also strip `stack` from the generic uncaught error body in the same pass (invariant 2).
- Tests: (a) missing `source` → 422 with message naming the allowed values; (b) missing `payload` → 422; (c) a genuine internal throw still 500s but carries no `stack` key; (d) a VALID body still creates a task (memory driver) and flows to the gate as today.

### P0-2: GET /api/searxng without `qs` returns relay 500

- Site: `index.js` ~line 5101. `const qs = url2.searchParams.get("qs") || "";` — an empty `qs` is forwarded and the n8n relay answers `500 "Error in workflow"`.
- Fix: before building `target`, `if (!qs) return 400 {"error":"need qs (urlencoded searxng querystring)"}`. POST shape unchanged. (Today's POST-with-no-qs path: apply the same guard if POST shares the handler.)

### P0-3: embed validation error names the wrong parameter

- Site: `index.js` ~line 864 `throw new ApiError(422, "need docs: non-empty string[]")` — the route's accepted parameter is `texts` (verified live: `{texts:[...]}` → 200; the message says `docs`).
- Fix: message → `need texts: non-empty string[]`. Audit sibling messages in the same validator (`docs[${i}] must be a string` etc.) and rename to `texts[i]` for consistency. Do NOT change accepted params.

## P1 — live selftest endpoints (Lanes B, C, D)

Every selftest returns `200 {ok:true, checks:[{name, pass, detail?}], skipped?, cost?}` or `500 {ok:false, failed:<check>}` on an internal error. Never partially-fail silently: every check gets a row, `pass:false` rows carry a `detail`.

### P1-1 + P1-4: orchestrator lifecycle + outcomes ledger (Lane B → new part `jev-selftest.js`)

Exports (exact):
- `export async function handleJevSelftest(req, env, deps)` — router for the paths below.
- `export async function runOrchestratorLifecycleSelftest(deps)` — in-memory lifecycle replay.
- `export async function runLedgerIntegritySelftest(env, deps)` — chain-shape gates + read-only real-ledger parse.

`GET /api/jev/selftest` (lifecycle replay, memory driver only):
1. Seed a synthetic task through the REAL ingest validation (missing source → throws; valid body → task row in the memory driver). Assert ingest rejection does NOT create a row.
2. Understand/decide stubbed (inject stub deps; never call the real LLM): proposed http.fetch action on an allowed host → gate `allowed`; a resend.send-shaped action with a malformed body → gate `blocked`/`needs_approval` per current policy semantics; assert the fail-closed direction.
3. Approval binding: create an approval, assert expiry-on-policy-change logic (craft an older policy version → approval invalid), assert `gateActionRerun`-style recheck passes `{status:'approved', actor}` and forwards the FULL approvals array (the 2026-10-01 adapter lesson — assert the adapter forwards, not drops).
4. Verify/terminal mapping: force outcomes for verified_success / failed / unknown-reconcile paths against the memory driver; assert the six terminal states remain distinct.
5. NO real dispatch, NO env.AI calls, NO fetch to any host. All dispatch/verify legs stubbed.

`GET /api/jev/selftest/ledger` (integrity):
1. Synthetic chain fixtures (in-memory): single-row-both-shapes, split predicted/realized supersedes pair, 3-cycle chain, pending (open) chain, dangling supersedes (target missing). Run the same consolidation logic the hysteresis route uses (`consolidateLedgerChains` — find it in the bundle, likely jev-corpus-routes.js or a shared module; import the REAL function) and assert each fixture's rollup.
2. Read-only real check: `GET`-equivalent over the real outcomes rows (via dbx read, never write) — assert every closed chain parses and no row violates the append-only schema expectations. Read failures are honest `pass:false` rows, never swallowed.

### P1-2 + P1-3: automations + evolution (Lane C → new part `jev-selftest-evolution.js`)

Exports (exact):
- `export async function handleJevSelftestEvolution(req, env, deps)` — router for evolution selftest, candle control, and automations selftest.

`GET /api/jev/evolution/selftest` (cycle replay):
- Build `memoryEvolutionDriver()` + `makeEvolutionStore(driver, deps)` with stubbed deps (LLM stubbed deterministic; queue no-op). Run ONE cycle through the REAL cycle function (`jev-cycle.js runEvolutionCycle` internals or the store's cycle step — use the real code path, stubbing only the model + queue). Assert: preflight runs, measure produces a report, the stay/proposal decision lands, and the cycle row PERSISTS in the memory driver (read it back). This is the in-process mirror of the cron defect: if the same logic persists in-memory but the cron leg doesn't persist in production, the bug is in the scheduled wiring, not the cycle.
- Cron-leg instrumentation (P0-2b from the plan): in `jev-main.js runJevScheduled` / `runEvolutionCycleScheduled`, add structured `console.log("[evolution-cron] cycle_id=... persisted=...")` after the cycle call, and make the scheduled path REUSE the same cycle invocation the manual route uses (diff them; if they already share code, just add the logging + a persist-confirmation log). Report what you found about WHY cron cycles may not persist (error swallowing? different deps? missing await?). Honest diagnosis in the lane report; fix only if root cause is unambiguous, otherwise instrument + report.

`GET /api/jev/evolution/selftest/candle` (positive control):
- Call the REAL candle/detection math (`jev-atoms.js detectionPower`) with planted candleResults at a known amplitude → assert detection; zero-amplitude → assert no detection (FPR floor); assert `candleDue` boundary behavior (due/not-due) with fixed timestamps.

`GET /api/jev/automations/selftest`:
- `validateAutomationDef` on: a valid builtin-only def → pass; a bad-name def → correct rejection; a stage def using a non-GET stage with `web.fetch_public` → rejection (policy interaction). Then the cron CAS probe against a memory driver: fire `runSchedulerTick`-adjacent CAS logic twice in the same instant → exactly one fires (double-fire impossible). Do NOT run the real lead-research automation; do NOT call any model; do NOT touch the active registry in D1.

### P1-5 + P1-6: relays + ingestion (Lane D → new part `jev-selftest-live.js`)

Exports (exact):
- `export async function handleJevRelaySelftest(req, env, deps)`
- `export async function handleJevMapSelftest(req, env, deps)`

`GET /api/relay/selftest` (live, cost-capped):
1. decide: POST internally to the decide route (in-process call of the same handler, NOT an HTTP self-fetch — the placements-route lesson: workers can't fetch their own origin) with a pinned calibration question whose answer band is known (e.g. "Is 2+2 equal to 4? 1.0 yes, 0.0 no" → assert noul ≥ 0.8). Record consumed cost.
2. chat: one short message, assert non-empty reply.
3. tts: one tiny synth (text "ok"), assert audio bytes + non-HTML content type. On ElevenLabs failure → `skipped` with reason, not suite failure.
4. stt: only if TTS returned bytes; multipart round-trip through the same handler path; assert a transcript field exists. Skip otherwise.
- These MUST be in-process handler calls (pass a synthesized Request to the module handlers), never `fetch()` to the worker origin.

`GET /api/jev/map/selftest` (ingestion recall):
1. embed determinism: embed two short texts; re-embed the first; assert identical vectors (or max |Δ| < 1e-6 with a disclosed tolerance if the binding jitters — record which).
2. canary recall: embed one unique canary text (deterministic id), then vector/search for its distinctive phrase; assert the canary is the top match with score above a pinned floor.
3. repo-items smoke: fetch a SMALL target (`yubi-OS/knowledge`, subdir `playbooks`, 10 dirs) — assert `n ≥ 10` and every item carries non-empty text. Do NOT use the 294-doc refs corpus (2.6 MB) in a selftest.

## Wiring (advisor reconciles, lanes propose)

- `routes-jev.js`: delegation lines for `/api/jev/selftest` (→ jev-selftest.js) placed with the other delegations BEFORE the task regexes, following the router-delegation pattern. Auth: reuse the existing operator-auth gate used by other /api/jev routes.
- `/api/jev/evolution/selftest*` + `/api/jev/automations/selftest`: delegate from routes-jev.js to `handleJevSelftestEvolution` (or wire inside the existing evolution/automations handlers — advisor picks the seam with the least blast radius).
- `index.js`: `/api/relay/selftest` + `/api/jev/map/selftest` handlers wired where the relay/ingest handlers live; bearer-gate both (operator key — these are diagnostics with cost, NOT public site tools).
- All wiring via `edits.json` search/replace entries (exact old/new strings, each must occur exactly once in the target file); advisor applies and verifies.

## Boundaries

- Always in scope: the P0 fixes, the six selftest routes, cron-leg instrumentation, wiring.
- Ask-first: any change to the gate semantics, policy validator, or schemas; any fix to the evolution cron leg beyond instrumentation that changes behavior.
- Never: production D1 writes from selftests; real sends; model calls in in-process selftests; entry-module edits; deleting or renaming existing routes.

## Success criteria

1. Every lane: `node --test` green on its suite before returning (tests import the REAL bundle modules with stub deps).
2. Advisor: combined suites green; import graph resolves (no missing-part imports — the CF 10021 lesson); every edit string occurs exactly once; full diff vs live bundle accounted line-by-line.
3. Deploy: multipart upload with metadata from live settings; schedules `["0 * * * *","*/5 * * * *"]` + all bindings preserved; etag recorded.
4. Live verification: all six selftest routes → 200 ok:true (relay selftest may show tts/stt skipped with reason); P0 behaviors live-verified (tasks 422 no stack, searxng 400, embed error text, evolution selftest); all previously-working routes re-spot-checked (health, tasks GET, one corpus selftest).
5. ENDPOINTS.md history item 18 + route rows for the new selftest routes; AGENT.md unchanged unless endpoints changed its inventory.
