import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

export function createCadViewer(element) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#eef3f6');
  const camera=new THREE.PerspectiveCamera(38,1,.001,100000);
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  element.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=false;
  controls.addEventListener('change',render);
  scene.add(new THREE.HemisphereLight('#ffffff','#b4c4cf',2.3));
  const light=new THREE.DirectionalLight('#ffffff',2.2);light.position.set(4,6,8);scene.add(light);
  const reverse=new THREE.DirectionalLight('#b8d2e5',.8);reverse.position.set(-7,-4,-3);scene.add(reverse);
  const highlight=new THREE.MeshStandardMaterial({color:'#de7335',metalness:.12,roughness:.54,side:THREE.DoubleSide});
  const context=new THREE.MeshStandardMaterial({color:'#62798d',metalness:.06,roughness:.76,side:THREE.DoubleSide,transparent:true,opacity:.18,depthWrite:false});
  const entries=new Map();let selected=null,mode='solo',outline=null;
  const markerCanvas=document.createElement('canvas');markerCanvas.width=64;markerCanvas.height=64;
  const markerCtx=markerCanvas.getContext('2d');markerCtx.strokeStyle='#d95f20';markerCtx.lineWidth=6;markerCtx.beginPath();markerCtx.arc(32,32,24,0,Math.PI*2);markerCtx.stroke();markerCtx.fillStyle='#d95f20';markerCtx.beginPath();markerCtx.arc(32,32,5,0,Math.PI*2);markerCtx.fill();
  const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(markerCanvas),transparent:true,depthTest:false}));marker.renderOrder=10;marker.visible=false;scene.add(marker);
  function render(){renderer.render(scene,camera);}
  function resize(){const w=Math.max(1,element.clientWidth),h=Math.max(1,element.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);render();}
  new ResizeObserver(resize).observe(element);resize();
  function clear(){for(const mesh of entries.values()){scene.remove(mesh);mesh.geometry.dispose();}entries.clear();marker.visible=false;if(outline){scene.remove(outline);outline.geometry.dispose();outline=null;}}
  function setData(meshes,parts){
    clear();
    if(meshes.length!==parts.length)throw Error('CAD mesh and STEP body counts differ.');
    for(let i=0;i<meshes.length;i++){
      const source=meshes[i],positions=source?.attributes?.position?.array,indices=source?.index?.array;
      if(!positions?.length||!indices?.length)throw Error(`Body ${i+1} has no usable mesh.`);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
      const normals=source.attributes.normal?.array;
      if(normals?.length===positions.length)geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(normals),3));
      else geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const mesh=new THREE.Mesh(geometry,context);mesh.name=parts[i].name;
      scene.add(mesh);entries.set(parts[i].solidId,mesh);
    }
    render();
  }
  function bounds(id=selected){
    if(mode==='solo'){const mesh=entries.get(id);return mesh?.geometry.boundingBox.clone()||new THREE.Box3();}
    const box=new THREE.Box3();for(const mesh of entries.values())box.union(mesh.geometry.boundingBox);return box;
  }
  function fitBox(box){
    if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const span=Math.max(size.length(),.1),radius=Math.max(size.x,size.y,size.z,.1);
    camera.near=Math.max(span/10000,.001);camera.far=Math.max(span*100,100);camera.updateProjectionMatrix();
    const distance=radius/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.7;
    camera.position.copy(center).add(new THREE.Vector3(distance*.9,distance*.7,distance));
    controls.target.copy(center);controls.update();render();
  }
  function fit(){
    const box=bounds();if(box.isEmpty())return;
    if(mode==='assembly'){const span=box.getSize(new THREE.Vector3()).length();marker.scale.setScalar(Math.max(span*.035,.5));marker.visible=true;}else marker.visible=false;
    fitBox(box);
  }
  function focusSelected(){const mesh=entries.get(selected);if(!mesh)return;marker.visible=false;fitBox(mesh.geometry.boundingBox);}
  function select(id,nextMode='solo'){
    if(!entries.has(id))throw Error(`No 3D mesh for solid #${id}.`);
    selected=id;mode=nextMode;
    for(const [key,mesh] of entries){mesh.visible=mode==='assembly'||key===id;mesh.material=key===id?highlight:context;mesh.renderOrder=key===id?1:0;}
    if(outline){scene.remove(outline);outline.geometry.dispose();outline=null;}
    const selectedMesh=entries.get(id);
    marker.position.copy(selectedMesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
    outline=new THREE.LineSegments(new THREE.EdgesGeometry(selectedMesh.geometry,32),new THREE.LineBasicMaterial({color:'#6f3518',transparent:true,opacity:.48}));
    outline.visible=true;scene.add(outline);
    fit();
    const center=selectedMesh.geometry.boundingBox.getCenter(new THREE.Vector3()),size=selectedMesh.geometry.boundingBox.getSize(new THREE.Vector3());
    return {center:center.toArray(),size:size.toArray()};
  }
  return {setData,select,fit,focusSelected,clear};
}
