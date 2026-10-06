# Sierpinski-calibrated fractal D as a supersolid order parameter [SOLO]

Date: 2026-10-06
Source: ideate-solo (no dialogue)
Scope class: medium
Variations generated: 5
Finalist: "Physics re-target of edge-standard-v1, MVP = public supersolid imagery measurement"

## Problem Statement

How might we connect the edge-standard-v1 box-counting fractal-dimension instrument (calibrated against the Sierpinski triangle's theoretical D = log3/log2 ≈ 1.585) to recent research on supersolids, in a way that produces a measured, falsifiable result rather than an analogy?

## Grounding (what exists already)

- The instrument: `POST /api/jev/corpus/taste/edge-standard` on the steady-orbit worker (AGENT.md, taste section) — raw gray in, ink-normalized ~6% coverage, Moore-traced 1-px contours, pinned box-counting window 4..64 px, 8 scales, r² gate. Python source of record `tools/edge-standard/` wired into lean CI with a **Sierpinski theoretical band check** (the selftest's known-answer anchor: the Sierpinski gasket is the canonical self-similar structure whose exact D = log 3 / log 2 anchors the pipeline).
- The corpus: `knowledge/natural-taste-engine/` (fractal-dimension preference bands, branch exponent), `knowledge/edge-map-standardization/` (IBSI-style standardization doctrine), `knowledge/landau-radius-research/` (the corpus already carries supersolid + superfluid material from the vortex-glass/Ginzburg-Landau round, including the honest caution that transport evidence "does not directly establish simultaneous coherent superflow and density ordering"), and `knowledge/fractalrabbit-falsification-harness/` (controlled synthetic generators + falsification gates — exactly the validation discipline this connection needs).
- The physics: supersolids = simultaneous superfluid order and crystalline density modulation; the dipolar-gas realizations (Er/Dy) show droplet crystals, phase coherence, metastability, and hysteresis under ramped interaction strength.

## Recommended Direction

Re-target edge-standard-v1 from aesthetic imagery to **experimental supersolid imaging**, with the Sierpinski anchor promoted from calibration footnote to the organizing idea: D as a *real-space, resolution-aware order parameter* for density-modulated superfluids, complementary to the community's structure-factor S(k) diagnostic.

The MVP is a measurement, not a theory: run published supersolid droplet-crystal images (arXiv figures of dipolar-gas supersolid / incoherent-droplet / plain-superfluid states) through `/taste/edge-standard` and report whether the D distribution separates the phase classes. The falsification half (fractalrabbit pattern) comes first: synthetic generators — perfect triangular droplet lattice, Sierpinski-gasket droplet hierarchy, disorder-shuffled droplets — establish what D *should* read for each morphology class before any real image is trusted. The Sierpinski gasket is doubly apt: it is the instrument's calibration anchor AND the natural "hierarchical droplet crystal" morphology (a scale-free density modulation on the triangular lattice that dipolar droplet arrays actually form), so the synthetic gap between "triangular lattice" (D collapses to the lattice scale) and "Sierpinski hierarchy" (D = 1.585 at all scales) is exactly the discrimination the instrument claims to make.

Why this wins: it is the only variation whose core bet is testable this week on public data with zero new theory, and it reuses the exact gold-set protocol already validated on the 123 Viengkham & Spehar paintings (download → standardize → compare against published labels).

## Key Assumptions to Validate

- [ ] Public supersolid imaging data with phase labels exists at usable resolution (arXiv figures/supplementary of Er/Dy droplet crystals) — research lanes verify.
- [ ] The pinned box-counting window (4..64 px) and ~6% ink coverage are meaningful at published figure resolutions — testable by measuring figure pixel scales before running.
- [ ] D discriminates ordered droplet crystal vs incoherent droplets vs superfluid in SYNTHETIC generators first (Sierpinski-anchored falsification corpus, fractralrabbit gates) — cheap, fully under our control.

## MVP Scope

1. Synthetic falsification corpus: 3 morphology generators (triangular lattice, Sierpinski gasket droplet hierarchy, shuffled droplets) × N seeds; run through edge-standard; publish expected-D bands; gate = the instrument separates them with the Sierpinski generator hitting the theoretical band.
2. Public-imagery pass: 10-20 published supersolid paper figures, phase-labeled by the papers themselves, through the same pipeline; report D distributions per class with honest regime notes (contour-class D vs cluster-class D applies here too).
3. Record: refs/ doc with pre-registered expectations, per-image run ids (edge-standard run rows are already the audit trail), and an admission recommendation for a `supersolid_order` axis only if the rayleigh-pattern trial supports it.

## Not Doing (and Why)

- No new theory paper (Sierpinski-supersolid proposal) yet — the measurement result decides whether the theory question is worth writing.
- No live-experiment collaboration or data requests — public imagery first.
- No modification of edge-standard-v1 pinned parameters — any retuning is a major version bump and stays out of the MVP.
- No `admitted: true` flip on any taste axis from this result alone — the rayleigh admission protocol governs.

## Open Questions

- Has anyone already published fractal-dimension/box-counting analysis of supersolid (or droplet-crystal) imaging? (Lane 2 checks — if yes, this becomes a replication+extension, not a first.)
- Do Sierpinski-triangle optical-lattice BEC experiments/proposals exist that already occupy the "Sierpinski hierarchy in a quantum gas" niche? (Lane 2 — this changes the theory variation's novelty verdict.)
- Is figure-resolution loss (PNG/JPEG compression, axis labels) a pipeline confound? (mitigation: crop panels, pin coverage, report under_inked flags.)

## Generation log (for review)

| Variation | Lens | Painkiller | Switching | Defensibility | Testability | Total |
|---|---|---|---|---|---|---|
| Physics re-target + MVP measurement | Simplification (nested in Audience shift) | 3 | 5 | 1 | 5 | 14 |
| Supersolid as falsification corpus for the instrument | Inversion | 3 | 4 | 3 | 4 | 14 |
| Physics-imaging audience for edge-standard | Audience shift | 3 | 4 | 2 | 5 | 14 |
| Visco-supersolid loop (D(t) under ramps + hysteresis rollup) | Combination | 3 | 3 | 4 | 3 | 13 |
| Sierpinski-gasket supersolid theory proposal | Constraint removal | 2 | 3 | 5 | 3 | 13 |

Score justifications: defensibility of the MVP is honestly low (1) — box-counting on public images is trivially reproducible; the moat is the standardization discipline + falsification corpus, not the measurement. Testability of the theory variation is 3 because it needs simulation infrastructure we don't have yet. All five stay above the drop threshold (8).

Finalists: the top three (tied at 14). Stress-test of the winner:

- **Strongest critique**: box-counting D on a finite droplet array is scale-limited — a finite N-droplet lattice reads D→0 above the array scale and D→2 inside droplets, so a single D number may carry no phase information without the crossover scale; the community's S(k) already answers the ordering question and D may be a worse version of it. Answer in-MVP: the falsification corpus measures exactly this (lattice vs hierarchy vs shuffle), and the honest outcome "D does not separate the classes" is itself a publishable instrument-negative in the fractralrabbit ledger.
- **Second-order effects**: if D separates classes, edge-standard becomes a cheap preprocessing order parameter for any modulated-matter imagery (charge density waves, vortex lattices, Skyrmion micrographs — same pipeline, new corpora). If it doesn't, the instrument's "comparability across sources" claim gets its first adversarial domain test outside aesthetics.
- **Un-testable bet**: none large enough to kill — every assumption has a cheap test. The residual risk is image-resolution loss on arXiv figures, mitigated by the under_inked flag and coverage pinning.

Convergence: winner = **physics re-target with falsification-first MVP** (Simplification direction carrying the Audience-shift re-target and the Inversion validation gate). The visco-combination (13) becomes the follow-on if the MVP discriminates; the theory proposal (13) stays parked pending the prior-art lane.
