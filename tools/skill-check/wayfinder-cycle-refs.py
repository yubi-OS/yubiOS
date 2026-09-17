#!/usr/bin/env python3
# One wayfinder cycle on the refs/ corpus, round 5. Geometry picks the target; the frozen check decides.
# Adapted from tools/skill-check/wayfinder-cycle.py (skills round 1) for refs/ + 100-cycle budget.
import json,sys,os,subprocess,base64,hashlib,urllib.request,time,re
sys.path.insert(0,os.path.dirname(__file__)); from fixer import fix
B='https://steady-orbit.systems-a.workers.dev'; GH='https://api.github.com'; R='/repos/yubi-OS/yubiOS'
ROOT=os.environ.get('WAYFINDER_CORPUS_ROOT','.')
HERE=os.path.dirname(__file__)
STATE=os.environ.get('WAYFINDER_STATE',os.path.join(HERE,'state-refs-round5.json'))
CHECK=os.environ.get('WAYFINDER_CHECK',os.path.join(HERE,'taskcheck_refs.sh'))
ROUND=os.environ.get('WAYFINDER_ROUND','refs round 5')
BRANCH=os.environ.get('WAYFINDER_BRANCH','wayfinder-refs-round5-2026-09-17')
st=json.load(open(STATE))
def api(m,p,b=None,base=B):
    out=(0,{})
    for attempt in range(4):
        req=urllib.request.Request(base+p,method=m,data=json.dumps(b).encode() if b is not None else None,headers={'content-type':'application/json','User-Agent':'sauna-pm','Accept':'application/vnd.github+json'})
        try:
            with urllib.request.urlopen(req,timeout=600) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            try: out=e.code,json.loads(e.read())
            except Exception: out=e.code,{}
            if e.code>=500 and attempt<3: time.sleep(5*(attempt+1)); continue
            return out
        except Exception:
            if attempt<3: time.sleep(5*(attempt+1)); continue
            return out
def check(path):
    out=subprocess.run([CHECK,path,ROOT],capture_output=True,text=True).stdout
    return ('TASK CHECK: PASS' in out), out
def corpus():
    names=json.load(open(os.path.join(HERE,'baseline_names.json'))); texts=[]
    for p in names: texts.append(open(os.path.join(ROOT,p),encoding='utf-8',errors='surrogateescape').read())
    return names,texts
cyc=len(st['cycles'])+1
if cyc>st.get('max_cycles',100): print('ROUND COMPLETE'); sys.exit(2)
print(f'=== cycle {cyc}/{st["max_cycles"]} baseline map {st["latest"]} ===')
s,m=api('GET',f'/api/maps/{st["latest"]}'); rungs=(m.get('ladder_candidates') or {}).get('rungs',[]) if s==200 else []
if s!=200: rungs=[]
print('rungs:',[(r.get('rung'),r.get('action'),(r.get('name') or '-'),r.get('sector'),(r.get('delta') or {}).get('isolated_delta')) for r in rungs])
target=None; via=None
for r in rungs:
    if r.get('action')=='add':
        key=f"add:{r.get('sector')}"
        if key not in st['declined_adds']:
            s2,o=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'add','name':f"refs/wayfinder-refs-round5-add-sector{r.get('sector')}-2026-09-17.md"},'predicted_delta':(r.get('delta') or {}).get('isolated_delta'),'task_check':{'verdict':'declined','verifier':'refs-round-5 policy: no synthetic refs docs','notes':f"ADD rung {r.get('rung')} sector {r.get('sector')} declined by policy: the round fixes real defects in existing refs/ documents and does not author synthetic files to occupy a sector (AGENT.md lesson 9). Hypothesis: {(r.get('hypothesis') or '')[:400]}"}})
            st['declined_adds'].append(key); print(' declined add rung',r.get('rung'),'row',(o or {}).get('id'))
        continue
    if r.get('name') in st['touched']: continue
    target=r; via='rung'; break
if not target:
    # ladder exhausted: fall back to the exemplars the rungs name, in ladder order
    for r in rungs:
        for ex in (r.get('exemplars') or []):
            if ex in st['touched'] or not ex.endswith('.md'): continue
            target={'rung':str(r.get('rung'))+'-exemplar','action':'change','name':ex,'sector':r.get('sector'),'flip_bit':None,'atom_delta':None,'delta':{'isolated_delta':None},'hypothesis':f"exemplar named by rung {r.get('rung')} (sector {r.get('sector')}): {(r.get('hypothesis') or '')}"}
            via='exemplar'; break
        if target: break
if not target:
    # full sweep pool: every doc not yet visited this round, ladder order abandoned, predicted_delta null
    names=json.load(open(os.path.join(HERE,'baseline_names.json')))
    for nm in names:
        if nm not in st['touched']:
            target={'rung':'sweep-pool','action':'change','name':nm,'sector':None,'flip_bit':None,'atom_delta':None,'delta':{'isolated_delta':None},'hypothesis':'sweep-pool fallback after ladder+exemplar exhaustion: deterministic fixer pass over unvisited refs/ docs, no geometric prediction (predicted_delta null)'}
            via='sweep'; break
if not target:
    if st.get('passes',1)==1:
        st['passes']=2; st['touched']=[]; json.dump(st,open(STATE,'w'),indent=1)
        print('ladder+exemplar exhausted: pass 2 begins (sweep pool over all docs; kept files will abstain, declined files retry with the improved fixer)')
        for nm in json.load(open(os.path.join(HERE,'baseline_names.json'))):
            if nm not in st['touched']:
                target={'rung':'sweep-pool-pass2','action':'change','name':nm,'sector':None,'flip_bit':None,'atom_delta':None,'delta':{'isolated_delta':None},'hypothesis':'pass-2 sweep-pool fallback: deterministic fixer pass over all refs/ docs, no geometric prediction (predicted_delta null)'}
                via='sweep'; break
    if not target:
        st['cycles'].append({'cycle':cyc,'result':'no-untouched-target'}); json.dump(st,open(STATE,'w'),indent=1); print('NO TARGET — round exhausted every document'); sys.exit(0)
name=target['name']; pred=(target.get('delta') or {}).get('isolated_delta'); fp=os.path.join(ROOT,name)
st['touched'].append(name)
verifier='taskcheck_refs.sh C1-C7 frozen 2026-09-17 before refs round 5'
notes=f"pre-registered from map {st['latest']} rung {target.get('rung')} (sector {target.get('sector')}, flip_bit {target.get('flip_bit')}, atom_delta {target.get('atom_delta')}). Frozen check: taskcheck_refs.sh C1-C7 (mojibake, duplicate H2, placeholder TODO, template capability paragraphs, unresolved local/repo links, base64 body). Hypothesis: {(target.get('hypothesis') or '')[:500]}"
s,ol=api('GET',f'/api/outcomes?baseline_id={st["latest"]}')
olrows=(ol.get('rows') or []) if s==200 else []
dups=[r2['id'] for r2 in olrows if (r2.get('target') or {}).get('name')==name and (r2.get('task_check') or {}).get('verdict')=='pending']
if dups:
    rowA=min(dups); dups=[d for d in dups if d!=rowA]; print('reusing pending row',rowA,'superseding duplicates',dups)
else:
    s,row=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'task_check':{'verdict':'pending','verifier':verifier,'notes':notes}})
    rowA=(row or {}).get('id')
print('target',name,'via',via,'pred',pred,'pending row',rowA)
before_ok,before_out=check(fp); print('check BEFORE:',before_out.replace('\n',' | '))
rec={'cycle':cyc,'via':via,'baseline':st['latest'],'target':name,'rung':target.get('rung'),'sector':target.get('sector'),'predicted':pred,'row_pending':rowA,'check_before':before_out}
if before_ok:
    s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'supersedes':rowA,'task_check':{'verdict':'abstained','verifier':verifier,'notes':'target passes every frozen check; no defect to state, so no edit is made and nothing is committed. Geometry alone does not authorize an edit.'}})
    rec.update({'result':'abstained','row_verdict':(v or {}).get('id')}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('ABSTAINED row',(v or {}).get('id')); sys.exit(0)
orig=open(fp,encoding='utf-8',errors='surrogateescape').read(); fixed,log=fix(orig,name)
open(fp,'w',encoding='utf-8').write(fixed); after_ok,after_out=check(fp); print('fix log:',log); print('check AFTER:',after_out.replace('\n',' | '))
if not after_ok or fixed==orig:
    open(fp,'w',encoding='utf-8',errors='surrogateescape').write(orig)
    s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'supersedes':rowA,'task_check':{'verdict':'declined','verifier':verifier,'notes':'the deterministic fixer could not bring the file to PASS without judgment edits; reverted, nothing committed. After: '+after_out.replace('\n',' | ')[:600]}})
    rec.update({'result':'declined-fixer-insufficient','row_verdict':(v or {}).get('id'),'check_after':after_out}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('DECLINED'); sys.exit(0)
# commit to held branch
s,c=api('GET',R+f'/git/commits/{st["branch_sha"]}',base=GH)
s,b=api('POST',R+'/git/blobs',{'content':base64.b64encode(fixed.encode('utf-8')).decode(),'encoding':'base64'},base=GH)
s,t=api('POST',R+'/git/trees',{'base_tree':c['tree']['sha'],'tree':[{'path':name,'mode':'100644','type':'blob','sha':b['sha']}]},base=GH)
msg=f"refs: wayfinder {ROUND} cycle {cyc} — {name.split('/')[-1]}: {'; '.join(log)}\n\nPre-registered (map {st['latest']} rung {target.get('rung')}, predicted isolated delta {pred}, outcomes row {rowA}).\nFrozen check taskcheck_refs.sh C1-C7: FAIL before, PASS after. Geometry measured separately; it did not decide this edit.\nBefore: {before_out.strip().replace(chr(10),' | ')}"
s,cm=api('POST',R+'/git/commits',{'message':msg,'tree':t['sha'],'parents':[st['branch_sha']]},base=GH)
s,ref=api('PATCH',R+f"/git/refs/heads/{BRANCH}",{'sha':cm['sha']},base=GH); st['branch_sha']=cm['sha']; print('commit',cm['sha'][:12])
# after-map on the chained frozen frame
names,texts=corpus(); t0=time.time()
s,am=api('POST','/api/map',{'texts':texts,'names':names,'labels':names,'baseline_id':st['latest']})
if s!=200:
    print('AFTER-MAP FAILED',s,json.dumps(am)[:400]); rec.update({'result':'committed-but-aftermap-failed','commit':cm['sha'],'aftermap_error':am}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); sys.exit(1)
cmp=am.get('comparison') or {}; ml=am.get('math_ledger') or {}; obs=(ml.get('measurement') or {}).get('actual_delta')
per=next((x for x in cmp.get('per_name',[]) if x['name']==name),{})
print(f"after map {am['id']} isolated {am['map']['isolated']} delta {cmp.get('isolated_delta')} changed {cmp.get('changed_names')} bits {per.get('bits_changed')} disp {round(per.get('displacement_geodesic',0) or 0,4)} qsilent {per.get('quantization_silent')} anchors {cmp.get('unchanged_anchors')} ledger {obs} {round(time.time()-t0,1)}s")
s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'after_id':am['id'],'supersedes':rowA,'task_check':{'verdict':'kept','verifier':verifier+' rerun unchanged on the committed file','notes':f"Defects before: {before_out.strip().replace(chr(10),' | ')[:500]}. Fix: {'; '.join(log)[:400]}. After: PASS. Commit {cm['sha'][:12]} on held branch {BRANCH}. Geometry (recorded, not decisive): isolated {m.get('map',{}).get('isolated', m.get('isolated'))} -> {am['map']['isolated']}, bits_changed {per.get('bits_changed')}, geodesic {round(per.get('displacement_geodesic',0) or 0,4)}, quantization_silent {per.get('quantization_silent')}."[:2000]}})
print('verdict row',(v or {}).get('id'),'observed',(v or {}).get('entry',{}).get('observed_delta'),'sign_exact',(v or {}).get('entry',{}).get('sign_exact'),(v or {}).get('error',{}).get('message',''))
rec.update({'result':'kept','fix_log':log,'check_after':after_out,'commit':cm['sha'],'after_map':am['id'],'isolated_before':(m.get('map') or {}).get('isolated',m.get('isolated')),'isolated_after':am['map']['isolated'],'observed_delta':obs,'bits_changed':per.get('bits_changed'),'displacement':per.get('displacement_geodesic'),'quantization_silent':per.get('quantization_silent'),'row_verdict':(v or {}).get('id'),'sign_exact':(v or {}).get('entry',{}).get('sign_exact'),'bytes_before':len(orig.encode()),'bytes_after':len(fixed.encode())})
st['latest']=am['id']; st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('CYCLE DONE')
