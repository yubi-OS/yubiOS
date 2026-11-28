// Supplement the fixed PCA study with the repository's deployed-style point map.
import fs from 'node:fs';
import vm from 'node:vm';
import { focalPointTrial } from '../point-map/lib/focal-point.mjs';

const context = vm.createContext({console, TextEncoder, TextDecoder});
vm.runInContext(fs.readFileSync(new URL('../point-map/pointmap.js', import.meta.url), 'utf8'), context);
const {reference, native, powered} = JSON.parse(fs.readFileSync(0, 'utf8'));
const configuration = {d: 6, K: 20, seed: 340, T: 0.1, steps: 2000,
  threshold: 'median', preprocessing_id: 'ontology-bge-m3-unit/v1'};
const map = (rows, opts) => context.PM.runMap(rows, opts);
const baseline = map(reference, configuration);
const trial = focalPointTrial(baseline, {tau: 0.5, K: 20, trades_per_row: 20});
const d = trial.focal.n_star;
if (d < 1) throw Error('Empty reference prefix');
const fitted = map(reference, {...configuration, d});
const states = {};
for (const [state, rows] of Object.entries({native, powered})) {
  const observed = map(rows, {...configuration, d, frame: fitted.frame});
  if (observed.frame_id !== fitted.frame_id) throw Error('Frame drift');
  states[state] = {beneficial_moves: observed.atoms.filter(atom => atom.flip >= 0).length,
    mean_chord_gain: observed.atoms.reduce((sum, atom) => sum + atom.delta, 0) / rows.length};
}
const {pi, kmean_analytic, kmean_empirical, flux_identity_analytic} = fitted.compass;
if (!flux_identity_analytic.ok || Math.abs(pi.reduce((a,b) => a+b, 0)-1) > 1e-9)
  throw Error('Invalid compass shell distribution');
process.stdout.write(JSON.stringify({focal_bits:d, prefix_counts:trial.ladder.counts,
  relaxation_steps:fitted.compass.relaxation_steps, reference_shell_probability:pi, analytic_mean:kmean_analytic, chain_mean:kmean_empirical, states}));
