import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState} from '../src/state.mjs';
import {KeyOverlay} from '../src/key-overlay.mjs';
import {GazeController} from '../src/gaze-controller.mjs';
import {normalizePreferences} from '../src/preferences.mjs';
import {keyTarget} from '../src/key-target.mjs';
import {FrameRate} from '../src/frame-rate.mjs';

const idle={keysHeld:0,mouseDown:false,newPress:false,newMousePress:false,keyLabel:'',reach:0};
test('render pacing reaches its target on different display refresh rates',()=>{
 for(const refresh of [60,75,120,144,165,180])for(const target of [30,60]){
  const frameRate=new FrameRate();
  const hits=Array.from({length:refresh*3},(_,i)=>frameRate.due(i*1000/refresh,target)).filter(Boolean);
  assert.equal(hits.length,target*3,`${refresh} Hz at ${target} FPS`);
  assert(frameRate.due(10000,target));
  assert(!frameRate.due(10000+.01,target));
 }
});
test('OS repeat keeps a held pose without kicking another head bounce',()=>{
 const repeated=new InputState(),held=new InputState();
 for(const s of [repeated,held]){s.update({...idle,keysHeld:1,newPress:true,keyLabel:'A',targetX:.6},0);s.snapshot(70);}
 repeated.update({...idle,keysHeld:1,targetX:.6,repeats:['A']},100);
 held.update({...idle,keysHeld:1,targetX:.6},100);
 assert.deepEqual(repeated.snapshot(160),held.snapshot(160));
 assert.equal(repeated.keyboardStarted,0);
 repeated.update(idle,200);repeated.update({...idle,keysHeld:1,newPress:true,keyLabel:'A'},240);
 assert.equal(repeated.keyboardStarted,240);
});
test('a mouse press does not reroute or release the keyboard hand',()=>{
 const s=new InputState();s.update({...idle,keysHeld:1,newPress:true,targetX:.7,targetY:-.4,targetZone:'right-far'},0);
 s.update({...idle,keysHeld:1,mouseDown:true,newMousePress:true,targetX:.7,targetY:-.4,targetZone:'right-far'},90);
 const pose=s.snapshot(160);assert(pose.keyboardPress>.5);assert(pose.mousePress>.5);assert.equal(pose.zone,'right-far');assert(pose.reach>0);
});
test('a head touch can consume both mouse head impulses while keeping hand and keyboard reactions',()=>{
 const touch=new InputState(),keyboard=new InputState();
 const key={...idle,keysHeld:1,newPress:true,keyLabel:'A',targetX:.6};
 touch.update({...key,mouseDown:true,newMousePress:true},0);
 keyboard.update(key,0);
 assert(touch.snapshot(40).mouseBounce>.1);
 touch.cancelMouseHead();
 assert(touch.snapshot(120).mousePress>.8);
 touch.update({...idle,keysHeld:1,targetX:.6},145);
 for(const time of [155,190,260,500]){
  const pose=touch.snapshot(time);
  assert.equal(pose.mouseBounce,0);
  assert(Math.abs(pose.keyboardBounce-keyboard.snapshot(time).keyboardBounce)<1e-10);
 }
 touch.update({...idle,keysHeld:1,mouseDown:true,newMousePress:true,targetX:.6},600);
 assert(touch.snapshot(650).mouseBounce>.1);
});
test('an edge-only mouse tap has visible contact and releases without a held button',()=>{
 for(const speed of [.5,1,2]){
  const input=new InputState();
  input.snapshot(0,speed);
  input.update({...idle,newMousePress:true},20);
  assert(input.snapshot(20+88/speed,speed).mousePress>.85);
  assert.equal(input.mouseHeld,false);
  assert(Math.abs(input.snapshot(20+400/speed,speed).mousePress)<.01);
 }
});
test('even short taps reach each of the five keyboard landings before returning',()=>{
 for(const code of ['KeyQ','KeyA','KeyU','KeyH','Space']){
  const target=keyTarget(code);
  for(const pulse of [8,30,60]){
   for(const fps of [30,60]){
    const state=new InputState();
    state.update({...idle,keysHeld:1,newPress:true,keyLabel:'A',
     targetX:target.x,targetY:target.y,targetZone:target.zone},0);
    let sawContact=false,released=false;
    for(let time=1000/fps;time<480;time+=1000/fps){
     if(!released&&time>=pulse){state.update(idle,pulse);released=true;}
     const pose=state.snapshot(time);
     if(pose.zone===target.zone&&pose.keyboardPress>.85&&Math.hypot(pose.reach-target.x,pose.depth-target.y)<.045){
      sawContact=true;
     }
    }
    assert(sawContact,`${code}, ${pulse}ms, ${fps}fps`);
    const rest=state.snapshot(550);
    assert(rest.keyboardPress<.01&&Math.hypot(rest.reach,rest.depth)<.01);
   }
  }
 }
});
test('key badges are bounded, repeat is opt-in, and expired text leaves memory',()=>{
 const p=normalizePreferences(),overlay=new KeyOverlay();overlay.add(['A','B','C'],0,p);
 assert.deepEqual(overlay.read(20,p).map(b=>b.label),['C']);
 overlay.add(['C'],200,p,true);assert.equal(overlay.sequence,3);
 assert.deepEqual(overlay.read(1600,p),[]);assert.equal(overlay.badges.length,0);
 overlay.add(['secret sentence'],1800,p);assert.equal(overlay.badges.length,0);
});
test('gaze returns smoothly after real pointer inactivity',()=>{
 const p=normalizePreferences(),gaze=new GazeController();gaze.update(1,-1,0,true);gaze.update(1,-1,2500,false);
 assert.equal(gaze.read(2900,p).x,1);assert.equal(gaze.read(4000,p).x,0);
 gaze.update(-.5,.2,4100,true);assert.equal(gaze.read(4100,p).x,-.5);
 assert.equal(gaze.read(4200,{...p,cursorFollow:false}).x,0);
});
