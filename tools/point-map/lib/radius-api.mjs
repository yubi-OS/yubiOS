import { ApiError } from './http.mjs';
import { radiusProfile, radiusTransition } from './radius-diagnostics.mjs';

export function radiusOptions(body) {
  for(const key of ['radius','canonical_radius','isolation_radius','radii','radius_grid']) {
    if(body[key] !== undefined) throw new ApiError(422,'The canonical radius is fixed at 0.095; the radius grid is diagnostic-only and fixed.');
  }
  const opts={};
  for(const [key,positive] of [['coordinate_epsilon',false],['distance_error_bound',true]]) {
    if(body[key] == null) continue;
    const v=body[key];
    if(typeof v!=='number'||!Number.isFinite(v)||(positive?v<=0:v<0)) throw new ApiError(422,`${key} must be finite and ${positive?'> 0':'>= 0'}`);
    opts[key]=v;
  }
  if(opts.coordinate_epsilon!==undefined&&opts.distance_error_bound!==undefined&&!Number.isFinite(2*opts.coordinate_epsilon+opts.distance_error_bound)) throw new ApiError(422,'Coordinate robustness budget overflows');
  return opts;
}

export function attachRadius(map, baseline, opts) {
  try {
    if(baseline) {
      const comparison=radiusTransition(baseline,map,opts);
      map.radius_profile=comparison.after;
      return comparison;
    }
    map.radius_profile=radiusProfile(map,opts);
    return null;
  } catch(e) {
    throw new ApiError(409,`radius diagnostic correspondence failed: ${e.message}`);
  }
}

// Read-time enrichment must not make a legacy record unreadable. Report an
// unavailable diagnostic explicitly; mutation/preview paths still fail closed.
export function radiusForRead(map) {
  if(map.radius_profile || !map.frame_id || !map.names || !map.pts_full) return map;
  try { return {...map,radius_profile:radiusProfile(map)}; }
  catch(e) { return {...map,radius_profile_unavailable:{reason:e.message,diagnostic_only:true}}; }
}
