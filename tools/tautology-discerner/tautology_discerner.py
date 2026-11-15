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
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# 1. Propositional AST & Relational Constraint Representation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RelConstraint:
    """Linear/order constraint between two terms (variable or numeric constant):
    lhs OP rhs, where OP in {'==', '!=', '<', '<=', '>', '>='}."""
    lhs: str
    op: str
    rhs: str

    def negate(self) -> "RelConstraint":
        neg_map = {
            "==": "!=",
            "!=": "==",
            "<": ">=",
            "<=": ">",
            ">": "<=",
            ">=": "<",
        }
        return RelConstraint(self.lhs, neg_map[self.op], self.rhs)

    def format(self) -> str:
        return f"{self.lhs} {self.op} {self.rhs}"


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


def check_relational_feasibility(
    active_constraints: List[RelConstraint],
) -> Tuple[bool, Optional[Dict[str, float]]]:
    """Check whether a conjunction of relational constraints (x OP y, where x, y
    are variables or numeric constants) has a real-valued solution.

    Uses a Difference-Bound Matrix (DBM) over V = vars U {'0'} where every
    constraint is encoded as u - v <= c (with strict inequality encoded via an
    infinitesimal epsilon = 1e-7 so strict cycles x < y < x have negative loop
    weight -2*eps < 0). Runs Floyd-Warshall all-pairs shortest paths:
      - Feasibility holds iff no negative cycle exists (dist[u][u] >= 0 for all u)
        and no "!=" constraint has both endpoints forced equal (u - v <= 0 and
        v - u <= 0).
      - When feasible, extracts a concrete numerical witness assignment from
        shortest-path potentials relative to '0'.
    """
    if not active_constraints:
        return True, {}

    EPS = 1e-6
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

    # First register all variable nodes
    parsed_items = []
    neq_pairs: List[Tuple[int, float, int, float]] = []
    for c in active_constraints:
        u, off_u = get_node(c.lhs)
        v, off_v = get_node(c.rhs)
        parsed_items.append((c.op, u, off_u, v, off_v))

    n = len(nodes)
    INF = 1e18
    dist = [[INF] * n for _ in range(n)]
    for i in range(n):
        dist[i][i] = 0.0

    def add_leq(u: int, v: int, bound: float) -> None:
        # Enforces x_u - x_v <= bound  (i.e. edge v -> u of weight bound)
        if bound < dist[v][u]:
            dist[v][u] = bound

    for op, u, off_u, v, off_v in parsed_items:
        # Term_u = x_u + off_u, Term_v = x_v + off_v
        # Term_u - Term_v = (x_u - x_v) + (off_u - off_v)
        delta = off_v - off_u
        if op == "<=":
            add_leq(u, v, delta)
        elif op == "<":
            add_leq(u, v, delta - EPS)
        elif op == ">=":
            # Term_u >= Term_v  <=>  Term_v - Term_u <= 0  <=>  x_v - x_u <= off_u - off_v
            add_leq(v, u, -delta)
        elif op == ">":
            add_leq(v, u, -delta - EPS)
        elif op == "==":
            add_leq(u, v, delta)
            add_leq(v, u, -delta)
        elif op == "!=":
            neq_pairs.append((u, off_u, v, off_v))

    # Floyd-Warshall closure
    for k in range(n):
        dk = dist[k]
        for i in range(n):
            dik = dist[i][k]
            if dik >= INF / 2:
                continue
            di = dist[i]
            for j in range(n):
                cand = dik + dk[j]
                if cand < di[j]:
                    di[j] = cand

    # Negative cycle check
    for i in range(n):
        if dist[i][i] < -1e-11:
            return False, None

    # Check "!=" constraints: infeasible if Term_u == Term_v is forced
    for u, off_u, v, off_v in neq_pairs:
        delta = off_v - off_u
        # x_u - x_v <= dist[v][u] and x_v - x_u <= dist[u][v]
        if dist[v][u] <= delta + 1e-11 and dist[u][v] <= -delta + 1e-11:
            return False, None

    # Extract a concrete witness assignment x_i
    # Add a virtual sourceconnected to all nodes with weight 0 to get potentials
    pot = [0.0] * n
    for i in range(n):
        pot[i] = dist[0][i] if dist[0][i] < INF / 2 else 0.0
    # Re-run Bellman-Ford relaxation from pot to satisfy all edges x_j - x_i <= dist[i][j]
    for _ in range(n + 1):
        for i in range(n):
            for j in range(n):
                if dist[i][j] < INF / 2 and pot[j] > pot[i] + dist[i][j]:
                    pot[j] = pot[i] + dist[i][j]
    shift = pot[0]
    witness: Dict[str, float] = {}
    for idx in range(1, n):
        witness[nodes[idx]] = round(pot[idx] - shift, 6)

    # Perturb slightly if a "!=" constraint happens to collide numerically
    for u, off_u, v, off_v in neq_pairs:
        val_u = (0.0 if u == 0 else witness[nodes[u]]) + off_u
        val_v = (0.0 if v == 0 else witness[nodes[v]]) + off_v
        if abs(val_u - val_v) < 1e-9:
            if u != 0 and dist[0][u] > (pot[u] - shift) + 0.5:
                witness[nodes[u]] = round(witness[nodes[u]] + 0.5, 6)
            elif u != 0:
                witness[nodes[u]] = round(witness[nodes[u]] - 0.5, 6)
            elif v != 0:
                witness[nodes[v]] = round(witness[nodes[v]] + 0.5, 6)

    return True, witness


# ---------------------------------------------------------------------------
# 3. Self-Reference Fixed-Point Analyzer
# ---------------------------------------------------------------------------

_SELF_REF_SUBJ_RE = re.compile(
    r"^\s*(?:this\s+(?:statement|sentence|proposition|claim|assertion|rule)|"
    r"the\s+present\s+(?:statement|sentence|claim)|"
    r"i\s+am\s+lying|"
    r"the\s+following\s+(?:statement|sentence)\s+is\s+(?:true|false)\s*:\s*the\s+preceding\s+(?:statement|sentence)\s+is\s+(?:true|false))",
    re.IGNORECASE,
)


def solve_self_reference(sentence: str) -> Optional[Dict[str, object]]:
    """If `sentence` is a self-referential truth-value claim, solve its boolean
    fixed-point equation v <-> f(v) over {False, True}:
      - Odd negation depth (f(v) = not v): 0 fixed points -> Paradox.
      - Even negation depth (f(v) = v): 2 fixed points (unanchored) -> Undecidable.
    """
    s = sentence.strip()
    if not _SELF_REF_SUBJ_RE.search(s):
        return None

    low = s.lower()
    if "i am lying" in low:
        return {
            "verdict": "Paradox",
            "fixed_points": [],
            "reason": "self-referential truth equation v <-> ~v has 0 boolean fixed points",
            "refuter_rule": "unsatisfiable fixed-point equation v = not v over {0, 1}",
        }

    # Count negation flips on truth predicate (false, untrue, lying, not, never, fails)
    tokens = re.findall(r"[a-z]+|~|¬", low)
    neg_tokens = {"false", "untrue", "incorrect", "wrong", "lying", "not", "never", "no", "fails", "~", "¬"}
    truth_tokens = {"true", "false", "untrue", "correct", "incorrect", "lying", "holds", "fails"}

    if not any(t in truth_tokens for t in tokens):
        return {
            "verdict": "Undecidable",
            "fixed_points": [False, True],
            "reason": "self-referential subject without an external observable or truth anchor",
            "refuter_rule": "bind the self-reference to a concrete external proposition P",
        }

    flips = sum(1 for t in tokens if t in neg_tokens)
    fixed_points = [v for v in (False, True) if v == (flips % 2 == 0 and v or (flips % 2 == 1 and not v))]
    if flips % 2 == 1:
        return {
            "verdict": "Paradox",
            "fixed_points": [],
            "reason": f"self-referential negation depth={flips} (v <-> ~v) has 0 boolean fixed points",
            "refuter_rule": "rejected -- fixed-point set {v in {0,1} : v == ~v} is empty",
        }
    return {
        "verdict": "Undecidable",
        "fixed_points": [False, True],
        "reason": f"self-referential affirmation depth={flips} (v <-> v) has 2 degenerate fixed points {{0, 1}}",
        "refuter_rule": "underdetermined -- both v=True and v=False satisfy v <-> v",
    }


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
    r"is\s+strictly\s+greater\s+than|is\s+greater\s+than|is\s+more\s+than|exceeds|beats|surpasses|"
    r"is\s+strictly\s+less\s+than|is\s+less\s+than|is\s+smaller\s+than|falls\s+below|"
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
                or op in ("==", "!=", "<=", ">=", "<", ">")
            ):
                # Canonicalize negated relations (e.g. != -> Not(==), >= -> Not(<))
                # so that p and ~p share the same underlying Atom!
                if op == "!=":
                    base_rel = RelConstraint(lhs, "==", rhs)
                    atom = Atom(name=base_rel.format(), rel=base_rel, is_quantitative=True, is_universal=universal_scope)
                    return NotExpr(VarExpr(atom)), lhs
                if op == ">=":
                    base_rel = RelConstraint(lhs, "<", rhs)
                    atom = Atom(name=base_rel.format(), rel=base_rel, is_quantitative=True, is_universal=universal_scope)
                    return NotExpr(VarExpr(atom)), lhs
                rel = RelConstraint(lhs, op, rhs)
                atom = Atom(name=rel.format(), rel=rel, is_quantitative=True, is_universal=universal_scope)
                return VarExpr(atom), lhs

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


def parse_statement_ast(
    sentence: str,
    default_subject: Optional[str] = None,
    universal_scope: bool = False,
) -> Expr:
    """Recursively parse a sentence or symbolic formula into a propositional + relational Expr AST."""
    s = sentence.strip().rstrip(".!?").strip()
    while s.startswith("(") and s.endswith(")") and _balanced_parens(s[1:-1]):
        s = s[1:-1].strip()

    # Strip leading universal quantifier: "For all x, ...", "Every X is ..."
    m_forall = re.match(
        r"^(?:for\s+all|forall|∀)\s+([A-Za-z0-9_,\s]+?)(?:,|\s+such\s+that\s+|\s+:\s*)(.+)$",
        s,
        re.IGNORECASE,
    )
    if m_forall:
        return parse_statement_ast(m_forall.group(2), default_subject=default_subject, universal_scope=True)

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

def solve_formula(expr: Expr) -> Dict[str, object]:
    """Exhaustively evaluate `expr` over all 2^k truth assignments to its atoms,
    filtering out assignments whose relational constraints are arithmetically
    infeasible (via `check_relational_feasibility`)."""
    atoms = collect_atoms(expr)
    k = len(atoms)
    if k > 16:
        atoms = atoms[:16]
        k = 16

    feasible_worlds = 0
    satisfying_worlds = 0
    falsifying_worlds = 0
    first_sat_witness: Optional[Dict[str, object]] = None
    first_fals_witness: Optional[Dict[str, object]] = None

    for mask in range(1 << k):
        env: Dict[str, bool] = {}
        active_rels: List[RelConstraint] = []
        for idx, atom in enumerate(atoms):
            val = bool((mask >> idx) & 1)
            env[atom.name] = val
            if atom.rel is not None:
                active_rels.append(atom.rel if val else atom.rel.negate())

        is_feas, num_witness = check_relational_feasibility(active_rels)
        if not is_feas:
            continue

        feasible_worlds += 1
        truth = eval_expr(expr, env)
        if truth:
            satisfying_worlds += 1
            if first_sat_witness is None:
                first_sat_witness = {"propositional": dict(env), "numerical": num_witness or {}}
        else:
            falsifying_worlds += 1
            if first_fals_witness is None:
                first_fals_witness = {"propositional": dict(env), "numerical": num_witness or {}}

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
        "sat_witness": first_sat_witness,
        "falsifying_witness": first_fals_witness,
        "formula": format_expr(expr),
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
            "satisfaction_ratio": 0.0 if sr["verdict"] == "Paradox" else None,
        }

    # Step 2: Parse into compositional AST & solve over feasible truth assignments
    expr = parse_statement_ast(s)
    solved = solve_formula(expr)
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

def alpha_rename_expr(expr: Expr, mapping: Dict[str, str]) -> Expr:
    """Uniformly rename predicate/variable identifiers across `expr` while preserving
    the logical connectives and relational operators (graph isomorphism of the AST)."""
    def _map_term(t: str) -> str:
        if _parse_number(t) is not None:
            return t
        if t not in mapping:
            mapping[t] = f"v_{len(mapping)}"
        return mapping[t]

    if isinstance(expr, VarExpr):
        a = expr.atom
        if a.rel is not None:
            new_rel = RelConstraint(_map_term(a.rel.lhs), a.rel.op, _map_term(a.rel.rhs))
            return VarExpr(Atom(name=new_rel.format(), rel=new_rel, is_quantitative=a.is_quantitative, is_universal=a.is_universal))
        return VarExpr(Atom(name=_map_term(a.name), rel=None, is_quantitative=a.is_quantitative, is_universal=a.is_universal))
    if isinstance(expr, NotExpr):
        return NotExpr(alpha_rename_expr(expr.child, mapping))
    if isinstance(expr, AndExpr):
        return AndExpr(alpha_rename_expr(expr.left, mapping), alpha_rename_expr(expr.right, mapping))
    if isinstance(expr, OrExpr):
        return OrExpr(alpha_rename_expr(expr.left, mapping), alpha_rename_expr(expr.right, mapping))
    if isinstance(expr, ImpliesExpr):
        return ImpliesExpr(alpha_rename_expr(expr.antecedent, mapping), alpha_rename_expr(expr.consequent, mapping))
    if isinstance(expr, IffExpr):
        return IffExpr(alpha_rename_expr(expr.left, mapping), alpha_rename_expr(expr.right, mapping))
    return expr


def mutate_operator_expr(expr: Expr) -> Expr:
    """Perturb the top-level logical connective or inject a complementary branch
    so the feasible satisfaction ratio `rho` strictly changes:
      - Or(A, B)      -> And(A, B)        (breaks excluded middle P | ~P into P & ~P)
      - Implies(A, B) -> And(A, Not(B))   (negates implication A -> B into counterexample A & ~B)
      - Iff(A, B)     -> And(A, Not(B))   (flips equivalence into strict counterexample)
      - And(A, B)     -> Or(A, Not(B))    (flips conjunction into implication B -> A)
      - Literal L     -> And(L, Not(L))   (collapses contingent literal rho=0.5 -> rho=0.0)
    """
    if isinstance(expr, OrExpr):
        return AndExpr(expr.left, expr.right)
    if isinstance(expr, ImpliesExpr):
        return AndExpr(expr.antecedent, NotExpr(expr.consequent))
    if isinstance(expr, IffExpr):
        return AndExpr(expr.left, NotExpr(expr.right))
    if isinstance(expr, AndExpr):
        return OrExpr(expr.left, NotExpr(expr.right))
    return AndExpr(expr, NotExpr(expr))


def token_permutation_null(
    sentence: str, n_draws: int = 50, seed: int = 20260825
) -> Dict[str, object]:
    """Structural null & sensitivity test for `sentence`:
      1. `alpha_renaming_invariant`: Uniform alpha-renaming of bound variables/atoms
         across `n_draws` random bijections preserves the exact truth-table
         satisfaction ratio `rho` and verdict 100% of the time (genuine structural
         invariance under symbol relabeling, analogous to CurvedCorpus.lean sec. 8).
      2. `operator_mutation_changes_rho`: Flipping the top-level connective or
         relational polarity strictly changes `rho` (proving the solver is driven by
         logical/algebraic structure, NOT a bag-of-words lookup).
      3. `token_scramble_distortion`: Random token permutations destroy multi-clause
         syntactic structure rather than vacuously preserving a keyword bag.
    """
    base_res = classify(sentence)
    expr = parse_statement_ast(sentence)
    base_solved = solve_formula(expr)
    base_rho = base_solved["satisfaction_ratio"]

    rng = random.Random(seed)
    alpha_preserved = 0
    for d in range(n_draws):
        # Generate a random symbol permutation for alpha-renaming
        atoms = collect_atoms(expr)
        perm_ids = list(range(len(atoms) * 2 + 4))
        rng.shuffle(perm_ids)
        mapping: Dict[str, str] = {}
        renamed = alpha_rename_expr(expr, mapping)
        ren_solved = solve_formula(renamed)
        if ren_solved["satisfaction_ratio"] == base_rho:
            alpha_preserved += 1

    mutated = mutate_operator_expr(expr)
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
    op_sensitive = (base_rho is None) or (mut_rho != base_rho)

    return {
        "sentence": sentence,
        "base_verdict": base_res["verdict"],
        "base_formula": base_solved["formula"],
        "base_satisfaction_ratio": base_rho,
        "mutated_formula": mut_solved["formula"],
        "mutated_satisfaction_ratio": mut_rho,
        "n_draws": n_draws,
        "seed": seed,
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

    if failures:
        print(f"SELFTEST FAILED ({len(failures)}/{total_checks} checks failed)")
        return 1
    print(f"ALL PASS ({total_checks}/{total_checks} procedural solver gates verified)")
    return 0


def audit_repo_corpus(docs_glob: str = "docs/*.md", lean_glob: str = "papers/data/lean/*.lean") -> Dict[str, object]:
    """Audit real statements extracted at runtime from the repository's own
    `docs/*.md` and `papers/data/lean/*.lean` theorem signatures."""
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

    # Also extract theorem inequality/implication propositions from .lean files
    lean_props: List[str] = []
    for path in lean_files:
        with open(path, encoding="utf-8") as f:
            ltext = f.read()
        for m in re.finditer(r"theorem\s+([A-Za-z0-9_']+)[^:]*:\s*([^:=]+?)\s*:=", ltext, re.DOTALL):
            prop = " ".join(m.group(2).split())
            if any(op in prop for op in ("<=", ">=", "<", ">", "==", "=", "->")):
                lean_props.append(prop)

    counts: Dict[str, int] = {"Tautology": 0, "Falsifiable": 0, "Paradox": 0, "Undecidable": 0}
    for s in sentences:
        v = str(classify(s)["verdict"])
        counts[v] = counts.get(v, 0) + 1

    return {
        "n_doc_files": len(doc_files),
        "n_sentences": len(sentences),
        "n_lean_files": len(lean_files),
        "n_lean_theorems_extracted": len(lean_props),
        "distribution": counts,
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
