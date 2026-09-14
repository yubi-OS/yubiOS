import assert from 'node:assert/strict';
import {radiusProfile,radiusTransition} from './lib/radius-diagnostics.mjs';
import {radiusOptions,radiusForRead} from './lib/radius-api.mjs';
const map=(pts)=>({frame_id:'f',instrument_id:'i',n:pts.length,names:pts.map((_,i)=>'item'+i),pts_full:pts});
const e=Number.EPSILON;
const a=map([[1+e,0,0],[-1-e,0,0]]),b=map([[1+2*e,0,0],[-1-2*e,0,0]]);
assert.equal(radiusTransition(a,b).same_sign_interval.upper,2);
assert.equal(radiusTransition(a,b).same_sign_interval.lower,0);
assert.throws(()=>radiusProfile(map([[1e308,0,0],[-1e308,0,0]])),/overflow/);
assert.throws(()=>radiusProfile({...map([[0,0,0],[1,0,0]]),isolated:999}),/mismatch/);
assert.throws(()=>radiusOptions({coordinate_epsilon:Number.MAX_VALUE,distance_error_bound:1}),e=>e.status===422);
assert.throws(()=>radiusOptions({distance_error_bound:0}),e=>e.status===422);
assert.throws(()=>radiusOptions({radius:0.1}),e=>e.status===422);
assert.deepEqual(radiusOptions({coordinate_epsilon:0,distance_error_bound:1e-12}),{coordinate_epsilon:0,distance_error_bound:1e-12});
const malformed={...map([[0,0,0],[1,0,0]]),isolated:999};
const preserved=radiusForRead(malformed);
assert.equal(preserved.isolated,999);assert.equal(preserved.frame_id,'f');assert.match(preserved.radius_profile_unavailable.reason,/mismatch/);
assert.equal(preserved.radius_profile,undefined);
assert.deepEqual(radiusForRead({version:'old',n:2000}),{version:'old',n:2000});
let rectangles=0;
for(let d=0;d<=100;d++)for(let R=0;R<=100;R++){
 let sum=0;for(let r=1;r<=R;r++)sum+=Number(r<=d);
 assert.equal(sum,Math.min(R,d));rectangles++;
}
const p=radiusProfile(map([[0,0,0],[0.04,0,0],[0.12,0,0],[0.3,0,0]]));
for(const row of p.samples){
 const cuts=[...new Set([0,row.radius,...p.per_item.map(x=>x.clearance).filter(d=>d>0&&d<row.radius)])].sort((a,b)=>a-b);
 let integral=0;for(let k=1;k<cuts.length;k++)integral+=(cuts[k]-cuts[k-1])*p.per_item.filter(x=>x.clearance>=cuts[k]).length;
 assert.ok(Math.abs(row.area-integral)<1e-12);
 assert.equal(row.mean_area,row.area/p.n);
}
const edgePairs=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)edgePairs.push([i,j]);
const classes=new Map();let repeated=0;
for(let mask=0;mask<1<<edgePairs.length;mask++){
 const adj=Array.from({length:5},()=>Array(5).fill(0));edgePairs.forEach(([i,j],k)=>{if(mask>>k&1)adj[i][j]=adj[j][i]=1;});
 const degrees=adj.map(r=>r.reduce((a,b)=>a+b,0)),key=degrees.join(',');
 const isolated=adj.filter(r=>r.every(x=>x===0)).length;
 if(classes.has(key)){assert.equal(classes.get(key),isolated);repeated++;}else classes.set(key,isolated);
}
assert.ok(repeated>0);
console.log(JSON.stringify({boundary_checks:13,rectangle_cases:rectangles,graph_cases:1024,degree_sequences:classes.size,repeated_degree_cases:repeated,area_windows:p.samples.length,failed:0,scope:'Degree-zero count is invariant under any fixed degree sequence; not a probabilistic test.'}));
