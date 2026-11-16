#!/usr/bin/env python3
"""Forbidden-token stopgap for papers/data/lean/*.lean (yubi-OS/yubiOS).

Round-2 CI-hardening, Lane C (reviewer's suggested quick fix). Complements
check_lean_axioms.py (kernel-side #print axioms gate) with a SOURCE-side gate:
fail CI if a lean source contains any forbidden token OUTSIDE comments and
string literals.

Round-3 expansion (Lane A, CI-hardening round 3, FIX 1): the round-2 token
list missed the environment-mutation class that an external reviewer showed
passes every kernel-side gate:

    import Lean                        -- brings metaprogramming into scope
    set_option debug.skipKernelTC true -- skips kernel type checking
    run_cmd (addDecl ...)              -- mutates the environment without a
                                          kernel type check (adds `1 = 2`)

`import`, `set_option`, `run_cmd`, `#eval` (term evaluation), `attribute`
(the attribute command), `notation` and `infix` (grammar/notation extension)
are therefore banned as well. Because the whole-word matcher is
identifier-boundary aware, four SUFFIX VARIANTS would silently bypass the
ban and are banned separately:

    macro_rules / elab_rules  (`macro`/`elab` are followed by `_`, an
                               identifier char, so `macro`/`elab` alone
                               do not match them)
    infixl / infixr           (`infix` followed by an identifier char)

NOTE: `@[instance_reducible, instance]` contains the token `instance`, NOT
`attribute` — that mutation shape is covered by the Lane B definitions-hash
gate, not this one. A bare `attribute [simp] foo` line IS caught here.

Tokens blocked (default): axiom, native_decide, macro, macro_rules, syntax,
elab, elab_rules, import, set_option, run_cmd, #eval, attribute, notation,
infix, infixl, infixr.

INVARIANT — what this gate scans: CI (lean-check.yml, "Forbidden-token gate"
step) invokes this script ONLY on the five source files
papers/data/lean/{CurvedCorpus,WayfinderBounds,RadiusBounds,RayleighBounds,
AzimuthBounds}.lean. It must NEVER be pointed at the GENERATED probe files
(`/tmp/<base>-probe.lean`, produced by `check_lean_axioms.py --gen`): the
probe's own enumeration machinery legitimately contains `import Lean` and a
`run_cmd` block and would trip this gate by construction. The probe's
machinery must never be token-scanned; the token list above and the
five-file list in the workflow are two halves of that contract. (Verified
2026-10-08 against the tarball of main @ 7d5ee590a55e: the gate step passes
no --tokens flag, so it uses DEFAULT_TOKENS below — no workflow change is
required for this expansion.)

Matching contract:
  1. Comments and string literals are stripped FIRST, using the exact same
     nesting-aware stripper as check_lean_axioms.py (imported from it, so the
     two gates can never disagree about what a comment is):
        /- ... -/ block comments (nested), -- line comments, "..." strings
     (with \\ escapes). Newlines are preserved so reported line numbers match
     the real file.
  2. Tokens are then matched WHOLE-WORD only, against the Lean identifier
     charset [A-Za-z0-9_'<greek>]: `axiomatic`, `elaborate`, `schematic`,
     `syntactic`, `macroscopic`, `important`, `imports`, `#evaluate` etc.
     do NOT match; `Foo.axiom` DOES match (a dot is an identifier separator,
     not an identifier char). `#` is not an identifier char, so `#eval`
     matches at a word start while `x#eval` does not (the lookbehind sees
     `x`). Boundary decisions (documented):
       - `#evaluate` PASSES: `u` continues the identifier, so the lookahead
         rejects the match. The gate is construct-level; a hypothetical
         future `#evaluate` command would need its own token.
       - `infixl`/`infixr`/`macro_rules`/`elab_rules` are banned as their
         own tokens (see above) precisely because the boundary rule would
         otherwise let them pass.
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

DEFAULT_TOKENS = [
    # Round-2 set (Lane C).
    "axiom",
    "native_decide",
    "macro",
    "macro_rules",  # suffix variant: `macro` + `_` is one identifier
    "syntax",
    "elab",
    "elab_rules",  # suffix variant: `elab` + `_` is one identifier
    # Round-3 additions (Lane A): the environment-mutation class.
    "import",  # brings metaprogramming / arbitrary libraries into scope
    "set_option",  # e.g. debug.skipKernelTC, debug.skipTC
    "run_cmd",  # arbitrary command-level metaprogramming, env mutation
    "#eval",  # term evaluation; `#` is not an identifier char
    "attribute",  # the `attribute [x] foo` command (`@[x]` is NOT this)
    "notation",  # grammar extension
    "infix",
    "infixl",  # suffix variant of infix
    "infixr",  # suffix variant of infix
]

# Lean identifier continuation charset: ASCII word chars, apostrophe, and the
# greek block. NOTE: '.' is deliberately NOT in this set — a qualified name
# `Foo.axiom` still contains the forbidden token `axiom`. NOTE: `#` is also
# deliberately NOT in this set — `#eval` matches at word start, and `#`
# terminates any identifier, so a `#`-prefixed token preceded by whitespace
# or start-of-line never gets a false lookbehind rejection.
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
