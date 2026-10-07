# SPEC-CORPUS: the papers' math engine on the steady-orbit worker ("Jev Corpus")

Status: formal spec. Capability map approved by Jenny 2026-10-01 (with backref: the math's system of record is `papers/data/lean/` — verify_claims.py + CurvedCorpus.lean; ports must be parity-tested against it, never re-derived). Ideate-solo one-pager: `session/jev-corpus-solo-2026-10-01.md` (session artifact, not repo-truth) (V1 won).

Reads first (same invariants as SPEC.md + SPEC-AUTOMATIONS.md): jev-orchestrator/SPEC.md (§1 invariants, §6 schema, §8 gate), SPEC-AUTOMATIONS.md (§3 stage semantics).

## 1. Objective

Move the yubiOS corpus-math toolset from local Python onto the steady-orbit worker as a coherent endpoint family (`/api/jev/corpus/*`), wire it into the evolution loop (real measured metrics, lens-format proposals) and the automation builtin registry, and redesign the console's user-facing evolution surface so humans see outcomes instead of machine dumps. Direction: full automation, RSI, enrichment — every enrichment path gated through the existing fail-closed machinery by construction.

## 2. Invariants (unchanged, restated because the engine touches them)

- The gate is deterministic and fails closed. Corpus results are DATA, never authorization. A probability or dBc number never approves anything.
- Lens candidates become DIRECTIVES through the existing kinds whitelist: `note`/`record_learning` auto-execute; `repo_push`, `skill_push`, `worker_change`, `ops_fix`, `memory_edit`, `external_comms` are forced needs_approval; unknown kinds rejected. No new auto kind is added by this build.
- LLM/jev-1.13 stays the only decision layer; the corpus engine is deterministic math (no AI in the math path).
- Unknown outcomes reconcile-before-repeat; append-only audit; adapters forward full context (RULE: any adapter wrapping gate/check functions forwards the approvals array and ctx.approval).
- The math must match the Lean-verified reference: JS ports are byte-audited against `papers/data/lean/verify_claims.py` (v2_corr, curveball) and tested to parity, not approximated.

## 3. Module contracts (ES modules, Web APIs only, no npm, no em dashes)

Shared style with the deployed jev modules: explicit-column INSERTs, guarded ALTERs for new columns, fail-closed on config errors, `User-Agent: jev-orchestrator/1 (+site)` on outbound fetches.

### 3.1 `jev-corpus-math.js` (Lane 1)

```
export function v2Corr(matrix)              // top-2 eigenvalue share of column corr matrix (port of verify_claims.py v2_corr)
export function curveball(matrix, rand)     // Strona trade null preserving row+col margins (port of verify_claims.py curveball); rand = seeded PRNG fn (Math.random fallback)
export function nullStats(v2obs, v2Nulls)   // {z, mean, sd, verdict} verdict in {"excluded at the resolution of this null","not-excluded"}
export function shFit(rows2, L)             // real SH fit on Fibonacci lattice, L<=3; returns {shares:[E_lm], E_l:[l shares], amplitude, vertices}
export function dbc(shares, refShares)      // corpus level in dBc vs null vacuum (Parseval-share power ratio)
export function closedFormDecay(El0, t)     // E_l(t) = E_l(0)*exp(-2*l*(l+1)*t), l=0..L
export function defocusTime(El0)            // t_hat from per-degree decay vs reference (spectral-defocus estimator)
export function selfTest()                  // {pass, checks:[{name, ok, expected, got}]} — fixture parity
```

### 3.2 `jev-corpus-atom.js` (Lane 2)

```
export function pca2(rows)                  // z-score + PCA top-2 -> {rows2:[[u,v]], explained}
export function stereographicLift(u, v)     // -> [x,y,z] on S^2
export function idealPole(rows)             // lift of the all-ones projection
export function geodesicGap(p, q)           // arccos(dot)
export function atomStep(matrix, i)         // {best_flip, delta, d_pre, d_post}; delta >= -1e-12 asserted (CurvedCorpus.lean atom_delta_nonneg); abort loudly otherwise
export function atomDescent(matrix, opts)   // {flips:[{i,primitive,delta}], cycles, finalDelta, converged}
export function boltzmannCollapse(Phi, d)   // exchangeable-potential collapse (port of boltzmann-collapse/collapse.py): aggregated law over k
export function selfTest()
```

### 3.3 `jev-corpus-lens.js` (Lane 3)

```
export function lensCandidates(matrix, labels, opts) // ranked candidates, lens format per curve-compass-skill cycle-34:
//  [{id, cell:[i,j], kind:"real"|"control", hypothesis, method, params, expected_delta, score}]
//  ranking: sparsest cells weighted by low-l mass; controls pair each real flip with a curveball-shuffled copy
export function tautologyClassify(sentence)          // {verdict:"tautology"|"falsifiable"|"paradox"|"undecidable", refuter}
export function driftPoints(curveA, curveB)          // {warp, per_region, z} port of the curve-drift-detector core
export function selfTest()
```

### 3.4 `jev-corpus-routes.js` (Lane 4)

```
export const CORPUS_SCHEMA_DDL = Object.freeze([ ... ]); // jev_corpus_runs table: id, created_at, kind, input_hash, result_json, notes; guarded ALTER pattern if extending
export function handleJevCorpus(req, env, deps)          // full route table below; bearer-auth checked exactly like handleJevEvolution2 (defense in depth)
export async function ensureCorpusSchema(db)
```

Routes (all under `/api/jev/corpus`, bearer-auth required except `/health`):

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/jev/corpus/health` | GET | — | `{ok, corpus:"ready", modules:{math,atom,lens}}` (cheap, no D1) |
| `/api/jev/corpus/audit` | POST | `{matrix: number[][]|{rows,cols,data}, labels?:[], nulls?:N}` | `{v2, z, verdict, dbc, shares, E_l, run_id}`; run row appended (idempotent per input sha256); null count default 200, cap 1000 |
| `/api/jev/corpus/lens` | POST | `{matrix, labels?, top?:K}` | `{candidates:[...], run_id}` |
| `/api/jev/corpus/atom` | POST | `{matrix, max_flips?}` | `{plan:[{i,primitive,delta}], finalDelta, converged}` — DRY-RUN PLAN ONLY; execution is a gated directive, never inline |
| `/api/jev/corpus/classify` | POST | `{sentence}` | `{verdict, refuter}` |
| `/api/jev/corpus/placements` | POST | `{matrix, labels}` | audits, then POSTs vectors to the worker's OWN `/api/map` (internal fetch, same origin) and returns `{map_id, map_url}` |
| `/api/jev/corpus/runs` | GET | — | last 50 run rows |
| `/api/jev/corpus/selftest` | GET | — | runs all three selfTests; 200 all-pass / 500 with failing checks; result recorded as a run row |

Dispatch wiring (ONE edit in `routes-jev.js`, advisor applies): extend the existing evolution-preflight catch-all block with
`if (p === "/api/jev/corpus" || p.startsWith("/api/jev/corpus/")) return handleJevCorpus(req, env, deps);`
placed BEFORE the first legacy catch-all, same defense-in-depth pattern (the bearer gate already ran; handleJevCorpus re-checks).

### 3.5 `jev-corpus-builtins.js` (Lane 4)

```
export const CORPUS_BUILTINS = {
  corpus_audit(input)   // input {matrix|source_ref, nulls?} -> audit result (read-only)
  corpus_lens(input)    // -> candidates (read-only proposals)
  corpus_drift(input)   // {matrixA, matrixB} or {ref: previous_run_id} -> drift result
  tautology_gate(input) // {text} -> verdict; builtins are pure, side-effect-free
}
```

Registration: ONE import + spread into the engine's builtin dispatch table (advisor locates the exact registry point in `jev-automations.js`/`jev-engine.js` and applies the minimal edit). Builtin defs (`def.builtin`) must validate without stages (existing validator already accepts builtin-only defs).

### 3.6 Evolution v3 hooks (advisor applies; minimal surgical edits)

- `buildEvolution2(env, masterDeps, inj)` gains `inj.corpus` (optional): `{measure(matrixish), lens(matrixish)}`. The cycle's measure() record gains `{dbc, z, verdict, drift_vs_prev}` when `inj.corpus` is present; when absent, behavior is byte-identical to today (no crash, no fabrication — fields simply omitted).
- Cycle propose(): when `inj.corpus` exists, lens candidates are appended as directive proposals in lens format (`hypothesis + method + params + expected_delta + verdict placeholder`), kinds per §2 whitelist.
- No new auto-execution path. The existing fail-closed kinds logic is reused verbatim.

### 3.7 Console v4 — `jev-index.html` (KV) (Lane 5)

Keep: key gate (sessionStorage), tab shell, models pill, prompt console, Automations tab, dark terminal aesthetic (Space Grotesk + Inter, --accent #DB46F5, bg #0B1026).

Redesign (user-facing evolution sections must NOT show machine-readable dumps as the primary surface):

- **Evolution tab → human-readable**: cycle cards with a one-line "what happened" (LLM-drafted at render time from the run record? NO — deterministic: derive plain-language sentences client-side from structured fields, no extra API calls), directive list with plain-language titles, quality/confidence as labeled badges, approve/reject as keyboard-accessible buttons with focus states, candle + recall + dBc as labeled stat tiles (dash only when truly absent), and ALL raw JSON behind a collapsed `<details class="raw">` disclosure.
- **New Corpus tab**: audit form (paste JSON/CSV matrix, labels optional, nulls field), results as stat tiles (V2, z, verdict badge, dBc) + Parseval-share bar strip; lens candidates as cards (hypothesis, expected delta, real/control tag) with "Send as directive" buttons (approval-gated kinds clearly marked); atom plan table; selftest button with pass/fail per module; placements button that links the created map (`/map/?id=...`).
- **Accessibility**: WCAG 2.1 AA — keyboard navigation, aria-labels on icon-only controls, focus-visible styles, no color-only state (verdicts get text + color), meaningful empty/error/loading states, contrast >= 4.5:1.
- No new fonts, no purple-gradient AI look; reuse the existing token set.

## 4. Testing strategy

- Per lane: `node --test`, ALL green before return. Modules import NOTHING from other lanes; tests inject stubs matching this SPEC's contracts.
- **Fixture parity (load-bearing)**: lanes generate expected values by RUNNING the Python sources locally (python3, numpy not guaranteed — corpus-auditor is numpy-only, so parity fixtures come from `verify_claims.py` v2_corr/curveball which are numpy; if numpy is unavailable in the lane sandbox, use the paper-published numbers + hand-computed small matrices with the algorithm's own deterministic expected outputs documented). Every fixture records: source file, line refs, generation command.
- Parity tolerance: 1e-9 relative for eigenvalue shares/dBc; exact match for tautology verdicts on the discerner's documented test sentences.
- Advisor: full-lifecycle e2e with the in-memory driver (audit -> lens -> directive insert -> gate re-run -> auto-kind execute + approval-kind hold), plus one REAL live cycle after deploy.

## 5. Boundaries

- **Always**: pure math modules with selftests; fixture files with provenance; deterministic client-side rendering in console v4.
- **Ask-first**: worker deploy; KV `jev-index.html` upload (overwrites the live console); policy changes (NONE in this build).
- **Never**: weaken gate/fail-closed invariants; add an auto-execution kind; fabricate fixture numbers; weaken a test to make it pass; a second math implementation without a parity test; raw JSON as the primary user-facing evolution surface.

## 6. Success criteria

1. All lane suites green; advisor e2e green; total test count reported.
2. Live: `/api/jev/corpus/health` 200, `/selftest` 200 (all modules), `/audit` round-trip on a small matrix, `runs` records rows.
3. One real evolution cycle post-deploy with corpus metrics in its record (dbc/drift present).
4. Console v4 live at /jev/ with the redesigned Evolution tab + Corpus tab; raw JSON collapsed.
5. Builtin registrations accepted by the automation validator (deploy a builtin-only draft def via API and see validation pass, without activating).
6. SPEC + deployment skill pushed to yubi-OS/yubiOS (skills/ + refs/).

## 7. Deferred (with reasons)

- zernike-spectrum, phonon-dispersion, corpus-sonometer, injective-mapping export, nd-viewer/radar renderers: research instruments without an automation consumer; the lens/audit/atom/drift surfaces cover the RSI loop. Revisit when an automation stage wants them.
- HubSpot system-of-record learning, Daytona sandbox lane, reply-webhook ?k= mandatory, guide->decided re-decide gap: carried over from SPEC-AUTOMATIONS; separate concern.
- Embedding/vectorize changes: /api/map already does this.

## 8. Source paths (lanes: use THESE, fresh working copies only in session/)

- Python math (system of record): `papers/data/lean/verify_claims.py` (yubi-OS/yubiOS)
- `tools/{corpus-auditor,rsi-descent,spectral-decomposer,spectral-defocus,boltzmann-collapse,tautology-discerner}/` (yubi-OS/yubiOS)
- Drift core: `papers/scripts/curve-drift-detector.py` (yubi-OS/yubiOS)
- Deployed worker source (part name \t line format): fetched live from the steady-orbit worker at run time via the steady-orbit-deploy flow (write the bundle to `session/worker-bundle/parts.tab`)
- Build dir with prior SPECs: `yubi-OS/yubiOS/skills/jev-orchestrator/` (repo-truth; the space-local mirror under `documents/github-yubios-KS9n5GAT/jev-orchestrator/` is a working copy, not repo-truth)
- Current console HTML: fetch live from the steady-orbit worker at run time (write to `session/jev-index-current.html`)