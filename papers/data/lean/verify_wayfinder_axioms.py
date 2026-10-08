#!/usr/bin/env python3
"""Gate the Lean kernel's printed axioms for papers/data/lean/WayfinderBounds.lean.

This parses the ACTUAL `#print axioms` output produced by the pinned Lean
toolchain. It does not grep source comments and it does not accept a file that
merely lacks the string "sorry".

Pass criteria (all must hold):
  1. Every declaration listed in the manifest's `theorems` appears in the
     kernel output with an `#print axioms` line.
  2. Each reported axiom set is a subset of `permitted_axioms`.
  3. No forbidden axiom (notably `sorryAx`) appears anywhere in the output.
  4. The output contains no Lean `error:` line.
  5. STATEMENT PINS (Lane 3, CI hardening): for every manifest theorem carrying
     a `statement_sha256`, the normalized statement text extracted from the
     .lean source must hash to exactly that pin. This checks CONTENT, not just
     names: renaming nothing but weakening a statement to `True` now fails the
     gate. If no manifest theorem carries a pin, this check is skipped with a
     note (legacy manifest). Extraction/normalization logic lives in
     pin_statements.py, which is imported from this script's directory; if the
     module is missing while pins exist, the gate FAILS (fail-closed) rather
     than certifying statements it could not check.
   6. DEFINITION PINS (Lane B, CI hardening round 2): the manifest's
     `definitions` block pins a sha256 over EVERY top-level def/structure/
     inductive/abbrev/instance/class declaration in the .lean source (plus a
     per-definition `decls` map). This closes the hole statement pins leave:
     redefining a definition (e.g. `absSq := 0` in AzimuthBounds.lean)
     leaves every theorem STATEMENT text unchanged -- all statement pins
     match -- while the theorems collapse to trivialities. A definitions
     mismatch fails the gate until the manifest's definitions block is
     regenerated in the same PR. Fail-closed like the statement gate: a
     missing block, a missing lean source, a missing pin_statements module,
     or a vacuous zero-definition pin is a FAILURE, never a skip.

Exit 0 on pass, 1 on failure, 2 on bad usage.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sys

# 'Foo.bar' depends on axioms: [propext, Classical.choice, Quot.sound]
DEPENDS_RE = re.compile(r"^'([^']+)' depends on axioms: \[(.*)\]\s*$")
# 'Foo.bar' does not depend on any axioms
NO_AXIOM_RE = re.compile(r"^'([^']+)' does not depend on any axioms\s*$")
# Round-2 enumerate probe emission (check_lean_axioms.py --gen's run_cmd block):
# AXIOM_LINE <name> -> [axiom, axiom, ...]   (empty [] = no axioms)
# Accepted alongside the standard '#print axioms' output so the CurvedCorpus
# gate can reuse the axiom-coverage step's probe output. Mirrors AXIOM_LINE_RE
# in check_lean_axioms.py (greedy name up to the LAST ' -> [').
AXIOM_LINE_VERIFY_RE = re.compile(
    r"^(?:\S+:\d+:\d+:\s*)?(?:[a-zA-Z]+:\s*)?"
    r"AXIOM_LINE (?P<name>.+) -> \[(?P<axioms>.*)\]\s*$"
)
ERROR_RE = re.compile(r"(^|:)\s*error:", re.IGNORECASE)


def parse(text: str) -> tuple[dict[str, list[str]], list[str]]:
    reported: dict[str, list[str]] = {}
    errors: list[str] = []
    # `#print axioms` output can wrap; join continuation lines onto the line
    # that opened an unclosed bracket.
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
            name = m.group(1)
            body = m.group(2).strip()
            axioms = [a.strip() for a in body.split(",") if a.strip()] if body else []
            reported[name] = axioms
            continue
        m = NO_AXIOM_RE.match(stripped)
        if m:
            reported[m.group(1)] = []
            continue
        m = AXIOM_LINE_VERIFY_RE.match(stripped)
        if m:
            body = m.group("axioms").strip()
            axioms = [a.strip() for a in body.split(",") if a.strip()] if body else []
            reported[m.group("name").strip()] = axioms
    return reported, errors


def resolve_lean_file(manifest: dict, manifest_path: str,
                      lean_file_arg: str | None) -> str | None:
    """Locate the .lean source for statement checking (Lane 3)."""
    if lean_file_arg:
        return lean_file_arg
    rel = manifest.get("lean_file") or manifest.get("file")
    if not rel:
        return None
    manifest_dir = os.path.dirname(os.path.abspath(manifest_path))
    # repo root is three levels above papers/data/lean/<manifest>.json
    repo_root = os.path.abspath(os.path.join(manifest_dir, "..", "..", ".."))
    for base in (os.getcwd(), repo_root, manifest_dir):
        cand = os.path.join(base, rel)
        if os.path.isfile(cand):
            return cand
    return None


def check_statement_pins(manifest: dict, lean_path: str | None,
                         failures: list[str]) -> int:
    """Lane 3 statement-pin gate. Returns the number of pins verified.

    Fail-closed: pins present but the lean file or the extractor cannot be
    resolved is a FAILURE, not a skip.
    """
    pinned = [
        (t["name"], t["statement_sha256"])
        for t in manifest["theorems"]
        if t.get("statement_sha256")
    ]
    if not pinned:
        return 0
    if lean_path is None or not os.path.isfile(lean_path):
        failures.append(
            "statement pins present in the manifest but the lean source could "
            "not be located; pass --lean-file <path> (fail-closed)"
        )
        return 0
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        pin_statements = importlib.import_module("pin_statements")
    except ImportError as exc:
        failures.append(
            f"statement pins present in the manifest but pin_statements.py "
            f"(the shared extractor) could not be imported: {exc} (fail-closed)"
        )
        return 0
    with open(lean_path, "r", encoding="utf-8") as fh:
        lean_text = fh.read()
    try:
        theorems = pin_statements.extract_theorems(lean_text)
    except ValueError as exc:
        failures.append(f"statement extraction failed on {lean_path}: {exc}")
        return 0

    verified = 0
    for name, sha in pinned:
        short = name.split(".")[-1]
        if short not in theorems:
            failures.append(
                f"statement pin for {name}: declaration not found in {lean_path}"
            )
            continue
        actual = theorems[short]["sha256"]
        if actual != sha:
            failures.append(
                f"STATEMENT PIN MISMATCH for {name}:\n"
                f"    pinned sha256: {sha}\n"
                f"    actual sha256: {actual}\n"
                f"    actual statement: {theorems[short]['statement']}\n"
                f"    If this change is deliberate, regenerate the pin in the "
                f"same PR: python3 papers/data/lean/pin_statements.py pin "
                f"<manifest.json>"
            )
        else:
            verified += 1
    return verified


def check_definition_pins(manifest: dict, lean_path: str | None,
                          failures: list[str]) -> int:
    """Lane B definitions-pin gate. Returns the number of definitions verified.

    Fail-closed: the definitions block is REQUIRED on every scope manifest
    (a manifest without one fails, not skips -- otherwise a mutation PR
    could simply delete the block). A missing lean source or a missing
    pin_statements module is likewise a failure.
    """
    if not isinstance(manifest.get("definitions"), dict):
        failures.append(
            "manifest has no 'definitions' block; every scope manifest must "
            "pin its lean_file's definitions (fail-closed). Regenerate in the "
            "same PR: python3 papers/data/lean/pin_statements.py pin "
            "<manifest.json>"
        )
        return 0
    if lean_path is None or not os.path.isfile(lean_path):
        failures.append(
            "definitions block present but the lean source could not be "
            "located; pass --lean-file <path> (fail-closed)"
        )
        return 0
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        pin_statements = importlib.import_module("pin_statements")
    except ImportError as exc:
        failures.append(
            f"definitions block present but pin_statements.py (the shared "
            f"extractor) could not be imported: {exc} (fail-closed)"
        )
        return 0
    if not hasattr(pin_statements, "check_definitions"):
        failures.append(
            "pin_statements.py is present but has no check_definitions(); "
            "the definitions gate requires the extended extractor (fail-closed)"
        )
        return 0
    return pin_statements.check_definitions(manifest, lean_path, failures)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--axioms", required=True, help="captured lean stdout/stderr")
    ap.add_argument("--manifest", required=True, help="scope manifest json")
    ap.add_argument("--lean-file", default=None,
                    help="path to the manifest's .lean source, for the "
                         "statement-pin check (default: resolved from the "
                         "manifest's lean_file/file key)")
    args = ap.parse_args()

    with open(args.axioms, "r", encoding="utf-8") as fh:
        text = fh.read()
    with open(args.manifest, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)

    permitted = set(manifest["permitted_axioms"])
    forbidden = set(manifest.get("forbidden_axioms", ["sorryAx"]))
    expected = [
        t["name"] for t in manifest["theorems"] if t.get("status") == "lean-proved"
    ]

    reported, errors = parse(text)
    failures: list[str] = []

    for line in errors:
        failures.append(f"lean reported an error line: {line}")

    if not reported:
        failures.append(
            "no '#print axioms' lines were parsed from the kernel output; "
            "the gate refuses to pass on an empty parse"
        )

    for name in expected:
        if name not in reported:
            failures.append(f"missing printed axioms for expected theorem: {name}")

    for name, axioms in sorted(reported.items()):
        bad_forbidden = sorted(set(axioms) & forbidden)
        if bad_forbidden:
            failures.append(f"{name}: FORBIDDEN axiom(s) {bad_forbidden}")
        extra = sorted(set(axioms) - permitted)
        if extra:
            failures.append(f"{name}: axiom(s) outside permitted set {extra}")

    # ---- Lane 3: statement-pin gate (content, not just names) ----
    lean_path = resolve_lean_file(manifest, args.manifest, args.lean_file)
    pins_verified = check_statement_pins(manifest, lean_path, failures)

    # ---- Lane B: definitions-pin gate (what the statements refer to) ----
    # Reads the SOURCE file named by the manifest (not the kernel/probe
    # output), so it works identically for the per-file kernel steps and the
    # CurvedCorpus step that reuses the axiom-coverage probe output.
    defs_verified = check_definition_pins(manifest, lean_path, failures)

    print("=== parsed #print axioms ===")
    for name, axioms in sorted(reported.items()):
        print(f"  {name}: {axioms if axioms else '(none)'}")
    print(f"permitted axioms: {sorted(permitted)}")
    print(f"expected theorems: {len(expected)}, parsed declarations: {len(reported)}")
    if pins_verified:
        print(f"statement pins verified against {lean_path}: {pins_verified}/"
              f"{sum(1 for t in manifest['theorems'] if t.get('statement_sha256'))}")
    elif not any(t.get("statement_sha256") for t in manifest["theorems"]):
        print("statement pins: none in manifest; statement check skipped "
              "(legacy manifest)")
    else:
        print("statement pins: present but NOT verified (see failures)")

    n_defs_pinned = (manifest.get("definitions") or {}).get("count")
    if defs_verified and not any("DEFINITION" in f or "definitions" in f
                                 for f in failures):
        print(f"definitions verified against {lean_path}: "
              f"{defs_verified}/{n_defs_pinned} "
              f"(hash {manifest['definitions']['hash'][:16]}...)")
    else:
        print("definitions: NOT verified (see failures)")

    if failures:
        print("\nAXIOM_GATE_FAIL")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nAXIOM_GATE_OK: all expected theorems present, "
          "axioms within the permitted core set, no sorryAx"
          + (", all statement pins match" if pins_verified else "")
          + (", definitions pins match" if defs_verified else ""))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FileNotFoundError as exc:
        print(f"AXIOM_GATE_FAIL: {exc}", file=sys.stderr)
        sys.exit(2)
