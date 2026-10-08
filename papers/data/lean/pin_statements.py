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

Lane B round 3 (commands-v2) REPLACES those keyword-matched definition pins
with WHOLE-COMMAND pins: `extract_commands` (aliased as `extract_definitions`
for backward compatibility) segments the comment-stripped source into EVERY
top-level command -- imports, `open`/`namespace`...`end` wrappers, attribute
lines (hashed TOGETHER WITH the declaration they decorate), declarations of
ANY kind, `set_option` lines, `#print`/`#eval`/`#check` commands,
`notation`/`infix`/`syntax`/`macro`/`elab` commands, `run_cmd` blocks -- and
hashes them all. This closes the hole an external reviewer found in round 2:
`@[instance_reducible, instance] def badLE : LE Int := ⟨fun _ _ => True⟩`
is invisible to a line-start keyword regex (the attribute prefix precedes
the keyword), yet it makes `≤` mean `True` so every nonneg lemma collapses
to `trivial` with all statement pins intact. Under commands-v2 the command
segment carrying that mutation includes both the attribute and the
declaration, so the file hash changes and the per-command mismatch names
the new command. The ONLY text excluded from the hash is proof content: for
`theorem`/`lemma`/`example` declarations the command segment is truncated at
the first top-level `:=` (inclusive) or, for pattern-matching proofs, at the
first match-arm line. Proof bodies are kernel-checked and may be rewritten
freely (e.g. swapping `omega` for an equivalent `simp` chain) without
forcing a regeneration, while a statement mutation still changes the hash
AND trips the independent statement-pin gate (redundancy is deliberate).

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

COMMAND SEGMENTATION CONTRACT (round 3; normative for `definitions` blocks)
---------------------------------------------------------------------------
  1. Segment the comment-stripped source into top-level commands: a command
     starts at a column-0 non-blank line and runs to the start of the next
     column-0 non-blank line (or EOF); every continuation line is indented
     (the same column-0 contract `_decl_end` uses). Blank and fully
     commented-out lines carry no content.
  2. An `@[...]` attribute segment is NOT its own command: it attaches to the
     FOLLOWING command and is hashed together with it. This is what catches
     the reviewer's mutation -- an attribute-prefixed `def` is one command
     whose normalized text includes the attribute prefix.
  3. Classification: leading attribute groups and modifier keywords
     (`private`/`protected`/`noncomputable`/`unsafe`/`partial`/`scoped`/
     `local`) are consumed, then the first token is the command kind
     (`def`, `theorem`, `import`, `open`, `namespace`, `end`, `set_option`,
     `#print`, `notation`, `run_cmd`, ...). Declaration kinds get the next
     identifier-like token as their name when one is present (anonymous
     `instance`/`example` stay nameless).
  4. Proof-body exclusion: for `theorem`/`lemma`/`example` the hashed text
     is the statement THROUGH the first top-level `:=` (the `:=` itself is
     included) or, for pattern-matching proofs with no `:=`, up to (not
     including) the first match-arm line. Everything after is proof content:
     kernel-checked, excluded. Every other command is hashed in full --
     definitions' bodies ARE semantics.
  5. Command keys: `"<kind>:<name>"` for named declarations (e.g.
     `def:absSq`, `theorem:stable_on`), bare `"<kind>"` for the rest, with
     `#2`/`#3` suffixes appended only when the same base key occurs more
     than once in a file (two anonymous instances, several `#print` lines).
  6. Per-file hash: sha256 over the SORTED "key:normalized-text" entries
     joined by newlines -- sorted (not source-ordered) so that reordering
     independent declarations stays formatting-level churn. Non-declaration
     commands of the same kind carry position suffixes, so reordering two
     distinct same-kind commands (e.g. two different `set_option` lines)
     DOES change the hash; that is deliberate -- command order is semantic
     for non-declarations in Lean.

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
        if block_depth:
            # Inside a block comment: quotes are comment CONTENT, not string
            # delimiters. Checking block state first keeps a doc comment that
            # cites "Some Title, Unified" from leaking through stripping as
            # indented pseudo-code (which would confuse the commands-v2
            # command segmentation into seeing an orphan continuation line).
            if text.startswith("/-", i):
                # nested block comment opens inside a block comment
                out.append("  ")
                block_depth += 1
                i += 2
                continue
            if text.startswith("-/", i):
                out.append("  ")
                block_depth -= 1
                i += 2
                continue
            out.append("\n" if c == "\n" else " ")
            i += 1
            continue
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


# ---------------------------------------------------------------------------
# commands-v2: whole-command extraction (Lane B, CI hardening round 3)
#
# Replaces round 2's keyword-matched extract_definitions. Why: DEF_RE matched
# `def|structure|inductive|abbrev|instance|class` only at LINE START, so a
# declaration prefixed with an attribute line -- e.g. the reviewer's
# `@[instance_reducible, instance] def badLE : LE Int := ⟨fun _ _ => True⟩`
# -- was invisible to the extractor (the regex never sees the `def` at line
# start), every statement pin still matched, and CI passed while `<=` meant
# `True`. commands-v2 hashes EVERY top-level command instead.
# ---------------------------------------------------------------------------

# Declaration kinds whose proof bodies are excluded from the hash (kernel-
# checked content; rewriting a proof must not force a regeneration).
PROOF_TRUNCATE_KINDS = ("theorem", "lemma", "example")

DECLARATION_MODIFIERS = (
    "private", "protected", "noncomputable", "unsafe", "partial",
    "scoped", "local",
)

# Tokens: `#print`/`#eval`/`#check`-style words first (so `#print` is one
# token, not `#` + `print`), then identifier-like words, then any single
# non-space char.
_TOKEN_RE = re.compile(r"#[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_.']*|\S")


def _raw_command_segments(stripped: str) -> list[tuple[int, int]]:
    """Split comment-stripped source into top-level command char spans.

    Contract (inherited from _decl_end): every top-level command starts at
    column 0 and every continuation line is indented. Blank (or fully
    commented-out) lines separate commands but carry no content. Returns
    non-overlapping spans covering every non-blank line, in source order.
    """
    lines = stripped.splitlines()
    starts = _line_starts(stripped)
    spans: list[tuple[int, int]] = []
    open_start: int | None = None
    for idx, raw_line in enumerate(lines):
        if not raw_line.strip():
            if open_start is not None:
                spans.append((open_start, starts[idx]))
                open_start = None
            continue
        if raw_line[0].isspace():
            if open_start is None:
                raise ValueError(
                    f"line {idx + 1} is indented but no top-level command "
                    "is open (continuation without a column-0 command head)"
                )
            continue
        if open_start is not None:
            spans.append((open_start, starts[idx]))
        open_start = starts[idx]
    if open_start is not None:
        spans.append((open_start, len(stripped)))
    return spans


def _classify_command(raw: str) -> tuple[str, str | None, int]:
    """Classify a command segment.

    Returns (kind, name-or-None, name_end): leading `@[...]` attribute
    groups are skipped (they may span lines), modifier keywords are
    consumed, the next token is the command kind, and for declaration kinds
    a following identifier-like token is taken as the name (name_end points
    just past it). Anonymous `instance`/`example` declarations stay nameless.
    """
    i, n = 0, len(raw)
    while True:
        while i < n and raw[i].isspace():
            i += 1
        if raw.startswith("@[", i):
            depth = 0
            while i < n:
                if raw[i] == "[":
                    depth += 1
                elif raw[i] == "]":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
            continue
        break
    kind: str | None = None
    name: str | None = None
    name_end = i
    for m in _TOKEN_RE.finditer(raw, i):
        tok = m.group(0)
        if kind is None:
            if tok in DECLARATION_MODIFIERS:
                continue
            kind = tok
            continue
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.']*", tok):
            name = tok
            name_end = m.end()
        break
    if kind is None:
        # Fail-closed (round-3 integration fix): an attribute-only command
        # segment -- an `@[...]` attribute line on its own line whose
        # decorated declaration starts on the NEXT column-0 line -- has no
        # command token after the attribute groups. Raise a ValueError (not
        # an assert) so check_definitions / check_statement_pins report a
        # proper gate failure instead of an uncaught traceback. Such a
        # source layout FAILS the gate; it is never silently skipped.
        raise ValueError(
            "empty command segment: a column-0 command segment contains no "
            "command token after its attribute groups -- most likely an "
            "@[...] attribute line on its own line with the decorated "
            "declaration on the following line, which commands-v2 does not "
            "attach. Put the attribute and declaration on one line (or "
            "regenerate after refactoring); this layout fails the gate "
            "fail-closed."
        )
    return kind, name, name_end


def extract_commands(lean_text: str) -> dict[str, dict]:
    """Extract EVERY top-level command from Lean source text (commands-v2).

    Covered: imports, `open`/`namespace`/`end`/`section` wrappers, `@[...]`
    attribute lines (hashed TOGETHER WITH the declaration they decorate --
    this is what catches the reviewer's mutation), declarations of any kind
    (`def`/`theorem`/`lemma`/`structure`/`inductive`/`abbrev`/`instance`/
    `class`/`axiom`/`example`/... with modifiers), `set_option` lines,
    `#print`/`#eval`/`#check` commands, `notation`/`infix`/`syntax`/`macro`/
    `elab` commands, `run_cmd` blocks -- anything that starts at column 0.

    Proof-body exclusion: for `theorem`/`lemma`/`example` the hashed text is
    the statement THROUGH the first top-level `:=` (inclusive) or, for
    pattern-matching proofs with no `:=`, up to (not including) the first
    match-arm line. Proof content is kernel-checked and excluded so the hash
    stays stable under proof-only edits. Every other command is hashed in
    full (a definition's body IS semantics).

    Returns {command_key: {"sha256", "body", "kind", "line"}} where `body`
    is the normalized hashed text, `kind` the first command token, and
    `line` the 1-based line of the command head (attribute-prefixed
    declarations report the line of their FIRST attribute line). Keys are
    `"<kind>:<name>"` for named declarations, bare `"<kind>"` otherwise,
    with `#2`/`#3` suffixes on same-base-key collisions (multiple anonymous
    instances, several `#print` lines, ...). A duplicate key raises.

    `extract_definitions` is a backward-compatible alias for this function.
    """
    stripped = strip_lean_comments(lean_text)
    result: dict[str, dict] = {}
    used: dict[str, int] = {}
    for seg_start, seg_end in _raw_command_segments(stripped):
        raw = stripped[seg_start:seg_end]
        line = stripped.count("\n", 0, seg_start) + 1
        kind, name, name_end = _classify_command(raw)
        if kind in PROOF_TRUNCATE_KINDS and name is not None:
            _, cut, err = _scan_statement(raw, name_end)
            if err:
                raise ValueError(f"{kind} {name}: {err}")
            kept = raw[:cut]
            if raw[cut:cut + 2] == ":=":
                kept += ":="
            body = re.sub(r"\s+", " ", kept).strip()
        else:
            body = re.sub(r"\s+", " ", raw).strip()
        base = f"{kind}:{name}" if name is not None else kind
        n = used.get(base, 0) + 1
        used[base] = n
        key = base if n == 1 else f"{base}#{n}"
        if key in result:
            raise ValueError(f"duplicate command key {key}")
        result[key] = {
            "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
            "body": body,
            "kind": kind,
            "line": line,
        }
    return result


def extract_definitions(lean_text: str) -> dict[str, dict]:
    """Backward-compatible alias for extract_commands (commands-v2).

    Round 2's extract_definitions keyword-matched def/structure/inductive/
    abbrev/instance/class at line start, which made `@[...]`-prefixed
    declarations and every non-declaration command invisible. Round 3
    replaces it with whole-command extraction; this alias keeps
    verify_wayfinder_axioms.py and any external callers working with an
    unchanged call signature and return shape. The keyword-matched
    semantics are gone deliberately -- call extract_commands directly for
    clarity.
    """
    return extract_commands(lean_text)


def definitions_hash(defs: dict[str, dict]) -> str:
    """Per-file commands hash (commands-v2).

    sha256 over the SORTED list of "command-key:normalized-text" entries
    joined by newlines, where command keys are "<kind>:<name>" for named
    declarations and bare "<kind>" (with #N collision suffixes) for the
    rest. Sorted (not source-ordered) so declaration order does not affect
    the hash -- a pure reordering of independent declarations is a
    formatting-level churn we do not want to force a regeneration for;
    adding/removing/altering one is. Same-kind non-declaration commands
    carry position suffixes, so reordering two DISTINCT same-kind commands
    (e.g. two different `set_option` lines) changes the hash; that is
    deliberate -- command order is semantic for non-declarations in Lean.
    """
    entries = sorted(f"{name}:{defs[name]['body']}" for name in defs)
    return hashlib.sha256("\n".join(entries).encode("utf-8")).hexdigest()


DEFINITIONS_PINNED_FROM_COMMIT = "7d5ee590a55e"

DEFINITIONS_SCHEMA_BLOCK = {
    "schema": "commands-v2",
    "pin": (
        "sha256 over the sorted 'command-key:normalized-text' entries of "
        "EVERY top-level command in the lean_file -- imports, open/namespace/"
        "end wrappers, attribute lines (hashed WITH the declaration they "
        "decorate), declarations of any kind, set_option lines, #print/"
        "#eval/#check, notation/syntax/macro/elab, run_cmd blocks (comments "
        "stripped, whitespace collapsed). theorem/lemma/example proof bodies "
        "are EXCLUDED: the hashed text is the statement through the first "
        "top-level ':=' (inclusive) or up to the first match-arm line. "
        "'decls' maps each command key (<kind>:<name>, or <kind> with #N "
        "collision suffixes for unnamed commands) to its own normalized-"
        "text sha256"
    ),
    "regenerate": "python3 papers/data/lean/pin_statements.py pin <manifest.json>",
    "policy": (
        "A commands-hash mismatch FAILS CI even when every theorem "
        "statement is unchanged: adding ANY top-level command (including an "
        "attribute-prefixed declaration, which round 2's line-start keyword "
        "regex missed), redefining a definition, or adding a set_option/"
        "#print/notation line changes what the pinned theorems actually "
        "prove or how the file elaborates, so a legitimate change requires "
        "a deliberate definitions-block regeneration IN THE SAME PR, with "
        "the command diff reviewed as a semantic change. Do NOT regenerate "
        "the block to make CI pass without reviewing the diff. Proof-body-"
        "only rewrites (kernel-checked content) do NOT change the hash and "
        "need no regeneration. A block pinning zero commands is refused "
        "(vacuous pin), and a block whose schema is not commands-v2 "
        "FAILS the gate (fail-closed; an old definition-pins/1 defs-only "
        "block cannot be verified against command hashing)."
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
    """Commands-pin gate (commands-v2). Returns the number of commands verified.

    Fail-closed, mirroring the statement-pin gate: a missing block, a block
    whose schema is not 'commands-v2' (an old definition-pins/1 defs-only
    block FAILS with a regenerate-with-the-commands-v2-extractor message,
    never passes vacuously), an unresolvable lean file, a missing extractor,
    or an extraction error is a FAILURE, not a skip.
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
    if block.get("schema") != "commands-v2":
        failures.append(
            f"definitions block has schema '{block.get('schema')}' but this "
            "gate requires 'commands-v2' (the whole-command extractor): an "
            "older definition-pins/1 defs-only block hashes only the line-"
            "start keyword-matched declarations and CANNOT be verified "
            "against command hashing -- an @[...]-prefixed declaration or a "
            "new set_option/#print line would pass it vacuously. Regenerate "
            "with the commands-v2 extractor in the same PR: python3 "
            "papers/data/lean/pin_statements.py pin <manifest.json>"
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
            "commands found (commands-v2 hashes EVERY top-level command)"
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
                f"command pin for {name}: command no longer present "
                f"in {lean_path}"
            )
        for name in sorted(defs):
            if name not in decls:
                failures.append(
                    f"COMMAND PIN MISMATCH for {name} ({defs[name]['kind']}, "
                    f"line {defs[name]['line']}): command present in "
                    f"{lean_path} but absent from the block's decls map "
                    "(a new, renamed, or re-keyed command)"
                )
                continue
            actual = defs[name]["sha256"]
            if actual == decls[name]:
                verified += 1
            else:
                failures.append(
                    f"COMMAND PIN MISMATCH for {name} ({defs[name]['kind']}, "
                    f"line {defs[name]['line']}):\n"
                    f"    pinned sha256: {decls[name]}\n"
                    f"    actual sha256: {actual}\n"
                    f"    actual command: {defs[name]['body']}\n"
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
                  f"{info['lean']} ({info['decls_in_file']} top-level commands in file)")
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
