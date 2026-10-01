# Jev Corpus: the papers' math engine on the steady-orbit worker

**2026-10-01.** Companion to SPEC-CORPUS.md (session bundle `documents/github-yubios-KS9n5GAT/jev-corpus/`). Skills: `skills/jev-corpus/SKILL.md` (the endpoint surface), `skills/steady-orbit-deploy/SKILL.md` (the multipart deploy recipe). Extends the jev-orchestrator + Jev Automations builds (refs-jev-orchestrator-2026-10-01.md, refs-jev-automations-2026-10-01.md).

## Problem

The yubiOS corpus-math toolset lived entirely as local Python (`tools/corpus-auditor`, `tools/rsi-descent`, `tools/spectral-decomposer`, `tools/spectral-defocus`, `tools/boltzmann-collapse`, `tools/tautology-discerner`, `papers/scripts/curve-drift-detector.py`), with the math's system of record in `papers/data/lean/verify_claims.py` (Lean CI corpus). The jev evolution loop (10 fires recorded by 2026-10-01) measured only D1 counters, so its findings were subjective prose rather than measured lens-format experiments, and no automation could audit a corpus. The /jev/ console dumped raw machine JSON at the user.

## Decision (ideate-solo V1, Jenny-approved capability map)

Port the math to the worker as deterministic JavaScript, parity-tested against the Lean reference (never re-derived), exposed as `/api/jev/corpus/*`, wired into the evolution cycle and the automation builtin registry, with the console's evolution surface redesigned human-first. Built via parallel-build-lanes: 5 implementation lanes + 1 advisor, all `general / smart`.

## Module map (35-part worker bundle, was 29)

| Part | Lane | Exports |
|---|---|---|
| `jev-corpus-math.js` | 1 | v2Corr, curveball, nullStats, shFit, dbc, closedFormDecay, defocusTime, selfTest |
| `jev-corpus-atom.js` | 2 | pca2, stereographicLift, idealPole, geodesicGap, atomStep, atomDescent, boltzmannCollapse, selfTest |
| `jev-corpus-lens.js` | 3 | lensCandidates, tautologyClassify, driftPoints, selfTest |
| `jev-corpus-routes.js` | 4 | CORPUS_SCHEMA_DDL, ensureCorpusSchema, handleJevCorpus |
| `jev-corpus-builtins.js` | 4 | CORPUS_BUILTINS (corpus_audit, corpus_lens, corpus_drift, tautology_gate) |
| `jev-corpus-deps.js` | advisor | buildCorpusDeps, corpusSelfTestAll, elCurve, buildCorpusInj |
| `routes-jev.js` (edited) | advisor | + import + `/api/jev/corpus` dispatch before the legacy catch-all |
| `jev-main.js` (edited) | advisor | + builtin registrations + `deps.corpus` |
| `jev-evolution2-routes.js` (edited) | advisor | + inj.corpus hooks (measure gains `{dbc,z,verdict,drift_vs_prev}`, lens candidates appended as fail-closed `note` proposals; scheduled path threads the same injection) |
| `fixtures/corpus-math-fixtures.mjs` (new) | lane 1 | parity fixtures embedded for selfTest |

## Invariants preserved

- The math never authorizes: audit/lens results are data; only directives through the existing fail-closed gate act. No new auto kind.
- Atom plans are dry-run proposals; execution is a gated directive.
- jev-1.13 stays the only decision layer; the corpus engine is deterministic math.
- Unknown/honest failure paths: the cycle records `corpus: {error: ...}` rather than fabricating metrics.

## Test evidence

158/158 tests across 6 suites: math 40 (fixture parity 1e-9, worst observed 1e-15; curveball margin-preservation; the published z=12.13 -> +21.68 dBc anchor), atom 22 (delta >= -1e-12 assert tested to THROW per CurvedCorpus.lean atom_delta_nonneg; python-generated fixtures from rsi_descent.py + collapse.py), lens 11 (21 tautology fixtures run from the actual Python; exact verdict parity), routes 57 (idempotency, auth, purity guardrails with fetch monkeypatched to throw), console 11 (load-bearing fetch-route whitelist extracted from the deployed part table), e2e 17 (audit -> lens -> directive -> gate -> auto vs approval kinds, in-memory driver).

Cross-lane bug caught at integration: Lane 4's `corpus_drift` fed raw E_l arrays into driftPoints, which requires S^2 point arrays; fixed in the glue via a documented `elCurve` stereographic embedding. Lane 3 also found and corrected a reference bug in the drift detector's south-pole inverse map (`(|w|^2-1)` vs `(1-|w|^2)`), documented in its fixtures.

## Deploy + live verification (2026-10-01 14:14Z)

- Multipart upload: 35 module parts + fixtures part, metadata rebuilt from live settings, schedules `["0 * * * *", "*/5 * * * *"]` preserved, all 13 bindings intact. etag `f98aa5537e4a21ea1810e26c08d8c33509e45eb1263c4c5a500b3017db6e55e8`.
- Gotcha shipped into the deploy skill: a module importing `./fixtures/x.mjs` needs that module as a path-qualified part or CF rejects the upload with 10021.
- Live: `/api/jev/corpus/health` 200 (all modules); `/selftest` 200 all checks; `/audit` round-trip (v2 0.6874, z 3.50, verdict excluded, run `cr_6f81ac4a808605e6`) with idempotent repeat (`cached:true`); `/lens` real+control candidates with dBc deltas; `/classify` exact; `/runs` recording; one real evolution cycle `cyc_165b4fe22a902134` carrying the corpus hook (honest `no matrix available` until 5 cycles of history accumulate, per design).
- Console v4 in KV: Evolution sections human-first (deterministic plain-language cycle cards, directive cards with labeled badges, stat tiles, all raw JSON behind collapsed disclosures), new Corpus tab (audit, lens cards, atom plan, classify, placements, selftest), frontend-ui-engineering accessibility pass.

## Deferred (with reasons)

zernike-spectrum, phonon-dispersion, corpus-sonometer, injective-mapping export, nd-viewer/radar renderers: no automation consumer yet. Carried over from SPEC-AUTOMATIONS: HubSpot system-of-record learning, Daytona sandbox lane, reply-webhook `?k=` mandatory, guide-to-decided re-decide gap. Open follow-up: once 5 hourly cycles accumulate, `metrics.corpus` goes live automatically; the first measured lens-candidate directive should then be executed through the gate to close the loop end-to-end.
