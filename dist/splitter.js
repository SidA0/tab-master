/* Adapted from the user's Frame Order Studio STEP splitter.
   Extracts each analytic B-rep solid with its shared product and unit context. */
import {parseEntities} from './analyzer.js';
const refs=s=>[...s.matchAll(/#(\d+)/g)].map(m=>+m[1]);
export function splitStep(source,expectedCount){
  const entities=parseEntities(source), start=source.indexOf('DATA;')+5;
  const end=source.indexOf('ENDSEC;',start);
  const prefix=source.slice(0,start),suffix=source.slice(end);
  const reps=[...entities].filter(([,v])=>/^ADVANCED_BREP_SHAPE_REPRESENTATION\b/.test(v));
  if(!reps.length)throw Error('No B-rep representation found.');
  const catalog=[];
  for(const [repId,rep] of reps){
    const match=rep.match(/(ADVANCED_BREP_SHAPE_REPRESENTATION\s*\(\s*'(?:''|[^'])*'\s*,\s*)\(([^)]*)\)/);
    if(!match)throw Error(`STEP body list #${repId} could not be read.`);
    const members=refs(match[2]),solidIds=members.filter(id=>/^MANIFOLD_SOLID_BREP\b/.test(entities.get(id)||'')),extras=members.filter(id=>!solidIds.includes(id));
    const direct=[...entities].filter(([,v])=>/^SHAPE_DEFINITION_REPRESENTATION\b/.test(v)&&new RegExp(`#${repId}(?!\d)`).test(v)).map(([id])=>id);
    const relations=[...entities].filter(([,v])=>/^SHAPE_REPRESENTATION_RELATIONSHIP\b/.test(v)&&new RegExp(`#${repId}(?!\d)`).test(v));
    const baseIds=relations.flatMap(([,v])=>refs(v).filter(id=>id!==repId));
    const group=entities.get(baseIds[0])?.match(/^SHAPE_REPRESENTATION\s*\(\s*'((?:''|[^'])*)'/)?.[1]?.replace(/''/g,"'")||`Representation ${repId}`;
    const linked=[...entities].filter(([,v])=>/^SHAPE_DEFINITION_REPRESENTATION\b/.test(v)&&baseIds.some(id=>new RegExp(`#${id}(?!\d)`).test(v))).map(([id])=>id);
    const roots=[...direct,...linked,...relations.map(([id])=>id)];
    if(!roots.length)throw Error(`No product-to-shape link for representation #${repId}.`);
    for(const solidId of solidIds)catalog.push({solidId,repId,rep,match,extras,roots,group});
  }
  if(expectedCount!=null&&catalog.length!==expectedCount)throw Error(`Expected ${expectedCount} bodies, found ${catalog.length} in representations.`);
  return catalog.map(({solidId,repId,rep,match,extras,roots,group},i)=>{
    const solid=entities.get(solidId);
    const name=solid.match(/^MANIFOLD_SOLID_BREP\s*\(\s*'((?:''|[^'])*)'/)?.[1]?.replace(/''/g,"'")||`Body ${i+1}`;
    const customRep=rep.replace(match[0],`${match[1]}( ${[solidId,...extras].map(id=>`#${id}`).join(', ')} )`);
    const keep=new Set(),pending=[...roots];
    while(pending.length){
      const id=pending.pop();if(keep.has(id))continue;
      const value=id===repId?customRep:entities.get(id);
      if(!value)throw Error(`Missing referenced STEP entity #${id}.`);
      keep.add(id);for(const child of refs(value))if(!keep.has(child))pending.push(child);
    }
    const data=[...keep].sort((a,b)=>a-b).map(id=>`#${id} = ${id===repId?customRep:entities.get(id)} ;\n`).join('');
    return {solidId,name,group,order:i+1,text:`${prefix}\n${data}${suffix}`};
  });
}
