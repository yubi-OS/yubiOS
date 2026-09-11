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
  function showPrompt(i){const r=rungs[i];$("nssprompt").textContent=r?r.prompt+"\n\nBefore changing the repository, preview the actual candidate text with POST /api/map/preview and the saved baseline_id, full resulting texts/names and target {action,name}. Inspect the touched-neighbour ledger and signed margins, then run the independent task check. Preview creates no map row or repository edit.":"";$("nssrec").innerHTML=r?`<b>${escapeHtml(r.rung)}</b> - sector ${r.sector} - ${escapeHtml(r.hypothesis)} <span class="dim">(${escapeHtml(r.caveat)})</span>`:""}
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
  $("useBaseline").onclick=()=>{$("baseline").value=lastId;$("status").textContent=`baseline set to map id ${lastId}`;freezeBaseline()};
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
  submittedCorpus=null;   // only a successful SAVED text map re-populates this
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
      // Remember the corpus EXACTLY as submitted, only once the server actually saved it
      // (a map id is the proof of persistence). Later edits to the upload controls do not
      // reach this snapshot.
      submittedCorpus=(resp.id===undefined||resp.id===null)?null:{id:resp.id,texts:body.texts.slice(),names:body.names.slice()};
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


// ===========================================================================
// candidate preview (POST /api/map/preview) - additive, ephemeral, never saved
// ---------------------------------------------------------------------------
// submittedCorpus : the exact {texts,names} of the most recent SAVED text map.
// baselineSnapshot: that corpus FROZEN by "use as baseline". Once frozen it is
//                   never re-read from the upload controls, so later edits to
//                   the file pickers / textarea cannot silently change what the
//                   preview claims it measured against.
// ===========================================================================
let submittedCorpus=null;
let baselineSnapshot=null;

function freezeBaseline(){
  if(!submittedCorpus||submittedCorpus.id!==lastId){
    baselineSnapshot=null;
    renderBaselineState(`map id ${lastId===null?"(none)":lastId} has no verified text corpus in this browser. Candidate preview needs the exact texts this page submitted: run a texts map, let it save, then press "use as baseline".`,true);
    return;
  }
  baselineSnapshot=Object.freeze({
    id:submittedCorpus.id,
    texts:Object.freeze(submittedCorpus.texts.slice()),
    names:Object.freeze(submittedCorpus.names.slice())
  });
  renderBaselineState(null,false);
}

function renderBaselineState(msg,isError){
  const el=$("candbaseline");if(!el)return;
  if(baselineSnapshot){
    el.className="";
    el.innerHTML=`frozen baseline: map id <b>${escapeHtml(String(baselineSnapshot.id))}</b> - ${baselineSnapshot.names.length} verified documents (server re-checks every non-target source SHA256). <span class="dim">The candidate below is built over this frozen list, not over the current upload controls.</span>`;
    return;
  }
  el.className=isError?"bad":"dim";
  el.textContent=msg||'no frozen baseline yet - run a texts map, then press "use as baseline" in the result card.';
}

function showCandError(msg){
  const el=$("canderrors");
  el.style.display="block";
  el.innerHTML=`<b>candidate rejected (nothing was sent):</b> ${escapeHtml(msg)}`;
}

// An empty field means OMITTED. It is never coerced to Number("")===0, because
// 0 is a real prediction ("I expect no change") and silence is not.
function readPredictedDelta(){
  const raw=$("canddelta").value;
  if(raw===null||String(raw).trim()==="")return undefined;
  const v=Number(String(raw).trim());
  if(!Number.isFinite(v))throw new Error(`predicted isolation delta must be a finite number, or left blank to omit it (got "${raw}")`);
  return v;
}

function buildCandidateBody(){
  if(!baselineSnapshot){
    throw new Error('No frozen text baseline in this browser. Typing a map id into the header field is not enough - the preview must send the full resulting corpus, and the server verifies every non-target source hash against the stored baseline. Run a texts map, let it save, then press "use as baseline".');
  }
  const manual=String($("baseline").value||"").trim();
  if(manual!==""&&Number(manual)!==baselineSnapshot.id){
    throw new Error(`The baseline id field says ${manual}, but the corpus frozen in this browser is map id ${baselineSnapshot.id}. Re-run the texts map for ${manual} and press "use as baseline", or clear the field.`);
  }
  const action=$("candaction").value;
  const name=String($("candname").value||"").trim();
  const text=$("candtext").value;
  if(!name)throw new Error("literal name is required - it is the exact path string used as the map key");
  if(!text||!text.trim())throw new Error("draft text is required and must be non-empty");
  const names=baselineSnapshot.names.slice();
  const texts=baselineSnapshot.texts.slice();
  const at=names.indexOf(name);
  if(action==="add"){
    if(at!==-1)throw new Error(`ADD needs a name that is not already in the baseline, but "${name}" is present at index ${at}. Use CHANGE instead.`);
    names.push(name);texts.push(text);
  }else{
    if(at===-1)throw new Error(`CHANGE needs an existing baseline name, but "${name}" is not in the frozen corpus. Use ADD instead.`);
    texts[at]=text;
  }
  // Exactly the documented preview contract: no d / K / T / seed / frame / labels.
  // Those are inherited from the baseline; sending them is a 409 by design.
  const body={baseline_id:baselineSnapshot.id,texts,names,target:{action,name}};
  const pd=readPredictedDelta();
  if(pd!==undefined)body.predicted_delta=pd;
  return body;
}

// Margins come from map.math_diagnostics.per_input, which is authoritative.
// The response's top-level map_diagnostics block is deliberately NOT used: its
// margin call upstream is being corrected.
function targetMargins(map,name){
  const md=map&&map.math_diagnostics;
  if(!md||!Array.isArray(md.per_input))return{available:false,reason:"map.math_diagnostics.per_input is absent from the loaded core"};
  const row=md.per_input.find(r=>r&&r.name===name);
  if(!row)return{available:false,reason:`no per_input row is keyed to ${name}`};
  if(!Array.isArray(row.margins))return{available:false,reason:"the per_input row carries no margins array"};
  return{available:true,row,units:md.units||(row.margins[0]&&row.margins[0].units)||null,
    axes:md.axes||null,scope:md.scope||null,perturbation_linf:md.perturbation_linf,roundoff_budget:md.roundoff_budget};
}

function num(x,dp){return (x===null||x===undefined||!Number.isFinite(Number(x)))?"n/a":Number(x).toFixed(dp===undefined?6:dp)}
function nameList(a){return (Array.isArray(a)&&a.length)?a.map(n=>`<code>${escapeHtml(String(n))}</code>`).join(", "):'<span class="dim">none</span>'}

function renderLedger(ml){
  if(!ml)return '<div class="wall bad">no math_ledger field in the response</div>';
  if(ml.available===false)return `<div class="wall">math ledger unavailable: ${escapeHtml(ml.reason||"(no reason given)")}</div>`;
  const L=ml.ledger;
  if(!L||ml.kind==="not-applicable"){
    return `<div class="wall"><b>ledger: not-applicable</b> - ${escapeHtml(ml.reason||"no ledger is claimed for this transition")}</div>`;
  }
  let head="",rows="";
  if(ml.kind==="ADD"){
    head=`<b>ADD</b> <span class="dim">- an added vertex can only lower the isolated count by linking previously isolated items; on its own it is neutral by construction.</span>`;
    rows=`<span class="dim">added name</span><span><code>${escapeHtml(String(ml.added_name))}</code></span>
      <span class="dim">isolated-count delta (identity)</span><span><b>${escapeHtml(String(L.delta))}</b></span>
      <span class="dim">new vertex degree</span><span>${escapeHtml(String(L.new_degree))}${L.new_degree===0?' <span class="dim">(isolated: +1)</span>':""}</span>
      <span class="dim">previous isolates it touched</span><span>${escapeHtml(String(L.previous_isolates_touched))}</span>
      <span class="dim">touched names</span><span>${nameList(L.previous_isolates_touched_names)}</span>`;
  }else if(ml.kind==="CHANGE"&&(ml.moved_name===null||ml.moved_name===undefined)){
    head=`<b>CHANGE - unchanged</b> <span class="dim">- no point moved on the frozen frame, so the adjacency graph and the isolated count are identical. The edit is real in the source and invisible to this geometry.</span>`;
    rows=`<span class="dim">moved name</span><span class="dim">none</span>
      <span class="dim">isolated-count delta (identity)</span><span><b>${escapeHtml(String(L.delta))}</b></span>
      <span class="dim">touched neighbours</span><span>${nameList(L.touched_neighbour_names)}</span>`;
  }else{
    head=`<b>CHANGE - moved</b> <span class="dim">- one vertex moved; the delta is the exact sum of per-neighbour isolation flips.</span>`;
    rows=`<span class="dim">moved name</span><span><code>${escapeHtml(String(ml.moved_name))}</code></span>
      <span class="dim">isolated-count delta (identity)</span><span><b>${escapeHtml(String(L.delta))}</b></span>
      <span class="dim">degree before -> after</span><span>${escapeHtml(String(L.old_degree))} -> ${escapeHtml(String(L.new_degree))}</span>
      <span class="dim">touched neighbours</span><span>${nameList(L.touched_neighbour_names)}</span>`;
  }
  const r=ml.reduction||{};
  const ratio=r.eligible
    ? `<span class="dim">reduction ratio</span><span><b>${escapeHtml(num(r.ratio,4))}</b> = observed / predicted isolated-count reduction (predicted ${escapeHtml(String(r.predicted_delta))}). <span class="dim">${escapeHtml(r.scope||"")}</span></span>`
    : `<span class="dim">reduction ratio</span><span class="dim">withheld - ${escapeHtml(r.reason||"not eligible")}. ${escapeHtml(r.scope||"")}</span>`;
  const m=ml.measurement||{};
  return `<div class="wall">${head}</div>
    <div class="kv" style="margin-top:6px">${rows}
      <span class="dim">theorem (identity)</span><span class="dim">${escapeHtml(L.theorem||"")}</span>
      <span class="dim">adjacency radius</span><span>${escapeHtml(String(L.radius))}</span>
      ${ratio}
      <span class="dim">isolated before / after (measurement)</span><span>${escapeHtml(String(m.isolated_before))} / ${escapeHtml(String(m.isolated_after))} <span class="dim">(recomputed delta ${escapeHtml(String(m.actual_delta))})</span></span>
      <span class="dim">correspondence</span><span>${escapeHtml((ml.correspondence&&ml.correspondence.status)||"unknown")} <span class="dim">${escapeHtml((ml.correspondence&&ml.correspondence.note)||"")}</span></span>
    </div>
    <div class="wall dim">${escapeHtml(m.note||"")}</div>
    <div class="wall dim">${escapeHtml(ml.scope||"")}</div>`;
}

function renderMargins(map,name){
  const M=targetMargins(map,name);
  if(!M.available)return `<div class="wall">projection margins unavailable: ${escapeHtml(M.reason)}</div>`;
  const sorted=M.row.margins.slice().sort((a,b)=>Math.abs(a.signed_margin)-Math.abs(b.signed_margin)).slice(0,6);
  const unbounded=M.row.margins.filter(x=>x.status==="needs-roundoff-bound"||x.perturbation_bound===null);
  const banner=unbounded.length
    ? `<div class="wall bad">no roundoff bound was supplied, so <b>no stability verdict is claimed</b> for ${escapeHtml(String(unbounded.length))} of ${escapeHtml(String(M.row.margins.length))} axes (status <code>needs-roundoff-bound</code>). The signed margins below are computed distances in score units of the frozen axis - they are <b>conditional on caller-supplied bounds, not numerical proofs or probabilities</b> and carry no stability guarantee.</div>`
    : `<div class="wall dim">stability statuses are conditional, not certified; supplied bounds are not independently validated. perturbation_linf=${escapeHtml(String(M.perturbation_linf))} and roundoff_budget=${escapeHtml(String(M.roundoff_budget))}.</div>`;
  const rows=sorted.map(x=>`<tr>
      <td>${escapeHtml(String(x.axis))}</td>
      <td>${escapeHtml(String(x.bit))}</td>
      <td>${escapeHtml(num(x.signed_margin))}</td>
      <td>${escapeHtml(num(x.distance_to_threshold))}</td>
      <td>${escapeHtml(num(x.distance_l2_to_hyperplane ?? (M.axes?.[x.axis]?.norm2 ? Math.abs(x.signed_margin)/M.axes[x.axis].norm2 : null)))}</td>
      <td>${x.perturbation_bound===null?'<span class="dim">none</span>':escapeHtml(num(x.perturbation_bound))}</td>
      <td class="${x.status==="undetermined"||x.status==="needs-roundoff-bound"?"bad":"dim"}">${escapeHtml(String(x.status))}</td>
    </tr>`).join("");
  return `${banner}
    <div class="dim" style="margin-top:6px">nearest thresholds for <code>${escapeHtml(name)}</code> (index ${escapeHtml(String(M.row.index))}), closest first. Units: ${escapeHtml(M.units||"score units of the frozen axis")}.</div>
    <table style="margin-top:4px;font-size:85%"><thead><tr><th>axis</th><th>bit</th><th>signed margin</th><th>|distance|</th><th>L2 to hyperplane</th><th>perturbation bound</th><th>status</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="wall dim">${escapeHtml(M.scope||"")}</div>
    <div class="wall dim">Read from <code>map.math_diagnostics.per_input</code>, which is authoritative. The response's top-level <code>map_diagnostics</code> block is not used here.</div>`;
}

function renderPreview(resp,sent){
  const out=$("previewout");
  const t=resp.target||{};
  const se=resp.side_effects||{};
  const seRow=Object.keys(se).map(k=>`${escapeHtml(k)}=<b class="${se[k]?"bad":"ok"}">${se[k]?"true":"false"}</b>`).join(" &middot; ");
  out.style.display="block";
  out.innerHTML=`
    <h3>envelope</h3>
    <div class="kv">
      <span class="dim">preview / persisted</span><span><b class="ok">${escapeHtml(String(resp.preview))}</b> / <b class="${resp.persisted?"bad":"ok"}">${escapeHtml(String(resp.persisted))}</b></span>
      <span class="dim">baseline id</span><span>${escapeHtml(String(resp.baseline_id))}</span>
      <span class="dim">target</span><span>${escapeHtml(String(t.action||"").toUpperCase())} <code>${escapeHtml(String(t.name||""))}</code></span>
      <span class="dim">source sha256 before -> after</span><span class="dim">${escapeHtml(String(t.before_sha256===null?"(new document)":t.before_sha256))} -> ${escapeHtml(String(t.after_sha256||""))}</span>
      <span class="dim">side effects</span><span>${seRow}</span>
      <span class="dim">task_verdict</span><span><b>${escapeHtml(String(resp.task_verdict))}</b>${gi("task_verdict")}</span>
    </div>
    ${t.noop?`<div class="wall bad">${escapeHtml(String(t.noop_note||"this CHANGE is a no-op: the draft is byte-identical to the baseline source"))}</div>`:""}
    <div class="wall dim">${escapeHtml(String(resp.task_verdict_note||""))}</div>
    <div class="wall dim">${escapeHtml(String(resp.side_effects_note||""))}</div>

    <h3>anchors</h3>
    <div class="kv">
      <span class="dim">unchanged sources (hash-verified)</span><span>${escapeHtml(String(resp.unchanged_source_count))} of ${escapeHtml(String(sent.names.length))} submitted</span>
      <span class="dim">unchanged anchors (byte-equal points + bits)</span><span>${escapeHtml(String(resp.unchanged_anchor_count))}</span>
      <span class="dim">representation drift</span><span>${nameList(resp.representation_drift_names)} <span class="dim">(same points, bits and source hash; different cached vector fingerprint - logged, not fatal)</span></span>
    </div>
    <div class="wall dim">${escapeHtml(String(resp.comparison_note||""))}</div>

    <h3>math ledger</h3>
    ${renderLedger(resp.math_ledger)}

    <h3>projection margins (diagnostic only)</h3>
    ${renderMargins(resp.map||{},String(t.name||""))}`;
  // Nothing above touches last / lastId / baselineSnapshot: the preview is displayed
  // beside the saved map, never in place of it.
}

$("preview").onclick=async()=>{
  $("canderrors").style.display="none";$("canderrors").innerHTML="";
  $("candstatus").textContent="";
  let body;
  try{body=buildCandidateBody()}catch(e){showCandError(e.message);return}
  $("candstatus").textContent=`previewing ${body.target.action.toUpperCase()} over ${body.texts.length} items on baseline ${body.baseline_id}...`;
  try{
    const resp=await postJSONStrict("/api/map/preview",body);
    renderPreview(resp,body);
    $("candstatus").textContent="preview returned - nothing was saved, committed or published";
  }catch(e){
    showCandError(e.message);
    $("candstatus").textContent="preview failed";
    $("previewout").style.display="none";
  }
};

renderBaselineState(null,false);
