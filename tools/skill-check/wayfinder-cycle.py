#!/usr/bin/env python3
# One wayfinder cycle on the skills/ corpus. Geometry picks the target; the frozen check decides.
import json,sys,os,subprocess,base64,hashlib,urllib.request,time,re
sys.path.insert(0,os.path.dirname(__file__)); from fixer import fix
B='https://steady-orbit.systems-a.workers.dev'; GH='https://api.github.com'; R='/repos/yubi-OS/yubiOS'
ROOT=os.environ.get('WAYFINDER_CORPUS_ROOT','.'); STATE=os.environ.get('WAYFINDER_STATE',os.path.join(os.path.dirname(__file__),'state.json')); CHECK=os.path.join(os.path.dirname(__file__),'skillcheck.sh')
st=json.load(open(STATE))
def api(m,p,b=None,base=B):
    req=urllib.request.Request(base+p,method=m,data=json.dumps(b).encode() if b is not None else None,headers={'content-type':'application/json','User-Agent':'sauna-pm','Accept':'application/vnd.github+json'})
    try:
        with urllib.request.urlopen(req,timeout=600) as r: return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read())
        except Exception: return e.code,{}
def check(path):
    out=subprocess.run([CHECK,path,ROOT],capture_output=True,text=True).stdout
    return ('TASK CHECK: PASS' in out), out
def corpus():
    names=json.load(open(os.path.join(os.path.dirname(__file__),'baseline_names.json'))); texts=[]
    for p in names: texts.append(open(os.path.join(ROOT,p),encoding='utf-8',errors='surrogateescape').read())
    return names,texts
cyc=len(st['cycles'])+1; print(f'=== cycle {cyc} baseline map {st["latest"]} ===')
s,m=api('GET',f'/api/maps/{st["latest"]}'); rungs=m.get('ladder_candidates',{}).get('rungs',[])
print('rungs:',[(r['rung'],r['action'],(r.get('name') or '-').replace('skills/',''),r['sector'],r['delta']['isolated_delta']) for r in rungs])
target=None; via=None
for r in rungs:
    if r['action']=='add':
        key=f"add:{r['sector']}"
        if key not in st['declined_adds']:
            s2,o=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'add','name':f"skills/wayfinder-skills-round1-add-sector{r['sector']}-2026-09-17/SKILL.md"},'predicted_delta':r['delta']['isolated_delta'],'task_check':{'verdict':'declined','verifier':'skills-round policy: no fabricated skill files','notes':f"ADD rung {r['rung']} sector {r['sector']} declined by policy: the round edits real defects in existing skills and does not author synthetic skills to move geometry. Hypothesis: {r.get('hypothesis','')[:400]}"}})
            st['declined_adds'].append(key); print(' declined add rung',r['rung'],'row',o.get('id'))
        continue
    if r['name'] in st['touched']: continue
    target=r; via='rung'; break
if not target:
    # ladder exhausted under this generator: fall back to the exemplars the rungs name, in ladder order
    for r in rungs:
        for ex in r.get('exemplars',[]) or []:
            if ex in st['touched'] or not ex.endswith('.md'): continue
            target={'rung':r['rung']+'-exemplar','action':'change','name':ex,'sector':r['sector'],'flip_bit':None,'atom_delta':None,'delta':{'isolated_delta':None},'hypothesis':f"exemplar named by rung {r['rung']} (sector {r['sector']}): {r.get('hypothesis','')}"}; via='exemplar'; break
        if target: break
if not target:
    st['cycles'].append({'cycle':cyc,'result':'no-untouched-change-rung'}); json.dump(st,open(STATE,'w'),indent=1); print('NO TARGET'); sys.exit(0)
name=target['name']; pred=target['delta']['isolated_delta']; fp=os.path.join(ROOT,name)
st['touched'].append(name)
notes=f"pre-registered from map {st['latest']} rung {target['rung']} (sector {target['sector']}, flip_bit {target.get('flip_bit')}, atom_delta {target.get('atom_delta')}). Frozen check: skillcheck.sh C1-C6 (mojibake, duplicate H2, TODO placeholders, frontmatter spec name/description<=1024/no angle brackets/closed, template capability paragraphs, local links). Hypothesis: {target.get('hypothesis','')[:500]}"
s,row=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'task_check':{'verdict':'pending','verifier':'skillcheck.sh C1-C6 frozen 2026-09-17 before the round','notes':notes}})
rowA=row.get('id'); print('target',name,'via',via,'pred',pred,'pending row',rowA)
before_ok,before_out=check(fp); print('check BEFORE:',before_out.replace('\n',' | '))
rec={'cycle':cyc,'via':via,'baseline':st['latest'],'target':name,'rung':target['rung'],'sector':target['sector'],'predicted':pred,'row_pending':rowA,'check_before':before_out}
if before_ok:
    s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'supersedes':rowA,'task_check':{'verdict':'abstained','verifier':'skillcheck.sh C1-C6 frozen 2026-09-17 before the round','notes':'target passes every frozen check; no defect to state, so no edit is made and nothing is committed. Geometry alone does not authorize an edit.'}})
    rec.update({'result':'abstained','row_verdict':v.get('id')}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('ABSTAINED row',v.get('id')); sys.exit(0)
orig=open(fp,encoding='utf-8',errors='surrogateescape').read(); fixed,log=fix(orig,name)
open(fp,'w',encoding='utf-8').write(fixed); after_ok,after_out=check(fp); print('fix log:',log); print('check AFTER:',after_out.replace('\n',' | '))
if not after_ok or fixed==orig:
    open(fp,'w',encoding='utf-8',errors='surrogateescape').write(orig)
    s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'supersedes':rowA,'task_check':{'verdict':'declined','verifier':'skillcheck.sh C1-C6 frozen 2026-09-17 before the round','notes':'the deterministic fixer could not bring the file to PASS without judgment edits; reverted, nothing committed. After: '+after_out.replace('\n',' | ')[:600]}})
    rec.update({'result':'declined-fixer-insufficient','row_verdict':v.get('id'),'check_after':after_out}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('DECLINED'); sys.exit(0)
# commit to held branch
s,c=api('GET',R+f'/git/commits/{st["branch_sha"]}',base=GH)
s,b=api('POST',R+'/git/blobs',{'content':base64.b64encode(fixed.encode('utf-8')).decode(),'encoding':'base64'},base=GH)
s,t=api('POST',R+'/git/trees',{'base_tree':c['tree']['sha'],'tree':[{'path':name,'mode':'100644','type':'blob','sha':b['sha']}]},base=GH)
msg=f"skills: wayfinder skills round 1 cycle {cyc} — {name.split('/')[1]}: {'; '.join(log)}\n\nPre-registered (map {st['latest']} rung {target['rung']}, predicted isolated delta {pred}, outcomes row {rowA}).\nFrozen check skillcheck.sh C1-C6: FAIL before, PASS after. Geometry measured separately; it did not decide this edit.\nBefore: {before_out.strip().replace(chr(10),' | ')}"
s,cm=api('POST',R+'/git/commits',{'message':msg,'tree':t['sha'],'parents':[st['branch_sha']]},base=GH)
s,ref=api('PATCH',R+f"/git/refs/heads/{st['branch']}",{'sha':cm['sha']},base=GH); st['branch_sha']=cm['sha']; print('commit',cm['sha'][:12])
# after-map on the chained frozen frame
names,texts=corpus(); t0=time.time()
s,am=api('POST','/api/map',{'texts':texts,'names':names,'labels':names,'baseline_id':st['latest']})
if s!=200:
    print('AFTER-MAP FAILED',s,json.dumps(am)[:400]); rec.update({'result':'committed-but-aftermap-failed','commit':cm['sha'],'aftermap_error':am}); st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); sys.exit(1)
cmp=am.get('comparison') or {}; ml=am.get('math_ledger') or {}; obs=(ml.get('measurement') or {}).get('actual_delta')
per=next((x for x in cmp.get('per_name',[]) if x['name']==name),{})
print(f"after map {am['id']} isolated {am['map']['isolated']} delta {cmp.get('isolated_delta')} changed {cmp.get('changed_names')} bits {per.get('bits_changed')} disp {round(per.get('displacement_geodesic',0) or 0,4)} qsilent {per.get('quantization_silent')} anchors {cmp.get('unchanged_anchors')} ledger {obs} {round(time.time()-t0,1)}s")
s,v=api('POST','/api/outcomes',{'baseline_id':st['latest'],'target':{'action':'change','name':name},'predicted_delta':pred,'after_id':am['id'],'supersedes':rowA,'task_check':{'verdict':'kept','verifier':'skillcheck.sh C1-C6 rerun unchanged on the committed file','notes':f"Defects before: {before_out.strip().replace(chr(10),' | ')[:500]}. Fix: {'; '.join(log)[:400]}. After: PASS. Commit {cm['sha'][:12]} on held branch {st['branch']}. Geometry (recorded, not decisive): isolated {m.get('isolated')} -> {am['map']['isolated']}, bits_changed {per.get('bits_changed')}, geodesic {round(per.get('displacement_geodesic',0) or 0,4)}, quantization_silent {per.get('quantization_silent')}."[:2000]}})
print('verdict row',v.get('id'),'observed',v.get('entry',{}).get('observed_delta'),'sign_exact',v.get('entry',{}).get('sign_exact'),v.get('error',{}).get('message',''))
rec.update({'result':'kept','fix_log':log,'check_after':after_out,'commit':cm['sha'],'after_map':am['id'],'isolated_before':m.get('isolated'),'isolated_after':am['map']['isolated'],'observed_delta':obs,'bits_changed':per.get('bits_changed'),'displacement':per.get('displacement_geodesic'),'quantization_silent':per.get('quantization_silent'),'row_verdict':v.get('id'),'sign_exact':v.get('entry',{}).get('sign_exact'),'bytes_before':len(orig.encode()),'bytes_after':len(fixed.encode())})
st['latest']=am['id']; st['cycles'].append(rec); json.dump(st,open(STATE,'w'),indent=1); print('CYCLE DONE')
