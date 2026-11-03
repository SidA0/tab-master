importScripts('vendor/occt-import-js.js');
let cadModule;
self.onmessage=async event=>{
  try {
    const source=event.data;
    const [{analyzeStep},{splitStep}]=await Promise.all([import('./analyzer.js'),import('./splitter.js')]);
    const result=analyzeStep(source);
    const parts=splitStep(source,result.rows.length);
    if(parts.some(p=>!result.rows.some(r=>r.id===p.solidId)))throw Error('Split body IDs do not match classification IDs.');
    self.postMessage({phase:'meshing'});
    cadModule ||= await occtimportjs({locateFile:name=>`vendor/${name}`});
    const cad=cadModule.ReadStepFile(new TextEncoder().encode(source),{
      linearUnit:'inch',linearDeflectionType:'bounding_box_ratio',linearDeflection:0.004,angularDeflection:0.25
    });
    if(!cad.success||cad.meshes?.length!==parts.length)throw Error(`CAD mesh count ${cad.meshes?.length||0} differs from ${parts.length} STEP solids.`);
    const groups=new Map();for(const part of parts){if(!groups.has(part.group))groups.set(part.group,[]);groups.get(part.group).push(part);}
    const meshParts=Array(cad.meshes.length),queue=[cad.root];
    while(queue.length){const node=queue.pop();for(const child of node.children||[])queue.push(child);
      if(!node.meshes?.length)continue;
      const list=groups.get(node.name);
      if(!list||list.length!==node.meshes.length)throw Error(`CAD group ${node.name} cannot be matched to STEP solids.`);
      node.meshes.forEach((meshIndex,i)=>{meshParts[meshIndex]={solidId:list[i].solidId,name:list[i].name};});
    }
    if(meshParts.some(p=>!p))throw Error('Some CAD meshes could not be matched to STEP solids.');
    self.postMessage({ok:true,result,parts,meshParts,meshes:cad.meshes});
  } catch(error) { self.postMessage({ok:false,error:String(error?.message||error)}); }
};
