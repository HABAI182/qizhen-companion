import {call} from './bridge';

type Position={x:number;y:number};
type Drag={
 pointerId:number;
 startX:number;
 startY:number;
 scale:number;
 origin?:Position;
 delta:Position;
 sent:Position;
 moved:boolean;
 finished:boolean;
 sending:boolean;
 frame?:number;
};

export function bindWindowDrag(handle:HTMLElement,kind:'menu'|'pet',reportError:(error:unknown)=>void){
 let active:Drag|undefined;
 handle.style.touchAction='none';

 function clear(drag:Drag){
  if(active!==drag)return;
  active=undefined;
  if(drag.frame!==undefined)cancelAnimationFrame(drag.frame);
  handle.classList.remove('dragging');
  if(handle.hasPointerCapture(drag.pointerId))handle.releasePointerCapture(drag.pointerId);
 }

 async function flush(drag:Drag,origin:Position){
  const {delta,finished}=drag;
  drag.sending=true;
  drag.sent=delta;
  const position={x:origin.x+delta.x,y:origin.y+delta.y,finished};
  try{
   await call(`move_${kind}`,kind==='pet'?{...position,moved:drag.moved}:position);
   if(finished)clear(drag);
  }catch(error){
   clear(drag);
   reportError(error);
  }finally{
   drag.sending=false;
   schedule(drag);
  }
 }

 function schedule(drag:Drag){
  const origin=drag.origin;
  if(active!==drag||!origin||drag.sending)return;
  if(drag.finished){
   // Release sends the exact endpoint even when an animation frame is pending.
   if(drag.frame!==undefined){cancelAnimationFrame(drag.frame);drag.frame=undefined;}
   void flush(drag,origin);
  }else if(drag.frame===undefined&&(drag.delta.x!==drag.sent.x||drag.delta.y!==drag.sent.y)){
   drag.frame=requestAnimationFrame(()=>{
    drag.frame=undefined;
    if(drag.delta.x!==drag.sent.x||drag.delta.y!==drag.sent.y)void flush(drag,origin);
   });
  }
 }

 function update(event:PointerEvent,finished:boolean,useEventPosition=true){
  const drag=active;
  if(!drag||drag.pointerId!==event.pointerId||drag.finished)return;
  if(useEventPosition){
   // Client coordinates move with the window, so keep the origin on the screen.
   drag.delta={
    x:Math.round((event.screenX-drag.startX)*drag.scale),
    y:Math.round((event.screenY-drag.startY)*drag.scale),
   };
   drag.moved||=drag.delta.x!==0||drag.delta.y!==0;
  }
  drag.finished=finished;
  if(finished)handle.classList.remove('dragging');
  schedule(drag);
 }

 handle.onpointerdown=event=>{
  const button=(event.target as Element).closest('button');
  if(active||!event.isPrimary||event.button!==0||(button&&button!==handle))return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('dragging');
  const drag:Drag={pointerId:event.pointerId,startX:event.screenX,startY:event.screenY,scale:window.devicePixelRatio,
   delta:{x:0,y:0},sent:{x:0,y:0},moved:false,finished:false,sending:false};
  active=drag;
  void call<Position>(`begin_${kind}_drag`).then(origin=>{
   drag.origin=origin;
   schedule(drag);
  },error=>{
   clear(drag);
   reportError(error);
  });
 };
 handle.onpointermove=event=>update(event,false);
 handle.onpointerup=event=>update(event,true);
 handle.onpointercancel=handle.onlostpointercapture=event=>update(event,true,false);
}
