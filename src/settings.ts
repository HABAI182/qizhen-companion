import {
 call,desktop,escapeHtml,onPreferences,prefs,updatePreferences,sendAction,notify,type Preferences,
} from './bridge';
import {expressions,motions,normalizeActionChord,validExceptionName} from './preferences.mjs';
import {version} from '../package.json';

type Control=HTMLInputElement|HTMLSelectElement;
type Metrics={edition:string;keyboardHookActive:boolean;gamepadConnected:boolean};

const button=(id:string,label:string)=>`<button id="${id}" type="button" class="secondary">${label}</button>`;
const details=(description:string)=>description?`<small>${description}</small>`:'';
const toggle=(key:string,label:string,description='')=>
 `<label class="setting-row"><span><strong>${label}</strong>${details(description)}</span><input type="checkbox" data-pref="${key}"></label>`;
const range=(key:string,label:string,min:number,max:number,step=.05,unit='%',description='')=>
 `<label class="range-row"><span class="range-top"><span><strong>${label}</strong>${details(description)}</span><output id="${key}Value"></output></span><input type="range" data-pref="${key}" data-unit="${unit}" min="${min}" max="${max}" step="${step}"></label>`;
const select=(key:string,label:string,options:ReadonlyArray<readonly [string|number,string]>,description='')=>
 `<label class="setting-row"><span><strong>${label}</strong>${details(description)}</span><select data-pref="${key}">${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`;
const group=(label:string,body:string,attributes='')=>
 `<section class="settings-card" ${attributes}><h2>${label}</h2>${body}</section>`;

const tabs=[['appearance','外观'],['interaction','互动'],['desktop','桌面'],['advanced','高级']];
const nativeFields=new Set(['gamepadEnabled','sfxEnabled','sfxVolume','alwaysOnTop','clickThrough','edgeSnap','fullscreenHide','autostart']);
const companionFields=new Set(['touchEnabled','bubblesEnabled','speechBubbleScale','bubbleSeconds','idleSeconds','sleepMinutes']);
const actionOptions=[...expressions,...motions];

export async function settingsPage(app:HTMLElement){
 document.body.className='settings-page';
 const positions=[0,1,2].map(slot=>`<div class="position-slot">
  <strong>位置 ${slot+1}</strong><span data-position-state="${slot}">未保存</span>
  <button type="button" class="secondary" data-save-position="${slot}">保存</button>
  <button type="button" class="secondary" data-restore-position="${slot}" disabled>恢复</button>
 </div>`).join('');
 app.innerHTML=`<main class="settings-shell">
  <header class="settings-title"><h1>浙大娘</h1></header>
  <nav class="tabs" aria-label="设置分类">${tabs.map(([id,label],index)=>`<button type="button" data-tab="${id}" class="${index===0?'active':''}" aria-pressed="${index===0}">${label}</button>`).join('')}</nav>
  <div data-panel="appearance" aria-label="外观">
   ${group('界面和大小',
    range('size','桌宠大小',210,840,1,'size','拖动实时预览，松手自动保存')
    +select('theme','界面主题',[['system','跟随系统'],['light','浅色'],['dark','深色']])
    +select('accent','界面强调色',[['blue','浙大蓝'],['violet','藤紫'],['sage','竹青'],['coral','珊瑚红']])
    +select('density','设置间距',[['comfortable','舒适'],['compact','紧凑']])
    +range('textScale','设置字号',.85,1.3))}
   ${group('动作观感',
    select('motion','动效',[['full','完整'],['low','轻柔'],['off','静止']])
    +range('intensity','整体动作幅度',0,1.6)
    +range('headElasticity','头部回弹',0,1.5)
    +toggle('idleEnabled','空闲时眨眼和呼吸'),'data-animated-only')}
  </div>
  <div data-panel="interaction" aria-label="互动" hidden>
   ${group('键鼠和视线',
    toggle('inputEnabled','响应键鼠输入','在其他应用操作时也会回应')
    +select('inputMode','输入模式',[['keyboard_mouse','键盘和鼠标'],['keyboard_only','仅键盘']])
    +range('handSpeed','手部速度',.5,2)
    +range('keyboardScale','键盘动作幅度',0,1.6)
    +range('mouseScale','鼠标动作幅度',0,1.6)
    +toggle('gamepadEnabled','手柄输入','A 操作键盘，B 操作鼠标，左摇杆选键区')
    +toggle('cursorFollow','视线跟随鼠标')
    +range('gazeScale','视线跟随幅度',.5,3.2)
    +toggle('gazeReturnEnabled','指针静止后视线回正')
    +range('gazeIdleSeconds','回正前等待',1,15,1,'秒'))}
   ${group('按键浮显',
    toggle('showKeys','显示短时按键提示')
    +range('keyBubbleScale','按键提示大小',.8,1.8)
    +toggle('multiKeys','同时显示多个按键')
    +range('maxKeys','同时显示上限',1,6,1,'个')
    +toggle('repeatKeys','长按重复浮显','持续按住时只重复提示')
    +range('overlayTop','浮显高度',.08,.17,.01,'%','从窗口顶部到按键和气泡的距离')
    +toggle('overlaySwapped','交换按键与气泡的左右位置'))}
   ${group('互动气泡',
    toggle('touchEnabled','点击角色时回应')
    +toggle('bubblesEnabled','显示互动气泡')
    +range('speechBubbleScale','气泡大小',.8,1.6)
    +range('bubbleSeconds','气泡停留时间',2,12,1,'秒')
    +select('idleSeconds','空闲问候',[[0,'关闭'],[60,'每分钟'],[90,'每 90 秒'],[180,'每 3 分钟']])
    +select('sleepMinutes','多久不活动后小憩',[[0,'关闭'],[5,'5 分钟'],[10,'10 分钟'],[15,'15 分钟']]),'data-companion-only')}
   ${group('声音',
    toggle('sfxEnabled','键鼠和互动音效')
    +range('sfxVolume','音量',0,1)
    +button('testSound','试听'))}
  </div>
  <div data-panel="desktop" aria-label="桌面" hidden>
   ${group('窗口',
    toggle('alwaysOnTop','窗口置顶')
    +toggle('clickThrough','整窗鼠标穿透','可从托盘或 Ctrl+Alt+Z 找回')
    +toggle('edgeSnap','靠近屏幕边缘时吸附')
    +toggle('fullscreenHide','同屏全屏时隐藏')
    +`<label class="field-stack"><strong>全屏避让例外</strong><small>填写程序文件名，多个用逗号或换行分隔。</small><textarea id="fullscreenExceptions" placeholder="game.exe, player.exe" maxlength="4000" rows="2"></textarea></label>`
    +toggle('hoverFade','指针停在角色上时淡化')
    +range('hoverDelay','淡化等待',250,1500,50,'毫秒')
    +range('hoverOpacity','淡化后不透明度',.2,.8,.05)
    +`<div class="button-row">${button('recover','找回桌宠')}${button('hidePet','暂时隐藏')}</div>`)}
   ${group('常用位置',`<div class="position-presets">${positions}</div>`)}
  </div>
  <div data-panel="advanced" aria-label="高级" hidden>
   ${group('运行',
    toggle('autostart','登录 Windows 后启动')
    +select('fps','绘制帧率',[[30,'30 FPS'],[60,'60 FPS']])
    +`<p id="runtimeStatus" class="runtime-status" role="status"></p>`)}
   ${group('动作快捷键',
    `<p class="settings-help">用 Ctrl 或 Alt 加字母、数字或 F 键。Ctrl+Alt+Z 用于找回桌宠。</p>
    <details id="shortcutEditor"><summary>编辑 25 个动作槽</summary>
    <div class="shortcut-list"></div>${button('saveShortcuts','保存快捷键')}</details>`,'data-companion-only')}
  </div>
  <footer><span id="saved" role="status">设置自动保存</span><span class="version">${version}</span></footer>
  <p id="notice" role="alert"></p>
 </main>`;

 const controls=Array.from(app.querySelectorAll<Control>('[data-pref]'));
 const panels=Array.from(app.querySelectorAll<HTMLElement>('[data-panel]'));
 const navButtons=Array.from(app.querySelectorAll<HTMLButtonElement>('[data-tab]'));
 const status=app.querySelector<HTMLElement>('#saved')!;
 const notice=app.querySelector<HTMLElement>('#notice')!;
 const runtimeStatus=app.querySelector<HTMLElement>('#runtimeStatus')!;
 const exceptionInput=app.querySelector<HTMLTextAreaElement>('#fullscreenExceptions')!;
 const shortcutList=app.querySelector<HTMLElement>('.shortcut-list')!;
 let currentTab='appearance';
 let edition='full';
 let saveRevision=0;
 let previewSize:number|undefined;
 let previewJob:Promise<void>|undefined;
 let shortcutDraftRevision=0;
 let shortcutDraftDirty=false;

 const outputLabel=(input:HTMLInputElement)=>{
  const output=document.getElementById(`${input.dataset.pref}Value`);
  if(!output)return;
  const value=Number(input.value),unit=input.dataset.unit;
  output.textContent=unit==='size'?`${Math.round(value/420*100)}%`:unit==='%'?`${Math.round(value*100)}%`:`${value} ${unit}`;
  input.setAttribute('aria-valuetext',unit==='size'?`${output.textContent}，${value} 逻辑像素`:output.textContent);
 };
 const syncShortcuts=()=>{
  if(shortcutDraftDirty)return;
  shortcutList.innerHTML=prefs.shortcuts.map((slot,index)=>`<div class="shortcut-row">
   <label><input type="checkbox" data-shortcut-enabled="${index}" ${slot.enabled?'checked':''}>启用 ${index+1}</label>
   <input data-shortcut-chord="${index}" aria-label="快捷键 ${index+1}" maxlength="48" placeholder="Ctrl+Alt+1" value="${escapeHtml(slot.chord)}">
   <select data-shortcut-action="${index}" aria-label="动作 ${index+1}">${actionOptions.map(([id,label])=>`<option value="${id}" ${slot.action===id?'selected':''}>${label}</option>`).join('')}</select>
  </div>`).join('');
 };
 const dependencyEnabled=(key:string)=>{
  if(!desktop&&nativeFields.has(key))return false;
  if(edition!=='full'&&companionFields.has(key))return false;
  if(edition==='static'&&['fps','hoverFade','hoverDelay','hoverOpacity'].includes(key))return false;
  if(['repeatKeys','multiKeys','keyBubbleScale'].includes(key))return prefs.showKeys;
  if(key==='maxKeys')return prefs.showKeys&&prefs.multiKeys;
  if(key==='gazeScale'||key==='gazeReturnEnabled')return prefs.cursorFollow;
  if(key==='gazeIdleSeconds')return prefs.cursorFollow&&prefs.gazeReturnEnabled;
  if(key==='speechBubbleScale'||key==='bubbleSeconds'||key==='idleSeconds')return prefs.bubblesEnabled;
  if(key==='hoverDelay'||key==='hoverOpacity')return prefs.hoverFade;
  if(key==='sfxVolume')return prefs.sfxEnabled;
  return true;
 };
 const syncControls=()=>{
  for(const input of controls){
   const key=input.dataset.pref as keyof Preferences;
   const value=prefs[key];
   if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=Boolean(value);
   else input.value=String(value);
   input.disabled=!dependencyEnabled(key);
   if(input instanceof HTMLInputElement&&input.type==='range')outputLabel(input);
  }
  exceptionInput.disabled=!desktop||!prefs.fullscreenHide;
  if(document.activeElement!==exceptionInput)exceptionInput.value=prefs.fullscreenExceptions.join(', ');
  syncShortcuts();
 };
 const queuePreview=(size:number)=>{
  previewSize=size;
  previewJob??=(async()=>{
   while(previewSize!==undefined){
    const latest=previewSize;previewSize=undefined;
    await call('preview_size',{size:latest}).catch(error=>notify(String(error)));
   }
  })().finally(()=>{previewJob=undefined;});
 };
 const save=async(patch:Partial<Preferences>,success='已保存')=>{
  const revision=++saveRevision;
  status.textContent='保存中…';
  const saved=await updatePreferences(patch);
  if(revision===saveRevision){
   status.textContent=saved?success:'未保存';
   if(saved){notice.textContent='';notice.classList.remove('visible');}
  }
  return saved;
 };
 for(const input of controls){
  const key=input.dataset.pref as keyof Preferences;
  input.oninput=()=>{
   if(input instanceof HTMLInputElement)outputLabel(input);
   if(desktop&&key==='size')queuePreview(Number(input.value));
  };
  input.onchange=async()=>{
   const value=input instanceof HTMLInputElement&&input.type==='checkbox'
    ?input.checked:typeof prefs[key]==='number'?Number(input.value):input.value;
   if(desktop&&key==='size'){
    await previewJob;
    if(Number(input.value)!==value)return;
   }
   await save({[key]:value});
  };
 }
 exceptionInput.onchange=async()=>{
  const list=[...new Set(exceptionInput.value.split(/[,，;；\r\n]+/).map(name=>name.trim().toLowerCase()).filter(Boolean))];
  if(list.length>32||list.some(name=>!validExceptionName(name))){
   notify('填写最多 32 个程序文件名，例如 game.exe。');
   return;
  }
  if(await save({fullscreenExceptions:list}))exceptionInput.value=prefs.fullscreenExceptions.join(', ');
 };
 shortcutList.oninput=()=>{shortcutDraftDirty=true;shortcutDraftRevision++;};
 shortcutList.onchange=shortcutList.oninput;

 const run=(id:string,task:()=>Promise<unknown>,nativeOnly=false)=>{
  const control=app.querySelector<HTMLButtonElement>(`#${id}`)!;
  control.disabled=nativeOnly&&!desktop;
  control.onclick=()=>void task().catch(error=>notify(String(error)));
 };
 run('saveShortcuts',async()=>{
  const active=new Set<string>();
  const drafts=[];
  for(let index=0;index<prefs.shortcuts.length;index++){
   const enabled=shortcutList.querySelector<HTMLInputElement>(`[data-shortcut-enabled="${index}"]`)!.checked;
   const input=shortcutList.querySelector<HTMLInputElement>(`[data-shortcut-chord="${index}"]`)!;
   const action=shortcutList.querySelector<HTMLSelectElement>(`[data-shortcut-action="${index}"]`)!.value;
   const raw=input.value.trim();
   const chord=normalizeActionChord(raw);
   if(enabled&&(!chord||active.has(chord))){
    notify(chord?`快捷键 ${index+1} 与其他动作重复。`:`快捷键 ${index+1} 无效。请选用 Ctrl 或 Alt 加字母、数字或 F 键。`);
    input.focus();
    return;
   }
   if(enabled&&chord)active.add(chord);
   drafts.push({enabled,chord:chord??raw,action});
  }
  const revision=shortcutDraftRevision;
  if(await save({shortcuts:drafts},'快捷键已保存')&&revision===shortcutDraftRevision){
   shortcutDraftDirty=false;
   syncShortcuts();
  }
 });
 run('recover',()=>call('reset_pet'),true);
 run('hidePet',()=>call('hide_pet'),true);
 run('testSound',()=>call('test_sound'),true);

 const refreshPositions=async()=>{
  if(!desktop)return;
  const saved=await call<boolean[]>('list_positions');
  saved.forEach((isSaved,slot)=>{
   app.querySelector<HTMLElement>(`[data-position-state="${slot}"]`)!.textContent=isSaved?'已保存':'未保存';
   app.querySelector<HTMLButtonElement>(`[data-restore-position="${slot}"]`)!.disabled=!isSaved;
  });
 };
 for(const control of app.querySelectorAll<HTMLButtonElement>('[data-save-position],[data-restore-position]')){
  const saveSlot=control.dataset.savePosition;
  if(!desktop)control.disabled=true;
  control.onclick=async()=>{
   try{
    const slot=Number(saveSlot??control.dataset.restorePosition);
    await call(saveSlot===undefined?'restore_position':'save_position',{slot});
    await refreshPositions();
    status.textContent=saveSlot===undefined?'位置已恢复':'位置已保存';
   }catch(error){notify(String(error));}
  };
 }

 const applyEdition=(next:string)=>{
  if(edition===next)return;
  edition=next;
  for(const card of app.querySelectorAll<HTMLElement>('[data-companion-only]'))card.hidden=edition!=='full';
  for(const card of app.querySelectorAll<HTMLElement>('[data-animated-only]'))card.hidden=edition==='static';
  app.querySelector<HTMLButtonElement>('[data-tab="interaction"]')!.hidden=edition==='static';
  syncControls();
 };
 const refreshMetrics=async()=>{
  if(!desktop){
   runtimeStatus.textContent='登录启动、全局输入和桌面窗口需要 Windows 程序。';
   return;
  }
  const metrics=await call<Metrics>('input_metrics');
  applyEdition(metrics.edition);
  runtimeStatus.textContent=edition==='static'?'静态画面'
   :`键盘反馈 ${metrics.keyboardHookActive?'就绪':'状态采样'}${prefs.gamepadEnabled?` · 手柄 ${metrics.gamepadConnected?'已连接':'未连接'}`:''}`;
 };
 const reportError=(error:unknown)=>notify(String(error));
 for(const tab of navButtons)tab.onclick=()=>{
  currentTab=tab.dataset.tab!;
  for(const node of navButtons){
   node.classList.toggle('active',node===tab);
   node.setAttribute('aria-pressed',String(node===tab));
  }
  for(const panel of panels)panel.hidden=panel.dataset.panel!==currentTab;
  if(currentTab==='desktop')void refreshPositions().catch(reportError);
  if(currentTab==='advanced')void refreshMetrics().catch(reportError);
 };
 const unsubscribe=onPreferences(syncControls);
 const metricsTimer=window.setInterval(()=>{
  if(desktop&&currentTab==='advanced')void refreshMetrics().catch(reportError);
 },2500);
 window.addEventListener('beforeunload',()=>{unsubscribe();clearInterval(metricsTimer);},{once:true});
 syncControls();
 await refreshMetrics().catch(reportError);
}
type MenuPosition={x:number;y:number};
type MenuDrag={
 pointerId:number;
 startX:number;
 startY:number;
 scale:number;
 origin:Promise<MenuPosition>;
 delta:MenuPosition;
 sent:MenuPosition;
 finished:boolean;
 sending:boolean;
};

function bindMenuDrag(header:HTMLElement,reportError:(error:unknown)=>void){
 let active:MenuDrag|undefined;

 async function flush(drag:MenuDrag){
  if(drag.sending)return;
  drag.sending=true;
  try{
   const origin=await drag.origin;
   while(drag.finished||drag.delta.x!==drag.sent.x||drag.delta.y!==drag.sent.y){
    const {delta,finished}=drag;
    drag.sent=delta;
    await call('move_menu',{x:origin.x+delta.x,y:origin.y+delta.y,finished});
    if(finished)break;
   }
  }catch(error){
   drag.finished=true;
   reportError(error);
  }finally{
   drag.sending=false;
   if(drag.finished&&active===drag){
    active=undefined;
    header.classList.remove('dragging');
    if(header.hasPointerCapture(drag.pointerId))header.releasePointerCapture(drag.pointerId);
   }
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
  }
  drag.finished=finished;
  if(finished)header.classList.remove('dragging');
  void flush(drag);
 }

 header.onpointerdown=event=>{
  if(active||!event.isPrimary||event.button!==0||(event.target as HTMLElement).closest('button'))return;
  event.preventDefault();
  header.setPointerCapture(event.pointerId);
  header.classList.add('dragging');
  active={pointerId:event.pointerId,startX:event.screenX,startY:event.screenY,scale:window.devicePixelRatio,
   origin:call<MenuPosition>('begin_menu_drag'),delta:{x:0,y:0},sent:{x:0,y:0},finished:false,sending:false};
  void flush(active);
 };
 header.onpointermove=event=>update(event,false);
 header.onpointerup=event=>update(event,true);
 header.onpointercancel=header.onlostpointercapture=event=>update(event,true,false);
}

export function menuPage(app:HTMLElement){
 document.body.className='menu-page';
 app.innerHTML=`<main class="interaction-menu"><header id="menuDrag"><h1>和小浙互动</h1><button id="closeMenu" class="icon-button" aria-label="关闭">×</button></header><div class="action-grid"><button data-action="default">日常</button><button data-action="nod">轻轻点头</button><button data-action="smile">开心一下</button><button data-action="sleepy">闭眼休息</button></div><button id="menuSettings" class="wide-button">设置与个性化 <span>›</span></button><div class="button-row">${button('menuHide','隐藏')}${button('menuQuit','退出')}</div><p id="notice" role="alert"></p></main>`;
 const close=()=>{if(desktop)return call('close_panel',{label:'menu'});window.close();return Promise.resolve();};
 const reportError=(error:unknown)=>notify(String(error));
 app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(node=>node.onclick=()=>void sendAction(node.dataset.action!).then(close).catch(reportError));
 document.getElementById('menuSettings')!.onclick=()=>desktop?void call('show_settings').catch(error=>notify(String(error))):void window.open('?settings','zju-settings');
 document.getElementById('menuHide')!.onclick=()=>desktop?void call('hide_pet').then(close).catch(reportError):void close();
 document.getElementById('menuQuit')!.onclick=()=>desktop?void call('quit_app').catch(error=>notify(String(error))):void window.close();
 document.getElementById('closeMenu')!.onclick=()=>void close().catch(reportError);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void close().catch(reportError);}});
 if(desktop){
  bindMenuDrag(document.getElementById('menuDrag')!,reportError);
  const panel=app.querySelector<HTMLElement>('.interaction-menu')!;
  let previousHeight=0;
  const observer=new ResizeObserver(()=>{
   const height=Math.ceil(panel.getBoundingClientRect().height);
   if(height===previousHeight)return;
   previousHeight=height;
   void call('fit_menu',{height}).catch(reportError);
  });
  observer.observe(panel);
  window.addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
 }
}
