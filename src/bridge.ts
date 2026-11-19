import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {normalizePreferences, applyTheme} from './preferences.mjs';

export const desktop=Boolean((window as any).__TAURI_INTERNALS__);
export type Preferences=Omit<ReturnType<typeof normalizePreferences>,'motion'|'inputMode'|'inputEnabled'> & {motion:'full'|'low'|'off',inputMode:'keyboard_mouse'|'keyboard_only',inputEnabled:boolean};
export let prefs:Preferences=normalizePreferences();
const storageKey='zju-companion-preferences-v1';
const observers=new Set<(p:Preferences)=>void>();
let confirmed=prefs;
let revision=0,queue=Promise.resolve();
const pending=new Map<number,Partial<Preferences>>();
export const call=<T=void>(command:string,args?:Record<string,unknown>)=>invoke<T>(command,args);
export function notify(message:string){const node=document.getElementById('notice');if(node){node.textContent=message;node.classList.add('visible');}}
export function onPreferences(observer:(p:Preferences)=>void){observers.add(observer);return()=>observers.delete(observer);}
function publish(value:unknown){prefs=normalizePreferences(value as any);applyTheme(prefs);for(const observer of observers)observer(prefs);}
function publishPending(){publish(Object.assign({},confirmed,...pending.values()));}
function acceptSaved(value:unknown){confirmed=normalizePreferences(value as any);publishPending();}
function readBrowser(){
 try{return JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{return confirmed;}
}
export async function initializePreferences(){
 acceptSaved(desktop?await call('read_preferences'):readBrowser());
 if(desktop)await listen<Preferences>('preferences',event=>acceptSaved(event.payload));
 else window.addEventListener('storage',event=>{if(event.key===storageKey)acceptSaved(readBrowser());});
}
export async function updatePreferences(patch:Partial<Preferences>){
 const mine=++revision;
 pending.set(mine,patch);
 publishPending();
 const job=queue.then(async()=>{
  try{
   if(desktop){
    confirmed=normalizePreferences(await call<Preferences>('patch_preferences',{patch}));
   }else{
    const desired=normalizePreferences({...readBrowser(),...patch});
    localStorage.setItem(storageKey,JSON.stringify(desired));
    confirmed=desired;
   }
   return true;
  }catch(error){
   if(desktop){try{confirmed=normalizePreferences(await call('read_preferences'));}catch{}}
   else confirmed=normalizePreferences(readBrowser());
   notify(`设置未保存：${String(error)}`);
   return false;
  }finally{
   pending.delete(mine);
   publishPending();
  }
 });
 queue=job.then(()=>{},()=>{});
 return job;
}
const channel=desktop?null:new BroadcastChannel('zju-companion-actions');
export async function sendAction(action:string){if(desktop)await call('pet_action',{action});else channel?.postMessage(action);}
export async function onAction(callback:(action:string)=>void){if(desktop)return listen<string>('pet-action',event=>callback(event.payload));if(channel)channel.onmessage=event=>{if(typeof event.data==='string')callback(event.data);};return()=>{};}
export const escapeHtml=(value:unknown)=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
