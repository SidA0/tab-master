/* STEP AP214 analytic-surface classifier. All work runs in the browser. */
const refs = text => [...text.matchAll(/#(\d+)/g)].map(m => +m[1]);
const nums = text => [...text.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?/gi)].map(m => +m[0]);
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const sub = (a,b) => a.map((x,i) => x-b[i]);
const norm = a => { const n=Math.hypot(...a)||1; return a.map(x=>x/n); };
const median = a => { const b=[...a].sort((x,y)=>x-y); return b.length ? b[Math.floor(b.length/2)] : null; };
const near = (a,b,t=.003) => Math.abs(a-b)<t;

export function parseEntities(source) {
  const start=source.indexOf('DATA;'), end=source.indexOf('ENDSEC;',start+5);
  if(start<0||end<0) throw Error('No STEP DATA section found.');
  const entities=new Map(), rx=/#(\d+)\s*=/g; rx.lastIndex=start+5;
  let m;
  while((m=rx.exec(source)) && m.index<end) {
    let p=rx.lastIndex, quoted=false;
    for(;p<end;p++) {
      if(source[p]==="'") { if(quoted&&source[p+1]==="'"){p++;continue;} quoted=!quoted; }
      else if(source[p]===';'&&!quoted) break;
    }
    entities.set(+m[1],source.slice(rx.lastIndex,p).trim()); rx.lastIndex=p+1;
  }
  return entities;
}

function entityType(s) { return s.match(/^([A-Z_][A-Z_0-9]*)\s*\(/)?.[1]||''; }
function vector(entities,id) {
  const s=entities.get(id)||'';
  const m=s.match(/\(\s*'[^']*'\s*,\s*\(\s*([^)]*)\)/);
  return m ? nums(m[1]).slice(0,3) : null;
}
function axis(entities,id) {
  const r=refs(entities.get(id)||'');
  const point=vector(entities,r[0]), direction=vector(entities,r[1]);
  return point&&direction ? {point,direction:norm(direction)} : null;
}
function surface(entities,id) {
  const s=entities.get(id)||'', type=entityType(s), r=refs(s), a=axis(entities,r[0]);
  if(!a) return null;
  let radius=null, minor=null;
  if(type==='CYLINDRICAL_SURFACE'||type==='TOROIDAL_SURFACE') {
    const tail=s.slice(s.indexOf(`#${r[0]}`)+String(r[0]).length+1);
    const n=nums(tail); radius=n[0]; minor=n[1];
  }
  return {type, ...a, radius, minor};
}
function lengthScale(entities) {
  const unit=[...entities.values()].find(s=>s.includes("CONVERSION_BASED_UNIT ( 'INCH'"));
  if(unit) return {factor:1,label:'in'};
  const mm=[...entities.values()].some(s=>/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\./.test(s));
  if(mm) return {factor:1/25.4,label:'in'};
  throw Error('Unsupported STEP length units. Export in inches or millimeters.');
}
function shellFaces(entities,shellId) {
  const seen=new Set(), queue=[shellId], found=[];
  while(queue.length) {
    const id=queue.pop(); if(seen.has(id))continue; seen.add(id);
    const s=entities.get(id)||'';
    if(entityType(s)==='ADVANCED_FACE') { found.push(id); continue; }
    for(const r of refs(s)) if(!seen.has(r))queue.push(r);
  }
  return found;
}
function lineDistance(a,b) {
  const delta=sub(a.point,b.point), along=dot(delta,a.direction);
  return Math.hypot(...delta.map((x,i)=>x-along*a.direction[i]));
}
function tubeCandidate(surfaces,scale) {
  const cylinders=surfaces.filter(s=>s.type==='CYLINDRICAL_SURFACE'&&s.radius>0);
  const candidates=[];
  for(let i=0;i<cylinders.length;i++) for(let j=i+1;j<cylinders.length;j++) {
    const a=cylinders[i], b=cylinders[j];
    const outer=Math.max(a.radius,b.radius)*scale, inner=Math.min(a.radius,b.radius)*scale, wall=outer-inner;
    if(wall<.018||wall>.25||outer<.2||wall/outer>.4)continue;
    if(Math.abs(dot(a.direction,b.direction))<.998||lineDistance(a,b)*scale>.008)continue;
    const matches=cylinders.filter(c=>Math.abs(dot(c.direction,a.direction))>.998&&lineDistance(c,a)*scale<.008);
    const outerCount=matches.filter(c=>near(c.radius*scale,outer)).length;
    const innerCount=matches.filter(c=>near(c.radius*scale,inner)).length;
    candidates.push({wall,od:outer*2,score:outerCount*innerCount,outerCount,innerCount});
  }
  candidates.sort((a,b)=>b.score-a.score||b.od-a.od);
  return candidates[0]||null;
}
function sheetCandidate(surfaces,scale) {
  const planes=surfaces.filter(s=>s.type==='PLANE');
  const candidates=[];
  for(let i=0;i<planes.length;i++) for(let j=i+1;j<planes.length;j++) {
    const a=planes[i], b=planes[j];
    if(Math.abs(dot(a.direction,b.direction))<.9995)continue;
    const gap=Math.abs(dot(sub(a.point,b.point),a.direction))*scale;
    if(gap<.015||gap>.25)continue;
    const count=planes.filter(p=>Math.abs(dot(p.direction,a.direction))>.9995).length;
    candidates.push({wall:gap,score:count,normal:a.direction});
  }
  // The smallest common separation is usually the stock thickness; hole edges and
  // distant parallel faces can create other gaps, so require a repeated cluster.
  const bins=new Map();
  for(const c of candidates) {
    const key=(Math.round(c.wall/.002)*.002).toFixed(3);
    if(!bins.has(key))bins.set(key,[]); bins.get(key).push(c);
  }
  const ranked=[...bins.values()].map(list=>({wall:median(list.map(x=>x.wall)),score:list.length,normal:list[0].normal})).sort((a,b)=>b.score-a.score||a.wall-b.wall);
  return ranked[0]||null;
}
function bendEvidence(surfaces,wall,scale) {
  const cylinders=surfaces.filter(s=>s.type==='CYLINDRICAL_SURFACE'&&s.radius>0);
  const tori=surfaces.filter(s=>s.type==='TOROIDAL_SURFACE');
  for(let i=0;i<cylinders.length;i++) for(let j=i+1;j<cylinders.length;j++) {
    const a=cylinders[i],b=cylinders[j],gap=Math.abs(a.radius-b.radius)*scale;
    if(Math.abs(gap-wall)>.008||Math.abs(dot(a.direction,b.direction))<.995)continue;
    if(lineDistance(a,b)*scale>.03)continue;
    return 'paired cylindrical bend faces';
  }
  if(tori.length) return 'toroidal bend face';
  return null;
}
function bodyName(s,id,index) {
  return s.match(/MANIFOLD_SOLID_BREP\s*\(\s*'((?:[^']|'')*)'/)?.[1].replace(/''/g,"'")||`Body ${index+1}`;
}
export function analyzeStep(source, progress=()=>{}) {
  const entities=parseEntities(source), {factor:scale,label:units}=lengthScale(entities);
  const solids=[...entities].filter(([,s])=>s.includes('MANIFOLD_SOLID_BREP'));
  if(!solids.length)throw Error('No solid bodies found in this STEP file.');
  const rows=[];
  for(let i=0;i<solids.length;i++) {
    const [id,entry]=solids[i], shell=refs(entry).at(-1), faceIds=shellFaces(entities,shell);
    const surfaces=faceIds.map(fid=>{const face=entities.get(fid)||'';const r=refs(face);return surface(entities,r.at(-1));}).filter(Boolean);
    const tube=tubeCandidate(surfaces,scale), sheet=sheetCandidate(surfaces,scale);
    const bend=sheet&&bendEvidence(surfaces,sheet.wall,scale);
    const name=bodyName(entry,id,i);
    let category='Review', thickness=null, outside=null, confidence='Review', evidence='No reliable wall pair found';
    if(/weldnut/i.test(name)) { evidence='Named weldnut; hardware geometry needs separate review'; }
    else if(tube && (!sheet||tube.score>=2)) { category='Tube'; thickness=tube.wall; outside=tube.od; confidence=tube.score>=2?'High':'Review'; evidence=`Concentric cylindrical walls (${tube.outerCount} outer, ${tube.innerCount} inner)`; }
    else if(sheet) { category=bend?'Bent sheet metal':'Flat sheet'; thickness=sheet.wall; confidence='High'; evidence=bend||`${sheet.score} parallel face pairs`; }
    rows.push({id,index:i+1,name,category,thickness,outside,confidence,evidence,faces:faceIds.length,planes:surfaces.filter(s=>s.type==='PLANE').length,cylinders:surfaces.filter(s=>s.type==='CYLINDRICAL_SURFACE').length,tori:surfaces.filter(s=>s.type==='TOROIDAL_SURFACE').length});
    if(i%10===0)progress(i+1,solids.length);
  }
  return {rows,units,entityCount:entities.size};
}
