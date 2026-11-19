import {alphaRuns,artworkAlpha} from './hit-mask.mjs';
import {call,desktop} from './bridge';

export class HitTesting {
 private canvas=document.createElement('canvas');
 private ctx=this.canvas.getContext('2d',{willReadFrequently:true})!;
 private last=0;private hash='';private pending:Promise<void>|undefined;private sent=0;private error='';
 constructor(private shell:HTMLElement){}
 sample(now:number,force=false,pointerNear=true){
  if(this.pending)return this.pending;
  if(!force&&now-this.last<(pointerNear?65:170))return;this.last=now;
  const bounds=this.shell.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0)return;
  const width=Math.min(480,Math.ceil(bounds.width)),height=Math.min(600,Math.ceil(width*bounds.height/bounds.width));
  if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;const ctx=this.ctx,sx=width/bounds.width,sy=height/bounds.height;
  ctx.clearRect(0,0,width,height);
  for(const canvas of this.shell.querySelectorAll<HTMLCanvasElement>('canvas')){
   const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height);
   // Match the canvases' object-fit:contain; object-position:center bottom.
   const w=canvas.width*scale,h=canvas.height*scale;
   ctx.drawImage(canvas,(r.left-bounds.left+(r.width-w)/2)*sx,(r.bottom-bounds.top-h)*sy,w*sx,h*sy);
  }
  const {occupied,bounds:artworkBounds}=artworkAlpha(ctx.getImageData(0,0,width,height).data,width,height);
  const tools=this.shell.querySelector<HTMLElement>('.pet-tools');
  if(tools&&artworkBounds){
   // Keep the tools inside the screen when the drawing touches its edge.
   const bottom=`${Math.max(1.4,100*(height-artworkBounds[3])/height)}%`;
   const right=`${Math.max(8,100*(width-artworkBounds[2])/width)}%`;
   if(tools.style.bottom!==bottom)tools.style.bottom=bottom;
   if(tools.style.right!==right)tools.style.right=right;
  }
  const hotspots=Array.from(this.shell.querySelectorAll<HTMLElement>('.pet-tools button,#notice.visible'),el=>{
   const r=el.getBoundingClientRect();
   return [(r.left-bounds.left)*sx,(r.top-bounds.top)*sy,(r.right-bounds.left)*sx,(r.bottom-bounds.top)*sy];
  });
  const {runs,hash}=alphaRuns(occupied,width,height,hotspots),key=`${width},${height},${hash},${artworkBounds?.join(',')??''}`;
  if(this.hash===key)return;this.hash=key;
  if(desktop){
   this.pending=call('update_hit_mask',{width,height,runs,artworkBounds}).then(()=>{this.sent++;this.error='';}).catch(e=>{this.hash='';this.error=String(e);}).finally(()=>{this.pending=undefined;});
   return this.pending;
  }
 }
 read(){return {width:this.canvas.width,height:this.canvas.height,updates:this.sent,error:this.error};}
}
