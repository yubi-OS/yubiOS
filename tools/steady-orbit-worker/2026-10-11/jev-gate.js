// jev-gate.js — deterministic, fail-closed policy gate (SPEC §8).
// Only outputs: allowed | needs_approval | blocked. Never guesses.

import { sha256Hex } from './jev-state.js';

const DEFAULT_APPROVAL_TTL_SECONDS = 86400;

// Optional tool scope fields (policy v16). Enforced ONLY when a tool declares them.
const SCOPE_FIELDS = ['repo_allowlist', 'path_prefix_allowlist', 'branch_prefix_allowlist', 'deny_branches', 'require_blob_sha_on_update', 'allowed_query_params', 'command_allowlist'];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const OWNER_REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const BRANCH_RE = /^[A-Za-z0-9._\/-]+$/;
const SHA_RE = /^[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?$/;
const EXEC_KEYS = ['command', 'cmd', 'script', 'argv', 'shell'];

// Deterministic JSON: recursively sort object keys (arrays keep order),
// JSON.stringify, sha256 hex.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  return value;
}

export async function canonicalHash(obj) {
  return sha256Hex(JSON.stringify(canonicalize(obj ?? null)));
}

// -> null if valid, else an error string.
export function validatePolicyDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'policy: not an object';
  if (!Number.isInteger(doc.version) || doc.version < 1) return 'policy.version must be a positive integer';
  if (typeof doc.paused !== 'undefined' && typeof doc.paused !== 'boolean') return 'policy.paused must be a boolean';
  if (typeof doc.pause_scope !== 'undefined' && typeof doc.pause_scope !== 'string') return 'policy.pause_scope must be a string';

  if (!doc.tools || typeof doc.tools !== 'object' || Array.isArray(doc.tools)) return 'policy.tools must be an object';
  for (const [name, tool] of Object.entries(doc.tools)) {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return `policy.tools.${name} must be an object`;
    if (!Array.isArray(tool.hosts) || tool.hosts.length === 0 || tool.hosts.some((h) => typeof h !== 'string' || h.length === 0)) {
      return `policy.tools.${name}.hosts must be a non-empty array of host strings`;
    }
    if (!Array.isArray(tool.methods) || tool.methods.length === 0 || tool.methods.some((x) => typeof x !== 'string' || x.length === 0)) {
      return `policy.tools.${name}.methods must be a non-empty array of method strings`;
    }
    if (typeof tool.max_cost_usd !== 'number' || !Number.isFinite(tool.max_cost_usd) || tool.max_cost_usd < 0) {
      return `policy.tools.${name}.max_cost_usd must be a non-negative number`;
    }
    if (typeof tool.requires_approval !== 'boolean') return `policy.tools.${name}.requires_approval must be a boolean`;
    if (typeof tool.credential !== 'undefined' && (typeof tool.credential !== 'string' || tool.credential.length === 0)) {
      return `policy.tools.${name}.credential, if given, must be a non-empty string`;
    }
    const scopeErr = validateScopeFields(name, tool);
    if (scopeErr) return scopeErr;
  }

  if (!doc.limits || typeof doc.limits !== 'object' || Array.isArray(doc.limits)) return 'policy.limits must be an object';
  for (const k of ['max_actions_per_task', 'max_retries_per_action', 'max_task_cost_usd', 'min_ms_between_dispatches']) {
    if (typeof doc.limits[k] !== 'number' || !Number.isFinite(doc.limits[k]) || doc.limits[k] < 0) {
      return `policy.limits.${k} must be a non-negative number`;
    }
  }

  if (!doc.thresholds || typeof doc.thresholds !== 'object' || Array.isArray(doc.thresholds)) return 'policy.thresholds must be an object';
  for (const k of ['auto_act_is_actionable', 'review_floor', 'risk_requires_approval']) {
    if (typeof doc.thresholds[k] !== 'number' || !Number.isFinite(doc.thresholds[k])) {
      return `policy.thresholds.${k} must be a number`;
    }
  }

  if (!doc.categories || typeof doc.categories !== 'object' || Array.isArray(doc.categories)) return 'policy.categories must be an object';
  for (const [k, v] of Object.entries(doc.categories)) {
    if (typeof v !== 'string') return `policy.categories.${k} must be a string`;
  }

  if (typeof doc.blocked_action !== 'string' || doc.blocked_action.length === 0) return 'policy.blocked_action must be a string';
  return null;
}

// Reads + validates the policy doc. On ANY failure returns {error} — callers
// treat that as gate=blocked (fail closed includes unreadable policy).
export async function loadPolicy(env, fetchImpl) {
  try {
    if (!env || !env.SITE || typeof env.SITE.get !== 'function') {
      return { error: 'policy_unavailable: KV binding (env.SITE) missing' };
    }
    const raw = await env.SITE.get('jev-policy.json', 'text');
    if (raw == null) return { error: 'policy_unavailable: jev-policy.json missing in KV' };
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      return { error: 'policy_invalid: JSON parse failed: ' + (e && e.message) };
    }
    const vErr = validatePolicyDoc(doc);
    if (vErr) return { error: 'policy_invalid: ' + vErr };
    return doc;
  } catch (e) {
    return { error: 'policy_unavailable: ' + (e && e.message ? e.message : String(e)) };
  }
}

// Pause scope forms: 'all' | 'tenant:<t>' | 'task:<id>'. Unparseable scope
// fails closed (true) — pause must never silently not-apply.
export function checkPause(policy, task) {
  if (!policy || policy.paused !== true) return false;
  const scope = typeof policy.pause_scope === 'string' && policy.pause_scope.length > 0 ? policy.pause_scope : 'all';
  if (scope === 'all') return true;
  if (scope.startsWith('tenant:')) return !!task && task.tenant === scope.slice('tenant:'.length);
  if (scope.startsWith('task:')) return !!task && task.id === scope.slice('task:'.length);
  return true; // unknown scope shape → fail closed
}

function toolOf(policy, action) {
  const name = action && action.tool;
  if (typeof name !== 'string' || !policy.tools || typeof policy.tools !== 'object') return null;
  const tool = policy.tools[name];
  return tool && typeof tool === 'object' ? tool : null;
}

function urlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// Canonical bound payload of an action — MUST match jev-review's boundPayload
// (what createApproval hashes). Hash-parity lesson (2026-10-01): the gate used
// to hash the parsed body alone, while approvals store the stricter
// {method, url, body: body_json-as-stored} hash — every approval was then
// judged stale (approval_payload_mismatch) and the post-approval auto-dispatch
// leg never fired.
function boundPayloadOf(action) {
  return { method: action && action.method, url: action && action.url, body: (action && (action.body_json ?? action.body)) ?? null };
}

function bodyOf(action) {
  let body = action.body;
  if (body == null && typeof action.body_json === 'string' && action.body_json.length) {
    try { body = JSON.parse(action.body_json); } catch { body = action.body_json; }
  }
  return body ?? null;
}

function riskOf(task) {
  const v = task && task.risk != null ? task.risk
    : task && task.decision && typeof task.decision === 'object' && task.decision.risk != null ? task.decision.risk
    : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isFreshApproval(ap, policy, action, nowIso, expectedHash) {
  if (!ap || ap.status !== 'approved') return { ok: false, why: 'approval_not_approved' };
  if (!ap.actor || String(ap.actor).trim() === '') return { ok: false, why: 'approval_actor_missing' };
  const expMs = Date.parse(ap.expires_at);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(expMs) || !Number.isFinite(nowMs) || expMs <= nowMs) return { ok: false, why: 'approval_expired' };
  if (String(ap.policy_version) !== String(policy.version)) return { ok: false, why: 'approval_stale_policy' };
  if (ap.payload_hash !== expectedHash) return { ok: false, why: 'approval_payload_mismatch' };
  return { ok: true };
}

// ===========================================================================
// Tool scope (policy v16). Optional tool fields, each enforced ONLY when the
// tool declares it, so a tool without them is gated exactly as before:
//   repo_allowlist              GitHub Contents URL: owner/repo exact member
//   path_prefix_allowlist       Contents path (decoded, normalized) starts with a prefix
//   branch_prefix_allowlist     body.branch starts with a prefix; main is always denied
//   deny_branches               body.branch not listed (main is always denied)
//   require_blob_sha_on_update  mutating method needs body.sha, or body.create === true
//   allowed_query_params        URL query keys are members
//   command_allowlist           no exec key in body/query unless it is an exact member
// Every check fails closed. These checks never read binding values; `credential` is not resolved here.
// ===========================================================================
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0);

// Prefix must be a normalized relative directory ending in "/".
function isSafePathPrefix(p) {
  if (typeof p !== 'string' || p.length < 2 || !p.endsWith('/') || p.startsWith('/')) return false;
  if (!/^[A-Za-z0-9._\/-]+$/.test(p) || p.includes('//')) return false;
  return p.slice(0, -1).split('/').every((s) => s.length > 0 && s !== '.' && s !== '..');
}

// Load-time shape check for the optional fields (absent fields are not checked).
function validateScopeFields(name, tool) {
  if (tool.repo_allowlist !== undefined && (!isStrArr(tool.repo_allowlist) || tool.repo_allowlist.some((r) => !OWNER_REPO_RE.test(r)))) {
    return `policy.tools.${name}.repo_allowlist must be a non-empty array of "owner/repo" strings`;
  }
  if (tool.path_prefix_allowlist !== undefined && (!isStrArr(tool.path_prefix_allowlist) || !tool.path_prefix_allowlist.every(isSafePathPrefix))) {
    return `policy.tools.${name}.path_prefix_allowlist must be non-empty normalized prefixes ending in "/" (no "..", ".", or empty segments)`;
  }
  if (tool.branch_prefix_allowlist !== undefined && (!isStrArr(tool.branch_prefix_allowlist) || tool.branch_prefix_allowlist.some((p) => !BRANCH_RE.test(p) || p.includes('..')))) {
    return `policy.tools.${name}.branch_prefix_allowlist must be a non-empty array of branch-prefix strings`;
  }
  if (tool.deny_branches !== undefined && (!Array.isArray(tool.deny_branches) || tool.deny_branches.some((b) => typeof b !== 'string' || b.length === 0))) {
    return `policy.tools.${name}.deny_branches must be an array of branch-name strings`;
  }
  if (tool.require_blob_sha_on_update !== undefined && typeof tool.require_blob_sha_on_update !== 'boolean') {
    return `policy.tools.${name}.require_blob_sha_on_update must be a boolean`;
  }
  if (tool.allowed_query_params !== undefined && !isStrArr(tool.allowed_query_params)) {
    return `policy.tools.${name}.allowed_query_params must be a non-empty array of parameter names`;
  }
  if (tool.command_allowlist !== undefined && !isStrArr(tool.command_allowlist)) {
    return `policy.tools.${name}.command_allowlist must be a non-empty array of exact command strings`;
  }
  return null;
}

// The body dispatch actually sends. jev-execute sends body_json verbatim when it is
// present, so the scope checks read that same value and never the parsed `body` beside it.
// Unparseable body_json → undefined (the caller blocks with body_unparseable).
function sentBodyOf(action) {
  if (typeof action.body_json === 'string' && action.body_json.length) {
    try { return JSON.parse(action.body_json); } catch { return undefined; }
  }
  return action.body ?? null;
}

// Raw path of an absolute URL, taken BEFORE WHATWG dot-segment normalization.
function rawPathOf(url) {
  const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i.exec(String(url));
  return m ? (m[1] || '') : null;
}

// Decodes raw path segments. Raw or percent-encoded "." / ".." → path_traversal.
// Empty segments, decoded separators, backslashes and control characters → path_not_normalized.
function decodeSegments(rawSegs) {
  const out = [];
  for (const raw of rawSegs) {
    if (raw === '.' || raw === '..') return { reason: 'path_traversal' };
    let dec;
    try { dec = decodeURIComponent(raw); } catch { return { reason: 'path_not_normalized' }; }
    if (dec === '.' || dec === '..') return { reason: 'path_traversal' };
    if (dec.length === 0 || /[\/\\\x00-\x1f\x7f]/.test(dec)) return { reason: 'path_not_normalized' };
    out.push(dec);
  }
  return { segs: out };
}

// GitHub Contents URL: /repos/{owner}/{repo}/contents/{path...} → {owner, repo, path} or {reason}.
function contentsTargetOf(url) {
  const raw = rawPathOf(url);
  if (raw === null) return { reason: 'contents_url_invalid' };
  const parts = raw.split('/').slice(1);
  if (parts.length < 5 || parts[0] !== 'repos' || parts[3] !== 'contents') return { reason: 'contents_url_invalid' };
  const dec = decodeSegments(parts.slice(1));
  if (dec.reason) return { reason: dec.reason };
  let parsedPath;
  try { parsedPath = new URL(String(url)).pathname; } catch { return { reason: 'contents_url_invalid' }; }
  if (parsedPath !== raw) return { reason: 'path_not_normalized' };
  const [owner, repo, , ...pathSegs] = dec.segs;
  return { owner, repo, path: pathSegs.join('/') };
}

function branchReasons(tool, body) {
  const b = isObj(body) ? body.branch : undefined;
  if (typeof b !== 'string' || b.length === 0) return ['branch_missing'];
  if (!BRANCH_RE.test(b) || b.includes('..') || b.includes('//') || b.startsWith('/') || b.endsWith('/') || b.endsWith('.lock') || b.startsWith('-')) {
    return ['branch_invalid'];
  }
  const short = b.startsWith('refs/heads/') ? b.slice('refs/heads/'.length) : b;
  const denied = Array.isArray(tool.deny_branches) ? tool.deny_branches : [];
  const reasons = [];
  if (short.toLowerCase() === 'main' || denied.includes(b) || denied.includes(short)) reasons.push('branch_denied');
  if (Array.isArray(tool.branch_prefix_allowlist) && !tool.branch_prefix_allowlist.some((p) => b.startsWith(p))) {
    reasons.push('branch_prefix_not_allowed');
  }
  return reasons;
}

// Update needs a well-formed sha; create needs create === true and no sha.
// Safe (read) methods are exempt. A PUT with neither → missing_blob_sha_or_create.
function writeReasons(tool, action, body) {
  if (tool.require_blob_sha_on_update !== true) return [];
  if (SAFE_METHODS.includes(String(action.method).toUpperCase())) return [];
  const obj = isObj(body) ? body : {};
  if (obj.create === true) return obj.sha !== undefined && obj.sha !== null ? ['sha_and_create_conflict'] : [];
  return typeof obj.sha === 'string' && SHA_RE.test(obj.sha) ? [] : ['missing_blob_sha_or_create'];
}

function queryKeysOf(url) {
  try {
    const keys = [];
    new URL(String(url)).searchParams.forEach((_value, key) => keys.push(key));
    return keys;
  } catch { return null; }
}

function commandReasons(tool, url, body) {
  const keys = queryKeysOf(url);
  if (keys === null || keys.some((k) => EXEC_KEYS.includes(k))) return ['command_not_allowed'];
  if (body === null || body === undefined) return [];
  if (!isObj(body)) return ['command_not_allowed'];
  for (const k of EXEC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    if (k === 'command' && typeof body.command === 'string' && tool.command_allowlist.includes(body.command)) continue;
    return ['command_not_allowed'];
  }
  return [];
}

// Every scope reason for one action. [] when the tool declares no scope fields.
export function scopeReasons(tool, action) {
  if (!tool || typeof tool !== 'object' || !SCOPE_FIELDS.some((f) => tool[f] !== undefined)) return [];
  if (!action || typeof action !== 'object') return ['invalid_action'];
  const url = action.url;
  const body = sentBodyOf(action);
  if (body === undefined) return ['body_unparseable'];
  const reasons = [];
  if (tool.repo_allowlist !== undefined || tool.path_prefix_allowlist !== undefined) {
    const t = contentsTargetOf(url);
    if (t.reason) {
      reasons.push(t.reason);
    } else {
      if (tool.repo_allowlist !== undefined && !tool.repo_allowlist.includes(`${t.owner}/${t.repo}`)) reasons.push('repo_not_allowed');
      if (tool.path_prefix_allowlist !== undefined && !tool.path_prefix_allowlist.some((p) => t.path.startsWith(p))) {
        reasons.push('path_prefix_not_allowed');
      }
    }
  }
  // Main is denied for every contents write. A write to a repo/path tool must name a branch even when the tool
  // declares no branch fields: an omitted branch means the repository default branch (main).
  const mutatingWrite = !SAFE_METHODS.includes(String(action.method).toUpperCase());
  const contentsWrite = mutatingWrite && (tool.repo_allowlist !== undefined || tool.path_prefix_allowlist !== undefined);
  if (tool.branch_prefix_allowlist !== undefined || tool.deny_branches !== undefined || contentsWrite) {
    reasons.push(...branchReasons(tool, body));
  }
  reasons.push(...writeReasons(tool, action, body));
  if (tool.allowed_query_params !== undefined) {
    const keys = queryKeysOf(url);
    if (keys === null || !keys.every((k) => tool.allowed_query_params.includes(k))) reasons.push('query_param_not_allowed');
  }
  if (tool.command_allowlist !== undefined) reasons.push(...commandReasons(tool, url, body));
  return [...new Set(reasons)];
}

// The body with `create` stripped, for a create (PUT) that the gate allowed. Null when nothing
// to strip. jev-execute must send this value (see dispatch_body_json on the allowed result).
export function dispatchBodyFor(tool, action) {
  if (!tool || tool.require_blob_sha_on_update !== true) return null;
  if (SAFE_METHODS.includes(String(action.method).toUpperCase())) return null;
  const body = sentBodyOf(action);
  if (!isObj(body) || body.create !== true) return null;
  const stripped = { ...body };
  delete stripped.create;
  return JSON.stringify(stripped);
}

function withDispatchBody(result, tool, action) {
  const dispatchBody = dispatchBodyFor(tool, action);
  return dispatchBody === null ? result : { ...result, dispatch_body_json: dispatchBody };
}

// gateAction — the ordered checks of SPEC §8:
//   1. parse/unknown tool/host/method → blocked
//   2. pause                          → blocked
//   3. limits (count, budget, retries)→ blocked
//   4. risk / requires_approval / no valid approval → needs_approval (+ approval context)
//   5. valid approval                 → allowed
//   6. otherwise                      → allowed
export async function gateAction(policy, task, action, approvals = [], nowIso = new Date().toISOString()) {
  const blocked = (reasons) => ({ outcome: 'blocked', reasons, policy_version: policy && policy.version != null ? policy.version : null });

  // 0. policy availability — fail closed
  if (!policy || typeof policy !== 'object' || policy.error) {
    return { outcome: 'blocked', reasons: ['policy_unavailable'], policy_version: null };
  }
  const vErr = validatePolicyDoc(policy);
  if (vErr) return blocked(['policy_invalid: ' + vErr]);

  // 1. parse / unknown
  if (!action || typeof action !== 'object') return blocked(['invalid_action']);
  if (!task || !task.id) return blocked(['invalid_task']);
  const tool = toolOf(policy, action);
  if (!tool) return blocked(['unknown_tool']);
  // SPEC-ROUTER (measurement-gated routing regime): route.dispatch is a builtin
  // without a fetchable URL in the http-tool sense — its validation runs here,
  // BEFORE the stock host/method checks, and the band/target checks inside
  // gateRouteDispatch are stricter than the stock checks. Inline patch
  // (advisor reconciliation of Lane B's jev-gate-route-dispatch.js overlay).
  if (action && action.tool === 'route.dispatch') {
    return gateRouteDispatch(policy, task, action, approvals, nowIso);
  }
  const host = urlHost(action.url);
  if (!host) return blocked(['invalid_action']);
  if (!tool.hosts.includes(host)) return blocked(['host_not_allowed']);
  if (typeof action.method !== 'string' || !tool.methods.includes(action.method)) return blocked(['method_not_allowed']);
  // 1b. tool scope (policy v16). Absent fields → no-op. Fail closed, before any approval logic.
  const scopeBlocks = scopeReasons(tool, action);
  if (scopeBlocks.length) return blocked(scopeBlocks);

  // 2. pause
  if (checkPause(policy, task)) return blocked(['pause_active']);

  // 3. limits
  const reasons = [];
  const actionCount = task.action_count != null ? Number(task.action_count) : (action.seq != null ? Number(action.seq) : 1);
  if (actionCount > policy.limits.max_actions_per_task) reasons.push('action_limit_exceeded');
  const estCost = typeof action.estimated_cost_usd === 'number' && Number.isFinite(action.estimated_cost_usd)
    ? action.estimated_cost_usd
    : tool.max_cost_usd;
  if ((Number(task.cost_usd) || 0) + estCost > policy.limits.max_task_cost_usd) reasons.push('task_budget_exceeded');
  const attempts = action.attempts != null ? Number(action.attempts) : 0;
  if (attempts >= policy.limits.max_retries_per_action) reasons.push('retries_exhausted');
  if (reasons.length) return blocked(reasons);

  // 4/5. approval requirements + validity
  const needsApproval = tool.requires_approval === true || riskOf(task) >= policy.thresholds.risk_requires_approval;
  if (needsApproval) {
    const expectedHash = await canonicalHash(boundPayloadOf(action));
    // latest matching approval wins
    const matching = (Array.isArray(approvals) ? approvals : []).filter((ap) => ap && ap.action_id === action.id);
    const ap = matching.length ? matching[matching.length - 1] : null;
    if (ap) {
      const verdict = isFreshApproval(ap, policy, action, nowIso, expectedHash);
      if (!verdict.ok) {
        return {
          outcome: 'needs_approval',
          reasons: [verdict.why],
          policy_version: policy.version,
          approval_id: ap.id,
          approval_context: approvalContext(policy, task, action, tool, expectedHash, nowIso),
        };
      }
      // 5. valid approval → allowed
      return withDispatchBody({ outcome: 'allowed', reasons: [], policy_version: policy.version, approval_id: ap.id }, tool, action);
    }
    // no approval on file
    return {
      outcome: 'needs_approval',
      reasons: tool.requires_approval ? ['tool_requires_approval'] : ['risk_requires_approval'],
      policy_version: policy.version,
      approval_context: approvalContext(policy, task, action, tool, expectedHash, nowIso),
    };
  }

  // 6. allowed
  return withDispatchBody({ outcome: 'allowed', reasons: [], policy_version: policy.version }, tool, action);
}

function approvalContext(policy, task, action, tool, payloadHash, nowIso) {
  const ttl = typeof policy.approval_ttl_seconds === 'number' && Number.isFinite(policy.approval_ttl_seconds)
    ? policy.approval_ttl_seconds
    : DEFAULT_APPROVAL_TTL_SECONDS;
  const expiresMs = Date.parse(nowIso) + ttl * 1000;
  return {
    task_id: task.id,
    action_id: action.id,
    target: `${action.method} ${action.url}`,
    payload_hash: payloadHash,
    limits: { max_cost_usd: tool.max_cost_usd, max_task_cost_usd: policy.limits.max_task_cost_usd },
    policy_version: policy.version,
    expires_at: new Date(expiresMs).toISOString(),
  };
}
// ===========================================================================
// SPEC-ROUTER (measurement-gated routing regime) — advisor-inline patch of
// Lane B's jev-gate-route-dispatch.js overlay (INLINED per its own INLINE MODE;
// no sibling part is added for it). Adaptations at inline time:
//   - no import line: canonicalHash / validatePolicyDoc / checkPause /
//     gateAction / boundPayloadOf are local to this module already;
//   - no second DEFAULT_APPROVAL_TTL_SECONDS or isFreshApproval declaration
//     (the stock ones above are reused verbatim);
//   - HASH PARITY (the 2026-10-01 payload-hash-duality lesson class): the
//     canonical approval payload for a route.dispatch action is the STOCK
//     boundPayload shape {method, url, body: body_json-as-stored} — NOT a
//     synthetic {method:'DISPATCH', url:'jev://...'} shape. The router
//     proposes route.dispatch actions as ordinary http-shaped actions
//     (method POST, url https://jev.route/<target>), so createApproval
//     (jev-review) hashes them UNCHANGED and the approve-time re-run in
//     jev-review.payloadHashOf matches gateRouteDispatch byte-for-byte.
//     jev-review.boundPayload needs NO patch. routeBoundPayload below is kept
//     only as the named alias for that shape (tests reference it).
// ===========================================================================

// ---------------------------------------------------------------------------
// validateRoutingDoc(doc) → null | error string.
// Extension of validatePolicyDoc for the v7 additions. The stock validator
// only checks the fields it knows; this enforces the routing block and the
// route.dispatch tool's builtin fields. Stock tools are untouched. v6 docs
// (no route.dispatch tool, no routing block) pass unchanged — the new-gate-
// reads-old-policy reverse hazard fails closed gracefully (unknown_tool).
// ---------------------------------------------------------------------------
export function validateRoutingDoc(doc) {
  const stockErr = validatePolicyDoc(doc);
  if (stockErr) return stockErr;

  const tool = doc.tools['route.dispatch'];
  if (tool) {
    if (typeof tool.targets !== 'undefined') {
      if (!Array.isArray(tool.targets) || tool.targets.length === 0
        || tool.targets.some((t) => typeof t !== 'string' || t.length === 0)) {
        return 'policy.tools.route.dispatch.targets must be a non-empty array of target strings';
      }
      if (new Set(tool.targets).size !== tool.targets.length) {
        return 'policy.tools.route.dispatch.targets must not contain duplicates';
      }
    }
    if (typeof tool.model_routes !== 'undefined') {
      if (!tool.model_routes || typeof tool.model_routes !== 'object' || Array.isArray(tool.model_routes)) {
        return 'policy.tools.route.dispatch.model_routes must be an object';
      }
      for (const [k, v] of Object.entries(tool.model_routes)) {
        if (typeof v !== 'string' || v.length === 0) {
          return `policy.tools.route.dispatch.model_routes.${k} must be a non-empty string`;
        }
      }
    }
  }

  if (tool && typeof doc.routing === 'undefined') {
    return 'policy.routing must be present when policy declares the route.dispatch tool';
  }
  if (typeof doc.routing !== 'undefined') {
    const r = doc.routing;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return 'policy.routing must be an object';
    if (r.default_on_no_band !== 'blocked' && r.default_on_no_band !== 'needs_approval') {
      return 'policy.routing.default_on_no_band must be "blocked" or "needs_approval"';
    }
    if (!Array.isArray(r.bands)) return 'policy.routing.bands must be an array';
    const seen = new Set();
    for (const [i, b] of r.bands.entries()) {
      if (!b || typeof b !== 'object' || Array.isArray(b)) return `policy.routing.bands[${i}] must be an object`;
      for (const k of ['id', 'modality', 'feature', 'target', 'calibration', 'description']) {
        if (typeof b[k] !== 'string' || b[k].length === 0) return `policy.routing.bands[${i}].${k} must be a non-empty string`;
      }
      if (!['image', 'text', 'multimodal'].includes(b.modality)) {
        return `policy.routing.bands[${i}].modality must be one of image|text|multimodal`;
      }
      if (!['calibrated', 'provisional'].includes(b.calibration)) {
        return `policy.routing.bands[${i}].calibration must be "calibrated" or "provisional"`;
      }
      if (typeof b.min !== 'number' || !Number.isFinite(b.min)) return `policy.routing.bands[${i}].min must be a finite number`;
      if (typeof b.max !== 'number' || !Number.isFinite(b.max)) return `policy.routing.bands[${i}].max must be a finite number`;
      if (b.min >= b.max) return `policy.routing.bands[${i}].min must be < max`;
      if (typeof b.all !== 'undefined') {
        if (!Array.isArray(b.all) || !b.all.length) return `policy.routing.bands[${i}].all must be a non-empty array when present`;
        for (const [j, c] of b.all.entries()) {
          if (!c || typeof c !== 'object' || Array.isArray(c)) return `policy.routing.bands[${i}].all[${j}] must be an object`;
          if (typeof c.feature !== 'string' || !c.feature.length) return `policy.routing.bands[${i}].all[${j}].feature must be a non-empty string`;
          if (typeof c.min !== 'number' || !Number.isFinite(c.min) || typeof c.max !== 'number' || !Number.isFinite(c.max) || c.min >= c.max) return `policy.routing.bands[${i}].all[${j}] must have finite min < max`;
        }
      }
      if (seen.has(b.id)) return `policy.routing.bands[${i}].id duplicate: ${b.id}`;
      seen.add(b.id);
      if (tool && tool.targets && !tool.targets.includes(b.target)) {
        return `policy.routing.bands[${i}].target '${b.target}' is not declared in policy.tools.route.dispatch.targets`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// selectBand(routing, modality, feature, value) → band | null.
// PINNED interval semantics (spec §3): min inclusive, max EXCLUSIVE — except
// the LAST band per (modality, feature) group, inclusive on BOTH ends.
// First match in declared array order wins. No match → null (caller applies
// routing.default_on_no_band).
// ---------------------------------------------------------------------------
export function selectBand(routing, modality, feature, value) {
  if (!routing || !Array.isArray(routing.bands) || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const candidates = routing.bands.filter((b) => b && b.modality === modality && b.feature === feature);
  if (!candidates.length) return null;
  const lastIdx = routing.bands.reduce(
    (acc, b, i) => (b && b.modality === modality && b.feature === feature ? i : acc), -1);
  for (let i = 0; i < routing.bands.length; i++) {
    const b = routing.bands[i];
    if (!b || b.modality !== modality || b.feature !== feature) continue;
    const last = i === lastIdx;
    const lo = value >= b.min;
    const hi = last ? value <= b.max : value < b.max;
    if (lo && hi) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------
// routeBoundPayload(action) — the canonical approval payload for route.dispatch
// actions. HASH-PARITY CONTRACT (2026-10-01 boundPayload lesson): byte-identical
// to the stock boundPayloadOf above and to jev-review's boundPayload — the gate
// and createApproval hash the SAME stock shape, so jev-review.boundPayload
// needs NO route.dispatch branch.
// ---------------------------------------------------------------------------
export function routeBoundPayload(action) {
  return boundPayloadOf(action);
}

function routeActionOf(policy, action) {
  if (!action || typeof action !== 'object') return null;
  const tool = policy.tools && policy.tools[action.tool];
  return tool && typeof tool === 'object' ? tool : null;
}

function actionBody(action) {
  if (action && action.body_json && typeof action.body_json === 'string') {
    try { return JSON.parse(action.body_json); } catch { return null; }
  }
  return action && action.body ? action.body : null;
}

function routeApprovalContext(policy, task, action, tool, payloadHash, nowIso) {
  const ttl = typeof policy.approval_ttl_seconds === 'number' && Number.isFinite(policy.approval_ttl_seconds)
    ? policy.approval_ttl_seconds
    : DEFAULT_APPROVAL_TTL_SECONDS;
  const expiresMs = Date.parse(nowIso) + ttl * 1000;
  return {
    task_id: task.id,
    action_id: action.id,
    target: `route.dispatch -> ${action.target}`,
    payload_hash: payloadHash,
    limits: { max_cost_usd: tool.max_cost_usd, max_task_cost_usd: policy.limits.max_task_cost_usd },
    policy_version: policy.version,
    expires_at: new Date(expiresMs).toISOString(),
  };
}

// Shared limits check — identical semantics to stock gateAction step 3.
function limitsBlocked(policy, task, action, tool) {
  const reasons = [];
  const actionCount = task.action_count != null ? Number(task.action_count) : (action.seq != null ? Number(action.seq) : 1);
  if (actionCount > policy.limits.max_actions_per_task) reasons.push('action_limit_exceeded');
  const estCost = typeof action.estimated_cost_usd === 'number' && Number.isFinite(action.estimated_cost_usd)
    ? action.estimated_cost_usd
    : tool.max_cost_usd;
  if ((Number(task.cost_usd) || 0) + estCost > policy.limits.max_task_cost_usd) reasons.push('task_budget_exceeded');
  const attempts = action.attempts != null ? Number(action.attempts) : 0;
  if (attempts >= policy.limits.max_retries_per_action) reasons.push('retries_exhausted');
  return reasons;
}

// ---------------------------------------------------------------------------
// gateRouteDispatch — the route.dispatch branch of the gate.
// Ordered checks (stock semantics preserved where shared):
//   1. policy availability/validity (+ routing block)  → blocked
//   2. action/task parse, tool declared                → blocked
//   3. routing validation (target declared, band found,
//      target/band match)                              → blocked
//   4. pause                                           → blocked
//   5. limits (unchanged)                              → blocked
//   6. provisional band / requires_approval            → needs_approval (+ ctx)
//   7. valid approval                                  → allowed
//   8. otherwise                                       → allowed
// ---------------------------------------------------------------------------
export async function gateRouteDispatch(policy, task, action, approvals = [], nowIso = new Date().toISOString()) {
  const blocked = (reasons) => ({ outcome: 'blocked', reasons, policy_version: policy && policy.version != null ? policy.version : null });

  // 1. policy availability — fail closed (spec §8.6: policy fetch failure is
  //    never a default route).
  if (!policy || typeof policy !== 'object' || policy.error) {
    return { outcome: 'blocked', reasons: ['policy_unavailable'], policy_version: null };
  }
  const vErr = validatePolicyDoc(policy) || validateRoutingDoc(policy);
  if (vErr) return blocked(['policy_invalid: ' + vErr]);

  // 2. parse / unknown tool
  if (!action || typeof action !== 'object') return blocked(['invalid_action']);
  if (!task || !task.id) return blocked(['invalid_task']);
  const tool = routeActionOf(policy, action);
  if (!tool) return blocked(['unknown_tool']);

  // 3. routing validation
  const body = actionBody(action) || {};
  const target = typeof action.target === 'string' && action.target ? action.target : body.target;
  if (typeof target !== 'string' || !target) return blocked(['invalid_action']);
  const declared = Array.isArray(tool.targets) ? tool.targets : [];
  if (!declared.includes(target)) return blocked(['target_not_declared']);
  // READ-ONLY TARGETS (2026-10-11): a target the policy lists in
  // tool.read_only_targets is an in-process read-only measurement with no band
  // and no external effect. Only the band checks are skipped here; the declared
  // target check above and the pause and limit checks below still run.
  const readOnlyTargets = Array.isArray(tool.read_only_targets) ? tool.read_only_targets : [];
  const readOnly = readOnlyTargets.includes(target);
  let band = null;
  if (!readOnly) {
    const bandId = typeof action.band_id === 'string' && action.band_id ? action.band_id : body.band_id;
    if (typeof bandId !== 'string' || !bandId) return blocked(['invalid_action']);
    const routing = policy.routing || {};
    const bands = Array.isArray(routing.bands) ? routing.bands : [];
    band = bands.find((b) => b && b.id === bandId) || null;
    if (!band) return blocked(['band_not_found']);
    if (band.target !== target) return blocked(['target_band_mismatch']);
    if (band.calibration !== 'calibrated' && band.calibration !== 'provisional') {
      return blocked(['band_calibration_unknown']);
    }
  }
  // 3b. tool scope (policy v16): route.dispatch declares none today; fail closed if one is added.
  const routeScope = scopeReasons(tool, action);
  if (routeScope.length) return blocked(routeScope);

  // 4. pause (stock semantics via the local stock helper)
  if (checkPause(policy, task)) return blocked(['pause_active']);

  // 5. limits (unchanged)
  const limitReasons = limitsBlocked(policy, task, action, tool);
  if (limitReasons.length) return blocked(limitReasons);

  // 6/7. approval machinery — provisional bands ride the SAME approval path
  //      as requires_approval tools ("Blocked/needs_approval behaves like
  //      every other action", spec §4). The hash is the STOCK boundPayload
  //      shape, identical to what createApproval stored.
  const needsApproval = (band !== null && band.calibration === 'provisional') || tool.requires_approval === true
    || (typeof task.risk === 'number' && task.risk >= policy.thresholds.risk_requires_approval);
  if (needsApproval) {
    const expectedHash = await canonicalHash(boundPayloadOf(action));
    const matching = (Array.isArray(approvals) ? approvals : []).filter((ap) => ap && ap.action_id === action.id);
    const ap = matching.length ? matching[matching.length - 1] : null;
    if (ap) {
      const verdict = isFreshApproval(ap, policy, action, nowIso, expectedHash);
      if (!verdict.ok) {
        return {
          outcome: 'needs_approval',
          reasons: [verdict.why],
          policy_version: policy.version,
          approval_id: ap.id,
          approval_context: routeApprovalContext(policy, task, action, tool, expectedHash, nowIso),
        };
      }
      return { outcome: 'allowed', reasons: [], policy_version: policy.version, approval_id: ap.id };
    }
    return {
      outcome: 'needs_approval',
      reasons: band !== null && band.calibration === 'provisional' ? ['band_provisional'] : ['tool_requires_approval'],
      policy_version: policy.version,
      approval_context: routeApprovalContext(policy, task, action, tool, expectedHash, nowIso),
    };
  }

  // 8. allowed
  return { outcome: 'allowed', reasons: [], policy_version: policy.version };
}

// patchedGateAction — exported for jev-main's deps.gateAction binding (and for
// tests). The branch inside the stock gateAction above already routes
// route.dispatch here, so this wrapper is behaviorally identical to stock
// gateAction post-patch; it exists so call sites can bind ONE name.
export async function patchedGateAction(policy, task, action, approvals = [], nowIso = new Date().toISOString()) {
  return gateAction(policy, task, action, approvals, nowIso);
}