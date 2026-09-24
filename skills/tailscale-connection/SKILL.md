---
name: tailscale-connection
description: "How to work with the user's Tailscale API connection effectively"
requiredApps: [custom]
---

# Tailscale API connection

Connection: `conn_vCNyaMA0uZDx` (api_key). Stored credential is a `tskey-api-…` API access token — Tailscale accepts it as a plain Bearer header, which is exactly how the proxy injects it. No auth gymnastics needed. Pass `connections: [{ id: "conn_vCNyaMA0uZDx", name: "Tailscale API" }]` on every `run_script`/`bash` call.

## Working call paths (verified 2026-09-24)

- `GET https://api.tailscale.com/api/v2/tailnet/-/devices` → 200, `{"devices":[...]}` — the main surface. One device per entry with `name`, `addresses` (v4+v6), `os`, `clientVersion`, `created`, `lastSeen`, `connectedToControl`, `authorized`, `expires` (node-key expiry), `keyExpiryDisabled`, `updateAvailable`, `blocksIncomingConnections`, `tailnetLockError`.
- `GET /api/v2/tailnet/-/dns/preferences` → 200, `{"magicDNS":true|false}`.
- `GET /api/v2/tailnet/-/dns/nameservers` → 200, `{"dns":[...]}`.
- `GET /api/v2/tailnet/-/users` → 200, login identities with `role` (owner), `displayName`.

## Dead ends — do not retry

- `GET /api/v2/tailnet/-` → 405 `method_not_allowed`. Always scope under `tailnet/-/...`.
- `GET /api/v2/tailnet/-/acls`, `/routes`, `/keyexpiry`, `/tags`, `/invites` → 404/ERR on this key. Likely API-key scope limitation; the ACL surface needs an OAuth client or a differently-scoped key. Don't burn calls on them.

## Credential traps

- `tskey-api-…` = user-owned API access token → works directly as Bearer.
- `tskey-client-…` = OAuth client **secret** → NEVER works as a direct Bearer credential (401 `API token invalid`); it must be exchanged at `POST /api/v2/oauth/token` for 1-hour access tokens. If a Tailscale connection suddenly 401s on every shape, check which prefix the user pasted.
- Tailscale API keys max out at 90-day expiry. Current key pair (1 API key + 1 auth key) expires 2026-12-23 — expect a dead connection after that date and prompt for rotation.

## Tailnet facts (as of 2026-09-24)

- Tailnet `tail3a04f5.ts.net`, single owner `foil-copy-overrate@github` (displayName "OMNI-AGENT", role owner).
- 2 devices: `rock1.tail3a04f5.ts.net` (100.100.90.103, the ARM64 CI runner + Sauna shell-bridge host — its Funnel exposes `https://rock1.tail3a04f5.ts.net/run`, see the debug-with-cli skill) and `ubuntu.tail3a04f5.ts.net` (100.123.151.62, joined 2026-09-24, purpose set up by the user same day).
- MagicDNS on, no custom nameservers.
- rock1 node key expires 2027-01-27 — if the shell bridge becomes unreachable with a non-502 error around that date, check node-key expiry first.
