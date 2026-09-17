// lib/placement.mjs — where did the candidate actually land? (placement/1)
//
// Rounds 5/6 (2026-09-17) showed the gap: an ADD rung predicts "isolated -1"
// but nothing told the operator whether the authored document actually
// acquired the rung's bit pattern, landed in the named sector, or reached the
// isolate it was supposed to join; the loop kept re-adding into the same
// sector. This module answers those three questions after the fact, from the
// frozen frame's own coordinates. It is a reading of achieved geometry, not
// a score, and it never authorizes a keep or revert.
const ISO_RADIUS = 0.095;
const SECTORS = 12;
function chord(a, b) { let s = 0; for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s); }
function sectorOf(p) { const phi = Math.atan2(p[1], p[0]); let idx = Math.floor(((phi + Math.PI) / (2 * Math.PI)) * SECTORS); if (idx >= SECTORS) idx = SECTORS - 1; if (idx < 0) idx = 0; return idx + 1; }
function isolatedNames(map) { const P = map.pts_full, N = map.names; return N.filter((_, i) => !P.some((q, j) => j !== i && chord(P[i], q) < ISO_RADIUS)); }

export function validateRung(rung, d) {
  if (rung === undefined || rung === null) return null;
  if (typeof rung !== 'object' || Array.isArray(rung)) throw new RangeError('rung must be an object (the ladder rung you are executing)');
  const out = {};
  const pat = rung.pattern ?? rung.target_pattern;
  if (pat !== undefined) { if (!Array.isArray(pat) || pat.length !== d || pat.some((b) => b !== 0 && b !== 1)) throw new RangeError(`rung.pattern must be ${d} bits of 0/1`); out.pattern = pat.slice(); }
  if (rung.sector !== undefined) { if (!Number.isInteger(rung.sector) || rung.sector < 1 || rung.sector > SECTORS) throw new RangeError('rung.sector must be 1..12'); out.sector = rung.sector; }
  if (rung.joins !== undefined) { if (!Array.isArray(rung.joins) || rung.joins.some((n) => typeof n !== 'string')) throw new RangeError('rung.joins must be string[]'); out.joins = rung.joins.slice(); }
  if (rung.flip_bit !== undefined) { if (!Number.isInteger(rung.flip_bit) || rung.flip_bit < 0 || rung.flip_bit >= d) throw new RangeError('rung.flip_bit out of range'); out.flip_bit = rung.flip_bit; }
  if (rung.rung_key !== undefined) out.rung_key = String(rung.rung_key).slice(0, 200);
  if (rung.delta && Number.isFinite(rung.delta.isolated_delta)) out.predicted_isolated_delta = rung.delta.isolated_delta;
  return out;
}

/** placement(baseline, after, targetName, action, rung?) */
export function placement(baseline, after, targetName, action, rung) {
  const j = after.names.indexOf(targetName);
  if (j < 0) return { available: false, reason: 'target not present in the after map' };
  const d = after.bits[j].length;
  const p = after.pts_full[j];
  const degree = after.pts_full.reduce((a, q, k) => a + (k !== j && chord(p, q) < ISO_RADIUS ? 1 : 0), 0);
  const neighbours = after.names.filter((_, k) => k !== j && chord(p, after.pts_full[k]) < ISO_RADIUS);
  const isoBefore = new Set(isolatedNames(baseline)), isoAfter = new Set(isolatedNames(after));
  const deisolated = [...isoBefore].filter((n) => !isoAfter.has(n) && n !== targetName);
  const newlyIsolated = [...isoAfter].filter((n) => !isoBefore.has(n) && n !== targetName);
  const out = {
    version: 'placement/1', target: targetName, action,
    achieved_bits: after.bits[j].slice(), achieved_sector: sectorOf(p), degree, neighbours: neighbours.slice(0, 12), neighbours_total: neighbours.length,
    target_isolated: degree === 0,
    deisolated_items: deisolated, newly_isolated_items: newlyIsolated,
    scope: 'achieved geometry on the frozen frame; a match with the rung is an instrumentation outcome, not a quality statement; neither landing nor missing authorizes keeping or reverting',
  };
  if (action === 'change') {
    const i = baseline.names.indexOf(targetName);
    if (i >= 0) { out.previous_bits = baseline.bits[i].slice(); out.bits_flipped = out.previous_bits.map((b, k) => b !== out.achieved_bits[k] ? k : -1).filter((k) => k >= 0); out.previous_sector = sectorOf(baseline.pts_full[i]); }
  }
  if (rung) {
    const r = {};
    if (rung.pattern) { const ham = rung.pattern.reduce((a, b, k) => a + (b !== out.achieved_bits[k] ? 1 : 0), 0); r.pattern = rung.pattern; r.hamming_to_pattern = ham; r.landed = ham === 0 ? 'on-pattern' : ham <= 2 ? 'near-pattern' : 'missed-pattern'; }
    if (rung.sector !== undefined) { r.target_sector = rung.sector; r.sector_match = rung.sector === out.achieved_sector; }
    if (rung.joins) { r.joins_intended = rung.joins; r.joins_realised = rung.joins.filter((n) => deisolated.includes(n) || neighbours.includes(n)); r.joins_missed = rung.joins.filter((n) => !(deisolated.includes(n) || neighbours.includes(n))); }
    if (rung.flip_bit !== undefined && out.previous_bits) { r.flip_bit = rung.flip_bit; r.flip_realised = out.previous_bits[rung.flip_bit] === 0 && out.achieved_bits[rung.flip_bit] === 1; }
    if (rung.predicted_isolated_delta !== undefined) { const actual = isoAfter.size - isoBefore.size; r.predicted_isolated_delta = rung.predicted_isolated_delta; r.actual_isolated_delta = actual; r.sign_exact = Math.sign(actual) === Math.sign(rung.predicted_isolated_delta); }
    if (rung.rung_key) r.rung_key = rung.rung_key;
    r.verdict = r.landed === 'on-pattern' && (r.joins_missed === undefined || r.joins_missed.length === 0) ? 'realised' : (r.landed === 'missed-pattern' || (r.joins_missed && r.joins_missed.length && !(r.joins_realised && r.joins_realised.length))) ? 'missed' : 'partial';
    r.verdict_note = 'realised/partial/missed describe whether the authored text produced the geometry the rung asked for. A missed rung should not be re-proposed as a fresh ADD in the same sector; revise the document toward joins_missed or record the rung as content-resistant.';
    out.rung = r;
  }
  return out;
}
