# Wolfram (2025) Game of Life Metaengineering, Complex Iteration Equations, Lean 4 CI Prover (`LifeBounds.lean`), and the $D_4$ Fracton-Supersolid, Optical & Cognitive Horizon

**Date:** 2026-11-15  
**Companion Solo Ideation Log:** [`refs/wolfram-life-supersolid-optics-psychology-solo-2026-11-15.md`](wolfram-life-supersolid-optics-psychology-solo-2026-11-15.md)  
**Lean 4 Formalization:** [`papers/data/lean/LifeBounds.lean`](../papers/data/lean/LifeBounds.lean) (42 theorems, core Lean 4.33.0, zero `sorry`) + [`papers/data/lean/life-scope.json`](../papers/data/lean/life-scope.json)  
**Primary Ingested Source:** Stephen Wolfram, *"What Can We Learn about Engineering and Innovation from Half a Century of the Game of Life Cellular Automaton?"* (March 18, 2025; updated April 24, 2025), `https://writings.stephenwolfram.com/2025/03/what-can-we-learn-about-engineering-and-innovation-from-half-a-century-of-the-game-of-life-cellular-automaton/`

---

## 1. Executive Synthesis & Core Findings

Ingesting Stephen Wolfram's March 2025 treatise on 55 years of Conway's Game of Life (`B3/S23`, outer-totalistic code `224`) alongside our repository's newest mathematical mappings—**The Dimensional Focal Point** (`papers/dimensional-focal-point-2026-11-10.tex`, `FocalBounds.lean`), **The Curved-Corpus Program, Unified** (`papers/curved-corpus-unified-2026-08-22-v2.tex`, `CurvedCorpus.lean`), **The Phonon Bridge** (`refs/acoustic-optical-phonons-bridge-2026-09-01.md`), **The Sierpiński-Supersolid Connection** (`refs/sierpinski-supersolid-connection-2026-10-06.md`), and **FlowBounds** (`papers/data/lean/FlowBounds.lean`)—exposes a single mathematical structure across four domains:

1. **Game of Life & Complex Iteration Equations:** The local transition rule admits six algebraically equivalent exact representations (piecewise B3/S23, linear-threshold interval $5 \le 2S + c \le 7$, 9-cell sum $\Sigma_9 \in \{3, 4\}$, integer cubic root $(2S+c-5)(2S+c-6)(2S+c-7)=0$, degree-8 Lagrange polynomial over $S \in \{0..8\}$, and bitmask lookup into Wolfram code $224 = 2^5 + 2^6 + 2^7$). Its macroscopic iteration hierarchy spans $O(1)$ still-lifes/oscillators/spaceships, $O(\log t)$ sawtooth counters, $O(t^{1/2})$ fractal sweeps, $O(t)$ guns/puffers, and the light-cone ceiling $O(t^2)$ breeders/spacefillers, while finite-halting ("diehard") iterations reach the 2023 engineered $116 \times 86$ double-tetrational / pentational bound $T_{\text{die}} = 17 \uparrow\uparrow\uparrow 3 = \mathrm{Nest}[17^\#\&, \mathrm{Nest}[17^\#\&, \mathrm{Nest}[17^\#\&, 17, 17], 17], 17]$.
2. **Non-Equilibrium $D_4$ Fracton Supersolid:** Bill Gosper's 2017–2025 observation (quoted by Wolfram at scale $262{,}144 \times 262{,}144 = 2^{18} \times 2^{18}$ cells/pixel over $3.4 \times 10^9$ to $6 \times 10^{10}$ steps)—*"very sparse lines, e.g. density $10^{-5}$, appear solid, while being very nearly transparent to gliders... The beams repeatedly strafe the $x$ and $y$ axis stalagmites"*—is an exact deterministic realization of a **driven-dissipative anisotropic fracton supersolid**. Stationary ash crystals ("stalagmites" of blocks, beehives, eaters) condense on the cardinal sublattice $C_4 = \{(1,0), (0,1)\}$ as immobile $d_m = 0$ **fractons** breaking translational symmetry, while the "glider gas" streams ballistically along the $45^\circ$-rotated diagonal light-cone axes $D_4 \setminus C_4 = \{(\pm 1, \pm 1)\}$ as 1D-constrained $d_m = 1$ **lineons** with Beer-Lambert transmission $T(L) = (1 - \sigma \rho)^L \approx e^{-\sigma \rho L} > 96\%$.
3. **Optics Crossover:** Discrete glider beams obey geometric and wave-like optics: phase-independent $90^\circ$ mirrors (Snark, 2013), phase-independent transverse beam-shifters (Bandersnatch, 2020; Glider pusher, 1993) implementing a discrete **Goos-Hänchen shift**, bipartite parity ("color") conservation $(x+y) \bmod 2$, phased-array stream limits ($p \ge 14$ interwoven vs. $p = 15$ single-barrel gun, 2024), and periodic hassler/conduit metamaterials with effective refractive index $n_{\text{eff}} = 1 + \frac{\Delta t}{4L}$. In our curved-corpus optical dictionary (`curved-corpus-unified` §4, `dimensional-focal-point` §5), this composes directly with Leonhardt's conformal index $n(z) = |\varphi_\theta'(z)|$, stereographic lens power $s = 1/\mathrm{RMS}(r)$, and caustic rank-collapse $V_2 = 1.0000$.
4. **Psychology & Cognitive Boundedness Crossover:** Wolfram's 2025 **Modularity Index** $M(P) = \frac{1}{P}\sum_{t=1}^P b_0(G_t)$—counting connected components in the $d_\infty \le 2$ ($d_2 \le 2\sqrt{2}$) overlap graph—separates human-constructed patterns ($M \gg 1$) from search-discovered patterns ($M \to 1$, "irreducible computational blobs"). Human engineers must decompose designs into spacelike-separated antichains because working memory is bounded by Miller's $7 \pm 2$ and Cowan's $4 \pm 1$ chunks—matching our repository's **dimensional focal point** $n^\star = 7$ bits and **focus dimension** $d_{\text{focus}} = 5\text{--}6$ where effective rank $\hat{r} = 2/V_2 \le 5$.

---

## 2. Equations of the Game of Life & Its Most Complex Iterations

### 2.1 Six Exact Forms of the Local Transition Operator

Let $c_t(x,y) \in \{0,1\}$ be the state at $(x,y) \in \mathbb{Z}^2$ at step $t$, and let $S_t(x,y)$ be the 2D discrete convolution with the hollow $3 \times 3$ Moore kernel $K$:

$$
S_t(x,y) = (K * c_t)(x,y) = \sum_{(\Delta x, \Delta y) \in \{-1,0,1\}^2 \setminus \{(0,0)\}} c_t(x + \Delta x, y + \Delta y) \in \{0,\dots,8\}, \qquad K = \begin{pmatrix} 1 & 1 & 1 \\ 1 & 0 & 1 \\ 1 & 1 & 1 \end{pmatrix}
$$

On an $N \times M$ torus, the spatial convolution is diagonalized by the 2D Discrete Fourier Transform:

$$
\widehat{S}_t(u,v) = \widehat{K}(u,v)\,\widehat{c}_t(u,v), \qquad \widehat{K}(u,v) = 4\cos\!\left(\frac{2\pi u}{N}\right)\cos\!\left(\frac{2\pi v}{M}\right) + 2\cos\!\left(\frac{2\pi u}{N}\right) + 2\cos\!\left(\frac{2\pi v}{M}\right)
$$

The six exact local transition equations (all proved equivalent across all 18 Moore states in `LifeBounds.lean` §§A):

1. **Piecewise B3/S23 Indicator Form (`lifeRule`):**
   $$
   c_{t+1} = \mathbf{1}[S_t = 3] + c_t \cdot \mathbf{1}[S_t = 2 \lor S_t = 3] = \mathbf{1}[S_t = 3] + c_t \cdot \mathbf{1}[S_t = 2]
   $$
2. **Linear-Threshold Score & Interval Form (`lifeScore`, `lifeInterval`):**
   Define the integer score $u_t = 2 S_t + c_t \in \{0, \dots, 17\}$. Then:
   $$
   c_{t+1} = \mathbf{1}\!\big[5 \le 2 S_t + c_t \le 7\big]
   $$
   - Dead cell ($c_t = 0$): $2 S_t \in [5,7] \iff 2 S_t = 6 \iff S_t = 3$ (`life_birth_score`).
   - Live cell ($c_t = 1$): $2 S_t + 1 \in [5,7] \iff 2 S_t \in \{4,6\} \iff S_t \in \{2,3\}$ (`life_survival_score`).
   - Underpopulation ($S_t \le 1$): $2 S_t + c_t \le 3 < 5 \implies c_{t+1} = 0$ (`life_underpop_score`).
   - Overpopulation ($S_t \ge 4$): $2 S_t + c_t \ge 8 > 7 \implies c_{t+1} = 0$ (`life_overpop_score`).
3. **Nine-Cell Totalistic Sum Form (`lifeNineSum`):**
   With $\Sigma_9 = S_t + c_t = \sum_{\Delta x, \Delta y \in \{-1,0,1\}} c_t(x+\Delta x, y+\Delta y)$:
   $$
   c_{t+1} = \mathbf{1}[\Sigma_9 = 3] \lor \big(\mathbf{1}[\Sigma_9 = 4] \land c_t = 1\big)
   $$
4. **Cubic Root Polynomial Form over $\mathbb{Z}$ (`lifeCubic`):**
   $$
   (2 S_t + c_t - 5)(2 S_t + c_t - 6)(2 S_t + c_t - 7) = 0 \iff c_{t+1} = 1
   $$
5. **Exact Degree-8 Lagrange Interpolating Polynomial over $\mathbb{R}$ and $1440\,\mathbb{Z}$ (`lifeLagrange1440`):**
   $$
   1440 \, c_{t+1} = -2 \prod_{j \in \{0..8\}\setminus\{3\}} (S_t - j) \;+\; c_t \prod_{j \in \{0..8\}\setminus\{2\}} (S_t - j)
   $$
6. **Wolfram Outer-Totalistic Code 224 Bitmask (`wolfram_code_224`, `life_bitmask_all_moore`):**
   $$
   \mathrm{Code}_{B3/S23} = 2^5 + 2^6 + 2^7 = 32 + 64 + 128 = 224, \qquad c_{t+1} = \left\lfloor \frac{224}{2^{2 S_t + c_t}} \right\rfloor \bmod 2
   $$
   Over $\mathbb{F}_2$ (Zhegalkin / Algebraic Normal Form in the 8 neighbor bits $x_1,\dots,x_8$ with elementary symmetric polynomials $e_k$), this is:
   $$
   c_{t+1} \equiv e_3 + e_4 + e_6 + e_7 + c_t (e_2 + e_3 + e_6 + e_7) \pmod 2
   $$

---

### 2.2 Mean-Field Density Map, Spatial Decay & Continuous Generalizations

1. **Derrida–Stauffer 9-Cell Mean-Field Iteration (`mf_coeff_identity`, `mf_fixed_point_brackets`):**
   For an uncorrelated random grid of density $\rho_t = p/d \in [0,1]$, the exact binomial transition is:
   $$
   \rho_{t+1} = (1 - \rho_t)\binom{8}{3}\rho_t^3(1-\rho_t)^5 + \rho_t\left[\binom{8}{3}\rho_t^3(1-\rho_t)^5 + \binom{8}{2}\rho_t^2(1-\rho_t)^6\right]
   $$
   Using $\binom{8}{3} = 56$ and $\binom{8}{2} = 28$, the linear prefactor simplifies identically (`mf_coeff_identity`):
   $$
   56(1 - \rho_t) + 56\rho_t + 28(1 - \rho_t) = 84 - 28\rho_t = 28(3 - \rho_t) \implies \rho_{t+1} = 28\,\rho_t^3(1 - \rho_t)^5(3 - \rho_t)
   $$
   - **Fixed points (`mf_vacuum_fixed_point`, `mf_overpop_full_extinct`, `mf_fixed_point_brackets`):** $\rho^*_0 = 0$ (super-stable vacuum), $\rho = 1 \mapsto 0$ in 1 step, an unstable repeller $\rho^*_1 \in (0.190, 0.200)$ ($\approx 0.1927$), and a stable positive branch $\rho^*_2 \in (0.370, 0.371)$ ($\approx 0.3702$).
2. **Wolfram (1983) / Buckingham (1981) Precursor Density Law (from `img164_wolfram1982.png`):**
   The empirical density of structures of $L$ live sites emerging from disordered initial conditions decays exponentially with minimal 1-step precursor size $L_-$:
   $$
   \rho(L) \sim \frac{e^{-L_-}}{L}
   $$
3. **Continuous Generalizations (SmoothLife, Lenia, Flow-Lenia):**
   - **SmoothLife** (`arXiv:1111.1567`): $\frac{\partial A}{\partial t} = S\!\left(\int K_n A, \int K_m A\right) - A$.
   - **Lenia** (`arXiv:1812.05433`, `arXiv:2005.03742`): $\frac{\partial A}{\partial t} = G(K * A)$ with Gaussian growth $G(u) = 2\exp\!\left(-\frac{(u-\mu)^2}{2\sigma^2}\right) - 1$.
   - **Flow-Lenia** (`arXiv:2212.07906`): $\frac{\partial A}{\partial t} + \nabla \cdot \big(A\,\nabla G(K * A)\big) = 0$ (exact mass conservation).

---

### 2.3 Equations of the Most Complex Iterations (Wolfram 2025 + Repo Mappings)

| Iteration / Mapping Class | Governing Equation / Bound | Concrete Realization / Record in Wolfram (2025) & Repo |
|---|---|---|
| **Light-Cone & Quadratic Ceiling** | $\mathrm{side}(t) = L_0 + 2t$, $\;P(t) \le (L_0 + 2t)^2 = L_0^2 + 4L_0 t + 4t^2 = O(t^2)$ | Speed of light $c = 1$; glider speed $c/4$ diagonally; LWSS speed $c/2$ orthogonally; $31c/240$ Shield bug ($934{,}852 \times 290{,}482 \to 11{,}974 \times 45{,}755$ Mannaz, 2025); quadratic growth attained by Breeder 1 (1971) & Spacefiller (1993). |
| **Glider Gun Clock Hierarchy** | $N_{\text{emit}}(T) = \lfloor T / P_{\text{gun}} \rfloor$, stream non-interference floor $P_{\min} = 14$ | Gosper gun ($P=30$, 1970); interwoven gun ($P_{\text{stream}}=14, P_{\text{true}}=210$, 1990s); shortest true-period gun ($P=15$, discovered 2024); omniperiodic guns ($P \ge 78$, 2013) & omniperiodic oscillators ($\forall P \ge 1$, solved 2023, `arXiv:2312.02799`). |
| **HashLife Quadtree Renormalization** | $N(2^k \times 2^k) \mapsto \text{center}(2^{k-1} \times 2^{k-1})$ at $\Delta t = 2^{k-2} = 2\cdot 2^{k-3}$ | Gosper (1984); OTCA Metapixel ($2^{11} \times 2^{11} = 2048 \times 2048$, period $35{,}328 = 2^9 \cdot 69$); 499$\times$499 P5760 unit Life cell. |
| **Diehard / Busy-Beaver Hierarchy** | Linear $2n \prec 30{,}274 \text{ (32}\times\text{32)} \prec 17\uparrow\uparrow\uparrow 3 \text{ (116}\times\text{86)}$ | Random $16 \times 16$ soup max ($1{,}413$ steps across $10^{16}$ samples out of $2^{256} \approx 10^{77}$); 2022 $32 \times 32$ engineered diehard ($30{,}274$ steps); 2023 $116 \times 86$ double-tetrational diehard: $T_{\text{die}} = 17\uparrow\uparrow\uparrow 3 = \text{tetrate}_{17}(\text{tetrate}_{17}(17))$ (`diehard_pentate_unfold`). |
| **3$\times$3 Burnside $D_4$ Reduction** | $\frac{1}{|D_4|}\sum_{g \in D_4} |X^g| = \frac{2^9 + 2\cdot 2^3 + 2^5 + 4\cdot 2^6}{8} = \frac{816}{8} = 102$ | $512 \to 102$ symmetry classes: $79$ static + $17$ period-2 + $6$ other = $102$; only $1$ class (blinker) is immediately period-2 with $T_{\text{trans}}=0, D_{\text{extra}}=0$ (`burnside_3x3_d4_classes`). |
| **Wolfram (2025) Modularity & Zipf Law** | $M(P) = \frac{1}{P}\sum_{t=1}^P b_0(G_t)$ with edge iff $d_\infty(u,v) \le 2$ ($d_2^2 \le 8$); $f(\text{rank } n) \sim 1/n$ | Eater-1 is rank #1 primitive; optimization shrinks area $A$ and collapses modularity $M \to 1$ (`cognitive_modularity_collapse`). |
| **Dimensional Focal Point (`FocalBounds`)** | $D_q = \frac{1}{1-q}\log_2 \sum_c p_c^q$; $\;n^\star = \max\{n : \Delta D_q(n') \ge \tau\},\;\tau = \tfrac{1}{2}\text{ bit}$ | Prefix class count $N_d \le N_{d+1} \le 2 N_d \le 2^d$; refreeze idempotence $\mathrm{focalDim}(\mathrm{take}\;n^\star) = n^\star$; dimension gate $\hat{r} = 2/V_2 \le 5 \iff V_2 \ge 2/5$ vs. curveball structure excess $\Delta\hat{r} = \hat{r}_0 - \hat{r}$. |
| **Spherical Defocus & Möbius Lens (`CurvedCorpus`)** | $\mathbb{E}[Y_{\ell m}(B_t^x)] = e^{-\ell(\ell+1)t}Y_{\ell m}(x)$; $\;n(z) = |\varphi_\theta'(z)|$; $\;s = 1/\mathrm{RMS}(r)$ | Hamming $H(d,2)$ eigenvalue $2j$ vs. $S^2$ quadratic $2\ell(\ell+1)$ (`heat_exp_dominates_hamming`); Klemens/Gaunt triad sparsity ($23/64$ allowed at $L=3$). |

---

## 3. New Perspective: The Sparsity-Gated $D_4$ Fracton Supersolid

### 3.1 Physical Isomorphism in Gosper's $60\text{G}$-Step Macro-Regime

In Wolfram's 2025 essay (Backstory, pp. 42–44), Bill Gosper's 2017 experiments on two colliding LWSS backrakes run to $3.4 \times 10^9$, $18 \times 10^9$, and $60 \times 10^9$ steps reveal an emergent two-fluid/two-sublattice state:
- **Sublattice 1 — Cardinal Crystalline Solid ($C_4 = \{(1,0), (0,1)\}$):** Stationary ash ("$x$ and $y$ axis stalagmites" composed of blocks, beehives, blinkers, and sporadic fishhook eaters) forms rigid 1D/2D positional structures along the orthogonal grid axes. In the language of fracton phases of matter (`arXiv:1803.11196`, `arXiv:1806.08780`), still-lifes are **$d_m = 0$ fractons** (zero isolated mobility; moving a block requires nucleating/annihilating adjacent cells via external glider collisions).
- **Sublattice 2 — Diagonal Ballistic Superfluid ($D_4 \setminus C_4 = \{(\pm 1, \pm 1)\}$):** A coherent "glider gas" of glider packets propagates along the $45^\circ$ diagonal light-cone coordinates $(u, v) = (x+y, x-y)$ at constant velocity $\mathbf{v}_g = (\pm c/4, \pm c/4)$. Gliders are **$d_m = 1$ lineons** constrained by subsystem parity invariance (`glider_bipartite_color_invariant`: $((x+1)+(y+1)) \bmod 2 = (x+y) \bmod 2$).

As proved in `LifeBounds.multiaxis_cardinal_from_lightcone` and `LifeBounds.multiaxis_norm_doubling`:

$$
u = \Delta x + \Delta y, \quad v = \Delta x - \Delta y \implies \begin{cases} u + v = 2\Delta x, \quad u - v = 2\Delta y \\ u^2 + v^2 = 2(\Delta x^2 + \Delta y^2) \end{cases}
$$

the diagonal glider frame and cardinal stalagmite frame are $45^\circ$-orthogonal across the $D_4$ lattice group.

### 3.2 Extended Gross-Pitaevskii Analogy, Leggett's Bound & Lindley Queue Stability

1. **Hard-Core LHY Stabilization in B3/S23:**
   In dipolar quantum gases (`arXiv:2201.02672`, `arXiv:2502.06660`), the extended Gross-Pitaevskii equation (eGPE) balances attractive dipolar interaction $\Phi_{\text{dd}} < 0$ against the repulsive Lee-Huang-Yang quantum fluctuation term $g_{\text{QF}}|\psi|^3\psi > 0$ to arrest collapse and stabilize droplet crystals. In Conway's Life, birth at $S = 3$ is the local attractive condensation channel, while overpopulation death at $S \ge 4$ (`life_overpop_score`) acts as the hard-core repulsive LHY term, arresting dense cluster collapse and forcing surviving matter into dilute still-life droplets separated by vacuum corridors.
2. **Leggett's Superfluid Upper Bound (`supersolid_leggett_disc`, `supersolid_leggett_strict_of_modulated`):**
   Leggett's bound (`PRL` 25, 1543, 1970; `arXiv:2302.01776`; `arXiv:2311.16709`) limits the superfluid fraction $f_s$ of a modulated density profile $\rho(x)$ by the Cauchy-Schwarz inequality:
   $$
   f_s \le \left[\left(\frac{1}{a}\int_0^a \rho(x)\,dx\right)\left(\frac{1}{a}\int_0^a \frac{dx}{\rho(x)}\right)\right]^{-1}
   $$
   For a two-region periodic cell with densities $(\rho_1, \rho_2)$, clearing denominators gives the exact algebraic discriminant proved in `LifeBounds.supersolid_leggett_disc` and `supersolid_leggett_strict_of_modulated`:
   $$
   (\rho_1 + \rho_2)^2 - 4\rho_1\rho_2 = (\rho_1 - \rho_2)^2 > 0 \quad (\forall\,\rho_1 \ne \rho_2)
   $$
   Any crystalline modulation ($\rho_1 \ne \rho_2$) strictly reduces the upper bound below unity, while maintaining $f_s > 0$ so long as the inter-droplet background remains unpinched.
3. **Driven-Dissipative Steady State & `FlowBounds` Lindley Transition:**
   Like photonic-crystal polariton supersolids (`arXiv:2407.02373`, Nature 2025), the Life supersolid is driven-dissipative: backrakes/guns pump gliders at rate $a_t$ while stalagmite eaters/collisions absorb them at capacity $s_t$. By `FlowBounds.lindley_le_of_arrivals_le` and `FlowBounds.backlog_growth`:
   $$
   q_{t+1} = \max(0, q_t + a_t - s_t) \implies \begin{cases} a_t \le s_t \implies q_T \le q_0 & \text{(stable supersolid coexistence)} \\ a_t \ge s_t + d \implies q_T \ge q_0 + d\cdot T & \text{(defect accumulation } \to \text{ switch-engine } O(t^2)\text{)} \end{cases}
   $$
4. **Honest Morphology Caveat (from `refs/sierpinski-supersolid-connection-2026-10-06.md` Addendum 7):**
   Per our v3 matched-extent control, box-counting fractal dimension $D$ (`edge-standard-v1`) is a **hierarchy and area-fill detector** ($D \approx 1.585$ on Sierpiński gaskets vs. $\le 1.37$ on periodic/jittered/Norcia 2D supersolid droplet arrays), *not* an order-vs-disorder parameter at fixed bounding-box extent. Any morphological audit of Life ash fields must apply matched-extent bbox cropping alongside the $D_4$ directional transport readout.

---

## 4. Crossover in Optics & Psychology

### 4.1 Discrete Glider Optics & Transformation Optics

1. **Macroscopic Opacity vs. Ballistic Glider Transparency:**
   At Gosper's pixel scale $L_{\text{pix}} = 2^{18} = 262{,}144$ cells, an ash line of density $\rho = 10^{-5}$ contains $\sim 2.6$ active defects per pixel column, appearing visually continuous and solid under coarse-grained resolution $\varepsilon$. Yet to a glider of cross-section $\sigma \sim 6\text{--}9$ cells, the discrete Beer-Lambert survival across thickness $L$ is:
   $$
   T(L) = (1 - \sigma \rho)^L \approx e^{-\sigma \rho L}, \qquad \ell_{\text{mfp}} = \frac{1}{\sigma \rho} \sim 10^4\text{--}10^5 \text{ cells}
   $$
2. **Refractive Index & Goos-Hänchen Shift (`optics_neff_mono`, `optics_goos_hanchen_additive`):**
   - A periodic conduit/hassler array with cell pitch $L$ that delays a glider by $\Delta t \ge 0$ ticks reduces group velocity from $v_0 = c/4$ to $v_{\text{eff}} = \frac{c/4}{1 + \Delta t/(4L)}$, yielding effective refractive index:
     $$
     n_{\text{eff}}(L, \Delta t) = \frac{v_0}{v_{\text{eff}}} = 1 + \frac{\Delta t}{4L}, \qquad 4L \le 4L + \Delta t_1 \le 4L + \Delta t_2
     $$
   - Phase-independent glider pushers (1993) and the static Bandersnatch (2020) translate a glider beam laterally by $\Delta x_\perp$ while preserving wavevector $\mathbf{k}_{\text{out}} = \mathbf{k}_{\text{in}}$, providing an exact discrete realization of the optical **Goos-Hänchen shift** (`optics_goos_hanchen_additive`).

### 4.2 Psychology, Cognitive Working-Memory Bounds & Teleological MDL

1. **Cognitive Boundedness ($7 \pm 2$ / $4 \pm 1$) $\leftrightarrow$ Dimensional Focal Point ($n^\star = 7$, $\hat{r} \le 5$):**
   In Wolfram's 2025 analysis, human-constructed patterns decompose into $b_0(G_t)$ disconnected components in the $d_\infty \le 2$ ($d_2 \le 2\sqrt{2}$, `interaction_radius_sq`: $2^2 + 2^2 = 8$) interaction graph. Why do human engineers build large modular circuits ($M \gg 1$) while automated searches find compact monolithic blobs ($M = 1$)?
   - Human working memory holds at most $7 \pm 2$ (Miller) or $4 \pm 1$ (Cowan) interacting chunks at once—the exact numerical band where our corpus **dimensional focal point** ($n^\star = 7$ bits) and **focus dimension** ($d_{\text{focus}} = 5\text{--}6$, $\hat{r} = 2/V_2 \le 5$) sit (`papers/dimensional-focal-point-2026-11-10.tex`).
   - As proved in `LifeBounds.cognitive_modularity_collapse`, if each independent modular component requires at least $a_{\min}$ cells (including its $d_\infty \le 2$ isolation moat), then $M \cdot a_{\min} \le A$. Optimizing total area $A$ below $2 a_{\min}$ forces $M \le 1$: size optimization mathematically destroys modularity.
2. **Teleological MDL Agency Detection (`teleological_mdl_penalty`):**
   When an initial configuration $x_0$ reaches a target behavior $B$ after transient $T_{\text{trans}}$ leaving debris $D_{\text{extra}}$, the teleological purpose score (`LifeBounds.purposeScore`):
   $$
   \mathrm{PurposeScore}(x_0 \to B) = K(x_0) - \big(K(B) + T_{\text{trans}} + |D_{\text{extra}}|\big)
   $$
   is strictly penalized by transient wandering and leftover debris (`teleological_mdl_penalty`), explaining why only 1 of the 102 $D_4$-distinct $3 \times 3$ patterns (the immediate 3-cell blinker, $T_{\text{trans}}=0, D_{\text{extra}}=0$) is perceived as "made for the purpose of period 2."

---

## 5. `LifeBounds.lean` — 42 Kernel-Checked Theorems on CI

All 42 theorems in `papers/data/lean/LifeBounds.lean` compile on pinned core Lean `4.33.0` (`-DwarningAsError=true`, `leanchecker --fresh`, `check_forbidden_tokens.py`, `check_lean_axioms.py --mode enumerate --require-coverage`, and `verify_wayfinder_axioms.py` with statement + `commands-v2` definition pins):

- **Section A (10 theorems — Local Rule & Wolfram Code 224):** `wolfram_code_224`, `life_interval_all_moore`, `life_ninesum_all_moore`, `life_cubic_roots_all_moore`, `life_lagrange_all_moore`, `life_bitmask_all_moore`, `life_underpop_score`, `life_overpop_score`, `life_birth_score`, `life_survival_score`.
- **Section B (5 theorems — $3 \times 3$ Exhaustion & $D_4$ Burnside Orbit Count):** `state_space_3x3_card`, `burnside_3x3_d4_sum`, `burnside_3x3_d4_classes`, `wolfram_3x3_outcome_partition`, `interaction_radius_sq`.
- **Section C (8 theorems — 2D Convolution & Canonical Motifs):** `vacuum_still_life`, `block_still_life`, `beehive_still_life`, `eater1_still_life`, `blinker_step1`, `blinker_step2`, `glider_period4_translates`, `glider_bipartite_color_invariant`.
- **Section D (5 theorems — Mean-Field Derrida–Stauffer Polynomial):** `mf_binomial_weights`, `mf_coeff_identity`, `mf_vacuum_fixed_point`, `mf_overpop_full_extinct`, `mf_fixed_point_brackets`.
- **Section E (6 theorems — Light Cone, Guns, HashLife & Pentation):** `lightcone_side_step`, `lightcone_area_quadratic`, `gun_emission_hierarchy`, `hashlife_recursion_step`, `otca_metapixel_scale`, `diehard_pentate_unfold`.
- **Section F (8 theorems — Supersolid, Multi-Axis, Optics & Psychology):** `supersolid_leggett_disc`, `supersolid_leggett_strict_of_modulated`, `multiaxis_cardinal_from_lightcone`, `multiaxis_norm_doubling`, `optics_neff_mono`, `optics_goos_hanchen_additive`, `cognitive_modularity_collapse`, `teleological_mdl_penalty`.

---

## 6. Verified arXiv Bibliography (API-Checked against `export.arxiv.org`)

### Game of Life, Continuous CA, Omniperiodicity & Criticality
1. **Brown, N., Cheng, C., Jacobi, T., Karpovich, M., Merzenich, M., Raucci, D., & Riley, M. (2023).** *Conway's Game of Life is Omniperiodic.* `arXiv:2312.02799`.
2. **Astore, L. M., Frery, A. C., de Lima e Silva, P. C., & Guimarães, F. G. (2026).** *Spatiotemporal Dynamics of Conway's Game of Life in the Entropy–Complexity Plane.* `arXiv:2610.31708`.
3. **Shrestha, A., Reimers, F., Jain, S., & Baldini, P. (2024).** *Emergent Dynamics in Heterogeneous Life-Like Cellular Automata.* `arXiv:2406.13383`.
4. **McCrum, J., & Kee, T. P. (2024).** *Conway's game of life as an analogue to a habitable world: Livingness beyond the biological.* `arXiv:2410.22389`.
5. **Beer, R. D. (2022).** *Cultivating the Garden of Eden.* `arXiv:2210.07837`.
6. **Springer, J. M., & Kenyon, G. T. (2020).** *It's Hard for Neural Networks To Learn the Game of Life.* `arXiv:2009.01398`.
7. **Plantec, E., Hamon, G., Etcheverry, M., Oudeyer, P.-Y., Moulin-Frier, C., & Chan, B. W.-C. (2022/2023).** *Flow-Lenia: Towards open-ended evolution in cellular automata through mass conservation and parameter localization.* `arXiv:2212.07906`.
8. **Calcaterra, C., & Boldt, A. (2022).** *Existence of Life in Lenia.* `arXiv:2203.14390`.
9. **Chan, B. W.-C. (2020).** *Lenia and Expanded Universe.* `arXiv:2005.03742`.
10. **Chan, B. W.-C. (2018/2019).** *Lenia — Biology of Artificial Life.* `arXiv:1812.05433`.
11. **Rafler, S. (2011).** *Generalization of Conway's "Game of Life" to a continuous domain — SmoothLife.* `arXiv:1111.1567`.

### Supersolids, Fractons, Subsystem Symmetries & Dimensional Interpolation
12. **Brakensiek, E. L., Bougas, G. A., & Mistakidis, S. I. (2026).** *Generation of dipolar supersolids through a barrier sweep in droplet lattices.* `arXiv:2603.29203`.
13. **Sinha, S., & Sinha, S. (2025).** *Supersolid phases of bosons.* `arXiv:2502.06660`.
14. **Trypogeorgos, D., Gianfrate, A., Landini, M., Nigro, D., et al. (2024/2025).** *Emerging supersolidity from a polariton condensate in a photonic crystal waveguide.* `arXiv:2407.02373` (*Nature* 638, 655, 2025).
15. **Poli, E., Baillie, D., Ferlaino, F., & Blakie, P. B. (2024).** *Excitations of a two-dimensional supersolid.* `arXiv:2407.01072`.
16. **Das, S., & Scarola, V. W. (2024).** *Unveiling Supersolid Order via Vortex Trajectory Correlations.* `arXiv:2407.02481`.
17. **Chauveau, G., Maury, C., Rabec, F., Heintze, C., et al. (2023).** *Superfluid fraction in an interacting spatially modulated Bose-Einstein condensate.* `arXiv:2302.01776`.
18. **Orso, G., & Stringari, S. (2023).** *Superfluid Fraction and Leggett Bound in a Density Modulated Strongly Interacting Fermi Gas at Zero Temperature.* `arXiv:2311.16709`.
19. **Chomaz, L., Ferrier-Barbut, I., Ferlaino, F., Laburthe-Tolra, B., et al. (2022/2023).** *Dipolar physics: A review of experiments with magnetic quantum gases.* `arXiv:2201.02672`.
20. **Norcia, M. A., Politi, C., Klaus, L., Poli, E., et al. (2021).** *Two-dimensional supersolidity in a dipolar quantum gas.* `arXiv:2102.05555` (*Nature* 596, 357, 2021).
21. **Brighi, P., Ljubotina, M., & Serbyn, M. (2022).** *Hilbert space fragmentation and slow dynamics in particle-conserving quantum East models.* `arXiv:2210.15607`.
22. **Khemani, V., Hermele, M., & Nandkishore, R. M. (2019/2020).** *Localization from Hilbert space shattering: from theory to physical realizations.* `arXiv:1910.01137`.
23. **Stephen, D. T., Nautrup, H. P., Bermejo-Vega, J., Eisert, J., & Raussendorf, R. (2018/2019).** *Subsystem symmetries, quantum cellular automata, and computational phases of quantum matter.* `arXiv:1806.08780`.
24. **Nandkishore, R. M., & Hermele, M. (2018/2019).** *Fractons.* `arXiv:1803.11196`.
25. **Boninsegni, M., & Prokof'ev, N. (2012).** *Supersolids: what and where are they?* `arXiv:1201.2227`.
26. **Fraser, J. M. (2026).** *An invitation to dimension interpolation.* `arXiv:2603.10729`.
27. **Lyu, H., & Mukherjee, S. (2024).** *Large random matrices with given margins.* `arXiv:2407.14942`.

### Optics, Collision Computing, Cognitive Modularity & Teleological Inference
28. **Gupta, C. (2026).** *Collision-based logic in Lenia and its composition boundary.* `arXiv:2609.01348`.
29. **Moreno, E., Soldevila, F., & Torrent, D. (2026).** *Optical free space extreme learning machine for the implementation of emergent complex systems.* `arXiv:2609.00933`.
30. **Li, G. H. Y., Leefmans, C. R., Williams, J., & Marandi, A. (2022).** *Photonic Elementary Cellular Automata for Simulation of Complex Phenomena.* `arXiv:2211.01811`.
31. **Compagno, D., & Zennaro, F. M. (2026).** *Teleological Inference in Structural Causal Models via Intentional Interventions.* `arXiv:2603.18968`.
32. **Kuhn, P., Pang, C., & Chauhan, S. (2026).** *Artificial Empathy: Towards a Framework for Unsupervised Agency Detection and Policy Reconstruction.* `arXiv:2608.23030`.
33. **Pontes-Filho, S., Nichele, S., & Lepperød, M. (2025).** *Reservoir Computing with Evolved Critical Neural Cellular Automata.* `arXiv:2508.02218`.
34. **Chen, Y., Lin, H., & Yan, J. (2024).** *The Gestalt Computational Model by Persistent Homology.* `arXiv:2405.20583`.
