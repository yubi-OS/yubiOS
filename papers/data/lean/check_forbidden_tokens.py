#!/usr/bin/env python3
"""Forbidden-token stopgap for papers/data/lean/*.lean (yubi-OS/yubiOS).

Round-2 CI-hardening, Lane C (reviewer's suggested quick fix). Complements
check_lean_axioms.py (kernel-side #print axioms gate) with a SOURCE-side gate:
fail CI if a lean source contains any forbidden token OUTSIDE comments and
string literals.

Tokens blocked (default): axiom, native_decide, macro, syntax, elab.
These are the Lean constructs that can introduce an untracked trust base:
`axiom` postulates, `native_decide` trusts the compiler, `macro`/`syntax`/
`elab` change the elaborator / grammar the kernel then consumes. The five
yubiOS files are plain `theorem`+tactic files and must stay that way until
these constructs are individually reviewed.

Matching contract:
  1. Comments and string literals are stripped FIRST, using the exact same
     nesting-aware stripper as check_lean_axioms.py (imported from it, so the
     two gates can never disagree about what a comment is):
        /- ... -/ block comments (nested), -- line comments, "..." strings
     (with \\ escapes). Newlines are preserved so reported line numbers match
     the real file.
  2. Tokens are then matched WHOLE-WORD only, against the Lean identifier
     charset [A-Za-z0-9_'<greek>]: `axiomatic`, `elaborate`, `schematic`,
     `syntactic`, `macroscopic` etc. do NOT match; `Foo.axiom` DOES match
     (a dot is an identifier separator, not an identifier char).
  3. Fail-closed: a missing or unreadable file is a usage error (exit 2), and
     the gate refuses to pass if a file yields no scanned content.

Exit 0 pass, 1 violation, 2 usage/IO error.

Usage:
  python3 check_forbidden_tokens.py FILE [FILE ...]
  python3 check_forbidden_tokens.py --tokens axiom,native_decide FILE...
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Same directory as this script: import the single source of truth for
# comment/string stripping. Fail-closed if it is missing.
_LEAN_DIR = Path(__file__).resolve().parent
if str(_LEAN_DIR) not in sys.path:
    sys.path.insert(0, str(_LEAN_DIR))
try:
    from check_lean_axioms import strip_comments_and_strings  # noqa: E402
except ImportError as exc:  # pragma: no cover
    print(
        f"usage error: cannot import strip_comments_and_strings from "
        f"check_lean_axioms.py next to this script ({exc})",
        file=sys.stderr,
    )
    sys.exit(2)

DEFAULT_TOKENS = ["axiom", "native_decide", "macro", "syntax", "elab"]

# Lean identifier continuation charset: ASCII word chars, apostrophe, and the
# greek block. NOTE: '.' is deliberately NOT in this set — a qualified name
# `Foo.axiom` still contains the forbidden token `axiom`.
IDENT_CONT = r"[A-Za-z0-9_'\u03b1-\u03c9]"


def compile_token_patterns(tokens: list[str]) -> list[tuple[str, re.Pattern]]:
    pats = []
    for t in tokens:
        pat = re.compile(r"(?<!%s)%s(?!%s)" % (IDENT_CONT, re.escape(t), IDENT_CONT))
        pats.append((t, pat))
    return pats


def scan_source(path: Path, tokens: list[str]) -> tuple[list[dict], int]:
    """Scan one file. Returns (violations, scanned_char_count). Fail-closed:
    unreadable -> OSError propagates (usage error); unparseable -> ValueError.
    """
    text = path.read_text(encoding="utf-8")
    stripped = strip_comments_and_strings(text)
    violations: list[dict] = []
    lines = stripped.split("\n")
    for token, pat in compile_token_patterns(tokens):
        for i, line in enumerate(lines):
            for m in pat.finditer(line):
                violations.append(
                    {
                        "file": str(path),
                        "line": i + 1,
                        "token": token,
                        "context": line.strip()[:120],
                    }
                )
    return violations, len(stripped)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("sources", nargs="+", help=".lean source file(s) to gate")
    ap.add_argument(
        "--tokens",
        default=",".join(DEFAULT_TOKENS),
        help="comma-separated forbidden tokens (default: "
        + ",".join(DEFAULT_TOKENS)
        + ")",
    )
    args = ap.parse_args(argv)

    tokens = [t.strip() for t in args.tokens.split(",") if t.strip()]
    if not tokens:
        ap.error("--tokens produced an empty token set")

    all_violations: list[dict] = []
    scanned = 0
    for raw in args.sources:
        path = Path(raw)
        if not path.is_file():
            print(f"usage error: source not found: {path}", file=sys.stderr)
            return 2
        try:
            violations, n = scan_source(path, tokens)
        except (UnicodeDecodeError, ValueError) as exc:
            print(f"usage error: cannot scan {path}: {exc}", file=sys.stderr)
            return 2
        scanned += n
        status = "OK " if not violations else "FAIL"
        print(f"{status} {path}: {len(violations)} forbidden-token hit(s)")
        for v in violations:
            print(
                f"    {v['file']}:{v['line']}: token '{v['token']}'"
                f" outside comments/strings: {v['context']}"
            )
        all_violations.extend(violations)

    if not all_violations:
        print(
            f"\nFORBIDDEN_TOKEN_GATE_OK: {len(args.sources)} file(s), "
            f"{scanned} stripped source chars scanned, tokens={tokens}"
        )
        return 0

    print(f"\nFORBIDDEN_TOKEN_GATE_FAIL: {len(all_violations)} violation(s)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
