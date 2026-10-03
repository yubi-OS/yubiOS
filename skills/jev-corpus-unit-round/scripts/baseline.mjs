#!/usr/bin/env node
// baseline.mjs — the optimized frozen-baseline check for one unit round of the
// jev-corpus RSI chain (skill: jev-corpus-unit-round).
//
// Fetch plan (protocol-identical to the sequential flow; measured on refs10,
// 2026-10-03: ~100s of API time sequential -> ~38s here):
//   Phase A (parallel): scorer matrix (concurrency 12 — the measured sweet
//            spot; 24+ inflates per-call latency) || map (frozen frame)
//   Phase B (parallel): audit nulls=400 (needs the matrix) || control
//            (5 splices, needs the map id, retried on 503/1102 — it is the
//            flakiest call) || admission || azimuth || axis-redundancy ||
//            lens snapshot (needs the map; feeds /visco/mobility)
//   Phase C: rungs read (GET /api/maps/:id -> ladder_candidates.rungs)
//
// Usage:
//   node baseline.mjs --dir <refs-dir> --out <workdir> [--skip skip.json] [--conc 12] [--controls 5]
//
// Outputs in --out:
//   matrix_v22.jsonl   one {name,row,probs,evidence_counts} per doc (resumable)
//   baseline.json      {audit:{dbc,z,level_dbc,v2,verdict,run_id}, mapId, mapFrame, control, admission}
//   rungs.json         the map's ladder_candidates.rungs
//   timings.json       per-step wall-clock + total
//
// Lessons encoded: User-Agent on every call (CF 1010); hysteresis is NOT used
// here (fresh full-matrix scoring, plain threshold) — hysteresis belongs to
// edited-row re-scores inside the cycle; control is the flakiest call
// (worker 1102 CPU kill) and gets retries; /api/jev/corpus/placements 404s —
// the direct /api/map texts flow is the working path.

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = arg('--dir', '');
const OUT = arg('--out', process.cwd());
const SKIP_FILE = arg('--skip', null);
const CONC = Number(arg('--conc', '12'));
const CONTROLS = Number(arg('--controls', '5'));
const BASE = process.env.STEADY_ORBIT_BASE || 'https://steady-orbit.systems-a.workers.dev';
const H = { 'User-Agent': 'omni-agent/1.0', 'Content-Type': 'application/json' };

if (!DIR) { console.error('usage: baseline.mjs --dir <refs-dir> --out <workdir> [--skip skip.json] [--conc 12]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const T0 = Date.now();
const TIM = [];
const tick = (step, ms, extra) => { TIM.push({ step, ms, ...(extra || {}) }); console.log(`TIMING ${step}_ms=${ms}${extra ? ' ' + JSON.stringify(extra) : ''}`); };

async function post(path, body, retries = 1) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const s = Date.now();
    const r = await fetch(BASE + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const t = await r.text();
    if (r.ok) return { json: JSON.parse(t), ms: Date.now() - s };
    lastErr = new Error(`${path} ${r.status} ${t.slice(0, 200)}`);
    if (r.status === 503 || r.status === 500) { console.log(`RETRY ${path} (attempt ${attempt}) after ${r.status}`); await new Promise(res => setTimeout(res, 2000)); continue; }
    throw lastErr;
  }
  throw lastErr;
}

// ---- load corpus ----
const names = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort().map(f => 'refs/' + f);
const texts = names.map(n => fs.readFileSync(path.join(DIR, n.slice(5)), 'utf8'));
console.log(`docs=${names.length}`);

const skip = SKIP_FILE ? JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8')) : [];

// ---- Phase A: score (conc 12) || map — two independent heavy blocks ----
const matrixFile = path.join(OUT, 'matrix_v22.jsonl');
const done = new Set();
if (fs.existsSync(matrixFile)) for (const line of fs.readFileSync(matrixFile, 'utf8').split('\n')) if (line.trim()) { try { done.add(JSON.parse(line).name); } catch {} }
const todo = names.map((n, i) => ({ name: n, text: texts[i] })).filter(d => !done.has(d.name));
console.log(`scoring ${todo.length} docs at conc ${CONC} (${done.size} already in matrix file)`);

const scoreP = (async () => {
  const s = Date.now();
  const lat = [];
  const q = [...todo];
  let fail = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (q.length) {
      const d = q.shift();
      const c0 = Date.now();
      try {
        const r = await fetch(BASE + '/api/jev/corpus/scorer/score', { method: 'POST', headers: H, body: JSON.stringify({ doc: { name: d.name, text: d.text } }) });
        if (!r.ok) { fail++; console.log(`SCORE_FAIL ${d.name} ${r.status}`); continue; }
        const j = await r.json();
        fs.appendFileSync(matrixFile, JSON.stringify({ name: d.name, row: j.row, probs: j.probs, evidence_counts: j.evidence_counts }) + '\n');
        lat.push(Date.now() - c0);
      } catch (e) { fail++; console.log(`SCORE_ERR ${d.name} ${String(e).slice(0, 80)}`); }
    }
  }));
  lat.sort((a, b) => a - b);
  tick('score_matrix', Date.now() - s, { n: lat.length, fail, conc: CONC, p50: lat[Math.floor(lat.length / 2)] || 0, p95: lat[Math.floor(lat.length * 0.95)] || 0 });
})();

const mapP = (async () => {
  const { json: m, ms } = await post('/api/map', { texts, names, labels: names, d: 9, seed: 20260906, threshold: 'median', K: 40, T: 0.05 }, 2);
  tick('map_baseline', ms, { mapId: m.id });
  return m;
})();

const [, map] = await Promise.all([scoreP, mapP]);

// rebuild the matrix from the jsonl
const rows = fs.readFileSync(matrixFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const byName = new Map(rows.map(r => [r.name, r.row]));
const matrix = names.map(n => byName.get(n));
const missing = names.filter(n => !byName.has(n));
if (missing.length) throw new Error(`matrix incomplete after scoring: ${missing.length} missing (${missing.slice(0, 3).join(',')})`);

// ---- Phase B: audit || control || instruments (all parallel) ----
const auditP = (async () => {
  const { json: a, ms } = await post('/api/jev/corpus/audit', { matrix, labels: names, nulls: 400 });
  tick('audit_nulls400', ms, { run_id: a.run_id, level_dbc: a.level_dbc });
  return a;
})();

const controlP = (async () => {
  const s = Date.now();
  let ctrl = null, attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts = attempt;
    try { ctrl = (await post('/api/map/control', { baseline_id: map.id, texts, names, n_controls: CONTROLS })).json; break; }
    catch (e) { console.log(`CONTROL retry ${attempt}: ${String(e).slice(0, 120)}`); await new Promise(res => setTimeout(res, 2000)); }
  }
  const d = ctrl && ctrl.isolated_delta ? { neg: ctrl.isolated_delta.negative, zero: ctrl.isolated_delta.zero, pos: ctrl.isolated_delta.positive } : null;
  tick('control', Date.now() - s, { attempts, isolated_delta: d, ok: !!ctrl });
  return ctrl;
})();

const instP = (async () => {
  const s = Date.now();
  const out = {};
  const jobs = [
    ['admission', { map_id: map.id, K: 40 }],
    ['azimuth', { map_id: map.id, K: 40 }],
    ['axis-redundancy', { map_id: map.id, K: 40 }],
  ];
  const results = await Promise.all(jobs.map(async ([nm, body]) => {
    try { return [nm, (await post('/api/map/' + nm, body)).json]; } catch (e) { return [nm, { error: String(e).slice(0, 120) }]; }
  }));
  for (const [nm, j] of results) out[nm.replace('-', '_')] = j;
  out.lens = (await post('/api/jev/corpus/lens', { matrix, labels: names, top: 15, skip })).json;
  tick('instruments_parallel', Date.now() - s, { lens_reals: (out.lens.candidates || []).filter(c => c.kind === 'real').length });
  return out;
})();

const [audit, control, inst] = await Promise.all([auditP, controlP, instP]);

// ---- Phase C: rungs ----
const rungStart = Date.now();
const mp = await (await fetch(`${BASE}/api/maps/${map.id}`, { headers: H })).json();
const rungs = (mp.ladder_candidates || {}).rungs || [];
tick('rungs_read', Date.now() - rungStart, { n: rungs.length });

// ---- outputs ----
fs.writeFileSync(path.join(OUT, 'baseline.json'), JSON.stringify({
  audit: { dbc: audit.dbc, z: audit.z, level_dbc: audit.level_dbc, v2: audit.v2, verdict: audit.verdict, run_id: audit.run_id },
  mapId: map.id, mapFrame: map.frame_id,
  control: control ? { isolated_delta: control.isolated_delta, bits_moved_count: control.bits_moved_count } : null,
  admission: inst.admission && (inst.admission.summary || inst.admission),
}, null, 1));
fs.writeFileSync(path.join(OUT, 'rungs.json'), JSON.stringify(rungs, null, 1));
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify({ total_ms: Date.now() - T0, T: TIM }, null, 1));
console.log(`BASELINE_TOTAL_ms=${Date.now() - T0}`);
console.log(`BASELINE level_dbc=${audit.level_dbc} map=${map.id} rungs=${rungs.length}`);
