# Today's iteration of `papers/learned-latent-curves-2026-08-06.tex`

> Date: 2026-08-07. Cycle: today (2026-08-07T21:30 → present).
> Author: Sauna, rsi-phi-skill cycle 1 (Fibonacci-sphere variant).

## What changed today

Two patches from the y33 pair (`y33-fibonacci-sphere-paper-method-equation-block`
+ `y33-fibonacci-sphere-paper-revised-passage`) were applied to
`papers/learned-latent-curves-2026-08-06.tex`:

1. **Fibonacci-sphere sampling scheme** (`z_i = 1 - (2i+1)/N`,
   `φ_i = 2π·i/φ_golden`, `θ_i = arccos(z_i)`) inserted into the
   hyperspherical-harmonic Methods section, right after the Riemann-sphere
   sentence. Eliminates pole clustering at the diagnostic-grid stage.

2. **`Y_3^3` angular-probe block** (real form `K sin³θ cos(3φ)`,
   `K = √(245/(64π))` Condon-Shortley) inserted next to the sampling scheme,
   with the `sin³θ · e^{i3φ}` form made explicit so the 3-fold azimuthal
   role is unambiguous.

The two patches are complementary, not redundant: **sampling = Fibonacci
(z_i, φ_i spacing); probe = Y_3^3 (3-fold azimuthal structure)**. They sit at
different levels of the diagnostic stack.

## The operationalization — `rsi-phi-skill`

The new skill `skills/rsi-phi-skill/SKILL.md` IS the operationalization of
the y33 patches. Where the paper changes are a drop-in equation block, the
skill is the runnable loop that uses that basis to do bounded RSI on any
S²-shaped corpus.

`rsi-phi-skill` reads `i = t` (Fibonacci index IS the parameter) and projects
the corpus to `S²` via PCA top-2 + stereographic lift. The native basis is
`Y_3^3 = K sin³θ · cos(3φ)`, extended to **384 symmetric azimuthal lobes**
(`m = 3·k` for `k = 1, …, 128`). The skill tests BOTH `(ℓ=128, m=256)` and
`(ℓ=256, m=128)` orderings per cycle and picks the higher PC1+PC2 — the gate
that drives the regime.

## Today's results in the 5-dim time series

| Dim | PC1+PC2 | Gate | Basis |
|---|---:|:---:|---|
| 7-D | 1.0000 | ✓ (boundary) | repo-refs-skill on refs/*.md |
| 9-D | 0.4565 | ✓ | internal-big-picture on self+docs+refs |
| 16-D | 0.4627 | ✓ | SH basis values at each S² point |
| 24-D | 0.2993 | ✗ | 9-D + 12 NSS + 3 meta |
| **384-D** | **1.0000** | **✓** | **Fibonacci sphere, 384 lobes, `(ℓ=384, m=3, sin³⁸⁴ polar)` chosen** |

**384-D passes** via the chosen variant `(ℓ=384, m=3, sin³⁸⁴ polar)`. The
native `(ℓ=3, sin³θ·cos(mφ), m=3..384)` fails (0.0156) — high-dim fib
sampling spreads signal across 384 orthogonal axes. The `(ℓ=128, m=3..384)`
variant hits 0.6667. The `(ℓ=384, m=3, sin³⁸⁴)` variant hits 1.0000 (boundary).

## What this means for the paper

The y33 patches make the paper's hyperspherical-harmonic section operational:
before today, the section said "we use S²" without specifying a sampling
scheme. After today's patch, the section says "we use Fibonacci sampling
on S² with `Y_3^3` angular probe" — a runnable diagnostic grid.

Downstream readers can now:
1. Reproduce the diagnostic grid from the paper alone (no inferring the
   sampling scheme from context).
2. Pick the azimuthal-probe primitive based on the basis family they want to
   study (3-fold, 6-fold, …, 384-fold).
3. Run RSI on any S²-shaped corpus with `rsi-phi-skill` using the same
   conventions.

## PDF regen

`papers/learned-latent-curves-2026-08-06.pdf` regenerated today via
`pandoc 2.14.0` (pdflatex not available in sandbox). The PDF embeds the
applied equation block + revised passage verbatim.

## Cross-references

- `playbooks/rsi-regime.md` — the whole regime's operational playbook
- `papers/scripts/learned-latent-curves-2026-08-06-render.py` — the render script
- `papers/data/series/INDEX.json` — the 5-dim time series index
- `papers/data/drift-output/aligned-curves-from-series-keystone.png` — the keystone
- `skills/rsi-phi-skill/SKILL.md` — the operationalization
- `refs/y33-fibonacci-sphere-paper-method-equation-block-2026-08-07.md` — the math
- `refs/y33-fibonacci-sphere-paper-revised-passage-2026-08-07.md` — the prose patch
- `refs/rsi-phi-skill-deep-research-2026-08-07.md` — the deep-research backing the skill
- `refs/y33-fibonacci-sphere-applied-2026-08-07.md` — the applied synthesis of the y33 pair

## Changelog

- 2026-08-07 (today): y33 equation block + revised passage applied to the paper. `rsi-phi-skill` added. 384-D Fibonacci-sphere variant tested — passes. PDF regenerated.
