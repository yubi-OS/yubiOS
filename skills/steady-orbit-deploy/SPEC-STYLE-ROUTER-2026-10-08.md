# SPEC-STYLE-ROUTER-2026-10-08 — console style harmonization + router-picked prompt execution

Status: DIRECTED (Jenny, 2026-10-08: "all other cards need to match the style of map, same heading font style etc. The prompt console needs to be able to call any of the endpoints using the router to pick a model and or tool for the job"). Approved scope: style = ALL surfaces incl. page-level; no-band = fall back to the current 70b draft flow.

## Part A — style harmonization (Lane A, KV jev-index.html ONLY)

The map card is the canonical style: purple letterspaced uppercase eyebrow (`DIAGNOSTICS · MAP` pattern), large semibold title, muted description paragraph, card wrapper/radius/spacing tokens, `gi` info-tip treatment. Extract the exact classes/tokens from the map card block, then apply the SAME heading pattern (eyebrow + title + description where one exists) and surface treatment to EVERY other card and section:

- Diag-panel cards: tasks, learnings, automations, evolution (+ its 7 sub-panels: cycles, directives, sweeps, calibration trend, atom ledger, standard candles, recall inspector), corpus engine cards (audit, lens, atom plan, tautology, placements, selftest, recent runs), scorer, taste, router (+ its 3 sub-headings), spectral, visco (+ hysteresis/prony/snapback).
- Page-level sections: prompt console, overview, pending approvals (+ approval cards keep their layout; only heading/typography harmonize), the two footer cards.
- Dialogs (auth, confirm, run-input, task detail): title style only.
- No behavior changes, no id changes, no new palette — existing tokens only. Diff must be CSS/markup-class changes only.

## Part B — router-picked prompt execution (Lane B, worker modules ONLY)

Current: `decideActionsFromPrompt` (jev-decide.js:539) runs ONE draft-route 70b call proposing actions → same validation + gate. 

New flow — the router picks the model and/or tool:

1. **jev-router.js**: export `selectForPrompt(env, deps, promptText)` — runs the EXISTING text path (modality text → `measureText` → scorer.bits features → `selectBand` over policy `routing.bands` whose feature is the text feature) and returns `{ band_id, target, features }` or `null` (no matching band / router unavailable). Records a route run row (kind `route`, input covering the prompt) for observability. No band_provisional forcing here — downstream risk is handled by the existing action gate.
2. **jev-decide.js `decideActionsFromPrompt`**: before the draft call, `selectForPrompt(...)`:
   - **Model-lane target** (`lane-draft` → 70b, `lane-classify` → 8b, or a policy-declared `model:*` target): run the existing composed-prompt draft flow with THAT model route. `decided_via: "router:" + target`. Everything else unchanged (validation, gate).
   - **Tool target** (any target declared in the policy `route.dispatch` targets registry beyond the model lanes): return ONE proposed action in the canonical route.dispatch shape — `{ tool: "route.dispatch", method: "POST", url: "https://jev.route/<target>", body: { target, artifact: { text: { name: "prompt", text: <prompt> } }, band_id } }` — so the EXISTING executor dispatches it and the existing gate disposes it. Reconcile the body shape against jev-execute's route.dispatch handler (artifact_ref vs inline artifact — extend the handler to accept an inline text artifact if needed).
   - **No band / router error → fall back** to the current 70b draft flow unchanged (`decided_via: "llama_prompt"`, routing metadata `{ router: "no_band" }`).
3. **Routing metadata** on the task: extend the task's intent/decision record with `{ router: { band_id, target, features } }` (new JSON column or inside intent_json — pick the minimal-diff option; new NOT NULL columns need insert-layer defaults, prefer intent_json).
4. **"Any of the endpoints"**: the policy `route.dispatch` targets registry is the allowlist — Lane C declares the initial tool targets (corpus audit, scorer score, classify, placements, lens, map preview, outcomes read, decide relay, resend.send). Adding a target later = policy edit only, never code.
5. Fail-closed invariants: the gate still disposes every action; router failure degrades to the 70b fallback (never blocks intake); no new secrets; no new bindings.

## Part C — policy v15 + verification (Lane C)

1. Draft policy v15: text bands over scorer.bits with explicit conditions (starter set, declared provisional in the band comment) + the expanded targets registry. Bands are DATA; the exact thresholds get calibrated by the harness results before promote.
2. Verification harness (`session/auth-pass/router-prompt/verify-prompt-router.mjs`, worker-executor compatible): 
   - route N representative prompts (corpus-analysis shaped, communication/send shaped, generic draft shaped, gibberish) → assert band/target decisions are deterministic across re-calls (jitter test),
   - no-band prompt → falls back to 70b (`decided_via: llama_prompt`),
   - tool-target prompt → produces a route.dispatch action that the GATE evaluates (needs_approval or allowed per action policy — never auto-run),
   - model-target prompt → draft stage used the band's model (check task metadata).
3. Calibration protocol: run the harness, review the band hit distribution, adjust thresholds, THEN promote v15 via the audited flow (actor jenny).

## Advisor reconcile

1. Lane B: `selectForPrompt` reuses the router's own measure/select (no duplicated logic); executor route.dispatch accepts the inline text artifact; no-band fallback preserves the exact current behavior (byte-level behavior parity for the fallback path); metadata write is minimal-diff (no new NOT NULL columns without defaults).
2. Lane A: html.parser 0 unmatched; every card got the heading pattern; map card itself untouched (it is the reference); no id/behavior changes.
3. Lane C: policy v15 validates against the policy validator (jev-gate validateRoutingDoc/validatePolicyDoc); harness runs green pre-promote.
4. node --check all touched worker parts; imports unchanged (51 parts).
5. Deploy order: worker code → KV console → policy v15 promote → live verify (one prompt of each class through the real console).

## Docs (post-verify)

ENDPOINTS.md history item 15 + AGENT.md rows: prompt intake routed via /api/jev/route text bands; the prompt console's routing display. Skills: jev-orchestrator SKILL.md prompt-intake section.
