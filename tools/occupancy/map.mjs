import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
const dir=process.cwd();
const repo=path.resolve(process.argv[2]);
const pmDir=path.join(repo,'tools/point-map');
const {focalPointTrial}=await import(pathToFileURL(path.join(pmDir,'lib/focal-point.mjs')));
const sb=vm.createContext({console,TextEncoder,TextDecoder});
vm.runInContext(fs.readFileSync(path.join(pmDir,'pointmap.js'),'utf8'),sb);
const vectors=JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,'vectors.json.gz'))));
const X=vectors.map(v=>{const norm=Math.hypot(...v);return v.map(x=>x/norm);});
const rows=fs.readFileSync(path.join(dir,'dataset.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const take=(name)=>X.filter((_,i)=>rows[i].split===name);
const opts={d:9,seed:20261122,K:20,T:0.1,steps:2000,threshold:'median',preprocessing_id:'unit-bge-m3/v1'};
const probe=sb.PM.runMap(take('reference'),opts);
const trial=focalPointTrial(probe,{tau:0.5,K:20,trades_per_row:100});
const d=trial.focal.n_star;
const ref=sb.PM.runMap(take('reference'),{...opts,d});
const test=sb.PM.runMap(take('test'),{...opts,d,frame:ref.frame});
const probeTest=sb.PM.runMap(take('test'),{...opts,frame:probe.frame});
if(ref.frame_id!==test.frame_id) throw Error('frame mismatch');
const compact=m=>({bits:m.bits,points:m.pts_full,frame_id:m.frame_id,run_fingerprint:m.run_fingerprint});
fs.writeFileSync(path.join(dir,'maps.json'),JSON.stringify({trial,ref:compact(ref),test:compact(test),probeBits:probe.bits,probeTestBits:probeTest.bits,ref_is_probe_prefix:ref.bits.every((r,i)=>r.every((b,j)=>probe.bits[i][j]===b))}));
// Evaluate the same two powers on held-out points, with scale fixed by the references.
const {greedyPacking, lensScan}=await import(pathToFileURL(path.join(pmDir,'lib/focal-point.mjs')));
const planar=points=>points.map(([x,y,z])=>[x/(1-z),y/(1-z)]);
const w=planar(ref.pts_full);
const rms=Math.sqrt(w.reduce((s,[x,y])=>s+x*x+y*y,0)/w.length);
function power(points) {
  return planar(points).map(([a,b])=>{const x=a/rms,y=b/rms,r=x*x+y*y;return [2*x/(1+r),2*y/(1+r),(r-1)/(1+r)];});
}
const chart={scale:1/rms,training_scan:lensScan(ref.pts_full)};
for (const [name,m] of Object.entries({ref,test})) {
 const powered=power(m.pts_full);
 chart[name]={powered,served:greedyPacking(m.pts_full,0.095),rms:greedyPacking(powered,0.095)};
}
fs.writeFileSync(path.join(dir,'charts.json'),JSON.stringify(chart));
