# Zernike polynomials: where they fit in the curved-corpus program

**2026-08-24.** Audit question: do Zernike polynomials appear anywhere in the three papers
(learned-latent-curves 2026-08-06, is-this-x 2026-08-12, curved-corpus-unified 2026-08-22-v2)?
**They do not** - no 'Zernike', 'aberration', or 'wavefront' in any tex source. But the program
has been circling them unnamed. Four precise slots, ordered by strength.

## Slot 1 - The aberration basis the powered lens is missing (unified v2, Gap D)

Zernike polynomials Z_n^m are THE orthogonal basis on the unit disk for expanding an optical
system's deviation from ideal (Zernike 1934; Noll, JOSA 66:207, 1976; Born & Wolf ch. 9).
The lens family phi_theta in PSL(2,C) is Mobius, i.e. perfectly conformal - in the paper's own
optical dictionary it is an ABERRATION-FREE lens family by construction. Gap D therefore
optimizes over a 6-parameter ideal-lens family, and v2 found the optimum converges onto the
anti-caustic rim (cond 997.8/1000). The natural extension family is the ABERRATED lens:
perturb the pre-lift PCA disk coordinates by a displacement field built from low-order Zernike
modes - defocus Z_2^0, astigmatism Z_2^{+-2}, coma Z_3^{+-1}, spherical Z_4^0 - before the
stereographic lift, optimized jointly with (or after) the Mobius dof under the same anti-caustic
guard (design rank 16, cond <= 1e3) and the same null-standardized objective with a
selection-null control. Each coefficient is one interpretable dof with a century of optical
semantics; each faces the membership condition like every other coordinate (A_1 and the flow
coordinate u both failed it - the bar is real). If Delta-J climbs only via aberration terms,
that is a finding: the corpus signal is non-conformal.

## Slot 2 - F4's open caustic classification is aberration theory (unified v2)

The unified paper leaves caustic classification 'catastrophe-theoretic and open' (fold vs
structural collapse, Gap E). The classical bridge: caustic types are the catastrophes of the
aberration function (Berry & Upstill, Progress in Optics XVIII, 1980; Nye, Natural Focusing and
Fine Structure of Light, 1999). Spherical aberration -> fold/cusp; astigmatism -> elliptic/
hyperbolic umbilics. Operationalization: expand the design map near each of the 14
machine-precision V2=1.0000 rank-2 degeneracies in Zernike/polynomial normal forms and read the
catastrophe type off the dominant coefficients; check stability under the one-column
perturbation of Gap E. This converts F4 from vocabulary into a computation.

## Slot 3 - The disk-side twin of the Parseval shares (llc + is-this-x)

The corpus lives on the PCA disk BEFORE the stereographic lift; the 16 spherical harmonics only
exist after it. Zernike polynomials are the canonical orthogonal system on the pre-lift disk
(radial parts are Jacobi polynomials), so the Zernike spectrum of the corpus point distribution
is the pre-lift twin of the E_lm Parseval shares. Comparing the two spectra isolates the lift's
own footprint - exactly the dependence is-this-x built the Hodge channel to AVOID ('independent
... of the stereographic lift'). A Zernike channel measures it instead of dodging it. Admission:
every Zernike share coordinate faces the curveball null (z > 3 or inadmissible), per the
membership condition.

## Slot 4 - A naming collision that must be flagged (all three papers going forward)

Zernike Z_2^0 is literally named 'defocus', but it is a deterministic quadratic rephasing (a
focal-plane shift); the program's spherical defocus is stochastic heat flow in t. Different
objects sharing a word. If Zernike language enters the papers, the 'Optical language' discipline
paragraph must flag the collision or the dictionary corrupts.

## Identity/measurement split (house style)

Identity-type (Lean-able, cf. sections 10-12 of CurvedCorpus.lean): the Zernike radial
polynomials have exact integer-coefficient closed forms and recurrences (R_n^m via binomial
sums; R_n^m(1) = 1; parity structure) - kernel-checkable like section 11's Narayana rows.
Measurement-type: any Zernike spectrum of the corpus, any aberrated-lens Delta-J, any
classification fit - all face seeded nulls in CI, never elevated to theorems.

## Load-bearing sources

Zernike (1934) Physica 1:689; Noll JOSA 66:207 (1976) (indexing + Kolmogorov use); Born & Wolf,
Principles of Optics, ch. 9 (aberration theory); Berry & Upstill, Progress in Optics XVIII
(1980) (catastrophe optics: caustics as catastrophes of the aberration function); Nye, Natural
Focusing (1999); radial polynomials as Jacobi polynomials: standard (e.g. Born & Wolf app.).

## Status

2026-08-24: slots 1-4 dispatched as parallel work items; results land under papers/data/ and
tools/ with their own seeded CI checks.
