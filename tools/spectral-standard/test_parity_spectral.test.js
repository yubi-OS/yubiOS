// test_parity_spectral.test.js — JS-vs-Python parity suite for
// spectral-standard-v1 (SPEC 2026-10-06, Lane B JS worker port).
// Consumes spectral_fixtures.json, whose expected values were computed by
// gen_fixtures.mjs against jev-spectral-math.js. The Python source of record
// (spectral_standard.py, Lane A) must reproduce:
//   - PRNG anchors exactly (bit-identical doubles)
//   - series counting tables to 1e-12, fitted exponents to 1e-9
//   - walk checkpoint matrices / traces exactly, aggregates to 1e-9
// Run: node --test test_parity_spectral.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  WALK_BASE_LADDER,
  LADDER_K_DEFAULT,
  mulberry32,
  maskToGraph,
  graphFromEdges,
  randomWalks,
  walkDimensions,
  seriesCountingExponent,
  einsteinVerdict,
  logPeriodicCheck,
  fmt,
  jacobiSymmetric,
  laplacian,
  gasketPreGraph,
  gasketIdentifiedGraph,
} from './jev-spectral-math.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, 'spectral_fixtures.json'), 'utf8'));
assert.equal(pack.pipeline, 'spectral-standard-v1');

const TOL = 1e-9;
const TOL_TABLE = 1e-12;

const fx = Object.fromEntries(pack.fixtures.map((f) => [f.id, f]));

// ---------- 1. PRNG parity anchors ----------

test('mulberry32: PRNG anchors match the fixture pack bit-for-bit', () => {
  for (const [key, expected] of Object.entries(pack.prng.anchors)) {
    const seed = Number(key.slice('seed_'.length));
    const rng = mulberry32(seed);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(rng(), expected[i], `seed ${seed} draw ${i}`);
    }
  }
});

test('mulberry32: deterministic, seed-sensitive, uint32 overflow wraps', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  for (let i = 0; i < 64; i++) {
    const va = a();
    assert.equal(va, b(), `stream equality draw ${i}`);
    assert.notEqual(va, c());
    assert.ok(va >= 0 && va < 1);
  }
  // The a + 0x6d2b79f5 wrap must survive many recursions (uint32 overflow path).
  const long = mulberry32(0x7fffffff);
  for (let i = 0; i < 10000; i++) long();
  assert.ok(Number.isFinite(long()) && long() >= 0 && long() < 1);
});

// ---------- 2. Gasket graph structure ----------

test('gasketPreGraph(3): 27 vertices, 39 edges, SPEC vertex count convention', () => {
  const g = gasketPreGraph(3);
  assert.equal(g.n, 27);
  assert.equal(g.adj.length, 27);
  const m = g.adj.reduce((s, nbrs) => s + nbrs.length, 0) / 2;
  assert.equal(m, 39); // E = (3^(level+1) - 3) / 2
  assert.equal(g.corners.length, 3);
  assert.equal(new Set(g.corners).size, 3, 'three distinct corners');
  for (const c of g.corners) assert.ok(c >= 0 && c < 27);
});

test('gasketPreGraph level ladder: n = 3^level, connected, degrees in {2,3,4}', () => {
  for (const level of [1, 2, 3, 4]) {
    const g = gasketPreGraph(level);
    assert.equal(g.n, Math.pow(3, level));
    assert.equal(g.adj.length, g.n);
    // connectivity via BFS from node 0
    const seen = new Array(g.n).fill(false);
    seen[0] = true;
    const q = [0];
    while (q.length) {
      const u = q.pop();
      for (const v of g.adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); }
    }
    assert.ok(seen.every(Boolean), `level ${level} connected`);
    for (const nbrs of g.adj) {
      assert.ok(nbrs.length >= 2 && nbrs.length <= 4, `degree in [2,4]: got ${nbrs.length}`);
      assert.deepEqual([...nbrs].sort((a, b) => a - b), nbrs, 'adjacency sorted');
      assert.equal(new Set(nbrs).size, nbrs.length, 'adjacency deduped');
    }
  }
});

// ---------- 3. Jacobi eigenvalues ----------

for (const id of ['gasket_pre_l3_eigs', 'gasket_pre_l4_eigs', 'gasket_g3_identified_eigs', 'lattice_8x8_eigs']) {
  test(`parity ${id}: Jacobi reproduces fixture eigenvalues to 1e-9`, () => {
    const f = fx[id];
    const g = f.graph.n === 27 && id === 'gasket_pre_l3_eigs'
      ? gasketPreGraph(3)
      : f.graph.n === 81 && id === 'gasket_pre_l4_eigs'
        ? gasketPreGraph(4)
        : null;
    const adj = g ? g.adj : adjacencyFor(id, f);
    const L = laplacian({ n: f.graph.n, adj });
    const j = jacobiSymmetric(L, { tol: 1e-12, maxSweeps: 200 });
    assert.equal(j.values.length, f.values.length);
    for (let i = 0; i < j.values.length; i++) {
      assert.ok(
        Math.abs(j.values[i] - f.values[i]) <= TOL,
        `eigenvalue ${i}: ${j.values[i]} vs ${f.values[i]}`
      );
    }
    assert.ok(Math.abs(j.off_norm) < 1e-6, `off-diagonal converged: ${j.off_norm}`);
    // trace(L) = 2|E| = sum of eigenvalues
    const trace = j.values.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(trace - f.jacobi.trace) <= TOL);
    assert.ok(Math.abs(trace - f.jacobi.trace_expected) <= 1e-6);
  });
}

function adjacencyFor(id, f) {
  if (id === 'lattice_8x8_eigs') {
    const w = 8;
    const adj = Array.from({ length: 64 }, () => []);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < w; x++) {
        const u = y * w + x;
        if (x + 1 < w) adj[u].push(u + 1);
        if (x > 0) adj[u].push(u - 1);
        if (y + 1 < 8) adj[u].push(u + w);
        if (y > 0) adj[u].push(u - w);
      }
    }
    return adj.map((a) => a.sort((p, q) => p - q));
  }
  if (id === 'gasket_g3_identified_eigs') {
    // P2 (2026-10-06): absolute structural assertions, not fixture echo. The
    // corner-merged gasket G_3 must be 42 vertices / 81 edges — the exact
    // level->vertex mapping of Lane A's sierpinski_gasket_graph (JS level L
    // == Python level L+1: V = (3^(L+1)+3)/2, E = 3^(L+1)). The pre-P2
    // implementation returned the disjoint union of 3^3 triangles (81 vtx,
    // every vertex degree 2, disconnected) and this test passed vacuously by
    // asserting n == fixture n (both 81).
    const g = gasketIdentifiedGraph(3);
    assert.equal(g.n, 42, 'absolute vertex count: G_3 = (3^4+3)/2 = 42');
    assert.equal(f.graph.n, 42, 'fixture graph.n must be 42 after P2');
    assert.equal(f.jacobi.trace_expected, 162, 'tr(L) = 2|E| = 162');
    const m = g.adj.reduce((s, nbrs) => s + nbrs.length, 0) / 2;
    assert.equal(m, 81, 'absolute edge count: E = 3^4 = 81');
    assert.equal(f.graph.m_edges, 81);
    // connectivity: the corner merges must actually join the 27 triangles
    const seen = new Array(g.n).fill(false);
    seen[0] = true;
    const q = [0];
    while (q.length) {
      const u = q.pop();
      for (const v of g.adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); }
    }
    assert.ok(seen.every(Boolean), 'corner-merged G_3 must be connected');
    // degree sequence matches Lane A's builder exactly: 3 corners of degree 2
    // (the whole-graph corners) + 39 junction vertices of degree 4.
    const degSeq = g.adj.map((a) => a.length).sort((a, b) => a - b);
    assert.deepEqual(degSeq, [...Array(3).fill(2), ...Array(39).fill(4)],
      'degree sequence = [2,2,2, 4x39] (Lane A sierpinski_gasket_graph(4))');
    assert.equal(new Set(g.corners).size, 3, 'three distinct whole-graph corners');
    assert.deepEqual([...g.adj].map((a) => [...a].sort((p, r) => p - r)), g.adj, 'adjacency sorted');
    return g.adj;
  }
  throw new Error('no adjacency builder for ' + id);
}

// ---------- 4. Series-mode parity ----------

for (const f of pack.fixtures.filter((x) => x.kind === 'series' || x.kind === 'series-null')) {
  test(`parity ${f.id}: counting table exact (1e-12) + fit to 1e-9`, () => {
    const meas = seriesCountingExponent(f.values);
    assert.deepEqual(meas.window, f.expected.window, 'pinned window');
    assert.equal(meas.counts.length, f.expected.counts.length, 'lattice point count');
    for (let i = 0; i < meas.counts.length; i++) {
      assert.equal(meas.counts[i][0], f.expected.counts[i][0], `rank ${i}`);
      assert.ok(
        Math.abs(meas.counts[i][1] - f.expected.counts[i][1]) <= TOL_TABLE,
        `x at rank ${i}: ${meas.counts[i][1]} vs ${f.expected.counts[i][1]}`
      );
    }
    assert.equal(meas.n_points, f.expected.n_points);
    if (f.expected.alpha_lambda === null) {
      assert.equal(meas.alpha_lambda, null, 'degenerate window -> null alpha');
      assert.equal(meas.d_s, null);
      assert.equal(meas.r2, 0);
      assert.equal(meas.low_confidence, true);
    } else {
      assert.ok(Math.abs(meas.alpha_lambda - f.expected.alpha_lambda) <= TOL, `alpha ${meas.alpha_lambda} vs ${f.expected.alpha_lambda}`);
      assert.ok(Math.abs(meas.d_s - f.expected.d_s) <= TOL, `d_s ${meas.d_s} vs ${f.expected.d_s}`);
      assert.ok(Math.abs(meas.r2 - f.expected.r2) <= TOL, `r2 ${meas.r2} vs ${f.expected.r2}`);
    }
    assert.equal(meas.low_confidence, f.expected.low_confidence);
  });
}

test('gold band flags recorded in the pack agree with the measured values', () => {
  for (const f of pack.fixtures) {
    if (f.expected.band_pass !== undefined) {
      assert.equal(
        f.expected.band_pass,
        f.expected.d_s >= f.expected.gold_band[0] && f.expected.d_s <= f.expected.gold_band[1],
        f.id,
      );
    }
  }
});

test('gold #6: permutation null collapses (|alpha_perm - alpha_sorted| >= 0.5 OR r2 < 0.98)', () => {
  const f = fx.gasket_eigs_permuted_seed7;
  const sorted = seriesCountingExponent(fx.gasket_pre_l3_eigs.values);
  const perm = seriesCountingExponent(f.values);
  assert.notDeepEqual(f.values, fx.gasket_pre_l3_eigs.values, 'permutation actually permuted');
  const collapses =
    (perm.alpha_lambda !== null && Math.abs(perm.alpha_lambda - sorted.alpha_lambda) >= 0.5) ||
    perm.r2 < 0.98;
  assert.equal(collapses, true, 'null must collapse');
  assert.equal(f.expected.collapses, true);
  assert.ok(perm.r2 < 0.98, `permuted r2 ${perm.r2}`);
});

test('series mode is order-sensitive: given-order counting, not re-sorted', () => {
  // Descending input must NOT equal the ascending result (proves no internal sort).
  const asc = fx.chain_p64_eigs.values;
  const desc = asc.slice().reverse();
  const a = seriesCountingExponent(asc);
  const d = seriesCountingExponent(desc);
  assert.notEqual(a.d_s, d.d_s);
  // And the ascending result matches the fixture (the eigenvalue order of record).
  assert.ok(Math.abs(a.d_s - fx.chain_p64_eigs.expected.d_s) <= TOL);
});

// ---------- 5. Walk-mode parity ----------

test('walk ladder pinning: default ladder = base x K, K default 4', () => {
  assert.deepEqual(WALK_BASE_LADDER, [4, 6, 9, 13, 20, 29, 43, 64]);
  assert.equal(LADDER_K_DEFAULT, 4);
  const w = randomWalks({ adj: [[1, 2], [0], [0]] }, { seed: 1 });
  assert.deepEqual(w.ladder, [16, 24, 36, 52, 80, 116, 172, 256]);
});

for (const f of pack.fixtures.filter((x) => x.kind === 'walk')) {
  test(`parity ${f.id}: checkpoint matrix + walker0 trace exact`, () => {
    const g = rebuildGraphForWalk(f);
    const w = randomWalks(g, {
      walkers: f.walk_params.walkers,
      seed: f.walk_params.seed,
      k: f.walk_params.k,
    });
    assert.deepEqual(w.ladder, f.walk_params.ladder);
    // walker0 full trace exact
    assert.deepEqual(w.walker0_trace, f.walker0_trace, 'walker0 trace');
    // checkpoint matrix exact (start + 8 checkpoints per walker)
    const matrix = w.traces.map((t) => [t.start, ...t.checkpoints]);
    assert.equal(matrix.length, f.checkpoint_matrix.length);
    for (let i = 0; i < matrix.length; i++) {
      assert.deepEqual(matrix[i], f.checkpoint_matrix[i], `walker ${i} checkpoints`);
    }
    // aggregates to 1e-9
    for (let i = 0; i < w.msd.length; i++) {
      assert.ok(Math.abs(w.msd[i] - f.expected.msd[i]) <= TOL, `msd[${i}]`);
      assert.ok(Math.abs(w.p_return[i] - f.expected.p_return[i]) <= TOL, `p_return[${i}]`);
    }
  });

  test(`parity ${f.id}: walkDimensions fits to 1e-9 + flags`, () => {
    const dims = walkDimensions({
      ladder: f.walk_params.ladder,
      msd: f.expected.msd,
      p_return: f.expected.p_return,
    });
    assert.equal(dims.alpha_msd, f.expected.alpha_msd);
    assert.equal(dims.d_w, f.expected.d_w);
    assert.equal(dims.d_s, f.expected.d_s);
    assert.ok(Math.abs(dims.d_w_r2 - f.expected.d_w_r2) <= TOL);
    assert.ok(Math.abs(dims.d_s_r2 - f.expected.d_s_r2) <= TOL);
    assert.equal(dims.msd_low_confidence, f.expected.msd_low_confidence);
    assert.equal(dims.return_low_confidence, f.expected.return_low_confidence);
  });
}

function rebuildGraphForWalk(f) {
  if (f.graph.kind === 'gasket_pre') return { adj: gasketPreGraph(f.graph.level).adj };
  if (f.graph.kind === 'grid_4connected') {
    const { w, h } = f.graph;
    const adj = Array.from({ length: w * h }, () => []);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = y * w + x;
        if (x + 1 < w) adj[u].push(u + 1);
        if (x > 0) adj[u].push(u - 1);
        if (y + 1 < h) adj[u].push(u + w);
        if (y > 0) adj[u].push(u - w);
      }
    }
    return { adj: adj.map((a) => a.sort((p, q) => p - q)) };
  }
  throw new Error('no graph builder for ' + f.id);
}

test('walk determinism: identical seed -> identical streams; different seed differs', () => {
  const g = { adj: gasketPreGraph(3).adj };
  const a = randomWalks(g, { walkers: 64, seed: 42 });
  const b = randomWalks(g, { walkers: 64, seed: 42 });
  const c = randomWalks(g, { walkers: 64, seed: 43 });
  assert.deepEqual(a.traces, b.traces);
  assert.deepEqual(a.msd, b.msd);
  assert.deepEqual(a.walker0_trace, b.walker0_trace);
  assert.notDeepEqual(a.traces, c.traces);
});

test('walk start convention: walker w starts at node w % n', () => {
  const g = { adj: gasketPreGraph(3).adj };
  const w = randomWalks(g, { walkers: 64, seed: 42 });
  for (let i = 0; i < 64; i++) {
    assert.equal(w.traces[i].start, i % 27);
  }
});

test('P1 stream convention: walker i owns mulberry32((seed + i) >>> 0), no shared stream', () => {
  // Manual reference replay: for each walker i, step through the same graph
  // with its OWN mulberry32((seed + i) >>> 0) stream and compare checkpoints.
  // Under the pre-P1 shared stream, walker i>0 drew from a mid-stream state
  // and this could not hold.
  const adj = gasketPreGraph(4).adj;
  const seed = 42;
  const w = randomWalks({ adj }, { walkers: 64, seed, k: 4 });
  const ladder = w.ladder;
  for (const i of [1, 2, 7, 63]) {
    const rng = mulberry32((seed + i) >>> 0);
    let u = i % adj.length;
    let ci = 0;
    for (let t = 1; t <= ladder[ladder.length - 1]; t++) {
      const nbrs = adj[u];
      if (nbrs.length > 0) u = nbrs[Math.floor(rng() * nbrs.length)];
      if (ci < ladder.length && ladder[ci] === t) {
        assert.equal(u, w.traces[i].checkpoints[ci], `walker ${i} checkpoint ${ci}`);
        ci++;
      }
    }
    assert.equal(ci, ladder.length);
  }
  // Walker 0's stream is mulberry32(seed) itself — single-walker replays are
  // unchanged by P1 (the advisor's node-identity regression property).
  const single = randomWalks({ adj }, { walkers: 1, seed });
  const rng0 = mulberry32(seed);
  let u0 = 0;
  for (let t = 1; t <= 256; t++) {
    const nbrs = adj[u0];
    if (nbrs.length > 0) u0 = nbrs[Math.floor(rng0() * nbrs.length)];
    assert.equal(u0, single.walker0_trace[t], `walker0 step ${t}`);
  }
});

test('P1 start rule spread: walker i starts at floor((i*n)/walkers)', () => {
  const adj = gasketPreGraph(3).adj; // n = 27
  const W = 8;
  const w = randomWalks({ adj }, { walkers: W, seed: 42, startRule: 'spread' });
  for (let i = 0; i < W; i++) {
    assert.equal(w.traces[i].start, Math.floor((i * 27) / W));
  }
  // unknown start rule rejected
  assert.throws(() => randomWalks({ adj }, { walkers: 2, seed: 1, startRule: 'bogus' }), /startRule/);
});

test('P1 fixtures pinning: walkers=64, seed=42 unchanged (no pinned parameter moved)', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'walk')) {
    assert.equal(f.walk_params.walkers, 64, `${f.id} walkers pinned at 64`);
    assert.equal(f.walk_params.seed, 42, `${f.id} seed pinned at 42`);
    assert.deepEqual(f.walk_params.ladder, [16, 24, 36, 52, 80, 116, 172, 256]);
  }
  assert.equal(pack.pinning.walkers, 64);
  assert.equal(pack.pinning.walk_seed_fixture, 42);
});

test('P2 level ladder: identified gasket V = (3^(L+1)+3)/2 == Lane A builder', () => {
  // JS level L == Python sierpinski_gasket_graph(L+1); Lane A: 3, 6, 15, 42, 123.
  const expected = [3, 6, 15, 42, 123];
  for (let L = 0; L < 5; L++) {
    const g = gasketIdentifiedGraph(L);
    assert.equal(g.n, expected[L], `level ${L}`);
    assert.equal(g.adj.reduce((s, x) => s + x.length, 0) / 2, Math.pow(3, L + 1), `level ${L} edges`);
    assert.equal(new Set(g.corners).size, 3, `level ${L} corners distinct`);
  }
  assert.throws(() => gasketIdentifiedGraph(-1), /level must be/);
  assert.throws(() => gasketIdentifiedGraph(9), /level must be/);
});

// ---------- 6. Einstein verdicts ----------

test('einsteinVerdict: gasket closed forms -> consistent with delta ~ 0', () => {
  const e = pack.gold_closed_forms;
  const v = einsteinVerdict(e.gasket_d_s, e.gasket_d_f, e.gasket_d_w);
  assert.equal(v.verdict, 'consistent');
  assert.ok(Math.abs(v.delta) <= 1e-12, `delta ${v.delta}`);
  assert.ok(Math.abs(v.two_D_over_d_w - e.gasket_d_s) <= 1e-12);
  assert.deepEqual(v, e.einstein);
});

test('einsteinVerdict: inconsistent + insufficient + custom tol', () => {
  const bad = einsteinVerdict(1.365, 1.585, 2.0); // 2*1.585/2 = 1.585, delta = -0.22
  assert.equal(bad.verdict, 'inconsistent');
  assert.ok(Math.abs(bad.delta - (1.365 - 1.585)) <= TOL);
  const ins = einsteinVerdict(NaN, 1.585, 2.32193);
  assert.equal(ins.verdict, 'insufficient');
  assert.equal(ins.two_D_over_d_w, null);
  assert.equal(ins.delta, null);
  const ins2 = einsteinVerdict(1.3, undefined, 2.3);
  assert.equal(ins2.verdict, 'insufficient');
  const near = einsteinVerdict(1.4, 1.585, 2.32193, { tol: 0.2 }); // |1.4-1.365| = 0.035
  assert.equal(near.verdict, 'consistent');
});

// ---------- 7. fmt rendering ----------

test('fmt: integers rendered with decimals, floats trimmed to 4 decimals', () => {
  assert.equal(fmt(1), '1.000');
  assert.equal(fmt(0), '0.000');
  assert.equal(fmt(2), '2.000');
  assert.equal(fmt(64), '64.000');
  assert.equal(fmt(1.3650692428), '1.3651');
  assert.equal(fmt(0.8612999), '0.8613');
  assert.equal(fmt(1.5), '1.5');
  assert.equal(fmt('shape: gasket'), 'shape: gasket');
  assert.equal(fmt(Infinity), 'Infinity');
  assert.equal(fmt(NaN), 'NaN');
});

// ---------- 8. Log-periodic check ----------

test('logPeriodicCheck: synthetic octave modulation present, pure power law absent', () => {
  assert.equal(fx.log_periodic_synth.log_periodic.present, true);
  assert.equal(fx.log_periodic_synth.log_periodic.alternations, fx.log_periodic_synth.log_periodic.pairs);
  assert.ok(fx.log_periodic_synth.log_periodic.bands.length >= 3);
  assert.equal(fx.power_law_synth.log_periodic.present, false);
  // Re-run live and compare to fixture.
  const lp = logPeriodicCheck(fx.log_periodic_synth.values);
  assert.equal(lp.present, true);
  assert.equal(lp.alternations, fx.log_periodic_synth.log_periodic.alternations);
  assert.equal(lp.method, 'residual-octave-alternation');
  const pl = logPeriodicCheck(fx.power_law_synth.values);
  assert.equal(pl.present, false);
});

test('logPeriodicCheck: gasket L3 eigenvalues show octave alternation (gold #8)', () => {
  const lp = logPeriodicCheck(fx.gasket_pre_l3_eigs.values);
  assert.equal(lp.present, fx.gasket_pre_l3_eigs.log_periodic.present);
  assert.equal(lp.present, true, 'L3 residual alternation must be present');
});

// ---------- 9. Graph helpers ----------

test('maskToGraph: 8-connected, dense row-major numbering, empty mask throws', () => {
  const mask = [
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const g = maskToGraph(mask);
  assert.equal(g.n, 4);
  assert.deepEqual(g.coords[0], [0, 0]);
  assert.deepEqual(g.coords[1], [1, 0]);
  assert.deepEqual(g.coords[2], [1, 1]);
  assert.deepEqual(g.coords[3], [2, 2]);
  // 8-connected: (0,0)-(1,0), (0,0)-(1,1) diagonal, (1,0)-(1,1), (1,1)-(2,2) diagonal
  assert.deepEqual(g.adj[0], [1, 2]);
  assert.deepEqual(g.adj[1], [0, 2]);
  assert.deepEqual(g.adj[2], [0, 1, 3]);
  assert.deepEqual(g.adj[3], [2]);
  assert.throws(() => maskToGraph([[0, 0], [0, 0]]), /empty edge map/);
  assert.throws(() => maskToGraph([]), /empty edge map/);
});

test('graphFromEdges: dedupe, self-loop drop, sorted adjacency; empty throws', () => {
  const g = graphFromEdges([[2, 0], [0, 2], [1, 1], [0, 1], [1, 0]]);
  assert.equal(g.n, 3);
  assert.deepEqual(g.adj[0], [1, 2]);
  assert.deepEqual(g.adj[1], [0]);
  assert.deepEqual(g.adj[2], [0]);
  assert.throws(() => graphFromEdges([]), /empty graph/);
  assert.throws(() => graphFromEdges([[0]]), /edge must be/);
});

// ---------- 10. Empty-input failures ----------

test('empty-input failures across the instrument', () => {
  assert.throws(() => seriesCountingExponent([]), /empty series/);
  assert.throws(() => seriesCountingExponent([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), /no positive values/);
  assert.throws(() => logPeriodicCheck([]), /empty series/);
  assert.throws(() => logPeriodicCheck([1, 2]), /at least 3 positive values/);
  assert.throws(() => randomWalks({ adj: [] }, { seed: 1 }), /empty graph/);
  assert.throws(() => randomWalks({ adj: [[1], [0]] }, {}), /seed must be/);
  assert.throws(() => walkDimensions(null), /must come from randomWalks/);
  assert.throws(() => gasketPreGraph(0), /positive integer/);
  assert.throws(() => jacobiSymmetric([[1, 2], [3]]), /must be square/);
});
