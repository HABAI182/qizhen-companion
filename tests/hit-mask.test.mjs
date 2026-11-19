import assert from 'node:assert/strict';
import test from 'node:test';
import {alphaRuns,artworkAlpha} from '../src/hit-mask.mjs';

test('artwork bounds exclude transparent margins, hole, and added controls',()=>{
 const width=14,height=12;
 const rgba=new Uint8ClampedArray(width*height*4);
 for(let y=2;y<8;y++)for(let x=3;x<10;x++){
  if(x>=5&&x<8&&y>=4&&y<7)continue;
  rgba[(y*width+x)*4+3]=255;
 }
 rgba[(10*width+11)*4+3]=7;
 const {occupied,bounds}=artworkAlpha(rgba,width,height);
 assert.deepEqual(bounds,[3,2,10,8]);
 const {runs}=alphaRuns(occupied,width,height,[[10.2,9.1,12.9,10.7]]);
 const hit=(x,y)=>runs.some(([row,first,end])=>row===y&&x>=first&&x<end);
 assert.equal(hit(3,2),true);
 assert.equal(hit(6,5),false);
 assert.equal(hit(0,0),false);
 assert.equal(hit(10,10),true);
 assert.equal(hit(9,10),false);
 assert.equal(hit(9,11),false);
 assert.deepEqual(bounds,[3,2,10,8]);
});

test('empty drawing can keep a recovery control clickable without giving it artwork bounds',()=>{
 const {occupied,bounds}=artworkAlpha(new Uint8ClampedArray(48),4,3);
 assert.equal(bounds,null);
 assert.deepEqual(alphaRuns(occupied,4,3,[[1,1,2,2],[-6,0,-1,2],[5,0,7,2]]).runs,[[1,1,2]]);
});
