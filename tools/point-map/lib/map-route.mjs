import { radiusOptions, attachRadius } from './radius-api.mjs';
import { ApiError } from './http.mjs';
import { placement } from './placement.mjs';
import { kyFanFrameGap } from './rayleigh.mjs';
import { MAX_ITEMS } from './limits.mjs';
function id(v,n){if(!Number.isSafeInteger(v)||v<1)throw new ApiError(422,`${n} must be a positive integer`);return v;}
function aligned(v,n,key,unique=false){
  if(v===undefined)return;
  if(!Array.isArray(v)||v.length!==n||v.some(s=>typeof s!=='string'||!s.length))throw new ApiError(422,`${key} must contain one nonempty string per item`);
  if(unique&&new Set(v).size!==n)throw new ApiError(422,'names must be unique stable paths');
}
function options(body){
  const o={};
  for(const [k,lo,hi,integer] of [['d',2,24,true],['K',2,40,true],['T',Number.MIN_VALUE,1e6,false],['seed',-2147483648,4294967295,true],['ideal',1,5,true],['steps',100,200000,true],['perturbation_linf',0,Number.MAX_VALUE,false],['roundoff_budget',Number.MIN_VALUE,Number.MAX_VALUE,false]]){
    if(body[k]==null)continue;const v=body[k];
    if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(integer&&!Number.isInteger(v)))throw new ApiError(422,`${k} must be ${integer?'an integer':'finite'} in ${lo}..${hi}`);o[k]=v;
  }
  if(body.threshold!=null){if(!['median','zero'].includes(body.threshold))throw new ApiError(422,'threshold must be median or zero');o.threshold=body.threshold;}
  return o;
}
export async function mapRouteHandler(body,ctx){
  const {env,PM,embedDocuments,loadStoredMap,saveMap}=ctx;
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(422,'request must be an object');
  const radiusOpts=radiusOptions(body);
  const texts=body.texts!==undefined;
  if(texts===(body.vectors!==undefined))throw new ApiError(422,'provide exactly one of texts or vectors');
  const input=texts?body.texts:body.vectors;
  if(!Array.isArray(input)||input.length<10||input.length>MAX_ITEMS)throw new ApiError(422,`need 10..${MAX_ITEMS} items`);
  aligned(body.names,input.length,'names',true);aligned(body.labels,input.length,'labels');
  if(body.persist!==undefined&&typeof body.persist!=='boolean')throw new ApiError(422,'persist must be boolean');
  if(body.frame!==undefined)throw new ApiError(422,'use baseline_id; arbitrary frames are not accepted by the API');
  // transition guard (2026-09-18, after the round-8 stale-state incident): the caller declares the single transition it intends
  let transition=null;
  if(body.transition!==undefined){
    const t=body.transition; if(!t||typeof t!=='object'||Array.isArray(t))throw new ApiError(422,'transition must be an object {max_changed_names?, max_added?, max_removed?}');
    transition={};
    for(const k of ['max_changed_names','max_added','max_removed']){ if(t[k]===undefined)continue; if(!Number.isInteger(t[k])||t[k]<0)throw new ApiError(422,`transition.${k} must be a non-negative integer`); transition[k]=t[k]; }
    if(body.baseline_id==null)throw new ApiError(422,'transition requires baseline_id');
  }
  if(texts&&input.some(t=>typeof t!=='string'||!t.trim()))throw new ApiError(422,'texts must be nonempty strings');
  if(!texts){const D=input[0]?.length;if(!Number.isInteger(D)||D<2||D>768||input.some(r=>!Array.isArray(r)||r.length!==D||r.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw new ApiError(422,'vectors must be finite rectangular rows, D=2..768');}
  if(body.predicted_delta!=null&&(typeof body.predicted_delta!=='number'||!Number.isFinite(body.predicted_delta)))throw new ApiError(422,'predicted_delta must be a finite number');
  if(body.preprocessing_id!=null&&(typeof body.preprocessing_id!=='string'||!body.preprocessing_id.length))throw new ApiError(422,'preprocessing_id must be nonempty');
  const opts=options(body);let baseline=null;
  if(body.baseline_id!=null){
    id(body.baseline_id,'baseline_id');if(!body.names)throw new ApiError(422,'names are required for baseline comparison');
    baseline=await loadStoredMap(body.baseline_id);if(!baseline)throw new ApiError(404,'baseline not found');
    if(!baseline.frame)throw new ApiError(409,'legacy baseline has no frozen frame; create a new baseline');
    for(const key of ['d','threshold','seed','K','T','steps']){const old=baseline[key]??baseline.frame.config[key];if(opts[key]!==undefined&&opts[key]!==old)throw new ApiError(409,`${key} conflicts with baseline`);if(old!==undefined)opts[key]=old;}
    const preprocess=texts?'chunked/v1':(body.preprocessing_id??'raw/v1');
    if(preprocess!==baseline.preprocessing_id)throw new ApiError(409,'preprocessing_id conflicts with baseline');
    if(!texts&&input[0].length!==baseline.D)throw new ApiError(409,'input D conflicts with baseline');opts.frame=baseline.frame;
  }
  opts.K??=40;opts.names=body.names??body.labels??input.map((_,i)=>`item_${i}`);aligned(opts.names,input.length,'names',true);if(body.labels)opts.labels=body.labels;
  let X=input,embedding=null;
  if(texts){embedding=await embedDocuments(env,input);X=embedding.vectors;opts.preprocessing_id=embedding.ingestion_id;}
  else opts.preprocessing_id=body.preprocessing_id??'raw/v1';
  let map;try{map=PM.runMap(X,opts);}catch(e){throw new ApiError(422,`map identity/validation failed: ${e.message}`);}
  const source=texts?`texts:${embedding.model}`:'vectors';map.source=source;if(embedding)map.embedding_metadata=embedding.metadata;
  let comparison=null;
  if(baseline){try{comparison=PM.compareMaps(baseline,map,{predicted_delta:body.predicted_delta});}catch(e){if(!String(e.message).startsWith('name sets differ'))throw new ApiError(409,`comparison validation failed: ${e.message}`);comparison={comparable:false,task_verdict:'not-tested',reason:e.message};}}
  if(baseline&&transition){
    const bn=new Set(baseline.names||[]),an=new Set(map.names||[]);
    const added=[...an].filter(n=>!bn.has(n)),removed=[...bn].filter(n=>!an.has(n));
    let changed=[]; if(comparison&&Array.isArray(comparison.changed_content_names))changed=comparison.changed_content_names; else if(comparison&&Array.isArray(comparison.changed_names))changed=comparison.changed_names;
    else if(baseline.embedding_metadata&&baseline.embedding_metadata.docs&&embedding&&embedding.metadata&&embedding.metadata.docs){const bh=new Map((baseline.names||[]).map((n,i)=>[n,baseline.embedding_metadata.docs[i]&&baseline.embedding_metadata.docs[i].sha256]));changed=map.names.filter((n,i)=>bh.has(n)&&embedding.metadata.docs[i]&&bh.get(n)!==embedding.metadata.docs[i].sha256);}
    const over=[];
    if(transition.max_changed_names!==undefined&&changed.length>transition.max_changed_names)over.push({limit:'max_changed_names',declared:transition.max_changed_names,actual:changed.length,names:changed.slice(0,10)});
    if(transition.max_added!==undefined&&added.length>transition.max_added)over.push({limit:'max_added',declared:transition.max_added,actual:added.length,names:added.slice(0,10)});
    if(transition.max_removed!==undefined&&removed.length>transition.max_removed)over.push({limit:'max_removed',declared:transition.max_removed,actual:removed.length,names:removed.slice(0,10)});
    if(over.length)throw new ApiError(409,'the submitted corpus differs from the baseline by more than the declared transition; the map was computed but NOT persisted (driver state is stale or the corpus was rebuilt from the wrong tree)',{transition_violations:over,persisted:false});
  }
  let math_ledger=null;
  const explain=ctx.explainTransition||(typeof PM.explainTransition==='function'?PM.explainTransition.bind(PM):null);
  if(baseline&&explain){try{math_ledger=!ctx.explainTransition&&comparison?.math_ledger?comparison.math_ledger:explain(baseline,map,{predicted_delta:body.predicted_delta});}catch(e){throw new ApiError(409,`transition validation failed: ${e.message}`);}}
  try{map.rayleigh_frame={...kyFanFrameGap(X,map.frame||opts.frame,{iters:200}),version:'rayleigh/1',frame_source:baseline?'inherited baseline frame':'fresh frame (fitted on this corpus)'};}catch(e){map.rayleigh_frame={available:false,reason:e.message};}
  const radius_comparison=attachRadius(map,baseline,radiusOpts);
  // single ADD or single CHANGE against a baseline: report where the item landed even when compareMaps is name-set incomparable
  let placement_block=null;
  if(baseline&&Array.isArray(baseline.names)&&Array.isArray(baseline.pts_full)&&Array.isArray(baseline.bits)){
    const added=map.names.filter(n=>!baseline.names.includes(n)); const removed=baseline.names.filter(n=>!map.names.includes(n));
    if(added.length===1&&removed.length===0){try{placement_block=placement(baseline,map,added[0],'add',null);}catch(e){placement_block={available:false,reason:e.message};}}
    else if(added.length===0&&removed.length===0&&comparison&&Array.isArray(comparison.changed_names)&&comparison.changed_names.length===1){try{placement_block=placement(baseline,map,comparison.changed_names[0],'change',null);}catch(e){placement_block={available:false,reason:e.message};}}
  }
  const persist=body.persist!==false;const resultId=persist?await saveMap(map,source):null;
  return {id:resultId,map,comparison,math_ledger,radius_comparison,placement:placement_block,persisted:persist};
}
export async function mapsCompareHandler(body,ctx){
  const before=await ctx.loadStoredMap(id(body?.before_id,'before_id'));const after=await ctx.loadStoredMap(id(body?.after_id,'after_id'));
  if(!before||!after)throw new ApiError(404,'map not found');
  if(!before.frame||!after.frame)throw new ApiError(409,'legacy map has no frozen frame; create a new baseline');
  try{const comparison=ctx.PM.compareMaps(before,after);const radius_comparison=attachRadius(after,before,radiusOptions(body));return {...comparison,radius_comparison};}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(409,e.message);}
}
