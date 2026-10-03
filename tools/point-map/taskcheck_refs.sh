#!/usr/bin/env bash
# taskcheck_refs.sh - frozen task check for refs/ corpus edits (C1-C7).
# The independent quality gate for the jev-corpus RSI rounds: a KEEP commits
# only when this passes. Re-authored in-repo 2026-10-03 (the round-5 checker
# was session-scoped and lost).
#
# Usage: taskcheck_refs.sh <before-file> <after-file> <target-axis-index>
#   before-file  the pre-edit copy of the refs/ doc
#   after-file   the post-edit copy
#   target-axis  0..11 (audience inputs outputs mode assumption adjacent
#                failure lifecycle composition knowledge calibration recursion)
# Exit 0 = PASS (edit may be committed); exit 1 = check-blocked (decline).
set -u
BEFORE=$1; AFTER=$2; AXIS=$3
fail() { echo "FAIL[$1] $2"; exit 1; }
pass() { echo "PASS[$1] $2"; }

# C1 file shape: both files exist, after is .md
[ -f "$BEFORE" ] || fail C1 "before-file missing"
[ -f "$AFTER" ] || fail C1 "after-file missing"
case "$AFTER" in *.md) ;; *) fail C1 "after-file is not .md";; esac
pass C1 "files exist, .md"

# C2 append-only: before must be a prefix of after (no deletions or edits)
if ! cmp -s -n "$(wc -c < "$BEFORE")" "$BEFORE" "$AFTER"; then
  fail C2 "edit is not append-only (existing content was modified or deleted)"
fi
pass C2 "append-only"

# C3 single section: exactly one new '## ' heading, unique in the file
ADDED=$(tail -c +$(( $(wc -c < "$BEFORE") + 1 )) "$AFTER")
NEWH=$(printf '%s\n' "$ADDED" | grep -c '^## ')
[ "$NEWH" -eq 1 ] || fail C3 "expected exactly 1 new section heading, got $NEWH"
HEADTXT=$(printf '%s\n' "$ADDED" | grep '^## ' | head -1)
TOT=$(grep -cF "$HEADTXT" "$AFTER")
[ "$TOT" -eq 1 ] || fail C3 "section heading not unique in file ($TOT occurrences)"
pass C3 "single new section: $HEADTXT"

# C4 size bound: added lines <= 40 (one atomic section)
NLINES=$(printf '%s\n' "$ADDED" | grep -c . || true)
[ "$NLINES" -le 40 ] || fail C4 "added $NLINES lines (> 40; keep the edit atomic)"
pass C4 "added $NLINES lines"

# C5 axis vocabulary: added text must not carry OTHER axes' section vocabulary
AXIS_NAME=$(printf '%s' "$AXIS" | awk '{split("audience inputs outputs mode assumption adjacent failure lifecycle composition knowledge calibration recursion", a, " "); print a[$1+1]}')
[ -n "$AXIS_NAME" ] || fail C5 "target axis must be 0..11"
BAD=0
for w in audience inputs outputs mode assumption adjacent failure lifecycle composition knowledge calibration recursion; do
  [ "$w" = "$AXIS_NAME" ] && continue
  if printf '%s\n' "$ADDED" | grep -qi "^## .*$w\|$w coverage"; then BAD=1; echo "  trips axis: $w"; fi
done
[ "$BAD" -eq 0 ] || fail C5 "added text carries another axis's vocabulary (refs4/refs6 collateral lesson)"
pass C5 "no cross-axis vocabulary (target: $AXIS_NAME)"

# C6 grounding: added text cites an in-repo path or carries concrete dated facts
GRND=0
printf '%s\n' "$ADDED" | grep -q '`\(refs\|docs\|tools\)/' && GRND=1
NY=$(printf '%s\n' "$ADDED" | grep -oE '\b20[0-9]{2}\b' | wc -l)
[ "$NY" -ge 2 ] && GRND=1
[ "$GRND" -eq 1 ] || fail C6 "added section is not source-grounded (cite an in-repo path or concrete dated facts)"
pass C6 "grounded"

# C7 charter: companion/census records with do-not-grow charters are declined
# unless the operator records an explicit override reason.
if grep -qi "does not claim\|Family: census record\|companion record" "$BEFORE"; then
  [ "${TASKCHECK_OVERRIDE:-}" = "" ] && fail C7 "charter-declined doc (companion/census 'nothing more'); set TASKCHECK_OVERRIDE=<reason> to force"
  pass C7 "charter override in effect: $TASKCHECK_OVERRIDE"
else
  pass C7 "no do-not-grow charter"
fi

echo "TASKCHECK PASS (C1-C7)"
exit 0
