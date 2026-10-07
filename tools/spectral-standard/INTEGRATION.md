# INTEGRATION — route wiring + oracle composition contract (for the advisor)

Lane C deliverable, 2026-10-06. Companion to `PREREGISTRATION-spectral-2026-10-06.md`
(pinned parameters + bands) and `harness_spectral.py` + `anchors_spectral.json` (the
falsification harness). This document fixes the route shapes, run-row kinds, idempotency,
and the oracle composition — for review by the advisor BEFORE deployment via
steady-orbit-deploy.

## 1. Route shapes (bearer-auth, scorer pattern, steady-orbit worker)

All routes live under `/api/jev/corpus/` (same prefix and auth as the existing corpus
routes). Responses carry `policy_version: "spectral-standard-v1"` (or `"oracle-v1"` on
/oracle), full-precision numbers in dedicated fields, AND pre-rendered decimal strings
(see §4). Verdicts are data, never authorization — no route mutates anything.

### POST /api/jev/corpus/spectral/walk  — run-row kind `spectral-walk`

Request, exactly one of:
```json
{ "mask_b64": "<base64 raw 8-bit gray, row-major>", "width": 512, "height": 512 }
{ "edges": [[0,1],[1,2],...], "coords": [[x,y],...] }   // coords optional
```
- Canonical input for sha256: the parsed JSON in a pinned field order — `{"mode":"walk",
  "edges":..., "height":..., "mask_sha256":..., "walkers":64, "width":...}` where the mask
  is hashed (the raw b64 never enters the row), `coords` enters only as its own sha256 when
  present, and absent fields are dropped. Same canonicalization as the Python harness's
  `canonical_json` (sort_keys, compact) so the two sides derive identical walker seeds.
- Walk ladder, walkers, PRNG, seed derivation are pinned server-side; the request cannot
  override them (the request carries NO tunables — that is the point of a pinned instrument).
- Response: `{mode:"walk", d_w, d_w_r2, d_s, d_s_r2, alpha_msd, alpha_r2,
  log_periodic:{present, method:"residual-octave-alternation"}, einstein:null, run_id,
  run_row_id, policy_version}` plus rendered-decimal fields (§4). Zero-return rungs > 2 →
  `insufficient` verdict with no exponent values (null, not 0).
- Errors: 400 on malformed inputs; the mask with < 2 ink pixels and a single-vertex graph
  RAISE (FM-8) — never return a number.

### POST /api/jev/corpus/spectral/series  — run-row kind `spectral-series`

```json
{ "values": [ ... ] }
```
- Canonical input: `{"mode":"series","values_sha256":<sha256 of the exact float
  serialization>}`. The float serialization must be pinned (JSON round-trip of the raw
  values, order preserved — the module consumes the series AS GIVEN; the route must NOT
  sort before hashing or before calling, or the permutation null becomes unfailable, FM-3b).
- Requires ≥ 16 values, else `insufficient` (rank ladder ill-posed).
- Response: `{mode:"series", alpha, alpha_r2, d_s, counting_table:[{r, value}...],
  log_periodic:{...}, run_id, run_row_id, policy_version}`.

### POST /api/jev/corpus/oracle  — run-row kind `oracle`

```json
{ "image": { "width": 512, "height": 512, "bitmap_b64": "<raw 8-bit gray, row-major>" } }
```
- Composition (§3): edge-standard standardize+trace internally → contour mask → spectral
  walk on the mask → D from edge-standard's measure → Einstein verdict with `source:"caller"`
  semantics (D is the edge-standard measurement, never back-solved from the walk — FM-11).
- Response: `{mode:"oracle", edge:{D, r2, counts, scales, ...}, spectral:{d_w, d_w_r2,
  d_s, d_s_r2, alpha_msd, log_periodic}, einstein:{d_s, two_D_over_d_w, delta,
  verdict:"consistent"|"inconsistent"|"insufficient"}, run_id, run_row_id, policy_version}`.
- `verdict: "consistent"` iff |d_s − 2·D/d_w| ≤ 0.10 AND all three fitted exponents carry
  r² ≥ 0.98; any r² shortfall → `insufficient` (never silently "consistent").

### GET /api/jev/corpus/spectral/selftest

- Runs the same gold-corpus checks the Python harness asserts (the JS port's fixture pack),
  returns 200 with a per-check PASS/FAIL table when all pass, 500 with the failing rows
  otherwise. Machine-readable: same row names as the harness (`row1-L4-d_s`, `row6-permutation-null`,
  …) so CI diffs are one-to-one. This validates the PORT, not the routes — see §5.

## 2. Run rows (`jev_corpus_runs`)

- Kinds: `spectral-walk`, `spectral-series`, `oracle` (existing kinds untouched).
- **Idempotent per input sha256**: the canonical input hash is the row's uniqueness key.
  A re-delivery (retry, webhook replay) returns the SAME row and result — never a second
  computation. This is what makes retries safe when the upstream retries a webhook after a
  timeout the first computation already survived.
- Every row stamps: `policy_version`, the canonical input sha256, `created_at`, the full
  response body, and the derived walker seed (so any result is re-runnable byte-for-byte,
  per the falsification-corpus "results JSON carries the seeds" rule).
- Every instruction/measurement carries rendered decimals (fmt() lesson, §4).

## 3. Oracle composition — recommendation: ONE run row

`POST /oracle` runs edge-standard and spectral internally and should commit **one** `oracle`
run row (with both sub-measurements as fields), not two rows.

Justification:
1. **Atomicity of the verdict.** The Einstein gate is only meaningful when D and the walk
   come from the SAME traced mask. Two rows can be split by a retry: row A commits, the
   worker dies, the retry recomputes and commits row B with a different threshold choice —
   and a downstream consumer pairing "latest edge row" with "latest spectral row" pairs two
   different masks. One row makes mismatched pairing structurally impossible.
2. **One input sha = one idempotency key.** The oracle's canonical input is the image hash.
   Two rows would need a compound key and a partial-failure story (which of the two rows
   does a replay return?).
3. **Audit.** One verdict ↔ one row: the audit log answers "why did the oracle say
   consistent here" with a single row holding both inputs, both measurements, and the delta.

Counterpoint (independent debugging of the two halves) is covered WITHOUT splitting rows:
the single oracle row stores `edge` and `spectral` as separate sub-objects, so either half
can be inspected or replayed in isolation; and the standalone `/spectral/walk` route
remains available for instrument-level debugging where a run row per call is correct.

## 4. The fmt()/decimals lesson — full precision is data, rendered decimals are UI

- Store and compare at FULL float precision. Never gate on a rounded value: the row-1 band
  edge is 1.435, and 1.4349 vs 1.4351 is the difference between a pass and a physics result
  — 2-decimal rounding hides it (FM-9).
- Machine-readable fields (`d_s`, `alpha`, ...) are unrounded. Rendered decimals
  (`d_s_str: "1.3652"`, 4 dp; `r2_str: "0.998"`, 3 dp) are SEPARATE fields produced by one
  shared `fmt()` helper — every instruction/measurement string in any response, console card,
  or run-row log comes from that helper so precision presentation is consistent everywhere
  and can't drift per-route.
- The fmt() lesson from the taste-engine build: a route that formatted for humans in the
  same field it gated on made the gate un-auditable. Keep the two fields apart, forever.

## 5. The askJev-import lesson — selftest green ≠ routes work

- Any module that calls `askJev` MUST import it in that module. A module that works because
  a bundle-time global happens to exist is not working; it is one refactor away from a
  ReferenceError at request time.
- Corollary: **selftest passing does not mean routes work.** The selftest exercises the
  math functions directly; it never exercises the route's import graph, the request parsing,
  or the run-row commit. After EVERY deploy (including a "only routes changed" deploy):
  1. wait out the ~20 s stale-deploy window,
  2. live-verify each route with a real request (a small gasket fixture for /walk, a
     256-value synthetic series for /series, one gasket render b64 for /oracle),
  3. assert status codes AND that a run row appeared with the expected kind and
     policy_version,
  4. assert parity: |d_w^route − d_w^python| ≤ 1e-9 on the same fixture (on mismatch, the
     JavaScript is wrong until proven otherwise).
- Record the live-verify request/response in the deploy notes; a route verified only by
  selftest is UNVERIFIED.

## 6. Parity discipline (from the SPEC, restated as route obligations)

- JS `jev-spectral-math.js` imports nothing worker-specific; pure functions; the fixture
  pack is shared with Python as JSON.
- Walk mode: identical PRNG (mulberry32 bit-exact), identical derived seeds → byte-identical
  step sequences; parity check = same d_w to 1e-9.
- Series mode: exact match on the counting table to 1e-12.
- Parity fixtures = the gold corpus inputs (gasket L3/L4 eigenvalue series, chain, patch,
  the render masks), exported once by the Python harness so both sides consume the same
  bytes.

## 7. /jev/ Corpus tab console-card sketch (DEFERRED — one paragraph, not this build)

The Corpus tab gains a "Spectral & Oracle" card family alongside the existing corpus cards:
a compact header showing the instrument version and last selftest state, a walk/series/oracle
input form (paste values, drop a bitmap), and a run history strip where each row shows kind,
input sha (short), the headline exponent with rendered decimals from the shared fmt(), the
r² gate chip, and — for oracle rows — the Einstein verdict as a data badge. Verdicts render
as read-only data (the oracle proposes nothing); the card is out of scope for this MVP and
gated on the instrument measuring clean.

## 8. Deployment order (for the advisor to bless)

1. Advisor reviews PREREGISTRATION (esp. resolutions A-1…A-8) + this contract.
2. Lane A's `spectral_standard.py` lands; harness runs the gold table → first clean run →
   `--write-anchors` fills anchors → advisor reviews the table.
3. JS port + routes deployed via steady-orbit-deploy; live-verify per §5; parity per §6.
4. Only then does the instrument touch real data (dimensionality check first, confound
   controls named in advance — falsification-corpus skill §7).
