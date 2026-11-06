/* Extract one planar face per solid from STEP B-rep topology for 2D cutting DXFs. */
import {parseEntities} from './analyzer.js';
const refs=s=>[...String(s||'').matchAll(/#(\d+)/g)].map(m=>+m[1]);
const numbers=s=>[...String(s||'').matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?/gi)].map(m=>+m[0]);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const minus=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a)||1;return a.map(x=>x/length);};
const distance=(a,b)=>Math.hypot(...minus(a,b));
const close=(a,b,t=.00001)=>distance(a,b)<t;
const flag=s=>/\.T\.\s*\)\s*$/.test(s);
const shape=s=>s.match(/^([A-Z_][A-Z_0-9]*)\s*\(/)?.[1]||'';
const area=points=>Math.abs(points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-points[(i+1)%points.length][0]*p[1],0))/2;

function makeReader(entities){
  const vectorCache=new Map(),axisCache=new Map();
  function vector(id){if(vectorCache.has(id))return vectorCache.get(id);const s=entities.get(id)||'',m=s.match(/\(\s*'[^']*'\s*,\s*\(\s*([^)]*)\)/);const v=m?numbers(m[1]).slice(0,3):null;vectorCache.set(id,v);return v;}
  function axis(id){if(axisCache.has(id))return axisCache.get(id);const r=refs(entities.get(id)),point=vector(r[0]),normal=vector(r[1]),xRaw=vector(r[2]);if(!point||!normal)return null;const z=unit(normal),fallback=Math.abs(z[0])<.9?[1,0,0]:[0,1,0],x=unit(minus(xRaw||fallback,z.map(v=>v*dot(xRaw||fallback,z)))),a={point,z,x,y:unit(cross(z,x))};axisCache.set(id,a);return a;}
  function vertex(id){return vector(refs(entities.get(id))[0]);}
  function bspline(entity){
    const control=entity.match(/B_SPLINE_CURVE\s*\(\s*(?:'[^']*'\s*,\s*)?(\d+)\s*,\s*\(([^)]*)\)/)||entity.match(/B_SPLINE_CURVE_WITH_KNOTS\s*\(\s*'[^']*'\s*,\s*(\d+)\s*,\s*\(([^)]*)\)/);
    const knots=entity.match(/B_SPLINE_CURVE_WITH_KNOTS\s*\(\s*(?:'[^']*'\s*,\s*\d+\s*,\s*\([^)]*\)\s*,\s*\.[A-Z_]+\.\s*,\s*\.[TF]\.\s*,\s*\.[TF]\.\s*,\s*)?\(([^)]*)\)\s*,\s*\(([^)]*)\)/);
    if(!control||!knots)throw Error('Unsupported spline control points or knots');
    const degree=+control[1],points=refs(control[2]).map(vector),mult=numbers(knots[1]),values=numbers(knots[2]);
    const weights=entity.match(/RATIONAL_B_SPLINE_CURVE\s*\(\s*\(([^)]*)\)/)?.[1];
    const w=weights?numbers(weights):points.map(()=>1);
    const expanded=values.flatMap((v,i)=>Array(mult[i]).fill(v));
    if(points.some(p=>!p)||points.length!==w.length||expanded.length!==points.length+degree+1)throw Error('Invalid spline data');
    function at(t){
      const last=points.length-1,low=expanded[degree],high=expanded[points.length];
      const u=Math.min(high,Math.max(low,t));let span=last;
      if(u<high)for(let i=degree;i<=last;i++)if(u>=expanded[i]&&u<expanded[i+1]){span=i;break;}
      const work=[];for(let j=0;j<=degree;j++){const i=span-degree+j;work.push([...points[i].map(v=>v*w[i]),w[i]]);}
      for(let level=1;level<=degree;level++)for(let j=degree;j>=level;j--){const i=span-degree+j,den=expanded[i+degree-level+1]-expanded[i],alpha=den?(u-expanded[i])/den:0;work[j]=work[j].map((v,k)=>(1-alpha)*work[j-1][k]+alpha*v);}
      return work[degree].slice(0,3).map(v=>v/work[degree][3]);
    }
    return {at,first:expanded[degree],last:expanded[points.length],breaks:[...new Set(expanded.slice(degree,points.length+1))]};
  }
  return {vector,axis,vertex,bspline};
}

function faceIds(entities,solidId){const shell=refs(entities.get(solidId)).at(-1),seen=new Set(),queue=[shell],faces=[];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);const entry=entities.get(id)||'';if(shape(entry)==='ADVANCED_FACE'){faces.push(id);continue;}for(const ref of refs(entry))if(!seen.has(ref))queue.push(ref);}return faces;}

function sampleEdge(entities,reader,orientedId,scale){
  const oriented=entities.get(orientedId)||'',edge=entities.get(refs(oriented)[0])||'',r=refs(edge),curve=entities.get(r[2])||'';
  if(r.length<3)throw Error('Incomplete edge');
  const forward=flag(oriented),start=reader.vertex(r[forward?0:1]),end=reader.vertex(r[forward?1:0]);
  if(!start||!end)throw Error('Missing edge vertex');
  if(shape(curve)==='LINE')return [start,end];
  if(shape(curve)==='CIRCLE'){
    const axis=reader.axis(refs(curve)[0]),radius=+(curve.match(/CIRCLE\s*\(\s*'[^']*'\s*,\s*#\d+\s*,\s*([-+\d.Ee]+)/)?.[1]);
    if(!axis||!Number.isFinite(radius))throw Error('Invalid circular edge');
    const angle=p=>{const d=minus(p,axis.point);return Math.atan2(dot(d,axis.y),dot(d,axis.x));};
    const from=angle(start),to=angle(end),direction=(forward?1:-1)*(flag(edge)?1:-1);
    let sweep=(to-from+Math.PI*4)%(Math.PI*2);if(direction<0)sweep=sweep===0?-Math.PI*2:sweep-Math.PI*2;else if(sweep===0)sweep=Math.PI*2;
    const tolerance=.0005/scale,step=Math.min(Math.PI/12,2*Math.acos(Math.max(-1,1-tolerance/radius))||Math.PI/12),count=Math.max(2,Math.ceil(Math.abs(sweep)/step));
    const points=Array.from({length:count+1},(_,i)=>{const a=from+sweep*i/count;return axis.point.map((v,k)=>v+radius*(Math.cos(a)*axis.x[k]+Math.sin(a)*axis.y[k]));});
    points[0]=start;points[points.length-1]=end;return points;
  }
  if(/B_SPLINE_CURVE/.test(curve)){
    const spline=reader.bspline(curve);
    const points=[spline.at(spline.first)];
    function refine(a,pa,b,pb,depth){const mid=(a+b)/2,pm=spline.at(mid),quarter=spline.at((3*a+b)/4),threeQuarter=spline.at((a+3*b)/4),chord=t=>pa.map((v,k)=>v+(pb[k]-v)*t);const error=Math.max(distance(pm,chord(.5)),distance(quarter,chord(.25)),distance(threeQuarter,chord(.75)))*scale;if(depth<14&&error>.0005){refine(a,pa,mid,pm,depth+1);refine(mid,pm,b,pb,depth+1);}else points.push(pb);}
    for(let i=0;i<spline.breaks.length-1;i++){const a=spline.breaks[i],b=spline.breaks[i+1];if(b>a)refine(a,points.at(-1),b,spline.at(b),0);}
    if(distance(points[0],start)>distance(points.at(-1),start))points.reverse();
    points[0]=start;points[points.length-1]=end;return points;
  }
  throw Error(`Unsupported edge curve: ${shape(curve)||'complex'}`);
}

function faceOutline(entities,reader,faceId,scale){
  const face=entities.get(faceId)||'',r=refs(face),plane=entities.get(r.at(-1))||'';
  if(shape(plane)!=='PLANE')return null;
  const basis=reader.axis(refs(plane)[0]);if(!basis)return null;
  const project=p=>{const d=minus(p,basis.point);return [dot(d,basis.x)*scale,dot(d,basis.y)*scale];};
  const loops=[];
  for(const boundId of r.slice(0,-1)){
    const bound=entities.get(boundId)||'',loop=entities.get(refs(bound)[0])||'',oriented=refs(loop),points=[];
    if(!oriented.length)throw Error('Empty planar face boundary');
    for(const id of oriented){const edge=sampleEdge(entities,reader,id,scale).map(project);if(points.length&&distance(points.at(-1),edge[0])>.0001)throw Error('Planar face has an open edge junction');points.push(...(points.length?edge.slice(1):edge));}
    if(distance(points[0],points.at(-1))>.0001)throw Error('Planar face boundary is not closed');
    points.pop();const dedup=points.filter((p,i)=>i===0||!close(p,points[i-1]));
    if(dedup.length<3||area(dedup)<.000001)throw Error('Degenerate planar face boundary');
    loops.push({points:dedup,outer:shape(bound)==='FACE_OUTER_BOUND',area:area(dedup)});
  }
  if(!loops.length)return null;
  const outer=loops.find(l=>l.outer)||[...loops].sort((a,b)=>b.area-a.area)[0],holes=loops.filter(l=>l!==outer);
  const surfaceArea=outer.area-holes.reduce((sum,l)=>sum+l.area,0);
  if(surfaceArea<=0)throw Error('Planar face holes exceed outer outline');
  const all=loops.flatMap(l=>l.points),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  return {faceId,area:surfaceArea,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),loops:[outer,...holes].map(l=>l.points),holes:holes.length,pointCount:all.length};
}

export function extractFlatFaces(source,rows){
  const entities=parseEntities(source),reader=makeReader(entities);
  const scale=[...entities.values()].some(s=>/CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(s))?1:1/25.4;
  return rows.map(row=>{
    const candidates=[],errors=[];
    for(const id of faceIds(entities,row.id)){
      if(shape(entities.get(refs(entities.get(id)).at(-1))||'')!=='PLANE')continue;
      try{const outline=faceOutline(entities,reader,id,scale);if(outline)candidates.push(outline);}catch(error){errors.push(error.message);}
    }
    candidates.sort((a,b)=>b.area-a.area);
    return {solidId:row.id,selected:candidates[0]||null,candidateCount:candidates.length,errors:[...new Set(errors)].slice(0,3)};
  });
}

export function faceDxf(face){
  if(!face?.loops?.length)throw Error('No planar outline for DXF');
  const all=face.loops.flat(),minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1]));
  const out=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','1','0','ENDSEC','0','SECTION','2','ENTITIES'];
  for(const loop of face.loops){out.push('0','LWPOLYLINE','8','0','90',String(loop.length),'70','1');for(const point of loop)out.push('10',(point[0]-minX).toFixed(6),'20',(point[1]-minY).toFixed(6));}
  out.push('0','ENDSEC','0','EOF');return out.join('\r\n')+'\r\n';
}

export function faceSvg(face){
  if(!face?.loops?.length)return '';
  const all=face.loops.flat(),minX=Math.min(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxX=Math.max(...all.map(p=>p[0])),maxY=Math.max(...all.map(p=>p[1]));
  const w=Math.max(maxX-minX,.01),h=Math.max(maxY-minY,.01),pad=Math.max(w,h)*.06;
  const paths=face.loops.map(loop=>`M ${loop.map(p=>`${(p[0]-minX).toFixed(4)} ${(maxY-p[1]).toFixed(4)}`).join(' L ')} Z`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="Largest planar face outline"><path d="${paths}" fill="#dbe9f1" fill-rule="evenodd" stroke="#24455f" stroke-width="${Math.max(w,h)*.004}" vector-effect="non-scaling-stroke"/></svg>`;
}
