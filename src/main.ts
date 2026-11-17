import './style.css';
import {listen} from '@tauri-apps/api/event';
import {InputState} from './state.mjs';
import {GazeController} from './gaze-controller.mjs';
import {KeyOverlay} from './key-overlay.mjs';
import {keyTarget} from './key-target.mjs';
import {HitTesting} from './hit-testing';
import {PetRenderer} from './pet-renderer';
import {settingsPage,menuPage} from './settings';
import {desktop,call,prefs,initializePreferences,onPreferences,onAction,notify,escapeHtml} from './bridge';

type InputFrame={keysHeld:number,mouseDown:boolean,newPress:boolean,newMousePress:boolean,keyLabel:string,reach:number,targetX?:number,targetY?:number,targetZone?:string,cursorX:number,cursorY:number,cursorMoved?:boolean,presses?:string[],repeats?:string[],hovering?:boolean};
const root=document.getElementById('app')!;
const empty:InputFrame={keysHeld:0,mouseDown:false,newPress:false,newMousePress:false,keyLabel:'',reach:0,cursorX:0,cursorY:0};
async function petPage(){
 document.body.className=desktop?'pet-page':'preview-page';
 root.innerHTML=`<div class="pet-shell"><canvas id="pet" aria-label="浙大娘桌宠"></canvas><div id="key" class="key-bubbles" aria-hidden="true"></div><div id="speech" class="speech-bubble" role="status"></div><div class="pet-tools"><button id="drag" title="拖动桌宠" aria-label="拖动桌宠">⠿</button><button id="interact" title="互动菜单" aria-label="互动菜单">✦</button><button id="settings" title="设置" aria-label="设置">⚙</button></div><p id="notice" role="alert"></p></div>${desktop?'':`<aside class="preview-controls"><p class="eyebrow">浙大娘 · 制作预览</p><h1>求是就好啦！</h1><p id="stage">载入素材</p><div class="button-row"><button id="demoKey">键盘反馈</button><button id="demoMouse">鼠标反馈</button><button id="demoNod">点头</button></div><div class="button-row"><a href="?settings" target="zju-settings">设置</a><a href="?menu" target="zju-menu">互动菜单</a><button id="darkGround">切换背景</button></div></aside>`}`;
 const canvas=document.getElementById('pet') as HTMLCanvasElement;
 const renderer=new PetRenderer(canvas);await renderer.load();
 const shell=document.querySelector<HTMLElement>('.pet-shell')!,state=new InputState(),gaze=new GazeController(),overlay=new KeyOverlay(),hit=new HitTesting(shell);
 const pointer={x:0,y:0};let expression='default',actionStarted=0,frameCount=0,lastDraw=0,lastKeys='',request=0,lastHeartbeat=0;
 const act=(id:string)=>{if(['default','smile','sleepy','nod'].includes(id)){expression=id;actionStarted=performance.now();if(id==='smile'){const bubble=document.getElementById('speech')!;bubble.textContent='求是就好啦！';bubble.classList.add('shown');setTimeout(()=>bubble.classList.remove('shown'),3500);}}};
 await onAction(act);
 const input=(frame:InputFrame)=>{
  const now=performance.now();
  if(!prefs.inputEnabled)frame={...frame,keysHeld:0,mouseDown:false,newPress:false,newMousePress:false,presses:[],repeats:[]};
  if(prefs.inputMode==='keyboard_only')frame={...frame,mouseDown:false,newMousePress:false};
  state.update(frame,now);pointer.x=frame.cursorX;pointer.y=frame.cursorY;gaze.update(pointer.x,pointer.y,now,frame.cursorMoved||frame.newMousePress);
  if(frame.newPress)overlay.add(frame.presses?.length?frame.presses:[frame.keyLabel],now,prefs);
  if(frame.repeats?.length)overlay.add(frame.repeats,now,prefs,true);
  if(frame.newPress||frame.newMousePress)if(expression==='sleepy')act('default');
 };
 if(desktop)await listen<InputFrame>('native-input',event=>input(event.payload));
 else{
  const held=new Set<string>();let mouse=false;
  const local=(patch:Partial<InputFrame>={})=>{const target=keyTarget([...held].at(-1)||'Space');input({...empty,keysHeld:held.size,mouseDown:mouse,targetX:target.x,targetY:target.y,targetZone:target.zone,cursorX:pointer.x,cursorY:pointer.y,...patch});};
  window.addEventListener('keydown',event=>{if((event.target as HTMLElement).matches('input,select,textarea'))return;if(event.repeat){local({repeats:[event.key.toUpperCase()]});return;}held.delete(event.code);held.add(event.code);local({newPress:true,keyLabel:event.code==='Space'?'Space':event.key.length===1?event.key.toUpperCase():event.key});});
  window.addEventListener('keyup',event=>{held.delete(event.code);local();});window.addEventListener('blur',()=>{held.clear();mouse=false;local();});
  canvas.onpointerdown=event=>{if(event.button===0){mouse=true;local({newMousePress:true});}};window.addEventListener('pointerup',()=>{mouse=false;local();});
  canvas.onpointermove=event=>{const r=canvas.getBoundingClientRect();pointer.x=Math.max(-1,Math.min(1,(event.clientX-r.left)/r.width*2-1));pointer.y=Math.max(-1,Math.min(1,(event.clientY-r.top)/r.height*2-1));local({cursorMoved:true,hovering:true});};
  document.getElementById('demoKey')!.onclick=()=>{local({keysHeld:1,newPress:true,keyLabel:'A',targetX:.6});setTimeout(()=>local(),280);};
  document.getElementById('demoMouse')!.onclick=()=>{local({mouseDown:true,newMousePress:true});setTimeout(()=>local(),280);};document.getElementById('demoNod')!.onclick=()=>act('nod');
  document.getElementById('darkGround')!.onclick=()=>document.body.classList.toggle('dark');
  document.getElementById('stage')!.textContent=renderer.mode==='artwork-placeholder'?'当前为原画占位，分层与绑定正在制作':'分层动作预览';
 }
 const size=()=>{shell.style.width=`${prefs.size}px`;shell.style.height=`${prefs.size}px`;};size();
 onPreferences(()=>{size();if(!prefs.showKeys)overlay.clear();if(!prefs.inputEnabled)state.update(empty,performance.now());});
 const menu=()=>desktop?void call('show_menu').catch(error=>notify(String(error))):void window.open('?menu','zju-menu','width=356,height=400');
 canvas.oncontextmenu=event=>{event.preventDefault();menu();};document.getElementById('interact')!.onclick=menu;
 document.getElementById('settings')!.onclick=()=>desktop?void call('show_settings').catch(error=>notify(String(error))):void window.open('?settings','zju-settings');
 document.getElementById('drag')!.onpointerdown=event=>{if(event.button===0&&desktop)void call('drag_pet').catch(error=>notify(String(error)));};
 canvas.onclick=()=>{if(prefs.touchEnabled)act('smile');};
 function draw(now:number){
  request=requestAnimationFrame(draw);if(now-lastDraw<1000/prefs.fps-.5)return;lastDraw=now;
  const snapshot=state.snapshot(now,prefs.handSpeed);if(expression==='nod'&&now-actionStarted>1700)expression='default';
  renderer.draw(now,snapshot,{gaze:gaze.read(now,prefs),pointer,intensity:prefs.motion==='off'?0:prefs.intensity*(prefs.motion==='low'?.35:1),idle:prefs.idleEnabled&&prefs.motion!=='off',expression,actionAge:now-actionStarted,headElasticity:prefs.headElasticity,keyboardScale:prefs.keyboardScale,mouseScale:prefs.mouseScale,gazeScale:prefs.gazeScale});
  const keys=overlay.read(now,prefs),ids=keys.map(key=>key.id).join(',');if(ids!==lastKeys){document.getElementById('key')!.innerHTML=keys.map(key=>`<kbd>${escapeHtml(key.label)}</kbd>`).join('');lastKeys=ids;}
  hit.sample(now);frameCount++;
  if(desktop&&now-lastHeartbeat>1000){lastHeartbeat=now;void call('renderer_heartbeat',{frames:frameCount,kind:renderer.mode,error:null}).catch(()=>{});}
 }
 request=requestAnimationFrame(draw);if(desktop)await call('pet_ready');
 Object.defineProperty(window,'__petStatus',{value:{read:()=>({frames:frameCount,renderer:renderer.diagnostics(),snapshot:state.snapshot(performance.now(),prefs.handSpeed),expression,hitMask:hit.read(),preferences:{...prefs}}),action:act},writable:false});
 window.addEventListener('beforeunload',()=>cancelAnimationFrame(request));
}
(async()=>{await initializePreferences();const query=new URLSearchParams(location.search);if(query.has('settings'))await settingsPage(root);else if(query.has('menu'))menuPage(root);else await petPage();})().catch(async error=>{if(!document.getElementById('notice'))root.innerHTML='<p id="notice" role="alert"></p>';notify(String(error));if(desktop){await call('renderer_heartbeat',{frames:0,kind:'failed',error:String(error)}).catch(()=>{});await call('pet_ready').catch(()=>{});}});
