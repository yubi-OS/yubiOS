# SPEC-AUTH-SOS-2026-10-08 — API auth pass + SOS fold into the map/jev surface

Status: APPROVED (Jenny, 2026-10-08: "bearer-gate everything but add the same api key prompt to the page as the /jev/ page does" + "relocate to /api/map/sos")

## Context

The steady-orbit worker serves 131 routes. 60 are bearer-gated (the entire /api/jev/* family), 58 are open. The open set mixes genuine site tools (TTS, STT, contact, chat, decide, searxng, health, pages, assets) with engine/business endpoints that should never have been open: the outcome ledger (including unauthenticated DELETE/PUT/PATCH), the FIT assessment API, ingestion (repo-items/embed/vector-search), and the map engine. The /sos voice-agent page is a dead remnant (zero links from any v19 site page, the Sauna sos-agent app was soft-deleted 2026-09-26).

## Decision (user-approved)

1. Bearer-gate EVERYTHING that is not a site tool, using the existing `requireOperatorAuth` helper (index.js line 15, timing-safe compare vs `env.JEV_API_KEY`).
2. The /map/ UI gets the same API-key prompt the /jev/ console page has (dialog, key stored in sessionStorage under `jev_key` — SAME key store, entered once works on both pages, fail-soft on storage errors).
3. The SOS business API relocates to `/api/map/sos/*`; old paths die; the /sos page and its code are removed.

## Lane A — auth gate (index.js ONLY)

Gate these route conditions by inserting at the top of each matched block:

```js
const auth = await requireOperatorAuth(req, env);
if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
```

Exact same 401 shape/wording as the two existing gates (fits DELETE ~line 5330, maps DELETE ~line 5681).

Routes to gate (index.js dispatch line refs from the live bundle):

| Path | Method | Dispatch line |
|---|---|---|
| /api/fits | GET | 5313 |
| /api/fits/:id | GET | (nearby, find it) |
| /api/narrate | POST | 5336 |
| /api/assess | POST | 5418 |
| /api/repo-items | POST | 5518 |
| /api/vector/search | POST | 5527 |
| /api/embed | POST | 5537 |
| /api/map | POST | 5568 |
| /api/map/preview | POST | 5582 |
| /api/map/control | POST | 5599 |
| /api/map/{consistency,axis-redundancy,rayleigh,admission,azimuth} | POST | 5616 |
| /api/outcomes | POST+GET | 5633 |
| /api/outcomes/* | DELETE/PUT/PATCH | 5662 |
| /api/maps | GET | 5665 |
| /api/maps/compare | POST | 5694 |
| /api/maps/:id | GET | (find it; DELETE already gated) |

MUST NOT be gated: every OPTIONS handler (they never enter these method-specific ifs — verify), /api/chat, /api/tts, /api/stt, /api/contact, /api/decide, /api/searxng, /api/health, /audio/*, /AGENT.md, /llms.txt, page/asset routes, /api/jev/* (already gated in routes-jev.js).

Lane A tests: node --check index.js; grep assertions that each gated route block contains the auth lines; grep that site-tool routes do NOT contain them.

## Lane B — SOS fold (index.js ONLY)

New routes, placed before the old dispatch entries, all bearer-gated (they sit inside the gated set from Lane A — coordinate via the shared helper, no double-checking):

- POST /api/map/sos/assess → identical behavior to the /api/assess handler
- GET /api/map/sos/fits → identical to /api/fits
- GET /api/map/sos/fits/:id → identical to /api/fits/:id
- DELETE /api/map/sos/fits/:id → identical (bearer required)
- POST /api/map/sos/narrate → identical to /api/narrate

Implementation: refactor the four handler bodies into shared functions (or route-rewrite at the top of the dispatch: normalize `p` from /api/map/sos/X to the legacy handler), keep ONE implementation. Minimal diff preferred.

Old paths removed: POST /api/assess, GET /api/fits, GET/DELETE /api/fits/:id, POST /api/narrate → return `410 {"error":"gone: SOS API relocated to /api/map/sos/*"}`.

/sos page routes (lines ~5716-5721: /sos, /sos/, /sos/index.html, /sos/client.js) DELETED entirely — fall through to the existing 404. Do NOT touch /audio/reply-N.mp3 (the site chat fallback uses them).

Dispatch-collision check: /api/map POST is an exact `p === "/api/map"` match, so /api/map/sos/* cannot collide; place the SOS routes before any prefix-matching fallback anyway.

Lane B tests: node --check; grep assertions for the new paths + 410 responses; grep that /sos routes are gone; grep that /audio routes remain.

## Lane C — /map/ page key prompt (KV files ONLY, no worker changes)

Files (extracted from KV into session/auth-pass/kv/): map-index.html (31KB), map-app.js (99KB), pointmap.js (71KB).

Add the /jev/-style auth flow to the map page:

- `<dialog id="auth-panel">` mirroring jev-index.html's (lines 1249-1260): title, explanation ("The map API requires the operator key. Stored in sessionStorage only, sent as a Bearer token."), password input, save/cancel.
- Key store: `sessionStorage.getItem("jev_key")` — the SAME key as /jev/ (fail-soft try/catch wrappers, console pattern).
- Attach `Authorization: Bearer <key>` to EVERY /api/* fetch in map-app.js (postJSONStrict at ~68, getJSONStrict at ~693, the direct fetches for azimuth ~721, control ~942) and any /api/* fetch in pointmap.js (verify by grep; if none, leave it).
- On 401 response: clear/open the auth dialog with "Key rejected or missing; enter the operator key." (same behavior as jev console line 1372).
- On successful key entry: reveal the app, refresh state.
- Keep ALL existing map page behavior otherwise; no restyling beyond the dialog styling needed to match the page's own theme.

Lane C tests: node --check on the JS files; grep that every /api/ fetch carries the auth header path; structural check that the dialog HTML is present and ids don't collide with existing ones.

## Advisor reconcile checklist

1. Every gated route has exactly ONE auth check; no route double-gated; no OPTIONS gated.
2. /api/map/sos/* handlers share one implementation with no dead duplicate code left behind.
3. 410s on exactly the four old SOS paths, nothing else.
4. /sos routes fully gone; /audio intact; site-tool routes untouched.
5. node --check passes on index.js + the three KV JS files.
6. Diff review: changes confined to index.js (worker) + map-index.html/map-app.js/pointmap.js (KV). No entry-module change. No new module parts (deploy stays 51 parts).
7. The map page's key prompt reuses `jev_key` (same sessionStorage key as /jev/).

## Deploy plan (orchestrator)

1. Overlay patched index.js onto the extracted bundle; everything else byte-identical.
2. Metadata from live settings (GET settings), no keep_bindings; 51 parts; main_module solar-rbs-entry.mjs.
3. Upload multipart; capture etag; verify schedules `["0 * * * *","*/5 * * * *"]` + 14 bindings.
4. KV: PUT patched map-index.html + map-app.js (+ pointmap.js if touched) with --data-binary; DELETE KV keys sos-index.html + sos-client.js; delayed re-GET byte-verify each.

## Live verification (orchestrator, after deploy)

- No key: 401 on POST /api/map, POST /api/outcomes, GET /api/outcomes, POST /api/embed, POST /api/repo-items, GET /api/fits, POST /api/map/sos/assess, GET /api/map/sos/fits; 410 on POST /api/assess and POST /api/narrate; 200 on GET /api/health, GET /api/jev/health; /api/decide still open.
- With operator key (bearer): 200 on GET /api/map/sos/fits, POST /api/repo-items.
- /sos and /sos/client.js → 404; KV sos keys gone.
- /map/ page serves; auth dialog present in served HTML; pointmap.js/map-app.js served with the patched bytes.

## Docs (after live verify)

ENDPOINTS.md + AGENT.md (git mirror tools/point-map/AGENT.md + KV byte-identical pair): new /api/map/sos/* rows (bearer), /sos rows removed, auth column flipped to bearer on every gated route, mermaid diagram unchanged (Core API block already renamed), llms.txt fallback text updated if it names the SOS API.
