import {CubismFramework} from '../vendor/live2d/src/live2dcubismframework';
import {CubismMoc} from '../vendor/live2d/src/model/cubismmoc';
import {CubismModel} from '../vendor/live2d/src/model/cubismmodel';
import {CubismModelMatrix} from '../vendor/live2d/src/math/cubismmodelmatrix';
import {CubismMatrix44} from '../vendor/live2d/src/math/cubismmatrix44';
import {CubismRenderer_WebGL} from '../vendor/live2d/src/rendering/cubismrenderer_webgl';
import {CubismShaderManager_WebGL} from '../vendor/live2d/src/rendering/cubismshader_webgl';
import {CubismPhysics} from '../vendor/live2d/src/physics/cubismphysics';
import type {Snapshot,FrameOptions} from './pet-renderer';
import {PetMotion} from './pet-motion';
import {modelEntry} from './runtime-assets.mjs';

const shaders='/vendor/live2d/shaders/';
const image=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('贴图读取失败'));im.src=url;});
let ready=false;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const referenceEdge = 1254;
const bufferBucket = 64;
const minimumEdge = 256;
const displaySupersampling = 1.25;
type ColorBuffer = 'reference' | 'adaptive';

export class CubismNativeRenderer {
 readonly mode='cubism-native';
 private gl!:WebGLRenderingContext;private moc!:CubismMoc;private model!:CubismModel;
 private renderer!:CubismRenderer_WebGL;private matrix!:CubismModelMatrix;
 private indices=new Map<string,number>();private textures:WebGLTexture[]=[];
 private consistent=false;
 private motion=new PetMotion();
 private physics?:CubismPhysics;
 private physicsRunning=false;
 private viewport = [0, 0, referenceEdge, referenceEdge];
 private sizeObserver?: ResizeObserver;
 private cssEdge = 0;
 private sizeChanged = true;
 private lastDpr = 0;
 constructor(readonly canvas:HTMLCanvasElement,private entry=modelEntry,private readonly colorBuffer:ColorBuffer='reference'){}

 private observeDisplaySize() {
  const update = (width:number, height:number) => {
   const edge = Math.min(width, height);
   if (Number.isFinite(edge) && edge > 0 && edge !== this.cssEdge) {
    this.cssEdge = edge;
    this.sizeChanged = true;
   }
  };
  const rect = this.canvas.getBoundingClientRect();
  update(rect.width, rect.height);
  this.sizeObserver = new ResizeObserver(([entry]) => {
   update(entry.contentRect.width, entry.contentRect.height);
  });
  this.sizeObserver.observe(this.canvas);
 }

 private fitColorBuffer() {
  let edge = referenceEdge;
  if (this.colorBuffer === 'adaptive') {
   const dpr = window.devicePixelRatio || 1;
   if (!this.sizeChanged && dpr === this.lastDpr) return;
   this.sizeChanged = false;
   this.lastDpr = dpr;
   if (this.cssEdge > 0) {
    const requested = this.cssEdge * dpr * displaySupersampling;
    edge = clamp(Math.ceil(requested / bufferBucket) * bufferBucket, minimumEdge, referenceEdge);
   }
  }
  if (this.canvas.width !== edge) this.canvas.width = edge;
  if (this.canvas.height !== edge) this.canvas.height = edge;
  this.viewport[2] = edge;
  this.viewport[3] = edge;
 }

 async load(){
  if(typeof Live2DCubismCore==='undefined')await new Promise<void>((resolve,reject)=>{const el=document.createElement('script');el.src='/vendor/live2d/live2dcubismcore.min.js';el.onload=()=>resolve();el.onerror=()=>reject(new Error('Live2D Core 读取失败'));document.head.append(el);});
  if(!ready){if(!CubismFramework.startUp())throw new Error('Live2D 初始化失败');CubismFramework.initialize();ready=true;}
  if(!this.entry.startsWith('/models/')||this.entry.includes('..')||this.entry.includes(':'))throw new Error('模型入口越界');
  const base=this.entry.slice(0,this.entry.lastIndexOf('/')+1);const response=await fetch(this.entry);if(!response.ok)throw new Error('Live2D 模型入口读取失败');
  const manifest=await response.json();const local=(file:string)=>{if(file.includes('..')||file.startsWith('/')||file.includes(':'))throw new Error('模型引用越界');return base+file;};
  const data=await(await fetch(local(manifest.FileReferences.Moc))).arrayBuffer();
  this.consistent=CubismMoc.hasMocConsistency(data);if(!this.consistent)throw new Error('MOC3 一致性校验失败');
  this.moc=CubismMoc.create(data,true);if(!this.moc)throw new Error('MOC3 无法载入');this.model=this.moc.createModel();if(!this.model)throw new Error('模型无法创建');
  for(let i=0;i<this.model.getParameterCount();i++)this.indices.set(this.model.getParameterId(i).getString(),i);
  for(const id of ['ParamEyeLOpen','ParamEyeROpen','ParamEyeBallX','ParamEyeBallY','ParamAngleX','ParamAngleY','ParamAngleZ','ParamHandLPress','ParamHandRPress','ParamHandLX','ParamHandLY','ParamHandRX','ParamHandRY'])if(!this.indices.has(id))throw new Error('模型缺少参数 '+id);
  if(this.colorBuffer==='adaptive')this.observeDisplaySize();
  this.fitColorBuffer();
  const gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL 不可用');this.gl=gl;
  this.model.saveParameters();this.matrix=new CubismModelMatrix(this.model.getCanvasWidth(),this.model.getCanvasHeight());
  this.matrix.setupFromLayout(new Map(Object.entries(manifest.Layout||{}) as [string,number][]));
  if(manifest.FileReferences.Physics){
   const response=await fetch(local(manifest.FileReferences.Physics));
   if(!response.ok)throw new Error('Live2D 物理配置读取失败');
   const physics=await response.arrayBuffer();
   this.physics=CubismPhysics.create(physics,physics.byteLength);
   this.physics.stabilization(this.model);
  }
  this.renderer=new CubismRenderer_WebGL(this.canvas.width,this.canvas.height);this.renderer.initialize(this.model);this.renderer.setClippingMaskBufferSize(1024);this.renderer.startUp(gl);this.renderer.setIsPremultipliedAlpha(true);this.renderer.loadShaders(shaders);
  for(const [i,file] of manifest.FileReferences.Textures.entries()){
   const im=await image(local(file)),tex=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,1);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);this.textures.push(tex);this.renderer.bindTexture(i,tex);
  }
  const deadline=performance.now()+12000;
  while(!CubismShaderManager_WebGL.getInstance().getShader(gl)._isShaderLoaded){if(performance.now()>deadline)throw new Error('Live2D 着色器未载入');await new Promise(r=>setTimeout(r,16));}
  this.sample({});
 }
 private set(id:string,value:number){const i=this.indices.get(id);if(i===undefined||!Number.isFinite(value))throw new Error('无效参数 '+id);this.model.setParameterValueByIndex(i,clamp(value,this.model.getParameterMinimumValue(i),this.model.getParameterMaximumValue(i)));}
 sample(values:Record<string,number>){
  this.model.loadParameters();
  for(const [id,value] of Object.entries(values))this.set(id,value);
  this.render();
 }
 private render(){
  if(this.colorBuffer==='adaptive')this.fitColorBuffer();
  this.model.update();
  const gl=this.gl;this.renderer.setRenderState(null as unknown as WebGLFramebuffer,this.viewport);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  const matrix=new CubismMatrix44();matrix.multiplyByMatrix(this.matrix);this.renderer.setMvpMatrix(matrix);this.renderer.drawModel(shaders);
 }
 draw(now:number,s:Snapshot,o:FrameOptions){
  const {dt,values}=this.motion.step(now,s,o);
  this.model.loadParameters();
  for(const [id,value] of Object.entries(values))if(this.indices.has(id))this.set(id,value);
  if(this.physics&&o.intensity>0){
   if(this.physicsRunning)this.physics.evaluate(this.model,dt);
   else this.physics.stabilization(this.model);
  }
  this.physicsRunning=Boolean(this.physics&&o.intensity>0);
  this.render();
 }
 diagnostics(){
  const parameters:Record<string,number>={},meshes:Record<string,number>={},clipping:Record<string,string[]>={},opacity:Record<string,number>={};
  const bounds:Record<string,[number,number,number,number]>={};
  for(const [id,i] of this.indices)parameters[id]=this.model.getParameterValueByIndex(i);
  const masks=this.model.getDrawableMasks(),counts=this.model.getDrawableMaskCounts();
  for(let i=0;i<this.model.getDrawableCount();i++){
   const id=this.model.getDrawableId(i).getString(),vertices=this.model.getDrawableVertexPositions(i);
   let hash=2166136261,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
   for(let j=0;j<vertices.length;j+=2){
    const x=vertices[j],y=vertices[j+1];
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    hash=Math.imul(hash^Math.round(x*1e6),16777619);hash=Math.imul(hash^Math.round(y*1e6),16777619);
   }
   meshes[id]=hash>>>0;opacity[id]=this.model.getDrawableOpacity(i);bounds[id]=[x0,y0,x1,y1];
   if(counts[i])clipping[id]=Array.from(masks[i]).slice(0,counts[i]).map(j=>this.model.getDrawableId(j).getString());
  }
  return {mode:this.mode,coreConsistency:this.consistent,mocVersion:this.moc.getMocVersion(),drawables:this.model.getDrawableCount(),parameters,meshes,opacity,clipping,bounds,physicsLoaded:Boolean(this.physics),width:this.canvas.width,height:this.canvas.height,maskEdge:this.renderer.getClippingMaskBufferSize()};
 }
 dispose(){this.sizeObserver?.disconnect();if(this.physics)CubismPhysics.delete(this.physics);this.renderer?.release();for(const tex of this.textures)this.gl.deleteTexture(tex);if(this.model)this.moc.deleteModel(this.model);this.moc?.release();}
}
