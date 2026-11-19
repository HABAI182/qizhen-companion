export const defaults = Object.freeze({
  size:420,intensity:1,alwaysOnTop:true,clickThrough:false,showKeys:true,idleEnabled:true,
  theme:'system',accent:'blue',density:'comfortable',textScale:1,motion:'full',fps:60,
  keyboardScale:1,mouseScale:1,handSpeed:1,headElasticity:.6,cursorFollow:true,gazeScale:2.1,gazeReturnEnabled:true,gazeIdleSeconds:3,
 keyBubbleScale:1.3,speechBubbleScale:1,overlayTop:.13,overlaySwapped:false,
  multiKeys:false,maxKeys:1,repeatKeys:false,inputEnabled:true,inputMode:'keyboard_mouse',
  bubblesEnabled:true,bubbleSeconds:4,idleSeconds:90,sleepMinutes:10,touchEnabled:true,
 fullscreenHide:false,fullscreenExceptions:/** @type {string[]} */ ([]),edgeSnap:true,hoverFade:false,hoverDelay:500,hoverOpacity:.4,
 gamepadEnabled:false,sfxEnabled:false,sfxVolume:.25,autostart:false,
 shortcuts:/** @type {{enabled:boolean,chord:string,action:string}[]} */ ([]),
});
export const expressions = [['default','日常'],['smile','开心'],['sleepy','闭眼休息']];
export const motions=[['nod','轻轻点头']];
export const actionIds=new Set([...expressions,...motions].map(x=>x[0]));
export const shortcutCount=25;

export function normalizeActionChord(chord){
 if(typeof chord!=='string'||chord.length>48)return null;
 const parts=chord.split('+').map(part=>part.trim().toLowerCase());
 if(parts.length<2)return null;
 let key=parts.pop().toUpperCase();
 const modifiers=new Set(parts);
 if(parts.some(part=>!['ctrl','alt','shift'].includes(part)))return null;
 if(!modifiers.has('ctrl')&&!modifiers.has('alt'))return null;
 if(/^F[0-9]+$/.test(key)){
  const number=Number(key.slice(1));
  if(number<1||number>24)return null;
  key='F'+number;
 }else if(!/^[A-Z0-9]$/.test(key))return null;
 if(key==='Z'&&modifiers.has('ctrl')&&modifiers.has('alt'))return null;
 return [...['Ctrl','Alt','Shift'].filter(modifier=>modifiers.has(modifier.toLowerCase())),key].join('+');
}

export function validExceptionName(name){
 return typeof name==='string'&&/^[^\\/:*?"<>|\x00-\x1f\x7f]+\.exe$/i.test(name)&&new TextEncoder().encode(name).length<=124;
}

export function normalizePreferences(raw={}){
 const p={...defaults,...raw};
 const ranges={size:[210,840],intensity:[0,1.6],textScale:[.85,1.3],keyboardScale:[0,1.6],mouseScale:[0,1.6],handSpeed:[.5,2],headElasticity:[0,1.5],gazeScale:[.5,3.2],gazeIdleSeconds:[1,15],keyBubbleScale:[.8,1.8],speechBubbleScale:[.8,1.6],overlayTop:[.08,.17],maxKeys:[1,6],bubbleSeconds:[2,12],hoverDelay:[250,1500],hoverOpacity:[.2,.8],sfxVolume:[0,1]};
 for(const [k,[lo,hi]] of Object.entries(ranges))p[k]=Number.isFinite(p[k])?Math.min(hi,Math.max(lo,p[k])):defaults[k];
 p.maxKeys=Math.round(p.maxKeys);
 p.hoverDelay=Math.round(p.hoverDelay);
 for(const k of Object.keys(defaults))if(typeof defaults[k]==='boolean')p[k]=typeof p[k]==='boolean'?p[k]:defaults[k];
 for(const [k,values] of Object.entries({theme:['system','light','dark'],accent:['blue','violet','sage','coral'],density:['comfortable','compact'],motion:['full','low','off'],fps:[30,60],inputMode:['keyboard_mouse','keyboard_only'],idleSeconds:[0,60,90,180],sleepMinutes:[0,5,10,15]}))if(!values.includes(p[k]))p[k]=defaults[k];
 p.fullscreenExceptions=Array.isArray(p.fullscreenExceptions)
  ?[...new Set(p.fullscreenExceptions.filter(x=>typeof x==='string').map(x=>x.trim().toLowerCase()).filter(validExceptionName))].sort().slice(0,32)
  :[];
 const shortcuts=Array.isArray(p.shortcuts)?p.shortcuts:[];
 p.shortcuts=Array.from({length:shortcutCount},(_,index)=>{
  const slot=shortcuts[index];
  return {enabled:slot?.enabled===true,chord:typeof slot?.chord==='string'?slot.chord.slice(0,48):'',
   action:actionIds.has(slot?.action)?slot.action:'smile'};
 });
 return p;
}
export function applyTheme(p){
 const d=document.documentElement;d.dataset.theme=p.theme;d.dataset.density=p.density;
 d.style.setProperty('--accent',({blue:'#003f88',violet:'#8475b5',sage:'#648d83',coral:'#c77e87'})[p.accent]);
 d.style.setProperty('--text-scale',String(p.textScale));
 d.style.setProperty('--key-bubble-scale',String(p.keyBubbleScale));
 d.style.setProperty('--speech-bubble-scale',String(p.speechBubbleScale));
 d.style.setProperty('--overlay-top',`${p.overlayTop*100}%`);
 d.dataset.overlayOrder=p.overlaySwapped?'swapped':'normal';
}
