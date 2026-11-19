use serde::{Serialize,Deserialize};
use std::{sync::atomic::Ordering,time::{Duration,Instant}};
use tauri::{LogicalSize,Manager,PhysicalPosition};
use crate::{app::AppState,window_layout::{self,Rect}};

#[derive(Clone,Copy,Debug,PartialEq,Serialize,Deserialize)]pub struct Position{pub x:i32,pub y:i32}
#[derive(Clone,Default,Serialize,Deserialize)]#[serde(default)]pub struct SavedDesktop{pub last:Option<Position>,pub slots:[Option<Position>;3]}
#[derive(Default)]pub struct Visibility{pub manual_hidden:bool,pub auto_hidden:bool,pub fullscreen_override:bool}
fn store_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join("desktop-state.json"))}
pub fn load(app:&tauri::AppHandle)->SavedDesktop{store_path(app).ok().and_then(|p|std::fs::read(p).ok()).and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or_default()}
fn persist(app:&tauri::AppHandle,saved:&SavedDesktop)->Result<(),String>{let path=store_path(app)?;std::fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;let tmp=path.with_extension("tmp");std::fs::write(&tmp,serde_json::to_vec_pretty(saved).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;std::fs::rename(tmp,path).map_err(|e|e.to_string())}
fn monitor_work(monitor:&tauri::Monitor)->(Rect,f64){
 let area=monitor.work_area();
 (Rect{x:area.position.x,y:area.position.y,width:area.size.width as i32,height:area.size.height as i32},monitor.scale_factor())
}
pub fn work(window:&tauri::WebviewWindow)->Result<Option<(Rect,f64)>,String>{let m=window.current_monitor().map_err(|e|e.to_string())?.or(window.primary_monitor().map_err(|e|e.to_string())?);Ok(m.as_ref().map(monitor_work))}
fn artwork(state:&AppState,width:i32,height:i32)->Rect{
 state.hit_mask.lock().unwrap_or_else(|error|error.into_inner()).artwork_rect(width,height)
  .unwrap_or(Rect{x:0,y:0,width,height})
}
struct DragMonitor{screen:Rect,work:Rect,artwork:Rect}
pub struct PetDrag{
 window:Rect,
 artwork:Rect,
 monitors:Vec<DragMonitor>,
 last:Position,
 release:Option<Instant>,
}
fn distance_from_screen(screen:Rect,x:i64,y:i64)->i64{
 let left=i64::from(screen.x);
 let top=i64::from(screen.y);
 let right=left+i64::from(screen.width)-1;
 let bottom=top+i64::from(screen.height)-1;
 (left-x).max(x-right).max(0)+(top-y).max(y-bottom).max(0)
}
impl PetDrag{
 fn constrain(&self,position:Position)->Position{
  let center_x=i64::from(position.x)+i64::from(self.artwork.x)+i64::from(self.artwork.width)/2;
  let center_y=i64::from(position.y)+i64::from(self.artwork.y)+i64::from(self.artwork.height)/2;
  let Some(monitor)=self.monitors.iter().min_by_key(|m|distance_from_screen(m.screen,center_x,center_y)) else{return self.last;};
  let window=Rect{x:position.x,y:position.y,..self.window};
  let result=window_layout::fit_artwork(window,monitor.artwork,monitor.work,None);
  Position{x:result.x,y:result.y}
 }
}
pub fn begin_pet_drag(pet:&tauri::WebviewWindow,state:&AppState)->Result<Position,String>{
 let position=pet.outer_position().map_err(|error|error.to_string())?;
 let size=pet.outer_size().map_err(|error|error.to_string())?;
 let scale=pet.scale_factor().map_err(|error|error.to_string())?;
 let window=Rect{x:position.x,y:position.y,width:size.width as i32,height:size.height as i32};
 let logical=size.to_logical::<f64>(scale);
 let available=pet.available_monitors().map_err(|error|error.to_string())?;
 let monitors=available.iter().map(|monitor|{
  let (work,scale)=monitor_work(monitor);
  let size=logical.to_physical::<i32>(scale);
  let point=monitor.position();
  let extent=monitor.size();
  let screen=Rect{x:point.x,y:point.y,width:extent.width as i32,height:extent.height as i32};
  DragMonitor{screen,work,artwork:artwork(state,size.width,size.height)}
 }).collect();
 let last=Position{x:window.x,y:window.y};
 let drag=PetDrag{window,artwork:artwork(state,window.width,window.height),monitors,last,release:None};
 *state.pet_drag_release.lock().unwrap_or_else(|error|error.into_inner())=Some(drag);
 state.dragging.store(true,Ordering::Release);
 Ok(last)
}
pub fn clear_pet_drag(state:&AppState){
 state.dragging.store(false,Ordering::Release);
 state.pet_drag_release.lock().unwrap_or_else(|error|error.into_inner()).take();
}
fn preview_pet_position(pet:&tauri::WebviewWindow,position:Position)->Result<(),String>{
 #[cfg(windows)]{
  use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos,SWP_ASYNCWINDOWPOS,SWP_NOACTIVATE,SWP_NOSIZE,SWP_NOZORDER};
  let hwnd=pet.hwnd().map_err(|error|error.to_string())?;
  // Tao's set_outer_position explicitly invalidates the entire WebView.
  // Let the compositor move the existing surface during each preview instead.
  let moved=unsafe{SetWindowPos(hwnd.0,std::ptr::null_mut(),position.x,position.y,0,0,SWP_ASYNCWINDOWPOS|SWP_NOACTIVATE|SWP_NOSIZE|SWP_NOZORDER)};
  if moved==0{return Err(std::io::Error::last_os_error().to_string());}
  Ok(())
 }
 #[cfg(not(windows))]
 pet.set_position(PhysicalPosition::new(position.x,position.y)).map_err(|error|error.to_string())
}
fn position_pet(app:&tauri::AppHandle,position:Option<Position>,snap:bool)->Result<Option<Position>,String>{
 let pet=app.get_webview_window("pet").ok_or("桌宠窗口不存在")?;
 let size=pet.outer_size().map_err(|error|error.to_string())?;
 let scale=pet.scale_factor().map_err(|error|error.to_string())?;
 let state=app.state::<AppState>();
 let monitor=if let Some(position)=position{
  let art=artwork(&state,size.width as i32,size.height as i32);
  let center_x=f64::from(position.x)+f64::from(art.x)+f64::from(art.width)/2.;
  let center_y=f64::from(position.y)+f64::from(art.y)+f64::from(art.height)/2.;
  pet.monitor_from_point(center_x,center_y).map_err(|error|error.to_string())?
 }else{None};
 let monitor=monitor.or(pet.primary_monitor().map_err(|error|error.to_string())?);
 let Some(monitor)=monitor else{return Ok(None);};
 let (area,target_scale)=monitor_work(&monitor);
 let size=size.to_logical::<f64>(scale).to_physical::<i32>(target_scale);
 let art=artwork(&state,size.width,size.height);
 let margin=(24.*target_scale).round() as i32;
 let placed=if let Some(position)=position{
  let window=Rect{x:position.x,y:position.y,width:size.width,height:size.height};
  window_layout::fit_artwork(window,art,area,snap.then_some(margin))
 }else{
  let visible=window_layout::corner(area,art.width,art.height,margin);
  Rect{x:visible.x-art.x,y:visible.y-art.y,width:size.width,height:size.height}
 };
 pet.set_position(PhysicalPosition::new(placed.x,placed.y)).map_err(|error|error.to_string())?;
 Ok(Some(Position{x:placed.x,y:placed.y}))
}
pub fn place(app:&tauri::AppHandle,position:Option<Position>)->Result<(),String>{
 position_pet(app,position,false).map(|_|())
}
pub fn resize(app:&tauri::AppHandle,pet:&tauri::WebviewWindow,size:f64,keep_edges:bool)->Result<(),String>{
 let scale=pet.scale_factor().map_err(|error|error.to_string())?;
 let current=pet.outer_size().map_err(|error|error.to_string())?;
 let logical=LogicalSize::new(size,size);
 let next=logical.to_physical::<u32>(scale);
 if current==next{return Ok(());}
 let position=pet.outer_position().map_err(|error|error.to_string())?;
 let work=work(pet)?;
 pet.set_size(logical).map_err(|error|error.to_string())?;
 let Some((area,_))=work else{return Ok(());};
 let state=app.state::<AppState>();
 let window=Rect{x:position.x,y:position.y,width:next.width as i32,height:next.height as i32};
 let next_art=artwork(&state,window.width,window.height);
 let target=if keep_edges{
  let old_art=artwork(&state,current.width as i32,current.height as i32);
  window_layout::resize_artwork(window,old_art,next_art,area,(6.*scale).round() as i32)
 }else{
  window_layout::fit_artwork(window,next_art,area,None)
 };
 if (target.x,target.y)!=(position.x,position.y){
  pet.set_position(PhysicalPosition::new(target.x,target.y)).map_err(|error|error.to_string())?;
 }
 Ok(())
}
pub fn beside(app:&tauri::AppHandle,panel:&tauri::WebviewWindow)->Result<(),String>{
 let Some(pet)=app.get_webview_window("pet") else{return Ok(());};
 let Some((area,scale))=work(&pet)? else{return Ok(());};
 let p=pet.outer_position().map_err(|error|error.to_string())?;
 let s=pet.outer_size().map_err(|error|error.to_string())?;
 let pet_window=Rect{x:p.x,y:p.y,width:s.width as i32,height:s.height as i32};
 let art=artwork(&app.state::<AppState>(),pet_window.width,pet_window.height);
 let visible=window_layout::artwork_at(pet_window,art);
 let panel_scale=panel.scale_factor().map_err(|error|error.to_string())?;
 let size=panel.outer_size().map_err(|error|error.to_string())?.to_logical::<f64>(panel_scale).to_physical::<i32>(scale);
 let target=window_layout::beside(visible,size.width,size.height,area,(16.*scale) as i32);
 panel.set_position(PhysicalPosition::new(target.x,target.y)).map_err(|error|error.to_string())
}
pub fn fit_panel(panel:&tauri::WebviewWindow)->Result<(),String>{
 let Some((area,_))=work(panel)? else{return Ok(())};
 let position=panel.outer_position().map_err(|e|e.to_string())?;
 let size=panel.outer_size().map_err(|e|e.to_string())?;
 let fitted=window_layout::fit(Rect{x:position.x,y:position.y,width:size.width as i32,height:size.height as i32},area);
 if (fitted.x,fitted.y)!=(position.x,position.y){
  panel.set_position(PhysicalPosition::new(fitted.x,fitted.y)).map_err(|e|e.to_string())?;
 }
 Ok(())
}
pub fn move_panel(panel:&tauri::WebviewWindow,position:Position)->Result<(),String>{
 let size=panel.outer_size().map_err(|error|error.to_string())?;
 let scale=panel.scale_factor().map_err(|error|error.to_string())?;
 // Follow the proposed header into a neighboring work area before clamping.
 let header_x=f64::from(position.x)+f64::from(size.width)/2.;
 let header_y=f64::from(position.y)+16.*scale;
 let monitor_work_area=match panel.monitor_from_point(header_x,header_y).map_err(|error|error.to_string())?{
  Some(monitor)=>Some(monitor_work(&monitor)),
  None=>work(panel)?,
 };
 let Some((area,target_scale))=monitor_work_area else{return Ok(());};
 let size=size.to_logical::<f64>(scale).to_physical::<i32>(target_scale);
 let target=window_layout::fit(Rect{x:position.x,y:position.y,width:size.width,height:size.height},area);
 panel.set_position(PhysicalPosition::new(target.x,target.y)).map_err(|error|error.to_string())
}
pub fn show(app:&tauri::AppHandle,visible:bool)->Result<(),String>{
 let state=app.state::<AppState>();
 let mut v=state.visibility.lock().map_err(|_|"窗口状态锁失败")?;
 v.manual_hidden=!visible;
 v.auto_hidden=false;
 v.fullscreen_override=visible;
 if let Some(pet)=app.get_webview_window("pet"){
  if visible{
   if state.ready.load(Ordering::Acquire){pet.unminimize().map_err(|e|e.to_string())?;pet.show().map_err(|e|e.to_string())?;}
  }else{pet.hide().map_err(|e|e.to_string())?;}
 }
 if !visible{let _=crate::app::dismiss_menu(app);}
 Ok(())
}
pub fn renderer_ready(app:&tauri::AppHandle)->Result<(),String>{
 let state=app.state::<AppState>();
 if !state.ready.load(Ordering::Acquire){
  let last=state.saved.lock().unwrap_or_else(|error|error.into_inner()).last;
  if let Err(error)=place(app,last){eprintln!("桌宠位置未恢复：{error}");}
  state.ready.store(true,Ordering::Release);
 }
 visibility_tick(app)
}
fn desired_hidden(manual:bool,fullscreen:bool,override_fullscreen:bool,dragging:bool)->bool{manual||(fullscreen&&!override_fullscreen&&!dragging)}
pub fn visibility_tick(app:&tauri::AppHandle)->Result<(),String>{
 let state=app.state::<AppState>();if !state.ready.load(Ordering::Acquire){return Ok(());}let p=state.prefs.lock().unwrap_or_else(|x|x.into_inner()).clone();let full=p.fullscreen_hide&&crate::platform::fullscreen(app,&p);let mut v=state.visibility.lock().unwrap_or_else(|x|x.into_inner());
 if !full{v.fullscreen_override=false;}let hidden=desired_hidden(v.manual_hidden,full,v.fullscreen_override,state.dragging.load(Ordering::Acquire));
 if let Some(w)=app.get_webview_window("pet"){if hidden{if w.is_visible().unwrap_or(false){w.hide().map_err(|e|e.to_string())?;}}else if !w.is_visible().unwrap_or(false){w.show().map_err(|e|e.to_string())?;}}v.auto_hidden=hidden&&!v.manual_hidden;Ok(())
}
pub fn save_current(app:&tauri::AppHandle)->Result<(),String>{
 let pet=app.get_webview_window("pet").ok_or("桌宠窗口不存在")?;
 let p=pet.outer_position().map_err(|e|e.to_string())?;
 save_last(app,Position{x:p.x,y:p.y})
}
fn save_last(app:&tauri::AppHandle,position:Position)->Result<(),String>{
 let state=app.state::<AppState>();
 let mut saved=state.saved.lock().map_err(|_|"位置锁失败")?;
 let current=Some(position);
 if saved.last!=current{
  let updated=SavedDesktop{last:current,..saved.clone()};
  persist(app,&updated)?;
  *saved=updated;
 }
 Ok(())
}
pub fn move_pet(pet:&tauri::WebviewWindow,state:&AppState,position:Position,finished:bool)->Result<(),String>{
 if !finished{
  let target={
   let mut session=state.pet_drag_release.lock().unwrap_or_else(|error|error.into_inner());
   let Some(drag)=session.as_mut() else{return Ok(());};
   let target=drag.constrain(position);
   if target==drag.last{return Ok(());}
   drag.last=target;
   target
  };
  return preview_pet_position(pet,target);
 }
 let app=pet.app_handle();
 let snap=state.prefs.lock().unwrap_or_else(|error|error.into_inner()).edge_snap;
 let placed=position_pet(app,Some(position),snap)?;
 if let Some(placed)=placed{save_last(app,placed)?;}
 Ok(())
}
#[tauri::command]pub fn list_positions(app:tauri::AppHandle)->Vec<bool>{app.state::<AppState>().saved.lock().unwrap_or_else(|x|x.into_inner()).slots.iter().map(Option::is_some).collect()}
#[tauri::command]pub fn save_position(app:tauri::AppHandle,slot:usize)->Result<(),String>{
 if slot>=3{return Err("位置编号无效".into());}
 let pet=app.get_webview_window("pet").ok_or("桌宠窗口不存在")?;
 let p=pet.outer_position().map_err(|e|e.to_string())?;
 let state=app.state::<AppState>();
 let mut saved=state.saved.lock().map_err(|_|"位置锁失败")?;
 let mut updated=saved.clone();
 updated.slots[slot]=Some(Position{x:p.x,y:p.y});
 persist(&app,&updated)?;
 *saved=updated;
 Ok(())
}
#[tauri::command]pub fn restore_position(app:tauri::AppHandle,slot:usize)->Result<(),String>{if slot>=3{return Err("位置编号无效".into());}let pos=app.state::<AppState>().saved.lock().map_err(|_|"位置锁失败")?.slots[slot].ok_or("这个位置尚未保存")?;place(&app,Some(pos))?;show(&app,true)?;save_current(&app)}
fn watch_tick(app:&tauri::AppHandle){
 let state=app.state::<AppState>();
 #[cfg(windows)]{
  let down=crate::platform::drag_button_down();
  let dragging=state.dragging.load(Ordering::Acquire);
  let lost_release={
   let mut session=state.pet_drag_release.lock().unwrap_or_else(|error|error.into_inner());
   session.as_mut().is_some_and(|drag|release_needs_recovery(&mut drag.release,dragging,down,Instant::now()))
  };
  if lost_release{
   clear_pet_drag(&state);
   if let Some(pet)=app.get_webview_window("pet"){
    if let Ok(position)=pet.outer_position(){let _=move_pet(&pet,&state,Position{x:position.x,y:position.y},true);}
   }
  }
  if !down{state.menu_dragging.store(false,Ordering::Release);}
 }
 let _=visibility_tick(app);
 let previewing=state.size_preview.lock().unwrap_or_else(|error|error.into_inner()).is_some();
 if state.ready.load(Ordering::Acquire)&&!state.dragging.load(Ordering::Acquire)&&!previewing{let _=save_current(app);}
}
#[cfg(windows)]
fn release_needs_recovery(release:&mut Option<Instant>,dragging:bool,down:bool,now:Instant)->bool{
 // Prefer the WebView's exact release coordinates. Recover if it lost capture
 // and the primary button has been up through several native watch ticks.
 if !dragging||down{*release=None;return false;}
 now.saturating_duration_since(*release.get_or_insert(now))>=Duration::from_millis(900)
}
pub fn watch(app:tauri::AppHandle){
 // Window getters synchronously dispatch to the event loop. Keep operations
 // combining getters and visibility locks on that thread alongside IPC.
 std::thread::spawn(move||loop{
  let handle=app.clone();
  let (done,finished)=std::sync::mpsc::sync_channel(1);
  if app.run_on_main_thread(move||{watch_tick(&handle);let _=done.send(());}).is_err(){break;}
  if finished.recv().is_err(){break;}
  std::thread::sleep(Duration::from_millis(300));
 });
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn manual_hide_wins_while_fullscreen_drag_and_override_are_independent(){for full in [true,false]{for dragging in [true,false]{assert!(desired_hidden(true,full,true,dragging));}}assert!(desired_hidden(false,true,false,false));assert!(!desired_hidden(false,false,false,false));assert!(!desired_hidden(false,true,true,false));assert!(!desired_hidden(false,true,false,true));}
 #[test]fn drag_cache_clamps_to_the_intended_screen_without_snapping(){
  let left=Rect{x:-1600,y:0,width:1600,height:900};
  let right=Rect{x:0,y:0,width:1920,height:1080};
  let art=Rect{x:18,y:34,width:360,height:350};
  let monitors=vec![
   DragMonitor{screen:left,work:Rect{height:860,..left},artwork:art},
   DragMonitor{screen:right,work:Rect{height:1040,..right},artwork:Rect{x:27,y:51,width:540,height:525}},
  ];
  let drag=PetDrag{window:Rect{x:-650,y:180,width:420,height:420},artwork:art,monitors,last:Position{x:-650,y:180},release:None};
  assert_eq!(drag.constrain(Position{x:-500,y:464}),Position{x:-500,y:464});
  assert_eq!(drag.constrain(Position{x:-500,y:600}),Position{x:-500,y:476});
  assert_eq!(drag.constrain(Position{x:-190,y:80}),Position{x:-27,y:80});
  assert_eq!(drag.constrain(Position{x:i32::MAX,y:990}),Position{x:1353,y:464});
 }
 #[cfg(windows)]
 #[test]fn exact_pointer_release_has_priority_over_the_watch_fallback(){
  let start=Instant::now();
  let mut release=None;
  assert!(!release_needs_recovery(&mut release,true,true,start));
  assert!(!release_needs_recovery(&mut release,true,false,start));
  assert!(!release_needs_recovery(&mut release,true,false,start+Duration::from_millis(899)));
  assert!(release_needs_recovery(&mut release,true,false,start+Duration::from_millis(900)));
  assert!(!release_needs_recovery(&mut release,false,false,start+Duration::from_secs(2)));
  assert_eq!(release,None);
 }
}
