// jev-selftest.js — endpoint-live-audit P1-1 + P1-4 (SPEC-AUDIT-FIXES-2026-10-08).
//
// Two in-process selftests, both memory-driver-only for state they create:
//   GET /api/jev/selftest         → runOrchestratorLifecycleSelftest(deps)
//   GET /api/jev/selftest/ledger  → runLedgerIntegritySelftest(env, deps)
//
// INVARIANTS honored here (SPEC §Invariants):
//   - NEVER uses deps.dbx (the production D1 driver) and NEVER writes env.DB.
//     The lifecycle builds its own dbx over dbx.memoryDriver(). The ledger
//     selftest's real-ledger pass is READ-ONLY (SELECT-only) against env.DB,
//     mirroring the exact access path the hysteresis route itself uses
//     (jev-corpus-routes ledgerRowsForBaseline → d1CorpusDriver(env.DB)):
//     deps.dbx has no accessor for the `outcomes` table, so SELECT is the only
//     honest read; a poisoned-env.DB test proves no non-SELECT statement is
//     ever issued.
//   - No LLM calls, no fetch, no dispatch, no Vectorize, no lead sends.
//     understand/decide are never invoked; dispatch/verify legs are stubbed.
//   - Every check gets a row; failures carry a detail; nothing is swallowed.
//
// Response contract (both selftests):
//   200 { ok: true,  checks: [{ name, pass, detail? }, ...] }
//   500 { ok: false, failed: <first failing check name>, checks: [...] }
//
// ES module, Web APIs only, no npm. Imports REAL bundle parts by relative name.

import { makeDbx, memoryDriver } from './dbx.js';
import {
  transit, getTask, appendEvent, TERMINAL_STATES, isTerminal,
  newId, selfCheck as stateSelfCheck,
} from './jev-state.js';
// PRODUCTION-PARITY helpers: jev-main wires helpers.sha256Hex = sha256HexSync
// (SYNC — jev-ingest calls it synchronously when computing content_hash, and
// jev-review hashes approval payloads with it). The jev-state sha256Hex is
// async and would leak a Promise into those fields.
import { sha256HexSync } from './jev-main.js';
import { ingestTask, canonicalJson } from './jev-ingest.js';
import { gateAction, canonicalHash } from './jev-gate.js';
import { createApproval, approve } from './jev-review.js';
import { verifyAction } from './jev-verify.js';
import { closeTask, reconcileAction, TERMINAL_OUTCOMES } from './jev-loop.js';
import { validateResendSendBody } from './jev-decide.js';
// The REAL consolidation function the hysteresis route uses. Exported by
// jev-corpus-routes.js per the P1-4 wiring edit (edits.json entry 2) — the
// function was module-private before; the edit only adds the `export` keyword.
import { consolidateLedgerChains } from './jev-corpus-routes.js';

// ---------------------------------------------------------------------------
// Shared response helpers — same style as routes-jev.js / jev-corpus-routes.js.
// ---------------------------------------------------------------------------
const SELFTEST_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...SELFTEST_CORS } });
}

function err(code, message, status = 400) {
  return json({ error: { code, message } }, status);
}

// Constant-time comparison — verbatim routes-jev.js pattern.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Same authorized() pattern as routes-jev.js / jev-corpus-routes.js (defense
// in depth: the dispatcher already ran the gate; this module never trusts it).
async function authorized(req, env) {
  if (!env.JEV_API_KEY) return { notConfigured: true };
  const expected = await env.JEV_API_KEY.get();
  if (!expected) return { notConfigured: true };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return { unauthorized: true };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Check-envelope builder: every check gets a row, no silent swallowing.
// ---------------------------------------------------------------------------
function makeRecorder() {
  const checks = [];
  return {
    checks,
    async run(name, fn) {
      try {
        const detail = await fn();
        checks.push({ name, pass: true, ...(detail !== undefined ? { detail } : {}) });
      } catch (e) {
        checks.push({ name, pass: false, detail: String((e && e.message) || e).slice(0, 400) });
      }
    },
    envelope() {
      const failures = checks.filter((c) => c.pass === false).map((c) => ({ name: c.name, reason: c.detail || "no reason recorded" }));
      if (failures.length) return { ok: false, failed: failures[0].name, failures, checks };
      return { ok: true, checks };
    },
  };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Fixed clock. Approval expiry / policy-change logic is time-based; a fixed
// T0 makes the selftest deterministic (expires_at is crafted explicitly).
// ---------------------------------------------------------------------------
const T0 = "2026-10-08T18:00:00.000Z";
function fixedNow() { return T0; }

// Minimal policy doc that passes validatePolicyDoc (jev-gate) and carries the
// two tools the lifecycle exercises. No route.dispatch block → stock gate path.
function selftestPolicy() {
  return {
    version: 7,
    paused: false,
    tools: {
      "http.fetch": { hosts: ["api.example.test"], methods: ["GET", "POST"], max_cost_usd: 0.05, requires_approval: false },
      "resend.send": { hosts: ["api.resend.com"], methods: ["POST"], max_cost_usd: 0.01, requires_approval: true },
    },
    limits: { max_actions_per_task: 5, max_retries_per_action: 2, max_task_cost_usd: 1.0, min_ms_between_dispatches: 0 },
    thresholds: { auto_act_is_actionable: 0.6, review_floor: 0.4, risk_requires_approval: 0.8 },
    categories: { ops: "operations" },
    blocked_action: "park",
    approval_ttl_seconds: 3600,
  };
}

// Action-row shape exactly as runPipeline (routes-jev.js) inserts them.
function actionRow(taskId, seq, fields) {
  const nowIso = fixedNow();
  return {
    id: newId("a_"),
    task_id: taskId,
    seq,
    tool: fields.tool,
    method: String(fields.method || "GET").toUpperCase(),
    url: String(fields.url || ""),
    headers_json: fields.headers ? JSON.stringify(fields.headers) : null,
    body_json: fields.body != null ? (typeof fields.body === "string" ? fields.body : JSON.stringify(fields.body)) : null,
    expected_json: fields.expected ? JSON.stringify(fields.expected) : null,
    stable_id: `jev-${taskId}-${seq}`,
    state: "proposed",
    provider_ref: null,
    attempts: 0,
    created_at: nowIso,
    dispatched_at: null,
  };
}

// reviewDeps-shaped deps for jev-review.approve — mirrors routes-jev.js
// reviewDeps() INCLUDING the gateActionRerun adapter that forwards the
// just-approved binding into the gate (the 2026-10-01 adapter lesson).
function reviewDepsShape(dbx, policy, opts = {}) {
  const forward = opts.forward !== false; // false simulates the dropped-approvals adapter
  return {
    dbx,
    helpers: { now: fixedNow, newId, sha256Hex: sha256HexSync, canonicalHash: canonicalJson },
    currentPolicy: policy,
    getTask: (d, id) => getTask(d, id),
    getAction: (d, id) => d.getAction(id),
    transit: (d, t, toState, data) => transit(d, t, toState, data),
    appendEvent: (d, ev) => appendEvent(d, ev),
    closeTask: (d, t, outcome, reason) => closeTask(t, outcome, reason, { dbx: d }),
    gateActionRerun: ({ task, action, approval }) =>
      gateAction(policy, task, action, forward && approval ? [approval] : [], fixedNow()),
  };
}

// ---------------------------------------------------------------------------
// P1-1 — orchestrator lifecycle replay (memory driver only).
// deps is accepted for call-site parity but NEVER used for storage: no
// deps.dbx reads or writes anywhere in this function (proven by the test
// suite's poisoned-deps.dbx Proxy).
// ---------------------------------------------------------------------------
export async function runOrchestratorLifecycleSelftest(deps) {
  const rec = makeRecorder();
  // OWN memory driver — never deps.dbx, never env.DB.
  const driver = memoryDriver();
  const dbx = makeDbx(driver);
  await rec.run("schema_bootstrap", () => dbx.ensureSchema());
  if (rec.checks.some((c) => c.pass === false)) return rec.envelope();
  // Production-parity helpers (jev-main wires canonicalHash: canonicalJson).
  const helpers = { now: fixedNow, newId, sha256Hex: sha256HexSync, canonicalHash: canonicalJson };
  const policy = selftestPolicy();
  const envStub = { TS: { writeDataPoint() {} } }; // tsWrite fire-and-forget, silent here

  const persistIngest = async (body, key) => {
    const r = await ingestTask(dbx, body, helpers);
    if (r._writes) await Promise.all(r._writes);
    return r;
  };

  // --- 1. ingest through the REAL validation --------------------------------
  await rec.run("ingest_rejects_missing_source", async () => {
    let threw = null;
    try { await persistIngest({ payload: { hello: "world" } }, "bad"); }
    catch (e) { threw = e; }
    assert(threw, "ingestTask accepted a body with no source");
    assert(threw.code === "INVALID_SOURCE", `expected INVALID_SOURCE, got ${threw.code}`);
    assert(String(threw.message).includes("source must be one of:"), "message must name the allowed sources");
  });
  await rec.run("ingest_rejects_missing_source_creates_no_row", async () => {
    const rows = await dbx.listTasks({ limit: 200 });
    assert(rows.length === 0, `expected 0 task rows after rejected ingest, got ${rows.length}`);
  });
  let task1;
  await rec.run("ingest_valid_creates_task_row", async () => {
    const r = await persistIngest({ source: "api", title: "selftest lifecycle", payload: { hello: "world" }, idempotency_key: "selftest-1" }, "ok");
    assert(r && r.task && r.duplicate === false, "valid body must create a fresh task");
    task1 = r.task;
    const stored = await dbx.getTask(task1.id);
    assert(stored && stored.state === "ingested", `task row must persist in state 'ingested', got ${stored && stored.state}`);
    assert(stored.content_hash && stored.content_hash.length === 64, "content_hash must be a sha256 hex digest");
  });
  await rec.run("ingest_dedupe_returns_existing_no_new_row", async () => {
    const r = await persistIngest({ source: "api", title: "selftest lifecycle", payload: { hello: "world" }, idempotency_key: "selftest-1" }, "dup");
    assert(r.duplicate === true, "same idempotency key must return duplicate:true");
    const rows = await dbx.listTasks({ limit: 200 });
    assert(rows.length === 1, `dedupe must not create a second row, got ${rows.length}`);
  });

  // Advance task1 through understand/decide (STUBBED: transit only, no LLM)
  // so the gate and approval legs run against a realistically-stated task.
  let actionAllowed, actionApproval;
  await rec.run("gate_allows_http_fetch_on_allowed_host", async () => {
    await transit(dbx, await getTask(dbx, task1.id), "understood", { intent_available: true });
    let t = await transit(dbx, await getTask(dbx, task1.id), "decided", { proposed: 1 });
    actionAllowed = actionRow(t.id, 1, { tool: "http.fetch", method: "GET", url: "https://api.example.test/v1/ping" });
    await dbx.insertAction(actionAllowed);
    t = await transit(dbx, t, "gated", { gate_outcome: "allowed" });
    const g = await gateAction(policy, t, actionAllowed, [], fixedNow());
    assert(g.outcome === "allowed", `expected allowed, got ${g.outcome} (${(g.reasons || []).join(",")})`);
    assert(g.policy_version === policy.version, "gate must stamp the policy version");
    return `outcome=allowed host=api.example.test`;
  });
  await rec.run("gate_needs_approval_for_requires_approval_tool", async () => {
    actionApproval = actionRow(task1.id, 2, {
      tool: "resend.send", method: "POST", url: "https://api.resend.com/emails",
      body: { from: "Steady Orbit <site@axel.steadyorbitsystems.ai>", to: ["a@b.test"], subject: "selftest", html: "<p>ok</p>" },
    });
    await dbx.insertAction(actionApproval);
    const t = await getTask(dbx, task1.id);
    const g = await gateAction(policy, t, actionApproval, [], fixedNow());
    assert(g.outcome === "needs_approval", `requires_approval tool with no approval must be needs_approval, got ${g.outcome}`);
    assert((g.reasons || []).includes("tool_requires_approval"), "fail-closed reason must name the approval requirement");
    assert(g.approval_context && g.approval_context.payload_hash, "needs_approval must carry an approval context with a payload hash");
  });
  await rec.run("gate_blocks_unknown_tool", async () => {
    const ghost = actionRow(task1.id, 3, { tool: "http.fetchx", method: "GET", url: "https://api.example.test/v1/ping" });
    const t = await getTask(dbx, task1.id);
    const g = await gateAction(policy, t, ghost, [], fixedNow());
    assert(g.outcome === "blocked", `unknown tool must be blocked, got ${g.outcome}`);
    assert((g.reasons || []).includes("unknown_tool"), "block reason must be unknown_tool");
  });
  await rec.run("gate_blocks_unreadable_policy", async () => {
    const t = await getTask(dbx, task1.id);
    const g = await gateAction({ error: "policy_unavailable" }, t, actionAllowed, [], fixedNow());
    assert(g.outcome === "blocked", `unreadable policy must fail closed to blocked, got ${g.outcome}`);
    assert((g.reasons || []).includes("policy_unavailable"), "block reason must be policy_unavailable");
  });
  await rec.run("decide_stage_rejects_malformed_resend_body", async () => {
    // The REAL propose-time validator (jev-decide, 2026-10-02 regression
    // t_e173b0b1d05a1877): a resend.send body shaped {recipient,message} must
    // be rejected BEFORE the gate ever sees it.
    const errs = validateResendSendBody({ recipient: "a@b.test", message: "hi" });
    assert(Array.isArray(errs) && errs.length > 0, "malformed resend.send body must be rejected");
    assert(String(errs[0]).includes("recipient"), `rejection must name the wrong keys, got: ${errs[0]}`);
  });

  // --- 3. approval binding + expiry-on-policy-change -------------------------
  let apMain;
  await rec.run("approval_binding_created_with_canonical_hash", async () => {
    apMain = await createApproval(dbx, await getTask(dbx, task1.id), actionApproval, policy, helpers);
    assert(apMain && apMain.status === "pending", "createApproval must insert a pending row");
    assert(String(apMain.policy_version) === String(policy.version), "approval must bind the policy version the gate was running");
    // HASH PARITY (the 2026-10-01 payload-duality lesson): the stored hash must
    // equal what the gate computes for the SAME bound payload shape.
    const gateHash = await canonicalHash({ method: actionApproval.method, url: actionApproval.url, body: actionApproval.body_json ?? actionApproval.body ?? null });
    assert(apMain.payload_hash === gateHash, "createApproval and gateAction must hash the SAME bound payload");
    return `payload_hash=${apMain.payload_hash.slice(0, 12)}…`;
  });
  await rec.run("approve_rejects_policy_version_change", async () => {
    // Craft an OLDER bound policy: the approval is bound to v7 but the current
    // policy is v8 → the binding is invalid (superseded), never approved.
    const newer = { ...policy, version: 8 };
    const r = await approve(envStub, apMain.id, "selftest-operator", "note", reviewDepsShape(dbx, newer));
    assert(r.ok === false, "approve must reject an approval bound to an older policy");
    assert(r.code === "POLICY_CHANGED", `expected POLICY_CHANGED, got ${r.code}`);
    const row = await dbx.getApproval(apMain.id);
    assert(row.status === "superseded", `approval must be superseded on policy change, got ${row.status}`);
  });
  await rec.run("approve_rejects_expired", async () => {
    // Fresh approval, then force its expiry into the past (fixed clock).
    const ap = await createApproval(dbx, await getTask(dbx, task1.id), actionApproval, policy, helpers);
    await dbx.updateApproval(ap.id, { expires_at: "2026-10-08T17:00:00.000Z" }); // 1h before T0
    const r = await approve(envStub, ap.id, "selftest-operator", "note", reviewDepsShape(dbx, policy));
    assert(r.ok === false, "approve must reject a past-due approval");
    assert(r.code === "EXPIRED", `expected EXPIRED, got ${r.code}`);
    const row = await dbx.getApproval(ap.id);
    assert(row.status === "expired", `approval must be expired, got ${row.status}`);
  });
  await rec.run("approve_recheck_forwards_approvals_array", async () => {
    // The 2026-10-01 adapter lesson: reviewDeps.gateActionRerun must forward
    // the JUST-APPROVED binding into the gate. Drive the REAL approve() end to
    // end with the production adapter shape (forwarding) and assert the rerun
    // gate returns allowed for a requires_approval tool. A FRESH pending
    // approval is used because approve_rejects_policy_version_change already
    // superseded apMain (approve refuses non-pending rows).
    const apHappy = await createApproval(dbx, await getTask(dbx, task1.id), actionApproval, policy, helpers);
    await transit(dbx, await getTask(dbx, task1.id), "awaiting_approval", { gate_outcome: "needs_approval" });
    const r = await approve(envStub, apHappy.id, "selftest-operator", "selftest approve", reviewDepsShape(dbx, policy));
    assert(r.ok === true, `approve must succeed with the forwarding adapter: ${r.code || ""} ${r.message || ""}`);
    assert(r.gate && r.gate.outcome === "allowed", `rerun gate must be allowed when the approvals array is forwarded, got ${r.gate && r.gate.outcome}`);
    const row = await dbx.getApproval(apHappy.id);
    assert(row.status === "approved" && row.actor === "selftest-operator", "approval must record actor + approved status");
    return `rerun_outcome=allowed adapter=forwards-[approval]`;
  });
  await rec.run("approve_transits_awaiting_approval_to_gated", async () => {
    const t = await getTask(dbx, task1.id);
    assert(t.state === "gated", `approve must recheck the task back to gated, got ${t.state}`);
  });
  await rec.run("dropped_approvals_adapter_traps_gate_in_needs_approval", async () => {
    // The exact 2026-10-01 bug class, reproduced and DETECTED: an adapter that
    // drops the approvals array makes every approve-time recheck return
    // needs_approval forever ("no approval on file"), even though an approved
    // binding exists and the forwarding adapter returns allowed for the very
    // same state (proven by approve_recheck_forwards_approvals_array above).
    const t = await getTask(dbx, task1.id);
    const g = await gateAction(policy, t, actionApproval, [], fixedNow());
    assert(g.outcome === "needs_approval", `dropped-approvals adapter observable must be needs_approval, got ${g.outcome}`);
    return "same approved action: forwarded adapter -> allowed; dropped adapter -> needs_approval (bug class caught)";
  });

  // --- 4. verify / terminal mapping through the REAL verify logic ------------
  const makeVerifyTask = async (key) => {
    const r = await persistIngest({ source: "api", title: `selftest verify ${key}`, payload: { k: key } }, key);
    let t = r.task;
    t = await transit(dbx, t, "understood", {});
    t = await transit(dbx, t, "decided", {});
    t = await transit(dbx, t, "gated", { gate_outcome: "allowed" });
    return t;
  };

  let taskOk;
  await rec.run("verify_success_maps_verified_success", async () => {
    taskOk = await makeVerifyTask("selftest-verify-ok");
    const a = actionRow(taskOk.id, 1, { tool: "http.fetch", method: "GET", url: "https://api.example.test/v1/ping", expected: { status_range: [200, 299] } });
    a.response_json = JSON.stringify({ status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true}' });
    await dbx.insertAction(a);
    const { verdict } = await verifyAction(envStub, taskOk, a, { dbx, fetchImpl: () => { throw new Error("selftest must not fetch"); } });
    assert(verdict === "verified_success", `expected verified_success, got ${verdict}`);
    const stored = await dbx.getAction(a.id);
    assert(stored.state === "verified_success", `action state must be verified_success, got ${stored.state}`);
    assert(stored.verified_at, "verify must stamp verified_at");
  });
  await rec.run("terminal_succeeded_via_real_transit", async () => {
    let t = await getTask(dbx, taskOk.id);
    t = await transit(dbx, t, "dispatching", {});
    t = await transit(dbx, t, "verifying", {});
    t = await transit(dbx, t, "succeeded", {});
    assert(t.state === "succeeded" && isTerminal(t.state), `task must land terminal:succeeded, got ${t.state}`);
    const closed = await closeTask(t, "succeeded", "selftest verified_success", { dbx });
    assert(closed.terminal_outcome === "succeeded", `terminal_outcome must mirror succeeded, got ${closed.terminal_outcome}`);
  });
  let taskFail;
  await rec.run("verify_failure_maps_verified_failure", async () => {
    taskFail = await makeVerifyTask("selftest-verify-fail");
    const a = actionRow(taskFail.id, 1, { tool: "http.fetch", method: "GET", url: "https://api.example.test/v1/ping", expected: { status_range: [200, 299] } });
    a.response_json = JSON.stringify({ status: 500, headers: {}, body: '{"error":"boom"}' });
    await dbx.insertAction(a);
    const { verdict } = await verifyAction(envStub, taskFail, a, { dbx, fetchImpl: () => { throw new Error("selftest must not fetch"); } });
    assert(verdict === "confirmed_failure", `expected confirmed_failure, got ${verdict}`);
    const stored = await dbx.getAction(a.id);
    assert(stored.state === "verified_failure", `action state must be verified_failure, got ${stored.state}`);
  });
  await rec.run("terminal_failed_via_real_transit", async () => {
    let t = await getTask(dbx, taskFail.id);
    t = await transit(dbx, t, "dispatching", {});
    t = await transit(dbx, t, "verifying", {});
    t = await transit(dbx, t, "failed", {});
    assert(t.state === "failed" && isTerminal(t.state), `task must land terminal:failed, got ${t.state}`);
  });
  let taskUnknown;
  await rec.run("verify_unknown_without_evidence_never_succeeds", async () => {
    taskUnknown = await makeVerifyTask("selftest-verify-unknown");
    // No expected_json and no response_json: absence of evidence is unknown —
    // never silently succeeds (SPEC §10).
    const a = actionRow(taskUnknown.id, 1, { tool: "http.fetch", method: "GET", url: "https://api.example.test/v1/ping" });
    await dbx.insertAction(a);
    const { verdict } = await verifyAction(envStub, taskUnknown, a, { dbx, fetchImpl: () => { throw new Error("selftest must not fetch"); } });
    assert(verdict === "unknown", `absence of evidence must be unknown, got ${verdict}`);
    const stored = await dbx.getAction(a.id);
    assert(stored.state === "unknown", `action state must be unknown, got ${stored.state}`);
  });
  await rec.run("reconcile_happened_resolves_success", async () => {
    const a = (await dbx.listActions(taskUnknown.id))[0];
    const r = await reconcileAction(envStub, taskUnknown, a, { observed: "happened", source: "selftest" }, { dbx, transit: (t, to, data) => transit(dbx, t, to, data) });
    assert(r.resolved === true && r.verdict === "verified_success", `happened must resolve verified_success, got ${r.verdict}`);
    const stored = await dbx.getAction(a.id);
    assert(stored.state === "verified_success" && stored.reconciled_at, "reconcile must stamp the action");
  });
  await rec.run("reconcile_unclear_fails_closed_to_review", async () => {
    let t = await makeVerifyTask("selftest-verify-unclear");
    const a = actionRow(t.id, 1, { tool: "http.fetch", method: "GET", url: "https://api.example.test/v1/ping" });
    await dbx.insertAction(a);
    const r = await reconcileAction(envStub, t, a, { observed: "unclear" }, { dbx, transit: (x, to, data) => transit(dbx, x, to, data) });
    assert(r.resolved === false, "unclear evidence must not resolve");
    const fresh = await getTask(dbx, t.id);
    assert(fresh.state === "awaiting_approval", `unclear reconcile must fail closed to awaiting_approval, got ${fresh.state}`);
  });

  // --- six terminal states remain distinct (SPEC §4) --------------------------
  await rec.run("six_terminal_states_distinct", async () => {
    assert(TERMINAL_STATES.length === 6, `expected 6 terminal states, got ${TERMINAL_STATES.length}`);
    assert(new Set(TERMINAL_STATES).size === 6, "terminal states must be distinct");
    assert(JSON.stringify([...TERMINAL_STATES].sort()) === JSON.stringify([...TERMINAL_OUTCOMES].sort()),
      "jev-state and jev-loop terminal sets must agree");
    return TERMINAL_STATES.join(",");
  });
  await rec.run("terminal_states_have_no_outgoing_transitions", async () => {
    const done = await getTask(dbx, taskOk.id); // terminal:succeeded
    let threw = null;
    try { await transit(dbx, done, "decided", {}); }
    catch (e) { threw = e; }
    assert(threw, "transit out of a terminal state must throw");
    assert(String(threw.message).includes("terminal"), `error must name the terminal block, got: ${threw.message}`);
  });
  await rec.run("closeTask_rejects_invalid_outcome", async () => {
    let threw = null;
    try { await closeTask(await getTask(dbx, taskFail.id), "sort_of_ok", "x", { dbx }); }
    catch (e) { threw = e; }
    assert(threw, "closeTask must reject an outcome outside the six states");
    assert(threw.code === "INVALID_OUTCOME", `expected INVALID_OUTCOME, got ${threw.code}`);
  });
  await rec.run("state_machine_selfcheck_passes", async () => {
    const sc = selfCheckOf();
    assert(sc.ok === true, `jev-state selfCheck failed: ${JSON.stringify(sc.checks.filter((c) => !c.ok))}`);
    return `${sc.checks.length} internal integrity checks`;
  });

  return rec.envelope();
}

function selfCheckOf() { return stateSelfCheck(); }

// ---------------------------------------------------------------------------
// P1-4 — outcomes ledger integrity.
// Part 1: synthetic chain fixtures through the REAL consolidateLedgerChains
//         (the function the hysteresis route uses).
// Part 2: READ-ONLY pass over the real outcomes rows. deps.dbx has no
//         accessor for the `outcomes` table (verified against dbx.js), so the
//         read mirrors the hysteresis route's own access path: SELECT-only
//         statements against env.DB. Nothing is ever written.
// ---------------------------------------------------------------------------
export async function runLedgerIntegritySelftest(env, deps) {
  const rec = makeRecorder();

  const row = (id, fields) => ({
    id,
    predicted_delta: fields.predicted !== undefined ? fields.predicted : null,
    observed_delta: fields.observed !== undefined ? fields.observed : null,
    supersedes: fields.supersedes !== undefined ? fields.supersedes : null,
    entry_json: fields.entry != null ? JSON.stringify(fields.entry) : null,
  });
  const assertRows = (cons, expected) => {
    assert(cons.ledger_rows === expected.ledger_rows, `ledger_rows ${cons.ledger_rows} != ${expected.ledger_rows}`);
    assert(cons.rows.length === expected.rows.length, `contract rows ${cons.rows.length} != ${expected.rows.length}`);
    for (let i = 0; i < expected.rows.length; i++) {
      const got = cons.rows[i];
      const want = expected.rows[i];
      assert(got.id === want.id, `row ${i} id ${got.id} != ${want.id}`);
      assert(got.predicted_delta === want.predicted_delta, `${got.id} predicted_delta ${got.predicted_delta} != ${want.predicted_delta}`);
      assert(got.realized_delta === want.realized_delta, `${got.id} realized_delta ${got.realized_delta} != ${want.realized_delta}`);
      assert(got.supersedes === null, "consolidated contract rows must clear supersedes");
      assert(JSON.stringify(got.chain_ids) === JSON.stringify(want.chain_ids), `${got.id} chain_ids ${JSON.stringify(got.chain_ids)} != ${JSON.stringify(want.chain_ids)}`);
      assert(Number.isFinite(got.predicted_delta) && Number.isFinite(got.realized_delta), "every contract row must carry a finite delta pair");
    }
  };

  // 1. single row, BOTH shapes -----------------------------------------------
  await rec.run("ledger_fixture_single_row_column_shape", async () => {
    const cons = consolidateLedgerChains([row("solo-a", { predicted: 0.5, observed: 0.4 })]);
    assertRows(cons, { ledger_rows: 1, rows: [{ id: "solo-a", predicted_delta: 0.5, realized_delta: 0.4, chain_ids: ["solo-a"] }] });
    return "numeric columns carry both deltas";
  });
  await rec.run("ledger_fixture_single_row_entry_json_shape", async () => {
    const cons = consolidateLedgerChains([row("solo-b", { entry: { predicted_delta: 1.5, observed_delta: 1.2, supersedes: null } })]);
    assertRows(cons, { ledger_rows: 1, rows: [{ id: "solo-b", predicted_delta: 1.5, realized_delta: 1.2, chain_ids: ["solo-b"] }] });
    return "entry_json carries both deltas";
  });
  // 2. split predicted/realized supersedes pair --------------------------------
  await rec.run("ledger_fixture_split_predicted_realized_pair", async () => {
    const cons = consolidateLedgerChains([
      row("split-1", { predicted: 0.3 }),                      // pre-registration row
      row("split-2", { observed: 0.25, supersedes: "split-1" }), // realized row supersedes it
    ]);
    assertRows(cons, { ledger_rows: 2, rows: [{ id: "split-2", predicted_delta: 0.3, realized_delta: 0.25, chain_ids: ["split-1", "split-2"] }] });
    return "superseded row folded into the tail's loop";
  });
  // 3. 3-cycle chain ------------------------------------------------------------
  await rec.run("ledger_fixture_three_cycle_chain", async () => {
    const cons = consolidateLedgerChains([
      row("cyc-1", { predicted: 0.10 }),
      row("cyc-2", { predicted: 0.12, supersedes: "cyc-1" }),
      row("cyc-3", { observed: 0.09, supersedes: "cyc-2" }),
    ]);
    assertRows(cons, { ledger_rows: 3, rows: [{ id: "cyc-3", predicted_delta: 0.10, realized_delta: 0.09, chain_ids: ["cyc-1", "cyc-2", "cyc-3"] }] });
    return "predicted from oldest carrier, realized from newest";
  });
  // 4. pending (open) chain — skipped, never invented ---------------------------
  await rec.run("ledger_fixture_pending_open_chain_skipped", async () => {
    const cons = consolidateLedgerChains([
      row("pend-1", { predicted: 0.2 }),
      row("pend-2", { predicted: 0.22, supersedes: "pend-1" }),
    ]);
    assert(cons.rows.length === 0, `pending chain must be skipped, got ${cons.rows.length} rows`);
    assert(cons.ledger_rows === 2, `raw rows must still be counted, got ${cons.ledger_rows}`);
    return "no realized anywhere -> skipped, ledger_rows still counted";
  });
  // 5. dangling supersedes (target missing) -------------------------------------
  await rec.run("ledger_fixture_dangling_supersedes", async () => {
    // A dangling supersedes is NOT treated as superseded (the target never
    // existed), so a row carrying both deltas still forms its own loop; a row
    // carrying only one delta is skipped like any other pending chain.
    const cons = consolidateLedgerChains([
      row("dang-1", { predicted: 0.8, observed: 0.9, supersedes: "missing-id" }),
      row("dang-2", { observed: 0.1, supersedes: "also-missing" }),
    ]);
    assert(cons.ledger_rows === 2, `ledger_rows ${cons.ledger_rows} != 2`);
    assertRows(cons, { ledger_rows: 2, rows: [{ id: "dang-1", predicted_delta: 0.8, realized_delta: 0.9, chain_ids: ["dang-1"] }] });
    return "dangling target ignored for folding; both-delta row survives, one-delta row skipped";
  });

  // 6. READ-ONLY real-ledger pass ----------------------------------------------
  const db = env && env.DB;
  if (!db) {
    // Honest pass:false — a missing binding is a read failure, never swallowed.
    rec.checks.push({ name: "real_ledger_rows_readable", pass: false, detail: "env.DB binding missing; read-only real-ledger pass could not run" });
    return rec.envelope();
  }
  const issuedSql = [];
  const READ_SQL = `SELECT id, predicted_delta, observed_delta, supersedes, entry_json FROM outcomes ORDER BY id ASC LIMIT 1000`;
  let rows;
  await rec.run("real_ledger_rows_readable", async () => {
    try {
      const res = await db.prepare(READ_SQL).all();
      rows = (res && res.results) || [];
    } catch (e) {
      throw new Error(`read-only outcomes SELECT failed: ${String((e && e.message) || e).slice(0, 200)}`);
    }
    issuedSql.push(READ_SQL);
    assert(Array.isArray(rows), "outcomes read must return an array");
    return `${rows.length} real rows read (SELECT-only, LIMIT 1000 — same cap as the hysteresis route)`;
  });
  await rec.run("real_ledger_entry_json_parses", async () => {
    const bad = [];
    for (const r of rows) {
      if (r.entry_json != null) {
        try { JSON.parse(r.entry_json); }
        catch (e) { bad.push(r.id); }
      }
    }
    assert(bad.length === 0, `unparseable entry_json on rows: ${bad.slice(0, 5).join(",")}`);
    return `checked ${rows.length} rows`;
  });
  await rec.run("real_ledger_append_only_schema_shape", async () => {
    const bad = [];
    for (const r of rows) {
      if (r.id == null || r.id === "") bad.push(`${r.id}:missing-id`);
      for (const k of ["predicted_delta", "observed_delta"]) {
        const v = r[k];
        if (v != null && typeof v !== "number") bad.push(`${r.id}:${k}-non-numeric`);
      }
      const sup = r.supersedes;
      if (sup != null && typeof sup !== "string" && typeof sup !== "number") bad.push(`${r.id}:supersedes-non-scalar`);
    }
    assert(bad.length === 0, `append-only schema violations: ${bad.slice(0, 5).join(",")}`);
    return "every row carries a non-empty id; delta columns null-or-numeric";
  });
  await rec.run("real_ledger_closed_chains_parse", async () => {
    const cons = consolidateLedgerChains(rows);
    const openRows = rows.length - cons.rows.length;
    for (const c of cons.rows) {
      assert(Number.isFinite(c.predicted_delta) && Number.isFinite(c.realized_delta), `contract row ${c.id} lacks a finite delta pair`);
    }
    return `${cons.rows.length} closed chain(s) consolidated from ${rows.length} raw row(s); ${openRows} skipped (pending/malformed)`;
  });

  return rec.envelope();
}

// ---------------------------------------------------------------------------
// Router — GET /api/jev/selftest and GET /api/jev/selftest/ledger.
// Bearer-gated with the SAME authorized() pattern the other /api/jev delegates
// use (the dispatcher in routes-jev.js already ran it; defense in depth).
// ---------------------------------------------------------------------------
export async function handleJevSelftest(req, env, deps) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { ...SELFTEST_CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  const auth = await authorized(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);
  if (req.method !== "GET")
    return err("NOT_FOUND", `no selftest route for ${req.method} ${p}`, 404);
  try {
    if (p === "/api/jev/selftest") {
      const out = await runOrchestratorLifecycleSelftest(deps);
      return json(out, out.ok ? 200 : 500);
    }
    if (p === "/api/jev/selftest/ledger") {
      const out = await runLedgerIntegritySelftest(env, deps);
      return json(out, out.ok ? 200 : 500);
    }
    return err("NOT_FOUND", `no selftest route for ${req.method} ${p}`, 404);
  } catch (e) {
    // The runner itself must never 500-with-stack: envelope the surprise.
    const reason = String((e && e.message) || e).slice(0, 400);
    return json({ ok: false, failed: "selftest_internal_error", failures: [{ name: "selftest_internal_error", reason }], checks: [{ name: "selftest_internal_error", pass: false, detail: reason }], detail: reason }, 500);
  }
}
