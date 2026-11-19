export type Snapshot={keyboardPress:number,mousePress:number,keyboardBounce:number,mouseBounce:number,reach:number,depth:number,zone:string,label:string};
export type FrameOptions={gaze:{x:number,y:number},pointer:{x:number,y:number},intensity:number,idle:boolean,expression:string,actionAge:number,touchAge?:number,headElasticity:number,keyboardScale:number,mouseScale:number,gazeScale:number,mouseEnabled:boolean};
type Layer={id:string,file:string,x:number,y:number,width:number,height:number,group?:string,pivot?:[number,number],mask?:string,image:HTMLImageElement};
export const loadImage=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`素材读取失败：${url}`));image.src=url;});

export class PetRenderer{
 mode='artwork-placeholder';
 private layers:Layer[]=[];
 private reference?:HTMLImageElement;
 private ctx:CanvasRenderingContext2D;
 private previous=0;
 private smooth={x:0,y:0};
 private mouse={x:0,y:0};
 constructor(readonly canvas:HTMLCanvasElement){this.ctx=canvas.getContext('2d',{alpha:true})!;}
 async load(){
  const response=await fetch('/assets/model-config.json');if(!response.ok)throw new Error('素材入口读取失败');
  const config=await response.json();
  if(config.mode==='layers'){
   const manifest=await(await fetch(config.layers)).json();
   this.canvas.width=manifest.canvas.width;this.canvas.height=manifest.canvas.height;
   this.layers=await Promise.all(manifest.layers.map(async(layer:Layer)=>({...layer,image:await loadImage(layer.file)})));
   this.mode='layered-artwork';
  }else{
   this.reference=await loadImage('/assets/neutral-reference.png');this.canvas.width=this.reference.naturalWidth;this.canvas.height=this.reference.naturalHeight;
  }
 }
 draw(now:number,state:Snapshot,options:FrameOptions){
  const {ctx,canvas}=this, dt=this.previous?Math.min((now-this.previous)/1000,.05):1/60;this.previous=now;
  const blend=1-Math.exp(-dt*12);this.smooth.x+=(options.gaze.x-this.smooth.x)*blend;this.smooth.y+=(options.gaze.y-this.smooth.y)*blend;
  this.mouse.x+=(options.pointer.x-this.mouse.x)*blend;this.mouse.y+=(options.pointer.y-this.mouse.y)*blend;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Original art is an explicitly marked technical placeholder until parts are ready.
  if(this.reference){ctx.drawImage(this.reference,0,0);return;}
  const breath=options.idle?Math.sin(now/(options.expression==='sleepy'?2100:1300))*1.6*options.intensity:0;
  const impulse=state.keyboardBounce+state.mouseBounce;
  const nod=options.expression==='nod'?Math.sin(Math.min(1,options.actionAge/950)*Math.PI*2)*Math.exp(-options.actionAge/1100)*7*options.intensity:0;
  const blinkPhase=(now%5100)/5100;
  // Authored open/closed textures are a discrete blink, not continuous eyelid geometry.
  let closed=options.idle&&blinkPhase>.965&&blinkPhase<.986;
  if(options.expression==='sleepy'||options.expression==='smile'&&options.actionAge<850)closed=true;
  for(const layer of this.layers){
   const group=layer.group||'head';let dx=0,dy=0,angle=0;
   const head=['head','eye','iris','closed-eye','hair','ornament','mouth'].includes(group);
   if(group==='closed-eye'&&!closed)continue;
   if((group==='eye'||group==='iris')&&closed)continue;
   if(group==='keyboard-hand'){dx=state.reach*25*options.intensity*options.keyboardScale;dy=(state.depth*2+state.keyboardPress*8)*options.intensity*options.keyboardScale;}
   if(group==='mouse'||group==='mouse-hand'){dx=this.mouse.x*8*options.intensity*options.mouseScale;dy=this.mouse.y*3*options.intensity*options.mouseScale;if(group==='mouse-hand')dy+=state.mousePress*5*options.intensity*options.mouseScale;}
   if(group==='iris'){dx=this.smooth.x*2.1*options.gazeScale/2.1*options.intensity;dy=this.smooth.y*1.4*options.gazeScale/2.1*options.intensity;}
   // The ahoge root is hidden behind the main hair. Other side hair shares the head
   // transform until its proper deformation mesh is authored in Cubism.
   if(layer.id==='ahoge')angle=(options.idle?Math.sin(now/1600)*.003:0)-impulse*.003*options.intensity;
   ctx.save();
   if(head){ctx.translate(627+this.smooth.x*1.6*options.intensity,870+breath-impulse*13*options.headElasticity*options.intensity+nod);ctx.rotate(this.smooth.x*.005*options.intensity);ctx.translate(-627,-870);}
   if(layer.mask){const mask=new Path2D(layer.mask);ctx.clip(mask);}
   if(group==='mouse-hand'||group==='keyboard-hand'){
    this.drawArm(layer,dx,dy);ctx.restore();continue;
   }
   const pivot=layer.pivot||[layer.x+layer.width/2,layer.y+layer.height/2];
   ctx.translate(pivot[0]+dx,pivot[1]+dy);ctx.rotate(angle);ctx.translate(-pivot[0],-pivot[1]);
   ctx.drawImage(layer.image,layer.x,layer.y,layer.width,layer.height);ctx.restore();
  }
 }
 private drawArm(layer:Layer,dx:number,dy:number){
  const {ctx}=this,root=layer.group==='mouse-hand'?825:872,range=90;
  if(Math.abs(dx)+Math.abs(dy)<.001){ctx.drawImage(layer.image,layer.x,layer.y,layer.width,layer.height);return;}
  const weight=(y:number)=>{const t=Math.max(0,Math.min(1,(y-root)/range));return t*t*(3-2*t);};
  // One pixel of source overlap prevents filtered slice boundaries from opening
  // horizontal alpha seams as the sleeve bends.
  for(let row=0;row<layer.height;row+=3){const height=Math.min(4,layer.height-row),w0=weight(layer.y+row),w1=weight(layer.y+row+height);ctx.drawImage(layer.image,0,row,layer.width,height,layer.x+dx*w0,layer.y+row+dy*w0,layer.width,height+dy*(w1-w0));}
 }
 diagnostics(){return {mode:this.mode,layerCount:this.layers.length,width:this.canvas.width,height:this.canvas.height};}
}
