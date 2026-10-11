# steady-orbit jev worker: source record, 2026-10-11

Scope: the worker modules changed on 2026-10-09 to 2026-10-11 (the build that was deployed as etag 7cce09acbcef9359ee45a77b4c86decd88dfa9de266c59af43cbb2be0850a483, short 7cce09ac, policy v21). The live `GET /api/jev/health` reports `policy_version: 21`.

Baseline: patched14 (the pre-change bundle, `session/qa/evo/patched14/`). INTEGRATION-15 records the baseline as etag e412b5b1, policy v21.
Build: patched15 (the advisor's integrated bundle, `session/subagents/ses_ed2c02303ffeOj1wGNCxM3jtmi/evo/patched15/`). Review: INTEGRATION-15.md (2026-10-11).

This folder holds the 10 changed worker modules, copied byte for byte from patched15. Each file's sha256 is in the table below and in MODULES.sha256 is not pushed; the table is the record.

## Files

| File | sha256 | Changed lines vs patched14 |
| --- | --- | --- |
| dbx.js | 60f8f2301f0303cf0e52fdac19b952ff7e5f77c59e8a6494d7895699d9ea3190 | 40 |
| index.js | 94c20e65258792f2caf9fed208c4b99830b6f1488c8fdbf840bb468056100efc | 6 |
| jev-corpus-routes.js | bbf27b326bbb75c5c6ed0d369a4f5e66c567c080525468c37b59e28a471a0063 | 38 |
| jev-decide.js | 4469ccc60842a382c642c28416827f75f04f28ebf5feac221e5f8e69de430141 | 28 |
| jev-evolution2-routes.js | 186d11e9bf430fc4806dfe43277dcd0ba2217e95ef2d9e8f587f6db9426ec0d5 | 86 |
| jev-gate.js | e9d95c7fe79cd0d59d73b8f427ba9b201f95f0c8a10bb639814eb2a6da3be9c8 | 8 |
| jev-selftest.js | 10a938fef82e9be8dc7dd99ebd714865a2beb338c4b69482ee4590822b66e3fd | 10 |
| jev-taste-math.js | 38dd881c76e840ee4158644721708969352ef0ea1444e3eb326faeb6eb17114a | 24 |
| jev-taste.js | b11ab2a272fcc8c3c7d423ee5d5e0d13579bb67a9429a1a0f08bb9ce188fc679 | 13 |
| routes-jev.js | 5ab9299a9756b3549f8695952e00f97add00ef64042c646f861fe4a59f235008 | 30 |

Not pushed (listed for traceability):

- `jev-index.html` (sha256 087a79a352e088d73732c6a9c86852aaa32b7e8df8385ba9616519c487c0c2ac). The /jev/ console page. It is a KV artifact, not part of the worker bundle, and is not a module.
- `jev-forecast-v4.js` (lane L5). Not copied into patched15. The forecast v4 result is pre-registered and not wired. See the forecast notes in the timeseries skill.

## Changes by file

### routes-jev.js

- Approver allowlist (`jevApproverCheck`). The list is `policy.doc.approvers` when the policy has that field. Otherwise the default is `["jenny","ermine"]`. A present but malformed list (not an array of non-empty strings, or empty) fails closed: nobody approves. Matching is case-insensitive.
- Task approve and task reject both check the allowlist. A non-listed actor gets 403 `APPROVER_NOT_ALLOWED`. Reject checks the allowlist before the reason check.
- Directive approve, reject and cancel (`POST /api/jev/evolution/directives/:id/approve|reject|cancel`) check the allowlist. An empty actor gets 400 `INVALID_ACTOR`. A non-listed actor gets 403 `APPROVER_NOT_ALLOWED`.
- Cancel dispatch. `POST /api/jev/evolution/directives/:id/cancel` is delegated to `handleJevEvolution2` before the v1 `/api/jev/evolution` prefix. Other methods on those paths keep v1 behaviour. Because this dispatch returns before the directive gate, cancel is checked by its own helper (see jev-evolution2-routes.js and the known gaps).

### jev-evolution2-routes.js

- New route `POST /api/jev/evolution/directives/:id/cancel`, body `{"actor": "<name>", "reason"?: "<text>"}`. Order of checks: body parse (400, or 413 over 256 KB), actor required (422 `INVALID_ACTOR`), approver allowlist (403 `APPROVER_NOT_ALLOWED`), env.DB required (503 `DB_NOT_CONFIGURED`), directive lookup (404 `NOT_FOUND`), status must be `approved_ready` or `proposed` (409 `DIRECTIVE_NOT_CANCELLABLE` otherwise).
- The status write is a compare and set: `UPDATE ... WHERE status IN ('approved_ready','proposed')`. If it changes no row, the route reads the current status and returns 409 with it. The route writes existing columns only (status, actor, decided_at, result_json). No schema change. It writes event `directive_cancelled` with `{actor, from_status, reason}` and returns 200 `{ok, directive}`.
- `jevCancelApproverCheck` uses `CANCEL_DEFAULT_APPROVERS = ["jenny"]` when the policy has no approvers field. See known gap 1.
- Orphan re-enqueue. `ORPHAN_MAX_TERMINAL_FAILURES = 3`. An approved runnable directive (DELEGATE_KINDS plus AUTO_KINDS, now including `memory_edit`) is enqueued when it has no pending or claimed queue row, with at most 3 terminal failed rows. Before, any existing queue row blocked a retry for good.
- Low-confidence hold. A payload with `low_confidence === true` returns `low_confidence` from `autoBlockReason` and stays `needs_approval`. The raw confidence floor stays off (uncalibrated).
- Approved auto kinds (`record_learning`, `note`) run through the approved delegate path when approved.
- A failed queue row records the real error text (`res.error`) as well as the reason code.

### jev-gate.js

- A mutating contents write to a repo-scoped or path-scoped tool now runs the branch rules even when the tool declares no branch fields. A write with no `body.branch` is refused, because an omitted branch means the default branch (main). Main stays denied for contents writes. Non-contents URLs for repo-scoped tools were already refused, so issue and PR writes are unaffected.

### jev-decide.js

- `applyGithubCreateShape(a)` (exported). A `github.contents_put` PUT built by the generic prompt path, aimed at a `scratch/` path on a `scratch/` branch with no sha and no create flag, gets `create: true`. Any other path or branch is returned unchanged, so the gate still refuses it. main is never rewritten here.
- The template always sends the create form. jev-execute resolves create or update at dispatch: GET `?ref=<branch>` returns 200 (the current blob sha is added and create is dropped) or 404 (create stays). GitHub refuses an update sent without a sha.

### jev-taste.js and jev-taste-math.js (degenerate scale coherence)

- Scale coherence on a degenerate input is `not_applicable`, never satisfied. Cases: `solid_field` (ink at or above 0.99 of the grid), `near_empty` (ink below 0.01), `zero_variance` (the box count is constant within either half of the scale window). The result carries `reason: "degenerate_input:<case>"`. Coherence is not computed. The constants `COHERENCE_SOLID_INK` and `COHERENCE_NEAR_EMPTY_INK` are exported.
- Effect (INTEGRATION-15, E1): a single dot and a sparse 4-dot field become `NOT_APPLICABLE (near_empty)`. A solid field no longer returns 422 `invalid_feature`. An all-zero grid still throws `EMPTY_EDGE_MAP`. Fractal and symmetry outputs are unchanged.

### jev-corpus-routes.js (audit seed and nulls echo, AUDIT_PIPELINE v3)

- `AUDIT_PIPELINE` moves from `audit-v2-pipeline-keyed` to `audit-v3-matrix-seed`. Every audit input hash changes, so stored audit hashes do not recompute (INTEGRATION-15, E2).
- `auditSeedOf(deps, matrix)`: the seed is the first 32 bits of SHA-256 over the canonical JSON `{kind: "audit-null-seed", matrix}`. A zero seed maps to `0x9e3779b9`. `seed_source` is `matrix_sha256_prefix32`. The seed depends on the matrix only, so labels and the null count do not reshuffle the draws. Nulls come from one sequential stream, so the first N draws of a longer run are the draws a shorter run uses.
- Every audit result echoes `seed`, `seed_source` and `nulls_source` (`default` or `request`), next to `nulls`.
- POST /audit and the placements leg use the same seed, so placements reports the z and dbc that POST /audit reports for the same matrix and nulls. The placements result also echoes `nulls_source`, `seed` and `seed_source`.
- `prngFromHex` and `computeAudit` are exported.

### index.js (map source validation)

- `source` is optional on the map endpoint and must be `synthetic`, `vectors` or `texts` (422 otherwise). `source: "texts"` needs a texts input. `source: "synthetic"` or `"vectors"` needs a vectors input (422 otherwise). The recorded source is `texts:<model>` for text runs, `synthetic` for synthetic runs, and `vectors` otherwise.

### jev-selftest.js

- The envelope adds `failures`: one `{name, reason}` per failing check (reason is the check detail, or "no reason recorded"). `failed` is kept (the first failing name), and `checks` is kept.
- The `schema_bootstrap` check is recorded. If the schema bootstrap fails, the envelope returns early.
- The runner's internal-error envelope carries `failures` and `checks` too.

### dbx.js (memory driver only, test-only)

- The memory driver's SET clauses accept `col = ?`, `col = 'literal'`, `col = NULL`, and a column copy `col = other_col` (copied from the pre-update row). WHERE accepts `col = 'literal'`. This covers the approval-meta backfill used by the selftest (QA 2026-10-10: the memory driver rejected `approved_by = actor`).
- `d1Driver`, `SCHEMA_DDL` and `ALTER_DDL` are unchanged. Production runs on D1.

## Verification recorded

- INTEGRATION-15: `node --check` passes on all 10 changed modules. The apply scripts reproduce each lane's output byte for byte.
- INTEGRATION-15: `cancel-test.mjs` passes 14 of 14 against a copy of patched15 with a stub D1 and stack. Not run against real D1. A smoke test after deploy is recommended (F3).

## Known gaps and open items (not changed in this push)

1. Cancel approver default. `CANCEL_DEFAULT_APPROVERS` in jev-evolution2-routes.js is `["jenny"]`. Approve and reject default to `["jenny","ermine"]`. The live policy v21 has no `approvers` field, so directive cancel accepts jenny only and returns 403 for ermine. This does not match the intended default. Fix by aligning the cancel default in a later patch, or by setting `approvers` in the policy.
2. INTEGRATION-15 items A1 (review the approved_ready backlog before deploy), C2 (contents write branch rule), C4 (default approver list), E1 (verdict consumers of scale_coherence not_applicable) and E2 (audit hash re-anchor). The source files reviewed here do not record the decisions. Treat them as open until confirmed.
3. Approver identity is the actor name in the request body (self-asserted). The bearer token is the real authentication (C5).
4. Verbatim source comments in several modules contain em dash characters. The files are copied without edits so their bytes match the deployed bundle.
5. The /jev/ console (jev-index.html) lives in KV and is not versioned by this push.
