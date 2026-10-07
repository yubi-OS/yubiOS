import { handleOracleRequest } from "./jev-spectral.js";
import { standardize as edgeStandardize, measure as edgeMeasure } from "./jev-edge-standard.js";
import * as tasteMath from "./jev-taste-math.js";
const W = 128, H = 128, R = 3;
const gray = new Uint8Array(W * H);
const h = 96 * Math.sqrt(3) / 2;
const A = [63.5, 16], B = [63.5 - 48, 16 + h], C = [63.5 + 48, 16 + h];
const verts = new Set();
const rec = (a, b, c, d) => {
  if (d < 0) return;
  for (const p of [a, b, c]) verts.add(p[0].toFixed(4) + "," + p[1].toFixed(4));
  if (d === 0) return;
  const ab = [(a[0]+b[0])/2, (a[1]+b[1])/2], ac = [(a[0]+c[0])/2, (a[1]+c[1])/2], bc = [(b[0]+c[0])/2, (b[1]+c[1])/2];
  rec(a, ab, ac, d-1); rec(ab, b, bc, d-1); rec(ac, bc, c, d-1);
};
rec(A, B, C, 3);
for (const v of verts) {
  const [cx, cy] = v.split(",").map(Number);
  for (let y = Math.max(0, Math.floor(cy - R - 2)); y <= Math.min(H - 1, Math.ceil(cy + R + 2)); y++)
    for (let x = Math.max(0, Math.floor(cx - R - 2)); x <= Math.min(W - 1, Math.ceil(cx + R + 2)); x++)
      if ((x-cx)**2 + (y-cy)**2 <= R*R) gray[y*W + x] = 255;
}
const b64 = Buffer.from(gray).toString("base64");
const req = new Request("https://x/api/jev/corpus/oracle", { method: "POST", body: JSON.stringify({ gray_b64: b64, width: W, height: H, walkers: 64, seed: 42 }) });
const ctx = {
  edgeStandardize, edgeMeasure, tasteMath,
  recordRun: async (kind, hash, result, notes) => ({ run_id: "cr_test" }),
  sha256hex: async (s) => "fakehash",
  canonicalJson: (v) => JSON.stringify(v),
};
try {
  const out = await handleOracleRequest(req, ctx);
  console.log("status:", out.status);
  console.log("body:", JSON.stringify(out.body).slice(0, 700));
} catch (e) {
  console.log("THREW:", e && (e.stack || e.message || String(e)));
}
