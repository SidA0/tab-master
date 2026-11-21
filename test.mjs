import {readFileSync} from 'node:fs';
import {analyzeStep} from './dist/analyzer.js';
import {splitStep} from './dist/splitter.js';
import {extractFlatFaces,faceDxf,chooseRepresentativeFace} from './dist/flat-face.js';
import {detectPartType} from './dist/part-type.js';
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
const example=analyzeStep(readFileSync(new URL('./dist/sample/example-bent-tab.step',import.meta.url),'utf8'));
if(example.rows.length!==1||example.rows[0].category!=='Bent sheet metal'||Math.abs(example.rows[0].thickness-.0625)>.0001)throw Error('Tutorial example classification changed');
console.log('PASS: tutorial example is one 0.0625 in bent sheet tab.');
const faces=extractFlatFaces(readFileSync(file,'utf8'),result.rows);
const missingFlat=result.rows.filter((row,i)=>row.category==='Flat sheet'&&!faces[i].selected);
if(missingFlat.length)throw Error(`${missingFlat.length} flat sheet bodies have no closed planar face`);
const first=faces[0].selected,dxf=faceDxf(first);
if(first.holes!==1||(dxf.match(/LWPOLYLINE/g)||[]).length!==2||!dxf.includes('$INSUNITS\r\n70\r\n1'))throw Error('First tab DXF lost its hole or inch units');
console.log('PASS: 91 flat sheet faces extracted; first tab DXF has a closed outline and hole in inches.');
const flatChoices=result.rows.map((row,i)=>({row,face:faces[i]})).filter(x=>x.row.category==='Flat sheet');
if(flatChoices.filter(x=>x.face.representative).length!==89||flatChoices.filter(x=>!x.face.representative).map(x=>x.row.index).join(',')!=='29,95')throw Error('Legacy STEP broad-face review list changed');
const sampleChoice=chooseRepresentativeFace([
  {faceId:1,area:10,normal:[1,0,0],planePoint:[0,0,0]},
  {faceId:2,area:9,normal:[0,0,1],planePoint:[0,0,0]},
  {faceId:3,area:8,normal:[0,0,-1],planePoint:[0,0,.09]}
]);
if(sampleChoice.selected.faceId!==2||sampleChoice.oppositeFaceId!==3||!sampleChoice.representative)throw Error('An isolated large side face displaced the broad face');
function dxfArea(dxf){
  const pairs=dxf.trim().split(/\r?\n/),loops=[];
  for(let i=0;i<pairs.length-1;i+=2)if(pairs[i]==='0'&&pairs[i+1]==='LWPOLYLINE'){
    const points=[];let count=null,closed=false;
    for(i+=2;i<pairs.length-1;i+=2){const code=pairs[i],value=pairs[i+1];if(code==='0'){i-=2;break;}if(code==='90')count=+value;if(code==='70')closed=(+value&1)===1;if(code==='10')points.push([+value,0]);if(code==='20')points.at(-1)[1]=+value;}
    if(!closed||points.length!==count)throw Error('DXF has an open or incomplete contour');
    loops.push(Math.abs(points.reduce((sum,p,j)=>sum+p[0]*points[(j+1)%points.length][1]-points[(j+1)%points.length][0]*p[1],0))/2);
  }
  return loops[0]-loops.slice(1).reduce((sum,value)=>sum+value,0);
}
const partTypes=result.rows.map((row,i)=>detectPartType(row,faces[i].selected));
if(partTypes.filter(type=>type==='Tab').length!==90||partTypes.filter(type=>type==='Gusset / stringer').length!==16||partTypes.filter(type=>type==='Review').length!==23)throw Error('Tab and gusset/stringer detection changed');
console.log('PASS: hole-based part type detection labels tabs, gusset/stringer candidates, and review bodies.');
const directLinkFile=process.argv[3];
if(directLinkFile){
  const directSource=readFileSync(directLinkFile,'utf8');
  const directResult=analyzeStep(directSource),directParts=splitStep(directSource,directResult.rows.length);
  if(directParts.length!==68||directParts.some(part=>part.group!=='27-BDY-CHA-TAB-DYN'))throw Error('Direct-linked CAD group does not match its 68 STEP solids');
  const directFaces=extractFlatFaces(directSource,directResult.rows);
  if(directResult.rows.filter(row=>row.category==='Flat sheet').length!==64||directFaces.filter((face,i)=>directResult.rows[i].category==='Flat sheet'&&face.selected).length!==64)throw Error('Direct-linked flat-sheet export changed');
  if(directFaces.filter((face,i)=>directResult.rows[i].category==='Flat sheet'&&face.representative&&face.oppositeFaceId).length!==64)throw Error('A dynamic tab lacks a representative opposing broad face');
  for(let i=0;i<directResult.rows.length;i++)if(directResult.rows[i].category==='Flat sheet'){
    const face=directFaces[i].selected,dxf=faceDxf(face);
    if((dxf.match(/LWPOLYLINE/g)||[]).length!==face.holes+1||!dxf.includes('$INSUNITS\r\n70\r\n1')||Math.abs(dxfArea(dxf)-face.area)>.0001)throw Error(`Body ${directResult.rows[i].index} DXF lost its face outline, cutout, area, or inch units`);
  }
  const directTypes=directResult.rows.map((row,i)=>detectPartType(row,directFaces[i].selected));
  if(directTypes.filter(type=>type==='Tab').length!==44||directTypes.filter(type=>type==='Gusset / stringer').length!==20||directTypes.filter(type=>type==='Review').length!==4)throw Error('Direct-linked part type detection changed');
  console.log('PASS: directly linked CAD group maps 68 STEP solids and 64 paired broad-face DXFs with closed outlines.');
}
