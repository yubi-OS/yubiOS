// Regression: on high-D inputs (D > 40, the power/subspace path) the PCA frame must be converged,
// i.e. independent of the RNG seed. Synthetic spectrum with slowly decaying eigenvalues (ratio 0.92),
// the regime of 1024-D bge-m3 corpora, where 40 sequential power iterations do not converge.
import vm from 'node:vm'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sb = { console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error, Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array, TextEncoder, TextDecoder };
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.resolve(__dirname, 'pointmap.js'), 'utf8'), sb);
const PM = sb.PM;
const { pcaTop } = PM._internal;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  - ' + m); } else { fail++; console.log('  FAIL - ' + m); } };
const rng = PM.mulberry32(12345);
const g = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const n = 600, D = 256, L = 24;
const B = Array.from({ length: L }, () => Array.from({ length: D }, g));
const X = Array.from({ length: n }, () => { const z = Array.from({ length: L }, (_, l) => g() * Math.pow(0.96, l)); const row = new Array(D).fill(0);
  for (let l = 0; l < L; l++) for (let j = 0; j < D; j++) row[j] += z[l] * B[l][j]; for (let j = 0; j < D; j++) row[j] += 0.05 * g(); return row; });
const k = 13, d = 11;
const codes = (p) => { const th = []; for (let j = 0; j < d; j++) { const c = p.scores.map(r => r[j]).sort((a, b) => a - b); th.push(c[Math.floor(c.length / 2)]); }
  return p.scores.map(r => r.slice(0, d).map((v, j) => (v > th[j] ? 1 : 0)).join('')); };
const P = [1, 2, 3].map(s => pcaTop(X, k, PM.mulberry32(s)));
const C = P.map(codes);
let minCos = 1; for (let a = 0; a < d; a++) for (const q of [1, 2]) { let s = 0; for (let j = 0; j < D; j++) s += P[0].axes[a][j] * P[q].axes[a][j]; minCos = Math.min(minCos, Math.abs(s)); }
const diff = (A, Bc) => A.filter((x, i) => x !== Bc[i]).length / A.length;
ok(minCos > 0.9999, `frame axes 1..${d} agree across seeds (min |cos| = ${minCos.toFixed(6)})`);
ok(Math.max(diff(C[0], C[1]), diff(C[0], C[2])) < 0.005, `d=${d} codes agree across seeds (max fraction differing = ${Math.max(diff(C[0], C[1]), diff(C[0], C[2])).toFixed(4)})`);
console.log(`${pass}/${pass + fail} passed`); if (fail) process.exit(1);
