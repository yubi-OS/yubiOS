import fs from 'node:fs';
import vm from 'node:vm';
import { focalPointTrial, greedyPacking } from '../point-map/lib/focal-point.mjs';

const context = vm.createContext({ console, TextEncoder, TextDecoder });
vm.runInContext(fs.readFileSync(new URL('../point-map/pointmap.js', import.meta.url), 'utf8'), context);
const {reference, query} = JSON.parse(fs.readFileSync(0, 'utf8'));
const opts = {d: 7, seed: 20261122, K: 20, T: 0.1, steps: 2000,
  threshold: 'median', preprocessing_id: 'unit-bge-m3/v1'};
const run = (x, options) => context.PM.runMap(x, options);
const probe = run(reference, opts);
const trial = focalPointTrial(probe, {tau: 0.5, K: 20, trades_per_row: 100});
const d = trial.focal.n_star;
if (d < 1) throw Error('No half-bit focal prefix on references');
const ref = run(reference, {...opts, d});
const test = run(query, {...opts, d, frame: ref.frame});
if (test.frame_id !== ref.frame_id || !ref.bits.every((row,i) => row.every((b,j)=>b === probe.bits[i][j])))
  throw Error('Frozen frame or focal prefix mismatch');
const planar = points => points.map(([x,y,z]) => [x/(1-z), y/(1-z)]);
const rms = Math.sqrt(planar(ref.pts_full).reduce((sum,[x,y])=>sum+x*x+y*y,0)/reference.length);
if (!(rms > 0 && Number.isFinite(rms))) throw Error('Degenerate reference globe');
function compact(map) {
  const powered = planar(map.pts_full).map(([u,v]) => {
    const x=u/rms, y=v/rms, r=x*x+y*y;
    return [2*x/(1+r),2*y/(1+r),(r-1)/(1+r)];
  });
  const atoms = map.atoms.filter(a => a.flip >= 0);
  const compass = map.compass;
  return {atom_moves: atoms.length, mean_atom_gain: map.atoms.reduce((s,a)=>s+a.delta,0)/map.bits.length,
    compass: {shell_probability:compass.pi, analytic_mean:compass.kmean_analytic,
              chain_mean:compass.kmean_empirical, detailed_balance:compass.flux_identity_analytic.ok},
    bits:map.bits, points:map.pts_full, powered, packing: [map.pts_full,powered].map(p=>greedyPacking(p,0.095).count)};
}
process.stdout.write(JSON.stringify({d,counts:trial.ladder.counts,frame_id:ref.frame_id,certified:trial.certified,reference:compact(ref),test:compact(test)}));
