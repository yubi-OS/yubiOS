# arXiv:2607.09967 vs. `learned-latent-curve` — Sourcing Check

**Date:** 2026-08-04
**Requested by:** Jenny Latuu (session verification: "did arXiv:2607.09967 get used to make any of the learned-curve skills or anything in the skills at all?")
**Verdict: NOT USED.** No skill in the corpus (69 github-yubios skills, 21 global, 10 personal — 100 total checked) cites, references, or derives from this paper. The two "curve" artifacts are unrelated in problem domain and in mathematical form. This document records the check and the side-by-side equations so the distinction is durable.

## Citation

> Ethan Smith. **"Learning in Curved Weight Space: Exponential-Linear Weight Reparameterization for Improved Optimization."** arXiv:2607.09967 [cs.LG]. Submitted 10 Jul 2026 (v1), revised 14 Jul 2026 (v2). https://arxiv.org/abs/2607.09967

## What the paper actually is

SymExpLin (SEL) is a **neural-network weight reparameterization for training optimization**. It targets a completely different problem than any curve-fitting skill in this repo: the paper's "curve" is a *curved parameter-space geometry* for **weight updates during SGD/Adam training**, not a fitted embedding function over a corpus of items.

Core transform (canonical congruent form, paper Eq. 3), for a raw weight scalar `w` and curvature `β`:

$$
w_{\text{eff}} \;=\; \frac{\operatorname{sign}(w)\cdot\bigl(\exp(\beta|w|)-1\bigr)}{\beta} \;+\; \frac{w}{\beta}
$$

Generalized with learnable controls (paper Eq. 5–7) — effective curvature `κ`, normalizer `d`, offset `n`, pathway scales `e_w`/`l_w`, optional low-rank residual `Δ_φ`:

$$
E_\theta(|w|) = \frac{e_w}{d}\Bigl(\exp(\kappa|w| - n) - \exp(-n)\Bigr), \qquad
S_\theta(w) = \operatorname{sign}(w)\cdot E_\theta(|w|), \qquad
L_\theta(w) = \frac{l_w}{d}\,w
$$

$$
w_{\text{eff}} = \operatorname{sign}(w)\cdot\bigl(E_\theta(|w|) + L_\theta(w)\bigr) + \Delta_\phi \quad\text{(mismatch mode, Eq. 9)}
$$

- **Input/output:** `w ∈ ℝ` (one raw scalar weight) → `w_eff ∈ ℝ` (one effective weight). A pointwise, elementwise map applied to every weight in a matrix — no notion of a corpus, an ordering, or an embedding dimension.
- **What's learned:** `κ` (or `m`, the curvature multiplier), `n` (offset), `e_w`/`l_w` (pathway mixing scales) — parameters that reshape *how a single weight's optimizer step translates into effective magnitude*. Trained jointly with the model via standard backprop; folded back into ordinary linear weights after training (zero inference cost).
- **Why it exists:** Adam normalizes gradient *magnitude* per-coordinate but takes additive steps; a weight at 0.004 and one at 0.4 get similarly-sized absolute updates despite needing very different relative ones. SEL's `symexp`-based pathway makes raw-space sensitivity `∂w_eff/∂w_raw` grow with `|w|`, so identical optimizer steps produce magnitude-proportional effective movement — closing a *training-dynamics* gap, not a *representation* gap.
- **Validation:** transformers on OpenWebText, 9 width×depth configs, 1.32–1.49× fewer training steps to matched validation loss.

## What `learned-latent-curve` actually is

A **dimensionality-expansion skill**: re-expand a single 1-D ordering coordinate `t` (derived from a corpus of N items, e.g. via PCA top-1) into a fixed-width D-dimensional embedding via a Fourier curve with *learned frequencies*, fit once per corpus via reconstruction loss against real target vectors.

Core model (skill body, `## The Model`):

$$
z_j(t) \;=\; a_{j,0} \;+\; \sum_{m=1}^{k}\Big( a_{j,m}\,\sin(2\pi f_m t) \;+\; b_{j,m}\,\cos(2\pi f_m t) \Big), \qquad j = 1,\dots,D
$$

Equivalently `γ(t) = C·φ(t)` with design vector `φ(t) = [1, sin(2πf_1 t), cos(2πf_1 t), …, sin(2πf_k t), cos(2πf_k t)]`.

- **Input/output:** `t ∈ [0,1]` (one scalar ordering coordinate per item) → `z(t) ∈ ℝ^D` (e.g. D=384, a full embedding vector). A curve through embedding space, one point per corpus item, defined everywhere on `[0,1]` so interpolation between items is meaningful.
- **What's learned:** `k` shared frequencies `f_m` (softplus-positive, log-spaced init) plus a `D×(1+2k)` coefficient matrix `C` — closed-form ridge solution for `C` at fixed frequencies, gradient descent only on the frequencies. Fit once against N target embedding vectors (e.g. co-occurrence-SVD word embeddings of the 62 github-yubios skills).
- **Why it exists:** N items in an N-D feature space need a single ordering coordinate and a fixed-width, interpolatable embedding indexed by it — a sparse-cell detector for corpus-quality audits (`curve-guided-rsi`, `curve-guided-rsi-self`).
- **Validation:** github-yubios artifact corpus, N=62→211 across v1–v4, headline v3 holdout R²=+0.4655 on a 2-D learned surface.

## Side-by-side

| | SymExpLin (arXiv:2607.09967) | `learned-latent-curve` |
|---|---|---|
| Domain | Optimizer/weight-space geometry for NN training | Corpus embedding / dimensionality expansion |
| Curve variable | A raw weight scalar `w` (per-parameter) | An ordering coordinate `t ∈ [0,1]` (per-item) |
| Basis | `symexp`/`symlog` (sign-preserving exponential) | Fourier (`sin`/`cos`) with **learned frequencies** |
| What's "curved" | The mapping from raw weight to effective weight | The embedding manifold traced through D-space |
| Fit target | Training loss (language modeling) via backprop | Reconstruction MSE against a target embedding matrix |
| Output shape | Scalar → scalar, applied per-weight | Scalar → D-dim vector, one curve for the whole corpus |
| Composed with | Adam, μP (width-scaling) | PCA (for `t`), ridge regression (closed-form `C`), RSI/negative-skill-space (downstream) |
| Persisted artifact | Folded into ordinary linear weights post-training | `f`, `C`, scaler, PCA loadings, `v_canonical`, warm-start bundle |

The only textual overlap is the word "curve"/"curved" and both using an exponential-family or trigonometric basis with learnable shape parameters — a naming coincidence, not a shared derivation. Neither skill (`learned-latent-curve`, `curve-guided-rsi`, `curve-guided-rsi-self`) cites this paper, and this paper is not in scope for anything either skill does.

## Evidence trail

- `grep -r "arxiv\|2607.09967\|curved weight space\|Ethan Smith\|exponential-linear weight" skills/` across all 100 skills (global, personal, github-yubios): **zero matches** outside this verification's own working notes.
- `learned-latent-curve/SKILL.md` changelog and origin session (`ses_035f9d59dffe3D70yw8qAVrr4N`, `ses_035a19a26ffe99pXskhFjVLzqA`, 2026-08-04) confirm the skill was built from a **user-uploaded Duck.ai conversation transcript**, not this or any cited paper.
- The skill's own literature references (`## Obtaining the 1-D Coordinate t`, `## Interaction with Other Skills`) name Rahimi & Recht (random Fourier features) and Tancik et al. (NeRF positional encoding) as related work — not SymExpLin.
- Paper fetched directly from https://arxiv.org/abs/2607.09967 and https://arxiv.org/html/2607.09967v2 to confirm subject matter and pull exact equations for this comparison.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Recommendation

**Verdict**: comparative prior-art review (arXiv 2607.09967 vs. learned-latent-curve); conclusions live in the body above.

Context: template Mode-D sections appended by repo-refs-skill cycle-1 (Δ=+0.6921) and cycle-2 7-D batch (Δ=+0.4199) were duplicate placeholder stubs with no per-file content; merged into this single record on 2026-09-18.
## 2026-09-18 drift check (wayfinder round 8, cycle 78)

the arXiv comparison record (round-7 cycle-99 merged stubs): its comparative verdicts are historical and unchanged; note additive.
