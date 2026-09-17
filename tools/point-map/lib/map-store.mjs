// lib/map-store.mjs — stored-map persistence with KV overflow (limits/2).
// A map_json under D1_MAP_JSON_LIMIT is stored inline in the `maps` row as
// before. A larger one is written to SITE KV under `map-json:<id>` and the
// row holds a small pointer {"__kv":"map-json:<id>","bytes":N}. Readers see
// the identical decoded object either way. No frame, number or diagnostic is
// altered; this only changes where the bytes live.
import { ApiError } from './http.mjs';
import { encodeMap, decodeMap } from './map-storage.mjs';
import { D1_MAP_JSON_LIMIT, KV_MAP_JSON_LIMIT } from './limits.mjs';

export const MAPS_DDL = `CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, rule_hash TEXT, seed INTEGER, n INTEGER, dim INTEGER, d INTEGER, v2 REAL, z_null REAL, verdict TEXT, classes INTEGER, identity_failures INTEGER, measurement_red INTEGER, source TEXT, map_json TEXT)`;

export function metricsOf(map, source) {
  return [new Date().toISOString(), map.rule_hash ?? map.frame_id ?? null, map.seed ?? null, map.n ?? (map.names ? map.names.length : null), map.D ?? null, map.d ?? null,
    map.V2 ?? map.v2 ?? null, map.null && map.null.z != null ? map.null.z : null, map.null && map.null.verdict ? map.null.verdict : (map.verdict ?? null),
    map.classes ?? null, map.identity_failures ?? (map.certificates ? map.certificates.filter((c) => c.class === 'identity' && !c.ok).length : null),
    map.measurement_red ?? (map.certificates ? map.certificates.filter((c) => c.class === 'measurement' && !c.ok).length : null), source ?? null];
}

/** Returns the new row id. Throws ApiError(413) only if the encoded map exceeds the KV limit too. */
export async function saveStoredMap(db, env, map, source) {
  const json = encodeMap(map, { limit: KV_MAP_JSON_LIMIT });
  const bytes = new TextEncoder().encode(json).length;
  const m = metricsOf(map, source);
  const insert = async (mapJson) => {
    const ins = await db.prepare(`INSERT INTO maps (created_at, rule_hash, seed, n, dim, d, v2, z_null, verdict, classes, identity_failures, measurement_red, source, map_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...m, mapJson).run();
    return ins?.meta?.last_row_id ?? (await db.prepare(`SELECT MAX(id) AS mid FROM maps`).first())?.mid;
  };
  if (bytes <= D1_MAP_JSON_LIMIT) return insert(json);
  if (!env || !env.SITE) throw new ApiError(413, `map is ${bytes} bytes, above the D1 inline limit, and no KV overflow store is available; use persist:false`);
  const id = await insert(JSON.stringify({ __kv_pending: true, bytes }));
  const key = `map-json:${id}`;
  try {
    await env.SITE.put(key, json);
    await db.prepare(`UPDATE maps SET map_json = ? WHERE id = ?`).bind(JSON.stringify({ __kv: key, bytes, storage: 'kv-overflow/1' }), Number(id)).run();
  } catch (e) {
    throw new ApiError(503, `map row ${id} was created but its overflow body could not be stored: ${e?.message || e}`);
  }
  return id;
}

/** Returns the decoded map or null when the row does not exist. */
export async function loadStoredMapJson(db, env, id) {
  const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(id)).first();
  if (!row) return null;
  let parsed; try { parsed = JSON.parse(row.map_json); } catch { throw new ApiError(500, `stored map ${id} is not valid JSON`); }
  if (parsed && parsed.__kv_pending) throw new ApiError(409, `stored map ${id} has no body yet (overflow write incomplete)`);
  if (parsed && parsed.__kv) {
    if (!env || !env.SITE) throw new ApiError(503, `stored map ${id} lives in KV overflow but no KV binding is available`);
    const body = await env.SITE.get(parsed.__kv, 'text');
    if (!body) throw new ApiError(503, `stored map ${id} overflow body ${parsed.__kv} is missing from KV`);
    return decodeMap(body);
  }
  return decodeMap(parsed);
}
