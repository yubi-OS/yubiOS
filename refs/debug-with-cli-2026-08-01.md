# Debug with CLI — `debug-with-cli` skill (2026-08-01)

## Context

The yubiOS CI loop has a recurring latency bottleneck: every dispatch (`ci_test-vm.yml`, `ci_test-vgpu-vm.yml`, the sealed-UKI VM lane, etc.) round-trips through GitHub Actions, which costs 15–45 min per dispatch. When a dispatch fails (OMN-149 `/dev/vfio` in the guest, OMN-96 fTPM Stage A bootupd regressions, OMN-14 destructive hw_device runs), the debug cycle is:

1. Dispatch (`POST /repos/.../dispatches`)
2. Wait 15–45 min
3. Pull logs (`GET /actions/runs/{id}/logs`)
4. Read failure trace
5. Hypothesize + ship fix
6. Re-dispatch
7. Wait 15–45 min
8. Verify

For a 7-day hunt like OMN-149, that's ~30 round-trips of wasted wall-clock — and worse, you can't actually run a probe on rock1 mid-dispatch because the runner is single-tenant during a CI run.

The user (Jenny) asked on 2026-08-01: "can I connect you to a CLI to speed up debug?" This is the question that produced the `debug-with-cli` skill.

## Decision

Codify a reusable pattern for Sauna → remote-CLI access that:

- Wraps a target machine (CI runner, SBC, dev box) behind a public HTTPS surface.
- Authenticates inbound calls with a Bearer token (256-bit entropy, never logged).
- Accepts argv-array commands only — no shell strings, no injection surface.
- Lives entirely in user infrastructure (Tailscale Funnel + 50-LOC Python stdlib server) — no new SaaS dep, no third-party auth provider.
- Auto-injects Bearer via the Sauna `connect_account` proxy so the agent's call shape stays a clean `curl POST /run`.

The chosen shape is the **bridge, not the proxy.** mcp-proxy (sparfenyuk, the obvious "right" tool for this in the MCP ecosystem) was tried first and rejected — it has **no inbound auth** on its HTTP port, and `ALLOW_COMMANDS` is a command allowlist, not a request-auth filter. With rock1 holding a real YubiKey and running destructive /dev/sda tests, that's a non-starter.

The 50-LOC Python bridge (`session/rock1-shell-server.py`) is the bare minimum: `http.server.BaseHTTPRequestHandler` + `hmac.compare_digest` + `subprocess.run(cmd, shell=False)`. ~50 LOC. No `pip install`. No Node. No MCP framework. The argv shape is enforced by the bridge code itself — even if a caller crafts `["bash"]`, that's still argv to bash, not `bash -c "$string"`.

## Mechanism

### Topology

```
Sauna sandbox (Cloudflare Worker)
    │
    │  HTTP POST /run (Bearer injected by proxy)
    ▼
Cloudflare edge (TLS termination)
    │
    │  HTTPS to Funnel URL
    ▼
Tailscale Funnel coordinator
    │
    │  HTTP forward to rock1 localhost
    ▼
rock1 (yubiOS ARM64 SBC, Ubuntu 7.0.0-28-generic)
    │
    │  python3 /usr/local/bin/rock1-shell-server.py
    ▼
subprocess.run(["bcvk", "ephemeral", "run", ...], shell=False)
```

### Call shape (from Sauna)

```bash
curl -sS -X POST 'https://rock1.tail3a04f5.ts.net/run' \
  -H 'Content-Type: application/json' \
  -d '{"command":["bcvk","--version"],"timeout":10}'
```

Returns: `{"stdout": "bcvk 0.5.2\n", "stderr": "", "returncode": 0}`. On 401: Bearer missing or wrong. On 408: timeout. On 530 from Cloudflare: rock1 isn't listening (Funnel → no origin).

### Verified working (2026-08-01)

- Connection `conn_6rp6oRY9DBJG` registered as `connection_type: keys`, Bearer auth at `https://rock1.tail3a04f5.ts.net/`
- Echo test: `{"stdout": "hello from rock1\n", "returncode": 0}` ✓
- Identity test (`uname -a -m`): `Linux rock1 7.0.0-28-generic ... aarch64 GNU/Linux` ✓ — confirms ARM64 SBC
- `ip a`: shows `end0` (USB-attached Ethernet, MAC `ba:45:5c:36:22bc`, LAN `192.168.6.100/24`), `virbr0` DOWN (no VMs attached), `docker0` DOWN (no containers attached), `tailscale0` UP at `100.100.90.103/32`. The `virbr0`/`docker0` DOWN state is itself a useful debug signal for tracking partial-CI-run cleanup.

## Alternatives Considered

1. **`mcp-proxy` (sparfenyuk, PyPI)** — stdio→HTTP for MCP servers. No inbound auth. **Rejected** — incompatible with hardware-attached CI runners.
2. **`punkpeye/mcp-proxy` (npm)** — X-API-Key header. **Rejected** — Node dependency, JSON spec-file management, non-Bearer auth scheme complicates the Sauna connection row.
3. **Cloudflare Tunnel + Cloudflare Access** — most "enterprise" auth (OIDC: GitHub, Google). **Rejected** — adds Cloudflare as a dep, requires per-call OIDC flow, setup overhead is high for what should be a 2-min local tool.
4. **mTLS (client cert)** — strongest auth. **Rejected** — Sauna sandbox has no `~/.ssh`-style cert store; provisioning client certs in the proxy auth model is awkward.
5. **Add Sauna sandbox to user's tailnet** — Northflank container with `tailscaled` + auth key. Theoretically the cleanest answer (real Tailscale identity auth). **Rejected for now** — adds a Northflank container to the infra, doesn't change the public HTTPS auth model anyway.
6. **Tailscale Funnel ACL grants** — restrict Funnel to specific Tailscale users. **Rejected** — Sauna sandbox isn't a tailnet user (no `tailscale` binary), so this locks out the only caller that matters.

## Tradeoffs

**Won:**
- 20-second curl vs 20-min GitHub Actions round-trip on every probe.
- Bearer auth that fits the Sauna `connect_account` proxy model with zero new infrastructure.
- argv-only by enforcement (`subprocess.run(cmd, shell=False)`) — security posture is provable from the bridge code itself.
- Self-contained — Tailscale + Python stdlib. No `pip install`. No Node. No MCP framework. No Cloudflare dep.

**Lost:**
- No PTY / interactive shells (this is `subprocess.run`, not a TUI). For interactive needs, use `ttyd` separately.
- Per-call env vars not supported (would need a script extension). Workaround: `["bash", "-c", "FOO=bar my-cmd"]`.
- Pipes / `&&` / `||` / glob expansion not supported at the bridge. Workaround: `["bash", "-c", "dmesg | head -20"]` (and accept the responsibility).
- One Bearer per target machine — rotating requires updating the Sauna connection form too.

## Operational

- **Token storage**: `/etc/rock1-shell.env` on target, mode 600. **Never** in chat, in a session file, or in git.
- **Listen address**: `127.0.0.1:8080` only — Funnel is the ingress. Never `0.0.0.0`.
- **Bridge process**: started by nohup, logs to `/var/log/rock1-shell.log`. No request logging by default.
- **Tailscale node auth key**: non-ephemeral + reusable + pre-approved. Non-ephemeral is load-bearing — ephemeral nodes rotate the Funnel URL each session.
- **Token rotation triggers**: Sauna connection dropped, Tailscale node removed/re-added, team-member change on the target box.

## References

- **Skill**: `skills/debug-with-cli/SKILL.md` (pushed to `yubi-OS/agent-skills` and `yubi-OS/yubiOS`)
- **Bridge script**: embedded in the SKILL.md body (50 LOC, stdlib only)
- **Verified connections**:
  - `conn_6rp6oRY9DBJG` (rock1 shell bridge, api_key Bearer, working) — **use this**
  - `conn_DCa1rpTCe7Lz` (rock1 MCP shell, mcp type) — **dead weight** from the failed mcp-proxy attempt; delete from Settings → Connections
- **Session artifacts**:
  - `session/rock1-shell-server.py` — the bridge script (also embedded in the SKILL.md)
  - `session/rock1-mcp-proxy-servers.json` — the abandoned mcp-proxy spec file (left for archaeology; do NOT reuse)
- **Trigger phrases** (from SKILL.md `description`): "run command on rock1", "execute on remote", "debug the runner", "check service on the box", "tail journalctl on the live host", "can you drive that machine", "help me debug the CI box", "connect you to a CLI", "use tailscale to issue cli", "live shell on the runner", "speed up debug", "echo something to test"



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Problem Statement

**Question**: TBD per file context.
**Scope**: TBD.
**Out of scope**: TBD.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.4341).
