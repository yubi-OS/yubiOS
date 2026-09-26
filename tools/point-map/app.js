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
  if(!L){box.style.display="none";setTip("lexi","lexl","");setTip("dectip","decl","");setTip("lentip","lenl","");return}
  box.style.display="";
  $("nssdecision").innerHTML=`decision: <b class="${L.decision==="ranked"?"ok":"dim"}">${escapeHtml(L.decision)}</b>`;
  setTip("lexi","lexl",L.ranking_rule+". "+(L.score_note||""));
  setTip("dectip","decl","decision "+L.decision+": "+L.reason);
  $("nsssectors").textContent=`sector counts (1..12, anonymous geometry): ${L.sector_counts.join(" ")} - base occupied ${L.base.occupied_sectors} - base isolated ${L.base.isolated}`;
  $("nsslens").innerHTML=`NSS axis lens (<b>${escapeHtml(L.nss_lens_dictionary.semantic_status)}</b>)`;
  setTip("lentip","lenl","NSS axis lens ("+L.nss_lens_dictionary.semantic_status+"): "+L.nss_lens_dictionary.axes.join(", ")+" - "+L.nss_lens_dictionary.note);
  const rungs=L.rungs||[];
  $("nsstab").querySelector("tbody").innerHTML=rungs.length?rungs.map((r,i)=>`<tr><td><input type="radio" name="ideal" value="${i}" ${i===0?"checked":""}></td><td><b>${escapeHtml(r.rung)}</b></td><td>${escapeHtml(r.action)}${r.item!==undefined?` #${r.item}`:""}</td><td>${r.sector}</td><td class="dim">${escapeHtml(r.semantic_status)}</td><td>${r.score}</td><td>${r.delta.occupied_sectors_delta}</td><td>${r.delta.isolated_delta}</td></tr>`).join(""):`<tr><td colspan="8" class="dim">no candidates - ${escapeHtml(L.reason)}</td></tr>`;
  const outliers=(L.review_only_audit&&L.review_only_audit.outliers)||[];
  $("nssoutliers").innerHTML=outliers.length?`<b>review-only outliers</b> (${escapeHtml(L.review_only_audit.note)}): `+outliers.map(o=>`#${o.item} ${escapeHtml(o.name)} (sector ${o.sector}, ${escapeHtml(o.reason)}, ${escapeHtml(o.semantic_status)})`).join("; "):"";
  function showPrompt(i){const r=rungs[i];$("nssprompt").textContent=r?r.prompt+"\n\nBefore changing the repository, preview the actual candidate text with POST /api/map/preview and the saved baseline_id, full resulting texts/names and target {action,name}. Inspect the touched-neighbour ledger and signed margins, then run the independent task check. Preview creates no map row or repository edit."+RADIUS_PROMPT_NOTE:"";$("nssrec").innerHTML=r?`<b>${escapeHtml(r.rung)}</b> - sector ${r.sector} - ${escapeHtml(r.hypothesis)} <span class="dim">(${escapeHtml(r.caveat)})</span>`:""}
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
  resetDiags();
  renderNSS(R);renderCompare(comparison||null);
  $("rule").setAttribute("data-tip", `rule ${R.rule.rule}: ${R.rule.note} (d=${R.d}). frame_id=${R.frame_id} (frozen - every point on this map is placed on this exact frame; re-running with the same frame never refits). Two maps are comparable only if frame_id matches; compareMaps additionally requires instrument_id to match.`);
  kv("ident",{"items (N) / latent dim (D)":`${R.n} / ${R.D}`,"keys":`ordinal ${R.n}/${R.n} injective; ${new Set(R.keys.map(k=>k.hash)).size} distinct content hashes`,"measurement classes":`${R.classes.count} distinct ${R.d}-bit vectors (largest ${R.classes.largest})`,"pairs unresolvable by measurement":R.classes.unresolvable_pairs});
  kv("place",{"pc12 (raw-input PC1+PC2 share)":R.pc12===null||R.pc12===undefined?"n/a (frozen frame; see gate_rank)":R.pc12,"gate_rank v2 => rhat=2/v2":`${R.gate_rank.v2} => ${Number.isFinite(R.gate_rank.rhat)?R.gate_rank.rhat.toFixed(2):"inf"} (${R.gate_rank.ok?"<=5":"> 5"})`,"Phi(k)":R.ladder.Phi.join(" "),"Hamming shells":R.shells.join(" "),"pole":R.pole.join(", "),"frame_id":R.frame_id,"instrument_id":R.instrument_id});
  kv("null",{"K / attempts per draw":`${R.null.K} / ${R.null.attempts_per_draw}`,"accepted / attempted (total)":`${R.null.accepted_total} / ${R.null.attempted_total}`,"V2 real":R.v2,"E0 +/- SD0":`${R.null.E0} +/- ${R.null.SD0}`,"deltaV2z (descriptive)":R.null.z??"void","p (two-sided / resolution)":R.null.admissible?`${R.null.p_two_sided.toFixed(4)} / ${R.null.p_resolution.toFixed(4)}`:"void","verdict":R.null.verdict,"kind":escapeHtml(R.null.kind)});
  kv("compass",{"T":R.compass.T,"<k> analytic / empirical":`${R.compass.kmean_analytic.toFixed(4)} / ${R.compass.kmean_empirical.toFixed(4)}`,"detailed balance (identity, analytic)":R.compass.flux_identity_analytic.ok?`ok (max resid ${R.compass.flux_identity_analytic.max_abs_residual.toExponential(2)})`:"FAILED","empirical flux max|z| (measurement, descriptive)":R.compass.empirical_flux.maxAbsZ.toFixed(2),"acceptance":R.compass.acceptance,"T-crossover":R.compass.Tx??"none (Phi non-monotone at T->0)","steps":`${R.compass.steps} (single chain)`});
  renderSpectra(R);renderRadiusProfile(R);
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
 const front=[];R.pts.forEach((p,i)=>{const[x,y,z]=S(p);screen.push([x,y,z,i]);const ov=(window.rcompOn&&window.rcompFill)?window.rcompFill[i]:null;if(ov){g.fillStyle=z<0?ov.back:ov.front}else{const h=200+120*(R.k[i]/R.d);g.fillStyle=z<0?`hsla(${h},70%,55%,0.18)`:`hsla(${h},80%,60%,0.9)`}g.beginPath();g.arc(x,y,z<0?1.6:(i===hover?4.5:2.6),0,2*Math.PI);g.fill();if(z>=0)front.push([x,y,z,i])});
 if($("labels").checked){g.font="9px monospace";const taken=[];front.sort((a,b)=>b[2]-a[2]);for(const[x,y,z,i]of front){const lx=x+5,ly=y+3;if(taken.some(([tx,ty])=>Math.abs(tx-lx)<58&&Math.abs(ty-ly)<9))continue;taken.push([lx,ly]);g.fillStyle=`rgba(214,221,230,${0.35+0.55*z})`;g.fillText(labelOf(R,i).slice(0,14),lx,ly)}}
 g.strokeStyle="#DB46F5";g.lineWidth=2;g.beginPath();R.bridge.rungs.forEach((q,i)=>{const[x,y]=S(q);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();R.bridge.rungs.forEach(q=>{const[x,y]=S(q);g.fillStyle="#DB46F5";g.beginPath();g.arc(x,y,2.5,0,2*Math.PI);g.fill()});
 const[px,py]=S(R.pole);poleXY=[px,py];g.strokeStyle="#fff";g.lineWidth=1.5;g.beginPath();g.arc(px,py,6,0,2*Math.PI);g.stroke();g.fillStyle="#fff";g.font="11px monospace";g.fillText("p* (frozen all-ones pole)",px+9,py-6);
 if(hover>=0){const[x,y]=S(R.pts[hover]);g.fillStyle="#fff";g.font="11px monospace";g.fillText(labelOf(R,hover),x+8,y-8)}
 g.fillStyle="#7d8894";g.font="11px monospace";g.fillText((window.rcompOn&&window.rcompFill)?"colors = isolation-graph components - white/red = isolates - drag to rotate - wheel to zoom - hover a point":"drag to rotate - wheel to zoom - hover a point - hue = k-shell - green = atom delta>=0 - violet = slerp",12,W-10)}
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
      if(items.length>4000)throw new Error("max 4000 items per map");
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
setTimeout(()=>{ // load the synthetic cloud as the demo visual until the first run; the dropdown stays on texts
  const o={d:+$("d").value,seed:+$("seed").value,T:+$("T").value,K:+$("K").value};
  render(PM.runMap(PM.synth(+$("N").value,+$("D").value,o.seed),o),null,null);
},90);


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

    <h3>radius profile + comparison (diagnostic only)</h3>
    ${renderRadiusComparison(resp,String(t.name||""))}

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

// ===========================================================================
// radius-persistence diagnostics - ADDITIVE, DIAGNOSTIC ONLY
// ---------------------------------------------------------------------------
// Reads two blocks supplied by the backend module:
//   map.radius_profile   (version "radius") on any saved or previewed map
//   resp.radius_comparison on a preview response
//
// Deliberate non-features, each one a standing requirement:
//   * NO radius control of any kind. The canonical radius is 0.095 and nothing
//     rendered here can change the operative metric. The grid is predeclared by
//     the backend; this file only displays what it was given.
//   * NO "best radius" winner. No row is scored, ranked, coloured green or
//     otherwise marked as preferable. The canonical row is marked as canonical -
//     that is an identification, not a recommendation.
//   * NO statistical confidence, p-value or quality score. The intervals are
//     exact frozen-coordinate parameter clearances; they are not uncertainty
//     intervals, not significance statements and not forecasts.
//   * A map with no radius_profile (local synthetic, legacy stored map) renders
//     an explicit "unavailable" note and is NOT an error.
// ===========================================================================
const RADIUS_PROFILE_VERSION="radius";
const RADIUS_COMPARISON_VERSION="radius";

const RADIUS_PROMPT_NOTE="\n\nThe preview response also carries a diagnostic-only radius_comparison block. Read canonical_delta at the canonical radius 0.095 as the operative isolation reading, and read the fixed-grid before/after/delta samples plus the exact same-delta and same-sign intervals around 0.095 as sensitivity to an instrument parameter. They are exact frozen-coordinate parameter clearances, not confidence intervals, not significance tests and not pre-edit forecasts. Never reselect the radius from that grid: 0.095 is canonical, the displayed sweep never changes the operative metric, and a sign that reverses elsewhere on the grid is an instrument-sensitivity finding to report, not a better reading to adopt.";

const RADIUS_UNAVAILABLE_NOTE='<span class="dim">Expected for a local synthetic run or a stored map written before this diagnostic existed. This is not an error and nothing else on this page depends on it.</span>';

function radiusNote(msg){return `<div class="wall">${msg}</div>`}

// ---- shared readers -------------------------------------------------------

function radiusProfileOf(map){
  const rp=map&&map.radius_profile;
  if(!rp||typeof rp!=="object")return{available:false,reason:map&&map.radius_profile_unavailable?escapeHtml(String(map.radius_profile_unavailable.reason)):"the loaded map carries no <code>radius_profile</code> block"};
  if(rp.version!==RADIUS_PROFILE_VERSION)return{available:false,reason:`unsupported <code>radius_profile</code> version ${escapeHtml(String(rp.version))} (this page reads <code>${escapeHtml(RADIUS_PROFILE_VERSION)}</code>)`};
  if(!Array.isArray(rp.samples))return{available:false,reason:"<code>radius_profile</code> carries no <code>samples</code> array"};
  return{available:true,rp};
}

function radiusComparisonOf(resp){
  const rc=resp&&resp.radius_comparison;
  if(!rc||typeof rc!=="object")return{available:false,reason:"this preview response carries no <code>radius_comparison</code> block"};
  if(rc.version!==RADIUS_COMPARISON_VERSION)return{available:false,reason:`unsupported <code>radius_comparison</code> version ${escapeHtml(String(rc.version))} (this page reads <code>${escapeHtml(RADIUS_COMPARISON_VERSION)}</code>)`};
  if(!Array.isArray(rc.samples))return{available:false,reason:"<code>radius_comparison</code> carries no <code>samples</code> array"};
  return{available:true,rc};
}

// Is this grid row the canonical radius? Compared on the profile's OWN declared
// canonical_radius, never on a hardcoded 0.095, so a backend that ever moves the
// canonical value cannot be silently contradicted by this page.
function isCanonicalRow(radius,canonical){
  return Number.isFinite(Number(radius))&&Number.isFinite(Number(canonical))&&Math.abs(Number(radius)-Number(canonical))<1e-12;
}
function canonicalCell(isC){
  return isC?' <span class="badge">canonical</span>':"";
}

// ---- interval formatting --------------------------------------------------
// Half-open by construction: delta-I is constant on (left,right], so the lower
// end is normally OPEN and the upper end CLOSED. A domain end (0 or 2) is the
// exception the backend flags with lower_closed:true, and it is labelled as a
// domain boundary rather than a witness breakpoint.

function fmtInterval(iv){
  if(!iv||typeof iv!=="object")return '<code class="dim">not reported</code>';
  const lo=iv.lower_closed===true?"[":"(";
  const hi=iv.upper_closed===false?")":"]";
  return `<code>${escapeHtml(lo)}${escapeHtml(num(iv.lower,10))}, ${escapeHtml(num(iv.upper,10))}${escapeHtml(hi)}</code>`;
}

function fmtWitnesses(b){
  const w=(b&&Array.isArray(b.witnesses))?b.witnesses:[];
  if(!w.length)return '<span class="dim">no witness pair is recorded for this end</span>';
  return w.map(x=>`<code>${escapeHtml(String(x&&x.name))}</code> &rarr; <code>${escapeHtml(String(x&&x.nearest_name))}</code> <span class="dim">(${escapeHtml(String(x&&x.side))}, clearance ${escapeHtml(num(x&&x.clearance,10))})</span>`).join("; ");
}

// One boundary row: the endpoint itself, its DISTANCE from the canonical radius
// (the number that says how close the canonical reading sits to flipping), the
// shown/total witness budget, and the named witnesses.
function fmtBoundaryRow(side,endpoint,b,canonical){
  const d=(Number.isFinite(Number(endpoint))&&Number.isFinite(Number(canonical)))?Math.abs(Number(endpoint)-Number(canonical)):null;
  const dom=(b&&b.domain_boundary)?' <span class="dim">- domain boundary: this end is the edge of the declared radius domain, not a witness breakpoint</span>':"";
  const total=(b&&b.total!==undefined&&b.total!==null)?String(b.total):"unknown";
  const shown=(b&&b.shown!==undefined&&b.shown!==null)?String(b.shown):"0";
  const more=(b&&Number.isFinite(Number(b.total))&&Number.isFinite(Number(b.shown))&&Number(b.total)>Number(b.shown))
    ? ` <span class="dim">(${escapeHtml(String(Number(b.total)-Number(b.shown)))} further witness pair(s) at this boundary are not listed)</span>`:"";
  return `<tr>
      <td>${escapeHtml(side)}</td>
      <td><code>${escapeHtml(num(endpoint,10))}</code></td>
      <td>${d===null?'<span class="dim">n/a</span>':`<b>${escapeHtml(num(d,10))}</b>`}</td>
      <td>${escapeHtml(shown)} of ${escapeHtml(total)}${more}</td>
      <td>${fmtWitnesses(b)}${dom}</td>
    </tr>`;
}

function fmtIntervalBlock(title,iv,canonical,note){
  if(!iv||typeof iv!=="object")return `<div class="wall">${escapeHtml(title)}: <span class="dim">not reported by the backend for this candidate.</span></div>`;
  return `<div style="margin-top:8px"><b>${escapeHtml(title)}</b> ${fmtInterval(iv)} <span class="dim">around the canonical radius ${escapeHtml(num(canonical,4))}. ${escapeHtml(note)}</span></div>
    <table style="margin-top:4px;font-size:85%"><thead><tr><th>end</th><th>radius</th><th>distance from canonical</th><th>witnesses shown</th><th>named witness pairs (item &rarr; nearest neighbour)</th></tr></thead><tbody>
      ${fmtBoundaryRow("lower",iv.lower,iv.lower_boundary,canonical)}
      ${fmtBoundaryRow("upper",iv.upper,iv.upper_boundary,canonical)}
    </tbody></table>`;
}

// ---- bounds / robustness --------------------------------------------------
// Bounds are caller-supplied and explicitly unvalidated/uncertified. When they
// are absent the status is reported as-is and NO robustness verdict is claimed.

function fmtBounds(bounds){
  if(!bounds||typeof bounds!=="object")
    return `<div class="wall bad">no <code>bounds</code> block was supplied, so <b>no robustness verdict is claimed</b> for any item. Clearances below are exact distances on the frozen frame; turning one into a stability statement needs a justified coordinate epsilon and distance error bound.</div>`;
  const validated=bounds.validated===true,certified=bounds.certified===true;
  const cls=(validated&&certified)?"dim":"bad";
  return `<div class="wall ${cls}">bounds: coordinate_epsilon=<code>${escapeHtml(num(bounds.coordinate_epsilon,10))}</code>, distance_error_bound=<code>${escapeHtml(num(bounds.distance_error_bound,10))}</code>, validated=<b>${escapeHtml(String(validated))}</b>, certified=<b>${escapeHtml(String(certified))}</b>. Robustness statuses are <b>conditional on these caller-supplied bounds</b>; they are not numerical proofs, not probabilities and not independently validated.</div>`;
}

function fmtRobustness(rb){
  if(!rb||typeof rb!=="object")return '<span class="dim">no robustness block - no verdict claimed</span>';
  const st=String(rb.status===undefined?"unknown":rb.status);
  const bad=/unknown|undetermined|needs-bound|not-claimed|missing/i.test(st);
  const extra=Object.keys(rb).filter(k=>k!=="status")
    .map(k=>`${escapeHtml(k)}=${escapeHtml(typeof rb[k]==="object"?JSON.stringify(rb[k]):String(rb[k]))}`).join(", ");
  return `<b class="${bad?"bad":"dim"}">${escapeHtml(st)}</b>${extra?` <span class="dim">(${extra})</span>`:""}`;
}

// ---- map card: fixed-grid profile of the currently rendered map ------------

function renderRadiusProfile(R){
  const el=$("radiusprofile");
  if(!el)return;
  const P=radiusProfileOf(R);
  if(!P.available){el.innerHTML=radiusNote(`radius profile unavailable: ${P.reason}. ${RADIUS_UNAVAILABLE_NOTE}`);return}
  const rp=P.rp,canonical=rp.canonical_radius;
  const dom=Array.isArray(rp.domain)?rp.domain:null;
  const rows=rp.samples.map(s=>{
    const isC=isCanonicalRow(s&&s.radius,canonical);
    return `<tr>
      <td>${escapeHtml(num(s&&s.radius,4))}${canonicalCell(isC)}</td>
      <td>${isC?"<b>":""}${escapeHtml(String(s&&s.isolated))}${isC?"</b>":""}</td>
      <td>${escapeHtml(num(s&&s.isolated_fraction,4))}</td>
      <td>${escapeHtml(num(s&&s.area,6))}</td>
      <td>${escapeHtml(num(s&&s.mean_area,6))}</td>
    </tr>`}).join("");
  el.innerHTML=`<div class="kv">
      <span class="dim">canonical radius</span><span><b>${escapeHtml(num(canonical,4))}</b> <span class="dim">- fixed; the sweep below is displayed beside it and never replaces it</span></span>
      <span class="dim">I(canonical) / N</span><span><b>${escapeHtml(String(rp.canonical_isolated))}</b> / ${escapeHtml(String(rp.n))}</span>
      <span class="dim">declared radius domain</span><span>${dom?`<code>[${escapeHtml(num(dom[0],4))}, ${escapeHtml(num(dom[1],4))}]</code>`:'<span class="dim">not declared</span>'}</span>
      <span class="dim">per-item clearances</span><span>${escapeHtml(String(Array.isArray(rp.per_item)?rp.per_item.length:0))} rows</span>
    </div>
    <table style="margin-top:6px;font-size:85%"><thead><tr><th>radius r</th><th>I(r)</th><th>isolated fraction</th><th>clipped area S_R</th><th>area per item S_R/N</th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="dim">no samples</td></tr>`}</tbody></table>
    <div class="wall dim">I(r) is the count of items whose nearest-neighbour clearance is at least r, so it is non-increasing in r; S_R = sum of min(R, c_i) carries distance units and is neither a count, a free energy nor a score. The grid is predeclared by the backend - no radius was selected after seeing these numbers, no row is ranked, and there is no best radius here.</div>
    ${fmtBounds(rp.bounds)}
    <div class="wall dim">${escapeHtml(String(rp.scope||""))}</div>`;
}

// ---- preview: before/after/delta over the same fixed grid ------------------

function renderRadiusComparison(resp,targetName){
  const C=radiusComparisonOf(resp);
  const P=radiusProfileOf(resp&&resp.map);
  if(!C.available&&!P.available)
    return radiusNote(`radius diagnostics unavailable: ${C.reason}. ${RADIUS_UNAVAILABLE_NOTE}`);

  let head="",table="",intervals="",target="";

  if(C.available){
    const rc=C.rc,canonical=rc.canonical_radius;
    const rows=rc.samples.map(s=>{
      const isC=isCanonicalRow(s&&s.radius,canonical);
      const d=Number(s&&s.delta);
      return `<tr>
        <td>${escapeHtml(num(s&&s.radius,4))}${canonicalCell(isC)}</td>
        <td>${escapeHtml(String(s&&s.before))}</td>
        <td>${escapeHtml(String(s&&s.after))}</td>
        <td>${isC?"<b>":""}${escapeHtml((Number.isFinite(d)&&d>0?"+":"")+String(s&&s.delta))}${isC?"</b>":""}</td>
      </tr>`}).join("");
    const cd=Number(rc.canonical_delta);
    head=`<div class="kv">
        <span class="dim">canonical radius</span><span><b>${escapeHtml(num(canonical,4))}</b></span>
        <span class="dim">isolated-count delta at the canonical radius</span><span><b>${escapeHtml((Number.isFinite(cd)&&cd>0?"+":"")+String(rc.canonical_delta))}</b> <span class="dim">- this is the operative reading; the grid below is sensitivity, not a menu</span></span>
        <span class="dim">reading</span><span>${rc.retrospective?'<b>retrospective</b> <span class="dim">- the candidate text is already embedded, so this compares two computed states. It is not a pre-edit forecast and agreement with a prediction is not improved forecasting.</span>':'<span class="dim">not labelled retrospective by the backend</span>'}</span>
      </div>`;
    table=`<table style="margin-top:6px;font-size:85%"><thead><tr><th>radius r</th><th>I(r) before</th><th>I(r) after</th><th>delta I(r)</th></tr></thead><tbody>${rows||`<tr><td colspan="4" class="dim">no samples</td></tr>`}</tbody></table>
      <div class="wall dim">A delta whose sign differs elsewhere on this grid is sensitivity to an instrument parameter. It is a finding to report, not a reason to re-read the edit at another radius: ${escapeHtml(num(canonical,4))} stays canonical.</div>`;
    intervals=fmtIntervalBlock("maximal same-delta interval",rc.exact_delta_interval,canonical,
        "Widest interval containing the canonical radius on which delta I(r) is exactly this value. Half-open by construction: delta I is constant on (left, right].")
      +fmtIntervalBlock("maximal same-sign interval",rc.same_sign_interval,canonical,
        "Widest interval containing the canonical radius on which the sign of delta I(r) does not change.")
      +`<div class="wall dim">Both intervals are exact clearances in the frozen coordinates - they are parameter ranges, not statistical uncertainty, not confidence intervals and not significance. The distance-from-canonical column is how far the canonical reading sits from flipping.</div>
       <div class="wall dim">${escapeHtml(String(rc.scope||""))}</div>`;
  }else{
    head=radiusNote(`radius comparison unavailable: ${C.reason}. ${RADIUS_UNAVAILABLE_NOTE}`);
  }

  // Target clearance + conditional robustness, read from the previewed map's
  // per_item rows. Absent rows are reported, never fabricated.
  if(P.available){
    const per=Array.isArray(P.rp.per_item)?P.rp.per_item:[];
    const row=per.find(r=>r&&String(r.name)===String(targetName));
    if(!row){
      target=radiusNote(`no per-item clearance row is keyed to <code>${escapeHtml(String(targetName))}</code>, so no target clearance or robustness status is shown.`);
    }else{
      const ties=Array.isArray(row.nearest_ties)?row.nearest_ties:[];
      target=`<div style="margin-top:8px"><b>target clearance</b> <span class="dim">for <code>${escapeHtml(String(row.name))}</code></span></div>
        <div class="kv" style="margin-top:4px">
          <span class="dim">nearest neighbour</span><span><code>${escapeHtml(String(row.nearest_name))}</code>${ties.length?` <span class="dim">(${escapeHtml(String(ties.length))} tied nearest: ${ties.map(t=>`<code>${escapeHtml(String(t))}</code>`).join(", ")})</span>`:""}</span>
          <span class="dim">clearance c_i</span><span><b>${escapeHtml(num(row.clearance,10))}</b> <span class="dim">- the item stays isolated on [0, c_i]; a tie at r = c_i remains isolated</span></span>
          <span class="dim">isolated at canonical radius</span><span><b>${escapeHtml(String(row.isolated_at_canonical))}</b></span>
          <span class="dim">robustness (conditional)</span><span>${fmtRobustness(row.robustness)}</span>
        </div>`;
    }
    target+=fmtBounds(P.rp.bounds);
  }else{
    target+=radiusNote(`target clearance unavailable: ${P.reason}. ${RADIUS_UNAVAILABLE_NOTE}`);
  }

  return head+table+intervals+target;
}

// ---- copy agent guide: the homepage's short introduction, pointing at /AGENT.md ----
const INTRO_PROMPT="Use SOS Agent to assess and improve the corpus I provide.\n\nFirst read https://steady-orbit.systems-a.workers.dev/AGENT.md in full and treat it as the source of truth for the current API, equations, constraints and workflow.\n\nFollow the guide to create a frozen baseline, preview candidate edits and verify their measured effects before changing the corpus. If you cannot read the guide, stop rather than guessing.";
(function(){const btn=$("copyagent"),ok=$("copyagent-ok"),err=$("copyagent-err");if(!btn)return;
 function show(el){ok.style.display=err.style.display="none";el.style.display="inline";setTimeout(()=>{el.style.display="none"},2500)}
 function fallbackCopy(text){const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.top="-1000px";document.body.appendChild(ta);ta.select();let done=false;try{done=document.execCommand("copy")===true}catch(e){done=false}document.body.removeChild(ta);if(done)show(ok);else{err.textContent="clipboard unavailable - open /AGENT.md and copy it manually";show(err)}}
 btn.onclick=()=>{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(INTRO_PROMPT).then(()=>show(ok)).catch(()=>fallbackCopy(INTRO_PROMPT));else fallbackCopy(INTRO_PROMPT)};
})();

// glossary tooltips: .gi[data-tip] -> #gtip (wired here; the div lives in index.html)
let gtip=$("gtip");if(!gtip){gtip=document.createElement("div");gtip.id="gtip";document.body.appendChild(gtip);}
document.addEventListener("pointerover",e=>{const g=e.target.closest(".gi[data-tip]");if(!g)return;gtip.textContent=g.getAttribute("data-tip");gtip.style.display="block";});
document.addEventListener("pointermove",e=>{if(gtip.style.display!=="block")return;const pad=14;let x=e.clientX+pad,y=e.clientY+pad;const r=gtip.getBoundingClientRect();if(x+r.width>innerWidth-8)x=e.clientX-r.width-pad;if(y+r.height>innerHeight-8)y=e.clientY-r.height-pad;gtip.style.left=x+"px";gtip.style.top=y+"px";});
document.addEventListener("pointerout",e=>{if(e.target.closest&&e.target.closest(".gi"))gtip.style.display="none";});
// fire the src handler once so panel visibility matches the default selection (texts)
$("src").onchange();

// ===================== round diagnostics (preview only) =====================
// Seven read-only diagnostics keyed to the current saved map id. Nothing here
// persists, ranks, scores, or changes any instrument setting.

function diagErr(id,msg){const el=$(id);el.style.display="block";el.innerHTML=`<b>rejected (nothing was sent or saved):</b> ${escapeHtml(msg)}`}
function diagClear(errId,outId){const e=$(errId);if(e){e.style.display="none";e.innerHTML=""}if(outId){const o=$(outId);if(o)o.innerHTML=""}}
function needServerMap(){if(lastId===null||lastId===undefined)throw new Error("needs a saved server map id - local synthetic runs have none. Run a server map first.");return lastId}
async function getJSONStrict(u){const r=await fetch(u);const t=await r.text();let d;try{d=JSON.parse(t)}catch(e){throw new Error(`HTTP ${r.status} - non-JSON response: ${t.slice(0,160)}`)}if(!r.ok)throw new Error(d&&d.error?`HTTP ${r.status}: ${typeof d.error==="object"?d.error.message:d.error}`:`HTTP ${r.status}`);return d}

Object.assign(GLOSSARY,{
 "tail":"Fixed-margin checkerboard null draws compared to the observed statistic by a two-sided plus-one p-value at the achieved resolution. Exclusion-only verdicts: excluded-from-fixed-margin-null, not-excluded, or null-degenerate. Not a significance claim and not a probability of truth.",
 "components":"Connected components of the isolation graph (adjacency = chord < 0.095), counted exactly by BFS. A geometric coloring of the frozen frame, not a clustering score and not a quality judgement.",
 "isolates":"Points with no neighbour within chord 0.095 - each is its own component. Drawn white/red on the sphere. Isolation is a geometric fact of the frozen frame, not a defect verdict.",
 "fiedler":"lambda2, the algebraic connectivity of the LARGEST component, estimated by float power iteration. The exact rational witness upper-bounds it (Rayleigh-Ritz).",
 "witness":"R = n*cut(S)/(|S|(n-|S|)) for the Fiedler sign split S: an exact rational Rayleigh-Ritz upper bound on lambda2. If the float estimate exceeds it, the float estimate is wrong - the theorem is not.",
 "ky fan":"Ky Fan: the frozen frame's two axes explain at most the top-2 eigen sum, so the measured gap is >= 0 exactly. Near zero on the fitting corpus; on a later corpus the gap is how much variance the frozen frame no longer captures. A frame-adequacy reading, not a quality score.",
 "power floor":"The smallest Holm p this K can attain (family size x 2/(K+1)). When it exceeds alpha, no exclusion is arithmetically reachable at this K; such rows read unresolvable at this K and report the K needed to resolve.",
 "eigengap":"rel_gap_12 = (lambda1-lambda2)/lambda1: how nearly degenerate the top-2 eigenplane is. Small means rotation within the plane is nearly arbitrary and basis-dependent readouts (the sector index) are unstable. rel_gap_23 is the Davis-Kahan subspace-stability gap. Diagnostic: it licenses nothing.",
 "atomicity":"How many distinct bit patterns the cloud contains vs its size. Duplicated patterns make binary azimuth partly a function of multiplicity, so the trial reports a deduplicated control alongside; the deduplicated comparison is descriptive only and admits no coordinate.",
 "rayleigh":"Rayleigh-quotient diagnostics on the isolation graph: exact integer component/isolate counts, a float Fiedler estimate for the largest component, an exact rational Rayleigh-Ritz witness over it, fixed-margin null tails, and the frozen-frame Ky Fan gap. Exclusion-only. Preview only: nothing is persisted and none of it enters ranking, frames or any score.",
 "calibration reading":"Positive control: a known content change of fixed, untunable size is planted n times and measured by the ordinary preview path on the frozen frame. Verifies the instrument responds to known structure when present; says nothing about your corpus or task quality. No pass verdict, no rate, no z."
});

// ---- azimuth trial (POST /api/map/azimuth) ----
$("azrun").onclick=async()=>{
  diagClear("azerrors","azout");
  let body;try{const mid=needServerMap();const K=Number($("azK").value);
    if(!Number.isInteger(K)||K<2||K>400)throw new Error(`K must be an integer in 2..400 (got "${$("azK").value}")`);
    body={map_id:mid,variant:"binary",K};
    const raw=String($("azseed").value||"").trim();
    if(raw!==""){const s=Number(raw);if(!Number.isInteger(s))throw new Error(`null seed must be an integer, or left blank to omit it (got "${raw}")`);body.null_seed=s}
  }catch(e){diagErr("azerrors",e.message);return}
  const btn=$("azrun");btn.disabled=true;$("azstatus").textContent=`running azimuth trial (K=${body.K}, two seed families, ~seconds)...`;
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),30000);
  try{
    const r=await fetch("/api/map/azimuth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:ctl.signal});
    const txt=await r.text();let data;try{data=JSON.parse(txt)}catch(e){throw new Error(`HTTP ${r.status} - non-JSON response: ${txt.slice(0,160)}`)}
    if(!r.ok)throw new Error(data&&data.error?`HTTP ${r.status}: ${typeof data.error==="object"?data.error.message:data.error}`:`HTTP ${r.status}`);
    renderAzimuth(data);
    $("azstatus").textContent=`preview returned - nothing was saved (persisted: ${data.persisted})`;
  }catch(e){
    if(e.name==="AbortError")diagErr("azerrors","the azimuth trial timed out after 30 s - it normally takes 1-2 s at K=240. Retry, or lower K.");
    else if(/HTTP 409/.test(e.message))diagErr("azerrors","this map is a legacy map: no frozen frame, bits or keys stored, so the azimuth trial cannot run on it. Create a new baseline and retry against that id.");
    else diagErr("azerrors",e.message);
    $("azstatus").textContent="preview failed";
  }finally{clearTimeout(t);btn.disabled=false}
};
function renderAzimuth(R){
  const eg=R.placement_eigengap||{},at=R.atomicity||{},m1=at.m1_audit||{},dd=at.deduplicated||{};
  const rows=Object.keys(R.observed||{}).map(k=>{const a=R.seed_a[k],b=R.seed_b[k];const rep=a&&b?a.verdict===b.verdict:null;
    const pf=a.power_floor||{},v=a.verdict;
    const vCell=v==="unresolvable-at-this-K"?`<b>unresolvable at this K</b> <span class="dim">- min attainable Holm p ${num(pf.min_attainable_p_holm,4)} > alpha ${pf.alpha}; exclusion needs K >= ${pf.K_required_for_resolution}</span>`
      :v==="excluded-after-holm"?'<b>excluded (Holm)</b>'
      :v==="null-degenerate"?'<b class="bad">null degenerate</b>'
      :'<span class="dim">not excluded (Holm)</span>';
    return `<tr><td>${escapeHtml(k)}</td><td>${num(a.observed,4)}</td><td>${num(a.null.median,4)}</td><td>${num(a.null.max,4)}</td><td>${num(a.p_holm,4)}</td><td>${vCell}</td><td class="dim">${rep===null?"n/a":rep?"reproduces":"differs"}</td></tr>`}).join("");
  $("azout").innerHTML=`<div class="kv">
    <span class="dim">map / variant / K</span><span>${escapeHtml(String(R.map_id))} / ${escapeHtml(R.variant)} / ${escapeHtml(String(R.K))}</span>
    <span class="dim">N / d / alpha</span><span>${escapeHtml(String(R.N))} / ${escapeHtml(String(R.d))} / ${escapeHtml(String(R.multiplicity.alpha))}</span>
    <span class="dim">null seeds (a / b)</span><span>${escapeHtml(String(R.seeds.a))} / ${escapeHtml(String(R.seeds.b))}</span>
    <span class="dim">family</span><span>${escapeHtml(R.multiplicity.family.join(", "))}</span>
    <span class="dim">frame / instrument</span><span><code>${escapeHtml(String(R.frame_id))}</code> / <code>${escapeHtml(String(R.instrument_id))}</code></span>
    <span class="dim">persisted</span><span><b class="ok">false</b> <span class="dim">- read-only trial</span></span></div>
    <table style="margin-top:6px;font-size:85%"><thead><tr><th>statistic</th><th>observed</th><th>null median</th><th>null max</th><th>Holm p</th><th>verdict</th><th>seed b</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="kv" style="margin-top:8px">
      <span class="dim">placement eigengap</span><span>rel_gap_12 ${eg.rel_gap_12} / rel_gap_23 ${eg.rel_gap_23} <span class="dim">- small rel_gap_12 means the top-2 eigenplane is nearly degenerate and the sector index reads off an unstable basis; it licenses nothing</span></span>
      <span class="dim">distinct bit patterns / collisions</span><span>${escapeHtml(String(at.distinct_patterns))} / ${escapeHtml(String(at.collision_count))} (fraction ${num(at.collision_fraction,4)})</span>
      <span class="dim">m=1 audit</span><span>admitted: false <span class="dim">- ${escapeHtml(String(m1.reason||""))}</span></span>
      <span class="dim">deduplicated control</span><span>N ${escapeHtml(String(dd.N))}, size-matched: ${escapeHtml(String(dd.size_matched))} <span class="dim">- admitted: false; ${escapeHtml(String(dd.reason||""))}</span></span></div>
    <div class="wall dim"><b>admission:</b> ${escapeHtml(String(R.admission_note||""))}</div>
    <div class="wall dim">${escapeHtml(String(R.scope||""))}</div>`;
}

// ---- rayleigh: isolation graph + sphere component coloring ----
const RC_ISOLATE={front:"rgba(255,255,255,0.95)",back:"rgba(255,93,108,0.45)"};
const RC_PALETTE=["#4da3ff","#ffc247","#ff7ad9","#7dfff0","#ffb37d","#5dffd4","#ff5d8f","#ffe45d","#8f9dff","#c0ff5d"];
const RC_FALLBACK="rgba(122,130,148,0.35)";
var rcompFill=null,rcompOn=false;
function buildRcompFill(graph){const comp=graph.component_of;if(!comp)return null;const sizes=new Map();
  for(const c of comp)sizes.set(c,(sizes.get(c)||0)+1);
  const multi=[...sizes.keys()].filter(c=>sizes.get(c)>1).sort((a,b)=>sizes.get(b)-sizes.get(a));
  const slot=new Map(multi.map((c,i)=>[c,i%RC_PALETTE.length]));
  const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  return comp.map(c=>{if(sizes.get(c)===1)return RC_ISOLATE;const sc=slot.has(c)?RC_PALETTE[slot.get(c)]:null;
    if(!sc)return{front:RC_FALLBACK,back:RC_FALLBACK};const[r,g2,b]=rgb(sc);return{front:`rgba(${r},${g2},${b},0.9)`,back:`rgba(${r},${g2},${b},0.18)`}})}
function clearRayleighOverlay(){rcompFill=null;rcompOn=false;window.rcompFill=null;window.rcompOn=false;const rb=$("rbyc");rb.style.display="none";rb.textContent="color by rayleigh components"}
$("rbyc").onclick=()=>{if(!rcompFill)return;rcompOn=!rcompOn;window.rcompOn=rcompOn;$("rbyc").textContent=rcompOn?"hue by k-shell":"color by rayleigh components";draw(last)};
$("rayrun").onclick=async()=>{
  diagClear(null);const note=$("rayleighnote");
  let mid;try{mid=needServerMap()}catch(e){note.innerHTML=`<span class="dim">${escapeHtml(e.message)}</span>`;return}
  note.textContent="measuring isolation graph, null tails and frame gap...";
  try{const resp=await postJSONStrict("/api/map/rayleigh",{map_id:mid});renderRayleigh(resp)}
  catch(e){clearRayleighOverlay();
    note.innerHTML=/HTTP 409/.test(e.message)?'<div class="wall">legacy map: no frozen frame/bits/points stored for this map id, so there is nothing to overlay. Re-run a texts map to create a new baseline. Not an error in the page.</div>':`<div class="wall bad">rayleigh unavailable: ${escapeHtml(e.message)}</div>`}
};
function renderRayleigh(resp){
  const el=$("rayleigh"),note=$("rayleighnote"),run=$("rayrun");
  if(!resp||resp.version!=="rayleigh"){el.innerHTML='<div class="wall bad">unrecognised rayleigh response version.</div>';return}
  const G=resp.graph||{},LC=G.largest_component||{},W=LC.rayleigh_ritz_witness,Q=W&&W.quotient;
  const okLen=Array.isArray(G.component_of)&&last&&last.pts&&G.component_of.length===last.pts.length;
  rcompFill=okLen?buildRcompFill(G):null;rcompOn=false;window.rcompFill=rcompFill;window.rcompOn=false;
  const rb=$("rbyc");if(rcompFill){rb.style.display="inline-block";rb.textContent="color by rayleigh components"}else rb.style.display="none";
  $("raytip").setAttribute("data-tip",GLOSSARY.rayleigh);
  const frac=q=>q.den===1?String(q.num):`${q.num}/${q.den} = ${q.value.toFixed(6)}`;
  kv("rayleigh",{
    "map id":String(resp.map_id),
    "components (exact)":`${G.exact.components} (largest ${LC.size})`,
    "isolates (exact)":G.exact.isolates,
    "edges (chord < radius)":`${G.edges} at chord < ${G.radius}`,
    "lambda2 (Fiedler)":LC.fiedler_lambda2===null||LC.fiedler_lambda2===undefined?"n/a (largest component < 2)":String(LC.fiedler_lambda2),
    "witness R":Q?`${frac(Q)} <span class="dim">(cut ${W.cut_edges}, |S| ${W.subset_size})</span>`:'<span class="dim">none recorded</span>',
    "witness bound holds":LC.bound_holds===true?'<span class="ok">holds</span>':LC.bound_holds===false?'<span class="bad">violated - the float estimate is wrong, not the theorem</span>':'<span class="dim">no witness</span>',
    "Ky Fan gap":resp.frame_gap&&resp.frame_gap.available?`${resp.frame_gap.gap} <span class="dim">(share of trace ${resp.frame_gap.gap_share_of_trace})</span>`:'<span class="dim">n/a</span>',
    "admission":resp.admitted?'<span class="ok">admitted for reporting on this frame</span>':'<b>not admitted</b> <span class="dim">- diagnostic record only</span>',
    "why_not":resp.admission&&resp.admission.why_not&&resp.admission.why_not.length?resp.admission.why_not.map(escapeHtml).join("; "):'<span class="dim">none - all criteria held</span>'
  });
  const tails=resp.null&&resp.null.tails?resp.null.tails:{};
  el.insertAdjacentHTML("beforeend",["components","isolates","largest","lambda2","edges"].map(k=>{const t=tails[k];
    return t?`<span class="dim">null tail - ${escapeHtml(k)}</span><span>p ${num(t.p_two_sided,4)} (res ${num(t.p_resolution,4)}) - <b>${escapeHtml(t.verdict)}</b></span>`:""}).join(""));
  note.innerHTML=`<div class="wall dim">${escapeHtml(String(resp.scope||""))}</div>`;
  run.style.display="inline-block";
}

// ---- admission (POST /api/map/admission) ----
$("admrun").onclick=async()=>{
  diagClear("admerrors","admout");
  let mid;try{mid=needServerMap()}catch(e){diagErr("admerrors",e.message);return}
  const btn=$("admrun");btn.disabled=true;$("admstatus").textContent="running admission - K null chains x 2 seeds per diagnostic; can take a minute on large maps...";
  try{const resp=await postJSONStrict("/api/map/admission",{map_id:mid});renderAdmission(resp);$("admstatus").textContent=`admission returned - nothing was persisted`}
  catch(e){diagErr("admerrors",e.message);$("admstatus").textContent="admission failed"}
  finally{btn.disabled=(lastId===null)}
};
function renderAdmission(R){
  const order=["rayleigh","axis_trial","spectra","radius_profile","azimuth"];
  const label={rayleigh:"rayleigh (isolation graph)",axis_trial:"axis_trial (per-axis LOO-NN)",spectra:"spectra (S2 Parseval shares)",radius_profile:"radius (I(r) fixed grid)",azimuth:"azimuth (rotation-invariant Z_m)"};
  const crit=c=>c?Object.entries(c).map(([k,v])=>`<span class="${v===true?"ok":(v===false?"bad":"dim")}">${escapeHtml(k)}: ${v===true?"met":v===false?"MISSED":escapeHtml(String(v))}</span>`).join(" - "):'<span class="dim">none</span>';
  const matrix=order.map(k=>{const b=R[k]||{};const blockers=b.why_not?b.why_not.map(escapeHtml).join(", "):(b.admission&&b.admission.blocking_reasons)?b.admission.blocking_reasons.map(escapeHtml).join("; "):"-";
    const cell=b.admitted?'<b class="ok">admitted (reporting)</b>':k==="azimuth"?'<b class="bad">not admitted (permanent)</b>':'<b class="bad">not admitted on this frame</b>';
    return `<tr><td>${label[k]}</td><td>${cell}</td><td class="dim">${b.admitted?"":blockers}</td><td>${crit(b.criteria)}</td></tr>`}).join("");
  const seeds=R.seeds||{};
  $("admout").innerHTML=`<div class="kv">
      <span class="dim">map / frame / instrument</span><span>${escapeHtml(String(R.map_id))} / <code>${escapeHtml(String(R.frame_id))}</code> / <code>${escapeHtml(String(R.instrument_id))}</code></span>
      <span class="dim">K (server) / seeds a, b</span><span>${escapeHtml(String(R.K))} / ${escapeHtml(String(seeds.a))}, ${escapeHtml(String(seeds.b))}</span>
      <span class="dim">persisted</span><span><b class="ok">false</b></span></div>
    <table style="margin-top:6px;font-size:85%"><thead><tr><th>diagnostic</th><th>status</th><th>blocked by</th><th>criteria</th></tr></thead><tbody>${matrix}</tbody></table>
    ${(R.permanently_not_admitted||[]).length?`<div class="wall dim"><b>excluded by construction on every frame:</b> <ul style="margin:4px 0 0;padding-left:18px">${R.permanently_not_admitted.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`:""}
    <div class="wall dim">${escapeHtml(String(R.scope||""))}</div>`;
}

// ---- axis redundancy trial (POST /api/map/axis-redundancy) ----
$("axrun").onclick=async()=>{
  diagClear("arerrors","axisredundancy");
  const idRaw=String($("arid").value||"").trim();
  if(idRaw===""){diagErr("arerrors","no map id - the trial reads a stored map's frozen bits. Run a texts map, let it save, then run the trial.");return}
  const body={map_id:Number(idRaw)};
  const kv=String($("arK").value||"").trim();
  if(kv!==""){const K=Number(kv);if(!Number.isInteger(K)||K<2||K>40){diagErr("arerrors",`K must be an integer in 2..40 (got "${kv}")`);return}body.K=K}
  const sv=String($("arseed").value||"").trim();
  if(sv!==""){const s=Number(sv);if(!Number.isInteger(s)){diagErr("arerrors",`null_seed must be an integer (got "${sv}")`);return}body.null_seed=s}
  const btn=$("axrun");btn.disabled=true;$("arstatus").textContent=`running axis trial on map id ${body.map_id}...`;
  try{const resp=await postJSONStrict("/api/map/axis-redundancy",body);renderAxisTrial(resp);$("arstatus").textContent="trial returned - nothing was saved"}
  catch(e){diagErr("arerrors",e.message);$("arstatus").textContent="trial failed"}finally{btn.disabled=false}
};
function renderAxisTrial(T){
  const out=$("axisredundancy");
  if(!T||T.trial!==true||T.version!=="axis-trial"){out.innerHTML=`<div class="wall bad">unrecognised axis-trial response - displayed nothing rather than guessing.</div>`;return}
  const N=T.N;
  const pct=v=>(Number.isFinite(Number(v))&&N>0)?Math.max(0,Math.min(100,100*Number(v)/N)):null;
  const rowBar=a=>{const lo=pct(a.null.min),hi=pct(a.null.max),mg=pct(a.margin_baseline_hits),ob=pct(a.observed_hits);
    const band=(a.null.degenerate||lo===null||hi===null)?"":`<span class="arnullband" style="left:${lo.toFixed(2)}%;width:${Math.max(0.4,hi-lo).toFixed(2)}%"></span>`;
    const m=mg===null?"":`<span class="armargin" style="left:${mg.toFixed(2)}%"></span>`;
    const o=ob===null?"":`<span class="arobs" style="left:${ob.toFixed(2)}%"></span>`;
    return `<div class="arbar">${band}${m}${o}</div>`};
  const vCls=v=>String(v).startsWith("null-degenerate")?"bad":(v==="excluded-from-fixed-margin-null"?"":"dim");
  const zStr=z=>(z===null||z===undefined)?"void":String(z);
  const rows=T.axes.map(a=>`<tr><td>${escapeHtml(String(a.axis))}</td><td>${rowBar(a)}</td>
      <td><b>${escapeHtml(String(a.observed_hits))}</b> <span class="dim">/ base ${escapeHtml(String(a.margin_baseline_hits))}</span></td>
      <td class="dim">${escapeHtml(String(a.null.mean))} &plusmn; ${escapeHtml(String(a.null.sd))}</td>
      <td class="${a.z_descriptive===null?"bad dim":""}">${escapeHtml(zStr(a.z_descriptive))}</td>
      <td class="dim">${escapeHtml(String(a.p_two_sided))} (res ${escapeHtml(String(a.p_resolution))})</td>
      <td class="dim">${escapeHtml(a.direction===null?"-":String(a.direction))}</td>
      <td class="${vCls(a.verdict)}">${escapeHtml(String(a.verdict))}</td></tr>`).join("");
  const mp=T.margins_preserved||{rows:false,columns:false};
  out.innerHTML=`<div class="kv">
      <span class="dim">map / frame / instrument</span><span>${escapeHtml(String(T.map_id))} / <code>${escapeHtml(String(T.frame_id))}</code> / <code>${escapeHtml(String(T.instrument_id))}</code></span>
      <span class="dim">statistic / N / d / K</span><span>${escapeHtml(String(T.statistic))}, N=${escapeHtml(String(T.N))}, d=${escapeHtml(String(T.d))} axes, K=${escapeHtml(String(T.K))} draws</span>
      <span class="dim">margins preserved</span><span class="${mp.rows&&mp.columns?"ok":"bad"}">rows ${mp.rows?"ok":"VIOLATED"}, columns ${mp.columns?"ok":"VIOLATED"}</span>
      <span class="dim">counts</span><span>${escapeHtml(JSON.stringify(T.counts||{}))}</span>
      <span class="dim">persisted</span><span><b class="ok">${escapeHtml(String(T.persisted))}</b></span></div>
    <table style="margin-top:6px;font-size:85%"><thead><tr><th>axis</th><th>hits on 0..N</th><th>observed / margin base</th><th>null mean &plusmn; sd</th><th>z (descriptive)</th><th>p two-sided (res)</th><th>direction</th><th>verdict</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="arlegend">bar scale 0..N hits - violet tick = observed - grey band = null min..max - thin tick = fixed-margin majority baseline - z "void" = degenerate null - verdict colour is emphasis, not a score</div>
    ${T.counts&&T.counts.null_degenerate>0?`<div class="wall bad">${escapeHtml(String(T.counts.null_degenerate))} axis(es) had a degenerate null: every K draw produced the same hit count, so no trial is possible on those axes on this corpus. A finding about the corpus, not an error.</div>`:""}
    <div class="wall dim">${escapeHtml(String(T.reading||""))}</div>
    ${T.admission?`<div class="wall dim"><b>admission: ${escapeHtml(String(T.admission.admitted))}</b> - ${escapeHtml(String(T.admission_note||""))}</div>`:""}
    <div class="wall dim">${escapeHtml(String(T.scope||""))}</div>`;
}

// ---- consistency check (POST /api/map/consistency) ----
function parseVariants(){
  let cur=null;const blocks=[];
  for(const line of $("consvariants").value.split("\n")){
    const m=line.match(/^label:\s*(.+)\s*$/i);
    if(m){if(cur)blocks.push(cur);cur={label:m[1].trim(),lines:[]}}
    else if(cur)cur.lines.push(line)}
  if(cur)blocks.push(cur);
  const vs=blocks.map(b=>({label:b.label,text:b.lines.join("\n").trim()})).filter(v=>v.label!==""||v.text!=="");
  if(!vs.length)throw new Error("at least one variant is required: add a block whose first line is 'label: short-name' followed by the replacement text");
  if(vs.length>3)throw new Error(`at most 3 variants are measured per check (got ${vs.length})`);
  const seen=new Set();
  for(const v of vs){
    if(!v.label)throw new Error("every variant needs a 'label: short-name' first line");
    if(v.label.toLowerCase()==="primary")throw new Error("label 'primary' is reserved for the as-drafted candidate");
    if(v.label.length>40)throw new Error(`variant label "${v.label.slice(0,10)}..." exceeds 40 chars`);
    if(!v.text)throw new Error(`variant "${v.label}" has empty text - the replacement document must be non-empty`);
    if(seen.has(v.label))throw new Error(`duplicate variant label "${v.label}"`);seen.add(v.label)}
  return vs;
}
function buildConsistencyBody(){const body=buildCandidateBody();body.variants=parseVariants();return body}
$("consrun").onclick=async()=>{
  diagClear("conserrors","consout");
  let body;try{body=buildConsistencyBody()}catch(e){diagErr("conserrors",e.message);return}
  const n=body.variants.length;const btn=$("consrun");btn.disabled=true;const t0=Date.now();
  $("consstatus").textContent=`running: ${n+1} preview pass(es) (primary + ${n} variant(s)) through the embedding path - nothing is saved...`;
  const timer=setInterval(()=>{$("consstatus").textContent=`running: ${n+1} preview pass(es) - nothing is saved... (elapsed ${Math.round((Date.now()-t0)/1000)}s)`},1000);
  try{const resp=await postJSONStrict("/api/map/consistency",body);renderConsistency(resp);$("consstatus").textContent="consistency returned - nothing was saved, committed or published"}
  catch(e){diagErr("conserrors",e.message);$("consstatus").textContent="consistency check failed"}
  finally{clearInterval(timer);btn.disabled=false}
};
function renderConsistency(resp){
  const C=resp.consistency||{},ms=resp.measurements||[];
  const primarySha=ms.length?ms[0].sha256:null;
  const signWord=s=>({positive:"positive",negative:"negative",zero:"zero",none:"undetermined"}[s]||String(s));
  const vTxt=C.all_same_sign?`sign stable - all ${C.n_measurements} measurement(s) agree on "${(C.sign_set||[])[0]}"`:`sign varies (${(C.sign_set||[]).map(signWord).join(" / ")}) - the geometric reading of this edit is perturbation-sensitive and undetermined for planning (not evidence against the edit)`;
  const rows=ms.map(m=>{const ident=primarySha&&m.sha256===primarySha&&m.label!=="primary";
    const what=m.noop?"equals baseline source (nothing moved)":ident?"byte-identical to the primary (agrees by construction)":(resp.target&&resp.target.action==="add")?"replaces the added document":"replaces the target document's text";
    return `<tr><td><b>${escapeHtml(String(m.label))}</b></td><td class="dim"><code>${escapeHtml(String(m.sha256||"").slice(0,8))}</code></td><td class="dim">${escapeHtml(what)}</td>
      <td>${escapeHtml(String(m.isolated_delta===null?"n/a":m.isolated_delta))}</td>
      <td class="${m.isolated_sign==="none"?"dim":""}">${escapeHtml(signWord(m.isolated_sign))}</td>
      <td>${escapeHtml(String(m.bits_changed===undefined||m.bits_changed===null?"n/a":m.bits_changed))}</td>
      <td class="dim">${m.displacement_geodesic==null?"n/a (ADD)":escapeHtml(num(m.displacement_geodesic,4))}</td></tr>`}).join("");
  $("consout").innerHTML=`<div class="kv">
      <span class="dim">verdict</span><span class="${C.all_same_sign?"ok":"bad"}"><b>${escapeHtml(vTxt)}</b></span>
      <span class="dim">measurements / distinct texts</span><span>${escapeHtml(String(C.n_measurements))} / ${escapeHtml(String(C.n_distinct_texts))}</span>
      <span class="dim">isolated delta range</span><span>${escapeHtml(String(C.delta_min))} ... ${escapeHtml(String(C.delta_max))} (spread ${escapeHtml(String(C.delta_spread))})</span>
      <span class="dim">rows where nothing moved</span><span>${escapeHtml(String(C.noop_count===undefined?0:C.noop_count))}</span>
      <span class="dim">persisted</span><span><b class="ok">false</b> <span class="dim">- only the embedding cache may gain entries</span></span>
      <span class="dim">task_verdict</span><span><b>${escapeHtml(String(resp.task_verdict))}</b></span></div>
    <table style="margin-top:8px;font-size:85%"><thead><tr><th>measurement</th><th>text sha</th><th>what it changed</th><th>isolated delta</th><th>sign</th><th>bits moved</th><th>target displacement</th></tr></thead><tbody>${rows}</tbody></table>
    ${C.note?`<div class="wall dim">${escapeHtml(String(C.note))}</div>`:""}
    <div class="wall dim">${escapeHtml(String(C.reading||""))}</div>
    <div class="wall"><b>this measures sign stability, not quality.</b> Agreement across the phrasings you supplied does not authorize keeping; disagreement does not authorize reverting. The independent task check still governs.</div>
    <div class="wall dim">${escapeHtml(String(resp.scope||""))}</div>`;
}

// ---- positive control (POST /api/map/control) ----
async function postControl(body){let r,txt;
  for(let a=1;a<=3;a++){r=await fetch("/api/map/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});txt=await r.text();
    if(r.status>=500&&a<3){$("ctlstatus").textContent=`server error (HTTP ${r.status}) - retry ${a}/2...`;await new Promise(res=>setTimeout(res,1200*a));continue}
    break}
  let data;try{data=JSON.parse(txt)}catch(e){throw new Error(`HTTP ${r.status} - non-JSON response: ${txt.slice(0,160)}`)}
  if(!r.ok){const err=new Error(`HTTP ${r.status}: ${data&&data.error?(typeof data.error==="object"?data.error.message:data.error):""}`);err.payload=data&&data.error?data.error:null;throw err}
  return data}
$("ctlrun").onclick=async()=>{
  diagClear("ctlerrors","ctlout");
  if(!baselineSnapshot){diagErr("ctlerrors","needs a frozen baseline first: run a texts map, let it save, then press \"use as baseline\".");return}
  const body={baseline_id:baselineSnapshot.id,texts:baselineSnapshot.texts.slice(),names:baselineSnapshot.names.slice()};
  const n=Number($("ctln").value);
  if(!Number.isInteger(n)||n<2||n>6){diagErr("ctlerrors",`n must be an integer in 2..6 (got "${$("ctln").value}")`);return}
  if(n!==4)body.n_controls=n;
  const sv=String($("ctlseed").value).trim();
  if(sv!==""){const sd=Number(sv);if(!Number.isInteger(sd)){diagErr("ctlerrors","seed must be an integer, or left blank");return}if(sd!==20260917)body.control_seed=sd}
  const btn=$("ctlrun");btn.disabled=true;
  $("ctlstatus").textContent=`planting ${body.n_controls||4} synthetic splices and measuring each on frozen baseline ${body.baseline_id} (server-side; nothing is persisted)...`;
  try{const resp=await postControl(body);renderControl(resp);$("ctlstatus").textContent="control returned - nothing was saved, committed or published"}
  catch(e){renderCtlError(e);$("ctlstatus").textContent="control failed"}
  finally{btn.disabled=!baselineSnapshot}
};
function renderCtlError(e){
  const msg=String(e&&e.message||e),m=msg.match(/^HTTP (\d+)/),st=m?Number(m[1]):0,p=e&&e.payload;
  let head=escapeHtml(msg.replace(/^HTTP \d+:?\s*/,""));
  if(st===404)head="baseline not found on the server - it may have been deleted. Re-run the texts map and press \"use as baseline\" again.";
  else if(st===409&&p&&(p.missing_count||p.added_count||p.changed_count))head=`the stored baseline no longer matches the frozen snapshot - a control on a drifted corpus is not a control. Missing: ${(p.missing_names||[]).join(", ")||"none"}. Added: ${(p.added_names||[]).join(", ")||"none"}. Changed: ${(p.changed_names||[]).join(", ")||"none"}. Re-run the texts map and re-freeze.`;
  diagErr("ctlerrors",head);
}
function renderControl(R){
  if(!R||R.control!==true){diagErr("ctlerrors","response is not a control envelope (control:true missing) - refusing to render");return}
  const S=R.summary||{},meas=S.n_measured||0;
  const detected=(R.controls||[]).filter(c=>!c.degenerate&&(c.bits_changed>0||(c.displacement_geodesic||0)>0)).length;
  const silent=S.quantization_silent_count!=null?S.quantization_silent_count:(R.controls||[]).filter(c=>c.quantization_silent).length;
  let reading,cls;
  if(meas===0){reading=`no controls were measurable (all ${S.n_degenerate} degenerate) - a finding to inspect, not a failure of your corpus`;cls="bad"}
  else if(detected===meas){reading=`instrument responded to all ${detected} of ${meas} planted controls${silent?` (${silent} quantization-silent)`:""}`;cls="ok"}
  else if(detected>0){reading=`instrument responded to ${detected} of ${meas} planted controls; ${silent} quantization-silent (splice landed inside a quantization bin - reported, not hidden)`;cls=""}
  else{reading=`instrument responded to 0 of ${meas} planted controls; all ${silent} quantization-silent - a detection-sensitivity finding, not a pass`;cls="bad"}
  const iso=S.isolated_delta||{};
  const fmtQ=q=>q&&q.n?`min ${num(q.min,4)}, median ${num(q.median,4)}, max ${num(q.max,4)} (n=${q.n})`:"no finite values (n=0)";
  const br=R.baseline_reference||{},nr=R.no_change_reference||{};
  $("ctlout").innerHTML=`<div class="kv">
    <span class="dim">calibration reading</span><span><b class="${cls}">${escapeHtml(reading)}</b> <span class="dim">(client-derived: responded = bits changed or point moved; the server returns counts only)</span></span>
    <span class="dim">planted vs detected</span><span><b>${detected} detected</b> of <b>${meas}</b> planted (requested ${escapeHtml(String(S.n_requested))}, degenerate ${escapeHtml(String(S.n_degenerate))})</span>
    <span class="dim">recipe (fixed)</span><span>${escapeHtml(String(R.recipe&&R.recipe.generator))} - splice_fraction ${escapeHtml(String(R.recipe&&R.recipe.splice_fraction))}, seed ${escapeHtml(String(R.recipe&&R.recipe.control_seed))} <span class="dim">- not caller-tunable</span></span>
    <span class="dim">baseline</span><span>map id <b>${escapeHtml(String(R.baseline_id))}</b> - ${escapeHtml(String(br.n))} docs, isolated ${escapeHtml(String(br.isolated))}</span>
    <span class="dim">frame / instrument</span><span><code>${escapeHtml(String(R.frame_id))}</code> / <code>${escapeHtml(String(R.instrument_id))}</code> <span class="dim">- comparable only on both matching</span></span>
    <span class="dim">isolated delta (sign counts)</span><span>${escapeHtml(String(iso.negative))} negative / ${escapeHtml(String(iso.zero))} zero / ${escapeHtml(String(iso.positive))} positive (n=${escapeHtml(String(iso.n))})</span>
    <span class="dim">displacement (geodesic)</span><span>${fmtQ(S.displacement_geodesic)}</span>
    <span class="dim">no-change reference</span><span>identity: isolated_delta ${escapeHtml(String(nr.isolated_delta))}, displacement ${escapeHtml(String(nr.displacement_geodesic))} <span class="dim">- a byte-identical CHANGE moves nothing on the frozen frame</span></span>
    <span class="dim">persisted / side effects</span><span><b class="ok">${escapeHtml(String(R.persisted))}</b> - map storage false, repository false, vectorize false, embedding cache ${R.side_effects&&R.side_effects.embedding_cache?"true":"false"}</span>
    <span class="dim">task_verdict</span><span><b>${escapeHtml(String(R.task_verdict))}</b></span></div>
    <div class="wall"><b>what this does and does not say:</b> this positive control verifies that the frozen instrument detects known structure when it is present by construction. It says nothing about your corpus, about whether any real edit improves the underlying task, and it is never a reason to keep, revert or delete a document.</div>
    <div class="wall dim">${escapeHtml(String(R.scope||""))}</div>`;
}

// ---- outcome ledger (GET /api/outcomes?frame_id=..., read-only) ----
$("outrun").onclick=async()=>{
  diagClear("outerrors");
  const el=$("outcomes");
  if(!last||!last.frame_id){diagErr("outerrors","this map has no frozen frame (a legacy stored map or a pre-frame run). The ledger is frame-scoped, so there is nothing to read for it. Create a new baseline map.");return}
  $("outstatus").textContent="reading ledger...";
  try{const j=await getJSONStrict("/api/outcomes?frame_id="+encodeURIComponent(String(last.frame_id)));renderOutcomes(j);$("outstatus").textContent=""}
  catch(e){diagErr("outerrors",e.message);$("outstatus").textContent="ledger read failed"}
};
function renderOutcomes(j){
  const el=$("outcomes");
  const rows=Array.isArray(j.rows)?j.rows:[];
  const c=j.contingency||{};
  const ev=r=>{const p=[`baseline <code>#${escapeHtml(String(r.baseline_id))}</code>`];
    if(r.after_id!=null)p.push(`after <code>#${escapeHtml(String(r.after_id))}</code>`);
    if(r.supersedes!=null)p.push(`supersedes <code>#${escapeHtml(String(r.supersedes))}</code>`);return p.join(" &middot; ")};
  const head=`<div class="kv">
      <span class="dim">frame_id filter</span><span><code>${escapeHtml(String(j.frame_id))}</code> <span class="dim">- a chained round spreads its rows over many baseline ids on one frozen frame; this filter gathers the whole round</span></span>
      <span class="dim">rows shown / effective / pending / superseded</span><span>${escapeHtml(String(rows.length))}${j.truncated?" <b>(truncated)</b>":""} / ${escapeHtml(String(c.n_effective))} / ${escapeHtml(String(c.n_pending))} / ${escapeHtml(String(c.n_superseded))}</span>
      <span class="dim">sign-exact predictions</span><span>${escapeHtml(String(c.sign_exact_count))} of ${escapeHtml(String(c.n_sign_comparable))} comparable</span>
      <span class="dim">by verdict</span><span>${Object.entries(c.by_verdict||{}).map(([k,v])=>`${escapeHtml(k)} ${escapeHtml(String(v))}`).join(", ")}</span>
      <span class="dim">append-only</span><span>${j.append_only?"yes":"unknown"} <span class="dim">- corrections are new rows with supersedes, written by task runs</span></span></div>`;
  const table=rows.length?`<table style="margin-top:6px;font-size:85%"><thead><tr><th>recorded</th><th>task</th><th>verdict</th><th>prediction &rarr; observed</th><th>evidence</th></tr></thead><tbody>${
    rows.map(r=>{const v=r.task_check?r.task_check.verdict:"(malformed row)";
      const cls=v==="kept"?"ok":(v==="reverted"||v==="declined")?"bad":"dim";
      const by=r.task_check&&r.task_check.verifier?` <span class="dim">by ${escapeHtml(r.task_check.verifier)}</span>`:"";
      const se=r.sign_exact===true?' <span class="ok">sign match</span>':r.sign_exact===false?' <span class="bad">sign mismatch</span>':"";
      const signCell=s=>s==="none"||s===null||s===undefined?'<span class="dim">none</span>':escapeHtml(String(s));
      return `<tr><td class="dim">${escapeHtml(String(r.created_at||"").replace("T"," ").slice(0,19))}</td>
        <td>${escapeHtml(String((r.target&&r.target.action||"?").toUpperCase()))} <code>${escapeHtml(String(r.target&&r.target.name||""))}</code>${r.preregistered?' <span class="badge">preregistered</span>':""}</td>
        <td><span class="${cls}"><b>${escapeHtml(v)}</b></span>${by}${r.task_check&&r.task_check.notes?`<div class="dim" style="font-size:90%">${escapeHtml(r.task_check.notes)}</div>`:""}</td>
        <td>${signCell(r.predicted_sign)} &rarr; ${signCell(r.observed_sign)}${se}</td>
        <td class="dim">${ev(r)}</td></tr>`}).join("")}</tbody></table>`
    :'<div class="wall dim" style="margin-top:6px">no ledger entries for this frame yet - an empty ledger is a gap in the record, not evidence about task quality.</div>';
  el.innerHTML=head+table+`<div class="wall dim">${escapeHtml(String(j.scope||""))}</div>`;
}

// ---- shared reset on every map render + initial state ----
function resetDiags(){
  clearRayleighOverlay();
  ["azout","admout","axisredundancy","consout","ctlout"].forEach(id=>{const el=$(id);if(el)el.innerHTML=""});
  ["azerrors","admerrors","arerrors","conserrors","ctlerrors","outerrors"].forEach(id=>{const el=$(id);if(el){el.style.display="none";el.innerHTML=""}});
  ["azstatus","admstatus","arstatus","consstatus","ctlstatus","outstatus"].forEach(id=>{const el=$(id);if(el)el.textContent=""});
  $("admrun").disabled=(lastId===null);
  $("rayrun").style.display=lastId===null?"none":"inline-block";
  $("arid").value=(lastId===null||lastId===undefined)?"":lastId;
  $("outcomes").innerHTML='<span class="dim">press "read ledger" to load the frame-scoped ledger</span>';
}
// mirror the frozen-baseline state into the consistency card + gate the control button
const _rbs=renderBaselineState;
renderBaselineState=function(msg,isError){_rbs(msg,isError);const cb=$("consbaseline");if(cb){const el=$("candbaseline");cb.innerHTML=el.innerHTML;cb.className=el.className}const ctl=$("ctlrun");if(ctl)ctl.disabled=!baselineSnapshot};
renderBaselineState(null,false);
function setTip(iconId,labelId,tip){const ic=$(iconId),lb=$(labelId);if(!ic)return;if(!tip){ic.style.display="none";if(lb)lb.style.display="none";return}ic.setAttribute("data-tip",tip);ic.style.display="";if(lb)lb.style.display=""}
