---
name: custom-connection
description: "How to work with the user's Cloudflare connection effectively"
requiredApps: [custom]
---

# Cloudflare connection

One connection row exists; as of 2026-10-07 exactly one works — the managed connector row `conn_pd_apn_1KhdoD7` (appName "Cloudflare", appSlug `cloudflare_api_key`, managed auth, added 2026-09-21, account `b57ee20cd90ebc4e4db28728e450a4b8` "Shant@steadyorbitsystems.com's Account", workers.dev subdomain `systems-a`, verified `GET /accounts` → 200). Route every call through it and pin header `X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7`. The five dead same-host rows below were removed from Settings on 2026-10-07 and are retained as historical record only.

- `conn_x7vt48bbDCmj` — [HISTORICAL, removed from Settings 2026-10-07] worked when added (2026-09-04, verified through 2026-09-06) but on 2026-09-21 every call returns `code 9109 Invalid access token` — the token expired or was revoked. Do not trust it without a fresh `GET /accounts` check.
- `conn_GgxyXnYTg53J`, `conn_3q0lnKopzUjk`, `conn_WvQf4m8LKf1s`, `conn_IDyE2Xmk0AsM` — [HISTORICAL, removed from Settings 2026-10-07] dead: every proxied call returns 400 `error 6111: Invalid format for Authorization header` (malformed stored value; both Sep 21 "Cloudflare (steady-orbit)" rows landed with the same defect, including the one created via the OAuth flow). Do not waste calls on them.

**Resolution of the earlier OAuth-create defect (2026-09-21):** the managed-connector row added via the standard Cloudflare connector works, unlike the four 6111 rows created through ad-hoc/OAuth flows. Default to the standard connector for future Cloudflare credentials; manual api_key rows remain the fallback (the only row that ever worked before this one was a manually saved api_key).


When calling the API, pass `connections: [{id: "<working-conn-id>", name: "Cloudflare"}]` AND set header `X-Sauna-Connection-Id: <working-conn-id>` — multiple same-host Cloudflare rows otherwise trigger `Multiple matching connections found`. Update both ids to whichever row currently works.

## Health-check quirk (don't misread it as broken)

The credential is account-scoped, not a user-level API token:

- `GET /client/v4/user/tokens/verify` → `{"code":1000,"message":"Invalid API Token"}` — **always fails; never use as the health check.**
- `GET /client/v4/user` → 9109; `GET /client/v4/memberships` → 9106. User-level scope absent.
- `GET /client/v4/accounts` → 200 with the account list. **Use this as the whoami/health check.**

## What the account holds

- Account `b57ee20cd90ebc4e4db28728e450a4b8` — "Shant@steadyorbitsystems.com's Account", created 2026-09-03. Stable Orbit client infrastructure.
- **Workers.dev subdomain is `systems-a`** (renamed from `shant-b57`; old `*.shant-b57.workers.dev` URLs 530/error-1016 as of 2026-09-21 — stale hostname, not an outage). 0 zones, 0 Pages projects, 0 custom worker domains.
- One Worker: `steady-orbit` (modified 2026-09-20) — the Steady Orbit Systems marketing site at `https://steady-orbit.systems-a.workers.dev/` (200) plus the SOS Agent API (`/api/fits` → 200 JSON; `/api/tts` → 404 "no route"). It consolidated the two former workers `old-queen-53c8` and `steady-orbit-sos`, which no longer exist as scripts (verified via `/accounts/{id}/workers/scripts` 2026-09-21). Local reference copy of the old sos worker: `documents/consultancy-bZPqW0gK/steady-orbit-sos/` (space-local working copy, not repo-truth).

## Calibration

Calibration facts this file's own dead-row history produced:

- **Working-row calibration**: exactly one row works as of 2026-09-21 (`conn_pd_apn_1KhdoD7`, verified `GET /accounts` → 200). Every session re-runs the health check before trusting the row; a fresh 200 is the only pass condition.
- **False-positive trap**: `GET /client/v4/user/tokens/verify` always fails with code 1000 on this account-scoped credential. Never read that failure as a dead connection — the health check is `GET /accounts`.
- **Error-code discrimination table**: `6111` (malformed stored Authorization value) = row defect, stop retrying; `9109` (invalid access token) = expired/revoked, the row needs re-creation. Both are calibration signals about the row, not transient errors.
- **Drift trigger**: re-run the health check after any Settings change to Cloudflare rows. The working row id has churned (two prior working rows died), so pin ids dynamically per session, never from memory.

## Recursion

Self-audit rules for this connection file, with cadence triggers:

- **Session-start audit**: run the health check (`GET /accounts` through the currently-listed working row) before any Cloudflare work in a session; the working row id has churned twice, so this file's tables are provisional until the check returns 200.
- **Table update discipline**: when a row's status changes (worked → dead, or a new row lands), update the dead/working table in the same session. The tables are the audit trail; a stale table misdirects the next session exactly the way the six dead rows once did.
- **Append, don't rewrite**: status changes get dated lines (the 2026-09-21 resolution note is the pattern). Rewriting history here hides the drift the tables exist to expose.
- **Re-run triggers**: a 9109 or 6111 on a previously-working row, a workers.dev subdomain rename, or any new Cloudflare credential flow in Settings.

## Patterns that worked

- **Live check (no auth needed):** `curl -o /tmp/body.html -w "%{http_code} %{time_total}s %{size_download}B" https://steady-orbit.systems-a.workers.dev/` — 200 expected. The old `old-queen-53c8` URL returned 530 `error code: 1016` on 2026-09-21 (was 200 on 2026-09-04).
- **Deploy history:** `GET /accounts/{id}/workers/scripts/{name}/deployments` — shows author_email + timestamps (2 dash uploads on 2026-09-03 by shant@steadyorbitsystems.com).
- **Worker settings:** `GET /accounts/{id}/workers/scripts/{name}/settings` — bindings, compatibility flags, usage model.
- **Script content:** `GET /accounts/{id}/workers/scripts/{name}` with `Accept: application/javascript` returned empty for this asset-Worker (module/static format not served without the right content type); site HTML via the public URL instead.
- Account-scoped lists: `/zones`, `/accounts/{id}/pages/projects`, `/accounts/{id}/workers/scripts`. `/accounts/{id}/domains` is not a valid route (7003).
