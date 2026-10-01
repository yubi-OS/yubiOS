# jev-automations — the n8n retarget: worker-hosted Llama automations on the /jev/ console (2026-10-01)

Byline: Shant Tchatalbachian. Status: SHIPPED (live on the steady-orbit worker 2026-10-01T07:06Z).

## Decision record

Jenny's directive (2026-09-30 ~23:48 PT): the n8n side of the lead machine is retargeted — automations deploy on the steady-orbit worker using a Cloudflare-hosted Llama model appropriate for the task; searXNG stays usable directly; Daytona is the code-exec sandbox slot (future, for JS-rendered fetches); cost-low internal tooling centered on the /jev/ dashboard, deploying automations and accepting prompts directly. Locked decisions: HYBRID model split (DefAPI jev-1.13 stays the structured decision layer — calibrated at ~$0.00003/decision; Llama handles generation + safety), THREE-TIER model routing.

n8n keeps exactly one job: the searXNG proxy webhook. The lead machine's three phases move to the worker.

## Architecture

- **Automation registry** (`jev_automations` D1): versioned templates — stages, per-stage prompt + model route, tool_refs, trigger (manual | interval), gate profile. Deploy = new draft version; activate = single-active-per-name (older active versions auto-pause); every run task stamps `{automation_id, name, version}` and an `automation_deployed` audit event. Activation re-validates the stored def (a corrupted def can never go active).
- **Stage engine** (`jev-engine.js`): stage types `tool` (pipeline I/O, GET-only enforced at def validation AND runtime — writes must go through propose_actions/gate), `llm` (prompt interpolation from run context, JSON-mode with repair + one strict retry, fail-soft on unparseable), `builtin` (v1: `lead_research` — the ported lead machine), `guard` (llama-guard-3-8b verdict; unsafe → task parks `awaiting_approval` with reason `guard_flagged`, propose skipped), `propose_actions` (outputs enter the EXISTING deterministic gate unchanged — LLM never authorizes).
- **LLM runtime** (`jev-llm.js`): `classify` → `@cf/meta/llama-3.1-8b-instruct-fp8`; `draft` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; `guard` → `@cf/meta/llama-guard-3-8b`; `raw:` pin allowed. Neuron usage accounted onto the task (`jev_tasks.llm_neurons`). The 70b model speaks full chat.completion via the binding (see lessons).
- **Prompt intake**: `POST /api/jev/tasks` with `payload.prompt` (≤ 8000 chars) — one 70b call proposes actions over the policy tool list; every proposal passes the SAME validation as caller-supplied actions, then the SAME deterministic gate. Prompt is untrusted input: stored verbatim, delimited in the prompt, never interpolated into URLs. `decided_via: llama_prompt`.
- **Scheduler**: worker cron `*/5 * * * *` (metadata `triggers`) → `runSchedulerTick` → interval automations fire with a compare-and-set on `last_fired_at` (a lost tick is fine; a double-fire is not) and per-interval idempotency keys on the created tasks.
- **Lead machine v1**: `jev-lead-lib.js` is a verbatim port of the audit/extract/normalize/template lib — every refuse-to-claim guard preserved (javascript_rendered, form-vendor fingerprints, ~60-vendor booking detection, facebook-only/no-website lanes), validated by 40 ported behavioral tests including both false-positive traps. v1 system of record is D1 (`jev_leads`); HubSpot integration deferred (becomes a policy learning later). Sends are `resend.send` gated actions (Jenny: Resend over Instantly).
- **Console v2** (`/jev/`): prompt console (textarea → task), Automations tab (deploy/validate/activate/pause/run-now with input), models pill (route → model id). Same navy/violet terminal aesthetic, fail-soft sessionStorage.

## Policy

v4 via the AUDITED improve flow (learning `l_415c2960c6ec1556` → promoted): added `web.fetch_public` (GET-only, hosts ["*"], credential-less, response-capped — a deliberate bounded exception; def validation refuses any non-GET stage using it) and `places.search` (POST places.googleapis.com, credential `GOOGLE_PLACES_API_KEY`). Governance note for the record: an any-host read-only tool is the same risk class as a browser; it carries no credentials and its responses are capped and logged.

## Build record

Same method as the orchestrator: capability map approval → ideate-solo (7 variations) → SPEC-AUTOMATIONS.md → five parallel lanes (A registry+LLM runtime+dbx; B prompt-intake+scheduler; C lead-machine port; D routes; E console) → advisor integration that ALSO wrote the one module no lane covered (jev-engine.js) and fixed cross-lane contract gaps (CAS `updateAutomation(id, patch, expectedLastFiredAt)`, `getLeadByDedupeKey`/`getLeadByContactEmail`, `jev_leads.data_json`, llm_neurons accounting). 232/232 tests (lane suites + engine + e2e, all run against the merged tree).

## Live verification (2026-10-01 ~07:05–07:12Z)

- `release-check` automation (tool fetch → 8b extract) run from the console: `terminal:succeeded`, fetch 200/5,995 B, extract = **`v0.8.9`** — correct.
- Prompt intake: "Fetch the latest release of yubi-OS/yubiOS…" → 70b proposed `http.fetch` GET on the exact repo URL → gate allowed → dispatched → honest `unknown` verdict (the model proposed a non-standard `expected` predicate; undecidable predicates verify unknown, never success) → `more_work`. `decided_via: llama_prompt`, neurons 372.
- Policy v4 live via the audited path; `/api/jev/models` returns the three-tier routes; automation deploy → activate → run-all work from the API.

## Lessons (live bugs found and fixed the same hour)

1. **NOT NULL explicit-null trap, round two**: the engine's direct task insert omitted `cost_usd`; because `insertSql` lists every column, a missing key binds as explicit NULL and D1 rejects it even with DEFAULT 0. The `llm_neurons` fix from lane A had covered only itself. Fix: default both NOT NULL numerics in `dbx.insertTask`. Rule: ANY new NOT NULL column needs its insert-layer default in the same commit.
2. **Binding-vs-REST response shapes differ**: llama-3.3-70b-instruct-fp8-fast speaks full chat.completion (`choices[0].message.content`) via the binding; the REST API adds a `response` convenience string the binding may not carry. The old extractor's last-resort `String(obj)` turned the whole response object into the literal text `"[object Object]"`. Fix: `textFrom` handles chat.completion + nested shapes and NEVER stringifies an object; `runLLM` attaches `raw_shape` (JSON of the binding response, 400 chars) when text comes back empty — undecidable LLM failures are now diagnosable from the API alone.
3. **Engine tool stages needed the UA lesson too**: the UA fix shipped for gated dispatch (`jev-execute`) did not cover the engine's own fetch path; GitHub 403'd the automation's tool stage. Fix: the engine always sends `User-Agent: jev-orchestrator/1 (+site)` unless the stage declares one.
4. **Secrets Store ordering (from the earlier pass, restated)**: a binding referencing a not-yet-existing secret fails the WHOLE deploy (CF 10182) — add bindings only after the secret lands.

## Open items

1. `GOOGLE_PLACES_API_KEY` — secret pending in the Secrets Store; the binding is added and the Places leg verified once it lands. Until then lead-research fails CLOSED (`credential_unavailable`, zero fetches — test-asserted).
2. HubSpot as system of record (CRM writes through the gate) — policy learning when prioritized.
3. Daytona sandbox lane for `javascript_rendered` leads (slots into lead-research as a tool).
4. Reply webhook `/api/jev/webhooks/reply` accepts unauthenticated posts in v1 (optional `?k=` shared secret supported); make `k` mandatory when the provider is wired.
5. Prompt-intake `expected` predicate quality: the model proposes non-standard predicates (verified honestly as `unknown`); a stricter prompt contract or an expected-schema lint is the cheap fix.
