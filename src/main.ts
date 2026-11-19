import './style.css';
import {listen} from '@tauri-apps/api/event';
import {InputState} from './state.mjs';
import {GazeController} from './gaze-controller.mjs';
import {compactKeyLabel,KeyOverlay} from './key-overlay.mjs';
import {keyTarget} from './key-target.mjs';
import {HitTesting} from './hit-testing';
import {CubismNativeRenderer as PetRenderer} from './cubism-native-renderer';
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
 let renderedState=state.snapshot(performance.now(),prefs.handSpeed);
 const pointer={x:0,y:0};let expression='default',actionStarted=0,frameCount=0,lastDraw=0,lastKeys='',request=0,lastHeartbeat=0,speechTimer=0;
 let lastActivity=performance.now(),lastSpeech=lastActivity,hoverSince=Infinity,automaticRest=false,touchStarted=-Infinity;
 let idleLine=0;
 const bubble=document.getElementById('speech')!;
 const lines:Record<string,string>={smile:'求是就好啦！',sleepy:'我眯一小会儿。',nod:'嗯，我在听。'};
 const idleLines=['我在这儿陪你。','要不要歇一下眼睛？','一件一件来就好。','今天也一起加油。'];
 const say=(line:string,now:number)=>{
  clearTimeout(speechTimer);
  const show=Boolean(line&&prefs.bubblesEnabled);
  bubble.classList.toggle('shown',show);
  if(!show)return;
  bubble.textContent=line;lastSpeech=now;
  speechTimer=window.setTimeout(()=>bubble.classList.remove('shown'),prefs.bubbleSeconds*1000);
 };
 const act=(id:string,fromHead=false,automatic=false)=>{
  if(!['default','smile','sleepy','nod'].includes(id))return;
  if(id==='sleepy'&&expression===id)return;
  expression=id;actionStarted=performance.now();
  if(!automatic)lastActivity=actionStarted;
  automaticRest=automatic;
  touchStarted=fromHead?actionStarted:-Infinity;
  say(automatic?'':lines[id]??'',actionStarted);
 };
 await onAction(id=>act(id));
 const input=(frame:InputFrame)=>{
  const now=performance.now();
  if(!prefs.inputEnabled)frame={...frame,keysHeld:0,mouseDown:false,newPress:false,newMousePress:false,presses:[],repeats:[]};
  if(prefs.inputMode==='keyboard_only')frame={...frame,mouseDown:false,newMousePress:false};
  state.update(frame,now);pointer.x=frame.cursorX;pointer.y=frame.cursorY;gaze.update(pointer.x,pointer.y,now,frame.cursorMoved||frame.newMousePress);
  if(frame.hovering===true)hoverSince=Math.min(hoverSince,now);
  else if(frame.hovering===false)hoverSince=Infinity;
  const pressed=frame.newPress||frame.newMousePress;
  if(pressed||frame.keysHeld||frame.mouseDown||frame.cursorMoved)lastActivity=now;
  if(expression==='sleepy'&&(pressed||(automaticRest&&frame.cursorMoved)))act('default');
  if(frame.newPress)overlay.add(frame.presses?.length?frame.presses:[frame.keyLabel],now,prefs);
  if(frame.repeats?.length)overlay.add(frame.repeats,now,prefs,true);
 };
 if(desktop)await listen<InputFrame>('native-input',event=>input(event.payload));
 else{
  const held=new Set<string>();let mouse=false;
  const local=(patch:Partial<InputFrame>={})=>{const target=keyTarget([...held].at(-1)||'Space');input({...empty,keysHeld:held.size,mouseDown:mouse,targetX:target.x,targetY:target.y,targetZone:target.zone,cursorX:pointer.x,cursorY:pointer.y,...patch});};
  window.addEventListener('keydown',event=>{if((event.target as HTMLElement).matches('input,select,textarea'))return;if(event.repeat){local({repeats:[event.key.toUpperCase()]});return;}held.delete(event.code);held.add(event.code);local({newPress:true,keyLabel:event.code==='Space'?'Space':event.key.length===1?event.key.toUpperCase():event.key});});
  window.addEventListener('keyup',event=>{held.delete(event.code);local();});window.addEventListener('blur',()=>{held.clear();mouse=false;local();});
  canvas.onpointerdown=event=>{if(event.button===0){mouse=true;local({newMousePress:true});}};window.addEventListener('pointerup',()=>{mouse=false;local();});
  canvas.onpointermove=event=>{const r=canvas.getBoundingClientRect();pointer.x=Math.max(-1,Math.min(1,(event.clientX-r.left)/r.width*2-1));pointer.y=Math.max(-1,Math.min(1,(event.clientY-r.top)/r.height*2-1));local({cursorMoved:true,hovering:true});};
  canvas.onpointerleave=()=>local({hovering:false});
  document.getElementById('demoKey')!.onclick=()=>{const target=keyTarget('KeyA');local({keysHeld:1,newPress:true,keyLabel:'A',targetX:target.x,targetY:target.y,targetZone:target.zone});setTimeout(()=>local(),280);};
  document.getElementById('demoMouse')!.onclick=()=>{local({mouseDown:true,newMousePress:true});setTimeout(()=>local(),280);};document.getElementById('demoNod')!.onclick=()=>act('nod');
  document.getElementById('darkGround')!.onclick=()=>document.body.classList.toggle('dark');
  document.getElementById('stage')!.textContent='Live2D 制作中 · 原生模型预览';
 }
 const size=()=>{if(desktop)return;shell.style.width=`${prefs.size}px`;shell.style.height=`${prefs.size}px`;};size();
 onPreferences(()=>{size();if(!prefs.showKeys)overlay.clear();if(!prefs.bubblesEnabled)bubble.classList.remove('shown');if(!prefs.inputEnabled)state.update(empty,performance.now());});
 const menu=()=>desktop?void call('show_menu').catch(error=>notify(String(error))):void window.open('?menu','zju-menu','width=356,height=400');
 canvas.oncontextmenu=event=>{event.preventDefault();menu();};document.getElementById('interact')!.onclick=menu;
 document.getElementById('settings')!.onclick=()=>desktop?void call('show_settings').catch(error=>notify(String(error))):void window.open('?settings','zju-settings');
 document.getElementById('drag')!.onpointerdown=event=>{if(event.button===0&&desktop)void call('drag_pet').catch(error=>notify(String(error)));};
 canvas.onclick=event=>{
  if(!prefs.touchEnabled)return;
  const rect=canvas.getBoundingClientRect();
  act('smile',(event.clientY-rect.top)/rect.height<.69);
 };
 function draw(now:number){
  request=requestAnimationFrame(draw);if(now-lastDraw<1000/prefs.fps-.5)return;lastDraw=now;
  const snapshot=state.snapshot(now,prefs.handSpeed);
  renderedState=snapshot;
  if((expression==='nod'&&now-actionStarted>820)||(expression==='smile'&&now-actionStarted>1940))expression='default';
  if(automaticRest&&!prefs.sleepMinutes)act('default');
  if(expression==='default'&&prefs.sleepMinutes&&now-lastActivity>=prefs.sleepMinutes*60000)act('sleepy',false,true);
  const talkEvery=prefs.idleSeconds*1000;
  if(expression==='default'&&talkEvery&&prefs.bubblesEnabled&&!bubble.classList.contains('shown')&&now-Math.max(lastActivity,lastSpeech)>=talkEvery){
   say(idleLines[idleLine++%idleLines.length],now);
  }
  const opacity=prefs.hoverFade&&now-hoverSince>=prefs.hoverDelay?String(prefs.hoverOpacity):'1';
  if(shell.style.opacity!==opacity)shell.style.opacity=opacity;
  renderer.draw(now,snapshot,{gaze:gaze.read(now,prefs),pointer,intensity:prefs.motion==='off'?0:prefs.intensity*(prefs.motion==='low'?.35:1),idle:prefs.idleEnabled&&prefs.motion!=='off',expression,actionAge:now-actionStarted,touchAge:expression==='smile'&&Number.isFinite(touchStarted)?now-touchStarted:undefined,headElasticity:prefs.headElasticity,keyboardScale:prefs.keyboardScale,mouseScale:prefs.mouseScale,gazeScale:prefs.gazeScale,mouseEnabled:prefs.inputEnabled&&prefs.inputMode!=='keyboard_only'});
  const keys=overlay.read(now,prefs),ids=keys.map(key=>key.id).join(',');if(ids!==lastKeys){document.getElementById('key')!.innerHTML=keys.map(key=>`<kbd><span class="key-label">${escapeHtml(key.label)}</span><span class="key-label-compact">${escapeHtml(compactKeyLabel(key.label))}</span></kbd>`).join('');lastKeys=ids;}
  hit.sample(now);frameCount++;
  if(desktop&&now-lastHeartbeat>1000){lastHeartbeat=now;void call('renderer_heartbeat',{frames:frameCount,kind:renderer.mode,error:null}).catch(()=>{});}
 }
 request=requestAnimationFrame(draw);if(desktop)await call('pet_ready');
 Object.defineProperty(window,'__petStatus',{value:{read:()=>({frames:frameCount,renderer:renderer.diagnostics(),snapshot:renderedState,expression,hitMask:hit.read(),preferences:{...prefs}}),action:act},writable:false});
 window.addEventListener('beforeunload',()=>cancelAnimationFrame(request));
}
(async()=>{await initializePreferences();const query=new URLSearchParams(location.search);if(query.has('settings'))await settingsPage(root);else if(query.has('menu'))menuPage(root);else await petPage();})().catch(async error=>{if(!document.getElementById('notice'))root.innerHTML='<p id="notice" role="alert"></p>';notify(String(error));if(desktop){await call('renderer_heartbeat',{frames:0,kind:'failed',error:String(error)}).catch(()=>{});await call('pet_ready').catch(()=>{});}});
