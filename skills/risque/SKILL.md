---
name: risque
description: "Quantitative and systems-theoretic risk analysis and risk science (Risqué): SRA and Aven (C, U | K) risk ontology, Kaplan-Garrick scenario triplets, Fault and Event Tree PRA with Birnbaum, Fussell-Vesely, RAW, and RRW importance measures, STAMP and STPA unsafe control actions, NUREG/CR-6883 SPAR-H human reliability, Bayesian Beta-Binomial and Gamma-Poisson zero-failure updating, EVPI and EVSI Value of Information, Sobol global sensitivity, Extreme Value Theory (GEV, GPD) and coherent CVaR vs. VaR tail risk, Open FAIR cyber loss exceedance curves replacing ordinal 5x5 risk matrices, ALARP disproportion and F-N societal curves, and Perrow, Motter-Lai, and NIST AI RMF fail-closed safety envelopes. Triggers on: risque, Risqué, risk analysis, risk science, PRA, fault tree, event tree, minimal cut sets, Birnbaum, RAW, RRW, STPA, STAMP, SPAR-H, EVPI, EVSI, Sobol, GEV, GPD, CVaR, Expected Shortfall, Open FAIR, ALARP, F-N curve, Normal Accident Theory."
metadata:
  short-description: "Risqué (risque): Quantitative risk science, PRA, STPA, Bayesian VoI, EVT/CVaR tail risk, Open FAIR & ALARP governance"
---

# Risqué: Risk Analysis & Risk Science (risque)

## Overview

Ad-hoc risk assessments routinely fail in four predictable ways:
1. They compress orders of magnitude of probability and consequence into ordinal `5x5` Red/Yellow/Green matrices that suffer from rank reversal and range compression (Cox 2008).
2. They equate "zero failures observed in `n` tests" with `p = 0` failure probability, ignoring epistemic uncertainty and background knowledge strength `K` (Aven / SRA ontology).
3. They model complex software, firmware, and autonomous-agent systems as linear chains of independent hardware failures (`prod q_i`), missing both Common-Cause Failures (CCF) and unsafe control actions where no component "broke" (Leveson STAMP/STPA, Perrow Normal Accident Theory).
4. They optimize expected value `E[X]` or Value-at-Risk (`VaR`) in heavy-tailed or multiplicative regimes where subadditivity fails, tail severity beyond the quantile is ignored, and ensemble averages diverge from time-average trajectories toward absorbing ruin.

**Risqué (`risque`)** provides an 8-discipline risk science and engineering workflow grounded in the `166`-source Clef-weighted corpus at `yubi-OS/knowledge` (`skills/risque/01-*.md` through `08-*.md`). Every risk problem is first classified by uncertainty, coupling, and tail regime, then analyzed with the appropriate mathematical and systems-theoretic instrument.

## When to Use

- Formalizing a system, security boundary, deployment, or autonomous workflow risk assessment using the SRA `(C', Q, K)` risk description and Kaplan-Garrick scenario triplets `R = {<s_i, p_i, x_i>}`.
- Building deductive Fault Trees (`FTA`), Minimal Cut Sets (`MCS`), inductive Event Trees (`ETA`), or Bow-Tie barrier models, and ranking components by Birnbaum (`I^B`), Fussell-Vesely (`FV`), Risk Achievement Worth (`RAW`), and Risk Reduction Worth (`RRW`).
- Running control-loop hazard analysis (`STAMP`/`STPA`) on software, firmware, CI pipelines, or AI agents to enumerate Unsafe Control Actions (`UCAs`), replacing flawed FMECA `RPN = S * O * D` scores with Action Priority (`AP`), or computing human operator error rates via `SPAR-H` (`NUREG/CR-6883`).
- Updating failure probabilities or hazard rates under sparse or zero-failure evidence (`Beta-Binomial`, `Gamma-Poisson`), deciding whether to run another verification test via Expected Value of Sample Information (`EVSI` and `ENGS`), or decomposing variance via `Sobol` global sensitivity indices.
- Modeling heavy-tailed losses or latency spikes with Extreme Value Theory (`GEV` block maxima, `GPD` Peaks-Over-Threshold), optimizing coherent Conditional Value-at-Risk (`CVaR` / Expected Shortfall via Rockafellar-Uryasev linear/convex programming), or sizing repeated capital stakes (such as Steady Orbit `/forecasts/` Polymarket slips) under non-ergodic fractional Kelly drawdown constraints.
- Replacing qualitative `5x5` cyber/operational risk matrices with Open FAIR Monte Carlo Loss Exceedance Curves (`LEC`) aligned with `NIST SP 800-30 Rev. 1` and `ISO 31000:2018`.
- Evaluating risk acceptability and mitigation spend under UK HSE `ALARP` (Disproportion Factor `DF` x Value of Preventing a Fatality/Failure), societal `F-N` curves, Cumulative Prospect Theory, or the `IRGC` 4-class risk governance ladder.
- Auditing complex, tightly coupled systems (`Perrow` Normal Accident quadrant, `Motter-Lai` cascading overload `C_i = (1 + alpha) L_i^0`) and enforcing `NIST AI RMF 1.0` fail-closed safety envelopes.

## When NOT to Use

- Pure state-machine temporal logic verification (`Init /\ [][Next]_vars /\ WF_vars`) or counterexample trace generation without probabilistic/epistemic risk quantification: route to `tlaplus`.
- Theorem proving of exact algebraic or integer bounds in Lean 4: route to `papers/data/lean/`.
- Live Linux syscall or eBPF telemetry rule authoring in isolation: route to `continuous-runtime-detection-falco`.

## Core Risk Science Taxonomy & Method Router

Before computing numbers, classify the risk problem along four axes from the corpus (`Doc 01`, `Doc 06`, `Doc 07`, `Doc 08`):

| Problem Class | Dominant Mechanism | Wrong Tool (Anti-Pattern) | Canonical Risqué Instrument | Corpus Doc |
|---|---|---|---|---|
| **Epistemic / Framing** | Weak background knowledge `K`, unenumerated scenarios `s_{N+1}`, mixed aleatory and epistemic variance | Single point-estimate probability `p` or expected value `E[L] = p * c` | SRA `(C', Q, K)` Risk Description + Kaplan-Garrick Triplets + Law of Total Variance split | `Doc 01` |
| **Multi-Barrier Hardware / Trust Chain** | Boolean combinations of barrier failures and shared Common-Cause Failures (CCF) | Multiplying nominal independent failure probabilities `prod q_i` | Fault Tree (`FTA`) + Event Tree (`ETA`) Bow-Tie + Minimal Cut Sets + `Birnbaum`/`FV`/`RAW`/`RRW` + Beta-Factor CCF | `Doc 02` |
| **Software / Control / Human Loop** | Component interactions, flawed controller process models, timing/ordering errors, operator overload | Component-failure FMECA `RPN = S * O * D` | `STAMP`/`STPA` 4-column Unsafe Control Action (`UCA`) matrix + AIAG/VDA Action Priority + `SPAR-H` PSF saturation | `Doc 03` |
| **Sparse / Zero-Failure Data & Test Sizing** | `k = 0` failures observed in `n` trials; deciding whether another test run is worth its cost | Maximum-likelihood `p_hat = 0/n = 0` or arbitrary sample sizes | Conjugate `Beta(alpha + k, beta + n - k)` / `Gamma(alpha + k, beta + T)` + `EVPI`/`EVSI`/`ENGS` + `LHS` & `Sobol` indices | `Doc 04` |
| **Heavy Tails & Ruin-Prone Allocation** | Power-law extremes (`xi > 0`), skewed portfolio/system losses, multiplicative sequential bets | Gaussian assumption, non-subadditive `VaR_alpha`, or full-Kelly / expected-value maximization | `GPD` Peaks-Over-Threshold + Coherent `CVaR_alpha` (Rockafellar-Uryasev) + Fractional Kelly time-average growth `g` | `Doc 05` |
| **Cyber & Operational Loss** | Adversarial threat capability vs. control resistance; primary and secondary loss cascades | Ordinal `5x5` risk matrix (`Likelihood x Impact` cell colors) | `Open FAIR` v3.0 taxonomy (`LEF = TEF x Vuln`, `LM = PLM + SLEF x SLM`) simulated to a Loss Exceedance Curve (`LEC`) | `Doc 06` |
| **Governance & Acceptability Trade-offs** | Deciding when risk reduction is sufficient (`"how safe is safe enough?"`) and handling loss aversion | Unbounded spending on low-risk items or ignoring high-severity tail aversions | `ALARP` (`ICAF <= DF * VPF`), `F-N` societal criterion `F(N) <= C * N^{-alpha}`, Cumulative Prospect Theory, `IRGC` 4-tier escalation | `Doc 07` |
| **Cascading Networks & Autonomous Agents** | Tight coupling + interactive complexity; overload redistribution; probabilistic LLM/forecaster actions | Adding complex inline safety components that introduce hidden common modes, or letting forecasts authorize actions directly | `Perrow` decoupling (buffers, staging, cooldowns), `Motter-Lai` capacity margins, `HRO` practices, `NIST AI RMF` fail-closed policy gates | `Doc 08` |

## Mathematical & Analytical Formulations

### 1. SRA Ontology, Kaplan-Garrick Triplets & Variance Decomposition (`Doc 01`)

1. **Kaplan-Garrick Complete Triplet Set** (`NUREG/Kaplan & Garrick 1981`, weight `0.9560`):
   $$
   R = \{\langle s_i, p_i, x_i \rangle\}_{i=1}^N \cup \{\langle s_{N+1}, p_{N+1}, x_{N+1} \rangle\}
   $$
   where $s_i$ is scenario $i$, $p_i$ is its probability (or probability distribution over frequency $f_i$), $x_i$ is the consequence vector, and $s_{N+1}$ is the residual *"all other unenumerated scenarios"* bucket ensuring partition completeness $\sum_{i=1}^{N+1} p_i = 1$.
2. **Aven / SRA `(C', Q, K)` Risk Description** (`SRA Glossary`, weight `0.9375`; `Aven 2015`, weight `0.9036`):
   - **Risk Concept**: $(C, U)$, future consequences $C$ and associated uncertainty $U$ (what will happen and how severe will it be?).
   - **Operational Risk Description**: $(C', Q, K)$, where $C'$ are the specified consequences of interest, $Q$ is the uncertainty measure (probability distribution, imprecise probability interval, or qualitative uncertainty judgment), and $K$ is the explicitly graded **Background Knowledge Strength** (`Strong`, `Moderate`, `Weak`).
   - **Knowledge-Strength Rubric (`K`)**: Score `K = Weak` whenever (a) key assumptions lack empirical falsification, (b) phenomenology is partially unknown, (c) experts or models disagree strongly, or (d) historical data is extrapolated into a new architectural regime. When `K = Weak`, a narrow probability interval $Q$ is deceptive; widen gates or escalate to precautionary containment (`Doc 07`).
3. **Law of Total Variance (Aleatory vs. Epistemic Split)** (`arXiv:2607.15196`, weight `0.9119`; `Law of total variance`, weight `0.8067`):
   $$
   \mathrm{Var}(Y) = \underbrace{\mathbb{E}_{\theta}\!\left[\mathrm{Var}(Y \mid \theta)\right]}_{\text{Aleatory (irreducible stochasticity)}} + \underbrace{\mathrm{Var}_{\theta}\!\left(\mathbb{E}[Y \mid \theta]\right)}_{\text{Epistemic (reducible via data/probes)}}
   $$

### 2. Fault/Event Tree PRA, Common-Cause Failures & Importance Measures (`Doc 02`)

Given top-event failure probability $R_0 = P(\Phi(\mathbf{x}) = 1)$ expressed over Minimal Cut Sets $C_1, \dots, C_m$ (`NUREG-0492`, weight `0.9645`; `NTNU Ch. 5`, weight `0.9160`; `NRC ML12160A479`, weight `0.8922`):

1. **Inclusion-Exclusion & Rare-Event Bounds**:
   $$
   \sum_{j=1}^m P(C_j) - \sum_{j < k} P(C_j \cap C_k) \le R_0 \le \sum_{j=1}^m P(C_j)
   $$
2. **Common-Cause Shock Requirement**: For redundant parallel barriers $A, B$ with nominal unavailability $q$, always include a common-cause basic event $q_{\text{CCF}} = \beta q$ (typical hardware/software $\beta \in [0.01, 0.15]$) so cut-set probability is $(1-\beta)^2 q^2 + \beta q \gg q^2$.
3. **The Four Canonical Importance Measures** for component $i$ with basic-event probability $q_i$:
   - **Birnbaum Structural Sensitivity**: $I_i^B = \frac{\partial R}{\partial q_i} = R(q_i = 1) - R(q_i = 0)$
   - **Fussell-Vesely Fractional Contribution**: $FV_i = \frac{P(\bigcup_{j : i \in C_j} C_j)}{R_0} \approx \frac{R_0 - R(q_i = 0)}{R_0}$
   - **Risk Achievement Worth (Defense-in-Depth Degradation Spike)**: $RAW_i = \frac{R(q_i = 1)}{R_0}$
   - **Risk Reduction Worth (Maximum Single-Point Hardening Leverage)**: $RRW_i = \frac{R_0}{R(q_i = 0)} = \frac{1}{1 - FV_i}$

### 3. STAMP/STPA Control Loops, FMECA Action Priority & SPAR-H (`Doc 03`)

1. **STPA 4-Column Unsafe Control Action (`UCA`) Matrix** (`MIT SAFECOMP 2015`, weight `0.9604`; `EU STAMP Workshop`, weight `0.8181`):
   For every Controller $\to$ Control Action (`CA`) $\to$ Controlled Process loop, evaluate all 4 hazard modes linked to system-level hazards $H_k$:
   - **Type 1 (`Not Provided`)**: Controller fails to issue `CA` when required for safety (e.g., watchdog fails to sever a misbehaving PCI/bridge session).
   - **Type 2 (`Provided Unsafely`)**: Controller issues `CA` when conditions make it hazardous (e.g., dispatching `ci_flash-device-e2e.yml` before `merge-manifest` digest propagation completes on Docker Hub).
   - **Type 3 (`Wrong Timing / Order`)**: `CA` is issued too early, too late, or out of sequence (e.g., launching heavy compilation on a remote host before checking `uptime` and top CPU/I/O load).
   - **Type 4 (`Wrong Duration`)**: Continuous `CA` is stopped too soon or applied too long (e.g., holding a polling sleep loop past the session timeout).
2. **Replacement of FMECA `RPN = S * O * D`** (`Mech Codex AIAG/VDA`, weight `0.6325`):
   Never rank failure modes by the product $S \times O \times D$ (which maps $10^3 = 1000$ triples onto only $120$ distinct integers and equates $(S=10, O=1, D=2) = 20$ with $(S=2, O=5, D=2) = 20$). Rank strictly lexicographically by **Severity first** ($S \in \{9, 10\}$ is automatically High Action Priority regardless of $O$ and $D$), then Occurrence $O$, then Detection $D$.
3. **SPAR-H Human Error Probability (`NUREG/CR-6883`)** (`ResearchGate PSF study`, weight `0.8562`; `SCIRP NUREG/CR-6883`, weight `0.7261`):
   With nominal rates $\text{HEP}_{\text{nom}} = 0.01$ (diagnosis/cognitive) and $\text{HEP}_{\text{nom}} = 0.001$ (execution/action) and composite multiplier $\text{PSF}_{\text{comp}} = \prod_{m=1}^8 \text{PSF}_m$:
   $$
   \text{HEP} = \begin{cases}
   \text{HEP}_{\text{nom}} \cdot \text{PSF}_{\text{comp}} & \text{if fewer than 3 negative PSFs are present} \\[4pt]
   \dfrac{\text{HEP}_{\text{nom}} \cdot \text{PSF}_{\text{comp}}}{\text{HEP}_{\text{nom}} \cdot (\text{PSF}_{\text{comp}} - 1) + 1} & \text{when } \ge 3 \text{ negative PSFs apply (keeps } \text{HEP} < 1\text{)}
   \end{cases}
   $$

### 4. Bayesian Zero-Failure Updating, Value of Information & Sobol Sensitivity (`Doc 04`)

1. **Zero-Failure Conjugate Updating** (`Durham Zero-Failure Thesis`, weight `0.7844`; `SciSim Beta-Binomial`, weight `0.7307`):
   - **Binomial demands ($k$ failures in $n$ trials)** with prior $\text{Beta}(\alpha, \beta)$: posterior is $\text{Beta}(\alpha + k, \beta + n - k)$ with posterior mean $\hat{p} = \frac{\alpha + k}{\alpha + \beta + n}$. For $k = 0$ under Jeffreys prior $\text{Beta}(0.5, 0.5)$, $\hat{p} = \frac{0.5}{n + 1}$, and the upper $(1-\gamma)$ credible bound on failure probability after $n$ clean runs with uniform prior $\text{Beta}(1,1)$ is:
     $$
     p_{1-\gamma} = 1 - \gamma^{\frac{1}{n+1}} \approx \frac{-\ln \gamma}{n+1}
     $$
     (e.g., $95\%$ confidence that $p \le 0.05$ requires $n \ge \frac{\ln(0.05)}{\ln(0.95)} - 1 \approx 58$ zero-failure runs).
   - **Poisson continuous exposure ($k$ failures in time $T$)** with prior $\text{Gamma}(\alpha, \beta)$: posterior is $\text{Gamma}(\alpha + k, \beta + T)$ with mean rate $\hat{\lambda} = \frac{\alpha + k}{\beta + T}$.
2. **Preposterior Value of Information (`EVPI`, `EVSI`, `ENGS`)** (`Bayesian Data Analysis`, weight `0.8551`):
   $$
   \mathrm{EVPI} = \mathbb{E}_{\theta}\!\left[\max_{a \in \mathcal{A}} U(a, \theta)\right] - \max_{a \in \mathcal{A}} \mathbb{E}_{\theta}\!\left[U(a, \theta)\right]
   $$
   $$
   \mathrm{EVSI}(e) = \mathbb{E}_{z}\!\left[\max_{a \in \mathcal{A}} \mathbb{E}_{\theta \mid z}\!\left[U(a, \theta)\right]\right] - \max_{a \in \mathcal{A}} \mathbb{E}_{\theta}\!\left[U(a, \theta)\right], \quad \mathrm{ENGS}(e) = \mathrm{EVSI}(e) - C(e)
   $$
   **Stopping rule**: Never run a diagnostic test or probe whose cost $C(e) > \mathrm{EVPI}$, and execute experiment $e^*$ only if $\mathrm{ENGS}(e^*) > 0$.
3. **Variance-Based Global Sensitivity (`Sobol` Indices)** (`Sobol MC Algorithms`, weight `0.8792`; `Wang Variance Reduction`, weight `0.9063`):
   $$
   S_i = \frac{\mathrm{Var}_{X_i}\!\left(\mathbb{E}_{\mathbf{X}_{\sim i}}[Y \mid X_i]\right)}{\mathrm{Var}(Y)}, \qquad S_{T_i} = \frac{\mathbb{E}_{\mathbf{X}_{\sim i}}\!\left[\mathrm{Var}_{X_i}(Y \mid \mathbf{X}_{\sim i})\right]}{\mathrm{Var}(Y)}
   $$
   Parameters with $S_{T_i} < 0.01$ can be frozen at nominal constants; parameters with $S_{T_i} - S_i \gg 0$ drive nonlinear interaction risk and cannot be tested one-at-a-time (use parallel matrix variants).

### 5. Extreme Value Theory (`GEV`/`GPD`), Coherent `CVaR` & Non-Ergodic Ruin (`Doc 05`)

1. **Peaks-Over-Threshold (`GPD`) Closed-Form Tail Quantiles & Expected Shortfall** (`Aalto EVT`, weight `0.9455`; `arXiv:2108.05066`, weight `0.9256`; `Tasche ES`, weight `0.9002`):
   For losses $X$ exceeding high threshold $u$ with exceedance count $N_u$ out of $n$ observations, fit Generalized Pareto parameters $(\xi, \beta)$ to excesses $Y = X - u$. For confidence level $\alpha > 1 - N_u / n$ and $\xi < 1$:
   $$
   \mathrm{VaR}_{\alpha} = u + \frac{\beta}{\xi}\!\left[\left(\frac{n}{N_u}(1 - \alpha)\right)^{-\xi} - 1\right], \qquad \mathrm{CVaR}_{\alpha} = \frac{\mathrm{VaR}_{\alpha} + \beta - \xi u}{1 - \xi}
   $$
2. **Rockafellar-Uryasev Convex Optimization of `CVaR`** (`Rockafellar & Uryasev 2000`, weight `0.9379`):
   Unlike $\mathrm{VaR}_{\alpha}$ (which violates Artzner's subadditivity axiom $\rho(L_1 + L_2) \le \rho(L_1) + \rho(L_2)$ and is non-convex), $\mathrm{CVaR}_{\alpha}(L)$ is a coherent risk measure minimized jointly via the convex auxiliary function:
   $$
   \mathrm{CVaR}_{\alpha}(L) = \min_{\zeta \in \mathbb{R}} \left\{ \zeta + \frac{1}{(1 - \alpha) S} \sum_{s=1}^S \max(L_s - \zeta, 0) \right\}
   $$
3. **Non-Ergodic Multiplicative Growth & Fractional Kelly Sizing** (`NYCIF Ergodicity`, weight `0.5027`):
   In repeated multiplicative allocation with stake fraction $f$ and net return $R_t \in [-1, b]$, the time-average logarithmic growth rate is $g(f) = \mathbb{E}[\ln(1 + f R_t)] \le \ln(1 + f \mathbb{E}[R_t])$. Full Kelly $f^* = \frac{p b - q}{b}$ maximizes $g(f)$ under exact probabilities $(p, q = 1-p)$, while betting $f \ge 2 f^*$ yields $g(f) \le 0$ despite positive expected value. Under epistemic estimation error on $p$, cap stake sizes at fractional Kelly $f = \kappa f^*$ with $\kappa \in [0.25, 0.50]$ plus hard per-leg and concentration caps.

### 6. Open FAIR Quantitative Cyber Risk & Cox Matrix Theorem (`Doc 06`)

1. **Why `5x5` Risk Matrices Are Banned for Quantitative Gating** (`NIST SP 800-30 Rev. 1`, weight `0.9762`; `Cox 2008 review`, weight `0.4995` `[weak backing]`):
   Any discrete $m \times m$ Likelihood $\times$ Severity table exhibits **range compression** (collapsing $10^4\times$ variance into one cell) and **rank reversal** (assigning a higher qualitative priority to a pair with smaller quantitative product $p_1 c_1 < p_2 c_2$ when true inputs are negatively correlated or cross grid boundaries).
2. **Open FAIR v3.0 Monte Carlo Decomposition** (`Open FAIR Standard v3.0`, weight `0.9772`; `ISO 31000`, weight `0.9729`):
   Sample $M \ge 10{,}000$ trials from three-point `PERT(min, mode, max)` or `Lognormal` distributions:
   - $\mathrm{TEF}_s \sim \mathrm{PERT}(\text{min}, \text{mode}, \text{max})$ (Threat Event Frequency per year)
   - $\mathrm{Vuln}_s = \mathbb{I}(\mathrm{TCap}_s > \mathrm{RS}_s)$ or $\mathrm{PERT}(v_{\min}, v_{\text{mode}}, v_{\max})$ (Probability threat overcomes resistance)
   - $\mathrm{LEF}_s = \mathrm{TEF}_s \times \mathrm{Vuln}_s$, drawing annual event count $K_s \sim \mathrm{Poisson}(\mathrm{LEF}_s)$
   - Annual Loss $L_s = \sum_{k=1}^{K_s} \left(\mathrm{PLM}_{s,k} + \mathbb{I}_{\text{sec},s,k} \cdot \mathrm{SLM}_{s,k}\right)$
   Report the **Loss Exceedance Curve** $\mathrm{LEC}(x) = \frac{1}{M}\sum_{s=1}^M \mathbb{I}(L_s > x)$ alongside percentiles $(P_{50}, P_{90}, P_{95}, \mathrm{CVaR}_{0.95})$.

### 7. ALARP Disproportion, Societal `F-N` Curves & IRGC Governance (`Doc 07`)

1. **ALARP Cost-Benefit Disproportion Test** (`61508.org ALARP Guidance`, weight `0.8875`; `FERC RIDM`, weight `0.9484`; `Dam Risk Acceptance Criteria`, weight `0.9511`):
   A risk in the tolerable ALARP band ($10^{-6}\text{/yr}$ to $10^{-3}\text{/yr}$ worker or $10^{-4}\text{/yr}$ public) must be mitigated unless the Implied Cost of Averting a Failure/Fatality (`ICAF`) exceeds the Value of a Prevented Failure (`VPF`) multiplied by the **Disproportion Factor (`DF` $\in [2, 10]$)**:
   $$
   \mathrm{ICAF} = \frac{\Delta \mathrm{Cost}_{\text{annualized}}}{\Delta R_{\text{annualized}}} > \mathrm{DF} \times \mathrm{VPF}
   $$
2. **Cumulative Prospect Theory Weighting** (`Tversky & Kahneman 1992`, weight `0.8009`; `CPT`, weight `0.8719`):
   Human decision-makers evaluate gains and losses relative to a reference point with loss aversion $\lambda > 1$ and inverse-S probability weighting $w(p) = \frac{p^\gamma}{(p^\gamma + (1-p)^\gamma)^{1/\gamma}}$, systematically overweighting rare salient tails and underweighting high-probability routine drift.
3. **IRGC 4-Class Governance Escalation** (`IRGC Risk Governance`, weight `0.9353`; `Precautionary Principle`, weight `0.8235`):
   - `Simple` $\to$ Standard operating rules & automated statistical gates.
   - `Complex` $\to$ Explicit causal graph modeling (`FTA`/`ETA`/`STPA`/Bayesian updating).
   - `Uncertain` (low `K` or fat tail $\xi > 0$) $\to$ Precautionary resilience, blast-radius containment, reversible staged rollouts, and ALARP disproportion factor $\mathrm{DF} \ge 5$.
   - `Ambiguous` $\to$ Explicit human-in-the-loop approval binding (`jev` gate or draft-and-approve).

### 8. Normal Accidents, Cascading Overload & AI Safety Envelopes (`Doc 08`)

1. **Perrow Interaction $\times$ Coupling Diagnostic** (`Normal Accidents`, weight `0.9022`):
   When a subsystem sits in Quadrant 4 (**Complex Interactions + Tight Coupling**, e.g. shared storage I/O between root OS and a heavy multi-hour build, or an autonomous agent directly mutating production branches), adding inline automated retry loops *increases* system risk. Structural fix: **decouple** by inserting explicit buffers, `cgroup v2 io.max` rate caps, staging branches, cooldown windows, and one-shot status checks.
2. **Motter-Lai Cascade Threshold** (`Motter & Lai Phys. Rev. E 2002`, weight `0.9390` and `0.9106`):
   Each node $i$ with initial load $L_i^0$ requires capacity $C_i = (1 + \alpha) L_i^0$. If tolerance parameter $\alpha$ falls below the critical percolation threshold $\alpha_c$, a single node removal triggers a global overload cascade across the network.
3. **NIST AI RMF 1.0 & Fail-Closed Autonomy Gate** (`NIST AI 100-1`, weight `0.9713`; `Claremont AI Controls`, weight `0.9212`):
   Map every autonomous workflow across `GOVERN -> MAP -> MEASURE -> MANAGE`. Probabilistic models (`@cf/cloudflare/clef`, `@cf/cloudflare/clairic`, LLM subagents) **advise, never authorize**: every state-mutating action passes through a deterministic policy gate with an expiring approval binding, pre-registered outcomes ledger row, and post-action state verification.

## Complete Corpus Reference Matrix

All 8 corpus documents live in `yubi-OS/knowledge` under `skills/risque/` (and mirrored in `yubi-OS/yubiOS` under `skills/risque/` and locally in `skills/github-yubios-KS9n5GAT/risque/`):

| # | Corpus Document | Primary Focus & Mathematical Instruments |
|---|---|---|
| `01` | [`01-foundations-of-risk-science-and-sra-ontology.md`](./01-foundations-of-risk-science-and-sra-ontology.md) | SRA ontology, Kaplan-Garrick triplets `R = {<s_i, p_i, x_i>}`, Aven `(C, U \| K)` & `(C', Q, K)`, Law of Total Variance epistemic/aleatory split, black-swan taxonomy |
| `02` | [`02-probabilistic-risk-assessment-fault-and-event-trees.md`](./02-probabilistic-risk-assessment-fault-and-event-trees.md) | NUREG-0492 Fault Trees, Minimal Cut Sets, Event Trees, Bow-Tie synthesis, Common-Cause beta-factor, Birnbaum, Fussell-Vesely, RAW, and RRW importance measures |
| `03` | [`03-systems-theoretic-and-human-reliability-risk-models.md`](./03-systems-theoretic-and-human-reliability-risk-models.md) | STAMP/STPA 4-step control-loop hazard analysis, 4-column UCA table, FMECA RPN critique vs. AIAG/VDA Action Priority, HAZOP guidewords, NUREG/CR-6883 SPAR-H HRA |
| `04` | [`04-bayesian-inference-monte-carlo-and-uncertainty-propagation.md`](./04-bayesian-inference-monte-carlo-and-uncertainty-propagation.md) | Beta-Binomial & Gamma-Poisson zero-failure updating, Preposterior `EVPI`/`EVSI`/`ENGS`, Latin Hypercube Sampling, 2D Monte Carlo, Sobol global sensitivity indices |
| `05` | [`05-extreme-value-theory-tail-risk-and-coherent-measures.md`](./05-extreme-value-theory-tail-risk-and-coherent-measures.md) | GEV block maxima, GPD Peaks-Over-Threshold closed-form VaR/CVaR, Artzner coherent risk axioms, Rockafellar-Uryasev convex CVaR, non-ergodic fractional Kelly |
| `06` | [`06-cyber-and-operational-risk-quantification-fair-nist-iso.md`](./06-cyber-and-operational-risk-quantification-fair-nist-iso.md) | Open FAIR v3.0 (`LEF = TEF x Vuln`, Primary/Secondary Loss), Loss Exceedance Curves (`LEC`), Cox `5x5` risk matrix theorem, ISO 31000:2018, IEC 31010, NIST SP 800-30 Rev. 1 |
| `07` | [`07-decision-analysis-risk-appetite-and-alarp-governance.md`](./07-decision-analysis-risk-appetite-and-alarp-governance.md) | UK HSE ToR & ALARP (`ICAF <= DF x VPF`), societal F-N exceedance curves, Expected Utility vs. Tversky-Kahneman Cumulative Prospect Theory, IRGC 4-class risk governance |
| `08` | [`08-systemic-cascading-and-ai-autonomy-risk-engineering.md`](./08-systemic-cascading-and-ai-autonomy-risk-engineering.md) | Perrow Normal Accident Theory (`Complexity x Coupling`), Motter-Lai cascading overload capacity, Weick-Sutcliffe HRO 5 principles, NIST AI RMF 1.0 fail-closed safety envelopes |

## Anti-patterns

- **Ordinal `5x5` Risk Matrices and FMECA `RPN` Multiplication**: Multiplying ordinal `1..5` or `1..10` ranks (`Likelihood x Impact` or `S x O x D`) to prioritize engineering or security work. Use Open FAIR Monte Carlo Loss Exceedance Curves (`Doc 06`) or lexicographic Severity-first Action Priority (`Doc 03`).
- **The Zero-Failure Frequentist Fallacy (`0 / n = 0`)**: Claiming a deployment, firmware build, or test suite has zero risk after `n` green runs. Always report the Bayesian posterior mean $\frac{\alpha}{\alpha + \beta + n}$ or upper $(1-\gamma)$ credible bound $1 - \gamma^{1/(n+1)}$ (`Doc 04`).
- **Naive Independence Across Redundant Barriers (`prod q_i`)**: Multiplying failure probabilities of redundant layers that share a power rail, storage device (`mmcblk0`), compiler toolchain, or operator credential without a Common-Cause Failure (`beta-factor`) floor (`Doc 02`).
- **Using `VaR` or Expected Value in Heavy-Tailed / Multiplicative Regimes**: Optimizing mean return or a `95%` VaR threshold when tail index $\xi > 0$ or stakes compound sequentially. Always compute coherent `CVaR` (`Doc 05`) and cap sequential exposure via fractional Kelly.
- **Treating Probabilistic Forecasts as Execution Authority**: Letting a classifier or forecast model directly trigger irreversible mutations without a fail-closed deterministic policy gate and an outcomes-ledger pair (`Doc 08`).

## Interaction with Other Skills

- **`jev-orchestrator` / `jev-timeseries` / `a-vs-b-slip-roi-audit`**: `risque` supplies the mathematical foundation for `/jev/` fail-closed policy gating (`Doc 08`), preposterior Value of Information (`Doc 04`), and fractional-Kelly / `CVaR` tail-risk bounds on `$200` paired `#A`/`#B` Polymarket slips (`Doc 05`).
- **`tlaplus`**: Use `risque` (`Doc 03` STPA + `Doc 02` FTA/ETA) to identify the system hazards, Unsafe Control Actions (`UCAs`), and critical cut sets first; then formalize the resulting safety constraints as TLA+ `SafetyInv` invariants in `tlaplus`.
- **`doubt-driven-development` & `falsification-corpus`**: Pre-mortem falsification (`Doc 08`) and Bayesian `EVSI` test-sizing (`Doc 04`) quantify which assumptions have the lowest knowledge strength `K` (`Doc 01`) and highest `RAW`/`Sobol` sensitivity (`Doc 02`, `Doc 04`).
- **`security-and-hardening` & `audit-evidence-packaging`**: Open FAIR loss exceedance curves and `NIST SP 800-30 Rev. 1` threat-vulnerability decompositions (`Doc 06`) structure quantitative security risk registers and auditable evidence bundles.

## Examples

### Example 1: Complete Python Quantitative Risk Toolkit (PRA Importance + Bayesian Zero-Failure + GPD/CVaR + Open FAIR LEC)

```python
#!/usr/bin/env python3
"""
Risqué (risque) reference calculator:
1. Fault-Tree Minimal Cut Set probabilities & Birnbaum / FV / RAW / RRW importance (Doc 02)
2. Bayesian Beta-Binomial zero-failure credible bound & EVPI/ENGS gate (Doc 04)
3. Empirical & GPD Peaks-Over-Threshold VaR / Coherent CVaR (Doc 05)
4. Open FAIR PERT Monte Carlo Loss Exceedance Curve (Doc 06)
"""
import math
import random

def pra_importance_audit(cut_sets: list[list[str]], probs: dict[str, float]) -> dict:
    def eval_top(q_map: dict[str, float]) -> float:
        # Esary-Proschan upper bound over minimal cut sets: 1 - prod_j (1 - P(C_j))
        prod_survive = 1.0
        for cs in cut_sets:
            p_cs = 1.0
            for comp in cs:
                p_cs *= q_map[comp]
            prod_survive *= (1.0 - p_cs)
        return 1.0 - prod_survive

    r0 = eval_top(probs)
    metrics = {}
    for comp, q_i in probs.items():
        q_one = {**probs, comp: 1.0}
        q_zero = {**probs, comp: 0.0}
        r_one = eval_top(q_one)
        r_zero = eval_top(q_zero)
        birnbaum = r_one - r_zero
        fv = (r0 - r_zero) / r0 if r0 > 0 else 0.0
        raw = r_one / r0 if r0 > 0 else 1.0
        rrw = r0 / r_zero if r_zero > 0 else float("inf")
        metrics[comp] = {
            "q": q_i,
            "Birnbaum": round(birnbaum, 6),
            "Fussell_Vesely": round(fv, 4),
            "RAW": round(raw, 2),
            "RRW": round(rrw, 2),
        }
    return {"R0": round(r0, 6), "components": metrics}

def bayesian_zero_failure_bound(n_clean_runs: int, confidence: float = 0.95) -> dict:
    alpha_tail = 1.0 - confidence
    upper_bound = 1.0 - (alpha_tail ** (1.0 / (n_clean_runs + 1)))
    jeffreys_mean = 0.5 / (n_clean_runs + 1.0)
    laplace_mean = 1.0 / (n_clean_runs + 2.0)
    return {
        "n_clean_runs": n_clean_runs,
        "confidence": confidence,
        "upper_credible_bound": round(upper_bound, 5),
        "jeffreys_posterior_mean": round(jeffreys_mean, 5),
        "laplace_posterior_mean": round(laplace_mean, 5),
    }

def coherent_cvar(losses: list[float], alpha: float = 0.95) -> dict:
    ordered = sorted(losses)
    n = len(ordered)
    idx = min(max(int(math.ceil(alpha * n)) - 1, 0), n - 1)
    var_alpha = ordered[idx]
    tail = ordered[idx:]
    cvar_alpha = sum(tail) / len(tail)
    return {
        "alpha": alpha,
        "VaR": round(var_alpha, 2),
        "CVaR": round(cvar_alpha, 2),
        "tail_count": len(tail),
    }

if __name__ == "__main__":
    # yubiOS boot-chain example: Cut sets {PIV_Bypass, fTPM_Bypass}, {CCF_Storage}, {LUKS_FIDO2_Fault, Homed_Fault}
    cs = [["piv", "ftpm"], ["ccf_storage"], ["luks", "homed"]]
    q = {"piv": 0.005, "ftpm": 0.01, "ccf_storage": 0.0015, "luks": 0.008, "homed": 0.02}
    print("PRA Audit:", pra_importance_audit(cs, q))
    print("Zero-Failure (n=25):", bayesian_zero_failure_bound(25, 0.95))
```

### Example 2: STPA Unsafe Control Action (`UCA`) & Perrow Coupling Audit Table

When reviewing a new CI workflow, hardware flash script, or `/jev/` automation route, produce a structured STPA + Perrow table before approving deployment:

```markdown
| Controller -> Action | UCA Type | Hazard Scenario | Perrow Quadrant | Structural Mitigation (Gate / Buffer) |
|---|---|---|---|---|
| CI Orchestrator -> `ci_flash-device-e2e.yml` | Type 2 (Provided Unsafely) | Dispatched while `merge-manifest` is still running; flashes stale Docker Hub digest | Complex + Tight | Gate on `merge-manifest` completion AND `HEAD` manifest digest match (`RAW = 556x`) |
| Build Runner -> `ubuntu` SoC Storage (`mmcblk0`) | Type 3 (Wrong Timing / Load) | Launching heavy compilation while load > 11 or without `io.max` throttle wedges eMMC | Complex + Tight | Check `uptime` + `ps --sort=-pcpu` first; pin to 2 cores under `cgroup v2 io.max` |
| Forecaster Cron -> `forecaster:cron-delta-v1` KV | Type 4 (Applied Too Long) | Uncompacted delta grows past 25 MiB KV cap; swallowed `put` silently halts slip minting | Linear + Tight | Enforce payload byte-size ceiling + surface KV write failures in audit telemetry |
```

## Guidelines

1. **State `(C', Q, K)` upfront**: Every risk report must explicitly grade Background Knowledge Strength `K` (`Strong`, `Moderate`, `Weak`) alongside probability/interval `Q` and consequence `C'` (`Doc 01`). Never hide weak `K` behind a precise-looking decimal.
2. **Include Common-Cause Failures (`CCF`) in every multi-barrier model**: Whenever two or more barriers share hardware, OS kernel, credentials, or operator workflow, add an explicit $\beta$-factor common-cause cut set before computing `RAW` and `RRW` (`Doc 02`).
3. **Run STPA on control loops, not just FMECA on parts**: Software, firmware, and AI-agent incidents arise from unsafe control actions under flawed process models; always populate the 4-column STPA `UCA` table (`Not Provided`, `Provided Unsafely`, `Wrong Timing/Order`, `Wrong Duration`) (`Doc 03`).
4. **Use Bayesian updating and `ENGS` for test sizing**: Replace `0/n = 0` claims with `Beta-Binomial` / `Gamma-Poisson` credible upper bounds, and run additional verification probes only when Expected Net Gain of Sampling $\mathrm{ENGS}(e) = \mathrm{EVSI}(e) - C(e) > 0$ (`Doc 04`).
5. **Report coherent `CVaR` and time-average growth `g`, never `VaR` or mean return alone**: For skewed or heavy-tailed distributions, always report $\mathrm{CVaR}_{\alpha}$ alongside $\mathrm{VaR}_{\alpha}$, and enforce fractional Kelly caps on sequential capital/resource allocation (`Doc 05`).
6. **Replace `5x5` matrices with Open FAIR distributions and ALARP disproportion**: Express cyber and operational risks as `PERT`/`Lognormal` Loss Exceedance Curves (`Doc 06`) and evaluate mitigation spend against $\mathrm{ICAF} \le \mathrm{DF} \times \mathrm{VPF}$ (`Doc 07`).
7. **Decouple tightly coupled complex paths**: In Perrow's Complex + Tightly Coupled quadrant, prefer structural decoupling (staging branches, `io.max` cgroups, cooldowns, fail-closed human/policy gates) over complex inline retry loops (`Doc 08`).

## Verification

- [ ] Every risk assessment states `(C', Q, K)` with an explicit `K` rating (`Strong`, `Moderate`, `Weak`) and lists the assumptions backing `K`.
- [ ] Multi-barrier PRA models include a Common-Cause Failure (`CCF`) term and report all four importance measures (`Birnbaum`, `Fussell-Vesely`, `RAW`, `RRW`).
- [ ] Control/automation workflows include a 4-column STPA Unsafe Control Action (`UCA`) check and avoid raw FMECA `RPN` or `5x5` matrix multiplication.
- [ ] Zero-failure test results report a Bayesian upper credible bound $p_{1-\gamma} = 1 - \gamma^{1/(n+1)}$ rather than `p = 0`.
- [ ] Tail-risk and sequential allocation analyses report coherent $\mathrm{CVaR}_{\alpha}$ and verify non-negative time-average logarithmic growth $g(f) > 0$.
- [ ] All 8 companion corpus documents (`01-*.md` through `08-*.md`) are present alongside `SKILL.md` in `yubi-OS/knowledge/skills/risque/` and `yubi-OS/yubiOS/skills/risque/`.

## Changelog

- **2026-11-27**: Initial OpenAI 2.2 spec skill (**Risqué** / `risque`) authored from the 8-doc Clef-weighted `skills/risque/` knowledge corpus in `yubi-OS/knowledge` (`166` weighted sources across `43` `/api/decide` calls, `70` primary sources with `weight >= 0.50`).
