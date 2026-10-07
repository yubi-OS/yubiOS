#!/usr/bin/env python3
"""Axiom coverage gate for papers/data/lean/*.lean (yubi-OS/yubiOS).

Additive gate, Lane 2 (CI-hardening). It complements verify_wayfinder_axioms.py,
which only checks the theorems LISTED in a scope manifest. This gate checks
EVERY theorem declaration found in a .lean source file, so a NEW unlisted
theorem proved with `sorry` (or an axiom cheat, or `native_decide`) fails CI.

Two modes:

  --gen     Emit a probe Lean file = the source text followed by one
            `#print axioms <qualified-name>` line per extracted theorem.
            Compile the probe with the pinned toolchain and capture its
            output (stdout+stderr), then run the check mode on it.

  (check)   Compare the `#print axioms` output against the theorem set
            extracted from the source:
              1. every extracted theorem has an axiom line (no misses —
                 this is what catches unlisted sorry theorems);
              2. each reported axiom set is a subset of the permitted set
                 (default: propext, Classical.choice, Quot.sound);
              3. no forbidden axiom (default: sorryAx) anywhere;
              4. no Lean `error:` line in the output;
              5. the parse is non-empty (refuse to pass on empty output).

Exit 0 pass, 1 failure, 2 usage/IO error.

The source parser is deliberately conservative:
  - block comments /-/ ... -/ (nesting-aware), -- line comments and
    string literals are blanked out before matching, so the word
    `theorem` inside a comment or string is never extracted;
  - `namespace X ... end X` stacks are tracked so extracted names are
    qualified exactly as Lean prints them (e.g. Rayleigh.sq_nonneg);
  - declaration modifiers (protected/private/unsafe/noncomputable/
    local/scoped/partial) preceding `theorem` are skipped.
Known limitation: a bare `end` closing a namespace (Lean allows it for
sections; all five yubiOS files use named `end <Namespace>`) is not
treated as a namespace pop.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_PERMITTED = ["propext", "Classical.choice", "Quot.sound"]
DEFAULT_FORBIDDEN = ["sorryAx"]

# 'Foo.bar' depends on axioms: [propext, Classical.choice, Quot.sound]
# Tolerates an optional severity prefix ("info: ") which some Lean output
# modes add before the message body.
DEPENDS_RE = re.compile(
    r"^(?:[a-zA-Z]+:\s*)?'([^']+)' depends on axioms: \[(.*)\]\s*$"
)
# 'Foo.bar' does not depend on any axioms
NO_AXIOM_RE = re.compile(
    r"^(?:[a-zA-Z]+:\s*)?'([^']+)' does not depend on any axioms\s*$"
)
ERROR_RE = re.compile(r"(^|:)\s*error:", re.IGNORECASE)

IDENT = r"[A-Za-z_\u03b1-\u03c9][A-Za-z0-9_'\u03b1-\u03c9.!?\u03b1-\u03c9]*"
MODIFIERS = (
    r"(?:(?:protected|private|unsafe|noncomputable|local|scoped|partial)\s+)*"
)
TOKEN_RE = re.compile(
    r"(?P<ns>\bnamespace\s+(?P<nsname>" + IDENT + r"))"
    r"|\b(?P<end>end)(?:\s+(?P<endname>" + IDENT + r"))?"
    r"|(?<![\w'.!\u03b1-\u03c9])" + MODIFIERS + r"\btheorem\s+(?P<theorem>" + IDENT + r")"
)


def strip_comments_and_strings(text: str) -> str:
    """Blank out /-/ ... -/ block comments (nested), -- line comments and
    string literals, preserving newlines so match positions stay aligned
    with the original line numbers."""
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "-":  # block comment, nesting-aware
            depth = 1
            j = i + 2
            while j < n and depth:
                if text[j] == "/" and j + 1 < n and text[j + 1] == "-":
                    depth += 1
                    j += 2
                elif text[j] == "-" and j + 1 < n and text[j + 1] == "/":
                    depth -= 1
                    j += 2
                else:
                    if text[j] == "\n":
                        out.append("\n")
                    j += 1
            if depth:  # unterminated comment: blank to EOF
                i = n
            else:
                i = j
            continue
        if ch == "-" and nxt == "-":  # line comment
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == '"':  # string literal, honour \\ escapes
            i += 1
            while i < n and text[i] != '"':
                if text[i] == "\\" and i + 1 < n:
                    i += 2
                else:
                    if text[i] == "\n":
                        out.append("\n")
                    i += 1
            if i < n:
                i += 1  # closing quote
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def extract_theorems(text: str) -> list[tuple[str, int]]:
    """Return (qualified_name, source_line) for every theorem declaration,
    in declaration order."""
    stripped = strip_comments_and_strings(text)
    stack: list[str] = []
    found: list[tuple[str, int]] = []
    for m in TOKEN_RE.finditer(stripped):
        if m.group("ns"):
            stack.append(m.group("nsname"))
        elif m.group("end"):
            name = m.group("endname")
            if name and stack and stack[-1] == name:
                stack.pop()
            # bare `end` (section close) intentionally ignored; see module doc
        elif m.group("theorem"):
            qual = ".".join(stack + [m.group("theorem")]) if stack else m.group("theorem")
            line = stripped.count("\n", 0, m.start("theorem")) + 1
            found.append((qual, line))
    return found


def check_duplicates(theorems: list[tuple[str, int]]) -> list[str]:
    seen: dict[str, int] = {}
    problems: list[str] = []
    for name, line in theorems:
        if name in seen:
            problems.append(
                f"duplicate theorem name {name} at lines {seen[name]} and {line}"
            )
        seen[name] = line
    return problems


def gen_probe(source_text: str, theorems: list[tuple[str, int]]) -> str:
    """Probe file = source text + one #print axioms per theorem."""
    if not source_text.endswith("\n"):
        source_text += "\n"
    lines = [
        source_text,
        "",
        "-- LANE2 axiom coverage probe (generated by check_lean_axioms.py --gen;",
        "-- not committed to the repo). One #print axioms per extracted theorem.",
    ]
    for name, _ in theorems:
        lines.append(f"#print axioms {name}")
    return "\n".join(lines) + "\n"


def parse_axiom_output(text: str) -> tuple[dict[str, list[str]], list[str]]:
    """Parse #print axioms lines out of captured lean output. Continuation
    lines (a wrapped bracket) are joined onto the opening line — same
    discipline as verify_wayfinder_axioms.py."""
    reported: dict[str, list[str]] = {}
    errors: list[str] = []
    joined: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if joined and joined[-1].count("[") > joined[-1].count("]"):
            joined[-1] = joined[-1] + " " + line.strip()
        else:
            joined.append(line)
    for line in joined:
        stripped = line.strip()
        if ERROR_RE.search(stripped):
            errors.append(stripped)
            continue
        m = DEPENDS_RE.match(stripped)
        if m:
            body = m.group(2).strip()
            reported[m.group(1)] = (
                [a.strip() for a in body.split(",") if a.strip()] if body else []
            )
            continue
        m = NO_AXIOM_RE.match(stripped)
        if m:
            reported[m.group(1)] = []
    return reported, errors


def check(
    source_path: Path,
    axioms_text: str,
    permitted: set[str],
    forbidden: set[str],
    manifest_path: Path | None,
) -> tuple[int, list[str], dict[str, list[str]], list[tuple[str, int]]]:
    theorems = extract_theorems(source_path.read_text(encoding="utf-8"))
    reported, errors = parse_axiom_output(axioms_text)
    problems: list[str] = []

    problems.extend(f"source: {p}" for p in check_duplicates(theorems))

    for line in errors:
        problems.append(f"lean reported an error line: {line}")

    if not theorems:
        problems.append(
            "source: no theorem declarations were extracted; the gate refuses "
            "to pass on an empty parse"
        )
    if not reported:
        problems.append(
            "no '#print axioms' lines were parsed from the kernel output; "
            "the gate refuses to pass on an empty parse"
        )

    missing = [name for name, _ in theorems if name not in reported]
    for name in missing:
        problems.append(
            f"missing printed axioms for theorem {name} — every theorem in the "
            "file must have an axiom line (catches unlisted/sorry theorems)"
        )

    for name, axioms in sorted(reported.items()):
        bad_forbidden = sorted(set(axioms) & forbidden)
        if bad_forbidden:
            problems.append(f"{name}: FORBIDDEN axiom(s) {bad_forbidden}")
        extra = sorted(set(axioms) - permitted)
        if extra:
            problems.append(
                f"{name}: axiom(s) outside permitted set {extra}"
            )

    if manifest_path is not None:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        listed = [t["name"] for t in manifest.get("theorems", [])]
        extracted = {name for name, _ in theorems}
        for name in listed:
            if name not in extracted:
                problems.append(
                    f"manifest theorem {name} not found in source — "
                    "manifest/source drift"
                )

    return len(theorems), problems, reported, theorems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", help=".lean source file to gate")
    ap.add_argument("--axioms", help="captured lean stdout/stderr with #print axioms output")
    ap.add_argument(
        "--gen",
        action="store_true",
        help="generate the probe file (--out) with one #print axioms per theorem",
    )
    ap.add_argument("--out", help="probe output path for --gen")
    ap.add_argument(
        "--permitted",
        default=",".join(DEFAULT_PERMITTED),
        help="comma-separated permitted axioms",
    )
    ap.add_argument(
        "--forbidden",
        default=",".join(DEFAULT_FORBIDDEN),
        help="comma-separated forbidden axioms (always also caught by subset check)",
    )
    ap.add_argument(
        "--manifest",
        help="optional scope manifest; asserts its listed theorems all exist in source",
    )
    args = ap.parse_args(argv)

    if not args.source:
        ap.error("--source is required")
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"usage error: source not found: {args.source}", file=sys.stderr)
        return 2

    theorems = extract_theorems(source_path.read_text(encoding="utf-8"))

    if args.gen:
        if not args.out:
            ap.error("--out is required with --gen")
        Path(args.out).write_text(
            gen_probe(source_path.read_text(encoding="utf-8"), theorems),
            encoding="utf-8",
        )
        print(f"PROBE_OK {source_path}: {len(theorems)} #print axioms lines -> {args.out}")
        return 0

    if not args.axioms:
        ap.error("--axioms is required for the check (or use --gen)")
    axioms_path = Path(args.axioms)
    if not axioms_path.is_file():
        print(f"usage error: axioms output not found: {args.axioms}", file=sys.stderr)
        return 2

    permitted = {a.strip() for a in args.permitted.split(",") if a.strip()}
    forbidden = {a.strip() for a in args.forbidden.split(",") if a.strip()}

    count, problems, reported, _ = check(
        source_path,
        axioms_path.read_text(encoding="utf-8"),
        permitted,
        forbidden,
        Path(args.manifest) if args.manifest else None,
    )

    print(f"=== {source_path}: {count} theorems extracted ===")
    for name, axioms in sorted(reported.items()):
        print(f"  {name}: {axioms if axioms else '(none)'}")
    print(f"permitted axioms: {sorted(permitted)}")

    if problems:
        print("\nAXIOM_COVERAGE_GATE_FAIL")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(
        f"\nAXIOM_COVERAGE_GATE_OK: all {count} theorems printed axioms, "
        "axioms within the permitted set, no forbidden axioms"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
