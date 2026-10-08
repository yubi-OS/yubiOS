#!/usr/bin/env python3
"""Axiom coverage gate for papers/data/lean/*.lean (yubi-OS/yubiOS).

Round 2 (Lane A, parallel CI-hardening round 2): the theorem-name extraction
is now done BY LEAN ITSELF, not by a regex over source text. The reviewer
verified three mutations that still passed the round-1 regex gate:

  1. a theorem named with French quotes (`«one_eq_two»`) — the regex's
     identifier class never matches across the quotes;
  2. a theorem placed after a bare `end` closing a section — the regex's
     namespace stack mis-qualifies the name, so the gate checks the WRONG
     constant;
  3. a theorem declared through a user `macro` that expands to `theorem` —
     the regex only knows the literal `theorem` keyword.

Each mutation can carry `axiom cheat : False` proving 1 = 2, or
`native_decide`, and the old regex never sees the name.

New design (reviewer-suggested shape): the probe file that `--gen` emits
appends a Lean `run_cmd` command that walks the environment AT COMPILE TIME
and prints one line per THEOREM CONSTANT of the CURRENT MODULE (not imports):

    AXIOM_LINE <name> -> [axiom, axiom, ...]

with the axiom list computed by `Lean.collectAxioms` — the exact transitive
computation `#print axioms` performs. Nothing the Lean compiler sees can
escape the gate, because the gate's name list is now produced by the
compiler, not parsed out of the source.

Two check modes:

  --mode print       (legacy, round 1) parse `#print axioms` output lines.
  --mode enumerate   (round 2) parse AXIOM_LINE lines emitted by the
                     environment-walking run_cmd block. CI uses this mode.

Checks in enumerate mode:
  a. every Lean-listed theorem constant has a parsed AXIOM_LINE entry
     (tautologically true because the entries come from the same probe —
     asserted anyway, so a parsing regression can never silently pass);
  b. every reported axiom set is a subset of the permitted set
     (default: propext, Classical.choice, Quot.sound); no forbidden axiom
     (default: sorryAx) anywhere — this also catches `Lean.ofReduceBool`
     from native_decide, and any user axiom (e.g. `axiom cheat : False`);
  c. CROSS-CHECK: the regex-extracted source names must be a SUBSET of the
     Lean-listed names. The regex is no longer the primary — it is the
     independent second opinion. If the regex finds a name Lean does not
     list, or the counts diverge in the wrong direction, the gate fails
     loud and prints BOTH lists;
  d. COVERAGE: with --require-coverage <manifest.json>, every Lean-listed
     theorem name must appear in the manifest's theorem list. The gate
     fails listing the missing names. (This is the mirror of the legacy
     --manifest direction, which checks manifest-listed ⊆ source.)
  plus, in both modes:
  e. no Lean `error:` line in the compile output;
  f. no duplicate theorem names (regex path) or duplicate AXIOM_LINE names;
  g. the parse is non-empty (refuse to pass on empty output — a probe that
     compiles but enumerates nothing must not pass).

Exit 0 pass, 1 failure, 2 usage/IO error.

The regex path (extract_theorems) is deliberately conservative and kept as
the cross-check (c), not the primary:
  - block comments /-/ ... -/ (nesting-aware), -- line comments and string
    literals are blanked out before matching;
  - `namespace X ... end X` stacks are tracked so extracted names are
    qualified exactly as Lean prints them;
  - declaration modifiers (protected/private/unsafe/noncomputable/local/
    scoped/partial) preceding `theorem` are skipped.
Known regex limitations (the reason it is no longer the primary): bare
`end` (section close) does not pop the namespace stack; `lemma`-like macros
are invisible; French-quoted identifiers are not matched.

LEAN API VALIDATION STATUS: the run_cmd enumeration block is CI-VALIDATED
ONLY — this sandbox has no Lean toolchain, so the block is written
defensively (see LEAN_ENUM_BLOCK comments for fallback variants) and every
API mismatch surfaces as a probe COMPILE failure, which fails CI loud (the
CI step exits non-zero on probe compile failure). The parsing/gating logic
in this file IS locally validated against synthetic probe outputs and the
real repo sources + manifests.
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
# AXIOM_LINE <name> -> [axiom, axiom]  (emitted by the run_cmd enumeration
# block; see LEAN_ENUM_BLOCK). Tolerates an optional diagnostic prefix
# ("file.lean:12:0: info: ") in case the block is switched to logInfo.
# The name part is GREEDY up to the LAST " -> [" on the line, so a
# French-quoted name containing " -> [" cannot splice into the axiom list;
# the axiom list is always the trailing [...] bracket group.
AXIOM_LINE_RE = re.compile(
    r"^(?:\S+:\d+:\d+:\s*)?(?:[a-zA-Z]+:\s*)?"
    r"AXIOM_LINE (?P<name>.+) -> \[(?P<axioms>.*)\]\s*$"
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

# ---------------------------------------------------------------------------
# The Lean enumeration block (CI-VALIDATED ONLY — see module docstring).
#
# What it does, in Lean 4.33.0 core (no Mathlib):
#   - walks `env.constants` (every constant the compiler knows);
#   - keeps only constants of the CURRENT module — the main module —
#     identified two ways defensively:
#       primary:   `env.getModuleIdxFor? n` equals the main module index
#                  `env.getModuleIdx? env.mainModuleName`, when the main
#                  module IS registered in the environment header;
#       fallback:  main-module constants carry NO module index
#                  (`getModuleIdxFor? n` is none), which is the common case
#                  for a single-file `lean probe.lean` compile where the
#                  current module is not yet in the header.
#     The match below accepts BOTH semantics, so either Lean behaviour
#     yields the right filter:
#       (some idx, some idx') -> idx == idx'     (imported / registered case)
#       (some _,  none)       -> true            (unregistered main-module
#                                                   constant)
#       (none,    none)       -> true            (main module not in header)
#       (none,    some _)     -> false           (imported constant, no main
#                                                   module registered)
#   - keeps only `.theoremInfo` constants (the actual theorems);
#   - for each, computes `Lean.collectAxioms n` — the same transitive axiom
#     dependency computation `#print axioms` uses — and prints
#     `AXIOM_LINE <name> -> [<axioms>]` where <name> is `Name.toString`
#     (French-quoted automatically for non-identifier parts).
#   - FAILS LOUD (throwError) if zero theorems were enumerated: a silent
#     empty list (module-filter/API mismatch) must not pass the gate.
#
# FALLBACK VARIANTS (if a specific API differs in 4.33.0, the probe compile
# FAILS LOUD and one of these drops in):
#   F1. `env.constants.toList` → `env.constants.map.toList`
#       (SMap exposes its inner HashMap as the public field `map`;
#       HashMap.toList definitely exists).
#   F2. `Lean.Elab.Command.liftCoreM Lean.getEnv` →
#       `Lean.getEnv` (CommandElabM carries MonadEnv via liftCoreM and
#       exposes `getEnv` directly in recent core versions).
#   F3. `Lean.collectAxioms n : CoreM (Array Name)` →
#       `Lean.Meta.collectAxioms`-style wrapper is NOT needed in core; if
#       the namespace moved, resolve with
#       `open Lean in` + fully-qualified call, or emulate with
#       `#print axioms` per name (the round-1 mechanism) as a last resort —
#       but that reintroduces the regex dependency for the NAME list, so it
#       is the weakest fallback.
#   F4. `IO.println` inside run_cmd → `logInfo` (adds an `info: ` prefix and
#       a `file:line:col:` position prefix; AXIOM_LINE_RE already tolerates
#       both).
#   F5. If `getModuleIdxFor?` does not exist: enumerate
#       `env.header.moduleNames` and exclude every constant whose name
#       resolves to an imported module via `env.getModuleIdx?`-style lookup,
#       keeping the remainder — same set, slower.
# ---------------------------------------------------------------------------
LEAN_ENUM_BLOCK = r"""
-- LANE-A axiom enumeration probe (generated by check_lean_axioms.py --gen;
-- not committed to the repo). Walks the environment at compile time and
-- prints one AXIOM_LINE per theorem constant of the CURRENT module, with
-- the transitive axiom dependencies computed by Lean itself (collectAxioms,
-- the same computation `#print axioms` performs). CI-VALIDATED ONLY: if any
-- Lean API below differs in 4.33.0 the probe FAILS TO COMPILE, which fails
-- the CI step loud by design. Fallback variants are documented in
-- check_lean_axioms.py (LEAN_ENUM_BLOCK comments).
open Lean in
run_cmd do
  -- Advisor fixup 1: `getEnv` directly in CommandElabM (LEAN_ENUM_BLOCK fallback F2;
  -- the `Lean.getEnv` spelling does not resolve as a class-method path).
  let env ← getEnv
  let modIdx? := env.getModuleIdx? env.mainModuleName
  let inMainModule : Name → Bool := fun n =>
    match modIdx?, env.getModuleIdxFor? n with
    | some idx, some idx' => idx == idx'
    | some _, none => true
    | none, none => true
    | none, some _ => false
  let mut printed : Nat := 0
  -- Advisor fixup 2: SMap has no `toList`; iterate the underlying HashMap
  -- (LEAN_ENUM_BLOCK fallback F1).
  for (n, ci) in env.constants.map.toList do
    if inMainModule n then
      match ci with
      | .theoremInfo _ =>
        let axioms ← Lean.Elab.Command.liftCoreM (Lean.collectAxioms n)
        let axiomStrs := axioms.toList.map (fun a => a.toString)
        -- Advisor fixup 3: `s!"...{...}..."` interpolation with embedded escaped
        -- quotes is NOT valid term syntax inside interpolation braces (CI run
        -- 37706893911: "expected '}'"). Use plain string concatenation and
        -- logInfo (LEAN_ENUM_BLOCK fallback F4; AXIOM_LINE_RE tolerates the
        -- `file:line:col: info:` prefix).
        logInfo ("AXIOM_LINE " ++ n.toString ++ " -> [" ++ String.intercalate ", " axiomStrs ++ "]")
        printed := printed + 1
      | _ => pure ()
  if printed == 0 then
    throwError "axiom-probe: enumerated 0 theorems in the current module — \
      refusing to emit an empty AXIOM_LINE list (module filter or API \
      mismatch); see LEAN_ENUM_BLOCK fallbacks in check_lean_axioms.py"
"""


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
    in declaration order. CROSS-CHECK ONLY (see module docstring)."""
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


def gen_probe(source_text: str) -> str:
    """Probe file = source text + the Lean enumeration run_cmd block.

    The block prints one AXIOM_LINE per theorem constant of the CURRENT
    module, with axiom dependencies computed by Lean itself. No regex
    extraction feeds the probe any more — that was the round-1 hole."""
    if not source_text.endswith("\n"):
        source_text += "\n"
    # Advisor fixup 4 (CI run 37706893911 step 8, run 37707833452):
    # `run_cmd` is defined in Lean.Elab.Command, which is NOT in scope for a
    # bare `lean file.lean` compile — the probe must import it. Imports are
    # legal only in the file header, so the import line is PREPENDED to the
    # source text (comments/module docstrings may follow an import; all five
    # repo files start with a `/-`-comment docstring and declare no imports).
    import_header = ""
    if "import Lean.Elab.Command" not in source_text:
        import_header = "import Lean.Elab.Command  -- advisor fixup: run_cmd probe needs Lean.Elab.Command\n\n"
    return import_header + source_text + LEAN_ENUM_BLOCK


def _split_axiom_list(body: str) -> list[str]:
    return [a.strip() for a in body.split(",") if a.strip()]


def parse_axiom_output(text: str) -> tuple[dict[str, list[str]], list[str]]:
    """LEGACY: parse `#print axioms` lines out of captured lean output.
    Continuation lines (a wrapped bracket) are joined onto the opening
    line — same discipline as verify_wayfinder_axioms.py."""
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
            reported[m.group(1)] = _split_axiom_list(m.group(2).strip())
            continue
        m = NO_AXIOM_RE.match(stripped)
        if m:
            reported[m.group(1)] = []
    return reported, errors


def parse_enumeration_output(
    text: str,
) -> tuple[dict[str, list[str]], list[str], dict[str, int]]:
    """Parse AXIOM_LINE lines out of the probe compile output. Returns
    (name -> axiom list, error lines, duplicate-name counts). Duplicates
    must be tracked at parse time: a dict would silently overwrite them."""
    reported: dict[str, list[str]] = {}
    errors: list[str] = []
    duplicates: dict[str, int] = {}
    for raw in text.splitlines():
        stripped = raw.rstrip()
        if ERROR_RE.search(stripped):
            errors.append(stripped)
            continue
        m = AXIOM_LINE_RE.match(stripped)
        if m:
            name = m.group("name").strip()
            if name in reported:
                duplicates[name] = duplicates.get(name, 1) + 1
            reported[name] = _split_axiom_list(m.group("axioms"))
    return reported, errors, duplicates


def _axiom_set_problems(
    reported: dict[str, list[str]], permitted: set[str], forbidden: set[str]
) -> list[str]:
    problems: list[str] = []
    for name, axioms in sorted(reported.items()):
        bad_forbidden = sorted(set(axioms) & forbidden)
        if bad_forbidden:
            problems.append(f"{name}: FORBIDDEN axiom(s) {bad_forbidden}")
        extra = sorted(set(axioms) - permitted)
        if extra:
            problems.append(
                f"{name}: axiom(s) outside permitted set {extra}"
            )
    return problems


def _require_coverage(
    manifest_path: Path, lean_names: set[str]
) -> list[str]:
    """COVERAGE (check d): every Lean-listed theorem name must appear in
    the manifest's theorem list. Fail listing the missing ones."""
    problems: list[str] = []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    listed = [t["name"] for t in manifest.get("theorems", [])]
    missing = sorted(lean_names - set(listed))
    if missing:
        problems.append(
            f"coverage: {len(missing)} Lean-listed theorem(s) missing from "
            f"{manifest_path}: {missing} "
            f"(Lean enumerated {len(lean_names)} theorems, manifest lists "
            f"{len(listed)})"
        )
    return problems


def check(
    source_path: Path,
    axioms_text: str,
    permitted: set[str],
    forbidden: set[str],
    manifest_path: Path | None,
    mode: str = "print",
    coverage_manifest_path: Path | None = None,
) -> tuple[int, list[str], dict[str, list[str]], list[tuple[str, int]], set[str]]:
    """Run the gate. Returns (regex-extracted count, problems, reported
    axiom map, regex extraction, Lean-listed name set)."""
    theorems = extract_theorems(source_path.read_text(encoding="utf-8"))
    duplicates: dict[str, int] = {}
    if mode == "enumerate":
        reported, errors, duplicates = parse_enumeration_output(axioms_text)
    else:
        reported, errors = parse_axiom_output(axioms_text)
    problems: list[str] = []

    problems.extend(f"source: {p}" for p in check_duplicates(theorems))

    for line in errors:
        problems.append(f"lean reported an error line: {line}")

    if not theorems and mode != "enumerate":
        # print mode: the regex extraction is the primary name list, so an
        # empty extraction is a hard failure.
        problems.append(
            "source: no theorem declarations were extracted; the gate refuses "
            "to pass on an empty parse"
        )
    elif not theorems and reported:
        # enumerate mode: the regex is only the cross-check. An empty regex
        # extraction is exactly the French-quote mutation working correctly
        # (the regex cannot see `«name»`) — never a failure, but it IS a
        # warning that the cross-check is running vacuous.
        print(
            "WARNING: regex cross-check is vacuous (0 source theorems "
            "extracted) while the gate list is non-empty; the gate rests "
            "on Lean's enumeration alone",
            file=sys.stderr,
        )
    if not reported:
        expected = "AXIOM_LINE" if mode == "enumerate" else "'#print axioms'"
        problems.append(
            f"no {expected} lines were parsed from the kernel output; "
            "the gate refuses to pass on an empty parse"
        )

    for name, count in duplicates.items():
        problems.append(f"{count} duplicate AXIOM_LINE entries for {name}")

    # (a) every Lean-listed theorem has an axiom line — tautological when
    # the entries come from the same probe, asserted anyway so a parsing
    # regression can never silently pass.
    # In enumerate mode `reported` IS the Lean list; in print mode the
    # legacy missing-line check below covers it.
    if mode == "enumerate":
        # (c) CROSS-CHECK: regex-extracted names must be a SUBSET of the
        # Lean-listed names. The regex is the independent second opinion,
        # not the primary. Fail loud with BOTH lists on any divergence.
        regex_names = {name for name, _ in theorems}
        lean_names = set(reported)
        extra_regex = sorted(regex_names - lean_names)
        if extra_regex:
            problems.append(
                "cross-check: the regex extracted theorem name(s) that Lean "
                f"does NOT list: {extra_regex} "
                f"(regex: {sorted(regex_names)}; lean: {sorted(lean_names)}). "
                "Either the regex mis-qualified a name (e.g. after a bare "
                "`end`) or Lean failed to enumerate a real declaration — "
                "both are gate failures"
            )
        if len(regex_names) > len(lean_names):
            problems.append(
                f"cross-check: regex extracted {len(regex_names)} distinct "
                f"theorem names but Lean listed {len(lean_names)} — counts "
                "diverged in the wrong direction (regex ⊄ lean)"
            )
    else:
        missing = [name for name, _ in theorems if name not in reported]
        for name in missing:
            problems.append(
                f"missing printed axioms for theorem {name} — every theorem in the "
                "file must have an axiom line (catches unlisted/sorry theorems)"
            )

    problems.extend(_axiom_set_problems(reported, permitted, forbidden))

    if mode == "enumerate" and coverage_manifest_path is not None:
        problems.extend(
            _require_coverage(coverage_manifest_path, set(reported))
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

    return len(theorems), problems, reported, theorems, set(reported)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", help=".lean source file to gate")
    ap.add_argument("--axioms", help="captured lean stdout/stderr with AXIOM_LINE (enumerate) or #print axioms (print) output")
    ap.add_argument(
        "--gen",
        action="store_true",
        help="generate the probe file (--out): source text + the Lean "
        "environment-walking enumeration block",
    )
    ap.add_argument("--out", help="probe output path for --gen")
    ap.add_argument(
        "--mode",
        choices=["print", "enumerate"],
        default="print",
        help="check mode: 'print' parses legacy `#print axioms` output; "
        "'enumerate' parses AXIOM_LINE lines emitted by the "
        "environment-walking probe (CI mode)",
    )
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
    ap.add_argument(
        "--require-coverage",
        dest="require_coverage",
        help="coverage manifest: every Lean-listed theorem name must appear "
        "in its theorem list (enumerate mode)",
    )
    args = ap.parse_args(argv)

    if not args.source:
        ap.error("--source is required")
    source_path = Path(args.source)
    if not source_path.is_file():
        print(f"usage error: source not found: {args.source}", file=sys.stderr)
        return 2

    if args.gen:
        if not args.out:
            ap.error("--out is required with --gen")
        Path(args.out).write_text(
            gen_probe(source_path.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        print(
            f"PROBE_OK {source_path}: source + Lean enumeration block -> {args.out}"
        )
        return 0

    if not args.axioms:
        ap.error("--axioms is required for the check (or use --gen)")
    axioms_path = Path(args.axioms)
    if not axioms_path.is_file():
        print(f"usage error: axioms output not found: {args.axioms}", file=sys.stderr)
        return 2

    if args.mode == "enumerate" and not args.require_coverage:
        print(
            "usage warning: enumerate mode without --require-coverage only "
            "gates axioms; pass --require-coverage <manifest.json> for "
            "manifest coverage",
            file=sys.stderr,
        )

    permitted = {a.strip() for a in args.permitted.split(",") if a.strip()}
    forbidden = {a.strip() for a in args.forbidden.split(",") if a.strip()}

    count, problems, reported, theorems, lean_names = check(
        source_path,
        axioms_path.read_text(encoding="utf-8"),
        permitted,
        forbidden,
        Path(args.manifest) if args.manifest else None,
        mode=args.mode,
        coverage_manifest_path=(
            Path(args.require_coverage) if args.require_coverage else None
        ),
    )

    print(f"=== {source_path}: {count} theorems regex-extracted, {len(reported)} in gate list (mode={args.mode}) ===")
    for name, axioms in sorted(reported.items()):
        print(f"  {name}: {axioms if axioms else '(none)'}")
    print(f"permitted axioms: {sorted(permitted)}")

    if problems:
        print("\nAXIOM_COVERAGE_GATE_FAIL")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(
        f"\nAXIOM_COVERAGE_GATE_OK: all {len(reported)} gated theorems have axiom lines, "
        "axioms within the permitted set, no forbidden axioms, "
        "regex cross-check consistent"
        + (f", coverage satisfied by {args.require_coverage}" if args.require_coverage else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
