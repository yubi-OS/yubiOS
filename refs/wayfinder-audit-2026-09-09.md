# SOS wayfinder v0.2: audit, corrections and remaining evidence

## Verdict

The Cloudflare wayfinder's engineering defects were repaired and exercised on the entire pinned refs corpus. A 10/10 real-edit success rate is **not established**. The original Addendum 12 reported 2 kept rungs, 5 reverted rungs and 1 declined destructive suggestion over 10 map runs; those are not 10 independent graded edit trials. Passing software tests must not be substituted for predictive usefulness.

Live API: https://steady-orbit.systems-a.workers.dev/AGENT.md

UI: https://steady-orbit.systems-a.workers.dev/map/

The release lives in `tools/point-map/`. It includes the shared numerical module, full-text ingestion modules, Worker source template, browser client, reproducible build and regression suites. The legacy FIT API and the Sauna-hosted mirror remain separate; this release targets Cloudflare.

## Source coverage

Pinned yubiOS main: `84785eb321b2cbb8ddc3e46a52612d86cddf9e90`. Pinned EnvHarness: `fab7d57441f06b75c73a900e04561d4d7600f361`.

The three current papers were read in full: `learned-latent-curves-2026-08-06.tex`, `is-this-x-2026-08-12-Final.tex`, and `curved-corpus-unified-2026-08-22-v2.tex`. `papers/README.md` says the v2 unified paper supersedes the 08-13 version; that older file was checked for version differences, not counted as a fourth current paper. Also read: `papers/data/lean/CurvedCorpus.lean` (§§0–15), its scope boundary, the point-map spec including Addendum 12, the photophysics bridge, the acoustic/optical-phonon bridge and recorded followup results.

All 159 refs files were enumerated, SHA256 checked and included in a full-text embedding run. The live repository endpoint matched all 159 local source hashes exactly: **1,852,755 UTF-8 bytes, 4,712 chunks, no clipped files**. An earlier check exposed three 73–83 KB references exceeding the inherited 60K window; the explicit document limit was raised to 200K and the check repeated. Directory-wide inventory is supplied separately; detailed scientific reading focused on the relevant papers and bridge/field-results documents.

Latest pre-change Lean CI inspected: https://github.com/yubi-OS/yubiOS/actions/runs/34301917478 at `adeaefa3b3ba3e056c5f9670d5ab7cd51b86d9af`, all three jobs successful. This was the latest workflow run, not a claim that it ran on the newer ingestion HEAD.

## Repairs

1. **Frozen coordinates.** A baseline stores input PCA centering/axes/thresholds and placement normalization/PCA/lift. Reusing the seed alone cannot freeze fitted coordinates. `baseline_id` reuses the actual frame; `frame_id` and `instrument_id` are checked independently of the changed input fingerprint.
2. **Full-text measurement.** All supplied content is split into Unicode-safe ≤400-byte chunks, BGE mean-pooled per chunk, then byte-weighted and L2-normalized per document. Coverage describes submitted bytes, not lossless semantic preservation. Model/protocol/content-keyed SHA256 caching prevents unchanged documents from being re-embedded needlessly.
3. **Exact ingestion.** TAR parsing now skips binary entries and padding, validates header checksums, rejects truncated payloads and exceeded budgets, handles PAX byte lengths and long names, and accepts pinned commit URLs. Full literal file paths survive the pipeline. Oversize and empty inputs are explicit errors.
4. **Input-change observability.** A real late append changed the document hash and embedding but crossed no binary threshold. Comparisons now distinguish changed input from changed binary geometry and name quantization-silent edits. A stationary dot cannot establish that an edit was ignored.
5. **No destructive recommendations.** Isolation no longer authorizes deleting a source. Outliers are review-only. Synthetic ADD uses one row rather than three cloned rows. Candidates remain hypotheses requiring content inspection and a task check.
6. **Semantic honesty.** Azimuthal sectors are anonymous numbers. The twelve NSS axes remain an unvalidated lens dictionary; no PCA angle establishes a semantic defect. Pole-shift sign no longer decides whether an edit is good.
7. **Numerical correctness.** V2 uses covariance-trace normalization. The identity is the gate/rank equivalence, which can hold with both inequalities false. The rank gate is a measurement. Analytical MH detailed balance is separated from stochastic flux, stationary probabilities use stable normalization, and SLERP handles antipodes. False identity certificates stop computation before persistence.
8. **Sampler correctness.** The previous successful-move stopping rule sampled a jump chain. The new symmetric checkerboard-switch chain includes self-loops and counts attempted proposals. It preserves row/column margins and states that it is a switch chain, not full Curveball. Empirical tails expose their finite resolution; z remains descriptive. Finite mixing is still not proved by the margin identities.
9. **API safety.** Preflight validates numeric controls and baseline conflicts before embedding. 768-D vectors work directly; seed 0 survives; no silent coercion/filtering; legacy baselines return 409; body size is bounded; no exception stacks are exposed by the new routes.
10. **Operator interface.** Full file/folder inputs, baseline selector, explicit server errors, escaped paths, copyable hypotheses, comparison panel and a separate non-admitted spectroscopy card. No silent client fallback after a validation or identity failure.

## Observed verification

Local numerical suite: **57 passed**. API suite: **36 passed** (provider/DB boundaries use explicit test doubles; one entry is an explanatory capacity marker, not an independent scientific assertion). Archive suite: **10 passed**. No skipped assertions in these runs. The numerical suite includes the existing real 301×24 embedding fixture, identity-failure mutation tests, malformed frames and no-op correspondence.

The browser rendered the synthetic cloud with zero page errors; comparison-unavailable handling and path-injection escaping were checked. Live assets and health endpoints returned 200 after deployment propagation.

Live data:

| Run | N | Input | Observation |
|---|---:|---|---|
| 43 → 44 | 10 | real BGE 768-D texts | identical rerun: 10 unchanged anchors, zero bit flips, seed 0 preserved |
| 45 | 159 | complete refs corpus | zero identity failures; 26 isolated points; 12 occupied sectors; frame `07cb0c4994f0cc8a` |
| 46 | 159 | exact no-op against 45 | 159 cache hits; 159 unchanged anchors; zero bit flips; zero displacement |
| 47 | 159 | append factual Addendum 13 to point-map spec | 158 cache hits; one changed full-content hash; full coverage; zero binary flips, a genuine quantization-silent edit |

A subsequent vector-fingerprint comparison exposed a second, unchanged-source row (`refs/repo-history-skill-2026-08-07.md`) with a changed vector fingerprint but no bit/position change. This representation drift is reported separately from the one changed content SHA256; its cause is not established. It is not credited as edit movement.

The late append is a document-contract correction, not an empirical validation of the synthetic rung generator. Map 47's geometric task verdict remains `not-tested`. Keeping the correction is justified by the source/API consistency check, independently of geometric movement.

Live rejection checks: K=1 → 422; v0.1 baseline without frame → 409; explicit d conflict → 409. Infrastructure failures are errors, not negative task scores.

## What EnvHarness contributes

Use the same task, model, budget and **frozen verifier** across untreated, original-wayfinder and corrected-wayfinder conditions. Key caches on every measurement-changing input. Separate candidate-generation/curriculum scores from final task success. Record provider errors and 429 truncation separately from incorrect solutions. EnvHarness supplies this experimental discipline; its benchmark success rates do not transfer to this corpus.

## Raman and infrared: equations considered, boundaries retained

IR activity requires a dipole derivative, `I_IR ∝ |∂μ/∂Q|²`. Raman activity requires a polarizability derivative, `I_Raman ∝ |e_sᵀ(∂α/∂Q)e_i|²`; in the isotropic Placzek treatment, the depolarization ratio is `ρ = 3γ′²/(45α′² + 4γ′²)`. None of μ, α, physical normal coordinates Q or measured polarization intensities exists in the current wayfinder. A degree-energy split cannot be relabeled as a measured depolarization ratio.

Selection-rule homologies can suggest candidates: rank-1 odd response versus rank-0/2 even response; Gaunt triangle/parity sparsity; and the already native spherical heat eigenvalues `ℓ(ℓ+1)`. The UI reports even/odd and rank-block SH shares as **non-admitted diagnostics only**, with no contribution to ranking. Raman/IR mutual exclusion additionally needs inversion symmetry; it is not universal.

Any new spectral coordinate must first pass margin-invariance analysis, a non-degenerate matched null, selection-aware controls and a pre-registered task test. Lorentzian linewidths, lifetimes, Stokes/anti-Stokes thermometry and Kramers–Kronig reconstruction require observables the system does not measure.

Recorded negatives remain: A1 admission failed; Pennes uniform loss cancels in admitted ratios; FCS factorization is not identifiable at the tested setting; Gaunt κ was negative; the margin-clean second-branch test excluded it. No new Lean theorem or physics discovery is claimed.

## Remaining path to a credible high usefulness score

Freeze a held-out edit benchmark before seeing outcomes: literal target files, factual acceptance predicates, preservation constraints, model/budget and blinded grader. Compare v0.1, v0.2 and an ordinary source-inspection baseline on identical tasks. Report useful-edit rate, factual regressions, abstentions and cost separately, with uncertainty. Learn or validate the semantic proposal layer from those outcomes; geometry alone does not supply it.

Current limitations are explicit: task-quality calibration is unmeasured; finite-chain mixing at K=40 is not established for every corpus; named-set comparison currently covers CHANGE, while ADD/REMOVE set changes are not-tested; binary placement can hide small real semantic changes; public saved maps share storage; chunk pooling is lossy; embedding model alias revisions require deliberate rebaselining. These are the reasons the release is not labeled 10/10.
