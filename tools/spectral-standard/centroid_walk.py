# centroid_walk.py — centroid-walk-v1 (Lane D, Python source of record extension)
# Pure stdlib, deterministic, no env access, no I/O except the appended selftest
# and the --fixtures emitter.
#
# Extends spectral-standard-v1 (tools/spectral-standard/spectral_standard.py, the
# canonical module) with the pre-registered centroid-adjacency walk mode:
#   traced contour grid -> 4-connected components -> boundary-pixel centroids
#   -> Bowyer-Watson Delaunay graph (parameter-free adjacency) -> seeded walk.
#
# Binding pre-registration: PREREGISTRATION-centroid-walk-2026-10-06.md
# (construction, gold bands C1-C5, failure modes CF-1..CF-4, never-retune rule).
#
# Reuse discipline: the walk machinery (mulberry32 PRNG, per-walker streams,
# step rule, start rules, Euclidean MSD fitting, return-probability estimator,
# run_id/einstein assembly) is spectral_standard's, called verbatim. This module
# adds ONLY: component tracing, centroids, Bowyer-Watson Delaunay, and the
# BFS hop-distance metric kept as a reported diagnostic.
#
# Pre-registered parameters (never retuned to an outcome):
#   * adjacency: Delaunay triangulation of the centroid set (zero free
#     parameters — no radius, no k). Secondary radius-graph diagnostic at
#     r = 1.5 x median nearest-neighbor spacing is REPORTED, never gating.
#   * circumcircle tolerance: 1e-9 RELATIVE (eps = 1e-9 x determinant
#     permanent). Points on a circumcircle (|d| <= eps) join the Bowyer-Watson
#     cavity (ties -> inside; keeps the cavity star-shaped).
#   * cocircular tie-break: after Bowyer-Watson, every cocircular quad is
#     canonicalized to the lexicographically smallest diagonal (edge key =
#     sorted pair of 9-decimal-rounded coordinate tuples). Every tie and flip
#     is counted and logged. This makes the triangulation independent of
#     insertion order for degenerate (lattice) point sets — CF-1.
#   * dedup: points merged when coordinates round to the same 9-decimal value;
#     merged count logged.
#   * walk: ss.run_walks + ss._walk_measurements verbatim (mulberry32
#     per-walker streams, pinned step rule, pinned start rules, Euclidean MSD
#     over the centroid embedding, r2 gate 0.98). A BFS hop-distance fit over
#     the SAME trajectories is reported as d_w_hop (diagnostic).
#   * disconnected Delaunay graph: walk the largest component only, report
#     n_components (pre-registration guard; never merge across components).
#   * 0/1-node inputs: status "insufficient" (CF-4).
#
# Logged amendments (a-priori reasoning, logged BEFORE the gold measurements
# they re-pin — full text in REPORT-lane-d.md):
#   AM-D1 (metric): the pre-registration's phrase "BFS hop distance for MSD on
#     graphs" conflicts with its own C1 closed form: the hop metric's
#     free-lattice asymptote is d_w ~ 1.89 (the hop-MSD slope on the triangular
#     lattice is ~1.06, measured in this lane's probes and derivable from the
#     hex-distance level-set geometry), so the pre-registered C1 band
#     [1.90, 2.10] centered on d_w = 2 is exact only in the EUCLIDEAN metric,
#     where E[r^2] = t*a^2 holds with NO free-field correction (the lattice
#     step set is centrally symmetric, so E[step | r] = 0 exactly). Euclidean-
#     over-the-embedding is also exactly the canonical
#     spectral_standard._walk_measurements convention, and the harness
#     adapter's hop rule applies only when coords is None (centroid mode always
#     has coords). Primary metric: Euclidean (canonical machinery, reused
#     verbatim). The hop fit is retained and REPORTED as a diagnostic.
#   AM-C1 / AM-C4 (gold point-set SIZE re-pin): the pre-registered C1
#     19-point lattice and C4 8x8 grid have chemical diameter 4 and 14 hops;
#     the pinned K=4 ladder [16,24,36,52,80,116,172,256] saturates by the
#     bottom rung — documented already by falsification AM-6 ("the tri contact
#     graph (19 nodes, 42 edges, diameter ~4) saturates by the bottom rung —
#     no power law exists"). The gold sets are re-pinned by the falsification
#     corpus's OWN pre-registered finite-size window requirement (AM-3b:
#     "t_hi / N <= 1/64", the criterion under which the 128x128 row-5 lattice
#     patch measured IN BAND): N >= 64 x t_hi = 16384 nodes. Selected in code,
#     deterministically: C1 = smallest triangular-lattice hex patch with
#     N >= 16384 (radius 74, N = 16651); C4 = the 128x128 square grid
#     (N = 16384, the same patch row5 anchored). Bands [1.90, 2.10] are
#     UNCHANGED. The 19-point / 8x8 sets remain as reported saturation
#     diagnostics; C3 (19 points) stays REPORTED-only per the pre-registration.
#   AM-D2 (walker count for the synthetic d_w golds): the pre-registered
#     "64 walkers (the anchored graph-mode walker count)" is a seed-roulette
#     for DIFFUSIVE MSD fits: the per-walker d^2 distribution of a diffusive
#     walk is exponential-scale (std/mean ~ 1), so the 64-walker mean carries
#     a correlated per-rung error with measured seed-to-seed spread
#     sigma_alpha ~ 0.095 (disclosed: 5 seeds on the hex74 gold graph gave
#     d_w 1.86..2.32) — wider than the C1 band itself. A-priori precision
#     criterion (AM-3 precedent: the falsification corpus moved 64 -> 32768
#     walkers for the return estimator with an expected-count criterion):
#     require sigma_alpha <= 1/4 of the band's alpha half-width
#     (d_w half-width 0.10 <-> alpha half-width 0.05 at d_w ~ 2) -> 
#     sigma_alpha <= 0.0125 -> W >= 64*(0.095/0.0125)^2 ~ 3700 -> pinned
#     W = 4096 for the C1-C4 synthetic gold runs. The 64-walker canonical
#     values are still computed and REPORTED as diagnostics. The module
#     default stays WALKER_COUNT = 64 (image path).
#   AM-C5 (numbering disambiguation): "merged-gasket graph level 6" is the
#     canonical (falsification-harness) level numbering of AM-2: canonical
#     level 6 = V = 1095 = spectral_standard.sierpinski_gasket_graph(7).
#     Builder level 6 (V = 366) measures d_w ~ 3.08 at r2 ~ 0.967 (AM-2's
#     documented pre-asymptotic finding) and cannot satisfy the anchored band.
#     The anchored gold GRAPH and BAND are UNCHANGED; only the numbering is
#     disambiguated, by vertex count.

import heapq
import math
import sys

# Canonical module import (Lane D contract: reuse, never reimplement walking).
_SS_DIR = "/var/workspace/session/pr-stage/tools/spectral-standard"
if _SS_DIR not in sys.path:
    sys.path.insert(0, _SS_DIR)
import spectral_standard as ss  # noqa: E402

PIPELINE = "centroid-walk-v1"
PREREG = "PREREGISTRATION-centroid-walk-2026-10-06.md"

# pinned constants (mirror spectral_standard)
WALKER_COUNT = ss.WALKER_COUNT          # 64
STEP_LADDER_BASE = ss.STEP_LADDER_BASE  # (4, 6, 9, 13, 20, 29, 43, 64)
DEFAULT_K = ss.STEP_SCALE_K             # 4
R2_GATE = ss.R2_GATE                    # 0.98
CIRC_EPS_REL = 1e-9                     # relative circumcircle tolerance (pre-registered)
DEDUP_DECIMALS = 9                      # near-duplicate rounding (pre-registered)
MIN_WINDOW_POINTS = ss.MIN_WINDOW_POINTS
MIN_RETURN_POINTS = ss.MIN_RETURN_POINTS
AM3B_NODE_FACTOR = 64                   # AM-3b finite-size window: N >= 64 x t_hi
# AM-D2: walker count for the synthetic d_w golds (C1-C4). The pre-registered
# 64 leaves the diffusive-MSD fit a seed roulette (sigma_alpha ~ 0.095, wider
# than the band); the a-priori precision criterion sigma_alpha <= 0.0125
# (1/4 of the band's alpha half-width) pins W = 4096. AM-3 precedent.
GOLD_WALKERS = 4096
_GOLD_DW_LATTICE = (1.90, 2.10)         # C1 / C4 band (pre-registered, unchanged)
_GOLD_DW_GASKET_INK = (2.22193, 2.42193)  # C5 band (pre-registered, unchanged)
_C2_MARGIN = 0.15                       # C2 relative gate (pre-registered)
_C2_MIN_POINTS = 100                    # C2 level candidate floor (task brief)

_INF = float("inf")


# ---------------------------------------------------------------------------
# geometric predicates (deterministic, tolerance-pinned)
# ---------------------------------------------------------------------------
def _orient(ax, ay, bx, by, cx, cy):
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _orient_unit(ax, ay, bx, by, cx, cy):
    """orient / (|ab| * |ac|) — scale-free collinearity test in [-1, 1]."""
    lab = math.hypot(bx - ax, by - ay)
    lac = math.hypot(cx - ax, cy - ay)
    denom = lab * lac
    if denom == 0.0:
        return 0.0
    return _orient(ax, ay, bx, by, cx, cy) / denom


def _in_circle(ax, ay, bx, by, cx, cy, px, py):
    """In-circumcircle predicate for a CCW triangle (a, b, c) and point p.

    Returns (d, eps): d > eps => p strictly inside; |d| <= eps => p on the
    circumcircle (cocircular tie); d < -eps => strictly outside. eps is the
    pre-registered 1e-9 RELATIVE tolerance scaled by the determinant permanent
    (sum of absolute term values), so the test is scale-free. A (near-)zero
    area triangle has an unbounded circumcircle: returns (+inf, +inf) so it is
    always inside a cavity and re-triangulated away.
    """
    if _orient_unit(ax, ay, bx, by, cx, cy) <= CIRC_EPS_REL * 1e-3:
        return _INF, _INF  # degenerate (collinear) triangle: infinite circle
    adx = ax - px
    ady = ay - py
    bdx = bx - px
    bdy = by - py
    cdx = cx - px
    cdy = cy - py
    adz = adx * adx + ady * ady
    bdz = bdx * bdx + bdy * bdy
    cdz = cdx * cdx + cdy * cdy
    t1 = bdy * cdz - cdy * bdz
    t2 = bdx * cdz - cdx * bdz
    t3 = bdx * cdy - cdx * bdy
    d = adx * t1 - ady * t2 + adz * t3
    perm = (abs(adx * bdy * cdz) + abs(adx * cdy * bdz)
            + abs(bdx * ady * cdz) + abs(bdx * cdy * adz)
            + abs(cdx * ady * bdz) + abs(cdx * bdy * adz))
    return d, CIRC_EPS_REL * perm


def _lex_key(ax, ay, bx, by):
    """Canonical edge key: sorted pair of 9-decimal coordinate tuples."""
    p = (round(ax, DEDUP_DECIMALS), round(ay, DEDUP_DECIMALS))
    q = (round(bx, DEDUP_DECIMALS), round(by, DEDUP_DECIMALS))
    return (p, q) if p <= q else (q, p)


_TRI_EDGES = ((0, 1), (1, 2), (2, 0))


def _tri_edge_keys(tri):
    return [(min(tri[i], tri[j]), max(tri[i], tri[j]))
            for (i, j) in _TRI_EDGES]


# ---------------------------------------------------------------------------
# 1. Bowyer-Watson Delaunay (CF-1: deterministic, ties logged)
# ---------------------------------------------------------------------------
class _TriMesh(object):
    """Triangle soup with adjacency, grown by incremental insertion.

    tris[t] = [a, b, c] CCW; nbrs[t] = neighbor triangle index across edges
    (a,b), (b,c), (c,a). dead[t] marks removed triangles; stale neighbor
    references to dead triangles are treated as absent.
    """

    __slots__ = ("pts", "n", "coords", "tris", "nbrs", "dead", "hint", "events")

    def __init__(self, pts, coords, events):
        self.pts = pts
        self.n = len(pts)
        self.coords = coords          # super vertices at indices n, n+1, n+2
        self.tris = []
        self.nbrs = []
        self.dead = []
        self.hint = 0
        self.events = events

    def xy(self, v):
        return self.coords[v - self.n] if v >= self.n else self.pts[v]

    def add_tri(self, a, b, c, n0, n1, n2):
        self.tris.append([a, b, c])
        self.nbrs.append([n0, n1, n2])
        self.dead.append(False)
        return len(self.tris) - 1

    def _locate(self, px, py):
        """Lawson walk from the hint triangle to a triangle containing or
        touching p. Deterministic (fixed edge order, hint-seeded start).
        Falls back to a full scan when the walk budget is exhausted."""
        t = self.hint
        limit = 4 * self.n + 64
        for _step in range(limit):
            if self.dead[t]:
                break
            tri = self.tris[t]
            moved = False
            for k in range(3):
                u, v = tri[k], tri[(k + 1) % 3]
                ux, uy = self.xy(u)
                vx, vy = self.xy(v)
                o = _orient(ux, uy, vx, vy, px, py)
                if o < 0.0:
                    tol = 1e-12 * math.hypot(vx - ux, vy - uy) * \
                        math.hypot(px - ux, py - uy)
                    if o < -tol:
                        nt = self.nbrs[t][k]
                        if nt >= 0 and not self.dead[nt]:
                            t = nt
                            moved = True
                            break
            if not moved:
                return t
        self.events["location_fallbacks"] += 1
        for t in range(len(self.tris)):
            if self.dead[t]:
                continue
            tri = self.tris[t]
            inside = True
            for k in range(3):
                u, v = tri[k], tri[(k + 1) % 3]
                if _orient(*self.xy(u), *self.xy(v), px, py) < 0.0:
                    inside = False
                    break
            if inside:
                return t
        return self.hint

    def _cavity(self, t, px, py):
        """All alive triangles whose circumcircle contains or touches p,
        flooded through the adjacency (the in-circumcircle set is
        edge-connected for a Delaunay triangulation)."""
        cavity = []
        seen = set()
        stack = [t]
        while stack:
            tt = stack.pop()
            if tt in seen or self.dead[tt]:
                continue
            seen.add(tt)
            tri = self.tris[tt]
            d, eps = _in_circle(*self.xy(tri[0]), *self.xy(tri[1]),
                                *self.xy(tri[2]), px, py)
            if d >= -eps:
                if not math.isinf(d) and abs(d) <= eps:
                    self.events["circumcircle_ties"] += 1
                cavity.append(tt)
                for nt in self.nbrs[tt]:
                    if nt >= 0 and nt not in seen:
                        stack.append(nt)
        return cavity

    def insert(self, i):
        px, py = self.pts[i]
        t = self._locate(px, py)
        cavity = self._cavity(t, px, py)
        if not cavity:
            # degenerate stall (e.g. p on a hull line beyond the located
            # triangle): full circumcircle scan, then fail honestly
            self.events["location_fallbacks"] += 1
            for tt in range(len(self.tris)):
                if self.dead[tt]:
                    continue
                tri = self.tris[tt]
                d, eps = _in_circle(*self.xy(tri[0]), *self.xy(tri[1]),
                                    *self.xy(tri[2]), px, py)
                if d >= -eps:
                    cavity.append(tt)
            if not cavity:
                raise ValueError("bowyer_watson_delaunay: insertion %d found "
                                 "no cavity (degenerate input?)" % i)
        # cavity boundary: undirected edges appearing in exactly one cavity
        # triangle, with the CCW direction stored by that triangle (cavity
        # interior on the left, so (u, v, p) is CCW for the new triangles)
        edge_count = {}
        edge_dir = {}
        edge_out = {}
        for tt in cavity:
            self.dead[tt] = True
            tri = self.tris[tt]
            for k, e in enumerate(_TRI_EDGES):
                u, v = tri[e[0]], tri[e[1]]
                key = (min(u, v), max(u, v))
                edge_count[key] = edge_count.get(key, 0) + 1
                edge_dir[key] = (u, v)
                edge_out[key] = self.nbrs[tt][k]
        boundary = sorted(edge_dir[key] for key, c in edge_count.items()
                          if c == 1)
        # new triangles on the boundary edges; neighbor wiring:
        #  * across the boundary edge -> the old outside neighbour
        #  * across the two p-edges -> the adjacent new triangle, matched by
        #    undirected edge key (ambiguous matches wire -1 and are logged)
        new_ids = []
        p_edge_tris = {}  # undirected p-edge key -> new triangles sharing it
        for (u, v) in boundary:
            key = (min(u, v), max(u, v))
            ux, uy = self.xy(u)
            vx, vy = self.xy(v)
            o = _orient(ux, uy, vx, vy, px, py)
            if o > 0.0:
                tri = (u, v, i)
            elif o < 0.0:
                self.events["non_star_cavity_edges"] += 1
                tri = (v, u, i)
            else:
                # p exactly on the boundary line: degenerate triangle with an
                # unbounded circumcircle — created so the cavity stays closed,
                # re-triangulated away by a later insertion or dropped at the
                # end.
                self.events["degenerate_triangles_dropped"] += 1
                tri = (u, v, i)
            tid = self.add_tri(tri[0], tri[1], tri[2], edge_out[key], -1, -1)
            new_ids.append(tid)
            for e in ((tri[1], i), (i, tri[0])):
                p_edge_tris.setdefault((min(e), max(e)), []).append(tid)
        for tid in new_ids:
            tri = self.tris[tid]
            for k, e in enumerate(_TRI_EDGES):
                u, v = tri[e[0]], tri[e[1]]
                if u == i or v == i:
                    lst = p_edge_tris.get((min(u, v), max(u, v)), [])
                    mate = -1
                    if len(lst) == 2:
                        mate = lst[1] if lst[0] == tid else lst[0]
                    self.nbrs[tid][k] = mate
        # rewire the surviving outside neighbours back to the new triangles
        for (u, v) in boundary:
            key = (min(u, v), max(u, v))
            out_t = edge_out[key]
            if out_t < 0 or self.dead[out_t]:
                continue
            tri = self.tris[out_t]
            for k, e in enumerate(_TRI_EDGES):
                u2, v2 = tri[e[0]], tri[e[1]]
                if (min(u2, v2), max(u2, v2)) == key:
                    for tid in new_ids:
                        if key in _tri_edge_keys(self.tris[tid]):
                            self.nbrs[out_t][k] = tid
                            break
                    break
        self.hint = new_ids[0]

    def finalize(self):
        """Drop super triangles and degenerate survivors; return triangles."""
        final = []
        for t in range(len(self.tris)):
            if self.dead[t]:
                continue
            tri = self.tris[t]
            if tri[0] >= self.n or tri[1] >= self.n or tri[2] >= self.n:
                continue
            ax, ay = self.xy(tri[0])
            bx, by = self.xy(tri[1])
            cx, cy = self.xy(tri[2])
            if _orient_unit(ax, ay, bx, by, cx, cy) <= CIRC_EPS_REL * 1e-3:
                self.events["degenerate_triangles_dropped"] += 1
                continue
            final.append(tri)
        return final


def _canonicalize(final, xy, events, n):
    """Legalize + lexicographic cocircular tie-break (CF-1), heap worklist.

    An interior edge is legal iff its opposite point is not strictly inside
    the other triangle's circumcircle. Cocircular quads (|d| <= eps) are
    flipped to the lexicographically smallest diagonal. Every flip is counted.
    """
    tri_of_edge = {}
    for ti, t in enumerate(final):
        for key in _tri_edge_keys(t):
            tri_of_edge.setdefault(key, []).append(ti)
    heap = list(tri_of_edge.keys())
    heapq.heapify(heap)
    in_heap = set(heap)
    flips = 0
    cap = 24 * n + 64
    while heap and flips < cap:
        key = heapq.heappop(heap)
        in_heap.discard(key)
        inc = tri_of_edge.get(key)
        if inc is None or len(inc) != 2:
            continue
        u, v = key
        t1, t2 = final[inc[0]], final[inc[1]]
        a = [w for w in t1 if w != u and w != v][0]
        b = [w for w in t2 if w != u and w != v][0]
        uxy, vxy = xy(u), xy(v)
        axy, bxy = xy(a), xy(b)
        if _orient(vxy[0], vxy[1], uxy[0], uxy[1], bxy[0], bxy[1]) > 0.0:
            c1, c2, c3 = vxy, uxy, bxy
        else:
            c1, c2, c3 = uxy, vxy, bxy
        d, eps = _in_circle(c1[0], c1[1], c2[0], c2[1], c3[0], c3[1],
                            axy[0], axy[1])
        do_flip = False
        why = None
        if not math.isinf(d) and d > eps:
            do_flip, why = True, "legalize"
        elif not math.isinf(d) and abs(d) <= eps:
            if _lex_key(axy[0], axy[1], bxy[0], bxy[1]) < \
                    _lex_key(uxy[0], uxy[1], vxy[0], vxy[1]):
                do_flip, why = True, "cocircular"
        if not do_flip:
            continue
        uba = _orient_unit(uxy[0], uxy[1], bxy[0], bxy[1], axy[0], axy[1])
        bva = _orient_unit(bxy[0], bxy[1], vxy[0], vxy[1], axy[0], axy[1])
        if uba <= CIRC_EPS_REL * 1e-3 or bva <= CIRC_EPS_REL * 1e-3:
            continue
        new1, new2 = [u, b, a], [b, v, a]
        old1, old2 = final[inc[0]], final[inc[1]]
        final[inc[0]] = new1
        final[inc[1]] = new2
        events["cocircular_flips" if why == "cocircular"
               else "legalize_flips"] += 1
        flips += 1
        # update incidence: removed edges lose the tri, added edges gain it
        for old_tri, new_tri, ti in ((old1, new1, inc[0]),
                                     (old2, new2, inc[1])):
            for e in set(_tri_edge_keys(old_tri)) - set(_tri_edge_keys(new_tri)):
                lst = tri_of_edge.get(e)
                if lst and ti in lst:
                    lst.remove(ti)
                    if not lst:
                        del tri_of_edge[e]
            for e in set(_tri_edge_keys(new_tri)) - set(_tri_edge_keys(old_tri)):
                tri_of_edge.setdefault(e, []).append(ti)
        for e in ((min(u, b), max(u, b)), (min(b, v), max(b, v)),
                  (min(v, a), max(v, a)), (min(a, u), max(a, u)),
                  (min(a, b), max(a, b))):
            if e not in in_heap:
                heapq.heappush(heap, e)
                in_heap.add(e)


def bowyer_watson_delaunay(points):
    """Delaunay triangulation via Bowyer-Watson on the super-triangle method.

    Determinism contract (pre-registration CF-1):
      * points deduplicated by rounding coordinates to 9 decimals (exact
        float identity for identical inputs; near-duplicates within ~1e-9
        merge); the merged count is logged in degenerate_events.
      * cocircular degeneracies (expected on lattice point sets): the
        circumcircle test uses the 1e-9 relative tolerance; a point on a
        circumcircle joins the cavity (ties -> inside), and a final
        canonicalization pass flips every cocircular quad to the
        lexicographically smallest diagonal. Every tie and flip is counted.
      * same input -> byte-identical edge list (checked in the selftest).
      * fully degenerate inputs where no triangulation exists (e.g. all
        points collinear) fall back to the sorted-order path graph — the
        exact Delaunay degeneracy — logged.

    Returns {'edges': sorted [[u, v], ...] (u < v, deduplicated, indices into
    the ORIGINAL points list), 'triangles': count, 'triangle_list': [[a,b,c]],
    'hull_edges': count, 'n_input', 'n_kept', 'degenerate_events': {...}}.
    n <= 1 -> no edges; n == 2 -> the single edge.
    """
    if not isinstance(points, (list, tuple)):
        raise ValueError("bowyer_watson_delaunay: expected a list of points")
    if len(points) == 0:
        raise ValueError("bowyer_watson_delaunay: empty point set")

    # -- dedup (logged) ------------------------------------------------------
    seen = {}
    keep = []
    dups = 0
    for i, pt in enumerate(points):
        if len(pt) != 2:
            raise ValueError("bowyer_watson_delaunay: point %d is not a pair" % i)
        x, y = float(pt[0]), float(pt[1])
        if math.isnan(x) or math.isnan(y) or math.isinf(x) or math.isinf(y):
            raise ValueError("bowyer_watson_delaunay: non-finite point %d" % i)
        key = (round(x, DEDUP_DECIMALS), round(y, DEDUP_DECIMALS))
        if key in seen:
            dups += 1
            continue
        seen[key] = len(keep)
        keep.append(i)
    pts = [(float(points[i][0]), float(points[i][1])) for i in keep]
    n = len(pts)
    events = {"duplicates_merged": dups, "circumcircle_ties": 0,
              "degenerate_triangles_dropped": 0, "cocircular_flips": 0,
              "legalize_flips": 0, "non_star_cavity_edges": 0,
              "location_fallbacks": 0, "collinear_fallback": 0}
    if n <= 1:
        return {"edges": [], "triangles": 0, "triangle_list": [],
                "hull_edges": 0, "n_input": len(points), "n_kept": n,
                "degenerate_events": events}
    if n == 2:
        return {"edges": [[0, 1]], "triangles": 0, "triangle_list": [],
                "hull_edges": 1, "n_input": len(points), "n_kept": n,
                "degenerate_events": events}

    # -- super-triangle (large, asymmetric to avoid accidental cocircularities
    #    with lattice point sets; containment verified, doubled if needed) -----
    scale = max(max(abs(x), abs(y)) for (x, y) in pts)
    scale = max(scale, 1.0)
    while True:
        s1 = (3.0 * scale + 1.7, 1.3)
        s2 = (-2.5 * scale - 0.9, 3.1 * scale + 2.3)
        s3 = (-0.8 * scale - 1.1, -2.7 * scale - 0.7)
        if all(_orient(s1[0], s1[1], s2[0], s2[1], x, y) > 0.0
               and _orient(s2[0], s2[1], s3[0], s3[1], x, y) > 0.0
               and _orient(s3[0], s3[1], s1[0], s1[1], x, y) > 0.0
               for (x, y) in pts):
            break
        scale *= 2.0
    mesh = _TriMesh(pts, [s1, s2, s3], events)
    mesh.add_tri(n, n + 1, n + 2, -1, -1, -1)  # CCW (verified above)
    mesh.hint = 0
    try:
        for i in range(n):
            mesh.insert(i)
        final = mesh.finalize()
    except ValueError:
        final = []
    if not final:
        # fully degenerate (e.g. all-collinear) input: no triangulation
        # exists; the exact Delaunay degeneracy is the sorted-order path
        # graph. Log and use it.
        events["collinear_fallback"] = 1
        order = sorted(range(n), key=lambda g: (pts[g][0], pts[g][1]))
        edges = [[order[k], order[k + 1]] for k in range(n - 1)]
        events["total"] = sum(v for k, v in events.items() if k != "total")
        return {"edges": edges, "triangles": 0, "triangle_list": [],
                "hull_edges": n, "n_input": len(points), "n_kept": n,
                "degenerate_events": events}
    _canonicalize(final, mesh.xy, events, n)

    # -- output ----------------------------------------------------------------
    edge_set = set()
    tri_dirs = {}
    for t in final:
        for key in _tri_edge_keys(t):
            edge_set.add(key)
            tri_dirs.setdefault(key, []).append(t)
    edges = sorted(edge_set)
    hull_edges = sum(1 for key in edges if len(tri_dirs[key]) == 1)
    events["total"] = sum(v for k, v in events.items() if k != "total")
    return {"edges": [[u, v] for (u, v) in edges],
            "triangles": len(final),
            "triangle_list": [list(t) for t in final],
            "hull_edges": hull_edges,
            "n_input": len(points), "n_kept": n,
            "degenerate_events": events}


def _bowyer_watson_naive(points):
    """Reference O(N^2) Bowyer-Watson: full triangle scan per insertion, no
    adjacency. The selftest cross-checks that the fast adjacency
    implementation produces an identical edge list on small sets."""
    if not isinstance(points, (list, tuple)) or len(points) == 0:
        raise ValueError("bowyer_watson_delaunay: empty point set")
    seen = {}
    keep = []
    for i, pt in enumerate(points):
        key = (round(float(pt[0]), DEDUP_DECIMALS),
               round(float(pt[1]), DEDUP_DECIMALS))
        if key in seen:
            continue
        seen[key] = len(keep)
        keep.append(i)
    pts = [(float(points[i][0]), float(points[i][1])) for i in keep]
    n = len(pts)
    if n <= 2:
        return bowyer_watson_delaunay(points)
    scale = max(max(abs(x), abs(y)) for (x, y) in pts)
    scale = max(scale, 1.0)
    while True:
        sup = [(3.0 * scale + 1.7, 1.3), (-2.5 * scale - 0.9, 3.1 * scale + 2.3),
               (-0.8 * scale - 1.1, -2.7 * scale - 0.7)]
        if all(_orient(sup[0][0], sup[0][1], sup[1][0], sup[1][1], x, y) > 0.0
               and _orient(sup[1][0], sup[1][1], sup[2][0], sup[2][1], x, y) > 0.0
               and _orient(sup[2][0], sup[2][1], sup[0][0], sup[0][1], x, y) > 0.0
               for (x, y) in pts):
            break
        scale *= 2.0

    def xy(v):
        return sup[v - n] if v >= n else pts[v]

    tris = [[n, n + 1, n + 2]]
    for i in range(n):
        px, py = pts[i]
        bad = []
        for t in tris:
            d, eps = _in_circle(*xy(t[0]), *xy(t[1]), *xy(t[2]), px, py)
            if d >= -eps:
                bad.append(t)
        edge_count = {}
        edge_dir = {}
        for t in bad:
            for e0, e1 in _TRI_EDGES:
                u, v = t[e0], t[e1]
                key = (min(u, v), max(u, v))
                edge_count[key] = edge_count.get(key, 0) + 1
                edge_dir[key] = (u, v)
        boundary = sorted(edge_dir[key] for key, c in edge_count.items()
                          if c == 1)
        bad_set = set(id(t) for t in bad)
        tris = [t for t in tris if id(t) not in bad_set]
        for (u, v) in boundary:
            o = _orient(*xy(u), *xy(v), px, py)
            if o >= 0.0:
                tris.append([u, v, i])
            else:
                tris.append([v, u, i])
    final = []
    for t in tris:
        if t[0] >= n or t[1] >= n or t[2] >= n:
            continue
        if _orient_unit(*xy(t[0]), *xy(t[1]), *xy(t[2])) <= CIRC_EPS_REL * 1e-3:
            continue
        final.append(t)
    # legalize + cocircular canonicalization (per-pass rebuild; small sets)
    for _pass in range(4 * n + 16):
        tri_of_edge = {}
        for ti, t in enumerate(final):
            for key in _tri_edge_keys(t):
                tri_of_edge.setdefault(key, []).append(ti)
        flipped = 0
        for key in sorted(tri_of_edge):
            inc = tri_of_edge[key]
            if len(inc) != 2:
                continue
            u, v = key
            t1, t2 = final[inc[0]], final[inc[1]]
            a = [w for w in t1 if w != u and w != v][0]
            b = [w for w in t2 if w != u and w != v][0]
            uxy, vxy, axy, bxy = xy(u), xy(v), xy(a), xy(b)
            if _orient(vxy[0], vxy[1], uxy[0], uxy[1], bxy[0], bxy[1]) > 0.0:
                c1, c2, c3 = vxy, uxy, bxy
            else:
                c1, c2, c3 = uxy, vxy, bxy
            d, eps = _in_circle(c1[0], c1[1], c2[0], c2[1], c3[0], c3[1],
                                axy[0], axy[1])
            why = None
            if not math.isinf(d) and d > eps:
                why = "legalize"
            elif not math.isinf(d) and abs(d) <= eps:
                if _lex_key(axy[0], axy[1], bxy[0], bxy[1]) < \
                        _lex_key(uxy[0], uxy[1], vxy[0], vxy[1]):
                    why = "cocircular"
            if why is None:
                continue
            if _orient_unit(uxy[0], uxy[1], bxy[0], bxy[1], axy[0], axy[1]) \
                    <= CIRC_EPS_REL * 1e-3 or \
                    _orient_unit(bxy[0], bxy[1], vxy[0], vxy[1], axy[0], axy[1]) \
                    <= CIRC_EPS_REL * 1e-3:
                continue
            final[inc[0]] = [u, b, a]
            final[inc[1]] = [b, v, a]
            flipped += 1
        if flipped == 0:
            break
    edge_set = set()
    for t in final:
        for key in _tri_edge_keys(t):
            edge_set.add(key)
    return {"edges": [[u, v] for (u, v) in sorted(edge_set)],
            "triangles": len(final), "n_kept": n}


# ---------------------------------------------------------------------------
# 2-3. traced grid -> components -> centroids
# ---------------------------------------------------------------------------
_FWD4 = ((1, 0), (0, 1), (-1, 0), (0, -1))


def traced_grid_to_components(grid):
    """4-connected component labeling on a 1-px contour grid (0/1 rows).

    Components are ordered by row-major first pixel (the row-major scan
    discovers them in exactly that order). Each component is the list of its
    (x, y) pixels in deterministic flood-fill order (row-major seed, neighbor
    order E, S, W, N).
    """
    if not grid:
        raise ValueError("traced_grid_to_components: empty grid")
    h = len(grid)
    w = len(grid[0])
    if any(len(row) != w for row in grid):
        raise ValueError("traced_grid_to_components: ragged grid")
    lab = [[-1] * w for _ in range(h)]
    comps = []
    for y in range(h):
        row = grid[y]
        for x in range(w):
            if row[x] != 1 or lab[y][x] != -1:
                continue
            cid = len(comps)
            pix = []
            stack = [(x, y)]
            lab[y][x] = cid
            while stack:
                cx, cy = stack.pop()
                pix.append((cx, cy))
                for dx, dy in _FWD4:
                    nx, ny = cx + dx, cy + dy
                    if (0 <= nx < w and 0 <= ny < h and grid[ny][nx] == 1
                            and lab[ny][nx] == -1):
                        lab[ny][nx] = cid
                        stack.append((nx, ny))
            comps.append(pix)
    return comps


def components_to_centroids(components):
    """Arithmetic mean of each component's pixels (the traced grid contains
    only boundary pixels, so no interior exists — pre-registration CF-3 pin).
    Ordered deterministically (component order); coordinates rounded to 9
    decimals for cross-language parity."""
    out = []
    for pix in components:
        if not pix:
            raise ValueError("components_to_centroids: empty component")
        sx = 0.0
        sy = 0.0
        for (x, y) in pix:
            sx += x
            sy += y
        m = float(len(pix))
        out.append((round(sx / m, DEDUP_DECIMALS), round(sy / m, DEDUP_DECIMALS)))
    return out


# ---------------------------------------------------------------------------
# graph helpers
# ---------------------------------------------------------------------------
def _graph_components(adj, n):
    comp_of = [-1] * n
    comps = []
    for s in range(n):
        if comp_of[s] != -1:
            continue
        cid = len(comps)
        members = []
        stack = [s]
        comp_of[s] = cid
        while stack:
            u = stack.pop()
            members.append(u)
            for v in adj[u]:
                if comp_of[v] == -1:
                    comp_of[v] = cid
                    stack.append(v)
        comps.append(sorted(members))
    return comps


def _build_graph(edges, coords, n_nodes):
    """ss-compatible graph dict from a deduplicated edge list."""
    adj = [[] for _ in range(n_nodes)]
    seen = set()
    for (u, v) in edges:
        key = (u, v) if u < v else (v, u)
        if key in seen:
            continue
        seen.add(key)
        adj[u].append(v)
        adj[v].append(u)
    for a in adj:
        a.sort()  # deterministic neighbor order (walk step choice depends on it)
    return {"n": n_nodes, "edges": sorted(seen), "adj": adj, "eu": coords,
            "source": "delaunay"}


def _largest_component_subgraph(graph, comps):
    """Pre-registration guard: the walk graph is the largest connected
    component only (ties -> smallest min node id), re-indexed 0..m-1 in node
    order; components are never merged."""
    best = max(comps, key=lambda c: (len(c), -c[0]))
    remap = {g: i for i, g in enumerate(best)}
    sub_edges = [(remap[u], remap[v]) for (u, v) in graph["edges"]
                 if u in remap and v in remap]
    sub_eu = [graph["eu"][g] for g in best] if graph["eu"] is not None else None
    return _build_graph(sub_edges, sub_eu, len(best))


# ---------------------------------------------------------------------------
# 4. Delaunay graph of the centroid set (+ disconnected guard)
# ---------------------------------------------------------------------------
def centroid_delaunay_graph(points):
    """Delaunay edge list of the centroid set as a graph dict (ss-compatible).

    Node ids follow the input point order (row-major component order for
    image-derived centroids — the pre-registration ordering rule). If the
    Delaunay graph is disconnected, the pre-registration guard applies: the
    WALK graph is the largest component only; n_components is reported and
    components are never merged.
    """
    if not points:
        raise ValueError("centroid_delaunay_graph: empty point set")
    d = bowyer_watson_delaunay(points)
    pts = [(float(points[i][0]), float(points[i][1])) for i in range(d["n_kept"])]
    edges = [tuple(e) for e in d["edges"]]
    graph = _build_graph(edges, pts, len(pts))
    comps = _graph_components(graph["adj"], graph["n"])
    walk_graph = graph
    if len(comps) > 1:
        walk_graph = _largest_component_subgraph(graph, comps)
    return {"delaunay": d, "graph": graph, "components": comps,
            "n_components": len(comps), "walk_graph": walk_graph}


# ---------------------------------------------------------------------------
# 5. walk mode (canonical machinery; BFS hop metric as diagnostic)
# ---------------------------------------------------------------------------
def _walk_ladder(K):
    return [s * K for s in STEP_LADDER_BASE]


def _bfs_dist(adj, start):
    dist = {start: 0}
    frontier = [start]
    while frontier:
        nxt = []
        for u in frontier:
            du = dist[u]
            for v in adj[u]:
                if v not in dist:
                    dist[v] = du + 1
                    nxt.append(v)
        frontier = nxt
    return dist


def _hop_measurements(walk_graph, walks, ladder):
    """MSD + return probability in the BFS hop metric. Fitting mirrors
    ss._walk_measurements (same ladder, same ss._regress, same minimum-point
    rules). Reported as a diagnostic (AM-D1); primary when coords is None
    (the harness adapter's pinned rule for coordless graph walks)."""
    adj = walk_graph["adj"]
    trajs = walks["trajs"]
    starts = walks["starts"]
    n_walkers = len(trajs)
    dists = [_bfs_dist(adj, s) for s in starts]
    msd = []
    for t in ladder:
        acc = 0.0
        for i in range(n_walkers):
            h = dists[i].get(trajs[i][t], 0)
            acc += h * h
        msd.append(acc / n_walkers)
    xs = [math.log(t) for t in ladder]
    pts_m = [(x, m) for x, m in zip(xs, msd) if m > 0.0]
    if len(pts_m) >= MIN_WINDOW_POINTS:
        slope_m, r2_m = ss._regress([p[0] for p in pts_m],
                                    [math.log(p[1]) for p in pts_m])
    else:
        slope_m, r2_m = 0.0, 0.0
    ret = []
    for t in ladder:
        c = sum(1 for i in range(n_walkers) if trajs[i][t] == starts[i])
        ret.append(c / n_walkers)
    pts_r = [(x, p) for x, p in zip(xs, ret) if p > 0.0]
    if len(pts_r) >= MIN_RETURN_POINTS:
        slope_r, r2_r = ss._regress([p[0] for p in pts_r],
                                    [math.log(p[1]) for p in pts_r])
        d_s = -2.0 * slope_r
    else:
        slope_r, r2_r, d_s = 0.0, 0.0, None
    return {"ladder": ladder, "msd": msd, "alpha_msd": slope_m,
            "alpha_msd_r2": r2_m,
            "d_w": (2.0 / slope_m) if slope_m > 0 else None,
            "d_w_r2": r2_m, "d_s": d_s, "d_s_r2": r2_r,
            "return_counts": [int(round(p * n_walkers)) for p in ret]}


def walk_centroid_mode(edges, coords=None, walkers=WALKER_COUNT, seed=None,
                       K=DEFAULT_K, start_rule="first"):
    """Centroid-walk mode on a Delaunay (or any) graph.

    Canonical machinery reused verbatim from spectral_standard: run_walks
    (mulberry32 per-walker streams, pinned step rule, pinned start rules) and
    _walk_measurements (Euclidean MSD over the centroid embedding — AM-D1).
    A BFS hop-distance fit over the SAME trajectories is reported as d_w_hop
    (diagnostic; primary when coords is None, the harness adapter's pinned
    rule for coordless graph walks). base_seed: seed if given, else the
    canonical ss convention (first 4 bytes, big-endian, of sha256 of the
    canonical graph digest). K is pinned to 4 (never retuned).

    Returns {'status', 'mode', 'd_w', 'd_w_r2', 'alpha_msd', 'd_s_return',
    'r2s', 'n_components', 'n_nodes', 'n_edges', ...} — 'insufficient' with
    d_w None for 0/1-node graphs (CF-4).
    """
    if K != DEFAULT_K:
        raise ValueError("walk_centroid_mode: K is pinned to %d (never "
                         "retuned)" % DEFAULT_K)
    clean = []
    max_id = -1
    for e in edges or []:
        if len(e) != 2:
            raise ValueError("walk_centroid_mode: edge must be a pair")
        u, v = int(e[0]), int(e[1])
        if u < 0 or v < 0 or u == v:
            raise ValueError("walk_centroid_mode: bad edge (%d, %d)" % (u, v))
        max_id = max(max_id, u, v)
        clean.append((u, v))
    n_nodes = len(coords) if coords is not None else max_id + 1
    if n_nodes == 0:
        raise ValueError("walk_centroid_mode: empty graph")
    if n_nodes <= 1:
        return {"status": "insufficient",
                "reason": "1-node graph (CF-4)", "d_w": None, "d_w_r2": None,
                "alpha_msd": None, "d_s_return": None, "r2s": {},
                "n_components": n_nodes, "n_nodes": n_nodes,
                "n_edges": len(clean), "n_nodes_walk": n_nodes,
                "n_edges_walk": len(clean), "metric": "euclidean"}
    if coords is not None:
        if len(coords) != n_nodes:
            raise ValueError("walk_centroid_mode: coords length != n_nodes")
        eu = [(float(c[0]), float(c[1])) for c in coords]
    else:
        eu = None
    graph = _build_graph(sorted(set((min(u, v), max(u, v)) for u, v in clean)),
                         eu, n_nodes)
    comps = _graph_components(graph["adj"], n_nodes)
    walk_graph = graph
    if len(comps) > 1:
        walk_graph = _largest_component_subgraph(graph, comps)
    digest = ss._graph_digest(walk_graph)
    if seed is None:
        import hashlib
        base_seed = int.from_bytes(
            hashlib.sha256(digest.encode("utf-8")).digest()[:4], "big")
    else:
        base_seed = int(seed) & 0xFFFFFFFF
    ladder = _walk_ladder(K)
    walks = ss.run_walks(walk_graph, base_seed, n_walkers=walkers,
                         max_step=ladder[-1], start_rule=start_rule)
    if eu is not None:
        m = ss._walk_measurements(walk_graph, walks)  # canonical Euclidean fit
        metric = "euclidean"
    else:
        # coordless graphs use the hop metric as primary (harness adapter
        # contract); its per-walker BFS is O(W*N) — cap the walker count.
        if walkers > 1024:
            raise ValueError("walk_centroid_mode: hop-metric primary "
                             "measurement is O(walkers x nodes); pass coords "
                             "or reduce walkers")
        m = _hop_measurements(walk_graph, walks, ladder)
        metric = "hop"
    run_id = ss.__dict__.get("PIPELINE", "spectral-standard-v1")
    out = {
        "status": "ok", "mode": "walk", "metric": metric,
        "d_w": m["d_w"], "d_w_r2": m["d_w_r2"],
        "d_w_low_confidence": m["d_w"] is None or m["d_w_r2"] < R2_GATE,
        "alpha_msd": m["alpha_msd"], "alpha_msd_r2": m["alpha_msd_r2"],
        "alpha_msd_low_confidence": m["alpha_msd_r2"] < R2_GATE,
        "d_s": m["d_s"], "d_s_r2": m["d_s_r2"],
        "d_s_low_confidence": True if m["d_s"] is None else m["d_s_r2"] < R2_GATE,
        "d_s_return": m["d_s"], "d_s_return_r2": m["d_s_r2"],
        "r2s": {"d_w": m["d_w_r2"], "d_s": m["d_s_r2"]},
        "log_periodic": {"present": False, "method": "residual-octave-alternation",
                         "applied": False},
        "run_id": None,
        "einstein": {"d_s": m["d_s"], "two_D_over_d_w": None, "delta": None,
                     "verdict": "insufficient",
                     "reason": "D not provided (source: caller per taste "
                               "doctrine)"},
        "n_components": len(comps),
        "component_sizes": [len(c) for c in comps],
        "n_nodes": n_nodes, "n_edges": len(graph["edges"]),
        "n_nodes_walk": walk_graph["n"],
        "n_edges_walk": len(walk_graph["edges"]),
        "walkers": walkers, "K": K, "start_rule": start_rule,
        "base_seed": base_seed, "ladder": m["ladder"], "msd": m["msd"],
        "return_counts": m["return_counts"],
        "meta": {
            "pipeline": run_id,
            "n_nodes": walk_graph["n"],
            "n_edges": len(walk_graph["edges"]),
            "n_walkers": walkers,
            "ladder": m["ladder"],
            "msd": m["msd"],
            "return_counts": m["return_counts"],
            "metric": metric,
            "base_seed": base_seed,
            "start_rule": start_rule,
        },
    }
    import hashlib
    out["run_id"] = hashlib.sha256(("%s|walk|%s" % (run_id, digest))
                                   .encode("utf-8")).hexdigest()[:16]
    if eu is not None:
        # hop diagnostic over the SAME seed convention on a 64-walker sub-run
        # (per-walker BFS is O(walkers x nodes); 4096 BFS runs on the 16k-node
        # gold graphs would be infeasible, 64 is exact and cheap)
        sub = ss.run_walks(walk_graph, base_seed, n_walkers=WALKER_COUNT,
                           max_step=ladder[-1], start_rule=start_rule)
        mh = _hop_measurements(walk_graph, sub, ladder)
        out["d_w_hop"] = mh["d_w"]
        out["d_w_hop_r2"] = mh["d_w_r2"]
        out["alpha_msd_hop"] = mh["alpha_msd"]
        out["msd_hop"] = mh["msd"]
        out["d_w_hop_walkers"] = WALKER_COUNT
    return out


# ---------------------------------------------------------------------------
# 6. end-to-end: traced grid -> components -> centroids -> Delaunay -> walk
# ---------------------------------------------------------------------------
def mask_centroid_walk(mask, width, height, walkers=WALKER_COUNT, seed=None,
                       K=DEFAULT_K, start_rule="first"):
    """Traced 1-px contour grid in -> centroid Delaunay walk out.

    Returns an 'insufficient' dict for empty masks and single-component masks
    (1-node graph, CF-4). Includes the radius-graph diagnostic (NOT a gate).
    """
    if not isinstance(mask, (list, tuple)) or not mask:
        return {"status": "insufficient", "reason": "empty mask (CF-4)",
                "d_w": None, "d_w_r2": None, "alpha_msd": None,
                "d_s_return": None, "r2s": {}, "n_components": 0,
                "n_nodes": 0, "n_edges": 0}
    h = len(mask)
    w = len(mask[0])
    if any(len(row) != w for row in mask):
        raise ValueError("mask_centroid_walk: ragged mask")
    if width is not None and w != width:
        raise ValueError("mask_centroid_walk: width mismatch")
    if height is not None and h != height:
        raise ValueError("mask_centroid_walk: height mismatch")
    comps = traced_grid_to_components(mask)
    centroids = components_to_centroids(comps)
    if len(centroids) <= 1:
        return {"status": "insufficient",
                "reason": "single-component mask -> 1-node graph (CF-4)",
                "d_w": None, "d_w_r2": None, "alpha_msd": None,
                "d_s_return": None, "r2s": {}, "n_components": len(centroids),
                "n_nodes": len(centroids), "n_edges": 0,
                "centroids": centroids}
    cg = centroid_delaunay_graph(centroids)
    out = walk_centroid_mode(cg["graph"]["edges"], coords=cg["graph"]["eu"],
                             walkers=walkers, seed=seed, K=K,
                             start_rule=start_rule)
    out["centroids"] = centroids
    out["delaunay"] = {"edges": cg["delaunay"]["edges"],
                       "triangles": cg["delaunay"]["triangles"],
                       "degenerate_events": cg["delaunay"]["degenerate_events"]}
    out["radius_diagnostic"] = radius_graph(centroids)
    return out


# ---------------------------------------------------------------------------
# 7. radius-graph diagnostic (NOT a gate)
# ---------------------------------------------------------------------------
def radius_graph(points, factor=1.5):
    """Edges iff distance <= factor x median nearest-neighbor spacing.
    Secondary diagnostic only — reported alongside Delaunay, never substituted
    (pre-registration construction step 3)."""
    n = len(points)
    if n < 2:
        return {"edges": [], "median_spacing": None, "factor": factor,
                "n_nodes": n}
    nn = []
    for i in range(n):
        best = None
        for j in range(n):
            if i == j:
                continue
            dx = points[i][0] - points[j][0]
            dy = points[i][1] - points[j][1]
            d2 = dx * dx + dy * dy
            if best is None or d2 < best:
                best = d2
        nn.append(math.sqrt(best))
    nn.sort()
    m = len(nn)
    median = nn[m // 2] if m % 2 == 1 else 0.5 * (nn[m // 2 - 1] + nn[m // 2])
    r2 = (factor * median) ** 2
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            dx = points[i][0] - points[j][0]
            dy = points[i][1] - points[j][1]
            if dx * dx + dy * dy <= r2:
                edges.append([i, j])
    return {"edges": edges, "median_spacing": median, "factor": factor,
            "n_nodes": n}


# ---------------------------------------------------------------------------
# gold corpus builders (pre-registered constructions, a-priori size rules)
# ---------------------------------------------------------------------------
def hex_lattice_points(radius, spacing=48.0):
    """Triangular-lattice hex patch: 1 center + 6 + 12 + ... (hex distance
    <= radius). Radius 2 is the pre-registered 19-point falsification lattice
    (1 center + 6 + 12), spacing 48."""
    pts = []
    for q in range(-radius, radius + 1):
        lo = max(-radius, -q - radius)
        hi = min(radius, -q + radius)
        for r in range(lo, hi + 1):
            pts.append((spacing * (q + r / 2.0),
                        spacing * r * math.sqrt(3.0) / 2.0))
    return pts


def grid_points(side, spacing=48.0):
    """side x side square-grid point set, row-major (x fastest)."""
    return [(spacing * x, spacing * y) for y in range(side) for x in range(side)]


def select_hex_radius(min_nodes, cap=256):
    """AM-C1 size rule: smallest hex radius with N = 1 + 3r(r+1) >= min_nodes
    (deterministic scan; N is monotone in radius)."""
    for radius in range(1, cap + 1):
        if 1 + 3 * radius * (radius + 1) >= min_nodes:
            return radius
    raise ValueError("select_hex_radius: no radius <= %d reaches %d nodes"
                     % (cap, min_nodes))


def select_grid_side(min_nodes, cap=512):
    """AM-C4 size rule: smallest square-grid side with side^2 >= min_nodes."""
    for side in range(2, cap + 1):
        if side * side >= min_nodes:
            return side
    raise ValueError("select_grid_side: no side <= %d reaches %d nodes"
                     % (cap, min_nodes))


def jittered_lattice(seed, jit=15, min_sep=40, attempts=200):
    """C3 corpus: the 19-point lattice with per-point uniform jitter +/-jit,
    placed sequentially with per-point rejection at min separation min_sep
    (mirrors the v3 falsification design gen_v3_jitter, but driven by
    spectral_standard's mulberry32 per the Lane D contract — logged
    deviation from gen_v2's random.Random). Falls back to the base position
    after `attempts` failed tries (the v3 fallback rule)."""
    base = hex_lattice_points(2, 48.0)
    rng = ss.mulberry32(seed & 0xFFFFFFFF)
    span = 2 * jit + 1
    placed = []
    for (bx, by) in base:
        ok = False
        for _t in range(attempts):
            jx = bx + (-jit + int(rng() * span))
            jy = by + (-jit + int(rng() * span))
            if all((jx - px) ** 2 + (jy - py) ** 2 >= min_sep * min_sep
                   for (px, py) in placed):
                placed.append((jx, jy))
                ok = True
                break
        if not ok:
            placed.append((bx, by))
    return placed


# ---------------------------------------------------------------------------
# a-priori plateau diagnostics (graph-structure quantities, no walk involved)
# ---------------------------------------------------------------------------
def _plateau_bfs(adj):
    """Exact walk plateau: mean over start nodes of the mean BFS d^2 to all
    nodes. Used for the C2 level pick (graphs <= ~400 nodes)."""
    n = len(adj)
    total = 0.0
    for s in range(n):
        dist = _bfs_dist(adj, s)
        acc = 0.0
        for d in dist.values():
            acc += d * d
        total += acc / n
    return total / n


# ---------------------------------------------------------------------------
# C2 level selection (pre-registered relative gate + a-priori roll-off)
# ---------------------------------------------------------------------------
def pick_c2_level(level_stats, dw_lattice):
    """Pre-registration C2 selection among gasket levels 4/5/6.

    Rule (stated a-priori): candidates are levels with >= 100 points; prefer
    the SMALLEST candidate whose walk plateau satisfies the a-priori roll-off
    criterion (plateau >= 512, the AM-2 roll-off logic in the hop metric);
    if no candidate does, prefer the smallest candidate passing the
    pre-registered relative gate (d_w >= d_w(lattice) + 0.15 at r2 >= 0.98);
    otherwise take the LARGEST candidate and record the roll-off caveat.
    The gate verdict is recorded either way (CF-2: a gate failure is a
    finding, never a retune)."""
    for s in level_stats:
        s["gate_pass"] = bool(
            s["d_w"] is not None and s["d_w_r2"] is not None
            and s["d_w_r2"] >= R2_GATE
            and dw_lattice is not None
            and s["d_w"] >= dw_lattice + _C2_MARGIN)
    cands = [s for s in level_stats if s["n_points"] >= _C2_MIN_POINTS]
    rolloff = [s for s in cands if s["plateau"] >= 512.0]
    if rolloff:
        pool, rule = rolloff, "a-priori roll-off (plateau >= 512)"
    else:
        passing = [s for s in cands if s["gate_pass"]]
        if passing:
            pool, rule = passing, "relative gate (no candidate met roll-off)"
        else:
            pool, rule = cands, ("largest available (roll-off caveat; "
                                 "gate finding recorded)")
            picked = max(pool, key=lambda s: s["level"])
            return picked, rule
    picked = min(pool, key=lambda s: s["level"])
    return picked, rule


# ---------------------------------------------------------------------------
# selftest
# ---------------------------------------------------------------------------
def _run_selftest():
    """Gold-corpus selftest for centroid-walk-v1 (C1-C5 + CF guards).

    Exits 0 on all-pass, 1 otherwise. C2's relative gate and C3 are
    pre-declared both-ways (CF-2): their checks verify the measurement was
    produced and record the verdict; C1/C4/C5 bands are hard golds."""
    import hashlib

    failures = []
    checks = [0]

    def check(name, ok, detail=""):
        checks[0] += 1
        print("%s %s%s" % ("PASS" if ok else "FAIL", name,
                           (" | " + detail) if detail else ""))
        if not ok:
            failures.append(name)

    def raises(fn):
        try:
            fn()
            return False
        except ValueError:
            return True
        except Exception:
            return False

    # ---- Delaunay determinism + fast/naive cross-validation (CF-1) ----------
    hex19 = hex_lattice_points(2, 48.0)
    d_a = bowyer_watson_delaunay(hex19)
    d_b = bowyer_watson_delaunay(hex19)
    check("CF-1 determinism: hex19 Delaunay run twice -> identical",
          d_a == d_b,
          "E=%d T=%d ties=%d flips=%d"
          % (len(d_a["edges"]), d_a["triangles"],
             d_a["degenerate_events"]["circumcircle_ties"],
             d_a["degenerate_events"]["cocircular_flips"]))
    gasket5_pts = ss.sierpinski_gasket_graph(5)["eu"]
    g_a = bowyer_watson_delaunay(gasket5_pts)
    g_b = bowyer_watson_delaunay(gasket5_pts)
    check("CF-1 determinism: gasket L5 vertex set run twice -> identical",
          g_a == g_b, "E=%d" % len(g_a["edges"]))
    grid4 = [(48.0 * x, 48.0 * y) for y in range(4) for x in range(4)]
    q_a = bowyer_watson_delaunay(grid4)
    q_b = bowyer_watson_delaunay(grid4)
    check("CF-1 determinism: cocircular 4x4 integer grid run twice -> identical",
          q_a == q_b,
          "E=%d T=%d ties=%d flips=%d"
          % (len(q_a["edges"]), q_a["triangles"],
             q_a["degenerate_events"]["circumcircle_ties"],
             q_a["degenerate_events"]["cocircular_flips"]))
    for name, pts in (("hex19", hex19), ("gasket L5 vtx", gasket5_pts),
                      ("4x4 grid", grid4)):
        fast = bowyer_watson_delaunay(pts)
        naive = _bowyer_watson_naive(pts)
        check("CF-1 cross-validation fast == naive Delaunay: %s" % name,
              fast["edges"] == naive["edges"],
              "E=%d" % len(fast["edges"]))

    # ---- tiny square (4 points -> 5 edges, one diagonal) --------------------
    sq = bowyer_watson_delaunay([(0.0, 0.0), (48.0, 0.0), (0.0, 48.0),
                                 (48.0, 48.0)])
    diag = [e for e in sq["edges"] if e not in ([0, 1], [1, 3], [0, 2], [2, 3])]
    check("tiny square: 4 points -> 5 edges, 2 triangles, hull 4, 1 diagonal",
          len(sq["edges"]) == 5 and sq["triangles"] == 2
          and sq["hull_edges"] == 4 and len(diag) == 1,
          "edges=%s diagonal=%s" % (sq["edges"], diag))

    # ---- legality + Euler on real point sets --------------------------------
    def edge_legality_ok(d, pts):
        if not d.get("triangle_list"):
            return True
        tri_of_edge = {}
        for ti, t in enumerate(d["triangle_list"]):
            for key in _tri_edge_keys(t):
                tri_of_edge.setdefault(key, []).append(ti)
        for key, inc in tri_of_edge.items():
            if len(inc) != 2:
                continue
            u, v = key
            t1, t2 = d["triangle_list"][inc[0]], d["triangle_list"][inc[1]]
            a = [w for w in t1 if w != u and w != v][0]
            b = [w for w in t2 if w != u and w != v][0]
            uxy, vxy, axy, bxy = pts[u], pts[v], pts[a], pts[b]
            if _orient(vxy[0], vxy[1], uxy[0], uxy[1], bxy[0], bxy[1]) > 0.0:
                c1, c2, c3 = vxy, uxy, bxy
            else:
                c1, c2, c3 = uxy, vxy, bxy
            dval, eps = _in_circle(c1[0], c1[1], c2[0], c2[1], c3[0], c3[1],
                                   axy[0], axy[1])
            if not math.isinf(dval) and dval > eps:
                return False
        return True

    def euler_ok(d):
        n = d["n_kept"]
        if n <= 2:
            return True
        return (len(d["edges"]) == 3 * n - 3 - d["hull_edges"]
                and d["triangles"] == 2 * n - 2 - d["hull_edges"])

    for name, pts in (("hex19", hex19), ("gasket L5 vtx", gasket5_pts),
                      ("4x4 grid", grid4)):
        dd = bowyer_watson_delaunay(pts)
        check("Delaunay legality (empty-circumcircle property): %s" % name,
              edge_legality_ok(dd, pts),
              "E=%d T=%d H=%d" % (len(dd["edges"]), dd["triangles"],
                                  dd["hull_edges"]))
        check("Delaunay Euler counts (E=3N-3-H, T=2N-2-H): %s" % name,
              euler_ok(dd),
              "E=%d want=%d" % (len(dd["edges"]),
                                3 * dd["n_kept"] - 3 - dd["hull_edges"]))

    # ---- degenerate / empty input handling (CF-4) ---------------------------
    check("empty point set raises", raises(lambda: bowyer_watson_delaunay([])))
    single = bowyer_watson_delaunay([(1.0, 2.0)])
    check("single point -> 0 edges, 0 triangles",
          single["edges"] == [] and single["triangles"] == 0)
    two = bowyer_watson_delaunay([(0.0, 0.0), (5.0, 0.0)])
    check("two points -> the single edge", two["edges"] == [[0, 1]])
    near = bowyer_watson_delaunay([(0.0, 0.0), (1e-12, 0.0), (48.0, 0.0)])
    check("near-duplicate points merge with logged count",
          near["degenerate_events"]["duplicates_merged"] == 1, "E=%d"
          % len(near["edges"]))
    coll = bowyer_watson_delaunay([(0.0, 0.0), (96.0, 0.0), (48.0, 0.0)])
    check("collinear points -> sorted-order path fallback (exact Delaunay "
          "degeneracy, logged)",
          coll["edges"] == [[0, 2], [2, 1]]
          and coll["degenerate_events"]["collinear_fallback"] == 1,
          "edges=%s" % (coll["edges"],))
    ins1 = walk_centroid_mode([], coords=[(0.0, 0.0)])
    check("walk on 1-node graph -> insufficient (CF-4)",
          ins1["status"] == "insufficient" and ins1["d_w"] is None)
    check("walk on empty graph raises",
          raises(lambda: walk_centroid_mode([], coords=[])))
    check("walk with K != 4 raises (K is pinned, never retuned)",
          raises(lambda: walk_centroid_mode([(0, 1)],
                                            coords=[(0.0, 0.0), (1.0, 0.0)],
                                            K=5)))
    mask_empty = mask_centroid_walk([], 8, 8)
    check("empty mask -> insufficient (CF-4)",
          mask_empty["status"] == "insufficient")
    mask_one = mask_centroid_walk([[0, 0, 0], [0, 1, 1], [0, 1, 1]], 3, 3)
    check("single-component mask -> insufficient (CF-4)",
          mask_one["status"] == "insufficient" and mask_one["n_nodes"] == 1)

    # ---- component tracing ---------------------------------------------------
    g = [[0, 1, 1, 0],
         [0, 1, 1, 0],
         [0, 0, 0, 0],
         [0, 0, 1, 1]]
    comps = traced_grid_to_components(g)
    check("traced grid: 4-connectivity (diagonal pixels are separate)",
          len(comps) == 2, "sizes=%s" % [len(c) for c in comps])
    check("traced grid: components ordered by row-major first pixel",
          comps[0][0] == (1, 0) and comps[1][0] == (2, 3))
    check("traced grid: deterministic", traced_grid_to_components(g) == comps)
    cents = components_to_centroids(comps)
    check("centroids: arithmetic mean of boundary pixels, 9-decimal rounded",
          cents == [(1.5, 0.5), (2.5, 3.0)], "cents=%s" % (cents,))

    # ---- end-to-end mask path + disconnected guard ---------------------------
    def ring(cx, cy, r, w, h):
        m = [[0] * w for _ in range(h)]
        for x in range(cx - r, cx + r + 1):
            for y in range(cy - r, cy + r + 1):
                if 0 <= x < w and 0 <= y < h:
                    if max(abs(x - cx), abs(y - cy)) == r:
                        m[y][x] = 1
        return m

    w_, h_ = 64, 64
    mask3 = [[0] * w_ for _ in range(h_)]
    for (cx, cy, r) in ((12, 12, 5), (40, 16, 5), (24, 44, 5)):
        rr = ring(cx, cy, r, w_, h_)
        for y in range(h_):
            for x in range(w_):
                if rr[y][x]:
                    mask3[y][x] = 1
    out3 = mask_centroid_walk(mask3, w_, h_, start_rule="first")
    check("mask end-to-end: 3 rings -> 3 centroids -> connected Delaunay walk",
          out3["status"] == "ok" and out3["n_nodes"] == 3
          and out3["n_components"] == 1 and out3["n_edges"] == 3,
          "d_w=%s n_edges=%d" % (out3["d_w"], out3["n_edges"]))
    check("radius diagnostic runs and reports",
          out3["radius_diagnostic"]["median_spacing"] is not None
          and len(out3["radius_diagnostic"]["edges"]) >= 3,
          "median=%.2f edges=%d"
          % (out3["radius_diagnostic"]["median_spacing"],
             len(out3["radius_diagnostic"]["edges"])))
    wd1 = walk_centroid_mode(out3["delaunay"]["edges"],
                             coords=out3["centroids"], seed=42)
    wd2 = walk_centroid_mode(out3["delaunay"]["edges"],
                             coords=out3["centroids"], seed=42)
    check("walk determinism: same input + seed -> identical output dict",
          wd1 == wd2)
    # disconnected guard on a hand-built graph: 3 components, walk = largest
    disc = walk_centroid_mode([(0, 1)], coords=[(0.0, 0.0), (48.0, 0.0),
                                                (500.0, 500.0),
                                                (548.0, 500.0),
                                                (1000.0, 0.0)])
    check("disconnected graph: n_components reported, walk on largest only",
          disc["status"] == "ok" and disc["n_components"] == 4
          and disc["n_nodes_walk"] == 2,
          "components=%s" % (disc["component_sizes"],))
    # collinear two-cluster degenerate set: the exact Delaunay degeneracy is
    # the sorted-order path, and CONSECUTIVE sorted collinear points are
    # Delaunay neighbors even across a gap (any circle through them contains
    # the intervening segment, which is empty) -> one connected path.
    cgdisc = centroid_delaunay_graph([(0.0, 0.0), (48.0, 0.0), (96.0, 0.0),
                                      (1000.0, 0.0), (1048.0, 0.0)])
    check("degenerate collinear clusters: path fallback is the exact "
          "Delaunay degeneracy (gap-crossing consecutive edges, connected)",
          cgdisc["n_components"] == 1
          and cgdisc["graph"]["edges"] == [(0, 1), (1, 2), (2, 3), (3, 4)],
          "edges=%s" % (cgdisc["graph"]["edges"],))

    # ==== gold C1 (AM-C1 re-pinned size, band UNCHANGED) =====================
    ladder = _walk_ladder(DEFAULT_K)
    min_nodes = AM3B_NODE_FACTOR * ladder[-1]
    c1_radius = select_hex_radius(min_nodes)
    c1_pts = hex_lattice_points(c1_radius, 48.0)
    check("AM-C1 size rule: smallest hex patch with N >= 64*t_hi = %d "
          "(AM-3b finite-size window requirement)"
          % min_nodes,
          len(c1_pts) >= min_nodes
          and len(hex_lattice_points(c1_radius - 1, 48.0)) < min_nodes,
          "radius=%d N=%d (radius %d would give N=%d)"
          % (c1_radius, len(c1_pts), c1_radius - 1,
             len(hex_lattice_points(c1_radius - 1, 48.0))))
    c1_d = bowyer_watson_delaunay(c1_pts)
    c1_cg = centroid_delaunay_graph(c1_pts)
    c1_w = walk_centroid_mode(c1_cg["graph"]["edges"],
                              coords=c1_cg["graph"]["eu"],
                              walkers=GOLD_WALKERS, start_rule="spread")
    c1_64 = walk_centroid_mode(c1_cg["graph"]["edges"],
                               coords=c1_cg["graph"]["eu"],
                               start_rule="spread")  # pre-registered 64, diagnostic
    c1_s1 = walk_centroid_mode(c1_cg["graph"]["edges"],
                               coords=c1_cg["graph"]["eu"], seed=1,
                               walkers=GOLD_WALKERS, start_rule="spread")
    c1_s2 = walk_centroid_mode(c1_cg["graph"]["edges"],
                               coords=c1_cg["graph"]["eu"], seed=2,
                               walkers=GOLD_WALKERS, start_rule="spread")
    check("AM-D2 estimator stability: C1 d_w at W=4096 varies < 0.02 across "
          "seeds 1/2 (64-walker seed scatter was ~0.45 in d_w)",
          abs(c1_s1["d_w"] - c1_s2["d_w"]) < 0.02,
          "seed1=%.5f seed2=%.5f | 64-walker canonical draw=%.5f"
          % (c1_s1["d_w"], c1_s2["d_w"], c1_64["d_w"]))
    check("Delaunay legality: C1 gold set", edge_legality_ok(c1_d, c1_pts),
          "E=%d T=%d" % (len(c1_d["edges"]), c1_d["triangles"]))
    check("Delaunay Euler counts: C1 gold set", euler_ok(c1_d),
          "E=%d want=%d" % (len(c1_d["edges"]),
                            3 * c1_d["n_kept"] - 3 - c1_d["hull_edges"]))
    check("C1 gold: lattice Delaunay walk d_w in [1.90, 2.10] at r2 >= 0.98",
          c1_w["d_w"] is not None
          and _GOLD_DW_LATTICE[0] <= c1_w["d_w"] <= _GOLD_DW_LATTICE[1]
          and c1_w["d_w_r2"] >= R2_GATE,
          "d_w=%.5f r2=%.4f (N=%d E=%d T=%d ties=%d flips=%d)"
          % (c1_w["d_w"], c1_w["d_w_r2"], c1_w["n_nodes"], c1_w["n_edges"],
             c1_d["triangles"],
             c1_d["degenerate_events"]["circumcircle_ties"],
             c1_d["degenerate_events"]["cocircular_flips"]))
    c1_first = walk_centroid_mode(c1_cg["graph"]["edges"],
                                  coords=c1_cg["graph"]["eu"],
                                  walkers=GOLD_WALKERS, start_rule="first")
    print("INFO C1 diagnostics: d_w_hop(spread,64w-subrun)=%.5f r2=%.4f | "
          "d_w_euclid(first)=%.5f | 64-walker spread draw=%.5f (diagnostic)"
          % (c1_w["d_w_hop"], c1_w["d_w_hop_r2"], c1_first["d_w"],
             c1_64["d_w"]))

    # 19-point saturation diagnostic (documented AM-6 finding; REPORTED only)
    hex19_cg = centroid_delaunay_graph(hex19)
    hex19_w = walk_centroid_mode(hex19_cg["graph"]["edges"],
                                 coords=hex19_cg["graph"]["eu"],
                                 start_rule="spread")
    check("C1 saturation diagnostic (19-pt lattice) measured and recorded "
          "(expected OUT of band: ladder saturates, AM-6)",
          hex19_w["status"] == "ok",
          "d_w=%.4f r2=%.4f (saturated; reported, not gated)"
          % (hex19_w["d_w"] if hex19_w["d_w"] else -1, hex19_w["d_w_r2"]))

    # ==== gold C2 (relative gate; levels 4/5/6 checked) ======================
    level_stats = []
    for lv in (4, 5, 6):
        vp = ss.sierpinski_gasket_graph(lv)["eu"]
        cg = centroid_delaunay_graph(vp)
        plat = _plateau_bfs(cg["graph"]["adj"])
        wv = walk_centroid_mode(cg["graph"]["edges"], coords=cg["graph"]["eu"],
                                walkers=GOLD_WALKERS, start_rule="spread")
        level_stats.append({"level": lv, "n_points": len(vp), "plateau": plat,
                            "d_w": wv["d_w"], "d_w_r2": wv["d_w_r2"],
                            "d_w_hop": wv.get("d_w_hop"),
                            "n_edges": wv["n_edges"],
                            "n_components": wv["n_components"]})
        print("INFO C2 level %d: N=%d plateau=%.1f d_w=%s r2=%.4f "
              "d_w_hop=%s E=%d comps=%d"
              % (lv, len(vp), plat,
                 ("%.5f" % wv["d_w"]) if wv["d_w"] else None, wv["d_w_r2"],
                 ("%.5f" % wv["d_w_hop"]) if wv.get("d_w_hop") else None,
                 wv["n_edges"], wv["n_components"]))
    picked, rule = pick_c2_level(level_stats, c1_w["d_w"])
    print("INFO C2 picked level %d by rule: %s" % (picked["level"], rule))
    check("C2 relative gate evaluated and verdict recorded "
          "(CF-2: a gate failure is a finding, never a retune)",
          picked["d_w"] is not None,
          "level=%d d_w=%.5f vs lattice d_w=%.5f + 0.15 -> %s"
          % (picked["level"], picked["d_w"], c1_w["d_w"],
             "GATE PASS" if picked["gate_pass"] else "FINDING: gate not met"))

    # ==== gold C3 (jittered lattice; REPORTED, no gate) ======================
    c3_ok = []
    for seed in (42, 2026, 99):
        jp = jittered_lattice(seed)
        cg = centroid_delaunay_graph(jp)
        wv = walk_centroid_mode(cg["graph"]["edges"], coords=cg["graph"]["eu"],
                                walkers=GOLD_WALKERS, start_rule="spread")
        c3_ok.append(wv["status"] == "ok")
        print("INFO C3 seed %d: d_w=%s r2=%.4f d_w_hop=%s (19-pt jitter, "
              "saturated ladder — REPORTED only per pre-registration)"
              % (seed, ("%.4f" % wv["d_w"]) if wv["d_w"] else None,
                 wv["d_w_r2"],
                 ("%.4f" % wv["d_w_hop"]) if wv.get("d_w_hop") else None))
    check("C3 jitter reported for seeds 42/2026/99 (no gate, pre-declared)",
          all(c3_ok))

    # ==== gold C4 (AM-C4 re-pinned size, band UNCHANGED) =====================
    c4_side = select_grid_side(min_nodes)
    c4_pts = grid_points(c4_side, 48.0)
    check("AM-C4 size rule: smallest square grid with N >= 64*t_hi = %d "
          "(AM-3b; the same 128x128 patch the row5 gold anchored)" % min_nodes,
          len(c4_pts) >= min_nodes
          and (c4_side - 1) ** 2 < min_nodes,
          "side=%d N=%d" % (c4_side, len(c4_pts)))
    c4_d = bowyer_watson_delaunay(c4_pts)
    c4_cg = centroid_delaunay_graph(c4_pts)
    c4_w = walk_centroid_mode(c4_cg["graph"]["edges"],
                              coords=c4_cg["graph"]["eu"],
                              walkers=GOLD_WALKERS, start_rule="spread")
    c4_64 = walk_centroid_mode(c4_cg["graph"]["edges"],
                               coords=c4_cg["graph"]["eu"],
                               start_rule="spread")  # pre-registered 64, diagnostic
    print("INFO C4 64-walker spread draw (diagnostic): d_w=%.5f r2=%.4f"
          % (c4_64["d_w"], c4_64["d_w_r2"]))
    check("Delaunay legality: C4 gold set", edge_legality_ok(c4_d, c4_pts),
          "E=%d T=%d" % (len(c4_d["edges"]), c4_d["triangles"]))
    check("Delaunay Euler counts: C4 gold set", euler_ok(c4_d),
          "E=%d want=%d" % (len(c4_d["edges"]),
                            3 * c4_d["n_kept"] - 3 - c4_d["hull_edges"]))
    check("C4 gold: square-grid Delaunay walk d_w in [1.90, 2.10] at "
          "r2 >= 0.98",
          c4_w["d_w"] is not None
          and _GOLD_DW_LATTICE[0] <= c4_w["d_w"] <= _GOLD_DW_LATTICE[1]
          and c4_w["d_w_r2"] >= R2_GATE,
          "d_w=%.5f r2=%.4f (N=%d E=%d)"
          % (c4_w["d_w"], c4_w["d_w_r2"], c4_w["n_nodes"], c4_w["n_edges"]))
    grid8_pts = grid_points(8, 48.0)
    grid8_cg = centroid_delaunay_graph(grid8_pts)
    grid8_w = walk_centroid_mode(grid8_cg["graph"]["edges"],
                                 coords=grid8_cg["graph"]["eu"],
                                 start_rule="spread")
    check("C4 saturation diagnostic (8x8 grid) measured and recorded "
          "(expected OUT of band: ladder saturates)",
          grid8_w["status"] == "ok",
          "d_w=%.4f r2=%.4f (saturated; reported, not gated)"
          % (grid8_w["d_w"] if grid8_w["d_w"] else -1, grid8_w["d_w_r2"]))

    # ==== gold C5 (ink-mode regression, anchored gold, unchanged) ============
    # "level 6" is the canonical (falsification-harness) numbering of AM-2:
    # canonical level 6 = V = 1095 = spectral_standard builder level 7.
    g7 = ss.sierpinski_gasket_graph(7)
    c5 = ss.measure_walk_graph(g7["edges"], g7["eu"])
    check("C5 regression: merged-gasket canonical level 6 (builder L7, "
          "V=1095) ink-mode d_w in [2.22193, 2.42193] at r2 >= 0.98",
          c5["d_w"] is not None
          and _GOLD_DW_GASKET_INK[0] <= c5["d_w"] <= _GOLD_DW_GASKET_INK[1]
          and c5["d_w_r2"] >= R2_GATE,
          "d_w=%.5f r2=%.4f" % (c5["d_w"], c5["d_w_r2"]))
    g6 = ss.sierpinski_gasket_graph(6)
    c5_diag = ss.measure_walk_graph(g6["edges"], g6["eu"])
    print("INFO C5 diagnostic (builder L6, V=366, AM-2 documented "
          "pre-asymptotic finding): d_w=%.5f r2=%.4f"
          % (c5_diag["d_w"], c5_diag["d_w_r2"]))

    print("selftest: %d checks, %d failures" % (checks[0], len(failures)))
    return not failures


# ---------------------------------------------------------------------------
# parity fixtures for Lane E (JS port)
# ---------------------------------------------------------------------------
def _build_fixtures():
    import hashlib
    import json

    def dig(obj):
        return hashlib.sha256(json.dumps(obj, sort_keys=True,
                                         separators=(",", ":"))
                              .encode("utf-8")).hexdigest()

    ladder = _walk_ladder(DEFAULT_K)
    min_nodes = AM3B_NODE_FACTOR * ladder[-1]

    c1_radius = select_hex_radius(min_nodes)
    c1_pts = hex_lattice_points(c1_radius, 48.0)
    c1_d = bowyer_watson_delaunay(c1_pts)
    c1_cg = centroid_delaunay_graph(c1_pts)
    c1_w = walk_centroid_mode(c1_cg["graph"]["edges"],
                              coords=c1_cg["graph"]["eu"],
                              walkers=GOLD_WALKERS, start_rule="spread")
    c1_first = walk_centroid_mode(c1_cg["graph"]["edges"],
                                  coords=c1_cg["graph"]["eu"],
                                  walkers=GOLD_WALKERS, start_rule="first")
    c1_64 = walk_centroid_mode(c1_cg["graph"]["edges"],
                               coords=c1_cg["graph"]["eu"],
                               start_rule="spread")  # pre-registered 64, diagnostic

    hex19 = hex_lattice_points(2, 48.0)
    hex19_d = bowyer_watson_delaunay(hex19)
    hex19_cg = centroid_delaunay_graph(hex19)
    hex19_w = walk_centroid_mode(hex19_cg["graph"]["edges"],
                                 coords=hex19_cg["graph"]["eu"],
                                 start_rule="spread")

    level_stats = []
    c2_sets = {}
    for lv in (4, 5, 6):
        vp = ss.sierpinski_gasket_graph(lv)["eu"]
        cg = centroid_delaunay_graph(vp)
        wv = walk_centroid_mode(cg["graph"]["edges"], coords=cg["graph"]["eu"],
                                walkers=GOLD_WALKERS, start_rule="spread")
        level_stats.append({"level": lv, "n_points": len(vp),
                            "plateau": _plateau_bfs(cg["graph"]["adj"]),
                            "d_w": wv["d_w"], "d_w_r2": wv["d_w_r2"],
                            "d_w_hop": wv.get("d_w_hop"),
                            "n_edges": wv["n_edges"],
                            "n_components": wv["n_components"]})
        c2_sets[lv] = {"points": [list(p) for p in vp],
                       "edges": cg["delaunay"]["edges"]}
    picked, rule = pick_c2_level(level_stats, c1_w["d_w"])

    c3 = {}
    for seed in (42, 2026, 99):
        jp = jittered_lattice(seed)
        cg = centroid_delaunay_graph(jp)
        wv = walk_centroid_mode(cg["graph"]["edges"], coords=cg["graph"]["eu"],
                                walkers=GOLD_WALKERS, start_rule="spread")
        c3[str(seed)] = {"points": [list(p) for p in jp], "d_w": wv["d_w"],
                         "d_w_r2": wv["d_w_r2"], "d_w_hop": wv.get("d_w_hop"),
                         "n_edges": wv["n_edges"]}

    c4_side = select_grid_side(min_nodes)
    c4_pts = grid_points(c4_side, 48.0)
    c4_d = bowyer_watson_delaunay(c4_pts)
    c4_cg = centroid_delaunay_graph(c4_pts)
    c4_w = walk_centroid_mode(c4_cg["graph"]["edges"],
                              coords=c4_cg["graph"]["eu"],
                              walkers=GOLD_WALKERS, start_rule="spread")
    c4_64 = walk_centroid_mode(c4_cg["graph"]["edges"],
                               coords=c4_cg["graph"]["eu"],
                               start_rule="spread")  # pre-registered 64, diagnostic
    grid8_pts = grid_points(8, 48.0)
    grid8_d = bowyer_watson_delaunay(grid8_pts)
    grid8_cg = centroid_delaunay_graph(grid8_pts)
    grid8_w = walk_centroid_mode(grid8_cg["graph"]["edges"],
                                 coords=grid8_cg["graph"]["eu"],
                                 start_rule="spread")

    g7 = ss.sierpinski_gasket_graph(7)
    c5 = ss.measure_walk_graph(g7["edges"], g7["eu"])
    g6 = ss.sierpinski_gasket_graph(6)
    c5_diag = ss.measure_walk_graph(g6["edges"], g6["eu"])

    # seed-42 walk trace on the C1 gold graph (walker streams are independent:
    # walker 0's prefix at max_step=40 equals its prefix at the full ladder)
    w42 = walk_centroid_mode(c1_cg["graph"]["edges"],
                             coords=c1_cg["graph"]["eu"], seed=42,
                             walkers=GOLD_WALKERS, start_rule="spread")
    walks42 = ss.run_walks(c1_cg["walk_graph"], w42["base_seed"],
                           n_walkers=w42["walkers"], max_step=40,
                           start_rule="spread")
    trace = {"set": "c1", "seed": 42, "start_rule": "spread",
             "base_seed": w42["base_seed"],
             "n_walkers": w42["walkers"],
             "starts": walks42["starts"],
             "walker0_first40": walks42["trajs"][0],
             "ladder": w42["ladder"]}

    return {
        "meta": {
            "pipeline": PIPELINE,
            "preregistration": PREREG,
            "canonical_module": "spectral_standard.py (spectral-standard-v1)",
            "metric": ("PRIMARY: Euclidean MSD over the centroid embedding "
                       "(canonical spectral_standard._walk_measurements, "
                       "AM-D1); d_w_hop = BFS hop-distance fit over the same "
                       "trajectories, reported as diagnostic"),
            "walkers": ("image-path default: %d (pre-registered); synthetic "
                        "gold runs: %d (AM-D2 precision criterion)"
                        % (WALKER_COUNT, GOLD_WALKERS)),
            "K": DEFAULT_K,
            "ladder": ladder,
            "r2_gate": R2_GATE,
            "circumcircle_tolerance_relative": CIRC_EPS_REL,
            "tie_break": ("cocircular quads canonicalized to the "
                          "lexicographically smallest diagonal (9-decimal "
                          "coordinate edge key); ties -> inside in the BW "
                          "cavity"),
            "dedup": "coordinates rounded to 9 decimals, first occurrence kept",
            "start_rules": ("'spread' for synthetic point-set golds "
                            "(explicit-graph canonical rule, AM-2); 'first' "
                            "is the image-path default"),
            "amendments": [
                "AM-D1: primary MSD metric = Euclidean over the embedding "
                "(the pre-registered C1 closed form d_w=2 is exact only in "
                "the Euclidean metric; canonical ss convention). d_w_hop "
                "reported as diagnostic.",
                "AM-C1: C1 gold re-pinned to the smallest hex patch with "
                "N >= 64*t_hi = 16384 (AM-3b finite-size window requirement; "
                "band [1.90, 2.10] unchanged; 19-pt set kept as diagnostic)",
                "AM-C4: C4 gold re-pinned to the 128x128 grid (N = 16384, "
                "AM-3b; the same patch row5 anchored; band unchanged; 8x8 "
                "kept as diagnostic)",
                "AM-D2: synthetic-gold walker count 64 -> 4096 (a-priori "
                "precision criterion sigma_alpha <= 1/4 of the band's alpha "
                "half-width; AM-3 precedent). 64-walker canonical draws are "
                "still reported as diagnostics; the module default stays 64.",
                "AM-C5: 'level 6' = canonical harness numbering (V=1095 = "
                "builder level 7); anchored gold graph and band unchanged",
                "C3 jitter uses mulberry32 (spectral_standard PRNG) per the "
                "Lane D contract, mirroring gen_v3_jitter's structure",
            ],
        },
        "c1": {
            "radius": c1_radius, "spacing": 48.0,
            "n": len(c1_pts),
            "point_generator": "hex_lattice_points(radius, spacing): axial "
                               "(q, r) with hex distance <= radius; x = "
                               "spacing*(q + r/2), y = spacing*r*sqrt(3)/2; "
                               "scan order q=-radius..radius, r inner",
            "points_head": [list(p) for p in c1_pts[:64]],
            "points_sha256": dig([list(p) for p in c1_pts]),
            "edges": c1_d["edges"],
            "triangles": c1_d["triangles"],
            "hull_edges": c1_d["hull_edges"],
            "degenerate_events": c1_d["degenerate_events"],
            "walk_spread": {k: c1_w[k] for k in
                            ("d_w", "d_w_r2", "alpha_msd", "d_s", "base_seed",
                             "msd", "n_edges", "n_components")},
            "d_w_hop": c1_w["d_w_hop"],
            "d_w_hop_r2": c1_w["d_w_hop_r2"],
            "d_w_walkers_64_diagnostic": {"d_w": c1_64["d_w"],
                                          "d_w_r2": c1_64["d_w_r2"],
                                          "note": "pre-registered 64-walker "
                                                  "draw; seed-roulette on "
                                                  "diffusive graphs (AM-D2)"},
            "walk_first_d_w": c1_first["d_w"],
            "edges_sha256": dig(c1_d["edges"]),
        },
        "c1_small_diagnostic": {
            "n": len(hex19), "points": [list(p) for p in hex19],
            "edges": hex19_d["edges"],
            "d_w": hex19_w["d_w"], "d_w_r2": hex19_w["d_w_r2"],
            "d_w_hop": hex19_w.get("d_w_hop"),
            "note": "19-pt lattice: pinned ladder saturates (AM-6 finding); "
                    "reported, not gated",
        },
        "c2": {
            "levels": {str(s["level"]): s for s in level_stats},
            "picked_level": picked["level"],
            "pick_rule": rule,
            "gate": {"dw_lattice": c1_w["d_w"], "margin": _C2_MARGIN,
                     "passed": picked["gate_pass"]},
            "picked_points": c2_sets[picked["level"]]["points"],
            "picked_edges": c2_sets[picked["level"]]["edges"],
        },
        "c3": c3,
        "c4": {
            "side": c4_side, "spacing": 48.0, "n": len(c4_pts),
            "point_generator": "grid_points(side, spacing): row-major "
                               "(x fastest), x = spacing*x, y = spacing*y",
            "points_head": [list(p) for p in c4_pts[:64]],
            "points_sha256": dig([list(p) for p in c4_pts]),
            "edges": c4_d["edges"],
            "triangles": c4_d["triangles"],
            "hull_edges": c4_d["hull_edges"],
            "degenerate_events": c4_d["degenerate_events"],
            "walk_spread": {k: c4_w[k] for k in
                            ("d_w", "d_w_r2", "alpha_msd", "d_s", "base_seed",
                             "msd", "n_edges", "n_components")},
            "d_w_hop": c4_w["d_w_hop"],
            "d_w_hop_r2": c4_w["d_w_hop_r2"],
            "d_w_walkers_64_diagnostic": {"d_w": c4_64["d_w"],
                                          "d_w_r2": c4_64["d_w_r2"],
                                          "note": "pre-registered 64-walker "
                                                  "draw; seed-roulette on "
                                                  "diffusive graphs (AM-D2)"},
            "edges_sha256": dig(c4_d["edges"]),
        },
        "c4_small_diagnostic": {
            "n": len(grid8_pts), "points": [list(p) for p in grid8_pts],
            "edges": grid8_d["edges"],
            "d_w": grid8_w["d_w"], "d_w_r2": grid8_w["d_w_r2"],
            "d_w_hop": grid8_w.get("d_w_hop"),
            "note": "8x8 grid: pinned ladder saturates; reported, not gated",
        },
        "c5": {
            "canonical_level": 6, "builder_level": 7, "V": g7["n"],
            "d_w": c5["d_w"], "d_w_r2": c5["d_w_r2"],
            "builder_level_6_diagnostic": {"V": g6["n"],
                                           "d_w": c5_diag["d_w"],
                                           "d_w_r2": c5_diag["d_w_r2"]},
            "note": "AM-C5: canonical level 6 = builder level 7 (V=1095); "
                    "anchored gold graph and band unchanged",
        },
        "walk_trace": trace,
        "infra": {
            "tiny_square": bowyer_watson_delaunay(
                [(0.0, 0.0), (48.0, 0.0), (0.0, 48.0),
                 (48.0, 48.0)])["edges"],
            "collinear_fallback": bowyer_watson_delaunay(
                [(0.0, 0.0), (96.0, 0.0), (48.0, 0.0)])["edges"],
            "determinism": "same input twice -> identical edge list "
                           "(selftest-checked on hex19, gasket L5 vtx, 4x4 "
                           "grid; the gold sets' edge lists are pinned here "
                           "by sha256)",
        },
    }


def _emit_fixtures(path):
    import json
    pack = _build_fixtures()
    with open(path, "w") as fh:
        json.dump(pack, fh, sort_keys=True, indent=1)
        fh.write("\n")
    print("fixtures written to %s" % path)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if _run_selftest() else 1)
    if "--fixtures" in sys.argv:
        _emit_fixtures(sys.argv[sys.argv.index("--fixtures") + 1])
        sys.exit(0)
    print("usage: centroid_walk.py --selftest | --fixtures <path>")
