// jev-taste.js — SPEC-TASTE (2026-10-05) route module: taste-v1
// Routes: POST score / POST matrix / GET selftest under /api/jev/corpus/taste/.
// Cloudflare-Workers-compatible ES module (no node imports). All collaborators
// are injected via deps; this module owns validation, orchestration, hashing,
// verdict overlay and run-row recording — never the math itself.
//
// deps = {
//   askJev: async ({ questions }) =>
//     ({ answers: { [axis]: { type, noul?, choices? } }, consumed? }),
//       // ONE batched clef call, keyed by axis name; question keys are in
//       // permuted order (plain object insertion order).
//   tasteMath: {
//     decodeBitmap(bitmap_b64),            // -> {width?, height?, grid} or bare grid (rows of 0/1)
//     boxCountingDim(grid, minBox, maxBox, nScales), // -> {D, r2}
//     mirrorSymmetryScore(grid),           // -> {score}
//     scaleCoherence(grid, minBox, maxBox),// -> {coherence, ...} or number
//     tasteQuestions(featuresForAxes, axes),// -> { [axis]: question } in `axes` order
//     permuteOrder(axisNames, seed),       // -> deterministic permutation of axisNames
//     applyHysteresis(probs, hysteresis|null, thresholds?)
//       // -> { rows: { [axis]: { p?, verdict, carried? } }, hysteresis_applied }
//       // hysteresis given: p>=high -> 'on', p<=low -> 'off', else carry
//       // pre_row[axis] ('carried: true'); no hysteresis: p>=on -> 'on',
//       // p<=off -> 'off', else 'ambiguous'. thresholds = { on, off }.
//   },
//   recordRun: async ({ kind, input_hash, result, notes }) => ({ run_id }),
//   policy: () => ({ thresholds: { decision_threshold } }),
//   sha256Hex?: async (string) => hex,     // injectable; default: crypto.subtle
//   tasteFixtures?: () => ({ fixtures: [{ name?, width, height, bitmap_b64,
//     expected?: { D?, symmetry?, coherence? }, tol? }] }),
// }
//
// Handler contract: each returned handler accepts a plain body object OR a
// Request-like with .json(), and returns { status, body } (plain JSON-able).
// Matrix item validation is fail-closed for the whole batch (any invalid item
// rejects the batch with its index).

export const SCORER_VERSION = 'taste-v1';
export const TASTE_AXES = Object.freeze([
  'fractal_band', 'symmetry_present', 'symmetry_variation', 'scale_coherence',
  'branch_exponent', 'sv_balance', 'complexity_economy', 'family',
]);
const R2_GATE = 0.98;
// T11: scale-coherence outcomes that are not applicable (never reported as satisfied).
const DEGENERATE_COHERENCE = new Set(['solid_field', 'near_empty', 'zero_variance']);
const NUMERIC_KEY = {
  symmetry_present: 'score',
  symmetry_variation: 'score',
  scale_coherence: 'coherence',
  branch_exponent: 'gamma',
  sv_balance: 'ratio',
  complexity_economy: 'slope',
};
const FEATURE_KEYS = new Set([...TASTE_AXES, 'family_description']);

// ---------------------------------------------------------------- utilities

function fail(status, body) {
  return { status, body };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Axes the bitmap extractor cannot measure (caller-supplied only). They are
// reported as explicit not_applicable entries rather than silently omitted.
const NOT_APPLICABLE_REQUIRES = Object.freeze({
  branch_exponent: 'features.branch_exponent.gamma',
  sv_balance: 'features.sv_balance.ratio and features.sv_balance.fn',
  complexity_economy: 'features.complexity_economy.slope',
  family: 'features.family_description',
});

function inkPixelCount(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v === 1) n++;
  return n;
}

function canonicalize(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const o = {};
  for (const k of Object.keys(v).sort()) {
    if (v[k] !== undefined) o[k] = canonicalize(v[k]);
  }
  return o;
}
function canonicalJson(v) {
  return JSON.stringify(canonicalize(v));
}

async function defaultSha256Hex(s) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    const d = await subtle.digest('SHA-256', new TextEncoder().encode(s));
    let hex = '';
    for (const b of new Uint8Array(d)) hex += b.toString(16).padStart(2, '0');
    return hex;
  }
  // Guarded fallback (pure JS FNV-1a) so environments without WebCrypto still
  // produce a stable per-input digest; production Workers always take the
  // crypto.subtle branch.
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const byte of bytes) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return 'fnv' + h.toString(16).padStart(16, '0');
}

function stripSource(f) {
  if (!isPlainObject(f)) return f;
  const o = { ...f };
  delete o.source;
  return o;
}

// Normalize a caller-supplied feature value into the axis's canonical object
// shape. Bare numbers are wrapped under the axis's measurement key; `family`
// accepts a string description.
function normalizeFeature(axis, raw) {
  if (raw === null || raw === undefined) return { ok: false };
  if (axis === 'family') {
    if (typeof raw === 'string') return { ok: true, feature: { description: raw } };
    if (isPlainObject(raw)) return { ok: true, feature: { ...raw } };
    return { ok: false };
  }
  if (isNum(raw)) return { ok: true, feature: { [NUMERIC_KEY[axis]]: raw } };
  if (isPlainObject(raw)) return { ok: true, feature: { ...raw } };
  return { ok: false };
}

// Decode result -> [width, height, grid(2D)] using decoder-reported dims when
// present, otherwise the grid shape, otherwise a flat array matching w*h.
function decodedDims(decoded, fallbackW, fallbackH) {
  if (!decoded) return null;
  const g = decoded.grid !== undefined ? decoded.grid : Array.isArray(decoded) ? decoded : null;
  if (!Array.isArray(g)) return null;
  if (Array.isArray(g[0])) return [g[0].length, g.length, g];
  if (g.length === fallbackW * fallbackH) {
    const grid = [];
    for (let y = 0; y < fallbackH; y++) grid.push(g.slice(y * fallbackW, (y + 1) * fallbackW));
    return [fallbackW, fallbackH, grid];
  }
  return null;
}

// Defensive normalization of tasteMath.applyHysteresis output.
function normalizeHysteresis(hres, hystGiven) {
  if (!hres || typeof hres !== 'object') return { rows: {}, hysteresis_applied: !!hystGiven };
  const mapRows = (obj) => {
    const rows = {};
    for (const [k, v] of Object.entries(obj)) {
      rows[k] = typeof v === 'string'
        ? { verdict: v }
        : { verdict: v && v.verdict, carried: !!(v && v.carried), p: v && v.p };
    }
    return rows;
  };
  if (hres.rows && typeof hres.rows === 'object') {
    return {
      rows: mapRows(hres.rows),
      hysteresis_applied: hres.hysteresis_applied === undefined ? !!hystGiven : !!hres.hysteresis_applied,
    };
  }
  return { rows: mapRows(hres), hysteresis_applied: !!hystGiven };
}

// --- INTEGRATOR SEAM ADAPTERS (advisor lane, SPEC-TASTE build 2026-10-05) ---
// Lane M (jev-taste-math.js) publishes the pure documented shapes:
//   applyHysteresis(probs, hysteresis) -> { rows: {axis: 0|1|'on'|'off'}, verdicts: {axis: ...} }
//   tasteQuestions(features, axes)     -> { questions: {axis: q}, order: [axis] }
// The route core consumes the flatter shapes documented in the deps contract
// above; these adapters convert at the seam. Neither lane's public contract is
// changed (Lane M's own tests pin its shapes; the defensive normalizer below
// stays as the last-resort fallback for future math implementations).

// tasteQuestions seam: unwrap {questions, order} into a keyed map whose keys
// are emitted in axesInOrder (the route's permuted ask order). Tolerates an
// already-keyed bare map (Lane R stub shape) so both lanes keep working.
function adaptQuestionMap(res, axesInOrder) {
  const qmap = res && typeof res === 'object' && !Array.isArray(res) &&
    res.questions && typeof res.questions === 'object' && !Array.isArray(res.questions)
    ? res.questions
    : res;
  const ordered = {};
  for (const a of axesInOrder) {
    if (qmap && typeof qmap === 'object' && qmap[a] !== undefined) ordered[a] = qmap[a];
  }
  return ordered;
}

// applyHysteresis seam.
// (1) Window synthesis: with no caller hysteresis, Lane M falls through to
// 'ambiguous' with row = (p >= 0.5), while the route's documented no-hysteresis
// rule is policy-driven thresholds (p >= on -> 'on', p <= off -> 'off', else
// 'ambiguous'). A synthetic window {low: off, high: on, pre_row: {}} routes the
// no-hysteresis case through Lane M's own hysteresis code path and reproduces
// the route rule exactly (SPEC invariant 2 semantics on both paths).
// (2) Shape: Lane M returns rows as bare 0|1 (or the carried pre_row value
// 'on'/'off') with verdicts in a separate map; the route consumes
// {p, verdict, carried} rows. 'carried' verdicts resolve to the carried row's
// concrete on/off with the carried flag set, matching the response contract.
function applyHysteresisSeam(M, probs, hysteresis, thresholds) {
  const eff = hysteresis ?? {
    low: thresholds && thresholds.off !== undefined ? thresholds.off : 0.45,
    high: thresholds && thresholds.on !== undefined ? thresholds.on : 0.55,
    pre_row: {},
  };
  const raw = M.applyHysteresis(probs, eff);
  const rawRows = raw && typeof raw === 'object' && raw.rows && typeof raw.rows === 'object' && !Array.isArray(raw.rows)
    ? raw.rows
    : null;
  const verdicts = raw && raw.verdicts && typeof raw.verdicts === 'object' ? raw.verdicts : {};
  const source = rawRows || (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
  const rows = {};
  for (const axis of Object.keys(source)) {
    const row = source[axis];
    if (row && typeof row === 'object') {
      rows[axis] = { p: row.p, verdict: row.verdict, carried: !!row.carried };
      continue;
    }
    const v = verdicts[axis];
    if (v === 'carried') {
      const carried = row === 1 || row === 'on' ? 'on' : row === 0 || row === 'off' ? 'off' : row;
      rows[axis] = { p: probs[axis], verdict: carried, carried: true };
    } else {
      rows[axis] = { p: probs[axis], verdict: v, carried: false };
    }
  }
  return { rows, hysteresis_applied: !!hysteresis };
}

// Last-resort verdict rule (used only if the math module returns a partial
// rows map); mirrors the documented applyHysteresis semantics exactly.
function localVerdict(p, axis, t, hyst) {
  const on = t;
  const off = Number((1 - t).toFixed(12));
  if (hyst) {
    if (p >= hyst.high) return 'on';
    if (p <= hyst.low) return 'off';
    const pre = hyst.pre_row ? hyst.pre_row[axis] : undefined;
    if (pre === 'on' || pre === 'off') return pre;
  }
  if (p >= on) return 'on';
  if (p <= off) return 'off';
  return 'ambiguous';
}

function thresholdOf(deps) {
  const t = deps.policy && deps.policy().thresholds && deps.policy().thresholds.decision_threshold;
  return isNum(t) ? t : 0.55;
}

async function readBody(input) {
  if (input && typeof input === 'object' && typeof input.json === 'function') {
    return input.json();
  }
  return input ?? {};
}

// ------------------------------------------------------------- score (core)

async function scoreCore(deps, rawBody) {
  const M = deps.tasteMath;
  const body = await readBody(rawBody);

  // 1. Exactly one of image / features (fail closed).
  const hasImage = body.image !== undefined && body.image !== null;
  const hasFeatures = body.features !== undefined && body.features !== null;
  if (hasImage === hasFeatures) {
    return fail(422, { error: 'exactly_one_of_image_or_features' });
  }

  // Hysteresis validation.
  let hyst = null;
  if (body.hysteresis !== undefined && body.hysteresis !== null) {
    const h = body.hysteresis;
    if (!isPlainObject(h) || !isNum(h.low) || !isNum(h.high) || !(h.low < h.high) || !isPlainObject(h.pre_row)) {
      return fail(422, { error: 'invalid_hysteresis' });
    }
    hyst = h;
  }

  // Requested axes validation (fail closed on unknown names).
  if (body.axes !== undefined && body.axes !== null) {
    if (!Array.isArray(body.axes)) return fail(422, { error: 'invalid_axes' });
    const bad = body.axes.find((a) => !TASTE_AXES.includes(a));
    if (bad !== undefined) return fail(422, { error: 'unknown_axis', axis: bad });
  }

  // 2./3. Build the feature map (axis -> {source, ...measurements}).
  const feats = {};
  const degenerateNA = {};
  let source;
  if (hasFeatures) {
    source = 'caller';
    const f = body.features;
    if (!isPlainObject(f)) return fail(422, { error: 'invalid_features' });
    for (const k of Object.keys(f)) {
      if (!FEATURE_KEYS.has(k)) return fail(422, { error: 'unknown_axis', axis: k });
      if (k === 'family_description') {
        if (typeof f[k] !== 'string' || !f[k].length) {
          return fail(422, { error: 'invalid_feature', axis: 'family' });
        }
        if (!feats.family) feats.family = { description: f[k] };
      } else {
        const n = normalizeFeature(k, f[k]);
        if (!n.ok) return fail(422, { error: 'invalid_feature', axis: k });
        feats[k] = n.feature;
      }
    }
    // The r2 gate axis must carry numeric D and r2 — fail closed otherwise.
    if (feats.fractal_band && (!isNum(feats.fractal_band.D) || !isNum(feats.fractal_band.r2))) {
      return fail(422, { error: 'invalid_feature', axis: 'fractal_band' });
    }
  } else {
    source = 'extractor';
    const img = body.image;
    if (!isPlainObject(img) || !Number.isInteger(img.width) || img.width < 1 ||
        !Number.isInteger(img.height) || img.height < 1 || typeof img.bitmap_b64 !== 'string') {
      return fail(422, { error: 'invalid_image' });
    }
    let decoded;
    try {
      decoded = M.decodeBitmap(img.bitmap_b64);
    } catch (e) {
      return fail(422, { error: 'bitmap_decode_failed', detail: String((e && e.message) || e) });
    }
    const dims = decodedDims(decoded, img.width, img.height);
    if (!dims) return fail(422, { error: 'bitmap_decode_failed', detail: 'unrecognised decode shape' });
    const [gw, gh, grid] = dims;
    if (gw !== img.width || gh !== img.height) {
      return fail(422, {
        error: 'bitmap_dimension_mismatch',
        expected: { width: img.width, height: img.height },
        got: { width: gw, height: gh },
      });
    }
    // An all-zero bitmap has no edge map to measure: caller error, not a 500.
    if (inkPixelCount(grid) === 0) {
      return fail(422, {
        error: {
          code: 'empty_artifact',
          message: `bitmap has no ink (0 of ${gw * gh} pixels are 1); there is no edge map to measure`,
        },
      });
    }
    const D = M.boxCountingDim(grid, 4, 64, 8);
    const sym = M.mirrorSymmetryScore(grid);
    const sc = M.scaleCoherence(grid, 4, 64);
    feats.fractal_band = { D: D && D.D, r2: D && D.r2 };
    const symScore = sym && typeof sym === 'object' ? sym.score : sym;
    feats.symmetry_present = { score: symScore };
    feats.scale_coherence = isPlainObject(sc) ? { ...sc } : { coherence: sc };
    if (!isNum(feats.fractal_band.D) || !isNum(feats.fractal_band.r2)) {
      return fail(422, { error: 'invalid_feature', axis: 'fractal_band' });
    }
    if (!isNum(feats.symmetry_present.score)) {
      return fail(422, { error: 'invalid_feature', axis: 'symmetry_present' });
    }
    if (feats.scale_coherence.degenerate !== true && !isNum(feats.scale_coherence.coherence) && !isNum(feats.scale_coherence.D1)) {
      return fail(422, { error: 'invalid_feature', axis: 'scale_coherence' });
    }
  }

  // T11 degenerate-input rule: scale coherence on a solid, near-empty or zero-variance
  // field is not applicable. Drop it and report the reason under not_applicable.
  if (feats.scale_coherence && (feats.scale_coherence.degenerate === true || DEGENERATE_COHERENCE.has(feats.scale_coherence.reason))) {
    degenerateNA.scale_coherence = String(feats.scale_coherence.reason);
    delete feats.scale_coherence;
  }
  // symmetry_variation reuses the symmetry score when present.
  if (feats.symmetry_present && feats.symmetry_variation === undefined &&
      isNum(feats.symmetry_present.score)) {
    feats.symmetry_variation = { score: feats.symmetry_present.score };
  }
  // INTEGRATOR SEAM: feature-key aliases toward Lane M's template vocabulary.
  if (feats.sv_balance && feats.sv_balance.fn === undefined &&
      typeof feats.sv_balance.function === 'string') {
    feats.sv_balance.fn = feats.sv_balance.function;
  }
  if (feats.scale_coherence) {
    if (feats.scale_coherence.d_low === undefined && isNum(feats.scale_coherence.D1)) {
      feats.scale_coherence.d_low = feats.scale_coherence.D1;
    }
    if (feats.scale_coherence.d_high === undefined && isNum(feats.scale_coherence.D2)) {
      feats.scale_coherence.d_high = feats.scale_coherence.D2;
    }
  }
  for (const a of Object.keys(feats)) feats[a].source = source;

  // r2 < 0.98 -> low confidence, excluded from the clef call.
  const lc = new Set();
  if (feats.fractal_band && isNum(feats.fractal_band.r2) && feats.fractal_band.r2 < R2_GATE) {
    lc.add('fractal_band');
  }

  // 4. axes = requested intersected with available (default: all available).
  const avail = Object.keys(feats);
  const explicitAxes = Array.isArray(body.axes) && body.axes.length > 0;
  let selected;
  if (explicitAxes) {
    selected = body.axes.filter((a) => avail.includes(a));
  } else {
    selected = avail;
  }
  if (!selected.length) return fail(422, { error: 'no_usable_axes' });
  // Every requested axis (default: all 8) without a measurement is reported as
  // not_applicable in the response, never silently omitted.
  const wantedAxes = explicitAxes ? [...new Set(body.axes)] : [...TASTE_AXES];
  const notApplicable = wantedAxes.filter((a) => !selected.includes(a));

  // 5. Deterministic question order.
  const seed = isNum(body.order_seed) ? body.order_seed : 0;
  let order_used = M.permuteOrder(selected, seed);
  if (!Array.isArray(order_used) ||
      [...order_used].sort().join('|') !== [...selected].sort().join('|')) {
    order_used = [...selected];
  }

  // 6. ONE batched askJev call, question keys in permuted order.
  const askAxes = order_used.filter((a) => !lc.has(a));
  let answers = {};
  let consumed = 0;
  if (askAxes.length) {
    const featsForAxes = {};
    for (const a of askAxes) featsForAxes[a] = stripSource(feats[a]);
    if (featsForAxes.family && typeof featsForAxes.family.description === 'string') {
      // Lane M's tasteQuestions reads the family input as family_description.
      featsForAxes.family_description = featsForAxes.family.description;
    }
    let qres;
    try {
      qres = M.tasteQuestions(featsForAxes, askAxes);
    } catch (e) {
      return fail(500, { error: 'taste_questions_failed', detail: String((e && e.message) || e) });
    }
    const qOrdered = adaptQuestionMap(qres, askAxes);
    let res;
    try {
      res = await deps.askJev({ questions: qOrdered });
    } catch (e) {
      return fail(500, { error: 'askjev_failed', detail: String((e && e.message) || e) });
    }
    answers = (res && res.answers) || {};
    consumed = (res && res.consumed) ?? 0;
  }

  // 7. probs from noul answers only.
  const probs = {};
  for (const a of order_used) {
    if (lc.has(a)) continue;
    const ans = answers[a];
    if (ans && isNum(ans.noul)) probs[a] = ans.noul;
  }

  // 8. rows / verdicts via hysteresis (or threshold rule when none).
  const t = thresholdOf(deps);
  const hres = applyHysteresisSeam(M, probs, hyst ?? null, { on: t, off: Number((1 - t).toFixed(12)) });
  const { rows, hysteresis_applied } = normalizeHysteresis(hres, !!hyst);

  const axesOut = [];
  const rowsOut = {};
  const verdicts = {};
  for (const a of order_used) {
    const entry = { axis: a, feature: stripSource(feats[a]), source: feats[a].source };
    if (lc.has(a)) {
      entry.p = null;
      entry.verdict = null;
      entry.low_confidence = true;
    } else if (probs[a] === undefined) {
      entry.p = null;
      entry.verdict = 'no_answer';
      const ans = answers[a];
      if (ans && ans.choice !== undefined) {
        // clef choice answer shape (verified live 2026-10-05):
        // {type:'choice', choice:'tree', probabilities:{...}, confidence:0.73}
        entry.choice = ans.choice;
        if (isPlainObject(ans.probabilities)) entry.probabilities = ans.probabilities;
        if (isNum(ans.confidence)) entry.confidence = ans.confidence;
      } else if (ans && ans.choices !== undefined) {
        entry.choice = ans.choices; // legacy stub-answer shape
      }
    } else {
      const r = rows[a];
      entry.p = probs[a];
      entry.verdict = (r && r.verdict) ?? localVerdict(probs[a], a, t, hyst);
      if (r && r.carried) entry.carried = true;
    }
    axesOut.push(entry);
    rowsOut[a] = { p: entry.p, verdict: entry.verdict };
    verdicts[a] = entry.verdict;
  }
  for (const a of notApplicable) {
    axesOut.push({
      axis: a,
      feature: null,
      source: null,
      p: null,
      verdict: 'not_applicable',
      reason: degenerateNA[a] ? 'degenerate_input:' + degenerateNA[a] : (source === 'extractor' ? 'not_extractable_from_bitmap' : 'not_supplied'),
      requires: NOT_APPLICABLE_REQUIRES[a] || `features.${a}`,
    });
    rowsOut[a] = { p: null, verdict: 'not_applicable' };
  }

  // 9. input_hash over the raw caller inputs (canonical JSON).
  const sha = deps.sha256Hex || defaultSha256Hex;
  const input_hash = await sha(canonicalJson({
    image: body.image ? { bitmap_b64: body.image.bitmap_b64 } : undefined,
    features: body.features,
    axes: body.axes,
    hysteresis: body.hysteresis,
    order_seed: body.order_seed,
  }));

  // 10. Run row (never fails the score).
  const result = {
    source,
    order_used,
    probs,
    verdicts,
    low_confidence: [...lc],
    hysteresis_applied,
  };
  let run_id = null;
  let run_error;
  try {
    const rr = await deps.recordRun({
      kind: 'taste',
      input_hash,
      result,
      notes: { scorer_version: SCORER_VERSION },
    });
    run_id = (rr && rr.run_id) ?? null;
  } catch (e) {
    run_error = String((e && e.message) || e);
  }

  // 11. Response.
  const out = {
    axes: axesOut,
    probs,
    rows: rowsOut,
    order_used,
    hysteresis_applied,
    consumed,
    run_id,
    scorer_version: SCORER_VERSION,
  };
  if (run_error !== undefined) out.run_error = run_error;
  return { status: 200, body: out };
}

// ------------------------------------------------------------------ matrix

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function matrixCore(deps, rawBody) {
  const body = await readBody(rawBody);
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    return fail(422, { error: 'invalid_items', n: 0 });
  }
  const items = body.items;
  if (items.length < 1 || items.length > 20) {
    return fail(422, { error: 'invalid_items', n: items.length });
  }
  for (let i = 0; i < items.length; i++) {
    if (!isPlainObject(items[i]) || typeof items[i].name !== 'string' || !items[i].name.length) {
      return fail(422, { error: 'invalid_item', index: i });
    }
  }
  const spacing = isNum(body.spacing_ms) && body.spacing_ms > 0
    ? Math.min(body.spacing_ms, 60000)
    : 0;

  const results = [];
  const itemHashes = [];
  const itemRunIds = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && spacing > 0) await sleep(spacing);
    const res = await scoreCore(deps, items[i]);
    if (res.status !== 200) {
      // Fail closed: an invalid item rejects the whole batch.
      return fail(res.status, { error: 'invalid_item', index: i, detail: res.body });
    }
    results.push(res.body);
    itemHashes.push(res.input_hash);
    itemRunIds.push(res.body.run_id ?? null);
  }

  const sha = deps.sha256Hex || defaultSha256Hex;
  const input_hash = await sha(canonicalJson({
    item_hashes: itemHashes,
    spacing_ms: body.spacing_ms ?? 0,
  }));
  let run_id = null;
  let run_error;
  try {
    const rr = await deps.recordRun({
      kind: 'taste-matrix',
      input_hash,
      result: { n_items: items.length, item_run_ids: itemRunIds },
      notes: { scorer_version: SCORER_VERSION },
    });
    run_id = (rr && rr.run_id) ?? null;
  } catch (e) {
    run_error = String((e && e.message) || e);
  }
  const out = { results, run_id, scorer_version: SCORER_VERSION };
  if (run_error !== undefined) out.run_error = run_error;
  return { status: 200, body: out };
}

// ---------------------------------------------------------------- selftest

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

function encodePbmP4(width, height, grid) {
  const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x]) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const out = new Uint8Array(header.length + data.length);
  out.set(header, 0);
  out.set(data, header.length);
  return bytesToB64(out);
}

function encodeRawBytes(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const bytes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bytes[y * w + x] = grid[y][x] ? 1 : 0;
  }
  return bytesToB64(bytes);
}

function encodeAsciiRows(grid) {
  const text = grid.map((row) => row.join('')).join('\n');
  return bytesToB64(new TextEncoder().encode(text));
}

function syntheticLineGrid(w, h) {
  const g = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill(0));
  for (let x = 0; x < w; x++) g[Math.floor(h / 2)][x] = 1;
  return g;
}

function syntheticBlobGrid(w, h) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const r = Math.min(w, h) * 0.32;
  const g = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r ? 1 : 0);
    }
    g.push(row);
  }
  return g;
}

async function selftestCore(deps) {
  const M = deps.tasteMath;
  const checks = [];
  const add = (name, pass, detail) => {
    checks.push(detail === undefined ? { name, pass: !!pass } : { name, pass: !!pass, detail });
  };

  // 0. math interface presence.
  const need = ['decodeBitmap', 'boxCountingDim', 'mirrorSymmetryScore', 'scaleCoherence',
    'tasteQuestions', 'permuteOrder', 'applyHysteresis'];
  const missing = need.filter((f) => !M || typeof M[f] !== 'function');
  add('math_interface', missing.length === 0,
    missing.length ? `missing: ${missing.join(',')}` : undefined);

  // 1. synthetic decode checks (no network, no fixtures). Try PBM P4 first,
  // then raw byte-per-pixel, so the check survives either lane-M encoding.
  const W = 16;
  const H = 16;
  const tryDecodeGrid = (candidates, w, h) => {
    for (const b64 of candidates) {
      try {
        const dims = decodedDims(M.decodeBitmap(b64), w, h);
        if (dims && dims[0] === w && dims[1] === h) return dims[2];
      } catch {
        /* try next candidate */
      }
    }
    return null;
  };

  // D values are recorded for a qualitative contrast check: a 1-D line must
  // measure a lower box-counting dimension than a filled 2-D blob, whatever
  // the exact scale ladder of the implementation.
  let lineD = null;
  let blobD = null;
  try {
    const line = syntheticLineGrid(W, H);
    const g = tryDecodeGrid([encodeAsciiRows(line), encodePbmP4(W, H, line), encodeRawBytes(line)], W, H);
    if (!g) {
      add('decode_line_grid', false, 'decodeBitmap could not read the synthetic line bitmap (tried PBM P4 + raw bytes)');
    } else {
      const d = M.boxCountingDim(g, 4, 64, 8);
      lineD = d && d.D;
      add('decode_line_grid', isNum(lineD) && lineD >= 0.2 && lineD <= 1.4,
        isNum(lineD) ? `line D=${lineD.toFixed(3)} (expect <1.4)` : `boxCountingDim returned ${JSON.stringify(d)}`);
    }
  } catch (e) {
    add('decode_line_grid', false, String((e && e.message) || e));
  }

  try {
    const blob = syntheticBlobGrid(W, H);
    const g = tryDecodeGrid([encodeAsciiRows(blob), encodePbmP4(W, H, blob), encodeRawBytes(blob)], W, H);
    if (!g) {
      add('decode_symmetric_blob', false, 'decodeBitmap could not read the synthetic blob bitmap');
    } else {
      const s = M.mirrorSymmetryScore(g);
      const v = s && typeof s === 'object' ? s.score : s;
      add('decode_symmetric_blob', isNum(v) && v >= 0.85,
        isNum(v) ? `symmetry=${v.toFixed(3)} (expect >=0.85)` : `mirrorSymmetryScore returned ${JSON.stringify(s)}`);
      const d = M.boxCountingDim(g, 4, 64, 8);
      blobD = d && d.D;
    }
  } catch (e) {
    add('decode_symmetric_blob', false, String((e && e.message) || e));
  }

  try {
    add('fractal_contrast', isNum(lineD) && isNum(blobD) && blobD > lineD + 0.1,
      `line D=${lineD}, blob D=${blobD} (expect blob > line + 0.1)`);
  } catch (e) {
    add('fractal_contrast', false, String((e && e.message) || e));
  }

  // 2. hysteresis table.
  try {
    const th = { on: 0.55, off: 0.45 };
    const r1 = normalizeHysteresis(applyHysteresisSeam(M, { a: 0.6, b: 0.5, c: 0.4 }, null, th), false);
    const ok1 = r1.rows.a.verdict === 'on' && r1.rows.b.verdict === 'ambiguous' &&
      r1.rows.c.verdict === 'off' && r1.hysteresis_applied === false;
    const hyst = { low: 0.35, high: 0.65, pre_row: { a: 'off', b: 'off', c: 'on' } };
    const r2 = normalizeHysteresis(applyHysteresisSeam(M, { a: 0.5, b: 0.7, c: 0.3 }, hyst, th), true);
    const ok2 = r2.rows.a.verdict === 'off' && r2.rows.b.verdict === 'on' &&
      r2.rows.c.verdict === 'off' && r2.hysteresis_applied === true;
    add('hysteresis_table', ok1 && ok2,
      ok1 && ok2 ? undefined : `null:${JSON.stringify(r1)} hyst:${JSON.stringify(r2)}`);
  } catch (e) {
    add('hysteresis_table', false, String((e && e.message) || e));
  }

  // 3. tasteQuestions shape.
  try {
    const qs = adaptQuestionMap(M.tasteQuestions(
      { fractal_band: { D: 1.4, r2: 0.99 }, symmetry_present: { score: 0.8 } },
      ['fractal_band', 'symmetry_present'],
    ), ['fractal_band', 'symmetry_present']);
    const keys = Object.keys(qs || {});
    const ok = keys.includes('fractal_band') && keys.includes('symmetry_present') &&
      keys.every((k) => qs[k] && typeof qs[k] === 'object');
    add('taste_questions_shape', ok, ok ? undefined : `keys=${keys.join(',')}`);
  } catch (e) {
    add('taste_questions_shape', false, String((e && e.message) || e));
  }

  // 4. permuteOrder determinism + permutation property.
  try {
    const axes = ['a', 'b', 'c', 'd'];
    const p1 = M.permuteOrder(axes, 7);
    const p2 = M.permuteOrder(axes, 7);
    const isPerm = (arr) => Array.isArray(arr) && arr.length === axes.length &&
      [...arr].sort().join('|') === axes.join('|');
    add('permute_determinism', isPerm(p1) && isPerm(p2) &&
      JSON.stringify(p1) === JSON.stringify(p2),
      `p1=${JSON.stringify(p1)} p2=${JSON.stringify(p2)}`);
  } catch (e) {
    add('permute_determinism', false, String((e && e.message) || e));
  }

  // 5. Fixture parity checks — consumed via deps only, never imported.
  let fixtures = null;
  try {
    fixtures = typeof deps.tasteFixtures === 'function' ? deps.tasteFixtures() : null;
  } catch (e) {
    add('fixtures_access', false, String((e && e.message) || e));
    fixtures = null;
  }
  if (fixtures && Array.isArray(fixtures.fixtures) && fixtures.fixtures.length) {
    for (const fx of fixtures.fixtures) {
      const name = `fixture:${(fx && (fx.name || fx.id)) || 'unnamed'}`;
      try {
        const grid = tryDecodeGrid([fx.bitmap_b64], fx.width, fx.height);
        if (!grid) {
          add(name, false, 'decode failed or dims mismatch');
          continue;
        }
        const exp = fx.expected || fx.gold || {};
        const det = [];
        let ok = true;
        if (exp.fractal && typeof exp.fractal === 'object') {
          // Lane P full fixture shape: byte-match parity against the Python
          // source of record (extractor.py, defaults min_box=2, max_box=64,
          // n_scales=8). Float tolerance 1e-9 (regression summation order
          // differs between the mean-centered Python _linreg and the JS
          // uncentered regress); scales and counts must be exactly equal.
          const f = exp.fractal;
          const params = fx.params || {};
          const d = M.boxCountingDim(grid, params.minBox ?? 2, params.maxBox ?? 64, params.nScales ?? 8);
          const tol = isNum(fx.tol) ? fx.tol : 1e-9;
          if (!(isNum(d && d.D) && Math.abs(d.D - f.D) <= tol)) {
            ok = false;
            det.push(`D ${d && d.D} vs expected ${f.D}`);
          }
          if (!(isNum(d && d.r2) && Math.abs(d.r2 - f.r2) <= tol)) {
            ok = false;
            det.push(`r2 ${d && d.r2} vs expected ${f.r2}`);
          }
          if (JSON.stringify(d.scales) !== JSON.stringify(f.scales)) {
            ok = false;
            det.push(`scales ${JSON.stringify(d.scales)} vs expected ${JSON.stringify(f.scales)}`);
          }
          if (JSON.stringify(d.counts) !== JSON.stringify(f.counts)) {
            ok = false;
            det.push(`counts ${JSON.stringify(d.counts)} vs expected ${JSON.stringify(f.counts)}`);
          }
        }
        if (exp.symmetry && typeof exp.symmetry === 'object') {
          // Lane P symmetry block: score within 1e-9 AND axis exact.
          const s = M.mirrorSymmetryScore(grid);
          const sv = s && typeof s === 'object' ? s.score : s;
          const axis = s && typeof s === 'object' ? s.axis : undefined;
          const tol = isNum(fx.tol) ? fx.tol : 1e-9;
          if (!(isNum(sv) && Math.abs(sv - exp.symmetry.score) <= tol)) {
            ok = false;
            det.push(`symmetry ${sv} vs expected ${exp.symmetry.score}`);
          }
          if (axis !== exp.symmetry.axis_angle) {
            ok = false;
            det.push(`axis ${axis} vs expected ${exp.symmetry.axis_angle}`);
          }
        }
        // Lane R simple fixture shape (kept for stub/legacy packs).
        const tol = isNum(fx.tol) ? fx.tol : 0.05;
        if (isNum(exp.D)) {
          const d = M.boxCountingDim(grid, 4, 64, 8);
          const dv = d && d.D;
          if (!(isNum(dv) && Math.abs(dv - exp.D) <= tol)) {
            ok = false;
            det.push(`D ${dv} vs expected ${exp.D}`);
          }
        }
        if (isNum(exp.symmetry)) {
          const s = M.mirrorSymmetryScore(grid);
          const sv = s && typeof s === 'object' ? s.score : s;
          if (!(isNum(sv) && Math.abs(sv - exp.symmetry) <= tol)) {
            ok = false;
            det.push(`symmetry ${sv} vs expected ${exp.symmetry}`);
          }
        }
        if (isNum(exp.coherence)) {
          const sc = M.scaleCoherence(grid, 4, 64);
          const cv = sc && typeof sc === 'object' ? sc.coherence : sc;
          if (!(isNum(cv) && Math.abs(cv - exp.coherence) <= tol)) {
            ok = false;
            det.push(`coherence ${cv} vs expected ${exp.coherence}`);
          }
        }
        add(name, ok, det.length ? det.join('; ') : undefined);
      } catch (e) {
        add(name, false, String((e && e.message) || e));
      }
    }
  }

  const ok = checks.every((c) => c.pass);
  return { status: ok ? 200 : 500, body: { ok, checks, scorer_version: SCORER_VERSION } };
}

// ------------------------------------------------------------------ factory

export function createTasteRoutes(deps) {
  if (!deps || !deps.tasteMath || typeof deps.askJev !== 'function' ||
      typeof deps.recordRun !== 'function') {
    throw new Error('taste routes: missing required deps (tasteMath, askJev, recordRun)');
  }
  return {
    tasteScore: (body) => scoreCore(deps, body),
    tasteMatrix: (body) => matrixCore(deps, body),
    tasteSelftest: () => selftestCore(deps),
  };
}