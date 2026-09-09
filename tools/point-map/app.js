function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
const $=id=>document.getElementById(id);let last=null,lastId=null;
$("src").onchange=()=>{const v=$("src").value;$("input").style.display=v==="synthetic"?"none":"block";const tx=v==="texts";$("uploadbox").style.display=tx?"flex":"none";$("localonlywrap").style.display=v==="vectors"?"inline":"none";$("fileinfo").style.display="none";$("dirinfo").style.display="none";$("repoinfo").style.display="none";$("files").value="";$("dirs").value=""};

const GLOSSARY={
"pole":"rho* = the frozen frame's all-ones pole: the top of the Boolean lattice - every one of the frame's own d axes fully on. gap[i] is the geodesic/chord distance from item i to it on this frozen frame, not a count of absent dimensions. A reference direction of the designed rule, not a goal; it moves only if the frame is rebuilt.",
"frame_id":"Fingerprint of the entire frozen frame (input PCA + placement, full precision), aliased as rule_hash. Two maps are comparable (placed on the same coordinates) only if frame_id matches; compareMaps additionally requires instrument_id to match.",
"instrument_id":"Fingerprint of the run's numeric settings (version, d, threshold, seed, K, T, steps, D, preprocessing_id) - independent of the frame. compareMaps requires both frame_id and instrument_id to match between the two maps.",
"deltaV2z":"The real cloud's V2 minus the null mean, in standard deviations. Descriptive only - the null is empirical and finite, so this is not a Gaussian significance statement. The p-value is the exclusion test.",
"v2":"Trace-normalised variance share of the first two principal components (never exceeds 1). The gate-rank rhat = 2/V2 is a rank test on the coordinate, not evidence about the corpus.",
"measurement classes":"Distinct d-bit vectors in the cloud and the size of the largest - how much of the item space the rule actually distinguishes.",
"keys":"Identity layer (D6): the ordinal is the injective key; vector fingerprints are noncryptographic diagnostics; only ordinals are injective.",
"pairs unresolvable":"Items whose bit vectors are identical under the rule - the map cannot tell them apart by measurement; only names/hashes do.",
"phi(k)":"Measured free-energy ladder over Hamming shells k. The compass is a designed chain on this measured ladder.",
"hamming shells":"How many items sit at each Hamming weight k (number of bits on under the rule).",
"k / attempts":"K label-swap null draws, each attempting a fixed number of symmetric checkerboard-switch proposals; E0 +/- SD0 is the null's V2 band.",
"e0":"Mean and spread of the null's V2 over K draws - the band the real cloud's V2 is compared against.",
"verdict":"Exclusion-only language: a null is excluded (at this K's resolution) or not excluded, never confirmed.",
"stationary law":"Empirical distribution of the compass chain's Hamming weight - compared against the analytic pi_T(k).",
"pi_t(k)":"Boltzmann distribution over Hamming shells at temperature T - the analytic occupancy prediction the chain is checked against.",
"acceptance":"Metropolis acceptance rate of the compass chain at T.",
"t\u00d7":"Designed-chain temperature where its modal shell departs from full coverage.",
"steps":"Single Metropolis chain length. Initialization, burn-in and effective sample size remain diagnostics to check.",
"atoms":"Single-action atoms (Lean S1): the one bit whose flip moves each item geodesically closest to the frozen pole. Delta = geodesic gain.",
"pc12":"Share of variance in PC1+PC2 of the ORIGINAL input (not the frozen bit-frame). Null on a frozen frame - the gate_rank block is the frame-native rank test instead.",
"gate_rank":"Rank test on the trace-normalised V2 of the frozen bit-frame: rhat = 2/V2. A coordinate-geometry test, not evidence about the corpus.",
"semantic_status":"Explicitly 'unvalidated': sector numbers and the NSS axis-name lens are geometry only - no sector has been validated against any axis or task outcome.",
"task_verdict":"Whether the underlying task actually improved is NOT tested by this geometry and must be checked by a task-specific independent verifier. Always 'not-tested' here."
};
const gi=(k)=>{const lk=k.toLowerCase();for(const g in GLOSSARY)if(lk.includes(g.toLowerCase()))return ` <span class="gi" data-tip="${escapeHtml(GLOSSARY[g])}">i</span>`;return""};
function kv(id,o){$(id).innerHTML=Object.entries(o).map(([k,v])=>`<span class="dim">${escapeHtml(k)}${gi(k)}</span><span>${v}</span>`).join("")}

// ---- input collection: full text, one item per file, unique names, no silent skips ----
const nameSeen=new Map();
function uniqueName(n){if(nameSeen.has(n))throw new Error(`Duplicate name: ${n}. Use unique literal paths.`);nameSeen.set(n,true);return n;}
function renderInputErrors(errors){const el=$("inputerrors");if(!errors||!errors.length){el.style.display="none";el.innerHTML="";return}el.style.display="block";el.innerHTML=`<b>${errors.length} input item(s) rejected (reported, not silently skipped):</b><ul style="margin:4px 0 0;padding-left:18px">`+errors.map(e=>`<li>${escapeHtml(e)}</li>`).join("")+"</ul>"}
async function collectItems(){
  nameSeen.clear();
  const items=[],errors=[];
  const lines=$("input").value.split("\n").map(s=>s.trim()).filter(Boolean);
  lines.forEach((s,i)=>{items.push({text:s,label:s.slice(0,80),name:uniqueName(`line:${i}`)})});
  for(const f of $("files").files){
    const txt=await f.text();
    if(!txt.trim().length){errors.push(`file "${f.name}": ${txt.length} chars (empty) - not included`);continue}
    const nm=txt.match(/^name:\s*(.+)$/m);
    const label=nm?nm[1].trim():f.name.replace(/\.(md|markdown|txt)$/i,"");
    items.push({text:txt,label,name:uniqueName(f.name)})
  }
  for(const f of [...$("dirs").files].filter(f=>/\.(md|markdown|txt)$/i.test(f.name))){
    const rel=f.webkitRelativePath||f.name;
    const txt=await f.text();
    if(!txt.trim().length){errors.push(`folder file "${rel}": ${txt.length} chars (empty) - not included`);continue}
    items.push({text:txt,label:rel,name:uniqueName(rel)})
  }
  for(const it of repoItems){
    if(it.truncated)throw new Error(`Repository file truncated: ${it.label}; fetch its full content separately.`);
    const txt=it.text||"";
    if(!txt.trim().length){errors.push(`repo item "${it.label}": ${txt.length} chars (empty) - not included`);continue}
    items.push({text:txt,label:it.label,name:uniqueName(it.label)})
  }
  return {items,errors}
}

// ---- server call: strict - no fallback, no client-side reduce ----
async function postJSONStrict(u,body,tries=3){
  let r,txt;
  for(let a=1;a<=tries;a++){
    r=await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    txt=await r.text();
    if(r.status>=500&&a<tries){$("status").textContent=`server error (HTTP ${r.status}) - retry ${a}/${tries-1}...`;await new Promise(res=>setTimeout(res,1200*a));continue}
    break
  }
  let data;try{data=JSON.parse(txt)}catch(e){throw new Error(`HTTP ${r.status} - non-JSON response: ${txt.slice(0,160)}`)}
  if(!r.ok)throw new Error(data&&data.error?`HTTP ${r.status}: ${typeof data.error==="object"?data.error.message:data.error}`:`HTTP ${r.status}`);
  return data
}

let repoItems=[];
$("fetchrepo").onclick=async()=>{const repo=$("repo").value.trim();if(!repo)return;$("repoinfo").textContent="fetching...";$("repoinfo").style.display="inline";
  try{const parts=repo.replace(/^https?:\/\/github\.com\//,"").replace(/\.git$/,"").split("/").filter(Boolean);const sub=parts.length>2?parts.slice(2).join("/"):"";const j=await postJSONStrict("/api/repo-items",{repo:parts.slice(0,2).join("/"),subdir:sub});repoItems=j.items;$("repoinfo").textContent=`${j.n} items from ${j.repo}${j.subdir?"/"+j.subdir:""}`}catch(e){repoItems=[];$("repoinfo").textContent="error: "+e.message}};
$("files").onchange=()=>{const n=$("files").files.length;if(n){$("fileinfo").textContent=`${n} file(s) loaded`;$("fileinfo").style.display="inline"}};

function renderNSS(R){
  const L=R.ladder_candidates;const box=$("nssbox");
  if(!L){box.style.display="none";return}
  box.style.display="";
  $("nssdecision").innerHTML=`decision: <b class="${L.decision==="ranked"?"ok":"dim"}">${escapeHtml(L.decision)}</b> - ${escapeHtml(L.reason)} <span class="gi" data-tip="${escapeHtml(L.ranking_rule+'. '+L.score_note)}">i</span>`;
  $("nsssectors").textContent=`sector counts (1..12, anonymous geometry): ${L.sector_counts.join(" ")} - base occupied ${L.base.occupied_sectors} - base isolated ${L.base.isolated}`;
  $("nsslens").innerHTML=`NSS axis lens (<b>${escapeHtml(L.nss_lens_dictionary.semantic_status)}</b>): ${L.nss_lens_dictionary.axes.map(escapeHtml).join(", ")} - ${escapeHtml(L.nss_lens_dictionary.note)}`;
  const rungs=L.rungs||[];
  $("nsstab").querySelector("tbody").innerHTML=rungs.length?rungs.map((r,i)=>`<tr><td><input type="radio" name="ideal" value="${i}" ${i===0?"checked":""}></td><td><b>${escapeHtml(r.rung)}</b></td><td>${escapeHtml(r.action)}${r.item!==undefined?` #${r.item}`:""}</td><td>${r.sector}</td><td class="dim">${escapeHtml(r.semantic_status)}</td><td>${r.score}</td><td>${r.delta.occupied_sectors_delta}</td><td>${r.delta.isolated_delta}</td></tr>`).join(""):`<tr><td colspan="8" class="dim">no candidates - ${escapeHtml(L.reason)}</td></tr>`;
  const outliers=(L.review_only_audit&&L.review_only_audit.outliers)||[];
  $("nssoutliers").innerHTML=outliers.length?`<b>review-only outliers</b> (${escapeHtml(L.review_only_audit.note)}): `+outliers.map(o=>`#${o.item} ${escapeHtml(o.name)} (sector ${o.sector}, ${escapeHtml(o.reason)}, ${escapeHtml(o.semantic_status)})`).join("; "):"";
  function showPrompt(i){const r=rungs[i];$("nssprompt").textContent=r?r.prompt:"";$("nssrec").innerHTML=r?`<b>${escapeHtml(r.rung)}</b> - sector ${r.sector} - ${escapeHtml(r.hypothesis)} <span class="dim">(${escapeHtml(r.caveat)})</span>`:""}
  $("nsstab").querySelectorAll("input[name=ideal]").forEach((el,i)=>{el.onchange=()=>showPrompt(i)});
  showPrompt(rungs.length?0:-1);
  $("copyprompt").onclick=()=>{navigator.clipboard.writeText($("nssprompt").textContent).then(()=>{$("copyprompt").textContent="copied";setTimeout(()=>$("copyprompt").textContent="copy",1200)})}
}
function renderCompare(cmp){
  const box=$("comparebox");
  if(!cmp){box.style.display="none";return}
  box.style.display="";
  if(!Array.isArray(cmp.changed_names)){ $("comparekv").textContent="Comparison unavailable";$("comparenote").textContent=cmp.reason||"task_verdict: not-tested";$("comparetab").querySelector("tbody").textContent="";return;}
  kv("comparekv",{
    "frame_id / instrument_id":`${cmp.frame_id} / ${cmp.instrument_id}`,
    "n compared (by name)":cmp.n,
    "geometry changed":`${cmp.changed_names.length} of ${cmp.n}`,
    "input changes / hidden by quantization":`${cmp.changed_input_names?.length??"unknown"} / ${cmp.quantization_silent_names?.length??"unknown"}`,
    "changed source content / representation drift":`${cmp.changed_content_names?.length??"unknown"} / ${cmp.representation_drift_names?.length??"unknown"}`,
    "unchanged anchors":cmp.unchanged_anchors,
    "bits changed (total)":cmp.bits_changed_total,
    "max / mean geodesic displacement":`${cmp.max_displacement_geodesic.toFixed(4)} / ${cmp.mean_displacement_geodesic.toFixed(4)}`,
    "isolated delta / occupied sectors delta":`${cmp.isolated_delta} / ${cmp.occupied_sectors_delta}`,
    "geometry decision":cmp.geometry_decision
  });
  $("comparenote").innerHTML=`<div class="wall">${escapeHtml(cmp.geometry_decision_note)}</div><div class="wall"><b>task_verdict: ${escapeHtml(cmp.task_verdict)}</b> - ${escapeHtml(cmp.task_verdict_note)}</div>`;
  const changed=cmp.per_name.filter(p=>p.input_changed||p.bits_changed>0||p.displacement_geodesic>0).sort((a,b)=>b.displacement_geodesic-a.displacement_geodesic).slice(0,80);
  $("comparetab").querySelector("tbody").innerHTML=changed.length?changed.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${p.displacement_geodesic.toFixed(4)}</td><td>${p.bits_changed}</td></tr>`).join(""):`<tr><td colspan="3" class="dim">no named item moved</td></tr>`
}
function renderSpectra(R){
  const S=R.spectra;
  $("spectra").innerHTML=`<div class="wall"><b>NOT ADMITTED</b> - ${escapeHtml(S.status)}</div>
    <div class="kv" style="margin-top:6px">
      <span class="dim">S2 parseval (l=0..3)</span><span>${S.S2_parseval.join(" ")}</span>
      <span class="dim">parity: even (l0+l2) / odd (l1+l3)</span><span>${S.S2_even} / ${S.S2_odd}</span>
      <span class="dim">rank0+2 block / rank1 block</span><span>${S.rank0_2_block} / ${S.rank1_block}</span>
    </div>
    <ul style="margin:6px 0 0;padding-left:18px;color:var(--dim);font-size:90%">${S.disclaimers.map(d=>`<li>${escapeHtml(d)}</li>`).join("")}</ul>`
}

function render(R,id,comparison){
  last=R;lastId=id===undefined?null:id;
  renderNSS(R);renderCompare(comparison||null);
  $("rule").innerHTML=`<b>rule</b> ${escapeHtml(R.rule.rule)}: ${escapeHtml(R.rule.note)} (d=${R.d}). frame_id=<b>${R.frame_id}</b> (frozen - every point on this map is placed on this exact frame; re-running with the same frame never refits). Two maps are comparable only if frame_id matches; compareMaps additionally requires instrument_id to match.`;
  kv("ident",{"items (N) / latent dim (D)":`${R.n} / ${R.D}`,"keys":`ordinal ${R.n}/${R.n} injective; ${new Set(R.keys.map(k=>k.hash)).size} distinct content hashes`,"measurement classes":`${R.classes.count} distinct ${R.d}-bit vectors (largest ${R.classes.largest})`,"pairs unresolvable by measurement":R.classes.unresolvable_pairs});
  kv("place",{"pc12 (raw-input PC1+PC2 share)":R.pc12===null||R.pc12===undefined?"n/a (frozen frame; see gate_rank)":R.pc12,"gate_rank v2 => rhat=2/v2":`${R.gate_rank.v2} => ${Number.isFinite(R.gate_rank.rhat)?R.gate_rank.rhat.toFixed(2):"inf"} (${R.gate_rank.ok?"<=5":"> 5"})`,"Phi(k)":R.ladder.Phi.join(" "),"Hamming shells":R.shells.join(" "),"pole":R.pole.join(", "),"frame_id":R.frame_id,"instrument_id":R.instrument_id});
  kv("null",{"K / attempts per draw":`${R.null.K} / ${R.null.attempts_per_draw}`,"accepted / attempted (total)":`${R.null.accepted_total} / ${R.null.attempted_total}`,"V2 real":R.v2,"E0 +/- SD0":`${R.null.E0} +/- ${R.null.SD0}`,"deltaV2z (descriptive)":R.null.z??"void","p (two-sided / resolution)":R.null.admissible?`${R.null.p_two_sided.toFixed(4)} / ${R.null.p_resolution.toFixed(4)}`:"void","verdict":R.null.verdict,"kind":escapeHtml(R.null.kind)});
  kv("compass",{"T":R.compass.T,"<k> analytic / empirical":`${R.compass.kmean_analytic.toFixed(4)} / ${R.compass.kmean_empirical.toFixed(4)}`,"detailed balance (identity, analytic)":R.compass.flux_identity_analytic.ok?`ok (max resid ${R.compass.flux_identity_analytic.max_abs_residual.toExponential(2)})`:"FAILED","empirical flux max|z| (measurement, descriptive)":R.compass.empirical_flux.maxAbsZ.toFixed(2),"acceptance":R.compass.acceptance,"T-crossover":R.compass.Tx??"none (Phi non-monotone at T->0)","steps":`${R.compass.steps} (single chain)`});
  renderSpectra(R);
  kv("bridge",{"bridge":`item ${R.bridge.i} -> frozen pole, ${R.bridge.rungs.length} rungs (slerp)`});
  kv("meta",{"version":R.version,"map id":lastId===null?"local (no server id)":lastId,"seed":R.seed,"identity failures":R.summary.identity_failures,"measurement red":R.summary.measurement_red,"source":escapeHtml(R.source||"client")});
  $("useBaseline").style.display=lastId===null?"none":"inline-block";
  $("useBaseline").onclick=()=>{$("baseline").value=lastId;$("status").textContent=`baseline set to map id ${lastId}`};
  $("certs").querySelector("tbody").innerHTML=R.certificates.map(c=>`<tr><td class="dim">${escapeHtml(c.class)}</td><td>${escapeHtml(c.theorem)}</td><td class="${c.ok?"ok":"bad"}">${c.ok?"PASS":"FAIL"}</td><td class="dim">${escapeHtml(c.detail)}</td></tr>`).join("");
  draw(R);$("status").textContent=`done - ${R.summary.identity_failures} identity failures - ${R.summary.measurement_red} measurement red`;$("retry").style.display="none"
}

const view={yaw:0.61,pitch:-0.44,zoom:1};let dragging=null,spin=!matchMedia("(prefers-reduced-motion: reduce)").matches,hover=-1,screen=[],poleXY=null;
function rot([x,y,z]){const a=view.yaw,b=view.pitch;const x1=x*Math.cos(a)+z*Math.sin(a),z1=-x*Math.sin(a)+z*Math.cos(a);return[x1,y*Math.cos(b)-z1*Math.sin(b),y*Math.sin(b)+z1*Math.cos(b)]}
function labelOf(R,i){const k=R.keys[i];const l=k&&k.label?String(k.label):null;return l?l.replace(/^skills\//,"").replace(/\/SKILL\.md$/,"").replace(/^refs\//,"r/"):"#"+i}
function draw(R){if(!R)return;const cv=$("sphere"),g=cv.getContext("2d"),W=cv.width,Rr=(W/2-18)*view.zoom,cx=W/2,cy=W/2;g.clearRect(0,0,W,W);
 const S=p=>{const[x,y,z]=rot(p);return[cx+x*Rr,cy-y*Rr,z]};screen=[];
 g.strokeStyle="#1e2440";g.lineWidth=1;g.beginPath();g.arc(cx,cy,Rr,0,2*Math.PI);g.stroke();
 for(let lat=-60;lat<=60;lat+=30){g.beginPath();for(let a=0;a<=360;a+=4){const th=lat*Math.PI/180,ph=a*Math.PI/180;const[px,py,pz]=S([Math.cos(th)*Math.cos(ph),Math.cos(th)*Math.sin(ph),Math.sin(th)]);if(pz<0){g.moveTo(px,py);continue}a===0?g.moveTo(px,py):g.lineTo(px,py)}g.stroke()}
 for(const a of R.atoms){if(a.flip<0)continue;const[x1,y1,z1]=S(R.pts[a.i]),[x2,y2,z2]=S(a.to);if(z1<0&&z2<0)continue;g.strokeStyle="rgba(60,247,165,0.22)";g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()}
 const front=[];R.pts.forEach((p,i)=>{const[x,y,z]=S(p);screen.push([x,y,z,i]);const h=200+120*(R.k[i]/R.d);g.fillStyle=z<0?`hsla(${h},70%,55%,0.18)`:`hsla(${h},80%,60%,0.9)`;g.beginPath();g.arc(x,y,z<0?1.6:(i===hover?4.5:2.6),0,2*Math.PI);g.fill();if(z>=0)front.push([x,y,z,i])});
 if($("labels").checked){g.font="9px monospace";const taken=[];front.sort((a,b)=>b[2]-a[2]);for(const[x,y,z,i]of front){const lx=x+5,ly=y+3;if(taken.some(([tx,ty])=>Math.abs(tx-lx)<58&&Math.abs(ty-ly)<9))continue;taken.push([lx,ly]);g.fillStyle=`rgba(214,221,230,${0.35+0.55*z})`;g.fillText(labelOf(R,i).slice(0,14),lx,ly)}}
 g.strokeStyle="#DB46F5";g.lineWidth=2;g.beginPath();R.bridge.rungs.forEach((q,i)=>{const[x,y]=S(q);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();R.bridge.rungs.forEach(q=>{const[x,y]=S(q);g.fillStyle="#DB46F5";g.beginPath();g.arc(x,y,2.5,0,2*Math.PI);g.fill()});
 const[px,py]=S(R.pole);poleXY=[px,py];g.strokeStyle="#fff";g.lineWidth=1.5;g.beginPath();g.arc(px,py,6,0,2*Math.PI);g.stroke();g.fillStyle="#fff";g.font="11px monospace";g.fillText("p* (frozen all-ones pole)",px+9,py-6);
 if(hover>=0){const[x,y]=S(R.pts[hover]);g.fillStyle="#fff";g.font="11px monospace";g.fillText(labelOf(R,hover),x+8,y-8)}
 g.fillStyle="#7d8894";g.font="11px monospace";g.fillText("drag to rotate - wheel to zoom - hover a point - hue = k-shell - green = atom delta>=0 - violet = slerp",12,W-10)}
(function(){const cv=$("sphere");const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
 cv.addEventListener("pointerdown",e=>{dragging=pos(e);cv.style.cursor="grabbing";cv.setPointerCapture(e.pointerId)});
 cv.addEventListener("pointerup",e=>{dragging=null;cv.style.cursor="grab"});cv.addEventListener("pointerleave",()=>{dragging=null;hover=-1;$("tip").textContent="";draw(last)});
 cv.addEventListener("pointermove",e=>{const[x,y]=pos(e);if(dragging){view.yaw+=(x-dragging[0])*0.01;view.pitch=Math.max(-1.5,Math.min(1.5,view.pitch-(y-dragging[1])*0.01));dragging=[x,y];draw(last);return}
  if(poleXY&&(poleXY[0]-x)**2+(poleXY[1]-y)**2<900){if(hover!==-1){hover=-1;draw(last)}$("tip").textContent="p* frozen all-ones pole - 1^d: every one of the frame's own d axes fully on. gap[i] = geodesic/chord distance from item i to it, not a dimension count. A reference direction of the designed rule, not a goal.";return}let best=-1,bd=64;for(const[sx,sy,sz,i]of screen){if(sz<0)continue;const d=(sx-x)**2+(sy-y)**2;if(d<bd){bd=d;best=i}}
  if(best!==hover){hover=best;if(last&&best>=0){const a=last.atoms[best];$("tip").textContent=`#${best} ${labelOf(last,best)} - k=${last.k[best]} - gap=${last.gaps[best]} - atom delta=${a?a.delta:"-"}${a&&a.flip>=0?" (flip bit "+a.flip+")":""} - hash ${last.keys[best].hash}`}else $("tip").textContent="";draw(last)}});
 cv.addEventListener("wheel",e=>{e.preventDefault();view.zoom=Math.max(0.5,Math.min(3,view.zoom*(e.deltaY<0?1.1:0.9)));draw(last)},{passive:false});
 $("labels").onchange=()=>draw(last);$("reset").onclick=()=>{view.yaw=0.61;view.pitch=-0.44;view.zoom=1;draw(last)};
 const tick=()=>{if(!spin)return;view.yaw+=0.008;draw(last);requestAnimationFrame(tick)};$("spin").textContent=spin?"stop":"auto-rotate";tick();$("spin").onclick=()=>{spin=!spin;$("spin").textContent=spin?"stop":"auto-rotate";tick()};})();

async function run(){
  const opts={d:+$("d").value,seed:+$("seed").value,T:+$("T").value,K:+$("K").value};
  $("status").textContent="running...";$("retry").style.display="none";
  try{
    if($("src").value==="synthetic"){
      render(PM.runMap(PM.synth(+$("N").value,+$("D").value,opts.seed),opts),null,null);
    }else if($("src").value==="vectors"){
      const X=JSON.parse($("input").value);
      if($("localonly").checked){
        render(PM.runMap(X,opts),null,null);
      }else{
        const body={vectors:X,names:X.map((_,i)=>`item_${i}`),...opts};
        const bl=$("baseline").value;if(bl!==""&&bl!==null)body.baseline_id=Number(bl);
        const resp=await postJSONStrict("/api/map",body);
        render(resp.map,resp.id,resp.comparison);
      }
    }else{
      const {items,errors}=await collectItems();
      renderInputErrors(errors);
       if(errors.length)throw new Error("Fix the reported empty inputs before mapping; no partial corpus is submitted.");
      if(items.length<10)throw new Error(`need at least 10 usable items - have ${items.length} (${errors.length} rejected, see above)`);
      if(items.length>400)throw new Error("max 400 items per map");
      $("status").textContent=`mapping ${items.length} items...`;
      const body={texts:items.map(i=>i.text),names:items.map(i=>i.name),labels:items.map(i=>i.label),...opts};
      const bl=$("baseline").value;if(bl!==""&&bl!==null)body.baseline_id=Number(bl);
      const resp=await postJSONStrict("/api/map",body);
      render(resp.map,resp.id,resp.comparison);
    }
  }catch(e){
    $("status").textContent="error: "+e.message;
    if(/HTTP 5\d\d/.test(e.message))$("retry").style.display="inline-block";
  }
}
$("run").onclick=run;$("retry").onclick=run;
$("dl").onclick=()=>{if(!last)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(last,null,1)],{type:"application/json"}));a.download=`MapResult-${last.frame_id}.json`;a.click()};
setTimeout(run,90);
