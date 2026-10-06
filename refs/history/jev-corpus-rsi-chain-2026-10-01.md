# Jev-corpus RSI chain on the steady-orbit worker — 2026-10-01

Chain: jev-corpus audits → lens candidates → jev-orchestrator gated directives → steady-orbit-deploy ships the worker change. Ten cycles, live on https://steady-orbit.systems-a.workers.dev (source of record for every audit run, directive row, approval, and etag: D1 `jev_*` tables via `/api/jev/*`).

## Setup

- Corpus: the worker's own 35 module parts × 12 NSS axes (audience, inputs, outputs, mode, assumption_set, adjacent_problems, failure_modes, lifecycle, composition, knowledge_sources, calibration, recursion), scored by a deterministic keyword-coverage script (≥2 distinct evidence hits per axis → 1). Heuristic basis, documented here so nobody mistakes it for a semantic instrument.
- Every cycle: recompute matrix → `/api/jev/corpus/audit` (200 nulls) → `/api/jev/corpus/lens` → candidate → directive (`worker_change`, forced `needs_approval`) → approved (actor jenny, auto-approve via API authorized by the operator for this run) → claimed (CAS) → atomic edit → local verify → multipart deploy (schedules + 13 bindings verified each deploy) → `/api/jev/corpus/selftest` → directive result recorded `executed`.

## The ten cycles

| # | fire | audit run | v2 / z / dbc | lens candidate | directive | edit | deploy etag |
|---|---|---|---|---|---|---|---|
| 1 | 2026100102 | cr_4945b6740a6feb1a | 0.4396 / 2.257 / −14.48 | lens-25-10-real PARTIAL +2.04 | ed_4276568d59d962ac | jev-notify.js: frozen CALIBRATION + selfCheck() (escape, silent-cycle, subject budget) | 6208d8e9…6947b1d1 |
| 2 | 2026100103 | cr_bb43035b1d6ce060 | 0.4155 / 1.114 / −15.99 | lens-24-11-real YES +7.77 | ed_6bd06f2d506aaf3d | jev-memory.js: history({limit}) recursion feed (newest-first rows + by-kind) | d952a492…9b43dc621 |
| 3 | 2026100104 | cr_3a53c0ccef6cd3e7 | 0.4104 / 1.074 / −16.98 | lens-26-10-real PARTIAL +4.71 | ed_7f4ab1ca9c4b5ccd | jev-quality.js: CALIBRATION thresholds + boundary selfCheck (demote beats low-confidence) | f1ff0c52…5e4058e6 |
| 4 | 2026100105 | cr_1bd604c2e3cd46de | 0.4072 / 1.640 / −20.07 | lens-25-11-real YES +10.82 | ed_1579e2436675887f | jev-notify.js: digest renders Previous-cycles trail from r.history; silent contract unchanged | e523ff99…f332be5d690c |
| 5 | 2026100106 | cr_e76566f356eca3bc | 0.4205 / 2.472 / −18.79 | lens-21-10-real YES +43.56 | ed_77129d1f3da93855 | jev-llm.js: CALIBRATION + selfCheck pinning all four binding shapes incl. the [object Object] regression | 4c0d5ae0…e430384d04 |
| 6 | 2026100107 | cr_9a1cf830bb33dbb1 | 0.4150 / 2.372 / −13.32 | lens-30-10-real YES +36.61 | ed_14d0be77ebdb0068 | jev-state.js: state-machine integrity selfCheck (transition targets declared, terminal set, no outgoing) | d2ac3900…9003e57c54c |
| 7 | 2026100108 | cr_563c5a594fbcb2d0 | 0.4003 / 1.681 / −15.35 | lens-34-0-real YES +16.77 | ed_0ba9eb24e5f78824 | solar-rbs-entry.mjs: legacy-territory exclusion list extracted to exported LEGACY_TERRITORY + inLegacyTerritory() (the route-shadowing trap); prefix list proven equal by extraction test | fdcf8a33…e9fd35919b |
| 8 | 2026100109 | cr_21e9a8225598c381 (post) | 0.3963 / 1.744 / −16.65 | lens-29-11-real YES +9.92 | ed_3abb4fdaf9176ca9 | jev-scheduler.js: idempotencyKey() exported pure + selfCheck (same-bucket-same-key, adjacent-bucket-new-key); fire loop consumes it, behavior-identical | 906e3eab…588e9fd35919b→906e… see D1 |
| 9 | 2026100110 | cr_260b6691f9c0b682 (post) | 0.3993 / 1.787 / −17.69 | lens-11-11-real PARTIAL +2.79 | ed_7834d9c9a7234dd0 | jev-decide.js: decisionSummary() drift aggregation + selfCheck (7 checks) | 8b0b72f2…d420d97db |
| 10 | 2026100111 | cr_b546c34e3062a66b (post) | 0.3961 / 1.902 / −14.69 | lens-17-0-real PARTIAL +4.97 | ed_8c8d15c24b5056c2, ed_71a0ffcf71037aa2 | (a) fixup: cycle-9 selfCheck's malformed-rows assertion corrected; (b) jev-improve.js: stub-based selfCheck proving the manual-promotion contract (inert proposals, human actor, version +1, approvals expired, error family) | cf0710ce…139cdf3c1 |

Full etags are in the directive `result_json` evidence in D1 (`/api/jev/evolution/directives`) — the authoritative record.

## Honest instrument read

- The corpus stayed **not-excluded from the fixed-margin null across all 11 audits** (baseline + 10 post-edits); z never crossed the exclusion threshold and v2 drifted 0.4396 → 0.3961. The null-standardized instrument does not certify these edits as corpus-level structure improvements, and this document does not claim that. The executed output is the module hardening surface itself: every edit is a real, locally verified contract proof (named thresholds + runnable selfCheck) shipped through the gate with an append-only audit trail.
- The lens kept regenerating YES candidates on axis 11 (recursion) for modules that are stateless **by design** (jev-corpus-builtins purity contract: any fetch during a builtin run fails) — declined rather than force-fitted.
- Cycle 10's verification gate caught cycle 9's own deployed selfCheck defect (an assertion expecting n=1 where the aggregation counts rows seen). The loop caught a defect in its own output; the fixup shipped through the same gate.

## Deploy-safety notes (for the next runner)

- Multipart uploads need explicit `filename=` per part matching the module name (`-F "name=@file;filename=name;type=application/javascript+module"`); CF 10021 otherwise. The entry module's edit must sit at **module top level** — an `export` inside `fetch()` fails node --check with a confusing line number.
- After every deploy: schedules `["0 * * * *","*/5 * * * *"]` and 13 bindings verified, selftest 200 (72 checks) before results are trusted.
