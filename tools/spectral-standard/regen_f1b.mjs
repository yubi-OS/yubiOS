// regen_f1b.mjs — F1b: regenerate mask_three_blobs_walk's pre-P4 hop-metric
// expected block under the current euclidean walker, recomputing EVERY
// walkDimensions-derived field exactly as the parity tests consume them.
import { readFileSync, writeFileSync } from 'node:fs';
import { walkCentroidMode } from './jev-spectral-centroid.js';
import { walkDimensions } from './jev-spectral-math.js';

const PACK = 'fixtures_centroid_lane_e.json';
const pack = JSON.parse(readFileSync(PACK, 'utf8'));
const fx = Object.fromEntries(pack.fixtures.map((f) => [f.id, f]));
const wf = fx.mask_three_blobs_walk;
const round9 = (v) => Math.round(v * 1e9) / 1e9;

const result = walkCentroidMode(fx[wf.source.mask_id].mask, {
  walkers: wf.walk_params.walkers, seed: wf.walk_params.seed, k: wf.walk_params.k, startRule: wf.walk_params.startRule,
});
if (!result || result.status !== 'ok' || !result.dims) throw new Error('walker did not return ok');
console.log('walker msd:', result.walk.msd);
console.log('walker msd_metric:', result.walk.msd_metric);
console.log('walker dims:', JSON.stringify(result.dims));

// cross-check: walkDimensions over {ladder, msd, p_return} (the d_w-parity test path)
const dims2 = walkDimensions({ ladder: wf.walk_params.ladder, msd: result.walk.msd, p_return: result.walk.p_return });
console.log('walkDimensions-derived:', JSON.stringify(dims2));

wf.expected.msd = result.walk.msd;
wf.expected.msd_metric = result.walk.msd_metric || 'euclidean';
wf.expected.alpha_msd = dims2.alpha_msd === null ? null : round9(dims2.alpha_msd);
wf.expected.d_w = dims2.d_w === null ? null : round9(dims2.d_w);
wf.expected.d_w_r2 = dims2.d_w_r2 === null ? null : round9(dims2.d_w_r2);
wf.expected.msd_low_confidence = dims2.msd_low_confidence;
// metric-independent fields must be untouched
console.log('unchanged check: walker0_trace eq:', JSON.stringify(result.walk.walker0_trace) === JSON.stringify(wf.expected.walker0_trace),
  'p_return eq:', JSON.stringify(result.walk.p_return) === JSON.stringify(wf.expected.p_return));

pack.regenerated = {
  note: 'AM-9 / F1b (2026-10-07): fixture regenerated under the EUCLIDEAN msd metric post-P4. The mask_three_blobs_walk expected block was captured pre-P4 under the HOP metric (msd ~0.6-0.8 hop^2, alpha_msd null / msd_low_confidence true); the P4 walker (walkCentroidMode now attaches centroid coords to randomWalks) measures EUCLIDEAN px^2 (msd ~62-77), which also un-degenerates the msd fit. All walkDimensions-derived fields (msd, alpha_msd, d_w, d_w_r2, msd_low_confidence) regenerated from the current walker; walker0_trace / checkpoint_matrix / p_return / d_s are metric-independent and untouched. Points-source walk fixtures are unaffected: the parity suite delegates them through randomWalks({adj}) without coords, which remains the hop metric by design. Hop-metric fixture was stale; see falsification/CROSSPARITY-centroid-2026-10-06.md.',
  regenerated_at: '2026-10-07',
  fixtures_updated: ['mask_three_blobs_walk'],
  tool: 'regen_f1b.mjs (runs the repo-current walker on the fixture mask)',
};
writeFileSync(PACK, JSON.stringify(pack, null, 2) + '\n');
console.log('WROTE', PACK);
