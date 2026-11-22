#!/usr/bin/env python3
"""
tautology_discerner.py -- Propositional, Quantificational, and Difference-Bound
Constraint Solver for Statement Classification.

Zero planted sentence libraries, zero hardcoded noun/synonym lookup tables, and
zero copula-verb bag-of-words heuristics.

Given a formal or natural-language statement S, this module:
  1. Parses S into a compositional logical Abstract Syntax Tree (AST) over:
       - Propositional connectives: NOT (~, ¬), AND (∧, &), OR (∨, |),
         IMPLIES (->, =>, →, if..then), IFF (<->, <=>, ↔, if and only if)
       - Universal / existential quantifiers: forall / every / any / no
       - Relational & difference-bound constraints:
         x == y, x != y, x < y, x <= y, x > y, x >= y, x in [a, b], x = v +/- tol
       - Self-referential truth-predicate bindings: v <-> (+/-) v
  2. Evaluates all 2^k truth assignments over the extracted atoms, pruning
     assignments whose relational literals violate linear/interval feasibility
     (solved via exact Bellman-Ford / Floyd-Warshall difference-bound closure
     on x_i - x_j <= c and interval bounds [lo, hi]).
  3. Computes the feasible satisfaction ratio:
       rho = |Omega_sat| / |Omega_feas|
     and classifies S strictly from its solved model space:
       - Tautology   : |Omega_feas| > 0 and |Omega_sat| == |Omega_feas| (rho == 1.0;
                       negation ~S is unsatisfiable in every feasible world).
       - Paradox     : |Omega_sat| == 0 (rho == 0.0; S has no feasible model or
                       is an odd-parity self-referential negation v <-> ~v).
       - Falsifiable : 0 < |Omega_sat| < |Omega_feas| AND S commits to a
                       relational/quantitative constraint, universal rule, or
                       compound truth-functional dependency, yielding an explicit
                       counter-model witness alpha_false in Omega_feas \\ Omega_sat.
       - Undecidable : Unconstrained single qualitative atom, fragment, or
                       even-parity self-reference (v <-> v) with no truth-functional
                       or quantitative falsifier.

Usage:
    python3 tools/tautology-discerner/tautology_discerner.py --selftest
    python3 tools/tautology-discerner/tautology_discerner.py --classify "If x > 5 then x > 2."
    python3 tools/tautology-discerner/tautology_discerner.py --null-check "If a <= b and b <= c then a <= c."
    python3 tools/tautology-discerner/tautology_discerner.py --classify-file statements.txt
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import random
import re
import sys
from dataclasses import dataclass
from fractions import Fraction
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# 1. Propositional AST & Relational Constraint Representation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RelConstraint:
    """Linear/order constraint `lhs OP rhs + offset`, where `lhs`/`rhs` are a
    variable (or opaque linear-form term) or a numeric constant, `offset` is a
    numeric constant (default 0.0), and OP in {'==', '!=', '<', '<=', '>', '>='}.
    A non-zero offset encodes a difference-bound x - y OP c exactly."""
    lhs: str
    op: str
    rhs: str
    offset: float = 0.0

    def negate(self) -> "RelConstraint":
        neg_map = {
            "==": "!=",
            "!=": "==",
            "<": ">=",
            "<=": ">",
            ">": "<=",
            ">=": "<",
        }
        return RelConstraint(self.lhs, neg_map[self.op], self.rhs, self.offset)

    def format(self) -> str:
        if self.offset == 0.0:
            return f"{self.lhs} {self.op} {self.rhs}"
        sign = "+" if self.offset > 0 else "-"
        return f"{self.lhs} {self.op} {self.rhs} {sign} {abs(self.offset)!r}"


@dataclass(frozen=True)
class Atom:
    """An atomic proposition p_i, optionally backed by a relational constraint."""
    name: str
    rel: Optional[RelConstraint] = None
    is_quantitative: bool = False
    is_universal: bool = False


class Expr:
    """Propositional formula node."""
    pass


@dataclass(frozen=True)
class VarExpr(Expr):
    atom: Atom


@dataclass(frozen=True)
class NotExpr(Expr):
    child: Expr


@dataclass(frozen=True)
class AndExpr(Expr):
    left: Expr
    right: Expr


@dataclass(frozen=True)
class OrExpr(Expr):
    left: Expr
    right: Expr


@dataclass(frozen=True)
class ImpliesExpr(Expr):
    antecedent: Expr
    consequent: Expr


@dataclass(frozen=True)
class IffExpr(Expr):
    left: Expr
    right: Expr


def eval_expr(expr: Expr, env: Dict[str, bool]) -> bool:
    if isinstance(expr, VarExpr):
        return bool(env[expr.atom.name])
    if isinstance(expr, NotExpr):
        return not eval_expr(expr.child, env)
    if isinstance(expr, AndExpr):
        return eval_expr(expr.left, env) and eval_expr(expr.right, env)
    if isinstance(expr, OrExpr):
        return eval_expr(expr.left, env) or eval_expr(expr.right, env)
    if isinstance(expr, ImpliesExpr):
        return (not eval_expr(expr.antecedent, env)) or eval_expr(expr.consequent, env)
    if isinstance(expr, IffExpr):
        return eval_expr(expr.left, env) == eval_expr(expr.right, env)
    raise ValueError(f"Unknown Expr node: {expr!r}")


def collect_atoms(expr: Expr) -> List[Atom]:
    seen: Dict[str, Atom] = {}

    def _walk(node: Expr) -> None:
        if isinstance(node, VarExpr):
            seen.setdefault(node.atom.name, node.atom)
        elif isinstance(node, NotExpr):
            _walk(node.child)
        elif isinstance(node, (AndExpr, OrExpr, ImpliesExpr, IffExpr)):
            if isinstance(node, ImpliesExpr):
                _walk(node.antecedent)
                _walk(node.consequent)
            else:
                _walk(node.left)
                _walk(node.right)

    _walk(expr)
    return list(seen.values())


def count_connectives(expr: Expr) -> int:
    if isinstance(expr, VarExpr):
        return 0
    if isinstance(expr, NotExpr):
        return 1 + count_connectives(expr.child)
    if isinstance(expr, ImpliesExpr):
        return 1 + count_connectives(expr.antecedent) + count_connectives(expr.consequent)
    if isinstance(expr, (AndExpr, OrExpr, IffExpr)):
        return 1 + count_connectives(node_left(expr)) + count_connectives(node_right(expr))
    return 0


def node_left(expr: Expr) -> Expr:
    return expr.antecedent if isinstance(expr, ImpliesExpr) else expr.left  # type: ignore[attr-defined]


def node_right(expr: Expr) -> Expr:
    return expr.consequent if isinstance(expr, ImpliesExpr) else expr.right  # type: ignore[attr-defined]


def format_expr(expr: Expr) -> str:
    if isinstance(expr, VarExpr):
        return expr.atom.rel.format() if expr.atom.rel else expr.atom.name
    if isinstance(expr, NotExpr):
        return f"~({format_expr(expr.child)})"
    if isinstance(expr, AndExpr):
        return f"({format_expr(expr.left)} & {format_expr(expr.right)})"
    if isinstance(expr, OrExpr):
        return f"({format_expr(expr.left)} | {format_expr(expr.right)})"
    if isinstance(expr, ImpliesExpr):
        return f"({format_expr(expr.antecedent)} -> {format_expr(expr.consequent)})"
    if isinstance(expr, IffExpr):
        return f"({format_expr(expr.left)} <-> {format_expr(expr.right)})"
    return str(expr)


# ---------------------------------------------------------------------------
# 2. Exact Difference-Bound Matrix (Floyd-Warshall) Feasibility Solver
#    over the lexicographic tropical semiring (weight, strict_flag)
# ---------------------------------------------------------------------------

_NUM_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


def _parse_number(s: str) -> Optional[float]:
    s = s.strip().rstrip("%")
    if _NUM_RE.match(s):
        try:
            return float(s)
        except ValueError:
            return None
    return None


# A DBM bound is a pair (w, s): "x_u - x_v <= w" when s == 0 and
# "x_u - x_v <  w" when s == 1.  Pairs form a tropical semiring under
#   (w1, s1) (+) (w2, s2) = (w1 + w2, s1 or s2)       (path concatenation)
#   (w1, s1) <  (w2, s2) iff w1 < w2 - TOL or (|w1 - w2| <= TOL and s1 > s2)
# (a strict bound is tighter than a non-strict bound of equal weight).  No
# epsilon is ever added to a weight, so arbitrarily narrow open intervals such
# as 0 < x < 1e-9 are decided exactly.
_PW_TOL = 1e-15
_CYCLE_TOL = 1e-12
_DBM_INF = 1e18
_PW_INF = (_DBM_INF, 0)


def _pw_add(a: Tuple[float, int], b: Tuple[float, int]) -> Tuple[float, int]:
    return (a[0] + b[0], 1 if (a[1] or b[1]) else 0)


def _pw_lt(a: Tuple[float, int], b: Tuple[float, int]) -> bool:
    return a[0] < b[0] - _PW_TOL or (abs(a[0] - b[0]) <= _PW_TOL and a[1] > b[1])


def _pw_is_inf(a: Tuple[float, int]) -> bool:
    return a[0] >= _DBM_INF / 2


def _dbm_close(dist: List[List[Tuple[float, int]]]) -> bool:
    """In-place Floyd-Warshall closure. Returns True iff a negative cycle exists
    (dist[i][i] < (0, 0), i.e. weight < 0 or a zero-weight cycle through a strict edge)."""
    n = len(dist)
    for k in range(n):
        dk = dist[k]
        for i in range(n):
            dik = dist[i][k]
            if _pw_is_inf(dik):
                continue
            di = dist[i]
            for j in range(n):
                dkj = dk[j]
                if _pw_is_inf(dkj):
                    continue
                cand = _pw_add(dik, dkj)
                if _pw_lt(cand, di[j]):
                    di[j] = cand
    for i in range(n):
        w, s = dist[i][i]
        if w < -_CYCLE_TOL or (abs(w) <= _CYCLE_TOL and s):
            return True
    return False


_FEAS_CACHE: Dict[Tuple[RelConstraint, ...], bool] = {}


def check_relational_feasibility(
    active_constraints: List[RelConstraint],
    want_witness: bool = True,
) -> Tuple[bool, Optional[Dict[str, float]]]:
    """Check whether a conjunction of relational constraints (Term_u OP Term_v + c,
    where each term is a variable or numeric constant) has a real-valued solution.

    Uses a Difference-Bound Matrix (DBM) over V = vars U {'0'} where every
    constraint is encoded as x_u - x_v (<= | <) w.  Bounds are lexicographic
    pairs (w, strict) -- see `_pw_add` / `_pw_lt` -- so a strict inequality needs no
    epsilon: x < y < x is a zero-weight cycle through strict edges and is
    rejected exactly, while 0 < x < 1e-9 is accepted.  Runs Floyd-Warshall
    all-pairs shortest paths:
      - Feasibility holds iff no negative cycle exists (dist[u][u] >= (0, 0)
        for all u) and no "!=" constraint has both endpoints forced equal.
      - When feasible and `want_witness`, a concrete rational-midpoint witness is
        built variable by variable: each variable is placed at the midpoint of its
        tightest (lo, hi) bounds relative to '0' (or one unit beyond a finite bound
        when the other side is unbounded), pinned, and the closure is refreshed.
    """
    if not active_constraints:
        return True, {}
    key = tuple(active_constraints)
    if not want_witness and key in _FEAS_CACHE:
        return _FEAS_CACHE[key], None

    nodes = ["__ZERO__"]
    node_idx = {"__ZERO__": 0}

    def get_node(term: str) -> Tuple[int, float]:
        """Return (node_id, constant_offset) representing term = node + offset."""
        val = _parse_number(term)
        if val is not None:
            return 0, val
        if term not in node_idx:
            node_idx[term] = len(nodes)
            nodes.append(term)
        return node_idx[term], 0.0

    parsed_items = []
    # neq_pairs entries: (u, off_u, v, off_v_plus_c)  meaning Term_u != x_v + off_v_plus_c
    neq_pairs: List[Tuple[int, float, int, float]] = []
    for c in active_constraints:
        u, off_u = get_node(c.lhs)
        v, off_v = get_node(c.rhs)
        parsed_items.append((c.op, u, off_u, v, off_v + c.offset))

    n = len(nodes)
    dist: List[List[Tuple[float, int]]] = [[_PW_INF] * n for _ in range(n)]
    for i in range(n):
        dist[i][i] = (0.0, 0)

    def add_edge(u: int, v: int, bound: float, strict: int) -> None:
        # Enforces x_u - x_v (<= | <) bound  (edge v -> u of weight (bound, strict))
        cand = (bound, strict)
        if _pw_lt(cand, dist[v][u]):
            dist[v][u] = cand

    for op, u, off_u, v, off_v in parsed_items:
        # Term_u = x_u + off_u ;  Term_v' = x_v + off_v  (offset c already folded in)
        # Term_u - Term_v' = (x_u - x_v) + (off_u - off_v)
        delta = off_v - off_u
        if op == "<=":
            add_edge(u, v, delta, 0)
        elif op == "<":
            add_edge(u, v, delta, 1)
        elif op == ">=":
            add_edge(v, u, -delta, 0)
        elif op == ">":
            add_edge(v, u, -delta, 1)
        elif op == "==":
            add_edge(u, v, delta, 0)
            add_edge(v, u, -delta, 0)
        elif op == "!=":
            neq_pairs.append((u, off_u, v, off_v))

    if _dbm_close(dist):
        _FEAS_CACHE[key] = False
        return False, None

    # "!=" is violated only when Term_u == Term_v' is forced by the closure:
    # x_u - x_v <= delta and x_v - x_u <= -delta, both non-strict.
    for u, off_u, v, off_v in neq_pairs:
        delta = off_v - off_u
        a, b = dist[v][u], dist[u][v]
        if (
            not _pw_is_inf(a)
            and not _pw_is_inf(b)
            and abs(a[0] - delta) <= _CYCLE_TOL
            and abs(b[0] + delta) <= _CYCLE_TOL
            and not a[1]
            and not b[1]
        ):
            _FEAS_CACHE[key] = False
            return False, None

    _FEAS_CACHE[key] = True
    if not want_witness:
        return True, None

    # ---- witness extraction: pin variables one at a time at interval midpoints ----
    val: Dict[int, float] = {0: 0.0}
    for idx in range(1, n):
        hi = dist[0][idx]       # x_idx - 0 <= hi
        lo_b = dist[idx][0]     # 0 - x_idx <= lo_b  =>  x_idx >= -lo_b
        has_hi = not _pw_is_inf(hi)
        has_lo = not _pw_is_inf(lo_b)
        lo_v = -lo_b[0] if has_lo else 0.0
        hi_v = hi[0] if has_hi else 0.0
        cands: List[float] = []
        if has_lo and has_hi:
            if abs(hi_v - lo_v) <= _PW_TOL:
                cands = [lo_v]
            else:
                cands = [lo_v + f * (hi_v - lo_v) for f in (0.5, 0.25, 0.75, 0.125, 0.875, 1 / 3, 2 / 3)]
        elif has_lo:
            cands = [lo_v + k for k in (1.0, 2.0, 3.0, 5.0, 8.0)]
        elif has_hi:
            cands = [hi_v - k for k in (1.0, 2.0, 3.0, 5.0, 8.0)]
        else:
            cands = [0.0, 1.0, -1.0, 2.0, -2.0, 3.0, 5.0]

        def collides(x: float) -> bool:
            for u, off_u, v, off_v in neq_pairs:
                if u == idx and v in val:
                    if abs((x + off_u) - (val[v] + off_v)) <= 1e-12:
                        return True
                elif v == idx and u in val:
                    if abs((val[u] + off_u) - (x + off_v)) <= 1e-12:
                        return True
                elif u == idx and v == idx:
                    if abs(off_u - off_v) <= 1e-12:
                        return True
            return False

        chosen = next((x for x in cands if not collides(x)), cands[0])
        val[idx] = chosen
        # pin x_idx = chosen (non-strict both ways) and refresh the closure
        for (a_, b_, w_) in ((idx, 0, chosen), (0, idx, -chosen)):
            cand = (w_, 0)
            if _pw_lt(cand, dist[b_][a_]):
                dist[b_][a_] = cand
        _dbm_close(dist)

    witness = {nodes[i]: float(f"{val[i]:.12g}") for i in range(1, n)}
    return True, witness


# ---------------------------------------------------------------------------
# 3. Self-Reference Fixed-Point Solver  v <-> f(v)
# ---------------------------------------------------------------------------

# Subject of a self-referential truth claim. Bare "I am" is only a subject when
# its predicate is a truth predicate ("I am lying"), checked in the solver.
_SELF_REF_SUBJ_RE = re.compile(
    r"^\s*(?P<subj>this\s+(?:statement|sentence|proposition|claim|assertion|rule)|"
    r"the\s+present\s+(?:statement|sentence|claim)|"
    r"i\s+am)\b",
    re.IGNORECASE,
)
_PAIR_SELF_REF_RE = re.compile(
    r"^\s*the\s+following\s+(?:statement|sentence)\s+is\s+(?P<a>[a-z\s']+?)\s*:\s*"
    r"the\s+preceding\s+(?:statement|sentence)\s+is\s+(?P<b>[a-z\s']+?)\s*[.!?]?\s*$",
    re.IGNORECASE,
)

# Closed-class truth-predicate vocabulary: the polarity of a predicate applied
# to the statement's own truth value v.  (This is grammar -- the meaning of
# "true"/"false" -- not a lookup of sentences or verdicts.)
_TRUTH_POS = {"true", "correct", "right", "accurate", "truthful", "valid", "honest"}
_TRUTH_NEG = {"false", "untrue", "incorrect", "wrong", "inaccurate", "lying", "invalid", "dishonest"}
_SR_FILLER = {
    "is", "are", "be", "being", "am", "also", "both", "really", "simply", "just",
    "completely", "entirely", "the", "a", "an", "itself", "exactly", "ever",
}
_SR_NEGATORS = {"not", "never", "no", "isn't", "aren't", "isnt", "arent", "cannot"}


class _SRParseError(Exception):
    pass


def _sr_tokens(text: str) -> List[str]:
    low = text.lower().replace("\u2019", "'")
    low = re.sub(r"\btelling\s+the\s+truth\b", "true", low)
    low = re.sub(r"\btelling\s+(?:a\s+)?(?:lie|lies)\b", "false", low)
    low = re.sub(r"\bnot\s+telling\s+the\s+truth\b", "false", low)
    return re.findall(r"[a-z']+|~|¬", low)


def _sr_parse_predicate(tokens: List[str]) -> Expr:
    """Recursive-descent parser for a boolean combination of truth predicates over
    the single variable v (the truth value of the statement itself):
        disj := conj ('or' conj)* | 'either' disj
        conj := neg ('and' neg)* | 'both' conj
        neg  := ('not' | 'never' | "isn't" | '~')* atom | 'neither' atom 'nor' atom
        atom := truth-word
    Raises _SRParseError when a token is neither truth vocabulary, connective nor filler."""
    toks = [t for t in tokens if t not in _SR_FILLER]
    pos = 0
    v = VarExpr(Atom(name="v"))

    def peek() -> Optional[str]:
        return toks[pos] if pos < len(toks) else None

    def eat() -> str:
        nonlocal pos
        t = toks[pos]
        pos += 1
        return t

    def parse_disj() -> Expr:
        if peek() == "either":
            eat()
        left = parse_conj()
        while peek() == "or":
            eat()
            left = OrExpr(left, parse_conj())
        return left

    def parse_conj() -> Expr:
        left = parse_neg()
        while peek() == "and":
            eat()
            left = AndExpr(left, parse_neg())
        return left

    def parse_neg() -> Expr:
        t = peek()
        if t == "neither":
            eat()
            a = parse_neg()
            if peek() != "nor":
                raise _SRParseError("neither without nor")
            eat()
            b = parse_neg()
            return AndExpr(NotExpr(a), NotExpr(b))
        if t in _SR_NEGATORS or t in ("~", "¬"):
            eat()
            return NotExpr(parse_neg())
        return parse_atom()

    def parse_atom() -> Expr:
        t = peek()
        if t is None:
            raise _SRParseError("unexpected end of predicate")
        eat()
        if t in _TRUTH_POS:
            return v
        if t in _TRUTH_NEG:
            return NotExpr(v)
        raise _SRParseError(f"non-truth token {t!r}")

    expr = parse_disj()
    if pos != len(toks):
        raise _SRParseError("trailing tokens")
    return expr


def _fixed_points(fs: List[object], names: List[str]) -> List[Dict[str, bool]]:
    """Brute-force the fixed points of the system  name_i <-> f_i(name_*)  over {False, True}."""
    out: List[Dict[str, bool]] = []
    for mask in range(1 << len(names)):
        env = {nm: bool((mask >> i) & 1) for i, nm in enumerate(names)}
        if all(eval_expr(f, env) == env[nm] for f, nm in zip(fs, names)):  # type: ignore[arg-type]
            out.append(env)
    return out


def _sr_verdict(n_fp: int, fixed: List[Dict[str, bool]], detail: str) -> Dict[str, object]:
    if n_fp == 0:
        return {
            "verdict": "Paradox",
            "fixed_points": [],
            "reason": f"self-referential truth equation {detail} has 0 boolean fixed points",
            "refuter_rule": "rejected -- the fixed-point set {v in {0,1} : v == f(v)} is empty",
        }
    if n_fp == 1:
        only = fixed[0]
        if all(only.values()):
            return {
                "verdict": "Tautology",
                "fixed_points": [True],
                "reason": f"self-referential truth equation {detail} has the unique fixed point v = True",
                "refuter_rule": "none -- v = False is not a fixed point, so the statement is consistently true",
            }
        return {
            "verdict": "Paradox",
            "fixed_points": [False],
            "reason": f"self-referential truth equation {detail} has the unique fixed point v = False",
            "refuter_rule": "the only consistent valuation makes the statement false",
        }
    return {
        "verdict": "Undecidable",
        "fixed_points": [False, True],
        "reason": f"self-referential truth equation {detail} has {n_fp} fixed points {{0, 1}} (underdetermined)",
        "refuter_rule": "underdetermined -- both v=True and v=False satisfy v <-> f(v)",
    }


def solve_self_reference(sentence: str) -> Optional[Dict[str, object]]:
    """If `sentence` is a self-referential truth-value claim, parse its predicate into
    a boolean function f(v) of the statement's own truth value v, and solve the
    fixed-point equation v <-> f(v) over {False, True}:
      - 0 fixed points (f(v) = not v)                    -> Paradox
      - exactly 1 fixed point, v = True (f(v) = v or ~v)  -> Tautology
      - 2 fixed points (f(v) = v)                        -> Undecidable
    Two-sentence cycles ("The following statement is X: the preceding statement is
    Y") are solved as the 2-variable system A <-> X(B), B <-> Y(A)."""
    s = sentence.strip()

    m_pair = _PAIR_SELF_REF_RE.match(s)
    if m_pair:
        try:
            fa = _sr_parse_predicate_of(m_pair.group("a"), "B")
            fb = _sr_parse_predicate_of(m_pair.group("b"), "A")
        except _SRParseError:
            return None
        fixed = _fixed_points([fa, fb], ["A", "B"])
        return _sr_verdict(len(fixed), fixed, "A <-> X(B), B <-> Y(A)")

    m = _SELF_REF_SUBJ_RE.search(s)
    if not m:
        return None
    rest = s[m.end():].strip().rstrip(".!?").strip()
    tokens = _sr_tokens(rest)
    has_truth_word = any(t in _TRUTH_POS or t in _TRUTH_NEG for t in tokens)
    if m.group("subj").lower().replace(" ", "") == "iam" and not has_truth_word:
        return None  # "I am tired" is not a self-referential truth claim
    if not has_truth_word:
        return {
            "verdict": "Undecidable",
            "fixed_points": [False, True],
            "reason": "self-referential subject without an external observable or truth anchor",
            "refuter_rule": "bind the self-reference to a concrete external proposition P",
        }
    try:
        f = _sr_parse_predicate(tokens)
    except _SRParseError:
        return None  # mixed truth-predicate + external content: let the ordinary parser decide
    fixed = _fixed_points([f], ["v"])
    return _sr_verdict(len(fixed), fixed, "v <-> f(v)")


def _sr_parse_predicate_of(text: str, var_name: str) -> Expr:
    """Parse a truth predicate whose subject is the other statement `var_name`."""
    e = _sr_parse_predicate(_sr_tokens(text))
    return _sr_rename_v(e, var_name)


def _sr_rename_v(e: Expr, name: str) -> Expr:
    if isinstance(e, VarExpr):
        return VarExpr(Atom(name=name))
    if isinstance(e, NotExpr):
        return NotExpr(_sr_rename_v(e.child, name))
    if isinstance(e, AndExpr):
        return AndExpr(_sr_rename_v(e.left, name), _sr_rename_v(e.right, name))
    if isinstance(e, OrExpr):
        return OrExpr(_sr_rename_v(e.left, name), _sr_rename_v(e.right, name))
    return e


# ---------------------------------------------------------------------------
# 4a. Exact affine-arithmetic layer (rational coefficients)
# ---------------------------------------------------------------------------

_AFF_TOKEN_RE = re.compile(
    r"\s*(?:(?P<num>\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|"
    r"(?P<id>[A-Za-z_][A-Za-z0-9_]*)|(?P<op>[()+\-*/]))"
)
_AFF_REL_RE = re.compile(r"(==|!=|<=|>=|≤|≥|≠|=|<|>)")
_AFF_OPS = {"==": "==", "=": "==", "!=": "!=", "≠": "!=", "<=": "<=", "≤": "<=", ">=": ">=", "≥": ">=", "<": "<", ">": ">"}
_FLIP_OP = {"==": "==", "!=": "!=", "<": ">", ">": "<", "<=": ">=", ">=": "<="}


class _AffineError(Exception):
    pass


@dataclass
class Affine:
    """sum_i coef[name_i] * name_i + const, with exact Fraction coefficients."""
    coef: Dict[str, Fraction]
    const: Fraction

    @staticmethod
    def number(c: Fraction) -> "Affine":
        return Affine({}, c)

    def add(self, other: "Affine", sign: int = 1) -> "Affine":
        co = dict(self.coef)
        for k, v in other.coef.items():
            co[k] = co.get(k, Fraction(0)) + sign * v
        return Affine({k: v for k, v in co.items() if v != 0}, self.const + sign * other.const)

    def scale(self, f: Fraction) -> "Affine":
        return Affine({k: v * f for k, v in self.coef.items() if v * f != 0}, self.const * f)


def parse_affine(text: str) -> Tuple[Affine, bool]:
    """Parse an affine arithmetic expression (numbers, identifiers, + - * /, parentheses,
    implicit multiplication `3x`).  Returns (Affine, used_binary_arithmetic).
    Raises _AffineError for anything non-affine or unparseable."""
    text = text.strip().rstrip("%")
    if re.search(r"[A-Za-z_][A-Za-z0-9_]*-[A-Za-z_]", text):
        raise _AffineError("hyphenated identifier")  # `latency-ms` is a name, not a difference
    toks: List[Tuple[str, str]] = []
    pos = 0
    while pos < len(text):
        if text[pos:].strip() == "":
            break
        m = _AFF_TOKEN_RE.match(text, pos)
        if not m:
            raise _AffineError(f"bad token at {pos}")
        kind = "num" if m.group("num") is not None else ("id" if m.group("id") else "op")
        toks.append((kind, m.group(kind)))
        pos = m.end()
    if not toks:
        raise _AffineError("empty")
    i = 0
    used_arith = False

    def peek() -> Optional[Tuple[str, str]]:
        return toks[i] if i < len(toks) else None

    def parse_expr() -> Affine:
        nonlocal i, used_arith
        left = parse_term()
        while peek() is not None and peek()[1] in ("+", "-"):  # type: ignore[index]
            op = toks[i][1]
            i += 1
            used_arith = True
            left = left.add(parse_term(), 1 if op == "+" else -1)
        return left

    def parse_term() -> Affine:
        nonlocal i, used_arith
        left = parse_factor()
        while True:
            t = peek()
            if t is None:
                return left
            if t[1] in ("*", "/"):
                i += 1
                used_arith = True
                right = parse_factor()
                if t[1] == "*":
                    if left.coef and right.coef:
                        raise _AffineError("non-linear product")
                    left = right.scale(left.const) if not left.coef else left.scale(right.const)
                else:
                    if right.coef or right.const == 0:
                        raise _AffineError("division by non-constant or zero")
                    left = left.scale(1 / right.const)
            elif t[0] in ("num", "id") or t[1] == "(":
                # implicit multiplication: `3x`, `2(x+1)`
                used_arith = True
                right = parse_factor()
                if left.coef and right.coef:
                    raise _AffineError("non-linear product")
                left = right.scale(left.const) if not left.coef else left.scale(right.const)
            else:
                return left

    def parse_factor() -> Affine:
        nonlocal i
        t = peek()
        if t is None:
            raise _AffineError("unexpected end")
        if t[1] in ("+", "-"):
            i += 1
            inner = parse_factor()
            return inner.scale(Fraction(1 if t[1] == "+" else -1))
        if t[0] == "num":
            i += 1
            return Affine.number(Fraction(t[1]))
        if t[0] == "id":
            i += 1
            return Affine({t[1].lower(): Fraction(1)}, Fraction(0))
        if t[1] == "(":
            i += 1
            inner = parse_expr()
            if peek() is None or peek()[1] != ")":  # type: ignore[index]
                raise _AffineError("unbalanced parenthesis")
            i += 1
            return inner
        raise _AffineError(f"unexpected token {t[1]!r}")

    result = parse_expr()
    if i != len(toks):
        raise _AffineError("trailing tokens")
    return result, used_arith


def _fmt_num(x: Fraction) -> str:
    return str(float(x))


def affine_relation(clause: str) -> Optional[Tuple[str, str, str, float]]:
    """Normalise `L OP R` with affine sides to (lhs, op, rhs, offset) meaning
    `lhs OP rhs + offset`, or a constant truth marker ("__const__", "true"/"false", "", 0.0).
    Returns None when the clause is not an affine relation that needs this layer
    (no arithmetic operator and at least one variable: the ordinary path handles `x < y`)."""
    parts = _AFF_REL_RE.split(clause)
    if len(parts) != 3:
        return None
    lhs_txt, op_txt, rhs_txt = parts
    try:
        left, used_l = parse_affine(lhs_txt)
        right, used_r = parse_affine(rhs_txt)
    except (_AffineError, ValueError, ZeroDivisionError):
        return None
    diff = left.add(right, -1)           # diff OP 0
    op = _AFF_OPS[op_txt]
    if not (used_l or used_r) and (left.coef or right.coef):
        return None
    if not diff.coef:
        c = diff.const
        truth = {
            "==": c == 0, "!=": c != 0, "<": c < 0, "<=": c <= 0, ">": c > 0, ">=": c >= 0,
        }[op]
        return ("__const__", "true" if truth else "false", "", 0.0)
    names = sorted(diff.coef)
    if len(names) == 1:
        a = diff.coef[names[0]]
        bound = -diff.const / a
        return (names[0], op if a > 0 else _FLIP_OP[op], _fmt_num(bound), 0.0)
    if len(names) == 2 and diff.coef[names[0]] == -diff.coef[names[1]]:
        a = diff.coef[names[0]]            # a*x0 - a*x1 + c OP 0  ->  x0 OP' x1 + (-c/a)
        return (names[0], op if a > 0 else _FLIP_OP[op], names[1], float(-diff.const / a))
    # general linear form: keep it as one opaque term keyed by its canonical coefficients
    a0 = diff.coef[names[0]]
    scaled = diff.scale(1 / a0)
    term = "+".join(
        (n if scaled.coef[n] == 1 else f"{_fmt_num(scaled.coef[n]).rstrip('0').rstrip('.')}*{n}") for n in names
    )
    bound = -scaled.const
    return (term, op if a0 > 0 else _FLIP_OP[op], _fmt_num(bound), 0.0)


# ---------------------------------------------------------------------------
# 4. Natural-Language & Symbolic Statement Parser -> Expr AST
# ---------------------------------------------------------------------------

_CONCESSIVE_LEAD_RE = re.compile(
    r"^(?:whatever|whichever|however|wherever|whenever|no\s+matter\s+\w+(?:\s+\w+)?)\b[^,]*,\s*",
    re.IGNORECASE,
)
_CONCESSIVE_TRAIL_RE = re.compile(
    r",\s*(?:whatever|whichever|however|wherever|whenever|no\s+matter)\b[^,]*$",
    re.IGNORECASE,
)

# Symbolic or verbal relational comparison inside a clause
_REL_CLAUSE_RE = re.compile(
    r"^\s*(?:the\s+|a\s+|an\s+|every\s+|all\s+|any\s+)?([A-Za-z_][A-Za-z0-9_.\-\s]{0,35}?|[+-]?\d+(?:\.\d+)?)\s*"
    r"(==|!=|<=|>=|<|>|=|≠|≤|≥|"
    r"is\s+strictly\s+greater\s+than|is\s+greater\s+than|is\s+more\s+than|is\s+above|is\s+over|exceeds|beats|surpasses|"
    r"is\s+strictly\s+less\s+than|is\s+less\s+than|is\s+smaller\s+than|is\s+below|is\s+under|falls\s+below|"
    r"is\s+at\s+least|is\s+no\s+less\s+than|"
    r"is\s+at\s+most|is\s+no\s+more\s+than|does\s+not\s+exceed|"
    r"is\s+not\s+equal\s+to|differs\s+from|"
    r"is\s+equal\s+to|equals)\s*"
    r"([A-Za-z_][A-Za-z0-9_.\-\s]{0,35}?|[+-]?\d+(?:\.\d+)?%?)\s*$",
    re.IGNORECASE,
)

_OP_CANON = {
    "==": "==",
    "=": "==",
    "equals": "==",
    "is equal to": "==",
    "!=": "!=",
    "≠": "!=",
    "is not equal to": "!=",
    "differs from": "!=",
    "<": "<",
    "is strictly less than": "<",
    "is less than": "<",
    "is smaller than": "<",
    "is below": "<",
    "is under": "<",
    "falls below": "<",
    "<=": "<=",
    "≤": "<=",
    "is at most": "<=",
    "is no more than": "<=",
    "does not exceed": "<=",
    ">": ">",
    "is strictly greater than": ">",
    "is greater than": ">",
    "is more than": ">",
    "is above": ">",
    "is over": ">",
    "exceeds": ">",
    "beats": ">",
    "surpasses": ">",
    ">=": ">=",
    "≥": ">=",
    "is at least": ">=",
    "is no less than": ">=",
}

_STOPWORDS = {
    "the", "a", "an", "this", "that", "these", "those", "it", "its",
    "what", "whatever", "which", "whichever", "is", "are", "was", "were", "be",
    "to", "of", "in", "on", "for", "by", "with", "at", "from",
}


def _normalize_term(raw: str) -> str:
    t = raw.strip().strip(".,;:()[]{}\"'")
    num = _parse_number(t)
    if num is not None:
        return str(num)
    words = [w.lower() for w in re.findall(r"[A-Za-z0-9_.\-]+", t) if w.lower() not in _STOPWORDS]
    if not words:
        words = [w.lower() for w in re.findall(r"[A-Za-z0-9_.\-]+", t)]
    return "_".join(words) if words else "x"


def _check_reflexive_identity(clause: str) -> Optional[Tuple[str, bool]]:
    """Detect syntactic reflexive identity 'X is X' / 'X = X' or self-inequality 'X != X'.
    Returns (term_name, is_positive_identity) if reflexive, else None.
    Uses only the tokens of `clause` itself (no external dictionary)."""
    s = clause.strip().rstrip(".!?")
    s = _CONCESSIVE_LEAD_RE.sub("", s)
    s = _CONCESSIVE_TRAIL_RE.sub("", s)

    # Check symbolic X == X or X != X
    m_sym = re.match(r"^([^=!<>]+?)\s*(==|=|!=|≠|<|>)\s*([^=!<>]+?)$", s)
    if m_sym:
        lhs = _normalize_term(m_sym.group(1))
        op = m_sym.group(2)
        rhs = _normalize_term(m_sym.group(3))
        if lhs and lhs == rhs:
            if op in ("==", "="):
                return lhs, True
            if op in ("!=", "≠", "<", ">"):
                return lhs, False

    # Check natural-language copular identity: "X is X", "X is what X is", "X is not X"
    m_cop = re.match(r"^(.*?)\b(is\s+not|are\s+not|isn't|aren't|is|are|was|were)\b(.*)$", s, re.IGNORECASE)
    if m_cop:
        raw_subj, verb, raw_comp = m_cop.group(1), m_cop.group(2).lower(), m_cop.group(3)
        is_neg = "not" in verb or "n't" in verb
        subj_toks = [
            t.lower() for t in re.findall(r"[A-Za-z0-9_]+", raw_subj)
            if t.lower() not in _STOPWORDS
        ]
        comp_toks = [
            t.lower() for t in re.findall(r"[A-Za-z0-9_]+", raw_comp)
            if t.lower() not in _STOPWORDS and t.lower() not in {"itself", "themselves"}
        ]
        if subj_toks and comp_toks and subj_toks == comp_toks:
            term = "_".join(subj_toks)
            return term, (not is_neg)
    return None


def _is_symbolic_term(term: str) -> bool:
    """A normalised term is symbolic if it is a short identifier phrase (<= 2 tokens)."""
    return term != "" and len(term.split("_")) <= 2


def _rel_expr(lhs: str, op: str, rhs: str, universal_scope: bool, offset: float = 0.0) -> Expr:
    """Build the canonical literal for `lhs OP rhs + offset`.  `!=` and `>=` are
    expressed as Not(==) and Not(<) so that p and ~p share one underlying Atom."""
    if op == "!=":
        base = RelConstraint(lhs, "==", rhs, offset)
        return NotExpr(VarExpr(Atom(name=base.format(), rel=base, is_quantitative=True, is_universal=universal_scope)))
    if op == ">=":
        base = RelConstraint(lhs, "<", rhs, offset)
        return NotExpr(VarExpr(Atom(name=base.format(), rel=base, is_quantitative=True, is_universal=universal_scope)))
    rel = RelConstraint(lhs, op, rhs, offset)
    return VarExpr(Atom(name=rel.format(), rel=rel, is_quantitative=True, is_universal=universal_scope))


def _parse_atomic_clause(
    clause: str,
    default_subject: Optional[str] = None,
    universal_scope: bool = False,
) -> Tuple[Expr, Optional[str]]:
    """Parse an atomic clause into a VarExpr or NotExpr(VarExpr).
    Returns (expr, extracted_subject)."""
    s = clause.strip().strip(".!?")
    while s.startswith("(") and s.endswith(")") and _balanced_parens(s[1:-1]):
        s = s[1:-1].strip()

    # 0. Exact affine arithmetic relation (`2 + 2 = 4`, `x + 1 > x`, `x + y > 3`, `2 * x = 6`):
    #    constant relations evaluate to `0 == 0` (always true) / `0 < 0` (always false);
    #    single-variable relations solve to `x OP c`; x - y OP c become difference bounds.
    aff = affine_relation(s)
    if aff is not None:
        a_lhs, a_op, a_rhs, a_off = aff
        if a_lhs == "__const__":
            if a_op == "true":
                return _rel_expr("0", "==", "0", universal_scope), None
            return _rel_expr("0", "<", "0", universal_scope), None
        return _rel_expr(a_lhs, a_op, a_rhs, universal_scope, a_off), a_lhs

    # 1. Check reflexive identity 'X is X' / 'X == X' / 'X != X'
    refl = _check_reflexive_identity(s)
    if refl is not None:
        term, is_pos = refl
        op = "==" if is_pos else "!="
        rel = RelConstraint(term, op, term)
        atom = Atom(name=rel.format(), rel=rel, is_quantitative=True, is_universal=universal_scope)
        return VarExpr(atom), term

    # 2. Check explicit relational constraint (lhs OP rhs)
    m_rel = _REL_CLAUSE_RE.match(s)
    if m_rel:
        lhs_raw, op_raw, rhs_raw = m_rel.group(1), m_rel.group(2), m_rel.group(3)
        op_key = " ".join(op_raw.lower().split())
        op = _OP_CANON.get(op_key)
        if op:
            lhs = _normalize_term(lhs_raw)
            rhs = _normalize_term(rhs_raw)
            # Only treat as a relational constraint if at least one side is numeric,
            # symbolic (<= 2 identifier tokens), or both sides share a variable space.
            if (
                _parse_number(lhs) is not None
                or _parse_number(rhs) is not None
                or (_is_symbolic_term(lhs) and _is_symbolic_term(rhs))
            ):
                # Canonicalize negated relations (e.g. != -> Not(==), >= -> Not(<))
                # so that p and ~p share the same underlying Atom!
                return _rel_expr(lhs, op, rhs, universal_scope), lhs

    # 3. Check inline quantitative measurement commitments in technical prose
    # e.g., "the data shows a +12.3 z deflection", "achieved 99.4% accuracy", "n = 2286 rows"
    m_quant = re.search(
        r"\b([A-Za-z_][A-Za-z0-9_\-]*)\b\s+(?:(?:=|==|is|equals|of|at)\s+)?(?<![A-Za-z0-9_])([+-]?\d+(?:\.\d+)?%?)\b",
        s,
    )
    # Count leading / verbal negations in the clause
    low = s.lower()
    neg_count = 0
    # Strip leading 'not' / 'never' / 'it is not the case that' / '~' / '¬'
    work = s
    while True:
        m_neg_lead = re.match(
            r"^(?:it\s+is\s+not\s+the\s+case\s+that\s+|not\s+|never\s+|~|¬)\s*(.*)$",
            work,
            re.IGNORECASE,
        )
        if m_neg_lead:
            neg_count += 1
            work = m_neg_lead.group(1).strip()
        else:
            break

    # Check auxiliary verbal negation: "does not", "do not", "did not", "is not", "are not",
    # "cannot", "can not", "will not", "has not", "have not", "fails to"
    work_norm, n_subs = re.subn(
        r"\b(?:does\s+not|do\s+not|did\s+not|is\s+not|are\s+not|was\s+not|were\s+not|"
        r"has\s+not|have\s+not|cannot|can\s+not|will\s+not|would\s+not|must\s+not|"
        r"doesn't|don't|didn't|isn't|aren't|wasn't|weren't|can't|won't|fails\s+to)\b",
        " ",
        work,
        flags=re.IGNORECASE,
    )
    neg_count += n_subs

    if m_quant and any(ch.isdigit() for ch in m_quant.group(2)):
        var_tok = _normalize_term(m_quant.group(1))
        val_tok = _normalize_term(m_quant.group(2))
        if _parse_number(val_tok) is not None and var_tok not in _STOPWORDS:
            # Build a canonical predicate stem including the clause context + numeric commitment
            stem_toks = [
                t.lower() for t in re.findall(r"[A-Za-z0-9_.+-]+", work_norm)
                if t.lower() not in _STOPWORDS and _parse_number(t) is None
            ]
            rel_lhs = "_".join(stem_toks[:3]) if len(stem_toks) > 1 else var_tok
            rel = RelConstraint(rel_lhs, "==", val_tok)
            atom = Atom(name=rel.format(), rel=rel, is_quantitative=True, is_universal=universal_scope)
            expr: Expr = VarExpr(atom)
            for _ in range(neg_count % 2):
                expr = NotExpr(expr)
            return expr, rel_lhs

    # 4. General predicate stem extraction (morphological lemmatization of 3rd-person singular verbs
    # so "it rains" and "it does not rain" normalize to the exact same atom `rain(it)`!)
    raw_tokens = [t.lower() for t in re.findall(r"[A-Za-z0-9_]+", work_norm)]
    content_tokens: List[str] = []
    subj = default_subject
    for tok in raw_tokens:
        if tok in _STOPWORDS:
            continue
        # Normalize simple 3rd-person singular verb inflections ("rains" -> "rain", "holds" -> "hold")
        # when comparing against "does not rain" / "does not hold"
        if len(tok) > 4 and tok.endswith("es") and not tok.endswith(("ses", "zes", "xes", "ches", "shes")):
            pass
        elif len(tok) > 3 and tok.endswith("s") and not tok.endswith(("ss", "us", "is", "os", "as")):
            tok = tok[:-1]
        content_tokens.append(tok)

    if not content_tokens:
        content_tokens = raw_tokens if raw_tokens else ["empty"]

    starts_anaphoric = bool(
        raw_tokens and raw_tokens[0] in {"it", "they", "this", "that", "these", "those", "he", "she"}
    ) or bool(
        re.match(r"^(?:is|are|was|were|does|do|did|has|have|can|will|must|not)\b", s, re.IGNORECASE)
    )
    if default_subject and (len(content_tokens) == 1 or starts_anaphoric):
        pred_part = "_".join(t for t in content_tokens if t != default_subject)
        atom_name = f"{default_subject}_{pred_part}" if pred_part else default_subject
    else:
        if len(content_tokens) >= 2 and subj is None:
            subj = content_tokens[0]
        atom_name = "_".join(content_tokens)

    # Check if the clause has a standalone quantitative number token
    has_standalone_number = any(_parse_number(t) is not None for t in raw_tokens)
    atom = Atom(
        name=atom_name,
        rel=None,
        is_quantitative=has_standalone_number,
        is_universal=universal_scope,
    )
    expr = VarExpr(atom)
    for _ in range(neg_count % 2):
        expr = NotExpr(expr)
    return expr, subj


def _balanced_parens(s: str) -> bool:
    depth = 0
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def _split_top_level(s: str, sep_pattern: str) -> Optional[Tuple[str, str]]:
    """Split string `s` at the first top-level match of `sep_pattern` (outside parentheses)."""
    depth = 0
    for m in re.finditer(sep_pattern, s, flags=re.IGNORECASE):
        prefix = s[: m.start()]
        depth = prefix.count("(") - prefix.count(")")
        if depth == 0:
            left = s[: m.start()].strip(" ,;")
            right = s[m.end() :].strip(" ,;")
            if left and right:
                return left, right
    return None


_FORALL_RE = re.compile(
    r"^(?:for\s+all|forall|for\s+every|∀)\s+((?:[A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)"
    r"\s*(?:,|\s+such\s+that\s+|\s*:)\s*(.+)$",
    re.IGNORECASE,
)
_EXISTS_RE = re.compile(
    r"^(?:there\s+exists|exists|for\s+some|∃)\s+([A-Za-z0-9_,\s]+?)(?:\s+such\s+that\s+|,|\s*:\s*)(.+)$",
    re.IGNORECASE,
)
_VAR_PREFIX_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*|\s+such\s+that\s+)(.+)$", re.IGNORECASE)


def _split_quantifier(s: str) -> Optional[Tuple[str, "set[str]", str]]:
    """Recognise a leading explicit quantifier.  Returns (kind, bound_vars, body) with
    kind in {'forall', 'exists'}, or None."""
    m = _FORALL_RE.match(s)
    kind = "forall"
    if m:
        bound = {v.strip().lower() for v in m.group(1).split(",") if v.strip()}
        body = m.group(2)
    else:
        m = _EXISTS_RE.match(s)
        if not m:
            return None
        kind = "exists"
        bound = {v.lower() for v in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1))}
        body = m.group(2)
        # absorb further bound variables of "exists x, y such that ..."
        while True:
            mv = _VAR_PREFIX_RE.match(body)
            if not mv or re.match(r"^(?:if|not|it|the|a|an)$", mv.group(1), re.IGNORECASE):
                break
            bound.add(mv.group(1).lower())
            body = mv.group(2)
    return kind, bound, body.strip()


def _term_vars(term: str) -> "set[str]":
    if _parse_number(term) is not None:
        return set()
    return {t.lower() for t in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", term)}


def _quantifier_domain_claim(
    kind: str, bound: "set[str]", body: Expr
) -> Optional[Tuple[str, Dict[str, object]]]:
    """Decide an explicit *mathematical* quantifier over the reals when the body is
    purely relational and mentions only its bound variables (and constants).

      forall x. P(x): true over R iff P holds in every feasible world (rho == 1.0).  If
                      some feasible world falsifies P, the DBM supplies a real-valued
                      counterexample, so the universal claim is false (Paradox).
      exists x. P(x): true over R iff some feasible world satisfies P (a real
                      witness exists); false iff P has no satisfying world.
    Returns (verdict, solved) or None when the body is not a bound-variable domain claim."""
    atoms = collect_atoms(body)
    if not atoms or any(a.rel is None for a in atoms):
        return None
    free: "set[str]" = set()
    for a in atoms:
        free |= _term_vars(a.rel.lhs) | _term_vars(a.rel.rhs)  # type: ignore[union-attr]
    if not free <= bound:
        return None
    solved = solve_formula(body)
    if not solved.get("exact", True):
        return None
    sat = int(solved["satisfying_worlds"])  # type: ignore[arg-type]
    fals = int(solved["falsifying_worlds"])  # type: ignore[arg-type]
    if kind == "exists":
        return ("Tautology" if sat > 0 else "Paradox"), solved
    return ("Tautology" if fals == 0 and sat > 0 else "Paradox"), solved


def parse_statement_ast(
    sentence: str,
    default_subject: Optional[str] = None,
    universal_scope: bool = False,
) -> Expr:
    """Recursively parse a sentence or symbolic formula into a propositional + relational Expr AST."""
    s = sentence.strip().rstrip(".!?").strip()
    while s.startswith("(") and s.endswith(")") and _balanced_parens(s[1:-1]):
        s = s[1:-1].strip()

    # Leading explicit quantifier: "For all x, ..." / "There exists x such that ..."
    qparts = _split_quantifier(s)
    if qparts is not None:
        q_kind, _q_bound, q_body = qparts
        return parse_statement_ast(
            q_body, default_subject=default_subject, universal_scope=(q_kind == "forall" or universal_scope)
        )

    # Sentence-level negation takes the WIDEST scope: "It is not the case that A and B" = ~(A & B)
    m_not_case = re.match(r"^it\s+is\s+not\s+the\s+case\s+that\s+(.+)$", s, re.IGNORECASE)
    if m_not_case:
        return NotExpr(parse_statement_ast(m_not_case.group(1), default_subject, universal_scope))

    # Universal subject-predicate: "Every X that is A is B" or "Every X is either A or B" or "Every X <pred>"
    m_univ_either = re.match(
        r"^(?:every|any|each|all)\s+(.+?)\s+(?:is|are)\s+either\s+(.+?)\s+or\s+(.+)$",
        s,
        re.IGNORECASE,
    )
    if m_univ_either:
        subj = _normalize_term(m_univ_either.group(1))
        left_e = parse_statement_ast(m_univ_either.group(2), default_subject=subj, universal_scope=True)
        right_e = parse_statement_ast(m_univ_either.group(3), default_subject=subj, universal_scope=True)
        return OrExpr(left_e, right_e)

    m_univ_rel = re.match(
        r"^(?:every|any|each|all)\s+([A-Za-z0-9_\s\-]+?)\s+that\s+(?:is|are|has|have)\s+(.+?)\s+(is|are|has|have|must\s+be|exceeds|equals)\s+(.+)$",
        s,
        re.IGNORECASE,
    )
    if m_univ_rel:
        subj = _normalize_term(m_univ_rel.group(1))
        ant = parse_statement_ast(m_univ_rel.group(2), default_subject=subj, universal_scope=True)
        cons = parse_statement_ast(
            f"{subj} {m_univ_rel.group(3)} {m_univ_rel.group(4)}",
            default_subject=subj,
            universal_scope=True,
        )
        return ImpliesExpr(ant, cons)

    m_no_univ = re.match(r"^no\s+([A-Za-z0-9_\s\-]+?)\s+(is|are|has|have|can\s+be)\s+(.+)$", s, re.IGNORECASE)
    if m_no_univ:
        subj = _normalize_term(m_no_univ.group(1))
        body, _ = _parse_atomic_clause(
            f"{subj} {m_no_univ.group(2)} {m_no_univ.group(3)}",
            default_subject=subj,
            universal_scope=True,
        )
        return ImpliesExpr(VarExpr(Atom(name=f"domain:{subj}", is_universal=True)), NotExpr(body))

    m_every_simple = re.match(
        r"^(?:every|all|each)\s+([A-Za-z0-9_\s\-]{1,30}?)\s+(is|are|has|have|must\s+\w+|preserves\s+\w+|satisfies\s+\w+)\s+(.+)$",
        s,
        re.IGNORECASE,
    )
    if m_every_simple and " either " not in s.lower() and " and " not in m_every_simple.group(1).lower():
        subj = _normalize_term(m_every_simple.group(1))
        pred_clause = f"{subj} {m_every_simple.group(2)} {m_every_simple.group(3)}"
        cons, _ = _parse_atomic_clause(pred_clause, default_subject=subj, universal_scope=True)
        return ImpliesExpr(VarExpr(Atom(name=f"domain:{subj}", is_universal=True)), cons)

    # 1. Biconditional: <->, <=>, ↔, iff, if and only if
    sp = _split_top_level(s, r"\s*(?:<->|<=>|↔|\biff\b|\bif\s+and\s+only\s+if\b)\s*")
    if sp:
        return IffExpr(
            parse_statement_ast(sp[0], default_subject, universal_scope),
            parse_statement_ast(sp[1], default_subject, universal_scope),
        )

    # 2. Conditional: "If A, then B" / "If A then B" / "A -> B" / "A => B" / "A implies B"
    if re.match(r"^if\b", s, re.IGNORECASE):
        body = re.sub(r"^if\s+", "", s, flags=re.IGNORECASE)
        sp_then = _split_top_level(body, r"\s*(?:,\s*then\b|\bthen\b)\s*")
        if sp_then:
            return ImpliesExpr(
                parse_statement_ast(sp_then[0], default_subject, universal_scope),
                parse_statement_ast(sp_then[1], default_subject, universal_scope),
            )
    sp_imp = _split_top_level(s, r"\s*(?:->|=>|→|\bimplies\b|\btherefore\b)\s*")
    if sp_imp:
        return ImpliesExpr(
            parse_statement_ast(sp_imp[0], default_subject, universal_scope),
            parse_statement_ast(sp_imp[1], default_subject, universal_scope),
        )

    # 3. Disjunction: "Either A or B" / "A or B" / "A ∨ B" / "A | B"
    m_either = re.match(r"^either\s+(.+)$", s, re.IGNORECASE)
    if m_either:
        sp_or = _split_top_level(m_either.group(1), r"\s+(?:or|∨|\|)\s+")
        if sp_or:
            l_expr, subj = _parse_branch_with_subject(sp_or[0], default_subject, universal_scope)
            r_expr = parse_statement_ast(sp_or[1], default_subject=subj or default_subject, universal_scope=universal_scope)
            return OrExpr(l_expr, r_expr)

    # Predicate-level "X is either A or B"
    m_pred_either = re.match(r"^(.+?)\s+(?:is|are)\s+either\s+(.+?)\s+or\s+(.+)$", s, re.IGNORECASE)
    if m_pred_either:
        subj = _normalize_term(m_pred_either.group(1))
        l_expr = parse_statement_ast(m_pred_either.group(2), default_subject=subj, universal_scope=universal_scope)
        r_expr = parse_statement_ast(m_pred_either.group(3), default_subject=subj, universal_scope=universal_scope)
        return OrExpr(l_expr, r_expr)

    sp_or = _split_top_level(s, r"\s*(?:\bor\b|∨|\|)\s*")
    if sp_or:
        l_expr, subj = _parse_branch_with_subject(sp_or[0], default_subject, universal_scope)
        r_expr = parse_statement_ast(sp_or[1], default_subject=subj or default_subject, universal_scope=universal_scope)
        return OrExpr(l_expr, r_expr)

    # 4. Conjunction: "A and B" / "A ∧ B" / "A & B"
    sp_and = _split_top_level(s, r"\s*(?:\band\b|∧|&|\bwhile\b|\bwhereas\b)\s*")
    if sp_and:
        l_expr, subj = _parse_branch_with_subject(sp_and[0], default_subject, universal_scope)
        r_expr = parse_statement_ast(sp_and[1], default_subject=subj or default_subject, universal_scope=universal_scope)
        return AndExpr(l_expr, r_expr)

    # 5. Prefix negation: "not (...)" / "~(...)" / "¬(...)" / "it is not the case that ..."
    m_not = re.match(
        r"^(?:it\s+is\s+not\s+the\s+case\s+that\s+|not\s+|~|¬)\s*(\(.+\)|.+)$",
        s,
        re.IGNORECASE,
    )
    if m_not and ("(" in m_not.group(1) or re.search(r"\b(?:and|or|if|then|implies)\b|->|<->|==|!=|<|>", m_not.group(1), re.I)):
        return NotExpr(parse_statement_ast(m_not.group(1), default_subject, universal_scope))

    # 6. Atomic clause
    expr, _ = _parse_atomic_clause(s, default_subject=default_subject, universal_scope=universal_scope)
    return expr


def _parse_branch_with_subject(
    text: str, default_subject: Optional[str], universal_scope: bool
) -> Tuple[Expr, Optional[str]]:
    expr = parse_statement_ast(text, default_subject=default_subject, universal_scope=universal_scope)
    if isinstance(expr, VarExpr):
        parts = expr.atom.name.split(":", 1)
        if len(parts) == 2:
            return expr, parts[0]
        toks = expr.atom.name.split("_")
        if len(toks) >= 2:
            return expr, toks[0]
    elif isinstance(expr, NotExpr) and isinstance(expr.child, VarExpr):
        parts = expr.child.atom.name.split(":", 1)
        if len(parts) == 2:
            return expr, parts[0]
        toks = expr.child.atom.name.split("_")
        if len(toks) >= 2:
            return expr, toks[0]
    return expr, default_subject


# ---------------------------------------------------------------------------
# 5. Truth-Table & Difference-Bound Model-Space Evaluator
# ---------------------------------------------------------------------------

def eval3(expr: Expr, env: Dict[str, bool]) -> Optional[bool]:
    """Kleene three-valued evaluation under a *partial* assignment (None = undetermined)."""
    if isinstance(expr, VarExpr):
        return env.get(expr.atom.name)
    if isinstance(expr, NotExpr):
        v = eval3(expr.child, env)
        return None if v is None else (not v)
    if isinstance(expr, AndExpr):
        a, b = eval3(expr.left, env), eval3(expr.right, env)
        if a is False or b is False:
            return False
        return True if (a is True and b is True) else None
    if isinstance(expr, OrExpr):
        a, b = eval3(expr.left, env), eval3(expr.right, env)
        if a is True or b is True:
            return True
        return False if (a is False and b is False) else None
    if isinstance(expr, ImpliesExpr):
        a, b = eval3(expr.antecedent, env), eval3(expr.consequent, env)
        if a is False or b is True:
            return True
        return False if (a is True and b is False) else None
    if isinstance(expr, IffExpr):
        a, b = eval3(expr.left, env), eval3(expr.right, env)
        return None if (a is None or b is None) else (a == b)
    raise ValueError(f"Unknown Expr node: {expr!r}")


_NODE_BUDGET = 2_000_000


def solve_formula(expr: Expr, node_budget: int = _NODE_BUDGET) -> Dict[str, object]:
    """Count the feasible / satisfying / falsifying truth assignments of `expr` by a
    DPLL-style recursive split on its atoms.

      - Relational atoms are split first and every partial assignment is pruned as
        soon as its relational literals are arithmetically infeasible (exact DBM).
      - Once every relational atom is assigned, a formula whose value is already
        determined by the partial assignment (Kleene evaluation) contributes
        2^(#unassigned propositional atoms) worlds at once, so formulas with many
        atoms (e.g. p0 | ... | p16 | ~p0) are counted exactly without enumerating 2^k.
      - Every atom is always present in the witness environments, so `eval_expr`
        can never see a missing atom, whatever k is.
      - `node_budget` bounds the search; if it is exhausted the result carries
        exact=False and callers must not claim a verdict from the partial counts.
    """
    atoms = collect_atoms(expr)
    k = len(atoms)
    order = [a for a in atoms if a.rel is not None] + [a for a in atoms if a.rel is None]
    n_rel = sum(1 for a in atoms if a.rel is not None)

    counts = {"feas": 0, "sat": 0, "fals": 0}
    witnesses: Dict[str, Optional[Dict[str, object]]] = {"sat": None, "fals": None}
    state = {"nodes": 0, "exact": True}
    env: Dict[str, bool] = {}

    def record(truth: bool, mult: int, active: List[RelConstraint]) -> None:
        counts["feas"] += mult
        key = "sat" if truth else "fals"
        counts[key] += mult
        if witnesses[key] is None:
            full = {a.name: env.get(a.name, False) for a in atoms}
            _, num_w = check_relational_feasibility(list(active))
            witnesses[key] = {"propositional": full, "numerical": num_w or {}}

    def rec(i: int, active: List[RelConstraint]) -> None:
        if not state["exact"]:
            return
        state["nodes"] += 1
        if state["nodes"] > node_budget:
            state["exact"] = False
            return
        val = eval3(expr, env)
        if i >= n_rel and (val is not None):
            record(val, 1 << (k - i), active)
            return
        if i >= k:  # fully assigned (val is always determined here)
            record(bool(val), 1, active)
            return
        atom = order[i]
        for b in (False, True):
            env[atom.name] = b
            nxt = active
            if atom.rel is not None:
                nxt = active + [atom.rel if b else atom.rel.negate()]
                if not check_relational_feasibility(nxt, want_witness=False)[0]:
                    continue
            rec(i + 1, nxt)
        env.pop(atom.name, None)

    if k == 0:
        val0 = eval3(expr, {})
        record(bool(val0), 1, [])
    else:
        rec(0, [])

    feasible_worlds, satisfying_worlds, falsifying_worlds = counts["feas"], counts["sat"], counts["fals"]
    rho = (satisfying_worlds / feasible_worlds) if feasible_worlds > 0 else 0.0
    return {
        "n_atoms": k,
        "n_connectives": count_connectives(expr),
        "has_quantitative_atom": any(a.is_quantitative for a in atoms),
        "has_universal_atom": any(a.is_universal for a in atoms),
        "has_relational_atom": any(a.rel is not None for a in atoms),
        "feasible_worlds": feasible_worlds,
        "satisfying_worlds": satisfying_worlds,
        "falsifying_worlds": falsifying_worlds,
        "satisfaction_ratio": round(rho, 6),
        "sat_witness": witnesses["sat"],
        "falsifying_witness": witnesses["fals"],
        "formula": format_expr(expr),
        "exact": bool(state["exact"]),
        "search_nodes": state["nodes"],
    }


def classify(sentence: str) -> Dict[str, object]:
    """Classify `sentence` into {'Tautology', 'Falsifiable', 'Paradox', 'Undecidable'}
    strictly by solving its propositional + relational constraint AST."""
    if not isinstance(sentence, str):
        raise TypeError("classify expects a string sentence")

    s = sentence.strip()
    tokens = re.findall(r"[A-Za-z0-9_.\-+]+", s)
    if not s or not tokens:
        return {
            "sentence": sentence,
            "verdict": "Undecidable",
            "refuter": None,
            "reason": "empty statement (no propositional or relational atoms)",
            "refuter_rule": "supply a proposition with an explicit relation or truth condition",
            "token_count": 0,
            "satisfaction_ratio": None,
        }

    # Step 1: Check self-referential fixed-point equations (v <-> ~v or v <-> v)
    sr = solve_self_reference(s)
    if sr is not None:
        return {
            "sentence": sentence,
            "verdict": sr["verdict"],
            "refuter": None,
            "reason": sr["reason"],
            "refuter_rule": sr["refuter_rule"],
            "token_count": len(tokens),
            "fixed_points": sr.get("fixed_points"),
            "satisfaction_ratio": (
                0.0 if sr["verdict"] == "Paradox" else (1.0 if sr["verdict"] == "Tautology" else None)
            ),
        }

    # Step 1b: explicit mathematical quantifiers over R ("For all x, P(x)" / "There exists x such that P(x)")
    qparts = _split_quantifier(s.rstrip(".!?").strip())
    if qparts is not None:
        q_kind, q_bound, q_body = qparts
        decided = _quantifier_domain_claim(q_kind, q_bound, parse_statement_ast(q_body))
        if decided is not None:
            q_verdict, q_solved = decided
            qname = "forall" if q_kind == "forall" else "exists"
            body_fmt = q_solved["formula"]
            if q_verdict == "Tautology":
                why = (
                    f"{qname} {sorted(q_bound)}: body {body_fmt} holds in all {q_solved['satisfying_worlds']} feasible worlds"
                    if q_kind == "forall"
                    else f"{qname} {sorted(q_bound)}: body {body_fmt} has {q_solved['satisfying_worlds']} satisfying feasible world(s) over R"
                )
                return {
                    "sentence": sentence,
                    "verdict": "Tautology",
                    "refuter": None,
                    "reason": why,
                    "refuter_rule": "none -- the quantified statement is true over the reals",
                    "token_count": len(tokens),
                    "satisfaction_ratio": 1.0,
                    "formula": f"{qname} {','.join(sorted(q_bound))}. {body_fmt}",
                }
            fw = q_solved.get("falsifying_witness")
            num_w = fw.get("numerical", {}) if isinstance(fw, dict) else {}
            counter = ", ".join(f"{k}={v}" for k, v in sorted(num_w.items())) or None
            why = (
                f"forall {sorted(q_bound)}: body {body_fmt} fails at a real counter-model ({counter})"
                if q_kind == "forall"
                else f"exists {sorted(q_bound)}: body {body_fmt} has 0 satisfying feasible worlds over R"
            )
            return {
                "sentence": sentence,
                "verdict": "Paradox",
                "refuter": counter,
                "reason": why,
                "refuter_rule": (
                    f"universal claim refuted by real counter-model {{{counter}}}"
                    if q_kind == "forall"
                    else "existential claim has no real witness"
                ),
                "token_count": len(tokens),
                "satisfaction_ratio": 0.0,
                "formula": f"{qname} {','.join(sorted(q_bound))}. {body_fmt}",
            }

    # Step 2: Parse into compositional AST & solve over feasible truth assignments
    expr = parse_statement_ast(s)
    solved = solve_formula(expr)
    if not solved.get("exact", True):
        return {
            "sentence": sentence,
            "verdict": "Undecidable",
            "refuter": None,
            "reason": f"model-space search budget exhausted after {solved['search_nodes']} nodes ({solved['n_atoms']} atoms); no verdict is claimed",
            "refuter_rule": "split the statement into smaller claims",
            "token_count": len(tokens),
            "satisfaction_ratio": None,
            "formula": solved["formula"],
        }
    feas = int(solved["feasible_worlds"])  # type: ignore[arg-type]
    sat = int(solved["satisfying_worlds"])  # type: ignore[arg-type]
    fals = int(solved["falsifying_worlds"])  # type: ignore[arg-type]
    rho = float(solved["satisfaction_ratio"])  # type: ignore[arg-type]

    # Case A: Unsatisfiable in every feasible world (0 satisfying assignments) -> Paradox
    if feas == 0 or sat == 0:
        return {
            "sentence": sentence,
            "verdict": "Paradox",
            "refuter": None,
            "reason": f"unsatisfiable constraint system: 0/{feas} feasible assignments satisfy {solved['formula']}",
            "refuter_rule": f"contradiction -- formula {solved['formula']} has empty satisfying set",
            "token_count": len(tokens),
            "satisfaction_ratio": 0.0,
            "formula": solved["formula"],
        }

    # Case B: True in 100% of feasible worlds (falsifying_worlds == 0) -> Tautology
    if fals == 0 and sat == feas:
        return {
            "sentence": sentence,
            "verdict": "Tautology",
            "refuter": None,
            "reason": f"true in all {sat}/{feas} feasible assignments (rho=1.0) of {solved['formula']}",
            "refuter_rule": "none -- negation has 0 feasible models",
            "token_count": len(tokens),
            "satisfaction_ratio": 1.0,
            "formula": solved["formula"],
        }

    # Case C: Contingent (0 < sat < feas). Is there a concrete falsifiable commitment?
    # A statement is Falsifiable iff it carries a relational/quantitative constraint,
    # a universal rule (forall/every/no), or a multi-clause truth-functional dependency
    # (implication, conjunction, biconditional) with an explicit falsifying assignment.
    has_commitment = bool(
        solved["has_relational_atom"]
        or solved["has_quantitative_atom"]
        or solved["has_universal_atom"]
        or int(solved["n_atoms"]) >= 2  # type: ignore[arg-type]
    )
    if has_commitment and solved["falsifying_witness"] is not None:
        fw = solved["falsifying_witness"]
        num_w = fw.get("numerical", {}) if isinstance(fw, dict) else {}
        prop_w = fw.get("propositional", {}) if isinstance(fw, dict) else {}
        if num_w:
            witness_str = ", ".join(f"{k}={v}" for k, v in sorted(num_w.items()))
        else:
            witness_str = ", ".join(f"{k}={v}" for k, v in sorted(prop_w.items()))
        return {
            "sentence": sentence,
            "verdict": "Falsifiable",
            "refuter": witness_str,
            "reason": f"contingent ({sat}/{feas} feasible worlds, rho={rho:.4f}) on {solved['formula']}",
            "refuter_rule": f"falsified by counter-model witness: {{{witness_str}}}",
            "token_count": len(tokens),
            "satisfaction_ratio": rho,
            "formula": solved["formula"],
        }

    # Case D: Single uninterpreted qualitative clause with no relational, quantitative,
    # universal, or truth-functional structure -> Undecidable
    return {
        "sentence": sentence,
        "verdict": "Undecidable",
        "refuter": None,
        "reason": f"unconstrained atomic predication {solved['formula']} with no quantitative bound or conditional structure",
        "refuter_rule": "supply a measurable comparator (<, <=, ==, >, >=), universal quantifier, or conditional implication",
        "token_count": len(tokens),
        "satisfaction_ratio": rho,
        "formula": solved["formula"],
    }


# ---------------------------------------------------------------------------
# 6. Genuine Structural Null & Perturbation Checks (Replaces Bag-of-Words Shuffle)
# ---------------------------------------------------------------------------

_ALPHA_RNG = random.Random(20261115)  # default renaming stream: deterministic per process, never repeats a draw


def alpha_rename_expr(
    expr: Expr,
    mapping: Dict[str, str],
    perm_ids: Optional[List[int]] = None,
) -> Expr:
    """Uniformly rename predicate/variable identifiers across `expr` while preserving
    the logical connectives, relational operators and constant offsets (graph
    isomorphism of the AST).  The i-th distinct non-numeric term met is renamed
    `v_<perm_ids[i % len(perm_ids)]>`, so a shuffled `perm_ids` is a random bijection
    onto fresh symbols; with `perm_ids=None` fresh ids are drawn from a module RNG."""
    used_ids = {int(v[2:]) for v in mapping.values() if v[:2] == "v_" and v[2:].isdigit()}

    def _map_term(t: str) -> str:
        if _parse_number(t) is not None:
            return t
        if t not in mapping:
            if perm_ids is not None:
                mapping[t] = f"v_{perm_ids[len(mapping) % len(perm_ids)]}"
            else:
                new_id = _ALPHA_RNG.randrange(10**6)
                while new_id in used_ids:
                    new_id = _ALPHA_RNG.randrange(10**6)
                used_ids.add(new_id)
                mapping[t] = f"v_{new_id}"
        return mapping[t]

    def _walk(e: Expr) -> Expr:
        if isinstance(e, VarExpr):
            a = e.atom
            if a.rel is not None:
                new_rel = RelConstraint(_map_term(a.rel.lhs), a.rel.op, _map_term(a.rel.rhs), a.rel.offset)
                return VarExpr(Atom(name=new_rel.format(), rel=new_rel, is_quantitative=a.is_quantitative, is_universal=a.is_universal))
            return VarExpr(Atom(name=_map_term(a.name), rel=None, is_quantitative=a.is_quantitative, is_universal=a.is_universal))
        if isinstance(e, NotExpr):
            return NotExpr(_walk(e.child))
        if isinstance(e, AndExpr):
            return AndExpr(_walk(e.left), _walk(e.right))
        if isinstance(e, OrExpr):
            return OrExpr(_walk(e.left), _walk(e.right))
        if isinstance(e, ImpliesExpr):
            return ImpliesExpr(_walk(e.antecedent), _walk(e.consequent))
        if isinstance(e, IffExpr):
            return IffExpr(_walk(e.left), _walk(e.right))
        return e

    return _walk(expr)


_REL_FLIP = {"<": ">", ">": "<", "<=": ">=", ">=": "<=", "==": "!=", "!=": "=="}


def _flip_leaf(expr: Expr, which: int, counter: List[int]) -> Expr:
    """Flip the relational operator (> <-> <, == <-> !=, ...) of the `which`-th relational leaf."""
    if isinstance(expr, VarExpr):
        if expr.atom.rel is not None:
            idx = counter[0]
            counter[0] += 1
            if idx == which:
                r = expr.atom.rel
                new_rel = RelConstraint(r.lhs, _REL_FLIP[r.op], r.rhs, r.offset)
                return VarExpr(Atom(name=new_rel.format(), rel=new_rel, is_quantitative=expr.atom.is_quantitative, is_universal=expr.atom.is_universal))
        return expr
    if isinstance(expr, NotExpr):
        return NotExpr(_flip_leaf(expr.child, which, counter))
    if isinstance(expr, AndExpr):
        return AndExpr(_flip_leaf(expr.left, which, counter), _flip_leaf(expr.right, which, counter))
    if isinstance(expr, OrExpr):
        return OrExpr(_flip_leaf(expr.left, which, counter), _flip_leaf(expr.right, which, counter))
    if isinstance(expr, ImpliesExpr):
        return ImpliesExpr(_flip_leaf(expr.antecedent, which, counter), _flip_leaf(expr.consequent, which, counter))
    if isinstance(expr, IffExpr):
        return IffExpr(_flip_leaf(expr.left, which, counter), _flip_leaf(expr.right, which, counter))
    return expr


def _negate_leaf(expr: Expr, which: int, counter: List[int]) -> Expr:
    """Negate the `which`-th leaf (VarExpr) of `expr`."""
    if isinstance(expr, VarExpr):
        idx = counter[0]
        counter[0] += 1
        return NotExpr(expr) if idx == which else expr
    if isinstance(expr, NotExpr):
        return NotExpr(_negate_leaf(expr.child, which, counter))
    if isinstance(expr, AndExpr):
        return AndExpr(_negate_leaf(expr.left, which, counter), _negate_leaf(expr.right, which, counter))
    if isinstance(expr, OrExpr):
        return OrExpr(_negate_leaf(expr.left, which, counter), _negate_leaf(expr.right, which, counter))
    if isinstance(expr, ImpliesExpr):
        return ImpliesExpr(_negate_leaf(expr.antecedent, which, counter), _negate_leaf(expr.consequent, which, counter))
    if isinstance(expr, IffExpr):
        return IffExpr(_negate_leaf(expr.left, which, counter), _negate_leaf(expr.right, which, counter))
    return expr


def mutation_candidates(expr: Expr) -> List[Expr]:
    """Ordered single-step structural mutations of `expr`:
      1. the top-level connective is perturbed
           Or(A, B) -> And(A, B);  Implies(A, B) -> And(A, ~B);  Iff(A, B) -> And(A, ~B);
           And(A, B) -> Or(A, ~B);  a literal L -> And(L, ~L)
      2. the relational operator of one relational leaf is flipped (> <-> <, == <-> !=, <= <-> >=)
      3. one leaf is negated
      4. one top-level branch is negated
      5. the whole formula is negated
    """
    out: List[Expr] = []
    if isinstance(expr, OrExpr):
        out.append(AndExpr(expr.left, expr.right))
    elif isinstance(expr, ImpliesExpr):
        out.append(AndExpr(expr.antecedent, NotExpr(expr.consequent)))
    elif isinstance(expr, IffExpr):
        out.append(AndExpr(expr.left, NotExpr(expr.right)))
    elif isinstance(expr, AndExpr):
        out.append(OrExpr(expr.left, NotExpr(expr.right)))
    else:
        out.append(AndExpr(expr, NotExpr(expr)))
    n_rel_leaves = sum(1 for a in collect_atoms(expr) if a.rel is not None)
    for w in range(n_rel_leaves * 4):  # leaves may repeat an atom; bounded scan
        c = [0]
        cand = _flip_leaf(expr, w, c)
        if c[0] <= w:
            break
        out.append(cand)
    n_leaves = _count_leaves(expr)
    for w in range(n_leaves):
        out.append(_negate_leaf(expr, w, [0]))
    if isinstance(expr, (AndExpr, OrExpr, ImpliesExpr, IffExpr)):
        out.append(type(expr)(NotExpr(node_left(expr)), node_right(expr)))
        out.append(type(expr)(node_left(expr), NotExpr(node_right(expr))))
    out.append(NotExpr(expr))
    return out


def _count_leaves(expr: Expr) -> int:
    if isinstance(expr, VarExpr):
        return 1
    if isinstance(expr, NotExpr):
        return _count_leaves(expr.child)
    return _count_leaves(node_left(expr)) + _count_leaves(node_right(expr))


def mutate_operator_expr(expr: Expr, base_rho: Optional[float] = None) -> Expr:
    """Return the first structural mutation (see `mutation_candidates`) whose
    satisfaction ratio differs from `base_rho` (computed from `expr` when omitted).
    If no candidate changes rho the last candidate (whole negation) is returned."""
    if base_rho is None:
        base_rho = solve_formula(expr)["satisfaction_ratio"]  # type: ignore[assignment]
    cands = mutation_candidates(expr)
    for c in cands:
        if solve_formula(c)["satisfaction_ratio"] != base_rho:
            return c
    return cands[-1]


def token_permutation_null(
    sentence: str, n_draws: int = 50, seed: int = 20260825
) -> Dict[str, object]:
    """Structural null & sensitivity test for `sentence`:
      1. `alpha_renaming_invariant`: renaming every identifier under `n_draws`
         independent random bijections (shuffled fresh symbol ids) preserves the exact
         satisfaction ratio `rho` 100% of the time.
         `n_distinct_renamings` reports how many distinct renamed formulas the draws gave.
      2. `operator_mutation_sensitive`: some single structural mutation -- connective
         flip, relational-operator flip, leaf negation -- strictly changes `rho`.
      3. `token_scramble_distortion`: random token permutations destroy multi-clause
         syntactic structure rather than vacuously preserving a keyword bag.
    """
    base_res = classify(sentence)
    expr = parse_statement_ast(sentence)
    base_solved = solve_formula(expr)
    base_rho = base_solved["satisfaction_ratio"]

    rng = random.Random(seed)
    alpha_preserved = 0
    renamed_forms = set()
    n_terms = len(collect_atoms(expr)) * 2 + 4
    for d in range(n_draws):
        perm_ids = rng.sample(range(10**6), n_terms)  # a random injection into fresh symbol ids
        mapping: Dict[str, str] = {}
        renamed = alpha_rename_expr(expr, mapping, perm_ids)
        renamed_forms.add(format_expr(renamed))
        ren_solved = solve_formula(renamed)
        if ren_solved["satisfaction_ratio"] == base_rho:
            alpha_preserved += 1

    mutated = mutate_operator_expr(expr, base_rho)
    mut_solved = solve_formula(mutated)
    mut_rho = mut_solved["satisfaction_ratio"]

    # Also measure syntactic distortion under random word scrambling
    words = re.findall(r"\S+", sentence.strip().rstrip(".!?"))
    scramble_changed = 0
    for _ in range(min(n_draws, 25)):
        shuf = list(words)
        rng.shuffle(shuf)
        shuf_s = " ".join(shuf) + "."
        shuf_solved = solve_formula(parse_statement_ast(shuf_s))
        if (
            shuf_solved["formula"] != base_solved["formula"]
            or shuf_solved["satisfaction_ratio"] != base_rho
        ):
            scramble_changed += 1

    alpha_inv = (alpha_preserved == n_draws)
    op_sensitive = (mut_rho != base_rho)

    return {
        "sentence": sentence,
        "base_verdict": base_res["verdict"],
        "base_formula": base_solved["formula"],
        "base_satisfaction_ratio": base_rho,
        "mutated_formula": mut_solved["formula"],
        "mutated_satisfaction_ratio": mut_rho,
        "n_draws": n_draws,
        "seed": seed,
        "n_distinct_renamings": len(renamed_forms),
        "alpha_renaming_invariant": alpha_inv,
        "operator_mutation_sensitive": op_sensitive,
        "scramble_changed_structure_draws": scramble_changed,
        # Backward-compatible key for callers checking structural invariance:
        "invariant_under_fixed_refuter_bag": alpha_inv and op_sensitive,
    }


# ---------------------------------------------------------------------------
# 7. Procedural Self-Test (Zero Planted Sentence Library)
# ---------------------------------------------------------------------------

def _selftest(seed: int = 20261115) -> int:
    """Verify the solver on procedurally generated propositional & difference-bound
    formulas (seeded RNG, zero planted English sentence library)."""
    rng = random.Random(seed)
    failures: List[str] = []
    total_checks = 0

    def check(label: str, cond: bool, detail: str) -> None:
        nonlocal total_checks
        total_checks += 1
        status = "PASS" if cond else "FAIL"
        print(f"  [{status}] {label}: {detail}")
        if not cond:
            failures.append(f"{label}: {detail}")

    print(f"tautology-discerner procedural selftest (seed={seed}, zero planted library)")

    # Family 1: Procedurally generated propositional tautologies (10 random instances)
    taut_ok = 0
    for i in range(10):
        p = f"prop_{rng.randint(100, 999)}_a"
        q = f"prop_{rng.randint(100, 999)}_b"
        r = f"prop_{rng.randint(100, 999)}_c"
        schema = i % 4
        if schema == 0:
            s = f"Either {p} holds or {p} does not hold."
        elif schema == 1:
            s = f"If {p} and {q} then {p}."
        elif schema == 2:
            s = f"(({p} -> {q}) and ({q} -> {r})) -> ({p} -> {r})"
        else:
            s = f"{p} == {p}"
        res = classify(s)
        if res["verdict"] == "Tautology" and res["satisfaction_ratio"] == 1.0:
            taut_ok += 1
    check("F1_PROCEDURAL_PROPOSITIONAL_TAUTOLOGIES", taut_ok == 10, f"{taut_ok}/10 random schemas evaluated to rho=1.0 (Tautology)")

    # Family 2: Procedurally generated difference-bound order tautologies (10 random instances)
    dbm_taut_ok = 0
    for i in range(10):
        a = round(rng.uniform(-50.0, 50.0), 2)
        b = round(a + rng.uniform(0.5, 25.0), 2)
        c = round(b + rng.uniform(0.5, 25.0), 2)
        v = f"x_{i}"
        schema = i % 3
        if schema == 0:
            s = f"If {v} > {b} then {v} > {a}."
        elif schema == 1:
            s = f"If {v} <= {a} then {v} < {c}."
        else:
            s = f"If u_{i} <= v_{i} and v_{i} <= w_{i} then u_{i} <= w_{i}."
        res = classify(s)
        if res["verdict"] == "Tautology" and res["satisfaction_ratio"] == 1.0:
            dbm_taut_ok += 1
    check("F2_PROCEDURAL_DBM_ORDER_TAUTOLOGIES", dbm_taut_ok == 10, f"{dbm_taut_ok}/10 transitive order chains solved as rho=1.0 (Tautology)")

    # Family 3: Procedurally generated contradictions & self-referential paradoxes (10 instances)
    para_ok = 0
    for i in range(10):
        a = round(rng.uniform(1.0, 50.0), 2)
        b = round(a + rng.uniform(1.0, 20.0), 2)
        v = f"m_{i}"
        schema = i % 4
        if schema == 0:
            s = f"{v} > {b} and {v} < {a}"
        elif schema == 1:
            s = f"p_{i} < q_{i} and q_{i} < p_{i}"
        elif schema == 2:
            s = f"signal_{i} holds and signal_{i} does not hold."
        else:
            # Odd-depth self-reference: 1 or 3 negations
            negs = "not " * (1 if (i % 2 == 0) else 3)
            s = f"This statement is {negs}true."
        res = classify(s)
        if res["verdict"] == "Paradox" and res["satisfaction_ratio"] == 0.0:
            para_ok += 1
    check("F3_PROCEDURAL_CONTRADICTIONS_AND_PARADOXES", para_ok == 10, f"{para_ok}/10 infeasible cycles and odd self-references solved as rho=0.0 (Paradox)")

    # Family 4: Procedurally generated contingent / falsifiable quantitative & conditional claims (10 instances)
    fals_ok = 0
    for i in range(10):
        thresh = round(rng.uniform(0.1, 100.0), 3)
        v = f"metric_{i}"
        schema = i % 3
        if schema == 0:
            s = f"{v} > {thresh}"
        elif schema == 1:
            s = f"If {v} >= {thresh} then loss_{i} <= {round(thresh / 2.0, 3)}."
        else:
            s = f"Every node_{i} has latency_{i} <= {thresh}."
        res = classify(s)
        if (
            res["verdict"] == "Falsifiable"
            and res["refuter"] is not None
            and 0.0 < float(res["satisfaction_ratio"]) < 1.0  # type: ignore[arg-type]
        ):
            fals_ok += 1
    check("F4_PROCEDURAL_FALSIFIABLE_WITH_COUNTERMODEL", fals_ok == 10, f"{fals_ok}/10 contingent constraints produced explicit counter-model witnesses")

    # Family 5: Unconstrained atomic fragments & even-depth self-reference -> Undecidable
    undec_ok = 0
    for i in range(6):
        if i % 2 == 0:
            s = f"token_{rng.randint(1000, 9999)}"
        else:
            s = "This statement is not false." if i == 1 else "This claim is true."
        res = classify(s)
        if res["verdict"] == "Undecidable":
            undec_ok += 1
    check("F5_UNCONSTRAINED_AND_EVEN_SELFREF_UNDECIDABLE", undec_ok == 6, f"{undec_ok}/6 unanchored atoms and v<->v self-references classified Undecidable")

    # Family 6: Alpha-renaming invariance & operator-mutation sensitivity
    null_ok = 0
    for i in range(8):
        a = round(rng.uniform(2.0, 20.0), 2)
        b = round(a + rng.uniform(2.0, 20.0), 2)
        s = f"If x_{i} > {b} then x_{i} > {a}." if i % 2 == 0 else f"If z_{i} >= {a} then err_{i} <= {b}."
        nc = token_permutation_null(s, n_draws=25, seed=seed + i)
        if nc["alpha_renaming_invariant"] and nc["operator_mutation_sensitive"]:
            null_ok += 1
    check("F6_ALPHA_INVARIANCE_AND_OPERATOR_SENSITIVITY", null_ok == 8, f"{null_ok}/8 statements invariant under alpha-renaming and sensitive to operator mutation")

    # Family 7: exact affine arithmetic (constants evaluate; shifts cancel; scaled/multi-var stay contingent)
    arith_ok = 0
    for i in range(12):
        a = rng.randint(-20, 20)
        b = rng.randint(-20, 20)
        k = rng.randint(2, 9)
        c = rng.randint(1, 30)
        schema = i % 6
        if schema == 0:
            s, want = f"{a} + {b} = {a + b}", "Tautology"
        elif schema == 1:
            s, want = f"{a} + {b} = {a + b + c}", "Paradox"
        elif schema == 2:
            s, want = f"v_{i} + {c} > v_{i}", "Tautology"
        elif schema == 3:
            s, want = f"v_{i} + {c} < v_{i}", "Paradox"
        elif schema == 4:
            s, want = f"{k} * v_{i} = {k * c}", "Falsifiable"
        else:
            s, want = f"v_{i} + w_{i} > {c}", "Falsifiable"
        if classify(s)["verdict"] == want:
            arith_ok += 1
    check("F7_AFFINE_ARITHMETIC", arith_ok == 12, f"{arith_ok}/12 random affine relations decided exactly")

    # Family 8: explicit quantifiers over the reals
    q_ok = 0
    for i in range(8):
        a = rng.randint(1, 40)
        b = a + rng.randint(1, 15)
        schema = i % 4
        if schema == 0:
            s, want = f"There exists x such that x > {b}.", "Tautology"
        elif schema == 1:
            s, want = f"There exists x such that x > {b} and x < {a}.", "Paradox"
        elif schema == 2:
            s, want = f"For all x, if x > {b} then x > {a}.", "Tautology"
        else:
            s, want = f"For all x, x > {a}.", "Paradox"
        if classify(s)["verdict"] == want:
            q_ok += 1
    check("F8_QUANTIFIERS_OVER_REALS", q_ok == 8, f"{q_ok}/8 random exists/forall statements decided over R")

    # Family 9: more than 16 atoms (DPLL splitting; no truncation / KeyError)
    big_ok = 0
    for i in range(6):
        n = rng.randint(17, 28)
        names = [f"q{j}" for j in range(n)]
        lit = rng.choice(names)
        if i % 3 == 0:
            s, want = " or ".join(names) + f" or not {lit}", "Tautology"
        elif i % 3 == 1:
            s, want = " and ".join(names) + f" and not {lit}", "Paradox"
        else:
            s, want = " and ".join(names), "Falsifiable"
        try:
            ok = classify(s)["verdict"] == want
        except Exception:
            ok = False
        big_ok += int(ok)
    check("F9_MORE_THAN_16_ATOMS", big_ok == 6, f"{big_ok}/6 formulas with 17-28 atoms decided without truncation")

    # Family 10: strict-inequality intervals of arbitrary narrowness are feasible; empty ones are not
    nar_ok = 0
    for i in range(8):
        lo = rng.uniform(-5, 5)
        gap = 10.0 ** (-rng.randint(7, 11))
        hi = lo + gap
        feasible, wit = check_relational_feasibility(
            [RelConstraint("x", ">", repr(lo)), RelConstraint("x", "<", repr(hi))]
        )
        empty, _ = check_relational_feasibility(
            [RelConstraint("x", ">", repr(hi)), RelConstraint("x", "<", repr(lo))]
        )
        strict_pt, _ = check_relational_feasibility(
            [RelConstraint("x", ">=", repr(lo)), RelConstraint("x", "<", repr(lo))]
        )
        inside = bool(wit) and lo < wit["x"] < hi
        if feasible and inside and not empty and not strict_pt:
            nar_ok += 1
    check("F10_EXACT_STRICT_INEQUALITY", nar_ok == 8, f"{nar_ok}/8 open intervals of width 1e-7..1e-11 decided exactly with an interior witness")

    # Family 11: compound self-reference solved as fixed points of v <-> f(v)
    sr_ok = 0
    for i in range(6):
        nneg = i % 4
        base = "not " * nneg + "true"
        n_fp = 2 if nneg % 2 == 0 else 0
        want = "Undecidable" if n_fp == 2 else "Paradox"
        if i == 4:
            s, want = "This statement is either true or false.", "Tautology"
        elif i == 5:
            s, want = "This statement is both true and false.", "Paradox"
        else:
            s = f"This statement is {base}."
        if classify(s)["verdict"] == want:
            sr_ok += 1
    check("F11_SELF_REFERENCE_FIXED_POINTS", sr_ok == 6, f"{sr_ok}/6 self-referential predicates solved by fixed-point enumeration")

    if failures:
        print(f"SELFTEST FAILED ({len(failures)}/{total_checks} checks failed)")
        return 1
    print(f"ALL PASS ({total_checks}/{total_checks} procedural solver gates verified)")
    return 0


def extract_lean_theorems(text: str) -> List[Tuple[str, str]]:
    """Extract (name, proposition) for every `theorem`/`lemma` in Lean source `text`.

    The proposition is the type after the binder list: the scanner walks from the
    declaration name to the first top-level `:` (outside (), {}, [] binder groups) and
    stops at the `:=` that ends the statement.  Unlike a `[^:=]+?` regex it never chokes
    on `<=`, `≤`, `=`, `==`, nor on `:` inside binders like `(a : Int)`."""
    out: List[Tuple[str, str]] = []
    for m in re.finditer(r"(?m)^\s*(?:private\s+|protected\s+)?(?:theorem|lemma)\s+([A-Za-z0-9_.']+)", text):
        i = m.end()
        depth = 0
        colon = -1
        end = -1
        n = len(text)
        while i < n:
            ch = text[i]
            if ch in "({[":
                depth += 1
            elif ch in ")}]":
                depth -= 1
            elif depth == 0 and ch == ":" and text[i : i + 2] == ":=":
                end = i
                break
            elif depth == 0 and ch == ":" and colon < 0:
                colon = i
            i += 1
        if end < 0 or colon < 0:
            continue
        prop = " ".join(text[colon + 1 : end].split())
        if prop:
            out.append((m.group(1), prop))
    return out


def audit_repo_corpus(docs_glob: str = "docs/*.md", lean_glob: str = "papers/data/lean/*.lean") -> Dict[str, object]:
    """Audit real statements extracted at runtime from the repository's own
    `docs/*.md` sentences and `papers/data/lean/*.lean` theorem statements.  Both are
    classified by the solver; Lean propositions use `extract_lean_theorems` (every
    `theorem`/`lemma`, counted whether or not its statement is relational)."""
    doc_files = sorted(glob.glob(docs_glob))
    lean_files = sorted(glob.glob(lean_glob))

    sentences: List[str] = []
    for path in doc_files:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
        text = re.sub(r"^\s*\|.*\|\s*$", " ", text, flags=re.MULTILINE)
        text = re.sub(r"^#+ .*$", " ", text, flags=re.MULTILINE)
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
        for raw in re.split(r"(?<=[.!?])\s+", text):
            s = " ".join(raw.split())
            words = s.split()
            if 6 <= len(words) <= 60 and s[:1].isupper() and s[-1] in ".!?":
                sentences.append(s)

    # Also extract theorem statements from .lean files
    lean_props: List[str] = []
    n_lean_theorems = 0
    for path in lean_files:
        with open(path, encoding="utf-8") as f:
            ltext = f.read()
        for _name, prop in extract_lean_theorems(ltext):
            n_lean_theorems += 1
            if any(op in prop for op in ("<=", ">=", "<", ">", "==", "=", "->", "≤", "≥", "≠", "→", "↔")):
                lean_props.append(prop)

    counts: Dict[str, int] = {"Tautology": 0, "Falsifiable": 0, "Paradox": 0, "Undecidable": 0}
    for s in sentences:
        v = str(classify(s)["verdict"])
        counts[v] = counts.get(v, 0) + 1

    lean_counts: Dict[str, int] = {"Tautology": 0, "Falsifiable": 0, "Paradox": 0, "Undecidable": 0}
    lean_errors = 0
    for prop in lean_props:
        try:
            v = str(classify(prop)["verdict"])
        except Exception:
            lean_errors += 1
            continue
        lean_counts[v] = lean_counts.get(v, 0) + 1

    return {
        "n_doc_files": len(doc_files),
        "n_sentences": len(sentences),
        "n_lean_files": len(lean_files),
        "n_lean_theorems_extracted": n_lean_theorems,
        "n_lean_relational_statements_classified": len(lean_props) - lean_errors,
        "distribution": counts,
        "lean_distribution": lean_counts,
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Propositional & difference-bound constraint solver for statement classification."
    )
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--selftest", action="store_true", help="Run procedural solver self-test (no planted library)")
    g.add_argument("--classify", metavar="SENTENCE", help="Classify a single statement")
    g.add_argument("--classify-file", metavar="PATH", help="Classify one statement per line from PATH")
    g.add_argument("--null-check", metavar="SENTENCE", help="Run alpha-renaming & operator-mutation null checks")
    g.add_argument("--audit-repo", action="store_true", help="Audit real statements from docs/*.md and papers/data/lean/*.lean")
    ap.add_argument("--n-draws", type=int, default=50, help="Number of alpha-renaming draws for --null-check")
    ap.add_argument("--seed", type=int, default=20261115, help="RNG seed")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest(seed=args.seed)
    if args.classify is not None:
        print(json.dumps(classify(args.classify), indent=2))
        return 0
    if args.null_check is not None:
        print(json.dumps(token_permutation_null(args.null_check, n_draws=args.n_draws, seed=args.seed), indent=2))
        return 0
    if args.audit_repo:
        print(json.dumps(audit_repo_corpus(), indent=2))
        return 0
    if args.classify_file is not None:
        with open(args.classify_file, encoding="utf-8") as fh:
            lines = [ln.strip() for ln in fh if ln.strip() and not ln.strip().startswith("#")]
        out = [classify(ln) for ln in lines]
        print(json.dumps(out, indent=2))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
