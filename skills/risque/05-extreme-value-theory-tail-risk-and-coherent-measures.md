# 05. Extreme Value Theory (EVT), Heavy Tails & Coherent Risk Measures

> **Scope:** Mathematical tail-risk modeling: Fisher-Tippett-Gnedenko Generalized Extreme Value (GEV) distributions, Pickands-Balkema-de Haan Generalized Pareto Distribution (GPD) Peaks-Over-Threshold, power-law tail exponents, Artzner et al. axioms of coherent risk measures (subadditivity failure of VaR vs. CVaR / Expected Shortfall), and Kelly/ruin thresholds.

**Grounding convention.** Every claim cites a result from the Clef-weighted dig record `research-db/digs/05-extreme-value-theory-tail-risk-and-coherent-measures.json` with its `noul` weight. Weight >= 0.50 is authoritative backing; weight < 0.50 is labeled `[weak backing]`. Where a closed-form expression is the standard textbook parametrization and the dig snippet names the object without printing the formula, the text says so. Sections the dig does not cover are flagged as gaps, not padded.

## 1. Why a Separate Tail Theory

Extreme value theory is the branch of statistics concerned with deviations far from the median, and it aims to estimate the probability of events more extreme than any yet observed in a sample ([Extreme value theory, HandWiki](https://handwiki.org/wiki/Extreme_value_theory), weight: 0.2201) [weak backing, weight: 0.2201]. The load-bearing framing comes from actuarial and applied sources: EVT rests on 2 limit theorems, Fisher-Tippett-Gnedenko for block maxima (GEV family) and Pickands-Balkema-de Haan for excesses over a threshold (GPD family), with the mean excess function as a tail diagnostic and the Hill estimator for the tail index ([Extreme Value Theory: GEV, GPD, Mean Excess, and Threshold, ActuaryPath](https://www.actuarypath.com/concepts/extreme-value-theory/), weight: 0.6011).

Applied work fits both families side by side: block maxima with GEV, Peaks-Over-Threshold (POT) with GPD, and Poisson processes over declustered periods, here for currency exchange tail risk ([Bayesian Modelling of Tail Risk Using Extreme Value Theory](https://www.academia.edu/168131660/Bayesian_Modelling_of_Tail_Risk_Using_Extreme_Value_Theory_with_Application_to_Currency_Exchange), weight: 0.83).

## 2. Block Maxima: the GEV Family

Split a series into blocks of equal length and take the maximum `M_n` of each block. Fisher-Tippett-Gnedenko states that, if the normalized maxima converge at all, the limit belongs to the GEV family ([ActuaryPath](https://www.actuarypath.com/concepts/extreme-value-theory/), weight: 0.6011). The GEV distribution was developed to combine the Gumbel, Frechet, and Weibull families into a single continuous family ([Generalized extreme value distribution, Wikipedia](https://en.wikipedia.org/wiki/Generalized_extreme_value_distribution), weight: 0.8341). Its standard CDF, defined where `1 + xi * (x - mu)/sigma > 0`, is:

```
H_{xi, mu, sigma}(x) = exp( -(1 + xi * ((x - mu) / sigma))^(-1/xi) ),   sigma > 0
```

The shape parameter `xi` selects the tail regime:

| Shape | Family | Tail behaviour |
|---|---|---|
| `xi = 0` (limit) | Gumbel | Light, exponential decay: `H(x) = exp(-exp(-(x - mu)/sigma))` |
| `xi > 0` | Frechet | Heavy power-law tail; moments of order `m >= 1/xi` are infinite |
| `xi < 0` | Weibull (reversed) | Bounded upper endpoint at `mu - sigma/xi` |

The 3-way unification is backed by the GEV source above (weight: 0.8341); the algebraic CDF and the moment condition are the standard parametrization of that family. The Frechet case is where power-law tail exponents live: tail index `alpha_tail = 1/xi`, which the Hill estimator targets ([ActuaryPath](https://www.actuarypath.com/concepts/extreme-value-theory/), weight: 0.6011).

## 3. Peaks-Over-Threshold: the GPD

Block maxima waste data (1 point per block). POT keeps every exceedance over a high threshold `u`. Pickands-Balkema-de Haan states that the excesses `Y = X - u`, conditional on `X > u`, converge to the GPD as `u` rises ([ActuaryPath](https://www.actuarypath.com/concepts/extreme-value-theory/), weight: 0.6011):

```
G_{xi, beta}(y) = 1 - (1 + xi * y / beta)^(-1/xi),   beta > 0,  y >= 0
```

POT with an excess distribution is implemented in production statistical software, for example the CRAN package Renext ("renewal method", the French "methode du renouvellement") ([CRAN: Package Renext](http://cran.rstudio.com/web/packages/Renext/index.html), weight: 0.7495). The R-Forge POT project develops functions for peaks-over-threshold modeling from EVT results ([R-Forge: Modelling Peaks Over Threshold](https://r-forge.r-project.org/news/?group_id=76), weight: 0.3208) [weak backing, weight: 0.3208]. Applied studies use POT plus GPD to model the tail and derive Value at Risk ([Marsland Press Journal](https://sciencepub.net/newyork/ny0306/15_2228_ny0306_102_107.pdf), weight: 0.4763) [weak backing, weight: 0.4763].

**Closed-form tail estimators.** With `n` observations, `N_u` exceedances, and fitted `(xi, beta)`, the standard POT estimators are:

```
VaR_alpha  = u + (beta / xi) * ( ( (n / N_u) * (1 - alpha) )^(-xi) - 1 )
CVaR_alpha = (VaR_alpha + beta - xi * u) / (1 - xi),     valid for xi < 1
```

The `xi < 1` condition is the GPD mean-finiteness requirement; for `xi >= 1` the expected shortfall diverges. These expressions are the standard POT parametrization; the dig sources above (weights 0.6011, 0.4763) establish POT-derived VaR, while the formula text itself is not quoted in any snippet.

## 4. Coherent Risk Measures: the Artzner Axioms

Artzner et al. (1999) set out the properties an ideal coherent measure should have: subadditivity, translation invariance, positive homogeneity, and monotonicity ([Andreev, Kanto, Malo, Aalto](https://aaltodoc.aalto.fi/bitstream/handle/123456789/12295/isbn951791928X.pdf?sequence=1), weight: 0.9455). For a loss functional `rho(L)`:

1. **Monotonicity:** `L_1 <= L_2  =>  rho(L_1) <= rho(L_2)`
2. **Translation invariance (cash additivity):** `rho(L + c) = rho(L) + c`
3. **Positive homogeneity:** `rho(lambda * L) = lambda * rho(L)` for `lambda >= 0`
4. **Subadditivity:** `rho(L_1 + L_2) <= rho(L_1) + rho(L_2)`; diversification never increases measured risk.

The same 4-property definition appears in the general reference ([Coherent risk measure, Wikipedia](https://en.wikipedia.org/wiki/Coherent_risk_measure), weight: 0.3053) [weak backing, weight: 0.3053].

## 5. VaR Fails, Expected Shortfall Holds

Value at Risk is the loss quantile:

```
VaR_alpha(L) = inf{ l : P(L > l) <= 1 - alpha }
```

VaR estimates how much a set of investments might lose with a given probability over a set period under normal conditions ([Value at risk, HandWiki](https://handwiki.org/wiki/Value_at_risk), weight: 0.2523) [weak backing, weight: 0.2523]. Its documented limitation is an inability to account for the size of losses beyond the quantile ([CAESar: Conditional Autoregressive Expected Shortfall, arXiv 2407.06619](https://arxiv.org/html/2407.06619v1), weight: 0.8938). VaR is a single quantile, so on skewed, discrete, or heavy-tailed losses 2 positions can each sit just under the cutoff while their sum crosses it, violating subadditivity; the Aalto paper frames CVaR, not VaR, as the coherent alternative under the Artzner axioms (weight: 0.9455).

Expected Shortfall integrates the quantile across the tail:

```
CVaR_alpha(L) = (1 / (1 - alpha)) * integral_{alpha}^{1} VaR_u(L) du
```

ES (also known as CVaR) is described as the most important coherent risk measure in finance, insurance, risk management, and engineering ([Risk Concentration and the Mean-Expected Shortfall, arXiv 2108.05066](http://arxiv.org/abs/2108.05066v1), weight: 0.9256). The coherence analysis of Expected Shortfall warns that names such as "Tail Conditional Expectation" and "Conditional Value-at-Risk" suggest a conditional expectation, which for CVaR is a misinterpretation in general ([On the Coherence of Expected Shortfall](https://www.researchgate.net/profile/Dirk-Tasche/publication/222405274_On_the_Coherence_of_Expected_Shortfall/links/59ea35404585151983c7eae4/On-the-Coherence-of-Expected-Shortfall.pdf), weight: 0.9002). The practical consequence: Tail VaR, the expected loss given that the level is breached ([Tail value at risk, Wikipedia](https://en.wikipedia.org/wiki/Tail_value_at_risk), weight: 0.7824), is coherent only when the underlying distribution is continuous ([Coherent risk measure, Wikipedia](https://en.wikipedia.org/wiki/Coherent_risk_measure), weight: 0.3053) [weak backing, weight: 0.3053]. The quantile-integral form above stays coherent on atoms too. ES travels under many names: CVaR, AVaR, TVaR, CTE, ETL, superquantile ([Expected shortfall, Wikipedia](https://en.wikipedia.org/wiki/Expected_shortfall), weight: 0.2645) [weak backing, weight: 0.2645].

**Rockafellar-Uryasev representation.** Rockafellar and Uryasev shifted portfolio optimization from minimizing VaR to minimizing CVaR (also called mean excess loss, mean shortfall, or tail VaR), and showed that portfolios with low CVaR necessarily have low VaR as well ([Optimization of conditional value-at-risk, Journal of Risk](https://www.risk.net/journal-risk/2161159/optimization-conditional-value-risk), weight: 0.9379). The convex auxiliary-function form behind that result is:

```
CVaR_alpha(L) = min_t { t + E[(L - t)^+] / (1 - alpha) }
```

The minimizing `t` is `VaR_alpha`, so 1 convex (and, on scenario data, linear) program returns both measures. The paper is the source of the method; the formula text is the standard statement of it and is not quoted in the snippet. CVaR modeling is also applied to downside events such as portfolio shocks and loan defaults ([Brice Green](http://brice.green/), weight: 0.3469) [weak backing, weight: 0.3469].

## 6. Non-Ergodicity, Kelly, and Ruin

Non-ergodicity means any exposure to ruin, even low-probability ruin, eventually materializes given enough time, and the Kelly criterion is the mathematically correct response to it, framed as ergodic optimization ([Ergodicity: Why Time Changes Everything, NYCIF](https://nycif.org/ergodicity/), weight: 0.5027). Kelly sizes a sequence of bets by maximizing the long-term expected logarithm of wealth, equivalent to maximizing the long-term expected geometric growth rate ([Kelly criterion, Wikipedia](https://en.wikipedia.org/wiki/Kelly_criterion), weight: 0.3235) [weak backing, weight: 0.3235]. Its popular reading is "don't risk everything" ([Kelly Criterion: Avoid Ruin, nav.al](https://nav.al/kelly-criterion), weight: 0.1835) [weak backing, weight: 0.1835].

For repeated multiplicative bets of fraction `f` on return `R`, wealth compounds, so the relevant rate is the time average:

```
g(f) = E[ ln(1 + f * R) ]        (time-average growth)
ln(1 + f * E[R])                  (ensemble-average proxy)
```

By Jensen's inequality, `g(f) <= ln(1 + f * E[R])`; positive expected value does not imply positive compounded growth. For a binary bet paying `b` to 1 with win probability `p` and `q = 1 - p`, maximizing `g` gives:

```
f* = (p * b - q) / b
```

Betting `2 * f*` drives growth to roughly 0, and beyond that growth turns negative (ruin in the long run). Fractional Kelly (for example `0.25 * f*` to `0.5 * f*`) trades growth for drawdown control, which matters when `p` is itself an estimate. For Steady Orbit forecasting slips, size each slip by fractional Kelly on the calibrated probability and cap total exposure with a CVaR or maximum-drawdown constraint computed from Section 5, never by expected value alone.

## 7. Operational Summary

- Use GEV for block maxima and GPD/POT for threshold exceedances; diagnose `xi` first, since `xi > 0` implies power-law tails and infinite high moments (weights 0.8341, 0.6011).
- Report ES/CVaR alongside VaR; VaR ignores tail severity (weight: 0.8938) while ES is the coherent standard (weights 0.9256, 0.9455).
- Optimize allocations on CVaR via the Rockafellar-Uryasev program (weight: 0.9379), and size repeated bets on time-average growth with fractional Kelly (weight: 0.5027); the closed-form Kelly algebra rests on weak-backed sources and is derivation, not citation.

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | CRAN: Package Renext | http://cran.rstudio.com/web/packages/Renext/index.html | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.7495 | Authoritative |
| 2 | Extreme (band) - Wikipedia | https://en.wikipedia.org/wiki/Extreme_(band) | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.0195 | Off-topic, not cited |
| 3 | Marsland Press Journal | https://sciencepub.net/newyork/ny0306/15_2228_ny0306_102_107.pdf | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.4763 | Weak |
| 4 | Extreme value theory (HandWiki) | https://handwiki.org/wiki/Extreme_value_theory | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.2201 | Weak |
| 5 | Generalized Pareto Distribution Research Papers - Academia.edu | https://www.academia.edu/Documents/in/Generalized_Pareto_Distribution | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.1978 | Weak, not cited |
| 6 | R-Forge: Modelling Peaks Over Threshold: News | https://r-forge.r-project.org/news/?group_id=76 | Extreme Value Theory Generalized Pareto Distribution Peaks Over Threshold tail risk | 0.3208 | Weak |
| 7 | [2108.05066v1] Risk Concentration and the Mean-Expected Shortfall | http://arxiv.org/abs/2108.05066v1 | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.9256 | Authoritative |
| 8 | Global Leader in Photonics \| Coherent | https://www.coherent.com/ | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.0259 | Off-topic, not cited |
| 9 | Coherent Risk Measures by Artzner et al (1999) \| LinkedIn | https://www.linkedin.com/posts/michael-fernandes-7a3b6227a_coherent-measures-of-risk-research-paper-activity-7409027474879201280-sYsq | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.0807 | Weak, not cited |
| 10 | Expected shortfall - Wikipedia | https://en.wikipedia.org/wiki/Expected_shortfall | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.2645 | Weak |
| 11 | Company \| Coherent | https://www.coherent.com/company | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.0364 | Off-topic, not cited |
| 12 | Andriy Andreev, Antti Kanto, Pekka Malo (Aalto) | https://aaltodoc.aalto.fi/bitstream/handle/123456789/12295/isbn951791928X.pdf?sequence=1 | coherent risk measures Artzner Expected Shortfall CVaR subadditivity | 0.9455 | Authoritative |
| 13 | Generalized extreme value distribution - Wikipedia | https://en.wikipedia.org/wiki/Generalized_extreme_value_distribution | Generalized Extreme Value GEV Generalized Pareto GPD tail risk quantile | 0.8341 | Authoritative |
| 14 | Tail value at risk | https://en.wikipedia.org/wiki/Tail_value_at_risk | Generalized Extreme Value GEV Generalized Pareto GPD tail risk quantile | 0.7824 | Authoritative |
| 15 | GENERALIZED Definition & Meaning - Merriam-Webster | https://www.merriam-webster.com/dictionary/generalized | Generalized Extreme Value GEV Generalized Pareto GPD tail risk quantile | 0.0189 | Off-topic, not cited |
| 16 | (PDF) Bayesian Modelling of Tail Risk Using Extreme Value Theory | https://www.academia.edu/168131660/Bayesian_Modelling_of_Tail_Risk_Using_Extreme_Value_Theory_with_Application_to_Currency_Exchange | Generalized Extreme Value GEV Generalized Pareto GPD tail risk quantile | 0.8300 | Authoritative |
| 17 | Extreme Value Theory: GEV, GPD, Mean Excess, and Threshold | https://www.actuarypath.com/concepts/extreme-value-theory/ | Generalized Extreme Value GEV Generalized Pareto GPD tail risk quantile | 0.6011 | Authoritative |
| 18 | CAESar: Conditional Autoregressive Expected Shortfall | https://arxiv.org/html/2407.06619v1 | Value at Risk Conditional Value at Risk Expected Shortfall coherent risk | 0.8938 | Authoritative |
| 19 | VALUE Definition & Meaning - Merriam-Webster | https://www.merriam-webster.com/dictionary/value | Value at Risk Conditional Value at Risk Expected Shortfall coherent risk | 0.0331 | Off-topic, not cited |
| 20 | Value at risk (HandWiki) | https://handwiki.org/wiki/Value_at_risk | Value at Risk Conditional Value at Risk Expected Shortfall coherent risk | 0.2523 | Weak |
| 21 | On the Coherence of Expected Shortfall (PII: S0378-4266(02) 00283-2) | https://www.researchgate.net/profile/Dirk-Tasche/publication/222405274_On_the_Coherence_of_Expected_Shortfall/links/59ea35404585151983c7eae4/On-the-Coherence-of-Expected-Shortfall.pdf | Value at Risk Conditional Value at Risk Expected Shortfall coherent risk | 0.9002 | Authoritative |
| 22 | Coherent risk measure - Wikipedia | https://en.wikipedia.org/wiki/Coherent_risk_measure | Value at Risk Conditional Value at Risk Expected Shortfall coherent risk | 0.3053 | Weak |
| 23 | Optimization of conditional value-at-risk - Journal of Risk - Risk.net | https://www.risk.net/journal-risk/2161159/optimization-conditional-value-risk | Rockafellar Uryasev optimization of Conditional Value at Risk CVaR | 0.9379 | Authoritative |
| 24 | Portfolio optimization (HandWiki) | https://handwiki.org/wiki/Finance:Portfolio_optimization | Rockafellar Uryasev optimization of Conditional Value at Risk CVaR | 0.1792 | Weak, not cited |
| 25 | HEAVY RAIN at Night 10 Hours for Sleeping, Relax, Study (YouTube) | https://www.youtube.com/watch?v=9QneqUhCVtU | Rockafellar Uryasev optimization of Conditional Value at Risk CVaR | 0.0239 | Off-topic, not cited |
| 26 | Home \| Brice Green | http://brice.green/ | Rockafellar Uryasev optimization of Conditional Value at Risk CVaR | 0.3469 | Weak |
| 27 | Kelly criterion - Wikipedia | https://en.wikipedia.org/wiki/Kelly_criterion | Kelly criterion non-ergodicity multiplicative risk ruin probability | 0.3235 | Weak |
| 28 | Ergodicity: Why Time Changes Everything \| NYCIF | https://nycif.org/ergodicity/ | Kelly criterion non-ergodicity multiplicative risk ruin probability | 0.5027 | Authoritative |
| 29 | Kelly Criterion: Avoid Ruin | https://nav.al/kelly-criterion | Kelly criterion non-ergodicity multiplicative risk ruin probability | 0.1835 | Weak |
| 30 | Kelly Services \| Workforce Strategy & Solutions | https://www.kellyservices.com/ | Kelly criterion non-ergodicity multiplicative risk ruin probability | 0.0352 | Off-topic, not cited |
