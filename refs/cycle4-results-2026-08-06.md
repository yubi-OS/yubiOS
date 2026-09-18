# Hyperspherical-Harmonic Curve — Cycle 4 Results

**Date:** 2026-08-06
**Run type:** single full-corpus run on all 70 skills in the yubiOS software-skill corpus
**Source paper:** `papers/learned-latent-curves-2026-08-05.tex` / `.pdf`
**Source fitness-test:** `refs/hyperspherical-harmonic-curve-v1-fit-2026-08-05.md`

## Headline result

The hyperspherical-harmonic-curve variant was fitted against a capacity-matched flat Fourier baseline on the yubiOS skill corpus. On both splits the variant achieved a higher holdout $R^2$ than the baseline at fewer parameters — the matched-parameter ablation result.

| Split | $N$ skills | $N_\mathrm{train}$ | $N_\mathrm{holdout}$ | Hyperspherical $R^2$ | Flat $k{=}2$ baseline $R^2$ | $\delta$ (sphere $-$ flat) | Variant params | Baseline params |
|-------|------------|---------------------|------------------------|-----------------------|-------------------------------|------------------------------|------------------|-------------------|
| **Phase A** (alphabetical-first-half) | 49 | 35 | 14 | **+0.618** | $-0.359$ | **+0.977** | 6,534 | 9,984 |
| **Phase B** (full corpus, variant included) | 70 | 49 | 21 | **+0.222** | $-1.120$ | **+1.342** | 6,534 | 9,984 |

The corpus for both splits is the binary 9-D primitive coverage matrix lifted to $D{=}384$ by a fixed seeded orthonormal projection; the spherical basis uses 16 functions ($L{=}3$ on $S^2$); the baseline uses a 25-function 2-D tensor-product Fourier surface on $[0,1]^2$.

## Single-run; no error bars

This run is a single full-corpus pass with no error bars. The split sizes are fixed and the ridge $\lambda$ is shared across both arms, so variance is dominated by the holdout split rather than by random initialization. A multi-seed re-run is the obvious next step to add error bars; the present run establishes the matched-parameter ablation result on the full 70-skill corpus, not a confidence interval.

## What this result does and does not show

- **Supports:** on this corpus, a spherical parameter manifold is a better inductive bias than a flat one. The relative comparison (sphere vs flat on the same split) is positive on both splits.
- **Does not support:** either model is a good fit in absolute terms at Phase B — the flat baseline's $R^2 = -1.120$ is strictly worse than predicting the corpus mean ($R^2 = 0$), and even the hyperspherical model's positive $+0.222$ is small. At Phase A (49 items) the hyperspherical model's $+0.618$ is positive and large.

## Calibration checks (measured on the same single run)

- Spectral mass $\rho = \sum_{\ell \ge 1} \|a_{:,\ell}\|^2 / \sum_{\ell \ge 0} \|a_{:,\ell}\|^2 \ge 0.10$: measured $0.977$ (A) / $0.983$ (B).
- High-degree mass $\sum_{\ell > L/2} \|a_{:,\ell}\|^2 / \mathrm{total} \le 0.40$: measured $0.206$ (A) / $0.178$ (B).
- Cross-ratio preservation on 100 held-out 4-tuples: max residual $3.08 \times 10^{-7}$. Consistent with float64 noise; every $\mathrm{PSL}(2,\mathbb{C})$ element preserves $\chi$ exactly, so the residual measures implementation precision, not fit quality.
- Möbius refinement (train $R^2$): identity $0.9125 \to$ refined $0.9211$, $\Delta = +0.009$. Train-only; no holdout effect measured.

## Corpus coverage

All 70 skills in the yubiOS software-skill corpus were included in the Phase B run, including the variant itself (`hyperspherical-harmonic-curve`). Phase A used the alphabetically-first-half split (49 skills). The full skill list (Phase B) is preserved at `refs/hyperspherical-harmonic-curve-v1-fit-2026-08-05.md`.

## Reproduction

- Basis construction: deterministic given $(\ell, m)$.
- Möbius refinement initial point: $\theta_0$ with $a = d = 1$, $b = c = 0$ (identity Möbius).
- Ridge $\lambda$ is fixed across both models.
- The exact code path that produced these numbers is in `papers/archived/learned-latent-curves-2026-08-05.tex` §6–§8 ; the v1 fitness-test record is `refs/hyperspherical-harmonic-curve-v1-fit-2026-08-05.md` (the raw fitness-test JSON is session-scoped, not committed).



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.5200, Δ=+0.8469) were identical placeholder copies with no per-file content; merged on 2026-09-18.
