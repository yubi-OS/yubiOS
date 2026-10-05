// test_parity_edge.test.js — JS-vs-Python parity suite for edge-standard-v1
// (SPEC-EDGE-STANDARD advisor lane). Consumes edge_fixtures.json, whose
// expected values were computed by running the Python source of record
// (edge_standard.py) via gen_fixtures.py. For each fixture:
//   - thresholdForCoverage: chosen_threshold EXACT, achieved_coverage |d|<=1e-9
//   - standardize -> traceContours grid: grid_sha256 EXACT
//   - traced_pixels / n_components_traced: EXACT
//   - measure: D |d|<=1e-9 (r2 also checked at 1e-9)
// Run: node --test test_parity_edge.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  thresholdForCoverage,
  traceContours,
  standardize,
  measure,
} from './jev-edge-standard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, 'edge_fixtures.json'), 'utf8'));
assert.equal(pack.pipeline, 'edge-standard-v1');

const TOL = 1e-9;

function gridSha256(grid) {
  const text = grid.map((row) => row.join('')).join('\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

for (const fx of pack.fixtures) {
  test(`parity ${fx.id}: threshold exact + coverage within 1e-9`, () => {
    const gray = new Uint8Array(Buffer.from(fx.gray_b64, 'base64'));
    assert.equal(gray.length, fx.w * fx.h);
    const r = thresholdForCoverage(gray, fx.w, fx.h);
    assert.equal(r.chosen_threshold, fx.expected.chosen_threshold);
    assert.ok(
      Math.abs(r.achieved_coverage - fx.expected.achieved_coverage) <= TOL,
      `coverage ${r.achieved_coverage} vs ${fx.expected.achieved_coverage}`
    );
  });

  test(`parity ${fx.id}: traced grid sha256 exact + counts exact`, () => {
    const gray = new Uint8Array(Buffer.from(fx.gray_b64, 'base64'));
    const std = standardize(gray, fx.w, fx.h);
    assert.equal(std.meta.pipeline, 'edge-standard-v1');
    assert.equal(std.meta.chosen_threshold, fx.expected.chosen_threshold);
    assert.equal(std.meta.traced_pixels, fx.expected.traced_pixels);
    assert.equal(std.meta.n_components_traced, fx.expected.n_components_traced);
    const sha = gridSha256(std.grid);
    assert.equal(sha, fx.expected.grid_sha256);
    // meta w/h are the working dims (no resize at <=512)
    assert.equal(std.meta.w, fx.w);
    assert.equal(std.meta.h, fx.h);
  });

  test(`parity ${fx.id}: measure D within 1e-9 (r2 too)`, () => {
    const gray = new Uint8Array(Buffer.from(fx.gray_b64, 'base64'));
    const std = standardize(gray, fx.w, fx.h);
    const m = measure(std.grid, 4, 64, 8);
    assert.ok(
      Math.abs(m.D - fx.expected.D) <= TOL,
      `D ${m.D} vs ${fx.expected.D} (diff ${Math.abs(m.D - fx.expected.D)})`
    );
    assert.ok(Math.abs(m.r2 - fx.expected.r2) <= TOL, `r2 ${m.r2} vs ${fx.expected.r2}`);
    assert.equal(m.n_scales, 8);
    assert.deepEqual(m.scales, [4, 6, 9, 13, 20, 29, 43, 64]);
  });
}

// Cross-fixture contract: f1/f2 are the doc-02 normalization pair — same shape,
// different gray levels -> IDENTICAL traced grid (same sha256) and identical D,
// with DIFFERENT chosen thresholds. Asserts the pack itself carries the
// property, so the JS side is checked against it in the per-fixture tests above.
test('pack normalization pair: f1_disk vs f2_disk_dim', () => {
  const [f1, f2] = pack.fixtures;
  assert.equal(f1.id, 'f1_disk');
  assert.equal(f2.id, 'f2_disk_dim');
  assert.equal(f1.w, f2.w);
  assert.equal(f1.h, f2.h);
  assert.notEqual(f1.gray_b64, f2.gray_b64);
  assert.notEqual(
    f1.expected.chosen_threshold,
    f2.expected.chosen_threshold,
    'thresholds must differ (1 vs 41)'
  );
  assert.equal(f1.expected.grid_sha256, f2.expected.grid_sha256);
  assert.equal(f1.expected.D, f2.expected.D);
  assert.ok(
    Math.abs(f1.expected.achieved_coverage - f2.expected.achieved_coverage) <= TOL
  );
});
