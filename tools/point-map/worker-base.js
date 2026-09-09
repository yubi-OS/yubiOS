import { fetchCorpus } from "./lib/tar-corpus.mjs";
// --- new/redesigned-route modules (see session/subagent/lib/*.mjs) ---
import { ApiError, jsonResponse, errorResponse, readJsonLimited } from "./lib/http.mjs";
import { embedDocuments, rememberChunkedEmbeddings } from "./lib/embed-pipeline.mjs";
import { repoItemsHandler } from "./lib/repo-items.mjs";
import { mapRouteHandler, mapsCompareHandler } from "./lib/map-route.mjs";

// src/github.ts
var GH = "https://api.github.com";
var CODELOAD = "https://codeload.github.com";
var TEXT_EXT = /\.(md|txt|rst|ts|tsx|js|jsx|py|rs|go|c|h|cpp|hpp|java|rb|sh|bash|fish|yml|yaml|toml|json|lean|tex|rego|conf|cfg|ini|sql|proto|dockerfile|containerfile|hcl|tf)$/i;
var SPECIAL = /(^|\/)(readme|license|makefile|dockerfile|containerfile)(\.|$)/i;
var SKIP_DIRS = /(^|\/)(node_modules|vendor|dist|build|\.git|figs?|images?|assets|fonts)\//i;
function headers(token) {
  const h = {
    "User-Agent": "sos-agent",
    Accept: "application/vnd.github+json"
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function parseRepoUrl(url) {
  const m = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}
async function ghFetch(url, token) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: headers(token) });
    if (r.status !== 403 && r.status !== 429) return r;
    last = r;
    if (i < 2) await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return last;
}
function tarStr(b, off, len) {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(off, end));
}

// src/latent.ts
var STOP = new Set(`
about above after again against also among another around because been before being below between both
could does doing done down during each else every from further have having here into just like made make
many more most much must never only other over same should since some such than that their them then there
these they this those through under until upon using very were what when where which while will with within
would your yours
function return import export const class self this none true false null string number value values type
name names default license licensed copyright apache version https http github com org www file files path
line lines list dict object args kwargs param params arguments error errors exception result results test tests
data item items index count total size length text print main init module package public private static void
async await then catch else elif break continue pass raise yield lambda while case switch struct enum impl
uint int32 int64 float bool char byte bytes span code source project readme install usage example examples
corporation reserved rights warranty warranties permission permitted notice disclaimer contributors author authors
spdx identifier bsd-2-clause bsd-3-clause include endif ifndef ifdef define undef typedef extern sizeof boolean
information supported without express implied conditions limitations governing specific language holders
`.split(/\s+/).filter(Boolean));
function tokenize(text) {
  const out = /* @__PURE__ */ new Set();
  const raw = text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
  for (const tok of raw) {
    const parts = tok.split(/[_-]+/).filter((p) => p.length >= 4);
    const cands = parts.length > 1 ? [tok, ...parts] : [tok];
    for (const c of cands) {
      if (STOP.has(c) || /^\d+$/.test(c) || c.length > 32) continue;
      out.add(c);
    }
  }
  return out;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
function deriveBasis(files, k = 10) {
  const n = files.length;
  const docTokens = files.map((f) => tokenize(f.text));
  const docsOf = /* @__PURE__ */ new Map();
  docTokens.forEach((toks, i) => {
    for (const t of toks) {
      let s = docsOf.get(t);
      if (!s) {
        s = /* @__PURE__ */ new Set();
        docsOf.set(t, s);
      }
      s.add(i);
    }
  });
  const lo = Math.max(3, Math.ceil(0.05 * n)), hi = Math.floor(0.6 * n);
  const candidates = [...docsOf.entries()].filter(([, s]) => s.size >= lo && s.size <= hi).map(([t, s]) => ({ t, s, w: s.size / n * (1 - s.size / n) * (1 + Math.min(t.length, 12) / 24) })).sort((a, b) => b.w - a.w || a.t.localeCompare(b.t));
  const primitives = [];
  const members = [];
  const used = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (primitives.length >= k) break;
    if (used.has(c.t)) continue;
    const terms = [c.t];
    used.add(c.t);
    const union = new Set(c.s);
    for (const o of candidates) {
      if (terms.length >= 6) break;
      if (used.has(o.t)) continue;
      if (jaccard(c.s, o.s) >= 0.6) {
        terms.push(o.t);
        used.add(o.t);
        for (const d of o.s) union.add(d);
      }
    }
    if (members.some((m) => jaccard(m, union) >= 0.8)) continue;
    primitives.push({ name: terms.slice(0, 2).join("+"), terms, df: +(union.size / n).toFixed(3) });
    members.push(union);
  }
  const vectors = files.map((_, i) => members.map((m) => m.has(i) ? 1 : 0));
  return { primitives, vectors, vocab_size: docsOf.size, kept_terms: candidates.length };
}
function vectorsFromBasis(files, primitives) {
  return files.map((f) => {
    const toks = tokenize(f.text);
    return primitives.map((p) => p.terms.some((t) => toks.has(t)) ? 1 : 0);
  });
}
function dropPrimitives(raw, exclude) {
  const keepIdx = raw.primitives.map((p, i) => p.terms.some((t) => exclude.has(t)) ? -1 : i).filter((i) => i >= 0);
  return { ...raw, primitives: keepIdx.map((i) => raw.primitives[i]), vectors: raw.vectors.map((r) => keepIdx.map((i) => r[i])) };
}

// src/basis-llm.ts
var AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
function fallback(raw, k, note) {
  const keep = raw.primitives.slice(0, k).map((p, i) => ({ ...p, concept: p.name, reason: "raw cluster (no LLM pass)", source_index: i }));
  return {
    mode: "learned_latent_raw",
    primitives: keep,
    vectors: raw.vectors.map((row) => keep.map((p) => row[p.source_index])),
    pruned: [],
    note
  };
}
function parseDecisions(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const norm = (d) => {
    if (Array.isArray(d)) return { index: Number(d[0]), keep: d[1] === true || d[1] === "true", concept: typeof d[2] === "string" ? d[2] : void 0, reason: typeof d[3] === "string" ? d[3] : void 0 };
    if (d && typeof d === "object") return { index: Number(d.index), keep: d.keep === true || d.keep === "true", concept: d.concept, reason: d.reason };
    return null;
  };
  try {
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed : parsed?.decisions;
    if (Array.isArray(arr)) {
      const out2 = arr.map(norm).filter((d) => !!d && Number.isFinite(d.index));
      if (out2.length) return out2;
    }
  } catch {
  }
  const out = [];
  const objRe = /\{[^{}]*"index"\s*:\s*(\d+)[^{}]*"keep"\s*:\s*(true|false)[^{}]*\}/g;
  for (const m of clean.matchAll(objRe)) {
    try {
      const d = norm(JSON.parse(m[0]));
      if (d) out.push(d);
    } catch {
      const c = /"concept"\s*:\s*"([^"]*)"/.exec(m[0]);
      out.push({ index: Number(m[1]), keep: m[2] === "true", concept: c?.[1] });
    }
  }
  const arrRe = /\[\s*(\d+)\s*,\s*(true|false)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\]/g;
  for (const m of clean.matchAll(arrRe)) out.push({ index: Number(m[1]), keep: m[2] === "true", concept: m[3], reason: m[4] });
  return out.length ? out : null;
}
async function aiText(ai, instructions, input, maxTokens = 2048) {
  const res = await ai.run(AI_MODEL, {
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input }
    ],
    max_tokens: maxTokens
  });
  let t = res;
  if (typeof t === "string") return t;
  if (t && typeof t.response !== "undefined") t = t.response;
  if (t && typeof t.choices !== "undefined") t = t.choices?.[0]?.message?.content;
  return typeof t === "string" ? t : t == null ? "" : JSON.stringify(t);
}
async function refineBasis(ai, raw, files, repo, k = 10) {
  if (raw.primitives.length <= 3) return fallback(raw, k, "too few candidates to refine");
  const candidates = raw.primitives.map((p, i) => {
    const paths = files.map((f, j) => ({ f, j })).filter(({ j }) => raw.vectors[j][i] === 1).slice(0, 4).map(({ f }) => f.path);
    return { index: i, terms: p.terms, df: p.df, sample_paths: paths };
  });
  const instructions = `You curate a latent primitive basis for a code corpus. You receive candidate term clusters mined from the repository ${repo.owner}/${repo.repo}` + (repo.description ? ` ("${repo.description}")` : "") + (repo.language ? `, primary language ${repo.language}` : "") + `. For each candidate decide keep=true if it names a real concept of THIS project (architecture, domain object, mechanism, workflow, guarantee) and keep=false if it is boilerplate: language syntax or stdlib (e.g. __future__, annotations, typing, python, import), license or copyright text, build/packaging noise, generic English, test scaffolding, or a duplicate of a stronger cluster. Give every kept candidate a short snake_case concept label (2-3 words) and a one-line reason under 12 words. Keep at most ${k}. Respond with ONLY this JSON shape, every decision an OBJECT with these four keys, one per candidate: {"decisions":[{"index":0,"keep":true,"concept":"snake_case","reason":"short"}]}. No arrays-of-values, no prose, no code fences.`;
  let decisions = null;
  let lastText = "";
  for (let attempt = 0; attempt < 2 && !decisions; attempt++) {
    let text = "";
    try {
      text = await aiText(ai, attempt === 0 ? instructions : instructions + " Your previous answer was not valid JSON objects. Output strictly the JSON object described, nothing else.", JSON.stringify({ candidates }));
    } catch (e) {
      console.error("basis refine llm failed", e?.message);
      return fallback(raw, k, `llm unavailable (${e && e.message || "unknown"}), used raw clusters`);
    }
    lastText = text;
    decisions = parseDecisions(text);
    if (!decisions) console.error("basis refine parse failed (attempt " + (attempt + 1) + ")", text.slice(0, 200));
  }
  if (!decisions) return fallback(raw, k, `llm output unparseable after retry, used raw clusters (${lastText.slice(0, 60)})`);
  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const kept = [];
  const pruned = [];
  raw.primitives.forEach((p, i) => {
    const d = byIndex.get(i);
    if (d?.keep && kept.length < k) {
      const concept = (d.concept || p.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || p.name;
      kept.push({ ...p, concept, reason: d.reason || "", source_index: i });
    } else {
      pruned.push({ name: p.name, terms: p.terms, reason: d?.reason || (d ? "pruned" : "no decision returned") });
    }
  });
  if (kept.length < 3) return fallback(raw, k, `llm kept only ${kept.length}; used raw clusters`);
  return {
    mode: "learned_latent+llm_refined",
    primitives: kept,
    vectors: raw.vectors.map((row) => kept.map((p) => row[p.source_index])),
    pruned
  };
}

// src/fit.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function jacobiEig(A) {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_2, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const values = a.map((r, i) => r[i]);
  const idx = values.map((_, i) => i).sort((x, y) => values[y] - values[x]);
  return {
    values: idx.map((i) => values[i]),
    vectors: idx.map((i) => v.map((row) => row[i]))
  };
}
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r[n]);
}
function pca2(X) {
  const n = X.length, d = X[0].length;
  const mu = Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mu[j] += row[j] / n;
  const C = Array.from({ length: d }, () => Array(d).fill(0));
  for (const row of X) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++)
    C[i][j] += (row[i] - mu[i]) * (row[j] - mu[j]) / Math.max(1, n - 1);
  const { values, vectors } = jacobiEig(C);
  const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const pc12 = (Math.max(0, values[0]) + Math.max(0, values[1])) / total;
  const project = (row) => {
    const cent = row.map((x, j) => x - mu[j]);
    return [
      cent.reduce((s, x, j) => s + x * vectors[0][j], 0),
      cent.reduce((s, x, j) => s + x * vectors[1][j], 0)
    ];
  };
  const proj = X.map(project);
  return { proj, pc12, eigenvalues: values, mu, project };
}
function liftPoint(u0, v0, s) {
  const u = u0 * s, v = v0 * s;
  const den = 1 + u * u + v * v;
  return [2 * u / den, 2 * v / den, (u * u + v * v - 1) / den];
}
function liftScale(uv) {
  let maxR = 1e-9;
  for (const [u, v] of uv) maxR = Math.max(maxR, Math.hypot(u, v));
  return 0.9 / maxR;
}
function liftToSphere(uv) {
  const s = liftScale(uv);
  return uv.map(([u, v]) => liftPoint(u, v, s));
}
function shBasis([x, y, z]) {
  return [
    0.28209479,
    0.48860251 * y,
    0.48860251 * z,
    0.48860251 * x,
    1.09254843 * x * y,
    1.09254843 * y * z,
    0.31539157 * (3 * z * z - 1),
    1.09254843 * x * z,
    0.54627422 * (x * x - y * y),
    0.59004359 * y * (3 * x * x - y * y),
    2.89061144 * x * y * z,
    0.4570458 * y * (5 * z * z - 1),
    0.37317633 * z * (5 * z * z - 3),
    0.4570458 * x * (5 * z * z - 1),
    1.44530572 * z * (x * x - y * y),
    0.59004359 * x * (x * x - 3 * y * y)
  ];
}
function ridgeFit(A, y, lambda = 1e-3) {
  const k = A[0].length;
  const AtA = Array.from({ length: k }, () => Array(k).fill(0));
  const Aty = Array(k).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let a = 0; a < k; a++) {
      Aty[a] += A[i][a] * y[i];
      for (let b = 0; b < k; b++) AtA[a][b] += A[i][a] * A[i][b];
    }
  }
  for (let a = 0; a < k; a++) AtA[a][a] += lambda;
  return solveLinear(AtA, Aty);
}
function r2(y, yhat) {
  const mu = y.reduce((s, v) => s + v, 0) / y.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2;
    ssTot += (y[i] - mu) ** 2;
  }
  return ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
}
function flatBasis([u, v]) {
  return [
    1,
    u,
    v,
    u * u,
    u * v,
    v * v,
    u ** 3,
    u * u * v,
    u * v * v,
    v ** 3,
    u ** 4,
    u ** 3 * v,
    u * u * v * v,
    u * v ** 3,
    v ** 4,
    Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
  ];
}
function holdoutR2(basisRows, y, rand) {
  const n = y.length;
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const nTest = Math.max(2, Math.floor(n * 0.2));
  const test = idx.slice(0, nTest), train = idx.slice(nTest);
  if (train.length < 17) {
    const beta2 = ridgeFit(basisRows, y, 0.01);
    return r2(y, basisRows.map((r) => r.reduce((s, b, j) => s + b * beta2[j], 0)));
  }
  const beta = ridgeFit(train.map((i) => basisRows[i]), train.map((i) => y[i]));
  const yhat = test.map((i) => basisRows[i].reduce((s, b, j) => s + b * beta[j], 0));
  return r2(test.map((i) => y[i]), yhat);
}
function isolatedCount(pts, r = 0.095) {
  let count = 0;
  for (let i = 0; i < pts.length; i++) {
    let near = false;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      if (d <= r) {
        near = true;
        break;
      }
    }
    if (!near) count++;
  }
  return count;
}
function occupiedCells(pts) {
  const cells = /* @__PURE__ */ new Set();
  for (const [x, y, z] of pts) {
    const zi = Math.min(7, Math.floor((z + 1) / 2 * 8));
    const phi = Math.atan2(y, x);
    const pi_ = Math.min(7, Math.floor((phi + Math.PI) / (2 * Math.PI) * 8));
    cells.add(zi * 8 + pi_);
  }
  return cells.size;
}
var NSS_AXES = [
  "Audience",
  "Inputs",
  "Outputs",
  "Mode",
  "Assumption set",
  "Adjacent problems",
  "Failure modes",
  "Lifecycle",
  "Composition",
  "Knowledge sources",
  "Calibration",
  "Recursion"
];
function geodesic(a, b) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d);
}
function fibonacciGrid(n = 400) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = ga * i;
    out.push([r * Math.cos(phi), r * Math.sin(phi), z]);
  }
  return out;
}
function surfaceAt(beta, p) {
  return shBasis(p).reduce((s, b, j) => s + b * beta[j], 0);
}
function poleOf(beta, grid) {
  let best = grid[0], bv = -Infinity;
  for (const g of grid) {
    const v = surfaceAt(beta, g);
    if (v > bv) {
      bv = v;
      best = g;
    }
  }
  return { xyz: best, value: bv };
}
function cellOf([x, y, z]) {
  const zi = Math.min(7, Math.floor((z + 1) / 2 * 8));
  const phi = Math.atan2(y, x);
  const pi_ = Math.min(7, Math.floor((phi + Math.PI) / (2 * Math.PI) * 8));
  return { zi, pi: pi_, id: zi * 8 + pi_ };
}
function cellCenter(zi, pi_) {
  const z = -1 + (zi + 0.5) / 4;
  const phi = -Math.PI + (pi_ + 0.5) / 8 * 2 * Math.PI;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}
function nssAxisOf([x, y]) {
  const phi = Math.atan2(y, x);
  return NSS_AXES[Math.min(11, Math.floor((phi + Math.PI) / (2 * Math.PI) * 12))];
}
function sphereFit(X) {
  const { proj, pc12, project } = pca2(X);
  const scale = liftScale(proj);
  const pts = proj.map(([u, v]) => liftPoint(u, v, scale));
  const y = X.map((row) => row.reduce((s, v) => s + v, 0) / row.length);
  const beta = ridgeFit(pts.map(shBasis), y, 0.01);
  return { proj, pts, beta, pc12, scale, project };
}
function pipelineR2(X, seed) {
  const { proj } = pca2(X);
  const pts = liftToSphere(proj);
  const y = X.map((row) => row.reduce((s, v) => s + v, 0) / row.length);
  return holdoutR2(pts.map(shBasis), y, mulberry32(seed));
}
function runFit(items, corpusName, basisNames, fillSize = 5) {
  const X = items.map((it) => it.coverage);
  const n = items.length;
  const seed = strSeed(corpusName);
  const { proj, pc12, eigenvalues } = pca2(X);
  const pts = liftToSphere(proj);
  const y = items.map((it) => it.phi / basisNames.length);
  const sphereRows = pts.map(shBasis);
  const flatRows = proj.map(flatBasis);
  const sphereR2 = holdoutR2(sphereRows, y, mulberry32(seed));
  const flatR2 = holdoutR2(flatRows, y, mulberry32(seed));
  const ablationDelta = sphereR2 - flatR2;
  const K = 200;
  const rand = mulberry32(seed ^ 2654435769);
  const nullR2 = [];
  for (let k = 0; k < K; k++) {
    const Xp = X.map((row) => row.slice());
    for (let j = 0; j < X[0].length; j++) {
      for (let i = n - 1; i > 0; i--) {
        const m = Math.floor(rand() * (i + 1));
        const t = Xp[i][j];
        Xp[i][j] = Xp[m][j];
        Xp[m][j] = t;
      }
    }
    nullR2.push(pipelineR2(Xp, seed + k + 1));
  }
  const nullMean = nullR2.reduce((s, v) => s + v, 0) / K;
  const nullStd = Math.sqrt(nullR2.reduce((s, v) => s + (v - nullMean) ** 2, 0) / (K - 1)) || 1e-9;
  const zNull = (sphereR2 - nullMean) / nullStd;
  const verdict = zNull >= 3 ? `NULL EXCLUDED (z=${zNull.toFixed(2)} >= 3): curvature signal exceeds the column-permutation null` : zNull <= -3 ? `NULL EXCLUDED, INVERTED (z=${zNull.toFixed(2)} <= -3): corpus is significantly LESS structured than its permutation null` : `NOT EXCLUDED (|z|=${Math.abs(zNull).toFixed(2)} < 3): compatible with the column-permutation null`;
  const phiHist = {};
  for (const it of items) phiHist[it.phi] = (phiHist[it.phi] ?? 0) + 1;
  let entropy = 0;
  for (const c of Object.values(phiHist)) {
    const p = c / n;
    entropy -= p * Math.log2(p);
  }
  const coverageMean = y.reduce((s, v) => s + v, 0) / n;
  const primFreq = basisNames.map((_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const gaps = basisNames.map((p, j) => ({ primitive: p, frequency: +primFreq[j].toFixed(3) })).sort((a, b) => a.frequency - b.frequency);
  const targets = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.phi - b.it.phi).slice(0, 5).map(({ it }) => {
    const missing = basisNames.map((p, j) => ({ p, j, f: primFreq[j] })).filter(({ j }) => it.coverage[j] === 0).sort((a, b) => a.f - b.f);
    const target = missing[0];
    return {
      path: it.path,
      phi: it.phi,
      single_action: target ? `add ${target.p} coverage (corpus frequency ${(target.f * 100).toFixed(0)}%)` : "fully covered"
    };
  });
  const d = basisNames.length;
  const base = sphereFit(X);
  const grid = fibonacciGrid(400);
  const basePole = poleOf(base.beta, grid);
  const baseOccupied = occupiedCells(base.pts);
  const baseIsolated = isolatedCount(base.pts);
  const baseR2 = holdoutR2(base.pts.map(shBasis), y, mulberry32(seed));
  const occ = /* @__PURE__ */ new Map();
  for (const p of base.pts) {
    const c = cellOf(p).id;
    occ.set(c, (occ.get(c) ?? 0) + 1);
  }
  const seen = new Set(X.map((row) => row.join("")));
  const holes = [];
  for (let zi = 0; zi < 8; zi++) for (let pi_ = 0; pi_ < 8; pi_++) {
    const id = zi * 8 + pi_;
    if ((occ.get(id) ?? 0) > 0) continue;
    let ring = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dp = -1; dp <= 1; dp++) {
      if (!dz && !dp) continue;
      const z2 = zi + dz;
      if (z2 < 0 || z2 > 7) continue;
      const p2 = (pi_ + dp + 8) % 8;
      if ((occ.get(z2 * 8 + p2) ?? 0) > 0) ring++;
    }
    if (ring === 0) continue;
    const center = cellCenter(zi, pi_);
    holes.push({ zi, pi: pi_, id, ring, center, fitted: surfaceAt(base.beta, center) });
  }
  holes.sort((a, b) => b.ring - a.ring || b.fitted - a.fitted);
  const patterns = [];
  if (d <= 12) {
    for (let m = 1; m < 1 << d; m++) {
      const vec = Array.from({ length: d }, (_, j) => m >> j & 1);
      if (seen.has(vec.join(""))) continue;
      const [u, v] = base.project(vec);
      patterns.push({ vec, pt: liftPoint(u, v, base.scale) });
    }
  }
  const lenses = holes.slice(0, 5).map((h, rank) => {
    let bestPat = patterns[0], bd = Infinity;
    for (const p of patterns) {
      const dd = geodesic(p.pt, h.center);
      if (dd < bd) {
        bd = dd;
        bestPat = p;
      }
    }
    const covers = bestPat ? basisNames.filter((_, j) => bestPat.vec[j] === 1) : [];
    const omits = bestPat ? basisNames.filter((_, j) => bestPat.vec[j] === 0) : [];
    const k = Math.max(1, Math.round(fillSize));
    let measured = { fill_size: k, pole_shift_geodesic: 0, r2_delta: 0, occupied_delta: 0, isolated_delta: 0 };
    if (bestPat) {
      const X2 = [...X, ...Array.from({ length: k }, () => bestPat.vec.slice())];
      const y2 = X2.map((row) => row.reduce((s, v) => s + v, 0) / d);
      const f2 = sphereFit(X2);
      const pole2 = poleOf(f2.beta, grid);
      measured = {
        fill_size: k,
        pole_shift_geodesic: +geodesic(basePole.xyz, pole2.xyz).toFixed(4),
        r2_delta: +(holdoutR2(f2.pts.map(shBasis), y2, mulberry32(seed)) - baseR2).toFixed(4),
        occupied_delta: occupiedCells(f2.pts) - baseOccupied,
        isolated_delta: isolatedCount(f2.pts) - baseIsolated
      };
    }
    const axis = nssAxisOf(h.center);
    const score = +(h.ring / 8 * (1 - Math.min(1, bd / Math.PI))).toFixed(3);
    return {
      lens: `L${rank + 1}-NSS-${axis.replace(/\s+/g, "_")}`,
      nss_axis: axis,
      gap_cell: { z_band: h.zi, phi_sector: h.pi, ring_occupied: h.ring, center: h.center.map((v) => +v.toFixed(4)) },
      hypothesis: `A file that addresses the NSS "${axis}" axis for this corpus, covering {${covers.join(", ")}}${omits.length ? ` and omitting {${omits.join(", ")}}` : ""}, fills the empty cell at z-band ${h.zi}/\u03C6-sector ${h.pi} (ringed by ${h.ring} occupied cells) and moves the pole and curve rather than piling onto the existing pole.`,
      method: `Author or extend one file along the "${axis}" axis (per negative-skill-space) so its coverage pattern is exactly the target pattern; re-run FIT; compare pole geodesic shift, holdout R\xB2, occupied and isolated counts against this baseline.`,
      parameters: { target_pattern: bestPat?.vec ?? [], covers, omits, nearest_pattern_geodesic: +bd.toFixed(4) },
      measured_on_synthetic_insert: measured,
      verdict: "UNTESTED",
      score
    };
  });
  const pole = { xyz: basePole.xyz.map((v) => +v.toFixed(4)), value: +basePole.value.toFixed(4), nss_axis: nssAxisOf(basePole.xyz) };
  return {
    n_items: n,
    basis: basisNames,
    pc12: +pc12.toFixed(4),
    eigenvalues: eigenvalues.map((v) => +v.toFixed(5)),
    sphere_holdout_r2: +sphereR2.toFixed(4),
    flat_holdout_r2: +flatR2.toFixed(4),
    ablation_delta: +ablationDelta.toFixed(4),
    null: {
      kind: "column_permutation",
      K,
      mean_r2: +nullMean.toFixed(4),
      std_r2: +nullStd.toFixed(4),
      z: +zNull.toFixed(3),
      verdict
    },
    sparse: {
      isolated_count: isolatedCount(pts),
      occupied_cells: occupiedCells(pts),
      total_cells: 64,
      chordal_r: 0.095
    },
    compass: {
      phi_histogram: phiHist,
      shannon_entropy_bits: +entropy.toFixed(4),
      coverage_mean: +coverageMean.toFixed(4)
    },
    primitive_frequencies: Object.fromEntries(basisNames.map((p, j) => [p, +primFreq[j].toFixed(3)])),
    gaps,
    single_action_targets: targets,
    pole,
    holes_on_curve: holes.length,
    lens_ideations: lenses,
    points: items.map((it, i) => ({
      path: it.path,
      phi: it.phi,
      uv: [+proj[i][0].toFixed(4), +proj[i][1].toFixed(4)],
      xyz: pts[i].map((v) => +v.toFixed(4))
    }))
  };
}

// pointmap.js — proof-carrying point map for unlabeled latent space.
// Shared verbatim between the steady-orbit-sos Worker bundle and the /map/ browser page.
// Zero deps. Geometry matches sos-agent fit.ts (PCA2 → stereographic lift → S²).
// Spec: yubi-OS/yubiOS refs/point-to-point-latent-map-2026-09-06.md
/* POINTMAP_MODULE */


// src/index.ts
var MODEL = AI_MODEL;
var METRICS = [
  ["pc12", "PC1+PC2"],
  ["holdoutR2", "Sphere holdout R2"],
  ["ablationDelta", "Ablation delta (sphere - flat)"],
  ["zNull", "Null z"],
  ["sparseIsolated", "Isolated points"],
  ["coverageMean", "Coverage mean"],
  ["entropy", "Phi entropy (bits)"]
];
var LIST_COLS = `id, repo_url, owner, repo, ref, created_at, n_items, pc12,
  holdout_r2, ablation_delta, z_null, verdict, sparse_isolated, coverage_mean, entropy, basis`;
function rowToCamel(r) {
  return {
    id: r.id,
    repoUrl: r.repo_url,
    owner: r.owner,
    repo: r.repo,
    ref: r.ref,
    createdAt: r.created_at,
    nItems: r.n_items,
    pc12: r.pc12,
    holdoutR2: r.holdout_r2,
    ablationDelta: r.ablation_delta,
    zNull: r.z_null,
    verdict: r.verdict,
    sparseIsolated: r.sparse_isolated,
    coverageMean: r.coverage_mean,
    entropy: r.entropy,
    basis: r.basis
  };
}
async function listFits(db, full = false) {
  const cols = full ? "*" : LIST_COLS;
  const { results } = await db.prepare(`SELECT ${cols} FROM fits ORDER BY id DESC`).all();
  return (results ?? []).map((r) => full ? { ...r, fitJson: void 0 } : rowToCamel(r));
}
function populationComparison(rows, current) {
  const others = rows.filter((r) => r.id !== current.id);
  const table = METRICS.map(([key, label]) => {
    const vals = others.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
    const n = vals.length;
    const mean = n ? vals.reduce((s, v) => s + v, 0) / n : null;
    const std = n > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : null;
    const cur = Number(current[key]);
    const z = mean !== null && std !== null && std > 1e-9 ? (cur - mean) / std : null;
    return {
      metric: label,
      key,
      this_repo: +cur.toFixed(4),
      population_mean: mean === null ? null : +mean.toFixed(4),
      population_std: std === null ? null : +std.toFixed(4),
      population_n: n,
      z: z === null ? null : +z.toFixed(2)
    };
  });
  return { format: "mean with std subscript, per https://github.com/google-research/envharness#-results", rows: table };
}
function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });
}
async function rememberEmbeddings(env, texts, vectors, source) {
  if (!env.VEC) return { ok: false, error: "no vectorize binding" };
  try {
    let n = 0;
    for (let i = 0; i < vectors.length; i += 100) {
      const batch = [];
      for (let k = i; k < Math.min(i + 100, vectors.length); k++) {
        const text = String(texts[k] ?? "");
        batch.push({ id: "e" + PM.hashStr(text), values: vectors[k], metadata: { label: text.slice(0, 120), text: text.slice(0, 400), source: String(source || "").slice(0, 120), created: new Date().toISOString() } });
      }
      await env.VEC.upsert(batch);
      n += batch.length;
    }
    return { ok: true, stored: n };
  } catch (e) { console.error("vectorize upsert failed:", String(e)); return { ok: false, error: String(e?.message || e) }; }
}
var index_default = {
  async fetch(req, env) {
    try {
      return await (async () => {
        const url = new URL(req.url);
        const p = url.pathname;
        if (p === "/AGENT.md" || p === "/agent.md") { const md = await env.SITE.get("AGENT.md", "text"); return new Response(md || "AGENT.md not uploaded", { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-cache" } }); }
        if (p === "/llms.txt") {
          const txt = await env.SITE.get("llms.txt", "text");
          return new Response(
            txt || `# SOS Agent
Assess a GitHub repo into a FIT.json and compare against the stored population.
(llms.txt has not been uploaded to KV yet; this is a fallback.)
POST /api/assess {"url": "https://github.com/<owner>/<repo>"} -> { id, report }
GET  /api/fits                 -> population list
POST /api/map {"vectors": number[][] | "texts": string[]} -> { id, map, comparison }
POST /api/repo-items {"repo": "owner/repo", "subdir"?: "path", "ref"?: "branch-or-sha"} -> { n, items }
POST /api/embed {"texts": string[]} -> { model, n, D, vectors, metadata }
GET  /api/maps                 -> stored maps (metrics only)
POST /api/maps/compare {"before_id": n, "after_id": n} -> comparison
GET  /api/health                -> read-only version info
GET  /map/pointmap.js           -> static pointmap.js module
`,
            { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } }
          );
        }
        if (p === "/map/app.js") { const js = await env.SITE.get("map-app.js", "text"); return new Response(js || "", {status:js?200:404,headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-cache"}}); }
        if (p === "/map/pointmap.js") {
          const js = await env.SITE.get("pointmap.js", "text");
          return new Response(js || "// pointmap.js not uploaded", { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        if (p.startsWith("/api/")) {
          const db = env.DB;
          if (p === "/api/health" && req.method === "GET") {
            let pointmapVersion = null;
            try {
              const synthX = PM.synth(10, 2, 1);
              const frame = PM.buildFrame(synthX, { d: 2, threshold: "median", seed: 1 });
              pointmapVersion = frame.version;
            } catch (e) {
              pointmapVersion = null;
            }
            return json({ ok: true, worker: "sos-agent/worker-base", pointmap_version: pointmapVersion, now: new Date().toISOString() });
          }
          if (p === "/api/fits" && req.method === "GET") {
            return json({ fits: await listFits(db) });
          }
          let m = p.match(/^\/api\/fits\/(\d+)$/);
          if (m && req.method === "GET") {
            const id = Number(m[1]);
            const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(id).all();
            const row = (results ?? [])[0];
            if (!row) return json({ error: "not found" }, 404);
            const all = await listFits(db);
            return json({
              ...rowToCamel(row),
              fit: JSON.parse(row.fit_json),
              population_comparison: populationComparison(all, row)
            });
          }
          if (m && req.method === "DELETE") {
            await db.prepare(`DELETE FROM fits WHERE id = ?`).bind(Number(m[1])).run();
            return json({ ok: true });
          }
          if (p === "/api/narrate" && req.method === "POST") {
            const { id } = await req.json().catch(() => ({}));
            const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(Number(id)).all();
            const row = (results ?? [])[0];
            if (!row) return json({ error: "not found" }, 404);
            const all = await listFits(db);
            const fit = JSON.parse(row.fit_json);
            const pop = populationComparison(all, row);
            const compact = {
              repo: `${row.owner}/${row.repo}`,
              n_items: fit.n_items,
              basis_mode: fit.basis_mode,
              basis: (fit.basis_detail ?? []).map((x) => ({ concept: x.concept, terms: x.terms, df: x.df })),
              basis_pruned: fit.basis_pruned,
              pc12: fit.pc12,
              sphere_holdout_r2: fit.sphere_holdout_r2,
              ablation_delta: fit.ablation_delta,
              null: fit.null,
              sparse: fit.sparse,
              compass: fit.compass,
              gaps: fit.gaps,
              pole: fit.pole,
              holes_on_curve: fit.holes_on_curve,
              single_action_targets: fit.single_action_targets,
              lens_ideations: fit.lens_ideations,
              population_comparison: pop.rows
            };
            const instructions = "You are SOS Agent, a corpus-curvature assessor. Write a plain-text assessment (no markdown, no headers, no bullet symbols) of the repository whose FIT data follows. Rules: exclusion-only statistical language (a null is excluded or not excluded, never confirmed); cite the actual numbers; explain that the primitive basis was learned from this corpus and LLM-curated (name the concepts and mention what was pruned as boilerplate if basis_pruned is non-empty); name the weakest primitives and the concrete single-action targets; describe the lens ideations as NSS (negative-skill-space) gap-fills that move the pole and the curve, quoting each lens's NSS axis and its measured synthetic-insert pole shift and delta R2 (never describe them as pushing toward an ideal pole); interpret the population comparison honestly (small n means weak comparisons, say so); no em dashes; direct, specific, no filler, no hedging boilerplate. 200-350 words.";
            let upstream;
            try {
              upstream = await env.AI.run(MODEL, {
                messages: [
                  { role: "system", content: instructions },
                  { role: "user", content: JSON.stringify(compact) }
                ],
                stream: true,
                max_tokens: 1200
              });
            } catch (e) {
              console.error("llm call failed", e?.message);
              return json({ error: `llm failed: ${e?.message}` }, 502);
            }
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const stream = new ReadableStream({
              async start(controller) {
                let full = "";
                let buf = "";
                try {
                  for await (const chunk of upstream) {
                    buf += decoder.decode(chunk, { stream: true });
                    const lines = buf.split("\n");
                    buf = lines.pop() ?? "";
                    for (const line of lines) {
                      const t = line.trim();
                      if (!t.startsWith("data:")) continue;
                      const payload = t.slice(5).trim();
                      if (!payload || payload === "[DONE]") continue;
                      try {
                        const evt = JSON.parse(payload);
                        if (typeof evt.response === "string" && evt.response) {
                          full += evt.response;
                          controller.enqueue(encoder.encode(evt.response));
                        }
                      } catch {
                      }
                    }
                  }
                  try {
                    await db.prepare(`UPDATE fits SET narrative = ? WHERE id = ?`).bind(full, Number(id)).run();
                  } catch (err) {
                    console.error("narrative persist failed", err?.message);
                  }
                } catch (err) {
                  console.error("stream relay error", err?.message);
                  controller.enqueue(encoder.encode("\n[stream error]"));
                }
                controller.close();
              }
            });
            return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
          }
          if (p === "/api/assess" && req.method === "POST") {
            const { url: repoUrl, baseline_id, fill_size, max_files } = await req.json().catch(() => ({}));
            const parsed = parseRepoUrl(repoUrl || "");
            if (!parsed) return json({ error: "not a GitHub repo URL" }, 400);
            let corpus;
            try {
              corpus = await fetchCorpus(parsed.owner, parsed.repo, max_files && max_files > 0 ? max_files : 150, env.GITHUB_TOKEN);
            } catch (e) {
              console.error("corpus fetch failed", e?.message);
              return json({ error: `corpus fetch failed: ${e?.message}` }, 502);
            }
            if (corpus.files.length < 5)
              return json({ error: `only ${corpus.files.length} usable text files; need >= 5` }, 422);
            let basis;
            let rawInfo = { vocab_size: 0, kept_terms: 0, raw_clusters: 0 };
            if (baseline_id) {
              const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(Number(baseline_id)).all();
              const baseRow = (results ?? [])[0];
              if (!baseRow) return json({ error: `baseline FIT ${baseline_id} not found` }, 404);
              const baseFit = JSON.parse(baseRow.fit_json);
              const prims = baseFit.basis_detail ?? [];
              if (!prims.length) return json({ error: `baseline FIT ${baseline_id} carries no basis_detail` }, 422);
              const vectors = vectorsFromBasis(corpus.files, prims);
              basis = {
                mode: `reused_basis_from_fit_${baseline_id}`,
                primitives: prims.map((prm, i) => ({ ...prm, df: +(vectors.reduce((s, r) => s + r[i], 0) / vectors.length).toFixed(3), reason: `reused from FIT #${baseline_id}`, source_index: i })),
                vectors,
                pruned: [],
                note: `basis reused from FIT #${baseline_id} (${baseRow.owner}/${baseRow.repo} @ ${baseRow.created_at}) for a comparable rerun`
              };
            } else {
              const rejected = /* @__PURE__ */ new Set();
              let best = null;
              const rounds = [];
              for (const k of [16, 40, 80]) {
                const raw = dropPrimitives(deriveBasis(corpus.files, k), rejected);
                rawInfo = { vocab_size: raw.vocab_size, kept_terms: raw.kept_terms, raw_clusters: raw.primitives.length };
                if (raw.primitives.length < 3) {
                  rounds.push(`k=${k}: ${raw.primitives.length} candidates`);
                  break;
                }
                const cand = await refineBasis(env.AI, raw, corpus.files, { ...parsed, ...corpus.meta }, 10);
                rounds.push(`k=${k}: ${raw.primitives.length} candidates -> ${cand.mode === "learned_latent_raw" ? "raw" : cand.primitives.length + " kept"}`);
                const refined = cand.mode !== "learned_latent_raw";
                if (!best || refined && (best.mode === "learned_latent_raw" || cand.primitives.length > best.primitives.length)) best = cand;
                if (refined && cand.primitives.length >= 5) break;
                for (const prm of cand.pruned) for (const t of prm.terms) rejected.add(t);
                if (!refined) for (const prm of raw.primitives) for (const t of prm.terms) rejected.add(t);
              }
              if (!best) return json({ error: `could not derive a latent basis; corpus too thin` }, 422);
              basis = best;
              basis.note = [basis.note, `widening: ${rounds.join("; ")}`].filter(Boolean).join(" | ");
            }
            const items = corpus.files.map((f, i) => {
              const cov = basis.vectors[i];
              return { path: f.path, coverage: cov, phi: cov.reduce((s, v) => s + v, 0) };
            });
            const fit = {
              ...runFit(items, `${parsed.owner}/${parsed.repo}`, basis.primitives.map((prm) => prm.concept), fill_size ?? 5),
              basis_mode: basis.mode,
              basis_note: basis.note,
              basis_detail: basis.primitives,
              basis_pruned: basis.pruned,
              vocab: { size: rawInfo.vocab_size, kept_terms: rawInfo.kept_terms, raw_clusters: rawInfo.raw_clusters },
              baseline_id: baseline_id ?? null
            };
            const ins = await db.prepare(
              `INSERT INTO fits (repo_url, owner, repo, ref, created_at, n_items, pc12, holdout_r2, ablation_delta, z_null, verdict, sparse_isolated, coverage_mean, entropy, basis, fit_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              repoUrl.trim(),
              parsed.owner,
              parsed.repo,
              corpus.ref,
              (/* @__PURE__ */ new Date()).toISOString(),
              fit.n_items,
              fit.pc12,
              fit.sphere_holdout_r2,
              fit.ablation_delta,
              fit.null.z,
              fit.null.verdict,
              fit.sparse.isolated_count,
              fit.compass.coverage_mean,
              fit.compass.shannon_entropy_bits,
              JSON.stringify(basis.primitives.map((prm) => prm.concept)),
              JSON.stringify(fit)
            ).run();
            const id = ins?.meta?.rowId ?? null;
            const all = await listFits(db);
            const lastIdRow = id ?? (await db.prepare(`SELECT MAX(id) AS mid FROM fits`).first())?.mid;
            const report = {
              kind: "FIT.json",
              version: 1,
              generated_at: (/* @__PURE__ */ new Date()).toISOString(),
              repo: { url: repoUrl.trim(), owner: parsed.owner, repo: parsed.repo, ref: corpus.ref, ...corpus.meta, max_files: max_files ?? null, tree_truncated: corpus.truncated },
              fit,
              population_comparison: populationComparison(all, { id: lastIdRow, pc12: fit.pc12, holdoutR2: fit.sphere_holdout_r2, ablationDelta: fit.ablation_delta, zNull: fit.null.z, sparseIsolated: fit.sparse.isolated_count, coverageMean: fit.compass.coverage_mean, entropy: fit.compass.shannon_entropy_bits })
            };
            return json({ id: lastIdRow, report });
          }
          if (p === "/api/repo-items" && req.method === "POST") {
            try {
              const body = await readJsonLimited(req, 8 * 1024 * 1024);
              const result = await repoItemsHandler(body, { parseRepoUrl, fetchCorpus, githubToken: env.GITHUB_TOKEN });
              return json(result);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/vector/search" && req.method === "POST") {
            const body = await req.json().catch(() => ({}));
            const text = String(body.text || body.query || "").slice(0, 2000);
            if (!text) return json({ error: "need text (the thing to search for)" }, 400);
            const out = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [text] });
            const q = (out.data ?? [])[0];
            if (!q) return json({ error: "embedding failed" }, 502);
            const res = await env.VEC.query(q, { topK: Math.min(20, Number(body.topK) || 5), returnMetadata: "all" });
            return json({ query: text.slice(0, 120), index: "sos-embeddings", matches: (res.matches ?? []).map((m) => ({ id: m.id, score: +(m.score ?? 0).toFixed(4), label: m.metadata?.label, text: m.metadata?.text, source: m.metadata?.source, created: m.metadata?.created })) });
          }
          if (p === "/api/embed" && req.method === "POST") {
            try {
              const body = await readJsonLimited(req, 8 * 1024 * 1024);
              const rawDocs = Array.isArray(body.texts) ? body.texts : [];
              const embedded = await embedDocuments(env, rawDocs);
              const stored = await rememberChunkedEmbeddings(env, PM.hashStr, rawDocs, embedded.vectors, String(body.source || "/api/embed").slice(0, 120));
              return json({
                model: embedded.model,
                ingestion_id: embedded.ingestion_id,
                n: embedded.vectors.length,
                D: embedded.vectors[0]?.length ?? 0,
                vectors: embedded.vectors,
                metadata: embedded.metadata,
                stored: stored.ok ? stored.stored : null,
                stored_error: stored.ok ? null : stored.error,
                vectorize_caveat: stored.ok ? stored.caveat : null
              });
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/chat" && req.method === "POST") {
            const body = await req.json().catch(() => ({}));
            const message = String(body.message || "").trim().slice(0, 1000);
            if (!message) return json({ error: "need message" }, 422);
            const system = "You are the Steady Orbit Systems site assistant. Stable Orbit builds AI automation for small and mid-sized businesses: we design the workflow, launch it, and hand over the controls - it runs itself. A typical First Orbit build ships in 2-4 weeks. Voice replies are generated by ElevenLabs and metered by use. Services: front-desk intake, insurance lookups, recall reminders, production reports, and latent-space corpus audits (the live map on this page). Contact: the audit form or mike@steadyorbitsystems.com. Answer in 1-3 short sentences, direct and concrete, no markdown, no em dashes. If you do not know something, say so and point to the contact form.";
            let out = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [ { role: "system", content: system }, { role: "user", content: message } ], max_tokens: 180 });
            let reply = out && typeof out.response !== "undefined" ? out.response : out && out.choices ? out.choices?.[0]?.message?.content : "";
            if (!reply) reply = "I hit an error - try that again, or use the contact form below.";
            return json({ reply: String(reply).trim() });
          }
          if (p === "/api/map" && req.method === "POST") {
            try {
              const body = await readJsonLimited(req, 8 * 1024 * 1024);
              await db.prepare(`CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, rule_hash TEXT, seed INTEGER, n INTEGER, dim INTEGER, d INTEGER, v2 REAL, z_null REAL, verdict TEXT, classes INTEGER, identity_failures INTEGER, measurement_red INTEGER, source TEXT, map_json TEXT)`).run();
              const loadStoredMap = async (id) => {
                const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(id)).first();
                return row ? JSON.parse(row.map_json) : null;
              };
              const saveMap = async (map, source) => {
                const ins = await db.prepare(`INSERT INTO maps (created_at, rule_hash, seed, n, dim, d, v2, z_null, verdict, classes, identity_failures, measurement_red, source, map_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                  .bind(new Date().toISOString(), map.rule_hash, map.seed, map.n, map.D, map.d, map.v2, map.null.z, map.null.verdict, map.classes.count, map.summary.identity_failures, map.summary.measurement_red, source, JSON.stringify(map)).run();
                return ins?.meta?.last_row_id ?? (await db.prepare(`SELECT MAX(id) AS mid FROM maps`).first())?.mid;
              };
              const { id, map, comparison } = await mapRouteHandler(body, { env, PM, embedDocuments, loadStoredMap, saveMap });
              return json({ id, map, comparison });
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/maps" && req.method === "GET") {
            await db.prepare(`CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, rule_hash TEXT, seed INTEGER, n INTEGER, dim INTEGER, d INTEGER, v2 REAL, z_null REAL, verdict TEXT, classes INTEGER, identity_failures INTEGER, measurement_red INTEGER, source TEXT, map_json TEXT)`).run();
            const { results } = await db.prepare(`SELECT id, created_at, rule_hash, seed, n, dim, d, v2, z_null, verdict, classes, identity_failures, measurement_red, source FROM maps ORDER BY id DESC`).all();
            return json({ maps: results ?? [] });
          }
          let mm = p.match(/^\/api\/maps\/(\d+)$/);
          if (mm && req.method === "GET") {
            const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(mm[1])).first();
            if (!row) return json({ error: "not found" }, 404);
            return new Response(row.map_json, { headers: { "Content-Type": "application/json" } });
          }
          if (mm && req.method === "DELETE") { await db.prepare(`DELETE FROM maps WHERE id = ?`).bind(Number(mm[1])).run(); return json({ ok: true }); }
          if (p === "/api/maps/compare" && req.method === "POST") {
            try {
              const body = await readJsonLimited(req, 8 * 1024 * 1024);
              const loadStoredMap = async (id) => {
                const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(id)).first();
                return row ? JSON.parse(row.map_json) : null;
              };
              const comparison = await mapsCompareHandler(body, { PM, loadStoredMap });
              return json({ comparison });
            } catch (e) {
              return errorResponse(e);
            }
          }
          return json({ error: "no route" }, 404);
        }
        if ((p === "/map" || p === "/map/") && req.method === "GET") {
          const html = await env.SITE.get("map-index.html", "text");
          return new Response(html ?? "map UI not uploaded", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        if (p === "/sos" || p === "/sos/" || p === "/sos/index.html") {
          const html = await env.SITE.get("sos-index.html", "text");
          return new Response(html ?? "sos UI not uploaded", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        if (p === "/sos/client.js") {
          const js = await env.SITE.get("sos-client.js", "text");
          return new Response(js ?? "// not uploaded", { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
        }
        if (p === "/" || p === "/index.html") {
          const html = await env.SITE.get("index.html", "text");
          return new Response(html ?? "site not uploaded", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        const audio = p.match(/^\/audio\/(reply-[123]\.mp3)$/);
        if (audio && req.method === "GET") {
          const data = await env.SITE.get(`audio/${audio[1]}`, "arrayBuffer");
          if (data) return new Response(data, { headers: { "Content-Type": "audio/mpeg" } });
          return new Response("not found", { status: 404 });
        }
        return new Response("not found", { status: 404 });
      })();
    } catch (e) {
      return new Response(JSON.stringify({ error: "uncaught", message: e?.message, stack: String(e?.stack ?? "").slice(-1800) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }
};
export {
  index_default as default
};
