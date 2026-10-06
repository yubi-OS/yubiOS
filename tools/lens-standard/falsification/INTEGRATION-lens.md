# INTEGRATION-lens.md — powered-lens correct loop on the steady-orbit worker

One page. What the worker route contract looks like, which deploy lessons apply, and the follow-on path. The Python source of record is Lane F's `lens_standard.py` + Lane G's `harness_lens.py`; this document is the port-and-policy plan only — nothing ships until the falsification corpus passes.

## Worker route contract (taste-engine / jev-corpus pattern)

```
POST /api/jev/corpus/lens/correct
  body: { gray_b64, width, height, mode? }
  -> 200 {
      coefficients: { astigmatism: c1, spherical: c2, trefoil: c3 },  // estimate from image alone
      D_before: …,                       // D of the input render
      D_after: …,                        // D after inverse + re-render
      shift_before: |D_before - ref|,    // ref = un-aberrated expectation when provided
      shift_after:  |D_after  - ref|,
      verdict: "recovered" | "reduced-not-eliminated" (LF-1) | "crop" (LF-3)
               | "sign-ambiguous" (LF-4) | "cross-talk" (LF-2, blind fit),
      quality: { r2, n_components, mask_nonempty },   // B5/B6 invariants ride along
      pipeline: "lens-standard-v1",
      run_row_kind: "lens-correct"
     }
```

- **Verdicts-are-data**: the LF verdicts are first-class response fields and land in the run row, not buried in a boolean. A run row with `verdict: "reduced-not-eliminated"` is a *successful* lens-correct row that reports an honest partial recovery — exactly the pre-declared fallback, never silently re-gated.
- Route lives under the existing corpus delegation (`routes-jev.js`: the `/api/jev/corpus/lens/*` branch goes immediately after the corpus delegation, before the task regexes). Run rows get `kind: "lens-correct"` so the evolution loop can count recoveries separately from raw measurements.
- Parity: identical base64 renders through the Python source of record and the worker port must agree on `D_before`, `D_after`, and every coefficient to within the fixture tolerance (edge-standard parity precedent: 4.5e-5), plus identical verdict flags — the flags are part of the contract (corpus skill lesson 6).

## Deploy lessons that apply (steady-orbit-deploy)

1. **fmt decimals at the port boundary**: format every numeric response field to fixed decimal precision (e.g. `toFixed(4)`) when it is produced, not at render time. Parity comparisons between the JS port and the Python source of record fail on raw float repr drift otherwise — this is the same class of bug the corpus fixtures caught before.
2. **askJev import**: if the route's Understand/Decide leg calls the advisory clef layer, import `askJev` from the module scope (the shared binding that forwards `opts.images` for multimodal intake) — never re-define a local copy in the lens module; a local copy silently misses the binding patch (`deps.gateAction`) and bypasses the policy gate.
3. **Live-verify after deploy**: after the multipart upload, POST a pinned fixture render to the live `/api/jev/corpus/lens/correct` and diff the response against the Python source of record BEFORE reporting success. The saved bundle + etag from the deploy is the rollback; a route that was never live-verified is not shipped.

## Follow-on path (the audited-policy route, never hardcoded)

The router gains a pair-band **`corrected-hierarchy`** whose predicate is: an image's D_after, measured through the lens correct loop, sits within the pre-registered recovery band of its un-aberrated reference (B1 ≤ 0.05) with the correct-loop verdict in the recovered set. That band is **gated on this instrument passing its own falsification corpus** (B1∧B2 over all three families on the gasket gold). Concretely:

- The band enters as a policy change through the jev-orchestration flow — fail-closed gate, approval binding, append-only audit log — as a policy-doc promote, never by editing router code or hardcoding a threshold in a module.
- Until the corpus passes, the router leg treats `corrected-hierarchy` as unknown (fails closed); there is no shadow enablement.
- After a pass, the anchor values in `anchors_lens.json` get pinned once (first-clean-run rule), and the policy doc references the pinned tolerance by name so a future tolerance change is, by construction, another audited policy promote — not a code edit.

Sequence: Lane F lands `lens_standard.py` → Lane G runs `harness_lens.py --selftest` (exit 4 until the module exists, then the matrix) → first clean run pins anchors → JS port + route → fixture parity → live-verify → policy promote for `corrected-hierarchy`.
