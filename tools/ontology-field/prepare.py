"""Freeze a balanced sample of Schema.org definitions with independent taxonomy labels."""
import argparse
import csv
import hashlib
import html
import json
import re
from functools import cache
from pathlib import Path

ROOTS = sorted(["Action", "CreativeWork", "Event", "Organization", "Place", "Intangible"])
SOURCE_SHA = "27c98363f5a79c269f936f15d2d02eaaf1808750d96e9ed2f3e583f6845760d0"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(source):
    if digest(source.read_bytes()) != SOURCE_SHA:
        raise ValueError("Schema.org release CSV differs from the frozen source")
    with source.open(newline="", encoding="utf8") as stream:
        rows = {r["id"].split("/")[-1]: r for r in csv.DictReader(stream)}

    @cache
    def ancestors(term):
        if term not in rows:
            return set()
        parents = [x.split("/")[-1] for x in rows[term]["subTypeOf"].split(", ") if x]
        return set(parents).union(*(ancestors(p) for p in parents))

    groups = {root: [] for root in ROOTS}
    for term, row in rows.items():
        family = set(ROOTS) & ancestors(term)
        if len(family) != 1 or term in ROOTS or row["supersededBy"] or row["enumerationtype"]:
            continue
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", row["comment"])).split())
        if not 24 <= len(text) <= 1500:
            continue
        root = family.pop()
        groups[root].append(dict(term=term, family=root, text=text,
                                 input_sha256=digest(text.encode())))
    seen = set()
    result = []
    for root, candidates in groups.items():
        ordered = sorted(candidates, key=lambda r: digest(("ontology-field-v1/" + r["term"]).encode()))
        selected = 0
        for row in ordered:
            if row["input_sha256"] in seen:
                continue
            seen.add(row["input_sha256"])
            result.append(dict(**row, split="reference" if selected % 2 == 0 else "field"))
            selected += 1
            if selected == 16:
                break
        if selected != 16:
            raise ValueError(f"{root} has only {selected} eligible definitions")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in prepare(args.source)))
