---
name: shell-bridge-connection
description: "How to work with the user's shell-bridge connections (rock1 + ubuntu boxes) effectively"
requiredApps: [custom]
---

# Shell-bridge connections (rock1 + ubuntu)

Two Tailscale-Funnel-exposed bearer-auth HTTP bridges (~50 LOC stdlib Python, `debug-with-cli` pattern) give Sauna remote exec on Jenny's ARM64 boxes. Same call shape on both:

```
curl -sS -m 30 -X POST https://<host>.tail3a04f5.ts.net/run \
  -H "Content-Type: application/json" \
  -d '{"command":["bash","-lc","<remote shell>"]}'
```

- Always pass the connection in the tool's `connections` param (proxy injects Bearer). Compound shell MUST be `["bash","-lc","..."]` — `command` goes to `subprocess.run` verbatim, no shell interpolation.
- Returns `{"stdout","stderr","returncode"}`. `GET /run` → 501. Head/tail all outputs.

## The boxes

- **ubuntu** (`ubuntu.tail3a04f5.ts.net`, conn `conn_ai5iXWquRX0s`): bare-metal Snapdragon X Elite (X1E80100) laptop, 62GB RAM, Ubuntu 26.04.1. **PRIMARY yubi-OS self-hosted ARM64 Actions runner** (migrated from rock1, marker `.runner_migrated` 2026-09-20, agentId 22). Also a KVM/libvirt + imaging station. Bridge verified working 2026-09-24. Bridge runs as root — `~` is `/root`; the rollout files live in `/home/ubuntu`.
- **rock1** (`rock1.tail3a04f5.ts.net`, conn `conn_W36n4EetFoNp`): the original SBC (UART / audio work). **RESTORED 2026-09-24 evening** — the 401 saga was a zombie nohup'd `rock1-shell-server.py` from August holding port 8080 with the OLD token in memory; root cause, diagnostic tell, and fix recorded in SAUNA_TOOLS ("rock1 bridge 401 saga"). Verified: echo ping + full state probe round-trip OK. Note: the yubi-OS Actions runner is live on rock1 again (agentId 23 "rock1") alongside ubuntu's agentId 22.

## Auth diagnostics (read the status code, don't guess)

- **401 with a Python `http.server` error page** → funnel + bridge alive, token mismatch. The stored connection credential is wrong. Test an alternative token directly WITHOUT proxy injection: `curl -H "Authorization: Bearer $TOKEN" -H "X-Sauna-Connection-Id: none"` (extract `$TOKEN` from the other box's token file — never print it).
- **502 `error code: 502`** → bridge process dead on the host (Cloudflare origin-unreachable). Recovery recipe: SAUNA_TOOLS "rock1 shell bridge outage pattern" (2026-08-01).
- **501** → bridge alive, auth-independent. Useful as a liveness control when 401s are ambiguous.
- Re-creating the Sauna connection row does NOT fix a 401 when nobody outside the box knows the current token. The token lives in `/etc/rock1-shell.env` (both boxes use this filename). **Resolved 2026-09-24:** the real fault was a zombie bridge process on rock1 holding the old token in memory — kill it ON rock1 (`pkill -f '[r]ock1-shell-server.py'`, bracket trick) then `systemctl restart shell-bridge`; see SAUNA_TOOLS for the full saga.

## Token/config locations

- `/etc/rock1-shell.env` — bridge env (ROCK1_SHELL_TOKEN), same filename on both boxes.
- ubuntu: `/home/ubuntu/bear` (shared-token copy — was world-readable 0644 as of 2026-09-24; hardening card targets 0600), `/home/ubuntu/shell-bridge-bootstrap.sh` (rollout script, header: "run as root on EACH tailnet device (rock1, ubuntu)"), `/home/ubuntu/actions-runner/` (Actions runner; sidecar token files like `snn` get rm'd but can leak into `.bash_history`).
- systemd unit: `shell-bridge.service` on ubuntu (Description "Bearer-auth shell bridge (Sauna debug-with-cli)"); was `rock1-shell` on rock1.

## Lessons

- A box's uptime ≠ tailnet age: `ubuntu` had 13 days uptime when it joined the tailnet (2026-09-24). Check `uptime` / `who -b` before assuming a "new device" is a fresh box.
- Ping before long pushes: a 1-byte `echo alive` POST first — saves 20–30s on a doomed call (Jenny's directive, 2026-08-01).
- On a runner host, one line each for `/var/run/reboot-required` + `apt list --upgradable` belongs in any sweep — the box runs CI.
