import {
 call,desktop,escapeHtml,onPreferences,prefs,updatePreferences,sendAction,notify,type Preferences,
} from './bridge';
import {expressions,motions,normalizeActionChord,normalizePreferences,validExceptionName,recoveryShortcut} from './preferences.mjs';
import {version} from '../package.json';
import {bindWindowDrag} from './window-drag';
import './settings.css';

type Control=HTMLInputElement|HTMLSelectElement;
type Metrics={edition:string;keyboardHookActive:boolean;gamepadConnected:boolean};

const button=(id:string,label:string)=>`<button id="${id}" type="button" class="secondary">${label}</button>`;
const details=(key:string,description:string)=>description?`<small id="${key}Help">${description}</small>`:'';
const controlAttrs=(key:string,description:string)=>
 `id="pref-${key}" data-pref="${key}" aria-labelledby="${key}Label"${description?` aria-describedby="${key}Help"`:''}`;
const controlLabel=(key:string,label:string,description:string)=>
 `<span><strong id="${key}Label">${label}</strong>${details(key,description)}</span>`;
const toggle=(key:string,label:string,description='')=>
 `<label class="setting-row">${controlLabel(key,label,description)}<input type="checkbox" ${controlAttrs(key,description)}></label>`;
const range=(key:string,label:string,min:number,max:number,step=.05,unit='%',description='')=>
 `<label class="range-row"><span class="range-top">${controlLabel(key,label,description)}<output id="${key}Value" for="pref-${key}"></output></span><input type="range" ${controlAttrs(key,description)} data-unit="${unit}" min="${min}" max="${max}" step="${step}"></label>`;
const select=(key:string,label:string,options:ReadonlyArray<readonly [string|number,string]>,description='')=>
 `<label class="setting-row">${controlLabel(key,label,description)}<select ${controlAttrs(key,description)}>${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`;
const group=(label:string,body:string,attributes='')=>
 `<section class="settings-card" ${attributes}><h2>${label}</h2>${body}</section>`;
const disclosure=(id:string,label:string,body:string)=>
 `<details id="${id}" class="settings-disclosure"><summary>${label}</summary>${body}</details>`;

const tabs=[['appearance','外观'],['interaction','互动'],['desktop','桌面'],['advanced','高级']] as const;
type TabId=(typeof tabs)[number][0];
const nativeFields=new Set(['gamepadEnabled','sfxEnabled','sfxVolume','alwaysOnTop','clickThrough','edgeSnap','fullscreenHide','autostart']);
const companionFields=new Set(['touchEnabled','bubblesEnabled','speechBubbleScale','bubbleSeconds','idleSeconds','sleepMinutes']);
const actionOptions=[...expressions,...motions];
const resettableTabs=new Set<TabId>(['appearance','interaction']);
const panel=(id:TabId,body:string)=>
 `<div id="panel-${id}" data-panel="${id}" role="tabpanel" aria-labelledby="tab-${id}" tabindex="0" ${id==='appearance'?'':'hidden'}>${body}</div>`;

export async function settingsPage(app:HTMLElement){
 document.body.className='settings-page';
 const positions=[0,1,2].map(slot=>`<div class="position-slot">
  <strong>位置 ${slot+1}</strong><span data-position-state="${slot}">未保存</span>
  <button type="button" class="secondary" data-save-position="${slot}">保存</button>
  <button type="button" class="secondary" data-restore-position="${slot}" disabled>恢复</button>
 </div>`).join('');
 app.innerHTML=`<main class="settings-shell">
  <header class="settings-title">
   <h1>启真设置</h1>
   <nav class="tabs" role="tablist" aria-label="设置分类">${tabs.map(([id,label],index)=>`<button id="tab-${id}" type="button" role="tab" aria-controls="panel-${id}" aria-selected="${index===0}" tabindex="${index===0?0:-1}" data-tab="${id}">${label}</button>`).join('')}</nav>
  </header>
  <div class="settings-content">
  ${panel('appearance',
   group('大小与动效',
    range('size','桌宠大小',210,840,1,'size','拖动时预览，松手保存')
    +`<div data-animated-only>${
    select('motion','动效',[['full','完整'],['low','轻柔'],['off','静止']])
    +range('intensity','整体动作幅度',0,1.6)
    +range('headElasticity','头部回弹',0,1.5)
    +toggle('idleEnabled','空闲时眨眼和呼吸') }</div>`)
   +group('设置界面',
    select('theme','界面主题',[['system','跟随系统'],['light','浅色'],['dark','深色']])
    +select('accent','界面强调色',[['blue','浙大蓝'],['violet','藤紫'],['sage','竹青'],['coral','珊瑚红']])
    +select('density','设置间距',[['comfortable','舒适'],['compact','紧凑']])
    +range('textScale','设置字号',.85,1.3)))}
  ${panel('interaction',
   group('键鼠和视线',
    toggle('inputEnabled','响应键鼠输入','在其他应用操作时也会回应')
    +select('inputMode','输入模式',[['keyboard_mouse','键盘和鼠标'],['keyboard_only','仅键盘']])
    +toggle('cursorFollow','视线跟随鼠标')
    +disclosure('inputTuning','调整手部动作与视线',
    range('handSpeed','手部速度',.5,2)
    +range('keyboardScale','键盘动作幅度',0,1.6)
    +range('mouseScale','鼠标动作幅度',0,1.6)
    +range('gazeScale','视线跟随幅度',.5,3.2)
    +toggle('gazeReturnEnabled','指针静止后视线回正')
    +range('gazeIdleSeconds','回正前等待',1,15,1,'秒')
    +toggle('gamepadEnabled','手柄输入','A 操作键盘，B 操作鼠标，左摇杆选键区')))
   +group('桌面提示',
    `<div class="overlay-example" role="group" aria-label="按键和气泡位置示例">
      <div class="example-stage"><kbd class="example-key">Space</kbd><span class="example-speech">开工啦。</span><i aria-hidden="true"></i><span class="example-off" hidden>桌面提示已关闭</span></div>
     </div>`
    +toggle('showKeys','显示按键提示')
    +toggle('bubblesEnabled','显示互动气泡')
    +disclosure('overlayTuning','调整按键和气泡显示',
    range('keyBubbleScale','按键提示大小',.8,1.8)
    +range('speechBubbleScale','气泡大小',.8,1.6)
    +toggle('multiKeys','同时显示多个按键')
    +range('maxKeys','同时显示上限',1,6,1,'个')
    +toggle('repeatKeys','长按重复浮显','持续按住时只重复提示')
    +range('overlayTop','提示高度',.08,.17,.01,'%')
    +toggle('overlaySwapped','交换按键与气泡的左右位置')
    +range('bubbleSeconds','气泡停留时间',2,12,1,'秒')))
   +group('陪伴',
    toggle('touchEnabled','点击角色时回应')
    +select('idleSeconds','空闲问候',[[0,'关闭'],[60,'每分钟'],[90,'每 90 秒'],[180,'每 3 分钟']])
    +select('sleepMinutes','多久不活动后小憩',[[0,'关闭'],[5,'5 分钟'],[10,'10 分钟'],[15,'15 分钟']]),'data-companion-only')
   +group('声音',
    toggle('sfxEnabled','键鼠和互动音效')
    +range('sfxVolume','音量',0,1)
    +button('testSound','试听')))}
  ${panel('desktop',
   group('窗口',
    toggle('alwaysOnTop','窗口置顶')
    +toggle('clickThrough','整窗鼠标穿透',`可从托盘或 ${recoveryShortcut} 找回`)
    +toggle('edgeSnap','靠近屏幕边缘时吸附')
    +toggle('fullscreenHide','同屏全屏时隐藏')
    +`<label class="field-stack"><strong>全屏避让例外</strong><small>填写程序文件名，多个用逗号或换行分隔。</small><textarea id="fullscreenExceptions" placeholder="game.exe, player.exe" maxlength="4000" rows="2"></textarea></label>`
    +toggle('hoverFade','指针停在角色上时淡化')
    +range('hoverDelay','淡化等待',250,1500,50,'毫秒')
    +range('hoverOpacity','淡化后不透明度',.2,.8,.05)
    +`<div class="button-row">${button('recover','找回桌宠')}${button('hidePet','暂时隐藏')}</div>`)
   +group('常用位置',`<div class="position-presets">${positions}</div>`))}
  ${panel('advanced',
   group('运行',
    toggle('autostart','登录 Windows 后启动')
    +select('fps','绘制帧率',[[30,'30 FPS'],[60,'60 FPS']])
    +`<p id="runtimeStatus" class="runtime-status" role="status"></p><p class="version">版本 ${version}</p>`)
   +group('动作快捷键',
    `<p class="settings-help">用 Ctrl 或 Alt 加字母、数字或 F 键。${recoveryShortcut} 用于找回桌宠。</p>
    <details id="shortcutEditor" class="settings-disclosure"><summary>编辑 25 个动作槽</summary>
    <div class="shortcut-list"></div>${button('saveShortcuts','保存快捷键')}</details>`,'data-companion-only'))}
  </div>
  <footer class="settings-footer">
   <div class="settings-status"><span id="saved" role="status">设置自动保存</span><p id="notice" role="alert"></p></div>
   <div class="settings-footer-actions">${button('undoReset','撤销')}${button('resetPage','恢复本页默认')}</div>
  </footer>
  <dialog id="resetDialog" aria-labelledby="resetTitle" aria-describedby="resetDescription">
   <form method="dialog">
    <h2 id="resetTitle">恢复本页默认设置？</h2>
    <p id="resetDescription"></p>
    <div class="button-row"><button value="cancel" class="secondary" autofocus>取消</button><button value="confirm" class="primary">恢复默认</button></div>
   </form>
  </dialog>
 </main>`;
 const controls=Array.from(app.querySelectorAll<Control>('[data-pref]'));
 const panels=Array.from(app.querySelectorAll<HTMLElement>('[data-panel]'));
 const navButtons=Array.from(app.querySelectorAll<HTMLButtonElement>('[data-tab]'));
 const content=app.querySelector<HTMLElement>('.settings-content')!;
 const status=app.querySelector<HTMLElement>('#saved')!;
 const notice=app.querySelector<HTMLElement>('#notice')!;
 const runtimeStatus=app.querySelector<HTMLElement>('#runtimeStatus')!;
 const exceptionInput=app.querySelector<HTMLTextAreaElement>('#fullscreenExceptions')!;
 const shortcutList=app.querySelector<HTMLElement>('.shortcut-list')!;
 const example=app.querySelector<HTMLElement>('.example-stage')!;
 const exampleKey=example.querySelector<HTMLElement>('.example-key')!;
 const exampleSpeech=example.querySelector<HTMLElement>('.example-speech')!;
 const exampleOff=example.querySelector<HTMLElement>('.example-off')!;
 const resetButton=app.querySelector<HTMLButtonElement>('#resetPage')!;
 const undoButton=app.querySelector<HTMLButtonElement>('#undoReset')!;
 const resetDialog=app.querySelector<HTMLDialogElement>('#resetDialog')!;
 const resetDescription=app.querySelector<HTMLElement>('#resetDescription')!;
 const defaults=normalizePreferences() as Preferences;
 const scrollPositions=new Map<TabId,number>();
 let currentTab:TabId='appearance';
 let edition='full';
 let saveRevision=0;
 let previewSize:number|undefined;
 let previewJob:Promise<void>|undefined;
 let sizeDraft:number|undefined;
 let shortcutDraftRevision=0;
 let shortcutDraftDirty=false;
 let renderedShortcuts='';
 let undoReset:{before:Partial<Preferences>;defaults:Partial<Preferences>}|undefined;
 let resetBusy=false;

 const outputLabel=(input:HTMLInputElement)=>{
  const output=document.getElementById(`${input.dataset.pref}Value`);
  if(!output)return;
  const value=Number(input.value),unit=input.dataset.unit;
  output.textContent=unit==='size'?`${Math.round(value/420*100)}%`:unit==='%'?`${Math.round(value*100)}%`:`${value} ${unit}`;
  input.setAttribute('aria-valuetext',unit==='size'?`${output.textContent}，${value} 逻辑像素`:output.textContent);
 };
 const syncShortcuts=()=>{
  if(shortcutDraftDirty)return;
  const serialized=JSON.stringify(prefs.shortcuts);
  if(serialized===renderedShortcuts)return;
  renderedShortcuts=serialized;
  shortcutList.innerHTML=prefs.shortcuts.map((slot,index)=>`<div class="shortcut-row">
   <label><input type="checkbox" data-shortcut-enabled="${index}" ${slot.enabled?'checked':''}>启用 ${index+1}</label>
   <input data-shortcut-chord="${index}" aria-label="快捷键 ${index+1}" maxlength="48" placeholder="Ctrl+Alt+1" value="${escapeHtml(slot.chord)}">
   <select data-shortcut-action="${index}" aria-label="动作 ${index+1}">${actionOptions.map(([id,label])=>`<option value="${id}" ${slot.action===id?'selected':''}>${label}</option>`).join('')}</select>
  </div>`).join('');
 };
 const available=(key:string)=>{
  if(!desktop&&nativeFields.has(key))return false;
  if(edition!=='full'&&companionFields.has(key))return false;
  if(edition==='static'&&['fps','hoverFade','hoverDelay','hoverOpacity','motion','intensity','headElasticity','idleEnabled'].includes(key))return false;
  return true;
 };
 const dependencyEnabled=(key:string)=>{
  if(!available(key))return false;
  if(['inputMode','handSpeed','keyboardScale'].includes(key))return prefs.inputEnabled;
  if(key==='mouseScale')return prefs.inputEnabled&&prefs.inputMode==='keyboard_mouse';
  if(['intensity','headElasticity','idleEnabled'].includes(key))return prefs.motion!=='off';
  if(['repeatKeys','multiKeys','keyBubbleScale'].includes(key))return prefs.showKeys;
  if(key==='maxKeys')return prefs.showKeys&&prefs.multiKeys;
  if(key==='gazeScale'||key==='gazeReturnEnabled')return prefs.cursorFollow;
  if(key==='gazeIdleSeconds')return prefs.cursorFollow&&prefs.gazeReturnEnabled;
  if(key==='speechBubbleScale'||key==='bubbleSeconds'||key==='idleSeconds')return prefs.bubblesEnabled;
  if(key==='overlayTop'||key==='overlaySwapped')return prefs.showKeys||(edition==='full'&&prefs.bubblesEnabled);
  if(key==='hoverDelay'||key==='hoverOpacity')return prefs.hoverFade;
  if(key==='sfxVolume')return prefs.sfxEnabled;
  return true;
 };
 const resetKeys=()=>controls
  .filter(input=>input.closest<HTMLElement>('[data-panel]')?.dataset.panel===currentTab)
  .map(input=>input.dataset.pref as keyof Preferences)
  .filter(key=>available(key)&&prefs[key]!==defaults[key]);
 const syncFooter=()=>{
  resetButton.hidden=!resettableTabs.has(currentTab);
  resetButton.disabled=resetBusy||!resetKeys().length;
  undoButton.hidden=!undoReset;
  undoButton.disabled=resetBusy;
 };
 const syncControls=()=>{
  for(const input of controls){
   const key=input.dataset.pref as keyof Preferences;
   const value=prefs[key];
   if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=Boolean(value);
   else input.value=String(key==='size'&&sizeDraft!==undefined?sizeDraft:value);
   input.disabled=!dependencyEnabled(key);
   if(input instanceof HTMLInputElement&&input.type==='range')outputLabel(input);
  }
  exceptionInput.disabled=!desktop||!prefs.fullscreenHide;
  if(document.activeElement!==exceptionInput)exceptionInput.value=prefs.fullscreenExceptions.join(', ');
  exampleKey.hidden=!prefs.showKeys;
  exampleSpeech.hidden=edition!=='full'||!prefs.bubblesEnabled;
  exampleOff.hidden=!(exampleKey.hidden&&exampleSpeech.hidden);
  for(const key of ['bubblesEnabled','speechBubbleScale','bubbleSeconds']){
   const row=app.querySelector(`[data-pref="${key}"]`)?.closest<HTMLElement>('label');
   if(row)row.hidden=edition!=='full';
  }
  syncFooter();
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
   if(key==='size'){
    sizeDraft=Number(input.value);
    if(desktop)queuePreview(sizeDraft);
   }
  };
  input.onchange=async()=>{
   const value=input instanceof HTMLInputElement&&input.type==='checkbox'
    ?input.checked:typeof prefs[key]==='number'?Number(input.value):input.value;
   if(desktop&&key==='size'){
    await previewJob;
    if(Number(input.value)!==value)return;
   }
   if(key==='size')sizeDraft=undefined;
   await save({[key]:value});
  };
  if(key==='size')input.onpointercancel=()=>{
   sizeDraft=undefined;
   syncControls();
   if(desktop)queuePreview(prefs.size);
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
   renderedShortcuts='';
   syncShortcuts();
  }
 });
 run('resetPage',async()=>{
  resetDialog.returnValue='';
  resetDescription.textContent=currentTab==='appearance'?'恢复本页可用的尺寸、动效与界面设置。':'恢复本页可用的键鼠、提示、陪伴与声音设置。';
  resetDialog.showModal();
 });
 resetDialog.addEventListener('close',()=>{
  if(resetDialog.returnValue!=='confirm'||resetBusy)return;
  const keys=resetKeys();
  if(!keys.length)return;
  const before=Object.fromEntries(keys.map(key=>[key,prefs[key]])) as Partial<Preferences>;
  const patch=Object.fromEntries(keys.map(key=>[key,defaults[key]])) as Partial<Preferences>;
  resetBusy=true;
  syncFooter();
  void save(patch,'本页已恢复默认').then(saved=>{
   if(saved)undoReset={before,defaults:patch};
  }).finally(()=>{resetBusy=false;syncFooter();if(!undoButton.hidden)undoButton.focus();});
 });
 run('undoReset',async()=>{
  if(!undoReset)return;
  const current=undoReset;
  const patch=Object.fromEntries(Object.entries(current.before).filter(([key])=>
   prefs[key as keyof Preferences]===current.defaults[key as keyof Preferences])) as Partial<Preferences>;
  resetBusy=true;
  syncFooter();
  try{
   if(!Object.keys(patch).length){
    undoReset=undefined;
    status.textContent='本页设置已手动调整';
   }else if(await save(patch,'已撤销恢复默认'))undoReset=undefined;
  }finally{
   resetBusy=false;
   syncFooter();
   (resetButton.hidden?navButtons.find(tab=>tab.dataset.tab===currentTab):resetButton)?.focus();
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
  if(edition==='static'&&currentTab==='interaction')activateTab('appearance');
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
 const activateTab=(id:TabId)=>{
  if(id===currentTab)return;
  scrollPositions.set(currentTab,content.scrollTop);
  currentTab=id;
  for(const node of navButtons){
   const selected=node.dataset.tab===id;
   node.setAttribute('aria-selected',String(selected));
   node.tabIndex=selected?0:-1;
  }
  for(const panel of panels)panel.hidden=panel.dataset.panel!==currentTab;
  content.scrollTop=scrollPositions.get(id)??0;
  syncFooter();
  if(currentTab==='desktop')void refreshPositions().catch(reportError);
  if(currentTab==='advanced')void refreshMetrics().catch(reportError);
 };
 for(const tab of navButtons)tab.onclick=()=>activateTab(tab.dataset.tab as TabId);
 const tabList=app.querySelector<HTMLElement>('[role="tablist"]')!;
 tabList.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const navigable=navButtons.filter(tab=>!tab.hidden);
  const position=navigable.findIndex(tab=>tab.dataset.tab===currentTab);
  const next=event.key==='Home'?0:event.key==='End'?navigable.length-1
   :(position+(event.key==='ArrowLeft'?-1:1)+navigable.length)%navigable.length;
  event.preventDefault();
  activateTab(navigable[next].dataset.tab as TabId);
  navigable[next].focus();
 });
 const unsubscribe=onPreferences(syncControls);
 const metricsTimer=window.setInterval(()=>{
  if(desktop&&currentTab==='advanced')void refreshMetrics().catch(reportError);
 },2500);
 window.addEventListener('beforeunload',()=>{unsubscribe();clearInterval(metricsTimer);},{once:true});
 syncControls();
 await refreshMetrics().catch(reportError);
}
export function menuPage(app:HTMLElement){
 document.body.className='menu-page';
 document.body.toggleAttribute('data-native',desktop);
 app.innerHTML=`<main class="interaction-menu">
  <header id="menuDrag"><h1>和启真互动</h1><button id="closeMenu" class="icon-button" type="button" aria-label="关闭菜单">×</button></header>
  <div class="action-grid" role="group" aria-label="互动动作">
   <button type="button" data-action="nod">轻轻点头</button><button type="button" data-action="smile">开心一下</button>
   <button type="button" data-action="sleepy">闭眼休息</button><button type="button" data-action="default">回到日常</button>
  </div>
  <div class="menu-options">
   <button id="menuSettings" class="wide-button" type="button">桌宠设置 <span aria-hidden="true">›</span></button>
   <button id="menuInput" class="wide-button" type="button" data-pref="inputEnabled" ${desktop?'':'hidden'}></button>
  </div>
  <div class="menu-footer" ${desktop?'':'hidden'}>${button('menuHide','暂时隐藏')}${button('menuQuit','退出程序')}</div>
  <p id="notice" role="alert"></p>
 </main>`;
 const close=()=>{if(desktop)return call('close_panel',{label:'menu'});window.close();return Promise.resolve();};
 const reportError=(error:unknown)=>notify(String(error));
 const menuInput=app.querySelector<HTMLButtonElement>('#menuInput')!;
 const syncInput=()=>{menuInput.textContent=prefs.inputEnabled?'暂停键鼠回应':'恢复键鼠回应';};
 syncInput();
 const unsubscribe=onPreferences(syncInput);
 window.addEventListener('beforeunload',unsubscribe,{once:true});
 menuInput.onclick=async()=>{
  menuInput.disabled=true;
  try{
   if(await updatePreferences({inputEnabled:!prefs.inputEnabled}))await close();
  }catch(error){reportError(error);}
  finally{menuInput.disabled=false;}
 };
 app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(node=>node.onclick=()=>void sendAction(node.dataset.action!).then(close).catch(reportError));
 document.getElementById('menuSettings')!.onclick=()=>desktop?void call('show_settings').catch(error=>notify(String(error))):void window.open('?settings','zju-settings');
 document.getElementById('menuHide')!.onclick=()=>desktop?void call('hide_pet').then(close).catch(reportError):void close();
 document.getElementById('menuQuit')!.onclick=()=>desktop?void call('quit_app').catch(error=>notify(String(error))):void window.close();
 document.getElementById('closeMenu')!.onclick=()=>void close().catch(reportError);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void close().catch(reportError);}});
 if(desktop){
  bindWindowDrag(document.getElementById('menuDrag')!,'menu',reportError);
  const panel=app.querySelector<HTMLElement>('.interaction-menu')!;
  void call<Metrics>('input_metrics').then(metrics=>{
   if(metrics.edition!=='full'){
    panel.querySelector('h1')!.textContent='桌宠菜单';
    panel.querySelector<HTMLElement>('.action-grid')!.hidden=true;
    menuInput.hidden=metrics.edition==='static';
   }
  }).catch(reportError);
  let previousHeight=Math.ceil(panel.getBoundingClientRect().height);
  void call('menu_ready',{height:previousHeight}).catch(reportError);
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
