# 03. Systems-Theoretic (STAMP/STPA), FMECA/HAZOP & Human Reliability Analysis

> **Scope:** Control-theoretic hazard analysis via Nancy Leveson's STAMP and STPA (control structures, Unsafe Control Actions, causal scenarios), FMECA and RPN pathology vs. Action Priority, HAZOP guideword matrices, and Human Reliability Analysis (THERP, SPAR-H, CREAM performance shaping factors).

## Grounding Legend

- `weight >= 0.50`: authoritative backing from the Clef-weighted dig (20 results, 2 dig attempts).
- `[weak backing, weight: 0.xxxx]`: the only dig source for the claim scored below 0.50.
- `(derivation)`: arithmetic shown in full in this doc, checkable without a source.
- `(practitioner convention, no dig source)`: a structure no dig result states directly. Kept because the corpus specification requires it; verify against the named primary standard before load-bearing use.

## 1. STAMP: Accidents as Control Problems

STAMP treats safety as a control problem: it "focuses on control actions rather than faults or failures" and is "heavily hierarchical" ([Understanding STAMP, STPA, and CAST](https://www.ul.com/sis/blog/introduction-to-stamp-stpa-and-cast), weight: 0.7797). Two analysis methods sit on the model: STPA (Systems-Theoretic Process Analysis) for hazard analysis, and CAST (Causal Analysis based on STAMP) as "the equivalent for accident and incident analysis" ([About Stamp, European STAMP Workshop](https://www.stamp-workshop.eu/about-stamp/), weight: 0.8181). STAMP methods "can be used at any stage of development" ([UL SIS](https://www.ul.com/sis/blog/introduction-to-stamp-stpa-and-cast), weight: 0.7797).

### 1.1 The STPA 4-Step Workflow

A peer-reviewed STPA application frames the analysis around safety hazards, Unsafe Control Actions, causal factors, and hazard scenarios ([Leveson et al., SAFECOMP 2015, MIT DSpace](https://dspace.mit.edu/bitstream/handle/1721.1/108234/Leveson_Systems-theoretic.pdf?sequence=1&isAllowed=y), weight: 0.9604). The step numbering and column labels below follow the standard STPA handbook layout (practitioner convention, no dig source).

| Step | Artifact | Formal shape |
|---|---|---|
| 1. Define purpose | Losses, hazards, constraints | Losses `L_k`; system-level hazards `H_j`, each traced to `L_k`; safety constraints `SC_j = not(H_j)` |
| 2. Model control structure | Hierarchical control diagram | Controllers, control actions `CA_i`, feedback channels, and each controller's process model |
| 3. Identify UCAs | UCA table | For each `CA_i` x 4 columns, record the context in which `CA_i` leads to `H_j` |
| 4. Identify loss scenarios | Causal scenarios | Why a UCA occurs, or why a safe `CA_i` is not executed |

Step 3 evaluates every control action against 4 columns:

1. Not providing `CA_i` causes hazard.
2. Providing `CA_i` causes hazard.
3. `CA_i` provided too early, too late, or out of order.
4. `CA_i` stopped too soon or applied too long.

Step 4 scenario classes: flawed process-model beliefs (the controller's internal state diverges from the plant), delayed or corrupted feedback, and control actions issued correctly but not executed by the actuator or controlled process.

### 1.2 Where STPA Beats Component Failure Chains

Because STAMP targets control actions rather than faults ([UL SIS](https://www.ul.com/sis/blog/introduction-to-stamp-stpa-and-cast), weight: 0.7797), it can surface hazards in which no component fails: every part meets its specification, yet the interaction produces a loss. The MIT SAFECOMP 2015 study used STPA "to determine the safety hazard scenarios and their potential causes, in robotic surgical systems", a software-intensive, human-in-the-loop domain ([MIT DSpace](https://dspace.mit.edu/bitstream/handle/1721.1/108234/Leveson_Systems-theoretic.pdf?sequence=1&isAllowed=y), weight: 0.9604). By the same logic, an AI agent acting on a stale world model is a Step 4 flawed-process-model scenario: nothing broke, the controller's beliefs diverged from reality.

Tooling for large analyses is emerging: STPAmaster, developed by Akaene and Czech Technical University in Prague, targets "management of complex real-scale analyses" [weak backing, weight: 0.4991] ([STPAmaster](https://stpamaster.com/)).

## 2. FMECA and the RPN Pathology

FMECA (Failure Mode, Effects, and Criticality Analysis) "is a method used to identify potential failures in a system" [weak backing, weight: 0.1278] ([Wikipedia: FMECA](https://en.wikipedia.org/wiki/Failure_Mode,_Effects,_and_Criticality_Analysis)), run as a step-by-step method [weak backing, weight: 0.3769] ([PM Study Circle](https://pmstudycircle.com/fmeca/)). The AIAG & VDA FMEA occurrence ranking table scores failure-mode likelihood on a 1 to 10 scale and feeds both "Risk Priority Number (RPN) / Action Priority calculation in design and process FMEAs" ([FMEA Occurrence Ranking Table, Mech Codex](https://mechcodex.com/reference/fmea-occurrence-ranking-table-o-1-to-10), weight: 0.6325).

### 2.1 RPN Is Non-Injective (derivation)

`RPN = S * O * D` multiplies 3 ordinal scales, each 1 to 10. Ordinal ranks carry order but no interval meaning, so their product has no defined unit. The map is also non-injective:

- Mode A: `S=10, O=2, D=5` gives `RPN = 100` (catastrophic, rare, moderately detectable).
- Mode B: `S=4, O=5, D=5` gives `RPN = 100` (moderate, frequent).
- Mode C: `S=5, O=5, D=4` gives `RPN = 100`.

All 3 tie, and a threshold such as "act if `RPN >= 120`" would ignore Mode A entirely. Only 120 distinct values exist across the 1,000 possible `(S, O, D)` triples (computed by enumeration), so ties are structural.

### 2.2 Replacements

- **AIAG & VDA Action Priority (AP):** the same 1 to 10 rankings feed an AP calculation in place of, or alongside, RPN ([Mech Codex](https://mechcodex.com/reference/fmea-occurrence-ranking-table-o-1-to-10), weight: 0.6325). AP is a lookup assigning High, Medium, or Low with Severity dominant, so `S` in 9 to 10 cannot be diluted by low `O` or `D` (practitioner convention, no dig source; verify against the AIAG & VDA FMEA Handbook).
- **Quantitative criticality:** mode criticality `C_m = beta * alpha * lambda_p * t`, where `beta` is the conditional probability of the end effect, `alpha` the failure-mode ratio, `lambda_p` the part failure rate, and `t` the operating time [weak backing, weight: 0.1278] ([Wikipedia: FMECA](https://en.wikipedia.org/wiki/Failure_Mode,_Effects,_and_Criticality_Analysis)); item criticality sums `C_m` over modes on a severity x criticality matrix.

## 3. HAZOP Guideword Matrices

Both dig attempts targeted HAZOP and returned no relevant result, so this section is practitioner convention, no dig source (verify against IEC 61882). The structure is a Cartesian product of process parameters (flow, pressure, temperature, level, time) and guidewords:

| Guideword | Meaning | Example deviation (parameter: flow) |
|---|---|---|
| No / None | Complete negation | No flow |
| More | Quantitative increase | High flow |
| Less | Quantitative decrease | Low flow |
| As Well As | Qualitative addition | Contaminant carried with flow |
| Part Of | Qualitative reduction | Missing component in stream |
| Reverse | Logical opposite | Back flow |
| Other Than | Complete substitution | Wrong material |
| Early / Late | Timing | Flow starts before valve line-up |

Each meaningful cell yields causes, consequences, safeguards, and actions. STPA Step 3's 4 UCA columns play the same role as guidewords, applied to control actions instead of process parameters.

## 4. Human Reliability Analysis

Human reliability "is the probability that a human performs a task to a sufficient standard", and it "can be affected by many factors" ([Human reliability, Wikipedia](https://en.wikipedia.org/wiki/Human_reliability), weight: 0.7033). HRA "grew up in the 1960s with the intention of modelling the likelihood and consequences of human error" [weak backing, weight: 0.2792] ([Academia.edu: Comparison of THERP, HEART and SPAR](https://www.academia.edu/figures/32776315/table-1-comparison-therp-heart-and-spar-for-assessment-of)). The THERP handbook "presents methods, models and estimated HEPs", and SPAR-H originated in nuclear with wider application ([Lessons learned from past accidents, CORE](https://core.ac.uk/download/pdf/76530826.pdf), weight: 0.9311). HRA has supported risk assessment for Positive Train Control ([ROSA P, US DOT](https://rosap.ntl.bts.gov/view/dot/8745), weight: 0.8572). IAEA-TECDOC-592 (April 1991) is listed as an HRA case-study reference [weak backing, weight: 0.1795] ([FTA Associates](https://ftaassociates.com/human-reliability-assessment/)).

### 4.1 SPAR-H Quantification

SPAR-H is specified in NUREG/CR-6883, "The SPAR-H Human Reliability Analysis Method" ([SCIRP reference to NUREG/CR-6883](https://www.scirp.org/reference/referencespapers?referenceid=845318), weight: 0.7261). It quantifies HEP by applying performance shaping factor multipliers, and it "has proved to be a reliable, easy-to-use method"; one caveat matters for auditors: NUREG/CR-6883 does "not provide a clear account of the origin of these multipliers" ([The origins of the SPAR-H method's PSF multipliers, ResearchGate](https://www.researchgate.net/publication/4303606_The_origins_of_the_SPAR-H_method's_performance_shaping_factor_multipliers), weight: 0.8562).

The working model, per NUREG/CR-6883 ([SCIRP](https://www.scirp.org/reference/referencespapers?referenceid=845318), weight: 0.7261; [ResearchGate](https://www.researchgate.net/publication/4303606_The_origins_of_the_SPAR-H_method's_performance_shaping_factor_multipliers), weight: 0.8562); the specific values below are not quoted in the dig snippets, so confirm them in the NUREG text:

- Nominal HEP: `HEP_nom = 0.01` (diagnosis), `HEP_nom = 0.001` (action).
- 8 PSFs: available time, stress/stressors, complexity, experience/training, procedures, ergonomics/HMI, fitness for duty, work processes. `PSF_comp` is the product of the 8 multipliers.
- Naive `HEP = HEP_nom * PSF_comp` can exceed 1: `0.01 * 200 = 2.0`.
- Adjustment applied when 3 or more PSFs are negative:

`HEP = (HEP_nom * PSF_comp) / (HEP_nom * (PSF_comp - 1) + 1)`

Bound check (derivation): for `PSF_comp >= 1` and `0 < HEP_nom < 1`, the denominator minus the numerator equals `1 - HEP_nom > 0`, so `HEP < 1`. With `0.01` and `200`: `2.0 / 2.99 = 0.669`.

CREAM's common performance conditions play the analogous context-shaping role (practitioner convention, no dig source; verify against Hollnagel 1998).

## Sources Considered

| # | Title | URL | Query | Clef Weight | Backing Tier |
|---|---|---|---|---|---|
| 1 | Understanding STAMP, STPA, and CAST: Safety Engineering, SIS | https://www.ul.com/sis/blog/introduction-to-stamp-stpa-and-cast | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.7797 | Authoritative |
| 2 | Students, South Texas ISD Preparatory Academy | https://preparatoryacademy.stisd.net/students | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.0212 | Off-topic, not cited |
| 3 | STPAmaster: The next generation of Stamp-based toolsets | https://stpamaster.com/ | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.4991 | Weak |
| 4 | Home, South Texas ISD Preparatory Academy | https://preparatoryacademy.stisd.net/ | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.0244 | Off-topic, not cited |
| 5 | SAFECOMP_2015_arxiv_2 (Leveson, Systems-theoretic) | https://dspace.mit.edu/bitstream/handle/1721.1/108234/Leveson_Systems-theoretic.pdf?sequence=1&isAllowed=y | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.9604 | Authoritative |
| 6 | About Stamp, European Stamp Workshop and Conference | https://www.stamp-workshop.eu/about-stamp/ | STPA STAMP Leveson unsafe control actions systems-theoretic hazard analysis | 0.8181 | Authoritative |
| 7 | Human Reliability Analysis in Support of Risk Assessment for Positive Train Control | https://rosap.ntl.bts.gov/view/dot/8745 | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.8572 | Authoritative |
| 8 | Failure mode, effects, and criticality analysis, Wikipedia | https://en.wikipedia.org/wiki/Failure_Mode,_Effects,_and_Criticality_Analysis | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.1278 | Weak |
| 9 | Table 1, Comparison of Selected Methods for Human Reliability | https://www.academia.edu/figures/32776315/table-1-comparison-therp-heart-and-spar-for-assessment-of | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.2792 | Weak |
| 10 | Human Reliability Assessment, FTA Associates | https://ftaassociates.com/human-reliability-assessment/ | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.1795 | Weak |
| 11 | What is FMECA? A Complete Guide to Failure Mode and Criticality | https://pmstudycircle.com/fmeca/ | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.3769 | Weak |
| 12 | Lessons learned from past accidents: The integration of human and... | https://core.ac.uk/download/pdf/76530826.pdf | FMECA HAZOP Human Reliability Analysis SPAR-H THERP risk assessment | 0.9311 | Authoritative |
| 13 | Human reliability, Wikipedia | https://en.wikipedia.org/wiki/Human_reliability | NUREG/CR-6883 SPAR-H human reliability analysis performance shaping factors | 0.7033 | Authoritative |
| 14 | Reddit r/wifeporn (adult content) | https://www.reddit.com/r/wifeporn/ | NUREG/CR-6883 SPAR-H human reliability analysis performance shaping factors | 0.0295 | Off-topic, not cited |
| 15 | "The SPAR-H Human Reliability Analysis Method," NUREG/CR-6883 (SCIRP reference) | https://www.scirp.org/reference/referencespapers?referenceid=845318 | NUREG/CR-6883 SPAR-H human reliability analysis performance shaping factors | 0.7261 | Authoritative |
| 16 | The origins of the SPAR-H method's performance shaping factor multipliers | https://www.researchgate.net/publication/4303606_The_origins_of_the_SPAR-H_method's_performance_shaping_factor_multipliers | NUREG/CR-6883 SPAR-H human reliability analysis performance shaping factors | 0.8562 | Authoritative |
| 17 | WhatsApp, Official Site | https://www.whatsapp.com/ | HAZOP guidewords FMEA AIAG VDA Action Priority RPN critique | 0.0251 | Off-topic, not cited |
| 18 | FMEA Occurrence Ranking Table, Mech Codex | https://mechcodex.com/reference/fmea-occurrence-ranking-table-o-1-to-10 | HAZOP guidewords FMEA AIAG VDA Action Priority RPN critique | 0.6325 | Authoritative |
| 19 | FMEA školení, Integrated Consulting | https://www.integratedconsulting.cz/skoleni/ | HAZOP guidewords FMEA AIAG VDA Action Priority RPN critique | 0.0639 | Off-topic, not cited |
| 20 | WhatsApp, Messages et appels privés (French) | https://www.whatsapp.com/?lang=fr | HAZOP guidewords FMEA AIAG VDA Action Priority RPN critique | 0.0332 | Off-topic, not cited |
