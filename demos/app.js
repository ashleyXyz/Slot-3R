import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {replayState} from './timeline.mjs';
import {applyThumbnailFraming} from './thumbnail-camera.mjs';

const $ = id => document.getElementById(id);
const host = $('canvas-host');
const world = new THREE.Scene();
world.background = new THREE.Color('#f6f8fb');
const pointMaterial = new THREE.PointsMaterial({size:2, sizeAttenuation:false, vertexColors:true});
const fitTarget = new THREE.Vector3(), fitPosition = new THREE.Vector3();
const fitUp = new THREE.Vector3(0,-1,0), fitForward = new THREE.Vector3(0,0,1);
const linear = new Float32Array(256);
for(let c=0;c<256;c++){
  const s=c/255;
  linear[c]=s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
}
let renderer, camera, controls, catalog=[], sceneData, cloud, trail, marker, frustum;
let radius=1, ready=false, full=true, playing=false, time=0, currentIndex=-2;
let thumbnailViews={}, thumbnailView=null, thumbnailFraming=true;
let requestId=0, currentScene='', aborter, framePending=false, lastTick=0;
const isStream = () => sceneData?.kind==='stream';
const timeString = t => `${String(Math.floor(Math.max(t,0)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(t,0)%60)).padStart(2,'0')}`;

async function getJSON(url,signal){
  const response=await fetch(url,{signal,cache:'no-cache'});
  if(!response.ok)throw new Error(`Could not load scene (${response.status})`);
  return response.json();
}
function status(message,retry=false){
  $('loading-text').textContent=message;
  $('retry').hidden=!retry;
  $('loading').hidden=false;
}
function dispose(object,keepMaterial=false){
  if(!object)return;
  world.remove(object);
  object.geometry.dispose();
  if(!keepMaterial)object.material.dispose();
}
function invalidate(){
  if(!renderer||framePending)return;
  framePending=true;
  requestAnimationFrame(render);
}
function render(now){
  framePending=false;
  const delta=lastTick?Math.min((now-lastTick)/1000,.08):0;
  lastTick=now;
  if(ready&&playing){
    time=Math.min(time+delta*Number($('speed').value),sceneData.duration);
    if(time>=sceneData.duration)setPlaying(false);
    sync();
  }
  const moving=controls.update(delta);
  renderer.render(world,camera);
  if(moving||playing||controls.autoRotate)invalidate();
}
function setPlaying(value){
  playing=value;
  lastTick=0;
  $('play').textContent=playing?'Pause':time>=sceneData?.duration?'Replay':'Play';
  invalidate();
}
function updateModeButtons(){
  for(const [id,selected] of [['complete',full],['progressive',!full]]){
    $(id).classList.toggle('selected',selected);
    $(id).setAttribute('aria-pressed',String(selected));
  }
}
function setMode(showFull){
  if(!ready||!isStream())return;
  setPlaying(false);
  full=showFull;
  if(full)time=sceneData.duration;
  else if(time>=sceneData.duration)time=0;
  updateModeButtons();
  sync();
}
function rgbURL(index){return `./${sceneData.rgb_path}${String(index).padStart(4,'0')}.jpg`;}
function updateRGB(index){
  if(!isStream()||index<0)return;
  $('rgb-image').src=rgbURL(index);
  $('rgb-image').dataset.frame=String(index);
  const sequence=$('rgb-sequence').querySelectorAll('img');
  sequence.forEach((img,i)=>{img.src=rgbURL(Math.max(index-2+i,0));});
  // Warm only the next observations; the remaining sequences load on demand.
  for(let i=index+1;i<Math.min(index+3,sceneData.frames.length);i++)new Image().src=rgbURL(i);
}
function updateCameraPath(index){
  const show=$('trajectory').checked;
  if(trail){
    trail.visible=show;
    trail.geometry.setDrawRange(0,isStream()&&!full?Math.max(index+1,0):trail.geometry.attributes.position.count);
  }
  if(marker)marker.visible=show&&index>=0;
  if(frustum)frustum.visible=show&&index>=0;
  const frame=sceneData.frames[index];
  if(frame&&marker){
    marker.position.set(frame.c2w[0][3],frame.c2w[1][3],frame.c2w[2][3]);
    frustum.matrix.set(...frame.c2w.flat());
    frustum.matrixWorldNeedsUpdate=true;
  }
  $('camera-legend').hidden=!trail||!show;
}
function sync(){
  if(!ready)return;
  let count=sceneData.count;
  if(isStream()){
    const state=replayState(sceneData.frames,sceneData.count,time,time>=sceneData.duration,full);
    count=state.pointCount;
    $('seek').value=String(time);
    $('clock').textContent=`${timeString(time)} / ${timeString(sceneData.duration)}`;
    $('cloud-mode').textContent=full?'Full result':state.complete?'Complete':'Frame by frame';
    $('stats').textContent=`${Math.max(0,state.index+1)} / ${sceneData.frames.length} frames · ${Math.round(count/1000)}k points`;
    if(currentIndex!==state.index){currentIndex=state.index;updateRGB(currentIndex);}
  }else{
    $('cloud-mode').textContent='Full result';
    $('stats').textContent=`${Math.round(count/1000)}k points`;
  }
  updateCameraPath(currentIndex);
  cloud.geometry.setDrawRange(0,count);
  $('stats').dataset.visiblePoints=String(count);
  $('stats').dataset.totalPoints=String(sceneData.count);
  $('stats').dataset.frame=String(currentIndex);
  $('stats').dataset.scene=currentScene;
  $('play').textContent=playing?'Pause':time>=sceneData.duration?'Replay':'Play';
  invalidate();
}
function resetView(top=false){
  if(!ready)return;
  thumbnailFraming=!top;
  if(top){
    camera.up.copy(fitForward).negate();
    camera.position.copy(fitTarget).addScaledVector(fitUp,radius*2.2).add(new THREE.Vector3(.001,.002,.003));
  }else{
    camera.up.copy(fitUp);
    camera.position.copy(fitPosition);
  }
  applyThumbnailFraming(camera,thumbnailFraming?thumbnailView:null,host.clientWidth,host.clientHeight);
  // OrbitControls captures the up axis when constructed; rebuild it when
  // switching camera orientation so rotation follows the actual scene axes.
  createControls();
  controls.target.copy(fitTarget);
  camera.lookAt(fitTarget);
  controls.update();
  invalidate();
}
function makeGeometry(buffer,meta){
  if(buffer.byteLength!==meta.count*15)throw new Error('Incomplete point cloud. Please try again.');
  const data=new DataView(buffer), positions=new Float32Array(meta.count*3), colors=new Float32Array(meta.count*3);
  for(let i=0;i<meta.count;i++){
    const p=i*15,o=i*3;
    for(let a=0;a<3;a++){
      positions[o+a]=data.getFloat32(p+a*4,true);
      colors[o+a]=linear[data.getUint8(p+12+a)];
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  return geometry;
}
function makeCameraPath(meta){
  const points=isStream()?meta.frames.map(f=>[f.c2w[0][3],f.c2w[1][3],f.c2w[2][3]]):meta.trajectory;
  trail=marker=frustum=undefined;
  if(!points?.length)return;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
  trail=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#d88643',transparent:true,opacity:.9,depthTest:false}));
  trail.frustumCulled=false;trail.renderOrder=2;world.add(trail);
  if(!isStream())return;
  marker=new THREE.Mesh(new THREE.SphereGeometry(radius*.007,10,8),new THREE.MeshBasicMaterial({color:'#d88643',depthTest:false}));
  marker.renderOrder=3;world.add(marker);
  const width=radius*.045, height=width*.65, depth=width*1.3;
  const corners=[[-width,-height,depth],[width,-height,depth],[width,height,depth],[-width,height,depth]];
  const segments=[];
  for(let i=0;i<4;i++)segments.push(0,0,0,...corners[i],...corners[i],...corners[(i+1)%4]);
  const frustumGeometry=new THREE.BufferGeometry();
  frustumGeometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
  frustum=new THREE.LineSegments(frustumGeometry,new THREE.LineBasicMaterial({color:'#d88643',depthTest:false}));
  frustum.matrixAutoUpdate=false;frustum.frustumCulled=false;frustum.renderOrder=3;world.add(frustum);
}
async function loadScene(name){
  const row=catalog.find(item=>item.scene===name);
  if(!row)return;
  const id=++requestId;
  aborter?.abort();aborter=new AbortController();
  const signal=aborter.signal;
  ready=false;setPlaying(false);currentScene=name;
  if(controls){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');}
  for(const button of ['play','restart','seek','rotate','fit','top','fullscreen'])$(button).disabled=true;
  status('Loading reconstruction…');
  $('stats').textContent='—';
  document.querySelectorAll('.scene-card').forEach(button=>{
    const active=button.dataset.scene===name;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  try{
    const [meta,response]=await Promise.all([getJSON(`./data/${name}.json`,signal),fetch(`./data/${name}.bin`,{signal,cache:'no-cache'})]);
    if(!response.ok)throw new Error(`Could not load point cloud (${response.status})`);
    const buffer=await response.arrayBuffer();
    if(id!==requestId)return;
    if(meta.kind==='stream'&&(!meta.frames.length||meta.frames.at(-1).end!==meta.count))throw new Error('Incomplete reconstruction frames');
    const geometry=makeGeometry(buffer,meta);
    dispose(cloud,true);dispose(trail);dispose(marker);dispose(frustum);
    sceneData=meta;
    cloud=new THREE.Points(geometry,pointMaterial);cloud.frustumCulled=false;world.add(cloud);
    const [lo,hi]=meta.bounds.map(value=>new THREE.Vector3(...value));
    fitTarget.copy(lo).add(hi).multiplyScalar(.5);radius=Math.max(lo.distanceTo(hi)*.5,.1);
    const first=meta.frames[0]?.c2w;
    const right=new THREE.Vector3(1,0,0);
    fitUp.set(0,-1,0);fitForward.set(0,0,1);
    if(first){
      fitUp.set(-first[0][1],-first[1][1],-first[2][1]).normalize();
      fitForward.set(first[0][2],first[1][2],first[2][2]).normalize();
      right.set(first[0][0],first[1][0],first[2][0]).normalize();
    }
    // Preserve the original viewer's angle and distance relative to the scene.
    fitPosition.copy(fitTarget).addScaledVector(fitForward,-radius*1.9)
      .addScaledVector(fitUp,radius*.5).addScaledVector(right,radius*.45);
    thumbnailView=thumbnailViews[name]||null;
    thumbnailFraming=true;
    if(thumbnailView){
      fitPosition.fromArray(thumbnailView.position);
      fitTarget.fromArray(thumbnailView.target);
      fitUp.fromArray(thumbnailView.up).normalize();
    }
    makeCameraPath(meta);
    camera.near=radius/1000;camera.far=radius*200;camera.updateProjectionMatrix();
    controls.minDistance=radius*.015;controls.maxDistance=radius*80;
    $('panels').classList.toggle('with-rgb',isStream());
    $('rgb-panel').hidden=$('playback').hidden=$('mode-switch').hidden=!isStream();
    $('trajectory-option').hidden=!trail;
    $('source').hidden=!meta.source_page;
    if(meta.source_page)$('source').href=meta.source_page;
    full=true;time=isStream()?meta.duration:0;currentIndex=-2;
    $('seek').max=String(meta.duration||1);
    updateModeButtons();
    ready=true;
    // The panel may have changed width after selecting an RGB sequence.
    resizeRenderer();resetView();sync();
    $('loading').hidden=true;
    for(const button of ['play','restart','seek','rotate','fit','top','fullscreen'])$(button).disabled=false;
    history.replaceState(null,'',`${location.pathname}${location.search}#${name}`);
    notifyHeight();
  }catch(error){
    if(error.name==='AbortError'||id!==requestId)return;
    status(error.message,true);console.error(error);
  }
}
function resizeRenderer(){
  const width=host.clientWidth,height=host.clientHeight;
  if(!width||!height)return;
  renderer.setSize(width,height);
  applyThumbnailFraming(camera,thumbnailFraming?thumbnailView:null,width,height);
  invalidate();
}
function initializeRenderer(){
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  camera=new THREE.PerspectiveCamera(48,1,.001,1000);
  createControls();
  new ResizeObserver(resizeRenderer).observe(host);
  resizeRenderer();
}
function createControls(){
  const autoRotate=controls?.autoRotate||false;
  controls?.dispose();
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotateSpeed=.65;
  controls.autoRotate=autoRotate;
  controls.minDistance=radius*.015;controls.maxDistance=radius*80;
  controls.addEventListener('change',invalidate);
  controls.addEventListener('start',()=>{
    if(controls.autoRotate){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');}
  });
}
$('play').onclick=()=>{
  if(!ready||!isStream())return;
  if(playing){setPlaying(false);return;}
  if(time>=sceneData.duration)time=0;
  full=false;updateModeButtons();sync();setPlaying(true);
};
$('restart').onclick=()=>{setPlaying(false);time=0;full=false;updateModeButtons();sync();};
$('seek').oninput=()=>{full=false;time=Number($('seek').value);updateModeButtons();sync();};
$('complete').onclick=()=>setMode(true);
$('progressive').onclick=()=>setMode(false);
$('trajectory').onchange=sync;
$('size').oninput=()=>{pointMaterial.size=Number($('size').value);invalidate();};
$('rotate').onclick=()=>{
  controls.autoRotate=!controls.autoRotate;
  $('rotate').setAttribute('aria-pressed',String(controls.autoRotate));lastTick=0;invalidate();
};
$('fit').onclick=()=>resetView();$('top').onclick=()=>resetView(true);
$('fullscreen').onclick=()=>{
  if(document.fullscreenElement)document.exitFullscreen();
  else $('viewer').requestFullscreen().catch(()=>{});
};
$('retry').onclick=()=>loadScene(currentScene);
window.addEventListener('hashchange',()=>{
  const requested=location.hash.slice(1);
  if(requested!==currentScene&&catalog.some(row=>row.scene===requested))loadScene(requested);
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){setPlaying(false);if(controls){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');}}
});
let previousHeight=0;
function notifyHeight(){
  if(window.parent===window)return;
  const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height);
  if(height!==previousHeight){previousHeight=height;window.parent.postMessage({type:'slot3r-demo-height',height},location.origin);}
}
new ResizeObserver(notifyHeight).observe(document.querySelector('main'));
try{
  initializeRenderer();
  const [scenes,thumbnailConfig]=await Promise.all([
    getJSON('./data/catalog.json'),getJSON('../assets/results/thumbnail-views.json')
  ]);
  catalog=scenes;thumbnailViews=thumbnailConfig.cameras;
  for(const [index,row] of catalog.entries()){
    const button=document.createElement('button');
    button.className='scene-card';button.dataset.scene=row.scene;
    button.setAttribute('aria-label',`Explore reconstruction ${String(index+1).padStart(2,'0')}`);
    const thumb=document.createElement('div');thumb.className='thumb';
    const img=document.createElement('img');img.src=`../assets/results/${row.scene}-thumb.webp?v=6`;img.alt='';img.loading='lazy';thumb.appendChild(img);
    const info=document.createElement('div');info.className='card-info';
    const number=document.createElement('b');number.textContent=String(index+1).padStart(2,'0');
    const capability=document.createElement('span');capability.textContent=row.kind==='stream'?'RGB + 3D':'3D';
    info.append(number,capability);button.append(thumb,info);button.onclick=()=>loadScene(row.scene);
    $(row.featured?'featured':'gallery').appendChild(button);
  }
  const requested=location.hash.slice(1);
  await loadScene(catalog.some(row=>row.scene===requested)?requested:catalog[0].scene);
}catch(error){
  status('Could not start the 3D viewer: '+error.message);console.error(error);
}
