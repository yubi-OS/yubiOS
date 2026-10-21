# SPEC: Google Research Quad Integration, Skill Workflow Parity & Universal `/jev/` Prompt Console Funnel (2026-10-21)

## 0. Non-Negotiable Invariants

1. **Deterministic Fail-Closed Gate (`jev-gate.js`):** Every mutating or outbound action proposed from the `/jev/` prompt console, workflows, or HarnessÂ² passes through `gateAction`. Probabilities, forecasts, harmonic spectra, and elastic-mesh relaxations are advisory measurements, never authorization.
2. **Bearer Auth (`requireOperatorAuth` / `authorized`):** Every new `/api/jev/*` route enforces the operator Bearer token (`JEV_API_KEY`) and returns `401 UNAUTHORIZED` when missing or invalid.
3. **Zero External Dependencies in Worker Modules:** All new worker modules (`jev-sofima.js`, `jev-dream-rsi.js`, `jev-spherical-cnn.js`, `jev-harness2.js`, `jev-workflows.js`, `jev-console-funnel.js`) are pure ES modules (`application/javascript+module`), deterministic under seeded PRNG (`mulberry32`), with self-contained `/selftest` endpoints.
4. **No Source in the Public Repo (`RULES.md`):** `yubi-OS/yubiOS` receives ONLY markdown specs, `refs/` docs, `docs/ENDPOINTS.md`, `tools/point-map/AGENT.md`, and `skills/*/SKILL.md` updates. Deployed worker JS modules live in the Cloudflare Worker bundle only.
5. **Preserve Existing 67 Worker Parts & 15 Bindings:** `solar-rbs-entry.mjs`, all 15 bindings (including `keep_bindings: ["secret_text"]` for `AE_SQL_TOKEN`), `cpu_ms: 300000`, and both cron triggers (`0 * * * *`, `*/5 * * * *`) remain intact.

---

## 1. Lane A â `jev-sofima.js` (SOFIMA Elastic Coordinate Maps & Fold-Free Spring Mesh)

Grounded in `google-research/sofima` (`map_utils.py`, `flow_field.py`, `mesh.py`, `stitch_elastic.py`, Zenodo `10.5281/zenodo.10534541`).

### 1.1 Mathematical & Export Contract (`jev-sofima.js`)
- `SOFIMA_VERSION = "sofima-v1.0.0"`
- **Coordinate Maps (`map_utils.py` parity):**
  - Grid of shape `[2, H, W]` storing relative offsets $(\Delta x, \Delta y)$ at stride $(s_x, s_y)$ where absolute coordinate is $(x \cdot s_x + \Delta x, y \cdot s_y + \Delta y)$; `NaN` or `null` marks invalid cells.
  - `toAbsoluteMap(relMap, stride)` and `toRelativeMap(absMap, stride)`
  - `composeMaps(mapA, strideA, mapB, strideB)`: bilinear interpolation composition satisfying `warp(img, composeMaps(a, b)) == warp(warp(img, b), a)`.
  - `invertMap(relMap, stride, opts)`: iterative fixed-point inversion of a fold-free relative coordinate map.
- **Masked Phase Cross-Correlation (`flow_field.py` parity):**
  - `maskedXcorr2D(patchA, patchB, maskA, maskB)`: 2D radix-2 FFT cross-correlation normalized by overlap mask area (Padfield 2012) returning `{dx, dy, peak1, peak2, peak_ratio, snr}`.
  - `estimateFlowField(imgA, imgB, {patchSize, stride, minPeakRatio, minSnr})`: strided patch flow estimator returning a `[2, Hm, Wm]` relative-offset coordinate map with `null`/`NaN` for low-confidence cells.
- **Fold-Preventing Hookean Spring Mesh + FIRE Solver (`mesh.py` parity):**
  - `inplaneForce(x, k, stride, preferOrigOrder = true)`: computes nearest-neighbor ($-$, $|$, rest length $l_0$, stiffness $k$) and diagonal next-nearest-neighbor ($\backslash$, $/$, rest length $l_0\sqrt{2}$, stiffness $k_2 = k/\sqrt{2}$) Hookean forces. When `preferOrigOrder = true`, applies SOFIMA's directional sign factor $\text{sign}(\Delta x_d)$ to eliminate the inverted node-order minimum $m_2$ and prevent mesh folds/caustics.
  - `relaxElasticMesh(initMap, targetMap, config)`: integrates internal `inplaneForce` + attachment spring force $F_{\text{attach}} = -k_0 (x - q)$ using **FIRE (Fast Inertial Relaxation Engine)** (`dt`, `gamma`, `k0`, `k`, `stride`, `maxIters`, `stopVMax`, `fAlpha=0.99`, `fInc=1.1`, `fDec=0.5`, `alpha=0.1`, `nMin=5`). Returns `{mesh, energy_initial, energy_final, energy_ratio, max_velocity, iters, converged, fold_free, jacobian_min}`.
- **Routes (delegated from `jev-corpus-routes.js` under `/api/jev/corpus/sofima/*` and `/api/jev/corpus/lens/elastic`):**
  - `POST /api/jev/corpus/sofima/flow`: `{grid_a, grid_b, patch_size?, stride?}` -> flow map + peak stats + run row (`kind: "sofima-flow"`).
  - `POST /api/jev/corpus/sofima/relax`: `{target_map, init_map?, k?, k0?, stride?, prefer_orig_order?, max_iters?}` -> relaxed fold-free mesh + Jacobian min + energy reduction + run row (`kind: "sofima-relax"`).
  - `POST /api/jev/corpus/sofima/compose`: `{map_a, map_b, stride?, invert?}` -> composed (and optionally inverted) relative map (`kind: "sofima-compose"`).
  - `GET /api/jev/corpus/sofima/selftest`: 8 deterministic gates (G1 relative<->absolute identity, G2 composition identity & inverse roundtrip, G3 maskedXcorr known-shift recovery, G4 Hookean equilibrium zero-force, G5 `prefer_orig_order` fold prevention under extreme crossing force, G6 FIRE monotone energy reduction $E_{\text{final}} < 0.05 E_{\text{init}}$, G7 Jacobian positivity $\det J > 0$ on relaxed mesh, G8 determinism).

---

## 2. Lane B â `jev-dream-rsi.js` (DREAM-RSI Replay Worlds, Pareto $\rho$-Sweep & Direction Diversity)

Grounded in `google-research/dream-rsi` (`trace_env.py`, `learning/heuristic_search/eval.py`, `learning/directions/metrics.py`, `policy/baseline.py`, `arXiv:2609.14858`).

### 2.1 Mathematical & Export Contract (`jev-dream-rsi.js`)
- `DREAM_RSI_VERSION = "dream-rsi-v1.0.0"`
- `DEFAULT_RHO_GRID = Object.freeze([0.0, 0.25, 0.5, 0.75, 1.0])`
- `DEFAULT_PARALLELISM_PENALTY = 0.05`
- `DEFAULT_MAX_WORKERS = 10`
- **`TraceEnv` Discovery Tree Simulator (`trace_env.py` parity):**
  - Represents a discovery tree $\mathcal{T}$ of root and refinement nodes `{id, branch, attempt, seq, parent_id, score, evaluated, mechanism, primary_mechanism, actual_direction_id}`.
  - `createTraceEnv(trace, {maxWorkers, gridPlan})`: exposes `reset()`, `legalActions()`, `meta(cellId)`, `probe(cellId)`, `probeBatch(cellIds)`, `budgetSpent()`, `bestScore()`, `executionTrace()`. In replay mode, `probe` reveals only recorded nodes in $\mathcal{T}$ and never invents outcomes outside $\mathcal{T}$.
- **Builtin Exploration Policies (`policy/baseline.py` + adaptive policies):**
  - `parallel_refine`: wave-parallel exploration across branches `0..max_width-1` then refinement depths `1..max_refine`.
  - `ucb_greedy`: branch-level upper-confidence / best-first refinement allocation parameterized by budget preference $\rho \in [0, 1]$.
  - `thompson_prune`: early-pruning of sub-baseline branches after attempt 0, allocating remaining budget to top-scoring roots.
- **Exact Eq. 1 Replay Objective (`learning/heuristic_search/eval.py` parity):**
  - `evaluatePolicyOnTrace(policySpec, trace, {rhoGrid, lambda, maxWorkers})`:
    - For each $\rho \in \mathcal{R}$, runs the policy with budget $B(\rho) = \max(1, \lceil \rho \cdot B_i \rceil)$ where $B_i = |\mathcal{T}_i|_{\text{eval}}$.
    - Computes attainment $a_{i,\rho}^m = \text{clip}((s_{i,\rho}^m - s_{\text{base}}) / \max(\epsilon, S_i - s_{\text{base}}), 0, 1)$ (and raw $s_{i,\rho}^m / S_i$ when $s_{\text{base}} = 0$).
    - Extracts the non-dominated Pareto frontier $(\bar{n}_{i,j}^m, \bar{a}_{i,j}^m)$ ordered by budget spent and computes:
      $$V_i^m = \frac{1}{B_i}\sum_{j=1}^{L_i^m}(\bar{a}_{i,j}^m - \bar{a}_{i,j-1}^m)(B_i - \bar{n}_{i,j}^m) - \lambda \frac{1}{|\mathcal{R}|}\sum_{\substack{\rho \in \mathcal{R}\\ n_{i,\rho}^m > 0}} \frac{k_{i,\rho}^{m,\star}}{n_{i,\rho}^m}$$
      where $k_{i,\rho}^{m,\star} = \sum_r \lceil |C_r| / W \rceil$ is worker-capped effective sequential rounds.
  - `evaluatePolicyPool(candidatePolicies, tracePool, opts)`: evaluates multiple policies (always including incumbent $\pi_0$) across a pool of traces and checks the **replay-set monotonicity invariant** $V(\pi^\star) \ge V(\pi_0)$.
- **Root-Direction Diversity (`learning/directions/metrics.py` parity):**
  - `computeDirectionMetrics(extractions, cycle)`: computes `{cycle, n_roots, actual: {count, unique, duplicates, duplicate_rate}}` over `attempt == 0` nodes.
- **Routes (delegated from `routes-jev.js` / `jev-evolution2-routes.js` under `/api/jev/evolution/dream/*`):**
  - `POST /api/jev/evolution/dream/replay`: `{traces?, policy?, candidate_policies?, rho_grid?, lambda?, max_workers?, from_d1?}` (when `from_d1: true` and no `traces` passed, builds a discovery tree from stored `outcomes` + `jev_evolution_atoms` + `jev_corpus_runs`).
  - `POST /api/jev/evolution/dream/directions`: `{extractions, cycle?}` -> root-direction diversity metrics.
  - `POST /api/jev/evolution/dream/promote-check`: `{incumbent_policy, candidate_policy, traces}` -> `{monotonic, v_incumbent, v_candidate, delta_v, recommendation}`.
  - `GET /api/jev/evolution/dream/selftest`: 8 deterministic gates (G1 TraceEnv no-invention invariant, G2 ParallelRefine wave order, G3 Pareto frontier non-dominance, G4 Eq. 1 hypervolume AUC bounds $\in [- \lambda, 1]$, G5 parallelism penalty monotonicity in $k^\star$, G6 incumbent inclusion guarantees $\max_m V(\pi^m) \ge V(\pi^0)$, G7 root-direction duplicate rate exactness, G8 determinism).

---

## 3. Lane C â `jev-spherical-cnn.js` (Spin-Weighted Spherical Harmonics, Exact H&W Quadrature & Spectral Pooling)

Grounded in `google-research/spherical-cnn` (`sphere_utils.py`, `np_spin_spherical_harmonics.py`, `layers.py`, `arXiv:1711.06721`, `arXiv:2006.10731`, `arXiv:2306.05420`).

### 3.1 Mathematical & Export Contract (`jev-spherical-cnn.js`)
- `SPHERICAL_CNN_VERSION = "spherical-cnn-v1.0.0"`
- **Equiangular Grid & Torus-Extended Quadrature (`sphere_utils.py` parity):**
  - `makeEquiangularGrid(resolution)`: returns `{longitude, colatitude}` of shape `[resolution, resolution]` with $\phi_j = 2\pi j / n$ and $\theta_i = \pi i / (n - 1)$ including both poles.
  - `torusQuadratureWeights(resolution)`: exact Huffenberger & Wandelt (H&W) $2(n-1)$ Fourier quadrature weights via analytic even-frequency spectrum $w_k = 2/(1-k^2)$ and $w_{\pm 1} = \mp i\pi/2$ followed by inverse FFT.
  - `sphereQuadratureWeights(resolution)`: normalized per-cell latitude quadrature weights summing to $4\pi$ over the $(n \times n)$ grid.
  - `spinSphericalMean(grid, resolution)`: exact H&W quadrature integral mean over $S^2$.
- **Wigner $\Delta^\ell_{m,n}$ & Spin-Weighted SHT (`np_spin_spherical_harmonics.py` parity):**
  - `computeWignerDelta(ell)`: $(2\ell+1)\times(2\ell+1)$ Wigner $d^\ell_{m,n}(\pi/2)$ matrix computed via stable Risbo / Trapani-Navaza recursion, satisfying symmetry $\Delta^\ell_{-m,-n} = (-1)^{m+n}\Delta^\ell_{m,n}$ and orthogonality $\sum_n \Delta^\ell_{n,m}\Delta^\ell_{n,m'} = \delta_{m,m'}$.
  - `swsftForward(sphereGrid, spin, ellMax?)`: forward Spin-Weighted Spherical Fourier Transform returning $(\ell_{\max}+1)^2$ complex coefficients $[a_\ell^m]_{\text{re}, \text{im}}$ at index $\ell^2 + m + \ell$ (zero for $\ell < |s|$), plus per-degree energy spectrum $E_\ell(s) = \sum_{m=-\ell}^\ell |{}_s\hat{f}_\ell^m|^2$.
  - `swsftBackward(coeffs, spin, resolution)`: backward SWSFT reconstructing the $(n \times n)$ complex spatial field on the H&W equiangular grid via $G_{nm}$.
- **Spin-Weighted Spectral Convolution & Pooling (`layers.py` parity):**
  - `spinSphericalConv(coeffsIn, filterCoeffs, {spinsIn, spinsOut, spectralPooling, spectralUpsampling})`: computes ${}_s\widehat{(F * K)}_\ell^m = \sum_{i \in W_F} {}_i\hat{f}_\ell^m \, {}_s\hat{k}_\ell^i$ with optional spectral pooling ($\ell_{\max}' = \lfloor(\ell_{\max}+1)/2\rfloor - 1$) and spectral upsampling (zero-padding in harmonic space).
  - `projectPointsToEquiangular(pointsS2, values, resolution, sigma)`: projects scattered $S^2$ points/vectors (from `/api/jev/map` or corpus placements) onto the H&W equiangular grid for spin-$s$ spectral analysis.
- **Routes (delegated from `jev-corpus-routes.js` under `/api/jev/corpus/spherical/*`):**
  - `POST /api/jev/corpus/spherical/quadrature`: `{resolution, grid?}` -> H&W torus + sphere quadrature weights, sum check ($4\pi$), and spherical mean.
  - `POST /api/jev/corpus/spherical/swsft`: `{grid?, points?, values?, resolution?, spin?, inverse_coeffs?}` -> SWSFT coefficients, per-degree spin power spectrum $E_\ell(s)$, Parseval energy ratio, and optional backward reconstruction (`kind: "spherical-swsft"`).
  - `POST /api/jev/corpus/spherical/convolve`: `{coeffs_in, filter_coeffs, spins_in?, spins_out?, spectral_pooling?, spectral_upsampling?}` -> convolved/pooled spectral coefficients (`kind: "spherical-conv"`).
  - `POST /api/jev/corpus/spherical/pool`: `{coeffs_in, ell_max?}` -> bandlimit-truncated coefficients at $\ell_{\max}' = \lfloor(\ell_{\max}+1)/2\rfloor - 1$.
  - `GET /api/jev/corpus/spherical/selftest`: 8 deterministic gates (G1 sphere quadrature weights sum to $4\pi \pm 10^{-12}$, G2 constant-1 function integrates to $4\pi$, G3 Wigner $\Delta^\ell$ orthogonality & symmetry for $\ell=0..6$, G4 $s=0$ SWSFT of $Y_0^0, Y_1^0, Y_2^1$ single-mode purity, G5 $s=\pm 1$ spin-weight vanishes for $\ell < |s|$, G6 forward->backward SWSFT roundtrip error $< 10^{-9}$ on bandlimited fields, G7 spectral pooling degree reduction $\ell_{\max} \to \lfloor(\ell_{\max}+1)/2\rfloor - 1$, G8 Parseval energy conservation).

---

## 4. Lane D â `jev-harness2.js` (HarnessÂ² Contrastive ProposeâProbeâCompose, $R=4k/P=3k$ Ledger & Experience Library)

Grounded in `google-research/harness2` (`core/{spec.py,proposer.py,recursion.py,selection.py,ledger.py,library.py,tree.py}`, `arXiv:2610.14224`).

### 4.1 Mathematical & Export Contract (`jev-harness2.js`)
- `HARNESS2_VERSION = "harness2-v1.0.0"`
- `HARNESS_COMPONENTS = Object.freeze(["system_prompt", "guardrails", "memory", "tool_guidance", "subagents", "skills", "scripts", "plugins"])`
- **Surface & Tree Validator (`tree.py` parity):**
  - `validateHarnessTree(tree)`: validates an 8-component harness map $\mathcal{H}$, computes component hashes, always-on token/byte budget, and autotrigger skill/subagent inventory.
- **Budget Accounting Ledger (`ledger.py` parity):**
  - `expectedRollouts(k)` $= 4k$ ($k$ base $+ 2k$ candidates $+ k$ finals)
  - `expectedSessions(k)` $= 3k$ ($k$ INV $+ k$ DOM $+ k$ compositions)
  - `verifyLedgerIdentity(ledger)`: enforces `R == 4*k`, `P == 3*k`, and zero duplicate rollout or session labels (checking duplicates BEFORE counts, exactly as `Ledger.assert_identity()` in `ledger.py` does).
- **Seeded Anonymized Selection Pool (`selection.py` parity):**
  - `anonId(index)`: `0 -> "A"`, `25 -> "Z"`, `26 -> "AA"`, etc.
  - `assignIds(labels, {taskId, k, mode})`: canonical sort of candidate labels followed by a deterministic shuffle seeded from the first 48 bits of $\text{SHA-1}(\text{taskId} \| k \| \text{mode})$ (or SHA-256 prefix), returning `{id_map, reverse_map}` so the selector never sees whether a candidate is `base`, `inv`, `dom`, or `composed`.
  - `orderGradedFirst(items, gradedFn)`: stable partition placing valid/graded deliverables ahead of incomplete ones without discarding any item.
- **Task-Level Contrastive ProposeâProbeâCompose (`recursion.py` parity):**
  - `runProposeProbeCompose({taskId, domain, k, mode, baseHarness, baseRollouts, invCandidates, domCandidates, composedCandidates, clefDecide})`:
    - Validates/constructs the $k$-step parallel (`agg`) or sequential (`seq`) recursion trace.
    - Enforces the `Ledger` $R=4k, P=3k$ identity.
    - Anonymizes the selection pool (`base` + `finals`) via `assignIds` and scores/selects the winning anonymized candidate via Clef contrastive comparison (`clefDecide` when provided, deterministic behavioral-contrast rubric fallback when offline).
- **Harnessing-Level Experience Reflector & Library (`library.py` parity):**
  - `hasExperience(exp)`: returns `true` iff `exp` is an object with non-empty string fields `cue`, `lesson`, and `evidence` (refuses unsupported speculation!).
  - D1 tables (`ensureHarness2Schema`):
    - `jev_harness_runs (id TEXT PRIMARY KEY, created_at TEXT, task_id TEXT, domain TEXT, mode TEXT, k INTEGER, chosen_label TEXT, chosen_is_base INTEGER, ledger_json TEXT, result_json TEXT, policy_version INTEGER)`
    - `jev_harness_library (id TEXT PRIMARY KEY, created_at TEXT, domain TEXT, task_slug TEXT, mode TEXT, k INTEGER, cue TEXT, lesson TEXT, evidence TEXT, harness_json TEXT, run_id TEXT)`
- **Routes (delegated from `routes-jev.js` under `/api/jev/harness/*`):**
  - `POST /api/jev/harness/propose-probe-compose`: executes/records a ProposeâProbeâCompose cycle, verifies the $R=4k, P=3k$ ledger, runs anonymized selection, and persists to `jev_harness_runs`.
  - `POST /api/jev/harness/reflect`: validates `{domain, task_id, mode, k, experience: {cue, lesson, evidence}, harness_tree, run_id?}` via `hasExperience` + `validateHarnessTree` and stores the entry in `jev_harness_library` (returning `422 INVALID_EXPERIENCE` if any of `cue/lesson/evidence` is missing).
  - `GET /api/jev/harness/library`: `?domain=<d>&mode=<m>&limit=<n>` -> lists retained domain experience entries and their 8-component inventories.
  - `POST /api/jev/harness/ledger-check`: `{k, mode, task_id, entries}` -> validates $R=4k, P=3k$ and duplicate-label invariants.
  - `GET /api/jev/harness/selftest`: 8 deterministic gates (G1 8-component tree validation, G2 $R=4k, P=3k$ ledger pass, G3 duplicate-label rejection even when counts equal $4k/3k$, G4 `anonId` `A..Z, AA..AZ` bijection, G5 `assignIds` determinism & base-hiding, G6 `hasExperience` rejects missing `cue`/`lesson`/`evidence`, G7 parallel & sequential ProposeâProbeâCompose end-to-end, G8 D1/memory library roundtrip).

---

## 5. Lane E â Skill Workflow Engine (`jev-workflows.js`), Functional Review Fixes & Universal Prompt Console Funnel (`jev-console-funnel.js`)

### 5.1 Embedded Skill Workflows (`jev-workflows.js`, mounted at `/api/jev/workflows/*`)
1. `POST /api/jev/workflows/unit-round`: embeds `jev-corpus-unit-round` â runs frozen baseline audit (`nulls: 400` or caller `nulls`), lens candidate generation (with `skip` list), optional candidate row hysteresis re-score, `level_dbc` bearing calculation, and visco `snapback` check in one atomic call.
2. `POST /api/jev/workflows/wayfinder-cycle`: embeds `curve-compass-skill` / `single-action-curve-rsi` / `hyperspherical-harmonic-curve` â runs point-map / single-action geodesic flip evaluation + spin-weighted spherical spectrum (`jev-spherical-cnn.js`) + SOFIMA elastic mesh relaxation preview (`jev-sofima.js`).
3. `POST /api/jev/workflows/mint-preflight`: embeds `knowledge-corpus-mint` / `refs-refresh-sweep` â runs Phase 0 searXNG + Clef health check, scores an outline of subtopics via Clef `score`, and weights candidate dig results via Clef `noul`.
4. `POST /api/jev/workflows/self-archaeology`: embeds `self-archaeology` / `curve-guided-rsi-self` â scores a document/self-corpus across the 12 NSS axes, runs DREAM-RSI direction diversity (`jev-dream-rsi.js`) and HarnessÂ² experience reflection (`jev-harness2.js`), and emits evolution sweep proposals.
5. `GET /api/jev/workflows/catalog` & `GET /api/jev/workflows/selftest`.

### 5.2 S5 Functional Review Fixes
1. **Selftest coverage for `jev-switches.js` and `jev-history.js` + `jev-history-restore.js` + `reindex-memory.js`:** added to `jev-selftest.js` and `jev-selftest-evolution.js` (closes Coverage Map D3 gap: 100% of worker parts covered by tests).
2. **Route wiring for `POST /api/jev/history/restore` and `POST /api/jev/evolution/memory/reindex`:** wires the pure modules `jev-history-restore.js` and `reindex-memory.js` into `routes-jev.js` and `jev-evolution2-routes.js` behind the operator bearer gate.
3. **`cycle_replay` active in `jev-selftest-evolution.js`:** uses the memory driver + `jev-dream-rsi.js` `TraceEnv` replay check so `cycle_replay` runs and passes with zero disclosed skips.

### 5.3 Universal `/jev/` Prompt Console Funnel (`jev-console-funnel.js` + `jev-decide.js` + `jev-execute.js` + `jev-index.html`)
- **`GET /api/jev/console/catalog`**: returns the complete, structured catalog of every controllable surface on `/jev/` grouped into 6 categories:
  1. `orchestrator` (tasks, approvals, pause, switches, history backup/clear/restore, policy, workspaces, learnings)
  2. `automations` (list, create, activate, pause, run lead-research / release-check, models)
  3. `evolution` (cycles, run cycle, sweep, directives approve/reject/cancel, atoms, candles, queue, memory search/log/reindex, DREAM-RSI replay/directions/promote-check)
  4. `corpus_and_math` (audit, lens, atom, classify, placements, scorer, taste, edge-standard, visco persistence/hysteresis/prony/mobility/snapback, spectral walk/series/oracle, lens correct, SOFIMA flow/relax/compose, Spherical-CNN quadrature/swsft/convolve/pool)
  5. `harness_and_workflows` (HarnessÂ² propose-probe-compose/reflect/library/ledger-check, workflows unit-round/wayfinder-cycle/mint-preflight/self-archaeology)
  6. `map_and_timeseries` (point-map create/preview/control/consistency/azimuth/rayleigh/admission/axis-redundancy/outcomes, SOS assess/fits/narrate, timeseries series/export, forecast ETS + 3-stage Clairic-TimesFM-Clef cascade)
- **`POST /api/jev/console/dispatch`** AND **`POST /api/jev/tasks` (`payload.prompt` / `payload.console_command`)**:
  - Supports explicit slash commands (`/sofima.relax`, `/dream.replay`, `/spherical.swsft`, `/harness.ppc`, `/harness.reflect`, `/workflow.unit-round`, `/workflow.wayfinder`, `/workflow.mint-preflight`, `/workflow.self-archaeology`, `/evolution.run`, `/automation.run`, `/corpus.audit`, `/forecast.cascade`, etc.), structured `{target, args}` objects (`payload.console_command`), AND natural-language prompts via expanded `NAME_ALIASES`, `TOOL_TEMPLATES`, and `route.dispatch` `endpoint_map`!
  - All read-only/diagnostic targets execute in-process and record a full audit trail on the task; all mutating/external targets pass through the deterministic policy gate (`jev-gate.js`) so risky operations still require approval or follow policy v25 rules.
- **Frontend `/jev/` Console (`jev-index.html`):**
  - Enhances `#prompt-console` with an interactive **Universal Command & Workflow Funnel Bar**: category picker, target/endpoint selector, one-click template prefill, JSON/arg editor toggle, and live structured result viewer â so the operator can drive ANY endpoint, workflow, automation, or evolution directly from `#prompt-console`.
  - Adds interactive cards/panels in the diagnostics view for **SOFIMA Elastic Mesh**, **DREAM-RSI Replay Worlds**, **Spherical-CNN Spin Harmonics**, **HarnessÂ² ProposeâProbeâCompose**, and **Skill Workflows**.
