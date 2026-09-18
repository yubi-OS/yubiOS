# Adjacent problems: the curve, the corpus, and its learned primitives

Date: 2026-09-01. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent FIT #10 lens
`L4-NSS-Adjacent_problems`; one of five files written to fill the empty cell at z-band 0 /
phi-sector 3. Nearest neighbours: `papers/data/curve-map-output-384d/curve-map.json`,
`skills/radio-queue/SKILL.md` (a reminder that the curve does not care what a file is about,
only which primitives it touches).

## Lens

```
L4c -- curve-corpus-primitives
  hypothesis:  the curved-corpus program documents its own method well but not the
               alternative corpus-audit methods it displaced, nor where the method's family
               boundary sits (embedding geometry vs. term-cluster geometry)
  method:      name the family, 4 alternatives, rejection criteria, flip conditions
  parameters:  {axis: adjacent_problems, total: 18/20}
  delta:       {adj_gaps_before: 4, adj_gaps_after: 1, dim_closed: 3, family_named: true,
                alternatives_count: 4}
  verdict:     YES (measured 2026-09-02, FIT #11 vs FIT #10, same basis)
  score:       45
  measured:    {pole_shift_geodesic: 0.2807 rad (predicted 0.1892), occupied: 24 -> 25 (+1, as
               predicted), isolated: 8 -> 8 (predicted +1; five co-located docs are not
               isolated from each other), holdout_r2: 0.9986 -> 0.9977 (-0.0009, predicted
               -0.0024), holes_on_curve: 15 -> 14, cell_hit: z0/phi3 at [0.4169, -0.2122,
               -0.8838] for all five files, PR #227}
  caveat:      the SOS Agent's learned-latent basis is one run old; a second run with the
               same basis is what this file exists to make possible
```

## Focal problem

Given a corpus of N files, place every file on S^2 so that empty regions of the fitted curve
say something actionable. yubiOS does this with a learned basis of up to ten primitives
(term clusters mined from the corpus itself, LLM-pruned), PCA to two components,
stereographic lift, a degree-3 real spherical-harmonic ridge fit, a column-permutation null
with exclusion-only verdicts, and equal-area cells whose sparse members become lenses.

## Problem family

Family: **corpus geometry for audit**. Boundary with **semantic search** (find the file that
answers X) and with **topic modelling** (summarise what the corpus is about): both are
retrieval or description; corpus geometry is *prescription*: where is the corpus thin, and
what pattern would thicken it. Boundary with **coverage checklists** (does every file mention
Y): a checklist is one axis; the curve is the joint distribution of all axes.

## Alternative solutions and why not

1. **Dense embeddings + UMAP/t-SNE.** Relation: *alternative*. Rejected as the audit basis:
   the axes are not nameable, so a sparse region cannot be turned into a coverage pattern a
   human can author against. Kept as a future cross-check. Prior art: McInnes et al. 2018.
2. **Fixed hand-written primitives** (the original 10-regex basis from
   `internal-big-picture`). Relation: *prior art / extension*. Rejected as the default in SOS
   Agent because it scores an RL harness on security vocabulary; retained as the yubiOS
   house basis for cross-repo comparability when both sides are security corpora.
3. **LDA topic model.** Relation: *alternative*. Rejected: topics are mixtures, so a file's
   position is a simplex point, not a binary pattern; the null model becomes awkward.
   Prior art: Blei, Ng, Jordan 2003.
4. **Flat 2-D Fourier surface on PC1+PC2** (curve-guided-rsi v1). Relation: *prior art*,
   superseded by the sphere basis at matched parameter count (hyperspherical-harmonic-curve
   cycles 2 and 3, ablation delta +0.98 / +1.34 then +0.74 / +0.52). On envharness and on
   yubiOS the ablation delta is near zero: the sphere is not buying anything there, and the
   file that reports that honestly is doing its job.

## Related problems

- **Verification chain** and **YubiKey boot** documents dominate the yubiOS pole; the pole's
  sector is Failure modes. Relation: *the object this method audits*.
- **Rootless privilege** and **container isolation** are the primitives most often *absent*
  from the sparse cells. Relation: *what the sparse cells are missing*.
- **Null models** (curveball vs. column permutation vs. iid). Relation: *prerequisite*. The
  permutation null preserves per-column frequency and destroys co-occurrence; that is the
  right null for "is the joint pattern real", and the wrong null for "is this file unusual".

## Flip conditions

The learned basis would be dropped for a fixed basis if two runs on the same commit disagreed
on more than three of ten concepts (the LLM pass is non-deterministic; basis reuse per FIT id
is the mitigation now built into SOS Agent). The sphere basis would be dropped for flat if
the matched-parameter ablation went negative on the holdout across three seeds.

## Curve placement

Coverage: verification chain (the audited object), rootless privilege and capabilities (the
absent primitives), corpus/curve/sparse (focal), YubiKey boot (pole neighbourhood),
container isolation (absent primitives). Omitted clusters omitted by design.

## 2026-09-18 drift check (wayfinder round 8, cycle 54)

curve-corpus-primitives record: its five-file cell (z0/phi3) gained the nspawn-boundary and drift-check records this round; the family is denser than when it was written.
