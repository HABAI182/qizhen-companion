import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState} from '../src/state.mjs';
import {KeyOverlay} from '../src/key-overlay.mjs';
import {GazeController} from '../src/gaze-controller.mjs';
import {normalizePreferences} from '../src/preferences.mjs';

const idle={keysHeld:0,mouseDown:false,newPress:false,newMousePress:false,keyLabel:'',reach:0};
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
