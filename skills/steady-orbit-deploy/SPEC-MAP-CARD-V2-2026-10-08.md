# SPEC-MAP-CARD-V2-2026-10-08 — Map card v2: full parity + diag tabs + taste-card styling

Status: DIRECTED (Jenny, 2026-10-08: "second pass to add missing and double check all the info and readings tabs from the old map are still present, i dont see any of the original tabs or the inputs fields. from /map/. also design review with advisor to match the card visual styles to Corpus · taste card, and instad of the links at the top of diagnostics it will switch the view like a tab instead, every card should have a button")

## v1 gap (why this pass exists)

The v1 Map card condensed the old /map/ page too hard. The old page had FIVE tabs and the card lost them plus most input fields. Full inventory from the extracted `session/auth-pass/kv/map-index.html` + `map-app.js`:

- **instrument** (default): identity layer (D6) card; placement + Φ ladder (frozen frame) card; globe with auto-rotate / reset view / color-by-rayleigh-components controls; the input block (`show inputs` toggle): source select (`src`: texts / files / dirs / repo), texts textarea (one item per line), file upload (`files`), dirs input, repo input `owner/repo[/subdir]`, params N, D, d, seed, T, K, baseline_id, labels, local-only checkbox, `fetch repo`, `run`, `retry`.
- **results**: candidate ladder (NSS rungs, preview-only badge) + `map.nss.prompt` display + `copy` button.
- **proofs**: certificates table (class / theorem-check / ok / detail).
- **diagnostics**: azimuth trial (azK, azseed, `azimuth` run), rayleigh (`run rayleigh diagnostics`), admission (`run admission`), axis redundancy (arid, arK, arseed, `axis redundancy` run), each rendering human-first verdict summaries.
- **rounds**: candidate preview (candaction add/change, candname, canddelta, candtext, `preview`), consistency (consvariants 1..3 blocks, `consistency`), positive control (ctln 2..6, ctlseed, `run positive control`), outcomes ledger (`read ledger`), `download MapResult.json`, `use as baseline`.
- All with the info-tip (`gi` i-icons) explanations.

## Lane A — card v2 full parity (KV jev-index.html ONLY)

Replace the v1 Map card body with the full port of the old page's five tabs as in-card sub-tabs (tab strip inside the card header; keyboard accessible, aria roles as in the old page). Requirements:

1. Port EVERY input field, button, panel and info-tip listed above, preserving labels/placeholders/semantics. Prefix ids `mapc-` (collision-free).
2. All logic ports from `map-app.js` (the old page's functions — port the rendering/behavior, not its page-shell plumbing). All endpoints via the NEW namespace: /api/jev/map, /api/jev/map/preview, /api/jev/map/control, /api/jev/map/consistency, /api/jev/map/azimuth, /api/jev/map/rayleigh, /api/jev/map/admission, /api/jev/map/axis-redundancy, /api/jev/map/outcomes, /api/jev/map/repo-items, /api/jev/map/embed, /api/jev/map/maps, /api/jev/map/maps/:id, /api/jev/map/sos/* — every call through the console's existing authenticated helper (Bearer jev_key; 401 → existing auth dialog).
3. Keep v1's good additions: stored-maps list + auto-select, globe rendering via /map/pointmap.js.
4. Globe controls (auto-rotate, reset view, color-by-rayleigh-components) restored.
5. `download MapResult.json`, `use as baseline` (freeze current map as baseline_id), `copy agent guide` button behavior: copies the SHORT intro prompt referencing AGENT.md as source of truth (never the full doc — standing rule), same 476-byte-style text the other copy-agent-guide buttons use.
6. Long stages (repo fetch, embed batches, map) async with per-stage progress; nothing blocks.
7. Minimal CSS additions scoped to mapc- ids using existing tokens; card visual language matched to the Corpus · taste card in Lane B's pass.

## Lane B — diagnostics tabs + style harmonization (KV jev-index.html ONLY, after Lane A)

1. The diagnostics panel's anchor-pill nav (links that scroll) becomes VIEW-SWITCHING TABS: one tab button per card in the diag panel (taste, router, spectral, visco, map, …every card), aria-selected state, click switches the visible card (one at a time), keyboard arrows between tabs per WAI-ARIA tabs pattern. The sticky Diagnostics header keeps its place; the pills row becomes the tab row.
2. Style harmonization: the Map card adopts the taste card's exact visual language (section wrapper, eyebrow, spacing, radii, table/badge/pill classes) — read the taste card's markup+CSS and mirror it; no new palette.

## Advisor design review (after A+B)

Checklist: parity vs the old-page inventory (every field/button/panel present, tab-for-tab), tabs pattern correctness (aria, keyboard, no-anchor-scroll leftovers), taste-card style match, no structural breaks (html.parser 0 unmatched), all fetches authenticated + new namespace, existing sections untouched, `copy agent guide` is the intro-prompt not the doc. Advisor FIXES what fails and records before/after.

## Verification

1. Local visual pass BEFORE deploy: preview harness (mock window.fetch + sessionStorage shim, the established console-preview pattern), headless render screenshots of the Map card's five tabs + the diag tab bar switching — LOOK at them (visual check, not just structural).
2. Deploy: KV jev-index.html PUT (--data-binary, delayed re-GET byte-verify). No worker change (etag stays 0f07bbe2).
3. Live check: /jev/ serves the new bytes; with the operator key the card loads maps list; spot-check one instrument run if a stored map exists.

## Docs

ENDPOINTS.md history item 14 gets a one-line addendum (card v2: full parity + diag tabs); AGENT.md map-UI note updated to "the /jev/ console's Map card (five tabs: instrument/results/proofs/diagnostics/rounds)". Git + KV pair kept identical.
