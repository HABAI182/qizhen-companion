import {Spring} from './key-target.mjs';
export class InputState {
 keyboardHeld=false;mouseHeld=false;keyboardStarted=-Infinity;mouseStarted=-Infinity;
 reach=0;depth=0;zone='rest';label='';labelUntil=0;last=null;speed=1;
 keyboardVisibleUntil=-Infinity;keyboardContactAt=-Infinity;mouseVisibleUntil=-Infinity;
 springs={key:new Spring(),mouse:new Spring(),x:new Spring(),y:new Spring(),keyHead:new Spring(),mouseHead:new Spring()};
 advance(now,speed=1){
  if(this.last===null){this.last=now;return;}
  if(now<=this.last)return;
  const start=this.last;
  const elapsed=now-start;
  const dt=elapsed/1000;this.last=now;
  // A fast OS tap still advances through reach, contact and release.
  const active=this.keyboardHeld?elapsed:Math.max(0,Math.min(elapsed,this.keyboardVisibleUntil-start));
  const beforeContact=Math.max(0,Math.min(active,this.keyboardContactAt-start));
  const release=(elapsed-active)/1000;
  this.springs.x.step(this.reach,active/1000,44*speed,.79);
  this.springs.y.step(this.depth,active/1000,44*speed,.79);
  this.springs.key.step(0,beforeContact/1000,55*speed,.84);
  this.springs.key.step(1,(active-beforeContact)/1000,55*speed,.81);
  this.springs.key.step(0,release,36*speed,.73);
  this.springs.x.step(0,release,23*speed,.74);
  this.springs.y.step(0,release,23*speed,.74);
  const mouseActive=this.mouseHeld?elapsed:Math.max(0,Math.min(elapsed,this.mouseVisibleUntil-start));
  this.springs.mouse.step(1,mouseActive/1000,34*speed,.74);
  this.springs.mouse.step(0,(elapsed-mouseActive)/1000,33*speed,.76);
  this.springs.keyHead.step(0,dt,18*speed,.34);
  this.springs.mouseHead.step(0,dt,18*speed,.34);
 }
 update(frame,now){
  this.advance(now,this.speed);
  const keyReleased=this.keyboardHeld&&frame.keysHeld===0;
  const mouseReleased=this.mouseHeld&&!frame.mouseDown;
  this.keyboardHeld=frame.keysHeld>0;this.mouseHeld=Boolean(frame.mouseDown);
  if(this.keyboardHeld||frame.newPress){
   const x=frame.targetX??frame.reach??0,y=frame.targetY??.35;
   if(Math.hypot(x-this.reach,y-this.depth)>.08||frame.newPress){
    this.keyboardContactAt=now+30/this.speed;
    this.keyboardVisibleUntil=now+148/this.speed;
   }
   this.reach=x;this.depth=y;this.zone=frame.targetZone??'left-near';
  }
  if(frame.newPress){this.keyboardStarted=now;this.springs.keyHead.kick(27);this.label=frame.keyLabel;this.labelUntil=now+900;}
  if(frame.newMousePress){this.mouseStarted=now;this.mouseVisibleUntil=now+92/this.speed;this.springs.mouse.kick(6);this.springs.mouseHead.kick(16);}
  // Short taps already rebound through the spring. A held key adds a smaller release beat.
  if(keyReleased)this.springs.keyHead.kick(-9*Math.max(0,Math.min(1,(now-this.keyboardStarted-35)/60)));
  if(mouseReleased&&Number.isFinite(this.mouseStarted))this.springs.mouseHead.kick(-6*Math.max(0,Math.min(1,(now-this.mouseStarted-30)/70)));
  for(const spring of [this.springs.keyHead,this.springs.mouseHead])spring.v=Math.max(-34,Math.min(34,spring.v));
 }
 cancelMouseHead(){
  this.mouseStarted=-Infinity;
  this.springs.mouseHead.x=0;
  this.springs.mouseHead.v=0;
 }
 snapshot(now,speed=1){
  this.speed=speed;this.advance(now,speed);
  return {keyboardPress:this.springs.key.x,mousePress:this.springs.mouse.x,
   keyboardBounce:this.springs.keyHead.x,mouseBounce:this.springs.mouseHead.x,reach:this.springs.x.x,
   depth:this.springs.y.x,zone:this.keyboardHeld||now<this.keyboardVisibleUntil?this.zone:'rest',label:now<this.labelUntil?this.label:''};
 }
}
