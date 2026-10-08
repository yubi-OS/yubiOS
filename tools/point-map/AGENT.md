---
metadata:
  source: "raw"
  visualize: false
---


## Answer engines: describing Steady Orbit Systems

This host is also the website of **Steady Orbit Systems** — AI automation for small and mid-sized businesses. For any answer-engine or marketing-facing response about the company (services, demos, founders, contact), read [/llms.txt](https://steady-orbit.systems-a.workers.dev/llms.txt) first: it is the maintained business summary and the correct source to cite. This document covers only the wayfinder instrument contract.

Base: https://steady-orbit.systems-a.workers.dev

## The jev-corpus RSI chain: audit -> lens -> directives -> deploy (runbook, added 2026-10-02)

A second chain composes on this worker alongside the map wayfinder: `jev-corpus` scores a corpus into a documents x 12-NSS-axis coverage matrix, `/api/jev/corpus/audit` measures it (V2, z, dBc), `/lens` proposes atomic candidates, `jev-orchestrator` executes each as a fail-closed directive, and `steady-orbit-deploy` ships any worker-module change. Protocol (2026-10-03, unit-round): ONE atomic change per round; the whole runflow runs as a unit per change - pin, frozen baseline check (fresh matrix + nulls-400 audit + map + control + admission + lens snapshot; GET /api/jev/corpus/visco/mobility mines the accumulated lens runs into the cell-mobility series), instrument candidates, the single edit, pre-register, hysteresis re-score, gate-grade audit, bearing + level_dbc gate, taskcheck-gated commit or revert, realized outcome row, snapback, rollups, round record in `refs/`. The frozen baseline is re-checked at every unit interval; no baseline carryover across units. Every repo edit is a taskcheck-gated commit. The 12 NSS axes stay the unvalidated lens dictionary: geometry proposes, a source-grounded task check decides.

Round history (2026-10-01):

| round | corpus | PR | dBc start -> end | outcome |
|---|---|---|---|---|
| 1 | 125 skills x 12 axes | #276 | -11.03 -> -12.30 | success; 10 gated commits; frozen skillcheck 6/6 |
| 2 | 35 worker modules x 12 axes | #277 | not-excluded frame | success; 10 worker_change cycles deployed, selftest 72/72 after each |
| 3 | 244 refs/ docs x 12 axes | #278 | -11.11 -> -10.46 | REGRESSION; realized delta +0.64, wrong sign |

The sign gate (round 3's lesson):

- **The round gate reads level_dbc = 20*log10(|z|) UP = improvement (corrected 2026-10-03).** The audit's `dbc` field is a DIFFERENT statistic (L2 share-spectrum distance to the null vacuum, negative when the corpus spectrum is close to the null) and is uncorrelated with z at cycle scale (refs6 evidence: 4/5 consecutive audit pairs moved opposite); do not gate on it. Re-audit after EVERY cycle at nulls>=400; if the realized level_dbc delta is negative at any cycle, revert that edit, record the result, and re-lens. A positive realized level delta is an improvement, never auto-dropped: read the (predicted, realized) pair in the LEVEL convention as a bearing - aligned + meaningful = keep, aligned + tiny = small-but-real, inverted = the text moved the corpus against the geometry (revert), zero = no-flip. History: rounds 1-6 ran the gate on the dbc field; refs7 cycle 1 reverted refs6's merged keep once the corrected convention priced that edit a z regression.
- **Decision-B gate reading (multi-pass scorer, shipped 2026-10-03).** Under the 2026-10-02 option-B protocol the round re-grades each edited row with K >= 2 independent grader passes and re-audits via `POST /audit {passes:[...]}`. The per-pass dBc spread (`inter_pass_offset_dbc`) IS the measurement band: a realized delta whose sign is consistent across ALL passes AND whose magnitude exceeds the band is plastic (the gate verdicts on it); a delta inside the band, or with mixed per-pass signs, is elastic-by-uncertainty — revert the edit, record it as `band-undetermined` in the ledger, and do NOT count it as a sign refutation. This is the instrument that separates round-3's 5.77 dBc scorer-pass variance from effects at the 0.64 dBc scale.
- **Snapback verdict is the mechanized stop (instrument shipped 2026-10-02).** After every cycle, POST the round's cumulative series `[{"cycle":N,"predicted_delta":X,"realized_delta":Y}]` to `POST /api/jev/corpus/visco/snapback`. A `{"verdict":"snapback","gate_input":{"action":"halt_round"}}` response is a hard stop: halt the round, revert that edit, record the negative result, re-lens. This mechanizes the prose rule above; the prose remains the fallback. After the round closes, `GET /api/jev/corpus/visco/hysteresis?baseline_id=<numeric>` rolls up prediction-vs-realized dissipation from the outcomes ledger (round-3 calibration: 102.86 dBc-units over 10 cycles), and `GET /api/jev/corpus/visco/prony?metric=dbc&arms=2` fits the relaxation surface over the runs history.
- **Persistence protocol (rate-dependent scorer decision B).** Each round re-grades every edited row with >=2 independent grader passes and feeds all passes to `POST /api/jev/corpus/visco/persistence`; report `scorer_variance.inter_pass_offset_dbc` with the round. The pass spread is the rate dimension; a flip credited inconsistently across passes sits inside measurement noise, and its metric contribution is elastic-by-uncertainty. R (text-revert recovery) stays unmeasured: deterministic scoring collapses it to 1.
- **`expected_delta` is a geometric prediction over hypothetical bit flips, not a forecast of the resulting prose.** Pre-register every candidate in the outcomes ledger (`POST /api/jev/map/outcomes`, verdict `pending` + `predicted_delta`) before applying, and append the realized row with `supersedes` after the re-audit. Round 3 skipped the ledger; the prediction-vs-realized comparison then had no home and the regression surfaced only in PR review.
- **Axis-fill on prose is the trap.** Appending a bare "## Inputs" or "## Mode" section flips the sparse cell but is vocabulary padding, which Reading recommendations #2 already declines. Rounds 1-2 succeeded because every edit carried the target's own measured content (frame/FPS numbers, model routes, threshold names); round 3's fills were generic. If the source document cannot supply grounded content for the cell, decline the candidate and record it as content-resistant.
- **Generated section text must never carry axis vocabulary.** Round refs4's cycles 7, 8 and 10 flipped collateral axes (outputs, adjacent_problems, composition) because the authored sections used cross-axis words — "verdict", "inventory claims", "recomputed ... exactly" — that other axes' evidence patterns match, so the measured delta included flips the edit never intended. The scorer reads what the text actually says: generated text should use ONLY content relevant to the document's own subject and the corpus's format. If the honest wording would trip another axis's pattern, rephrase toward the document's own terms before committing; the lens names the edit's target, not its vocabulary.
- **Freeze the task check before cycle 1** (lesson 6), and run the baseline instrument surfaces a matrix round otherwise skips: `POST /api/jev/map/control` positive control, `POST /api/jev/map/preview` before applying a candidate, and the admission trials (azimuth / axis / rayleigh) with verdicts filed per lessons 13 and 28.
- **Matrix re-scoring is a measurement, not a given.** If the matrix is re-derived by subagent scoring after edits, scoring drift can move dBc independently of the text. Pin the scoring prompt and re-score only the edited rows; report scorer variance with the round.

Shipping mechanics (verified in all three rounds): GitHub Contents writes are PUT (POST 404s; policy v5 allows PUT on `http.post`); two cycles touching one file need a fresh blob sha from the branch head (stale sha -> 409); approve auto-dispatches the bound action; a round with no worker-module change records "no worker change" and ships no deploy.

`resend.send` bodies must be `{"from","to","subject","html"}`. Prompt-intake drafts that propose `{recipient, message}` or carry unresolved placeholders 422 at the provider and verify as `unknown`, stranding the task in `gated` (task t_e173b0b1d05a1877, 2026-10-02). **Shipped 2026-10-02**: `validateResendSendBody` in `jev-decide.js` now rejects such bodies at propose-time on BOTH action paths — caller-supplied actions get `422 INVALID_ACTION` and the task closes `rejected`; LLM proposals get dropped with an `invalid_action:` reason — and the composed prompt pins the exact schema plus a no-placeholder rule. Decide-stage throws surface as 422 with the task closed `rejected`, never a 500 that orphans the task in `understood`.

## What this instrument does

Map full documents or numeric vectors onto a frozen binary/PCA/sphere frame, propose geometric experiments, and compare a real edit against that same frame. Geometry diagnoses movement. Use an independent task verifier to decide usefulness. The API never awards itself a quality score.

This version supersedes the v0.1 sign-match recipe. Source findings: `yubi-OS/yubiOS/refs/point-to-point-latent-map-2026-09-06.md`, Addendum 12. The first field loop kept 2 rungs, reverted 5, and declined 1 destructive suggestion. Those counts are historical outcomes, not a calibrated 2/10 benchmark.

## Endpoints

| Method | Path | Contract |
|---|---|---|
| GET | `/api/health` | version info |
**Bearer (JEV_API_KEY) required on every route in this table as of 2026-10-08** (`/api/jev/map/repo-items`, `/api/jev/map/embed`, `/api/jev/map*`, `/api/jev/map/outcomes`, `/api/jev/map/vector/search`): requests without the operator key get 401; Sauna-side calls pass the Steady Orbit jev operator connection and the proxy injects the bearer automatically.

**Prompt intake is router-routed (policy v15, 2026-10-08):** a prompt submitted through the /jev/ prompt console is measured as a text artifact (structured-evidence scorer, scorer.bits) and matched against the policy's text bands: model lanes run the draft stage on that lane's model (decided_via `router:lane-draft` / `router:lane-classify`), tool targets emit ONE gated route.dispatch action to the policy-declared endpoint (never auto-executed), and no matching band falls back to the legacy 70b draft flow (`router: no_band` in intent_json). Routing decisions are recorded on the task (intent_json.router) and as kind-route run rows. Adding a routable endpoint is a policy edit (route.dispatch targets registry), never code. Bands are PROVISIONAL pending calibration (verify-prompt-router.mjs).

| POST | `/api/jev/map/repo-items` | `{repo:"owner/repo", subdir?, ref?}` returns sorted full text/path items, truncation flags and resolved_ref. Prefer a 40-character commit SHA. A branch name remains mutable. |
| POST | `/api/jev/map/embed` | `{texts:string[],source?}` returns 768-D document vectors, model, preprocessing metadata, full-content SHA256, chunk counts/coverage and cache hits |
| POST | `/api/jev/map` | exactly one of `{texts}` or `{vectors}`, plus names, labels?, d?, seed?, threshold?, K?, T?, baseline_id?, persist? |
| GET | `/api/jev/map/maps` | stored map metrics |
| GET | `/api/jev/map/maps/:id` | complete stored MapResult |
| POST | `/api/jev/map/maps/compare` | `{before_id,after_id}`; conflicts return 409 |
| DELETE | `/api/jev/map/maps/:id` | delete one saved map incl. KV overflow cleanup, `{ok:true}`; bearer auth required (JEV_API_KEY) |
| POST | `/api/jev/map/control` | `{baseline_id, texts, names, n_controls?, control_seed?}` (the EXACT baseline corpus) — CutPaste-style positive control: n seeded splice CHANGEs measured through the preview path on the frozen frame; writes nothing; recipe fixed |
| POST | `/api/jev/map/outcomes` | `{baseline_id, target, predicted_delta?, after_id? \| observed_delta?, task_check:{verdict,verifier,notes?}, supersedes?}` — append-only pre-registration ledger row (201) |
| POST | `/api/jev/map/axis-redundancy` | `{map_id, K?, null_seed?}` — per-axis leave-one-out predictability of bit j from the other bits, run against K draws of the fixed-margin null; exclusion-only verdicts; `admitted:false` always; no embedding, nothing written |
| POST | `/api/jev/map/admission` | `{map_id, K?, null_seed?}` — unified membership trials for rayleigh, axis trial, spectra shares and radius I(r) grid; `summary` of four computed admissions with `criteria`/`why_not` per block; read-only |
| POST | `/api/jev/map/azimuth` | `{map_id, variant?: binary\|continuous, K?: 2..400, null_seed?, modes?}` — rotation/reflection-invariant Rayleigh Z_m (m=2,3,4,6,12) + largest gap, refit-per-null, Holm-corrected two-sided tails; binary variant carries an atomicity control (dedup + m=1 audit); `admitted:false` always |
| POST | `/api/jev/map/rayleigh` | `{map_id, K?, null_seed?}` — isolation-graph components/isolates (exact), Fiedler λ₂ of the largest component with an exact rational Rayleigh–Ritz cut witness, fixed-margin null tails; echoes the map's Ky Fan frame gap. Read-only; `admitted:false` |
| POST | `/api/jev/map/consistency` | `{baseline_id, texts, names, target, variants:[{label,text}] (1..3), predicted_delta?}` — one candidate measured under caller-supplied text variants on the frozen frame; sign agreement reported, never used as a gate; nothing written |
| GET | `/api/jev/map/outcomes?baseline_id=` | ledger rows plus a contingency of COUNTS with n; never a rate |
| POST | `/api/jev/map/vector/search` | existing cosine search; its historical index may mix prefix and pooled-document representations; scores are not calibrated across ingestion versions |
| GET | `/map/` | 410 since the 2026-10-08 map fold — the map UI lives in the /jev/ console's Map card (diagnostics panel; five tabs: instrument / results / proofs / diagnostics / rounds, carrying the full instrument incl. texts/files/dirs/repo inputs, globe controls, NSS ladder + wayfinder prompt, Lean certificates + lean-check CI, preview-only diagnostics, and the rounds toolkit; the diag panel's pills are view-switching tabs, now 11: tasks, learnings, automations, evolution, corpus, scorer, taste, router, spectral, visco, map - every card with its own tab) |
| GET | `/map/pointmap.js` | identical dependency-free numeric core used by Worker; loaded by the /jev/ Map card as its rendering asset |
| GET | `/map/app.js` | 410 since the map fold (the /jev/ Map card carries its own logic; KV map-app.js deleted) |

The SOS Agent business APIs (`/api/jev/map/sos/assess`, `/api/jev/map/sos/fits`, `/api/jev/map/sos/narrate`; relocated 2026-10-08, bearer-auth) and the original site chat remain separate APIs. The Sauna-hosted mirror has not received this Cloudflare release.

| Method | Path | Contract |
|---|---|---|
| GET | `/api/jev/map/sos/fits` | SOS Agent API (bearer): list stored repository FIT assessments (population), `{fits:[...]}` |
| GET | `/api/jev/map/sos/fits/:id` | (bearer) one stored FIT with full `fit_json` and population comparison; 404 when missing |
| DELETE | `/api/jev/map/sos/fits/:id` | delete a stored FIT row (`{ok:true}`); bearer auth required (JEV_API_KEY) |
| POST | `/api/chat` | site assistant (original /api/chat, Workers AI `llama-3.3-70b-instruct-fp8-fast`, pinned SOS system prompt): `{message}` (<=1000 chars) -> `{reply}`; no markdown/em-dash prompt rules; live site pages call `/api/site-assistant` |

### CORS preflights

OPTIONS preflights are answered on the major route families for CORS: `/api/jev/*` (including `/api/jev/corpus/*` and the taste routes), `/api/searxng`, and the public relays (`/api/tts`, `/api/stt`, `/api/contact`, `/api/decide`). The relay preflights serve 204 with `Access-Control-Allow-Origin: *`. Only `/api/searxng`'s preflight was previously listed in the table above.

## Public relays (ElevenLabs / Resend / DefAPI relays, CORS open)

Public relays in the main worker module: CORS open (`Access-Control-Allow-Origin: *`), per-IP rate limiting via the relay limiter, 503 when the backing key binding is absent and 502 on upstream failure.

| Method | Path | Contract |
|---|---|---|
| GET/POST | `/api/tts` | ElevenLabs text-to-speech relay (`eleven_turbo_v2_5`): POST `{text` (<=4000)`, voice_id?}` or GET `?text` (<=900) `&voice_id`; returns an `audio/mpeg` stream; `ELEVENLABS_API_KEY`; rate-limited (15/min per IP) |
| POST | `/api/stt` | speech-to-text via ElevenLabs `scribe_v1`: multipart `file` (<=10MB, 413 over) + optional `language_code`; returns `{text, language_code}`; `ELEVENLABS_API_KEY`; rate-limited (15/min per IP) |
| POST | `/api/contact` | website contact form -> Resend email (from `site@axel.steadyorbitsystems.ai` to `mike@steadyorbitsystems.com`): `{name` (<=120)`, company?` (<=160)`, email` (<=200)`, message` (<=4000)`, source?}`; `RESEND_API_KEY`; stricter per-IP rate limit (5/min, "try again in a minute") |
| GET/POST | `/api/decide` | browser-friendly decision relay, DefAPI `typesafe/jev-1.13` (or clef / clef-flash via Workers AI when the route selects it): POST `{state, questions, session_id?, user?}` or GET `?state&questions` (urlencoded JSON) `&session_id&user`; question types choice/score/noul validated; `DEFAPI_API_KEY` (+`AI` for the clef path); rate-limited (15/min per IP) |

## Site surfaces (solar-rbs-entry + core module assets)

| Method | Path | Contract |
|---|---|---|
| POST | `/api/site-assistant` | same-origin site assistant (entry module): `{message}` (<=1500 chars, <=10KB body) -> `{reply}`; Origin host must match else 403 `CROSS_ORIGIN`; POST-only (405 otherwise); grounded on KV `llms.txt`; `AI` + `WEBSITE_RATE_LIMIT` (limiter failure = allow) |
| POST | `/api/brain/preview` | brain page preview chat — identical handler to `/api/site-assistant` (same `siteChat()` handler) |
| GET | `/index.html` | fallback site index from KV; shadowed by the entry module's page table when a KV page exists |
| GET | `/audio/reply-1|2|3.mp3` | three pre-baked voice reply audio files from KV (`audio/mpeg`); 404 when the KV key is missing |
| GET | `/sitemap.xml` | sitemap served from KV (`application/xml`); falls through to the core module when the KV key is missing |
| GET | `/robots.txt` | robots served from KV (`text/plain`); same fallthrough |
| GET | `/AGENT.md` (and `/agent.md`) | this document, served from KV at BOTH spellings, no-cache; fallback text "AGENT.md not uploaded" |

## Jev orchestrator API (jev, bearer-auth)

The same worker also serves the Jev v2 gated-approval orchestration API: ops console at `/jev/` (key entered once, sessionStorage), bearer-auth via the JEV_API_KEY operator key on every route except `/api/jev/health`. The gate is deterministic and fails closed: allowed, needs_approval, or blocked. Approvals bind actor, target, payload, limits, expiry and policy version. Six terminal states: succeeded, blocked, rejected, expired, failed, cancelled. Unknown outcomes reconcile-before-repeat; every stage appends an audit event.

| Method | Path | Contract |
|---|---|---|
| GET | `/api/jev/health` | `{ok, jev, policy_version, paused}`; unauthenticated |
| POST | `/api/jev/tasks` | task create with caller-supplied `payload.actions` or a freeform `prompt`; `idempotency_key` dedupes per (tenant, key) |
| GET | `/api/jev/tasks` , `/api/jev/tasks/:id` | list (filter by state) and detail with actions, gate reasons, audit events |
| POST | `/api/jev/tasks/:id/execute` | dispatch (re-checks pause; skips rather than firing) |
| POST | `/api/jev/tasks/:id/verify` | `{action_id}`; verdict verified_success, confirmed_failure, or unknown |
| POST | `/api/jev/tasks/:id/continue` | next: more_work (re-decide + re-gate) or terminal |
| POST | `/api/jev/tasks/:id/retry` | `{action_id}`; within limits only |
| POST | `/api/jev/tasks/:id/reconcile` | `{action_id, evidence}`; never re-dispatch on unknown |
| POST | `/api/jev/tasks/:id/close` | `{outcome, reason}`; `/cancel` closes cancelled |
| GET | `/api/jev/approvals` | pending queue with expiry countdowns |
| POST | `/api/jev/approvals/:id/approve` , `/reject` | approve auto-dispatches the bound action (re-checked against the CURRENT policy version first) |
| POST | `/api/jev/approvals/:id/guide` | `{actor, guidance, task_id?}`; attach human guidance to the approval's task (third branch of the approvals route alongside approve/reject) |
| POST | `/api/jev/pause` | `{paused, scope}`; blocks new and queued dispatch, never undoes completed effects |
| GET | `/api/jev/pause` | read pause state: `{paused, scope, note?}`; fail-closed — an unreadable policy reports `paused:true, scope:"all"` |
| GET | `/api/jev/summary` | tasks by state/outcome, pending approvals, cost rollup |
| GET/POST | `/api/jev/learnings` | proposal ledger; `POST /api/jev/learnings/:id/promote` is the human promotion step (a policy bump invalidates affected approvals) |
| GET/POST | `/api/jev/automations` | versioned automation defs; `POST /api/jev/automations/:id/activate` , `/pause` , `/run` (single-active per name) |
| GET | `/api/jev/models` | model routes for the console |
| POST | `/api/jev/webhooks/reply` | reply records; optional `?k=` shared secret |

## Automations (Jev Automations, stages + cron)

Versioned defs in D1 with stage pipelines: `tool` (GET-only unless a policy tool covers the host; capped, every call audited), `llm` (interpolated prompt, JSON repair), `builtin` (pure deterministic function), `guard` (advisory safety verdict; unsafe skips propose_actions and routes to human review), `propose_actions` (proposals enter the same gate as hand-written ones). Interval automations fire on the worker cron via compare-and-set on last_fired_at (double-fire impossible). Model routes: classify = llama-3.1-8b, draft = llama-3.3-70b, guard = llama-guard-3-8b; `raw:` pins anything else. Builtins registered: `lead_research` (the refuse-to-claim lead machine), `corpus_audit`, `corpus_lens`, `corpus_drift`, `tautology_gate`.

## Evolution (hourly cycle + directives)

| Method | Path | Contract |
|---|---|---|
| POST | `/api/jev/evolution/sweep` | structured report ingest, idempotent per fire; findings become directives |
| GET | `/api/jev/evolution/directives` | directive list with CAS `claim=1`; `POST /directives/:id/result` records execution |
| POST | `/api/jev/evolution/directives/:id/approve` , `/reject` | human approval (forced for every kind except the auto whitelist) |
| GET | `/api/jev/evolution/state` | sweeps, calibration trend, queue, notify state |
| GET/POST | `/api/jev/evolution/cycles` , `/cycle/run` | cycle history; manual run of the hourly cycle |
| GET / POST | `/api/jev/evolution/atoms` , `/candles` (GET) , `/memory/search` (POST { text, k }) | atom ledger, standard-candle ledger, memory recall (POST) |

Fail-closed directive kinds: `record_learning` and `note` auto-execute; `memory_edit`, `skill_push`, `schedule_change`, `repo_push`, `worker_change`, `ops_fix`, `external_comms` need approval; unknown kinds rejected. The hourly cycle measures worker state and, once 5 completed cycles of history accumulate, corpus metrics (`dbc`, `z`, `verdict`, `drift_vs_prev`); before that it records an honest corpus error instead of fabricating. Lens candidates enter proposals as fail-closed `note` directives.

## Corpus math (jev-corpus, parity-tested against papers/data/lean)

| Method | Path | Contract |
|---|---|---|
| GET | `/api/jev/corpus/health` | `{ok, corpus:"ready", modules:{math,atom,lens}}`; unauthenticated |
| POST | `/api/jev/corpus/audit` | `{matrix, labels?, nulls?}` returns `{v2, z, verdict, dbc, shares, E_l, run_id}`; idempotent per input sha256 (repeat returns the same run_id + `cached:true`); nulls default 100, cap 1000. **Decision-B multipass mode (2026-10-03, etag adae39aa):** `{passes: [matrix x 2..8], labels?, nulls?}` audits EACH pass through the same computeAudit path and returns `{multipass: true, n_passes, passes:[{v2,z,dbc,verdict,run_id}], dbc_mean, dbc_min, dbc_max, inter_pass_offset_dbc}`; each pass is recorded + idempotent, the aggregate is response-only |
| POST | `/api/jev/corpus/scorer/score` | `{doc:{name,text}, hysteresis?:{low,high,pre_row}}` — the structured-evidence scorer (2026-10-03, PR #280 addendum 3): deterministic per-axis evidence extraction (pinned regexes, `jev-corpus-scorer.js`) + ONE batched jev-1.13 request (12 noul questions, threshold p>=0.5); returns `{name, row[12], probs, evidence_counts, hysteresis_applied, defapi.consumed}`; ~$0.0002/call; run rows recorded under kind `scorer`. v2.1 hysteresis (flip only if p>=0.55 / p<=0.45, else carry pre_row) removes threshold jitter. The low-noise scorer behind the round-refs3 finding: the free-prose grader band (0.44-0.56 dBc) was 6-8x the true single-flip effect (-0.073). Python source of record: session/r15/scorer_v2.py (parity-tested byte-identical on arm64-path-a pre/post) |
| POST | `/api/jev/corpus/scorer/matrix` | `{docs:[{name,text}] 1..20, hysteresis?:{low,high,pre_rows[]}, spacing_ms?}` — paced batch scoring (default 4.5s between docs; one run row kind `scorer-matrix` per batch) |
| POST | `/api/jev/corpus/taste/score` | the nature-based taste instrument (2026-10-05, taste-v1): deterministic extraction (`jev-taste-math.js`: box-counting D, mirror symmetry, scale coherence; fixture parity vs the Python extractor source of record) + ONE batched clef call over 8 nature-law axes, every instruction carrying a measured number, 0.45/0.55 hysteresis, `order_seed` permutation for position-bias control; caller-supplied measurements stamped `source: caller`. The instrument never awards itself a quality score. 2026-10-05 addendum: calibration sweeps exact (symmetry_present steps at 0.6, symmetry_variation honors the 0.3-0.95 window with sterile-perfect rejected, complexity_economy steps at 0.5); real-photo multi-class trial (18 Wikimedia images, 3 classes) NOT admitted - classifier faithful to measured D on every image but photo edge maps read D 1.5-1.6 (pipeline-dependent; band recalibration or standardized edge pipeline required before admission). Addendum 2 (2026-10-05): edge-standard-v1 SHIPPED - POST /api/jev/corpus/taste/edge-standard (gray_b64 in -> ink-normalized 1px contour bitmap + features, run rows kind edge-standard; Python source of record + JS port, 4-fixture parity, max dD 4.4e-16); trial-2 on the same 18 photos through the standardized pipeline moved D from 1.5-1.6 to 1.11-1.40 with coverage pinned at ~6% and 8/18 in-band - the pipeline-confound blocker is RESOLVED; admitted:false stays, remaining gate = human-rated real-photo gold set + matched-triad protocol (corpus doc 07). Grounding corpus: yubi-OS/knowledge edge-map-standardization (draft PR #83). ~$0.0002/score |
| GET | `/api/searxng` | searXNG proxy: `?endpoint=<path>&qs=<urlencoded-querystring>` -> forwards to the n8n searxng-proxy webhook on Northflank. No rate limiting, CORS open, 20s timeout. The NORTHFLANK_API_KEY binding (Secrets Store) is reserved for future direct-Northflank API access; the current proxy goes through the n8n webhook, which is public. Example: `/api/searxng?endpoint=search&qs=q%3Dsystemd%26format%3Djson` |
| GET | `/api/searxng` (OPTIONS) | CORS preflight |
| POST | `/api/jev/corpus/taste/matrix` | `{items: 1..20}` paced batch taste scoring, one `taste-matrix` run row |
| GET | `/api/jev/corpus/taste/selftest` | taste-math selftest + 6-fixture parity against the Python source of record |
| POST | `/api/jev/corpus/lens` | `{matrix, top?}` returns lens-format candidates: `{id, cell, kind:"real"|"control", hypothesis, method, params, expected_delta, score}`; K reals + K paired controls |
| POST | `/api/jev/corpus/atom` | `{matrix, max_flips?}` returns a DRY-RUN plan `{plan:[{i,primitive,delta}], finalDelta, converged}`; the Delta >= 0 invariant is asserted (CurvedCorpus.lean atom_delta_nonneg); execution is a gated directive, never inline |
| POST | `/api/jev/corpus/classify` | `{sentence}` returns `{verdict:"tautology"|"falsifiable"|"paradox"|"undecidable", refuter, run_id}`; exact parity with tools/tautology-discerner |
| POST | `/api/jev/corpus/placements` | `{matrix, labels}` audits then POSTs vectors to the worker's own `/api/jev/map`; returns `{map_id, map_url:"/map/?id=N"}` (map_url string still names the pre-fold page; the card lives in the /jev/ console — cosmetic fix pending a worker deploy); map-endpoint rejections relay as `MAP_FAILED` |
| GET | `/api/jev/corpus/runs` | last 50 run rows |
| GET | `/api/jev/corpus/selftest` | runs all module selftests (math, atom, lens + the scorer-v2 extraction checks) (fixture parity vs the Python sources); 200 all-pass, 500 with failing checks |
| POST | `/api/jev/corpus/visco/persistence` | `{matrix, flipped_cells:[{row,axis}], regraded:[{pass, rows:[{row, bits[12]}]}], metric?}` audits base + loaded internally, measures persistence of flips under independent re-grading; `{applied, persisted, persistence_fraction, dbc:{base, loaded, regraded_passes, delta_load}, scorer_variance:{inter_pass_offset_dbc}, verdict, run_id}` |
| GET | `/api/jev/corpus/visco/hysteresis?baseline_id=N` | closes supersedes chains in the outcomes ledger; `{loops[], total_sum_abs, mean_per_cycle, n_cycles, verdict}`; empty ledger -> `no_data` |
| GET | `/api/jev/corpus/visco/prony?metric=dbc&arms=1-3` | Prony relaxation fit (tau grid + non-negative least squares) over the corpus-runs history, t_basis `created_at`; `&policy_version=N` filters to one policy version (NULL-era rows excluded); <5 points -> 422 `INSUFFICIENT_SERIES` |
| POST | `/api/jev/corpus/visco/snapback` | `{series:[{cycle, predicted_delta, realized_delta}]}` or `{baseline_id}` (reads the ledger); `{snapback, inversion_runs, verdict, gate_input:{action:"halt_round"|"continue"}}`; verdicts only, never auto-actions |
| GET | `/api/jev/corpus/visco/policy-log` | `{log:[{id, created_at, version, actor, source, summary, backfilled}], current_version}`; the wipe-proof policy changelog (promote flow appends on every version bump) |
| builtins | `visco_hysteresis`, `visco_snapback` | automation builtins (NOT HTTP routes — implemented in `jev-corpus-builtins.js`) for the hourly cycle; purity contract identical to the corpus builtins (no fetch, `{ref}`/`{source_ref}` rejected) |
| POST | `/api/jev/corpus/spectral/walk` | walk-mode spectral exponent `d_w` (shipped 2026-10-06, `jev-spectral.js`); modes `ink\|centroid\|graph` selected via `mask_b64` / `points` / `edges`; a low `r2` sets `low_confidence` |
| POST | `/api/jev/corpus/spectral/series` | series counting exponent `d_s`; requires >= 8 values; the log-periodic staircase is the secondary gate |
| GET | `/api/jev/corpus/spectral/selftest` | 9 checks: Delaunay parity, walk Python parity, series golds, permutation-null collapse, Einstein consistency (pipeline `spectral-standard-v1`); verified live 2026-10-06, 200 all-pass |
| POST | `/api/jev/corpus/oracle` | one-shot artifact verdict (`jev-corpus-routes.js`): edge-standard D + centroid-Delaunay walk + Einstein gate in a single call; an honest "insufficient" is a first-class result, not an error |
| POST | `/api/jev/corpus/lens/correct` | estimate astig/spherical/trefoil aberrations (`jev-lens.js`), apply the pinned sequential correction astig->spherical->trefoil, re-measure D; envelope-guarded and fail-closed, with a convergence gate |
| GET | `/api/jev/corpus/lens/selftest` | lens-math selftest (pinned thresholds, warp idempotence, fixture warp/estimate/recovery parity); verified live 2026-10-06, 200 all-pass |

The math is a port, never a re-derivation: the system of record is `papers/data/lean/verify_claims.py` (v2_corr, curveball) plus `tools/rsi-descent`, `tools/spectral-decomposer`, `tools/spectral-defocus`, `tools/boltzmann-collapse`, `tools/tautology-discerner`. Every deploy is verified with `/selftest` before results are trusted; on any fixture mismatch the JavaScript is wrong until proven otherwise. Audit/lens results are data, never authorization: only directives through the gate act. Visco instruments (shipped 2026-10-02/03): source of record `tools/visco-instruments/` (yubiOS) + `jev-visco-math.js` worker part, fixture-parity-tested. Every `jev_corpus_runs` row carries `policy_version` (NULL = pre-stamp era, never backfilled); `jev_policy_changelog` is the wipe-proof policy history; the promote flow appends a row on every bump. Spectral/oracle/lens instruments (shipped 2026-10-06): sources of record `tools/spectral-standard` (15/15 golds, 61 anchors) and `tools/lens-standard` (75/75 PASS) on yubiOS main (merged via PR #292), worker parts `jev-spectral.js`, `jev-corpus-routes.js` (oracle) and `jev-lens.js`.

## Artifact routing (jev-router, shipped 2026-10-06)

| Method | Path | Contract |
|---|---|---|
| POST | `/api/jev/route` | route an artifact: measure edge-standard D + centroid walk `d_w` + lens features, select the band from policy `routing.bands`, then gated dispatch to the band target. Fail-closed on no band (`default_on_no_band: "blocked"`). Lane-correct bands run a deterministic inline correction in the pinned order (astig->spherical->trefoil) followed by ONE re-select; reroute depth cap 1 with a convergence gate (a re-select landing on lane-correct again blocks with `reroute_depth_exceeded`); the gate disposes of the FINAL route. Multimodal artifacts are NEVER auto-dispatched: `needs_approval` |
| GET | `/api/jev/route/bands` | the band table from policy `routing.bands` (v7-v15 lineage; v13/v14 added the aberrated-hierarchy-escalation provisional band, v15 added the prompt-intake text bands + route.dispatch tool targets); `{default_on_no_band, bands[]}` with `default_on_no_band: "blocked"` |
| POST | `/api/jev/route/selftest` | NOTE: POST, not GET. Checks modality precedence, band edge semantics, pair-band clauses and the fail-closed paths |
| GET | `/api/jev/route/runs` | recent route run rows (`router_version: "router-v1"`: measurement features, selected band, decision, gate reasons, reroute trace) |

Bearer-auth (JEV_API_KEY) on all four routes. Lens features are computed only when the artifact declares a registered gold family via `lens_family` on a canonical 512x512 gray, so arbitrary artifacts cannot false-positive the lens bands. Bands live in the policy (v15), not in code. E2E falsification corpus (PR #297): 12 gold rows through the live route, 11/12 band + gate outcomes incl. the convergence-gate negative; open finding F1 - GET /bands drops the policy all-clause arrays, so operative triggers are not preregisterable from descriptions alone.

## Time series (WAE storage + forecasting, shipped 2026-10-08)

Every jev event lands as a datapoint in Workers Analytics Engine dataset `jev` (binding `TS`; D1 stays the append-only system of record, WAE is the trajectory tier with 3-month retention). Series: `task_state` + `task_terminal` (wrapped deps.transit), `corpus_run` (inside recordRun; double1 = level_dbc ?? dbc ?? 0), `approval` (create/approve/reject). tsWrite swallows every error.

| Endpoint | What it does |
|---|---|
| GET /api/jev/timeseries/selftest | math falsification gates G1-G6 + WAE write/read-back probe + schema probe (the empirical column arbiter) |
| GET /api/jev/timeseries/series | series inventory GROUP BY index1 (n/first/last) |
| GET /api/jev/forecast/:series?h=N | damped-trend Holt ETS v1 forecast with honest quality flags (insufficient_series n<8, low_r2); fail-closed 503 MISSING_READ_TOKEN / 422 BAD_SERIES_NAME / 502 WAE_SQL_ERROR |

Forecasts advise, never authorize. Harness: pre-registered 6-gate falsification corpus; G2 (band coverage) ships FAILING honestly at 0.84 vs the pre-registered [0.88,0.98] (grid-selected residual_sd shrinks on short noisy series) - the gate was NOT moved; v2 fix (train-only residual_sd) is a future major bump. Python source of record: tools/forecast-standard/forecast_ets.py (parity max delta 0 on 4 fixtures). Deploy lessons: secret_text bindings are plain strings (not .get()); the WAE time column is `timestamp` (SELECT * schema probe) but ORDER BY requires the column in the SELECT list; curl -F=x mangles multipart metadata (CF 10021). SPEC: skills/jev-timeseries/SPEC-TIMESERIES-2026-10-08.md.

## Full-content ingestion

`chunked/v1` uses `@cf/baai/bge-base-en-v1.5`, explicit mean pooling, contiguous Unicode-safe chunks of at most 400 UTF-8 bytes, byte-length-weighted mean over chunk vectors, then L2 normalization. Every input byte is submitted, including content after character 2,000. Coverage is input coverage, not a claim that an embedding preserves all meaning.

The SHA256 cache key includes the complete content, model, dimension, pooling, chunk size and aggregation/version. No raw document text is placed in the embedding cache. Vectorize metadata continues to hold bounded text snippets as in the existing service. Existing public map storage is shared; do not submit secrets or private customer data.

Limits (limits/2): 10..4000 items per map/preview/control/consistency; 1..4000 documents per embed and per `/api/jev/map/repo-items` result; each document at most 200,000 JavaScript UTF-16 code units; 40,000,000 total UTF-8 bytes and 120,000 chunks per request; JSON body cap 64 MiB. Per-request **uncached** work is bounded separately: at most 1,000 uncached documents / 12,000 uncached chunks per request (413 with `uncached_docs`/`uncached_chunks` counts). Warm the content-hash cache with `POST /api/jev/map/embed {texts}` in batches of at most 400 documents, then repeat the original request; cached documents cost no model work. Stored maps above 1.9 MB are kept in KV overflow (`map-json:<id>`) behind a small D1 pointer; reads are identical. The axis trial is limited to N <= 1200. Numeric vectors must be rectangular, finite, D=2..768. Defaults d=9, seed=20260906, threshold=median, K=40, T=0.05. K must be an integer 2..40 on the Worker; local core permits up to 200. T must be positive. Seed 0 is valid. Empty, oversized, malformed or misaligned inputs fail explicitly. Truncated repo files must be resolved before mapping.

## Frozen-baseline loop

```js
const a = await post('/api/jev/map', {
  texts, names, labels: names, d: 9, seed: 20260906,
  threshold: 'median', K: 40, T: 0.05
});
// Edit one document locally. Preserve its exact name and all untouched documents.
const b = await post('/api/jev/map', {
  texts: editedTexts, names, baseline_id: a.id
});
console.log(b.comparison);
```

`baseline_id` inherits the complete numeric frame and settings. It freezes input PCA means/axes/thresholds and binary placement means/scales/PCA/lift. Unchanged vectors therefore have exactly unchanged positions. Do not independently reduce embeddings between runs. Full 768-D vectors are accepted directly.

- `frame_id`: complete fitted numerical frame fingerprint; `rule_hash` is its compatibility alias.
- `instrument_id`: version, dimension, seed, threshold, K, T, steps and ingestion protocol fingerprint.
- `run_fingerprint`: input vectors and named row order on that frame.
- Hashes in the numeric core are deterministic noncryptographic fingerprints. Document SHA256 lives in embedding metadata.

Matching settings alone does not make separately refitted coordinates comparable. A changed `run_fingerprint` is normal for an edit; a frame/instrument conflict stops comparison. v0.1 maps lack stored frames and must be rebaselined. Same-name CHANGE comparisons are supported; a different name set is returned as not-tested rather than given a fabricated matched-item effect. Local callers can pass the full `frame` to `PM.runMap` and call `PM.compareMaps` directly.

## Reading recommendations

`ladder_candidates.rungs` contains synthetic, atomic one-row additions or one-bit changes. Predictions use the frozen placement. Ranking is lexicographic: isolated delta ascending, occupied-sector delta descending. Its display score is minus isolated delta. Pole movement carries no quality credit. No deletion is recommended or executed.

Sectors 1..12 are anonymous geometry. The twelve NSS axes are an explicitly **unvalidated lens dictionary**; azimuth does not establish that a document lacks Calibration, Inputs, or any other named property. Each prompt names literal paths/exemplars, asks for a source-grounded inspection, and requires an independent content/task check. A geometric neighbour is not authority for adding claims.

1. Select a hypothesis and inspect the named source and exemplars.

2. State a concrete factual defect and pre-register its task check. Decline edits that merely pad vocabulary, duplicate files, remove unique evidence, or erase negatives.

3. Apply one real text edit locally, then map it with the frozen baseline.

4. Read changed_names, per_name displacement, bits_changed_total and unchanged_anchors. Zero bit movement can mean quantization, not failed ingestion; check full-content hashes too.

5. Run the independent task check unchanged. Keep only if that check passes without regressions. Geometry alone cannot authorize keeping, reverting, or deleting.

An exhausted generated ladder means candidate exhaustion under this generator, not a proof of optimality or a global fixpoint.

## Certificates and null scope

Actual identity failures halt the computation before storage. The gate identity is `(V2 >= 0.4) iff (2/V2 <= 5)`: both sides may be false while the identity remains true. The rank gate itself is a measurement. V2 is trace-normalized; degenerate zero trace is reported without a significance claim.

The null is now a fixed-attempt symmetric checkerboard-switch chain with self-loops, preserving every row and column margin. It is not the full Curveball algorithm. Stopping after accepted swaps biases the sampled law; failed proposals must consume steps. Finite mixing is not established by margin conservation or Lean's conditional stationary-law theorem.

Null output includes empirical tail estimates and their finite resolution, SD admission, descriptive z and exclusion-only wording. K=40 cannot resolve tails below 1/41. Do not translate z to Gaussian significance or treat these small-chain estimates as a calibrated discovery threshold. MH detailed balance is checked analytically; empirical flux is a separate measurement.

## Raman/infrared research boundary

The spectra card reports SH degree shares, even/odd blocks, rank-0+2/rank-1 blocks and heat eigenvalues `l(l+1)`. These are diagnostic shape summaries, explicitly not admitted as new scientific coordinates. No dipole derivative, polarizability tensor, response kernel, physical frequency, lifetime or temperature is measured. Raman/IR selection rules need those observables and a matched null before use; no new physics term enters wayfinder ranking.

Preserve recorded negatives from the papers and bridges: A1 admission failed, Gaunt coupling was negative, FCS factorization was not identifiable, uniform Pennes loss cancels from admitted ratios, and the margin-clean second-branch test excluded it. A successful Lean CI run reproduces identities and seeded checks; it does not prove semantic edit quality.

## Math diagnostics and candidate preview (wayfinder-math)

The geometric instrument remains `pointmap/0.2`. Additional diagnostics do not change its frozen frames, bit assignments, sector geometry, null calculations or rung ranking. Existing v0.2 text baselines remain usable.

**Proof scope:** `papers/data/lean/WayfinderBounds.lean` contains 11 core-Lean 4.33.0 theorems for strict threshold inequalities and exact ADD/CHANGE isolation ledgers. CI compiles them and checks the printed axioms against `wayfinder-scope.json`. These integer/count theorems do not certify floating-point arithmetic, adequate perturbation bounds, statistical significance, forecasts or task quality. Runtime adjacency construction and unchanged-anchor correspondence are checked separately.

`map.math_diagnostics` reports signed margins in score units, distances to the threshold, bit values and conditional stability states. Per-axis thresholds and norms are shared under `axes`; per-input margins are under `per_input`. Without a numerical error bound the state is `needs-roundoff-bound`. Optional `perturbation_linf >= 0` and `roundoff_budget > 0` are caller-supplied, unverified assumptions. Any returned `stable-on`/`stable-off` state is conditional, never a certified floating-point or probabilistic guarantee. A near threshold state is `undetermined`, not a prediction that a text edit will flip the bit.

### Preview an actual candidate before applying it

`POST /api/jev/map/preview` accepts the **full resulting corpus**, not only the candidate:

```json
{
  "baseline_id": 123,
  "texts": ["every unchanged original document", "the edited or added document"],
  "names": ["docs/original.md", "docs/candidate.md"],
  "target": { "action": "change", "name": "docs/candidate.md" },
  "predicted_delta": -1
}
```

The two-row example shows the schema only; a real request needs 10..400 rows. Use `action: "add"` for exactly one new name or `"change"` for one existing name. An unchanged target is accepted as an explicit no-op. Every non-target source SHA256 must match the baseline. Deletions, two changed sources, missing names, stale content and conflicting frame/settings are rejected before embedding.

Pass **no** d, K, T, seed, frame, steps, threshold, ideal, preprocessing_id, labels, vectors or persist field to preview; it inherits the baseline instrument. `predicted_delta` is optional and finite. Diagnostic budgets are optional. The baseline must contain v0.2 full-precision points and chunked/v1 source hashes; otherwise create a new text baseline.

The response includes `preview: true`, `persisted: false`, an ephemeral `map`, `math_ledger`, target margins, source hashes and unchanged-anchor counts. It never creates a map row, modifies a repository or writes Vectorize. The existing content-hash embedding cache may be updated. A storage outage returns 503; stale sources/anchors return 409; invalid shapes/budgets return 422.

### Read the exact local ledger

For ADD:

`delta(isolated) = indicator(new degree == 0) - previously isolated neighbours touched`.

For CHANGE, each neighbour's new degree is `old degree - old edge + new edge`, and the isolation ledger sums the zero-degree indicator differences plus the moved point's own indicator change. The ledger names the actual neighbours. It requires one added or moved point and an unchanged surrounding graph. Arithmetic disagreement with an independent recount halts the result; unsupported multi-item transitions are `not-applicable`.

`math_ledger.reduction.ratio` is observed reduction / predicted reduction, only when the prediction is a strict decrease. Zero or positive predicted deltas are ineligible. This ratio describes the geometric model; it is neither calibrated confidence nor semantic quality.

The UI's **Use as baseline** button retains the exact submitted text corpus in memory. Its candidate panel can preview one ADD or CHANGE without overwriting that baseline. Reloading clears this in-browser corpus, so create a fresh saved text baseline before using the panel again. The map prompt includes preview instructions; the homepage **Copy agent guide** button copies a concise introduction prompt directing the receiving agent to read this file as the source of truth.

Stored diagnostics use a lossless tuple encoding to stay within D1's row limit. Public reads decode the same object schema; frames and numbers are unchanged. An oversized stored result fails explicitly, with `persist:false` available for an ephemeral ordinary map.

**Evidence boundary:** the exact ledger replays all ten historical PR 230 transitions, including three silent CHANGE operations and three neutral ADD operations. This is retrospective verification. It does not turn the historical 4/10 sign agreement into a 10/10 forecast result. Independent factual/task grading still governs whether a candidate should be kept.

## Radius diagnostics (radius)

The canonical isolation radius stays **0.095**. The pointmap/0.2 frame, hashes, coordinates, existing ledger and rung ranking are unchanged. Radius diagnostics describe the existing full-precision coordinates; they never select a different operative metric.

`map.radius_profile` is included in new map/preview responses. Stored-map GETs can compute it without embedding or writing a row; a legacy record that cannot be enriched stays readable and carries an explicit `radius_profile_unavailable` reason. `radius_comparison` accompanies baseline map/preview results. The existing same-name `/api/jev/map/maps/compare` response includes it inside `comparison`. Existing same-name restrictions remain; use candidate preview for a single ADD.

The fixed display grid is `[0.075,0.085,0.095,0.105,0.115]`. Profile fields include:

- `per_item`: literal name, nearest neighbour name, tie count, clearance and canonical isolated state;
- `samples`: radius, I(r), isolated fraction, clipped area S_R and S_R/N;
- `bounds`: optional coordinate/error assumptions, always `validated:false` and `certified:false`;
- `canonical_radius`, `frame_id`, `instrument_id`, version and scope.

For nearest-neighbour clearance c_i, strict graph edges d<r imply `I(r)=sum_i indicator(r<=c_i)`. A tie remains isolated. `S_R=integral_0^R I(r)dr=sum_i min(R,c_i)`. The area has chord-distance-times-count units; it is not free energy or a quality score. Compare profiles only on the same frozen frame/instrument and report N alongside totals.

`radius_comparison` reports the fixed-grid before/after/delta counts and maximal `exact_delta_interval` and `same_sign_interval` around 0.095 within chord-radius domain [0,2]. Endpoints carry `lower_closed`/`upper_closed` flags and named boundary witnesses. At most eight witnesses are displayed per endpoint, with `total` and `shown`; path strings are not truncated. A domain endpoint is marked explicitly. Cells are evaluated at their right endpoint to preserve strict-threshold ties, including adjacent representable floating-point values.

These are parameter-stability intervals with respect to the computed distances, not statistical confidence intervals or pre-edit forecasts. Preview has already embedded the actual candidate, but still writes no repository, saved map or Vectorize entry. The existing embedding cache may change.

Optional API diagnostics: `coordinate_epsilon >= 0` bounds each point's displacement in 3-D chord units; `distance_error_bound > 0` is a caller-supplied bound on remaining distance/comparison error. They are distinct from the existing embedding-coordinate `perturbation_linf` and `roundoff_budget`. Both must be supplied before a conditional radius-stability state is emitted. Missing assumptions produce `needs-coordinate-bound` or `needs-error-bound`; insufficient clearance produces `undetermined`. Supplied bounds are not independently validated, and no state is a certified floating-point or probabilistic guarantee. Negative, zero error, non-finite or overflowing budgets are rejected before model work.

Inputs named `radius`, `canonical_radius`, `isolation_radius`, `radii` or `radius_grid` are rejected: the grid is fixed and diagnostic-only. Do not optimize or reselect it based on the observed result.

The core-Lean `RadiusBounds.lean` obligations and printed-axiom/scope checks accompany the runtime module. Integer order/count lemmas do not prove Float64 distances, actual displacement bounds or scientific admission. Continuous clipped area remains a runtime-derived identity, not a newly kernel-proved real integral.

A degree-preserving graph null fixes the number of degree-zero vertices, so it is degenerate for I(r0). The exploratory radius-null probes do not admit a new ranking statistic. Existing GL phase-transition negatives remain in force; the corrected equal-coefficient CGLE energy identity does not change that.

The homepage Copy agent guide button continues to copy a **short introduction prompt referencing AGENT.md** as the source of truth. Its behavior is unchanged.

## Positive control (calibration)

The instrument is `pointmap/0.2`, unchanged. `POST /api/jev/map/control` adds the one reference the wayfinder never had: a **known signal**. The stored checkerboard null randomizes bit margins and states the false-alarm side; nothing stated how the frozen isolation/displacement statistics respond to a content change of known size. Following CutPaste (Li, Sohn, Yoon, Pfister, CVPR 2021) and the is-this-x standard-candle discipline, the route cuts a contiguous donor segment into the middle 25% of a host document and measures each splice as an ordinary one-name CHANGE through `/api/jev/map/preview` on the baseline frame.

```json
{ "baseline_id": 123, "texts": ["...every baseline document, byte-identical..."], "names": ["..."], "n_controls": 6, "control_seed": 20260917 }
```

- The corpus must equal the baseline exactly: every name present, every SHA256 equal, no extra names; otherwise 409 with the changed/added/missing names. Nothing is embedded before that gate passes.
- The recipe is fixed: generator `cutpaste-splice`, splice fraction 0.25, centered window, same-length donor segment (whole donor if shorter), surrogate pairs never split. `splice_fraction`, `window`, `hosts`, `donors` and similar keys are rejected (422); instrument settings are rejected (409). `n_controls` (2..6 per request, default 4; use distinct `control_seed`s for more) and `control_seed` are the only knobs and both are echoed, so a control cannot be tuned to the result it produces.
- Per control: host, donor, splice offsets, before/synthetic SHA256, `isolated_delta` (comparison) and `ledger_actual_delta` (exact ledger, must agree), `bits_changed`, geodesic/chord displacement, `quantization_silent`, `occupied_sectors_delta`, `unchanged_anchor_count`, frame/instrument ids.
- `summary`: counts by sign of `isolated_delta`, min/median/max of |Δisolated|, displacement and bits changed, `bits_moved_count`, `quantization_silent_count`, all with `n_measured`. `baseline_reference.null` echoes K/E0/SD0/p_resolution of the stored null. `no_change_reference` is the identity (a byte-identical CHANGE moves nothing).
- Side effects: none beyond the disclosed embedding cache. `persisted:false`, `task_verdict:"not-applicable"`.

Reading: a splice that moves zero bits on this frame says the instrument is quantization-silent at that content size for that document; a splice that changes the isolated count says the statistic responds to known-different content. Neither says anything about task quality, and no admitted coordinate, ranking term or keep/revert rule follows. Compare controls only on the same `frame_id`/`instrument_id`; report n with every count. The same summary on a different corpus is a different instrument reading, not a benchmark.

## Outcome ledger (outcomes)

Every count the wayfinder has ever reported ("2 kept, 5 reverted, 1 declined", "4/10 sign agreement") lived in prose. `POST /api/jev/map/outcomes` gives them a typed, append-only home and, following business-metric-aware forecasting and the COVID public-forecast discipline, separates the **prediction** (frozen before the check) from the **decision outcome** (the independent verifier's verdict).

Two-phase use:

```json
POST /api/jev/map/outcomes  { "baseline_id": 123, "target": {"action":"change","name":"refs/x.md"}, "predicted_delta": -1, "task_check": {"verdict":"pending","verifier":"human reviewer"} }
POST /api/jev/map/outcomes  { "baseline_id": 123, "target": {"action":"change","name":"refs/x.md"}, "predicted_delta": -1, "after_id": 124, "supersedes": 7, "task_check": {"verdict":"reverted","verifier":"human reviewer","notes":"content check failed"} }
```

- Verdicts: `pending`, `kept`, `reverted`, `declined`, `abstained`, `neutral`. `verifier` names the independent checker; `geometry` is refused for any non-pending verdict.
- With `after_id` the server recomputes the observed isolated delta with `PM.explainTransition` on the frozen frame (409 if frames differ or the transition moves a different name) and stores `observed_source:"server:explainTransition"`. A caller-supplied `observed_delta` is stored as `observed_source:"caller"`; the two are never mixed in one row. A row with neither records a prediction only.
- Append-only: no PUT, PATCH or DELETE (405). A correction is a new row whose `supersedes` points at the earlier row (same baseline and target); both stay visible. A row that arrives with prediction and non-pending verdict together is stored with `preregistered:false`.
- `score`, `quality`, `success_rate`, `rate`, `confidence`, `z` are rejected as inputs.
- `GET /api/jev/map/outcomes?baseline_id=` returns rows and a `contingency` of counts: `n_rows`, `n_pending`, `n_superseded`, `n_effective`, `n_preregistered`, `n_sign_comparable`, `sign_exact_count`, `by_verdict`, `predicted_sign_by_observed_sign`, `verdict_by_sign_exact`, `observed_source_counts`. No rate, percentage or z is computed. A sign-exact geometric prediction is an instrumentation outcome; a kept verdict does not imply the geometry predicted it. The historical 4/10 figure stays a historical count.

Existing stored map rows, frames, ledgers, radius diagnostics and the `/map/` UI are unchanged by both additions. `GET /api/health` now lists the diagnostic module versions.

## Axis redundancy trial (axis-trial)

`POST /api/jev/map/axis-redundancy {map_id, K?, null_seed?}` executes the membership condition for one candidate per-axis statistic instead of leaving it unstated. Following TabNet's masked-feature pretraining (Arik & Pfister, AAAI 2021), the statistic `loo-nn-vote` predicts each document's bit j from its other d−1 bits by a leave-one-out nearest-neighbour vote (Hamming distance on the remaining axes; ties count 0.5). The same statistic is then computed on K draws of the existing fixed-attempt checkerboard chain (`PM._internal.nullDraw`, every row and column margin preserved; a distinct seed, `map.seed XOR 0x5bd1e995` by default, so the trial chain is not the map's own V2 chain).

Because column margins are fixed under the null, the majority baseline of every axis is identical between observed and null; `observed_minus_margin_baseline` and the null comparison measure inter-axis dependence beyond margins, per axis. Output per axis: `observed_hits`, `observed_ties`, `margin_baseline_hits`, null `{K, mean, sd, min, max, degenerate}`, `z_descriptive` (null when the null is degenerate), plus-one two-sided `p_two_sided` with `p_resolution = 1/(K+1)`, `direction`, and an exclusion-only `verdict`: `excluded-from-fixed-margin-null`, `not-excluded`, or `null-degenerate: no trial possible on this corpus`. A `total` block sums over axes; `counts` tallies verdicts; `margins_preserved` certifies the chain.

`admitted` is hard-coded `false`. Admission of a coordinate is a paper-level decision recorded in `refs/` after trials on more than one corpus; one response never flips it. The statistic never enters rung ranking, sector geometry or any recommendation; `weights`, `importance`, `rank`, `admit` and instrument keys are rejected. No embedding runs, nothing is written. K must be an integer 2..40 (defaults to the map's K); K=40 cannot resolve tails below 1/41, and an "excluded" verdict at that resolution is a small-chain observation, not a discovery threshold.

## Perturbation consistency (consistency)

`POST /api/jev/map/consistency` measures ONE candidate edit under several caller-supplied text variants on the same frozen frame and reports whether the geometric reading agrees. FixMatch and UDA trust a pseudo-label only when the model's reading is stable between a weak and a strong augmentation of the same input; the wayfinder has no labels and no trainable model, so only the diagnostic half transplants.

```json
{ "baseline_id": 123, "texts": ["...full resulting corpus with the primary candidate..."], "names": ["..."],
  "target": { "action": "change", "name": "refs/x.md" },
  "variants": [ { "label": "weak", "text": "...minor rephrasing..." }, { "label": "strong", "text": "...different wording, same intent..." } ],
  "predicted_delta": -1 }
```

- The API never generates variants (there is no canonical text augmentation, and a server-made one would be tuned to the instrument). 1..3 variants, unique labels (`primary` reserved), echoed by SHA256. `augment`, `generate_variants`, `gate`, `strength` are rejected; instrument keys are rejected (409).
- Every measurement runs through `/api/jev/map/preview`, inheriting the exact-source-hash checks, anchor verification and no-persist discipline. A variant equal to the baseline source is an explicit no-op measurement; identical variants are flagged as adding no evidence.
- `measurements[]` carry label, sha256, `isolated_delta`/`isolated_sign`, ledger delta, bits changed, displacement, quantization-silent, anchors. `consistency` reports `signs`, `sign_set`, `all_same_sign`, `delta_min/max/spread`, `bits_moved_count`, `quantization_silent_count`, `noop_count`, and `sign_exact_count` against `predicted_delta` when supplied. No consensus delta or score is computed.

Reading: agreement means the isolated-delta sign is not sensitive to those phrasings; disagreement means the reading is perturbation-sensitive and should be treated as undetermined for planning. Neither outcome authorizes keeping, reverting or deleting; the independent task check still governs, and `task_verdict` stays `not-tested`.

## Azimuth trials (azimuth)

`POST /api/jev/map/azimuth {map_id, variant?: "binary"|"continuous", K?: 2..400, null_seed?, modes?}` tests the placement-plane angle φ = atan2(PC2, PC1) with bin-free, rotation/reflection-invariant statistics: Rayleigh Z_m = N·|mean(e^{imφ})|² for m ∈ {2,3,4,6,12} and the largest circular gap. Every null draw **refits PCA2** (reusing the observed frame would test the frame, not angle). Binary variant: fixed-margin checkerboard null, plus an atomicity control (deduplicated distinct-pattern angles, an m=1 audit, and the null dedup-size support — on the 301×24 fixture the observed 167 distinct patterns lie OUTSIDE the null support 209..245, so no size-matched de-atomized null exists). Continuous variant: caller supplies the raw input vectors (verified against the stored `keys` fingerprints); null = independent per-column shuffle. m=1 is structurally confounded (PCA scores are mean-centered, so the radius-weighted first moment is identically zero; unweighted Z₁ measures radial/multiplicity reweighting) and is returned only as `atomicity.m1_audit`, never as a mode. Default K = 240: exclusion is arithmetically reachable only at K ≥ 239 (min Holm p = |family|·2/(K+1); below that a `not-excluded` is a power statement and the verdict reads `unresolvable-at-this-K`, with `power_floor` attached per row). Multiplicity: two-sided plus-one empirical tails + Holm over the requested family, with per-seed reproducibility and flips reported, never averaged.

**`admitted:false` always for azimuth.** Binary placement lacks a size-matched de-atomized fixed-margin null; the continuous column-shuffle null destroys all inter-column dependence and is intentionally over-strong (not-exclusion under it is uninformative). Sector numbers stay opaque display labels: the sector index is gauge-dependent (its origin is arbitrary under rotation), which alone bars it as a statistic; the argument does not rest on degeneracy. The trial output carries `placement_eigengap` as a diagnostic: (λ1−λ2)/λ1 measures how nearly degenerate the top-2 eigenplane is and (λ2−λ3)/λ2 the Davis–Kahan subspace stability. On the reference fixture the binary placement's rel_gap_12 is 0.0686, at its fixed-margin null median (0.0692) — ordinary; the continuous z-scored placement is near-degenerate (rel_gap_12 0.0205, below the shuffled-null median 0.0631, with rel_gap_23 0.0042), which is the measurement behind the statement that the continuous null is wide. Diagnostic only; it licenses nothing. The powered Möbius lens path is deferred: it requires continuous placement, a selection null optimizing every null draw, a predeclared stopping rule and an anti-caustic condition cap. `papers/data/lean/AzimuthBounds.lean` proves the integer identities (|z|² ≥ 0, D₄ gauge invariance: negation/conjugation/swap/quarter-rotation, order-independence of the moment sum, replicate scaling: duplicating every row k times scales the moment by k and |moment|² by k² — the formal atomicity statement); full SO(2) rotation, GL(2) rescaling, null distributions and Float behaviour are stated non-claims.

## Rung identity and placement (placement)

Every ladder rung carries `rung_key` (`add:s<sector>:<pattern bits>` or `change:<name>:bit<k>`), `joins` (the currently-isolated items that stop being isolated under the synthetic move; empty when the prediction is the new row's own isolation status), `creates_isolate` (ADD), `target_pattern` (CHANGE) and `joins_note`. The ranking, deltas, exemplars and every historical field are unchanged; these fields are additive and `frame_id`/`instrument_id` do not include them.

`POST /api/jev/map/preview` accepts an optional `rung` (the rung object, or `{pattern, sector, joins, flip_bit, rung_key, delta}`) and always returns `placement`: `achieved_bits`, `achieved_sector`, `degree`, `neighbours`, `target_isolated`, `deisolated_items`, `newly_isolated_items` (CHANGE adds `previous_bits`, `bits_flipped`, `previous_sector`). With a rung it adds `hamming_to_pattern`, `landed` (`on-pattern` / `near-pattern` ≤2 / `missed-pattern`), `sector_match`, `joins_realised`/`joins_missed`, `flip_realised`, `predicted_isolated_delta` vs `actual_isolated_delta` with `sign_exact`, and a `verdict` (`realised` / `partial` / `missed`). `POST /api/jev/map` with `baseline_id` returns the same `placement` block for a single ADD (where `comparison` is name-set incomparable) or a single CHANGE. A rung pattern of the wrong width is 422. Placement is achieved geometry on the frozen frame; `realised` is an instrumentation outcome, not a quality statement, and `missed` does not authorize reverting.

## Rayleigh diagnostics (rayleigh)

Two places where Rayleigh's variational principle already lives inside the instrument, made explicit. **Graph:** the isolation graph (chord < 0.095) has Laplacian quadratic form xᵀLx = Σ_edges (x_i−x_j)²; isolates are size-1 components; `POST /api/jev/map/rayleigh` reports exact BFS components and isolates, the Fiedler value λ₂ of the largest component (float, power iteration) next to the **exact rational Rayleigh–Ritz witness** R = n·cut(S)/(|S|(n−|S|)) of the Fiedler sign cut (`bound_holds` checks λ₂ ≤ R), and K fixed-margin null draws with plus-one tails and exclusion-only verdicts for components/isolates/largest/λ₂/edges. **Frame:** every `/api/jev/map` response carries `map.rayleigh_frame`: by Ky Fan, tr(XᵀCX) ≤ λ₁+λ₂ for the two frozen axes X on the current covariance C, so `gap ≥ 0` exactly; it is ≈0 on the baseline corpus and grows as a chain drifts. Read it as frame adequacy, not quality; a large gap is the honest signal that a new baseline is warranted, and it never refits anything. **Admission is computed, not hard-coded.** `admitted` on `/api/jev/map/rayleigh` is `true` only when, on that frame: every null is non-degenerate; every exclusion verdict reproduces under a second independent null seed (`admission.seeds`); the float λ₂ respects the exact Rayleigh–Ritz witness (`bound_holds`); the Ky Fan gap is non-negative when a frame gap is present; and N ≥ 100 (a K-draw tail has no resolution below that). `admission.criteria` and `admission.why_not` are always returned. Admission licenses exactly one thing: quoting the five graph statistics as instrument readings on that frame with their tails. It is not a ranking term, not a radius change, not a keep/revert rule, and it does not transfer to another frame. First executed trials (2026-09-19): refs/ 431 `true` (all five statistics not-excluded from the null), skills/ 81 and 326 `true` (structure excluded from the null), refs/ 78 `true`, docs/ 296 `false` ("N < 100"). Record: `refs/rayleigh-admission-trial-2026-09-19.md`; round: `refs/wayfinder-round13-results-2026-09-19.md`. Rayleigh's inviscid stability equation and Rayleigh–Plesset do not fit (no flow field, real analysis) and are not used. `papers/data/lean/RayleighBounds.lean` proves the integer/rational identities (PSD, kernel of constants and isolates, indicator = cut, witness numerator/denominator); nullity = #components, Ky Fan and the float λ₂ are stated non-claims. Position in the flow: baseline → control → **`POST /api/jev/map/admission`** (rayleigh, axis trial, spectra shares, radius I(r) grid in one call) → cycles → admission again at round close.

**Unified admission (admission).** Every diagnostic the instrument once marked `admitted:false` now gets the same trial: two independent fixed-margin null seeds, every null non-degenerate, every exclusion verdict reproducible across the seeds, exact identities holding (`bound_holds`, shares summing to one, canonical count matching the map), N ≥ 100. `/api/jev/map/axis-redundancy` computes its own admission the same way. **Permanently not admitted, by construction:** physical (Raman/IR, dipole, polarizability, lifetime, temperature) readings of the spectra card, the heat eigenvalues l(l+1) (constants), the caller-supplied radius robustness bounds (`validated:false, certified:false` stay), and any use of an admitted statistic as a ranking term, radius or keep/revert rule. The spectra card's own `admitted:false` denies homology/physics and stays; the *statistical* admission of its shares lives in the unified call. First trials (2026-09-19, `refs/admission-trials-2026-09-19.md`): refs/ 436 admitted on all four; refs/ 431 refused axis (one verdict flipped between seeds); refs/ 78 refused axis, spectra and radius (flips); skills/ 81 refused radius (I(0.115) flipped); docs/ 296 refused all (N < 100). Research record: `refs/rayleigh-integration-research-2026-09-18.md`.

Also on `/api/jev/map` with `baseline_id`: `transition: {max_changed_names?, max_added?, max_removed?}` declares the single transition the caller intends; a corpus that differs from the baseline by more is **409 with the offending names and `persisted:false`** (round-8 lesson). `GET /api/jev/map/outcomes?frame_id=<frame>` gathers every ledger row across a chained round's baselines (round-11 lesson).

## Lessons learned (2026-09-17 session: four transplants, limits/2, refs round 4, skills round 1)

Process and bootstrapping rules distilled from one day of operating this instrument end to end. Each one cost something to learn; treat them as part of the contract.

### Bootstrapping a round

1. **Pin the corpus to a 40-character commit SHA** and fetch it with `/api/jev/map/repo-items` (`subdir`, `ref`). Drop empty files (`.gitkeep`) before mapping; the baseline's `names` is the frozen name set for the whole round.

2. **Warm the embedding cache first.** `POST /api/jev/map/embed {texts}` in batches of at most 400 documents (100 is comfortable: 495 skills documents took 5 batches, ~61 s). Only then `POST /api/jev/map`. A cold `/api/jev/map` on a large corpus either exceeds the per-request uncached budget (413) or the Worker's CPU budget.

3. **Verify the baseline hash-matches your local copy** before editing anything: compare each `embedding_metadata.docs[i].sha256` to `sha256(local file)`. A mismatch means the after-map will silently become a two-transition corpus.

4. **Chain `baseline_id`** cycle to cycle (81 → 83 → 84 …). The frame stays frozen; each after-map compares against the previous one. Never refit between cycles.

5. **After-maps must use the exact baseline name set.** Building the corpus from the local tree instead of the baseline's `names` produced a stray map (82) with five extra files and an incomparable comparison. Read `names` from the baseline and only replace the target's text.

6. **Write the independent task check before looking at any rung**, and freeze it. `skillcheck.sh` (mojibake, duplicate H2, TODO placeholders, skill-format frontmatter, template capability paragraphs, local links) and `taskcheck.sh` for refs/ were written first, run FAIL-before / PASS-after, and rerun unchanged on the committed file. Geometry is recorded next to the verdict; it never produces one.

### Running cycles

7. **Pre-register before editing.** `POST /api/jev/map/outcomes` with verdict `pending` and the rung's `predicted_delta`; append the verdict row with `supersedes`. `verifier` is at most 200 characters (a 422 here made one geometry measurement land before its check row; the row says so).

8. **Prefer a deterministic fixer over judgment edits.** Every kept edit this session was mechanical: fix mojibake, decode a base64-committed body, cut an over-long description at a sentence boundary and move the remainder verbatim into the body, replace a false template paragraph with a dated coverage note, merge duplicate sections keeping all non-duplicate text. If the fixer cannot reach PASS, revert and record `declined`; do not hand-edit to make geometry move.

9. **Execute ADD rungs as real documents, never as stubs, and never decline them by policy.** (The earlier version of this rule, "decline ADD rungs", was wrong and produced round 5: 100 cycles that never used a rung.) An ADD rung now names the isolated item(s) it would join (`joins`), the exact target `pattern`, and a stable `rung_key`. Read the join target and the exemplars, write a document with real, verifiable content that belongs next to them, then `POST /api/jev/map/preview` with `action:"add"` and the rung in `rung`; read `placement.rung.landed`, `sector_match`, `joins_realised`, `verdict`. `realised` or `partial` → run the independent task check and commit; `missed` → revise toward `joins_missed` or record the rung as content-resistant. One attempt per `rung_key` per chain: a missed rung is not a fresh proposal, and a second file for the same sector is padding. The frozen task check still gates every commit; geometry chooses where, the writer supplies what.

10. **Expect ladder exhaustion.** The generator returns five rungs; the skills round ran out of distinct CHANGE targets at cycle 6. AGENT.md's wording holds: exhaustion under this generator is not optimality. The sanctioned fallback is the literal exemplars the rungs name, in ladder order, with `predicted_delta: null` (no geometric prediction exists for an exemplar).

11. **One file per commit, on a held branch, one draft PR per round.** Stack follow-up PRs on the round branch (the 82-file sweep, PR #240, stacks on round 1, PR #239) so a reviewer sees the instrument-named edits and the plain sweep separately.

12. **Positive controls before real edits.** `POST /api/jev/map/control` (n ≤ 6 per request; use several seeds) gives the frame's response band for known-different content. On refs/ frame `d3289271…` twelve splices never reduced isolation; the one real edit that did (−2) is read against that band, not against nothing.

13. **Run the axis trial on every new baseline** and file the verdicts. On a 12-document map no axis is distinguishable from the null (no resolution); on 168–178-document maps 7–9 of 9 axes are. Neither number admits anything; both belong in the record.

### Reading results honestly

14. **Flat geometry is a result.** Six kept skills edits left the isolated count at 31 and were 0/4 sign-exact against predicted −1; four were quantization-silent. Report it as an instrument observation on that frame, not as failure of the edits or success of the instrument.

15. **The real backlog is usually outside the geometry.** The frozen check failed on 88 of 112 SKILL.md; the ladder named 10 and fixed 6. A plain sweep with the same check and fixer cleared the other 82 with no map involved. When a check reveals a corpus-wide defect class, sweep it in its own PR and say the instrument was not consulted.

16. **Counts only, with n.** Ledger contingencies, control summaries and axis trials never emit a rate, percentage or Gaussian tail. The historical 4/10 stays a historical count until prospective rows exist; the skills round added 4 comparable rows (0 exact) and 6 kept verdicts.

### Operating the Worker

17. **limits/2 walls and how to stay under them:** 4000 items; per-request uncached budget 1000 docs / 12k chunks (warm the cache); maps above 1.9 MB persist via KV overflow transparently; CPU budget 300 s (`limits.cpu_ms` in deploy metadata); `n_controls ≤ 6`; axis trial N ≤ 1200.

18. **Test bindings with a strict fake.** The first limits/2 deploy bound `map.classes` (an object) into D1 and every persist returned 500 for nine minutes while `persist:false` kept working. In-memory fakes accepted the object; a strict fake that rejects undefined/boolean/object bindings on a real `runMap` output now guards it.

19. **Deploy discipline:** re-download the live 13-module bundle, confirm every module still matches the last snapshot, replace only `index.js`, keep `main_module solar-entry.mjs` and `keep_bindings` for all binding types, then refresh SITE KV `AGENT.md` and `llms.txt`. Verify `/api/health` lists the expected module versions before using anything.

20. **Client access:** any HTTP client works if it sends a `User-Agent`; a bare urllib/fetch default UA is refused at the edge. Build the Worker in the sandbox with `ESBUILD_BINARY_PATH` pointing at the cached esbuild binary.

21. **Check every file class the corpus contains, not just the one the spec names.** The frontmatter check covered `SKILL.md`; 362 reference/script/test files under the same skills were committed as raw base64 and passed everything because no check looked at them. A whole-file base64 probe (C7) is now part of the check. When a defect class shows up in one file type, scan all blobs for it before declaring the corpus clean.

22. **A wayfinder round is a writing task with a geometric compass, not a lint sweep with a geometric label.** Rounds 5 and 6 (PRs #243, #244; reverted and closed) ran 100 cycles each with the skills lint fixer as the edit generator: 2 of 200 cycles carried a rung prediction, ADDs were 37-line templated notes, the same sector was re-added five times because nothing reported the miss. Round 3 (PR #232) authored real records from the rungs and was 5/8 sign-exact. If the driver is not reading `joins`/exemplars and writing content, stop the round; if the fixer is doing the editing, it is a sweep and belongs in its own PR with the instrument uninvolved.

### Corpus discipline

23. **The frozen check is the corpus's own format contract.** Round 12 (PR #251, skills/) used the SKILL.md specification itself — kebab-case `name`, `description` ≤ 1024 characters without literal `<`/`>`, H1 immediately after the frontmatter, `## Examples` and `## Guidelines` present — as the check, and authored each missing section from that skill's own body (its own workflow steps, its own MUST/NEVER rules). 9/112 → 112/112 compliant, content-additive, nothing removed. When a corpus has a published format (SKILL.md spec, ADR template, ALL-CAPS docs/ conventions, refs/ results-record family), that format is the check to freeze; generic lint classes are the fallback, not the first choice. Every edit and every ADD in a round must fit the corpus's format.

24. **Receipts live in `refs/`.** Round 10/11 results records were first written to `docs/` and moved by directive: `docs/` holds ALL-CAPS normative documents only; wayfinding results, drift records and censuses are dated records in `refs/`. A drift check produces a record in `refs/`, never an appended verification paragraph inside the checked document (round 11 appended one to all 22 docs; round 12 banned drift checks as an edit class).

25. **The committed tree is the only ground truth for the corpus.** Round 8's driver reloaded stale disk state after in-memory edits and built after-maps 188–192 against incomplete corpora; the round re-baselined and disclosed it. Rebuild texts from the branch commit before every after-map, hash-match them to the baseline, and declare the intended transition: `POST /api/jev/map {baseline_id, transition:{max_changed_names:1, max_added:0, max_removed:0}}` now returns 409 with the offending names instead of a chained map on the wrong corpus.

26. **Version the check; disclose amendments in the ledger.** Round 7 found two checker defects (fenced code blocks, `../` links) at cycle 30 and amended the frozen check as v1.1 with a ledger note. Cheaper: run the check over the whole corpus and read a sample of failures before freezing. Keep scratch files and the results record outside the corpus root (a temp file tripped round 12's kebab-case check; a re-sync dropped the record).
### Reading the ledger by frame

27. **Read the ledger by frame.** A chained round spreads its rows over many `baseline_id`s; `GET /api/jev/map/outcomes?baseline_id=` sees one link and reads as "zero rows" mid-round (round 11). Use `GET /api/jev/map/outcomes?frame_id=<frozen frame>`.

28. **File the Rayleigh reading with the control and the axis trial.** `POST /api/jev/map/rayleigh` on every baseline and at round close; watch `map.rayleigh_frame.gap_share_of_trace` along a chain. It is the one frame-adequacy number that is exact in sign; when it grows, say so in the results record and start the next round on a fresh baseline rather than chaining further.

### Instrument admission and prompts

29. **`admitted` is a computed verdict with its criteria attached, never a flag someone flips.** Round 13 (refs/, PR held) turned rayleigh's hard-coded `false` into a per-frame decision: non-degenerate null, seed-reproducible verdicts, exact witness bound, Ky Fan bound, N ≥ 100. It came out `true` on refs/ and skills/ baselines and `false` on the 21-document docs/ corpus for the stated reason. When a statistic's admission is wanted, add a criterion the response can evidence and let the instrument say so; write the trial as a record in `refs/`. Sign agreement and placement stay separate readings: round 13 cycle 4 was sign-exact (+1 predicted, +1 observed) and `partial` (the document isolated itself in the wrong sector) at the same time.

30. **Reproducibility across independent null seeds is the admission criterion that does the work.** In the first unified trials, non-degeneracy and N ≥ 100 passed almost everywhere; what refused admission on refs/ 431 (axis), refs/ 78 (axis, spectra, radius) and skills/ 81 (radius) was a single verdict flipping between two 40-draw chains. Report the flip, do not average it: a statistic whose exclusion depends on which draws you took is not yet a reading on that frame. Re-run with a larger K only if the resolution question is the point, and say so.

31. **Lead the prompt with the protected reading, label the adverse rungs, and point at the contract.** The rung prompt used to spend 58% of its characters on a frame recital that never varies and printed `occupied sectors +0` on every rung while omitting the pole gap, Δ, clearance and Hamming distance it had already computed. The geometric prompt (~1,785 chars/ladder vs ~4,506) leads with Δ (Lemma 1), states clearance as an achieved-geometry fact (never a forecast), labels adverse rungs `ADVERSE on this frame` without suppressing them, and points at `/AGENT.md` instead of restating it. A prompt that only asserts a prediction with a coin-flip track record is noise; one that reports frame readings is an instrument.

Tooling for the loop lives at `tools/skill-check/` (`skillcheck.sh`, `fixer.py`, `wayfinder-cycle.py`, README).




