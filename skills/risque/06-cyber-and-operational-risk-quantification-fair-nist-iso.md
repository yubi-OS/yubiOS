# 06. Cyber & Operational Risk Quantification (FAIR, ISO 31000, NIST & Risk Matrix Critique)

> **Scope:** Quantitative cyber/operational risk decomposition via Factor Analysis of Information Risk (FAIR: Loss Event Frequency = Threat Event Frequency x Vulnerability; Primary and Secondary Loss Magnitude), ISO 31000:2018 & IEC 31010 tool selection, NIST SP 800-30, and Tony Cox's mathematical theorem on risk scoring matrix failures (rank reversal, range compression).

**Grounding note.** Every claim about an external standard or paper below cites a result from the Clef-weighted dig record `research-db/digs/06-cyber-and-operational-risk-quantification-fair-nist-iso.json`. That record holds 20 results from 4 queries (1 redo round), and 7 of them weigh 0.50 or more. The rest of the doc is either labeled as this corpus's own modeling conventions or is worked arithmetic that anyone can check by hand. Neither of those is presented as the content of a standard.

## 1. FAIR: Positioning and Primary Definitions

FAIR describes itself as a quantitative model for information security and operational risk. Its top-level factors are Threat Event Frequency, Vulnerability and Loss Magnitude ([FAIR model - HubSpot](https://cdn2.hubspot.net/hubfs/1616664/The%20FAIR%20Model_FINAL_Web%20Only.pdf), weight: 0.6902). The same source calls FAIR "the only international standard quantitative model". Treat that as the publisher's self-description, not an independent finding.

The governing artifact is the FAIR Standard v3.0, dated January 15, 2025. It defines Vulnerability as "the probability that a threat event will become a loss event". It also says Secondary Loss Event Frequency represents a number of Loss Events ([FAIR Standard v3.0](https://www.fairinstitute.org/hubfs/Standards%20Artifacts/Factor%20Analysis%20of%20Information%20Risk%20(FAIR)%20Standard%20v3.0%20(January%202025).pdf), weight: 0.9772).

The supporting descriptions are weakly backed:

- Loss Event Frequency is the product of Threat Event Frequency and Vulnerability. Fines and Judgments (for example, civil suits) is one named loss type. Avoidance controls reduce contact with the asset ([Cyber Risk Concepts, LinkedIn](https://www.linkedin.com/pulse/cyber-risk-concepts-factor-analysis-information-fair-brendan-cronin), weight: 0.4170) [weak backing, weight: 0.4170].
- Threat event frequency, vulnerability and secondary losses each have subcategories ([CIS: FAIR](https://www.cisecurity.org/insights/blog/fair-a-framework-for-revolutionizing-your-risk-analysis), weight: 0.4839) [weak backing, weight: 0.4839].
- FAIR expresses cyber risk in financial terms through Loss Event Frequency and Probable Loss Magnitude, unlike qualitative methods ([Black Kite](https://blackkite.com/knowledge-centers/tprm-tpcrm-glossary/fair-factor-analysis-of-information-risk), weight: 0.1310) [weak backing, weight: 0.1310].
- Threat Event Frequency means how often threat events are likely to occur ([Secureframe](https://secureframe.com/frameworks-glossary/fair), weight: 0.1297) [weak backing, weight: 0.1297].

## 2. The Decomposition Tree (Corpus Working Model)

```
Risk (annualized loss exposure) = LEF x LM
|
+-- LEF  Loss Event Frequency       = TEF x Vuln
|   +-- TEF  Threat Event Frequency = CF x PoA
|   |   +-- CF   Contact Frequency
|   |   +-- PoA  Probability of Action
|   +-- Vuln Vulnerability          = P(TCap > RS)
|       +-- TCap Threat Capability
|       +-- RS   Resistance Strength
|
+-- LM   Loss Magnitude             = PLM + SLEF x SLM
    +-- PLM  Primary Loss Magnitude
    +-- SLEF Secondary Loss Event Frequency
    +-- SLM  Secondary Loss Magnitude
        (6 loss forms: Productivity, Response, Replacement,
         Competitive Advantage, Fines/Judgments, Reputation)
```

| Node | Status |
|---|---|
| TEF, Vuln and LM as the top-level factors | Cited: HubSpot FAIR PDF, weight 0.6902 |
| `Vuln` as the probability that a threat event becomes a loss event | Cited: FAIR Standard v3.0, weight 0.9772 |
| `SLEF` as a count of loss events | Cited: FAIR Standard v3.0, weight 0.9772 |
| `LEF = TEF x Vuln` | Cited: LinkedIn, weight 0.4170 [weak backing, weight: 0.4170] |
| Fines/Judgments as a loss form | Cited: LinkedIn, weight 0.4170 [weak backing, weight: 0.4170] |
| `TEF = CF x PoA`, `Vuln = P(TCap > RS)`, the other 5 loss forms | Corpus working model; no dig snippet states these leaves |

The `P(TCap > RS)` form is this corpus's way of computing the probability that FAIR v3.0 calls Vulnerability.

**Distributions instead of single numbers (corpus convention).** Model each leaf as a distribution. Use calibrated PERT ranges (minimum, most likely, maximum) for TEF and magnitudes. Use Poisson for event counts given a rate, and Lognormal for heavy-tailed loss sizes. Run the tree as a Monte Carlo simulation, for example over 10,000 simulated years. This is a modeling rule of this corpus, not a quotation from the FAIR standard.

## 3. Pathology of Ordinal 5x5 Risk Matrices

Standard risk matrices exist in some settings (US DoD, NASA, ISO), and many projects build or adapt their own ([Risk matrix - Wikipedia](https://en.wikipedia.org/wiki/Risk_matrix), weight: 0.2320) [weak backing, weight: 0.2320].

The formal critique is Louis Anthony (Tony) Cox Jr., "What's Wrong with Risk Matrices?", published in *Risk Analysis* in 2008. A secondary review describes it as a formal treatment rather than an opinion piece, establishing 3 distinct limitations, of which the first is resolution ([Are Risk Matrices Valid? What Cox Actually Proved](https://www.missionintelsystems.com/insights/are-risk-matrices-valid), weight: 0.4995) [weak backing, weight: 0.4995]. The dig did not return the paper itself, and the snippet names only resolution, so each failure mode below is shown with arithmetic you can check by hand.

**Example scheme.** Likelihood bins per year are L1 < 0.01, L2 0.01 to 0.1, L3 0.1 to 0.3, L4 0.3 to 0.7, L5 > 0.7. Impact bins are I1 < $10k, I2 $10k to $100k, I3 $100k to $1M, I4 $1M to $10M, I5 > $10M. Cell score = L x I.

1. **Range compression (limited resolution).** I5 covers $10M up to any amount, so an $11M loss and a $5B loss share a column. That is a spread of more than 2 orders of magnitude inside one cell.
2. **Rank reversal.** Risk A has `p_A = 0.29` and `c_A = $9.9M`, so it sits in L3 x I4, scores 12 and has an expected loss of $2.871M. Risk B has `p_B = 0.31` and `c_B = $1.0M`, so it sits in L4 x I4, scores 16 and has an expected loss of $0.310M. The matrix ranks B above A, but `p_A * c_A` is about 9.3x larger than `p_B * c_B`. In general, a pair with `p_1 * c_1 < p_2 * c_2` can receive the higher cell color.
3. **Ambiguity under negative correlation.** Points on the same iso-risk curve `p * c = k` land in different cells. For example, `0.05 x $2M` (L2 x I4, score 8) and `0.5 x $200k` (L4 x I3, score 12) both have an expected loss of $100k. When `p` and `c` are negatively correlated, which is common because rare events tend to be severe, the color tracks where the boundaries were drawn, not the size of the risk.
4. **Arbitrary boundary distortion.** Moving the L3/L4 boundary from 0.3 to 0.32 drops Risk B into L3 (score 12), so it ties with A. The ranking changed even though neither risk did.

**Replacement rule.** When a ranking drives resource allocation or a go/no-go gate, use the simulated annual-loss distribution and its Loss Exceedance Curve:

```
LEC(x) = P(Annual Loss > x),  plotted on a log-scale x axis
```

Rank treatments by how much they shift the LEC (for example, the reduction in `P(Annual Loss > $10M)`) per dollar of control cost. Red/Yellow/Green heatmaps can still be used to communicate results, but they should never be the decision input. This rule is derived from the arithmetic above. The dig supports only the weak statement that FAIR expresses risk financially, unlike qualitative methods (Black Kite, weight 0.1310) [weak backing, weight: 0.1310].

## 4. Cross-Mapping ISO 31000, NIST SP 800-30 and Sector Standards

**ISO 31000:2018** is the international standard that gives principles and guidelines for risk management, for organizations that want a comprehensive approach ([ISO 31000:2018](https://www.iso.org/standard/31000), weight: 0.9729). A secondary summary describes its core as identifying and assessing all business risks, then treating them by avoiding them, reducing them or training staff, so that the impact of risk events is minimized ([atcon.cz ISO 31000](https://atcon.cz/iso-31000), weight: 0.4535) [weak backing, weight: 0.4535].

**NIST SP 800-30 Rev. 1**, *Guide for Conducting Risk Assessments*, gives guidance for conducting risk assessments of federal information systems and organizations. It amplifies the guidance in SP 800-39 ([SP 800-30 Rev. 1 | CSRC](https://csrc.nist.gov/pubs/sp/800/30/r1/final), weight: 0.9762; [Guide for Conducting Risk Assessments | NIST](https://www.nist.gov/publications/guide-conducting-risk-assessments), weight: 0.9717). NIST is the U.S. body that advances measurement science and standards ([NIST](https://www.nist.gov/), weight: 0.8761).

**Lineage.** One audit-methodology article places ISO 31000:2018 (at the risk-identification stage), ISO/IEC 27005 and NIST SP 800-30 Rev. 1 together as the basis of information security risk assessment methods ([auditeams.com](https://auditeams.com/ArticleDetails/215780cb-fae7-4121-a7fd-5e17c61ce36d), weight: 0.1440) [weak backing, weight: 0.1440].

**IEC/ISO 31010.** This doc uses it as the technique-selection layer: choose a quantitative technique, such as the FAIR Monte Carlo above, when the decision needs magnitudes, and choose a qualitative screen otherwise. The dig returned no IEC 31010 text, so this doc makes no claim about the standard's catalog contents.

**Sector overlay.** For industrial control systems, the ISA/IEC 62443 series gives ICS environments a platform to conform with cyber risk identification needs ([IET Cyber-Physical Systems, 2024](https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/cps2.12105), weight: 0.8685).

| ISO 31000 process step | Quantitative tool in this doc | FAIR node | Where NIST SP 800-30 Rev. 1 sits |
|---|---|---|---|
| Risk identification | Scenario definition (asset, threat, effect) | TEF inputs (CF, PoA) | Risk assessment guidance for federal systems |
| Risk analysis | Monte Carlo over the FAIR tree | LEF, LM | Same assessment step |
| Risk evaluation | LEC versus a risk appetite curve | Annualized loss distribution | Feeds SP 800-39 risk management |
| Risk treatment | Delta-LEC per dollar of control | RS (resistance), avoidance controls | Outside SP 800-30's assessment scope |

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | FAIR model - HubSpot | https://cdn2.hubspot.net/hubfs/1616664/The%20FAIR%20Model_FINAL_Web%20Only.pdf | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.6902 | Authoritative (>= 0.50) |
| 2 | Factor Analysis of Information Risk (FAIR) Standard v3.0 (January 2025) | https://www.fairinstitute.org/hubfs/Standards%20Artifacts/Factor%20Analysis%20of%20Information%20Risk%20(FAIR)%20Standard%20v3.0%20(January%202025).pdf | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.9772 | Authoritative (>= 0.50) |
| 3 | FAIR: A Framework for Revolutionizing Your Risk Analysis | https://www.cisecurity.org/insights/blog/fair-a-framework-for-revolutionizing-your-risk-analysis | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.4839 | Weak (< 0.50) |
| 4 | Factor Analysis of Information Risk (FAIR) - Secureframe | https://secureframe.com/frameworks-glossary/fair | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.1297 | Weak (< 0.50) |
| 5 | What is Factor Analysis of Information Risk (FAIR)? - Black Kite | https://blackkite.com/knowledge-centers/tprm-tpcrm-glossary/fair-factor-analysis-of-information-risk | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.1310 | Weak (< 0.50) |
| 6 | Cyber Risk Concepts - Factor Analysis of Information Risk (FAIR) | https://www.linkedin.com/pulse/cyber-risk-concepts-factor-analysis-information-fair-brendan-cronin | Factor Analysis of Information Risk FAIR Loss Event Frequency Threat Event Frequency | 0.4170 | Weak (< 0.50) |
| 7 | ISO 31000:2018 - Risk management: Guidelines | https://www.iso.org/standard/31000 | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.9729 | Authoritative (>= 0.50) |
| 8 | Winning the battle with cyber risk identification tools in industrial ... | https://ietresearch.onlinelibrary.wiley.com/doi/10.1049/cps2.12105 | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.8685 | Authoritative (>= 0.50) |
| 9 | RISK: Global Domination on Steam | https://store.steampowered.com/app/1128810/RISK_Global_Domination/ | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.0185 | Weak (< 0.50), off-topic, not cited |
| 10 | Risk matrix - Wikipedia | https://en.wikipedia.org/wiki/Risk_matrix | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.2320 | Weak (< 0.50) |
| 11 | ISO 31000 | https://atcon.cz/iso-31000 | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.4535 | Weak (< 0.50) |
| 12 | Hasbro Risk - Download | https://www.hasbrorisk.com/en/download | Risk matrices Tony Cox rank reversal ISO 31000 IEC 31010 NIST 800-30 | 0.0352 | Weak (< 0.50), off-topic, not cited |
| 13 | WhatsApp Web | https://web.whatsapp.com/ | What's Wrong with Risk Matrices Louis Anthony Cox rank reversal | 0.0279 | Weak (< 0.50), off-topic, not cited |
| 14 | Are Risk Matrices Valid? What Cox Actually Proved | https://www.missionintelsystems.com/insights/are-risk-matrices-valid | What's Wrong with Risk Matrices Louis Anthony Cox rank reversal | 0.4995 | Weak (< 0.50) |
| 15 | Anthony Cox: webpage and blog of Anthony R Cox | https://anthonycox.org/ | What's Wrong with Risk Matrices Louis Anthony Cox rank reversal | 0.2572 | Weak (< 0.50), different person (pharmacovigilance), not cited |
| 16 | WHAT Definition & Meaning - Merriam-Webster | https://www.merriam-webster.com/dictionary/what | What's Wrong with Risk Matrices Louis Anthony Cox rank reversal | 0.0185 | Weak (< 0.50), off-topic, not cited |
| 17 | SP 800-30 Rev. 1, Guide for Conducting Risk Assessments, CSRC | https://csrc.nist.gov/pubs/sp/800/30/r1/final | NIST SP 800-30 Rev 1 Guide for Conducting Risk Assessments IEC 31010 | 0.9762 | Authoritative (>= 0.50) |
| 18 | National Institute of Standards and Technology | https://www.nist.gov/ | NIST SP 800-30 Rev 1 Guide for Conducting Risk Assessments IEC 31010 | 0.8761 | Authoritative (>= 0.50) |
| 19 | Guide for Conducting Risk Assessments, NIST | https://www.nist.gov/publications/guide-conducting-risk-assessments | NIST SP 800-30 Rev 1 Guide for Conducting Risk Assessments IEC 31010 | 0.9717 | Authoritative (>= 0.50) |
| 20 | Принцип проведения аудита по этапам (auditeams.com) | https://auditeams.com/ArticleDetails/215780cb-fae7-4121-a7fd-5e17c61ce36d | NIST SP 800-30 Rev 1 Guide for Conducting Risk Assessments IEC 31010 | 0.1440 | Weak (< 0.50) |
