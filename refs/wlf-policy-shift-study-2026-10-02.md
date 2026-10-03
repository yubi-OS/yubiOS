# WLF policy-shift study — 2026-10-02

The viscoelastic reading's L5: policy version is the corpus's temperature. Roylance: for thermorheologically simple materials, temperature shifts every response curve along log-time by a shift factor a_T without reshaping it (WLF, universal constants C1 = 17.4, C2 = 51.6 at T_ref = T_g). The worker's gate has the same shape: policy v1 -> v5 changed response rates (allowed methods, validators, approval semantics) without changing the moduli (gate shape, six terminal states, fail-closed rule). This study defines the measurement, runs what the current data supports, and names the data gap.

## Method (to be run when data exists)

1. Segment the worker's response history by policy version (each version's active window from the audit event log).
2. Within each window, build response curves: approve latency distribution, gate verdict distribution, retry behavior, audit cadence.
3. Compute per-version shift factors a_T(v) that best superpose each curve onto the v_ref curve along the time axis (log-time shift, shape preserved).
4. Test thermorheological simplicity: if one shift factor per version superposes ALL curves, the worker is simple (policy = temperature). If curves change shape across a version bump (like the v4->v5 validator addition reshaping resend.send outcomes), simplicity fails and the WLF analog restricts to rate-only changes.

## What the data supports today (honest)

- The 2026-10-01 ~14:44Z data wipe removed the audit event history, so policy-change timestamps are not reconstructable from D1. Policy is currently v5 (`/api/jev/health` policy_version 5).
- The corpus-runs history (35 points, `jev_corpus_runs.created_at` + dBc) spans post-wipe accumulation and is what `/visco/prony` already fits (r2 0.069, honest). A single-policy-window series cannot test superposition across versions.
- Conclusion: the study is method-complete, data-blocked. No numbers are claimed.

## The data gap is itself a finding

Runs do not stamp the policy version they executed under (jev task taef8923: stamp_priority 1.44/2, P("do next build") 0.50, P("do now") 0.47 — next build or sooner). Proposed instrument (small worker change, next build): stamp `policy_version` on every `jev_corpus_runs` row and keep a compact append-only policy-changelog (version, timestamp, diff summary) in a table the wipe protocol never touches. With those two, the method above becomes executable after ~2 policy versions of accumulation.

## Standing calibration anchor

Round 3's prediction-vs-realized dissipation (102.86 dBc-units over 10 cycles) is the hysteresis scale any future WLF comparison must beat before claiming policy-level effects.
