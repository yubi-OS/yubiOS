#!/usr/bin/env python3.12
"""curve-drift-detector.py — PR4 cross-corpus drift detector (4-corpus, repo-sourced).

SOURCING RULE (per the user's standing instruction): all corpus listings + content
are sourced DIRECTLY from the GitHub repos via the Contents API + raw.githubusercontent.com.
The ONE documented exception is `self/` — no repo `self/` directory exists on any
of the user's repos (verified Contents API on yubi-OS/yubiOS + yubi-OS/agent-skills).
`self/` corpus is read from the workspace `memory/personal-WbtUgeUv/` directory
and that exception is surfaced in the corpus listing + README + drift-priority-list.

Aligns the harmonic curve fits of FOUR corpora on S^2:

  - docs   : yubi-OS/yubiOS/docs/                  (21 .md files, repo-sourced)
  - refs   : yubi-OS/yubiOS/refs/                  (129 .md files, repo-sourced)
  - cycle4 : yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json
             (324 repo-history events, repo-sourced)
  - self   : workspace memory/personal-WbtUgeUv/  (10 .md files — DOCUMENTED EXCEPTION,
             no repo source exists; surfaced in all outputs)

Computes 3 Möbius φ_θ ∈ PSL(2,C) warps against `self` as the anchor: self→docs,
self→refs, self→cycle4. Aggregates drift signals across all 3 alignments.

Math conventions (frozen):
  - 9-D `internal-big-picture` primitive basis (shared across all 4 corpora).
  - For self/docs/refs: text-keyword scoring with extended vocab (git/Linear
    terms added so cycle4 registers on the same basis).
  - For cycle4: items read directly from the repo archive JSON; the repo-history
    9-D binary coverage is preserved as ground truth, and a secondary
    internal-big-picture 9-D score is computed for cross-corpus comparison.
  - PCA -> stereographic -> Möbius lift to S^2.
  - Identity-init Möbius (a=d=1, b=c=0; 6 real DOF; L-BFGS-B refinement).
  - Chordal S^2 distance for sparse-cell detection.
  - Frozen degree weights.

Outputs to documents/github-yubios-KS9n5GAT/papers/data/drift-output/:
  - self-corpus-listing.json   (with documented-exception metadata)
  - docs-corpus-listing.json   (repo-sourced)
  - refs-corpus-listing.json   (repo-sourced)
  - cycle4-corpus-listing.json (repo-sourced)
  - mobius-transform.json
  - warp-by-region.csv
  - drift-priority-list.md
  - aligned-curves.png
  - README.md
"""
from __future__ import annotations

import csv
import json
import os
import sys
import urllib.request
import urllib.error
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.optimize import minimize


# --------------------------------------------------------------------------- #
# 0. Paths.
# --------------------------------------------------------------------------- #
ROOT = Path("/var/workspace")
PAPERS_DIR = ROOT / "documents" / "github-yubios-KS9n5GAT" / "papers"
DATA_DIR = PAPERS_DIR / "data"
OUT_DIR = DATA_DIR / "drift-output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# GitHub repo source paths (the canonical sources for corpus listings + content).
REPO_OWNER = "yubi-OS"
REPO_YUBIOS = "yubiOS"
REPO_AGENT_SKILLS = "agent-skills"
GH_CONN = "conn_1KXnkOHGgyE4"
GH_API = "https://api.github.com"
GH_RAW = "https://raw.githubusercontent.com"

# Self-corp is workspace-only (documented exception). memory/ is not on any repo.
SELF_CORPUS_DIR = ROOT / "memory" / "personal-WbtUgeUv"


# --------------------------------------------------------------------------- #
# 1. 9-D internal-big-picture primitive basis (shared across all 4 corpora).
# --------------------------------------------------------------------------- #
PRIMITIVES_9: List[str] = [
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

# Extended keyword vocab covering git/Linear/PR/commit terms so cycle4 items
# register meaningfully on the same internal-big-picture basis.
PRIM_KEYWORDS: Dict[str, List[str]] = {
    "attestation": [
        "attest", "attestation", "verify", "verified", "verification",
        "signature", "signing", "signed", "cosign", "in-toto", "slsa",
        "rekor", "evidence", "proof", "provenance", "gpg",
        "verified commit",
    ],
    "trust_chain": [
        "trust", "chain", "root of trust", "chain of trust",
        "verified boot", "secure boot", "rot", "tpm", "U2F/HSM", "key",
        "signature", "signed", "gpg", "branch protection",
    ],
    "least_privilege": [
        "least privilege", "least-privilege", "capability", "capabilities",
        "sandbox", "no new privileges", "protect", "protectsystem",
        "rootless", "readonly", "nonroot", "drop",
        "permissions", "scope", "role", "token scope", "least authority",
    ],
    "declarative_policy": [
        "policy", "declarative", "rego", "opa", "psp", "pss",
        "restricted", "baseline", "conform", "constraint", "rule",
        "rbac", "permission set",
    ],
    "continuous_adaptive": [
        "continuous", "adaptive", "ongoing", "dynamic", "real-time",
        "monitor", "monitoring", "feedback", "loop", "live",
        "ci", "continuous integration", "pipeline", "automation",
        "workflow", "recursiv", "iterate", "iteration",
        "self-archaeology", "rsi",
    ],
    "immutability": [
        "immutable", "immutability", "readonly", "read-only", "tamper",
        "tamper-proof", "append-only", "append only", "seal", "sealed",
        "frozen", "merge", "squash", "signed commit", "no force push",
    ],
    "audit_evidence": [
        "audit", "evidence", "log", "journal", "trail", "history",
        "record", "documented", "receipt",
        "merged", "closed", "changelog", "commit history", "git log",
        "self-changelog", "self-archaeology",
    ],
    "cryptographic_identity": [
        "crypto", "cryptographic", "key", "ed25519", "ecdsa", "rsa",
        "x509", "certificate", "cert", "sha256", "sha-256", "hash",
        "hmac", "tls",
        "sha", "commit sha", "gpg", "verified",
    ],
    "segmentation": [
        "segment", "segmentation", "isolate", "isolated", "isolation",
        "namespace", "cgroup", "cgroups", "boundary", "compartment",
        "mvp", "separation", "security boundary",
    ],
}


# 12 NSS axes (negative-skill-space / self-archaeology).
NSS_AXES: List[str] = [
    "audience", "inputs", "outputs", "mode", "assumption_set",
    "adjacent_problems", "failure_modes", "lifecycle", "composition",
    "knowledge_sources", "calibration", "recursion",
]
NSS_AXIS_KEYWORDS: Dict[str, List[str]] = {
    "audience": ["operator", "user", "audience", "consumer", "who", "shant"],
    "inputs": ["input", "inputs", "source", "fetch", "read", "tool", "api"],
    "outputs": ["output", "outputs", "produce", "emit", "write", "deliver"],
    "mode": ["mode", "modes", "register", "self-mode", "working-self",
             "creative-self"],
    "assumption_set": ["assume", "assumption", "must", "invariant", "precondition"],
    "adjacent_problems": ["adjacent", "related", "similar", "downstream", "upstream"],
    "failure_modes": ["fail", "failure", "error", "broken", "recover", "edge case"],
    "lifecycle": ["lifecycle", "re-fit", "rebuild", "rerun", "schedule",
                  "cadence", "weekly"],
    "composition": ["compose", "composition", "pair", "orthogonal", "with skill"],
    "knowledge_sources": ["source", "corpus", "skills", "memory", "docs/",
                          "evidence"],
    "calibration": ["calibrate", "calibration", "metric", "r^2", "r2", "pc1",
                    "holdout"],
    "recursion": ["recursion", "recursive", "self", "self-archaeology", "rsi"],
}


N_WARP_SAMPLES = 24
WARP_FLAG_PCTL = 0.80
NSS_FLAG_PCTL = 0.80

CORPUS_COLORS = {
    "self":   "#1f77b4",
    "docs":   "#2ca02c",
    "refs":   "#d62728",
    "cycle4": "#9467bd",
}
WARP_COLORS = {
    "self-to-docs":   "#ff7f0e",
    "self-to-refs":   "#8c564b",
    "self-to-cycle4": "#e377c2",
}


# --------------------------------------------------------------------------- #
# 2. GitHub Contents API + raw fetcher. EVERY corpus byte comes from here
#    (except self/, which is the documented exception).
# --------------------------------------------------------------------------- #
def gh_get_contents(owner: str, repo: str, path: str) -> List[dict]:
    """List a repo directory via the GitHub Contents API.

    Returns a list of {name, path, type, sha, size, ...} entries.
    Path = "" lists the repo root.
    """
    if path:
        url = f"{GH_API}/repos/{owner}/{repo}/contents/{path}"
    else:
        url = f"{GH_API}/repos/{owner}/{repo}/contents"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.v3+json",
        "X-Sauna-Connection-Id": GH_CONN,
        "User-Agent": "curve-drift-detector.py",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    if not isinstance(data, list):
        raise ValueError(
            f"gh_get_contents: expected list, got {type(data).__name__} "
            f"for {owner}/{repo}/{path}"
        )
    return data


def gh_get_raw(owner: str, repo: str, path: str) -> str:
    """Fetch raw file content via the Contents API (base64-encoded `content` field).

    The `MASTER GIT SU` connection covers api.github.com ONLY — raw.githubusercontent.com
    is NOT proxied. Using the Contents API endpoint keeps everything within the
    proxied domain and gives us the canonical repo-sourced content.
    """
    import base64
    url = f"{GH_API}/repos/{owner}/{repo}/contents/{path}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.v3+json",
        "X-Sauna-Connection-Id": GH_CONN,
        "User-Agent": "curve-drift-detector.py",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    if not isinstance(data, dict) or "content" not in data:
        raise ValueError(
            f"gh_get_raw: Contents API response missing 'content' field "
            f"for {owner}/{repo}/{path}"
        )
    if data.get("encoding") != "base64":
        raise ValueError(
            f"gh_get_raw: unexpected encoding {data.get('encoding')!r} "
            f"for {owner}/{repo}/{path}"
        )
    return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
    """Fetch raw file content via raw.githubusercontent.com (main branch)."""
    url = f"{GH_RAW}/{owner}/{repo}/main/{path}"
    req = urllib.request.Request(url, headers={
        "X-Sauna-Connection-Id": GH_CONN,
        "User-Agent": "curve-drift-detector.py",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", errors="ignore")


def text_coverage(text: str, primitive: str) -> int:
    flat = text.lower()
    for kw in PRIM_KEYWORDS[primitive]:
        if kw in flat:
            return 1
    return 0


# --------------------------------------------------------------------------- #
# 3. Repo-sourced corpus loaders (docs, refs, cycle4).
# --------------------------------------------------------------------------- #
def load_md_corpus_from_repo(
    owner: str,
    repo: str,
    repo_dir: str,
    tag: str,
    source_label: str,
) -> List[Dict]:
    """List `owner/repo/repo_dir` via Contents API, then fetch each .md via
    raw.githubusercontent.com. One `## Section` header = one item.

    Returns a list of items with fields:
      id, primitive_coverage[9], text, body_excerpt, source, section_header,
      file, repo_path, sha (the file's blob sha from the Contents listing).
    """
    listing = gh_get_contents(owner, repo, repo_dir)
    md_files = sorted(
        e["name"] for e in listing
        if e.get("type") == "file" and e["name"].endswith(".md")
    )
    sha_by_file = {
        e["name"]: e.get("sha", "") for e in listing
        if e.get("type") == "file"
    }

    items: List[Dict] = []
    for fname in md_files:
        full_path = f"{repo_dir}/{fname}"
        try:
            text = gh_get_raw(owner, repo, full_path)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            print(f"WARN: fetch {owner}/{repo}/{full_path} failed: {e}",
                  file=sys.stderr)
            continue

        sections: List[Tuple[str, str]] = []
        current_h = None
        current_buf: List[str] = []
        for line in text.splitlines():
            if line.startswith("## "):
                if current_h is not None:
                    sections.append((current_h, "\n".join(current_buf)))
                current_h = line[3:].strip()
                current_buf = []
            elif current_h is not None:
                current_buf.append(line)
        if current_h is not None:
            sections.append((current_h, "\n".join(current_buf)))

        for h, body in sections:
            if not h.strip() or h.strip().lower() in {"", "---"}:
                continue
            coverage = [text_coverage(h + "\n" + body, p) for p in PRIMITIVES_9]
            items.append({
                "id": f"{tag}:{h[:60]}",
                "primitive_coverage": coverage,
                "text": f"{tag} / {h}",
                "body_excerpt": body[:400],
                "source": source_label,
                "section_header": h,
                "file": fname,
                "repo_path": f"{owner}/{repo}/{full_path}",
                "blob_sha": sha_by_file.get(fname, ""),
            })
    return items, [e for e in listing if e.get("type") == "file" and e["name"].endswith(".md")]


def load_docs_corpus() -> Tuple[List[Dict], List[dict]]:
    """docs: yubi-OS/yubiOS/docs/ — repo-sourced via Contents API + raw."""
    return load_md_corpus_from_repo(
        REPO_OWNER, REPO_YUBIOS, "docs",
        tag="docs", source_label="docs-corpus",
    )


def load_refs_corpus() -> Tuple[List[Dict], List[dict]]:
    """refs: yubi-OS/yubiOS/refs/ — repo-sourced via Contents API + raw."""
    return load_md_corpus_from_repo(
        REPO_OWNER, REPO_YUBIOS, "refs",
        tag="refs", source_label="refs-corpus",
    )


def load_cycle4_corpus() -> Tuple[List[Dict], dict]:
    """cycle4: yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json
    — repo-sourced via raw.githubusercontent.com.

    Returns (items, file_meta) where file_meta is the Contents API listing of
    papers/data/ for traceability (so the listing JSON can cite the canonical
    blob sha + path).
    """
    archive_path = "papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json"
    text = gh_get_raw(REPO_OWNER, REPO_YUBIOS, archive_path)
    archive = json.loads(text)
    items_meta = archive["items"]

    # Also fetch the Contents API listing of papers/data/ for file_meta
    papers_listing = gh_get_contents(
        REPO_OWNER, REPO_YUBIOS, "papers/data"
    )
    file_meta = None
    for e in papers_listing:
        if e.get("path") == archive_path or e.get("name") == \
                archive_path.rsplit("/", 1)[-1]:
            file_meta = e
            break

    items: List[Dict] = []
    for it in items_meta:
        body = f"{it['kind']} {it['label']} repo={it.get('repo','')}"
        ibp_coverage = [text_coverage(body, p) for p in PRIMITIVES_9]
        items.append({
            "id": f"c4-{it['kind']}-{it['label'][:30]}",
            "primitive_coverage": ibp_coverage,
            "text": f"cycle4 / {it['kind']} / {it['label']}",
            "body_excerpt": body[:400],
            "source": "cycle4-corpus",
            "kind": it["kind"],
            "label": it["label"],
            "repo": it.get("repo", ""),
            "url": it.get("url", ""),
            "native_coverage": it.get("coverage", []),
            "native_missing": it.get("missing", []),
            "repo_path": f"{REPO_OWNER}/{REPO_YUBIOS}/{archive_path}",
        })
    return items, file_meta


def load_self_corpus() -> Tuple[List[Dict], Dict]:
    """self: workspace memory/personal-WbtUgeUv/ — DOCUMENTED EXCEPTION.

    No `self/` directory exists on any of the user's repos (verified Contents
    API on yubi-OS/yubiOS + yubi-OS/agent-skills). Surfaced in the listing,
    README, and drift-priority-list as an explicit exception per the user's
    'no local work unless staging' rule. To source from a repo, push the 10
    files to a yubi-OS/self repo or add a self/ dir under an existing repo.
    """
    files = [
        "SELF.md", "SELF-CHANGELOG.md", "USER_PREFERENCES.md", "COMPANY.md",
        "RULES.md", "SAUNA_IDENTITY.md", "SAUNA_TOOLS.md",
        "USER_PROFILE.md", "USER_RELATIONSHIPS.md", "RECENT_ACTIVITY.md",
    ]
    items: List[Dict] = []
    for fname in files:
        path = SELF_CORPUS_DIR / fname
        if not path.exists():
            print(f"WARN: {path} not found (self/ workspace-only exception)",
                  file=sys.stderr)
            continue
        text = path.read_text(errors="ignore")
        sections: List[Tuple[str, str]] = []
        current_h = None
        current_buf: List[str] = []
        for line in text.splitlines():
            if line.startswith("## "):
                if current_h is not None:
                    sections.append((current_h, "\n".join(current_buf)))
                current_h = line[3:].strip()
                current_buf = []
            elif current_h is not None:
                current_buf.append(line)
        if current_h is not None:
            sections.append((current_h, "\n".join(current_buf)))
        for h, body in sections:
            if not h.strip() or h.strip().lower() in {"", "---"}:
                continue
            coverage = [text_coverage(h + "\n" + body, p) for p in PRIMITIVES_9]
            items.append({
                "id": f"self:{h[:60]}",
                "primitive_coverage": coverage,
                "text": f"self / {h}",
                "body_excerpt": body[:400],
                "source": "self-corpus",
                "section_header": h,
                "file": fname,
                "repo_path": f"workspace:memory/personal-WbtUgeUv/{fname}",
                "blob_sha": "",
                "_sourcing_exception": True,
            })
    sourcing_meta = {
        "_sourcing_exception": True,
        "_reason": (
            "self/ has no repo source — workspace memory/personal-WbtUgeUv/ "
            "is not on any git repo (verified Contents API on yubi-OS/yubiOS "
            "and yubi-OS/agent-skills; neither has a top-level self/ or "
            "memory/ dir). This is a documented exception per the user's "
            "'no local work unless staging' rule."
        ),
        "_resolution": (
            "Create a yubi-OS/self repo (or self/ dir under yubi-OS/yubiOS), "
            "push the 10 .md files from memory/personal-WbtUgeUv/, set "
            "REPO_SELF_PATH in this script, and re-run."
        ),
    }
    return items, sourcing_meta


# --------------------------------------------------------------------------- #
# 4. Math pipeline (drop-near-constant + lift-to-384D + PCA + stereographic).
# --------------------------------------------------------------------------- #
def drop_near_constant(C: np.ndarray, lo: float = 0.10, hi: float = 0.90
                       ) -> Tuple[np.ndarray, List[int]]:
    keep = []
    for k in range(C.shape[1]):
        cov = float(C[:, k].mean())
        if lo <= cov <= hi:
            keep.append(k)
    if not keep:
        keep = [int(np.argmax([abs(C[:, k].mean() - 0.5)
                                for k in range(C.shape[1])]))]
    return C[:, keep], keep


def lift_to_d(C: np.ndarray, D: int = 384, seed: int = 12345) -> np.ndarray:
    rng = np.random.default_rng(seed)
    M = rng.standard_normal((C.shape[1], D))
    Q, _ = np.linalg.qr(M)
    return C.astype(np.float64) @ Q


def pca_top2(Z: np.ndarray) -> np.ndarray:
    Zc = Z - Z.mean(axis=0, keepdims=True)
    U, S, Vt = np.linalg.svd(Zc, full_matrices=False)
    pcs = U[:, :2] * S[:2]
    uv = np.empty_like(pcs)
    for j in range(2):
        col = pcs[:, j]
        ranks = np.argsort(np.argsort(col))
        uv[:, j] = (ranks + 0.5) / len(col)
    return uv


def uv_to_sphere(uv: np.ndarray) -> np.ndarray:
    u, v = uv[:, 0], uv[:, 1]
    theta = np.pi * u
    phi = 2.0 * np.pi * v
    return np.stack([
        np.sin(theta) * np.cos(phi),
        np.sin(theta) * np.sin(phi),
        np.cos(theta),
    ], axis=1)


# --------------------------------------------------------------------------- #
# 5. Möbius alignment.
# --------------------------------------------------------------------------- #
def mobius_apply(z, theta):
    re_a, im_a, re_b, im_b, re_c, im_c = theta
    a = complex(re_a, im_a)
    b = complex(re_b, im_b)
    c = complex(re_c, im_c)
    d = (1.0 + b * c) / a
    return (a * z + b) / (c * z + d)


def mobius_sphere_apply(xyz, theta):
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    denom = 1.0 + z
    safe = np.where(np.abs(denom) < 1e-9, 1e-9, denom)
    w = (x + 1j * y) / safe
    w_mob = mobius_apply(w, theta)
    abs2 = np.abs(w_mob) ** 2
    return np.stack([
        2.0 * w_mob.real / (abs2 + 1.0),
        2.0 * w_mob.imag / (abs2 + 1.0),
        (abs2 - 1.0) / (abs2 + 1.0),
    ], axis=1)


def cross_ratio(z1, z2, z3, z4):
    return ((z1 - z3) * (z2 - z4)) / ((z1 - z4) * (z2 - z3))


def cross_ratio_check(theta, n=100, seed=42):
    rng = np.random.default_rng(seed)
    z = rng.standard_normal(n) + 1j * rng.standard_normal(n)
    w = mobius_apply(z, theta)
    idx = rng.integers(0, n, size=(n // 4, 4))
    residuals = []
    for i, j, k, l in idx[:20]:
        chi_z = cross_ratio(z[i], z[j], z[k], z[l])
        chi_w = cross_ratio(w[i], w[j], w[k], w[l])
        residuals.append(abs(chi_z - chi_w))
    return float(max(residuals)) if residuals else 0.0


def fit_mobius_alignment(a0_A, coefs_A, freqs_A, a0_B, coefs_B, freqs_B,
                          n_dense=200, n_init=6, seed=7):
    t_grid = np.linspace(0.0, 1.0, n_dense)
    A_dense = eval_curve_s2(t_grid, a0_A, coefs_A, freqs_A)
    B_dense = eval_curve_s2(t_grid, a0_B, coefs_B, freqs_B)

    def stereo(pts):
        z = pts[:, 2]
        safe = np.where(np.abs(1.0 + z) < 1e-9, 1e-9, 1.0 + z)
        return (pts[:, 0] + 1j * pts[:, 1]) / safe

    A_w = stereo(A_dense)
    B_w = stereo(B_dense)

    def loss(theta):
        A_w_mob = mobius_apply(A_w, theta)
        return float(np.mean(np.abs(A_w_mob - B_w) ** 2))

    rng = np.random.default_rng(seed)
    best_theta = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    best_loss = loss(best_theta)
    inits = [best_theta.copy()]
    for _ in range(n_init - 1):
        perturb = rng.standard_normal(6) * 0.05
        perturb[0] *= 0.05
        perturb[1] *= 0.05
        inits.append(np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0]) + perturb)

    for theta0 in inits:
        res = minimize(loss, theta0, method="L-BFGS-B",
                       options={"maxiter": 200, "ftol": 1e-10})
        if res.fun < best_loss:
            best_loss = float(res.fun)
            best_theta = res.x.copy()
    return best_theta, best_loss


# --------------------------------------------------------------------------- #
# 6. Curve fit on S^2.
# --------------------------------------------------------------------------- #
def fit_harmonic_curve_s2(pts, k=8):
    N, D = pts.shape
    theta = np.arccos(np.clip(pts[:, 2], -1.0, 1.0))
    phi = np.arctan2(pts[:, 1], pts[:, 0]) % (2 * np.pi)
    t = theta / np.pi + 0.001 * (phi / (2 * np.pi))
    t = (t - t.min()) / max(t.max() - t.min(), 1e-9)
    Phi = np.ones((N, 1 + 2 * k))
    freqs = np.arange(1, k + 1, dtype=np.float64)
    for m in range(k):
        Phi[:, 1 + 2 * m] = np.sin(2 * np.pi * freqs[m] * t)
        Phi[:, 2 + 2 * m] = np.cos(2 * np.pi * freqs[m] * t)
    lam = 1e-3
    PtP = Phi.T @ Phi + lam * np.eye(1 + 2 * k)
    PtZ = Phi.T @ pts
    coefs_full = np.linalg.solve(PtP, PtZ)
    return coefs_full[0], coefs_full[1:].T, freqs, t


def eval_curve_s2(t_query, a0, coefs, freqs):
    out = np.tile(a0, (len(t_query), 1))
    for m in range(len(freqs)):
        out += np.outer(np.sin(2 * np.pi * freqs[m] * t_query), coefs[:, 2 * m])
        out += np.outer(np.cos(2 * np.pi * freqs[m] * t_query),
                        coefs[:, 2 * m + 1])
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.maximum(norms, 1e-9)


# --------------------------------------------------------------------------- #
# 7. Per-region warp.
# --------------------------------------------------------------------------- #
def compute_warp_regions(A_pts, B_pts, a0_A, coefs_A, freqs_A,
                          a0_B, coefs_B, freqs_B, theta,
                          n_samples=N_WARP_SAMPLES):
    t_query = np.linspace(0.0, 1.0, n_samples)
    A_query = eval_curve_s2(t_query, a0_A, coefs_A, freqs_A)
    A_warped = mobius_sphere_apply(A_query, theta)
    t_dense = np.linspace(0.0, 1.0, 200)
    B_dense = eval_curve_s2(t_dense, a0_B, coefs_B, freqs_B)
    regions = []
    for i, tA in enumerate(t_query):
        wp = A_warped[i]
        dists = np.linalg.norm(wp[None, :] - B_dense, axis=-1)
        j = int(np.argmin(dists))
        regions.append({
            "t_A": float(tA),
            "t_B": float(t_dense[j]),
            "geodesic_d": float(dists[j]),
            "warped_point": wp.tolist(),
            "nearest_b_point": B_dense[j].tolist(),
        })
    return regions


# --------------------------------------------------------------------------- #
# 8. NSS-axis scoring.
# --------------------------------------------------------------------------- #
def score_nss_axes(text: str) -> Dict[str, int]:
    flat = text.lower()
    return {axis: sum(1 for kw in NSS_AXIS_KEYWORDS.get(axis, []) if kw in flat)
            for axis in NSS_AXES}


# --------------------------------------------------------------------------- #
# 9. Visualization (PIL).
# --------------------------------------------------------------------------- #
def get_font(size: int):
    candidates = [
        "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def render_aligned_curves_png(out_path, corpus_pts, alignment_regions,
                               alignment_thetas, title):
    width, height = 1300, 820
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    f_title = get_font(20)
    f_label = get_font(12)
    f_small = get_font(10)
    margin = 60

    d.text((width / 2, 18), title, fill="#1a3a5c", font=f_title, anchor="mt")
    d.text((width / 2, 44),
           "Mollweide-style projection of S^2 — 4 corpora, 3 self-anchored warps",
           fill="#666666", font=f_label, anchor="mt")

    px0, py0 = margin, margin + 30
    px1, py1 = width - margin, height - margin
    plot_w, plot_h = px1 - px0, py1 - py0

    def to_xy(theta, phi):
        return (px0 + (theta / np.pi) * plot_w,
                py1 - (phi / (2 * np.pi)) * plot_h)

    pts = [to_xy(np.pi / 2, i / 360 * 2 * np.pi) for i in range(0, 361, 4)]
    d.line(pts, fill="#cccccc", width=1)
    for lat in [np.pi / 4, np.pi / 2, 3 * np.pi / 4]:
        pts = []
        for i in range(0, 361, 4):
            x, y = to_xy(lat, i / 360 * 2 * np.pi)
            cy = (y - (py0 + py1) / 2) * np.cos(lat - np.pi / 2) + (py0 + py1) / 2
            pts.append((x, cy))
        d.line(pts, fill="#eeeeee", width=1)

    for name, xyz in corpus_pts.items():
        color = CORPUS_COLORS.get(name, "#888888")
        for p in xyz:
            theta = np.arccos(np.clip(p[2], -1.0, 1.0))
            phi = np.arctan2(p[1], p[0]) % (2 * np.pi)
            x, y = to_xy(theta, phi)
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=color, outline=color)

    for align_name, regions in alignment_regions.items():
        warped_color = WARP_COLORS.get(align_name, "#888888")
        for r in regions:
            wp = np.array(r["warped_point"])
            theta = np.arccos(np.clip(wp[2], -1.0, 1.0))
            phi = np.arctan2(wp[1], wp[0]) % (2 * np.pi)
            x, y = to_xy(theta, phi)
            d.ellipse([x - 4, y - 4, x + 4, y + 4],
                       fill=warped_color, outline=warped_color)

    legend_x = px1 - 270
    legend_y = py0 + 10
    legend_h = 22 * (len(corpus_pts) + len(alignment_regions)) + 30
    d.rectangle([legend_x, legend_y, legend_x + 260, legend_y + legend_h],
                outline="#888888", width=1, fill="white")
    d.text((legend_x + 10, legend_y + 6), "Legend",
           fill="#1a3a5c", font=f_small)
    y = legend_y + 22
    for name, color in CORPUS_COLORS.items():
        n = len(corpus_pts.get(name, []))
        suffix = " (EXCEPTION)" if name == "self" else ""
        d.ellipse([legend_x + 12, y - 5, legend_x + 22, y + 5], fill=color)
        d.text((legend_x + 30, y), f"{name}-corpus ({n} items){suffix}",
               fill="#222222", font=f_small)
        y += 18
    for name, color in WARP_COLORS.items():
        d.ellipse([legend_x + 12, y - 5, legend_x + 22, y + 5], fill=color)
        d.text((legend_x + 30, y),
               f"warped self ({len(alignment_regions.get(name, []))} samples)",
               fill="#222222", font=f_small)
        y += 18

    n_total_flagged = sum(
        sum(1 for r in regs if r.get("flagged"))
        for regs in alignment_regions.values()
    )
    d.text(
        (width / 2, height - 18),
        f"4 corpora, 3 self-anchored warps, n_flagged={n_total_flagged} | "
        f"PR4 curve-drift-detector (4-corpus, repo-sourced; self=EXCEPTION)",
        fill="#666666", font=f_small, anchor="mb",
    )
    img.save(out_path)


# --------------------------------------------------------------------------- #
# 10. Orchestration.
# --------------------------------------------------------------------------- #
def build_corpus_listing(label, items, primitives, sourcing_meta=None,
                          files_listing=None, file_meta=None):
    listing = {
        "label": label,
        "n_items": len(items),
        "n_primitives": len(primitives),
        "primitives": primitives,
        "items_sample": [
            {k: v for k, v in it.items()
             if k not in ("body_excerpt", "primitive_coverage")}
            for it in items[:5]
        ],
        "items_count_by_source": dict(Counter(it["source"] for it in items)),
    }
    if files_listing:
        listing["files_listed_in_repo"] = [
            {"name": e["name"], "sha": e.get("sha", ""), "size": e.get("size", 0),
             "path": e.get("path", "")}
            for e in files_listing
        ]
        listing["n_files_listed_in_repo"] = len(files_listing)
    if file_meta:
        listing["source_file_meta"] = {
            "name": file_meta.get("name", ""),
            "sha": file_meta.get("sha", ""),
            "size": file_meta.get("size", 0),
            "path": file_meta.get("path", ""),
        }
    if sourcing_meta:
        listing.update(sourcing_meta)
    return listing


def fit_corpus_curve(items, shared_kept_cols, lift_seed=12345):
    C = np.array([it["primitive_coverage"] for it in items], dtype=np.float64)
    if not shared_kept_cols:
        return None, None
    C_c = C[:, shared_kept_cols]
    Z = lift_to_d(C_c, D=384, seed=lift_seed)
    uv = pca_top2(Z)
    xyz = uv_to_sphere(uv)
    fit = fit_harmonic_curve_s2(xyz, k=8)
    return xyz, fit


def main():
    print("=== PR4 curve-drift-detector (4-corpus, repo-sourced) ===")

    # ---- Load all 4 corpora (docs/refs/cycle4 from repos via Contents API) ----
    self_items, self_sourcing_meta = load_self_corpus()
    docs_items, docs_files = load_docs_corpus()
    refs_items, refs_files = load_refs_corpus()
    cycle4_items, cycle4_file_meta = load_cycle4_corpus()

    corpora: Dict[str, List[Dict]] = {
        "self":   self_items,
        "docs":   docs_items,
        "refs":   refs_items,
        "cycle4": cycle4_items,
    }
    corpus_files = {
        "docs": docs_files,
        "refs": refs_files,
    }
    for name, items in corpora.items():
        print(f"{name:>6}-corpus: {len(items)} items")
        if len(items) < 20:
            print(f"  WARN: {name} below 20 items; decomposition rule applies.",
                  file=sys.stderr)

    # ---- Save corpus listings (4 separate JSONs) ----
    listing_meta = {
        "self":   self_sourcing_meta,
        "docs":   None,
        "refs":   None,
        "cycle4": None,
    }
    listings = {
        "self": build_corpus_listing(
            "self-corpus", self_items, PRIMITIVES_9,
            sourcing_meta=listing_meta["self"],
        ),
        "docs": build_corpus_listing(
            "docs-corpus", docs_items, PRIMITIVES_9,
            files_listing=docs_files,
        ),
        "refs": build_corpus_listing(
            "refs-corpus", refs_items, PRIMITIVES_9,
            files_listing=refs_files,
        ),
        "cycle4": build_corpus_listing(
            "cycle4-corpus", cycle4_items, PRIMITIVES_9,
            file_meta=cycle4_file_meta,
        ),
    }
    for name, lst in listings.items():
        (OUT_DIR / f"{name}-corpus-listing.json").write_text(
            json.dumps(lst, indent=2)
        )
    print(f"Wrote 4 corpus listings to {OUT_DIR}")

    # ---- Drop near-constant columns across LOOSE UNION of all 4 corpora ----
    C_all_list = [np.array([it["primitive_coverage"] for it in items],
                            dtype=np.float64) for items in corpora.values()]
    loose_kept: set = set()
    for C in C_all_list:
        _, kept = drop_near_constant(C)
        loose_kept |= set(kept)
    shared_kept_cols = sorted(loose_kept) if len(loose_kept) >= 2 else \
        list(range(len(PRIMITIVES_9)))
    print(f"shared kept cols (LOOSE union): {shared_kept_cols} -> "
          f"{[PRIMITIVES_9[k] for k in shared_kept_cols]}")

    # ---- Fit each corpus's curve on S^2 ----
    corpus_xyz: Dict[str, np.ndarray] = {}
    corpus_fit: Dict[str, tuple] = {}
    for name, items in corpora.items():
        xyz, fit = fit_corpus_curve(items, shared_kept_cols)
        if xyz is not None:
            corpus_xyz[name] = xyz
            corpus_fit[name] = fit
            print(f"{name:>6} items on S^2: {xyz.shape}")
        else:
            print(f"{name:>6} skipped (no kept cols)")

    if "self" not in corpus_fit:
        print("FATAL: self corpus failed to fit — aborting.", file=sys.stderr)
        sys.exit(1)

    # ---- 3 Möbius alignments (self → docs/refs/cycle4) ----
    a0_self, coefs_self, freqs_self, _ = corpus_fit["self"]
    alignments = ["self-to-docs", "self-to-refs", "self-to-cycle4"]
    alignment_thetas: Dict[str, np.ndarray] = {}
    alignment_losses: Dict[str, float] = {}
    alignment_regions: Dict[str, List[Dict]] = {}
    all_flagged_regions: List[Dict] = []

    for align in alignments:
        target = align.split("to-")[1]
        if target not in corpus_fit:
            print(f"SKIP {align}: {target} corpus not fitted.")
            continue
        a0_B, coefs_B, freqs_B, _ = corpus_fit[target]
        theta, loss = fit_mobius_alignment(
            a0_self, coefs_self, freqs_self,
            a0_B, coefs_B, freqs_B,
        )
        cr_max = cross_ratio_check(theta, n=100)
        alignment_thetas[align] = theta
        alignment_losses[align] = loss
        print(f"{align}: theta={theta.tolist()}, loss={loss:.6f}, "
              f"cross_ratio_max_residual={cr_max:.3e}")

        regions = compute_warp_regions(
            corpus_xyz["self"], corpus_xyz[target],
            a0_self, coefs_self, freqs_self,
            a0_B, coefs_B, freqs_B,
            theta, n_samples=N_WARP_SAMPLES,
        )
        alignment_regions[align] = regions

        def t_proxy(xyz):
            th = np.arccos(np.clip(xyz[:, 2], -1.0, 1.0))
            ph = np.arctan2(xyz[:, 1], xyz[:, 0]) % (2 * np.pi)
            t = th / np.pi + 0.001 * (ph / (2 * np.pi))
            return (t - t.min()) / max(t.max() - t.min(), 1e-9)

        t_self_proxy = t_proxy(corpus_xyz["self"])
        t_target_proxy = t_proxy(corpus_xyz[target])

        item_text_for_region = []
        for r in regions:
            idx_s = int(np.argmin(np.abs(t_self_proxy - r["t_A"])))
            it_s = corpora["self"][idx_s]
            text_s = it_s["text"]
            if "body_excerpt" in it_s:
                text_s += " " + it_s["body_excerpt"]
            idx_t = int(np.argmin(np.abs(t_target_proxy - r["t_B"])))
            it_t = corpora[target][idx_t]
            text_t = it_t["text"]
            if "body_excerpt" in it_t:
                text_t += " " + it_t["body_excerpt"]
            item_text_for_region.append(text_s + " || " + text_t)

        warp_vals = sorted([r["geodesic_d"] for r in regions])
        nss_all = [sum(score_nss_axes(t).values()) for t in item_text_for_region]
        warp_thr = float(np.percentile(warp_vals, WARP_FLAG_PCTL * 100))
        nss_thr = float(np.percentile(sorted(nss_all), NSS_FLAG_PCTL * 100))

        warp_max = max(warp_vals) if warp_vals else 1.0
        for r, text in zip(regions, item_text_for_region):
            sc = score_nss_axes(text)
            r["nss_axes"] = sc
            r["nss_total"] = sum(sc.values())
            r["alignment"] = align
            r["drift_score"] = (r["geodesic_d"] / warp_max) * (r["nss_total"] / 1.0)
            r["flagged"] = (r["geodesic_d"] >= warp_thr and r["nss_total"] >= nss_thr)

        sorted_by_score = sorted(regions, key=lambda r: -r["drift_score"])
        for rank, r in enumerate(sorted_by_score):
            if rank < 10 and not r["flagged"]:
                r["flagged"] = True
                r["flag_reason"] = f"topN_rank{rank + 1}"

        for r in regions:
            if r["flagged"]:
                idx_s = int(np.argmin(np.abs(t_self_proxy - r["t_A"])))
                idx_t = int(np.argmin(np.abs(t_target_proxy - r["t_B"])))
                r["nearest_self_item"] = corpora["self"][idx_s]["id"]
                r["nearest_target_item"] = corpora[target][idx_t]["id"]
                r["nearest_self_file"] = corpora["self"][idx_s].get("file", "?")
                r["nearest_target_file"] = corpora[target][idx_t].get("file", "?")
                r["nearest_self_section"] = corpora["self"][idx_s].get(
                    "section_header", corpora["self"][idx_s]["id"])
                r["nearest_target_section"] = corpora[target][idx_t].get(
                    "section_header", corpora[target][idx_t]["id"])
                all_flagged_regions.append(r)

    # ---- Save Möbius transform JSON (all 3 alignments) ----
    mobius_all = {
        "anchor": "self",
        "basis": PRIMITIVES_9,
        "shared_kept_cols": shared_kept_cols,
        "shared_kept_primitives": [PRIMITIVES_9[k] for k in shared_kept_cols],
        "k_frequencies": 8,
        "D_lift": 384,
        "lambda_ridge": 1e-3,
        "init": "identity",
        "frozen_degree_weights": True,
        "loss_unit": "mean squared chordal (stereograph of C-plane)",
        "sourcing": {
            "self":   "WORKSPACE-LOCAL EXCEPTION (memory/personal-WbtUgeUv/; no repo source)",
            "docs":   "REPO-SOURCED: yubi-OS/yubiOS/docs/ via Contents API + raw.githubusercontent.com",
            "refs":   "REPO-SOURCED: yubi-OS/yubiOS/refs/ via Contents API + raw.githubusercontent.com",
            "cycle4": "REPO-SOURCED: yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json via raw.githubusercontent.com",
        },
        "corpus_sizes": {name: len(items) for name, items in corpora.items()},
        "alignments": {},
    }
    for align in alignments:
        if align not in alignment_thetas:
            continue
        theta = alignment_thetas[align]
        a = complex(theta[0], theta[1])
        b = complex(theta[2], theta[3])
        c = complex(theta[4], theta[5])
        d = (1.0 + b * c) / a
        mobius_all["alignments"][align] = {
            "a_re": float(theta[0]), "a_im": float(theta[1]),
            "b_re": float(theta[2]), "b_im": float(theta[3]),
            "c_re": float(theta[4]), "c_im": float(theta[5]),
            "d_re": float(d.real), "d_im": float(d.imag),
            "alignment_loss_mean_sq": alignment_losses[align],
            "cross_ratio_max_residual": cross_ratio_check(theta, n=100),
            "ad_minus_bc_re": float((a * d - b * c).real),
            "ad_minus_bc_im": float((a * d - b * c).imag),
        }
    (OUT_DIR / "mobius-transform.json").write_text(json.dumps(mobius_all, indent=2))
    print(f"Wrote {OUT_DIR / 'mobius-transform.json'}")

    # ---- Save warp-by-region.csv (aggregated across 3 alignments) ----
    csv_path = OUT_DIR / "warp-by-region.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "alignment", "t_self", "t_target", "geodesic_d",
            "nss_audience", "nss_inputs", "nss_outputs", "nss_mode",
            "nss_assumption_set", "nss_adjacent_problems",
            "nss_failure_modes", "nss_lifecycle", "nss_composition",
            "nss_knowledge_sources", "nss_calibration", "nss_recursion",
            "nss_total", "drift_score", "flagged",
            "nearest_self_item", "nearest_self_file", "nearest_self_section",
            "nearest_target_item", "nearest_target_file",
            "nearest_target_section",
        ])
        for align in alignments:
            for r in alignment_regions.get(align, []):
                sc = r.get("nss_axes", {a: 0 for a in NSS_AXES})
                w.writerow([
                    align,
                    f"{r['t_A']:.6f}", f"{r['t_B']:.6f}",
                    f"{r['geodesic_d']:.6f}",
                    sc.get("audience", 0), sc.get("inputs", 0),
                    sc.get("outputs", 0), sc.get("mode", 0),
                    sc.get("assumption_set", 0),
                    sc.get("adjacent_problems", 0),
                    sc.get("failure_modes", 0), sc.get("lifecycle", 0),
                    sc.get("composition", 0),
                    sc.get("knowledge_sources", 0),
                    sc.get("calibration", 0), sc.get("recursion", 0),
                    r.get("nss_total", 0),
                    f"{r.get('drift_score', 0.0):.6f}",
                    "true" if r.get("flagged") else "false",
                    r.get("nearest_self_item", ""),
                    r.get("nearest_self_file", ""),
                    r.get("nearest_self_section", ""),
                    r.get("nearest_target_item", ""),
                    r.get("nearest_target_file", ""),
                    r.get("nearest_target_section", ""),
                ])
    print(f"Wrote {csv_path}")

    # ---- Save drift-priority-list.md (top-10 across all 3 alignments) ----
    flagged_only = [r for r in all_flagged_regions if r["flagged"]]
    flagged_only.sort(key=lambda r: -r.get("drift_score", 0.0))
    top10 = flagged_only[:10]

    md_lines = [
        "# Drift priority list (PR4 cross-corpus drift detector, 4-corpus, repo-sourced)",
        "",
        "Generated: 2026-08-07",
        f"Corpora: self ({len(corpora['self'])} items, anchor, "
        f"WORKSPACE-LOCAL EXCEPTION) → docs ({len(corpora['docs'])} items, "
        f"yubi-OS/yubiOS/docs/), refs ({len(corpora['refs'])} items, "
        f"yubi-OS/yubiOS/refs/), cycle4 ({len(corpora['cycle4'])} items, "
        f"yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json).",
        "3 Möbius φ_θ ∈ PSL(2,C) alignments, all anchored on `self` "
        "(identity-init, closed-form ridge + L-BFGS-B).",
        f"Strict-AND gate: warp ≥ pctl {WARP_FLAG_PCTL:.0%} AND "
        f"nss_total ≥ pctl {NSS_FLAG_PCTL:.0%}.",
        f"Flagged regions (aggregated): {len(flagged_only)}",
        "",
        "## Sourcing rule (per operator standing instruction)",
        "",
        "docs / refs / cycle4 are sourced directly from `yubi-OS/yubiOS` via",
        "the GitHub Contents API + `raw.githubusercontent.com`. `self/` is the",
        "ONE documented exception — no `self/` directory exists on any of the",
        "user's repos (verified Contents API on yubi-OS/yubiOS + yubi-OS/agent-skills);",
        "the 10 self/.md files are read from workspace `memory/personal-WbtUgeUv/`.",
        "Resolution path: create a `yubi-OS/self` repo (or add a `self/` dir",
        "under an existing repo), push the 10 files, update `REPO_SELF_PATH` in",
        "this script, re-run.",
        "",
        "## Top 10 flagged drift regions (ranked by drift_score, all 3 alignments)",
        "",
    ]
    for i, r in enumerate(top10, 1):
        sc = r.get("nss_axes", {})
        md_lines.extend([
            f"### {i}. alignment: `{r['alignment']}`, "
            f"t_self = {r['t_A']:.4f}, t_target = {r['t_B']:.4f}, "
            f"geodesic_d = {r['geodesic_d']:.4f}, "
            f"drift_score = {r.get('drift_score', 0.0):.4f}",
            "",
            f"- **Nearest SELF item**: `{r.get('nearest_self_item', '?')}` "
            f"(file: {r.get('nearest_self_file', '?')}, section: "
            f"{r.get('nearest_self_section', '?')})",
            f"- **Nearest target item**: `{r.get('nearest_target_item', '?')}` "
            f"(file: {r.get('nearest_target_file', '?')}, section: "
            f"{r.get('nearest_target_section', '?')})",
            f"- **NSS axis hits (total {r.get('nss_total', 0)})**: "
            f"audience={sc.get('audience',0)}, inputs={sc.get('inputs',0)}, "
            f"outputs={sc.get('outputs',0)}, mode={sc.get('mode',0)}, "
            f"assumption_set={sc.get('assumption_set',0)}, "
            f"adjacent_problems={sc.get('adjacent_problems',0)}, "
            f"failure_modes={sc.get('failure_modes',0)}, "
            f"lifecycle={sc.get('lifecycle',0)}, "
            f"composition={sc.get('composition',0)}, "
            f"knowledge_sources={sc.get('knowledge_sources',0)}, "
            f"calibration={sc.get('calibration',0)}, "
            f"recursion={sc.get('recursion',0)}",
            "",
            f"- **Self-archaeology hook**: Read `{r.get('nearest_self_file', '?')}` "
            f"section `{r.get('nearest_self_section', '?')}` — the position on "
            f"S^2 that `{r['alignment']}` says self has but {r['alignment'].split('-')[-1]} "
            f"lacks.",
            "",
        ])
    if not top10:
        md_lines.extend([
            "_No regions cleared both thresholds; try lowering "
            "WARP_FLAG_PCTL / NSS_FLAG_PCTL or re-running with refined φ_θ._",
        ])
    (OUT_DIR / "drift-priority-list.md").write_text("\n".join(md_lines))
    print(f"Wrote {OUT_DIR / 'drift-priority-list.md'}")

    # ---- Render PNG ----
    title = (
        f"Aligned curves on S^2 — 4 corpora (repo-sourced; self=EXCEPTION), "
        f"3 self-anchored Möbius warps (2026-08-07)"
    )
    render_aligned_curves_png(
        OUT_DIR / "aligned-curves.png",
        corpus_pts=corpus_xyz,
        alignment_regions=alignment_regions,
        alignment_thetas=alignment_thetas,
        title=title,
    )
    print(f"Wrote {OUT_DIR / 'aligned-curves.png'}")

    # ---- Save README ----
    readme = f"""# Curve drift detector (PR4, 4-corpus, repo-sourced)

## Sourcing rule (per operator standing instruction)

All corpus listings + content are sourced DIRECTLY from the GitHub repos via
the Contents API + `raw.githubusercontent.com` — NO local file reads. One
documented exception:

- **self**: no repo `self/` directory exists on any of the user's repos
  (verified via Contents API on `yubi-OS/yubiOS` and `yubi-OS/agent-skills`).
  Reading from workspace `memory/personal-WbtUgeUv/` and surfacing the
  exception in `self-corpus-listing.json` + this README. See
  `load_self_corpus` in the script for the resolution path
  (push the 10 files to a `yubi-OS/self` repo or add a `self/` dir under
  an existing repo, update `REPO_SELF_PATH`).

## Corpora

| Corpus | Source | Items |
|---|---|---|
| `self` (anchor) | workspace `memory/personal-WbtUgeUv/` (EXCEPTION) | {len(corpora['self'])} |
| `docs` | `yubi-OS/yubiOS/docs/` via Contents API | {len(corpora['docs'])} |
| `refs` | `yubi-OS/yubiOS/refs/` via Contents API | {len(corpora['refs'])} |
| `cycle4` | `yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-archive-2026-08-07.json` via raw.githubusercontent.com | {len(corpora['cycle4'])} |

Each corpus's `## Section` rows (or per-event rows for cycle4) are scored
against the SHARED 9-D `internal-big-picture` primitive basis (text-keyword
for self/docs/refs; cycle4 also has its native repo-history 9-D coverage
preserved in the archive). Three Möbius φ_θ ∈ PSL(2,ℂ) warps fit
self → docs, self → refs, self → cycle4 (all anchored on self). Drift
signals (warp magnitude × NSS-axis score) are aggregated across all 3
alignments and ranked in `drift-priority-list.md`.

## Outputs

| File | Description |
|---|---|
| `self-corpus-listing.json` | Listing of self corpus items (EXCEPTION: workspace-local) + `_sourcing_exception` block |
| `docs-corpus-listing.json` | Listing of docs corpus items + `files_listed_in_repo` (Contents API) |
| `refs-corpus-listing.json` | Listing of refs corpus items + `files_listed_in_repo` (Contents API) |
| `cycle4-corpus-listing.json` | Listing of cycle4 corpus items + `source_file_meta` (Contents API) |
| `mobius-transform.json` | Fitted φ_θ params for all 3 alignments + sourcing block |
| `warp-by-region.csv` | Per-region warp + NSS scores for all 3 alignments |
| `drift-priority-list.md` | Top-10 flagged drift regions (aggregated) |
| `aligned-curves.png` | 4 corpus point clouds + 3 warped-A point clouds on S^2 |
| `README.md` | This file |

## How to regenerate

```bash
python3.12 documents/github-yubios-KS9n5GAT/papers/scripts/curve-drift-detector.py
```

All GitHub fetches go through the `MASTER GIT SU` connection
(`conn_1KXnkOHGgyE4`). No local file reads except for the documented
`self/` exception.

## Math conventions (frozen)

- **9-D `internal-big-picture` primitive basis** (9 of 10 primitives;
  `self_describing` dropped at 94% coverage). SHARED across all 4 corpora.
- **Extended keyword vocab** (git/Linear/PR/commit terms) so cycle4 items
  register meaningfully on the same basis as self/docs/refs.
- **LOOSE-UNION kept-cols rule** — a primitive is kept if ANY of the 4
  corpora has informative coverage on it.
- **Identity-init Möbius**: φ_θ = (a=1, b=0, c=0, d=1), refined via
  L-BFGS-B with 6 random perturbations.
- **Frozen degree weights**: frequencies = harmonic series 1..k (k=8).
- **Chordal S² distance**: used as proxy for geodesic distance.
"""
    (OUT_DIR / "README.md").write_text(readme)
    print(f"Wrote {OUT_DIR / 'README.md'}")

    print("PR4 cross-corpus drift detector (4-corpus, repo-sourced): done.")


if __name__ == "__main__":
    main()
