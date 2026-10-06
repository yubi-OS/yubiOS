// gen_fixtures.mjs — Lane B fixture generator for spectral-standard-v1.
// Emits spectral_fixtures.json. Expected values are computed by
// jev-spectral-math.js (the JS worker port); the Python source of record
// (spectral_standard.py, Lane A) must reproduce them to the stated tolerances.
// Run: node gen_fixtures.mjs
import { writeFileSync } from 'node:fs';
import {
  WALK_BASE_LADDER,
  LADDER_K_DEFAULT,
  mulberry32,
  randomWalks as _rw,
  seriesCountingExponent,
  walkDimensions,
  logPeriodicCheck,
  einsteinVerdict,
  jacobiSymmetric,
  laplacian,
  gasketPreGraph,
  gasketIdentifiedGraph,
} from './jev-spectral-math.js';

// ---------- helpers ----------

function permuteValues(values, seed) {
  // Same pattern as jev-taste-math.js permuteOrder: mulberry32 + Fisher-Yates.
  const out = values.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function pathEigenvalues(m) {
  // Laplacian eigenvalues of the path graph P_m: 2 - 2 cos(pi k / m), k = 0..m-1.
  const out = [];
  for (let k = 0; k < m; k++) out.push(2 - 2 * Math.cos((Math.PI * k) / m));
  return out;
}

function gridEigenvalues(w, h) {
  // w x h four-connected grid (free boundaries) Laplacian: separable sums of
  // path eigenvalues lambda_i^(w) + lambda_j^(h).
  const pw = pathEigenvalues(w);
  const ph = pathEigenvalues(h);
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push(pw[i] + ph[j]);
  return out.sort((a, b) => a - b);
}

function gridAdjacency(w, h) {
  const n = w * h;
  const adj = Array.from({ length: n }, () => []);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = y * w + x;
      if (x + 1 < w) adj[u].push(u + 1);
      if (x > 0) adj[u].push(u - 1);
      if (y + 1 < h) adj[u].push(u + w);
      if (y > 0) adj[u].push(u - w);
    }
  }
  return adj.map((a) => a.sort((p, q) => p - q));
}

function eigenFixture(g, jacobi, note) {
  const L = laplacian(g);
  const { values, sweeps, off_norm } = jacobiSymmetric(L, { tol: 1e-12, maxSweeps: 200 });
  // Residual check: max over eigenpairs of |L v - lambda v| (2-norm, v from Jacobi).
  const { vectors } = jacobiSymmetric(L, { tol: 1e-12, maxSweeps: 200 });
  let maxResid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = vectors[i];
    let s = 0;
    for (let r = 0; r < L.length; r++) {
      let lv = 0;
      for (let c = 0; c < L.length; c++) lv += L[r][c] * v[c];
      const d = lv - values[i] * v[r];
      s += d * d;
    }
    maxResid = Math.max(maxResid, Math.sqrt(s));
  }
  const traceCheck = values.reduce((a, b) => a + b, 0);
  const expectedTrace = g.adj.reduce((a, nbrs) => a + nbrs.length, 0); // 2|E| = tr(L)
  const meas = seriesCountingExponent(values);
  const goldBand = [1.295, 1.435]; // SPEC gold #1 band for gasket counting d_s
  const isGasket = note.startsWith('gasket');
  const lp = isGasket ? logPeriodicCheck(values) : null;
  return {
    id: note,
    kind: 'series',
    graph: { n: g.n, m_edges: expectedTrace / 2 },
    jacobi: { sweeps, off_norm, max_eig_residual: maxResid, trace: traceCheck, trace_expected: expectedTrace },
    values,
    expected: {
      window: meas.window,
      counts: meas.counts,
      n_points: meas.n_points,
      alpha_lambda: meas.alpha_lambda,
      d_s: meas.d_s,
      r2: meas.r2,
      low_confidence: meas.low_confidence,
      ...(isGasket ? { gold_band: goldBand, band_pass: meas.d_s >= goldBand[0] && meas.d_s <= goldBand[1] } : {}),
    },
    ...(isGasket
      ? {
          log_periodic: {
            present: lp.present,
            alternations: lp.alternations,
            pairs: lp.pairs,
            bands: lp.bands,
            method: lp.method,
          },
        }
      : {}),
  };
}

// ---------- build fixtures ----------

const prngAnchors = {};
for (const seed of [0, 1, 42]) {
  const rng = mulberry32(seed);
  prngAnchors['seed_' + seed] = Array.from({ length: 8 }, () => rng());
}

const gasketL3 = gasketPreGraph(3); // 27 vtx, 120 edges (SPEC "level 3, 27 vtx")
const gasketL4 = gasketPreGraph(4); // 81 vtx, 363 edges (SPEC "level 4, 81 vtx")
const gasketIdent3 = gasketIdentifiedGraph(3); // 42 vtx standard G_3 (alternate convention)

const fixtures = [];
fixtures.push(eigenFixture(gasketL3, jacobiSymmetric, 'gasket_pre_l3_eigs'));
fixtures.push(eigenFixture(gasketL4, jacobiSymmetric, 'gasket_pre_l4_eigs'));
fixtures.push(eigenFixture(gasketIdent3, jacobiSymmetric, 'gasket_g3_identified_eigs'));
fixtures.push(eigenFixture({ n: 64, adj: gridAdjacency(8, 8) }, jacobiSymmetric, 'lattice_8x8_eigs'));

// Chain P64 via closed form (exact, no Jacobi needed) but recorded identically.
{
  const values = pathEigenvalues(64);
  const meas = seriesCountingExponent(values);
  fixtures.push({
    id: 'chain_p64_eigs',
    kind: 'series',
    graph: { n: 64, m_edges: 63, closed_form: 'lambda_k = 2 - 2 cos(pi k / 64)' },
    values,
    expected: {
      window: meas.window,
      counts: meas.counts,
      n_points: meas.n_points,
      alpha_lambda: meas.alpha_lambda,
      d_s: meas.d_s,
      r2: meas.r2,
      low_confidence: meas.low_confidence,
      gold_band: [0.9, 1.1],
      band_pass: meas.d_s >= 0.9 && meas.d_s <= 1.1,
    },
  });
}

// Permutation null: gasket L3 eigenvalues permuted with mulberry32 seed 7.
{
  const sorted = fixtures[0].values;
  const permuted = permuteValues(sorted, 7);
  const meas = seriesCountingExponent(permuted);
  const alphaSorted = fixtures[0].expected.alpha_lambda;
  const collapses = (meas.alpha_lambda !== null && Math.abs(meas.alpha_lambda - alphaSorted) >= 0.5) || meas.r2 < 0.98;
  fixtures.push({
    id: 'gasket_eigs_permuted_seed7',
    kind: 'series-null',
    permuted_from: 'gasket_pre_l3_eigs',
    permutation: { algorithm: 'mulberry32 + Fisher-Yates (permuteOrder pattern)', seed: 7 },
    values: permuted,
    expected: {
      window: meas.window,
      counts: meas.counts,
      n_points: meas.n_points,
      alpha_lambda: meas.alpha_lambda,
      d_s: meas.d_s,
      r2: meas.r2,
      low_confidence: meas.low_confidence,
      alpha_sorted: alphaSorted,
      collapses,
    },
  });
}

// Log-periodic synthetic: invert the modulated counting function
//   N(x) = C * x^alpha * (1 + A * sin(pi * log2(x)))   (period = 2 octaves)
// by bisection, so the resulting sorted series has EXACTLY that counting curve.
// Residuals after the log-log fit are then ~ log(1 + A sin(pi log2 x)), whose
// octave-band means alternate strictly (mean of sin over one octave band =
// +-2/pi alternating). A = 0.08 keeps N monotone (A < alpha*ln2/pi).
// Pure power law control (A = 0) -> residuals at float epsilon -> present=false.
{
  const C = 1;
  const ALPHA = 0.65;
  const A = 0.08;
  const Nof = (x) => C * Math.pow(x, ALPHA) * (1 + A * Math.sin((Math.PI * Math.log2(x)) / 1));
  const invertN = (r) => {
    let lo = 1e-9;
    let hi = 1e9;
    for (let it = 0; it < 200; it++) {
      const mid = Math.sqrt(lo * hi);
      if (Nof(mid) < r) lo = mid;
      else hi = mid;
    }
    return Math.sqrt(lo * hi);
  };
  const lp = [];
  const pl = [];
  for (let r = 1; r <= 128; r++) {
    lp.push(invertN(r));
    pl.push(Math.pow(r / C, 1 / ALPHA));
  }
  const lpCheck = logPeriodicCheck(lp);
  const plCheck = logPeriodicCheck(pl);
  fixtures.push({
    id: 'log_periodic_synth',
    kind: 'series',
    values: lp,
    note: 'v_i = exp((ln2/8) i + 0.05 sin(pi i / 8)): log-periodic with period 2 octaves',
    expected: {
      window: seriesCountingExponent(lp).window,
      counts: seriesCountingExponent(lp).counts,
      n_points: seriesCountingExponent(lp).n_points,
      alpha_lambda: seriesCountingExponent(lp).alpha_lambda,
      d_s: seriesCountingExponent(lp).d_s,
      r2: seriesCountingExponent(lp).r2,
      low_confidence: seriesCountingExponent(lp).low_confidence,
    },
    log_periodic: {
      present: lpCheck.present,
      alternations: lpCheck.alternations,
      pairs: lpCheck.pairs,
      bands: lpCheck.bands,
      method: lpCheck.method,
    },
  });
  fixtures.push({
    id: 'power_law_synth',
    kind: 'series',
    values: pl,
    note: 'v_i = exp((ln2/8) i): pure power law, no modulation',
    expected: {
      window: seriesCountingExponent(pl).window,
      counts: seriesCountingExponent(pl).counts,
      n_points: seriesCountingExponent(pl).n_points,
      alpha_lambda: seriesCountingExponent(pl).alpha_lambda,
      d_s: seriesCountingExponent(pl).d_s,
      r2: seriesCountingExponent(pl).r2,
      low_confidence: seriesCountingExponent(pl).low_confidence,
    },
    log_periodic: {
      present: plCheck.present,
      alternations: plCheck.alternations,
      pairs: plCheck.pairs,
      bands: plCheck.bands,
      method: plCheck.method,
    },
  });
}

function buildWalkFixture(id, adj, note, graphMeta, gold) {
  const walk = _rw(adj, { walkers: 64, seed: 42 });
  const dims = walkDimensions(walk);
  const closedForm = { d_w: Math.log(5) / Math.log(2), alpha_msd: 2 / (Math.log(5) / Math.log(2)) };
  const isGasket = !!gold;
  return {
    id,
    kind: 'walk',
    graph: graphMeta,
    walk_params: { walkers: walk.walkers, seed: walk.seed, k: walk.k, ladder: walk.ladder },
    checkpoint_matrix: walk.traces.map((t) => [t.start, ...t.checkpoints]),
    walker0_trace: walk.walker0_trace,
    expected: {
      msd: walk.msd,
      p_return: walk.p_return,
      alpha_msd: dims.alpha_msd,
      d_w: dims.d_w,
      d_w_r2: dims.d_w_r2,
      d_s: dims.d_s,
      d_s_r2: dims.d_s_r2,
      msd_low_confidence: dims.msd_low_confidence,
      return_low_confidence: dims.return_low_confidence,
      n_msd_points: dims.n_msd_points,
      n_return_points: dims.n_return_points,
      ...(isGasket
        ? {
            gold_d_w: closedForm.d_w,
            gold_alpha_msd: closedForm.alpha_msd,
            d_w_band: [2.22193, 2.42193],
            d_w_band_pass: dims.d_w !== null && Math.abs(dims.d_w - closedForm.d_w) <= 0.1,
            alpha_band: [0.821, 0.901],
            alpha_band_pass:
              dims.alpha_msd !== null && Math.abs(dims.alpha_msd - closedForm.alpha_msd) <= 0.04,
          }
        : {}),
    },
  };
}

const gasketWalkL3 = buildWalkFixture(
  'gasket_pre_l3_walk_seed42',
  gasketL3.adj,
  'gasket',
  { kind: 'gasket_pre', level: 3, n: 27, m_edges: 39 },
  true,
);
const gasketWalkL4 = buildWalkFixture(
  'gasket_pre_l4_walk_seed42',
  gasketL4.adj,
  'gasket',
  { kind: 'gasket_pre', level: 4, n: 81, m_edges: 120 },
  true,
);
const gasketL5 = gasketPreGraph(5);
const gasketWalkL5 = buildWalkFixture(
  'gasket_pre_l5_walk_seed42',
  gasketL5.adj,
  'gasket',
  { kind: 'gasket_pre', level: 5, n: 243, m_edges: 363 },
  true,
);
const latticeWalk = buildWalkFixture(
  'lattice_8x8_walk_seed42',
  gridAdjacency(8, 8),
  'lattice',
  { kind: 'grid_4connected', w: 8, h: 8, n: 64, m_edges: 112 },
  null,
);
fixtures.push(gasketWalkL3, gasketWalkL4, gasketWalkL5, latticeWalk);

// Einstein verdict fixture values (closed forms).
const dS_closed = (2 * Math.log(3)) / Math.log(5);
const dW_closed = Math.log(5) / Math.log(2);
const D_closed = Math.log(3) / Math.log(2);
const einsteinExpected = einsteinVerdict(dS_closed, D_closed, dW_closed);

const pack = {
  pipeline: 'spectral-standard-v1',
  generated_by:
    'gen_fixtures.mjs (Lane B JS worker port); expected values computed by jev-spectral-math.js. Python source of record (spectral_standard.py, Lane A) must reproduce: series counting tables to 1e-12, fitted exponents to 1e-9, walk tables and traces exactly. REGEN 2026-10-06 (integration-fix lane P1+P2): walk fixtures regenerated under Lane A\'s canonical per-walker stream convention — Lane A run_walks(base_seed=42, 64 walkers, start_rule=\'first\') was replayed over each fixture graph via a node/python bridge and the patched JS randomWalks reproduced every trace bit-exactly before regeneration; gasket_g3_identified_eigs regenerated on the corner-merged graph (V=42, E=81) after the P2 gasketIdentifiedGraph fix. No pinned parameter, band, or gold value changed.',
  pinning: {
    base_ladder: WALK_BASE_LADDER,
    ladder_k_default: LADDER_K_DEFAULT,
    walkers: 64,
    walk_seed_fixture: 42,
    permutation_seed_fixture: 7,
    series_window: { loFrac: 0.125, hiFrac: 0.5, lattice_points: 8 },
    r2_gate: 0.98,
    einstein_tol: 0.1,
    decisions: [
      'Gasket "level 3 (27 vtx) / level 4 (81 vtx)" is built as the corner-joined 3-copy pre-gasket (gasketPreGraph): |V| = 3^level, isomorphic to Tower-of-Hanoi H_3^level. The textbook corner-IDENTIFIED gasket G_n has |V| = 3,6,15,42,123 — neither 27 nor 81 — so the SPEC counts pin the pre-gasket convention. G_3 (42 vtx) is included as gasket_g3_identified_eigs for cross-checking.',
      'Series counting uses the series IN THE ORDER GIVEN (no internal sort): N(x_r) = r at x_r = values[r-1]. Without this, permuting a series and re-sorting would be a no-op and gold #6 (permutation null) could never collapse.',
      'Walk displacement r(t) is the BFS GRAPH distance from the walker start node (no Euclidean embedding). For the gasket the chemical-distance exponent is d_min = 1, so graph distance reproduces the Euclidean d_w = ln5/ln2; for lattice patches the exponent is unchanged.',
      'Walker streams (P1, 2026-10-06 — Lane A canonical): walker i owns its OWN stream mulberry32((base_seed + i) >>> 0); NO shared sequential stream. Starts: startRule \'first\' = walker i at node i % n (mask/SPEC rule) or \'spread\' = walker i at node floor((i*n)/walkers) (gold-graph rule); fixture walks use seed 42, 64 walkers, \'first\'. One rng() draw per step (deg-0 nodes consume none). Walk traces regenerated from Lane A run_walks outputs (node/python bridge, bit-exact).',
      'Ladder = [4,6,9,13,20,29,43,64].map(s => s*K), K default 4 -> [16,24,36,52,80,116,172,256].',
      'logPeriodicCheck fits over ALL positive values (not the counting window); octave bands relative to the smallest value; |band mean residual| <= 1e-9 reads as sign 0.',
      'Series-mode degenerate guard: window ranks with x <= 0 are dropped; <3 valid points -> null exponents + low_confidence; zero positive values in the window -> throw.',
    ],
  },
  gold_closed_forms: {
    gasket_d_f: D_closed,
    gasket_d_w: dW_closed,
    gasket_d_s: dS_closed,
    einstein: einsteinExpected,
  },
  prng: {
    algorithm: 'mulberry32',
    note: 'Python must mask every intermediate with & 0xFFFFFFFF; see jev-spectral-math.js mulberry32 comment. Division by 2^32 is IEEE double on both sides.',
    anchors: prngAnchors,
  },
  fixtures,
};

writeFileSync(
  new URL('./spectral_fixtures.json', import.meta.url),
  JSON.stringify(pack, null, 2) + '\n',
);

// Console summary for the report.
for (const f of fixtures) {
  if (f.kind === 'series' || f.kind === 'series-null') {
    console.log(
      f.id,
      'alpha=', f.expected.alpha_lambda === null ? 'null' : f.expected.alpha_lambda.toFixed(6),
      'd_s=', f.expected.d_s === null ? 'null' : f.expected.d_s.toFixed(6),
      'r2=', f.expected.r2.toFixed(6),
      'low_conf=', f.expected.low_confidence,
      f.expected.band_pass === undefined ? '' : 'band_pass=' + f.expected.band_pass,
      f.expected.collapses === undefined ? '' : 'collapses=' + f.expected.collapses,
      'jacobi_max_resid=', f.jacobi ? f.jacobi.max_eig_residual.toExponential(2) : '-',
    );
    if (f.log_periodic) console.log('   log_periodic present=', f.log_periodic.present, 'alt=', f.log_periodic.alternations, '/', f.log_periodic.pairs);
  } else {
    console.log(
      f.id,
      'd_w=', f.expected.d_w === null ? 'null' : f.expected.d_w.toFixed(6),
      'd_w_r2=', f.expected.d_w_r2.toFixed(6),
      'alpha=', f.expected.alpha_msd === null ? 'null' : f.expected.alpha_msd.toFixed(6),
      'd_s=', f.expected.d_s === null ? 'null' : f.expected.d_s.toFixed(6),
      'd_s_r2=', f.expected.d_s_r2.toFixed(6),
      'flags=', f.expected.msd_low_confidence, f.expected.return_low_confidence,
      'dW_band_pass=', f.expected.d_w_band_pass,
      'alpha_band_pass=', f.expected.alpha_band_pass,
    );
  }
}
console.log('einstein:', JSON.stringify(einsteinExpected));
console.log('prng anchors:', JSON.stringify(prngAnchors));
