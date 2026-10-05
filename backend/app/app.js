const state={projectId:localStorage.getItem("brs.projectId")};
const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
const notice=(message)=>{const el=$("#notice");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)};
const api=async(path,options={})=>{const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||"Request failed");return data};
const safe=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));}
$$('.nav-item').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
$$('[data-go]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.go)));
function record(title,detail,status="in review"){return `<article class="record"><div><h3>${safe(title)}</h3><p>${safe(detail)}</p></div><span class="badge ${safe(status)}">${safe(status)}</span></article>`}
async function refresh(){if(!state.projectId)return;try{const data=await api(`/api/projects/${state.projectId}/dashboard`);render(data)}catch(error){localStorage.removeItem('brs.projectId');state.projectId=null;notice(error.message)}}
function render(data){
  $('#emptyState').hidden=true;$('#dashboardContent').hidden=false;$('#uploadForm').hidden=false;
  const critical=data.findings.filter(f=>['critical','major'].includes(f.payload.severity));
  $('#metrics').innerHTML=[['Sources',data.sources.length],['Open findings',data.findings.length],['Critical / major',critical.length],['Pending approvals',data.pending_approvals.length]].map(([label,value])=>`<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('#sourceCount').textContent=`${data.sources.length} immutable source${data.sources.length===1?'':'s'}`;
  $('#releaseState').textContent=data.release.releasable?'Release approved':'Release blocked';
  $('#releaseState').parentElement.querySelector('span').style.background=data.release.releasable?'#3f856c':'#f2d69a';
  $$('#gateList li').forEach(item=>{const approval=data.approvals.find(a=>a.gate===item.dataset.gate);item.classList.toggle('approved',approval?.decision==='approved');item.classList.toggle('blocked',approval?.decision==='rejected')});
  $('#sourceInventory').innerHTML=data.sources.length?data.sources.map(s=>record(s.original_name,`${s.mime_type} · ${s.byte_size} bytes · SHA-256 ${s.sha256.slice(0,12)}…`,s.processing_status)).join(''):record('No sources yet','Upload a proposal or protocol first when available.','awaiting input');
  $('#taskList').innerHTML=data.tasks.length?data.tasks.map((t,index)=>record(`${index+1}. ${t.payload.title}`,`${t.payload.expected_artifact} · ${t.payload.risk} risk · ${t.payload.approval_required?'approval required':'no approval required'}`,t.payload.category)).join(''):record('Task plan awaiting source inventory','The Senior Investigator will propose bounded work with prerequisites and stop conditions.','awaiting input');
  $('#evidenceList').innerHTML=data.findings.length?data.findings.map(f=>record(`${f.payload.rule_id}: ${f.payload.observed}`,f.payload.recommendation,f.payload.severity)).join(''):record('No findings recorded','Evidence claims, conflicts, and integrity findings will remain linked to their sources.','not started');
  $('#approvalList').innerHTML=data.pending_approvals.length?data.pending_approvals.map(r=>record(`${r.payload.section} revision`,r.payload.proposed_text,'awaiting input')).join(''):record('No pending decisions','Exact proposed wording, source version, consequences, and resulting artifacts appear here.','clear');
  $('#artifactList').innerHTML=data.artifacts.length?data.artifacts.map(a=>record('Release manifest',a.payload.manifest_path,'approved')).join(''):record('No released artifacts','Only Document Production can place approved files here.','blocked');
}
$('#projectForm').addEventListener('submit',async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const body=Object.fromEntries([...form.entries()].filter(([,v])=>v!==''));try{const project=await api('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});state.projectId=project.id;localStorage.setItem('brs.projectId',project.id);notice('Governed project created');await refresh()}catch(error){notice(error.message)}});
$('#uploadForm').addEventListener('submit',async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);try{const source=await api(`/api/projects/${state.projectId}/sources`,{method:'POST',body:form});notice(source.processing_status==='quarantined'?'Identifiers detected; source quarantined':'Source inventoried and hashed');event.currentTarget.reset();await refresh()}catch(error){notice(error.message)}});
$('#refreshButton').addEventListener('click',refresh);
refresh();
