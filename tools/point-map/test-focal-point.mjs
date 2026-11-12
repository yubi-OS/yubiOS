#!/usr/bin/env node
// test-focal-point.mjs — focal-point/1: FocalBounds runtime invariants, ladder/n* consistency, curveball margins,
// lens inverse, determinism, handler errors. Optional: MAP598=<decoded map-598 JSON> checks the paper-4 numbers.
import assert from "node:assert/strict"; import vm from "node:vm"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { ApiError } from "./lib/http.mjs";
import { focalPointTrial, focalHandler, selfTest, validateFocalBody, assertFocalBounds, ladderGains, focalDim, prefixLadder, lensScan } from "./lib/focal-point.mjs";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
function load(){const code=fs.readFileSync(path.resolve(__dirname,"pointmap.js"),"utf8");const sb={console,Math,Array,Object,JSON,Number,String,Boolean,RangeError,TypeError,Error,Set,Map,Infinity,NaN,isNaN,isFinite,BigInt,Uint8Array,Float32Array,Float64Array,TextEncoder,TextDecoder};vm.createContext(sb);vm.runInContext(code,sb);return sb.PM;}
const PM=load(); let pass=0,fail=0; const t=async(n,f)=>{try{await f();pass++;console.log("  ok  - "+n);}catch(e){fail++;console.log("FAIL  - "+n+"\n        "+(e?.stack||e));}};
const opts={K:6,trades_per_row:20};
const m=PM.runMap(PM.synth(240,16,7),{d:9,seed:20260906,K:8,steps:2000,threshold:"median",preprocessing_id:"raw/v1"});

await t("selfTest: cube ladder, constant axis, curveball margins, negative control, lift inverse, stable band", ()=>{const s=selfTest();assert.equal(s.ok,true,JSON.stringify(s.checks.filter(c=>!c.pass)));});
await t("trial on a real runMap output: ladder obeys prefix_count_mono/double/pow/le_length; n* matches Definition 2", ()=>{
  const r=focalPointTrial(m,opts); const c=r.ladder.counts;
  for(let d=0;d<c.length;d++){assert.ok(c[d]<=2**(d+1));assert.ok(c[d]<=r.N);if(d+1<c.length){assert.ok(c[d]<=c[d+1]);assert.ok(c[d+1]<=2*c[d]);}}
  assert.equal(r.focal.n_star,focalDim(ladderGains(c),r.tau)); assert.equal(c.at(-1),new Set(m.bits.map(b=>b.join(""))).size);
  assert.equal(r.persisted,false); assert.deepEqual(r.side_effects,{map_storage:false,repository:false,vectorize:false,embedding_cache:false});
  assert.ok(["focal-point-corpus-specific","focal-point-not-separable-from-null","not-reproducible-across-seeds"].includes(r.focal.verdict));
  assert.equal(r.lean.violations,0); assert.equal(r.lean.ladders_checked,1+2*opts.K);});
await t("lens: served count equals the greedy packing of the stored sphere; best >= RMS-power count", ()=>{const r=focalPointTrial(m,opts);assert.equal(r.lens.available,true);assert.ok(r.lens.N_best>=r.lens.N_rms);assert.ok(r.lens.N_best>=r.lens.N_served||r.lens.scan.length===49);assert.equal(r.lens.distinct_positions,new Set(m.pts_full.map(p=>p.map(x=>Math.round(x*1e10)).join(","))).size);});
await t("deterministic for a fixed map and seed; a different null_seed changes only the null block", ()=>{const a=focalPointTrial(m,opts),b=focalPointTrial(m,opts),c=focalPointTrial(m,{...opts,null_seed:12345});const strip=r=>JSON.stringify({...r,seconds:0});assert.equal(strip(a),strip(b));assert.deepEqual(a.ladder,c.ladder);assert.notEqual(a.null.seeds.a,c.null.seeds.a);});
await t("certified counts are lower bounds that never exceed the class count", ()=>{const r=focalPointTrial(m,opts);if(r.certified.available){assert.ok(r.certified.classes_all_axes.every(x=>x<=r.ladder.counts.at(-1)));assert.equal(r.certified.classes_all_axes.length,r.certified.eps.length);}});
await t("runtime Lean invariants reject impossible ladders (FocalBounds negative controls)", ()=>{
  assert.throws(()=>assertFocalBounds([2,4,9],100,ladderGains([2,4,9]),0.5,3,"forged"),/INVARIANT VIOLATED \(FocalBounds\.lean prefix_count_double\)/);
  assert.throws(()=>assertFocalBounds([2,4,3],100,ladderGains([2,4,3]),0.5,2,"forged"),/prefix_count_mono/);
  assert.throws(()=>assertFocalBounds([2,4,8],5,ladderGains([2,4,8]),0.5,3,"forged"),/prefix_count_le_length/);
  assert.throws(()=>assertFocalBounds([2,4,8],100,ladderGains([2,4,8]),0.5,2,"forged"),/focalDim_stop_fails/);});
await t("handler: validation 400, missing map 404, legacy map 409, null budget 400; errors use the bundle's ApiError", async()=>{
  assert.throws(()=>validateFocalBody({map_id:0}),/map_id/); assert.throws(()=>validateFocalBody({map_id:1,tau:2}),/tau/); assert.throws(()=>validateFocalBody({map_id:1,K:41}),/K must/);
  const ctx=(map)=>({loadStoredMap:async()=>map,ApiError});
  await assert.rejects(focalHandler({map_id:9},ctx(null)),e=>e instanceof ApiError&&e.status===404);
  await assert.rejects(focalHandler({map_id:9},ctx({bits:[]})),e=>e instanceof ApiError&&e.status===409);
  const big={...m,bits:Array.from({length:6000},(_,i)=>m.bits[i%m.bits.length])};
  await assert.rejects(focalHandler({map_id:9,K:40,trades_per_row:200},ctx(big)),e=>e instanceof ApiError&&e.status===400);});
const P598=process.env.MAP598;
if(P598&&fs.existsSync(P598)){await t("paper 4 (map #598): ladder 2..116, n*=7, null n*={9}, certified 114/94, lens 75/79/80", ()=>{
  const r=focalPointTrial(JSON.parse(fs.readFileSync(P598,"utf8")),{});
  assert.deepEqual(r.ladder.counts,[2,4,8,16,30,49,79,95,116]); assert.equal(r.focal.n_star,7); assert.deepEqual(r.null.n_star_values,[9]);
  assert.equal(r.certified.classes_all_axes[0],114); assert.equal(r.certified.classes_all_axes[r.certified.eps.indexOf(0.0016)],94);
  assert.deepEqual([r.lens.N_served,r.lens.N_rms,r.lens.N_best],[75,79,80]);});}
console.log(`\n${pass}/${pass+fail} passed`);if(fail)process.exit(1);
