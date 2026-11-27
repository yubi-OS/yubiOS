# 04. Bayesian Risk Inference, Value of Information & Uncertainty Propagation

> **Scope:** Bayesian risk updating with sparse/zero-failure operational data (Beta-Binomial, Gamma-Poisson, hierarchical priors), Preposterior decision analysis and Value of Information (EVPI, EVSI), Monte Carlo and Latin Hypercube Sampling (LHS) propagation, and variance-based global sensitivity analysis (Sobol indices).

**Grounding convention.** Every factual claim cites a result from the Clef-weighted dig record (`research-db/digs/04-bayesian-inference-monte-carlo-and-uncertainty-propagation.json`) with its `weight`. Weight >= 0.50 is authoritative backing; anything below is labeled `[weak backing, weight: 0.xxxx]`. The equations are standard mathematical definitions anchored to the sources cited beside them. The dig ran 4 queries over 2 attempts (224 raw results, 20 kept, 8 at weight >= 0.50, 1 redo).

## 1. Bayesian updating as the core risk operator

Bayesian inference derives the posterior probability from 2 antecedents: a prior probability and a likelihood function derived from a statistical model for the observed data ([Bayesian inference, Wikipedia](https://en.wikipedia.org/wiki/Bayesian_inference), weight: 0.8229). Bayesian calibration combines prior knowledge about parameters with the information in the observed data and is described as arguably the soundest approach to parameter calibration on both statistical and philosophical grounds, citing Gelman et al. (2013) ([Bayesian Data Analysis, ResearchGate](https://www.researchgate.net/publication/271076919_Bayesian_Data_Analysis), weight: 0.8551). Bayesian statistics is a theory in the field of statistics built on this interpretation of probability ([Bayesian statistics, Wikipedia](https://en.wikipedia.org/wiki/Bayesian_statistics), weight: 0.4225) [weak backing, weight: 0.4225].

In risk work, this matters most where operational data are sparse: a handful of demands, a short exposure window, or zero observed failures. Conjugate families make the prior-times-likelihood update closed-form. Engineering primers group the Beta-Binomial and Gamma-Poisson pairs together as the standard conjugate models ([Bayesian Thinking for Engineers, AI Wiki Project](https://aiwikiproject.com/articles/bayesian-thinking-for-engineers), weight: 0.1477) [weak backing, weight: 0.1477].

### 1.1 Beta-Binomial: per-demand failure probability

The Beta distribution is conjugate to the Binomial: prior times likelihood keeps the same distributional form, so the posterior is analytically tractable and needs no MCMC ([Bayesian Inference, Beta-Binomial Conjugate, SciSim](https://scisim.org/sims/statistics/45_bayesian_beta_binomial), weight: 0.7307). Let the per-demand failure probability be `p ~ Beta(alpha, beta)`. After observing `k` failures in `n` demands:

```
p | (k, n) ~ Beta(alpha + k, beta + n - k)
E[p | k, n] = (alpha + k) / (alpha + beta + n)
```

Zero-failure case (`k = 0`):

| Prior | Posterior | Posterior mean |
|---|---|---|
| Uniform `Beta(1, 1)` | `Beta(1, 1 + n)` | `1 / (n + 2)` (Laplace's rule of succession) |
| Jeffreys `Beta(0.5, 0.5)` | `Beta(0.5, 0.5 + n)` | `0.5 / (n + 1)` |

Neither posterior mean ever reaches `p = 0`. The frequentist maximum-likelihood estimate `k / n = 0 / n = 0` is the zero-failure fallacy: it asserts an impossible event from a finite sample. Example: 0 failures in 200 demands gives `1 / 202 ≈ 0.00495` under the uniform prior and `0.5 / 201 ≈ 0.00249` under Jeffreys.

### 1.2 Gamma-Poisson: continuous failure rate and zero-failure demonstration

Bayesian zero-failure reliability demonstration treats test plans that observe zero failures with a Gamma prior on the failure rate, chosen for its conjugacy to the Poisson distribution ([Bayesian Zero-Failure Reliability Demonstration, Durham University thesis](https://maths.dur.ac.uk/stats/people/fc/thesis-MR.pdf), weight: 0.7844). The Gamma is also conjugate to the exponential and to the normal with known mean, and its update rule adds observed counts and exposure to the prior parameters ([Cross Validated: updating gamma conjugate distributions](https://stats.stackexchange.com/questions/605883/is-updating-gamma-conjugate-distributions-always-increasing), weight: 0.0588) [weak backing, weight: 0.0588].

For `lambda ~ Gamma(alpha, beta)` (shape `alpha`, rate `beta`) with `k` events over exposure time `T`:

```
lambda | (k, T) ~ Gamma(alpha + k, beta + T)
E[lambda | k, T] = (alpha + k) / (beta + T)
```

`beta` acts as pseudo-exposure time and `alpha` as pseudo-event count, so a zero-event test (`k = 0`) shrinks the mean as `alpha / (beta + T)` without collapsing to 0. That property is what lets a zero-failure demonstration test (Durham thesis, weight: 0.7844) be sized: pick `T` so the posterior upper quantile of `lambda` falls below the target rate.

### 1.3 Hierarchical priors

When several similar components or sites each have sparse data, a hierarchical model places a population-level prior over the unit-level `alpha, beta` (or over `p_j`, `lambda_j`), so each unit borrows strength from the fleet. This extends the prior-plus-data calibration frame in Gelman et al. ([Bayesian Data Analysis, ResearchGate](https://www.researchgate.net/publication/271076919_Bayesian_Data_Analysis), weight: 0.8551). No dig result treats hierarchical risk models on their own.

## 2. Preposterior analysis and Value of Information

Optimizing the expected value of perfect information (EVPI) and expected opportunity loss (EOL) for a project decision requires a posterior Bayesian analysis, as shown in an applied farmland-remediation study ([Bayesian Expected Opportunity Loss, Bori-Ogoni, academia.edu](https://www.academia.edu/81213384/Bayesian_Expected_Opportunity_Loss_of_Bori_Ogoni_Reclaimed_Diesel_Spill_Multipurpose_Multi_Objective_Farmland_Project), weight: 0.6686). Value of information is offered alongside sensitivity analysis as a decision-under-uncertainty tool in commercial Bayesian data-fusion work ([Fitila Labs](https://www.fitila.ai/research/bayesian-fusion), weight: 0.2298) [weak backing, weight: 0.2298]. A worked example reports both an NPV EVPI of a perfect predictor and an EVSI per sample in an embryo-selection model ([Gwern, Embryo Selection](https://gwern.net/embryo-selection), weight: 0.1815) [weak backing, weight: 0.1815].

Formal definitions, for actions `a`, uncertain state `theta`, and utility `U(a, theta)`:

```
EVPI = E_theta[ max_a U(a, theta) ] - max_a E_theta[ U(a, theta) ]

EVSI(e) = E_z[ max_a E_{theta|z}[ U(a, theta) ] ] - max_a E_theta[ U(a, theta) ]

ENGS(e) = EVSI(e) - Cost(e)
```

`z` is the outcome of experiment `e` (another test, probe, or inspection). Preposterior analysis computes `EVSI(e)` before running `e` by averaging over its predictive distribution; with the conjugate pairs of Section 1, that predictive is closed-form. Decision rule: run `e` only if `ENGS(e) > 0`; otherwise decide now. Properties: `0 <= EVSI(e) <= EVPI`, and EVPI equals the expected opportunity loss of the current best action, which links it to the EOL quantity in the Bori-Ogoni study (weight: 0.6686).

## 3. Uncertainty propagation

Monte Carlo simulation propagates uncertainty through a model using a sample of random scenarios drawn from each input distribution ([Analytica](https://analytica.com/why-analytica/embrace-risk-uncertainty/), weight: 0.1998) [weak backing, weight: 0.1998]. Latin Hypercube Sampling, Sobol low-discrepancy sequences, and Quasi-Monte Carlo are the standard alternatives for scientific simulation, with guidance on when to use each ([MatForge, Monte Carlo UQ Methods](https://matforge.org/monte-carlo-uhq-methods-lhs-sobol-quasi/), weight: 0.7073).

- **Crude Monte Carlo.** A Monte Carlo run generates a random sample of `N` points ([Latin hypercube vs. Monte Carlo sampling, Lumina](https://analytica.com/blog/latin-hypercube-vs-monte-carlo-sampling/), weight: 0.3262) [weak backing, weight: 0.3262]. The estimator of `E[Y]` has standard error `sigma_Y / sqrt(N)`, so error falls as `O(N^{-1/2})` regardless of input dimension; halving the error costs 4x the samples.
- **Variance reduction.** In multivariate Monte Carlo, a key source of excess error is the mismatch between the prespecified variance-covariance matrix and the sample variance-covariance matrix of the drawn random sample; variance-reduction designs correct that mismatch ([Wang 2008, Variance Reduction for Multivariate Monte Carlo Simulation](http://homepage.ntu.edu.tw/~jryanwang/papers/2008,%20Variance%20Reduction%20for%20Multivariate%20Monte%20Carlo%20Simulation%20(Wang).pdf), weight: 0.9063). The standard yardstick is the variance-reduction factor, naive variance divided by the technique's variance at equal computational budget, read as how many times more naive samples would buy the same accuracy ([StatExamPro, Monte Carlo variance reduction](https://statexampro.com/lessons/monte-carlo/variance-reduction/), weight: 0.4353) [weak backing, weight: 0.4353].
- **Latin Hypercube Sampling.** Each input's range is cut into `N` equiprobable strata, each stratum is sampled exactly once, and the columns are paired randomly (MatForge, weight: 0.7073). Stratifying every marginal forces the sample moments of each input toward their targets, the same sample-versus-prespecified mismatch Wang identifies (weight: 0.9063), which is why LHS beats crude MC most for near-additive models. Lumina contrasts LHS directly with crude MC for decision models (weight: 0.3262) [weak backing, weight: 0.3262].
- **2D (second-order) Monte Carlo.** Outer loop: draw `M` epistemic parameter sets (for example `p` from the Section 1 posterior). Inner loop: for each, draw `N` aleatory realizations. The output is a family of `M` CDFs whose spread separates knowledge uncertainty from natural variability, at a cost of `M * N` model runs. Either loop can use LHS to cut variance per run (MatForge, weight: 0.7073; Wang, weight: 0.9063).

## 4. Variance-based global sensitivity analysis (Sobol)

Sensitivity analysis studies how the uncertainty in a model's output can be divided and allocated to different sources of uncertainty in its inputs, while uncertainty analysis focuses on quantifying and propagating that uncertainty ([HandWiki, Sensitivity analysis](https://handwiki.org/wiki/Sensitivity_analysis), weight: 0.2125) [weak backing, weight: 0.2125]. Sobol sensitivity indices are estimated with various Monte Carlo and quasi-Monte Carlo approaches, with one comparison run at `n = 15200` across estimators including Sobol quasi-random, modified Owen, and combined MCA-MSS schemes ([Monte Carlo algorithms for evaluating Sobol' sensitivity indices, ResearchGate](https://www.researchgate.net/publication/220348310_Monte_Carlo_algorithms_for_evaluating_Sobol'_sensitivity_indices), weight: 0.8792).

For `Y = f(X_1, ..., X_d)` with independent inputs, `X_{~i}` meaning all inputs except `X_i`:

```
First-order (main effect):
S_i = Var_{X_i}( E_{X_{~i}}[ Y | X_i ] ) / Var(Y)

Total effect:
S_Ti = E_{X_{~i}}[ Var_{X_i}( Y | X_{~i} ) ] / Var(Y)
     = 1 - Var_{X_{~i}}( E_{X_i}[ Y | X_{~i} ] ) / Var(Y)
```

Reading the pair: `S_i` is the share of output variance removed if `X_i` were fixed; `S_Ti - S_i` is the share from interactions involving `X_i`; `sum_i S_i = 1` only for purely additive models. An input with `S_Ti ≈ 0` can be fixed at a nominal value. In a risk program, inputs with high `S_Ti` are the natural targets for the Section 2 EVSI calculation, because they are where new data can move the decision.

## 5. Notes on the dig

- 4 of 20 kept results are off-topic (a patient-portal login page, 2 dictionary or encyclopedia entries on the words "Monte" and "Latin") and back no claims.
- Hierarchical priors (Section 1.3) and the 2D Monte Carlo loop structure (Section 3) rest on the general Bayesian and LHS sources above; neither has a dedicated result in the dig.

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | Bayesian inference, Wikipedia | https://en.wikipedia.org/wiki/Bayesian_inference | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.8229 | Authoritative |
| 2 | Bayesian statistics, Wikipedia | https://en.wikipedia.org/wiki/Bayesian_statistics | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.4225 | Weak |
| 3 | (PDF) Bayesian Expected Opportunity Loss of Bori-Ogoni Reclaimed... | https://www.academia.edu/81213384/Bayesian_Expected_Opportunity_Loss_of_Bori_Ogoni_Reclaimed_Diesel_Spill_Multipurpose_Multi_Objective_Farmland_Project | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.6686 | Authoritative |
| 4 | Bayesian data fusion and decisions under uncertainty, Fitila | https://www.fitila.ai/research/bayesian-fusion | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.2298 | Weak |
| 5 | Embryo Selection For Intelligence, Gwern.net | https://gwern.net/embryo-selection | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.1815 | Weak |
| 6 | Bayesian Data Analysis, Request PDF | https://www.researchgate.net/publication/271076919_Bayesian_Data_Analysis | Bayesian risk analysis Value of Information EVPI EVSI sparse failure data | 0.8551 | Authoritative |
| 7 | Embrace risk & uncertainty, Analytica | https://analytica.com/why-analytica/embrace-risk-uncertainty/ | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.1998 | Weak |
| 8 | MyChart Login Page, Montefiore Health System | https://mychart.montefiore.org/MyChart/Authentication/Login | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.0179 | Off-topic (not cited) |
| 9 | (PDF) Monte Carlo algorithms for evaluating Sobol' sensitivity indices | https://www.researchgate.net/publication/220348310_Monte_Carlo_algorithms_for_evaluating_Sobol'_sensitivity_indices | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.8792 | Authoritative |
| 10 | Sensitivity analysis, HandWiki | https://handwiki.org/wiki/Sensitivity_analysis | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.2125 | Weak |
| 11 | Monte Carlo UQ Methods: Latin Hypercube, Sobol, and Quasi-Monte Carlo | https://matforge.org/monte-carlo-uhq-methods-lhs-sobol-quasi/ | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.7073 | Authoritative |
| 12 | MONTE Definition & Meaning, Merriam-Webster | https://www.merriam-webster.com/dictionary/monte | Monte Carlo Latin Hypercube uncertainty propagation Sobol sensitivity indices risk assessment | 0.0465 | Off-topic (not cited) |
| 13 | Bayesian Inference, Beta-Binomial Conjugate, SciSim | https://scisim.org/sims/statistics/45_bayesian_beta_binomial | Bayesian Beta Binomial zero failure reliability updating Gamma Poisson | 0.7307 | Authoritative |
| 14 | Bayesian Zero-Failure Reliability Demonstration | https://maths.dur.ac.uk/stats/people/fc/thesis-MR.pdf | Bayesian Beta Binomial zero failure reliability updating Gamma Poisson | 0.7844 | Authoritative |
| 15 | Bayesian Thinking for Engineers, AI Wiki Project | https://aiwikiproject.com/articles/bayesian-thinking-for-engineers | Bayesian Beta Binomial zero failure reliability updating Gamma Poisson | 0.1477 | Weak |
| 16 | Is updating gamma conjugate distributions always increasing?, Cross Validated | https://stats.stackexchange.com/questions/605883/is-updating-gamma-conjugate-distributions-always-increasing | Bayesian Beta Binomial zero failure reliability updating Gamma Poisson | 0.0588 | Weak |
| 17 | Latin hypercube vs. Monte Carlo sampling, Lumina Decision Systems | https://analytica.com/blog/latin-hypercube-vs-monte-carlo-sampling/ | Latin Hypercube Sampling variance reduction two-dimensional Monte Carlo risk | 0.3262 | Weak |
| 18 | Variance Reduction for Multivariate Monte Carlo Simulation | http://homepage.ntu.edu.tw/~jryanwang/papers/2008,%20Variance%20Reduction%20for%20Multivariate%20Monte%20Carlo%20Simulation%20(Wang).pdf | Latin Hypercube Sampling variance reduction two-dimensional Monte Carlo risk | 0.9063 | Authoritative |
| 19 | Monte Carlo part 4: variance reduction and importance sampling, StatExamPro | https://statexampro.com/lessons/monte-carlo/variance-reduction/ | Latin Hypercube Sampling variance reduction two-dimensional Monte Carlo risk | 0.4353 | Weak |
| 20 | Latin, Wikipedia | https://en.wikipedia.org/wiki/Latin | Latin Hypercube Sampling variance reduction two-dimensional Monte Carlo risk | 0.0347 | Off-topic (not cited) |
