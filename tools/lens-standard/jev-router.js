// jev-router.js — measurement-gated routing regime (SPEC-ROUTER v1, Lane A).
//
// Artifacts entering the jev system get MEASURED by the appropriate instrument;
// the measured feature is classified into policy-declared bands; the band
// selects a route target; the routing action passes the SAME deterministic
// fail-closed gate as every other action.
//
// INVARIANT: the detector proposes the route; the policy engine disposes.
// Measurements are data, never authorization. The router never awards itself
// authority: it proposes one action through the EXISTING ingest -> decide ->
// gate pipeline (routes-jev.runPipeline, NOT a fork) and only auto-dispatches
// through the same post-approval leg the approve endpoint uses.
//
// Fail-closed everywhere: policy unreadable -> 503; no bands -> default_on_no_band
// (default "blocked"); no matching band -> same; provisional calibration ->
// needs_approval (and NEVER auto-dispatched by this module); undeclared target
// -> blocked target_not_declared. There is no default route.
//
// deps contract (createRouterRoutes(deps), mirroring createTasteRoutes):
//   env:              worker env (AI binding / KV for the decide model)
//   recordRun(r):     -> {run_id, run_error?}   (corpus jev_corpus_runs wrapper)
//   findRun(kind, inputHash) -> row | null
//   listRuns(limit)   -> rows (newest first)
//   runPipeline(env, body) -> {status, out}      (the standard task pipeline)
//   loadPolicy(env)   -> {doc} | {error}         (the gate's own accessor)
//   gateAction(policy, task, action, approvals, nowIso)
//   dispatchAction(env, dbx, task, action, policy)
//   verifyAction(env, dbx, task, action)
//   continueTask(env, dbx, task)
//   dbx               (task store)
//   helpers:          {now, newId, sha256Hex?}
//   askJev?:          optional override (default: the imported jev-decide.askJev)
//
// ES module, Web APIs only, no npm. No em dashes.

import { canonicalJson } from "./jev-ingest.js";
import { askJev, answerProbability } from "./jev-decide.js";
import { scoreDoc } from "./jev-corpus-scorer.js";
import { standardize as edgeStandardize, measure as edgeMeasure } from "./jev-edge-standard.js";
import { mirrorSymmetryScore, decodeBitmap } from "./jev-taste-math.js";
import { walkCentroidMode } from "./jev-spectral-centroid.js";
import { DETECT_THRESHOLDS, MODES as LENS_MODES } from "./jev-lens.js";
import * as lensMathNS from "./jev-lens-math.js";
import { runPipeline } from "./routes-jev.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROUTER_VERSION = "router-v1";
const ROUTE_TOOL = "route.dispatch";
// Synthetic internal route host: the proposed action needs an absolute http(s)
// URL for the caller-action validator and the gate's host check. Lane B's
// policy declares route.dispatch with hosts ["jev.route"] and a targets
// registry; jev-execute dispatches route.dispatch by target, never by fetch.
export const ROUTE_HOST = "jev.route";
const MODALITIES = ["image", "text", "multimodal"];
const MAX_HINT_CHARS = 2000;
const MAX_PIXELS = 2000000;
const BODY_MAX = 8 * 1024 * 1024; // images up to 2 MP gray -> ~2.7 MB b64
const RESULT_JSON_CAP = 8192;

// Feature name each modality's measurement produces (the band key).
export const MODALITY_FEATURE = Object.freeze({
  image: "fractal_band.D",
  text: "scorer.bits",
  multimodal: "multimodal_band.score",
});

// ---------------------------------------------------------------------------
// Small shared helpers (byte-parity with the corpus module's local helpers)
// ---------------------------------------------------------------------------

const JEV_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...JEV_CORS } });
}
function err(code, message, status = 400) {
  return json({ error: { code, message } }, status);
}
function nowIso() {
  return new Date().toISOString();
}
function newId(prefix) {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return prefix + s;
}

async function sha256hex(deps, str) {
  const h = (deps && deps.helpers) || {};
  if (typeof h.sha256Hex === "function") return await h.sha256Hex(str); // sync or async both fine
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function cappedJson(value, cap = RESULT_JSON_CAP) {
  let s;
  try { s = JSON.stringify(value); } catch { s = "null"; }
  if (s === undefined) s = "null";
  if (s.length <= cap) return s;
  return JSON.stringify({ truncated: true, preview: s.slice(0, cap) });
}

// Constant-time comparison: length fold + char-wise XOR (routes-jev.js parity).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authorized(req, env) {
  // Same authorized() pattern as routes-jev.js / jev-corpus-routes.js,
  // including the notConfigured path and the Secrets Store runtime .get().
  // Sync here because env.JEV_API_KEY.get() is awaited by the caller wrapper.
  if (!env || !env.JEV_API_KEY) return { notConfigured: true };
  return { needGet: true };
}
async function authorizedAsync(req, env) {
  if (!env || !env.JEV_API_KEY || typeof env.JEV_API_KEY.get !== "function") return { notConfigured: true };
  const expected = await env.JEV_API_KEY.get();
  if (!expected) return { notConfigured: true };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return { unauthorized: true };
  return { ok: true };
}

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

// ---------------------------------------------------------------------------
// Modality resolution (SPEC-ROUTER §2, PINNED order)
// ---------------------------------------------------------------------------

// explicit `modality` > auto-detect. image+text -> multimodal with both
// attached. Nothing recognized -> UNKNOWN_ARTIFACT (422).
export function resolveModality(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { error: "UNKNOWN_ARTIFACT", message: "artifact must be an object" };
  }
  const img = artifact.image && typeof artifact.image === "object" ? artifact.image : null;
  const hasImage = !!(img && (typeof img.gray_b64 === "string" || typeof img.bitmap_b64 === "string") && Number.isInteger(img.width) && Number.isInteger(img.height));
  const hasText = !!(artifact.text && typeof artifact.text === "object" && typeof artifact.text.text === "string" && artifact.text.text.trim().length > 0);
  const any = artifact.any && typeof artifact.any === "object" ? artifact.any : null;
  const hasAny = !!(any && (typeof any.data_b64 === "string" || typeof any.data_url === "string" || (typeof any.hint === "string" && any.hint.trim().length > 0)));

  let modality = artifact.modality;
  if (modality !== undefined && modality !== null) {
    if (typeof modality !== "string" || !MODALITIES.includes(modality)) {
      return { error: "UNKNOWN_ARTIFACT", message: `modality must be one of: ${MODALITIES.join(", ")}` };
    }
    // Explicit wins, but fail closed when the named modality has no payload.
    if (modality === "image" && !hasImage) return { error: "UNKNOWN_ARTIFACT", message: "modality image but no image payload" };
    if (modality === "text" && !hasText) return { error: "UNKNOWN_ARTIFACT", message: "modality text but no text payload" };
    if (modality === "multimodal" && !hasAny && !hasImage && !hasText) return { error: "UNKNOWN_ARTIFACT", message: "modality multimodal but no any/image/text payload" };
  } else if (hasImage && hasText) {
    modality = "multimodal";
  } else if (hasImage) {
    modality = "image";
  } else if (hasText) {
    modality = "text";
  } else if (hasAny) {
    modality = "multimodal";
  } else {
    return { error: "UNKNOWN_ARTIFACT", message: "no recognizable artifact (image/text/any)" };
  }
  return { modality, hasImage, hasText, hasAny };
}

// ---------------------------------------------------------------------------
// Band registry lookup (SPEC-ROUTER §3, PINNED interval semantics)
// ---------------------------------------------------------------------------

// min inclusive, max EXCLUSIVE, except the LAST declared band per
// (modality, feature) which is inclusive on both ends so no value falls
// through. Bands are data from the live policy; nothing here is hardcoded.
export function selectBand(bands, modality, featureName, value, features) {
  if (!Array.isArray(bands)) return null;
  // V4 pair bands: an `all` band matches only when EVERY clause passes against
  // the measured feature vector (dot-path lookup). Pair bands are strictly
  // more specific than single-feature bands, so they take declared priority —
  // the first all-band whose clauses all pass wins, before any single-feature
  // band is considered. Without a features vector, pair bands never match.
  if (features && typeof features === "object") {
    const get = (obj, path) => String(path).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
    for (const b of bands) {
      if (!b || typeof b !== "object" || Array.isArray(b)) continue;
      if (b.modality !== modality || !Array.isArray(b.all) || !b.all.length) continue;
      let ok = true;
      for (const c of b.all) {
        if (!c || typeof c !== "object" || typeof c.feature !== "string" || typeof c.min !== "number" || !Number.isFinite(c.min) || typeof c.max !== "number" || !Number.isFinite(c.max)) { ok = false; break; }
        const v = get(features, c.feature);
        if (typeof v !== "number" || !Number.isFinite(v) || !(v >= c.min && v <= c.max)) { ok = false; break; }
      }
      if (ok) return b;
    }
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const sameKey = [];
  for (const b of bands) {
    if (b && typeof b === "object" && !Array.isArray(b) && b.modality === modality && b.feature === featureName) sameKey.push(b);
  }
  if (!sameKey.length) return null;
  const last = sameKey[sameKey.length - 1];
  for (const b of sameKey) {
    if (typeof b.min !== "number" || !Number.isFinite(b.min)) continue;
    if (typeof b.max !== "number" || !Number.isFinite(b.max)) continue;
    if (typeof b.target !== "string" || !b.target.length) continue;
    const isLast = b === last;
    const lo = b.min, hi = b.max;
    if (value >= lo && (value < hi || (isLast && value <= hi))) return b;
  }
  return null;
}

// Decision resolution. Fail-closed: any unrecognized shape -> blocked.
//   no band            -> routing.default_on_no_band (validated; default blocked)
//   band calibration !== "calibrated" -> needs_approval (band_provisional)
//   target not declared in the route.dispatch policy tool -> blocked target_not_declared
//   otherwise          -> gate decides (the router proposes, never authorizes)
export function decideRoute(policy, band, target) {
  const routing = policy && typeof policy === "object" ? policy.routing : null;
  if (!band) {
    const d = routing && (routing.default_on_no_band === "needs_approval" || routing.default_on_no_band === "blocked")
      ? routing.default_on_no_band : "blocked";
    return { outcome: d, reasons: d === "blocked" ? ["no_matching_band"] : ["no_matching_band", "default_on_no_band"] };
  }
  if (band.calibration !== "calibrated") {
    return { outcome: "needs_approval", reasons: ["band_provisional"] };
  }
  const tool = policy && policy.tools && policy.tools[ROUTE_TOOL];
  const declared = !!(tool && Array.isArray(tool.targets) && tool.targets.includes(target));
  if (!declared) return { outcome: "blocked", reasons: ["target_not_declared"] };
  return { outcome: null, reasons: [] }; // gate decides
}

// ---------------------------------------------------------------------------
// Synthetic fixture (selftest item 4): deterministic seeded blob. Calibrated
// against edge-standard-v1: seed 99, density 0.45, 64x64 measures D ~= 1.74
// (hierarchy-band morphology). No band values are encoded here.
// ---------------------------------------------------------------------------

export function makeSyntheticBlob(seed, density, w = 64, h = 64) {
  let a = seed | 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = new Array(w).fill(0);
    for (let x = 0; x < w; x++) row[x] = rng() < density ? 1 : 0;
    grid.push(row);
  }
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = grid[y][x] ? 255 : 0;
  return { gray, w, h, grid };
}

// Measure an image artifact through the SAME edge-standard-v1 pipeline the
// taste edge-standard route uses (shared imports, not a reimplementation).
function measureImage(img, lensFamily) {
  const width = img.width, height = img.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    return { error: "INVALID_IMAGE", message: "width/height required (1..2000000 pixels)" };
  }
  let grid, meta;
  let rawGrayBytes = null;
  if (typeof img.gray_b64 === "string" && img.gray_b64.length) {
    let bytes;
    try {
      bytes = Uint8Array.from(atob(img.gray_b64), (c) => c.charCodeAt(0));
    } catch {
      return { error: "INVALID_IMAGE", message: "gray_b64 not valid base64" };
    }
    if (bytes.length !== width * height) return { error: "INVALID_IMAGE", message: "gray_b64 length != width*height" };
    rawGrayBytes = bytes;
    const st = edgeStandardize(bytes, width, height);
    grid = st.grid; meta = st.meta;
  } else if (typeof img.bitmap_b64 === "string" && img.bitmap_b64.length) {
    let decoded;
    try { decoded = decodeBitmap(img.bitmap_b64); } catch { decoded = null; }
    grid = Array.isArray(decoded) ? decoded : (decoded && decoded.grid) || null;
    if (!grid) return { error: "INVALID_IMAGE", message: "bitmap_b64 undecodable" };
    meta = { pipeline: "caller-bitmap", chosen_threshold: null, achieved_coverage: null, w: grid[0] ? grid[0].length : width, h: grid.length };
  } else {
    return { error: "INVALID_IMAGE", message: "gray_b64 or bitmap_b64 required" };
  }
  const m = edgeMeasure(grid);
  const sym = mirrorSymmetryScore(grid);
  if (!m || typeof m.D !== "number" || !Number.isFinite(m.D)) {
    return { error: "MEASUREMENT_FAILED", message: "edge-standard produced no finite D (empty edge map?)" };
  }
  // V4 pair-bands (2026-10-06): the spectral sibling measurement on the same
  // traced grid. Fail-open to the existing single-feature bands when the
  // arrangement is unmeasurable (fewer than 3 traced components, or > 4000 —
  // CPU cap); a failed walk NEVER fails the image measurement.
  let spectral = null;
  const nComp = meta && Number.isInteger(meta.n_components_traced) ? meta.n_components_traced : null;
  if (nComp !== null && nComp >= 3 && nComp <= 4000) {
    try {
      const cw = walkCentroidMode(grid, { walkers: 64, seed: 42 });
      if (cw && cw.status === "ok" && cw.dims) {
        // N-FLOOR SEMANTIC FIX (2026-10-06, found during the corrected-hierarchy
        // Set A prep): the v10 n-floor clause intended ">= 300 DROPLETS" but
        // cw.n_components carries the DELAUNAY GRAPH's connected-component
        // count (1 for any connected arrangement) — which silently disabled
        // every pair-band since v10. The floor's recorded semantic is the
        // TRACED droplet count (edge-standard meta.n_components_traced);
        // graph_components stays as a diagnostic.
        spectral = {
          d_w: cw.dims.d_w,
          d_w_r2: cw.dims.d_w_r2,
          d_s_return: cw.dims.d_s,
          metric: cw.walk && cw.walk.msd_metric ? cw.walk.msd_metric : "euclidean",
          n_components: meta && Number.isInteger(meta.n_components_traced) ? meta.n_components_traced : cw.n_components,
          graph_components: cw.n_components,
        };
      }
    } catch { spectral = null; }
  }
  // Corrected-hierarchy lens feature (policy v11): computed ONLY when the
  // caller declares a registered gold family (artifact.any.lens_family) and
  // the artifact is the canonical 512x512 gray — arbitrary artifacts never
  // get lens features, so the band can never false-positive on them. The
  // estimator is reference-relative: obs vs the family's canonical gold
  // render. Out-of-envelope readings (checkCoef throws) are detection
  // signals recorded as a capped score, never a measurement failure.
  let lens = null;
  if (lensFamily && rawGrayBytes && width === 512 && height === 512) {
    try {
      const refRows = lensMathNS.goldRender(lensFamily);
      const obsRows = [];
      for (let y = 0; y < 512; y++) obsRows.push(Array.from(rawGrayBytes.subarray(y * 512, (y + 1) * 512)));
      const estimates = {};
      let detect = 0;
      for (const mode of LENS_MODES) {
        try {
          const est = lensMathNS.estimateCoefficient(mode, refRows, obsRows);
          estimates[mode] = est;
          const s = Math.abs(est) / DETECT_THRESHOLDS[mode];
          if (s > detect) detect = s;
        } catch (e) {
          estimates[mode] = null; // out-of-envelope reading = detection signal
          detect = 9999;
        }
      }
      lens = { detect_score: Math.min(9999, detect), estimates, family: lensFamily };
    } catch { lens = null; }
  }
  return {
    features: {
      fractal_band: { D: m.D, r2: m.r2 },
      symmetry_present: { score: sym.score, axis: sym.axis },
      coverage: meta.achieved_coverage,
      spectral,
      lens,
    },
    meta,
    value: m.D,
    featureName: MODALITY_FEATURE.image,
  };
}

// Deterministic lane-correct correction (policy v11): estimate each mode in
// the pinned sequential order against the family's canonical gold reference,
// apply the inverse warp for every mode whose estimate crosses its detection
// threshold, and return the corrected gray. Pure measurement-side
// preprocessing — the gate still disposes of the FINAL route.
function correctArtifactGray(img, family) {
  const W = img.width, H = img.height;
  if (W !== 512 || H !== 512) return { error: "LENS_FAMILY_SIZE", message: "lane-correct correction requires the canonical 512x512 gold geometry" };
  let bytes;
  try { bytes = Uint8Array.from(atob(img.gray_b64), (c) => c.charCodeAt(0)); } catch { return { error: "INVALID_IMAGE", message: "gray_b64 not valid base64" }; }
  if (bytes.length !== W * H) return { error: "INVALID_IMAGE", message: "gray_b64 length != width*height" };
  let refRows;
  try { refRows = lensMathNS.goldRender(family); } catch (e) { return { error: "LENS_FAMILY_UNKNOWN", message: String((e && e.message) || e) }; }
  const rows = [];
  for (let y = 0; y < H; y++) rows.push(Array.from(bytes.subarray(y * W, (y + 1) * W)));
  const applied = [];
  let cur = rows;
  for (const mode of LENS_MODES) {
    let est;
    try { est = lensMathNS.estimateCoefficient(mode, refRows, cur); } catch (e) { applied.push({ mode, skipped: String((e && e.message) || e) }); continue; }
    if (!(Math.abs(est) >= DETECT_THRESHOLDS[mode])) { applied.push({ mode, est, below_threshold: true }); continue; }
    try {
      cur = lensMathNS.warpMask(cur, mode, est, true);
      applied.push({ mode, est, corrected: true });
    } catch (e) {
      // Out-of-envelope estimate (e.g. the trefoil sign-aliasing found in the
      // Set B calibration: the estimator reads -3.18e-4 on a +1.9e-4
      // aberration — LF-4, predicted for the gasket's 3-fold symmetry). The
      // correction refuses to warp beyond the pinned envelope (fail-closed);
      // the mode is recorded as skipped and the re-select handles the rest.
      applied.push({ mode, est, skipped_warp: String((e && e.message) || e) });
    }
  }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = cur[y][x] & 255;
  let bin = "";
  const CH = 8192;
  for (let i = 0; i < out.length; i += CH) bin += String.fromCharCode.apply(null, out.subarray(i, i + CH));
  return { gray_b64: btoa(bin), applied };
}

// Measure text through the structured-evidence scorer (deterministic
// extraction + ONE batched clef call inside scoreDoc).
async function measureText(env, doc, threshold) {
  const r = await scoreDoc(env, { name: doc.name, text: doc.text }, { threshold });
  const bits = r.row.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  return {
    features: {
      scorer: {
        bits,
        row: r.row,
        probs: r.probs,
        evidence_counts: r.evidence_counts,
        scorer_version: r.scorer_version,
      },
    },
    value: bits,
    featureName: MODALITY_FEATURE.text,
  };
}

// Multimodal: ONE clef call via the askJev path. The instruction carries the
// hint and any measured context with decimals (fmt rule). The question is a
// noul with a criteria OBJECT (never a choices array). Verified live: the clef
// binding accepts an images array of embedded data URIs, and the patched
// askJev forwards opts.images when present (advisor patch, jev-decide.js).
// The images array is built from any.images (explicit array of data URIs) or
// any.data_url (single data URI); a bare any.data_b64 carries no mime type,
// so it rides the text/hint path only (clef rejects non-data-URI images).
async function measureMultimodal(deps, env, artifact, measuredCtx) {
  const any = artifact.any && typeof artifact.any === "object" ? artifact.any : {};
  const hint = typeof any.hint === "string" ? any.hint.trim().slice(0, MAX_HINT_CHARS) : "";
  const parts = [];
  if (hint) parts.push(`hint: ${hint}`);
  const ctxKeys = Object.keys(measuredCtx || {});
  for (const k of ctxKeys) {
    const v = measuredCtx[k];
    parts.push(`${k}: ${typeof v === "number" ? v.toFixed(4) : String(v)}`);
  }
  if (!parts.length) parts.push("no hint and no measured context supplied");
  const question = {
    type: "noul",
    instructions:
      `Route this multimodal artifact. ${parts.join("; ")}. ` +
      "Score 0..1 how well the artifact fits the routing target it describes.",
    criteria: { true: "the artifact clearly matches its described routing purpose", false: "the artifact does not match its described routing purpose" },
  };
  const ask = (deps && typeof deps.askJev === "function") ? deps.askJev : askJev;
  const images = Array.isArray(any.images)
    ? any.images.filter((u) => typeof u === "string" && u.startsWith("data:"))
    : (typeof any.data_url === "string" && any.data_url.startsWith("data:") ? [any.data_url] : []);
  const res = await ask(env, {
    router: ROUTER_VERSION,
    artifact: { modality: "multimodal", hint_present: !!hint, measured_context: measuredCtx || {} },
  }, { route_score: question }, { session_id: "jev-router-v1", images });
  // clef's noul answers arrive as {type:"noul", noul:<p>} (verified live);
  // answerProbability does not read the noul key, so parse it here first —
  // same decoding rule jev-corpus-scorer applies to its per-axis answers.
  const raw = res && res.answers ? res.answers.route_score : null;
  const score = raw && typeof raw === "object" && typeof raw.noul === "number" ? raw.noul : answerProbability(raw);
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { error: "MEASUREMENT_FAILED", message: "clef returned no finite route_score" };
  }
  return {
    features: { multimodal_band: { score }, measured_context: measuredCtx || {} },
    value: score,
    featureName: MODALITY_FEATURE.multimodal,
  };
}

// ---------------------------------------------------------------------------
// createRouterRoutes(deps) -> { routeArtifact, routeBands, routeSelftest, routeRuns }
// Each handler resolves { body, status } (createTasteRoutes contract).
// ---------------------------------------------------------------------------

export function createRouterRoutes(deps) {
  const needFns = ["recordRun", "findRun", "listRuns", "runPipeline", "loadPolicy", "gateAction"];
  for (const k of needFns) {
    if (!deps || typeof deps[k] !== "function") {
      throw new Error(`router routes: missing required deps (${k})`);
    }
  }
  if (!deps || !deps.dbx || typeof deps.dbx !== "object") {
    throw new Error("router routes: missing required deps (dbx)");
  }
  const helpersOf = () => {
    const h = (deps && deps.helpers) || {};
    return {
      now: typeof h.now === "function" ? h.now : nowIso,
      newId: typeof h.newId === "function" ? h.newId : newId,
    };
  };

  // ---- band surface (GET /bands) ------------------------------------------
  async function routeBands() {
    const pol = await deps.loadPolicy(deps.env);
    if (!pol || pol.error) {
      return { status: 503, body: { error: { code: "POLICY_UNREADABLE", message: (pol && pol.error) || "policy_unavailable" } } };
    }
    const doc = pol.doc;
    const routing = doc && doc.routing ? doc.routing : {};
    const bands = Array.isArray(routing.bands) ? routing.bands : [];
    return {
      status: 200,
      body: {
        default_on_no_band: routing.default_on_no_band === "needs_approval" ? "needs_approval" : "blocked",
        bands: bands.map((b) => ({
          id: b.id, modality: b.modality, feature: b.feature,
          min: b.min, max: b.max, target: b.target,
          calibration: b.calibration, description: b.description,
        })),
        policy_version: doc && doc.version != null ? doc.version : null,
      },
    };
  }

  // ---- runs surface (GET /runs) -------------------------------------------
  async function routeRuns(url) {
    const limRaw = url ? parseInt(url.searchParams.get("limit") || "50", 10) : 50;
    const lim = Math.min(Math.max(isNaN(limRaw) ? 50 : limRaw, 1), 200);
    let rows = [];
    try { rows = await deps.listRuns(lim * 3); } catch (e) {
      return { status: 500, body: { error: { code: "RUNS_FAILED", message: String((e && e.message) || e) } } };
    }
    const routes = rows.filter((r) => r && r.kind === "router").slice(0, lim).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      input_hash: r.input_hash,
      result: safeParse(r.result_json) || null,
      notes: safeParse(r.notes),
      policy_version: r.policy_version,
    }));
    return { status: 200, body: { runs: routes, count: routes.length } };
  }

  // ---- POST /route (measure -> band -> task -> gate -> auto-dispatch) ------
  async function routeArtifact(rawBody) {
    const body = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : null;
    if (!body || !body.artifact || typeof body.artifact !== "object" || Array.isArray(body.artifact)) {
      return { status: 422, body: { error: { code: "UNKNOWN_ARTIFACT", message: "body.artifact required" } } };
    }
    const res = resolveModality(body.artifact);
    if (res.error) return { status: 422, body: { error: { code: res.error, message: res.message || "artifact not recognized" } } };
    const modality = res.modality;
    const artifact = body.artifact;

    // Fail-closed FIRST: no policy, no route. Never a default route.
    const pol = await deps.loadPolicy(deps.env);
    if (!pol || pol.error) {
      return { status: 503, body: { error: { code: "POLICY_UNREADABLE", message: (pol && pol.error) || "policy_unavailable" } } };
    }
    const doc = pol.doc;

    // sha256-idempotent per input: same artifact -> same measurement row.
    const inputHash = await sha256hex(deps, canonicalJson({
      kind: "router",
      router_version: ROUTER_VERSION,
      modality,
      artifact: {
        image: artifact.image || null,
        text: artifact.text || null,
        any: artifact.any || null,
      },
    }));

    const existing = await deps.findRun("router", inputHash);
    if (existing) {
      const prev = safeParse(existing.result_json);
      if (prev && typeof prev === "object") {
        return { status: 200, body: { ...prev, run_id: existing.id, cached: true } };
      }
    }

    // ---- measure (per-modality dispatch) ----------------------------------
    let meas;
    // lensFamily (policy v11): the corrected-hierarchy band's lens features
    // are computed ONLY when the caller declares a registered gold family —
    // declared at routeArtifact scope so the lane-correct block can see it.
    const lensFamily = artifact.any && typeof artifact.any.lens_family === "string" && artifact.any.lens_family.length
      ? artifact.any.lens_family : null;
    const measuredCtx = {};
    if (modality === "image") {
      meas = measureImage(artifact.image, lensFamily);
      if (meas.error) return { status: 422, body: { error: { code: meas.error, message: meas.message } } };
    } else if (modality === "text") {
      try {
        const threshold = doc.thresholds && Number.isFinite(doc.thresholds.decision_threshold) ? doc.thresholds.decision_threshold : undefined;
        meas = await measureText(deps.env, { name: artifact.text.name, text: artifact.text.text }, threshold);
      } catch (e) {
        const code = e && e.code === "DECIDE_UNAVAILABLE" ? "DECIDE_UNAVAILABLE" : "MEASUREMENT_FAILED";
        return { status: code === "DECIDE_UNAVAILABLE" ? 503 : 422, body: { error: { code, message: String((e && e.message) || e) } } };
      }
    } else {
      // multimodal: deterministic context from any attached image/text, then
      // ONE clef call through the askJev path.
      if (res.hasImage) {
        const im = measureImage(artifact.image);
        if (!im.error && im.features) measuredCtx["image fractal D"] = im.features.fractal_band.D;
      }
      if (res.hasText) {
        try {
          const threshold = doc.thresholds && Number.isFinite(doc.thresholds.decision_threshold) ? doc.thresholds.decision_threshold : undefined;
          const tm = await measureText(deps.env, { name: artifact.text.name, text: artifact.text.text }, threshold);
          measuredCtx["text evidence bits"] = tm.value;
        } catch { /* context is best-effort; the clef call is the instrument */ }
      }
      try {
        meas = await measureMultimodal(deps, deps.env, artifact, measuredCtx);
      } catch (e) {
        const code = e && (e.code === "DECIDE_UNAVAILABLE" || /decide/i.test(String((e && e.message) || e))) ? "DECIDE_UNAVAILABLE" : "MEASUREMENT_FAILED";
        return { status: code === "DECIDE_UNAVAILABLE" ? 503 : 422, body: { error: { code, message: String((e && e.message) || e) } } };
      }
      if (meas.error) return { status: 422, body: { error: { code: meas.error, message: meas.message } } };
    }

    // ---- band lookup (policy read AT CALL TIME) ---------------------------
    const routing = doc.routing && typeof doc.routing === "object" ? doc.routing : {};
    const bands = Array.isArray(routing.bands) ? routing.bands : [];
    let featureName = meas.featureName;
    let band = selectBand(bands, modality, featureName, meas.value, meas.features);
    // ---- lane-correct: deterministic correction + ONE re-select (depth 1) --
    // The corrected-hierarchy band's target is lane-correct: the router runs
    // the pinned sequential correction inline (a measurement-side
    // preprocessing step, like ink-normalization), re-measures, and
    // re-selects ONCE. The gate still disposes of the FINAL route; a
    // re-select that lands on lane-correct again is blocked
    // (reroute_depth_exceeded). model_routes deliberately excludes
    // lane-correct, so the target can never be dispatched as a model call.
    let rerouteInfo = null;
    let provisionalCorrection = false;
    if (band && band.target === "lane-correct") {
      if (modality !== "image" || !lensFamily || !artifact.image || typeof artifact.image.gray_b64 !== "string") {
        return { status: 422, body: { error: { code: "LANE_CORRECT_INVALID", message: "lane-correct requires a family-declared 512x512 gray artifact" } } };
      }
      const corr = correctArtifactGray(artifact.image, lensFamily);
      if (corr.error) return { status: 422, body: { error: { code: corr.error, message: corr.message } } };
      const meas2 = measureImage({ gray_b64: corr.gray_b64, width: 512, height: 512 }, lensFamily);
      if (meas2.error) return { status: 422, body: { error: { code: meas2.error, message: meas2.message } } };
      // CONVERGENCE GATE (amendment 2026-10-06, LF-2/LF-4 demonstrated live in
      // the Set B calibration): the correction must VERIFY before the route
      // proceeds. If the corrected artifact STILL detects aberration
      // (detect_score >= 1 — e.g. the trefoil sign-aliasing case where the
      // spherical estimator mis-read the trefoil+zoom distortion as
      // spherical 0.28 and the trefoil residual stayed out-of-envelope), the
      // correction did not converge and the re-select is not trusted: block
      // for human review instead of silently routing a mis-corrected
      // artifact. The gate is the same independent-verification discipline
      // the task loop applies to every action.
      if (meas2.features && meas2.features.lens && meas2.features.lens.detect_score >= 1) {
        const result = {
          router_version: ROUTER_VERSION,
          measurement: meas,
          band: { id: band.id, target: band.target, calibration: band.calibration },
          decision: "blocked",
          gate: { outcome: "blocked", reasons: ["reroute_not_converged"] },
          task: null,
          reroute: { from_band: band.id, applied: corr.applied, re_band: null, post_detect_score: meas2.features.lens.detect_score },
        };
        try {
          const rec = await deps.recordRun({ kind: "router", input_hash: inputHash, result, notes: { source: body.source || "api", decision: "blocked" } });
          result.run_id = rec && rec.run_id ? rec.run_id : null;
        } catch (e) { /* audit trail only */ }
        return { status: 200, body: result };
      }
      const band2 = selectBand(bands, modality, meas2.featureName, meas2.value, meas2.features);
      if (band2 && band2.target === "lane-correct") {
        const result = {
          router_version: ROUTER_VERSION,
          measurement: meas,
          band: { id: band.id, target: band.target, calibration: band.calibration },
          decision: "blocked",
          gate: { outcome: "blocked", reasons: ["reroute_depth_exceeded"] },
          task: null,
          reroute: { from_band: band.id, applied: corr.applied, re_band: null },
        };
        try {
          const rec = await deps.recordRun({ kind: "router", input_hash: inputHash, result, notes: { source: body.source || "api", decision: "blocked" } });
          result.run_id = rec && rec.run_id ? rec.run_id : null;
        } catch (e) { /* audit trail only */ }
        return { status: 200, body: result };
      }
      provisionalCorrection = band.calibration !== "calibrated";
      rerouteInfo = { from_band: band.id, calibration: band.calibration, applied: corr.applied, re_band: band2 ? band2.id : null };
      band = band2;
      meas = meas2;
      featureName = meas.featureName;
    }
    const route = decideRoute(doc, band, band ? band.target : null);

    const measurement = { modality, feature: featureName, value: meas.value, features: meas.features, meta: meas.meta || null, reroute: rerouteInfo };

    // ---- no usable route: record the decision, never propose an action ----
    if (!band || route.outcome === "blocked") {
      const result = {
        router_version: ROUTER_VERSION,
        measurement,
        band: band ? { id: band.id, target: band.target, calibration: band.calibration } : null,
        decision: route.outcome,
        gate: { outcome: route.outcome, reasons: route.reasons },
        task: null,
      };
      const rec = await deps.recordRun({ kind: "router", input_hash: inputHash, result, notes: { source: body.source || "api", decision: route.outcome } });
      return { status: 200, body: { ...result, run_id: rec && rec.run_id ? rec.run_id : null } };
    }

    // ---- propose the action THROUGH the existing pipeline ------------------
    const helpers = helpersOf();
    // artifact_ref cites the deterministic input hash: the run row is written
    // ONCE per route decision, AFTER the pipeline (it must carry the gate
    // decision), so a pre-pipeline row id does not exist yet. findRun(key) on
    // the same hash is exactly how a cached artifact re-locates its row.
    const artifactRef = inputHash;

    const taskBody = {
      source: ["api", "console", "automation"].includes(body.source) ? body.source : "api",
      tenant: "router",
      idempotency_key: `route-${inputHash}`,
      title: `router: ${modality} ${featureName}=${Number(meas.value).toFixed(4)} -> ${band.target}`,
      payload: {
        route: {
          modality, feature: featureName, value: meas.value,
          band_id: band.id, target: band.target,
          calibration: band.calibration, artifact_ref: artifactRef,
        },
        actions: [{
          tool: ROUTE_TOOL,
          method: "POST",
          url: `https://${ROUTE_HOST}/${band.target}`,
          body: { target: band.target, artifact_ref: artifactRef, band_id: band.id },
          expected: { status_range: [200, 299] },
        }],
      },
    };

    const pipe = await deps.runPipeline(deps.env, taskBody);
    const out = pipe && pipe.out ? pipe.out : null;
    const task = out && out.task ? out.task : null;
    // Worst-of merge (routes-jev GATE_RANK parity): the router's own fail-closed
    // determination (e.g. band_provisional -> needs_approval) never relaxes the
    // gate's verdict, and a permissive pre-Lane-B gate never relaxes the router's.
    const GATE_RANK = { allowed: 0, needs_approval: 1, blocked: 2 };
    const gateOutcomeRaw = task && task.gate_outcome ? task.gate_outcome : "blocked";
    const routerOutcome = route.outcome || "allowed";
    const gateOutcome = (GATE_RANK[routerOutcome] ?? 2) > (GATE_RANK[gateOutcomeRaw] ?? 2) ? routerOutcome : gateOutcomeRaw;
    const gateReasons = task && task.gate_reasons_json ? (safeParse(task.gate_reasons_json) || []) : route.reasons;
    if (routerOutcome === "needs_approval" && gateOutcome === "needs_approval" && !gateReasons.includes("band_provisional")) {
      gateReasons.push("band_provisional");
    }

    // finalize the run row with the decision
    const result = {
      router_version: ROUTER_VERSION,
      measurement,
      band: { id: band.id, modality: band.modality, feature: band.feature, min: band.min, max: band.max, target: band.target, calibration: band.calibration },
      decision: gateOutcome,
      gate: { outcome: gateOutcome, reasons: gateReasons },
      task: task ? { id: task.id, state: task.state, gate_outcome: task.gate_outcome, terminal_outcome: task.terminal_outcome ?? null } : null,
    };
    let decidedRunId = artifactRef;
    try {
      // ONE run row per route decision (SPEC-ROUTER §6): written after the
      // pipeline so the row carries the final gate decision. The routing
      // stages themselves live on the task's append-only event chain.
      const rec = await deps.recordRun({ kind: "router", input_hash: inputHash, result, notes: { source: body.source || "api", stage: "decided" } });
      if (rec && rec.run_id) decidedRunId = rec.run_id;
    } catch { /* audit trail only */ }

    // ---- auto-dispatch leg (the approve auto-dispatch contract) -----------
    // Only when the gate ALLOWED the bound action AND the band is calibrated.
    // Provisional bands are never auto-dispatched by the router (SPEC-ROUTER
    // §2): the router refuses even when a pre-Lane-B gate says allowed.
    let autoDispatch = null;
    if (band.calibration !== "calibrated" || provisionalCorrection) {
      // A provisional band never auto-dispatches. When the gate ALREADY
      // refused, report the gate's reason; when a permissive pre-Lane-B gate
      // allowed it, report the router's own refusal (band_provisional).
      autoDispatch = gateOutcomeRaw !== "allowed" ? { skipped: `gate_${gateOutcome}` } : { skipped: "band_provisional" };
    } else if (gateOutcome !== "allowed" || !(task && task.id)) {
      autoDispatch = { skipped: `gate_${gateOutcome}` };
    } else {
      autoDispatch = await autoDispatchLeg(deps, helpers, doc, task);
    }

    const finalTask = task && task.id && deps.dbx && typeof deps.dbx.getTask === "function"
      ? (await deps.dbx.getTask(task.id).catch(() => task)) || task
      : task;

    return {
      status: 201,
      body: {
        measurement,
        band: result.band,
        decision: gateOutcome,
        gate: { outcome: gateOutcome, reasons: gateReasons },
        task: finalTask ? { id: finalTask.id, state: finalTask.state, gate_outcome: finalTask.gate_outcome, terminal_outcome: finalTask.terminal_outcome ?? null } : null,
        task_id: task ? task.id : null,
        run_id: decidedRunId,
        auto_dispatch: autoDispatch,
      },
    };
  }

  async function autoDispatchLeg(depsInner, helpers, doc, task) {
    try {
      await depsInner.dbx.updateTask(task.id, { gate_outcome: "allowed" });
      const actions = await depsInner.dbx.listActions(task.id);
      const now = helpers.now();
      const dispatched = [], skipped = [], verified = [];
      for (const a of actions) {
        if (a.state !== "proposed") { skipped.push({ action_id: a.id, reason: `state_${a.state}` }); continue; }
        const g = await depsInner.gateAction(doc, task, a, [], now);
        const outcome = g && g.outcome ? g.outcome : "blocked";
        if (outcome === "blocked") { skipped.push({ action_id: a.id, reason: `gate_blocked:${((g && g.reasons) || []).join(",")}` }); continue; }
        if (outcome !== "allowed") { skipped.push({ action_id: a.id, reason: "not_gate_allowed" }); continue; }
        const r = await depsInner.dispatchAction(depsInner.env, depsInner.dbx, task, a, doc);
        if (r && r.skipped) { skipped.push({ action_id: a.id, reason: (r.skipped && r.skipped.reason) || "skipped" }); continue; }
        dispatched.push({ action_id: a.id, provider_ref: (r && r.provider_ref) || null });
      }
      if (typeof depsInner.verifyAction === "function") {
        const fresh = await depsInner.dbx.getTask(task.id);
        const acts = await depsInner.dbx.listActions(task.id);
        for (const d of dispatched) {
          const a = acts.find((x) => x.id === d.action_id);
          if (!a) continue;
          const v = await depsInner.verifyAction(depsInner.env, depsInner.dbx, fresh, a);
          verified.push({ action_id: d.action_id, verdict: v && v.verdict });
        }
      }
      let next = null;
      if (typeof depsInner.continueTask === "function") {
        const fresh2 = await depsInner.dbx.getTask(task.id);
        const c = await depsInner.continueTask(depsInner.env, depsInner.dbx, fresh2);
        next = c && c.next;
      }
      return { dispatched, skipped, verified, next };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }

  // ---- selftest (SPEC-ROUTER §8 items 1-7) --------------------------------
  async function routeSelftest() {
    const checks = [];
    const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail === undefined ? null : detail });

    // 1. modality detection matrix
    check("modality_explicit_beats_auto", resolveModality({ modality: "text", image: { gray_b64: "AA", width: 2, height: 1 }, text: { text: "hi" } }).modality === "text");
    check("modality_auto_image", resolveModality({ image: { gray_b64: "AA", width: 2, height: 1 } }).modality === "image");
    check("modality_auto_text", resolveModality({ text: { text: "hi" } }).modality === "text");
    check("modality_auto_any", resolveModality({ any: { hint: "a screenshot" } }).modality === "multimodal");
    check("modality_image_plus_text_is_multimodal", resolveModality({ image: { gray_b64: "AA", width: 2, height: 1 }, text: { text: "hi" } }).modality === "multimodal");
    check("modality_unknown_422", resolveModality({}).error === "UNKNOWN_ARTIFACT");
    check("modality_explicit_without_payload_fails", resolveModality({ modality: "image", text: { text: "hi" } }).error === "UNKNOWN_ARTIFACT");

    // 2. band lookup boundaries (min inclusive, max exclusive, last inclusive-both)
    const bands2 = [
      { id: "a", modality: "image", feature: "fractal_band.D", min: 1.45, max: 2.0, target: "t-hi", calibration: "calibrated" },
      { id: "b", modality: "image", feature: "fractal_band.D", min: 1.0, max: 1.45, target: "t-lo", calibration: "calibrated" },
      { id: "c", modality: "image", feature: "fractal_band.D", min: 0.0, max: 1.0, target: "t-sparse", calibration: "calibrated" },
      { id: "m", modality: "multimodal", feature: "multimodal_band.score", min: 0.0, max: 1.0, target: "t-mm", calibration: "calibrated" },
    ];
    check("band_min_inclusive", (selectBand(bands2, "image", "fractal_band.D", 1.45) || {}).id === "a");
    const featsOK = { fractal_band: { D: 1.30 }, spectral: { d_w: 2.70 } };
    const featsNO = { fractal_band: { D: 1.30 }, spectral: { d_w: 2.04 } };
    const pairBands = [
      { id: "pair", modality: "image", feature: "pair", min: 0, max: 100, all: [{ feature: "fractal_band.D", min: 1.0, max: 1.45 }, { feature: "spectral.d_w", min: 2.4, max: 100 }], target: "t-pair", calibration: "calibrated" },
      { id: "lo", modality: "image", feature: "fractal_band.D", min: 1.0, max: 1.45, target: "t-lo", calibration: "calibrated" },
    ];
    check("pair_band_all_clauses_win", (selectBand(pairBands, "image", "fractal_band.D", 1.30, featsOK) || {}).id === "pair");
    check("pair_band_clause_fail_falls_through", (selectBand(pairBands, "image", "fractal_band.D", 1.30, featsNO) || {}).id === "lo");
    check("pair_band_no_features_never_matches", (selectBand(pairBands, "image", "fractal_band.D", 1.30) || {}).id === "lo");
    check("band_max_exclusive", (selectBand(bands2, "image", "fractal_band.D", 1.45 - 1e-9) || {}).id === "b");
    check("band_last_inclusive_both", (selectBand(bands2, "image", "fractal_band.D", 0.0) || {}).id === "c"
      && (selectBand([{ id: "x", modality: "multimodal", feature: "multimodal_band.score", min: 0, max: 1, target: "t" }], "multimodal", "multimodal_band.score", 1.0) || {}).id === "x");
    check("band_no_match_falls_through", selectBand(bands2, "image", "fractal_band.D", 2.5) === null);
    check("band_wrong_modality_no_match", selectBand(bands2, "text", "scorer.bits", 3) === null);

    // 3. fail-closed default
    check("failclosed_empty_bands", decideRoute({ routing: {} }, null, null).outcome === "blocked");
    check("failclosed_default_needs_approval_honored", decideRoute({ routing: { default_on_no_band: "needs_approval" } }, null, null).outcome === "needs_approval");
    check("failclosed_garbage_default_blocked", decideRoute({ routing: { default_on_no_band: "yolo" } }, null, null).outcome === "blocked");

    // 4. synthetic fixture parity: the blob measures into the hierarchy-shaped
    // band OF THE TEST TABLE (computed from the table, never a hardcoded id).
    const fixture = makeSyntheticBlob(99, 0.45);
    const st = edgeStandardize(fixture.gray, fixture.w, fixture.h);
    const m = edgeMeasure(st.grid);
    const fixtureD = m.D;
    const dOk = typeof fixtureD === "number" && Number.isFinite(fixtureD) && fixtureD >= 1.45 && fixtureD < 2.0;
    const bFixture = selectBand(bands2, "image", "fractal_band.D", fixtureD);
    check("fixture_synthetic_blob_in_hierarchy_band", dOk && (bFixture || {}).id === "a", `D=${fixtureD != null ? fixtureD.toFixed(4) : String(fixtureD)}`);

    // 5. determinism: same fixture twice -> identical measurement
    const st2 = edgeStandardize(fixture.gray, fixture.w, fixture.h);
    const m2 = edgeMeasure(st2.grid);
    check("measurement_deterministic", m2.D === m.D && m2.r2 === m.r2);

    // 6. no hardcoded bands: a different band table routes the same D elsewhere
    const bandsAlt = [{ id: "alt", modality: "image", feature: "fractal_band.D", min: 0.0, max: 3.0, target: "t-alt", calibration: "calibrated" }];
    check("no_hardcoded_bands", (selectBand(bandsAlt, "image", "fractal_band.D", fixtureD) || {}).id === "alt"
      && (selectBand(bands2, "image", "fractal_band.D", fixtureD) || {}).id === "a");

    // 7. gate validation semantics (policy-shaped)
    const pol7 = { routing: { default_on_no_band: "blocked", bands: bands2 }, tools: { [ROUTE_TOOL]: { hosts: [ROUTE_HOST], methods: ["POST"], targets: ["t-hi", "t-lo", "t-sparse", "t-mm"] } } };
    check("gate_undeclared_target_blocked", decideRoute(pol7, { id: "a", calibration: "calibrated", target: "t-undeclared" }, "t-undeclared").reasons.includes("target_not_declared"));
    check("gate_provisional_needs_approval", decideRoute(pol7, { id: "a", calibration: "provisional", target: "t-hi" }, "t-hi").outcome === "needs_approval");
    const polProvisional = { routing: { bands: [{ id: "p", modality: "image", feature: "fractal_band.D", min: 0, max: 3, target: "t-x", calibration: "provisional" }] }, tools: { [ROUTE_TOOL]: { targets: ["t-x"] } } };
    check("gate_provisional_beats_declared_target", decideRoute(polProvisional, polProvisional.routing.bands[0], "t-x").outcome === "needs_approval");

    const failed = checks.filter((c) => !c.pass);
    return { status: 200, body: { ok: failed.length === 0, version: ROUTER_VERSION, checks, failed: failed.length } };
  }

  return { routeArtifact, routeBands, routeSelftest, routeRuns };
}

// ---------------------------------------------------------------------------
// jev_corpus_runs store (same table, same RUN_COLS whitelist as the corpus
// module's corpusStore; kept local so this module does not import the corpus
// routes module back). The dbx insert-layer whitelist lesson (D1 rejects
// unknown columns) applies: only these 7 columns are ever bound.
// ---------------------------------------------------------------------------

const RUN_COLS = ["id", "created_at", "kind", "input_hash", "result_json", "notes", "policy_version"];
const RUNS_TABLE = "jev_corpus_runs";

function routerRunStore(drv) {
  const selectCols = RUN_COLS.join(", ");
  return {
    async insertRun(row) {
      const sql = `INSERT INTO ${RUNS_TABLE} (${selectCols}) VALUES (${RUN_COLS.map(() => "?").join(", ")})`;
      await drv.run(sql, RUN_COLS.map((c) => (row[c] === undefined ? null : row[c])));
      return row;
    },
    async findRun(kind, inputHash) {
      return drv.get(
        `SELECT ${selectCols} FROM ${RUNS_TABLE} WHERE kind = ? AND input_hash = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
        [kind, inputHash]
      );
    },
    async listRuns(limit) {
      return drv.all(
        `SELECT ${selectCols} FROM ${RUNS_TABLE} ORDER BY created_at DESC, id DESC LIMIT ?`,
        [limit]
      );
    },
  };
}

// ---------------------------------------------------------------------------
// handleJevRouter(req, env, deps) — the HTTP surface, mirroring the corpus
// module's handler pattern (auth -> rate limit -> env checks -> handlers).
// Wiring (advisor): routes-jev.js handleJev adds ONE delegation line after the
// corpus delegation:
//   if (p.startsWith("/api/jev/route")) return handleJevRouter(req, env, deps);
// ---------------------------------------------------------------------------

export async function handleJevRouter(req, env, deps) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...JEV_CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  }
  const auth = await authorizedAsync(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);
  if (deps.rateLimited && deps.rateLimited(req, 30)) return err("RATE_LIMITED", "rate limited", 429);

  let routerDeps;
  try {
    routerDeps = await buildRouterDeps(env, deps);
  } catch (e) {
    return err("ROUTER_NOT_CONFIGURED", (e && e.message) || String(e), 503);
  }
  const routes = createRouterRoutes(routerDeps);
  const toRes = (out) => json(out.body, out.status || 200);

  if (p === "/api/jev/route" && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 8 MB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
    try { return toRes(await routes.routeArtifact(body)); }
    catch (e) { return err("ROUTE_FAILED", String((e && e.message) || e), (e && e.code === "DECIDE_UNAVAILABLE") ? 503 : 500); }
  }
  if (p === "/api/jev/route/bands" && req.method === "GET") {
    try { return toRes(await routes.routeBands()); }
    catch (e) { return err("BANDS_FAILED", String((e && e.message) || e), 500); }
  }
  if (p === "/api/jev/route/selftest" && req.method === "POST") {
    try { return toRes(await routes.routeSelftest()); }
    catch (e) { return err("ROUTER_SELFTEST_FAILED", String((e && e.message) || e), 500); }
  }
  if (p === "/api/jev/route/runs" && req.method === "GET") {
    return toRes(await routes.routeRuns(url));
  }
  return err("NOT_FOUND", `no router route for ${req.method} ${p}`, 404);
}

// Builds the createRouterRoutes deps bundle from env + the master deps. The
// run-row store rides env.DB through the same d1CorpusDriver the corpus module
// uses; ensureCorpusSchema is shared so the table always exists.
export async function buildRouterDeps(env, deps) {
  // ensureCorpusSchema/d1CorpusDriver are imported lazily-agnostically: the
  // corpus module exports them; if a future refactor moves them, this adapter
  // is the single place to update. The store itself is local (routerRunStore).
  const { ensureCorpusSchema, d1CorpusDriver } = await import("./jev-corpus-routes.js");
  if (!env || !env.DB) throw new Error("env.DB binding missing; router runs unavailable");
  await ensureCorpusSchema(env.DB);
  const store = routerRunStore(d1CorpusDriver(env.DB));
  const h = (deps && deps.helpers) || {};
  const helpers = {
    now: typeof h.now === "function" ? h.now : nowIso,
    newId: typeof h.newId === "function" ? h.newId : newId,
    sha256Hex: typeof h.sha256Hex === "function" ? h.sha256Hex : null,
  };
  const policyVersion = async () => {
    try {
      const pol = await deps.loadPolicy(env);
      const doc = pol && !pol.error ? pol.doc : null;
      const v = doc ? doc.version : null;
      return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
    } catch { return null; }
  };
  return {
    env,
    dbx: deps.dbx,
    helpers,
    loadPolicy: deps.loadPolicy,
    gateAction: deps.gateAction,
    dispatchAction: deps.dispatchAction,
    verifyAction: deps.verifyAction,
    continueTask: deps.continueTask,
    runPipeline: deps.runPipeline || ((e, body) => runPipeline(e, deps, body)),
    askJev: deps.routerAskJev, // optional override (tests); default is the imported askJev
    recordRun: async (r) => {
      try {
        const row = {
          id: helpers.newId("cr_"),
          created_at: helpers.now(),
          kind: r.kind,
          input_hash: r.input_hash,
          result_json: cappedJson(r.result),
          notes: r.notes ? JSON.stringify(r.notes) : null,
          policy_version: await policyVersion(),
        };
        await store.insertRun(row);
        return { run_id: row.id };
      } catch (e) {
        return { run_id: null, run_error: String((e && e.message) || e) };
      }
    },
    findRun: (kind, inputHash) => store.findRun(kind, inputHash),
    listRuns: (limit) => store.listRuns(limit),
  };
}
