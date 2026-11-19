import {CubismNativeRenderer} from './cubism-native-renderer';
import type {FrameOptions, Snapshot} from './pet-renderer';
const renderer=new CubismNativeRenderer(document.querySelector('canvas')!,new URLSearchParams(location.search).get('model')||undefined);
declare global {
 interface Window {
  zjuQA:{
   ready:boolean;
   error?:string;
   pose?:(values:Record<string,number>)=>unknown;
   frame?:(time:number,input:Snapshot,options:FrameOptions)=>unknown;
  };
 }
}
window.zjuQA={ready:false};
renderer.load().then(()=>{
 window.zjuQA={
  ready:true,
  pose(values){renderer.sample(values);return renderer.diagnostics();},
  frame(time,input,options){renderer.draw(time,input,options);return renderer.diagnostics();},
 };
}).catch(error=>{window.zjuQA={ready:false,error:String(error)};});
