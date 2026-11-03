import {createCadViewer} from './viewer.js';
const status=document.getElementById('exampleStatus');
let viewer;
try{
  const response=await fetch('sample/example-bent-tab.step');
  if(!response.ok)throw Error('Example STEP could not be loaded.');
  const source=await response.text(),worker=new Worker('worker.js');
  const answer=await new Promise((resolve,reject)=>{
    worker.onmessage=event=>{if(event.data.phase==='meshing'){status.textContent='Building the example 3D mesh…';return;}resolve(event.data);};
    worker.onerror=event=>reject(Error(event.message||'CAD worker failed'));
    worker.postMessage(source);
  });
  worker.terminate();
  if(!answer.ok||answer.result.rows.length!==1)throw Error(answer.error||'Example did not contain one solid.');
  viewer=createCadViewer(document.getElementById('exampleViewer'));
  viewer.setData(answer.meshes,answer.meshParts);
  const row=answer.result.rows[0],geometry=viewer.select(row.id,'solo');
  status.textContent=`${row.category} · ${row.thickness.toFixed(4)} in stock · envelope ${geometry.size.map(v=>v.toFixed(2)).join(' × ')} in`;
  document.getElementById('fitExample').addEventListener('click',()=>viewer.fit());
}catch(error){status.textContent=`Could not show the example: ${error.message}`;}
