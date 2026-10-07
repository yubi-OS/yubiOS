# D6: Injective skill → row mapping

## What this is

The corpus `papers/is-this-x-2026-08-12-Final.zip` →
`is-this-x-2026-08-12/data/real/per_row_coverage_v3.json` holds 2286 items
(skills, docs, refs, self), each with a 9-bit coverage vector over the
primitives:

`attestation, trust_chain, least_privilege, declarative_policy,
continuous_adaptive, immutability, audit_evidence, cryptographic_identity,
segmentation`

Only **176 distinct coverage vectors** exist across those 2286 items —
massive collision, ~13 items per vector on average, one class alone
(`111111111`, full coverage) holding **795** items. `mapping.py` in this
directory:

1. reports that collision structure explicitly,
2. builds honest, provenance-clear measurement coordinates per item,
3. proves those coordinates cannot be injective on their own (pigeonhole),
4. achieves full injectivity the only honest way: by keying on identity
   (slug), and
5. exports `skill-map.csv` — one unique row per item, the "spreadsheet".

## Epistemics (read this before trusting the CSV)

**The mapping is 1-to-1 as a keyed record.** Every row in `skill-map.csv`
is keyed on `slug`, and slugs are unique in the corpus, so the export is
injective: 2286 items in, 2286 unique rows out. That injectivity comes
from identity, not from anything the measurement columns discovered.

**The measurement subspace is many-to-one.** The 9 coverage bits (and
every quantity derived purely from them — `k`, the S² position, the
geodesic gap) collapse the 2286 items onto only **176** distinct points.
That is quantified, not asserted: see "Collision statistics" below and
run `python3 mapping.py --selftest` to reproduce the numbers yourself.

**Why no coordinate closes that gap.** Per the papers' membership
discipline, a coordinate is only admissible if it has a demonstrated
non-degenerate null — a real procedure by which the measurement could
have come out otherwise. The 9 coverage bits, `corpus`, and `cycle` all
have that: each was recorded by inspecting the item against a specific
primitive, tag, or iteration. A "qualia" coordinate — anything invented
post hoc to make two items with identical coverage look different — has
no such null; it would be reverse-engineered from the desired output, not
measured from the item. This deliverable does not add one. **It claims
measurement + identity, nothing more.** If you need injectivity from
measurement alone, the honest answer is that this corpus does not support
it at 9 bits of resolution — collect more/finer coverage dimensions, or
accept identity-keyed rows.

## Collision statistics

- Rows: 2286
- Distinct raw coverage vectors: **176**
- Largest collision class: **795** items, all covering vector
  `111111111` (full coverage on every primitive)
- Class-size histogram (size → number of classes of that size), computed
  by `mapping.py`'s `collision_structure()`: 62 singleton vectors, down to
  one class of 795. Full histogram is printed by `--json`/`--selftest`
  and is not hand-copied here so it always reflects the code, not this
  document.

## Injectivity ladder

Distinct keys out of 2286, adding one field at a time:

| Stage                         | Distinct keys |
|-------------------------------|---------------|
| coverage (9 bits) alone       | 176           |
| + corpus                      | 252           |
| + cycle                       | 318           |
| + slug (identity)             | 2286          |

Monotone non-decreasing by construction (each stage only adds
discriminating power); the self-test asserts this. Slug is not merely
"the biggest jump" — it is the only field guaranteed unique per item, so
it is the only stage that reaches 2286/2286.

### The pigeonhole argument (measurement alone cannot be injective)

Items that share both their coverage vector and their `corpus` tag are
indistinguishable by **any** function of those inputs — not just the S²
embedding used here, but literally any measurement derived from
(coverage, corpus). `mapping.py` counts these directly: **2177** items
fall into a (coverage, corpus) group of size > 1, giving **173,480**
pairwise-unresolvable pairs. No cleverer coordinate fixes this; it is a
counting fact about the corpus, not a limitation of this particular
embedding.

## Measurement coordinates (per item, all provenance-derived)

- `k`: coverage_sum, 0–9
- 9 raw coverage bits (one column per primitive)
- `corpus`, `cycle` (when present)
- S² embedding: z-score the 9-bit vector → top-2 PCA → inverse
  stereographic projection to the unit sphere (`s2_x, s2_y, s2_z`)
- `gap`: chordal (straight-line) distance on S² from an item's lift to
  the lift of the projected all-ones vector (the "covers everything"
  ideal pole) — smaller gap means closer to full coverage in the
  PCA-reduced sense

All of the above are deterministic functions of the coverage vector
(plus corpus/cycle, which are themselves recorded facts about the item).
None of them individually, nor all of them together, are claimed to be
injective — see the ladder above.

## The CSV

`skill-map.csv`: 2286 rows, one per item, columns:

`slug, corpus, cycle, k, <9 primitive columns>, s2_x, s2_y, s2_z, gap,
collision_class_id, collision_class_size`

`collision_class_id`/`collision_class_size` expose the raw-vector
collision structure directly in the sheet, so anyone opening it in Excel
can filter/sort by "how many other items share my exact coverage
 profile" without recomputing anything.

## Usage

```
python3 tools/injective-mapping/mapping.py                # run + write CSV + prose report
python3 tools/injective-mapping/mapping.py --json          # same, JSON summary
python3 tools/injective-mapping/mapping.py --selftest       # run + assertions in a TEMP dir, exit 0/1
python3 tools/injective-mapping/mapping.py --selftest --write  # selftest that also writes --out
```

Dependencies: `numpy` only. Reads the zip already committed at
`papers/is-this-x-2026-08-12-Final.zip`; no network access required.

## Deterministic output (do not break this)

`skill-map.csv` is a committed artifact, so it must be a stable function of
the committed corpus — a re-run must produce zero diff. Two things make
that true:

- **Pinned float precision.** The S²/PCA coordinates are recomputed by
  LAPACK on every run and differ between runs in the last few bits
  (~1e-16). All float columns (`s2_x`, `s2_y`, `s2_z`, `gap`) are rounded
  to a pinned 10 decimal places (`FLOAT_DECIMALS`) before export. Before
  this pin, a single selftest run rewrote all 2287 lines with drifted
  digits (an exact `gap` of 0 came back as `2.78e-17`).
- **Stable collision class ids.** `collision_class_id` is the
  lexicographic rank of the row's raw coverage vector among the distinct
  vectors (0 = smallest bit string). This is pinned by definition, not
  by numpy's internal `np.unique` inverse ordering (which is what produced
  a silent renumbering against the previously committed CSV).
- **Canonical eigenvector signs.** LAPACK may return a PCA eigenvector
  with either sign depending on the BLAS build; each top-2 eigenvector is
  flipped so its largest-magnitude component is positive before any
  coordinate is derived from it.

`--selftest` additionally runs the pipeline a second time and asserts the
two CSVs are byte-identical, so any future determinism regression fails
the selftest instead of silently dirtying the working tree.

## Self-test

`--selftest` asserts (and by default writes only to a throwaway temp
directory — pass `--write` to write the committed path):

- row count == 2286
- 100 < distinct coverage vectors < 400 (prints the actual count; expect ≈176)
- the exported CSV has exactly 2286 rows with 2286 unique `slug` values
- the injectivity ladder is monotone non-decreasing and its final stage
  (coverage+corpus+cycle+slug) equals 2286
- two consecutive pipeline runs produce byte-identical CSVs (determinism)

## Limitations

- The S² embedding is a descriptive/visualization coordinate (PCA is
  basis- and sign-dependent up to rotation); it is not claimed to be a
  canonical or unique representation, only a reproducible one.
- `cycle` is absent for 895 of 2286 rows; those rows carry an empty
  `cycle` field in the CSV and are grouped together at that ladder stage
  by empty-string key, which is why the coverage+corpus+cycle stage
  (318) still falls far short of full injectivity — cycle helps some
  items but is not itself a discriminating identity field.
- This deliverable does not attempt to resolve the 176-class collision
  with additional measured dimensions (e.g. finer-grained sub-primitives);
  it reports the collision honestly and resolves *uniqueness of the row*,
  not *uniqueness of the measurement*, via identity.
- No subjective/qualia coordinate is included, by design (see Epistemics).

## Reality check (first canonical run, 2026-08-22)

CI's first true execution of `--selftest` falsified an assumption this README
originally made: **slug labels are not unique either** -- the real corpus has
only 2169 distinct slugs across 2286 rows (117 duplicate labels, concentrated
in `self`-corpus changelog rows). So even the identity *label* collides; the
only injective key available without invention is the **row ordinal**. The
ladder now ends at `coverage+corpus+cycle+slug+row_id = 2286/2286`, and the
tool reports distinct slug labels separately instead of asserting on them.
This sharpens the deliverable's point: identity, not measurement, is what
makes the mapping 1-to-1 -- and in this corpus even identity labels needed
the ordinal to disambiguate.
