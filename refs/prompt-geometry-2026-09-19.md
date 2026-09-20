# Prompt geometry (prompt-geometry/1): the rung prompt now leads with the protected reading

Date: 2026-09-19. Family: instrument change record (cf. `refs/wayfinder-rounds-5-6-postmortem-2026-09-17.md`). Scope: the per-rung `prompt` string in `tools/point-map/pointmap.js` (`buildLadder`) only. The frame, bits, null chain, radius 0.095, rung ranking, ledger semantics and every structured rung field are untouched.

## What changed

The old prompt spent ~900 chars per rung (58% boilerplate) stating the frame recital, `occupied sectors +0` (flat in every round), and a 527-char guardrails block — while omitting every quantity the papers actually protect. The new prompt (~360 chars/rung, ~1,785/ladder vs ~4,506) leads with what the papers grade highest and labels what it must:

- **Pole gap and Δ** (Lemma 1 / Theorem 1: the only reading with a monotonicity theorem) — `atom_delta` was already computed on every CHANGE rung and never rendered; now shown as `Pole gap X → Y (Δ Z)`.
- **Clearance** — the target's nearest-neighbour distance, the displacement a writer actually has to close. Phrased as an achieved-geometry fact ("nearest neighbour 0.504 away; the new embedding must land within 0.095 of it"), not a forecast.
- **Hamming distance beside every exemplar** — the corpus's native metric; `h=0` (exact pattern twin) and `h=3` are different instructions.
- **ADVERSE flag on rungs that predict a worse reading** — before this change, four of five rungs on a typical ladder predicted +1 and opened with the same imperative as the one favourable rung. The sign was buried mid-paragraph. Adverse rungs are still emitted (suppressing them would hide ladder exhaustion); they are just labelled.
- **`joins_note` inline** — "realised only if the real embedding lands within chord 0.095 of that item": the single most grounded sentence the generator produces, previously in a structured field only.
- **`Contract: /AGENT.md`** replaces the frame recital and the `compareMaps` sentence (AGENT.md is the binding contract; the homepage Copy-agent-guide design principle already points at it rather than inlining).

## Advisor review (applied)

The analysis + patch were reviewed before implementation. Corrections applied: (1) "close X to reach it" was a category error (an ADD's new document has no prior position; clearance is the isolate's depth, not a distance the writer closes) — rephrased; (2) "Do not take any destructive action." kept in the prompt (the analysis called it habit; it is a safety sentence); (3) the 65%-smaller claim in the analysis compares old-with-UI-blocks against new-without — like-for-like the generator delivers ~25% (4,506 → ~1,785 for a 3-rung ladder; the UI blocks in `app.js` are a separate change); (4) the r = 2/21 derivation is a flat-area approximation, not an S² identity — 441 equal-area cells give a chordal radius 2·sin(θ/2) with cos θ = 1 − 2/441, which rounds to the same 0.0952 but the clean identity does not hold; (5) the analysis's RADIUS_PROMPT_NOTE removal is NOT in this change (it lives in `app.js` and needs its own browser-test edit); (6) round-14's "0 of 5 sign predictions" is a 0/5 realization record (observed 0 has no sign), not a sign-agreement rate.

## Tests

`test-pointmap.js` 53, `test-math.mjs` 71 (the prompt-head/guardrail check passes on both heads), `test-placement.mjs` 9, `test-api.mjs` 36, `test-preview.mjs` 43, `test-admission.mjs` 5, `test-axis-consistency.mjs` 15 (one stale trial-level `admitted` assertion updated: admission is computed at the handler level, not by the pure trial function), `test-rayleigh.mjs` 9, `test-control-outcomes.mjs` 32, `test-limits.mjs` 10, `test-storage.mjs` 8, `test-radius.mjs` 76, `test-radius-extra.mjs` 13-boundary/10,201-rectangle, `test-tar.mjs` — all passing.
