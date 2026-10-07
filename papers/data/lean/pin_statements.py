#!/usr/bin/env python3
"""pin_statements.py -- statement pinning for the papers/data/lean scope manifests.

Lane 3 (CI hardening), yubi-OS/yubiOS. Companion to verify_wayfinder_axioms.py,
which imports this module for the shared statement-extraction logic.

WHAT IT DOES
------------
For every theorem entry in a scope manifest, it extracts the theorem's
STATEMENT TEXT from the .lean source, normalizes it, and pins the sha256 of
the normalized text into the manifest as `statement_sha256`.

Why sha256-of-normalized-statement rather than a literal text pin:
  * A literal pin breaks on harmless reformatting (line re-wraps, indentation
    churn), which trains maintainers to regenerate pins reflexively -- exactly
    the failure mode the pin exists to prevent.
  * A hash over normalized text (comments stripped, whitespace collapsed) is
    insensitive to formatting churn but changes on ANY semantic token change,
    so a silent `theorem stable_on ... : True` edit fails CI.
  * Debuggability is preserved: on mismatch the gate prints the ACTUAL
    extracted statement text so a human can diff intent without a second pin
    format to maintain.

NORMALIZATION CONTRACT (normative; the gate depends on it)
----------------------------------------------------------
  1. Strip Lean comments: `/- ... -/` block comments (nested, Lean-style) are
     replaced by spaces preserving newlines; `--` line comments are dropped to
     end-of-line. String literals are respected during stripping.
  2. Locate each declaration: a line whose first tokens are an optional
     modifier (`private` / `protected` / `noncomputable` / `unsafe`) then the
     keyword `theorem`, followed by the declaration name.
  3. Statement text = everything after the name up to the FIRST top-level
     `:=` (bracket-depth-aware; string literals respected). If the declaration
     uses a pattern-matching proof with no `:=` (e.g. RayleighBounds's
     `theorem quad_nonneg : ... | [], _ => ...`), the statement ends at the
     first newline at bracket depth 0 whose next line starts with `|`.
  4. Normalize: collapse every whitespace run to a single space; strip ends.
     Unicode operators are kept verbatim (the files are core-Lean ASCII-plus).

USAGE
-----
  pin_statements.py pin   <manifest.json>...   regenerate pins (deliberate edits only)
  pin_statements.py check <manifest.json>...   verify pins against sources (CI)
  pin_statements.py print <manifest.json>...   dump name/sha/statement for audit

The repo root is assumed to be three levels above the manifest's directory
(papers/data/lean/<manifest>.json); override with --repo-root.

A pin mismatch fails CI. A legitimate statement change requires a deliberate
`pin` regeneration IN THE SAME PR, with the statement diff reviewed as a
semantic change.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

THEOREM_RE = re.compile(
    r"(?m)^[\t ]*(?:(?:private|protected|noncomputable|unsafe)\s+)*"
    r"theorem\s+([A-Za-z_][A-Za-z0-9_.']*)"
)

BRACKET_OPEN = {"(", "[", "{"}
BRACKET_CLOSE = {")", "]", "}"}


def strip_lean_comments(text: str) -> str:
    """Remove Lean comments, preserving line structure (for line numbers)."""
    out: list[str] = []
    i, n = 0, len(text)
    block_depth = 0
    in_string = False
    while i < n:
        c = text[i]
        if in_string:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
            continue
        if c == '"':
            in_string = True
            out.append(c)
            i += 1
            continue
        if block_depth and text.startswith("/-", i):
            # nested block comment opens inside a block comment
            out.append("  ")
            block_depth += 1
            i += 2
            continue
        if block_depth and text.startswith("-/", i):
            out.append("  ")
            block_depth -= 1
            i += 2
            continue
        if block_depth:
            out.append("\n" if c == "\n" else " ")
            i += 1
            continue
        if text.startswith("/-", i):
            out.append("  ")
            block_depth += 1
            i += 2
            continue
        if text.startswith("--", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _scan_statement(text: str, start: int) -> tuple[str, int, str | None]:
    """Scan from `start` (just past the theorem name) to the statement end.

    Returns (statement_text, end_index, error). Statement ends at the first
    top-level ':=' or, absent ':=', at a newline whose next line begins with
    a match-arm '|'.
    """
    depth = 0
    in_string = False
    i, n = start, len(text)
    while i < n:
        c = text[i]
        if in_string:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
            continue
        if c == '"':
            in_string = True
            i += 1
            continue
        if c in BRACKET_OPEN:
            depth += 1
            i += 1
            continue
        if c in BRACKET_CLOSE:
            depth = max(0, depth - 1)
            i += 1
            continue
        if depth == 0 and text.startswith(":=", i):
            return text[start:i], i, None
        if depth == 0 and c == "\n":
            j = i + 1
            while j < n and text[j] in " \t":
                j += 1
            if j < n and text[j] == "|":
                return text[start:i], i, None
        i += 1
    return text[start:n], n, "no top-level ':=' or match arm found"


def extract_theorems(lean_text: str) -> dict[str, dict]:
    """Extract every `theorem` declaration from Lean source text.

    Returns {short_name: {"sha256", "statement", "line"}} where `statement`
    is the normalized statement text and `line` the 1-based line of the
    `theorem` keyword. Names are the bare declaration names (the files declare
    inside a single namespace, so short names are unique per file).
    """
    stripped = strip_lean_comments(lean_text)
    result: dict[str, dict] = {}
    for m in THEOREM_RE.finditer(stripped):
        name = m.group(1)
        stmt, _, err = _scan_statement(stripped, m.end())
        if err:
            raise ValueError(f"theorem {name}: {err}")
        normalized = re.sub(r"\s+", " ", stmt).strip()
        if name in result:
            raise ValueError(f"duplicate theorem name {name}")
        line = stripped.count("\n", 0, m.start()) + 1
        result[name] = {
            "sha256": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
            "statement": normalized,
            "line": line,
        }
    return result


def _resolve_lean_path(manifest_path: Path, manifest: dict, repo_root: Path) -> Path:
    rel = manifest.get("lean_file") or manifest.get("file")
    if not rel:
        raise SystemExit(f"{manifest_path}: manifest has no 'lean_file'/'file' key")
    for base in (Path.cwd(), repo_root):
        cand = base / rel
        if cand.is_file():
            return cand
    raise SystemExit(
        f"{manifest_path}: lean source '{rel}' not found under cwd or {repo_root}; "
        "pass --repo-root"
    )


def load_manifest(manifest_path: Path) -> dict:
    with open(manifest_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def pin_manifest(manifest_path: Path, repo_root: Path) -> dict:
    manifest = load_manifest(manifest_path)
    lean_path = _resolve_lean_path(manifest_path, manifest, repo_root)
    theorems = extract_theorems(lean_path.read_text(encoding="utf-8"))
    pinned = missing = 0
    for entry in manifest["theorems"]:
        if entry.get("status") != "lean-proved":
            continue
        short = entry["name"].split(".")[-1]
        if short not in theorems:
            raise SystemExit(
                f"{manifest_path}: theorem {entry['name']} not found in {lean_path}"
            )
        entry["statement_sha256"] = theorems[short]["sha256"]
        pinned += 1
    manifest.setdefault("statement_pinning", PINNING_BLOCK.copy())
    manifest["statement_pinning"]["pinned_from_commit"] = PINNED_FROM_COMMIT
    manifest["statement_pinning"]["pinned_from_source"] = str(lean_path)
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    return {"file": str(manifest_path), "lean": str(lean_path), "pinned": pinned,
            "decls_in_file": len(theorems)}


def check_manifest(manifest_path: Path, repo_root: Path) -> tuple[int, list[str]]:
    """Returns (pinned_count, failures)."""
    manifest = load_manifest(manifest_path)
    failures: list[str] = []
    lean_path = _resolve_lean_path(manifest_path, manifest, repo_root)
    theorems = extract_theorems(lean_path.read_text(encoding="utf-8"))
    pinned = 0
    for entry in manifest["theorems"]:
        sha = entry.get("statement_sha256")
        if not sha:
            continue  # unpinned entry (legacy); the gate notes these
        short = entry["name"].split(".")[-1]
        if short not in theorems:
            failures.append(f"{entry['name']}: not found in {lean_path}")
            continue
        pinned += 1
        actual = theorems[short]["sha256"]
        if actual != sha:
            failures.append(
                f"{entry['name']}: statement pin mismatch\n"
                f"    pinned:    {sha}\n"
                f"    actual:    {actual}\n"
                f"    actual statement: {theorems[short]['statement']}\n"
                f"    If this change is deliberate, regenerate the pin in the "
                f"same PR: pin_statements.py pin {manifest_path}"
            )
    return pinned, failures


PINNING_BLOCK = {
    "schema": "statement-pins/1",
    "pin": "sha256 of the normalized Lean statement text",
    "normalization": (
        "Lean comments stripped (/- -/ nested blocks, -- line); string literals "
        "respected; statement = source text between the declaration name and the "
        "first top-level ':=' (or the first top-level match-arm '|' line for "
        "pattern proofs); whitespace runs collapsed to single spaces; proof text "
        "excluded."
    ),
    "regenerate": "python3 papers/data/lean/pin_statements.py pin <manifest.json>",
    "policy": (
        "A pin mismatch fails CI. A legitimate statement change requires a "
        "deliberate pin regeneration in the same PR, with the statement diff "
        "reviewed as a semantic change. Do NOT regenerate pins to make CI pass "
        "without reviewing the statement diff."
    ),
}

PINNED_FROM_COMMIT = "ebfb8b58"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mode", choices=["pin", "check", "print"])
    ap.add_argument("manifests", nargs="+")
    ap.add_argument("--repo-root", default=None,
                    help="repo root (default: three levels above each manifest)")
    args = ap.parse_args(argv)

    any_failure = False
    for mpath in args.manifests:
        mpath = Path(mpath)
        repo_root = Path(args.repo_root) if args.repo_root else mpath.parents[3]
        if args.mode == "pin":
            info = pin_manifest(mpath, repo_root)
            print(f"PIN {info['file']}: {info['pinned']} pins regenerated from "
                  f"{info['lean']} ({info['decls_in_file']} declarations in file)")
        else:
            pinned, failures = check_manifest(mpath, repo_root)
            print(f"CHECK {mpath}: {pinned} pins verified")
            for f in failures:
                print(f"  FAIL: {f}")
            if failures:
                any_failure = True
    return 1 if any_failure else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FileNotFoundError as exc:
        print(f"pin_statements: {exc}", file=sys.stderr)
        sys.exit(2)
