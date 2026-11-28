# Does the projected field retain a known ontology?

## Observation and frozen design

Each observation is one English Schema.org 30.1 class definition. Sample 16 descendants of each of Action, CreativeWork, Event, Intangible, Organization and Place. Use the transitive parent graph for independent evaluation labels. Exclude roots, ambiguous ancestry across these families, deprecated terms, enumerations and duplicate input text. The adapter strips HTML, decodes entities and folds whitespace. Keep 24–1,500 characters. Sort each family by SHA-256 of the study salt and term ID and alternate reference and field. This gives 48 calibration definitions and 48 measured field definitions. Commit the ordered input manifest before invoking BGE-M3. No term ID, family field or hierarchy is appended to the input. Ordinary wording in definitions can name the family; this is a study of a published vocabulary.

[Source CSV at frozen commit](https://github.com/schemaorg/schemaorg/blob/b997b3eafe57ecf1ffafee06ab64287732668dcf/data/releases/30.1/schemaorg-current-https-types.csv) · [Schema.org Sponsors' terms, CC BY-SA 3.0](https://github.com/schemaorg/schemaorg/blob/b997b3eafe57ecf1ffafee06ab64287732668dcf/docs/terms.html). The adapted definitions and derived data are distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

## Measurements

* Normalize Cloudflare BGE-M3 vectors. Fit the pole, stereographic RMS multiplier, native mean and canonically signed PCA frame on the 48 references. Apply the ambient lens once, then project both states through that same frame and origin. Measure PCs (1,2) and (3,4) on planes and normalized triples (1,2,3) and (4,5,6) on spheres. Report reference variance retained and discarded radial scale. Plot corresponding views at shared limits.
* Primary endpoint for each of eight state/view combinations is mean squared between-family pair distance minus mean squared within-family pair distance among field rows. Shuffle the field family labels 999 times with seed 340, using the same permutations everywhere; include identity. Standardize each endpoint and compare against the one-sided permutation maximum across all eight. Report the raw gap in its chart units. This tests aggregate family structure, without fitting a classifier or picking a best view after inspection.
* Paper I: fit a degree-three harmonic ridge curve as a function of reference PC1 (ridge 0.001), report held-out residual chord on the first PCA sphere. Paper II: measure V2 and collision counts against 99 fixed-margin Curveball draws per seed (340 and 341; 20 trades per row). Report signed z, sonometer level and Monte Carlo tail; zero spread is indeterminate. Paper III and the README: estimate angular power through degree three and predicted heat evolution at t=0.1 on both spheres.
* Paper IV: freeze up to six native reference PCA median splits and select the stable half-bit reference prefix. Use the same bits and thresholds in both states. Compare ambient query packing in manifest order at the unchanged native median chord and each chart's own reference median chord. Record full and prefix bit-class counts. Paper V: report balanced-prior Gibbs class amounts (count and UTF-8 bytes), with native temperature 0.05 and the reference median energy adjustment. Decompose the class-conditional cube occupancy into signed Walsh coefficients and compare reference/field alignment by degree. These secondary readouts are descriptive.
* Render the whole sampled bank in the atlas, distinguish reference and field points, and show optical structure with gridded same-family pair excess conditional on cell occupancy under shuffled labels. Use identical cells and signed color scale within each pre/post pair. Empty cells and zero null spread are unmeasurable. Preserve the numerical cells and class composition for reuse. Exceptions to the planned analyses must be explicit in the report.

## Deployment correspondence

Read the public [ENDPOINTS.md](https://steadyorbitsystems.com/ENDPOINTS.md) and [AGENT.md](https://steadyorbitsystems.com/AGENT.md), retrieved November 28 UTC, with SHA-256 respectively 2789040871f95ee4903b1e1fd80749e1498af2224bffe7cfd52e54e24684bc18 and 815a7b6765c9c1cdaa2a8bfcd5bb92d41f0a3c61d8a7d9f6db02edeb56d1e5b1. The [SOS ontology module](https://github.com/yubi-OS/SOS/blob/aef75cd1222f51cf9f7f2f89fdec876273492c17/jev-ontology.js) is the pinned mirror reference.

| Production route | Local question |
| --- | --- |
| POST /api/jev/map/embed and /api/jev/map | Where do the known definitions lie under a single frozen frame? |
| POST /api/jev/map/focal and /api/jev/map/admission | What survives the bit ladder, chart change and matched null? |
| GET /api/jev/map/classes and /api/jev/ontology/mapped-classes | Which published families share focal prefixes, full codes and lensed regions? |
| POST /api/jev/corpus/audit and /api/jev/corpus/spherical/swsft | How large is field deflection and how is angular power distributed? |

This local route analogue keeps D1 and Vectorize untouched. The PCA signs, class taxonomy and scalar harmonic moments have their definitions above. Production class compilation, hierarchy dimension and spin transforms have different contracts. A result pertains to this finite sample on the model hypersphere.
