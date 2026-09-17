// lib/control-route.mjs
// POST /api/map/control — a POSITIVE CONTROL for the frozen instrument.
//
// Methodology transplant (calibration/1): CutPaste (Li, Sohn, Yoon, Pfister,
// CVPR 2021, arXiv:2104.04015) trains one-class detectors on normal data plus
// synthetic anomalies made by cutting a patch from one image and pasting it
// into another. The is-this-x paper's standard-candle generator applies the
// same discipline to corpora: a known planted signal is the only way to state
// detection power, and a matched null is the only way to state false alarms.
//
// The wayfinder already has the null (fixed-attempt checkerboard chain). It
// has never had a positive control: nothing states how the frozen isolation
// instrument responds to a content change of KNOWN size. This route supplies
// that. For n seeded (host, donor) pairs it splices a contiguous donor segment
// into the middle 25% of the host document, measures each splice as an
// ordinary one-name CHANGE on the frozen baseline via the existing preview
// path, and reports the distribution of the actual instrument response.
//
// What this IS: a detection-sensitivity control for the existing statistic.
// What this is NOT: a quality score, a task-success rate, an admitted map
// coordinate, a ranking term, or a reason to keep/revert/delete anything.
//
// Non-negotiable properties (asserted by test-control.mjs):
//   - Runs on the EXACT baseline corpus: every name present, every SHA256
//     equal. Anything else is 409 — a control on a drifted corpus is not a
//     control.
//   - Reuses mapPreviewHandler per splice, so NO D1 write, NO Vectorize
//     write, NO map row, ever. Only the disclosed content-hash embedding cache.
//   - The splice recipe is fixed (fraction 0.25, centered window, generator
//     id `cutpaste-splice/1`). Requests that try to tune it are rejected, the
//     same way radius grids are rejected. n_controls and control_seed are the
//     only knobs and both are echoed.
//   - Every shape/hash check runs BEFORE any AI or KV call.
//   - Summary fields are counts, minima, medians and maxima with n attached.
//     No ratio is presented as a rate and no z is computed from them.

import { ApiError } from "./http.mjs";
import { MAX_ITEMS } from "./limits.mjs";
import { sha256Hex } from "./chunking.mjs";
import { validateDocs } from "./embed-pipeline.mjs";
import { mapPreviewHandler, requireTextBaseline } from "./preview-route.mjs";

export const VERSION = "calibration/1";
export const GENERATOR = "cutpaste-splice/1";
export const SPLICE_FRACTION = 0.25;
export const DEFAULT_N = 4;
export const MIN_N = 2;
export const MAX_N = 6;
export const DEFAULT_SEED = 20260917;

const FIXED_RECIPE_KEYS = ["splice_fraction", "fraction", "generator", "recipe", "window", "hosts", "donors", "host", "donor", "segment"];
const INHERITED_ONLY = ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels", "target", "predicted_delta"];

export const SCOPE = "Positive control (CutPaste-style splice, fixed generator): measures how the frozen instrument responds to a content change of known size. It calibrates detection sensitivity of the existing isolation/displacement statistics on this frame only. It is not a quality score, not a task-success rate, not an admitted map coordinate and not a ranking term; it never authorizes keeping, reverting or deleting a document. Compare controls only on the same frame_id/instrument_id and report n with every count.";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Move a code-unit index off the middle of a surrogate pair so a cut never
 *  produces a lone surrogate (which TextEncoder would rewrite to U+FFFD and
 *  silently change the content hash semantics). */
function safeCut(str, i) {
  if (i <= 0) return 0;
  if (i >= str.length) return str.length;
  const c = str.charCodeAt(i);
  return (c >= 0xDC00 && c <= 0xDFFF) ? i - 1 : i;
}

/** Deterministic splice plan for one control: a centered host window of
 *  round(0.25 * host length) code units is replaced by a contiguous donor
 *  segment of the same length (or the whole donor if shorter). */
export function planSplice(hostText, donorText, rng) {
  const len = Math.max(1, Math.round(SPLICE_FRACTION * hostText.length));
  let start = safeCut(hostText, Math.round((hostText.length - len) / 2));
  let end = safeCut(hostText, start + len);
  if (end <= start) end = Math.min(hostText.length, start + 1);
  const donorLen = Math.min(end - start, donorText.length);
  const dmax = donorText.length - donorLen;
  let dstart = safeCut(donorText, Math.floor(rng() * (dmax + 1)));
  let dend = safeCut(donorText, dstart + donorLen);
  if (dend <= dstart) dend = Math.min(donorText.length, dstart + 1);
  const segment = donorText.slice(dstart, dend);
  const synthetic = hostText.slice(0, start) + segment + hostText.slice(end);
  return { start, end, donor_start: dstart, donor_end: dend, removed_units: end - start, inserted_units: dend - dstart, synthetic };
}

/** Seeded (host, donor) pairs over N documents. host != donor always. */
export function planControls(N, n, seed) {
  const rng = mulberry32(seed);
  const plans = [];
  for (let i = 0; i < n; i++) {
    const host = Math.floor(rng() * N);
    let donor = Math.floor(rng() * (N - 1));
    if (donor >= host) donor++;
    plans.push({ i, host, donor, rng });
  }
  return plans;
}

function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.baseline_id) || body.baseline_id < 1) throw new ApiError(422, "baseline_id must be a positive integer");
  const { texts, names } = body;
  if (!Array.isArray(texts) || texts.length < 10 || texts.length > MAX_ITEMS) throw new ApiError(422, `texts must be the FULL baseline corpus as 10..${MAX_ITEMS} items`);
  texts.forEach((t, i) => { if (typeof t !== "string" || !t.trim()) throw new ApiError(422, `texts[${i}] must be a nonempty string`); });
  if (!Array.isArray(names) || names.length !== texts.length) throw new ApiError(422, "names must contain one literal path per text");
  names.forEach((n, i) => { if (typeof n !== "string" || !n.length) throw new ApiError(422, `names[${i}] must be a nonempty string`); });
  if (new Set(names).size !== names.length) throw new ApiError(422, "names must be unique stable paths");
  for (const key of FIXED_RECIPE_KEYS) {
    if (body[key] !== undefined) throw new ApiError(422, `the control recipe is fixed (${GENERATOR}, splice_fraction ${SPLICE_FRACTION}); remove ${key}. Do not tune a control to the result it produces.`, { fixed_recipe_keys: FIXED_RECIPE_KEYS });
  }
  for (const key of INHERITED_ONLY) {
    if (body[key] !== undefined) throw new ApiError(409, `control inherits the baseline's frozen frame and settings; remove ${key} from the request`, { inherited_only: INHERITED_ONLY });
  }
  let n = DEFAULT_N;
  if (body.n_controls !== undefined) {
    if (!Number.isInteger(body.n_controls) || body.n_controls < MIN_N || body.n_controls > MAX_N) throw new ApiError(422, `n_controls must be an integer in ${MIN_N}..${MAX_N}`);
    n = body.n_controls;
  }
  let seed = DEFAULT_SEED;
  if (body.control_seed !== undefined) {
    if (!Number.isInteger(body.control_seed) || body.control_seed < -2147483648 || body.control_seed > 4294967295) throw new ApiError(422, "control_seed must be an integer in -2147483648..4294967295");
    seed = body.control_seed;
  }
  return { texts, names, n, seed };
}

/** explainTransition reports the recomputed delta under measurement.actual_delta (identity copy under ledger.actual_delta). */
function ledgerDelta(l) {
  if (!l) return null;
  const m = l.measurement && Number.isFinite(l.measurement.actual_delta) ? l.measurement.actual_delta : null;
  if (m !== null) return m;
  return l.ledger && Number.isFinite(l.ledger.actual_delta) ? l.ledger.actual_delta : (Number.isFinite(l.actual_delta) ? l.actual_delta : null);
}

function quantiles(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return { n: 0, min: null, median: null, max: null };
  const mid = v.length >> 1;
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, min: v[0], median, max: v[v.length - 1] };
}

function signCounts(values) {
  const out = { negative: 0, zero: 0, positive: 0, n: 0 };
  for (const x of values) { if (!Number.isFinite(x)) continue; out.n++; if (x < 0) out.negative++; else if (x > 0) out.positive++; else out.zero++; }
  return out;
}

/**
 * ctx: { env, PM, embedDocuments, loadStoredMap, previewHandler? }
 * `previewHandler` is injectable for tests; defaults to the real
 * mapPreviewHandler so every control is measured by the shipped preview path.
 */
export async function mapControlHandler(body, ctx) {
  const { env, PM, embedDocuments } = ctx;
  // One request = one baseline. Memoize the stored-map load so n controls do
  // not re-read (and re-decode) the same ~MB row 2n times from D1.
  const loadCache = new Map();
  const loadStoredMap = async (id) => { const k = Number(id); if (!loadCache.has(k)) loadCache.set(k, await ctx.loadStoredMap(k)); return loadCache.get(k); };
  const preview = ctx.previewHandler || mapPreviewHandler;
  const { texts, names, n, seed } = validateRequest(body);
  validateDocs(texts);

  const baseline = await loadStoredMap(body.baseline_id);
  const beforeByName = requireTextBaseline(baseline);

  // ---- exact-corpus gate: all hashes local, no AI, no KV ----
  const hashes = await Promise.all(texts.map((t) => sha256Hex(t)));
  const missing = [...beforeByName.keys()].filter((nm) => !names.includes(nm));
  const added = names.filter((nm) => !beforeByName.has(nm));
  const changed = names.filter((nm, i) => beforeByName.has(nm) && beforeByName.get(nm).sha256 !== hashes[i]);
  if (missing.length || added.length || changed.length) {
    throw new ApiError(409, "control runs on the EXACT baseline corpus: every baseline name must be present with an identical SHA256 and no extra names", {
      missing_count: missing.length, missing_names: missing.slice(0, 10),
      added_count: added.length, added_names: added.slice(0, 10),
      changed_count: changed.length, changed_names: changed.slice(0, 10),
    });
  }

  const plans = planControls(texts.length, n, seed);
  const controls = [];
  let degenerate = 0;
  for (const plan of plans) {
    const hostName = names[plan.host], donorName = names[plan.donor];
    const splice = planSplice(texts[plan.host], texts[plan.donor], plan.rng);
    if (splice.synthetic === texts[plan.host] || !splice.synthetic.trim()) {
      degenerate++;
      controls.push({ i: plan.i, host: hostName, donor: donorName, degenerate: true, reason: "splice produced byte-identical or empty text; not measured", splice: { ...splice, synthetic: undefined } });
      continue;
    }
    const synthTexts = texts.slice(); synthTexts[plan.host] = splice.synthetic;
    const r = await preview(
      { baseline_id: body.baseline_id, texts: synthTexts, names, target: { action: "change", name: hostName } },
      { env, PM, embedDocuments, loadStoredMap }
    );
    const per = (r.comparison && Array.isArray(r.comparison.per_name)) ? r.comparison.per_name.find((x) => x.name === hostName) : null;
    const ledger = r.math_ledger || null;
    controls.push({
      i: plan.i,
      host: hostName,
      donor: donorName,
      degenerate: false,
      splice: { start: splice.start, end: splice.end, removed_units: splice.removed_units, inserted_units: splice.inserted_units, donor_start: splice.donor_start, donor_end: splice.donor_end },
      before_sha256: r.target && r.target.before_sha256,
      synthetic_sha256: r.target && r.target.after_sha256,
      isolated_delta: r.comparison && Number.isFinite(r.comparison.isolated_delta) ? r.comparison.isolated_delta : null,
      ledger_actual_delta: ledgerDelta(ledger),
      bits_changed: per ? per.bits_changed : null,
      displacement_geodesic: per ? per.displacement_geodesic : null,
      displacement_chord: per ? per.displacement_chord : null,
      quantization_silent: per ? !!per.quantization_silent : null,
      occupied_sectors_delta: r.comparison && Number.isFinite(r.comparison.occupied_sectors_delta) ? r.comparison.occupied_sectors_delta : null,
      unchanged_anchor_count: r.unchanged_anchor_count,
      frame_id: r.map && r.map.frame_id,
      instrument_id: r.map && r.map.instrument_id,
    });
  }

  const measured = controls.filter((c) => !c.degenerate);
  const iso = measured.map((c) => c.isolated_delta);
  const summary = {
    n_requested: n,
    n_measured: measured.length,
    n_degenerate: degenerate,
    isolated_delta: { ...signCounts(iso), ...quantiles(iso) },
    abs_isolated_delta: quantiles(iso.map((x) => Math.abs(x))),
    displacement_geodesic: quantiles(measured.map((c) => c.displacement_geodesic)),
    bits_changed: quantiles(measured.map((c) => c.bits_changed)),
    bits_moved_count: measured.filter((c) => c.bits_changed > 0).length,
    quantization_silent_count: measured.filter((c) => c.quantization_silent).length,
    occupied_sectors_delta: signCounts(measured.map((c) => c.occupied_sectors_delta)),
    anchor_note: "every measured control verified all other anchors byte-equal on the frozen frame (preview 409s otherwise)",
  };

  const bnull = baseline.null || {};
  return {
    control: true,
    persisted: false,
    version: VERSION,
    baseline_id: body.baseline_id,
    frame_id: baseline.frame_id,
    instrument_id: baseline.instrument_id,
    recipe: {
      generator: GENERATOR,
      splice_fraction: SPLICE_FRACTION,
      window: "centered contiguous code-unit window of round(0.25 * host length), replaced by a same-length contiguous donor segment (whole donor if shorter); surrogate pairs never split",
      control_seed: seed,
      n_controls: n,
      fixed: true,
      fixed_note: "recipe parameters are not caller-selectable, so a control cannot be tuned to the result it produces",
    },
    baseline_reference: {
      n: baseline.n ?? (baseline.names ? baseline.names.length : null),
      isolated: baseline.isolated ?? null,
      occupied_sectors: baseline.occupied_sectors ?? null,
      null: { K: bnull.K ?? null, E0: bnull.E0 ?? null, SD0: bnull.SD0 ?? null, p_resolution: bnull.p_resolution ?? null, kind: bnull.kind ?? null },
      null_note: "the stored checkerboard null randomizes bit margins, not content; it is the false-alarm reference. This control is the known-signal reference. Neither is a task-quality measurement.",
    },
    no_change_reference: { isolated_delta: 0, displacement_geodesic: 0, bits_changed: 0, note: "identity: a byte-identical CHANGE moves nothing on the frozen frame (preview reports noop); not re-embedded here" },
    controls,
    summary,
    scope: SCOPE,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: true },
    side_effects_note: "each control is measured by the existing preview path; only the content-hash embedding cache may gain entries for the synthetic documents",
    task_verdict: "not-applicable",
    task_verdict_note: "synthetic splices are known-different by construction; they say nothing about whether any real edit improves the underlying task",
  };
}
