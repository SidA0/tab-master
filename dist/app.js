const $=id=>document.getElementById(id);
let rows=[],selected=null,filter='All',sourceName='';
const categories=['Flat sheet','Bent sheet metal','Tube','Review'];
const fmt=n=>Number.isFinite(n)?n.toFixed(4).replace(/0+$/,'').replace(/\.$/,''):'—';
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setStatus(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function summary(){
  $('heroCount').textContent=rows.length;
  for(const [category,id] of [['Flat sheet','flatCount'],['Bent sheet metal','bentCount'],['Tube','tubeCount'],['Review','reviewCount']]) $(id).textContent=rows.filter(r=>r.category===category).length;
}
function visibleRows(){const q=$('search').value.trim().toLowerCase();return rows.filter(r=>(filter==='All'||r.category===filter)&&(!q||`${r.index} ${r.name} ${r.category} ${fmt(r.thickness)} ${fmt(r.outside)}`.toLowerCase().includes(q)));}
function renderRows(){
  const list=visibleRows();
  $('bodyRows').innerHTML=list.map(r=>`<tr class="${r.index===selected?'selected':''}"><td>${r.index}</td><td title="${esc(r.name)}">${esc(r.name)}</td><td>${esc(r.category)}</td><td>${fmt(r.thickness)}</td><td>${fmt(r.outside)}</td><td><span class="pill ${r.confidence==='High'?'high':'review'}">${esc(r.reviewStatus==='Verified'?'Verified':r.confidence)}</span></td><td><button type="button" data-select="${r.index}">Inspect ↗</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No bodies match this filter.</td></tr>';
  $('shown').textContent=`Showing ${list.length} of ${rows.length} bodies · thickness in inches`;
}
function groupData(){
  const map=new Map();for(const r of rows){const t=Number.isFinite(r.thickness)?r.thickness.toFixed(4):'Unknown',od=r.category==='Tube'&&Number.isFinite(r.outside)?r.outside.toFixed(4):'—',key=`${r.category}|${t}|${od}`;if(!map.has(key))map.set(key,{category:r.category,thickness:t,outside:od,ids:[]});map.get(key).ids.push(r.index);}
  return [...map.values()].sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category)||parseFloat(a.thickness)-parseFloat(b.thickness));
}
function renderGroups(){$('groupRows').innerHTML=groupData().map(g=>`<tr><td>${esc(g.category)}</td><td>${esc(g.thickness)}</td><td>${esc(g.outside)}</td><td>${g.ids.length}</td><td>${g.ids.join(', ')}</td></tr>`).join('');}
function renderDetail(){
  const r=rows.find(x=>x.index===selected);$('detail').hidden=!r;if(!r)return;
  $('detailIndex').textContent=`Body ${r.index} of ${rows.length}`;$('detailName').textContent=r.name;
  $('editCategory').value=r.category;$('editThickness').value=Number.isFinite(r.thickness)?r.thickness.toFixed(4):'';$('editOutside').value=Number.isFinite(r.outside)?r.outside.toFixed(4):'';$('editStatus').value=r.reviewStatus||'Unreviewed';
  $('detailEvidence').textContent=r.evidence;
  for(const [key,id] of [['planes','detailPlanes'],['cylinders','detailCylinders'],['tori','detailTori'],['faces','detailFaces']]) $(id).textContent=r[key];
  $('confidenceNote').textContent=r.confidence==='High'?'The form and thickness have analytic surface evidence. Verify the result in source CAD.':'The geometry or body identity needs manual review before using this item for purchasing.';
}
function render(){summary();renderRows();renderDetail();renderGroups();}
function csvCell(value){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function download(name,head,data){const csv=[head,...data].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function baseName(){return (sourceName||'tabs').replace(/\.(step|stp)$/i,'').replace(/[^a-z0-9_-]+/gi,'-');}
async function load(file){
  if(!file)return;if(!/\.(step|stp)$/i.test(file.name)){setStatus('Choose a .STEP or .STP file.',true);return;}if(file.size>100*1024*1024){setStatus('This file exceeds the 100 MB local limit.',true);return;}
  sourceName=file.name;$('fileName').textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB`;$('heroSource').textContent=file.name;setStatus('Reading and classifying solid bodies…');
  try{const text=await file.text();const worker=new Worker('worker.js',{type:'module'});const answer=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message||'Worker failed'));worker.postMessage(text);});worker.terminate();if(!answer.ok)throw Error(answer.error);
    rows=answer.result.rows.map(r=>({...r,reviewStatus:'Unreviewed'}));selected=rows[0]?.index||null;filter='All';$('search').value='';document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.filter==='All'));$('results').hidden=false;$('groups').hidden=false;render();setStatus(`${rows.length} solid bodies found. Review classifications and export your grouped list.`);$('results').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){rows=[];selected=null;$('results').hidden=true;$('groups').hidden=true;$('detail').hidden=true;render();setStatus(`Analysis failed: ${error.message}`,true);}
}
$('file').addEventListener('change',e=>load(e.target.files[0]));
const drop=$('dropzone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag')});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag')});drop.addEventListener('drop',e=>load(e.dataTransfer.files[0]));
$('reset').addEventListener('click',()=>{rows=[];selected=null;sourceName='';$('file').value='';$('fileName').textContent='STEP / STP · up to 100 MB · stays on this device';$('heroSource').textContent='Choose a STEP file to begin.';$('results').hidden=true;$('groups').hidden=true;$('detail').hidden=true;setStatus('');render();window.scrollTo({top:0,behavior:'smooth'});});
document.querySelectorAll('.chip').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b===button));renderRows();}));
$('search').addEventListener('input',renderRows);
$('bodyRows').addEventListener('click',e=>{const button=e.target.closest('[data-select]');if(!button)return;selected=+button.dataset.select;renderRows();renderDetail();$('detail').scrollIntoView({behavior:'smooth',block:'start'});});
for(const [id,key] of [['editCategory','category'],['editThickness','thickness'],['editOutside','outside'],['editStatus','reviewStatus']]) $(id).addEventListener('change',e=>{const r=rows.find(x=>x.index===selected);if(!r)return;r[key]=key==='thickness'||key==='outside'?(e.target.value===''?null:+e.target.value):e.target.value;render();});
$('exportBodies').addEventListener('click',()=>download(`${baseName()}-body-inventory.csv`,['body number','source body name','category','thickness in','outside diameter in','confidence','review status','detection evidence','face count'],rows.map(r=>[r.index,r.name,r.category,Number.isFinite(r.thickness)?r.thickness.toFixed(4):'',Number.isFinite(r.outside)?r.outside.toFixed(4):'',r.confidence,r.reviewStatus,r.evidence,r.faces])));
$('exportGroups').addEventListener('click',()=>download(`${baseName()}-stock-groups.csv`,['category','thickness in','outside diameter in','body count','body numbers'],groupData().map(g=>[g.category,g.thickness,g.outside,g.ids.length,g.ids.join('; ')])));
