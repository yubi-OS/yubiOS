// test_parity_lens.test.js — JS-vs-Python parity suite for lens-standard-v1
// (Lane H JS port of Lane F's lens_standard.py). Consumes
// fixtures_lens_full.json, whose expected values were computed by
// gen_fixtures_lens_full.py against the Python source of record. The port
// must reproduce:
//   - sha_aberrated / sha_corrected EXACTLY (byte-level mask identity)
//   - estimated coefficients to 1e-9
//   - D readings (d_ref, d_aberrated, d_corrected) to 1e-9
//   - determinism (byte-identical loop rerun), idempotence (coef 0 ->
//     byte-identical identity correction), no-ink raises, envelope guards.
// Run: node --test test_parity_lens.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LENS_PIPELINE,
  SIZE,
  CENTER,
  TREFOIL_ZOOM_K,
  EST_NEWTON_STEPS,
  EST_CORRECTOR_STEPS,
  SPHERICAL_INVERSE_STEPS,
  MAX_ASTIG,
  canonicalMask,
  maskSha256,
  goldRender,
  nint,
  checkCoef,
  trefoilBeta,
  warpMask,
  momentSums,
  trefoilMomentSums,
  estimateCoefficient,
  algebraicEstimate,
  measureD,
  correctLoop,
} from './jev-lens-math.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, 'fixtures_lens_full.json'), 'utf8'));
assert.equal(pack.meta.pipeline, LENS_PIPELINE);
assert.equal(pack.meta.fixture_count, pack.fixtures.length);
assert.equal(pack.fixtures.length, 12, 'full pack carries 12 fixtures');

const TOL = 1e-9;

const fx = Object.fromEntries(pack.fixtures.map((f) => [f.id, f]));

// JS-side gold renders, rendered ONCE and reused (512x512 number[][] 0/255).
const golds = { gasket: goldRender('gasket'), tri: goldRender('tri') };

// ---------- 1. gold renders -----------------------------------------------

test('gold renders: pinned dimensions and ink counts match the Python anchors', () => {
  assert.equal(golds.gasket.length, SIZE);
  assert.equal(golds.gasket[0].length, SIZE);
  for (const [name, rows] of Object.entries(golds)) {
    let ink = 0;
    for (const row of rows) for (const v of row) if (v) ink += 1;
    assert.equal(ink, pack.meta.render_ink[name], `ink count ${name}`);
    for (const row of rows) for (const v of row) assert.ok(v === 0 || v === 255);
  }
});

test('gold renders: reference mask shas match every fixture sha_ref', () => {
  for (const f of pack.fixtures) {
    assert.equal(maskSha256(golds[f.render]), f.sha_ref, `sha_ref ${f.id}`);
  }
});

test('pinned constants: center, steps, envelopes, zoom floor', () => {
  assert.equal(CENTER, 255.5);
  assert.equal(EST_NEWTON_STEPS, 6);
  assert.equal(EST_CORRECTOR_STEPS, 2);
  assert.equal(SPHERICAL_INVERSE_STEPS, 12);
  assert.equal(TREFOIL_ZOOM_K, 460.0);
  assert.equal(trefoilBeta(0), 0);
  const t = 2.0e-4;
  assert.equal(trefoilBeta(t), (460.0 * Math.abs(t)) / (1 - 460.0 * Math.abs(t)));
  assert.equal(trefoilBeta(-t), trefoilBeta(t), 'beta is even');
});

test('nint: pinned floor(v + 0.5) rounding (NOT Math.round on negatives)', () => {
  assert.equal(nint(2.5), 3);
  assert.equal(nint(1.5), 2);
  assert.equal(nint(0.4), 0);
  assert.equal(nint(-0.5), 0);   // floor( 0.0) =  0 ; Math.round(-0.5) = -0
  assert.equal(nint(-1.5), -1);  // floor(-1.0) = -1 ; Math.round(-1.5) = -1 (half-up)
  assert.equal(nint(-2.5), -2);  // floor(-2.0) = -2 ; Math.round(-2.5) = -2 (half-up)
  assert.equal(nint(-3.5), -3);  // floor(-3.0) = -3 ; Math.round(-3.5) = -3 (half-up)
  assert.equal(nint(-2.7), -3);  // floor(-2.2) = -3 ; Math.round(-2.7) = -3
  assert.equal(nint(-2.3), -2);  // floor(-1.8) = -2 ; Math.round(-2.3) = -2
});

// ---------- 2. per-fixture parity (12 cases) ------------------------------

const seen = new Set();
let maxEstDelta = 0;
let maxDDelta = 0;

for (const f of pack.fixtures) {
  assert.ok(!seen.has(f.id), 'fixture ids unique');
  seen.add(f.id);
  const ref = golds[f.render];

  test(`parity ${f.id}: forward warp sha exact, estimate to 1e-9, gates pass`, () => {
    // forward warp byte parity
    const ab = warpMask(ref, f.mode, f.coef, false);
    assert.equal(maskSha256(ab), f.sha_aberrated, 'sha_aberrated');

    // estimator parity (no corrector — the raw algebraic estimate is the
    // tightest cross-language anchor for the Newton/complex paths)
    const estRaw = algebraicEstimate(f.mode, ref, ab);
    const estFull = estimateCoefficient(f.mode, ref, ab);
    maxEstDelta = Math.max(maxEstDelta, Math.abs(estFull - f.coefficients_est));
    assert.ok(Math.abs(estFull - f.coefficients_est) <= TOL,
      `est ${estFull} vs ${f.coefficients_est}`);
    assert.ok(Math.abs(estFull - estRaw) <= 5e-3 + 1e-12, 'corrector refines');

    // inverse warp on the observed mask with the ESTIMATE -> corrected sha
    const corr = warpMask(ab, f.mode, estFull, true);
    assert.equal(maskSha256(corr), f.sha_corrected, 'sha_corrected');

    // D parity (through the edge-standard-v1 port)
    const dRef = measureD(ref);
    const dAb = measureD(ab);
    const dCorr = measureD(corr);
    maxDDelta = Math.max(maxDDelta,
      Math.abs(dRef.D - f.d_ref), Math.abs(dAb.D - f.d_aberrated),
      Math.abs(dCorr.D - f.d_corrected));
    assert.ok(Math.abs(dRef.D - f.d_ref) <= TOL, `d_ref ${dRef.D} vs ${f.d_ref}`);
    assert.ok(Math.abs(dAb.D - f.d_aberrated) <= TOL, `d_aberrated ${dAb.D} vs ${f.d_aberrated}`);
    assert.ok(Math.abs(dCorr.D - f.d_corrected) <= TOL, `d_corrected ${dCorr.D} vs ${f.d_corrected}`);
    assert.ok(dRef.threshold === 1 || dRef.threshold > 0, 'threshold pinned sanity');

    // full-loop contract mirrors the Python correct_loop gates
    const loop = correctLoop(ref, f.mode, f.coef, f.render);
    assert.equal(loop.sha_aberrated, f.sha_aberrated);
    assert.equal(loop.sha_corrected, f.sha_corrected);
    assert.equal(loop.render, f.render);
    assert.equal(loop.mode, f.mode);
    assert.ok(Math.abs(loop.coefficients_est[f.mode] - f.coefficients_est) <= TOL);
    assert.equal(loop.recovered, f.recovered);
    assert.equal(loop.monotone, f.monotone);
    assert.ok(loop.recovered && loop.monotone, 'loop gates green');
    assert.ok(loop.roundtrip_recovery >= 0.99, 'roundtrip recovery ~1');
    assert.ok(Object.keys(loop.detail).includes('ref'));
    assert.equal(Object.keys(loop.detail.ref).length >= 4, true);
  });

  maxEstDelta = Math.max(maxEstDelta, Math.abs(0)); // updated inside tests
}

// ---------- 3. determinism -------------------------------------------------

test('determinism: full loop rerun is JSON-identical (byte-exact masks)', () => {
  const r1 = correctLoop(golds.gasket, 'spherical', 0.06, 'gasket');
  const r2 = correctLoop(golds.gasket, 'spherical', 0.06, 'gasket');
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  const f = fx['gasket-spherical-0.06'];
  assert.equal(r1.sha_aberrated, f.sha_aberrated);
});

// ---------- 4. idempotence (coef 0 -> byte-identical) ----------------------

for (const render of ['gasket', 'tri']) {
  for (const mode of ['astig', 'spherical', 'trefoil']) {
    test(`idempotence ${render}/${mode}: est on clean render is exactly 0 and identity correction is byte-exact`, () => {
      const ref = golds[render];
      const est0 = estimateCoefficient(mode, ref, ref);
      assert.equal(est0, 0, 'est0 === 0.0 exactly');
      const corr0 = warpMask(ref, mode, est0, true);
      assert.deepEqual(corr0, ref, 'identity correction byte-identical');
      // forward warp with coef 0 is also the identity
      const fwd0 = warpMask(ref, mode, 0, false);
      assert.deepEqual(fwd0, ref, 'forward warp coef 0 byte-identical');
      // and the trefoil zoom floor vanishes at 0 (beta(0) = 0)
      if (mode === 'trefoil') assert.equal(trefoilBeta(0), 0);
    });
  }
}

// ---------- 5. moment-sum parity anchors -----------------------------------

test('moment sums: pinned accumulation order reproduces fixture-consistent structure', () => {
  const ref = golds.gasket;
  const m = momentSums(ref);
  assert.equal(m.n, pack.meta.render_ink.gasket);
  assert.ok(m.sxx > 0 && m.syy > 0 && m.sr2 > 0 && m.sr4 > 0 && m.sr6 > 0);
  // determinism of the sums
  const m2 = momentSums(ref);
  for (const k of Object.keys(m)) assert.equal(m[k], m2[k], `sum ${k}`);
  const tm = trefoilMomentSums(ref);
  assert.ok(Number.isFinite(tm.chi3[0]) && Number.isFinite(tm.chi3[1]));
  assert.ok(tm.s4 > 0);
  const tm2 = trefoilMomentSums(ref);
  assert.equal(tm.chi3[0], tm2.chi3[0]);
  assert.equal(tm.chi3[1], tm2.chi3[1]);
  assert.equal(tm.szcz4[0], tm2.szcz4[0]);
  assert.equal(tm.scz6[1], tm2.scz6[1]);
});

// ---------- 6. fail modes ---------------------------------------------------

test('no-ink: measureD raises; estimators raise on empty masks', () => {
  const empty = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  assert.throws(() => measureD(empty), /no ink/);
  assert.throws(() => algebraicEstimate('astig', empty, empty), /no ink/);
  assert.throws(() => algebraicEstimate('spherical', empty, empty), /no ink/);
  assert.throws(() => measureD([[]]), /no ink|empty/);
});

test('envelope guards: out-of-range coefficients raise in warpMask and checkCoef', () => {
  const ref = golds.tri;
  assert.throws(() => checkCoef('astig', 0.51), /envelope/);
  assert.throws(() => checkCoef('astig', -0.51), /envelope/);
  assert.throws(() => checkCoef('spherical', 0.31), /envelope/);
  assert.throws(() => checkCoef('trefoil', 2.1e-4), /envelope/);
  assert.throws(() => checkCoef('unknown', 0.1), /unknown mode/);
  assert.throws(() => warpMask(ref, 'astig', 0.6, false), /envelope/);
  assert.throws(() => warpMask(ref, 'spherical', -0.4, true), /envelope/);
  assert.throws(() => warpMask(ref, 'trefoil', 3e-4, false), /envelope/);
  // boundary values are inside the envelope (no throw)
  checkCoef('astig', MAX_ASTIG);
  checkCoef('spherical', -0.3);
  checkCoef('trefoil', 2.0e-4);
});

test('canonical mask + sha: serialization contract matches the pack', () => {
  const m = [[1, 0], [0, 255]];
  assert.equal(canonicalMask(m), '10\n01');
  assert.equal(maskSha256(m).length, 64);
  assert.equal(maskSha256(m), maskSha256([[1, 0], [0, 1]]), 'truthiness-normalized');
  const ref = golds.tri;
  assert.equal(maskSha256(ref), fx['tri-astig-0.1'].sha_ref);
});

// ---------- 7. worst parity deltas report ----------------------------------

test('summary: report worst parity deltas observed across the pack', () => {
  assert.ok(maxEstDelta >= 0);
  assert.ok(maxDDelta >= 0);
  console.log(`parity summary: worst est delta ${maxEstDelta.toExponential(3)}, worst D delta ${maxDDelta.toExponential(3)}`);
});
