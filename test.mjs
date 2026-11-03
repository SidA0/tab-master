import {readFileSync} from 'node:fs';
import {analyzeStep} from './dist/analyzer.js';
import {splitStep} from './dist/splitter.js';
const file=process.argv[2];
if(!file) throw Error('Pass a STEP file path');
const result=analyzeStep(readFileSync(file,'utf8'));
const counts={}; for(const row of result.rows) counts[row.category]=(counts[row.category]||0)+1;
const expected={'Flat sheet':91,'Bent sheet metal':15,'Tube':12,'Review':11};
if(result.rows.length!==129||result.units!=='in'||Object.entries(expected).some(([key,value])=>counts[key]!==value)) throw Error(`Unexpected classification: ${JSON.stringify(counts)}`);
const sample=result.rows.find(r=>r.name.includes('Round RD 1.0 X 0.095'));
if(sample?.category!=='Tube'||Math.abs(sample.thickness-.095)>.001)throw Error('Known tube sample was not recognized');
if(result.rows.some(r=>/weldnut/i.test(r.name)&&r.category!=='Review'))throw Error('Weldnut hardware should require review');
const parts=splitStep(readFileSync(file,'utf8'),result.rows.length);
if(parts.length!==129||parts.some(p=>!result.rows.some(r=>r.id===p.solidId)))throw Error('STEP split body mapping failed');
for(const part of parts){
  const ids=[...part.text.matchAll(/#(\d+)\s*=/g)].map(m=>+m[1]);
  const defined=new Set(ids),referenced=[...part.text.matchAll(/#(\d+)/g)].map(m=>+m[1]);
  if([...referenced].some(id=>!defined.has(id)))throw Error(`Split body ${part.order} has a missing STEP entity`);
  if((part.text.match(/MANIFOLD_SOLID_BREP/g)||[]).length!==1)throw Error(`Split body ${part.order} is not one solid`);
}
console.log(`PASS: ${result.rows.length} classified and independently split STEP solids; ${JSON.stringify(counts)}.`);
