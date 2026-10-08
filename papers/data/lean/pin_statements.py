#!/usr/bin/env python3
"""pin_statements.py -- statement pinning for the papers/data/lean scope manifests.

Lane 3 (CI hardening), yubi-OS/yubiOS. Companion to verify_wayfinder_axioms.py,
which imports this module for the shared statement-extraction logic.

WHAT IT DOES
------------
For every theorem entry in a scope manifest, it extracts the theorem's
STATEMENT TEXT from the .lean source, normalizes it, and pins the sha256 of
the normalized text into the manifest as `statement_sha256`.

Lane B (CI hardening round 2) adds DEFINITION PINS on top: a per-file
`definitions` block in each scope manifest pins (a) a `hash` over EVERY
top-level `def` / `structure` / `inductive` / `abbrev` / `instance` / `class`
declaration in the .lean source and (b) a per-definition `decls` map. Why:
theorem STATEMENT pins hash statement text, which is unchanged when someone
redefines a definition the statements refer to -- e.g. rewriting
`def absSq (z : Cx) : Int := z.1 * z.1 + z.2 * z.2` to `:= 0` leaves all 14
AzimuthBounds theorem statements byte-identical while the theorems collapse
to trivialities. The definitions hash changes on ANY definition-body,
signature, name, or kind edit, so such a mutation fails CI until the
manifest's `definitions` block is deliberately regenerated in the same PR.

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

# Top-level DEFINITION declarations. Like theorems, these start at column 0
# (the files' uniform style; every continuation line is indented). The name
# group is optional ONLY for `instance`, which Lean permits anonymously.
DEF_RE = re.compile(
    r"(?m)^(?:(?:private|protected|noncomputable|unsafe|partial|scoped|local)\s+)*"
    r"(?P<kind>def|structure|inductive|abbrev|instance|class)\s+"
    r"(?:(?P<name>[A-Za-z_][A-Za-z0-9_.']*)\s+)?"
)

DEFINITION_KINDS = ("def", "structure", "inductive", "abbrev", "instance", "class")

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


def _line_starts(text: str) -> list[int]:
    starts = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            starts.append(i + 1)
    return starts


def _decl_end(stripped: str, decl_start: int) -> int:
    """End of a top-level declaration.

    Contract: a declaration runs from its keyword line to the start of the
    next non-blank line that begins at column 0 (or EOF). Every top-level
    declaration in the corpus starts at column 0 and every continuation line
    (pattern-match arms, structure fields, indented bodies) is indented, so
    the first column-0 non-blank line after the declaration opens a new
    top-level form. Doc comments are already stripped, so a `/-` at column 0
    cannot masquerade as code.
    """
    lines = stripped.splitlines()
    starts = _line_starts(stripped)
    # bisect: index of the line containing decl_start
    lo, hi = 0, len(starts)
    while lo < hi:
        mid = (lo + hi) // 2
        if starts[mid] <= decl_start:
            lo = mid + 1
        else:
            hi = mid
    decl_line = lo - 1
    for j in range(decl_line + 1, len(lines)):
        raw = lines[j]
        if not raw.strip():
            continue
        if not raw[0].isspace():
            return starts[j]
    return len(stripped)


def extract_definitions(lean_text: str) -> dict[str, dict]:
    """Extract every top-level definition declaration from Lean source text.

    Kinds covered: `def`, `structure`, `inductive`, `abbrev`, `instance`,
    `class` (with their `private`/`protected`/`noncomputable`/`unsafe`/
    `partial`/`scoped`/`local` modifiers). `theorem` declarations are
    deliberately EXCLUDED -- they are covered by extract_theorems/statement
    pins; the definitions gate exists for what statements refer to.

    Returns {name: {"sha256", "body", "kind", "line"}} where `body` is the
    NORMALIZED full declaration text (from the first modifier/keyword at
    column 0 through end-of-declaration, whitespace collapsed) and `sha256`
    hashes that body. Anonymous `instance` declarations get stable
    order-derived names (`instance.anon1`, ...) so their presence, absence,
    or reordering still changes the file hash.

    Names are unique per file (the corpus declares inside a single
    namespace, mirroring the theorem-extraction contract); a duplicate name
    raises.
    """
    stripped = strip_lean_comments(lean_text)
    starts = _line_starts(stripped)
    result: dict[str, dict] = {}
    anon = 0
    for m in DEF_RE.finditer(stripped):
        kind = m.group("kind")
        name = m.group("name")
        if name is None:
            if kind != "instance":
                raise ValueError(
                    f"top-level {kind} without a name at line "
                    f"{stripped.count(chr(10), 0, m.start()) + 1}"
                )
            anon += 1
            name = f"instance.anon{anon}"
        if name in result:
            raise ValueError(f"duplicate definition name {name}")
        raw = stripped[m.start():_decl_end(stripped, m.start())]
        normalized = re.sub(r"\s+", " ", raw).strip()
        line = stripped.count("\n", 0, m.start()) + 1
        result[name] = {
            "sha256": hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
            "body": normalized,
            "kind": kind,
            "line": line,
        }
    return result


def definitions_hash(defs: dict[str, dict]) -> str:
    """Per-file definitions hash.

    sha256 over the SORTED list of "name:normalized-decl" entries joined by
    newlines. Sorted so declaration order does not affect the hash (a pure
    reordering of independent definitions is a formatting-level churn we do
    not want to force a regeneration for; adding/removing/altering one is).
    """
    entries = sorted(f"{name}:{defs[name]['body']}" for name in defs)
    return hashlib.sha256("\n".join(entries).encode("utf-8")).hexdigest()


DEFINITIONS_PINNED_FROM_COMMIT = "644f983b253"

DEFINITIONS_SCHEMA_BLOCK = {
    "schema": "definition-pins/1",
    "pin": (
        "sha256 over the sorted 'name:normalized-decl' entries of EVERY "
        "top-level def/structure/inductive/abbrev/instance/class declaration "
        "in the lean_file (comments stripped, whitespace collapsed); 'decls' "
        "maps each definition name to its own normalized-decl sha256"
    ),
    "regenerate": "python3 papers/data/lean/pin_statements.py pin <manifest.json>",
    "policy": (
        "A definitions-hash mismatch FAILS CI even when every theorem "
        "statement is unchanged: redefining a definition changes what the "
        "pinned theorems actually prove, so a legitimate definition change "
        "requires a deliberate definitions-block regeneration IN THE SAME "
        "PR, with the definition diff reviewed as a semantic change. Do NOT "
        "regenerate the block to make CI pass without reviewing the "
        "definition diff. A block pinning zero definitions is refused "
        "(vacuous pin)."
    ),
}


def definitions_block(defs: dict[str, dict]) -> dict:
    """Build the manifest `definitions` block for an extracted definitions map."""
    block = dict(DEFINITIONS_SCHEMA_BLOCK)
    block["hash"] = definitions_hash(defs)
    block["count"] = len(defs)
    block["decls"] = {name: defs[name]["sha256"] for name in sorted(defs)}
    block["pinned_from_commit"] = DEFINITIONS_PINNED_FROM_COMMIT
    return block


def check_definitions(manifest: dict, lean_path, failures: list[str]) -> int:
    """Definitions-pin gate. Returns the number of definitions verified.

    Fail-closed, mirroring the statement-pin gate: a missing block, an
    unresolvable lean file, a missing extractor, or an extraction error is
    a FAILURE, not a skip.
    """
    block = manifest.get("definitions")
    if not isinstance(block, dict) or "hash" not in block:
        failures.append(
            "manifest has no 'definitions' block; every scope manifest must "
            "pin its lean_file's definitions (fail-closed). Regenerate in the "
            "same PR: python3 papers/data/lean/pin_statements.py pin "
            "<manifest.json>"
        )
        return 0
    if lean_path is None:
        failures.append(
            "definitions block present but the lean source could not be "
            "located; pass --lean-file <path> (fail-closed)"
        )
        return 0
    try:
        lean_text = open(lean_path, "r", encoding="utf-8").read()
    except OSError as exc:
        failures.append(f"definitions check could not read {lean_path}: {exc}")
        return 0
    try:
        defs = extract_definitions(lean_text)
    except ValueError as exc:
        failures.append(f"definition extraction failed on {lean_path}: {exc}")
        return 0
    if not defs:
        failures.append(
            f"definitions check is VACUOUS on {lean_path}: zero top-level "
            "def/structure/inductive/abbrev/instance/class declarations found"
        )
        return 0
    if not isinstance(block.get("count"), int) or block["count"] <= 0:
        failures.append(
            "definitions block pins a zero/missing count -- a definitions pin "
            "over zero definitions is vacuous (fail-closed)"
        )
        return 0
    verified = 0
    actual_hash = definitions_hash(defs)
    if block["hash"] != actual_hash:
        failures.append(
            "DEFINITIONS HASH MISMATCH -- a definition changed in the lean "
            "source while the manifest's definitions block still pins the "
            "old one; the theorems may now prove something different even "
            "though every statement text is unchanged.\n"
            f"    pinned sha256: {block['hash']}\n"
            f"    actual sha256: {actual_hash}\n"
            "    If this change is deliberate, regenerate the manifest's "
            "definitions block in the SAME PR: python3 "
            "papers/data/lean/pin_statements.py pin <manifest.json>"
        )
    if block["count"] != len(defs):
        failures.append(
            f"definitions count mismatch: pinned {block['count']}, "
            f"actual {len(defs)} in {lean_path}"
        )
    decls = block.get("decls")
    if not isinstance(decls, dict):
        failures.append("definitions block has no 'decls' per-definition map")
    else:
        for name in sorted(set(decls) - set(defs)):
            failures.append(
                f"definitions pin for {name}: declaration no longer present "
                f"in {lean_path}"
            )
        for name in sorted(defs):
            if name not in decls:
                failures.append(
                    f"definitions pin missing for {name}: definition present "
                    f"in {lean_path} but absent from the block's decls map"
                )
                continue
            actual = defs[name]["sha256"]
            if actual == decls[name]:
                verified += 1
            else:
                failures.append(
                    f"DEFINITION PIN MISMATCH for {name} ({defs[name]['kind']}, "
                    f"line {defs[name]['line']}):\n"
                    f"    pinned sha256: {decls[name]}\n"
                    f"    actual sha256: {actual}\n"
                    f"    actual declaration: {defs[name]['body']}\n"
                    "    If this change is deliberate, regenerate the "
                    "manifest's definitions block in the SAME PR: python3 "
                    "papers/data/lean/pin_statements.py pin <manifest.json>"
                )
    return verified


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


def pin_manifest(manifest_path: Path, repo_root: Path,
                 defs_only: bool = False) -> dict:
    manifest = load_manifest(manifest_path)
    lean_path = _resolve_lean_path(manifest_path, manifest, repo_root)
    defs = extract_definitions(lean_path.read_text(encoding="utf-8"))
    if not defs:
        raise SystemExit(
            f"{manifest_path}: refusing to pin zero definitions from "
            f"{lean_path} -- a definitions pin over zero definitions is "
            "vacuous and would make the gate blind"
        )
    manifest["definitions"] = definitions_block(defs)
    # Preserve the manifest's own unicode-escaping style so the regeneration
    # diff stays additive-only: a manifest stored with \uXXXX escapes is
    # re-dumped with ensure_ascii=True, one with literal UTF-8 with False.
    raw_text = manifest_path.read_text(encoding="utf-8")
    ensure_ascii = all(ord(ch) < 128 for ch in raw_text)
    pinned = 0
    if not defs_only:
        theorems = extract_theorems(lean_path.read_text(encoding="utf-8"))
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
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=ensure_ascii)
        fh.write("\n")
    return {"file": str(manifest_path), "lean": str(lean_path), "pinned": pinned,
            "decls_in_file": len(defs)}


def check_manifest(manifest_path: Path, repo_root: Path) -> tuple[int, list[str]]:
    """Returns (pinned_count, failures). Checks statement AND definition pins."""
    manifest = load_manifest(manifest_path)
    failures: list[str] = []
    lean_path = _resolve_lean_path(manifest_path, manifest, repo_root)
    lean_text = lean_path.read_text(encoding="utf-8")
    theorems = extract_theorems(lean_text)
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
    check_definitions(manifest, lean_path, failures)
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
    ap.add_argument("--defs-only", action="store_true",
                    help="pin mode: regenerate ONLY the definitions block, "
                         "leaving statement pins untouched (minimal diff)")
    args = ap.parse_args(argv)

    any_failure = False
    for mpath in args.manifests:
        mpath = Path(mpath)
        repo_root = Path(args.repo_root) if args.repo_root else mpath.parents[3]
        if args.mode == "pin":
            info = pin_manifest(mpath, repo_root, defs_only=args.defs_only)
            print(f"PIN {info['file']}: {info['pinned']} statement pins"
                  f"{' (defs-only: statement pins untouched)' if args.defs_only else ''}"
                  f" + definitions block regenerated from "
                  f"{info['lean']} ({info['decls_in_file']} definitions in file)")
        else:
            pinned, failures = check_manifest(mpath, repo_root)
            print(f"CHECK {mpath}: {pinned} statement pins verified")
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
