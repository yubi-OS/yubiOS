# Steady Orbit Worker & /jev/ API Operational Playbook (2026-10-21)

## Context

Apply whenever deploying, operating, debugging, or auditing the `steady-orbit` Cloudflare Worker (`https://steady-orbit.systems-a.workers.dev`) and its `/jev/`, `/api/jev/*`, `/api/jev/map/*`, `/api/jev/corpus/*`, `/api/jev/timeseries/*`, `/api/jev/forecast/*`, `/api/jev/route/*`, `/api/jev/evolution/*`, `/api/jev/automations/*`, `/api/jev/workspaces/*`, and public relay endpoints (`/api/decide`, `/api/chat`, `/api/tts`, `/api/stt`, `/api/contact`, `/api/searxng`).

As of 2026-10-21 (deploy etag `356cb5c1c2e3e3f8b308ba6e29ab06bf27fd99fc107cc9d7f60b01d0dfb7e6b7`, policy v24), the worker comprises **67 ES module parts** (`solar-rbs-entry.mjs` entrypoint + `index.js` core API/point-map/relays + 61 `jev-*.js` / `routes-*.js` modules + 4 path-qualified `fixtures/*.mjs` modules), **15 bindings** (`AI`, D1 `DB` `sos-agent`, KV `SITE` `steady-orbit-site`, Vectorize `VEC` `sos-embeddings` and `EVEC` `jev-evolution`, Analytics Engine `TS` dataset `jev`, ratelimit `WEBSITE_RATE_LIMIT`, `secret_text` `AE_SQL_TOKEN`, and 7 Secrets Store bindings: `DAYTONA_API_KEY`, `ELEVENLABS_API_KEY`, `GITHUB_API_KEY`, `GOOGLE_PLACES_API_KEY`, `JEV_API_KEY`, `NORTHFLANK_API_KEY`, `RESEND_API_KEY`), **2 cron triggers** (`0 * * * *` and `*/5 * * * *`), and **`limits: {"cpu_ms": 300000}`**.

Recurring operational failures solved by this playbook:
- Replacing `solar-rbs-entry.mjs` with an API bundle and breaking the marketing site (2026-09-21 incident).
- Uploading `secret_text` bindings verbatim from `GET /settings` (which omits the secret value) or passing invalid `keep_bindings` types (`10021` upload rejection).
- Flattening `fixtures/*.mjs` module names during bundle extraction (`10021 No such module`).
- Rstripping trailing newlines when splitting multipart bundles (corrupting per-part rollback sha256s).
- Calling `.get()` on a `secret_text` binding (`AE_SQL_TOKEN` is a plain string) or failing to call `await binding.get()` on a `secrets_store_secret` binding (`[object Object]` auth failure).
- Using `ORDER BY timestamp` on Workers Analytics Engine SQL without `timestamp` in the `SELECT` list (`422 unable to find type of column`).
- Wrapping KV text/HTML writes in `json.dumps` or uploading HTML with `curl -d` instead of `--data-binary` (CRLF stripping and escaped-quote corruption).

## Decision

1. **Preserve the two-module entry boundary (`solar-rbs-entry.mjs` -> `index.js` -> `jev-main.js`).** `solar-rbs-entry.mjs` serves `website-v19/*` and `/radiant/` from KV `SITE` and delegates `LEGACY_TERRITORY` (`/api`, `/jev`, `/map`, `/sos`, `/audio`, `/AGENT.md`, `/llms.txt`) to `index.js`. Keep `solar-rbs-entry.mjs` byte-identical unless adding a new top-level site page route to `PAGES`.
2. **Enforce central + defense-in-depth bearer auth (`JEV_API_KEY`).** Every route under `/api/jev/*` (except `GET /api/jev/health`) and `/api/jev/map/*` is gated by `authorized(req, env)` using constant-time `timingSafeEqual`. When verifying `401` gates from the Sauna sandbox, always send `X-Sauna-Connection-Id: none` so the egress proxy does not inject the operator bearer token.
3. **Handle dual secret binding shapes and `keep_bindings: ["secret_text"]`.** Resolve credentials with `typeof raw === "string" ? raw : (raw && typeof raw.get === "function" ? await raw.get() : null)`. When building `meta.json` from `GET /settings`, filter out `type === "secret_text"` from `bindings` and set `"keep_bindings": ["secret_text"]` plus `"limits": {"cpu_ms": 300000}`.
4. **Ship fixture parts with path-qualified names.** Always upload `fixtures/corpus-math-fixtures.mjs`, `fixtures/taste-fixtures.mjs`, `fixtures/spectral-fixtures.mjs`, and `fixtures/lens-fixtures.mjs` with `-F "fixtures/x.mjs=@.../fixtures/x.mjs;filename=fixtures/x.mjs;type=application/javascript+module"`.
5. **Models advise; the deterministic fail-closed gate disposes (`jev-decide.js`, `jev-gate.js`, `jev-execute.js`, `jev-verify.js`).** `askJev` calls `@cf/cloudflare/clef` via `env.AI.run` (`consumed=0`). Model probabilities never authorize execution. `jev-execute.js` enforces `CREDENTIAL_HOSTS` host-scoping before injecting `GITHUB_API_KEY`, `RESEND_API_KEY`, `GOOGLE_PLACES_API_KEY`, or `DAYTONA_API_KEY`. Non-idempotent actions that fail or return `unknown` require `POST /api/jev/tasks/:id/reconcile` (`happened | did_not_happen`) before retry (`409 failed_requires_reconcile`).
6. **Bind approvals to policy versions (`jev-review.js`, `jev-improve.js`).** Approvals bind `{actor, target, payload_hash, limits, expires_at, policy_version}`. Policy changes go exclusively through `POST /api/jev/learnings/:id/promote`, which writes KV `jev-policy.json`, appends to `jev_policy_changelog`, and expires older pending approvals.
7. **Pre-register every gate-feeding measurement or forecast on `/api/jev/map/outcomes`.** The outcomes ledger (`POST /api/jev/map/outcomes`) is append-only (`DELETE`/`PUT`/`PATCH` return `405`). Corpus RSI rounds gate on `level_dbc = 20*log10(|z|)` at `nulls >= 400` with scorer hysteresis `{low: 0.45, high: 0.55, pre_row}`.
8. **Use the 3-stage SCAMPER cascade (`?engine=cascade` or `POST /api/jev/forecast/:series`) for calibrated forecasting.** Plain `GET /api/jev/forecast/:series?h=N` runs damped-trend Holt ETS v2 (`jev-forecast-math.js`, where `G2` and `NEG_G2` fail honestly and `quality.calibrated` is `false`). Passing `?engine=cascade` on `GET` or calling `POST /api/jev/forecast/:series` runs `jev-cascade-forecast.js` (parity max `|delta| <= 1.42e-14` vs `tools/timesfm-clairic-clef/timesfm_clairic_clef.py`, `8/8 PASS` in `cascade_selftest`): Stage 1 `@cf/cloudflare/clairic` intake, Stage 2 TimesFM 2.5 (Apache-2.0, split-conformal calibration) with pre-registered rolling-origin fallback gate to TimesFM 3.0 on covariate/variate coupling or MASE, and Stage 3 `@cf/cloudflare/clef` bounded decision + deterministic fail-closed gate + outcomes pre-registration.
9. **Fail-closed switches and CAS cron scheduling (`jev-switches.js`, `jev-cycle.js`, `jev-scheduler.js`).** Both `approval_emails` and `pwc_enabled` switches fail closed on D1 read errors (`switch_read_failed`). Hourly evolution (`0 * * * *`) and 5-minute automation (`*/5 * * * *`) crons use CAS claims so double-firing is impossible.
10. **Raw-byte KV writes with DOM balance and delayed `sha256` verification.** Never pass `json.dumps` or `curl -d` when writing KV `SITE` keys (`jev-index.html`, `AGENT.md`, `website-v19/*`). Validate HTML tag balance with `HTMLParser` (0 unmatched closes), upload with `--data-binary`, wait 15s for edge propagation, and verify `sha256` against the KV REST API and public URL.

## Mechanism

### 1. Pull live 67-part bundle, settings, and schedules (exact byte preservation)

```bash
ACCT="b57ee20cd90ebc4e4db28728e450a4b8"
mkdir -p session/worker_bundle/parts

curl -sS -D session/worker_bundle/bundle.headers \
  -H "X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCT}/workers/scripts/steady-orbit" \
  -o session/worker_bundle/bundle.raw

curl -sS -H "X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCT}/workers/scripts/steady-orbit/settings" \
  -o session/worker_bundle/settings.json

curl -sS -H "X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCT}/workers/scripts/steady-orbit/schedules" \
  -o session/worker_bundle/schedules.json

python3 - << 'PY'
import re, os, hashlib
hdrs = open("session/worker_bundle/bundle.headers", "rb").read().decode("latin1")
boundary = re.search(r"boundary=([^\s;\r\n]+)", hdrs, re.I).group(1).strip('"').encode("latin1")
raw = open("session/worker_bundle/bundle.raw", "rb").read()
for ch in raw.split(b"--" + boundary)[1:]:
    if ch.startswith(b"--"):
        break
    ch = ch[2:] if ch.startswith(b"\r\n") else (ch[1:] if ch.startswith(b"\n") else ch)
    ch = ch[:-2] if ch.endswith(b"\r\n") else (ch[:-1] if ch.endswith(b"\n") else ch)
    sep = b"\r\n\r\n" if b"\r\n\r\n" in ch else b"\n\n"
    p_hdr, p_body = ch.split(sep, 1)
    name = re.search(r'name="([^"]+)"', p_hdr.decode("latin1")).group(1)
    out = os.path.join("session/worker_bundle/parts", name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "wb").write(p_body)
PY
```

### 2. Syntax-check, build `meta.json` (`keep_bindings: ["secret_text"]`), upload, and verify

```bash
python3 - << 'PY'
import os, json, subprocess
with open("session/worker_bundle/settings.json") as f:
    st = json.load(f)["result"]
explicit = [b for b in st["bindings"] if b.get("type") != "secret_text"]
meta = {
    "main_module": "solar-rbs-entry.mjs",
    "compatibility_date": st.get("compatibility_date", "2026-09-01"),
    "bindings": explicit,
    "keep_bindings": ["secret_text"],
    "limits": st.get("limits", {"cpu_ms": 300000}),
}
open("session/worker_bundle/meta.json", "w").write(json.dumps(meta))

parts = []
for root, _, files in os.walk("session/worker_bundle/parts"):
    for fn in sorted(files):
        fp = os.path.join(root, fn)
        rel = os.path.relpath(fp, "session/worker_bundle/parts")
        p = subprocess.run(["node", "--input-type=module", "--check"], input=open(fp, "rb").read(), capture_output=True)
        assert p.returncode == 0, f"Syntax error in {rel}: {p.stderr.decode()}"
        parts.append((rel, fp))
parts.sort()

cmd = [
    "curl", "-sS", "-X", "PUT",
    "-H", "X-Sauna-Connection-Id: conn_pd_apn_1KhdoD7",
    "https://api.cloudflare.com/client/v4/accounts/b57ee20cd90ebc4e4db28728e450a4b8/workers/scripts/steady-orbit",
    "-F", "metadata=@session/worker_bundle/meta.json;type=application/json",
]
for rel, fp in parts:
    cmd.extend(["-F", f"{rel}=@{fp};filename={rel};type=application/javascript+module"])
r = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
assert r.get("success") is True, r
print("Deployed etag:", r["result"]["etag"], "parts:", len(parts))
PY
```

### 3. Live selftest and 3-stage forecast cascade verification

```bash
BASE="https://steady-orbit.systems-a.workers.dev"

# Verify unauthenticated 401 gate (disable proxy injection)
curl -sS -o /dev/null -w '%{http_code}\n' -H "X-Sauna-Connection-Id: none" "${BASE}/api/jev/summary"

# Run selftest suite and 3-stage forecast cascade with operator bearer
for p in \
  "/api/jev/health" \
  "/api/jev/selftest" \
  "/api/jev/selftest/ledger" \
  "/api/jev/evolution/selftest" \
  "/api/jev/automations/selftest" \
  "/api/jev/map/selftest" \
  "/api/jev/corpus/selftest" \
  "/api/jev/timeseries/selftest" \
  "/api/jev/forecast/task_state?h=5&engine=cascade"; do
  curl -sS -H "X-Sauna-Connection-Id: conn_QAvrBSyEG8ml" -H "User-Agent: omni-agent/1.0" "${BASE}${p}" | jq -c '{path:"'"${p}"'", ok:.ok, status:.status, active_model:.active_model}'
done
```

## Verified working (2026-10-21)

- **PR [#328](https://github.com/yubi-OS/yubiOS/pull/328)** merged to `yubi-OS/yubiOS` `main` at commit `eb743c07f5e1b49f9fb36b827449604e0a0de9f5`: shipped `tools/timesfm-clairic-clef/timesfm_clairic_clef.py` (8/8 pre-registered falsification gates `G1..G8` PASS), `fixtures.json`, `qc-log.json`, `README.md`, and `refs/timesfm-clairic-clef{-solo,}-2026-10-21.md`.
- **`lean-check.yml` CI run [39585507995](https://github.com/yubi-OS/yubiOS/actions/runs/39585507995)** at commit `4815c3ae6a7131ff4b77ed31fc96bb9ea6843347`: `check=success`, `verify-measurements=success`, `verify-tools=success` (including step 27 `timesfm-clairic-clef cascade selftest (8 pre-registered gates G1..G8)`).
- **Steady Orbit Worker deploy etag `356cb5c1c2e3e3f8b308ba6e29ab06bf27fd99fc107cc9d7f60b01d0dfb7e6b7`** (67 module parts, 15 bindings incl. `AE_SQL_TOKEN`, crons `["0 * * * *", "*/5 * * * *"]`, `cpu_ms: 300000`): live-verified `GET /api/jev/timeseries/selftest` (`cascade_selftest` 8/8 PASS), `GET /api/jev/forecast/task_state?h=5&engine=cascade` (`200`, `timesfm-2.5-200m`, `clef` choice `wait` `p=0.7677`, `allowed`), `POST /api/jev/forecast/messy_ops` (`live_clairic=true` -> `live_workers_ai`, `MASE 0.1971`), and `POST /api/jev/forecast/covariate_shock` (automatic 2.5 -> 3.0 fallback `MASE 1.4224 -> 0.0945`, `needs_approval` on `timesfm_30_non_commercial_weights`).
- **Docs & KV sync commit `7cbae103f8f5f038642de2353f0de410ddd98924`**: `docs/ENDPOINTS.md` (`sha256` `3ed38c5ac7c08563`), `tools/point-map/AGENT.md` + KV `SITE/AGENT.md` (`sha256` `365f12cb791f0d62`), `skills/jev-timeseries/SKILL.md` (`sha256` `4f5becbd20c779d1`), and KV `SITE/jev-index.html` (`sha256` `eb4199a36d483e63`).

## Operational

- Wait 15 to 20 seconds after every Worker PUT or KV PUT before running live verification probes so edge propagation finishes.
- Never run full-table `SELECT *` on large D1 tables (`maps`); paginate with `LIMIT`/`OFFSET`.
- Route long-running map admission checks (`N=1200`, `>100s`) through a detached job when sandbox egress cuts at ~100s, and reconcile server state before retrying.

## Cross-references

- `docs/ENDPOINTS.md` (136-route inventory + Falsification Harness matrix, history items 1–20).
- `tools/point-map/AGENT.md` (mirrored at `https://steady-orbit.systems-a.workers.dev/AGENT.md`).
- Skills: `skills/steady-orbit-deploy/SKILL.md`, `skills/jev-orchestrator/SKILL.md`, `skills/jev-corpus/SKILL.md`, `skills/jev-timeseries/SKILL.md`, `skills/taste-engine/SKILL.md`, `skills/falsification-corpus/SKILL.md`.
- Sources of record: `tools/timesfm-clairic-clef/timesfm_clairic_clef.py`, `tools/forecast-standard/forecast_ets.py`, `tools/visco-instruments/verify_visco.py`, `tools/edge-standard/edge_standard.py`, `tools/spectral-standard/spectral_standard.py`, `tools/lens-standard/lens_standard.py`.
- Playbooks: [dispatch-chain-verification](dispatch-chain-verification.md), [lensing-question-space](lensing-question-space.md), [rsi-regime](rsi-regime.md).
