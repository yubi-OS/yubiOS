# Spec: Venus Movement Rebirth Hub & 30-Day Execution Protocol (`SPEC-venus-movement-2026-11-10`)

## Objective
Deploy the operational control plane, normative SER Charter, 30-Day Executive Launch Tracker, interactive Mutual-Credit & Resource-Access instruments, and public Failure/Claim Ledgers for the revived **Venus Movement** at **`https://venus.systems-a.workers.dev`**, backed by a structured Linear Project (`OMN` team, `yubiOS` initiative) and canonical documentation in `yubi-OS/yubiOS/refs/`.

### Core Invariants
1. **Federation over Centralization:** No central land compound, no single point of leadership failure. The unit of the movement is the Dunbar-bounded Sovereign Cell (5 to 50 builders, hard mitosis cap 150).
2. **SER Enforcement (`docs/SER.md`):**
   - *Sovereignty:* Owner-held hardware keys (YubiKey FIDO2 / PIV slot 9c) gate administrative signing, node unlock, and quorum (2-of-3 routine, 3-of-5 constitutional).
   - *Ephemerality:* Operational telemetry expires on a deterministic TTL (14d logs, 90d transactional cache); zero third-party trackers, cookies, or central PII databases.
   - *Reproducibility:* Every hardware node, OS image (`bootc` + `dm-verity`), and ledger state builds deterministically from digest-pinned manifests with SLSA L3 / in-toto evidence bundles.
3. **30-Day Executive Compression (Nov 10 to Dec 10, 2026):** 4 weekly waves gated by 4 binary Stage-Gates (Gate 0: Nov 12; Gate 1: Nov 16; Gate 2: Nov 26; Gate 3: Dec 10).
4. **Mathematical Honesty:** Mutual-credit clearing enforces strict zero-sum conservation ($\sum_{i=1}^N B_i = 0$, credit bounds $\pm 500\text{ ACU}$, zero interest, zero speculative tokens). Resource commons report real utilization metrics (`UR`, `MWT`, `MTTR`, `CPUDI`) and public failure logs.

## Tech Stack
- **Runtime:** Cloudflare Workers (ES Module syntax, `compatibility_date: "2026-09-01"`, standard usage model on `systems-a` subdomain -> `https://venus.systems-a.workers.dev`).
- **UI Architecture:** Self-contained 5-Layer Liquid Glass UI (`glass-design-skill`: Adaptive Tint Scrim, Multi-Pass Backdrop Frost, Asymmetric Fresnel Specular Rim, Diagonal Meniscus Sheen, and `@supports` SVG `feDisplacementMap` Lens Refraction) with full Dark Mode, Light Mode, Dynamic Textured Caustic Backdrop (`1st Alt+Click`), and Custom Wallpaper Upload Dialog (`2nd Alt+Click`), WCAG 2.2 AA contrast, and keyboard accessibility (`frontend-ui-engineering`).
- **Project Tracking:** Linear GraphQL API (`conn_pd_apn_Jjhzk0j`, team `OMN` `7e899705-e653-4322-8312-c377dc826c0b`, initiative `yubiOS` `67594e84-25fa-4cd6-996e-4a2a03fd4853`).

## API & Route Contract (`https://venus.systems-a.workers.dev`)

| Route | Method | Response / Behavior |
|---|---|---|
| `/` | `GET` | Full interactive Liquid Glass Movement Hub: Hero, SER Covenant Charter, 12-Month vs 30-Day Executive Compression Matrix, Interactive 4-Week Stage-Gate Tracker, 5 Pillars x 10 yubiOS Primitives Explorer, 3 Falsifiable Pilot Blueprints (`VENUS-TECH-01`, `VENUS-FIN-01`, `VENUS-RES-01`), Live Zero-Sum Mutual-Credit Clearing Simulator, Public Failure Log & Claim Ledger, Cell Starter Kit & Fork Guide. |
| `/charter` | `GET` | Full normative `VENUS-SER-CHARTER-2026-V1` markdown/HTML view + SHA-256 attestation digest. |
| `/llms.txt` | `GET` | Machine-readable movement manifest, SER axioms, pilot specs, and API index for AI/agent discovery. |
| `/api/health` | `GET` | `200 OK` JSON: `{ ok: true, service: "venus-movement-hub", version: "1.0.0", framework: "SER", launch_window: "2026-11-10..2026-12-10", active_gate: "Gate 0 -> Gate 1", invariants: { zero_sum_credit: true, zero_tokens: true, owner_held_keys: true } }` |
| `/api/charter` | `GET` | JSON representation of the Founding Charter, SER mappings, 4-stage conflict escalation, clean-exit rules, and Claim Ledger (promised vs refused). |
| `/api/pilots` | `GET` | JSON array of the 3 30-day pilots (`VENUS-TECH-01`, `VENUS-FIN-01`, `VENUS-RES-01`) with BOMs, budgets ($485 / $120 / $310), baseline vs Day-30 target metrics, failure protocols, and stop/fork rules. |
| `/api/gates` | `GET` | JSON 30-day timeline (Weeks 1-4) and binary readiness criteria for Gates 0, 1, 2, and 3. |
| `/api/failures` | `GET` | JSON public failure log registry (seeded with real Day-0/Week-1 baseline failure drills and schema for field incident reporting). |
| `/api/ledger/verify` | `POST` | Validates a mutual-credit transaction set `{ transactions: [{ from, to, amount, memo }], credit_cap?: 500 }`. Computes per-member balances, verifies $\sum B_i === 0$, checks credit floor/ceiling ($[-500, +500]$), computes deterministic SHA-256 Merkle root over canonical transaction entries, and returns `{ valid, sum_zero, cap_respected, balances, merkle_root, violations }`. |
| `/api/cells/register` | `POST` | Dry-run / ephemeral cell federation manifest validator: accepts `{ cell_name, region, member_count, fido2_pubkeys, pilots_selected }`, enforces Dunbar cap (`member_count <= 150`, mitosis warning at `>50`), requires >=2 hardware keys for 2-of-3 quorum, and returns a signed-ready `in-toto` Statement v1 cell manifest preview. |

## Commands
```bash
# Syntax check worker bundle
node --check /var/workspace/session/venus/worker/index.mjs

# Run automated contract & invariant unit tests
node --test /var/workspace/session/venus/worker/test-venus-worker.mjs

# Deploy to Cloudflare Workers (venus.systems-a.workers.dev)
# via PUT /client/v4/accounts/b57ee20cd90ebc4e4db28728e450a4b8/workers/scripts/venus
# Enable workers.dev subdomain route:
# POST /client/v4/accounts/b57ee20cd90ebc4e4db28728e450a4b8/workers/scripts/venus/subdomain {"enabled":true}
```

## Project Structure
```
session/venus/
  SER.md                                           # Ground SER framework from yubi-OS/yubiOS
  knowledge-corpus-digest.md                       # Extracted yubi-OS/knowledge citations
  venus-movement-rebirth-solo-2026-11-10.md        # ideate-solo + capability map + idea-kill
  SPEC-venus-movement-2026-11-10.md                # This formal specification
  venus-prior-art-research-2026-11-10.md           # Prior-art & Graham novelty report
  venus-ser-charter-and-pillars-2026-11-10.md      # Normative SER Charter & 10-primitive map
  venus-30day-executive-plan-and-pilots-2026-11-10.md # 30-day plan, 3 pilot briefs, PR launch kit
  worker/
    index.mjs                                      # Cloudflare Worker ES module
    test-venus-worker.mjs                          # Node test suite for all routes & invariants
```

## Boundaries
- **Always:** Enforce zero-sum invariant ($\sum B_i = 0$) on mutual credit, validate all POST JSON payloads at boundaries, include security headers (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`), push ONLY markdown specs/refs to `yubi-OS/yubiOS/refs/`.
- **Never:** Push worker `.mjs` source code to `yubi-OS/yubiOS` (per `RULES.md`), introduce speculative tokens, or use em dashes in prose.

## Success Criteria
- [ ] All unit & invariant tests in `test-venus-worker.mjs` pass (`0` failures).
- [ ] `https://venus.systems-a.workers.dev` is live and verified `200 OK` across `/`, `/charter`, `/llms.txt`, `/api/health`, `/api/charter`, `/api/pilots`, `/api/gates`, `/api/failures`, `POST /api/ledger/verify`, and `POST /api/cells/register`.
- [ ] Visual rendering verified in headless Chromium across desktop and mobile viewports (Dark Mode + Light Mode contrast and layout clean, 0 console errors).
- [ ] Linear Project created under `yubiOS` initiative with ordered, actionable issues covering all 4 weeks and 5 pillars.
- [ ] All 5 markdown spec/refs documents committed to `yubi-OS/yubiOS/refs/` on `main` and byte-verified.
