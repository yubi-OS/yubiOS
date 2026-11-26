# What transfers between handwritten and spoken digits?

Cloudflare BGE-M3 embedded 240 real handwriting observations and 240 real speech recordings after conversion to a common numeric grid syntax. Each modality contributed 120 references and 120 held-out queries, balanced across ten digit identities. The four evaluations reuse those two holdouts, so there are **240 unique held-out observations**. The strongest recognition came from the original measurement grids. The embeddings exposed class-associated Fourier degrees within each modality, while cross-modal top-choice recognition stayed close to the balanced chance level of 12/120.

## Resolution and recognition

Every recognition entry counts correct choices among 120 queries. Raw refers to the 64 numerical measurements before text embedding. Packing uses fixed-order greedy selection on the 1,024-coordinate ambient sphere at the same source-reference median chord in both charts. The reference chord is 0.348 for handwriting and 0.492 for speech. It changes with the source bank.

| Reference → query | Raw centroid / NN | Embedding centroid / NN | Native Gibbs | Powered fixed / adjusted Gibbs | Native → powered packing | Full Walsh |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Handwriting → handwriting | 105 / 115 | 30 / 25 | 22 | 28 / 32 | 11 → 120 | 14 |
| Speech → speech | 76 / 60 | 20 / 27 | 20 | 25 / 21 | 4 → 119 | 20 |
| Handwriting → speech | 18 / 17 | 4 / 9 | 7 | 9 / 13 | 26 → 46 | 10 |
| Speech → handwriting | 21 / 28 | 11 / 16 | 11 | 10 / 14 | 1 → 73 | 14 |

On handwriting, adjusted power gained 12 correct choices and lost two relative to native Gibbs. The observation-level paired test gives p = 0.01294; the source lacks IDs for a writer-blocked test. The strongest raw comparator recognized 115/120 (95.8%). On speech, the two test speakers changed by −2 and +3 correct. The exact two-speaker test gives p = 1.0. Geometry alone would have rated the two within-modality outcomes similarly: both approached saturation at the reference chord. For transfer, powered Gibbs scored 13 and 14 with within-target label permutation p = 0.409 and 0.286.

## Which degrees carry recognizable class information?

For each degree the statistic averages its signed contribution to the correct class minus its mean contribution to the other nine classes. The one-sided permutation p values compare each standardized contrast to the maximum over all active degrees in the same direction. Labels were permuted 999 times within each test speaker, or across the official handwriting test subset; the identity labeling is included. “Alone” and “Omitted” are correct choices using only that degree or dropping it from the complete score.

| Reference → query | Focal bits | Degree | Max-adjusted p | Alone / omitted | Complete-score label p |
| --- | ---: | ---: | ---: | ---: | ---: |
| Handwriting → handwriting | 7 | 1 | 0.005 | 16 / 16 | 0.311 |
| Speech → speech | 6 | 2 | 0.007 | 27 / 12 | 0.013 |
| Speech → speech | 6 | 4 | 0.032 | 21 / 18 | 0.013 |
| Handwriting → speech | 7 | 3 | 0.013 | 17 / 11 | 0.778 |
| Speech → handwriting | 6 | 4 | 0.040 | 19 / 10 | 0.281 |

The table shows all contrasts with within-direction p < 0.05. With a further Bonferroni threshold of 0.0125 across the four directions, handwriting degree one and speech degree two survive. Handwriting's degree-one contrast can align with labels even though removing it improves two full-score choices. On speech, degree two alone recognized 27 and removing it reduced the full score to 12. Selecting that degree as a classifier would require a fresh holdout. The worst absolute difference between direct and signed spectral class scores was below 9 × 10⁻¹⁷ across all four evaluations.

## What the data resembles

Each query distributes one observation-equivalent and its measured input amount across the ten classes. All allocations sum back to 120 observations per direction. The handwritten holdout contributed 37,635 ink pixels. In the within-handwriting adjusted chart, class zero received 11.966 observation-equivalents and 3,735.72 ink pixels. The speech holdout contributed 353,157 waveform samples, or 44.145 seconds at 8 kHz. In its within-modality chart, class zero received 11.325 observation-equivalents and 33,357.59 samples. The conversion depends on the scorer and corpus. The two physical units are reported separately.

## Organization against the geometry null

The within-speech V2 was 0.481 versus a fixed-margin mean of 0.427 (z = +4.27, +12.61 dBc, upper-tail p = 0.01). In handwriting-to-speech transfer, the query codes had 191 collisions versus a null mean of 154.25 (z = +2.65, +8.47 dBc, p = 0.02), even though full Walsh recognition was 10/120. Within handwriting, degree-one angular power share fell from 0.474 to 0.155 on the powered globe; globe Gibbs went from 21 to 18 correct. The results JSON includes all degree shares, curve residuals, perturbation certificates, heat predictions, signed z values, null spreads and ablations. A dBc value always describes one specified statistic relative to its own null spread.

## Scope and replay

This study establishes outcomes for observed writers' marks and actual recorded speech under the specified adapters. The image input was an 8 × 8 ink-count grid; the audio input was a quantized 8 × 8 time-frequency grid. BGE-M3 received their numerical text, without file names, transcripts, class names or speaker IDs. The experiment measures the combined effects of the adapter, text encoder and geometric instrument. It does not isolate a native image or audio encoder, or establish modality-invariant digit meaning. Class balance, repeated observations per speaker, the small number of speakers and absent handwriting writer IDs limit population inference.

[Protocol](../../../tools/multimodal-occupancy/PROTOCOL.md) · [Instrument and replay instructions](../../../tools/multimodal-occupancy/README.md) · [All measured results](results.json) · [Data attribution](SOURCES.md) · [Provider receipts](inference.json)
