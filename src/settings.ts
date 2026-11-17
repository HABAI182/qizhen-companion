import {call,desktop,prefs,updatePreferences,sendAction,notify} from './bridge';

const button=(id:string,label:string)=>`<button id="${id}" class="secondary">${label}</button>`;
const toggle=(key:string,label:string,description='')=>`<label class="setting-row"><span><strong>${label}</strong>${description?`<small>${description}</small>`:''}</span><input type="checkbox" data-pref="${key}" ${(prefs as any)[key]?'checked':''}></label>`;
const range=(key:string,label:string,min:number,max:number,step:number)=>`<label class="range-row"><span>${label}<output id="${key}Value">${(prefs as any)[key]}</output></span><input type="range" data-pref="${key}" min="${min}" max="${max}" step="${step}" value="${(prefs as any)[key]}"></label>`;
export async function settingsPage(app:HTMLElement){
 document.body.className='settings-page';
 app.innerHTML=`<main class="settings-shell"><header><p class="eyebrow">ZJU · DESKTOP COMPANION</p><h1>浙大娘</h1><p class="subtitle">求是就好啦，陪你把每一天过好。</p></header><nav class="tabs" aria-label="设置分类"><button data-tab="appearance" class="active">外观</button><button data-tab="interaction">互动</button><button data-tab="desktop">桌面</button></nav><section data-panel="appearance"><h2>喜欢的大小</h2>${range('size','桌宠大小',210,840,1)}${range('intensity','动作幅度',0,1.6,.05)}${range('headElasticity','回弹强度',0,1.2,.05)}<p class="hint">从眉眼到校徽，始终保留她自己的样子。</p></section><section data-panel="interaction" hidden><h2>一敲一动，一点回应</h2>${toggle('inputEnabled','响应键盘与鼠标','在其他应用中操作也能回应')}${toggle('showKeys','短暂显示按键','只在内存中暂存浮显，不保存输入历史')}${toggle('idleEnabled','空闲小动作')}${toggle('cursorFollow','视线跟随鼠标')}${toggle('gazeReturnEnabled','鼠标静止后回正')}${range('gazeIdleSeconds','回正等待（秒）',1,15,1)}</section><section data-panel="desktop" hidden><h2>安静待在你身边</h2>${toggle('alwaysOnTop','保持在其他窗口上方')}${toggle('clickThrough','鼠标完全穿透','开启后可从托盘或 Ctrl+Alt+Z 找回')}${toggle('edgeSnap','靠近屏幕边缘时吸附')}${toggle('fullscreenHide','当前屏幕全屏时隐藏')}<div class="button-row">${button('recover','找回桌宠')}${button('hidePet','暂时隐藏')}</div><p class="hint">透明留白自动穿透；右键角色打开互动菜单。</p></section><footer><span id="saved" role="status">设置自动保存</span><span class="version">0.1.0 · 制作预览</span></footer><p id="notice" role="alert"></p></main>`;
 app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab=>tab.onclick=()=>{app.querySelectorAll('[data-tab]').forEach(node=>node.classList.toggle('active',node===tab));app.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==tab.dataset.tab);});
 app.querySelectorAll<HTMLInputElement>('[data-pref]').forEach(input=>{
  input.oninput=()=>{if(input.type==='range'){const out=document.getElementById(`${input.dataset.pref}Value`);if(out)out.textContent=input.value;}};
  input.onchange=async()=>{const key=input.dataset.pref!;const value=input.type==='checkbox'?input.checked:Number(input.value);document.getElementById('saved')!.textContent=await updatePreferences({[key]:value})?'已保存':'保存失败，请重试';};
 });
 document.getElementById('recover')!.onclick=()=>void (desktop?call('reset_pet'):Promise.resolve()).catch(error=>notify(String(error)));
 document.getElementById('hidePet')!.onclick=()=>void (desktop?call('hide_pet'):Promise.resolve()).catch(error=>notify(String(error)));
}
export function menuPage(app:HTMLElement){
 document.body.className='menu-page';
 app.innerHTML=`<main class="interaction-menu"><header id="menuDrag"><div><p class="eyebrow">求是 · 小小陪伴</p><h1>和小浙待一会儿</h1></div><button id="closeMenu" class="icon-button" aria-label="关闭">×</button></header><p class="subtitle">今天也在认真地陪着你。</p><div class="action-grid"><button data-action="default">日常</button><button data-action="nod">轻轻点头</button><button data-action="smile">开心一下</button><button data-action="sleepy">闭眼休息</button></div><button id="menuSettings" class="wide-button">设置与个性化 <span>›</span></button><div class="button-row">${button('menuHide','隐藏')}${button('menuQuit','退出')}</div><p id="notice" role="alert"></p></main>`;
 app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(node=>node.onclick=()=>void sendAction(node.dataset.action!).catch(error=>notify(String(error))));
 document.getElementById('menuSettings')!.onclick=()=>desktop?void call('show_settings').catch(error=>notify(String(error))):void window.open('?settings','zju-settings');
 document.getElementById('menuHide')!.onclick=()=>desktop?void call('hide_pet').catch(error=>notify(String(error))):void window.close();
 document.getElementById('menuQuit')!.onclick=()=>desktop?void call('quit_app').catch(error=>notify(String(error))):void window.close();
 document.getElementById('closeMenu')!.onclick=()=>desktop?void call('close_panel',{label:'menu'}).catch(error=>notify(String(error))):void window.close();
 document.getElementById('menuDrag')!.onpointerdown=event=>{if(event.button===0&&desktop&&!(event.target as HTMLElement).closest('button'))void call('drag_menu').catch(error=>notify(String(error)));};
 if(desktop)new ResizeObserver(()=>{void call('fit_menu',{height:Math.ceil(app.scrollHeight)}).catch(()=>{});}).observe(app);
}
