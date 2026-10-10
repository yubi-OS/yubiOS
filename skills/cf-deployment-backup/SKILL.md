---
name: cf-deployment-backup
description: "Full backup of a Cloudflare account deployment as a verified zip: worker bundles + settings/schedules/subdomains, every KV key and value, a full Vectorize index export, an Analytics Engine snapshot, and Secrets Store names, with D1 data and secret values excluded by default. Use when the user asks for a Cloudflare deployment backup or CF backup zip (steady-orbit, antimony, or any worker account). Triggers on 'cf backup', 'cloudflare deployment backup', 'backup the deployment in a zip'."
requiredApps: []
---

# Cloudflare deployment backup

Back up an entire Cloudflare account deployment into one verified zip. Validated across three runs: 2026-09-26 (steady-orbit-cf-backup-2026-09-26.zip, 84 MB, included D1 dumps), 2026-10-06 (steady-orbit-cf-backup-2026-10-06.zip), and 2026-10-10 (cloudflare-deployment-backup-2026-10-10.zip, 38.7 MB, first full Vectorize export).

## Scope

Included by default: worker bundles (raw multipart + parsed modules/), per-worker settings/schedules/subdomain/version lists, custom domains, the full KV namespace (every key + value), full Vectorize index export (ids/values/metadata), an Analytics Engine SQL snapshot, Secrets Store secret NAMES and metadata, and a service inventory (R2, queues, Hyperdrive, Durable Objects, dispatch namespaces, D1 names).

Excluded by default: D1 data (inventory only; include dumps only when the user asks — then use LIMIT/OFFSET chunks, the export-API poll route 404s and full-table SELECT 503s past ~540 rows), secret values (Secrets Store is write-only; a secret_text binding like AE_SQL_TOKEN can never be read back, so RESTORE.md says to mint a fresh token), old version bundles (versions endpoint is metadata-only), R2/queues when not enabled on the account.

## Procedure

1. **Preflight.** Pass the Cloudflare connection in the tool's `connections` param. Always send an explicit `User-Agent` header (header-less fetches fail with 400/1010). Stage under `session/<dir>` using absolute paths. Read the worker list live via `GET /accounts/{acc}/workers/scripts` — it drifts between backups (antimony appeared after the 2026-10-06 backup).
2. **Inventory pass** (one run_script): GET /workers/scripts, /workers/domains, /storage/kv/namespaces, /vectorize/v2/indexes, /queues, /r2/buckets (403 code 10042 = not enabled), /d1/database, /hyperdrive/configs, /workers/durable_objects/namespaces, /workers/dispatch/namespaces, and per-worker /settings, /schedules, /subdomain, /versions. Save each as JSON.
3. **Worker bundles.** `GET /accounts/{acc}/workers/scripts/{name}` returns multipart; parse the boundary from the Content-Type header, save the raw bundle plus each named part into `workers/{name}/modules/` (parts carry `name=` only, no `filename=`). Assert the main module file exists in modules/ before building upload-metadata.json (main_module, compatibility_date/flags, usage_model, bindings; do NOT send keep_bindings; secret_text bindings carry no value; secrets_store_secret bindings re-attach by secret_name + store_id).
4. **KV dump.** Paginate keys (limit=1000 + cursor) into a census with name/expiration/metadata. Fetch values concurrently (12 threads, 4 retries with backoff, URL-encode keys with `quote(k, safe='')`). Name value files `kv/<md5(key)>.value` and build a kv-keymap.json mapping key -> file + sha256 + bytes + expiration + metadata.
5. **Vectorize export.** There is NO list-vectors REST route (both `list-vectors` and `list_vectors` probe 404). Enumerate with `GET /vectorize/v2/indexes/{name}/list?count=1000` following `nextCursor` until `isTruncated` is false, then fetch full vectors with `POST /vectorize/v2/indexes/{name}/get_by_ids` batches of 20 ids. The result may arrive as a bare list OR `{"result": {"vectors": [...]}}` — handle both shapes. Write one NDJSON line per vector (id, values, metadata, namespace) and cross-check the count against the index info's vectorCount.
6. **Analytics Engine snapshot.** `POST /accounts/{acc}/analytics_engine/sql` with `Content-Type: text/plain` and body `SELECT * FROM <dataset>` — the managed connection's analytics read suffices, no new token. Archive as JSON with the row count; it is a point-in-time snapshot (~3-month retention, no restore path).
7. **Build and verify.** Write MANIFEST.json (counts, sizes, exclusions, zone/REST notes), RESTORE.md (see checklist below), SHA256SUMS.txt over every staged file, then zip with `zipfile.ZIP_DEFLATED, compresslevel=9`. Reopen the zip: `testzip()` must be clean and every file must match its SHA256SUMS line before reporting done.
8. **Zero-error gate.** Abort the zip entirely if any KV or vector fetch failed — a partial backup is worse than none.

## Sandbox lesson

A run_script that logs `Failed to commit changes` can silently revert its loose-file writes between calls (in the 2026-10-10 run, 1,919 kv .value files vanished while files from earlier runs survived). Prefer the one-pass pattern: fetch everything into memory and write the final zip in a SINGLE run_script, then verify on disk in a separate bash call.

## RESTORE.md checklist to ship inside the zip

- Workers: multipart PUT /workers/scripts/{name} with a metadata part + one part per module (filename = module name including fixtures/ prefix, Content-Type application/javascript+module); never re-send the raw downloaded bundle; then PUT /schedules with the cron list and POST /subdomain {"enabled": true} for new scripts.
- Custom domains: one POST /workers/domains per entry from workers-custom-domains.json; the managed token has returned 405 on zone-route PATCH and custom-domain writes, so fall back to the dashboard.
- KV: PUT raw bytes (never JSON-encoded text) per key from the keymap; verify with a delayed re-GET + byte compare (~15s propagation lag).
- Vectorize: recreate each index from info.json config (dimensions 768, metric cosine), then upsert the NDJSON in batches; verify the upsert path against current Cloudflare docs first and allow settle time (eventually consistent).
- Analytics Engine: no restore path; the file is an archive snapshot only.
- Secrets: re-enter every named secret into the Secrets Store before uploading workers that bind them.

## Examples

- "full backup of the cloudflare deployment, except D1, in a a zip" (2026-10-10): inventory pass, then worker bundles + config, then all 1,919 KV values (48.2 MB, zero errors), the first full Vectorize export (2,100 + 6 vectors), an AE snapshot (287 rows), and D1 inventory-only — delivered as documents/github-yubios-KS9n5GAT/cloudflare-deployment-backup-2026-10-10.zip (38.7 MB, sha256 f54e4a50..., 2,016 entries, checksums verified inside the archive).
- 2026-09-26 variant: same shape plus D1 table dumps (fits 10 / maps 540 chunked / outcomes 1,283 rows) — include D1 dumps only when the user asks; default is inventory-only.

## Guidelines

- Known account facts to read live but sanity-check against the manifest: account b57ee20cd90ebc4e4db28728e450a4b8 ("Shant@steadyorbitsystems.com's Account"), KV namespace steady-orbit-site b9de35ecd3ca44999b38cfd107c0d44a, Secrets Store default_secrets_store e3ace10c85d24a1ca886be3773d6d963, workers.dev subdomain systems-a.
- Output location: the space's documents folder alongside prior backups (documents/github-yubios-KS9n5GAT/); name `cloudflare-deployment-backup-YYYY-MM-DD.zip` when the account holds multiple workers, the older `steady-orbit-cf-backup-YYYY-MM-DD.zip` for single-worker runs.
- Complements the steady-orbit-deploy skill (bundle/deploy recipes); this skill owns the full-account backup + restore-document shape.
- Report format: zip path + size + sha256 + entry count, what's in it, what's deliberately excluded, and the one open caveat (Vectorize upsert path unverified) — terse, no preamble.
