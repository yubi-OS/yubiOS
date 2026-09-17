import re,base64,sys
TEMPLATE_STARTS=["This document applies least-privilege hardening","This document integrates with the yubiOS declarative-policy substrate","This document supports the yubiOS continuous-monitoring layer","This document participates in the yubiOS root-of-trust chain","This skill applies least-privilege hardening","This skill integrates with the yubiOS declarative-policy substrate","This skill supports the yubiOS continuous-monitoring layer","This skill participates in the yubiOS root-of-trust chain"]
MOJI={'â\x80\x99':'’','â\x80\x98':'‘','â\x80\x9c':'“','â\x80\x9d':'”','â\x80\x94':'—','â\x80\x93':'–','â\x80\xa6':'…','Ã©':'é','Ã¨':'è','Ã¡':'á','Ã¶':'ö','Ã¼':'ü','Ã±':'ñ','Â\xa0':' ','Â ':' ','\ufffd':''}
def fix(text, path):
    log=[]
    # C4a: whole file base64-encoded
    s=text
    if re.fullmatch(r'[A-Za-z0-9+/=\s]+',s.strip()) and len(s.strip())>40:
        try:
            dec=base64.b64decode(s.strip(),validate=False).decode('utf-8')
            if dec.startswith('---'): s=dec; log.append('C4 decoded base64-encoded file body (%d -> %d chars)'%(len(text),len(s)))
        except Exception: pass
    # C1 mojibake
    n=0
    for a,b in MOJI.items():
        c=s.count(a)
        if c: s=s.replace(a,b); n+=c
    if n: log.append('C1 replaced %d mojibake sequences'%n)
    # C4b/c frontmatter description
    m=re.match(r'^---\n(.*?)\n---\n',s,re.S)
    if m and path.endswith('SKILL.md'):
        fm=m.group(1); rest=s[m.end():]
        dm=re.search(r'^description:[ \t]*(.*)$',fm,re.M)
        if dm:
            v=dm.group(1).strip(); block_end=dm.end()
            if v in ('>-','>','|','|-'):
                lines=[]; tail=fm[dm.end():].split('\n'); i=1
                while i<len(tail) and (tail[i].startswith('  ') or tail[i]==''): lines.append(tail[i].strip()); i+=1
                desc=' '.join(x for x in lines if x); block_end=dm.end()+sum(len(t)+1 for t in tail[:i])-1 if i>1 else dm.end()
            else:
                desc=v[1:-1] if len(v)>=2 and v[0]==v[-1] and v[0] in '"\'' else v
            newdesc=desc; moved=None
            if '<' in newdesc or '>' in newdesc:
                newdesc=re.sub(r'<([^<>]*)>',r'\1',newdesc).replace('<','').replace('>',''); log.append('C4 removed angle brackets from description')
            if len(newdesc)>1024:
                sents=re.split(r'(?<=[.!?])\s+',newdesc); keep=[]; total=0
                for st in sents:
                    if total+len(st)+1>1000: break
                    keep.append(st); total+=len(st)+1
                if not keep: keep=[newdesc[:1000]]; movedtxt=newdesc[1000:]
                else: movedtxt=' '.join(sents[len(keep):])
                newdesc=' '.join(keep).strip(); moved=movedtxt.strip(); log.append('C4 description %d -> %d chars; %d chars moved to body'%(len(desc),len(newdesc),len(moved)))
            if newdesc!=desc:
                yaml_desc='description: >-\n'+'\n'.join('  '+ln for ln in _wrap(newdesc,96))
                fm=fm[:dm.start()]+yaml_desc+fm[block_end:]
                if moved:
                    h1=re.search(r'^# .*$',rest,re.M)
                    ins='\n\n## Extended description\n\nMoved out of the frontmatter on 2026-09-17 so `description` fits the 1,024-character skill-format limit; wording unchanged.\n\n'+moved+'\n'
                    if h1: rest=rest[:h1.end()]+ins+rest[h1.end():]
                    else: rest=ins+rest
                s='---\n'+fm+'\n---\n'+rest
    # sections
    parts=re.split(r'(?m)^(?=## )',s)
    head=parts[0]; secs=parts[1:]
    # C3 placeholder blocks
    kept=[]; dropped=0
    for sec in secs:
        if 'TBD per file context' in sec or 'TODO: refine per file context' in sec: dropped+=1; continue
        kept.append(sec)
    if dropped: log.append('C3 dropped %d placeholder TODO section(s)'%dropped)
    # C5 template paragraphs
    c5=0; out=[]
    for sec in kept:
        paras=sec.split('\n\n'); newp=[]
        for p in paras:
            if any(p.strip().startswith(t) for t in TEMPLATE_STARTS):
                c5+=1; newp.append('Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.')
            else: newp.append(p)
        out.append('\n\n'.join(newp))
    if c5: log.append('C5 replaced %d template capability paragraph(s)'%c5)
    kept=out
    # C2 duplicate H2 merge
    seen={}; merged=[]; dups=0
    for sec in kept:
        hd=sec.split('\n',1)[0].strip(); body=sec.split('\n',1)[1] if '\n' in sec else ''
        if hd in seen:
            dups+=1; idx=seen[hd]
            if body.strip() and body.strip() not in merged[idx]:
                merged[idx]=merged[idx].rstrip('\n')+'\n\n'+body.strip()+'\n\n'
        else:
            seen[hd]=len(merged); merged.append(sec)
    if dups: log.append('C2 merged %d duplicate H2 section(s) into their first occurrence'%dups)
    s=head+''.join(merged)
    s=re.sub(r'\n{4,}','\n\n\n',s).rstrip('\n')+'\n'
    return s,log
def _wrap(t,w):
    words=t.split(); lines=[]; cur=''
    for wd in words:
        if cur and len(cur)+1+len(wd)>w: lines.append(cur); cur=wd
        else: cur=(cur+' '+wd).strip()
    if cur: lines.append(cur)
    return lines
if __name__=='__main__':
    p=sys.argv[1]; t=open(p,encoding='utf-8',errors='surrogateescape').read(); s,log=fix(t,p); open(sys.argv[2],'w',encoding='utf-8').write(s); print('\n'.join(log) or 'no change')
