// lib/outcomes-route.mjs
// POST /api/outcomes, GET /api/outcomes — an APPEND-ONLY pre-registration
// ledger joining a geometric prediction to an independent task verdict.
//
// Methodology transplant (outcomes/1): business-metric-aware forecasting
// (google-research/business_metric_aware_forecasting, arXiv:2308.13118) and
// the COVID-19 public forecasts evaluate a forecaster on the decision it
// feeds, not on a proxy loss, and they evaluate prospectively — predictions
// are frozen BEFORE outcomes are seen. The wayfinder's own refs name this as
// the open gap: "Freeze a held-out edit benchmark before seeing outcomes"
// (refs/wayfinder-audit-2026-09-09.md), "Only prospective outcome data can
// raise the forward-prediction score" (refs/navier-stokes-wayfinder-math-
// 2026-09-10.md), "Preserve neutral/fragile outcomes, abstentions and error
// costs" (refs/landau-radius-research-2026-09-13.md §7). Every historical
// count so far ("2 kept, 5 reverted, 1 declined", "4/10 sign agreement") lives
// in prose. This ledger gives those counts a typed, immutable home.
//
// Discipline:
//   - Append-only. No PUT, no DELETE. A correction is a NEW row whose
//     `supersedes` points at the earlier row; both stay visible.
//   - Two-phase by design: register the prediction with verdict `pending`
//     BEFORE the task check, then append the verdict row afterwards. A row
//     that arrives with prediction and verdict together is legal but is
//     flagged `preregistered:false` so a reader can tell the two apart.
//   - The observed geometric delta is recomputed by the server from two
//     stored maps whenever `after_id` is supplied (PM.explainTransition on the
//     frozen frame). A caller-supplied `observed_delta` is stored with
//     `observed_source:"caller"` and never silently mixed with server values.
//   - The verdict is the independent verifier's word, never the API's. The
//     API stores it; it does not grade, weight, smooth or score it.
//   - GET returns rows plus a contingency table of COUNTS with n. No rate,
//     no percentage, no z. AGENT.md: historical counts are not a benchmark.

import { ApiError } from "./http.mjs";

export const VERSION = "outcomes/1";
export const VERDICTS = Object.freeze(["pending", "kept", "reverted", "declined", "abstained", "neutral"]);
export const MAX_VERIFIER = 200;
export const MAX_NOTES = 2000;
export const MAX_ROWS = 500;

export const SCOPE = "Append-only pre-registration ledger: a geometric prediction (predicted_delta) frozen before the task check, the recomputed observed geometric delta on the same frozen frame, and the INDEPENDENT verifier's verdict. Counts are retrospective outcomes on the corpora that were actually tried; they are not a calibrated success rate, not a benchmark and not evidence that geometry predicts task quality. Report n with every count; never convert these counts into a rate or a significance claim.";

function posInt(v, what) {
  if (!Number.isSafeInteger(v) || v < 1) throw new ApiError(422, `${what} must be a positive integer`);
  return v;
}
function sign(x) { if (x === null || x === undefined || !Number.isFinite(x)) return "none"; return x < 0 ? "negative" : x > 0 ? "positive" : "zero"; }

export function validateOutcomeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  const baseline_id = posInt(body.baseline_id, "baseline_id");
  const t = body.target;
  if (!t || typeof t !== "object" || Array.isArray(t)) throw new ApiError(422, "target must be an object");
  if (t.action !== "add" && t.action !== "change") throw new ApiError(422, "target.action must be 'add' or 'change'");
  if (typeof t.name !== "string" || !t.name.length) throw new ApiError(422, "target.name must be a nonempty string");
  let predicted_delta = null;
  if (body.predicted_delta !== undefined && body.predicted_delta !== null) {
    if (typeof body.predicted_delta !== "number" || !Number.isFinite(body.predicted_delta)) throw new ApiError(422, "predicted_delta must be a finite number or null");
    predicted_delta = body.predicted_delta;
  }
  let after_id = null;
  if (body.after_id !== undefined && body.after_id !== null) after_id = posInt(body.after_id, "after_id");
  let observed_delta = null;
  if (body.observed_delta !== undefined && body.observed_delta !== null) {
    if (typeof body.observed_delta !== "number" || !Number.isFinite(body.observed_delta)) throw new ApiError(422, "observed_delta must be a finite number or null");
    observed_delta = body.observed_delta;
  }
  if (after_id !== null && observed_delta !== null) throw new ApiError(422, "supply after_id (server recomputes the observed delta) OR observed_delta (caller-supplied), not both");
  const tc = body.task_check;
  if (!tc || typeof tc !== "object" || Array.isArray(tc)) throw new ApiError(422, "task_check must be an object {verdict, verifier, notes?}");
  if (!VERDICTS.includes(tc.verdict)) throw new ApiError(422, `task_check.verdict must be one of ${VERDICTS.join(", ")}`);
  if (typeof tc.verifier !== "string" || !tc.verifier.trim() || tc.verifier.length > MAX_VERIFIER) throw new ApiError(422, `task_check.verifier must name the independent verifier (1..${MAX_VERIFIER} chars)`);
  if (tc.notes !== undefined && (typeof tc.notes !== "string" || tc.notes.length > MAX_NOTES)) throw new ApiError(422, `task_check.notes must be a string of at most ${MAX_NOTES} chars`);
  if (tc.verdict !== "pending" && tc.verifier.trim().toLowerCase() === "geometry") throw new ApiError(422, "the verifier must be independent of the geometry; 'geometry' is not an admissible verifier");
  let supersedes = null;
  if (body.supersedes !== undefined && body.supersedes !== null) supersedes = posInt(body.supersedes, "supersedes");
  for (const key of ["score", "quality", "success_rate", "rate", "confidence", "z"]) {
    if (body[key] !== undefined) throw new ApiError(422, `${key} is not accepted: the ledger stores predictions, observed deltas and independent verdicts only`);
  }
  return { baseline_id, target: { action: t.action, name: t.name }, predicted_delta, after_id, observed_delta, task_check: { verdict: tc.verdict, verifier: tc.verifier.trim(), notes: tc.notes ?? null }, supersedes };
}

/**
 * ctx: { loadStoredMap, insertOutcome, getOutcome, PM, now? }
 *   insertOutcome(entry) -> id ; getOutcome(id) -> entry|null
 */
export async function outcomesPostHandler(body, ctx) {
  const v = validateOutcomeBody(body);
  const baseline = await ctx.loadStoredMap(v.baseline_id);
  if (!baseline) throw new ApiError(404, "baseline not found");
  if (!baseline.frame) throw new ApiError(409, "legacy baseline has no frozen frame; create a new baseline");
  if (v.target.action === "change" && Array.isArray(baseline.names) && !baseline.names.includes(v.target.name)) {
    throw new ApiError(409, "CHANGE target.name is not present in the baseline", { target_name: v.target.name });
  }
  if (v.target.action === "add" && Array.isArray(baseline.names) && baseline.names.includes(v.target.name)) {
    throw new ApiError(409, "ADD target.name already exists in the baseline", { target_name: v.target.name });
  }

  let observed = { delta: null, source: "none", frame_id: baseline.frame_id ?? null, after_frame_id: null, ledger_kind: null };
  if (v.after_id !== null) {
    const after = await ctx.loadStoredMap(v.after_id);
    if (!after) throw new ApiError(404, "after map not found");
    if (!after.frame) throw new ApiError(409, "after map has no frozen frame");
    let ledger;
    try { ledger = ctx.PM.explainTransition(baseline, after); }
    catch (e) { throw new ApiError(409, `observed delta could not be recomputed on one frozen frame: ${e.message}`); }
    const actual = ledger && ledger.measurement && Number.isFinite(ledger.measurement.actual_delta) ? ledger.measurement.actual_delta
      : (ledger && ledger.ledger && Number.isFinite(ledger.ledger.actual_delta) ? ledger.ledger.actual_delta : null);
    if (actual === null) throw new ApiError(409, "transition ledger did not yield a recomputed actual_delta");
    const moved = ledger.moved_name ?? ledger.added_name ?? null;
    if (moved && moved !== v.target.name) throw new ApiError(409, "the stored transition moves a different name than target.name", { ledger_name: moved, target_name: v.target.name });
    observed = { delta: actual, source: "server:explainTransition", frame_id: baseline.frame_id ?? null, after_frame_id: after.frame_id ?? null, ledger_kind: ledger.kind ?? ledger.class ?? null };
  } else if (v.observed_delta !== null) {
    observed = { delta: v.observed_delta, source: "caller", frame_id: baseline.frame_id ?? null, after_frame_id: null, ledger_kind: null };
  }

  if (v.supersedes !== null) {
    const prev = await ctx.getOutcome(v.supersedes);
    if (!prev) throw new ApiError(404, "supersedes row not found");
    if (prev.baseline_id !== v.baseline_id || prev.target.name !== v.target.name || prev.target.action !== v.target.action) {
      throw new ApiError(409, "a superseding row must share baseline_id and target with the row it supersedes");
    }
  }

  const now = (ctx.now ? ctx.now() : new Date()).toISOString();
  const preregistered = v.task_check.verdict === "pending" || v.supersedes !== null;
  const entry = {
    version: VERSION,
    created_at: now,
    baseline_id: v.baseline_id,
    after_id: v.after_id,
    target: v.target,
    predicted_delta: v.predicted_delta,
    predicted_sign: sign(v.predicted_delta),
    observed_delta: observed.delta,
    observed_sign: sign(observed.delta),
    observed_source: observed.source,
    frame_id: observed.frame_id,
    after_frame_id: observed.after_frame_id,
    ledger_kind: observed.ledger_kind,
    sign_exact: (v.predicted_delta !== null && observed.delta !== null) ? sign(v.predicted_delta) === sign(observed.delta) : null,
    task_check: v.task_check,
    supersedes: v.supersedes,
    preregistered,
    preregistered_note: preregistered ? "prediction registered before (or independently of) the verdict row" : "prediction and verdict arrived in one row; the ledger cannot show the prediction was frozen before the check",
  };
  const id = await ctx.insertOutcome(entry);
  return { id, entry: { id, ...entry }, persisted: true, append_only: true, scope: SCOPE };
}

/** Contingency of COUNTS over the effective rows (non-pending, not superseded). */
export function contingency(rows) {
  const superseded = new Set(rows.filter((r) => r.supersedes).map((r) => r.supersedes));
  const effective = rows.filter((r) => r.task_check && r.task_check.verdict !== "pending" && !superseded.has(r.id));
  const byVerdict = {}; for (const vv of VERDICTS) if (vv !== "pending") byVerdict[vv] = 0;
  const signs = ["negative", "zero", "positive", "none"];
  const predVsObs = {}; for (const p of signs) { predVsObs[p] = {}; for (const o of signs) predVsObs[p][o] = 0; }
  const verdictBySignExact = { exact: {}, not_exact: {}, untested: {} };
  for (const k of Object.keys(verdictBySignExact)) for (const vv of VERDICTS) if (vv !== "pending") verdictBySignExact[k][vv] = 0;
  let exact = 0, comparable = 0, server_observed = 0, caller_observed = 0, preregistered = 0;
  for (const r of effective) {
    byVerdict[r.task_check.verdict] = (byVerdict[r.task_check.verdict] || 0) + 1;
    predVsObs[r.predicted_sign][r.observed_sign]++;
    if (r.sign_exact === true) { exact++; comparable++; verdictBySignExact.exact[r.task_check.verdict]++; }
    else if (r.sign_exact === false) { comparable++; verdictBySignExact.not_exact[r.task_check.verdict]++; }
    else verdictBySignExact.untested[r.task_check.verdict]++;
    if (r.observed_source === "server:explainTransition") server_observed++; else if (r.observed_source === "caller") caller_observed++;
    if (r.preregistered) preregistered++;
  }
  return {
    n_rows: rows.length,
    n_pending: rows.filter((r) => r.task_check && r.task_check.verdict === "pending").length,
    n_superseded: superseded.size,
    n_effective: effective.length,
    n_preregistered: preregistered,
    n_sign_comparable: comparable,
    sign_exact_count: exact,
    observed_source_counts: { server: server_observed, caller: caller_observed, none: effective.length - server_observed - caller_observed },
    by_verdict: byVerdict,
    predicted_sign_by_observed_sign: predVsObs,
    verdict_by_sign_exact: verdictBySignExact,
    note: "counts only, with n; a sign-exact geometric prediction is an instrumentation outcome, not a task-quality outcome, and a kept verdict does not imply the geometry predicted it",
  };
}

/** ctx: { listOutcomes(baseline_id|null) -> rows (ascending id, each {id,...entry}) } */
export async function outcomesGetHandler(query, ctx) {
  let baseline_id = null, frame_id = null;
  if (query && query.baseline_id !== undefined && query.baseline_id !== null && query.baseline_id !== "") {
    const n = Number(query.baseline_id);
    baseline_id = posInt(n, "baseline_id");
  }
  if (query && typeof query.frame_id === "string" && query.frame_id.length) {
    if (!/^[0-9a-f]{8,32}$/i.test(query.frame_id)) throw new ApiError(422, "frame_id must be a hex fingerprint");
    frame_id = query.frame_id.toLowerCase();
  }
  let rows = await ctx.listOutcomes(baseline_id);
  // a chained round spreads its rows over many baseline ids on ONE frozen frame; frame_id gathers them (round-11 lesson)
  if (frame_id !== null) rows = rows.filter((r) => typeof r.frame_id === "string" && r.frame_id.toLowerCase() === frame_id);
  if (!Array.isArray(rows)) throw new ApiError(503, "outcome storage unavailable");
  return { version: VERSION, baseline_id, frame_id, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, contingency: contingency(rows), append_only: true, scope: SCOPE };
}
