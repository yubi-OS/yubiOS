# Rate-dependent scorer decision — 2026-10-02

Question: what makes recovery fraction R non-trivial, given the replay proved a deterministic scorer collapses R to 1.0 (finding F3, `knowledge/linear-viscoelasticity/08-creep-recovery-replay.md`, jev persist_beats_R 0.92)?

## The three options

**A. Status quo: deterministic scorer, persistence-first.** The elastic/plastic distinction stays in the persistence measurement (9/9 under blind re-grading in the replay). R is documented as trivially 1 and not measured. Zero cost, zero new noise. Limitation: no time dimension anywhere; "rate" never enters the instrument.

**B. Multi-pass re-grading protocol (recommended).** The round protocol gains K independent grader passes over each edited doc's loaded text (K = 2 minimum, edited rows only, per the pinned-scorer discipline). The pass spread IS the rate dimension: a flip credited by all passes is plastically real; a flip credited inconsistently across passes sits inside measurement noise and its metric contribution is elastic-by-uncertainty. R becomes a distribution (per-pass persistence fractions), which is exactly the shape `POST /visco/persistence` already consumes (`regraded:[{pass, rows}]`) and already reports (`scorer_variance.inter_pass_offset_dbc`, `per_pass_fractions`). Cost: 2-4 extra grader lanes per round on edited rows only; minutes. No new worker code.

**C. Temperature-sampled scorer.** An LLM grader run at T > 0 as a genuinely stochastic instrument. Most faithful viscoelastic analog (response becomes a function of a noise temperature, the honest analog of the WLF shift). Rejected for now: it imports generation-side nondeterminism into a measurement path the program keeps deterministic (the same discipline that keeps jev probabilities advisory); and the round-3 lesson says effects at the 0.64 dBc scale are already inside a 5.77 dBc grader-pass band, so added noise would swamp the gate before it added signal.

## Recommendation

B. Ship it as a runbook amendment, not code: rounds re-grade each edited row with 2 independent passes, feed both passes to `/visco/persistence`, and report the pass spread with the round. If pass spread stays near zero across a full round, revisit C with a wider effect to measure.

## Jev qualification (worker /api/decide, task taef8923-2bee-40f4-856b-21477e86ea68)

- scorer_option: **B**, 0.94 confidence (A 0.06, C 0.00)
- b_no_new_noise: 0.67 (B's bounded noise dimension is usable but not certain not to interfere; the pass-spread reporting requirement is the safeguard)
- Interpretation: adopt B as the round protocol; re-evaluate after one round's pass-spread data.
