// Generates RADIUS NETWORK FIXTURES (test doubles) for radius-browser-test.mjs.
//
// SCOPE OF THIS FIXTURE — read before trusting any number below.
//
// Unlike browser-tests/make-fixtures.mjs, which drives the REAL pointmap.js core,
// this generator does NOT run the backend radius module: that module is the
// parent's to write, and it does not exist in this subagent's tree. Every
// radius_profile / radius_comparison block emitted here is therefore an EXPLICIT,
// HAND-SCOPED contract double whose only job is to exercise the UI's rendering
// branches deterministically and offline.
//
// What IS honest here:
//   * the arithmetic. I(r), isolated_fraction, area and mean_area are computed
//     from the clearance arrays by the same definitions the research report
//     states: I(r) = #{i : r <= c_i}, S_R = sum_i min(R, c_i), mean = S_R / N.
//     So the emitted profiles really are non-increasing in r and really are
//     internally consistent.
//   * the interval shapes. The open/closed pattern and the near-canonical
//     boundary distances are taken from the measured local prototype
//     (session/landau-wayfinder-research-2026-09-13/radius-interval-results.json):
//     cycle 6 produced a lower-OPEN interval whose lower end sits 0.00044 above
//     the canonical radius, cycle 9/10 produced lower-CLOSED intervals pinned to
//     the domain end r=0. Both patterns are reproduced.
//
// What is NOT honest here, and must not be reported as evidence:
//   * the clearance values, item names, witness pairs and counts are invented to
//     cover the branches. They are not measurements of any real corpus.
//   * no live API was contacted. The deployed worker is never touched by this
//     script or by the test that consumes it.
//
// The live verification against the real backend module and the real API is the
// PARENT's job. Nothing in this file constitutes that verification.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const CANONICAL = 0.095;
const DOMAIN = [0, 2];
const GRID = [0.075, 0.085, 0.095, 0.105, 0.115];

const SCOPE_PROFILE =
  "Exact frozen-coordinate radius sensitivity on the pinned frame. Diagnostic only: not a confidence interval, not a significance test, not a quality score, and not a prospective forecast. The canonical radius 0.095 is fixed; this grid is predeclared and no radius was selected after seeing the numbers. Domain r = 0..2 chord units.";
const SCOPE_COMPARISON =
  "Retrospective radius comparison: the candidate text is already embedded, so both sides are computed states rather than a pre-edit prediction. Agreement with a predicted delta is not evidence of improved forecasting. Diagnostic only; the operative reading stays the canonical radius 0.095.";

// ---- the arithmetic (the only genuinely computed part) ---------------------

const I = (cl, r) => cl.filter((c) => r <= c).length;
const area = (cl, R) => cl.reduce((s, c) => s + Math.min(R, c), 0);

function profile(cl, names, bounds) {
  const n = cl.length;
  return {
    version: "radius/1",
    canonical_radius: CANONICAL,
    domain: DOMAIN.slice(),
    radii: GRID.slice(),
    canonical_isolated: I(cl, CANONICAL),
    n,
    samples: GRID.map((r) => ({
      radius: r,
      isolated: I(cl, r),
      isolated_fraction: I(cl, r) / n,
      area: area(cl, r),
      mean_area: area(cl, r) / n,
    })),
    per_item: names.map((row, i) => ({
      name: row.name,
      nearest_name: row.nearest_name,
      nearest_ties: row.nearest_ties || [],
      clearance: cl[i],
      isolated_at_canonical: CANONICAL <= cl[i],
      robustness: row.robustness || {
        status: bounds ? "conditional" : "not-claimed",
        reason: bounds
          ? "conditional on the caller-supplied, unvalidated coordinate bounds"
          : "no bounds were supplied, so no robustness verdict is claimed",
      },
    })),
    bounds,
    scope: SCOPE_PROFILE,
  };
}

function comparison(before, after, exact, sameSign) {
  return {
    version: "radius/1",
    canonical_radius: CANONICAL,
    canonical_delta: I(after, CANONICAL) - I(before, CANONICAL),
    samples: GRID.map((r) => ({
      radius: r,
      before: I(before, r),
      after: I(after, r),
      delta: I(after, r) - I(before, r),
    })),
    exact_delta_interval: exact,
    same_sign_interval: sameSign,
    retrospective: true,
    scope: SCOPE_COMPARISON,
  };
}

const BOUNDS = {
  coordinate_epsilon: 1e-9,
  distance_error_bound: 2e-9,
  validated: false,
  certified: false,
};

// ---- the clearance ladders ------------------------------------------------
// 14 items so the ladder lines up with the existing 14-document fixture corpus.

const BEFORE = [0.04, 0.07, 0.08, 0.09, 0.094, 0.0952, 0.096, 0.1, 0.104, 0.11, 0.12, 0.15, 0.2, 0.3];
const nm = (i) => `line:${i}`;
const baseRows = BEFORE.map((_, i) => ({ name: nm(i), nearest_name: nm((i + 1) % BEFORE.length) }));

// ADD: one new isolated document. delta = +1 on [0, 0.0975], 0 above.
// Lower end is the DOMAIN boundary and is therefore CLOSED — the cycle 9/10 shape.
const ADD_NAME = "skills/new-candidate/SKILL.md";
const ADD_AFTER = [...BEFORE, 0.0975];
const ADD_ROWS = [
  ...baseRows,
  { name: ADD_NAME, nearest_name: nm(5), nearest_ties: [nm(5), nm(6)], robustness: { status: "conditional", margin_to_canonical: 0.0025 } },
];
const ADD_INTERVAL = {
  lower: 0,
  upper: 0.0975,
  lower_closed: true,
  upper_closed: true,
  lower_boundary: {
    domain_boundary: true,
    witnesses: [],
    total: 0,
    shown: 0,
  },
  upper_boundary: {
    domain_boundary: false,
    witnesses: [{ side: "after", name: ADD_NAME, nearest_name: nm(5), clearance: 0.0975 }],
    total: 1,
    shown: 1,
  },
};

// CHANGE: one point moves. It gains isolation at small r and loses it at the
// canonical radius, so the SIGN REVERSES across the predeclared grid — the
// cycle 6 shape, with a lower-OPEN interval whose lower end sits just below the
// canonical radius. The witness budget is deliberately truncated (shown < total).
const CHANGE_NAME = nm(3);
const CHANGE_AFTER = BEFORE.map((c, i) => (i === 1 ? 0.076 : i === 6 ? 0.09 : c));
const CHANGE_ROWS = baseRows.map((r, i) =>
  i === 3
    ? { ...r, nearest_name: nm(6), nearest_ties: [nm(6)], robustness: { status: "conditional", margin_to_canonical: 0.001 } }
    : r
);
const CHANGE_INTERVAL = {
  lower: 0.09,
  upper: 0.096,
  lower_closed: false,
  upper_closed: true,
  lower_boundary: {
    domain_boundary: false,
    witnesses: [
      { side: "after", name: nm(6), nearest_name: nm(3), clearance: 0.09 },
      { side: "after", name: nm(3), nearest_name: nm(6), clearance: 0.09 },
    ],
    total: 4,
    shown: 2,
  },
  upper_boundary: {
    domain_boundary: false,
    witnesses: [{ side: "before", name: nm(6), nearest_name: nm(7), clearance: 0.096 }],
    total: 1,
    shown: 1,
  },
};

// DOMAIN-UPPER: the same-sign interval runs to the far end of the declared
// domain, so the UPPER end is a domain boundary with no witness pair.
const DOMAIN_NAME = "refs/domain-end-candidate.md";
const DOMAIN_AFTER = [...BEFORE.slice(0, 13), 0.45];
const DOMAIN_ROWS = baseRows.map((r, i) => (i === 13 ? { ...r, name: DOMAIN_NAME } : r));
const DOMAIN_INTERVAL = {
  lower: 0.2,
  upper: 2,
  lower_closed: false,
  upper_closed: true,
  lower_boundary: {
    domain_boundary: false,
    witnesses: [{ side: "before", name: nm(13), nearest_name: nm(0), clearance: 0.2 }],
    total: 1,
    shown: 1,
  },
  upper_boundary: {
    domain_boundary: true,
    witnesses: [],
    total: 0,
    shown: 0,
  },
};

// XSS: markup in every string the radius UI renders — item name, nearest name,
// tie name, witness name, robustness status and scope.
const XSS = '<img src=x onerror="window.__pwned=1">';
const XSS_NAME = `refs/${XSS}.md`;
const XSS_ROWS = baseRows.map((r, i) =>
  i === 0
    ? {
        name: XSS_NAME,
        nearest_name: `<script>window.__pwned2=1</script>`,
        nearest_ties: [`<svg onload="window.__pwned3=1">`],
        robustness: { status: `<b onmouseover="window.__pwned4=1">conditional</b>` },
      }
    : r
);
const XSS_AFTER = [...BEFORE];
const XSS_INTERVAL = {
  lower: 0.09,
  upper: 0.096,
  lower_closed: false,
  upper_closed: true,
  lower_boundary: {
    domain_boundary: false,
    witnesses: [{ side: `<i onerror="window.__pwned5=1">after</i>`, name: XSS_NAME, nearest_name: XSS, clearance: 0.09 }],
    total: 2,
    shown: 1,
  },
  upper_boundary: { domain_boundary: false, witnesses: [{ side: "before", name: XSS, nearest_name: XSS, clearance: 0.096 }], total: 1, shown: 1 },
};

// NO-BOUNDS: a profile that carries no bounds block at all, so the UI must
// refuse to claim any robustness verdict.
const NOBOUNDS_NAME = "refs/no-bounds-candidate.md";
const NOBOUNDS_ROWS = [...baseRows, { name: NOBOUNDS_NAME, nearest_name: nm(2) }];

const out = {
  _fixture:
    "TEST DOUBLE — hand-scoped radius contract fixtures for radius-browser-test.mjs. The arithmetic (I(r), area, mean_area, fractions) is computed by the stated definitions and is internally consistent; the clearances, names and witness pairs are invented to cover UI branches and are NOT measurements. The backend radius module is the parent's and was never executed here. No live API was contacted.",
  canonical_radius: CANONICAL,
  domain: DOMAIN,
  grid: GRID,
  baseline_names: BEFORE.map((_, i) => nm(i)),
  baseline_profile: profile(BEFORE, baseRows, BOUNDS),
  scenarios: {
    // profile present + ADD, closed lower end at the domain boundary
    [ADD_NAME]: {
      action: "add",
      map_profile: profile(ADD_AFTER, ADD_ROWS, BOUNDS),
      radius_comparison: comparison(BEFORE, ADD_AFTER, ADD_INTERVAL, ADD_INTERVAL),
    },
    // CHANGE, open lower end, sign reversal across the grid, shown < total
    [CHANGE_NAME]: {
      action: "change",
      map_profile: profile(CHANGE_AFTER, CHANGE_ROWS, BOUNDS),
      radius_comparison: comparison(BEFORE, CHANGE_AFTER, CHANGE_INTERVAL, CHANGE_INTERVAL),
    },
    // interval running to the declared domain end r = 2
    [DOMAIN_NAME]: {
      action: "add",
      map_profile: profile(DOMAIN_AFTER, DOMAIN_ROWS, BOUNDS),
      radius_comparison: comparison(BEFORE, DOMAIN_AFTER, DOMAIN_INTERVAL, DOMAIN_INTERVAL),
    },
    // markup in every rendered string
    [XSS_NAME]: {
      action: "add",
      map_profile: profile(XSS_AFTER, XSS_ROWS, BOUNDS),
      radius_comparison: comparison(BEFORE, XSS_AFTER, XSS_INTERVAL, XSS_INTERVAL),
    },
    // no bounds block at all -> no robustness verdict may be claimed
    [NOBOUNDS_NAME]: {
      action: "add",
      map_profile: profile([...BEFORE, 0.0975], NOBOUNDS_ROWS, undefined),
      radius_comparison: comparison(BEFORE, [...BEFORE, 0.0975], ADD_INTERVAL, ADD_INTERVAL),
    },
    // legacy / local-synthetic: NO radius_profile and NO radius_comparison
    "refs/legacy-no-profile.md": {
      action: "add",
      map_profile: null,
      radius_comparison: null,
    },
  },
  names: {
    add: ADD_NAME,
    change: CHANGE_NAME,
    domain: DOMAIN_NAME,
    xss: XSS_NAME,
    nobounds: NOBOUNDS_NAME,
    legacy: "refs/legacy-no-profile.md",
  },
};

fs.writeFileSync(path.join(here, "radius-fixtures.json"), JSON.stringify(out, null, 1));

for (const [k, v] of Object.entries(out.scenarios)) {
  if (!v.radius_comparison) { console.log(`${k}: no profile (legacy branch)`); continue; }
  const s = v.radius_comparison.samples.map((x) => `${x.radius}:${x.delta >= 0 ? "+" : ""}${x.delta}`).join(" ");
  const iv = v.radius_comparison.exact_delta_interval;
  console.log(`${k}\n  deltas   ${s}\n  canonical ${v.radius_comparison.canonical_delta}  interval ${iv.lower_closed ? "[" : "("}${iv.lower}, ${iv.upper}]`);
}
console.log("radius-fixtures.json bytes:", fs.statSync(path.join(here, "radius-fixtures.json")).size);
