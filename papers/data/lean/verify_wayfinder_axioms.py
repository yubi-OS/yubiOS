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

Exit 0 on pass, 1 on failure, 2 on bad usage.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# 'Foo.bar' depends on axioms: [propext, Classical.choice, Quot.sound]
DEPENDS_RE = re.compile(r"^'([^']+)' depends on axioms: \[(.*)\]\s*$")
# 'Foo.bar' does not depend on any axioms
NO_AXIOM_RE = re.compile(r"^'([^']+)' does not depend on any axioms\s*$")
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
    return reported, errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--axioms", required=True, help="captured lean stdout/stderr")
    ap.add_argument("--manifest", required=True, help="wayfinder-scope.json")
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

    print("=== parsed #print axioms ===")
    for name, axioms in sorted(reported.items()):
        print(f"  {name}: {axioms if axioms else '(none)'}")
    print(f"permitted axioms: {sorted(permitted)}")
    print(f"expected theorems: {len(expected)}, parsed declarations: {len(reported)}")

    if failures:
        print("\nAXIOM_GATE_FAIL")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nAXIOM_GATE_OK: all expected theorems present, "
          "axioms within the permitted core set, no sorryAx")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FileNotFoundError as exc:
        print(f"AXIOM_GATE_FAIL: {exc}", file=sys.stderr)
        sys.exit(2)
