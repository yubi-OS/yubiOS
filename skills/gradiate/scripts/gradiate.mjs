#!/usr/bin/env node
// gradiate: build a layered CSS background and a copy-out prompt with the Steady Orbit
// Gradient Designer's own CSS and prompt functions. No dependencies. Needs Node 18+.
//
//   node gradiate.mjs spec.json [--sel .gradient-bg] [--fmt hex] [--out DIR]
//   node gradiate.mjs --sample
//
// Spec: { "base": "#0B1026",
//         "layers": [ { "type": "linear", "angle": 90,
//                       "stops": [["#DB46F5", 0.4, 0], ["#DB46F5", 0, 50], ["#5FD9F2", 0.4, 100]] } ],
//         "noise": { "on": false } }
// Each stop is [hex color, alpha 0..1, position 0..100]. The first layer is the top layer.
// Set GRADIATE_DESIGNER_URL to point at another copy of the designer page.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const DESIGNER_URL = process.env.GRADIATE_DESIGNER_URL || 'https://steadyorbitsystems.com/radiant/';
const FORMATS = ['hex', 'rgb', 'hsl', 'oklch'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const SAMPLE_SPEC = {
  base: '#0B1026',
  layers: [
    { type: 'linear', angle: 90, stops: [['#DB46F5', 0.4, 0], ['#DB46F5', 0, 50], ['#5FD9F2', 0.4, 100]] },
    { type: 'linear', angle: 180, stops: [['#FFC857', 0.4, 0], ['#FFC857', 0, 50], ['#DB46F5', 0.4, 100]] },
  ],
  noise: { on: false },
};

export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('spec must be a JSON object');
  if (!HEX.test(spec.base || '')) throw new Error('base must be a 6-digit hex color, e.g. #0B1026');
  const layers = spec.layers || [];
  if (!layers.length || layers.length > 6) throw new Error('use 1 to 6 layers');
  layers.forEach((l, i) => {
    if (!['linear', 'radial', 'conic'].includes(l.type)) throw new Error(`layer ${i}: type must be linear, radial, or conic`);
    if (!Array.isArray(l.stops) || l.stops.length < 2 || l.stops.length > 8) throw new Error(`layer ${i}: use 2 to 8 stops`);
    for (const s of l.stops) {
      if (!Array.isArray(s) || s.length !== 3) throw new Error(`layer ${i}: each stop is [hex, alpha, position]`);
      const [c, a, p] = s;
      if (!HEX.test(c)) throw new Error(`layer ${i}: stop color ${c} is not a 6-digit hex color`);
      if (!(a >= 0 && a <= 1)) throw new Error(`layer ${i}: alpha must be between 0 and 1`);
      if (!(p >= 0 && p <= 100)) throw new Error(`layer ${i}: position must be between 0 and 100`);
    }
  });
}

// The designer page carries its component script inside a JSON-escaped copy of its markup.
// Read that copy when present; otherwise read the page directly.
export async function fetchDesignerScript(url = DESIGNER_URL) {
  const res = await fetch(url, { headers: { 'user-agent': 'gradiate/1.0' } });
  if (!res.ok) throw new Error(`designer fetch failed: HTTP ${res.status} at ${url}`);
  let html = await res.text();
  const line = html.split('\n').find((l) => l.startsWith('"<!DOCTYPE html>'));
  if (line) html = JSON.parse(line.trim().replace(/,$/, ''));
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('designer script not found: the page layout may have changed');
  return m[1];
}

function methodSource(dc, name) {
  const m = new RegExp('\\n  ' + name + '\\(').exec(dc);
  if (!m) throw new Error(`designer method not found: ${name}`);
  const start = m.index + 1;
  const end = dc.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`could not find the end of designer method ${name}`);
  return dc.slice(start, end + 5).replace(/\s+$/, '');
}

export function buildFromDesignerSource(dc, spec, { sel = '.gradient-bg', fmt = 'hex' } = {}) {
  validateSpec(spec);
  if (!FORMATS.includes(fmt)) throw new Error(`--fmt must be one of: ${FORMATS.join(', ')}`);
  const helpers = dc.slice(dc.indexOf('const uid'), dc.indexOf('\nclass '));
  const methods = [methodSource(dc, 'buildCss'), methodSource(dc, 'buildPrompt')].join(',\n');
  const layerCalls = spec.layers.map(({ type, stops, ...opts }) =>
    `mkL(${JSON.stringify(type)}, ${JSON.stringify(opts)}, ${JSON.stringify(stops)})`);
  const program = helpers + '\nvar __obj = {\n' + methods + '\n};\n' +
    `var __doc = mkDoc(${JSON.stringify(spec.base)}, [${layerCalls.join(', ')}], ${JSON.stringify(spec.noise || { on: false })});\n`;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(program, ctx, { timeout: 2000 });
  const stub = { state: { W: 1365, H: 800 } };
  const css = ctx.__obj.buildCss.call(stub, ctx.__doc, fmt, sel);
  const prompt = ctx.__obj.buildPrompt.call(stub, css, ctx.__doc, sel);
  return { css, prompt };
}

export async function buildGradient(spec, opts = {}) {
  const dc = opts.dcSource || (await fetchDesignerScript(opts.url));
  return buildFromDesignerSource(dc, spec, opts);
}

function parseArgs(argv) {
  const o = { spec: null, sel: '.gradient-bg', fmt: 'hex', out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sel') o.sel = argv[++i];
    else if (a === '--fmt') o.fmt = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (!o.spec) o.spec = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return o;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--sample')) {
    process.stdout.write(JSON.stringify(SAMPLE_SPEC, null, 2) + '\n');
    return;
  }
  const opts = parseArgs(argv);
  if (!opts.spec) throw new Error('usage: node gradiate.mjs spec.json [--sel .gradient-bg] [--fmt hex] [--out DIR]');
  const spec = JSON.parse(fs.readFileSync(opts.spec, 'utf8'));
  const { css, prompt } = await buildGradient(spec, opts);
  if (opts.out) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'gradient.css'), css.endsWith('\n') ? css : css + '\n');
    fs.writeFileSync(path.join(opts.out, 'prompt.md'), prompt.endsWith('\n') ? prompt : prompt + '\n');
    console.error(`wrote ${path.join(opts.out, 'gradient.css')} and prompt.md`);
  }
  process.stdout.write(css + '\n=====\n' + prompt + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('gradiate: ' + e.message); process.exit(1); });
}
