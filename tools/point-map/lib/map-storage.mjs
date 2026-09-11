import { ApiError } from './http.mjs';

// Storage-only encoding. Public responses retain the normal margin objects.
// No numerical precision is removed; repeated JSON property names are eliminated.
const FIELDS=['axis','signed_margin','distance_to_threshold','perturbation_bound','bit','status'];
export function encodeMap(map) {
  let stored=map;
  const md=map.math_diagnostics;
  if(md && Array.isArray(md.per_input)) {
    stored={...map,math_diagnostics:{...md,storage_encoding:'margin-tuples/1',
      per_input:md.per_input.map(r=>[r.index,r.name,r.margins.map(m=>FIELDS.map(k=>m[k]))])}};
  }
  const json=JSON.stringify(stored);
  const bytes=new TextEncoder().encode(json).length;
  if(bytes>1900000) throw new ApiError(413,'map exceeds the safe D1 storage limit; use persist:false or a smaller corpus');
  return json;
}
export function decodeMap(json) {
  const map=typeof json==='string'?JSON.parse(json):json;
  const md=map.math_diagnostics;
  if(md?.storage_encoding==='margin-tuples/1') {
    const {storage_encoding,...rest}=md;
    map.math_diagnostics={...rest,per_input:md.per_input.map(r=>({index:r[0],name:r[1],
      margins:r[2].map(t=>Object.fromEntries(FIELDS.map((k,i)=>[k,t[i]])))}))};
  }
  return map;
}
