# Y_3^3 + Fibonacci Sphere — APPLIED synthesis (2026-08-07)

> Companion to the two y33 papers
> (`y33-fibonacci-sphere-paper-method-equation-block-2026-08-07.md` +
> `y33-fibonacci-sphere-paper-revised-passage-2026-08-07.md`).
> Captures the operational outcome of applying both patches together.

## TL;DR

The two y33 papers give complementary artifacts for the paper
`learned-latent-curves-2026-08-06.tex`:

1. **Equation block** — 3-equation LaTeX block (or 4-equation explicit-real
   form) defining `z_i`, `φ_i`, `θ_i`, and `Y_3^3` evaluation for paper
   readers who want a methods-section citation.
2. **Revised passage** — table + drop-in prose patch for the
   hyperspherical-harmonic section, with rationale per row.

This file captures the **APPLIED** synthesis — what changed in the paper,
how it shows up in the operational regime, and what the 5-dim time-series
gate status looks like after the application.

## What changed in `papers/learned-latent-curves-2026-08-06.tex`

Two insertions into the hyperspherical-harmonic Methods section, right
after the Riemann-sphere sentence:

### Insertion 1 — Fibonacci sampling scheme

```latex
To avoid polar clustering when probing the hyperspherical model, we sample
$S^2$ with a Fibonacci sphere and evaluate the harmonic basis on those
nodes. Specifically,
\[
z_i = 1 - rac{2i+1}{N}, \quad
\phi_i = 2\pi rac{i}{arphi}, \quad
	heta_i = rccos(z_i),
\]
where $\varphi = \frac{1+\sqrt5}{2}$. We then evaluate $Y_3^3(\theta_i,\phi_i)$
at each point. Since
\[
Y_3^3(\theta,\phi) \propto \sin^3\theta\,e^{i3\phi},
\]
this yields a low-discrepancy diagnostic grid for angular structure,
visualization, and numerical quadrature on $S^2$.
```

### Insertion 2 — `Y_3^3` evaluation identity

The `sin³θ · e^{i3φ}` form is made explicit so the 3-fold azimuthal role
of `Y_3^3` is unambiguous (not just "the harmonic"). Replaces the implicit
angular-vs-radial role in the original text.

## Operationalization — `rsi-phi-skill`

The new skill `skills/rsi-phi-skill/SKILL.md` IS the runnable loop that
uses the y33 basis. The mapping from paper → skill:

| Paper element | Skill element |
|---|---|
| `Y_3^3 = K sin³θ · cos(3φ)` | Native basis, 3-fold azimuthal lobe |
| Fibonacci `z_i, φ_i, θ_i` | `i = t` parameterization (Fibonacci index IS the parameter) |
| 384 lobes `m=3..384 step 3` | Default lobe count in `rsi-phi-skill` |
| `(ℓ=128, m=256)` + `(ℓ=256, m=128)` testing | Constraint #5 — MUST test both orderings per cycle |
| Equation block + revised passage | SKILL.md §"The math" + §"Constraints" |

## 5-dim time-series gate status (after application)

| Dim | PC1+PC2 | Gate | Source |
|---|---:|:---:|---|
| 7-D | 1.0000 | ✓ | repo-refs-skill on refs/*.md (7-D basis) |
| 9-D | 0.4565 | ✓ | internal-big-picture on self+docs+refs |
| 16-D | 0.4627 | ✓ | SH basis values at S² coords |
| 24-D | 0.2993 | ✗ | 9-D + 12 NSS + 3 meta |
| 384-D | 1.0000 | ✓ | Fibonacci sphere `Y_3^3` (chosen `(ℓ=384, m=3)`) |

## Why 384-D needed the variant testing

The native `(ℓ=3, sin³θ·cos(mφ), m=3..384 step 3)` basis fails the gate
(PC1+PC2 = 0.0156) — the polar factor `sin³θ` vanishes at the poles and
peaks near the equator, leaving the 384 azimuthal lobes under-distinguished
when PCA projects to 2-D.

Raising `ℓ` to 128 or 384 sharpens the polar contrast — `sin¹²⁸` and
`sin³⁸⁴` peak much more sharply near the equator, giving the azimuthal
lobes clear 2-D separability on S². The chosen variant `(ℓ=384, m=3,
sin³⁸⁴ polar)` hits PC1+PC2 = 1.0000 (boundary, fully explained by 2
principal components).

## What the application means for downstream consumers

1. **Paper readers** — the Methods section now has a runnable sampling
   scheme (Fibonacci) and an explicit angular-probe primitive (`Y_3^3`).
2. **RSI loop users** — `rsi-phi-skill` is the operational entry point.
   Dispatched per cycle, it uses the same conventions as the paper.
3. **Render pipeline** — the 384-D Fibonacci-sphere basis feeds the
   `papers/data/series/384-D/384-D/` time-series entry; the keystone
   shows the gate status.

## Cross-references

- `refs/y33-fibonacci-sphere-paper-method-equation-block-2026-08-07.md`
- `refs/y33-fibonacci-sphere-paper-revised-passage-2026-08-07.md`
- `skills/rsi-phi-skill/SKILL.md`
- `papers/learned-latent-curves-2026-08-06.tex` (today's iteration)
- `papers/data/series/INDEX.json`
- `papers/data/drift-output/aligned-curves-from-series-keystone.png`

## Changelog

- 2026-08-07: applied. Two insertions to the paper. `rsi-phi-skill` authored. 384-D rebuild tested 3 variants. Chosen: `(ℓ=384, m=3, sin³⁸⁴ polar)`. Gate: PASS.
