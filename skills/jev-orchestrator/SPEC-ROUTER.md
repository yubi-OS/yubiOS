# SPEC-ROUTER: Measurement-Gated Routing Regime (hierarchy-router v1)

Date: 2026-10-06. Status: approved in chat (capability map + multimodal revision). Build: 3 parallel lanes + advisor, then deploy via steady-orbit-deploy.

## 1. Summary and core invariant

Artifacts entering the jev system get MEASURED by the appropriate instrument; the measured feature is classified into policy-declared bands; the band selects a route target; the routing action passes the SAME deterministic fail-closed gate as every other action.

**Invariant: the detector proposes the route; the policy engine disposes.** Measurements are data, never authorization. Route decisions are audit rows. The router never awards itself authority.

## 2. Multimodal intake (operator revision — ROUTE ACCEPTS ANY FORMAT)

`POST /api/jev/route` accepts any artifact modality, because clef accepts multimodal input:

```
{ "artifact": {
    "modality": "image" | "text" | "multimodal",   // optional; auto-detected if absent
    "image":   { "gray_b64" | "bitmap_b64", "width", "height" },
    "text":    { "name", "text" },
    "any":     { "data_b64" | "data_url", "hint": "free text describing the artifact" }
  },
  "source": "api" | "console" | "automation",       // provenance
  "idempotency_key": "optional caller key"
}
```

Modality resolution (PINNED order): explicit `modality` > auto-detect (`image` with width/height present → image; `text` present → text; `any` present → multimodal; nothing recognized → 422 UNKNOWN_ARTIFACT). A request carrying `image` AND `text` resolves to `multimodal` with both attached.

### Measurement dispatch (per modality)

| modality | instrument | determinism | feature produced |
|---|---|---|---|
| `image` | edge-standard-v1 pipeline (reuse the taste route internals: ink-normalization → components → Moore trace → box-counting) | deterministic | `fractal_band.D` (+ full feature vector: r2, symmetry_present, coverage) |
| `text` | structured-evidence scorer (jev-corpus-scorer scoreDoc path: deterministic per-axis extraction + ONE batched clef call) | deterministic extraction + one clef call | `scorer.bits` count + per-axis probs |
| `multimodal` | clef multimodal classification via the AI binding (askJev path): ONE call; the instruction carries the hint + any measured context; response parsed to a 0..1 score | model-judged | `multimodal_band.score` |

Multimodal rules:
- Lane A MUST first verify the clef binding's multimodal input shape (Cloudflare docs + one live probe with a tiny image+prompt) before implementing. If the binding rejects images, fall back to a two-stage deterministic pre-step (dimension/byte-level extraction → clef text call) and RECORD the fallback.
- Model-judged features are never `calibrated` until they pass a 21-point calibration sweep (falsification-corpus discipline). Uncalibrated multimodal bands route to `needs_approval`, never auto-dispatch.
- Every clef instruction carries measured numbers with decimals (fmt() rule); `criteria` object not `choices` array.

## 3. Band registry (policy v7)

`routing.bands` in jev-policy.json, promoted ONLY via the audited improve flow (learnings → promote):

```json
"routing": {
  "default_on_no_band": "blocked",        // fail-closed; may be "needs_approval"
  "bands": [
    { "id": "hierarchy-image",  "modality": "image", "feature": "fractal_band.D",
      "min": 1.45, "max": 2.0,  "target": "lane-draft",
      "calibration": "calibrated", "description": "hierarchical morphology -> 70b lane" },
    { "id": "ordered-image",    "modality": "image", "feature": "fractal_band.D",
      "min": 1.0,  "max": 1.45, "target": "lane-classify",
      "calibration": "calibrated", "description": "ordered-smooth morphology -> 8b lane" },
    { "id": "sparse-image",     "modality": "image", "feature": "fractal_band.D",
      "min": 0.0,  "max": 1.0,  "target": "lane-classify",
      "calibration": "calibrated", "description": "sparse field -> 8b lane" },
    { "id": "multimodal-probe", "modality": "multimodal", "feature": "multimodal_band.score",
      "min": 0.0, "max": 1.0, "target": "lane-draft",
      "calibration": "provisional", "description": "model-judged; needs_approval until calibrated" }
  ]
}
```

Rules:
- Band selection: first band matching (modality, feature in [min, max)). Interval semantics PINNED: min inclusive, max EXCLUSIVE, except the last band per (modality, feature) which is inclusive on both ends so no value falls through. Log this in the selftest.
- No matching band → fail-closed per `default_on_no_band`.
- Every `target` must exist as a declared policy tool (`route.dispatch` targets registry, mirroring resend.send's credential pattern: policy declares the tool, the gate validates). Undeclared target → blocked with reason `target_not_declared`.
- Bands with `calibration: "provisional"` resolve to `needs_approval` regardless of target.
- Bands are read from policy AT CALL TIME (never cached in module scope beyond the existing policy cache); a policy version bump invalidates nothing here (routing proposals are single-request).

## 4. Gate integration

The router creates the routing task through the EXISTING ingest → decide → gate pipeline (routes-jev task create path):

- Proposed action: `{ "tool": "route.dispatch", "target": "<band target>", "artifact_ref": "<run row id>", "band_id": "<id>" }`
- `route.dispatch` is a new builtin action in jev-execute/jev-gate: it dispatches to the internal lane (automation run-now for automation targets; a direct model call for lane-* targets via the existing 3-tier runtime helpers), verifies (for automation targets: the run's terminal state; for model targets: non-empty response), and continues the task.
- Gate validation for `route.dispatch`: target declared in policy + band calibrated + (existing pause/rate checks). Blocked/needs_approval behaves like every other action (approval bindings, expiry, etc.).
- The router NEVER dispatches directly — always through the task, so the append-only audit covers the decision.

## 5. Routes

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/api/jev/route` | bearer | measure → band → task create → gate → (auto-dispatch if allowed, mirroring the approve auto-dispatch contract) → respond `{measurement, band, task, gate, run_id}` |
| GET | `/api/jev/route/bands` | bearer | policy bands + calibration status + default_on_no_band |
| POST | `/api/jev/route/selftest` | bearer | all module selftests (modality detection, band lookup boundaries, fail-closed default, fixture parity for image D) |
| GET | `/api/jev/route/runs` | bearer | last 50 route run rows (kind `router`) |

Rate-limited like the other /api/jev routes (existing pattern).

## 6. Run rows and audit

- One `jev_corpus_runs` row per route decision, kind `router`: `{artifact modality, measurement feature vector, band id, gate decision, task id}` — sha256-idempotent per input (same artifact → same measurement row, cached measurement reused).
- The task's append-only event chain carries the routing stages (propose → gate → dispatch → verify).

## 7. Console (Router card)

- Card in the /jev/ Corpus tab family: policy band table (id, modality, feature, range, target, calibration badge), recent routes list, and a route-this-artifact form (paste image b64 / text / hint).
- INSERTION DISCIPLINE (the taste-card lesson): locate the insertion point by DOM structure (inside sec-corpus as a child section), validate the full console HTML with a parser (0 unmatched closes, sections at correct depths) BEFORE deploying the KV write; deploy with byte-verify + delayed re-GET.

## 8. Selftest (POST /api/jev/route/selftest + module-level tests)

1. Modality detection: explicit beats auto; image/text/any auto-detect; unknown → 422.
2. Band lookup boundaries: min inclusive, max exclusive, last-band inclusive-both; no-band → default_on_no_band; provisional → needs_approval; undeclared target → blocked.
3. Fail-closed default: empty policy bands → everything blocked.
4. Image fixture parity: the gasket fixture (from jev-taste-math fixtures) reads D ≈ 1.59 → `hierarchy-image` band.
5. Determinism: same image twice → same measurement row (cached), same band.
6. No hardcoded bands: policy fetch failure → 503 fail-closed, never a default route.
7. lane.dispatch gate validation: undeclared target blocked; provisional band → needs_approval.

## 9. Calibration record (before any band flips to calibrated)

Run the falsification-corpus gold generators through the live route: gasket (D 1.5968 → hierarchy band), tri (1.2636 → ordered band), shuffle ×5 (1.035 → sparse band boundary check — the 1.0/1.45 edges must land where the pre-registered bands say), pumpkin pair (0.977/1.038 → sparse/ordered edges). Record per-artifact band hits in refs/. The 1.0 and 1.45 edges are provisional until this record exists; the multimodal band stays provisional until a 21-point sweep on real multi-input artifacts.

## 10. Deploy and policy promotion

- Deploy via steady-orbit-deploy: multipart upload, `solar-rbs-entry.mjs` byte-identical (no new page route — the card lives in KV), crons + 13 bindings preserved, part count +1 (jev-router.js). Fixture parts ship path-qualified.
- Policy v7: `routing.bands` + `route.dispatch` tool declared via the audited promote flow (learning proposal → promote), never a direct KV write for the version bump.
- Post-deploy: stale-propagation window ~20s; live-verify every route (selftest → bands → route a gasket fixture → route a text doc → route a multimodal probe).

## 11. Lessons each lane must carry (every one cost a fix somewhere)

1. A module calling askJev must import it (node --check is syntax-only).
2. Fixture parts ship path-qualified or CF 10021 rejects the upload.
3. clef `choice` questions take a `criteria` object, not a `choices` array.
4. Every clef instruction carries measured numbers rendered with decimals.
5. The selftest passing does not mean the routes work — live-verify after deploy.
6. Console KV edits: parser-validate before deploy; delayed re-GET after PUT.
7. D1 rejects unknown columns; the dbx insert-layer must whitelist.
8. Route decisions are data: the gate, not the measurement, authorizes.

## 12. Lane split

- **Lane A (jev-router.js core)**: measurement dispatch (3 modalities), band lookup, task creation through the existing pipeline, the 4 routes, selftest. Verify the clef multimodal shape FIRST. Self-contained tests against the memory-driver harness pattern.
- **Lane B (policy + gate)**: policy v7 `routing.bands` schema + `route.dispatch` builtin (jev-gate validation + jev-execute dispatch to automation targets and lane-* model calls), bands route, promote-flow integration plan, tests.
- **Lane C (console + fixtures + e2e)**: Router card (DOM-verified KV insertion), image fixtures reused from taste fixtures, end-to-end test script, selftest assembly.
- **Advisor**: reconcile against the live bundle (pull `GET /accounts/{acct}/workers/scripts/steady-orbit`, split parts on the Content-Type boundary), verify wiring points, run combined tests, write any uncovered module.

## 13. Out of scope (v1)

- Text-doc routing by scorer bands (route intake ACCEPTS text and measures it; the band table ships image + multimodal rows first — text bands are a follow-up policy change).
- Adaptive/learned bands. Cross-artifact routing policies (e.g., route by corpus dBc). Any new model deployment.
