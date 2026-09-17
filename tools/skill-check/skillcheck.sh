#!/bin/bash
# Frozen 2026-09-17 before the skills round. Independent content check for ONE file under skills/.
# Usage: skillcheck.sh <file> [<repo-root>]  -> prints C1..C6 and TASK CHECK: PASS|FAIL. Geometry is never consulted.
f=$1; root=${2:-.}; fail=0
c1=$(grep -c $'\xc3\xa2\|\xef\xbf\xbd' "$f"); [ "$c1" -eq 0 ] && echo "C1 mojibake/replacement bytes: 0 PASS" || { echo "C1 mojibake/replacement bytes: $c1 FAIL"; fail=1; }
c2=$(grep '^## ' "$f" | sort | uniq -d | wc -l); [ "$c2" -eq 0 ] && echo "C2 duplicate H2 headings: 0 PASS" || { echo "C2 duplicate H2 headings: $c2 FAIL"; fail=1; }
c3=$(grep -c 'TBD per file context\|TODO: refine per file context' "$f"); [ "$c3" -eq 0 ] && echo "C3 placeholder TODO lines: 0 PASS" || { echo "C3 placeholder TODO lines: $c3 FAIL"; fail=1; }
if [[ "$f" == *SKILL.md ]]; then
  c4=$(python3 - "$f" <<'PY'
import sys,re
s=open(sys.argv[1],encoding='utf-8',errors='replace').read()
bad=[]
m=re.match(r'^---\n(.*?)\n---\n',s,re.S)
if not m: bad.append('no closed frontmatter')
else:
    fm=m.group(1)
    def field(k):
        mm=re.search(r'^'+k+r':[ \t]*(.*)$',fm,re.M)
        if not mm: return None
        v=mm.group(1).strip()
        if v in ('>-','>','|','|-'):
            lines=[]
            for ln in fm[mm.end():].split('\n')[1:]:
                if ln.startswith('  ') or ln=='' : lines.append(ln.strip())
                else: break
            return ' '.join(x for x in lines if x)
        if len(v)>=2 and v[0]==v[-1] and v[0] in '"\'': v=v[1:-1]
        return v
    n=field('name'); desc=field('description')
    if not isinstance(n,str) or not re.fullmatch(r'[a-z0-9-]{1,64}',n): bad.append('name')
    if not isinstance(desc,str) or not (1<=len(desc)<=1024): bad.append('description length %s'%(len(desc) if isinstance(desc,str) else None))
    elif '<' in desc or '>' in desc: bad.append('description angle brackets')
print(len(bad), ';'.join(bad))
PY
); n4=${c4%% *}; [ "$n4" -eq 0 ] && echo "C4 frontmatter spec: 0 PASS" || { echo "C4 frontmatter spec: $c4 FAIL"; fail=1; }
else echo "C4 frontmatter spec: n/a (not SKILL.md)"; fi
c5=$(grep -c 'This document applies least-privilege hardening\|This document integrates with the yubiOS declarative-policy substrate\|This document supports the yubiOS continuous-monitoring layer\|This document participates in the yubiOS root-of-trust chain\|This skill applies least-privilege hardening\|This skill integrates with the yubiOS declarative-policy substrate\|This skill supports the yubiOS continuous-monitoring layer\|This skill participates in the yubiOS root-of-trust chain' "$f"); [ "$c5" -eq 0 ] && echo "C5 template capability claims: 0 PASS" || { echo "C5 template capability claims: $c5 FAIL"; fail=1; }
c6=0; d=$(dirname "$f"); for p in $(grep -o '](\./[^)#]*\|](scripts/[^)#]*\|](references/[^)#]*\|](assets/[^)#]*' "$f" | sed 's/^](//' | sort -u); do [ -e "$d/$p" ] || { echo "  unresolved local link: $p"; c6=$((c6+1)); }; done; [ "$c6" -eq 0 ] && echo "C6 unresolved local links: 0 PASS" || { echo "C6 unresolved local links: $c6 FAIL"; fail=1; }
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
# C7 added 2026-09-17 after the skills round (362 reference/script files under skills/ were committed base64-encoded).
[ $fail -eq 0 ] && echo "TASK CHECK: PASS" || echo "TASK CHECK: FAIL"
