---
name: parallel-build-lanes
description: 'Run a full greenfield build (Cloudflare Worker, service, app) the way Jenny expects big builds run: capability map approved in chat, ideate-solo design pass, formal SPEC doc, parallel implementation subagent lanes (general/smart, deps-injected modules with self-contained tests), advisor/integrator lane that reconciles cross-lane contracts and writes any uncovered module, then orchestrator deploy + live verification. Use when Jenny asks for a big build like the SPEC and parallel subagents runs, or for any multi-module system build with 3+ parallel implementation lanes.'
requiredApps: [subagent_batch]
---

# Parallel build lanes

The validated process for big builds (used for the jev-orchestrator and Jev Automations on the steady-orbit worker, 2026-10-01; descends from the 2026-08-01 playbooks build and the 2026-09-29 mega-task fan-out).

## Sequence

1. Capability map first: map the architecture to modules with responsibilities, dependencies, and build order. Present in chat, get approval BEFORE writing any spec.
2. ideate-solo one-pager: 5-8 variations across 5 lenses, scored, stress-tested; save to session/<slug>-solo-YYYY-MM-DD.md.
3. Formal SPEC: one doc every lane implements against — invariants up top, endpoint/schema contracts, module file contract (exact export names), testing strategy, boundaries (always / ask-first / never), success criteria.
4. Parallel lanes: dispatch all lanes in ONE message, type general, model_preset smart for correctness-critical lanes and fast for thinner ones. Every lane prompt is self-contained: read-the-spec instruction, exact output directory, deliverable file list, test requirements, and RETURN with paths, test counts, and interface summaries.
5. Advisor/integrator: one smart lane that (a) reconciles cross-lane interface mismatches, (b) WRITES any module no lane covered, (c) runs all suites together, (d) adds a full-lifecycle e2e test, (e) produces an integration report + deploy checklist.
6. Deploy + live verify: orchestrator deploys, then verifies every route/leg live before reporting.

## Lane rules (non-negotiable)

- Modules are deps-injected; lane tests import NOTHING from other lanes (inject stubs matching the documented interface). One lane owns the shared data layer; others consume it by name.
- Tests run with node --test and ALL pass before the lane returns. Never weaken a test.
- Point lanes at session/subagent/... paths; copy outputs to the canonical dir yourself (sandbox write restrictions).

## Integration lessons (from the jev builds — check every one)

- Test-driver vs real-backend parity: in-memory test drivers tolerate what the real backend rejects (D1 fails closed on unknown columns; NOT NULL columns reject explicit NULL even with DEFAULT 0 when the insert lists every column). Any new column needs its insert-layer default and column-list filter in the same commit.
- Adapters must forward everything: a wrapper that destructures only part of its ctx silently drops fields (an approvals-array drop made every approved task re-check as needs_approval forever). Any adapter wrapping a gate or check function MUST forward the full context.
- Hash/shape duality: two components hashing the same thing differently (body-only vs method+url+body) pass individually and fail at the seam — unify the hash/shape in ONE module and have the other import it.
- Binding-vs-REST response shapes differ on managed AI bindings; never stringify an object response — extract known shapes and attach raw_shape diagnostics on empty extraction.
- Sequencing at approve/commit points: any check that must count a just-created binding must run AFTER the binding is written (status and actor included).

## Deploy safety (Cloudflare Workers modules API)

- Multipart PUT: a metadata part (main_module, compatibility_date, bindings) plus one part per module, filename equal to the part name, type application/javascript+module.
- Preserve legacy entry modules byte-safe unless a surgical edit is REQUIRED (the entry's 404/legacy-territory exclusion list shadows new page routes — add the prefix there too).
- Bindings referencing a not-yet-existing Secrets Store secret FAIL the whole deploy — add the binding only after the secret lands.
- Never weaken the fail-closed invariants: a gate or config failure ends in blocked, never dispatch.

## Examples

Build the X orchestrator as a worker: capability map (approve) → solo one-pager → SPEC → 4-5 lanes → advisor → deploy → live route-by-route verification.

## Guidelines

1. Always present the capability map for approval before writing the SPEC — she edits module boundaries there cheaply.
2. Track the build in a todo list with per-phase ids; update after every phase.
3. Report once on completion: shipped, live proof points, tests, what is open.
