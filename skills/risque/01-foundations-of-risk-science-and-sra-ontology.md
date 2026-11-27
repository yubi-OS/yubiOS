# 01. Foundations of Risk Science & SRA Ontology

> **Scope:** Formal definitions of risk from the Society for Risk Analysis (SRA), Kaplan and Garrick's quantitative risk triplet R = {<s_i, p_i, x_i>}, Terje Aven's (C, U | K) consequence-uncertainty-knowledge formulation, aleatory vs. epistemic uncertainty, and black-swan / deep-uncertainty taxonomy.

**Grounding note.** Every sourced claim cites the URL and Clef `noul` weight from the dig record `research-db/digs/01-foundations-of-risk-science-and-sra-ontology.json` (16 results, 9 at weight >= 0.50, 1 redo adding a variance-decomposition query). Weight >= 0.50 is authoritative backing; anything below is labeled `[weak backing]`. The dig captured search snippets; claims that go beyond a snippet are attributed to the full cited document and should be spot-checked against it by reviewers.

## 1. Risk science as a discipline

Risk analysis is treated by the SRA as a distinct science covering risk understanding, assessment, perception, communication, management, and governance ([Foundational Issues in Risk Analysis, SRA](https://www.sra.org/risk-analysis-specialty-groups/foundational-issues-in-risk-analysis/), weight: 0.9011). The SRA Foundational Issues in Risk Analysis Specialty Group (FRASG) was founded under Terje Aven, a past SRA president (same source, weight: 0.9011). Aven is Professor of Risk Analysis and Risk Management at the University of Stavanger, Norway, and co-authored *Risk Science: An Introduction* with Shital Thekdi ([Risk Science; An Introduction](https://api.pageplace.de/preview/DT0400.9781000434989_A41331302/preview-9781000434989_A41331302.pdf), weight: 0.8712). A 2026 perspective paper frames risk sciences as encompassing all scientific areas that study the identification, quantification, analysis, and communication of risk ([A perspective on the foundation of the science(s) of risk](https://www.sciencedirect.com/science/article/pii/S295062982600007X), weight: 0.9194).

The canonical vocabulary is the SRA Glossary, produced by a committee led by Aven with members including Yakov Ben-Haim, Henning Boje Andersen, Tony Cox, Enrique López Droguett, Michael Greenberg, and Seth Guikema ([Society for Risk Analysis Glossary](https://www.sra.org/wp-content/uploads/2020/04/SRA-Glossary-FINAL.pdf), weight: 0.9375). A lay framing describes risk as uncertainty about the effects of an activity with respect to something humans value, often focused on undesirable consequences ([Risk, Wikipedia](https://en.wikipedia.org/wiki/Risk), `[weak backing, weight: 0.2873]`; mirrored at [HandWiki](https://handwiki.org/wiki/Risk), `[weak backing, weight: 0.1045]`).

## 2. Kaplan & Garrick (1981): the set of triplets

Kaplan and Garrick answer three questions: what can happen, how likely is it, and what are the consequences. Their level 1 definition is ([The Review of the Definition of Risk](https://iiakm.org/ojakm/articles/2015/volume3_3/OJAKM_Volume3_3pp17-26.pdf), weight: 0.9036):

```
R = { <s_i, p_i, x_i> },  i = 1, 2, ..., N
```

where `s_i` identifies or describes a scenario, `p_i` is its probability, and `x_i` is its consequence measure (same source, weight: 0.9036). The original paper explicitly warns against collapsing this set into the slogan "risk is probability and consequence," because for a single scenario that reduces to probability times consequence and discards the scenario structure ([Quantitative Definition of Risk, Kaplan & Garrick, NRC ADAMS ML12167A133](https://www.nrc.gov/docs/ML1216/ML12167A133.pdf), weight: 0.9560).

Two refinements in the same paper (weight: 0.9560) matter for engineering:

1. **Completeness scenario.** The scenario list is closed with a catch-all `s_{N+1}` ("all other scenarios"), so the set becomes `R = {<s_i, p_i, x_i>}_{i=1..N+1}`. Its probability mass is an explicit admission of incompleteness rather than an implicit zero.
2. **Probability of frequency.** At the higher definitional levels, `p_i` is replaced by a frequency `phi_i` for repetitive situations, and the analyst's uncertainty about that frequency is expressed as a probability curve `p_i(phi_i)`. Pure frequency describes the process; probability-of-frequency describes the analyst's state of knowledge about the process.

## 3. From expected loss to (C, U | K)

The classical engineering metric is expected loss:

```
E[L] = sum_{i=1..N} p_i * c_i
```

The SRA Glossary (weight: 0.9375) moves past this by defining risk broadly as the two-dimensional combination of consequences `C` of an activity and the associated uncertainties `U`, always conditional on background knowledge `K`:

```
Risk ~ (C, U | K)
```

A **risk description** (characterization) then specifies (SRA Glossary, weight: 0.9375):

```
Risk description = (C', Q, K)
```

- `C'`: the specified consequences (the analyst's chosen model of `C`, e.g. the `x_i` of Section 2).
- `Q`: a measure or description of uncertainty, such as probability `P` plus judgments of its basis.
- `K`: the background knowledge (data, models, assumptions) on which `C'` and `Q` rest, including a judgment of its strength.

The shift is structural: `E[L]` hides both the spread of outcomes and the quality of `K`, while `(C', Q, K)` forces both into the record. Aven's textbook positions this conceptual layer as the foundation of risk science (weight: 0.8712).

## 4. Aleatory variability vs. epistemic uncertainty

The SRA Glossary (weight: 0.9375) separates **aleatory uncertainty** (variation in populations or stochastic processes) from **epistemic uncertainty** (lack of knowledge about a quantity or model). The Law of Total Variance expresses the variance of a random variable `Y` in terms of its conditional variances and conditional means given another random variable ([Law of total variance](https://en.wikipedia.org/wiki/Law_of_total_variance), weight: 0.8067). Epistemic and aleatoric uncertainty measures can be derived by decomposing a subjective risk under a strictly proper loss, and this decomposition recovers the classic information-theoretic uncertainty terms for reverse cross-entropy ([Subjective Risk Decomposition: A New View for Uncertainty](https://arxiv.org/html/2607.15196), weight: 0.9119). Under squared-error loss, the decomposition takes the total-variance form. Let `Y` be the consequence and `theta` the uncertain parameters and model choice:

```
Var(Y) = E_theta[ Var(Y | theta) ] + Var_theta( E[Y | theta] )
            aleatory component          epistemic component
```

- **Aleatory term** `E_theta[Var(Y | theta)]`: irreducible process stochasticity remaining even when `theta` is known exactly.
- **Epistemic term** `Var_theta(E[Y | theta])`: spread caused by not knowing `theta`. It decomposes further into parameter uncertainty, model uncertainty (which structural form), and completeness uncertainty (the `s_{N+1}` mass from Section 2). This term shrinks as evidence strengthens `K`.

Kaplan and Garrick's probability-of-frequency curve (weight: 0.9560) is the same split in their notation: `phi_i` carries the aleatory frequency, `p_i(phi_i)` carries the epistemic spread.

## 5. Surprises, black swans, and deep uncertainty

The SRA Glossary (weight: 0.9375) defines a black swan as a surprising extreme event relative to present knowledge or beliefs, which makes it a property of `K` rather than of the world alone. Organized against `K`, three classes follow:

| Class | Relation to K | Failure mode |
|---|---|---|
| Unknown unknowns | Event absent from everyone's `K` | Missing from the scenario set; only `s_{N+1}` can absorb it |
| Known unknowns overlooked | Event known somewhere, missing or downweighted in the analysts' `K` | Weak `K` and absent review hide it |
| Low-probability, high-consequence | Event in `K`, judged negligible by `P` | Frequentist data too sparse; `Q` understates tail |

Deep uncertainty is the regime where `K` cannot support agreed probabilities or models, so `Q` must be reported qualitatively alongside, or instead of, `P` (SRA Glossary, weight: 0.9375).

## 6. Application: yubiOS and autonomous agent engineering

This section applies the cited definitions as engineering guidance. Analysis is worth little until it is joined to a management practice ([Risk Management vs. Risk Analysis, Murray Cantor](https://murraycantor.com/quantitative-risk-management.html), weight: 0.6369), so the `(C', Q, K)` form should become a gate.

1. **Score K explicitly.** Each assumption (hardware root-of-trust boundary, fTPM isolation in OP-TEE, U2F/HSM key custody, supply-chain digest pins) carries a strength grade: strong (tested, attested), medium, weak (asserted, unverified). A weak `K` blocks promotion even when `P` looks small.
2. **Budget `s_{N+1}`.** Threat models record a nonzero completeness mass, so "no known scenario" never reads as "zero risk."
3. **Clef decision gating already uses this shape.** This corpus's own dig weights every source with a Clef `noul` probability and treats weight < 0.50 as weak backing; the weight is a `Q` over source quality, and the label exposes `K` strength to the reader.
4. **Separate the variance terms in telemetry.** Retries and flaky hardware are aleatory; untested firmware paths are epistemic and need evidence, not more retries.

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | Foundational Issues in Risk Analysis - Society for Risk Analysis | https://www.sra.org/risk-analysis-specialty-groups/foundational-issues-in-risk-analysis/ | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.9011 | Authoritative |
| 2 | Risk Science; An Introduction | https://api.pageplace.de/preview/DT0400.9781000434989_A41331302/preview-9781000434989_A41331302.pdf | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.8712 | Authoritative |
| 3 | A perspective on the foundation of the science(s) of risk | https://www.sciencedirect.com/science/article/pii/S295062982600007X | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.9194 | Authoritative |
| 4 | Society for Risk Analysis Glossary | https://www.sra.org/wp-content/uploads/2020/04/SRA-Glossary-FINAL.pdf | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.9375 | Authoritative |
| 5 | Risk | https://handwiki.org/wiki/Risk | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.1045 | Weak |
| 6 | Society - Wikipedia | https://en.m.wikipedia.org/wiki/Society | Society for Risk Analysis glossary Terje Aven risk science foundations | 0.0516 | Weak (off-topic, not cited) |
| 7 | Risk - Wikipedia | https://en.wikipedia.org/wiki/Risk | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.2873 | Weak |
| 8 | Kaplan: Education Programs for Universities, Businesses & Individuals | https://kaplan.com/ | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.0244 | Weak (off-topic, not cited) |
| 9 | Quantitative Definition Of Risk Kaplan-Garrick Risk Analysis 198 | https://www.nrc.gov/docs/ML1216/ML12167A133.pdf | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.9560 | Authoritative |
| 10 | The Review of the Definition of Risk | https://iiakm.org/ojakm/articles/2015/volume3_3/OJAKM_Volume3_3pp17-26.pdf | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.9036 | Authoritative |
| 11 | Risk Management vs. Risk Analysis · Murray Cantor | https://murraycantor.com/quantitative-risk-management.html | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.6369 | Authoritative |
| 12 | Kaplan Financial Education | https://www.kaplanfinancial.com/ | Kaplan and Garrick quantitative definition of risk triplets scenarios probability consequences | 0.0935 | Weak (off-topic, not cited) |
| 13 | Law of total variance - Wikipedia | https://en.wikipedia.org/wiki/Law_of_total_variance | law of total variance epistemic aleatory uncertainty decomposition risk analysis | 0.8067 | Authoritative |
| 14 | Law - Wikipedia | https://en.m.wikipedia.org/wiki/Law | law of total variance epistemic aleatory uncertainty decomposition risk analysis | 0.0557 | Weak (off-topic, not cited) |
| 15 | Subjective Risk Decomposition: A New View for Uncertainty... | https://arxiv.org/html/2607.15196 | law of total variance epistemic aleatory uncertainty decomposition risk analysis | 0.9119 | Authoritative |
| 16 | Sturm College of Law, University of Denver | https://law.du.edu/ | law of total variance epistemic aleatory uncertainty decomposition risk analysis | 0.0329 | Weak (off-topic, not cited) |
