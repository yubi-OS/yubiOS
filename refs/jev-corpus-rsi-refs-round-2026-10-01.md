# jev-corpus RSI chain on the refs/ corpus — 2026-10-01

Round: one 10-cycle fill-then-refix RSI pass over the `refs/` corpus (244 docs), driven by the jev-corpus chain on the steady-orbit worker: audit → lens candidates → evolution directives (auto-executed notes) → atomic axis-fill edits → refit. Runs at main `379a9f2a2030a3de03a78eaecb9fad064e4840c9`.

## Method

- **Corpus:** every `refs/**/*.md` at main = 244 docs, 2,267,880 chars.
- **Primitive basis:** the 12 NSS axes (audience, inputs, outputs, mode, assumption_set, adjacent_problems, failure_modes, lifecycle, composition, knowledge_sources, calibration, recursion). Per `AGENT.md`, these are an explicitly **unvalidated lens dictionary**: the geometry proposes, a source-grounded inspection and an independent task check decide. Every claim in the appended sections was verified against the target doc or its named neighbor records by grep; two draft claims that did not resolve (an ungrounded lesson range, an ungrounded addendum count) were corrected to the grounded values (lessons 24-27; 11 drift-check records) before applying.
- **Scoring:** 8 parallel graders, strict rubric, prefer-0. Coverage column sums (of 244): audience 69, inputs 167, outputs 173, mode 107, assumption_set 153, adjacent_problems 147, failure_modes 178, lifecycle 155, composition 227, knowledge_sources 210, calibration 179, recursion 113; density 0.641.
- **Engine:** worker corpus math (`/api/jev/corpus/*`), selftest all-pass before any result was trusted. Audit nulls 200. All math is data; only the fail-closed evolution gate acted.

## Audit results

| Stage | V2 | z | dBc | verdict | run_id |
|---|---|---|---|---|---|
| baseline | 0.4175 | 9.729 | -11.11 | excluded at the resolution of this null | `cr_1668715efaed1047` |
| after cycle 10 | 0.4033 | 9.240 | -10.46 | excluded at the resolution of this null | `cr_1d24391c809cd69a` |

The refs/ corpus structure is distinguishable from the fixed-margin curveball null at both stages. dBc rose +0.64 dBc across the pass (the emptiest rows were filled; the corpus level moved toward the null, which is what filling genuine sparse cells does).

## Lens candidates (baseline matrix, top-10 reals, all verdict YES)

| lens id | cell (doc × axis) | ΔdBc (real − control) | score |
|---|---|---|---|
| lens-174-2 | round11-ledger-state × outputs | +11.50 | 44 |
| lens-174-5 | round11-ledger-state × adjacent_problems | +10.84 | 43 |
| lens-34-3 | business-surfaces-state-check × mode | +10.44 | 42 |
| lens-41-3 | ci-map-drift-check × mode | +10.10 | 42 |
| lens-44-3 | companion-systemd-homed-r8 × mode | +10.12 | 42 |
| lens-45-3 | companion-yubios-stress-test-r8 × mode | +10.07 | 42 |
| lens-174-1 | round11-ledger-state × inputs | +10.34 | 42 |
| lens-174-4 | round11-ledger-state × assumption_set | +10.17 | 42 |
| lens-174-11 | round11-ledger-state × recursion | +10.14 | 42 |
| lens-174-3 | round11-ledger-state × mode | +9.79 | 41 |

Every paired control on the curveball-shuffled copy returned verdict NO (selection-null holds). The caustic caveat was checked: no primitive column is near-degenerate (min column coverage 69/244).

## Per-cycle trajectory (audit after each cumulative flip)

| cycle | cell filled | V2 | z | dBc | run_id |
|---|---|---|---|---|---|
| 0 | - | 0.4175 | 9.73 | -11.11 | cr_1668715efaed1047 |
| 1 | round11-ledger-state × outputs | 0.4151 | 9.48 | -10.95 | cr_278e7d986ff9455d |
| 2 | round11-ledger-state × adjacent_problems | 0.4140 | 10.08 | -10.94 | cr_c718fdb9c2a9ed40 |
| 3 | business-surfaces-state-check × mode | 0.4121 | 9.84 | -10.50 | cr_b7a2a5963bfce13b |
| 4 | ci-map-drift-check × mode | 0.4104 | 10.60 | -10.60 | cr_44573017b62555ae |
| 5 | companion-systemd-homed-r8 × mode | 0.4086 | 10.39 | -10.20 | cr_8c53f36a12574a75 |
| 6 | companion-yubios-stress-test-r8 × mode | 0.4068 | 10.23 | -10.27 | cr_5ebabdf1424923e9 |
| 7 | round11-ledger-state × inputs | 0.4053 | 9.63 | -10.66 | cr_cc13a1454f559a38 |
| 8 | round11-ledger-state × assumption_set | 0.4046 | 9.53 | -10.42 | cr_e00d733de5c1f61f |
| 9 | round11-ledger-state × recursion | 0.4037 | 10.45 | -10.14 | cr_5b3cbfa164ccfb3e |
| 10 | round11-ledger-state × mode | 0.4033 | 9.24 | -10.46 | cr_1d24391c809cd69a |

V2 decreases monotonically (0.4175 → 0.4033): each accepted edit moved the corpus level toward the null, as predicted by the atom invariant (Δ ≥ 0; the atom plan on the baseline matrix converged with finalDelta 302.43, all deltas non-negative).

## Directive execution (jev chain)

Sweep `es_fa66e7ce7117035f` (fire 2026100208) ingested the audit finding (1 `record_learning`, `l_b2b34e630d3413ca`) and the 10 lens candidates as fail-closed `note` directives (`ed_e4b01106ab321420`, `ed_e2632757b4d5ce9b`, `ed_27e09bd61786aeab`, `ed_2a36aba57e17e6a8`, `ed_80f60a930001a8bd`, `ed_8e5fc28731f05777`, `ed_f0fd37ab819bfc20`, `ed_9c930501aaccfe5a`, `ed_28e1ebd5729e4cea`, `ed_6d454af65c3d2228`); all 11 auto-executed inside the request. The session executed the edits the directives name; no worker module changed, so no steady-orbit deploy is attached to this round.

## Edits shipped on the PR

| doc | sections added | axes flipped |
|---|---|---|
| refs/round11-ledger-state-2026-09-18.md | Ledger inputs / Ledger outputs / Ledger operating modes / Ledger assumptions / Adjacent ledger problems / Recursion trail | outputs, adjacent_problems, mode, inputs, assumption_set, recursion |
| refs/business-surfaces-state-check-2026-09-18.md | Operating modes | mode |
| refs/ci-map-drift-check-2026-09-18.md | Operating modes | mode |
| refs/companion-systemd-homed-reference-2026-07-23-r8.md | Operating modes | mode |
| refs/companion-yubios-stress-test-assertions-2026-08-07-r8.md | Operating modes | mode |

Edits are append-only; no existing text was modified or removed.

## Scope and what this record does not claim

- The 12 NSS axes are an unvalidated lens dictionary; the audit measures binary coverage structure, not document quality. The task check, not geometry, authorized each edit.
- dBc/V2 are corpus-level shape measurements on this matrix, not calibrated document-quality scores.
- z=9.7 at K=200 nulls resolves tails only at the null's finite resolution; exclusion wording is per the engine's exclusion-only discipline.
- Lens exhaustion on this generator is candidate exhaustion, not a fixpoint proof. The next sparse row the lens surfaces is `refs/docs-census-2026-09-18.md` (inputs/outputs/mode/adjacent_problems/recursion cells, ΔdBc ≈ +24); that is the natural round-2 seed.