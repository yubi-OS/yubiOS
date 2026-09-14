// browser-tests/radius-server.mjs — LOCAL TEST DOUBLE for radius-browser-test.mjs.
//
// Separate from browser-tests/server.mjs on purpose: the existing 59-test suite
// must keep running against its own unchanged server, so nothing here can weaken
// it. This server serves the same local files and the same base envelopes from
// fixtures.json, then attaches the radius contract blocks from
// radius-fixtures.json, selected per scenario by the candidate's target name.
//
// This is NOT the production worker, and the radius blocks are NOT produced by
// the backend radius module (which is the parent's). See make-radius-fixtures.mjs
// for the full scope statement. The live check is the parent's job.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const fx = JSON.parse(fs.readFileSync(path.join(here, "fixtures.json"), "utf8"));
const rfx = JSON.parse(fs.readFileSync(path.join(here, "radius-fixtures.json"), "utf8"));

export function startRadiusServer(port = 0) {
  const state = { requests: [], attachBaselineProfile: true };

  const file = (rel, type) => ({ body: fs.readFileSync(path.join(root, rel)), type });
  const send = (res, status, type, body) => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const p = url.pathname;
    state.requests.push({ method: req.method, path: p });

    // test control plane (never part of the product)
    if (p === "/__test/baseline-profile") {
      state.attachBaselineProfile = url.searchParams.get("on") !== "0";
      return send(res, 200, "text/plain", "ok");
    }

    if (p === "/" || p === "/index.html") { const f = file("home.html", "text/html; charset=utf-8"); return send(res, 200, f.type, f.body); }
    if (p === "/AGENT.md") { const f = file("AGENT.md", "text/markdown; charset=utf-8"); return send(res, 200, f.type, f.body); }
    if (p === "/map" || p === "/map/") { const f = file("index.html", "text/html; charset=utf-8"); return send(res, 200, f.type, f.body); }
    if (p === "/map/app.js") { const f = file("app.js", "text/javascript; charset=utf-8"); return send(res, 200, f.type, f.body); }
    if (p === "/map/pointmap.js") { const f = file("pointmap.js", "text/javascript; charset=utf-8"); return send(res, 200, f.type, f.body); }

    if (req.method === "POST" && (p === "/api/map" || p === "/api/map/preview")) {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch { return send(res, 400, "application/json", JSON.stringify({ error: "bad json" })); }
        state.requests[state.requests.length - 1].body = body;

        if (p === "/api/map") {
          // The SAVED map carries a radius_profile so the map card's present
          // branch is exercised; with ?on=0 it does not, so the legacy branch is.
          const out = JSON.parse(JSON.stringify(fx.map_response));
          if (state.attachBaselineProfile) out.map.radius_profile = rfx.baseline_profile;
          return send(res, 200, "application/json", JSON.stringify(out));
        }

        // Mirror the real route's refusals so the UI meets the same guards.
        for (const k of ["frame", "d", "K", "T", "seed", "steps", "threshold", "labels", "vectors", "persist"]) {
          if (body[k] !== undefined) return send(res, 409, "application/json", JSON.stringify({ error: `preview inherits the baseline's frozen frame and settings; remove ${k} from the request` }));
        }
        if (!body.target || (body.target.action !== "add" && body.target.action !== "change")) {
          return send(res, 422, "application/json", JSON.stringify({ error: "target.action must be 'add' or 'change'" }));
        }

        const name = String(body.target.name || "");
        const base = body.target.action === "add" ? fx.preview_add : fx.preview_change_unchanged;
        const out = JSON.parse(JSON.stringify(base));
        out.target = { ...out.target, name, action: body.target.action };

        const sc = rfx.scenarios[name];
        if (sc && sc.map_profile) out.map.radius_profile = sc.map_profile;
        else delete out.map.radius_profile;                       // legacy / no-profile branch
        if (sc && sc.radius_comparison) out.radius_comparison = sc.radius_comparison;
        else delete out.radius_comparison;

        return send(res, 200, "application/json", JSON.stringify(out));
      });
      return;
    }

    return send(res, 404, "text/plain", "not found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, state, port: server.address().port }));
  });
}

if (process.argv[1] && process.argv[1].endsWith("radius-server.mjs")) {
  startRadiusServer(8788).then(({ port }) => console.log("radius fixture server on http://127.0.0.1:" + port));
}
