// test_e2e_edge.test.js — full-lifecycle e2e for edge-standard-v1
// (SPEC-EDGE-STANDARD advisor lane). raw gray bytes -> standardize -> measure
// -> D reported with meta; the f1/f2 doc-02 normalization property asserted
// end-to-end; determinism (two runs identical). Fixtures come from
// edge_fixtures.json (Python-source-of-record expectations) but the e2e
// assertions below are self-contained contracts, not parity checks
// (parity lives in test_parity_edge.test.js).
// Run: node --test test_e2e_edge.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  thresholdForCoverage,
  standardize,
  measure,
} from './jev-edge-standard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, 'edge_fixtures.json'), 'utf8'));
const fx = Object.fromEntries(pack.fixtures.map((f) => [f.id, f]));

function decodeGray(f) {
  return new Uint8Array(Buffer.from(f.gray_b64, 'base64'));
}

function gridSha256(grid) {
  return createHash('sha256').update(grid.map((r) => r.join('')).join('\n'), 'utf8').digest('hex');
}

test('e2e f1_disk: raw gray bytes -> standardize -> measure -> D reported with meta', () => {
  const gray = decodeGray(fx.f1_disk);
  const std = standardize(gray, fx.f1_disk.w, fx.f1_disk.h);
  // meta shape (exact key set, pinned)
  assert.deepEqual(Object.keys(std.meta).sort(), [
    'achieved_coverage', 'chosen_threshold', 'h', 'n_components_traced',
    'pipeline', 'traced_pixels', 'under_inked', 'w',
  ]);
  assert.equal(std.meta.pipeline, 'edge-standard-v1');
  assert.equal(std.meta.under_inked, false);
  assert.equal(std.meta.chosen_threshold, fx.f1_disk.expected.chosen_threshold);
  assert.ok(std.meta.traced_pixels > 0);
  // measurement stage on the pipeline output
  const m = measure(std.grid, 4, 64, 8);
  assert.ok(Math.abs(m.D - fx.f1_disk.expected.D) <= 1e-9);
  assert.ok(Math.abs(m.r2 - fx.f1_disk.expected.r2) <= 1e-9);
  assert.deepEqual(m.scales, [4, 6, 9, 13, 20, 29, 43, 64]);
  assert.equal(m.n_scales, 8);
  // D reported alongside the meta that pins its provenance
  const report = {
    pipeline: std.meta.pipeline,
    meta: std.meta,
    features: { fractal_band: { D: m.D, r2: m.r2 } },
  };
  assert.equal(report.pipeline, 'edge-standard-v1');
  assert.ok(Number.isFinite(report.features.fractal_band.D));
});

test('e2e normalization property END-TO-END: f1 vs f2 same shape, different gray levels -> same grid, same D, different thresholds', () => {
  const a = standardize(decodeGray(fx.f1_disk), 64, 64);
  const b = standardize(decodeGray(fx.f2_disk_dim), 64, 64);
  // thresholds differ (1 vs 41) but the ink mask — and therefore the traced
  // grid and D — are identical (doc-02 ink normalization)
  assert.notEqual(a.meta.chosen_threshold, b.meta.chosen_threshold);
  assert.equal(a.meta.traced_pixels, b.meta.traced_pixels);
  assert.equal(a.meta.n_components_traced, b.meta.n_components_traced);
  assert.equal(gridSha256(a.grid), gridSha256(b.grid));
  const da = measure(a.grid, 4, 64, 8);
  const db = measure(b.grid, 4, 64, 8);
  assert.equal(da.D, db.D); // bit-identical, not just within tolerance
  assert.equal(da.r2, db.r2);
  // same achieved coverage (the ink fraction is identical)
  assert.ok(Math.abs(a.meta.achieved_coverage - b.meta.achieved_coverage) <= 1e-12);
});

test('e2e f3_sierpinski_leaves: full pipeline stays in the 1.45..1.70 band with r2 >= 0.98', () => {
  const std = standardize(decodeGray(fx.f3_sierpinski_leaves), 512, 512);
  assert.equal(std.meta.chosen_threshold, 1);
  assert.equal(std.meta.n_components_traced, 729); // 3^6 isolated leaf contours
  const m = measure(std.grid, 4, 64, 8);
  assert.ok(m.D > 1.45 && m.D < 1.70, `D=${m.D}`);
  assert.ok(m.r2 >= 0.98, `r2=${m.r2}`);
});

test('e2e determinism: two full-lifecycle runs are identical (grid bytes + meta + D)', () => {
  for (const id of ['f1_disk', 'f3_sierpinski_leaves']) {
    const f = fx[id];
    const gray = decodeGray(f);
    const r1 = standardize(gray, f.w, f.h);
    const r2 = standardize(gray, f.w, f.h);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2), `${id}: standardize`);
    const m1 = measure(r1.grid, 4, 64, 8);
    const m2 = measure(r2.grid, 4, 64, 8);
    assert.equal(JSON.stringify(m1), JSON.stringify(m2), `${id}: measure`);
    assert.equal(gridSha256(r1.grid), f.expected.grid_sha256, `${id}: vs pack`);
  }
});

test('e2e guard: all-zero gray standardizes deterministically with under_inked and measure throws', () => {
  const gray = new Uint8Array(64 * 64);
  const std = standardize(gray, 64, 64);
  assert.equal(std.meta.under_inked, true);
  assert.equal(std.meta.traced_pixels, 0);
  assert.equal(JSON.stringify(std), JSON.stringify(standardize(gray, 64, 64)));
  assert.throws(() => measure(std.grid, 4, 64, 8), /empty edge map/);
  // thresholdForCoverage is exported and consistent with the meta on a
  // two-level image (sanity that the route can call both stages directly)
  const r = thresholdForCoverage(decodeGray(fx.f4_two_level), 64, 64);
  assert.equal(r.chosen_threshold, fx.f4_two_level.expected.chosen_threshold);
});
