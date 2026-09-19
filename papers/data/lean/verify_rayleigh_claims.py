#!/usr/bin/env python3
"""Measurement-side companion to RayleighBounds.lean (rayleigh/1). Stdlib only.

Resolves, on the shipped fixtures and on seeded random graphs, the claims the Lean
file deliberately does NOT make:
  M1 quad(1_S) == cut(S) numerically on 200 seeded random graphs (identity check of the runtime formula)
  M2 the exact rational witness R = n*cut/(k*(n-k)) upper-bounds a power-iteration Fiedler estimate
     on the largest component of every fixture map (tools/point-map/fixtures/map66..76.json)
  M3 BFS component count == nullity(L) computed exactly with Fraction Gaussian elimination
     (the identity Lean states but does not prove), on fixtures with N <= 200 and on random graphs
  M4 the isolated count from degree-0 vertices equals the fixture's stored `isolated`
Exit 1 on any FAIL. PASS here means the runtime formulas agree with exact arithmetic; it does not
elevate lambda_2 to a theorem or say anything about document quality.
"""
import json, math, random, sys, glob
from fractions import Fraction
R0 = 0.095
def chord(a, b): return math.sqrt(sum((a[k]-b[k])**2 for k in range(3)))
def graph(pts, r=R0):
    n=len(pts); adj=[[] for _ in range(n)]; edges=[]
    for i in range(n):
        for j in range(i+1,n):
            if chord(pts[i],pts[j])<r: adj[i].append(j); adj[j].append(i); edges.append((i,j))
    return adj, edges
def components(adj):
    n=len(adj); comp=[-1]*n; sizes=[]
    for s in range(n):
        if comp[s]>=0: continue
        cid=len(sizes); st=[s]; comp[s]=cid; sz=0
        while st:
            v=st.pop(); sz+=1
            for w in adj[v]:
                if comp[w]<0: comp[w]=cid; st.append(w)
        sizes.append(sz)
    return comp, sizes
def nullity(adj):
    n=len(adj); L=[[Fraction(0)]*n for _ in range(n)]
    for i in range(n):
        L[i][i]=Fraction(len(adj[i]))
        for j in adj[i]: L[i][j]=Fraction(-1)
    rank=0; rows=L
    for c in range(n):
        piv=next((r for r in range(rank,n) if rows[r][c]!=0),None)
        if piv is None: continue
        rows[rank],rows[piv]=rows[piv],rows[rank]
        pv=rows[rank][c]
        for r in range(n):
            if r!=rank and rows[r][c]!=0:
                f=rows[r][c]/pv; rows[r]=[a-f*b for a,b in zip(rows[r],rows[rank])]
        rank+=1
    return n-rank
def quad(edges,x): return sum((x[i]-x[j])**2 for i,j in edges)
def cut(edges,S): return sum(1 for i,j in edges if (i in S)!=(j in S))
def fiedler(adj, verts, iters=600):
    m=len(verts); idx={v:i for i,v in enumerate(verts)}; deg=[sum(1 for w in adj[v] if w in idx) for v in verts]; shift=2*max(deg)+1
    rnd=random.Random(20260918); x=[rnd.random()-0.5 for _ in range(m)]
    def proj(v): mu=sum(v)/m; return [t-mu for t in v]
    x=proj(x); nx=math.sqrt(sum(t*t for t in x)); x=[t/nx for t in x]
    for _ in range(iters):
        y=[(shift-deg[i])*x[i]+sum(x[idx[w]] for w in adj[verts[i]] if w in idx) for i in range(m)]
        y=proj(y); ny=math.sqrt(sum(t*t for t in y)); x=[t/ny for t in y]
    num=sum((x[idx[a]]-x[idx[b]])**2 for a in verts for b in adj[a] if b in idx)/2
    return num/sum(t*t for t in x), x
fails=[]; report=[]
# M1
rnd=random.Random(7)
for t in range(200):
    n=rnd.randint(3,25); edges=[(i,j) for i in range(n) for j in range(i+1,n) if rnd.random()<0.3]; S=set(v for v in range(n) if rnd.random()<0.5)
    ind=[1 if v in S else 0 for v in range(n)]
    if quad(edges,ind)!=cut(edges,S): fails.append(f"M1 quad!=cut at trial {t}")
report.append("M1 quad(1_S)==cut(S): 200/200 random graphs")
# M2..M4 fixtures
fixtures=sorted(glob.glob("tools/point-map/fixtures/map*.json"))
for f in fixtures:
    m=json.load(open(f)); pts=m["pts_full"]; adj,edges=graph(pts); comp,sizes=components(adj)
    iso=sum(1 for a in adj if not a)
    if "isolated" in m and iso!=m["isolated"]: fails.append(f"M4 {f}: degree-0 count {iso} != stored isolated {m['isolated']}")
    lid=sizes.index(max(sizes)); verts=[i for i,c in enumerate(comp) if c==lid]
    if len(verts)>=2:
        lam,x=fiedler(adj,verts); S=set(verts[i] for i in range(len(verts)) if x[i]>=0); k=len(S); nn=len(verts)
        sub=[(a,b) for a,b in edges if comp[a]==lid and comp[b]==lid]
        if 0<k<nn:
            R=Fraction(nn*cut(sub,S),k*(nn-k))
            if lam>float(R)+1e-7: fails.append(f"M2 {f}: lambda2 {lam:.6f} > witness {float(R):.6f}")
            report.append(f"M2 {f}: N={len(pts)} comps={len(sizes)} iso={iso} largest={nn} lambda2={lam:.5f} witness={R} ok")
    if len(pts)<=200:
        nl=nullity(adj)
        if nl!=len(sizes): fails.append(f"M3 {f}: nullity {nl} != components {len(sizes)}")
        else: report.append(f"M3 {f}: nullity(L)={nl}==components (exact Fraction rank)")
rnd=random.Random(11)
for t in range(30):
    n=rnd.randint(4,30); adj=[[] for _ in range(n)]
    for i in range(n):
        for j in range(i+1,n):
            if rnd.random()<0.15: adj[i].append(j); adj[j].append(i)
    if nullity(adj)!=len(components(adj)[1]): fails.append(f"M3 random trial {t}")
report.append("M3 nullity==components: 30/30 random graphs")
print("\n".join(report))
if fails:
    print("FAIL"); print("\n".join(fails)); sys.exit(1)
print("RAYLEIGH_MEASUREMENTS_OK", len(report), "checks; PASS means runtime formulas agree with exact arithmetic, nothing more")
