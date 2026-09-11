// lib/preview-route.mjs
// POST /api/map/preview — measure a CANDIDATE corpus under a frozen stored
// baseline frame without changing any stored state.
//
// Non-negotiable properties (asserted by test-preview.mjs):
//   - NO D1 write, NO Vectorize write, NO map row, ever. `saveMap` is passed
//     in as a throwing spy so a future edit that tries to persist fails loudly
//     instead of silently writing.
//   - The ONLY disclosed side effect is the content-hash embedding cache in
//     env.SITE (embedDocuments' existing per-document KV entry, vector only,
//     never raw text). Reported as side_effects.embedding_cache = true.
//   - Every shape / size / diff / stale-source check runs BEFORE any AI or KV
//     call, so a malformed or stale request costs no model work.
//   - The instrument is inherited, never negotiated: the baseline's frozen
//     frame and d/K/T/seed/steps/threshold are reused. A caller-supplied frame
//     or setting is REJECTED with 409 (documented policy — never silently
//     ignored), because a silently-ignored setting makes the returned map
//     indistinguishable from one the caller actually asked for.
//   - roundoff_budget / perturbation_linf / predicted_delta are ADDITIVE
//     diagnostics only. They feed only additive diagnostic outputs in runMap, so they
//     cannot move frame_id or instrument_id.
//
// `names` are opaque literal path strings used only as map keys. Nothing here
// touches a filesystem or a repository, so a traversal-looking name
// ("../../etc/passwd") is a harmless label, not a path — it is accepted as a
// literal and tested as such.

import { ApiError } from "./http.mjs";
import { sha256Hex } from "./chunking.mjs";
import { validateDocs } from "./embed-pipeline.mjs";
import { mapRouteHandler } from "./map-route.mjs";

/** Settings the preview refuses to take from the caller. Rejecting (rather
 *  than ignoring) is the documented unambiguous policy. */
const INHERITED_ONLY = ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels"];

const NEW_TEXT_BASELINE = "create a new text baseline with POST /api/map {texts, names}";

function nonEmptyString(v, what) {
  if (typeof v !== "string" || v.length === 0) throw new ApiError(422, `${what} must be a nonempty string`);
  return v;
}

/** Validates the additive diagnostic numbers. Finite; the two budgets are
 *  nonnegative. Never affects the instrument. */
function diagnosticOptions(body) {
  const out = {};
  for (const [key, min] of [["predicted_delta", null], ["perturbation_linf", 0], ["roundoff_budget", Number.MIN_VALUE]]) {
    if (body[key] == null) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v) || (min !== null && v < min)) {
      throw new ApiError(422, `${key} must be a finite number${min !== null ? " >= 0" : ""}`);
    }
    out[key] = v;
  }
  return out;
}

/** Cheap, AI-free validation of the whole request shape. */
function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.baseline_id) || body.baseline_id < 1) throw new ApiError(422, "baseline_id must be a positive integer");

  const { texts, names } = body;
  if (!Array.isArray(texts) || texts.length < 10 || texts.length > 400) {
    throw new ApiError(422, "texts must be the FULL resulting corpus as 10..400 items (not just the changed document)");
  }
  texts.forEach((t, i) => { if (typeof t !== "string" || !t.trim()) throw new ApiError(422, `texts[${i}] must be a nonempty string`); });
  if (!Array.isArray(names) || names.length !== texts.length) throw new ApiError(422, "names must contain one literal path per text");
  names.forEach((n, i) => nonEmptyString(n, `names[${i}]`));
  if (new Set(names).size !== names.length) throw new ApiError(422, "names must be unique stable paths");

  const target = body.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new ApiError(422, "target must be an object");
  if (target.action !== "add" && target.action !== "change") throw new ApiError(422, "target.action must be 'add' or 'change'");
  nonEmptyString(target.name, "target.name");

  const diagnostics = diagnosticOptions(body);

  for (const key of INHERITED_ONLY) {
    if (body[key] !== undefined) {
      throw new ApiError(409, `preview inherits the baseline's frozen frame and settings; remove ${key} from the request`, { inherited_only: INHERITED_ONLY });
    }
  }
  return { texts, names, target, diagnostics };
}

/** The baseline must be a v0.2, frozen-frame, chunked/v1 TEXT baseline with
 *  per-document SHA256s and full-precision points/bits. Anything else (legacy,
 *  vector-sourced, metadata-less) is a 409 that asks for a new text baseline
 *  rather than a best-effort comparison on missing evidence. */
function requireTextBaseline(baseline) {
  if (!baseline) throw new ApiError(404, "baseline not found");
  if (!baseline.frame || baseline.version !== "pointmap/0.2") {
    throw new ApiError(409, `baseline predates the v0.2 frozen-frame instrument; ${NEW_TEXT_BASELINE}`);
  }
  const docs = baseline.embedding_metadata && baseline.embedding_metadata.docs;
  const names = baseline.names;
  if (baseline.preprocessing_id !== "chunked/v1" || !Array.isArray(names) || !Array.isArray(docs) ||
      docs.length !== names.length || docs.some((d) => !d || typeof d.sha256 !== "string" || d.sha256.length === 0)) {
    throw new ApiError(409, `baseline has no chunked/v1 per-document SHA256 metadata (vector-sourced or legacy baseline); ${NEW_TEXT_BASELINE}`);
  }
  if (!Array.isArray(baseline.pts_full) || !Array.isArray(baseline.bits) ||
      baseline.pts_full.length !== names.length || baseline.bits.length !== names.length ||
      baseline.pts_full.some((p) => !Array.isArray(p)) || baseline.bits.some((b) => !Array.isArray(b))) {
    throw new ApiError(409, `baseline is missing full-precision points/bits needed for exact anchor verification; ${NEW_TEXT_BASELINE}`);
  }
  const index = new Map();
  names.forEach((n, i) => index.set(n, { index: i, sha256: docs[i].sha256 }));
  if (index.size !== names.length) throw new ApiError(409, `baseline names are not unique; ${NEW_TEXT_BASELINE}`);
  return index;
}

/** Exact ADD/CHANGE diff against the baseline's stored source hashes. Runs on
 *  locally-computed SHA256s only — no AI, no KV. */
function resolveTargetDiff(beforeByName, afterByName, target) {
  const added = [...afterByName.keys()].filter((n) => !beforeByName.has(n));
  const missing = [...beforeByName.keys()].filter((n) => !afterByName.has(n));
  if (missing.length) {
    throw new ApiError(409, "preview never deletes: every baseline name must still be present in the resulting corpus", { missing_names: missing.slice(0, 10), missing_count: missing.length });
  }
  // computed only once every baseline name is known to still be present
  const changed = [...beforeByName].filter(([n, b]) => afterByName.get(n).sha256 !== b.sha256).map(([n]) => n);
  if (target.action === "add") {
    if (added.length !== 1 || added[0] !== target.name) {
      throw new ApiError(409, "ADD must introduce exactly one new name, equal to target.name", { added_names: added.slice(0, 10), added_count: added.length, target_name: target.name });
    }
    if (changed.length) {
      throw new ApiError(409, "ADD must not modify any existing document's source", { changed_names: changed.slice(0, 10), changed_count: changed.length });
    }
    return { noop: false, before_sha256: null, after_sha256: afterByName.get(target.name).sha256, changed };
  }
  if (added.length) {
    throw new ApiError(409, "CHANGE must keep exactly the same name set", { added_names: added.slice(0, 10), added_count: added.length });
  }
  if (!beforeByName.has(target.name)) {
    throw new ApiError(409, "target.name is not present in the baseline", { target_name: target.name });
  }
  if (changed.length > 1 || (changed.length === 1 && changed[0] !== target.name)) {
    throw new ApiError(409, "CHANGE must alter exactly one name, and it must be target.name", { changed_names: changed.slice(0, 10), changed_count: changed.length, target_name: target.name });
  }
  return {
    noop: changed.length === 0,
    before_sha256: beforeByName.get(target.name).sha256,
    after_sha256: afterByName.get(target.name).sha256,
    changed,
  };
}

/**
 * ctx: { env, PM, embedDocuments, loadStoredMap,
 *        explainTransition?, projectionMargins? }
 *
 * `explainTransition` / `projectionMargins` are injectable so a caller (or a
 * test) can supply the helper explicitly. When neither the injection nor the
 * loaded core provides them, the response says so honestly instead of
 * fabricating a ledger.
 */
export async function mapPreviewHandler(body, ctx) {
  const { env, PM, embedDocuments, loadStoredMap } = ctx;
  const { texts, names, target, diagnostics } = validateRequest(body);
  validateDocs(texts);

  const baseline = await loadStoredMap(body.baseline_id);
  const beforeByName = requireTextBaseline(baseline);

  // Local SHA256 of the plain full UTF-8 content — same definition as
  // embedding_metadata.docs[i].sha256, so the two are directly comparable.
  const afterHashes = await Promise.all(texts.map((t) => sha256Hex(t)));
  const afterByName = new Map();
  names.forEach((n, i) => afterByName.set(n, { index: i, sha256: afterHashes[i] }));

  const diff = resolveTargetDiff(beforeByName, afterByName, target);
  const unchanged_source_count = beforeByName.size - diff.changed.length;

  // ---- from here on AI/KV work may happen; nothing above touched either ----
  const saveMap = async () => { throw new ApiError(500, "preview must never persist a map"); };
  const result = await mapRouteHandler(
    { texts, names, baseline_id: body.baseline_id, persist: false, ...diagnostics },
    { env, PM, embedDocuments, loadStoredMap, saveMap, explainTransition: ctx.explainTransition }
  );
  const map = result.map;

  // Exact anchor verification by name: untouched items must land on byte-equal
  // full points and identical bits. Drift means the frozen-frame assumption
  // did not hold and the preview is not comparable.
  const afterIndex = new Map();
  (map.names || []).forEach((n, j) => afterIndex.set(n, j));
  const drift = [];
  const representation_drift_names = [];
  let unchanged_anchor_count = 0;
  for (const [name, before] of beforeByName) {
    if (target.action === "change" && name === target.name && !diff.noop) continue;
    const j = afterIndex.get(name);
    const bp = baseline.pts_full[before.index], ap = map.pts_full[j];
    const bb = baseline.bits[before.index], ab = map.bits[j];
    const points_equal = Array.isArray(ap) && ap.length === bp.length && bp.every((x, k) => x === ap[k]);
    const bits_equal = Array.isArray(ab) && ab.length === bb.length && bb.every((x, k) => x === ab[k]);
    if (!points_equal || !bits_equal) { drift.push({ name, points_equal, bits_equal }); continue; }
    unchanged_anchor_count++;
    // Same full points, same bits, same source hash, different cached vector
    // fingerprint: a representation-level difference that did not move the
    // graph. Logged, not fatal — it does not invalidate graph stability.
    const bh = baseline.keys && baseline.keys[before.index] && baseline.keys[before.index].hash;
    const ah = map.keys && map.keys[j] && map.keys[j].hash;
    if (bh && ah && bh !== ah) representation_drift_names.push(name);
  }
  if (drift.length) {
    throw new ApiError(409, "untouched anchors moved on the frozen frame; this preview is not comparable to the baseline", { drift: drift.slice(0, 10), drift_count: drift.length });
  }
  if (representation_drift_names.length) {
    console.log(JSON.stringify({
      event: "preview_representation_drift",
      baseline_id: body.baseline_id,
      count: representation_drift_names.length,
      names: representation_drift_names.slice(0, 10),
      note: "identical full points, bits and source SHA256 with a different cached vector fingerprint: representation drift only — graph stability is not invalidated",
    }));
  }

  if (!map.math_diagnostics || !result.math_ledger || result.math_ledger.kind === "not-applicable") throw new ApiError(409,"preview lacks an applicable math ledger");
  const {per_input, ...sharedDiagnostics}=map.math_diagnostics;
  const map_diagnostics = { available:true, ...sharedDiagnostics,
    target_input: map.math_diagnostics.per_input.find(r=>r.name===target.name),
    excluded_from_instrument_identity:true,
    note:"Conditional diagnostic budgets are excluded from the frozen instrument hash." };

  return {
    preview: true,
    persisted: false,
    baseline_id: body.baseline_id,
    map,
    comparison: result.comparison,
    comparison_note: target.action === "add"
      ? "name-set comparison is unsupported for ADD by the existing PM.compareMaps (same-name-set only); comparison.comparable is false and the per-anchor evidence is unchanged_anchor_count"
      : "per-name comparison on the inherited frozen frame",
    math_ledger: result.math_ledger || { available: false, reason: "PM.explainTransition is not implemented in the loaded core" },
    map_diagnostics,
    target: {
      action: target.action,
      name: target.name,
      before_sha256: diff.before_sha256,
      after_sha256: diff.after_sha256,
      noop: diff.noop,
      noop_note: diff.noop ? "the supplied target text is byte-identical to the baseline source: this CHANGE is a no-op and nothing moved" : null,
    },
    unchanged_source_count,
    unchanged_anchor_count,
    representation_drift_names,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: true },
    side_effects_note: "the content-hash embedding cache (env.SITE) may gain per-document vector entries via the existing embedDocuments path; no raw text, no credentials and no raw vectors are stored anywhere else, and no D1/Vectorize/repository write occurs",
    task_verdict: "not-tested",
    task_verdict_note: "geometry only: whether the candidate edit improves the underlying task is not tested here and must be checked by a task-specific independent verifier",
  };
}
