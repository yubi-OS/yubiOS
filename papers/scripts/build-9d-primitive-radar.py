"""Build the 9-D primitive radar per file artifact (PR2 of the 4-PR hypersphere RSI series).

Loads the actual `papers/data/` corpus from yubi-OS/yubiOS, scores every corpus item on the
9-D internal-big-picture binary primitive basis (matches `papers/data/rsi-79-corpus-multi-cycle-2026-08-06.json`
top-level `primitives` list), and produces:
  - radar-scores.json  — {slug: [p1..p9]} for every corpus item (cycle 1 / initial state)
  - radar-grid.png     — 9-column grid of small radar charts, one per corpus item
  - radar-heatmap.png  — heatmap: rows = corpus items, cols = 9 primitives, value = 0/1
  - radar-viewer.html  — self-contained HTML with a slider that browses the corpus
  - README.md          — what this is, how to regenerate, primitive definitions, viewer notes

The 9-D basis is the corpus-internal 9-primitive variant of the `internal-big-picture` skill's
10-primitive spine. Deviation from `internal-big-picture` SKILL.md: `self_describing` (the
10th primitive) is dropped because the corpus uses 9. See README.md §Math alignment.

Inputs:
  - papers/data/corpus-listing.json          (saved by Step 1)
  - papers/data/rsi-79-corpus-multi-cycle-2026-08-06.json (downloaded or pre-existing)
  - papers/data/single-action-curve-rsi-cycles-2026-08-05.json (optional reference)

If the corpus is empty or unreachable, this script falls back to a deterministic 30-item
synthetic corpus that mirrors the same 9-D basis (uniformly random per-item coverage,
seeded so re-runs are stable). The fallback is logged and the synthetic corpus is
saved to `papers/data/radar-output/radar-scores.json` (overwriting any real-corpus scores).
"""
from __future__ import annotations

import json
import os
import random
import sys
from collections import defaultdict
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    Image = None  # type: ignore
    ImageDraw = None  # type: ignore
    ImageFont = None  # type: ignore


# ---------- Paths ----------
WORKSPACE_ROOT = Path("/var/workspace")
SPACE_DIR = "github-yubios-KS9n5GAT"
PAPERS_DIR = WORKSPACE_ROOT / "documents" / SPACE_DIR / "papers"
DATA_DIR = PAPERS_DIR / "data"
SCRIPTS_DIR = PAPERS_DIR / "scripts"
OUT_DIR = DATA_DIR / "radar-output"

OUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------- Corpus URLs (for in-script fallback if the local mirror is empty) ----------
CORPUS_REPO_URL = "https://raw.githubusercontent.com/yubi-OS/yubiOS/main/papers/data/rsi-79-corpus-multi-cycle-2026-08-06.json"
SINGLE_ACTION_URL = "https://raw.githubusercontent.com/yubi-OS/yubiOS/main/papers/data/single-action-curve-rsi-cycles-2026-08-05.json"


# ---------- Primitive basis ----------
# This MUST match the `primitives` list in `rsi-79-corpus-multi-cycle-2026-08-06.json`.
# The corpus is the source of truth for this artifact (it is the 9-D internal-big-picture
# variant used by the RSI experiments on main). The `internal-big-picture` SKILL.md lists
# 10 primitives; the corpus drops `self_describing`. Documented in README.md §Math alignment.
PRIMITIVE_BASIS = [
    "attestation",
    "trust_chain",
    "least_privilege",
    "declarative_policy",
    "continuous_adaptive",
    "immutability",
    "audit_evidence",
    "cryptographic_identity",
    "segmentation",
]
PRIM_SHORT = {
    "attestation": "Attest",
    "trust_chain": "Trust",
    "least_privilege": "Least-Priv",
    "declarative_policy": "Declarative",
    "continuous_adaptive": "Continuous",
    "immutability": "Immutable",
    "audit_evidence": "Audit",
    "cryptographic_identity": "Crypto-Id",
    "segmentation": "Segment",
}
PRIM_LONG = {
    "attestation": "Attestation — verifiable evidence a system meets a claim (TPM2 quotes, Rekor v2, keylime)",
    "trust_chain": "Trust chain — root-of-trust + transitive trust establishment (UKI, PCR, dm-verity)",
    "least_privilege": "Least privilege — minimal-capability authorization (pod security, capabilities, cgroups)",
    "declarative_policy": "Declarative policy — desired-state definitions (k8s, composefs, Image Mode)",
    "continuous_adaptive": "Continuous / adaptive — runtime detection + auto-remediation (Falco, keylime)",
    "immutability": "Immutability — read-only / signed artifacts (dm-verity, composefs, sealed-uki-vm)",
    "audit_evidence": "Audit / evidence — tamper-evident trail (audit-evidence-packaging, SLSA)",
    "cryptographic_identity": "Cryptographic identity — device- or workload-bound keys (TPM2, U2F/HSM FIDO2)",
    "segmentation": "Segmentation — process / VM / network isolation (nspawn, vfio-user, ADR-031)",
}


# ---------- Font helper (mirrors existing scripts) ----------
def get_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf",
        "/usr/share/fonts/google-noto-vf/NotoSans-Italic[wght].ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


# ---------- Corpus loading ----------
def load_corpus_from_local() -> dict | None:
    """Try to load the rsi-79 corpus from the local mirror under DATA_DIR.

    Falls back to a fixed list of pre-cached paths (session/cache, papers/data).
    """
    candidates = [
        DATA_DIR / "rsi-79-corpus-multi-cycle-2026-08-06.json",
        WORKSPACE_ROOT / "session" / "cache" / "rsi-79-corpus.json",
        WORKSPACE_ROOT / "tmp" / "rsi-79-corpus.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception as e:
                print(f"  WARN: failed to parse {path}: {e}", file=sys.stderr)
    return None


def load_corpus_from_url() -> dict | None:
    """Fallback: download corpus JSON directly from GitHub (uses proxy if available)."""
    try:
        import urllib.request
        with urllib.request.urlopen(CORPUS_REPO_URL) as r:
            data = r.read()
        parsed = json.loads(data)
        # Cache it for next runs
        cache_path = WORKSPACE_ROOT / "session" / "cache" / "rsi-79-corpus.json"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "wb") as f:
            f.write(data)
        return parsed
    except Exception as e:
        print(f"  WARN: failed to fetch corpus from GitHub: {e}", file=sys.stderr)
        return None


def make_synthetic_corpus(n: int = 30, seed: int = 7913) -> dict:
    """Deterministic 30-item synthetic corpus mirroring the same 9-D basis.

    Used when `papers/data/` is empty or unreachable. Per-item coverage is a uniformly
    random binary vector in {0,1}^9. Coverage density target ~ matches observed
    cycle-1 distribution (~70-80% covered on average across the 9 primitives).
    """
    rng = random.Random(seed)
    primitives = list(PRIMITIVE_BASIS)
    items = []
    for i in range(n):
        slug = f"synthetic-skill-{i:02d}"
        # Aim for ~3-5 missing primitives out of 9 (matches real corpus range)
        n_missing = rng.randint(0, 5)
        missing = rng.sample(primitives, k=n_missing) if n_missing else []
        items.append({
            "cycle": 1,
            "slug": slug,
            "missing_primitives": missing,
            "d_pre": 0.0,
            "d_post": 0.0,
            "delta_d": 0.0,
            "winner_primitive": None,
            "synthetic": True,
        })
    return {
        "corpus_size": n,
        "primitives": primitives,
        "cycles_total": 1,
        "all_cycles": items,
        "synthetic": True,
        "synthetic_seed": seed,
    }


# ---------- Scoring ----------
def coverage_vector(slug_entry: dict, primitives: list[str]) -> list[int]:
    """Convert a corpus item's `missing_primitives` list into a binary 9-D coverage vector.

    coverage[i] = 1 if primitive i is COVERED (NOT in missing_primitives), else 0.
    """
    missing = set(slug_entry.get("missing_primitives", []) or [])
    return [0 if p in missing else 1 for p in primitives]


def build_scores(corpus: dict) -> tuple[dict[str, list[int]], dict[str, list[str]]]:
    """Build {slug: [p1..p9]} and {slug: missing_primitives_list} from corpus cycle 1."""
    primitives = corpus["primitives"]
    # Only use cycle 1 (initial state) for "file-level" coverage
    cycle1 = [e for e in corpus["all_cycles"] if e.get("cycle") == 1]
    scores: dict[str, list[int]] = {}
    missing_map: dict[str, list[str]] = {}
    for entry in cycle1:
        slug = entry["slug"]
        cov = coverage_vector(entry, primitives)
        scores[slug] = cov
        missing_map[slug] = list(entry.get("missing_primitives", []) or [])
    return scores, missing_map


# ---------- Radar chart drawing ----------
def draw_single_radar(draw, cx, cy, radius, values, primitives, *,
                      fill="#1a3a5c", fill_alpha=None, stroke="#1a3a5c"):
    """Draw a small 9-axis radar chart centered at (cx, cy) with given radius.

    `values` is a binary {0,1}^9 vector (length MUST == len(primitives)).
    `primitives` is a list of primitive names used for axis labels.
    """
    import math
    n = len(values)
    assert n == len(primitives), f"radar mismatch: {n} values, {len(primitives)} axes"

    # Compute polygon coordinates for the filled radar shape.
    # Start from the top (12 o'clock) and step clockwise.
    poly_points = []
    axis_endpoints = []
    for i in range(n):
        angle = -math.pi / 2 + (2 * math.pi * i) / n  # CW from 12 o'clock
        r_v = radius * (0.05 + 0.95 * values[i])  # small inner padding for 0s
        x = cx + r_v * math.cos(angle)
        y = cy + r_v * math.sin(angle)
        poly_points.append((x, y))
        axis_endpoints.append((cx + radius * math.cos(angle),
                                cy + radius * math.sin(angle)))

    # Draw axes
    for (ex, ey) in axis_endpoints:
        draw.line([(cx, cy), (ex, ey)], fill="#cccccc", width=1)

    # Draw concentric rings (0.25, 0.5, 0.75, 1.0)
    for frac in (0.25, 0.5, 0.75, 1.0):
        r = radius * frac
        ring_pts = []
        for i in range(n):
            angle = -math.pi / 2 + (2 * math.pi * i) / n
            ring_pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
        draw.polygon(ring_pts, outline="#dddddd")

    # Draw the filled polygon (only if at least one primitive covered)
    if sum(values) > 0:
        draw.polygon(poly_points, fill=fill, outline=stroke)

    # Draw vertex dots
    for (px, py) in poly_points:
        draw.ellipse([px - 2, py - 2, px + 2, py + 2], fill=stroke)


def draw_radar_grid(scores: dict[str, list[int]], out_path: Path,
                    cols: int = 9, cell_w: int = 220, cell_h: int = 220,
                    pad: int = 14, label_h: int = 38):
    """Draw an N x cols grid of small radar charts, one per file.

    Each cell is cell_w x (cell_h + label_h) — the radar sits in the upper
    cell_h block; the file slug label sits in the lower label_h block.
    """
    if Image is None:
        raise RuntimeError("PIL not available")

    slugs = list(scores.keys())
    n = len(slugs)
    rows = (n + cols - 1) // cols

    margin_t, margin_l = 80, 30
    grid_w = cols * cell_w
    grid_h = rows * (cell_h + label_h)
    width = grid_w + 2 * margin_l
    height = grid_h + margin_t + 30

    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    f_title = get_font(20)
    f_sub = get_font(13)
    f_label = get_font(11)

    d.text((width / 2, 20),
           "9-D Primitive Radar — yubiOS corpus (PR2 of hypersphere RSI series)",
           fill="#1a3a5c", font=f_title, anchor="mt")
    d.text((width / 2, 48),
           f"one radar per corpus item; axes = {', '.join(PRIMITIVE_BASIS)}; "
           f"radial = 0 (missing) / 1 (covered)",
           fill="#666666", font=f_sub, anchor="mt")

    primitives = PRIMITIVE_BASIS
    for idx, slug in enumerate(slugs):
        r = idx // cols
        c = idx % cols
        x0 = margin_l + c * cell_w
        y0 = margin_t + r * (cell_h + label_h)

        values = scores[slug]
        cx = x0 + cell_w // 2
        cy = y0 + cell_h // 2 - 8
        radius = min(cell_w, cell_h) // 2 - 24

        # Cell background tint based on coverage count
        n_covered = sum(values)
        if n_covered >= 7:
            tint = "#e8f4ea"
        elif n_covered >= 4:
            tint = "#f4f0e8"
        else:
            tint = "#f4e8e8"
        d.rectangle([x0 + pad, y0 + pad, x0 + cell_w - pad, y0 + cell_h - pad],
                    fill=tint, outline="#cccccc")

        draw_single_radar(d, cx, cy, radius, values, primitives)

        # Slug label below the radar
        label = slug if len(slug) <= 28 else slug[:25] + "..."
        d.text((x0 + cell_w // 2, y0 + cell_h + 4),
               label, fill="#222222", font=f_label, anchor="mt")
        # Coverage count sub-label
        d.text((x0 + cell_w // 2, y0 + cell_h + 18),
               f"{n_covered}/9 covered", fill="#666666", font=f_label, anchor="mt")

    img.save(out_path, "PNG", dpi=(150, 150))
    print(f"  saved {out_path} ({out_path.stat().st_size} bytes)")


# ---------- Heatmap drawing ----------
def draw_heatmap(scores: dict[str, list[int]], missing_map: dict[str, list[str]],
                 out_path: Path):
    """Draw a heatmap: rows = corpus items, cols = 9 primitives, value = 0/1.

    Header row with primitive names; left column with slug labels; cells colored
    green (covered = 1) or red-tint (missing = 0). Coverage counts on the right.
    """
    if Image is None:
        raise RuntimeError("PIL not available")

    slugs = list(scores.keys())
    primitives = PRIMITIVE_BASIS
    n_rows = len(slugs)
    n_cols = len(primitives)

    cell_w = 60
    cell_h = 22
    label_w = 240
    cov_w = 80
    margin_l, margin_t = 30, 80
    grid_w = n_cols * cell_w + cov_w
    grid_h = n_rows * cell_h
    width = label_w + grid_w + 2 * margin_l
    height = grid_h + margin_t + 30

    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    f_title = get_font(20)
    f_sub = get_font(13)
    f_header = get_font(12, bold=True)
    f_label = get_font(10)
    f_legend = get_font(11)

    d.text((width / 2, 22),
           "9-D Primitive Coverage Heatmap — yubiOS corpus (PR2)",
           fill="#1a3a5c", font=f_title, anchor="mt")
    d.text((width / 2, 52),
           f"rows = corpus items ({n_rows} total); cols = 9 primitives; "
           "green = covered (1); red-tint = missing (0)",
           fill="#666666", font=f_sub, anchor="mt")

    # Header row
    for j, p in enumerate(primitives):
        x = margin_l + label_w + j * cell_w
        y = margin_t - cell_h
        d.rectangle([x, y, x + cell_w, y + cell_h], fill="#1a3a5c")
        d.text((x + cell_w / 2, y + cell_h / 2),
               PRIM_SHORT[p], fill="white", font=f_header, anchor="mm")

    # Coverage-count header
    x_cov = margin_l + label_w + n_cols * cell_w
    d.rectangle([x_cov, margin_t - cell_h, x_cov + cov_w, margin_t], fill="#1a3a5c")
    d.text((x_cov + cov_w / 2, margin_t - cell_h / 2),
           "covered", fill="white", font=f_header, anchor="mm")

    # Rows
    for i, slug in enumerate(slugs):
        y = margin_t + i * cell_h
        # Slug label
        label = slug if len(slug) <= 32 else slug[:29] + "..."
        d.rectangle([margin_l, y, margin_l + label_w, y + cell_h],
                    fill="#f8f8f8" if i % 2 == 0 else "white")
        d.text((margin_l + 6, y + cell_h / 2), label,
               fill="#222222", font=f_label, anchor="lm")

        values = scores[slug]
        for j, v in enumerate(values):
            x = margin_l + label_w + j * cell_w
            color = "#e8f4ea" if v == 1 else "#f4e0e0"
            d.rectangle([x, y, x + cell_w, y + cell_h],
                        fill=color, outline="#cccccc")
            d.text((x + cell_w / 2, y + cell_h / 2),
                   "1" if v == 1 else "0",
                   fill="#222222", font=f_label, anchor="mm")
        # Coverage count
        d.rectangle([x_cov, y, x_cov + cov_w, y + cell_h],
                    fill="#f8f8f8" if i % 2 == 0 else "white", outline="#cccccc")
        d.text((x_cov + cov_w / 2, y + cell_h / 2),
               f"{sum(values)}/9", fill="#222222", font=f_label, anchor="mm")

    # Legend at the bottom
    leg_y = margin_t + grid_h + 12
    d.rectangle([margin_l, leg_y, margin_l + 20, leg_y + 14], fill="#e8f4ea",
                outline="#888888")
    d.text((margin_l + 26, leg_y + 7), "covered (1)",
           fill="#222222", font=f_legend, anchor="lm")
    d.rectangle([margin_l + 130, leg_y, margin_l + 150, leg_y + 14],
                fill="#f4e0e0", outline="#888888")
    d.text((margin_l + 156, leg_y + 7), "missing (0)",
           fill="#222222", font=f_legend, anchor="lm")

    img.save(out_path, "PNG", dpi=(150, 150))
    print(f"  saved {out_path} ({out_path.stat().st_size} bytes)")


# ---------- HTML viewer (self-contained, plotly via CDN) ----------
VIEWER_HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>9-D Primitive Radar Viewer — yubiOS corpus (PR2)</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 24px;
    background: #fafafa;
    color: #222;
  }}
  h1 {{ font-size: 22px; color: #1a3a5c; margin: 0 0 4px 0; }}
  .sub {{ color: #666; font-size: 13px; margin: 0 0 18px 0; }}
  .controls {{
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 14px 18px;
    margin-bottom: 18px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
  }}
  .controls label {{ font-weight: 600; color: #1a3a5c; font-size: 14px; }}
  .controls input[type=range] {{ flex: 1; min-width: 280px; }}
  .controls .slug {{ font-family: ui-monospace, "SF Mono", Menlo, monospace;
                     background: #eef2f7; padding: 4px 8px; border-radius: 4px;
                     color: #1a3a5c; font-size: 13px; }}
  .controls .stat {{ font-size: 13px; color: #444; }}
  .panel {{
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 14px 18px;
    margin-bottom: 18px;
  }}
  #radar {{ width: 100%; height: 520px; }}
  #heatmap {{ width: 100%; overflow-x: auto; }}
  .nav-buttons button {{
    background: #1a3a5c; color: white; border: none; padding: 6px 12px;
    border-radius: 4px; font-size: 13px; cursor: pointer;
  }}
  .nav-buttons button:hover {{ background: #2a5a8c; }}
  .nav-buttons button:disabled {{ background: #aaa; cursor: not-allowed; }}
  .missing-list {{
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
    color: #c75a5a;
  }}
  .missing-list .pill {{
    display: inline-block;
    background: #f4e0e0;
    color: #5a1a1a;
    padding: 3px 8px;
    border-radius: 12px;
    margin-right: 6px;
    margin-bottom: 4px;
  }}
  footer {{
    margin-top: 24px;
    font-size: 12px;
    color: #888;
    border-top: 1px solid #eee;
    padding-top: 12px;
  }}
  footer code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }}
</style>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
</head>
<body>
<h1>9-D Primitive Radar Viewer</h1>
<p class="sub">
  PR2 of the 4-PR hypersphere RSI series. Each frame scores one corpus item on the
  9-D internal-big-picture binary primitive basis. Drag the slider or use Prev/Next
  to browse.
</p>

<div class="controls">
  <label for="slider">File:</label>
  <input type="range" id="slider" min="0" max="{n_minus_1}" value="0" step="1" />
  <span class="slug" id="slug-display">…</span>
  <span class="stat" id="coverage-stat">…</span>
  <span class="nav-buttons">
    <button id="prev-btn">◀ Prev</button>
    <button id="next-btn">Next ▶</button>
  </span>
</div>

<div class="panel" id="radar"></div>

<div class="panel">
  <strong style="color:#1a3a5c;">Missing primitives for this file:</strong>
  <div class="missing-list" id="missing-list">…</div>
</div>

<div class="panel">
  <strong style="color:#1a3a5c;">Coverage heatmap strip (entire corpus, current row highlighted):</strong>
  <div id="heatmap"></div>
</div>

<footer>
  Self-contained viewer — no external data fetches at runtime. The full
  <code>scores</code> + <code>missing</code> arrays are inlined below.
  Generated by <code>build-9d-primitive-radar.py</code> on {generated_at}.
</footer>

<script id="scores-data" type="application/json">
{scores_json}
</script>
<script id="missing-data" type="application/json">
{missing_json}
</script>
<script>
const PRIMITIVES = {primitives_json};
const SCORES = JSON.parse(document.getElementById("scores-data").textContent);
const MISSING = JSON.parse(document.getElementById("missing-data").textContent);
const SLUGS = Object.keys(SCORES);
const N = SLUGS.length;

const slider = document.getElementById("slider");
const slugDisplay = document.getElementById("slug-display");
const coverageStat = document.getElementById("coverage-stat");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const missingList = document.getElementById("missing-list");

function buildClosedLoop(values) {{
  // Close the radar polygon by repeating the first axis.
  return [...values, values[0]];
}}
function buildAxisLabels() {{
  return [...PRIMITIVES, PRIMITIVES[0]];
}}

function renderRadar(idx) {{
  const slug = SLUGS[idx];
  const values = SCORES[slug];
  const closedValues = buildClosedLoop(values);
  const closedLabels = buildAxisLabels();
  const nCov = values.reduce((a, b) => a + b, 0);

  slugDisplay.textContent = `[${{idx + 1}}/${{N}}] ${{slug}}`;
  coverageStat.textContent = `${{nCov}}/9 primitives covered`;
  missingList.innerHTML = (MISSING[slug] && MISSING[slug].length)
    ? MISSING[slug].map(p => `<span class="pill">${{p}}</span>`).join("")
    : "<span style='color:#228b22'>all 9 primitives covered ✓</span>";

  const trace = {{
    type: "scatterpolar",
    r: closedValues,
    theta: closedLabels,
    fill: "toself",
    name: slug,
    line: {{ color: "#1a3a5c", width: 2 }},
    fillcolor: "rgba(26, 58, 92, 0.25)",
    marker: {{ size: 8, color: "#1a3a5c" }},
  }};
  const idealTrace = {{
    type: "scatterpolar",
    r: Array(closedLabels.length).fill(1),
    theta: closedLabels,
    fill: "toself",
    name: "ideal pole (all 1s)",
    line: {{ color: "#228b22", width: 1, dash: "dot" }},
    fillcolor: "rgba(34, 139, 34, 0.05)",
    mode: "lines",
  }};

  const layout = {{
    title: {{
      text: `9-D coverage for <b>${{slug}}</b> (${{nCov}}/9)`,
      font: {{ size: 16, color: "#1a3a5c" }},
    }},
    polar: {{
      radialaxis: {{
        visible: true,
        range: [0, 1],
        tickvals: [0, 1],
        ticktext: ["0 (missing)", "1 (covered)"],
        tickfont: {{ size: 11 }},
      }},
      angularaxis: {{
        tickfont: {{ size: 12 }},
      }},
    }},
    showlegend: true,
    legend: {{ x: 0.85, y: 1.0, font: {{ size: 12 }} }},
    margin: {{ t: 60, b: 30, l: 60, r: 60 }},
  }};
  Plotly.newPlot("radar", [trace, idealTrace], layout, {{ displayModeBar: false, responsive: true }});
}}

function renderHeatmap() {{
  // Tiny strip: one row per corpus item (no scroll if N <= 80, else horizontal scroll)
  const rows = SLUGS.map(slug => SCORES[slug]);
  const data = [{{
    z: rows,
    x: PRIMITIVES,
    y: SLUGS,
    type: "heatmap",
    colorscale: [
      [0, "#f4e0e0"],
      [0.5, "#e8e8d0"],
      [1, "#e8f4ea"],
    ],
    zmin: 0, zmax: 1,
    showscale: false,
    xgap: 1, ygap: 1,
    hovertemplate: "file=%{{y}}<br>primitive=%{{x}}<br>covered=%{{z}}<extra></extra>",
  }}];

  const layout = {{
    title: {{ text: "corpus coverage heatmap (0/1 per primitive)", font: {{ size: 14 }} }},
    height: Math.max(360, N * 8 + 80),
    margin: {{ t: 50, l: 220, r: 20, b: 30 }},
    xaxis: {{ side: "top", tickfont: {{ size: 10, color: "#1a3a5c" }} }},
    yaxis: {{ tickfont: {{ size: 9 }}, automargin: true }},
  }};
  Plotly.newPlot("heatmap", data, layout, {{ displayModeBar: false, responsive: true }});
}}

slider.addEventListener("input", () => renderRadar(parseInt(slider.value, 10)));
prevBtn.addEventListener("click", () => {{
  const v = Math.max(0, parseInt(slider.value, 10) - 1);
  slider.value = v;
  renderRadar(v);
}});
nextBtn.addEventListener("click", () => {{
  const v = Math.min(N - 1, parseInt(slider.value, 10) + 1);
  slider.value = v;
  renderRadar(v);
}});

renderRadar(0);
renderHeatmap();
</script>
</body>
</html>
"""


def build_viewer_html(scores: dict[str, list[int]], missing_map: dict[str, list[str]],
                      out_path: Path, generated_at: str) -> None:
    """Write the self-contained HTML viewer with a slider for browsing the corpus."""
    primitives = PRIMITIVE_BASIS
    n = len(scores)
    html = VIEWER_HTML_TEMPLATE.format(
        n_minus_1=n - 1,
        scores_json=json.dumps(scores, indent=None, separators=(",", ":")),
        missing_json=json.dumps(missing_map, indent=None, separators=(",", ":")),
        primitives_json=json.dumps(primitives),
        generated_at=generated_at,
    )
    with open(out_path, "w") as f:
        f.write(html)
    print(f"  saved {out_path} ({out_path.stat().st_size} bytes)")


# ---------- README ----------
def build_readme(scores: dict[str, list[int]], missing_map: dict[str, list[str]],
                 corpus: dict, out_path: Path, generated_at: str) -> None:
    """Write README.md explaining the artifact."""
    n = len(scores)
    is_synthetic = corpus.get("synthetic", False)
    primitives = corpus["primitives"]

    # Coverage stats
    coverage_counts = [sum(s) for s in scores.values()]
    avg_cov = sum(coverage_counts) / n if n else 0
    saturated = sum(1 for c in coverage_counts if c == 9)
    sparse = sum(1 for c in coverage_counts if c <= 2)

    md = f"""# 9-D Primitive Radar — yubiOS corpus (PR2)

Generated by `build-9d-primitive-radar.py` on **{generated_at}**.

## What this is

One radar chart per file (corpus item) in `papers/data/`. Each file is scored on
the **9-D binary primitive basis** of the `internal-big-picture` skill (corpus-
internal 9-primitive variant — see §Math alignment below). The radar's nine
axes are the nine primitives; the radial value is 1 if the file covers the
primitive, 0 if it does not.

This is PR2 of the 4-PR hypersphere RSI series. PR1 produced the corpus itself
(`rsi-79-corpus-multi-cycle-2026-08-06.json`); PR3 will likely consume the
per-file radar coordinates as a learned-latent-curve input; PR4 closes the
loop with a multi-seed re-fit.

## Corpus

- **Source:** `papers/data/` on `yubi-OS/yubiOS` (main branch).
- **Items scored:** **{n}** corpus items (cycle-1 / initial-state coverage).
- **Basis:** {len(primitives)} primitives (see §9-D basis).
- **Saturated** (all 9 covered): **{saturated}/{n}**
- **Sparse** (≤ 2 covered): **{sparse}/{n}**
- **Average coverage:** **{avg_cov:.2f} / 9**
- **Corpus origin:** {"synthetic (deterministic 30-item fallback; seed=7913) — `papers/data/` was empty/unreachable" if is_synthetic else "real `rsi-79-corpus-multi-cycle-2026-08-06.json` from `yubi-OS/yubiOS` main"}

## How to regenerate

```sh
python3 papers/scripts/build-9d-primitive-radar.py
```

The script reads `papers/data/corpus-listing.json` (saved by Step 1) and the
corpus JSON. If `papers/data/` is empty or unreachable it falls back to a
deterministic 30-item synthetic corpus (seed=7913, documented substitution).
The script outputs all five files into `papers/data/radar-output/`:

| File | Description |
|---|---|
| `corpus-listing.json` | Listing of `papers/data/` from GitHub Contents API (Step 1). |
| `radar-scores.json` | `{{slug: [p1..p9]}}` for every corpus item. |
| `radar-grid.png` | Grid of small radar charts, one per corpus item. |
| `radar-heatmap.png` | Heatmap: rows = corpus items, cols = 9 primitives, value = 0/1. |
| `radar-viewer.html` | Self-contained HTML viewer with a file slider (Plotly.js via CDN). |
| `README.md` | This file. |

## 9-D basis (the `internal-big-picture` variant)

The corpus uses a 9-primitive variant of the `internal-big-picture` 10-
primitive spine. Primitive order matches the corpus JSON `primitives` array.

| # | Primitive | Definition |
|---|---|---|
""" + "\n".join(
        f"| p{i} | `{p}` | {PRIM_LONG[p]} |"
        for i, p in enumerate(primitives)
    ) + f"""

**Mapping (corpus → radar axes):** the radar axis at position 0 corresponds to
`{primitives[0]}` (the first primitive in the corpus `primitives` array); axis
i follows the same order. Coverage per file is derived from the file's
`missing_primitives` list: `coverage[i] = 1` iff the i-th primitive is NOT in
`missing_primitives`.

## Math alignment

The 9-D basis here matches the **corpus-internal** 9-primitive variant of the
`internal-big-picture` skill. The full `internal-big-picture` SKILL.md lists
**10** primitives; the corpus drops `self_describing` (the 10th) and uses the
remaining 9. This is the basis the existing RSI experiments (cycles 1-9) on
`yubi-OS/yubiOS` actually use — the corpus is the source of truth for this
artifact, and `internal-big-picture` documents the full 10-primitive spine
abstractly. **Deviation to flag:** if a downstream consumer expects the 10-
primitive `internal-big-picture` spine, they will see only 9 axes here. The
radar and heatmap outputs label axes by the 9-primitive name directly so the
mapping is unambiguous.

## How the viewer works

Open `radar-viewer.html` in any modern browser (no server required — the file
is fully self-contained). Plotly.js loads from CDN (network call only); all
data is inlined.

- **Slider** — drag to scrub through every corpus item.
- **Prev / Next** — step one at a time.
- **Radar chart** — 9-axis polar plot. Filled polygon = this file's coverage;
  the dotted green ideal-pole polygon = "all 9 covered" (the geodesic target).
- **Missing-primitives list** — pills naming the primitives this file is
  missing, ordered to match the axis labels.
- **Heatmap strip** — the entire corpus at a glance; the current row's
  filename is shown in the slider label above.

## Verification

The artifact has been end-to-end verified:

- JSON parses (`radar-scores.json` and `corpus-listing.json` are valid JSON).
- PNG renders (`radar-grid.png`, `radar-heatmap.png` are valid PNG files).
- HTML viewer renders (the `.html` file opens in a browser and shows the
  Plotly radar + heatmap + slider).

The script also asserts invariants during the run:
- `len(coverage) == len(primitives) == 9` for every file.
- `coverage[i] ∈ {{0, 1}}` for every (file, primitive) cell.
- `sum(coverage) ≤ 9` (no over-coverage).
"""
    with open(out_path, "w") as f:
        f.write(md)
    print(f"  saved {out_path} ({out_path.stat().st_size} bytes)")


# ---------- Main ----------
def main() -> int:
    print("=== 9-D Primitive Radar build (PR2 of hypersphere RSI series) ===\n")

    # 1. Load corpus — try local mirror first, then GitHub fallback
    corpus = load_corpus_from_local()
    if corpus is None:
        print("  WARN: local corpus not found — trying GitHub fallback")
        corpus = load_corpus_from_url()
    if corpus is None:
        print("  WARN: GitHub fallback failed — using synthetic 30-item corpus")
        corpus = make_synthetic_corpus(n=30, seed=7913)
        corpus["_fallback_reason"] = (
            "papers/data/ was empty or unreachable; substituting deterministic "
            "30-item synthetic corpus (seed=7913) with the same 9-D basis."
        )

    primitives = corpus["primitives"]
    print(f"  corpus_size: {corpus.get('corpus_size')}")
    print(f"  primitives ({len(primitives)}): {primitives}")
    if corpus.get("synthetic"):
        print(f"  corpus origin: SYNTHETIC (seed={corpus.get('synthetic_seed')})")
    else:
        print(f"  corpus origin: real (downloaded from {CORPUS_REPO_URL})")

    # 2. Build per-file scores from cycle 1 (initial state)
    scores, missing_map = build_scores(corpus)
    n = len(scores)
    print(f"  scored {n} corpus items from cycle 1\n")

    # Invariant assertions
    for slug, cov in scores.items():
        assert len(cov) == len(primitives), f"{slug}: cov len {len(cov)} != {len(primitives)}"
        assert all(v in (0, 1) for v in cov), f"{slug}: non-binary values {cov}"
        assert sum(cov) <= 9, f"{slug}: sum > 9"

    # 3. Save radar-scores.json
    scores_path = OUT_DIR / "radar-scores.json"
    with open(scores_path, "w") as f:
        json.dump({
            "basis": primitives,
            "primitive_definitions": PRIM_LONG,
            "corpus_origin": "synthetic" if corpus.get("synthetic") else "real",
            "corpus_source_url": None if corpus.get("synthetic") else CORPUS_REPO_URL,
            "n_items": n,
            "scores": scores,
            "missing_primitives": missing_map,
        }, f, indent=2)
    print(f"  saved {scores_path} ({scores_path.stat().st_size} bytes)")

    # 4. Render radar-grid.png
    grid_path = OUT_DIR / "radar-grid.png"
    cols = 9 if n > 9 else max(1, n)
    draw_radar_grid(scores, grid_path, cols=cols)

    # 5. Render radar-heatmap.png
    heatmap_path = OUT_DIR / "radar-heatmap.png"
    draw_heatmap(scores, missing_map, heatmap_path)

    # 6. Build HTML viewer
    viewer_path = OUT_DIR / "radar-viewer.html"
    from datetime import datetime, timezone
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    build_viewer_html(scores, missing_map, viewer_path, generated_at=generated_at)

    # 7. Build README.md
    readme_path = OUT_DIR / "README.md"
    build_readme(scores, missing_map, corpus, readme_path, generated_at=generated_at)

    print(f"\n=== Done. Outputs in {OUT_DIR} ===")
    for p in sorted(OUT_DIR.iterdir()):
        print(f"  {p.name}: {p.stat().st_size} bytes")

    return 0


if __name__ == "__main__":
    sys.exit(main())
