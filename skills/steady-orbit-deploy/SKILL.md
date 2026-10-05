---
name: steady-orbit-deploy
description: "Deploy or update the steady-orbit Cloudflare Worker (the jev orchestrator + automations + evolution + corpus engine) via the Workers modules API: pull the live bundle, overlay new/edited module parts, upload multipart with metadata rebuilt from live settings, preserve cron schedules and bindings, verify part imports (the fixture-module gotcha), and roll back from the pre-deploy bundle. Use when shipping a new module part, editing an existing one, updating the /jev/ console in KV, or rolling back a bad deploy. Triggers on 'deploy the worker', 'ship the module', 'update steady-orbit', 'worker multipart upload', 'roll back the worker'."
metadata:
  short-description: "Multipart deploy recipe for the steady-orbit worker"
---

# Steady Orbit worker deploy (modules API, no wrangler)

The `steady-orbit` worker is a multi-part ES module bundle: `solar-rbs-entry.mjs` (entry, serves site pages from KV) + `index.js` (legacy API relay) + the jev module family. Deploys go through the Cloudflare REST modules API with the managed Cloudflare connection. Never replace the entry module with anything else (the Sep 21 site-break lesson).

## The deploy sequence

1. **Pull the live bundle** (rollback source + part source of record):
   `GET /accounts/{account}/workers/scripts/steady-orbit` returns the multipart bundle; parts split on the response boundary. Save it unmodified before every change.
2. **Extract parts** to one file per part name (part name = Content-Disposition name). Current part count is the source of truth; do not guess it. 37 parts as of 2026-10-02 (NEW `jev-visco-math.js` joins the corpus family; fixture part still path-qualified `fixtures/corpus-math-fixtures.mjs`; the jev-corpus-math.js selfTest skips `visco_*` fixture kinds).
3. **Overlay**: copy each new/edited part over the extracted set. Everything else ships byte-identical.
4. **Metadata from live settings** (never from memory): `GET .../scripts/steady-orbit/settings` then
   `jq -c '{main_module:"solar-rbs-entry.mjs", compatibility_date:.result.compatibility_date, bindings:.result.bindings}' settings.json > meta.json`.
   Do NOT include `keep_bindings` (invalid type mix, error 10021). Bindings verbatim from settings (13 as of 2026-10-01: AI, DB, SITE, VEC, EVEC, WEBSITE_RATE_LIMIT + 7 secrets_store_secret).
5. **Check imports before upload**: `node --check` every part AND resolve the import graph. A part importing `./fixtures/x.mjs` needs that module shipped as a part with its path-qualified name (`-F "fixtures/corpus-math-fixtures.mjs=@file;filename=fixtures/corpus-math-fixtures.mjs;type=application/javascript+module"`) or CF rejects the whole upload with 10021 "No such module". This bit the jev-corpus deploy (2026-10-01).
6. **Upload**: `curl -X PUT .../workers/scripts/steady-orbit -F "metadata=@meta.json;type=application/json" -F "<part>=@<file>;type=application/javascript+module" (one -F per part)`. Success = `{success:true}`; capture `result.etag` as the deployed-code id.
7. **Verify schedules + bindings**: `GET .../scripts/steady-orbit/schedules` must still show `["0 * * * *", "*/5 * * * *"]` (hourly evolution cycle + 5-min automation scheduler) and settings must list all 13 bindings. Re-PUT schedules only if the upload dropped them.
8. **KV updates** (separate step, after the worker deploy): PUT the console HTML to KV namespace `SITE` (`b9de35ecd3ca44999b38cfd107c0d44a`) key `jev-index.html`; verify with `GET /jev/`. KV text docs (`AGENT.md`, `llms.txt`) update the same way; after an `AGENT.md` PUT verify `GET /AGENT.md` returns the new bytes (it is also mirrored in git at `yubi-OS/yubiOS/tools/point-map/AGENT.md`; keep both identical).

   8a. **KV text writes must be RAW bytes — never json.dumps (2026-10-05 /jev/ incident).** The values endpoint stores the body verbatim: wrapping the body in `json.dumps` stores a JSON string literal, so the served page breaks with `\"` escapes everywhere. Worse, the next KV-fetch-patch cycle stacks ANOTHER layer (AGENT.md reached triple-escaped on 2026-10-05), and the corrupted fetch also propagates into any git mirror pushed from the same /tmp file. Recovery: `json.loads` per layer, or re-source from the git mirror (it is AGENT.md's source of truth). Prevention: raw PUT (`-H "Content-Type: text/plain" --data-binary @file`) and verify EVERY KV text write with a delayed re-GET + byte-compare vs the intended local file — a substring grep passes even on escaped bytes (that miss is how this shipped).
## Deploy-safety rules

- Entry module `solar-rbs-entry.mjs` ships byte-identical unless a new page route REQUIRES editing it (its legacy-territory exclusion list shadows new page routes).
- Bindings referencing a not-yet-existing Secrets Store secret FAIL the whole deploy (CF 10182); add the binding only after the secret lands.
- Rollback: re-PUT the saved pre-deploy bundle exactly as extracted (all original parts + original metadata). If a new part was ADDED, a rollback must also revert parts that import it (e.g. reverting jev-corpus parts alone breaks jev-main.js's import) - either re-ship the edited importer's previous version or keep the new part present but unused.
- Never ship unverified math: run the selftest endpoint after any engine deploy before trusting results.
- Secrets never ride the upload; they resolve from the Secrets Store bindings at runtime via `await env.BINDING.get()`.

## Examples

**Ship a new module part**: pull bundle, extract, drop the new part in, rebuild metadata from live settings, upload, check schedules + bindings, hit the new endpoint live, record etag.

**Console-only change**: skip the worker upload; PUT the KV key, GET /jev/ to verify, done.

**Rollback**: PUT the saved pre-deploy bundle (steps 4-7 re-verified), confirm the old etag behavior on a health endpoint.

## Guidelines

1. Always pull the live bundle first; never deploy from memory of the part list.
2. Metadata comes from live settings; bindings are never hand-typed.
3. node --check + import-graph resolution before every upload.
4. Schedules and bindings verified in the same breath as the upload.
5. Record etag + timestamp with every deploy; the saved bundle is the rollback.
6. Post-deploy: live-verify every new route before reporting success.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
