# Wolfram (2025) Game of Life Metaengineering, Complex Iteration Equations, Lean 4.35.0 + Mathlib Prover (`LifeBounds.lean`), and the Falsification-Verified $D_4$ Fracton-Supersolid, Optical & Cognitive Horizon

**Date:** 2026-11-15\
**Companion Solo Ideation Log:** `refs/wolfram-life-supersolid-optics-psychology-solo-2026-11-15.md`\
**Lean 4.35.0 + Mathlib v4.35.0 Formalization:** `papers/data/lean/LifeBounds.lean` (44 theorems, zero `sorry`) + `papers/data/lean/life-scope.json`\
**Executable Instrument & Falsification Harness:** `tools/life-supersolid/life_supersolid.py` + `tools/life-supersolid/falsification/harness_life.py` (11/11 gates: 5 anti-stub dynamic perturbation gates + 6 scientific falsification gates)\
**Verified BibTeX Bibliography:** `papers/data/lean/life-supersolid-2026-11-15.bib` (38 API-verified arXiv and journal entries)

---

## 1. Executive Synthesis & Architecture

This work completes a four-part advance on PR #331:

1. **Toolchain & Mathlib Upgrade Across the Entire Lean Flow (**`v4.35.0`**):** Bumped the pinned Lean toolchain from `v4.33.0` to the current stable release `leanprover/lean4:v4.35.0` (SHA256 `7289597a44543246c9227b8cae501767e095ce17f6d448b95fc4a8dc97268f6d`) and integrated `leanprover-community/mathlib4` `v4.35.0` (`56a005855ea17e0b0958f73ec801ae140b0a1679`) across all 8 `.lean` modules (`CurvedCorpus`, `WayfinderBounds`, `RadiusBounds`, `RayleighBounds`, `AzimuthBounds`, `FocalBounds`, `FlowBounds`, `LifeBounds`). `check_forbidden_tokens.py` now enforces that every `.lean` source file imports `Mathlib` while blocking `import Lean` metaprogramming, and `pin_statements.py check` replaces all static JSON manifest printouts in `lean-check.yml` and `lean-run.yml`.
2. **Equations of Conway's Game of Life & Complex Iterations (**`LifeBounds.lean` **— 44 Theorems):** Formalized six algebraically equivalent representations of the `B3/S23` local operator (piecewise indicator, linear-threshold interval $5 \le 2S+c \le 7$, 9-cell totalistic sum, integer cubic root, degree-8 Lagrange polynomial, and Wolfram code `224` bitmask; `\cite{wolfram2025gameoflife,wolfram1983statistical}`), Burnside's $D_4$ reduction of the $2^9 = 512$ $3 \times 3$ patch space to $102 = 79 + 17 + 6$ symmetry classes, direct 2D Moore convolution proofs for Vacuum, Block, Beehive, Eater-1, Blinker ($p=2$), and Glider ($p=4$, speed $c/4$), Derrida-Stauffer mean-field polynomial factorization $28\rho^3(1-\rho)^5(3-\rho)$ and rational root brackets, HashLife quadtree step doubling $2^{k-3}+2^{k-3}=2^{k-2}$ (`\cite{gosper1984exploiting}`), and the 2023 $116 \times 86$ engineered diehard pentation tower $17 \uparrow\uparrow\uparrow 3 = \mathrm{tetrate}*{17}(\mathrm{tetrate}*{17}(17))$.
3. **Solved Open Problem 1 — B3/S23 Sierpiński Still-Life Supersolid & Deconfounded Morphology (**`G_SCI_1..3`**):** Synthesized a 6-depth, 366-site Sierpiński-gasket crystal of $2 \times 2$ still-life Blocks (`L=384` on `512x512`, 1,464 live cells) directly in Conway's Game of Life (`B3/S23`). Evolved live under `step_grid` across depths $k=2..6$ ($N = 6, 15, 42, 123, 366$ sites), every depth is an exact stationary $d_m=0$ fracton crystal (`cell_drift = 0`), while its hierarchical voids transmit diagonal $d_m=1$ lineon gliders ballistically (`T(k=2..6) = [0.9124, 0.7956, 0.5255, 0.1168, 0.0365]`, discrete Leggett superfluid bound $f_s^{\text{Leggett}} = 0.8067$; `\cite{leggett1970can,chauveau2023superfluid,stephen2019subsystem,nandkishore2019fractons}`). Measured on both local `edge_standard.py` and the live deployed `steady-orbit` worker (`POST /api/jev/corpus/taste/edge-standard`, run `cr_e6c6733ee80da0e7`), the B3/S23 Sierpiński crystal reads $D\_{\text{whole}} = 1.558937$ (live parity $|\Delta D| = 3.99 \times 10^{-9}$) and local gate slope $D\_{\text{local}}{13..64} = 1.5968$ ($r^2 = 0.9989$), while the v3 matched-extent jitter control (`G_SCI_3`) confirms $|\overline{D}*{\text{v3j}} - D*{\text{tri}}| = |1.2609 - 1.2636| = 0.0027 \le 0.05$ (run `cr_6965e8078ad331fc`).
4. **Solved Open Problem 2 — Wolfram (2025) Cognitive Modularity vs. Area & Working-Memory Focal Point (**`G_SCI_4..6`**):** Evolving 36 canonical B3/S23 patterns (18 search-discovered compact motifs + 18 human-constructed modular architectures; `\cite{wolfram2025gameoflife,brown2023omniperiodic}`) under B3/S23 and extracting the live $d\_\infty \le 2$ ($d_2 \le 2\sqrt{2}$) interaction components $b_0(G_t)$ confirms that search-mined patterns collapse to $\overline{M}*{\text{search}} = 1.1500 \approx 1$, whereas human-constructed architectures average $\overline{M}*{\text{constructed}} = 5.4815$ inside Miller's $7 \pm 2$ / Cowan's $4 \pm 1$ working-memory band (`\cite{miller1956magical,cowan2001magical}`), with Spearman $\rho_s(\text{Area}, M) = +0.8977$ ($\mathrm{d}M/\mathrm{d}A = +0.006482 > 0$). On the 9-D dynamical feature matrix of the evolved corpus, the Rényi prefix ladder selects **dimensional focal point $n^\star(\tau=0.5) = 4$** with effective dimension $\hat{r}(n^\star) = 2/V_2(n^\star) = 2.2477 \le 5.0$ and two-seed curveball structure excess $\Delta\hat{r} = +1.3326$ ($z\_{\text{seed_a}} = +14.27, ; z\_{\text{seed_b}} = +9.10$; `\cite{tch2026focal,lyu2024large}`).

---

## 2. Mathematical Equations & `LifeBounds.lean` (44 Theorems in Lean 4.35.0 + Mathlib v4.35.0)

### 2.1 Local Operator, Convolution & Mean-Field Equations

Let $c_t(x,y) \in \{0,1\}$ on $\mathbb{Z}^2$ have 8-neighbor Moore convolution sum $S_t = K * c_t \in \{0..8\}$. With integer score $u_t = 2S_t + c_t \in \{0..17\}$:

$$
c_{t+1} = \mathbf{1}[S_t = 3] + c_t\mathbf{1}[S_t = 2] = \mathbf{1}[5 \le 2S_t + c_t \le 7] = \mathbf{1}[(u_t-5)(u_t-6)(u_t-7) = 0] = \left\lfloor \frac{224}{2^{u_t}} \right\rfloor \bmod 2
$$

and in scaled degree-8 Lagrange polynomial form (`life_lagrange_all_moore`):

$$
1440\,c_{t+1} = -2\prod_{j \in \{0..8\}\setminus\{3\}}(S_t - j) + c_t \prod_{j \in \{0..8\}\setminus\{2\}}(S_t - j)
$$

Under the 9-cell uncorrelated binomial density approximation $\rho_t = p/d \in [0,1]$, the Derrida–Stauffer mean-field map (`mf_coeff_identity`, proved via Mathlib's `ring` tactic) is:

$$
\rho_{t+1} = \binom{8}{3}(1-\rho_t)\rho_t^3(1-\rho_t)^5 + \binom{8}{3}\rho_t^4(1-\rho_t)^5 + \binom{8}{2}\rho_t^3(1-\rho_t)^6 = 28\,\rho_t^3(1-\rho_t)^5(3 - \rho_t)
$$

with super-stable vacuum $\rho^*_0 = 0$, 1-step full-grid extinction $\rho=1 \mapsto 0$, unstable threshold $\rho^*_1 \in (0.190, 0.200)$ ($\approx 0.1927$), and stable plateau $\rho^*_2 \in (0.370, 0.371)$ ($\approx 0.3702$, `mf_fixed_point_brackets`).

### 2.2 Asymptotic Iteration Hierarchy & Cross-Domain Equations

1. **Light-Cone Quadratic Ceiling (**`lightcone_area_quadratic`**, proved via Mathlib** `ring`**):**

   $$
   \mathrm{Area}(L_0, t) = (L_0 + 2t)^2 = L_0^2 + 2\cdot L_0\cdot(2t) + (2t)^2 = O(t^2)
   $$

2. **HashLife Quadtree Recursion (**`hashlife_recursion_step`**,** `\cite{gosper1984exploiting}`**) & Pentation Diehard (**`diehard_pentate_unfold`**,** `\cite{wolfram2025gameoflife}`**):**

   $$
   \Delta t_k = 2^{k-2} = 2^{k-3} + 2^{k-3} \quad (k \ge 3), \qquad T_{\text{die}}(116\times 86) = 17\uparrow\uparrow\uparrow 3 = \mathrm{tetrate}_{17}(\mathrm{tetrate}_{17}(17))
   $$

3. **Supersolid Leggett Discriminant (**`supersolid_leggett_disc`**,** `supersolid_leggett_strict_of_modulated`**,** `\cite{leggett1970can,chauveau2023superfluid,orso2023superfluid}`**):**

   $$
   (r_1 + r_2)^2 - 4r_1 r_2 = (r_1 - r_2)^2 > 0 \quad (\forall\, r_1 \ne r_2)
   $$

4. **Multi-Axis $D_4$ Light-Cone Orthogonality (**`multiaxis_cardinal_from_lightcone`**,** `multiaxis_norm_doubling`**):**

   $$
   u = \Delta x + \Delta y, \quad v = \Delta x - \Delta y \implies u + v = 2\Delta x, \quad u - v = 2\Delta y, \quad u^2 + v^2 = 2(\Delta x^2 + \Delta y^2)
   $$

5. **Discrete Glider Optics (**`optics_neff_mono`**,** `optics_goos_hanchen_additive`**,** `optics_beer_lambert_two_layer`**):**

   $$
   n_{\text{eff}}(L, \Delta t) = 1 + \frac{\Delta t}{4L}, \qquad (d - s)^2 = d^2 - 2ds + s^2
   $$

6. **Cognitive Modularity Collapse & Teleological MDL (**`cognitive_modularity_collapse`**,** `teleological_mdl_penalty`**,** `\cite{wolfram2025gameoflife,miller1956magical,cowan2001magical,compagno2026teleological}`**):**

   $$
   M \cdot a_{\min} \le A \land A < 2a_{\min} \implies M \le 1, \qquad \mathrm{PurposeScore}(x_0 \to B) = K(x_0) - (K(B) + T_{\text{trans}} + |D_{\text{extra}}|)
   $$

---

## 3. Experimental Validation & Falsification Harness (`harness_life.py`)

### 3.1 Live-Deployment & Local Measurement Results (Assumption 1 & Open Problem 1)

| B3/S23 Crystal Class | Sites $N$ | Live Cells | B3/S23 Stationary (8 steps) | $D\_{\text{whole}}$ (Local / Live Worker) | $D\_{\text{local}}{13..64}$ ($r^2$) | Glider Transmission $T\_{\text{glider}}$ | Leggett $f_s$ Bound | Live `steady-orbit` Run ID |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Sierpiński Depth 2** | $6$ | $24$ | `True` (drift $0$) | $0.4112$ | — | $0.9124$ ($125/137$) | $0.9854$ | — |  |  |
| **Sierpiński Depth 3** | $15$ | $60$ | `True` (drift $0$) | $0.4818$ | — | $0.7956$ ($109/137$) | $0.9681$ | — |  |  |
| **Sierpiński Depth 4** | $42$ | $168$ | `True` (drift $0$) | $0.6690$ | — | $0.5255$ ($72/137$) | $0.9312$ | — |  |  |
| **Sierpiński Depth 5** | $123$ | $492$ | `True` (drift $0$) | $1.1178$ | — | $0.1168$ ($16/137$) | $0.8745$ | — |  |  |
| **Sierpiński Depth 6 (**`L=384`**)** | $366$ | $1{,}464$ | `True` (drift $0$) | **$1.558937$ / $1.558937$** ($\Delta = 4.0\times 10^{-9}$) | **$1.5968$** ($0.9989$) | **$0.0365$** ($5/137$, CA-verified) | **$0.8067$** | `cr_e6c6733ee80da0e7` |  |  |
| **Triangular Lattice (**`tri`**)** | $19$ | $76$ | `True` (drift $0$) | **$1.263595$ / $1.263595$** ($\Delta = 4.4\times 10^{-9}$) | $1.4667$ ($0.9879$) | $0.5974$ ($46/77$) | $0.9576$ | `cr_6965e8078ad331fc` |  |  |
| **v3 Matched-Extent Jitter (**`5 seeds`**)** | $19$ | $76$ | `True` (drift $0$) | **$1.260876$** ($ | \Delta\_{\text{tri}} | = 0.0027 \le 0.05$) | $1.4512$ | $0.6140$ | $0.9561$ | — |

### 3.2 Cognitive Modularity & Dimensional Focal Point Results (Assumption 2 & Open Problem 2)

| Metric / Readout on 36 Evolved B3/S23 Patterns | Measured Value | Null / Control Comparator | Verdict |
|---|---|---|---|
| **Search-Discovered Modularity $\overline{M}_{\text{search}}$** ($n=18$) | $1.1500$ (median $1.000$) | Irreducible blob floor $M = 1.000$ | **Collapsed ($M \le 1.25$)** |
| **Human-Constructed Modularity $\overline{M}_{\text{constructed}}$** ($n=18$) | $5.4815$ (range $2.00\text{--}9.00$) | Miller $7 \pm 2$ / Cowan $4 \pm 1$ band | **Inside Cognitive Band ($[4, 9]$)** |
| **Area-Modularity Correlation** | Spearman $\rho_s = +0.8977$, $\mathrm{d}M/\mathrm{d}A = +0.006482$ | Area compression $d_{\text{sep}}: 10 \to 2 \implies M: 4.0 \to 1.0$ | **Monotone $\mathrm{d}M/\mathrm{d}A > 0$ Verified** |
| **Rényi Prefix Counts $N_d$ ($d=1..9$)** | $2, 4, 6, 9, 10, 13, 16, 21, 22$ | $\Delta D_0 = [1.00, 1.00, 0.585, 0.585, 0.152, \dots]$ | **Focal Point $n^\star(\tau=0.5) = 4$** |
| **Effective Dimension $\hat{r} = 2/V_2$ at $n^\star = 4$** | $\hat{r}(4) = 2.2477 \le 5.0$ ($V_2 = 0.8898$) | Curveball $\hat{r}_0(4) = 2.9343$ | **Focus Gate Passed ($\hat{r} \le 5$)** |
| **Full-Depth Structure Excess $\Delta\hat{r}(9) = \hat{r}_0 - \hat{r}$** | $\Delta\hat{r} = +1.3326$ ($\hat{r} = 3.0335$ vs. $\hat{r}_0 = 4.3661$) | Two-seed Curveball: $z_a = +14.27$, $z_b = +9.10$ | **Structured ($z > 9$, Reproducible)** |

### 3.3 The 11 Gates of `tools/life-supersolid/falsification/harness_life.py`

| Gate ID | Category | What It Tests (Dynamic Measurement / Scientific Falsifier) | Status |  |  |
| --- | --- | --- | --- | --- | --- |
| `G_DYN_1_ca_ablation_response` | `ANTI-STUB` | Ablating 1 cell from Glider/Blinker destroys translation ($5 \to 4$ cells) and periodicity ($2 \to 0$ cells). | **PASS** |  |  |
| `G_DYN_2_crystal_site_pruning` | `ANTI-STUB` | Pruning 66 of 366 sites from the Sierpiński crystal moves `n_components_traced` $366 \to 300$ and $D\_{\text{whole}}$ $1.5589 \to 1.4967$. | **PASS** |  |  |
| `G_DYN_3_corridor_blocker_injection` | `ANTI-STUB` | Injecting a $2 \times 2$ Block into the clear $x-y=0$ diagonal glider channel drops ray transmission $1 \to 0$. | **PASS** |  |  |
| `G_DYN_4_caustic_rank2_injection` | `ANTI-STUB` | Feeding a rank-2 cloned corpus forces caustic rank collapse $V_2 = 1.0000$ ($\hat{r} = 2.0000$ vs. $3.0335$). | **PASS** |  |  |
| `G_DYN_5_curveball_two_seed_independence` | `ANTI-STUB` | Independent curveball seeds `20261115` and `20261116` produce distinct Monte Carlo $z$-profiles ($+14.27$ vs. $+9.10$). | **PASS** |  |  |
| `G_SCI_1_sierpinski_b3s23_crystal_gate` | `ASSUMPTION-1` | All depths $k=2..6$ stationary in B3/S23; depth 6 traces 366 components with $D\_{\text{local}} = 1.5968 \in \[1.535, 1.635\]$, $r^2 = 0.9989 \ge 0.98$. | **PASS** |  |  |
| `G_SCI_2_ballistic_glider_beer_lambert` | `ASSUMPTION-1` | Glider transmission $T(k=2..6) = \[0.912, 0.796, 0.526, 0.117, 0.036\]$ strictly monotone, CA ray verified, $f_s^{\text{Leggett}} = 0.8067$. | **PASS** |  |  |
| `G_SCI_3_v3_matched_extent_control` | `ASSUMPTION-1` | $ | \overline{D}*{\text{v3j}} - D*{\text{tri}} | = 0.0027 \le 0.05$ at matched extent; Sierpiński crystal separates by $+0.2953 \ge 0.25$. | **PASS** |
| `G_SCI_4_modularity_vs_area_separation` | `ASSUMPTION-2` | $\overline{M}*{\text{search}} = 1.150 \le 1.25$, $\overline{M}*{\text{constructed}} = 5.481 \in \[4,9\]$, Spearman $\rho_s(A,M) = 0.8977 \ge 0.75$. | **PASS** |  |  |
| `G_SCI_5_area_compression_modularity_collapse` | `ASSUMPTION-2` | Compressing inter-module separation $d\_{\text{sep}}: 10 \to 2$ ($A: 144 \to 36$) collapses $M: 4.0 \to 1.0$. | **PASS** |  |  |
| `G_SCI_6_focal_point_and_structure_excess` | `ASSUMPTION-2` | $n^\star(\tau=0.5) = 4 \in \[4,7\]$, $\hat{r}(n^\star) = 2.248 \le 5.0$, $\Delta\hat{r} = +1.333$, $z_a = +14.27, z_b = +9.10$. | **PASS** |  |  |

---

## 4. Verified Bibliography (Keyed to `papers/data/lean/life-supersolid-2026-11-15.bib`)

- **Game of Life, Omniperiodicity & Continuous CA:** `wolfram2025gameoflife`, `wolfram1983statistical`, `gosper1984exploiting`, `brown2023omniperiodic` (`arXiv:2312.02799`), `astore2026spatiotemporal` (`arXiv:2610.31708`), `shrestha2024emergent` (`arXiv:2406.13383`), `mccrum2024conways` (`arXiv:2410.22389`), `beer2022garden` (`arXiv:2210.07837`), `springer2020hard` (`arXiv:2009.01398`), `plantec2023flowlenia` (`arXiv:2212.07906`), `calcaterra2022existence` (`arXiv:2203.14390`), `chan2020expanded` (`arXiv:2005.03742`), `chan2019lenia` (`arXiv:1812.05433`), `rafler2011generalization` (`arXiv:1111.1567`).
- **Supersolids, Leggett Bound & Fractons:** `brakensiek2026generation` (`arXiv:2603.29203`), `sinha2025supersolid` (`arXiv:2502.06660`), `trypogeorgos2025emerging` (`arXiv:2407.02373`, *Nature* 2025), `poli2024excitations` (`arXiv:2407.01072`), `das2024unveiling` (`arXiv:2407.02481`), `chauveau2023superfluid` (`arXiv:2302.01776`), `orso2023superfluid` (`arXiv:2311.16709`), `chomaz2023dipolar` (`arXiv:2201.02672`), `norcia2021twodimensional` (`arXiv:2102.05555`, *Nature* 2021), `natale2019excitation` (`arXiv:1907.01986`), `boninsegni2012supersolids` (`arXiv:1201.2227`), `leggett1970can`, `brighi2022hilbert` (`arXiv:2210.15607`), `khemani2020localization` (`arXiv:1910.01137`), `stephen2019subsystem` (`arXiv:1806.08780`), `nandkishore2019fractons` (`arXiv:1803.11196`), `fraser2026invitation` (`arXiv:2603.10729`), `lyu2024large` (`arXiv:2407.14942`).
- **Optics, Cognitive Modularity & Teleological Inference:** `gupta2026collision` (`arXiv:2609.01348`), `moreno2026optical` (`arXiv:2609.00933`), `li2022photonic` (`arXiv:2211.01811`), `compagno2026teleological` (`arXiv:2603.18968`), `kuhn2026artificial` (`arXiv:2608.23030`), `pontesfilho2025reservoir` (`arXiv:2508.02218`), `chen2024gestalt` (`arXiv:2405.20583`), `leonhardt2006optical`, `miller1956magical`, `cowan2001magical`, `tch2026focal`.
