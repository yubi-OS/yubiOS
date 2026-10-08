# SPEC-MAP-FOLD-2026-10-08 — /api/jev/map namespace + /jev/ Map card

Status: DIRECTED (Jenny, 2026-10-08: "fold in the /map/ page into a card on the diagnostic panel on /jev/ using frontend-ui-engineering skill and endpoints should all move under /api/jev/map. then verify all endpoints transitioned and test the bearer on each. then update ENDPOINTS.md, AGENT.md, and find all corpus, wayfinder, fit, and rsi related skills and update them")

## Context

After the auth pass (etag 998e697a), the map engine, outcome ledger and ingestion routes are bearer-gated but still live at their historical `/api/*` paths in the core module, and the map UI is a standalone page at `/map/`. Jenny directs: the whole map surface moves under the jev namespace (`/api/jev/map/*`), the /map/ page folds into a card in the /jev/ console's diagnostics panel, and every consumer (docs + skills) follows.

## Path mapping (mechanical prefix rewrite, ONE handler implementation)

A single rewrite in index.js maps the new namespace onto the existing handlers — no handler bodies change:

| Old path (now 410) | New path (canonical) |
|---|---|
| POST /api/map | POST /api/jev/map |
| POST /api/map/{preview,control,consistency,axis-redundancy,rayleigh,admission,azimuth} | POST /api/jev/map/<same> |
| GET /api/maps | GET /api/jev/map/maps |
| GET/DELETE /api/maps/:id | GET/DELETE /api/jev/map/maps/:id |
| POST /api/maps/compare | POST /api/jev/map/maps/compare |
| POST /api/map/sos/assess, POST /api/map/sos/narrate | POST /api/jev/map/sos/assess, POST /api/jev/map/sos/narrate |
| GET /api/map/sos/fits, GET/DELETE /api/map/sos/fits/:id | GET /api/jev/map/sos/fits, GET/DELETE /api/jev/map/sos/fits/:id |
| POST/GET /api/outcomes (incl. ?baseline_id=, ?frame_id=) | POST/GET /api/jev/map/outcomes |
| DELETE/PUT/PATCH /api/outcomes/* | DELETE/PUT/PATCH /api/jev/map/outcomes/* |
| POST /api/repo-items | POST /api/jev/map/repo-items |
| POST /api/embed | POST /api/jev/map/embed |
| POST /api/vector/search | POST /api/jev/map/vector/search |

Implementation (Lane A), in index.js BEFORE the `/api/jev` delegation (line ~5138):

```js
let mapMoved = false;
if (p.startsWith("/api/jev/map")) { p = "/api" + p.slice(8); mapMoved = true; }
if (!mapMoved && (p === "/api/map" || p.startsWith("/api/map/") || p === "/api/maps" || p.startsWith("/api/maps/")
    || p === "/api/outcomes" || p.startsWith("/api/outcomes/") || p === "/api/embed"
    || p === "/api/vector/search" || p === "/api/repo-items")) {
  return json({ error: "moved: this API relocated to /api/jev/map/*" }, 410);
}
```

- The rewrite runs BEFORE the /api/jev delegation, so /api/jev/map/* never reaches routes-jev.js; it flows into the existing index.js handler chain, which already carries the bearer gates from the auth pass (401 without the operator key — unchanged behavior).
- Old literal paths hit the 410 (mapMoved flag prevents the rewritten paths from matching it).
- The 2026-10-08 SOS 410s (/api/assess, /api/narrate, /api/fits, /api/fits/:id) remain; their messages should be updated to point at /api/jev/map/sos/* (text-only change).
- /map/ page routes: GET /map (and /map/, /map/index.html) + GET /map/app.js REMOVED → 410 `{"error":"moved: the map UI lives in the /jev/ console"}`. GET /map/pointmap.js is KEPT (the /jev/ card loads the rendering library from it); KV key `pointmap.js` stays.
- Untouched: /api/health, /api/jev/health, all site tools (chat/tts/stt/contact/decide/searxng), /audio/*, /AGENT.md, /llms.txt, pages/assets, the whole existing /api/jev/* jev family, the /api/jev/map rewrite exclusion (nothing else under /api/jev changes).
- Entry module solar-rbs-entry.mjs ships byte-identical (its '/map' exclusion delegates to index.js, which now 410s the page paths).

## Lane B — the /jev/ Map card (KV jev-index.html ONLY)

Fold the /map/ page into a card in the /jev/ console's diagnostics panel, following the console's own established card pattern (the taste/router/spectral cards inside sec-corpus: same section wrapper, token usage, jevrt styling, fail-soft sessionStorage, apiFetch with the Bearer jev_key header).

Card scope (the wayfinder flow, condensed — reference implementations are the extracted `session/auth-pass/kv/map-app.js` (the old page logic) and `pointmap.js` (the rendering library)):

1. **Stored maps list** — GET /api/jev/map/maps (id, names count, created, metrics); select one → load via GET /api/jev/map/maps/:id → render the globe with pointmap.js (script tag loads /map/pointmap.js) inside a sized canvas container in the card.
2. **Create map from repo** — compact form (repo, subdir, ref, d/seed/threshold/K defaults 9/20260906/median/40) → POST /api/jev/map/repo-items → POST /api/jev/map/embed (batched) → POST /api/jev/map → refresh list, auto-select the new map. Long-running: show progress text per stage (fetch → embed N docs → map), never block the whole console.
3. **Instrument buttons on the selected map** — control, rayleigh, admission, azimuth, axis-redundancy (all POST /api/jev/map/<name> {map_id}); render compact verdict summaries (admitted/not-excluded counts), raw JSON behind a collapsed disclosure (console convention: human-first summary, machine JSON hidden).
4. **Outcomes ledger** — GET /api/jev/map/outcomes?baseline_id=<selected> → compact table (id, target, predicted, observed, verdict, supersedes), raw JSON behind disclosure.
5. **NSS prompt viewer** — display `map.nss.prompt` from the loaded map (the wayfinder's literal next-edit instruction) in a copyable pre block.

Hard requirements: use ONLY the console's existing CSS tokens/classes (no new palette), every fetch through the console's existing authenticated helper (Bearer jev_key), 401 → the console's existing auth dialog, keyboard-accessible controls (real buttons/labels), meaningful empty/loading/error states, no layout regressions to existing sections (insert as a new section in the diagnostics panel following the file's own section/anchor-pill pattern; validate the merged HTML: 0 unmatched tags, parser-checked, BEFORE any deploy — the 2026-10-08 console incidents are the standing lesson). Do NOT touch existing cards/sections.

## Lane C — endpoint verification harness (no worker changes)

Script `session/auth-pass/verify-map-fold.mjs` (run via run_script worker executor; workers.dev is CF-1010-blocked from the sandbox):

1. Parse the route inventory from the POST-migration ENDPOINTS.md (or a hardcoded route list matching it) — every route row with its method + path + expected auth class.
2. For each route: two requests — no key (X-Sauna-Connection-Id absent; expect 401 for bearer routes; for public site routes expect their normal status) and with the operator key (expect non-401; 2xx/4xx-shape per route contract).
3. Old-path 410 matrix: every old path from the mapping table → expect 410 with the moved message; /sos page paths → 404.
4. Output: markdown table (route, no-key, keyed, verdict PASS/FAIL) + JSON; exit non-zero on any FAIL.

## Advisor reconcile

1. The rewrite precedes the /api/jev delegation and the 410 guard; mapMoved flag correct; no other /api/jev/* path affected.
2. All 17 handler conditions still bearer-gated exactly once (18 call sites unchanged).
3. /map/pointmap.js kept; /map/ + /map/app.js 410s; SOS 410 texts updated to the new namespace.
4. node --check index.js; imports unchanged (51 parts, no new parts).
5. Console HTML: parser-validated (0 unmatched closes), existing sections untouched, card ids collision-free, all card fetches authenticated.
6. Deploy plan: index.js overlay + KV (jev-index.html PUT, map-index.html + map-app.js DELETE, pointmap.js untouched) + full verification run.

## Docs + skills sweep (post-verify, orchestrator)

- ENDPOINTS.md: paths → /api/jev/map/* everywhere, old paths noted 410, /map page rows removed, counts (129 → 127 canonical), mermaid updated (map engine nodes join the JEV subgraph / Core API block shrinks to site tools), history item 14.
- AGENT.md (git mirror + KV byte-identical): endpoint table paths, the bearer note, /map UI references → /jev/ card.
- Skill sweep (grep the full yubi-OS/yubiOS/skills corpus + local mirror, ALL file types): corpus-recall, custom-connection, jev-corpus (+SPEC-CORPUS, SPEC-VISCO), jev-corpus-unit-round (+scripts/baseline.mjs), pr-launch, repo-refs-skill, repo-history-skill, refs-refresh-sweep, knowledge-corpus-mint, taste-engine, steady-orbit-deploy — every /api/map, /api/maps, /api/outcomes, /api/embed, /api/vector/search, /api/repo-items, /api/map/sos, /api/fits, /api/assess, /api/narrate reference updated to /api/jev/map/*; repo+local copies synced; memory runbook lines updated.
