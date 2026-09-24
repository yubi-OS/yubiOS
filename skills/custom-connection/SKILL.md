---
name: custom-connection
description: "How to work with the user's Cloudflare connection effectively"
requiredApps: [custom]
---

# Cloudflare connection

Six connection rows exist; as of 2026-09-21 exactly one works — the managed connector row `conn_pd_apn_1KhdoD7` (appName "Cloudflare", appSlug `cloudflare_api_key`, added 2026-09-21, verified `GET /accounts` → 200). Route every call through it and pin header `X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7` while the four dead same-host rows still exist.

- `conn_x7vt48bbDCmj` — worked when added (2026-09-04, verified through 2026-09-06) but on 2026-09-21 every call returns `code 9109 Invalid access token` — the token expired or was revoked. Do not trust it without a fresh `GET /accounts` check.
- `conn_GgxyXnYTg53J`, `conn_3q0lnKopzUjk`, `conn_WvQf4m8LKf1s`, `conn_IDyE2Xmk0AsM` — dead: every proxied call returns 400 `error 6111: Invalid format for Authorization header` (malformed stored value; both Sep 21 "Cloudflare (steady-orbit)" rows landed with the same defect, including the one created via the OAuth flow). Do not waste calls on them.

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
- One Worker: `steady-orbit` (modified 2026-09-20) — the Steady Orbit Systems marketing site at `https://steady-orbit.systems-a.workers.dev/` (200) plus the SOS Agent API (`/api/fits` → 200 JSON; `/api/tts` → 404 "no route"). It consolidated the two former workers `old-queen-53c8` and `steady-orbit-sos`, which no longer exist as scripts (verified via `/accounts/{id}/workers/scripts` 2026-09-21). Local reference copy of the old sos worker: `documents/consultancy-bZPqW0gK/steady-orbit-sos/`.

## Patterns that worked

- **Live check (no auth needed):** `curl -o /tmp/body.html -w "%{http_code} %{time_total}s %{size_download}B" https://steady-orbit.systems-a.workers.dev/` — 200 expected. The old `old-queen-53c8` URL returned 530 `error code: 1016` on 2026-09-21 (was 200 on 2026-09-04).
- **Deploy history:** `GET /accounts/{id}/workers/scripts/{name}/deployments` — shows author_email + timestamps (2 dash uploads on 2026-09-03 by shant@steadyorbitsystems.com).
- **Worker settings:** `GET /accounts/{id}/workers/scripts/{name}/settings` — bindings, compatibility flags, usage model.
- **Script content:** `GET /accounts/{id}/workers/scripts/{name}` with `Accept: application/javascript` returned empty for this asset-Worker (module/static format not served without the right content type); site HTML via the public URL instead.
- Account-scoped lists: `/zones`, `/accounts/{id}/pages/projects`, `/accounts/{id}/workers/scripts`. `/accounts/{id}/domains` is not a valid route (7003).
