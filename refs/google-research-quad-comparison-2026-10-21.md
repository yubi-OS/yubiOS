# Google Research Quad Comparative Analysis & Codebase Slot-In Map (2026-10-21)

## 1. Executive Summary &Provenance

This document records the deep-research comparison of four Google Research repositories and their accompanying academic papers against the `steady-orbit` Cloudflare Worker (`solar-rbs-entry.mjs`, `index.js`, and 65 `jev-*` modules = 67 parts), `docs/ENDPOINTS.md`, `tools/point-map/AGENT.md`, `documents/github-yubios-KS9n5GAT/steady-orbit-coverage-map.md`, and the `yubi-OS/yubiOS` skill corpus:

1. **`google-research/sofima`** â *SOFIMA: Scalable Optical Flow-based Image Montaging and Alignment* (Januszewski, Blakely, Lueckmann 2024, Zenodo `doi:10.5281/zenodo.10534541`, Apache-2.0, 46 files).
2. **`google-research/dream-rsi`** â *DREAM-RSI: Recursive Self-Improvement Through Evolving Worlds* (`arXiv:2609.14858`, Apache-2.0, 109 files).
3. **`google-research/spherical-cnn`** â *Scaling Spherical CNNs* (`arXiv:2306.05420`, ICML 2023), *Spin-Weighted Spherical CNNs* (`arXiv:2006.10731`, NeurIPS 2020), *Learning SO(3) Equivariant Representations with Spherical CNNs* (`arXiv:1711.06721`, ECCV 2018) by Esteves et al. (Apache-2.0, 56 files).
4. **`google-research/harness2`** â *HarnessÂ²: Recursive Agent Harnessing for an Open World* (`arXiv:2610.14224`, Apache-2.0, 114 files).

### Preflight, SearXNG Dig & Clef QC Summary
- **External-content security sweep:** All four tarballs were inspected prior to extraction (`0` symlink/traversal entries skipped) and scanned for prompt-injection and supply-chain patterns (`session/gr-repos/security-sweep.json`). Zero adversarial prompt-injection payloads or unsafe deserialization calls exist in any of the four repositories.
- **SearXNG + Clef `/api/decide` scoring:** 8 targeted queries across the n8n `searxng-proxy` webhook yielded 64 top results (`session/gr-research/searxng_clef_scored.json`), all scored via `POST https://steady-orbit.systems-a.workers.dev/api/decide` (`model: clef`), with 38/64 passing the Clef threshold ($\ge 0.55$).
- **Clef architectural fit probabilities (`session/gr-research/ideate_solo_clef.json`):**
  - `sofima_fit`: `0.9569`
  - `dream_rsi_fit`: `0.9620`
  - `spherical_cnn_fit`: `0.9023`
  - `harness2_fit`: `0.9209`
  - `winner_choice`: `V6` (`p = 0.9804`, score `2.8139 / 3.0`)

---

## 2. Side-by-Side Comparison Against the Steady-Orbit Codebase

| Dimension | Google Research Source & Math | Steady-Orbit Current Surface | Exact Gap in Our Codebase | Where It Slots In (New Module + Routes) |
| --- | --- | --- | --- | --- |
| **1. Elastic Coordinate Maps & Non-Rigid Alignment (`sofima`)** | `map_utils.py`, `flow_field.py`, `mesh.py`, `stitch_elastic.py`: relative-offset coordinate maps $M(x,y)=(\Delta x,\Delta y)$ with $T(x,y)=(x\cdot s_x + \Delta x, y\cdot s_y + \Delta y)$, composition `comp(a,b)` and inversion; masked FFT cross-correlation (`masked_xcorr`, Padfield 2012) with peak sharpness ratio $p_1/p_2$; Hookean spring mesh (`inplane_force`, $k_2=k/\sqrt{2}$) with **fold-preventing** vector factor (`prefer_orig_order=True`) and **FIRE** inertial relaxation (`IntegrationConfig`). | `jev-lens-math.js` (`lens-standard-v1`: 3 global scalar aberrations â astig, spherical, trefoil; injectivity $\det J \ge 1$), `jev-visco-math.js` (Prony relaxation, hysteresis, snapback), and `tools/lens-standard/arrangement_warp.py`. | `jev-lens-math.js` only models 3 global parametric warps and cannot relax local non-rigid deformations or stitch/align 2D grids without mesh folding (cf. Zernike Slot-2 F4 caustics finding: 14/14 structural collapse on folds). | **`jev-sofima.js`** mounted under `/api/jev/corpus/sofima/{flow,relax,compose,selftest}` and wired into `jev-corpus-routes.js` + `/api/jev/corpus/lens/elastic`. |
| **2. Replay Worlds & Pareto Policy Evolution (`dream-rsi`)** | `trace_env.py`, `learning/heuristic_search/eval.py`, `learning/directions/metrics.py`: `TraceEnv` unified discovery-tree (`BRANCHES` $\times$ `REFINE+1`) replay/live simulator; $\rho \in \{0, 0.25, 0.5, 0.75, 1.0\}$ budget sweep scored by Eq. 1 Pareto hypervolume AUC minus $\lambda$ sequential-round penalty: $$V_i^m = \frac{1}{B_i}\sum_{j=1}^{L_i^m}(\bar{a}_{i,j}^m - \bar{a}_{i,j-1}^m)(B_i - \bar{n}_{i,j}^m) - \frac{\lambda}{|\mathcal{R}|}\sum_{\rho}\frac{k_{i,\rho}^{m,\star}}{n_{i,\rho}^m}$$; replay-set monotonicity $V(\pi_{t+1}) \ge V(\pi_t)$; root-direction diversity (`duplicate_rate`). | `jev-evolution2-routes.js`, `jev-cycle.js`, `jev-atoms.js` (single-action atoms, $\Delta \ge 0$), `jev-selftest-evolution.js` (`cycle_replay` marked as a disclosed skip), and `jev-corpus-unit-round`. | We lack a deterministic **Replay World Simulator** over stored RSI/evolution trees, a multi-budget Pareto $\rho$-sweep evaluator for exploration policies, and a root-direction diversity metric; `cycle_replay` in `jev-selftest-evolution.js` has been a disclosed skip. | **`jev-dream-rsi.js`** mounted under `/api/jev/evolution/dream/{replay,directions,promote-check,selftest}`, wired into `jev-evolution2-routes.js` and `jev-selftest-evolution.js` (closing the `cycle_replay` skip). |
| **3. Spin-Weighted Spherical Harmonics & Exact Quadrature (`spherical-cnn`)** | `sphere_utils.py`, `np_spin_spherical_harmonics.py`, `layers.py`: Huffenberger & Wandelt equiangular grid (`make_equiangular_grid`), exact torus-extended quadrature weights (`torus_quadrature_weights`, `sphere_quadrature_weights`, `spin_spherical_mean` summing to $4\pi$), Wigner $\Delta^\ell_{m,n} = d^\ell_{m,n}(\pi/2)$, forward/backward Spin-Weighted Spherical Harmonics Transform (`swsft_forward`, `swsft_backward`, spin $s \in \mathbb{Z}$), spin-weighted spectral convolution ${}_s\widehat{(F*K)}_\ell^m = \sum_i {}_i\hat{f}_\ell^m {}_s\hat{k}_\ell^i$, and spectral pooling ($\ell_{\max}' = \lfloor(\ell_{\max}+1)/2\rfloor - 1$). | `jev-corpus-math.js` (`shBasis` scalar $s=0$, $\ell \le 3$ ridge fit on scattered points; `v2_corr`, `curveball`), `jev-spectral-math.js` (graph/walk $d_w, d_s$), and `index.js` point-map (`S^2` stereographic lift + compass Metropolis). | Scalar $s=0$ ridge regression cannot represent directional/vector fields on $S^2$ (spin $s=\pm 1, \pm 2$ such as compass Metropolis step vectors or NSS directional flows), lacks exact H&W torus quadrature satisfying Parseval on $S^2$, and lacks equivariant spectral pooling/convolution. | **`jev-spherical-cnn.js`** mounted under `/api/jev/corpus/spherical/{quadrature,swsft,convolve,pool,selftest}` and wired into `jev-corpus-routes.js`. |
| **4. Contrastive Propose-Probe-Compose & Experience Library (`harness2`)** | `core/{spec.py,proposer.py,recursion.py,selection.py,ledger.py,library.py,tree.py}`: 8 editable harness components (`system_prompt`, `guardrails`, `memory`, `tool_guidance`, `subagents`, `skills`, `scripts`, `plugins`); task-level contrastive **ProposeâProbeâCompose** (`k` base + `k` INV + `k` DOM + `k` composed finals); SHA-1 seeded anonymized `A..Z` selection (`assign_ids`); strict `Ledger` budget identity $R=4k, P=3k$ with zero duplicate labels; **Experience Reflector** requiring `{cue, lesson, evidence}` (`has_experience`) in a domain-scoped library. | `jev-orchestrator` (`routes-jev.js`, `jev-decide.js`, `jev-gate.js`, `jev-improve.js` learnings) and `jev-evolution` / `jev-memory.js`. | Learnings in `jev_learnings` do not enforce the contrastive ProposeâProbeâCompose structure (INV vs DOM split, anonymized `A..Z` selection, $R=4k / P=3k$ budget ledger identity, or the mandatory `{cue, lesson, evidence}` triple before promoting reusable experience into a domain library). | **`jev-harness2.js`** mounted under `/api/jev/harness/{propose-probe-compose,reflect,library,ledger-check,selftest}` and wired into `routes-jev.js` + `jev-evolution2-routes.js`. |

---

## 3. Capability Map: Full System & Skill Parity Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                /jev/ OPS CONSOLE (jev-index.html)                                 |
|  [Universal Prompt Console Funnel: Natural Language + /command Palette + Target/Param Builder]    |
|  [Cards: Approvals | Tasks | Allowlist | Sweep | Learnings | Automations | Evolution | Corpus |   |
|          Scorer | Taste | Router | Spectral | Forecast | Visco | Map | SOFIMA | DREAM-RSI |       |
|          Spherical-CNN | Harness2 | Workflows]                                                    |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                         PROMPT CONSOLE FUNNEL & ROUTER (jev-console-funnel.js)                    |
|  - GET  /api/jev/console/catalog    (complete registry of all endpoints, workflows, automations)  |
|  - POST /api/jev/console/dispatch   (parses slash/command or prompt -> gated task or read-only)   |
|  -POST  /api/jev/tasks {payload:{prompt, console_command?}} -> decideActionsFromPrompt            |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
        +-----------------------------------------+-----------------------------------------+
        |                                         |                                         |
        v                                         v                                         v
+-------------------------------+   +-----------------------------------+   +-------------------------------+
| 4 GOOGLE RESEARCH PILLARS     |   | SKILL WORKFLOW ENGINE             |   | EXISTING CORE & S5 FIXES      |
| - jev-sofima.js               |   | (jev-workflows.js)                |   | - jev-switches.js (+tests)    |
|   /api/jev/corpus/sofima/*    |   | - /api/jev/workflows/unit-round   |   | - jev-history.js (+tests)     |
| - jev-dream-rsi.js            |   | - /api/jev/workflows/wayfinder    |   | - /api/jev/history/restore    |
|   /api/jev/evolution/dream/*  |   | - /api/jev/workflows/mint-preflight|  | - /api/jev/evolution/memory/  |
| - jev-spherical-cnn.js        |   | - /api/jev/workflows/self-arch    |   |   reindex                     |
|   /api/jev/corpus/spherical/* |   | - /api/jev/workflows/catalog      |   | - cycle_replay active via     |
| - jev-harness2.js             |   | - /api/jev/workflows/selftest     |   |   TraceEnv simulator          |
|   /api/jev/harness/*          |   +-----------------------------------+   +-------------------------------+
+-------------------------------+
```

## 4. Skill-to-API Parity & Retrofit Matrix

| Skill in `yubi-OS/yubiOS/skills/` | Current Skill State | API Surface That Replaces / Backs It | Retrofit Action |
| --- | --- | --- | --- |
| `jev-orchestrator` | Documents `/api/jev/tasks`, approvals, automations, router v15/v21 | `/api/jev/*`, `/api/jev/harness/*`, `/api/jev/console/*`, `/api/jev/system/switches`, `/api/jev/history/*` | Retrofit with HarnessÂ² contrastive ProposeâProbeâCompose routes, PWC switches, history backup/clear/restore, and the Universal Prompt Console Funnel (`/api/jev/console/catalog`, `/api/jev/console/dispatch`). |
| `jev-corpus` | Documents `/api/jev/corpus/{audit,lens,atom,classify,placements,scorer,taste,visco}` | Adds `/api/jev/corpus/sofima/*` and `/api/jev/corpus/spherical/*` | Retrofit with SOFIMA elastic coordinate-map/spring-mesh routes and Spherical-CNN H&W quadrature + Spin-Weighted SHT (`swsft`, `convolve`, `pool`) routes. |
| `jev-corpus-unit-round` | 13-step manual bash/script runflow | `/api/jev/workflows/unit-round` + `/api/jev/evolution/dream/*` | Embed the full unit-round flow in `/api/jev/workflows/unit-round` and DREAM-RSI replay verification in `/api/jev/evolution/dream/replay`; retrofit skill to drive the API workflow directly. |
| `jev-timeseries` | Documents WAE `/api/jev/timeseries/series` and ETS `/api/jev/forecast/:series` | Adds `/api/jev/timeseries/export` and `/api/jev/forecast/cascade` (`jev-cascade-forecast.js`) | Verify/retrofit skill with `/api/jev/timeseries/export` and the 3-stage Clairic $\to$ TimesFM 2.5/3.0 $\to$ Clef cascade route + prompt-console invocation. |
| `taste-engine` | Documents `/api/jev/corpus/taste/*` and `edge-standard` | Adds SOFIMA `/api/jev/corpus/sofima/relax` for non-rigid contour alignment | Retrofit with SOFIMA elastic mesh pre-alignment and prompt-console command invocation. |
| `curve-compass-skill`, `single-action-curve-rsi`, `hyperspherical-harmonic-curve`, `learned-latent-curve`, `rsi-phi-skill` | Describe offline Python scripts for sphere placement, SH fit, and compass steps | `/api/jev/map/*`, `/api/jev/corpus/spherical/*`, `/api/jev/workflows/wayfinder-cycle` | Embed the wayfinder + single-action + spin-harmonic flow in `/api/jev/workflows/wayfinder-cycle` and retrofit the skills to call the worker endpoints. |
| `knowledge-corpus-mint`, `refs-refresh-sweep` | Describe manual searXNG + `/api/decide` preflight and outline/dig weighting | `/api/jev/workflows/mint-preflight` | Embed the Phase 0 preflight + Clef outline/dig scoring workflow in `/api/jev/workflows/mint-preflight` and retrofit both skills. |
| `self-archaeology`, `curve-guided-rsi`, `curve-guided-rsi-self` | Describe 12-axis NSS sweep + bounded RSI loop | `/api/jev/workflows/self-archaeology` + `/api/jev/harness/*` + `/api/jev/evolution/dream/*` | Embed the 12-axis self-archaeology + HarnessÂ² experience reflection workflow in `/api/jev/workflows/self-archaeology` and retrofit the skills. |
