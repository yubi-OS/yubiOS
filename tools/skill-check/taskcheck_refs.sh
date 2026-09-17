#!/bin/bash
# Frozen 2026-09-17 before refs round 5. Independent content check for ONE file under refs/.
# Usage: taskcheck_refs.sh <file> [<repo-root>]  -> prints C1..C6 and TASK CHECK: PASS|FAIL. Geometry is never consulted.
f=$1; root=${2:-.}; fail=0
c1=$(grep -c $'\xc3\xa2\|\xef\xbf\xbd' "$f"); [ "$c1" -eq 0 ] && echo "C1 mojibake/replacement bytes: 0 PASS" || { echo "C1 mojibake/replacement bytes: $c1 FAIL"; fail=1; }
c2=$(grep '^## ' "$f" | sort | uniq -d | wc -l); [ "$c2" -eq 0 ] && echo "C2 duplicate H2 headings: 0 PASS" || { echo "C2 duplicate H2 headings: $c2 FAIL"; fail=1; }
c3=$(grep -c 'TBD per file context\|TODO: refine per file context\|TODO: fill in\|TBD per context' "$f"); [ "$c3" -eq 0 ] && echo "C3 placeholder TODO lines: 0 PASS" || { echo "C3 placeholder TODO lines: $c3 FAIL"; fail=1; }
c5=$(grep -c 'This document applies least-privilege hardening\|This document integrates with the yubiOS declarative-policy substrate\|This document supports the yubiOS continuous-monitoring layer\|This document participates in the yubiOS root-of-trust chain\|This skill applies least-privilege hardening\|This skill integrates with the yubiOS declarative-policy substrate\|This skill supports the yubiOS continuous-monitoring layer\|This skill participates in the yubiOS root-of-trust chain' "$f"); [ "$c5" -eq 0 ] && echo "C5 template capability claims: 0 PASS" || { echo "C5 template capability claims: $c5 FAIL"; fail=1; }
c6=0; d=$(dirname "$f"); for p in $(grep -o '](\./[^)#]*\|](\.\./[^)#]*\|](refs/[^)#]*\|](scripts/[^)#]*\|](references/[^)#]*\|](assets/[^)#]*' "$f" | sed 's/^](//' | sort -u); do
  if [[ "$p" == refs/* ]]; then [ -e "$root/$p" ] || { echo "  unresolved repo link: $p"; c6=$((c6+1)); }
  else [ -e "$d/$p" ] || { echo "  unresolved local link: $p"; c6=$((c6+1)); }; fi
done; [ "$c6" -eq 0 ] && echo "C6 unresolved local links: 0 PASS" || { echo "C6 unresolved local links: $c6 FAIL"; fail=1; }
c7=$(python3 - "$f" <<'PY'
import sys,re,base64
s=open(sys.argv[1],'rb').read().decode('utf-8','replace').strip()
ok=0
if len(s)>40 and re.fullmatch(r'[A-Za-z0-9+/=\s]+',s):
    try:
        base64.b64decode(s,validate=False).decode('utf-8'); ok=1
    except Exception: ok=0
print(ok)
PY
); [ "$c7" -eq 0 ] && echo "C7 base64-encoded body: 0 PASS" || { echo "C7 base64-encoded body: 1 FAIL"; fail=1; }
[ $fail -eq 0 ] && echo "TASK CHECK: PASS" || echo "TASK CHECK: FAIL"
