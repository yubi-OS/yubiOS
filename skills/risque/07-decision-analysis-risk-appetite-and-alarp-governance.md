# 07. Risk-Informed Decision Analysis, ALARP, Societal F-N Curves & IRGC Governance

> **Scope:** Normative vs. descriptive risk decision theory: expected utility vs. cumulative prospect theory, ALARP (As Low As Reasonably Practicable) and cost-benefit disproportion factors, societal risk F-N curves and risk-aversion slopes, precautionary principle vs. expected-value governance, and the IRGC Risk Governance Framework.

## Grounding note

20 dig results after 1 redo; all 8 with Clef weight `>= 0.50` are cited. Keyword collisions appear only in the Sources table. Where a constant was not found in the cited document's text, the sentence says so.

## 1. Lineage: from "How safe is safe enough?" to tolerability frameworks

Risk acceptance criteria answer the question the public put when electric utilities proposed nuclear plants: "How safe is safe enough?" ([Risk Acceptance Criteria or "How Safe is Safe Enough?"](https://www.questconsult.com/papers/risk-acceptance-criteria/), weight: 0.7566). The UK Health and Safety Executive (HSE) risk framework, though not built for dams, became the basis for much of today's international dam safety risk guidance ([Introduction to Risk-Informed Decision Making, FERC](https://www.ferc.gov/sites/default/files/2020-04/Introduction-to-Risk-Informed-Decision-Making.pdf), weight: 0.9484). Dam-safety research proposes individual and societal criteria from 3 instruments: annual probability of failure (APF), F-N curves, and ALARP ([Study of risk acceptance criteria for dams](https://www.researchgate.net/publication/280154233_Study_of_risk_acceptance_criteria_for_dams), weight: 0.9511). Acceptance criteria should be fixed in advance of the decision [weak backing, weight: 0.1867] ([Hu Qunfang, Tongji University slides](https://www.slideserve.com/mahdis/hu-qunfang-department-of-geotechnical-engineering-tongji-university-2005-8-27-powerpoint-ppt-presentation), weight: 0.1867).

## 2. HSE Tolerability of Risk (ToR) and the ALARP carrot

The HSE uses "as low as reasonably practicable" and treats it as essentially equivalent to "so far as is reasonably practicable"; the duty holder's prime duty is to ensure risks are ALARP ([ALARP Framework Guidance, 61508 Association](https://61508.org/wp-content/uploads/2023/10/ALARP_Guidance_V1_Published_13.03.2019.pdf), weight: 0.8875). In HSE's R2P2, tolerability sets the boundaries and ALARP operates inside them: to be ALARP a risk must also be tolerable, and "tolerable" means society is willing to live with the risk to secure benefits, which is weaker than "acceptable" (same source, weight: 0.8875).

| Region | Individual frequency of fatality (IFOF) | Decision rule |
|---|---|---|
| 1. Unacceptable / Intolerable | `> 10^{-3}/yr` (workers), `> 10^{-4}/yr` (public) | Refuse or eliminate regardless of cost |
| 2. Tolerable / ALARP | `10^{-6}/yr` to the upper limit | Reduce unless cost is grossly disproportionate |
| 3. Broadly Acceptable | `< 10^{-6}/yr` | Maintain controls |

The guidance states R2P2's upper limits of tolerability as `1e-03` per annum (worker) and `1e-04` per annum (public), with `1e-06` per annum suggested as broadly acceptable for both; R2P2 sets no lower limit, and the duty holder must specify and justify its own upper boundary ([ALARP Framework Guidance](https://61508.org/wp-content/uploads/2023/10/ALARP_Guidance_V1_Published_13.03.2019.pdf), weight: 0.8875).

### Disproportion test

The guidance weights the value of lives saved by a gross disproportion factor `Gd` before comparing against cost (same source, weight: 0.8875):

```
Value_of_lives_saved = V * Gd * sum_{i=1..k} (IFOF_i0 - IFOF_i1) * N_i
Measure is REQUIRED unless  Cost > Value_of_lives_saved
Equivalently, per measure:  ICAF = Cost / Delta_Risk ;  decline only if ICAF > Gd * V
```

`V` is the value of preventing a fatality (VPF). HSE has no algorithm for `Gd` but suggests it range from 2 to 10, higher for higher risk; HSE's checklist valued an averted fatality at £1,336,800 (Q3 2003), and the guidance recommends £2.2M with `Gd = 5` as of 2019 (same source, weight: 0.8875).

## 3. Societal risk: F-N curves and risk-aversion slopes

HSE treats societal risk (one hazardous event, multiple fatalities) separately, holding that society's aversion grows with fatality count; the "Intolerable" and "Broadly Acceptable" boundaries are drawn as curves in the F-N domain ([ALARP Framework Guidance](https://61508.org/wp-content/uploads/2023/10/ALARP_Guidance_V1_Published_13.03.2019.pdf), weight: 0.8875). F-N curves also anchor societal dam criteria ([dams study](https://www.researchgate.net/publication/280154233_Study_of_risk_acceptance_criteria_for_dams), weight: 0.9511).

```
F(N) = P(Fatalities >= N)          log-log axes
Criterion line:  F(N) <= C * N^{-alpha}
alpha = 1 : risk-neutral (equal expected fatalities per decade of N)
alpha = 2 : catastrophe-averse (10x fatalities must be 100x rarer)
```

The growing-aversion premise is cited above; the specific slope values are the standard parameterization and were not found in the dig text.

**Partitioning critique.** Societal criteria are applied to single hazardous events with no apparent requirement to aggregate, even though more events make an environment more dangerous; the guidance calls this "disconcerting to some extent" and notes a larger site naturally carries a higher total fatality risk (same source, weight: 0.8875). Splitting or merging assessed events shifts the curve against a fixed line, so record assessment boundaries with every F-N result.

## 4. Normative vs. descriptive decision theory

**Normative baseline.** Cumulative prospect theory (CPT) is built as a modification of expected utility theory: it replaces final wealth with payoffs relative to a reference point, the utility function with a value function, and cumulative probabilities with weighted cumulative probabilities ([Cumulative prospect theory, Wikipedia](https://en.wikipedia.org/wiki/Cumulative_prospect_theory), weight: 0.8719). The expected utility form `E[u(W)] = sum_i p_i * u(w_i)` and the Arrow-Pratt coefficient `A(w) = -u''(w) / u'(w)` are the standard textbook definitions; no dig result states them directly.

**Descriptive model.** Tversky and Kahneman introduced CPT in 1992 as a descriptive model of decisions under risk and uncertainty ([Wikipedia](https://en.wikipedia.org/wiki/Cumulative_prospect_theory), weight: 0.8719). Their paper uses cumulative rather than separable decision weights, allows different weighting functions for gains and losses, and explains the curvature of the value and weighting functions by diminishing sensitivity and loss aversion ([Advances in Prospect Theory, Journal of Risk and Uncertainty 5(4): 297 to 323](https://ideas.repec.org/a/kap/jrisku/v5y1992i4p297-323.html), weight: 0.8009). In general form:

```
U(p) = integral_{-inf}^{0} v(x) d/dx[ w(F(x)) ] dx + integral_{0}^{+inf} v(x) d/dx[ -w(1 - F(x)) ] dx
v(x) = x^alpha                 x >= 0
v(x) = -lambda * (-x)^beta     x < 0,   lambda approx 2.25
w(p) = p^gamma / (p^gamma + (1 - p)^gamma)^(1/gamma)
```

The integral form is stated on the Wikipedia page (weight: 0.8719). The power value function, `lambda approx 2.25`, and the 1-parameter `w(p)` are the paper's parametric estimates; the RePEc abstract and Wikipedia text do not reproduce them.

Because cumulative probabilities are transformed, CPT overweights extreme events of small probability, rather than all small-probability events ([Wikipedia](https://en.wikipedia.org/wiki/Cumulative_prospect_theory), weight: 0.8719). The paper's experiment confirms a fourfold pattern: risk aversion for gains and risk seeking for losses at high probability, and the reverse at low probability ([Tversky and Kahneman 1992](https://ideas.repec.org/a/kap/jrisku/v5y1992i4p297-323.html), weight: 0.8009). Governance consequence: catastrophe aversion in F-N slopes is partly a descriptive CPT effect, and a regulator should decide explicitly whether to encode it or correct for it.

## 5. Precautionary principle vs. expected-value governance

In its broadest sense, the precautionary principle means responding to uncertainty through sound risk-taking and reasonable decisions ([The precautionary principle and environmental](https://www.scielo.br/j/asoc/a/4shJCKG9PTBdNkC663h7pjc/?format=pdf&lang=en), weight: 0.8235). That reading fits ALARP disproportion and contrasts with expected-value governance, which trusts the probability estimate fully. The ethics of risk frames these choices as moral questions of decision-making under uncertainty [weak backing, weight: 0.3728] ([Academia.edu](https://www.academia.edu/Documents/in/Ethics_of_Risk), weight: 0.3728).

## 6. IRGC Risk Governance Framework

Risk governance applies good-governance principles to the identification, assessment, management and communication of risks; the International Risk Governance Council developed concepts and tools for evidence-based risk governance ([What do we mean by 'Risk Governance'?, IRGC](https://irgc.org/risk-governance/what-is-risk-governance/), weight: 0.9353). The 4-class taxonomy below follows the IRGC framework; the cited page defines risk governance and does not itself enumerate the classes.

| Class | Signature | Management strategy |
|---|---|---|
| 1. Simple | Known probabilities and consequences | Routine SOP, statistical control |
| 2. Complex | Multi-component causal chains | PRA, FTA/ETA, STPA, Bayesian modeling |
| 3. Uncertain | Low `K`-strength knowledge or heavy tails | Precaution, robustness, reversibility, containment, ALARP disproportion |
| 4. Ambiguous | Conflicting values or framings | Deliberative discourse, explicit multi-attribute trade-off disclosure |

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | Tiger Woods - Wikipedia | https://en.wikipedia.org/wiki/Tiger_Woods | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.0210 | Off-topic, not cited |
| 2 | PPT - Hu Qunfang Department of Geotechnical Engineering Tongji... | https://www.slideserve.com/mahdis/hu-qunfang-department-of-geotechnical-engineering-tongji-university-2005-8-27-powerpoint-ppt-presentation | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.1867 | Weak (< 0.50) |
| 3 | Risk Acceptance Criteria or "How Safe is Safe Enough?" | https://www.questconsult.com/papers/risk-acceptance-criteria/ | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.7566 | Authoritative (>= 0.50) |
| 4 | Tiger Woods Announces Personal News After Decision to Play in … | https://sports.yahoo.com/articles/tiger-woods-announces-personal-news-150641063.html | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.0218 | Off-topic, not cited |
| 5 | Chapter 1 Introduction to Risk-Informed Decision Making - FERC | https://www.ferc.gov/sites/default/files/2020-04/Introduction-to-Risk-Informed-Decision-Making.pdf | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.9484 | Authoritative (>= 0.50) |
| 6 | (PDF) Study of risk acceptance criteria for dams | https://www.researchgate.net/publication/280154233_Study_of_risk_acceptance_criteria_for_dams | ALARP F-N curve Risk-Informed Decision Making societal risk acceptability criteria | 0.9511 | Authoritative (>= 0.50) |
| 7 | Islamic Revolutionary Guard Corps - Wikipedia | https://en.wikipedia.org/wiki/Islamic_Revolutionary_Guard_Corps | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.0344 | Off-topic (acronym collision), not cited |
| 8 | The precautionary principle and environmental | https://www.scielo.br/j/asoc/a/4shJCKG9PTBdNkC663h7pjc/?format=pdf&lang=en | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.8235 | Authoritative (>= 0.50) |
| 9 | Risk assessment: Grokipedia | https://grokipedia.com/page/Risk_assessment | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.1692 | Weak (< 0.50), not cited |
| 10 | The Islamic Revolutionary Guard Corps (IRGC) - Council on Foreign Relations | https://www.cfr.org/backgrounders/irans-revolutionary-guards | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.0347 | Off-topic (acronym collision), not cited |
| 11 | What do we mean by 'Risk Governance'? - IRGC | https://irgc.org/risk-governance/what-is-risk-governance/ | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.9353 | Authoritative (>= 0.50) |
| 12 | Ethics of Risk Research Papers - Academia.edu | https://www.academia.edu/Documents/in/Ethics_of_Risk | IRGC risk governance prospect theory precautionary principle risk decision analysis | 0.3728 | Weak (< 0.50) |
| 13 | ALARP Framework Guidance on achievement of ALARP in the ... | https://61508.org/wp-content/uploads/2023/10/ALARP_Guidance_V1_Published_13.03.2019.pdf | HSE Reducing risks protecting people R2P2 ALARP tolerability of risk | 0.8875 | Authoritative (>= 0.50) |
| 14 | HSE: Information about health and safety at work | https://www.hse.gov.uk/ | HSE Reducing risks protecting people R2P2 ALARP tolerability of risk | 0.3551 | Weak (< 0.50), not cited |
| 15 | How HSE regulates risks to health and safety from work… | https://www.hse.gov.uk/enforce/how-hse-regulates/ | HSE Reducing risks protecting people R2P2 ALARP tolerability of risk | 0.2597 | Weak (< 0.50), not cited |
| 16 | Home - Hamilton Southeastern School Corporation | https://www.hseschools.org/ | HSE Reducing risks protecting people R2P2 ALARP tolerability of risk | 0.0237 | Off-topic (acronym collision), not cited |
| 17 | Advances in Prospect Theory: Cumulative Representation of Uncert… | https://ideas.repec.org/a/kap/jrisku/v5y1992i4p297-323.html | Tversky Kahneman 1992 advances in prospect theory cumulative representation of uncertainty | 0.8009 | Authoritative (>= 0.50) |
| 18 | Cumulative prospect theory - Wikipedia | https://en.wikipedia.org/wiki/Cumulative_prospect_theory | Tversky Kahneman 1992 advances in prospect theory cumulative representation of uncertainty | 0.8719 | Authoritative (>= 0.50) |
| 19 | Spider Solitaire - Play Online & 100% Free \| Solitaired.com | https://solitaired.com/spider-solitaire | Tversky Kahneman 1992 advances in prospect theory cumulative representation of uncertainty | 0.0227 | Off-topic, not cited |
| 20 | Loss aversion in marketing: the asymmetry that sells... \| Brave New Hive | https://bravenewhive.com/branding/loss-aversion-in-marketing/ | Tversky Kahneman 1992 advances in prospect theory cumulative representation of uncertainty | 0.1714 | Weak (< 0.50), not cited |
