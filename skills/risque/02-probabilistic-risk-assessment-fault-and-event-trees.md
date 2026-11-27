# 02. Probabilistic Risk Assessment (PRA), Fault Trees & Event Trees

> **Scope:** Classical Probabilistic Risk Assessment (PRA/QRA) mechanics: Fault Tree Analysis (FTA), Event Tree Analysis (ETA), Minimal Cut Sets (MCS), Boolean structure functions, Bow-Tie barrier models, and component importance metrics (Birnbaum, Fussel-Vesely, Risk Achievement Worth RAW, Risk Reduction Worth RRW).

## Evidence status of this doc

The dig holds 20 results after 1 redo; 7 carry Clef weight >= 0.50. The 3 load-bearing primaries are the NRC Fault Tree Handbook ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645), the NTNU component-importance chapter ([NTNU Chapter 5](https://www.ntnu.edu/documents/624876/1277590549/chapt05.pdf/82cd565f-fa2f-43e4-a81a-095d95d39272), weight: 0.916) and the NRC importance-measures lecture ([NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922). Each citation below was checked against the document text, beyond the search snippet. 4 formulas (Esary-Proschan bound, BDD by name, beta-factor, alpha-factor) appear in none of the 20 results; they carry the tag `[formula not stated in dig sources]` so a later redo can target them.

## 1. What PRA is built from

PRA uses fault tree and event tree analysis to evaluate the consequences of internal or external initiating events at nuclear power plants ([Dynamic Importance Measures in the ADAPT Framework](http://www.osti.gov/biblio/23042715), weight: 0.9459). The NRC lecture places Fault Tree Analysis, Event Tree Analysis, Common Cause Failure Analysis and Human Reliability Analysis as linked tasks inside Level 1 PRA ([NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922). Fault tree, event tree and Bow-Tie models share a documented blind spot: they "cannot easily be employed to model dynamic risks and conditional dependencies" ([Dynamic safety assessment of natural gas stations using Bayesian ...](https://www.sciencedirect.com/science/article/am/pii/S0304389416308950), weight: 0.9621).

FTA is a deductive, top-down method from an undesired top event to its causes ([Fault tree analysis: Grokipedia](https://grokipedia.com/page/Fault_tree_analysis), [weak backing, weight: 0.1521]). Process-safety QRA pairs it with Layer of Protection Analysis ([Quantitative Risk Assessment for Process Safety](https://www.linkedin.com/top-content/engineering/engineering-risk-assessment-strategies/quantitative-risk-assessment-for-process-safety/), [weak backing, weight: 0.135]).

## 2. Deductive FTA: structure function and cut sets

NUREG-0492 devotes Chapter VII to Boolean algebra applied to fault tree analysis, including reduction of a tree to its minimal cut sets ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645). With indicator `x_i = 1` when basic event `i` occurs:

```
Phi(x_1, ..., x_n) in {0, 1}
AND gate:  Phi = prod_i x_i
OR gate:   Phi = 1 - prod_i (1 - x_i)
Phi(x) = 1 - prod_{j=1..m} (1 - prod_{i in C_j} x_i)   (MCS form)
```

NUREG-0492 defines minimal cut sets as the unique combinations of component failures that cause system failure ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645). Finding the most probable one is a hard search problem, attacked with a MaxSAT encoding ([arXiv 2005.03003](http://arxiv.org/abs/2005.03003), weight: 0.95; [arXiv 2005.03003v1](https://arxiv.org/abs/2005.03003v1), weight: 0.9282).

### Quantification, from cheapest to exact

With independent `q_i` and `P(C_j) = prod_{i in C_j} q_i`:

1. **Rare-Event Approximation:** `P(Top) approx sum_j P(C_j)`. NUREG-0492 states the summed form is an upper bound when events are not mutually exclusive, that any error "is on the conservative side", and that the rare event approximation "plays an important role in fault tree quantification" ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645).
2. **Inclusion-Exclusion:** `P(A or B) = P(A) + P(B) - P(A and B)`, generalized over cut sets, is exact ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645).
3. **Esary-Proschan min-cut bound:** `P(Top) <= 1 - prod_j (1 - P(C_j))`, tighter than the sum for coherent systems `[formula not stated in dig sources]`.
4. **BDD exact evaluation:** built on Shannon's expansion `Phi = x_i * Phi|_{x_i=1} + (1 - x_i) * Phi|_{x_i=0}`, which NUREG-0492 presents as "a general" method for expanding Boolean functions ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645). Sharing sub-expansions as a Binary Decision Diagram yields disjoint paths and an exact `P(Top)` `[formula not stated in dig sources]`.

## 3. Common-Cause Failures break `prod q_i`

NUREG-0492 multiplies `1 x 10^-3 x 1 x 10^-3 = 1 x 10^-6` for 2 parallel amplifiers only "assuming independence", and warns that under a common cause "our ostensible quadruple minimal cut set becomes essentially a 'double'" ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645). Its qualitative evaluation flags "minimal cut sets potentially susceptible to common cause (common mode) failures" and surveys CCF analysis codes ([NUREG-0492](https://www.nrc.gov/docs/ml1007/ml100780465.pdf), weight: 0.9645). Common cause failures "are not always obvious" ([Fault Tree Analysis (FTA): Symbols, Steps and Example](https://sixsigmastudyguide.com/fault-tree-analysis/), [weak backing, weight: 0.3523]).

Parametric models quantify that collapse `[formula not stated in dig sources]`:

- **Beta-factor:** `Q_I = (1 - beta) Q_t`, `Q_CCF = beta Q_t`; for 2 redundant units `P(both) approx Q_I^2 + beta Q_t`. With `Q_t = 0.01`, `beta = 0.1`: `0.00108`, about 10.8 times the naive `0.0001`.
- **Alpha-factor:** with `alpha_t = sum_k k alpha_k` under non-staggered testing, `Q_k = ( k / C(m-1, k-1) ) * ( alpha_k / alpha_t ) * Q_t`.

## 4. Inductive ETA and Bow-Tie synthesis

ETA starts at an initiating event and branches through barrier successes and failures; accident sequences feed sequence quantification, with each branch quantified by fault trees ([NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922; [OSTI 23042715](http://www.osti.gov/biblio/23042715), weight: 0.9459):

```
f_s = f_I * prod_k P(b_k | I, b_1, ..., b_{k-1})
```

A Bow-Tie couples the fault tree (preventive barriers, left of the top event) with the event tree (mitigative barriers, right), and inherits the static, dependency-blind limitation of both ([ScienceDirect S0304389416308950](https://www.sciencedirect.com/science/article/am/pii/S0304389416308950), weight: 0.9621).

## 5. The 4 canonical importance measures

Let `R_0 = F(x)` be baseline risk from all cut sets. The NRC lecture lists Fussell-Vesely, Risk Reduction, Risk Achievement Worth and Birnbaum as the common measures, "usually calculated at core damage frequency level" ([NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922).

| Measure | Equation | Source |
|---|---|---|
| Birnbaum | `I^B_i = dR/dq_i = R(q_i=1) - R(q_i=0)` | NRC: `Bi = dF(x)/dx_i` (weight: 0.8922); NTNU: partial derivative of system reliability (weight: 0.916) |
| Fussell-Vesely | `FV_i = F(i) / R_0`, sum over cut sets containing `i`; range 0 to 1 | NRC (weight: 0.8922) |
| RAW | `RAW_i = R(q_i=1) / R_0` | NRC: `RAW = F(1)/F(x)`, component "taken out of service or is failed" (weight: 0.8922); NTNU (weight: 0.916) |
| RRW | `RRW_i = R_0 / R(q_i=0)` | NRC: ratio or difference with `q_i = 0` (weight: 0.8922); NTNU: "relative reduction ... when it is known that component i is functioning" (weight: 0.916) |

Sources: [NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922; [NTNU Chapter 5](https://www.ntnu.edu/documents/624876/1277590549/chapt05.pdf/82cd565f-fa2f-43e4-a81a-095d95d39272), weight: 0.916. RRW is also called the Risk Decrease Factor ([DSI Importance Measures Report](https://www.dsiintl.com/products/express/fault-tree-analysis/importance-measures-report/), [weak backing, weight: 0.2848]). Under the rare-event form, `FV_i = 1 - R(q_i=0)/R_0` and `RRW_i = 1/(1 - FV_i)`, which follows algebraically from the NRC definitions.

**NRC worked check.** Cut sets `T*A = 6 x 10^-4`, `T*B*C = 3 x 10^-5`, `T*C*D = 3 x 10^-6` give `F(x) = 6.33 x 10^-4`, `FV_C = 0.052`, `FV_D = 0.005`, and `Bi_A approx 1.0` ([NRC ML12160A479](https://www.nrc.gov/docs/ML1216/ML12160A479.pdf), weight: 0.8922). NTNU shows that when `RAW_i = 1` the failure of component `i` leaves system risk unchanged ([NTNU Chapter 5](https://www.ntnu.edu/documents/624876/1277590549/chapt05.pdf/82cd565f-fa2f-43e4-a81a-095d95d39272), weight: 0.916). Neither source sets regulatory screening thresholds, so this doc sets none.

## 6. Application: yubiOS defense-in-depth chain

Illustrative numbers only (assumed, not measured), computed with the NRC definitions above. Top event: undetected persistent tampering of the boot and root chain. Basic events: `SB` Secure Boot PIV signing bypass (`q = 0.01`), `FTPM` OP-TEE fTPM measurement forgery (`q = 0.02`), `VER` dm-verity root-hash bypass (`q = 0.05`), `LUKS` LUKS2 FIDO2 unlock bypass (`q = 0.03`). Assumed MCS: `{SB, VER}`, `{FTPM, VER}`, `{SB, LUKS}`.

- Rare-event: `R_0 = 0.0005 + 0.001 + 0.0003 = 0.0018`
- Esary-Proschan: `0.00179905`
- Exact (inclusion-exclusion): `0.001775`

| Barrier | Birnbaum | FV | RAW | RRW |
|---|---|---|---|---|
| SB (PIV) | 0.08 | 0.444 | 45.0 | 1.80 |
| FTPM | 0.05 | 0.556 | 28.2 | 2.25 |
| VER (dm-verity) | 0.03 | 0.833 | 16.8 | 6.00 |
| LUKS (FIDO2) | 0.01 | 0.167 | 6.4 | 1.20 |

Reading: Secure Boot has the highest RAW, so taking it out of service is the worst outage; dm-verity has the highest RRW and FV, so hardening it buys the most reduction. If the PIV signing key and the FIDO2 credential live on one hardware token, that shared dependency is the NUREG-0492 collapse case: `{SB, LUKS}` degrades toward a single-event cut set (Section 3). Time-ordered attacks remain outside the static model ([ScienceDirect S0304389416308950](https://www.sciencedirect.com/science/article/am/pii/S0304389416308950), weight: 0.9621).

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | PROBABILISTIC Definition & Meaning - Merriam-Webster | https://www.merriam-webster.com/dictionary/probabilistic | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.0656 | Weak (not cited, off-topic) |
| 2 | [2005.03003v1] Fault Tree Analysis: Identifying Maximum Probabil… | https://arxiv.org/abs/2005.03003v1 | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.9282 | Authoritative |
| 3 | Fault Tree AND/OR Gate Probability : Mech Codex | https://mechcodex.com/learn/fault-tree-and-or-gate-probability | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.2994 | Weak (not cited, superseded by primaries) |
| 4 | Fault tree analysis: Grokipedia | https://grokipedia.com/page/Fault_tree_analysis | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.1521 | Weak (cited, labeled) |
| 5 | PROBABILISTIC : English meaning - Cambridge Dictionary | https://dictionary.cambridge.org/dictionary/english/probabilistic | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.0553 | Weak (not cited, off-topic) |
| 6 | [2005.03003] Fault Tree Analysis: Identifying Maximum Probabilit… | http://arxiv.org/abs/2005.03003 | Probabilistic Risk Assessment Fault Tree Analysis Minimal Cut Sets Birnbaum Fussel-Vesely | 0.95 | Authoritative |
| 7 | Eventbrite - Discover the Best Local Events & Things to Do | https://www.eventbrite.com/?msockid=2c9e44a9c13f690314485cb7c0e9683c | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.0227 | Weak (not cited, off-topic) |
| 8 | Dynamic Importance Measures in the ADAPT Framework (Journal Arti… | http://www.osti.gov/biblio/23042715 | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.9459 | Authoritative |
| 9 | Рубрика "Доработки". Последняя запись про заслонки. : DRIVE2 | https://www.drive2.ru/l/731306350306412776/ | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.028 | Weak (not cited, off-topic) |
| 10 | Quantitative Risk Assessment for Process Safety | https://www.linkedin.com/top-content/engineering/engineering-risk-assessment-strategies/quantitative-risk-assessment-for-process-safety/ | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.135 | Weak (cited, labeled) |
| 11 | Seattle, WA Events, Calendar & Tickets : Eventbrite | https://www.eventbrite.com/d/wa--seattle/events/?msockid=2c9e44a9c13f690314485cb7c0e9683c | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.016 | Weak (not cited, off-topic) |
| 12 | Dynamic safety assessment of natural gas stations using Bayesian ... | https://www.sciencedirect.com/science/article/am/pii/S0304389416308950 | Event Tree Analysis Bow-Tie quantitative risk assessment importance measures RAW RRW | 0.9621 | Authoritative |
| 13 | Chapter 5 Component Importance - NTNU | https://www.ntnu.edu/documents/624876/1277590549/chapt05.pdf/82cd565f-fa2f-43e4-a81a-095d95d39272 | Birnbaum Fussell-Vesely Risk Achievement Worth Risk Reduction Worth importance measures | 0.916 | Authoritative |
| 14 | 14 - Importance Measures. | https://www.nrc.gov/docs/ML1216/ML12160A479.pdf | Birnbaum Fussell-Vesely Risk Achievement Worth Risk Reduction Worth importance measures | 0.8922 | Authoritative |
| 15 | Importance Measures Report : DSI International | https://www.dsiintl.com/products/express/fault-tree-analysis/importance-measures-report/ | Birnbaum Fussell-Vesely Risk Achievement Worth Risk Reduction Worth importance measures | 0.2848 | Weak (cited, labeled) |
| 16 | Lecture 15 - Fussell-Vesely, Risk Reduction and Risk Achievement ... | https://www.youtube.com/watch?v=eIjzLHLlMSo | Birnbaum Fussell-Vesely Risk Achievement Worth Risk Reduction Worth importance measures | 0.1315 | Weak (not cited) |
| 17 | Fault tree analysis - Wikipedia | https://en.wikipedia.org/wiki/Fault_tree_analysis | common cause failure beta factor alpha factor fault tree analysis NUREG | 0.1115 | Weak (not cited) |
| 18 | The Home Depot | https://www.homedepot.com/ | common cause failure beta factor alpha factor fault tree analysis NUREG | 0.0264 | Weak (not cited, off-topic) |
| 19 | NUREG-0492, "Fault Tree Handbook". | https://www.nrc.gov/docs/ml1007/ml100780465.pdf | common cause failure beta factor alpha factor fault tree analysis NUREG | 0.9645 | Authoritative |
| 20 | Fault Tree Analysis (FTA): Symbols, Steps and Example | https://sixsigmastudyguide.com/fault-tree-analysis/ | common cause failure beta factor alpha factor fault tree analysis NUREG | 0.3523 | Weak (cited, labeled) |

Note: pipe characters in source titles 3, 5, 9, 11 and 15 were replaced with colons to keep the table valid; the dash separator in title 4 was replaced with a colon per the writing rules.
