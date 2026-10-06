# Hierarchy-detector routing regime [SOLO]

Date: 2026-10-06
Source: ideate-solo (no dialogue)
Scope class: medium
Variations generated: 6
Finalist: "Measurement-gated routing regime" — MVP = one atomic routed loop through existing machinery

## Problem Statement

How might we turn the proven hierarchy/fill detector (edge-standard-v1 D, validated claim set: reads hierarchy and area-filling, does NOT read order at matched extent) into a multi-model orchestration regime where measurement decides where work goes, in accordance with the jev-orchestrator policy engine?

## Grounding (what exists)

- The jev-orchestrator on the steady-orbit worker: fail-closed deterministic gate, approval bindings, six terminal states, append-only audit, automations with a 3-tier Llama runtime (classify 8b / draft 70b / llama-guard), evolution loop, corpus + taste engines, clef as the decision model (policy v6).
- The doctrine the corpus program earned: **measurements are data, never authorization** — instruments propose, the gate disposes.
- The detector's validated claim set (Addendum 7): D reads hierarchy (gasket 1.585-1.60 vs everything else <= 1.37) and area-filling; NOT order. The falsification-corpus methodology (CI-guarded) is the calibration discipline any new routing claim must pass.

## Recommended Direction

**Measurement-gated routing**: artifacts entering the system get measured by the appropriate instrument; the measured feature is classified into policy-declared bands; the band selects a route (model lane / automation / corpus lane); the routing action is proposed as a jev task action and passes the SAME deterministic fail-closed gate as everything else. Band boundaries live in jev-policy.json (promoted via the audited flow, never hardcoded), and no band routes live traffic until it passes the falsification-corpus calibration (pre-registered band edges, jitter test, 21-point sweep on synthetic gold artifacts).

Key principle, stated as an invariant: **the detector decides (proposes) the route; the policy engine disposes.** A routing proposal is just another gated action: allowed, needs_approval, or blocked. Route decisions are run rows (audit trail), and the router never awards itself authority.

## Key Assumptions to Validate

- [ ] Band classification is stable: same artifact -> same band across re-measurement (the detector is deterministic, so this reduces to the hysteresis question at band edges).
- [ ] The bands separate the lanes' intended workloads (calibration sweep on synthetic + real artifacts BEFORE any live routing).
- [ ] Routing through the gate adds negligible latency (~1 measurement + 1 gate pass, both already sub-second).

## MVP Scope (one atomic loop)

1. `POST /api/jev/route {artifact}` -> measure (edge-standard for images; scorer for text docs) -> band lookup from policy -> propose routing action -> gate -> on allow: dispatch to the target lane, verify, run rows.
2. Policy v7 addition: `routing.bands` (declared via the audited promote flow).
3. Falsification gate for the bands: synthetic gold corpus (the falsification generators ARE the gold corpus), 21-point calibration sweep, jitter test, recorded in refs/ before live routing.
4. Router card in the /jev/ console (Corpus tab family).

## Not Doing (and Why)

- Measurement predicates inside the gate contract itself (policy rules that consult instruments) — the deeper integration, gated behind the MVP proving the loop.
- Routing text corpora by scorer bands in the same MVP — one artifact class first (images), text second.
- Learning/adaptive band adjustment — bands are pinned policy, changed only by promote.
- Any new model deployment — the lanes are the existing 3-tier Llama runtime + automations.

## Open Questions

- Which artifact class is the MVP intake: images (edge-standard, proven) or corpus docs (scorer, also proven)? Images — the detector's claim set is freshest there.
- Do route targets need their own capability declarations in policy v7 (route targets as policy tools)? Yes — mirror the resend.send pattern.

## Generation log (for review)

| Variation | Lens | P | S | D | T | Total |
|---|---|---|---|---|---|---|
| One atomic routed loop (MVP of the regime) | Simplification | 4 | 5 | 3 | 5 | 17 |
| Measurement-gated routing regime (full) | Direct | 4 | 4 | 3 | 4 | 15 |
| Measurement predicates in the policy gate | Constraint removal | 4 | 2 | 5 | 3 | 14 |
| Instrument the models' outputs (route by measured output morphology) | Inversion | 3 | 3 | 4 | 3 | 13 |
| Triage mesh (all instruments, one routing table) | Combination | 3 | 3 | 4 | 2 | 12 |
| Public intake triage for the Steady Orbit site | Audience shift | 2 | 4 | 2 | 4 | 12 |

Finalist stress-test: the strongest critique is that routing on a single scalar (D) throws away information the full feature vector carries — answer: the MVP routes on the policy-declared band of the primary feature, and the run rows record the FULL measurement vector, so band definitions can be refined later without losing data. Second-order effect: once routing is measurement-gated, every future instrument (scorer, visco) can become a route authority by adding bands to policy — the regime generalizes. Un-testable bet: none — the MVP loop is testable end-to-end with synthetic artifacts from the falsification corpus itself.
