
// routes-jev.js — the /api/jev route table (SPEC §5) for the steady-orbit worker.
//
// The legacy index.js module inserts ONE line inside its `/api/` block, before
// the no-route fallthrough:
//     if (p.startsWith("/api/jev")) return handleJev(req, env, deps);
// This file imports NOTHING from the other jev modules — every collaborator
// arrives via `deps` (the integrator wires them, field-by-field below).
//
// Style matches the deployed worker's relay routes: per-path if-blocks, shared
// json()/RELAY_CORS-style headers, relayRateLimited pattern (SPEC §3).
//
// ─────────────────────────────────────────────────────────────────────────────
// EXPECTED DEPS OBJECT (field-by-field; names match SPEC §15 export names):
//
// {
//   dbx: {                        // thin data-access layer (SPEC §16 "preferred")
//     insertTask(t), getTask(id), listTasks({limit?, state?}), updateTask(id, patch),
//     insertAction(a), getAction(id), listActions(taskId), updateAction(id, patch),
//     insertEvent(e), listEvents(taskId, limit),
//     insertApproval(a), getApproval(id), updateApproval(id, patch),
//       listApprovals({status?, taskId?, expiresBefore?, limit?}),
//     insertLearning(l), getLearning(id), listLearnings(), updateLearning(id, patch),
//     summary() → {tasks_by_state, tasks_by_outcome, pending_approvals,
//                  cost_usd_total, cost_usd_24h}   // policy_version added here
//   },
//   helpers: {
//     now(): string            // ISO 8601 UTC
//     newId(prefix): string    // prefix + 16 hex
//     sha256Hex(str): string   // hex sha256 (sync or async-resolving)
//   },
//   transit(dbx, task, toState, data),        // jev-state: validated transition + event
//   closeTask(dbx, task, outcome, reason),    // jev-loop: outcome ∈ six terminal states
//   isTerminal(task)?: boolean,               // jev-state (optional; fallback used)
//   appendEvent(dbx, {task_id, action_id, kind, data, policy_version}),  // jev-state
//   getTask(dbx, id) → task | null,           // jev-state
//   getAction(dbx, id) → action | null,       // jev-state
//   loadPolicy(env) → {doc} | {error},        // jev-gate: KV read + validate, fail-closed
//   gateAction(policy, task, action, approvals, nowIso)   // jev-gate, deterministic
//     → {outcome: allowed|needs_approval|blocked, reasons, policy_version},
//   validatePolicyDoc(doc) → null | errorString,          // jev-gate
//   ingestTask(dbx, body, helpers) → {task, duplicate},   // jev-ingest
//   understand(env, policy, task) → intent,               // jev-decide (advisory)
//   decideActions(env, policy, task, intent) → [action],  // jev-decide (advisory)
//   dispatchAction(env, dbx, task, action, policy)        // jev-execute (§9)
//     → {dispatched, provider_ref?, skipped?: {reason}},
//   verifyAction(env, dbx, task, action) → {verdict, evidence},   // jev-verify (§10)
//   continueTask(env, dbx, task) → {next, task},                  // jev-loop (§11)
//   retryAction(env, dbx, task, action) → {ok, reason?},          // jev-loop (§11)
//   reconcileAction(env, dbx, task, action, evidence) → {resolved, verdict}, // §11
//   createApproval(dbx, task, action, policy, helpers),           // jev-review
//   approve(env, approvalId, actor, note, deps),                  // jev-review
//   reject(dbx, approvalId, actor, reason, deps),                 // jev-review
//   guide(dbx, taskId, actor, guidance, deps),                    // jev-review
//   listPending(dbx),                                             // jev-review
//   expireStale(dbx, nowIso, deps),                               // jev-review
//   listLearnings(dbx),                                           // jev-improve
//   proposeLearning(dbx, taskId, proposal, helpers),              // jev-improve
//   promoteLearning(env, learningId, actor, newPolicy, deps),     // jev-improve
//   rateLimited?(req, max) → boolean,   // optional; legacy relayRateLimited pattern
// }
// ─────────────────────────────────────────────────────────────────────────────

// LANE-D AUTOMATIONS ADDITION (SPEC-AUTOMATIONS §4/§10): the automations HTTP
// surface is dispatched from the jev branch below via ONE delegate line.
import { handleJevAutomations, chooseDecideSource } from './routes-automations.js';
import { handleJevEvolution } from './jev-evolution.js';
// EVOLUTION V2 (Lane E): the v2 evolution surface (cycles, atoms, memory
// search, candles, manual cycle/run) delegated by the branch below.
import { handleJevEvolution2 } from './jev-evolution2-routes.js';
// JEV CORPUS (SPEC-CORPUS 3.4): the corpus route module, delegated by the
// branch below. Imports nothing from the other lanes; the math arrives via
// deps.corpus (wired in jev-main.js, edit b).
import { handleJevCorpus, recordPolicyPromotion } from './jev-corpus-routes.js';
// JEV-TIMESERIES (SPEC-TIMESERIES 2026-10-08 §2): WAE forecast + timeseries routes.
import { handleJevTimeseries } from './jev-timeseries.js';
// SPEC-ROUTER (measurement-gated routing regime): the router's HTTP surface,
// delegated by the branch below. jev-router imports runPipeline from THIS
// module (function declaration — the import cycle is safe; neither module
// calls the other's binding at module-eval time).
import { handleJevRouter } from './jev-router.js';
// JEV SELFTEST (endpoint-live-audit P1-1/P1-4): orchestrator lifecycle +
// outcomes-ledger integrity selftests, delegated by the branch below.
import { handleJevSelftest } from './jev-selftest.js';
// P1-2 + P1-3 (SPEC-AUDIT-FIXES-2026-10-08): the automations + evolution
// selftest surface (cycle replay, candle positive control, automations
// selftest). Delegated by the branch below; the module never touches env.DB
// or the production registry (memory drivers only).
import { handleJevSelftestEvolution } from './jev-selftest-evolution.js';
// WAVE 2 LANE F: operator workspace directory (D1 jev_workspaces +
// jev_workspace_artifacts). Delegated by the branch below; the optional
// workspace_id on /tasks and /automations/:id/run binds through these helpers.
import {
  handleJevWorkspace, workspaceForRequest, recordTaskArtifacts,
  recordAutomationArtifact, workspaceErrorResponse,
} from './jev-workspace.js';

const JEV_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Jev-Client",
  "Access-Control-Max-Age": "86400",
};
const TERMINAL_OUTCOMES = ["succeeded", "blocked", "rejected", "expired", "failed", "cancelled"];
const BODY_MAX = 256 * 1024;
const GATE_RANK = { allowed: 0, needs_approval: 1, blocked: 2 };
const ERR_STATUS = {
  INVALID_ACTOR: 400, INVALID_GUIDANCE: 422, INVALID_PROPOSAL: 422, INVALID_POLICY: 422,
  NO_POLICY: 422, NOT_FOUND: 404, NOT_PENDING: 409, EXPIRED: 409, POLICY_CHANGED: 409,
  GATE_BLOCKED: 409, BINDING_MISMATCH: 409, INVALID_STATE: 409, TASK_TERMINAL: 409,
  ALREADY_ACTIVE: 409,
};

function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...JEV_CORS, ...extra } });
}
function err(code, message, status = 400) {
  return json({ error: { code, message } }, status);
}

// ---- approval-meta: plain-language labels and serializers (BEGIN) ---------
// One dictionary feeds every operator-facing label. Three-part rows are
// [text, severity, next step]; four-part rows are [short, severity, text, next].
// Severity is one of ok | info | waiting | unknown | blocked | failed. The console
// renders the strings produced here and never maps raw codes itself. A code
// missing from the dictionary falls back to its raw spelling with known:false,
// so a gap is visible in the UI instead of silent.
const JEV_LABELS = {
  gate: {
    policy_unavailable: ["The policy could not be loaded, so nothing was allowed to run.", "blocked", "Check the policy and re-promote a valid version."],
    invalid_action: ["The proposed action is malformed.", "blocked", "Guide the task or submit a corrected proposal."],
    invalid_task: ["The task record has no id.", "blocked", "Report it; this should not happen."],
    unknown_tool: ["The action uses a tool this policy does not declare.", "blocked", "Guide the task to a declared tool, or add the tool through a reviewed policy promote."],
    host_not_allowed: ["The target host is not on this tool's allowlist.", "blocked", "Guide the task to an allowed host."],
    method_not_allowed: ["This HTTP method is not allowed for this tool.", "blocked", "Guide the task to an allowed method."],
    contents_url_invalid: ["The GitHub contents URL is malformed.", "blocked", "Correct the URL and re-submit."],
    repo_not_allowed: ["This GitHub repo is not on the tool's allowlist.", "blocked", "Guide the task to an allowed repo."],
    path_prefix_not_allowed: ["The file path is outside the tool's allowed folders.", "blocked", "Guide the task to an allowed path."],
    branch_missing: ["No branch was given for a write.", "blocked", "Add a branch name and re-submit."],
    branch_invalid: ["The branch name is not valid.", "blocked", "Correct the branch name and re-submit."],
    branch_denied: ["Writes to this branch are denied by policy (for example main).", "blocked", "Write to a feature branch instead."],
    branch_prefix_not_allowed: ["The branch does not start with an allowed prefix.", "blocked", "Use an allowed branch prefix."],
    sha_and_create_conflict: ["A write sent both a file sha and create:true.", "blocked", "Send either a sha (update) or create:true, not both."],
    missing_blob_sha_or_create: ["An update did not include the file's current sha.", "blocked", "Read the file first and send its sha."],
    query_param_not_allowed: ["A URL query parameter is not on the allowlist.", "blocked", "Remove the parameter or guide the task."],
    command_not_allowed: ["The command is not on the allowlist.", "blocked", "Guide the task to an allowed command."],
    body_unparseable: ["The request body could not be read for a scope check.", "blocked", "Send a valid JSON body."],
    pause_active: ["Operators have paused dispatch, so nothing was sent.", "blocked", "Unpause in the Pause card, then re-run execute."],
    action_limit_exceeded: ["This task has more actions than the policy allows.", "blocked", "Split the task, or raise the limit through a policy promote."],
    task_budget_exceeded: ["This action would push the task over its cost budget.", "blocked", "Raise the budget through a policy promote, or cancel the task."],
    retries_exhausted: ["This action has used all its retries.", "blocked", "Reconcile the action with evidence, or cancel it."],
    tool_requires_approval: ["This tool always needs a person's yes.", "waiting", "Approve or reject it in the Approvals queue."],
    risk_requires_approval: ["The task's risk score is at or above the approval threshold.", "waiting", "Approve or reject it, or guide the task to lower the risk."],
    band_provisional: ["The routing band is not calibrated yet, so a person must approve.", "waiting", "Approve or reject it; calibration is still pending."],
    band_calibration_unknown: ["The routing band has no calibration status.", "blocked", "Fix the band in the policy."],
    target_not_declared: ["The route target is not declared in the policy.", "blocked", "Guide the task to a declared target."],
    band_not_found: ["The routing band does not exist in the policy.", "blocked", "Guide the task to an existing band."],
    target_band_mismatch: ["The routing band belongs to a different target.", "blocked", "Guide the task to a matching band."],
    approval_not_approved: ["The approval is not in the approved state.", "waiting", "Approve it in the Approvals queue."],
    approval_actor_missing: ["The approval has no named approver.", "waiting", "Approve it again with a name."],
    approval_expired: ["The approval window ran out before dispatch.", "waiting", "Submit the task again for a fresh approval."],
    approval_stale_policy: ["The policy changed after this approval, so it no longer applies.", "waiting", "Approve again under the current policy."],
    approval_payload_mismatch: ["The action body changed after it was approved.", "waiting", "Review the new body and approve it."],
    approval_policy_version_mismatch: ["The approval was made under an older policy, so it was superseded.", "waiting", "Submit the task again."],
    guard_flagged: ["A safety guard flagged this task for a person to review.", "waiting", "Review the task, then approve, reject, or guide it."],
    gate_blocked: ["The gate blocked this task before anything ran.", "blocked", "Read the gate reasons, fix the cause, and submit a new task."],
    no_actions_proposed: ["The decision proposed no actions, so there was nothing to run.", "blocked", "Guide the task if an action was expected."],
    policy_unreadable: ["The policy could not be read, so the run stopped (fail closed).", "failed", "Check the policy and re-run."],
    approval_rejected: ["A person rejected the proposed action.", "blocked", "Submit a new task if the work is still wanted."],
    approval_superseded: ["The proposal changed, so this approval was superseded.", "waiting", "Review the current proposal."],
  },
  skip: {
    pause_active: ["Skipped: operators have paused dispatch.", "blocked", "Unpause in the Pause card, then re-run execute."],
    not_gate_allowed: ["Not sent: the gate does not allow it and no valid approval exists.", "waiting", "Approve or reject it in the Approvals queue."],
    already_dispatched: ["Not sent again: this action was already sent once.", "info", "Verify it, or reconcile with the provider's record if its outcome is unknown."],
    approval_required: ["Refused before sending: the action was not approved.", "blocked", "Approve it first."],
    tool_not_declared: ["Refused before sending: the policy does not declare this tool.", "blocked", "Fix the policy, or guide the task."],
    credential_host_mismatch: ["Refused: the stored credential does not match this host.", "blocked", "Fix the connection or the target host."],
    credential_unavailable: ["Refused: the credential for this tool is not available.", "blocked", "Connect the service, then re-run."],
    target_credential_missing: ["Refused: the credential for this target is missing.", "blocked", "Connect the service, then re-run."],
    target_unresolvable: ["Refused: the route target has no endpoint.", "blocked", "Fix the policy's endpoint map."],
    target_payload_invalid: ["Refused: the payload for this target is invalid.", "blocked", "Guide the task to a valid payload."],
    target_payload_required: ["Refused: this target needs payload text that was not provided.", "blocked", "Guide the task to include it."],
    bad_model_route: ["Refused: the model route is not allowed.", "blocked", "Fix the routing policy."],
    band_provisional: ["Not sent: the routing band is not calibrated yet.", "waiting", "Approve or reject it; calibration is pending."],
    blocked_by_preflight: ["Not sent: the provider failed its preflight check.", "blocked", "Check the provider's health, then re-run."],
    searxng_preflight_failed: ["Not sent: the search service failed its health check.", "failed", "Check the search service, then re-run."],
    matrix_too_small: ["Not sent: too few documents to audit.", "blocked", "Add documents to the corpus folder."],
    create_outcome_unknown: ["Sent, but the sandbox creation outcome is unknown.", "unknown", "Reconcile with the provider's sandbox list. Do not blindly retry."],
    dig_outcome_unknown: ["Sent, but the search outcome is unknown.", "unknown", "Re-verify or reconcile. Do not count it as done."],
    orphan_sandbox: ["A sandbox may exist without a record.", "unknown", "Check the provider and clean up any orphan."],
    invalid_action_url: ["Refused before sending: the URL is not allowed for this tool.", "blocked", "Guide the task to a permitted URL."],
    invalid_action_method: ["Refused before sending: the HTTP method is not allowed.", "blocked", "Guide the task to an allowed method."],
    invalid_action_path: ["Refused before sending: the URL path is not allowed.", "blocked", "Guide the task to an allowed path."],
    command_not_allowlisted: ["Refused before sending: the command is not on the allowlist.", "blocked", "Guide the task to an allowed command."],
    snapshot_not_allowlisted: ["Refused before sending: the sandbox snapshot is not allowed.", "blocked", "Use an allowed snapshot."],
    timeout_invalid: ["Refused before sending: the timeout is out of range.", "blocked", "Set a valid timeout."],
  },
  verdict: {
    verified_success: ["Confirmed success", "ok", "The provider's evidence matches the expected result.", "None."],
    confirmed_failure: ["Confirmed failure", "failed", "The evidence shows the action did not do what it should.", "Retry only if the tool is safe to repeat; otherwise reconcile with the provider's record."],
    unknown: ["Unknown", "unknown", "Not proven either way: there is not enough evidence yet.", "Check the verify evidence and the provider's record. Do not count it as done."],
    refused: ["Refused", "info", "The action was already final, so it was not re-verified.", "None."],
  },
  verdict_reason: {
    create_outcome_unknown: ["The sandbox creation outcome is unknown.", "unknown", "Reconcile with the provider's sandbox list."],
    incomplete_dispatch_outcome: ["The dispatch outcome was only partly recorded.", "unknown", "Reconcile with the provider's record."],
    stdout_not_recorded: ["The sandbox output was not recorded, so it cannot be checked.", "unknown", "Reconcile with the provider."],
    stdout_missing_literal: ["The expected text was missing from the sandbox output.", "failed", "Check the command output; retry only if safe."],
    resend_non_2xx: ["The email provider rejected the send.", "failed", "Fix the provider error before any re-send."],
    resend_2xx_no_id: ["The email provider accepted it but returned no id, so delivery is unproven.", "unknown", "Confirm delivery in the provider dashboard."],
    not_terminal: ["The task has not finished, so there is no final outcome yet.", "waiting", "Wait, or continue the task."],
    no_dispatch_outcome: ["No dispatch record exists to check.", "unknown", "Reconcile with evidence."],
    events_unreadable: ["The event log could not be read.", "unknown", "Verify again once the log is readable."],
  },
  terminal: {
    succeeded: ["Succeeded", "ok", "Done: every action was verified as successful.", "None."],
    blocked: ["Blocked", "blocked", "Stopped before anything ran: the gate blocked it.", "Read the gate reason, fix the cause, then submit a new task."],
    rejected: ["Rejected", "blocked", "Closed without running: a person rejected it, or it proposed no actions.", "Submit a new task if the work is still wanted."],
    expired: ["Expired", "waiting", "Closed without running: no one decided before the approval expired.", "Submit the task again to get a fresh approval."],
    failed: ["Failed", "failed", "Stopped by an error or a configuration problem.", "Read the events for the stage named in the reason, fix it, then retry."],
    cancelled: ["Cancelled", "info", "Cancelled by an operator.", "None."],
  },
};

// Families match by pattern when no exact entry exists. A function entry receives the regex match.
const JEV_FAMILIES = [
  [/^policy_invalid/, ["The policy document failed validation.", "blocked", "Fix the policy JSON and promote it again."]],
  [/^gate_blocked/, ["Re-check blocked this action at dispatch time, so nothing was sent.", "blocked", "Read the gate reasons, fix the cause, or guide the task."]],
  [/^state_/, ["Skipped: this action is no longer waiting to be sent.", "info", "None; the action's own recorded state applies."]],
  [/_http_(\d{3})$/, (m) => [`The provider answered HTTP ${m[1]}; nothing was confirmed.`, "blocked", "Check the provider status and credentials. Retry only if the tool is safe to repeat."]],
];

const JEV_GATE_OUTCOME = { allowed: "Allowed", needs_approval: "Needs approval", blocked: "Blocked", guard_flagged: "Flagged by safety guard" };
const JEV_STATE = { awaiting_approval: "Waiting for approval", gated: "Gate checked", decided: "Decided" };
const JEV_APPROVAL_STATUS = {
  pending: ["Waiting for a decision", "waiting"],
  approved: ["Approved", "ok"],
  rejected: ["Rejected", "blocked"],
  expired: ["Expired before a decision", "waiting"],
  superseded: ["Superseded", "waiting"],
};
const JEV_EXECUTION = {
  dispatched: { parts: ["executed", "awaiting verification"], severity: "waiting" },
  verified: { parts: ["executed", "verified"], severity: "ok" },
  failed: { parts: ["executed", "verification failed"], severity: "failed" },
  unverified: { parts: ["executed", "outcome unknown"], severity: "unknown" },
  skipped_paused: { parts: ["not executed", "paused"], severity: "blocked" },
  blocked_recheck: { parts: ["not executed", "blocked at re-check"], severity: "blocked" },
  skipped_other: { parts: ["not executed", "skipped"], severity: "blocked" },
};
const JEV_SUPERSEDE_REASON = {
  policy_version_changed: "the policy changed after approval",
  payload_changed: "the action body changed after approval",
  superseded_by_guidance: "replaced by new guidance",
};

function jevLabel(table, code) {
  const key = code == null ? "" : String(code);
  const colon = key.indexOf(":");
  const detail = colon > 0 ? key.slice(colon + 1).trim() : null;
  const hit = (JEV_LABELS[table] || {})[key];
  if (hit) return { code: key, text: hit[0], severity: hit[1], next: hit[2], detail, known: true };
  for (const [re, val] of JEV_FAMILIES) {
    const m = key.match(re);
    if (m) {
      const v = typeof val === "function" ? val(m) : val;
      return { code: key, text: v[0], severity: v[1], next: v[2], detail, known: true };
    }
  }
  return { code: key, text: key.replace(/_/g, " "), severity: "info", next: "Open the raw event in the task log for the full detail.", detail, known: false };
}

function jevFour(table, code) {
  const key = String(code == null ? "" : code);
  const row = (JEV_LABELS[table] || {})[key];
  if (!row) return { code: key, short: key.replace(/_/g, " "), severity: "info", text: "No label is recorded for this state.", next: "Open the raw event in the task log.", known: false };
  return { code: key, short: row[0], severity: row[1], text: row[2], next: row[3], known: true };
}

function jevParse(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// "04:12 PT" when the instant is on the same Pacific day as nowMs, else "Oct 9, 04:12 PT".
function jevFmtPT(iso, nowMs) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = { timeZone: "America/Los_Angeles" };
  const hm = new Intl.DateTimeFormat("en-US", { ...tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const dayKey = (x) => new Intl.DateTimeFormat("en-CA", { ...tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const sameDay = !Number.isFinite(nowMs) || dayKey(d) === dayKey(new Date(nowMs));
  const md = new Intl.DateTimeFormat("en-US", { ...tz, month: "short", day: "numeric" }).format(d);
  return (sameDay ? "" : md + ", ") + hm + " PT";
}

function jevEventLabel(ev, d) {
  const who = (x) => (x ? String(x) : "unrecorded");
  switch (ev.kind) {
    case "task_created": return { label: "Task received", severity: "info", detail: "" };
    case "understood": return { label: "Request understood", severity: "info", detail: "" };
    case "decided":
      if (d.source === "human_guide") return { label: `Guidance added by ${who(d.guidance_by)}`, severity: "info", detail: String(d.guidance || "") };
      return { label: "Decision recorded", severity: "info", detail: "" };
    case "gate_decision": {
      const o = d.outcome || "unknown";
      const sev = o === "blocked" ? "blocked" : o === "needs_approval" ? "waiting" : o === "allowed" ? "ok" : "info";
      const reasons = Array.isArray(d.reasons) ? d.reasons : [];
      return { label: `Gate: ${JEV_GATE_OUTCOME[o] || o}`, severity: sev, detail: reasons.map((r) => jevLabel("gate", r).text).join(" ") };
    }
    case "approval_granted":
      return { label: `Approved by ${who(d.actor)}`, severity: "ok", detail: `via ${who(d.via)}${d.gate_outcome ? " · re-check: " + d.gate_outcome : ""}` };
    case "approval_rejected": return { label: `Rejected by ${who(d.actor)}`, severity: "blocked", detail: String(d.reason || "") };
    case "approval_expired": return { label: "Approval expired before a decision", severity: "waiting", detail: "" };
    case "approval_superseded": return { label: "Approval superseded", severity: "waiting", detail: JEV_SUPERSEDE_REASON[d.reason] || String(d.reason || "") };
    case "dispatch": return { label: `Sent to ${d.target || d.tool || "provider"}`, severity: "info", detail: "" };
    case "dispatch_blocked": return { label: "Not sent", severity: "blocked", detail: d.reason ? jevLabel("skip", d.reason).text : "" };
    case "dispatch_unknown": return { label: "Sent; outcome unknown", severity: "unknown", detail: d.reason ? jevLabel("skip", d.reason).text : "The provider's answer was not recorded." };
    case "dispatch_failed": return { label: "Failed before sending", severity: "failed", detail: d.reason ? jevLabel("skip", d.reason).text : "" };
    case "verify_result": {
      const v = jevFour("verdict", d.verdict || "unknown");
      return { label: `Verified: ${v.short}`, severity: v.severity, detail: v.text };
    }
    case "reconcile": return { label: "Reconciled with evidence", severity: "info", detail: String(d.observed || "") };
    case "retry": return { label: "Retry", severity: "info", detail: String(d.reason || "") };
    case "terminal": {
      const row = jevFour("terminal", d.outcome || d.terminal_outcome || "");
      return { label: `Closed: ${row.short}`, severity: row.severity, detail: row.known ? row.text : String(d.reason || "") };
    }
    case "pause_changed":
      return { label: `Pause ${d.paused ? "on" : "off"} (${d.scope || "all"})`, severity: "info", detail: d.actor ? `by ${d.actor}` : "No actor recorded for this change." };
    case "policy_changed":
      return { label: `Policy promoted${ev.policy_version ? " to v" + ev.policy_version : ""}`, severity: "info", detail: String(d.summary || "") };
    default:
      return { label: String(ev.kind || "event").replace(/_/g, " "), severity: "info", detail: "" };
  }
}

function jevTimeline(events, nowMs) {
  return (Array.isArray(events) ? events : []).map((ev) => {
    const x = jevEventLabel(ev, jevParse(ev.data_json) || {});
    return {
      id: ev.id, kind: ev.kind, at: ev.created_at, at_pt: jevFmtPT(ev.created_at, nowMs),
      action_id: ev.action_id ?? null, label: x.label, severity: x.severity, detail: x.detail,
    };
  });
}

// One approval as the console reads it. Raw columns stay on the row; `view` holds
// every derived string so the console never maps codes or formats times itself.
function jevApprovalView(ap, nowMs, events) {
  const mine = (Array.isArray(events) ? events : []).filter((e) => e && e.action_id === ap.action_id);
  // Why it was gated: the last gate decision that asked for approval on this action.
  let reasons = [];
  for (let i = mine.length - 1; i >= 0 && !reasons.length; i--) {
    const d = jevParse(mine[i].data_json) || {};
    if (mine[i].kind === "gate_decision" && d.outcome === "needs_approval" && Array.isArray(d.reasons)) reasons = d.reasons;
  }
  const why = reasons.map((r) => jevLabel("gate", r));
  const supEv = [...mine].reverse().find((e) => e.kind === "approval_superseded");
  const supCode = supEv ? (jevParse(supEv.data_json) || {}).reason : null;
  const status = JEV_APPROVAL_STATUS[ap.status] || [String(ap.status || "unknown"), "info"];
  const exp = Date.parse(ap.expires_at);
  const expMs = Number.isFinite(exp) && Number.isFinite(nowMs) ? exp - nowMs : null;
  const expText = expMs === null ? null : expMs <= 0 ? "expired"
    : `expires in ${Math.floor(expMs / 3600000)}h ${Math.floor((expMs % 3600000) / 60000)}m`;
  const exec = ap.execution_result ? (JEV_EXECUTION[ap.execution_result] || null) : null;
  const header = [];
  if (ap.status === "approved") {
    header.push(`Approved by ${ap.approved_by || "unrecorded"}`);
    const at = jevFmtPT(ap.approved_at, nowMs);
    if (at) header.push(at);
    header.push(`via ${ap.approved_via || "unrecorded"}`);
    header.push(...(exec ? exec.parts : ["not yet executed"]));
  } else if (ap.status === "rejected") {
    header.push(`Rejected by ${ap.rejected_by || ap.decided_by || "unrecorded"}`);
    const at = jevFmtPT(ap.rejected_at || ap.decided_at, nowMs);
    if (at) header.push(at);
  } else if (ap.status === "pending") {
    header.push("Awaiting approval");
    if (expText) header.push(expText);
  } else {
    header.push(status[0]);
    if (exec) header.push(...exec.parts);
  }
  const reCheck = jevParse(ap.gate_reasons_at_approve_json);
  return {
    header,
    status: ap.status,
    status_label: status[0],
    status_severity: status[1],
    binding: {
      target: ap.target, policy_version: ap.policy_version, payload_hash: ap.payload_hash,
      payload_hash_short: String(ap.payload_hash || "").slice(0, 12),
    },
    why_gated: {
      text: why.length ? why.map((w) => w.text).join(" ") : "Gated by the policy (no reason was recorded).",
      reasons: why,
      next: why.length ? why[0].next : null,
    },
    approved_by: ap.approved_by ?? null,
    approved_via: ap.approved_via ?? null,
    approved_at_pt: jevFmtPT(ap.approved_at, nowMs),
    gate_at_approve: {
      outcome: ap.gate_outcome_at_approve ?? null,
      reasons: (Array.isArray(reCheck) ? reCheck : []).map((r) => jevLabel("gate", r)),
    },
    rejected_by: ap.rejected_by ?? ap.decided_by ?? null,
    rejection_reason: ap.rejection_reason ?? ap.note ?? null,
    executed_by: ap.executed_by ?? null,
    executed_at_pt: jevFmtPT(ap.executed_at, nowMs),
    execution_result: ap.execution_result ?? null,
    execution_parts: exec ? exec.parts : [],
    execution_severity: exec ? exec.severity : null,
    superseded_reason: supCode ? (JEV_SUPERSEDE_REASON[supCode] || String(supCode)) : null,
    expires_at: ap.expires_at ?? null,
    expires_in_ms: expMs,
    expires_in_text: expText,
  };
}

// Task row for the console: labels for state, terminal outcome, gate and gate reasons.
function jevTaskView(t) {
  if (!t) return t;
  const st = String(t.state || "");
  const outcome = st.indexOf("terminal:") === 0 ? st.slice("terminal:".length) : (t.terminal_outcome || null);
  const term = outcome ? jevFour("terminal", outcome) : null;
  const gate = jevParse(t.gate_reasons_json);
  return {
    ...t,
    state_label: term ? term.short : (JEV_STATE[st] || st.replace(/_/g, " ")),
    terminal_label: term ? term.short : null,
    terminal_text: t.terminal_reason === "no_actions_proposed"
      ? "No tool matched this prompt, so nothing ran. Name a tool (github, searxng, resend) or use the matching diagnostic tab."
      : (term && term.known ? term.text : null),
    gate_label: t.gate_outcome ? (JEV_GATE_OUTCOME[t.gate_outcome] || t.gate_outcome) : null,
    gate_reasons: (Array.isArray(gate) ? gate : []).map((r) => jevLabel("gate", r)),
  };
}

// Approver allowlist (T5). The list is policy.doc.approvers when the policy carries that field; otherwise the
// built-in default ["jenny"]. A present but malformed list (not an array of non-empty strings, or empty) fails
// closed: nobody is an approver. Enforced on both approve and reject, before any approval lookup.
const DEFAULT_APPROVERS = Object.freeze(["jenny", "ermine"]);
async function jevApproverCheck(deps, env, actor) {
  const pol = await deps.loadPolicy(env);
  const doc = pol && pol.doc && typeof pol.doc === "object" ? pol.doc : null;
  let list = DEFAULT_APPROVERS;
  if (doc && doc.approvers !== undefined) {
    list = Array.isArray(doc.approvers) && doc.approvers.every((n) => typeof n === "string" && n.trim() !== "") ? doc.approvers : [];
  }
  const want = String(actor).trim().toLowerCase();
  if (list.some((n) => String(n).trim().toLowerCase() === want)) return { ok: true, enforced: true, message: "" };
  return { ok: false, enforced: true, message: `actor "${String(actor).trim()}" is not on the approvers list` };
}

// Which execution_result a skip writes. Skips that say nothing new (already sent,
// action already past proposed) return null, so an earlier result is never overwritten.
function executionResultOfSkip(reason) {
  const r = String(reason || "");
  if (r === "pause_active") return "skipped_paused";
  if (r.indexOf("gate_blocked") === 0) return "blocked_recheck";
  if (r === "already_dispatched" || r.indexOf("state_") === 0) return null;
  return "skipped_other";
}

// Mirrors one action's execution outcome onto its approval row. Never throws into
// the dispatch path: the task event log stays the authoritative record.
async function recordExecution(deps, actionId, fields) {
  try {
    await deps.dbx.setApprovalExecutionForAction(actionId, fields);
  } catch (e) {
    console.error("approval-meta execution mirror failed", actionId, String((e && e.message) || e));
  }
}
// ---- approval-meta: plain-language labels and serializers (END) -----------

async function readJson(req) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > BODY_MAX) return { error: "BODY_TOO_LARGE" };
  const text = await req.text();
  if (text.length > BODY_MAX) return { error: "BODY_TOO_LARGE" };
  if (!text) return { error: "INVALID_BODY" };
  let body;
  try { body = JSON.parse(text); } catch { return { error: "INVALID_JSON" }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "INVALID_BODY" };
  return { body };
}

// Constant-time comparison: length fold + char-wise XOR (SPEC §3).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function authorized(req, env) {
  if (!env.JEV_API_KEY) return { notConfigured: true };
  const expected = await env.JEV_API_KEY.get();
  if (!expected) return { notConfigured: true };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return { unauthorized: true };
  return { ok: true };
}

function parseLimit(url) {
  const n = parseInt(url.searchParams.get("limit") || "50", 10);
  return Math.min(Math.max(isNaN(n) ? 50 : n, 1), 200);
}
function isTerminalOf(deps, task) {
  if (deps.isTerminal) return deps.isTerminal(task);
  return TERMINAL_OUTCOMES.some((o) => task.state === `terminal:${o}` || task.terminal_outcome === o);
}

// ---- shared dep bundles handed to review/improve modules --------------------
// loadPolicy hits KV and is therefore async (the integrator's wiring returns a
// promise) — these builders are async and every call site awaits them.
async function reviewDeps(deps, env) {
  const pol = await deps.loadPolicy(env);
  const doc = pol && !pol.error ? pol.doc : null;
  return {
    dbx: deps.dbx, helpers: deps.helpers, appendEvent: deps.appendEvent,
    getTask: deps.getTask, getAction: deps.getAction, transit: deps.transit,
    closeTask: deps.closeTask, isTerminal: deps.isTerminal, TERMINAL_STATES: deps.TERMINAL_STATES,
    currentPolicy: doc,
    // ROOT CAUSE (2026-10-01, Jenny report on t_4595c2d0a86beca1): this adapter
    // used to pass an EMPTY approvals array, so the approve-time gate re-run
    // always saw "no approval on file" and returned needs_approval forever —
    // console-approved tasks never attempted dispatch. Forward the just-approved
    // binding (jev-review passes it with status/actor bound) into the gate.
    gateActionRerun: ({ task, action, approval }) =>
      deps.gateAction(doc, task, action, approval ? [approval] : [], deps.helpers.now()),
  };
}
async function improveDeps(deps, env) {
  const pol = await deps.loadPolicy(env);
  const doc = pol && !pol.error ? pol.doc : null;
  return {
    dbx: deps.dbx, helpers: deps.helpers, appendEvent: deps.appendEvent,
    validatePolicyDoc: deps.validatePolicyDoc,
    currentVersion: doc ? Number(doc.version) || 0 : 0,
    expireApprovalsBelow: async (newVersion) => {
      const pending = await deps.dbx.listApprovals({ status: "pending" });
      let n = 0;
      for (const ap of pending) {
        if (Number(ap.policy_version) >= newVersion) continue;
        await deps.dbx.updateApproval(ap.id, { status: "expired" });
        await deps.appendEvent(deps.dbx, {
          task_id: ap.task_id, action_id: ap.action_id, kind: "approval_expired",
          data: { approval_id: ap.id, reason: "policy_version_changed" }, policy_version: ap.policy_version,
        });
        n++;
      }
      return n;
    },
  };
}

// ---- POST /api/jev/tasks pipeline (SPEC §7) ---------------------------------
async function runPipeline(env, deps, body) {
  const { dbx, helpers } = deps;
  const { task, duplicate } = await deps.ingestTask(dbx, body, helpers);
  if (duplicate) return { status: 200, out: { task, duplicate: true, actions: [], approvals: [] } };
  const pol = await deps.loadPolicy(env);
  if (!pol || pol.error) {
    await deps.closeTask(dbx, task, "blocked", "policy_unreadable");
    const t = await deps.getTask(dbx, task.id);
    return { status: 200, out: { task: t, actions: [], approvals: [], policy_error: (pol && pol.error) || "policy_unreadable" } };
  }
  const intent = await deps.understand(env, pol.doc, task);
  let consumedCost = intent && Number.isFinite(Number(intent.consumed)) ? Number(intent.consumed) : 0;
  let t = await deps.transit(dbx, task, "understood", { intent_available: !(intent && intent.unavailable) });
  await dbx.updateTask(t.id, { intent_json: JSON.stringify(intent ?? { unavailable: true }) });
  // decideActions returns either a plain array of proposed actions (some lanes /
  // test stubs) or the lane-B wrapper { actions, decided_via, consumed }.
  //
  // LANE-D AUTOMATIONS ADDITION (SPEC-AUTOMATIONS §6 prompt intake): when the
  // task body carries a non-empty payload.prompt and NO caller-supplied
  // payload.actions, the decide stage routes through
  // deps.decideActionsFromPrompt(env, pol.doc, t) instead (one 70b Llama call;
  // returned proposals still pass the SAME validation + deterministic gate).
  // chooseDecideSource lives in routes-automations.js (exported + unit-tested).
  // Guard: if the dep isn't wired (typeof check), fall back to the legacy
  // decideActions path so the route keeps working pre-integration.
  const decideSource = chooseDecideSource(body);
  // Decide-stage validation errors (e.g. resend.send body contract, 2026-10-02)
  // must surface as 422 INVALID_ACTION with the task closed `rejected`, never a
  // 500 uncaught that orphans the task in `understood`.
  let decidedRaw;
  try {
    if (decideSource === "prompt" && typeof deps.decideActionsFromPrompt === "function") {
      // SPEC-STYLE-ROUTER Part B (Lane B): bind the router's selectForPrompt
      // over the master deps for the prompt-intake decide path. An integrator
      // wired deps.selectForPrompt (module signature
      // (env, deps, promptText, opts)) wins; otherwise the router module is
      // imported DYNAMICALLY here (the same lazy pattern buildRouterDeps uses
      // for jev-corpus-routes) so no static import cycle is created with
      // jev-router's runPipeline import. Unavailable -> undefined -> the
      // decide stage keeps the legacy 70b draft flow (fail-closed fallback).
      let routerSelectForPrompt;
      try {
        const sel = typeof deps.selectForPrompt === "function"
          ? deps.selectForPrompt
          : (await import("./jev-router.js")).selectForPrompt;
        if (typeof sel === "function") routerSelectForPrompt = (promptText, opts) => sel(env, deps, promptText, opts);
      } catch { routerSelectForPrompt = undefined; }
      decidedRaw = (await deps.decideActionsFromPrompt(env, pol.doc, t, { selectForPrompt: routerSelectForPrompt })) || [];
    } else {
      decidedRaw = (await deps.decideActions(env, pol.doc, t, intent)) || [];
    }
  } catch (e) {
    const reason = "decide_rejected_action: " + String((e && e.message) || e).slice(0, 180);
    try { await deps.closeTask(dbx, t, "rejected", reason); } catch {}
    return { status: 422, out: { error: "INVALID_ACTION", message: String((e && e.message) || e) } };
  }
  // WAVE 2 LANE F: a prompt naming two different policy tools is refused with a
  // clear error instead of a guess. The task closes `rejected` before any
  // action is proposed, the same way a decide-stage validation error does.
  if (decideSource === "prompt" && decidedRaw && !Array.isArray(decidedRaw) && decidedRaw.reason === "ambiguous_tool") {
    const candidates = Array.isArray(decidedRaw.matched_tools) ? decidedRaw.matched_tools.slice(0, 8) : [];
    try { await deps.closeTask(dbx, t, "rejected", "ambiguous_tool: " + candidates.join(", ")); } catch {}
    return {
      status: 422,
      out: {
        error: { code: "ambiguous_tool", message: "prompt names more than one policy tool; name exactly one", candidates },
      },
    };
  }
  // WAVE 2 LANE F: a name-matched decision is recorded in the intent JSON
  // (decided_via 'name_match:<tool>' + the matched alias). Best-effort metadata.
  if (decideSource === "prompt" && decidedRaw && !Array.isArray(decidedRaw) && decidedRaw.name_match !== undefined) {
    try {
      const ij = (intent && typeof intent === "object" && !Array.isArray(intent)) ? intent : {};
      await dbx.updateTask(t.id, { intent_json: JSON.stringify({ ...ij, decided_via: decidedRaw.decided_via, name_match: decidedRaw.name_match, ...(decidedRaw.args_repaired === true ? { args_repaired: true } : {}) }) });
    } catch { /* routing metadata is best-effort */ }
  }
  // SPEC-STYLE-ROUTER Part B (Lane B): persist the routing decision INSIDE
  // the existing intent_json (a `router` key — NO new column, no schema
  // change). Only the prompt path carries a router key; decide-stage guard
  // failures (no_prompt / no_tools_in_policy) carry none, truthfully. The
  // write is best-effort: a metadata failure must never break intake.
  if (decideSource === "prompt" && !Array.isArray(decidedRaw) && decidedRaw && typeof decidedRaw === "object" && decidedRaw.router !== undefined) {
    try {
      const ij = (intent && typeof intent === "object" && !Array.isArray(intent)) ? intent : {};
      await dbx.updateTask(t.id, { intent_json: JSON.stringify({ ...ij, router: decidedRaw.router }) });
    } catch { /* routing metadata is best-effort */ }
  }
  const proposed = Array.isArray(decidedRaw) ? decidedRaw : (Array.isArray(decidedRaw.actions) ? decidedRaw.actions : []);
  if (!Array.isArray(decidedRaw) && decidedRaw && Number.isFinite(Number(decidedRaw.consumed))) {
    consumedCost += Number(decidedRaw.consumed);
  }
  const actions = [];
  for (let i = 0; i < proposed.length; i++) {
    const a = proposed[i];
    const row = {
      id: helpers.newId("a_"), task_id: t.id, seq: i + 1,
      tool: String(a.tool || "http.fetch"), method: String(a.method || "GET").toUpperCase(),
      url: String(a.url || ""), headers_json: a.headers ? JSON.stringify(a.headers) : null,
      body_json: a.body != null ? (typeof a.body === "string" ? a.body : JSON.stringify(a.body)) : null,
      expected_json: a.expected ? JSON.stringify(a.expected) : null,
      stable_id: `jev-${t.id}-${i + 1}`, state: "proposed", provider_ref: null, attempts: 0,
      created_at: helpers.now(), dispatched_at: null,
    };
    await dbx.insertAction(row);
    actions.push(row);
  }
  t = await deps.transit(dbx, t, "decided", { proposed: actions.length });
  const decisionPatch = { decision_json: JSON.stringify({
    actions: proposed,
    decided_via: Array.isArray(decidedRaw) ? "caller" : (decidedRaw.decided_via || null),
    reason: !Array.isArray(decidedRaw) ? decidedRaw.reason : undefined,
    raw_preview: !Array.isArray(decidedRaw) ? decidedRaw.raw_preview : undefined,
    dropped: (!Array.isArray(decidedRaw) && Array.isArray(decidedRaw.dropped) && decidedRaw.dropped.length) ? decidedRaw.dropped : undefined,
    intent,
  }) };
  // SPEC §7 step 3: record the decide-stage cost (consumed) onto the task.
  if (consumedCost > 0) decisionPatch.cost_usd = (Number(t.cost_usd) || 0) + consumedCost;
  // LANE-D AUTOMATIONS ADDITION (SPEC-AUTOMATIONS §2/§6): account the decide
  // stage's LLM neurons onto the task's llm_neurons column (lane-A addition).
  // The wrapper form carries `neurons` (array form carries none → 0). Guarded:
  // the patch is only applied when the task row actually HAS the column, so
  // the route keeps working against a schema that predates the migration.
  if (!Array.isArray(decidedRaw) && decidedRaw && Number.isFinite(Number(decidedRaw.neurons)) && t && typeof t.llm_neurons !== "undefined") {
    decisionPatch.llm_neurons = (Number(t.llm_neurons) || 0) + Number(decidedRaw.neurons);
  }
  await dbx.updateTask(t.id, decisionPatch);
  // WAVE 2 LANE H (QA fix 2026-10-09): a decision that proposes ZERO actions is
  // a terminal rejection, never a gate. The empty gate loop below used to fall
  // through to `gated` with gate_outcome "allowed" and no terminal outcome, which
  // read as a clean pass. The decide reason is recorded as an event and the
  // terminal reason is "no_actions_proposed". A decision with one or more
  // actions skips this block and takes the gate path unchanged.
  if (actions.length === 0) {
    await deps.appendEvent(dbx, {
      task_id: t.id, kind: "no_actions_proposed",
      data: {
        decided_via: Array.isArray(decidedRaw) ? "caller" : (decidedRaw.decided_via || null),
        reason: Array.isArray(decidedRaw) ? null : (decidedRaw.reason || null),
      },
      policy_version: String(pol.doc.version),
    });
    await deps.closeTask(dbx, t, "rejected", "no_actions_proposed");
    t = await deps.getTask(dbx, t.id);
    return { status: 201, out: { task: t, actions, approvals: [], intent } };
  }
  // Gate each proposed action (deterministic, fail-closed). Worst-of across actions.
  let worst = "allowed";
  const reasons = [];
  const approvals = [];
  for (const a of actions) {
    const g = await deps.gateAction(pol.doc, t, a, approvals, helpers.now());
    const outcome = g && g.outcome ? g.outcome : "blocked";
    const greasons = (g && g.reasons) || [];
    await deps.appendEvent(dbx, {
      task_id: t.id, action_id: a.id, kind: "gate_decision",
      data: { action_id: a.id, outcome, reasons: greasons }, policy_version: String(pol.doc.version),
    });
    if (outcome === "needs_approval") approvals.push(await deps.createApproval(dbx, t, a, pol.doc, helpers));
    if ((GATE_RANK[outcome] ?? 2) > GATE_RANK[worst]) worst = outcome;
    for (const r of greasons) if (!reasons.includes(r)) reasons.push(r);
  }
  t = await deps.transit(dbx, t, "gated", { gate_outcome: worst });
  await dbx.updateTask(t.id, { gate_outcome: worst, gate_reasons_json: JSON.stringify(reasons) });
  t = await deps.getTask(dbx, t.id); // re-fetch so the response carries the recorded gate columns
  if (worst === "blocked" && pol.doc.blocked_action !== "park") {
    await deps.closeTask(dbx, t, "blocked", "gate_blocked");
    t = await deps.getTask(dbx, t.id);
  }
  return { status: 201, out: { task: t, actions, approvals, intent } };
}

// ---- POST /api/jev/tasks/:id/execute (SPEC §9 eligibility + §7 second check) --
// SPEC §9: only actions whose gate is currently allowed — or that carry an
// approval which re-passed the gate at approve time — may dispatch, and the
// pause re-check happens at dispatch time. The task row only stores the
// worst-of gate_outcome, so each action is re-gated here against CURRENT
// policy right before dispatch (SPEC §8: the gate always records a
// gate_decision event). Pause-blocked actions skip with reason `pause_active`.
// QA 2026-10-10: a prompt-intake task whose gate says allowed (no human approval needed) must run,
// not stall at "Gate: Allowed / outcome still open". Same leg as the approve auto-dispatch:
// execute the proposed actions, verify each dispatched one, then continue. Approval-gated actions
// stay gated (the gate decides); this only runs when the stored gate outcome is allowed.
async function autoRunAllowedPrompt(env, deps, taskId, body) {
  if (!body || !body.payload || typeof body.payload.prompt !== "string" || !body.payload.prompt.trim()) return null;
  if (typeof deps.dispatchAction !== "function" || typeof deps.verifyAction !== "function") return null;
  const task = await deps.dbx.getTask(taskId);
  if (!task || task.gate_outcome !== "allowed") return null;
  const ids = (await deps.dbx.listActions(taskId)).filter((a) => a.state === "proposed").map((a) => a.id);
  if (!ids.length) return null;
  try {
    const ex = await runExecute(env, deps, task, { action_ids: ids, executed_by: "auto-run:prompt" });
    const exBody = await ex.json();
    const verified = [];
    for (const d of ((exBody && exBody.dispatched) || [])) {
      const fresh = await deps.dbx.getTask(taskId);
      const acts = await deps.dbx.listActions(taskId);
      const a = acts.find((x) => x.id === d.action_id);
      if (!a) continue;
      const v = await deps.verifyAction(env, deps.dbx, fresh, a);
      verified.push({ action_id: d.action_id, verdict: v && v.verdict });
    }
    if (typeof deps.continueTask === "function") {
      const fresh2 = await deps.dbx.getTask(taskId);
      const c = await deps.continueTask(env, deps.dbx, fresh2);
      return { execute: exBody, verified, next: c && c.next };
    }
    return { execute: exBody, verified };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

async function runExecute(env, deps, task, body) {
  const pol = await deps.loadPolicy(env);
  if (!pol || pol.error) return err("POLICY_UNREADABLE", "policy failed to load; refusing to dispatch (fail closed)", 503);
  const nowIso = deps.helpers.now();
  const curVersion = pol.doc && pol.doc.version != null ? String(pol.doc.version) : null;
  const approvals = await deps.dbx.listApprovals({ taskId: task.id });
  const hasValidApproval = (a) => approvals.some((p) => p.action_id === a.id && p.status === "approved"
    && Date.parse(p.expires_at) > Date.parse(nowIso)
    && (curVersion == null || p.policy_version === curVersion));
  // approval-meta: attribute this execution. Auto-redispatch passes
  // "auto-redispatch:<approver>"; a bare /execute passes its actor; otherwise the
  // record says "unattributed" rather than staying blank.
  const executedBy = typeof body.executed_by === "string" && body.executed_by.trim() ? body.executed_by.trim() : "unattributed";
  const markSkip = (actionId, reason) => {
    const result = executionResultOfSkip(reason);
    return result ? recordExecution(deps, actionId, { execution_result: result, executed_at: nowIso, executed_by: executedBy }) : null;
  };
  let actions = await deps.dbx.listActions(task.id);
  if (Array.isArray(body.action_ids) && body.action_ids.length)
    actions = actions.filter((a) => body.action_ids.includes(a.id));
  const dispatched = [], skipped = [];
  let costDelta = 0;
  for (const a of actions) {
    if (a.state !== "proposed") {
      const reason = `state_${a.state}`;
      skipped.push({ action_id: a.id, reason });
      await markSkip(a.id, reason);
      continue;
    }
    const g = await deps.gateAction(pol.doc, task, a, approvals, nowIso);
    const outcome = g && g.outcome ? g.outcome : "blocked";
    const greasons = (g && g.reasons) || [];
    await deps.appendEvent(deps.dbx, {
      task_id: task.id, action_id: a.id, kind: "gate_decision",
      data: { action_id: a.id, outcome, reasons: greasons, stage: "execute" },
      policy_version: curVersion,
    });
    if (outcome === "blocked") {
      const reason = greasons.includes("pause_active") ? "pause_active" : `gate_blocked:${greasons.join(",")}`;
      skipped.push({ action_id: a.id, reason });
      await markSkip(a.id, reason);
      continue;
    }
    if (outcome !== "allowed" && !hasValidApproval(a)) {
      skipped.push({ action_id: a.id, reason: "not_gate_allowed" });
      await markSkip(a.id, "not_gate_allowed");
      continue;
    }
    // A FRESH bound approval upgraded this action's gate decision: gateAction
    // returns approval_id only on that path. Mark the in-memory copy approved so
    // the dispatch-layer provisional-band check passes for exactly this action.
    const aDispatch = g && g.approval_id && a.state === "proposed" ? { ...a, state: "approved" } : a;
    const r = await deps.dispatchAction(env, deps.dbx, task, aDispatch, pol.doc);
    // jev-execute returns { skipped: true, reason } at the top level. The old read
    // of r.skipped.reason always gave undefined, so every skip was reported as
    // "skipped" and the pause reason was lost. The reason is read from the top level.
    if (r && r.skipped) {
      const reason = (typeof r.reason === "string" && r.reason) || "skipped";
      skipped.push({ action_id: a.id, reason });
      await markSkip(a.id, reason);
      continue;
    }
    // Pre-send blocks: nothing was sent, so the action stays proposed (never unknown).
    if (r && r.dispatched === false && /^(band_provisional|bad_model_route|target_unresolvable|target_payload_invalid|router_http_4|refs_list_|matrix_too_small|audit_http_4)/.test(String(r.error || ""))) {
      skipped.push({ action_id: a.id, reason: r.error });
      await markSkip(a.id, r.error);
      continue;
    }
    await recordExecution(deps, a.id, { execution_result: "dispatched", executed_at: nowIso, executed_by: executedBy });
    dispatched.push({ action_id: a.id, stable_id: a.stable_id, provider_ref: (r && r.provider_ref) || null });
    costDelta += (r && Number(r.cost_delta)) || 0;
  }
  if (costDelta) await deps.dbx.updateTask(task.id, { cost_usd: (Number(task.cost_usd) || 0) + costDelta, updated_at: nowIso });
  return json({ dispatched, skipped });
}

// WAVE 2 LANE F: POST /api/jev/automations/:id/run with an optional workspace_id.
// routes-automations.js is not edited, so this wrapper intercepts the run path
// before the delegate: auth first (never reveal a workspace to an
// unauthenticated caller), then the workspace binds (404 before any run), then
// the field is stripped so the automation input is unchanged. The request is
// rebuilt without content-length because its body is now shorter.
async function runAutomationWithWorkspace(req, env, deps, automationId) {
  const text = await req.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  const isObj = parsed && typeof parsed === "object" && !Array.isArray(parsed);
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  if (!isObj || !Object.prototype.hasOwnProperty.call(parsed, "workspace_id")) {
    return handleJevAutomations(new Request(req.url, { method: req.method, headers, body: text }), env, deps);
  }
  const auth = await authorized(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);
  let ws = null;
  if (parsed.workspace_id !== null) {
    try {
      ws = await workspaceForRequest(env, deps, parsed.workspace_id);
    } catch (e) {
      const wr = workspaceErrorResponse(e);
      if (wr) return wr;
      throw e;
    }
  }
  const input = { ...parsed };
  delete input.workspace_id;
  const res = await handleJevAutomations(
    new Request(req.url, { method: req.method, headers, body: JSON.stringify(input) }), env, deps);
  if (!ws || res.status >= 300) return res;
  const payload = await res.clone().json().catch(() => null);
  const task = payload && payload.task && payload.task.id ? payload.task : null;
  const workspace = task
    ? await recordAutomationArtifact(env, deps, ws, automationId, task)
    : { id: ws, artifacts: [], error: "no_task" };
  return json({ ...(payload && typeof payload === "object" ? payload : {}), workspace }, res.status);
}

// ---- module route handler ----------------------------------------------------
export async function handleJev(req, env, deps) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { ...JEV_CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  // P1-2 + P1-3 SELFTEST EVOLUTION (SPEC-AUDIT-FIXES-2026-10-08): delegate
  // /api/jev/evolution/selftest* and /api/jev/automations/selftest BEFORE the
  // unauthenticated automations delegate below (which would otherwise swallow
  // /api/jev/automations/selftest and 404). The selftest handler re-checks
  // bearer auth itself — the same requireOperatorAuth operator pattern the
  // 2026-10-08 auth pass used (operator diagnostics, NOT public site tools) —
  // and never touches production state (memory drivers only, no D1 writes,
  // no model calls, no sends).
  if (p.startsWith("/api/jev/evolution/selftest") || p === "/api/jev/automations/selftest")
    return handleJevSelftestEvolution(req, env, deps);
  // LANE-D AUTOMATIONS ADDITION (SPEC-AUTOMATIONS §4/§10): delegate the
  // automations registry, models, and reply-webhook routes to their own
  // module FIRST — before the bearer-auth gate below — because the reply
  // webhook is deliberately unauthenticated (provider webhooks can't hold
  // our key; it enforces its own optional ?k= shared-secret check).
  // WAVE 2 LANE F: run-with-workspace wrapper (see runAutomationWithWorkspace).
  // Runs before the automations delegate; requests without workspace_id are
  // rebuilt unchanged and delegated exactly as before.
  if (req.method === "POST" && /^\/api\/jev\/automations\/[A-Za-z0-9_-]+\/run$/.test(p))
    return runAutomationWithWorkspace(req, env, deps, p.split("/")[4]);
  if (p.startsWith("/api/jev/automations") || p === "/api/jev/models" || p.startsWith("/api/jev/webhooks/"))
    return handleJevAutomations(req, env, deps);
  if (p === "/api/jev/health" && req.method === "GET") {
    if (!env.JEV_API_KEY || !(await env.JEV_API_KEY.get())) return json({ ok: true, jev: "config-pending" });
    const pol = await deps.loadPolicy(env);
    return json({ ok: true, jev: "ready", policy_version: pol && pol.doc ? pol.doc.version : undefined, paused: pol && pol.doc ? !!pol.doc.paused : undefined });
  }
  const auth = await authorized(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);
  if (deps.rateLimited && deps.rateLimited(req, 30)) return err("RATE_LIMITED", "rate limited", 429);
  // POLICY READ (wave-1, read-only): GET the stored jev-policy.json as-is, and
  // GET its tool registry alone. Same bearer gate as every route in this table;
  // reads the same KV key jev-gate.loadPolicy reads. No write path here: policy
  // changes still go only through POST /api/jev/learnings/:id/promote.
  if (p === "/api/jev/policy" && req.method === "GET") {
    const rawPolicy = await env.SITE.get("jev-policy.json", "text");
    if (rawPolicy == null) return err("POLICY_MISSING", "jev-policy.json is not in KV", 404);
    return new Response(rawPolicy, { status: 200, headers: { "Content-Type": "application/json", ...JEV_CORS } });
  }
  if (p === "/api/jev/policy/tools" && req.method === "GET") {
    const rawPolicy = await env.SITE.get("jev-policy.json", "text");
    if (rawPolicy == null) return err("POLICY_MISSING", "jev-policy.json is not in KV", 404);
    let policyDoc;
    try { policyDoc = JSON.parse(rawPolicy); } catch { return err("POLICY_INVALID", "stored policy is not valid JSON", 422); }
    if (!policyDoc || typeof policyDoc.tools !== "object" || policyDoc.tools === null || Array.isArray(policyDoc.tools)) {
      return err("POLICY_INVALID", "stored policy has no tools object", 422);
    }
    return json({ tools: policyDoc.tools });
  }
  // WAVE 2 LANE F: operator workspace directory. The bearer gate above already
  // ran; handleJevWorkspace re-checks auth (defense in depth, same pattern as
  // the other delegates).
  if (p === "/api/jev/workspaces" || p.startsWith("/api/jev/workspaces/"))
    return handleJevWorkspace(req, env, deps);
  // SELF-EVOLUTION LAYER (SPEC-EVOLUTION v1): delegate before the task regexes.
  // EVOLUTION V2 (Lane E): the five v2 routes delegate BEFORE the v1
  // catch-all so they never fall through to handleJevEvolution. The bearer
  // auth gate above already ran; handleJevEvolution2 re-checks auth exactly
  // like handleJevEvolution does (defense in depth, same pattern).
  if (p === "/api/jev/evolution/cycles" || p === "/api/jev/evolution/atoms"
    || p === "/api/jev/evolution/candles" || p === "/api/jev/evolution/memory/search" || p === "/api/jev/evolution/memory/log"
    || p === "/api/jev/evolution/cycle/run" || p === "/api/jev/evolution/cycle/scheduled")
    return handleJevEvolution2(req, env, deps);
  // JEV CORPUS (SPEC-CORPUS 3.4): delegate before the first legacy catch-all
  // (the /api/jev/evolution prefix below). The bearer auth gate above already
  // ran; handleJevCorpus re-checks auth exactly like handleJevEvolution2 does
  // (defense in depth, same pattern).
  if (p === "/api/jev/corpus" || p.startsWith("/api/jev/corpus/"))
    return handleJevCorpus(req, env, deps);
  // JEV-TIMESERIES (SPEC-TIMESERIES 2026-10-08 §2): delegate the forecast +
  // timeseries routes before the task regexes. The bearer auth gate above
  // already ran; handleJevTimeseries re-checks auth exactly like
  // handleJevCorpus does (defense in depth, same pattern).
  if (p.startsWith("/api/jev/forecast") || p.startsWith("/api/jev/timeseries"))
    return handleJevTimeseries(req, env, deps);
  // SPEC-ROUTER (measurement-gated routing regime): delegate before the task
  // regexes. The bearer auth gate above already ran; handleJevRouter re-checks
  // auth exactly like handleJevCorpus does (defense in depth, same pattern).
  if (p.startsWith("/api/jev/route")) return handleJevRouter(req, env, deps);
  // JEV SELFTEST (P1-1/P1-4): delegate before the task regexes. The bearer
  // auth gate above already ran; handleJevSelftest re-checks auth exactly
  // like handleJevCorpus does (defense in depth, same pattern).
  if (p.startsWith("/api/jev/selftest")) return handleJevSelftest(req, env, deps);
  // 2026-10-12 (cancel route): POST /api/jev/evolution/directives/:id/cancel belongs to the v2 handler. The v1
  // /api/jev/evolution prefix below would otherwise take it. Only POST is delegated; other methods keep v1 behaviour.
  if (req.method === "POST" && /^\/api\/jev\/evolution\/directives\/[A-Za-z0-9_-]+\/cancel$/.test(p))
    return handleJevEvolution2(req, env, deps);
  // DIRECTIVE APPROVER GATE (2026-10-11): directive approve, reject and cancel use the same approver allowlist as task approvals.
  const mDirDecide = p.match(/^\/api\/jev\/evolution\/directives\/[A-Za-z0-9_-]+\/(approve|reject|cancel)$/);
  if (mDirDecide && req.method === "POST") {
    let dirBody = null;
    try { dirBody = await req.clone().json(); } catch (e) { dirBody = null; }
    const dirActor = dirBody && typeof dirBody.actor === "string" ? dirBody.actor : "";
    if (!dirActor.trim()) return err("INVALID_ACTOR", "actor must be a non-empty string", 400);
    const dirGate = await jevApproverCheck(deps, env, dirActor);
    if (!dirGate.ok) return err("APPROVER_NOT_ALLOWED", dirGate.message, 403);
  }
  if (p.startsWith("/api/jev/evolution")) return handleJevEvolution(req, env, deps);

  const mTask = p.match(/^\/api\/jev\/tasks\/([A-Za-z0-9_-]+)$/);
  const mAct = p.match(/^\/api\/jev\/tasks\/([A-Za-z0-9_-]+)\/(execute|verify|continue|retry|reconcile|close|cancel)$/);
  const mAp = p.match(/^\/api\/jev\/approvals\/([A-Za-z0-9_-]+)\/(approve|reject|guide)$/);
  const mLrn = p.match(/^\/api\/jev\/learnings\/([A-Za-z0-9_-]+)\/promote$/);

  if (p === "/api/jev/tasks" && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
    // P0-1 (2026-10-08): ingest-stage validation throws (jev-ingest invalid(),
    // marked e.validation) become 422 INVALID_BODY with NO task row created
    // (ingestTask throws before insertTask). Real internal failures still
    // escape to the generic 500 handler, which no longer leaks a stack.
    // WAVE 2 LANE F: optional workspace_id. Resolved BEFORE ingest so an unknown
    // or archived id (404) or a malformed one (422) creates no task. Stripped so
    // ingest sees the same body as before. The SERVER writes the run artifacts.
    let wsId = null;
    if (body.workspace_id !== undefined && body.workspace_id !== null) {
      try {
        wsId = await workspaceForRequest(env, deps, body.workspace_id);
      } catch (e) {
        const wr = workspaceErrorResponse(e);
        if (wr) return wr;
        throw e;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "workspace_id")) delete body.workspace_id;
    let r;
    try {
      r = await runPipeline(env, deps, body);
    } catch (e) {
      if (e && e.validation) return err("INVALID_BODY", String((e && e.message) || e), 422);
      throw e;
    }
    if (r.status < 300 && r.out && r.out.task && !r.out.duplicate) {
      const autoRun = await autoRunAllowedPrompt(env, deps, r.out.task.id, body);
      if (autoRun) {
        r.out.autoexecuted = autoRun;
        r.out.task = (await deps.dbx.getTask(r.out.task.id)) || r.out.task;
      }
    }
    if (wsId && r.status < 300 && r.out && r.out.task && !r.out.duplicate) {
      r.out.workspace = await recordTaskArtifacts(env, deps, wsId, r.out.task, r.out.actions);
    }
    return json(r.out, r.status);
  }
  if (p === "/api/jev/tasks" && req.method === "GET") {
    await deps.expireStale(deps.dbx, deps.helpers.now(), await reviewDeps(deps, env));
    const rows = await deps.dbx.listTasks({ limit: parseLimit(url), state: url.searchParams.get("state") || undefined });
    return json({ tasks: rows.map(jevTaskView), total: rows.length });
  }
  if (mTask && req.method === "GET") {
    await deps.expireStale(deps.dbx, deps.helpers.now(), await reviewDeps(deps, env));
    const task = await deps.dbx.getTask(mTask[1]);
    if (!task) return err("NOT_FOUND", "task not found", 404);
    const [actions, approvals, events] = await Promise.all([
      deps.dbx.listActions(task.id),
      deps.dbx.listApprovals({ taskId: task.id }),
      deps.dbx.listEvents(task.id, 200),
    ]);
    const nowMs = Date.parse(deps.helpers.now());
    return json({
      task: jevTaskView(task),
      actions,
      approvals: approvals.map((ap) => ({ ...ap, view: jevApprovalView(ap, nowMs, events) })),
      events,
      timeline: jevTimeline(events, nowMs),
      cost: { usd: task.cost_usd },
    });
  }
  if (mAct && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, "invalid JSON body", 400);
    const task = await deps.dbx.getTask(mAct[1]);
    if (!task) return err("NOT_FOUND", "task not found", 404);
    const action = body.action_id ? await deps.dbx.getAction(body.action_id) : null;
    if (body.action_id && (!action || action.task_id !== task.id)) return err("NOT_FOUND", "action not found on task", 404);
    switch (mAct[2]) {
      case "execute": {
        // 2026-10-11: bare execute now runs the same verify-and-continue leg as the prompt auto-run.
        // Dispatch alone left caller tasks at "Gate: Allowed / outcome still open".
        const exRes = await runExecute(env, deps, task, { ...body, executed_by: typeof body.actor === "string" ? body.actor : undefined });
        if (exRes.status >= 300) return exRes;
        const exBody = await exRes.json();
        const verified = [];
        for (const d of ((exBody && exBody.dispatched) || [])) {
          const fresh = await deps.dbx.getTask(task.id);
          const acts = await deps.dbx.listActions(task.id);
          const a = acts.find((x) => x.id === d.action_id);
          if (!a) continue;
          const v = await deps.verifyAction(env, deps.dbx, fresh, a);
          verified.push({ action_id: d.action_id, verdict: v && v.verdict });
        }
        let next = null;
        if (typeof deps.continueTask === "function" && verified.length) {
          const c = await deps.continueTask(env, deps.dbx, await deps.dbx.getTask(task.id));
          next = c && c.next;
        }
        return json({ ...exBody, verified, next });
      }
      case "verify": return json(await deps.verifyAction(env, deps.dbx, task, action));
      case "continue": return json(await deps.continueTask(env, deps.dbx, task));
      case "retry": { const rr = await deps.retryAction(env, deps.dbx, task, action); return json(rr, (rr && rr.status) || 200); }
      case "reconcile": {
          // Hardcoded (learning, 2026-10-08): observed did_not_happen is refused when the task event log shows a dispatch for this action.
          const evs = (await deps.dbx.listEvents(task.id, 200)) || [];
          const mine = (e) => e && (e.action_id === action.id || String(e.data_json || e.data || "").indexOf(action.id) >= 0);
          const dispatchedHere = evs.some((e) => mine(e) && (e.kind === "dispatch" || e.kind === "dispatch_unknown"));
          if (body.evidence && body.evidence.observed === "did_not_happen" && dispatchedHere)
            return err("EVIDENCE_CONTRADICTS_LOG", "event log shows a dispatch for this action; observed did_not_happen is refused. Copy observed and detail from the task events.", 409);
          return json(await deps.reconcileAction(env, deps.dbx, task, action, body.evidence));
        }
      case "close": {
        if (!TERMINAL_OUTCOMES.includes(body.outcome))
          return err("INVALID_OUTCOME", `outcome must be one of ${TERMINAL_OUTCOMES.join(", ")}`, 422);
        await deps.closeTask(deps.dbx, task, body.outcome, body.reason || "");
        return json({ ok: true, task: await deps.dbx.getTask(task.id) });
      }
      case "cancel": {
        await deps.closeTask(deps.dbx, task, "cancelled", body.reason || "cancelled");
        return json({ ok: true, task: await deps.dbx.getTask(task.id) });
      }
    }
  }
  if (p === "/api/jev/approvals" && req.method === "GET") {
    await deps.expireStale(deps.dbx, deps.helpers.now(), await reviewDeps(deps, env));
    const pending = await deps.listPending(deps.dbx);
    const nowMs = Date.parse(deps.helpers.now());
    const eventsByTask = {};
    for (const ap of pending) {
      if (!eventsByTask[ap.task_id]) eventsByTask[ap.task_id] = await deps.dbx.listEvents(ap.task_id, 200);
    }
    return json({ approvals: pending.map((ap) => ({ ...ap, view: jevApprovalView(ap, nowMs, eventsByTask[ap.task_id] || []) })) });
  }
  if (mAp && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, "invalid JSON body", 400);
    // Fail closed: a missing or blank actor is refused before any read or write (400).
    if (typeof body.actor !== "string" || !body.actor.trim()) return err("INVALID_ACTOR", "actor must be a non-empty string", 400);
    const rd = await reviewDeps(deps, env);
    if (mAp[2] === "approve") {
      const approverGate = await jevApproverCheck(deps, env, body.actor);
      if (!approverGate.ok) return err("APPROVER_NOT_ALLOWED", approverGate.message, 403);
      // approved_via: the console sends X-Jev-Client: console; every other caller is "api".
      const channel = String(req.headers.get("X-Jev-Client") || "").toLowerCase() === "console" ? "console" : "api";
      const r = await deps.approve(env, mAp[1], body.actor, body.note ?? null, { ...rd, channel });
      if (!r.ok) return json({ error: { code: r.code, message: r.message }, gate: r.gate || null, approval: r.approval || null }, ERR_STATUS[r.code] || 409);
      // Diagram-faithful post-approval leg (live bug 2026-10-01, Jenny report on
      // t_4595c2d0a86beca1): REVIEW -> GATE recheck -> Allowed -> EXECUTE. The
      // approve endpoint used to stop at the gate re-check, so console-approved
      // tasks sat in `gated` forever unless a caller manually POSTed /execute.
      // When the re-run gate allows the bound action, dispatch it, verify it,
      // and continue/close the task inside this request. Any failure in the leg
      // is recorded and returned as autoexecuted.error; the approval itself
      // already succeeded.
      let autoexecuted = null;
      if (r.gate && r.gate.outcome === "allowed" && r.task && r.task.id
          && typeof deps.dispatchAction === "function") {
        try {
          await deps.dbx.updateTask(r.task.id, { gate_outcome: "allowed", gate_reasons_json: JSON.stringify(r.gate.reasons || []) });
          const ex = await runExecute(env, deps, r.task, { action_ids: [r.approval.action_id], executed_by: "auto-redispatch:" + body.actor.trim() });
          const exBody = await ex.json();
          const out = { execute: exBody };
          const disp = ((exBody && exBody.dispatched) || []).map((d) => d.action_id);
          if (typeof deps.verifyAction === "function" && disp.length) {
            const fresh = await deps.dbx.getTask(r.task.id);
            const acts = await deps.dbx.listActions(r.task.id);
            const verified = [];
            for (const aid of disp) {
              const a = acts.find((x) => x.id === aid);
              if (!a) continue;
              const v = await deps.verifyAction(env, deps.dbx, fresh, a);
              verified.push({ action_id: aid, verdict: v && v.verdict });
            }
            out.verified = verified;
          }
          if (typeof deps.continueTask === "function") {
            const fresh2 = await deps.dbx.getTask(r.task.id);
            const c = await deps.continueTask(env, deps.dbx, fresh2);
            out.next = c && c.next;
          }
          autoexecuted = out;
        } catch (e) {
          autoexecuted = { error: String((e && e.message) || e) };
        }
      }
      let finalTask = r.task;
      if (r.task && r.task.id && deps.dbx && typeof deps.dbx.getTask === "function") {
        try { finalTask = (await deps.dbx.getTask(r.task.id)) || r.task; } catch { finalTask = r.task; }
      }
      return json({ ok: true, approval: r.approval, gate: r.gate, task: finalTask, autoexecuted });
    }
    if (mAp[2] === "reject") {
      const rejectApprover = await jevApproverCheck(deps, env, body.actor);
      if (!rejectApprover.ok) return err("APPROVER_NOT_ALLOWED", rejectApprover.message, 403);
      if (typeof body.reason !== "string" || !body.reason.trim()) return err("INVALID_REASON", "reason is required", 422);
      const r = await deps.reject(deps.dbx, mAp[1], body.actor, body.reason, rd);
      if (!r.ok) return json({ error: { code: r.code, message: r.message } }, ERR_STATUS[r.code] || 409);
      return json({ ok: true, approval: r.approval, task: r.task });
    }
    // guide
    const taskForGuide = body.task_id || (await deps.dbx.getApproval(mAp[1]) || {}).task_id;
    const r = await deps.guide(deps.dbx, taskForGuide, body.actor, body.guidance, rd);
    if (!r.ok) return json({ error: { code: r.code, message: r.message } }, ERR_STATUS[r.code] || 409);
    return json({ ok: true, task: r.task });
  }
  if (p === "/api/jev/pause" && req.method === "GET") {
    const pol = await deps.loadPolicy(env);
    if (!pol || pol.error)
      return json({ paused: true, scope: "all", note: "policy unreadable — failing closed" });
    return json({ paused: !!pol.doc.paused, scope: pol.doc.pause_scope || "all" });
  }
  if (p === "/api/jev/pause" && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, "invalid JSON body", 400);
    if (typeof body.paused !== "boolean") return err("INVALID_PAUSE", "paused must be a boolean", 422);
    const scope = body.scope === undefined ? "all" : String(body.scope);
    if (!/^(all|tenant:[^:]+|task:[A-Za-z0-9_-]+)$/.test(scope))
      return err("INVALID_SCOPE", 'scope must be "all", "tenant:<t>" or "task:<id>"', 422);
    const pol = await deps.loadPolicy(env);
    if (!pol || pol.error) return err("POLICY_UNREADABLE", "cannot persist pause into an unreadable policy", 503);
    const doc = { ...pol.doc, paused: body.paused, pause_scope: scope };
    await env.SITE.put("jev-policy.json", JSON.stringify(doc));
    await deps.appendEvent(deps.dbx, {
      task_id: null, action_id: null, kind: "pause_changed",
      data: { paused: body.paused, scope }, policy_version: String(doc.version),
    });
    return json({ ok: true, paused: body.paused, scope });
  }
  if (p === "/api/jev/summary" && req.method === "GET") {
    await deps.expireStale(deps.dbx, deps.helpers.now(), reviewDeps(deps, env));
    const s = await deps.dbx.summary();
    const pol = await deps.loadPolicy(env);
    return json({ ...s, policy_version: pol && pol.doc ? pol.doc.version : s.policy_version });
  }
  if (p === "/api/jev/learnings" && req.method === "GET") return json({ learnings: await deps.listLearnings(deps.dbx) });
  if (p === "/api/jev/learnings" && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, "invalid JSON body", 400);
    const taskId = body && body.task_id != null && String(body.task_id).trim() ? String(body.task_id).trim() : null;
    const r = await deps.proposeLearning(deps.dbx, taskId, body ? body.proposal : null, deps.helpers);
    if (!r.ok) return json({ error: { code: r.code, message: r.message } }, ERR_STATUS[r.code] || 422);
    return json({ ok: true, learning: r.learning });
  }
  if (mLrn && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, "invalid JSON body", 400);
    if (typeof body.actor !== "string" || !body.actor.trim()) return err("INVALID_ACTOR", "actor must be a non-empty string", 422);
    let newPolicy = body.new_policy;
    if (!newPolicy) {
      // SPEC: new_policy is optional — fall back to the CURRENT doc (version bumps only).
      const raw = await env.SITE.get("jev-policy.json");
      try { newPolicy = JSON.parse(raw); } catch { return err("POLICY_MISSING", "no new_policy and no readable current policy", 422); }
    }
    const r = await deps.promoteLearning(env, mLrn[1], body.actor, newPolicy, await improveDeps(deps, env));
    if (!r.ok) return json({ error: { code: r.code, message: r.message, error: r.error || undefined } }, ERR_STATUS[r.code] || 409);
    // POLICY CHANGELOG (WLF policy-shift study): on a successful version bump,
    // append one source='promote' row to jev_policy_changelog (the baseline is
    // seeded by the writer on first access). The KV bump above already
    // succeeded and stays the system of record, so a changelog failure is
    // surfaced in the response as changelog_error instead of failing the
    // promote.
    let changelog;
    try {
      const summary = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim().slice(0, 200)
        : typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200)
        : `policy promoted to v${r.version} via learning ${mLrn[1]}`;
      const row = await recordPolicyPromotion(deps, env, { version: r.version, actor: body.actor, summary });
      changelog = { ok: true, id: row && row.id ? row.id : null };
    } catch (e) {
      changelog = { ok: false, error: String((e && e.message) || e) };
    }
    return json({ ok: true, version: r.version, approvals_expired: r.approvals_expired, learning: r.learning, changelog });
  }
  return err("NOT_FOUND", `no jev route for ${req.method} ${p}`, 404);
}

// INTEGRATOR ADDITION (additive export, no behavior change): the scheduler's
// createTask dep is the standard pipeline entry — runPipeline IS the pipeline
// (ingest → understand → decide → gate). jev-main binds it into
// deps.runSchedulerTick's createTask so cron-fired automations flow through
// the identical dedupe + gate path as POST /api/jev/tasks.
export { runPipeline };