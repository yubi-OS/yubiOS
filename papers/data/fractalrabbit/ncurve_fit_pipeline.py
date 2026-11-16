"""
The curve-fit pipeline that consumes the fractalrabbit simulator output.

This is a faithful Python re-implementation of the v3 pipeline documented in
skills/github-yubios-KS9n5GAT/{learned-latent-curve,hyperspherical-harmonic-curve,
single-action-curve-rsi}/SKILL.md:

  Stage 1: 9-D binary coverage → PCA top-2 → (u, v)
           → stereographic projection from south pole → S² point.
  Stage 2: Sparse-cell detection on a 0.05 x 0.05 grid (21 x 21 = 441 cells).
  Stage 3: Per-item single-action (atom) cycle: geodesic distance d(p, p*)
           to ideal pole (1,1,...,1) lifted; flip each missing primitive,
           pick argmin d_post; report Δ = d_pre - d_post.

Every quantity used by the falsification harness comes out of this module so
the test is purely a function of the simulator output and the planted
anomalies.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Tuple

import numpy as np
from sklearn.decomposition import PCA


# ---------------------------------------------------------------------------
# 9-D primitive basis for synthetic waypoint corpus
# ---------------------------------------------------------------------------
# Each primitive is grounded in a specific tier of the fractalrabbit simulator
# (see SKILL.md §Reference for the Tier-1/Tier-2/Tier-3 model). This basis
# is the only place the falsification harness hard-codes domain knowledge —
# everything else is generic curve-fit math.
PRIMITIVE_NAMES = [
    "p0_is_burst",            # observation fell in a reporting burst (Tier 3)
    "p1_is_recurrent",        # visited a site visited >1 time (Tier 2)
    "p2_is_first_visit",      # first time visiting this site (Tier 2)
    "p3_near_fract_limit",    # site within ε of agoraphobic fractal edge (Tier 1)
    "p4_inter_event_long",    # gap since prev obs > median (Tier 3, heavy tail)
    "p5_inter_event_short",   # gap < median/10 (Tier 3, burst)
    "p6_origin_proximity",    # spatial distance to first visited site < median (Tier 2)
    "p7_cross_cluster",       # jumped between AGP clusters — long spatial jump (Tier 1+2)
    "p8_late_trajectory",     # observation in last 20% of trajectory (Tier 2)
]
N_PRIMITIVES = len(PRIMITIVE_NAMES)
assert N_PRIMITIVES == 9


def waypoint_to_primitive_vector(
    obs_idx: int,
    observations: List[int],
    sites: List[Tuple[float, ...]],
    trajectory: List[int],
    visit_count: List[int],
    n_steps: int,
    median_gap: float,
    median_distance: float,
    fract_limit_threshold: float = 0.05,
) -> np.ndarray:
    """
    Map a single observation (index in `observations`) to a 9-D binary
    primitive coverage vector. Pure function — given the simulator artifacts,
    produces the same vector deterministically.
    """
    t = observations[obs_idx]
    site_idx = trajectory[t]
    site = sites[site_idx]
    visited_before = visit_count[site_idx] > 1
    first_visit = visit_count[site_idx] == 1

    # gap since previous observation
    if obs_idx == 0:
        gap = observations[1] - observations[0] if len(observations) > 1 else median_gap
    else:
        gap = observations[obs_idx] - observations[obs_idx - 1]

    # distance to first visited site
    first_site = sites[trajectory[0]]
    origin_dist = math.dist(site, first_site)

    # spatial jump from previous observation
    if obs_idx == 0:
        jump_dist = 0.0
    else:
        prev_t = observations[obs_idx - 1]
        prev_site = sites[trajectory[prev_t]]
        jump_dist = math.dist(site, prev_site)

    v = np.zeros(N_PRIMITIVES, dtype=np.int8)
    v[0] = 1 if gap <= (median_gap / 5.0) else 0                       # p0 burst
    v[1] = 1 if visited_before else 0                                  # p1 recurrent
    v[2] = 1 if first_visit else 0                                     # p2 first visit
    v[3] = 1 if any(math.dist(site, s) < fract_limit_threshold for s in sites) else 0  # p3 fract limit
    v[4] = 1 if gap > (median_gap * 2.0) else 0                        # p4 long gap
    v[5] = 1 if gap < (median_gap / 10.0) else 0                       # p5 short gap
    v[6] = 1 if origin_dist < (median_distance * 0.8) else 0           # p6 origin proximity
    v[7] = 1 if jump_dist > (median_distance * 1.5) else 0             # p7 cross cluster
    v[8] = 1 if t > (0.8 * n_steps) else 0                             # p8 late trajectory
    return v


def build_corpus(
    sim,
) -> Tuple[np.ndarray, List[dict]]:
    """
    Build the (N, 9) coverage matrix from a SimResult.

    Returns:
      C: numpy int8 array of shape (N_observations, 9)
      meta: list of dicts (one per observation) carrying the per-item
            metadata the harness needs to plant + verify sparse cells.
    """
    obs = sim.observations
    n_steps = sim.n_steps
    sites = sim.sites
    trajectory = sim.trajectory
    visit_count = sim.visit_count

    # global statistics
    inter = [
        obs[i + 1] - obs[i] for i in range(len(obs) - 1)
    ] if len(obs) > 1 else [1]
    median_gap = float(np.median(inter)) if inter else 1.0

    distances = []
    first_site = sites[trajectory[0]]
    for t in obs:
        s = sites[trajectory[t]]
        distances.append(math.dist(s, first_site))
    median_distance = float(np.median(distances)) if distances else 0.5

    C = np.zeros((len(obs), N_PRIMITIVES), dtype=np.int8)
    meta = []
    for i in range(len(obs)):
        C[i] = waypoint_to_primitive_vector(
            i, obs, sites, trajectory, visit_count,
            n_steps, median_gap, median_distance,
        )
        meta.append({
            "obs_idx_in_corpus": i,
            "t_in_trajectory": int(obs[i]),
            "site_idx": int(trajectory[obs[i]]),
            "gap": int(obs[i] - obs[i - 1]) if i > 0 else int(obs[1] - obs[0]) if len(obs) > 1 else 1,
        })
    return C, meta


# ---------------------------------------------------------------------------
# Stage 1: 9-D → PCA top-2 → stereographic lift → S²
# ---------------------------------------------------------------------------
def fit_curve(C: np.ndarray, identity_mobius: bool = True) -> dict:
    """
    Lift the (N, 9) coverage matrix to S² via:
      1. Drop near-constant columns (coverage > 0.95 OR < 0.05).
      2. PCA top-2 on remaining columns.
      3. Stereographic projection from south pole onto S².

    Returns a dict with:
      uv: (N, 2) PCA coordinates
      s2: (N, 3) S² points (‖p‖ = 1)
      pc1_pc2_variance: tuple (PC1+PC2 explained variance)
      dropped_columns: list of primitive indices that were dropped
      W2: (k, 2) PCA right-singular vectors (k = surviving columns)
    """
    coverage = C.mean(axis=0)
    keep_mask = (coverage > 0.05) & (coverage < 0.95)
    dropped = [i for i in range(C.shape[1]) if not keep_mask[i]]
    C_kept = C[:, keep_mask]

    if C_kept.shape[1] < 2:
        # not enough variance; return degenerate fit
        return {
            "uv": np.zeros((C.shape[0], 2)),
            "s2": np.tile(np.array([0.0, 0.0, 1.0]), (C.shape[0], 1)),
            "pc1_pc2_variance": (0.0, 0.0),
            "dropped_columns": dropped,
            "W2": np.zeros((C_kept.shape[1], 2)),
        }

    pca = PCA(n_components=2)
    uv = pca.fit_transform(C_kept)
    pc1_pc2 = float(pca.explained_variance_ratio_.sum())

    # stereographic projection from south pole:
    # p = (2u, 2v, u^2 + v^2 - 1) / (u^2 + v^2 + 1)
    u, v = uv[:, 0], uv[:, 1]
    denom = u ** 2 + v ** 2 + 1.0
    s2 = np.stack([2 * u / denom, 2 * v / denom, (u ** 2 + v ** 2 - 1) / denom], axis=1)

    return {
        "uv": uv,
        "s2": s2,
        "pc1_pc2_variance": (float(pca.explained_variance_ratio_[0]),
                              float(pca.explained_variance_ratio_[1])),
        "dropped_columns": dropped,
        "W2": pca.components_.T,
    }


# ---------------------------------------------------------------------------
# Stage 2: Sparse-cell detection on a 0.05 x 0.05 grid
# ---------------------------------------------------------------------------
@dataclass
class SparseCellGrid:
    """21 x 21 sparse-cell detector (matches single-action-curve-rsi §stage 2)."""
    r: float = 0.05
    cells: dict = field(default_factory=dict)  # (i,j) -> [item indices]

    @classmethod
    def from_fit(cls, uv: np.ndarray, r: float = 0.05) -> "SparseCellGrid":
        g = cls(r=r)
        # each (u, v) maps to its cell via floor(u/r), floor(v/r)
        for idx, (u, v) in enumerate(uv):
            i = min(int(u // r), 19)
            j = min(int(v // r), 19)
            g.cells.setdefault((i, j), []).append(idx)
        return g

    def is_sparse(self, i: int, j: int) -> bool:
        return len(self.cells.get((i, j), [])) <= 1  # 0 or 1 neighbor = sparse

    def sparse_cells(self) -> List[Tuple[int, int]]:
        return [(i, j) for (i, j), items in self.cells.items() if self.is_sparse(i, j)]

    def cell_of(self, u: float, v: float) -> Tuple[int, int]:
        return min(int(u // self.r), 19), min(int(v // self.r), 19)


# ---------------------------------------------------------------------------
# Stage 3: Per-item atom (single-action cycle)
# ---------------------------------------------------------------------------
def ideal_pole(C: np.ndarray) -> np.ndarray:
    """
    Ideal pole = perfect coverage vector (all 1s) lifted through the same
    pipeline. Returns (3,) S² point.
    """
    ones = np.ones((1, C.shape[1]), dtype=np.int8)
    fit = fit_curve(C, identity_mobius=True)  # fit on full data
    uv = PCA(n_components=2).fit_transform(C[:, [i for i in range(C.shape[1])
                                                  if (C[:, i].mean() > 0.05 and C[:, i].mean() < 0.95)]])
    # project the all-ones vector into the same PCA basis + stereographic lift
    coverage = C.mean(axis=0)
    keep_mask = (coverage > 0.05) & (coverage < 0.95)
    ones_kept = ones[:, keep_mask].astype(float)
    W2 = fit["W2"]
    proj = ones_kept @ W2
    u, v = proj[0, 0], proj[0, 1]
    denom = u ** 2 + v ** 2 + 1.0
    return np.array([2 * u / denom, 2 * v / denom, (u ** 2 + v ** 2 - 1) / denom])


def chordal_distance(p: np.ndarray, q: np.ndarray) -> float:
    """Euclidean distance between S² points (chordal proxy on the sphere)."""
    return float(np.linalg.norm(p - q))


def atom_single_action(C_row: np.ndarray, pstar: np.ndarray, identity_fit: dict) -> dict:
    """
    For a single item with 9-D coverage C_row:
      - Compute S² point via the identity-init Möbius (use the global W2).
      - Compute d_pre = chordal(p, p*).
      - For each missing primitive i, simulate flip C_row[i]: 0 → 1,
        recompute (u, v) using the same W2, recompute p', recompute d_post.
      - Return the geodesic winner (argmin d_post) and Δ = d_pre - d_post.

    Per Lemma 1 of single-action-curve-rsi: if the geodesic-only criterion
    selects an action, Δ > 0 (or Δ = 0 if the file is at local minimum).
    """
    coverage = C_row.mean(axis=0) if C_row.ndim > 1 else C_row
    # for a single row, treat the coverage vector as the row itself
    if C_row.ndim == 1:
        c = C_row.astype(float)
    else:
        c = C_row.mean(axis=0)
    keep_mask = ~np.isin(np.arange(len(c)), identity_fit["dropped_columns"])
    c_kept = c[keep_mask]
    W2 = identity_fit["W2"]
    proj = c_kept @ W2
    u, v = proj[0], proj[1]
    denom = u ** 2 + v ** 2 + 1.0
    p = np.array([2 * u / denom, 2 * v / denom, (u ** 2 + v ** 2 - 1) / denom])

    d_pre = chordal_distance(p, pstar)

    # enumerate missing primitives (where c_i == 0)
    missing = [i for i in range(len(c)) if c[i] == 0]
    candidates = []
    for i in missing:
        c_flip = c.copy()
        c_flip[i] = 1.0
        c_flip_kept = c_flip[keep_mask]
        proj_flip = c_flip_kept @ W2
        uf, vf = proj_flip[0], proj_flip[1]
        denom_f = uf ** 2 + vf ** 2 + 1.0
        p_flip = np.array([2 * uf / denom_f, 2 * vf / denom_f,
                           (uf ** 2 + vf ** 2 - 1) / denom_f])
        d_post = chordal_distance(p_flip, pstar)
        candidates.append({
            "primitive_idx": i,
            "primitive_name": PRIMITIVE_NAMES[i],
            "d_pre": d_pre,
            "d_post": d_post,
            "delta": d_pre - d_post,
        })

    if not candidates:
        return {"d_pre": d_pre, "d_post": d_pre, "delta": 0.0,
                "winner": None, "candidates": []}

    winner = min(candidates, key=lambda c: c["d_post"])
    return {
        "d_pre": d_pre,
        "d_post": winner["d_post"],
        "delta": winner["delta"],
        "winner": winner,
        "candidates": candidates,
    }
