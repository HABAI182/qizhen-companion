import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {defaults, normalizePreferences, applyTheme} from './preferences.mjs';

export const desktop=Boolean((window as any).__TAURI_INTERNALS__);
export type Preferences=Omit<ReturnType<typeof normalizePreferences>,'motion'|'inputMode'> & {motion:'full'|'low'|'off',inputMode:'keyboard_mouse'|'keyboard_only'};
export let prefs:Preferences=normalizePreferences();
const storageKey='zju-companion-preferences-v1';
const observers=new Set<(p:Preferences)=>void>();
let revision=0, pendingWrites=0, queue=Promise.resolve();
export const call=<T=void>(command:string,args?:Record<string,unknown>)=>invoke<T>(command,args);
export function notify(message:string){const node=document.getElementById('notice');if(node){node.textContent=message;node.classList.add('visible');}}
export function onPreferences(observer:(p:Preferences)=>void){observers.add(observer);return()=>observers.delete(observer);}
function publish(value:unknown){prefs=normalizePreferences(value as any);applyTheme(prefs);for(const observer of observers)observer(prefs);}
export async function initializePreferences(){
 let value:unknown={};
 if(desktop)value=await call('read_preferences');
 else try{value=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
 publish(value);
 if(desktop)await listen<Preferences>('preferences',event=>{if(!pendingWrites)publish(event.payload);});
 else window.addEventListener('storage',event=>{if(event.key===storageKey&&!pendingWrites)try{publish(JSON.parse(event.newValue||'{}'));}catch{}});
}
export async function updatePreferences(patch:Partial<Preferences>){
 const desired=normalizePreferences({...prefs,...patch}), mine=++revision;publish(desired);pendingWrites++;
 const job=queue.then(async()=>{if(desktop)return call<Preferences>('save_preferences',{prefs:desired});localStorage.setItem(storageKey,JSON.stringify(desired));return desired;});
 queue=job.then(()=>{},()=>{});
 try{const saved=await job;if(mine===revision)publish(saved);return true;}
 catch(error){if(mine===revision){try{publish(desktop?await call('read_preferences'):defaults);}catch{}}notify(`设置未保存：${String(error)}`);return false;}
 finally{pendingWrites--;}
}
const channel=desktop?null:new BroadcastChannel('zju-companion-actions');
export async function sendAction(action:string){if(desktop)await call('pet_action',{action});else channel?.postMessage(action);}
export async function onAction(callback:(action:string)=>void){if(desktop)return listen<string>('pet-action',event=>callback(event.payload));if(channel)channel.onmessage=event=>{if(typeof event.data==='string')callback(event.data);};return()=>{};}
export const escapeHtml=(value:unknown)=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
