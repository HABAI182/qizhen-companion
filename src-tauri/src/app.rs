use std::{fs,sync::{Mutex,atomic::{AtomicU64,AtomicBool,Ordering}}};
use serde::Serialize;
use tauri::{Emitter,Manager,WebviewWindowBuilder,WebviewUrl,LogicalSize};
use tauri::{menu::{Menu,MenuItem},tray::{TrayIconBuilder,TrayIconEvent,MouseButton,MouseButtonState}};
use crate::{desktop,platform,preferences::{Preferences,ACTIONS,RECOVERY_KEY,shortcut_key}};
pub struct AppState{
 pub prefs:Mutex<Preferences>,pub window_gate:Mutex<()>,pub keyboard_presses:AtomicU64,pub mouse_presses:AtomicU64,pub samples:AtomicU64,
 pub menu_ready:AtomicBool,pub menu_requested:AtomicBool,pub menu_visible:AtomicBool,
 pub menu_opened:Mutex<Option<std::time::Instant>>,
 pub hit_mask:Mutex<crate::hit_test::HitMask>,pub cursor_ignored:AtomicBool,pub saved:Mutex<desktop::SavedDesktop>,pub visibility:Mutex<desktop::Visibility>,pub dragging:AtomicBool,pub menu_dragging:AtomicBool,pub ready:AtomicBool,pub gamepad_connected:AtomicBool,
 pub renderer_frames:AtomicU64,pub renderer_kind:Mutex<String>,pub renderer_error:Mutex<String>,pub size_preview:Mutex<Option<desktop::Position>>,
 pub pet_drag_release:Mutex<Option<desktop::PetDrag>>,
}
#[derive(Clone,Serialize,Default,PartialEq)]#[serde(rename_all="camelCase")]
struct InputFrame{keys_held:u16,mouse_down:bool,new_press:bool,new_mouse_press:bool,key_label:String,reach:f32,target_x:f32,target_y:f32,target_zone:String,cursor_x:f32,cursor_y:f32,cursor_moved:bool,presses:Vec<String>,repeats:Vec<String>,hovering:bool,editing:bool}
fn prefs_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join("preferences.json"))}
fn apply_preferences(app:&tauri::AppHandle,p:&Preferences)->Result<(),String>{
 if let Some(pet)=app.get_webview_window("pet"){
  if pet.is_always_on_top().map_err(|error|error.to_string())?!=p.always_on_top{
   pet.set_always_on_top(p.always_on_top).map_err(|error|error.to_string())?;
   if p.always_on_top{
    for label in ["menu","settings"]{
     if let Some(panel)=app.get_webview_window(label).filter(|panel|panel.is_visible().unwrap_or(false)){
      let _=panel.set_always_on_top(true);
     }
    }
   }
  }
  // Windows owns alpha hit testing and keeps the target latched while held.
  // Only force whole-window pass-through here, even for unrelated saves.
  if !cfg!(windows)||p.click_through{
   pet.set_ignore_cursor_events(p.click_through).map_err(|error|error.to_string())?;
   app.state::<AppState>().cursor_ignored.store(p.click_through,Ordering::Release);
  }
  desktop::resize(app,&pet,p.size,p.edge_snap)?;
 }
 Ok(())
}
#[tauri::command]pub fn read_preferences(state:tauri::State<AppState>)->Preferences{state.prefs.lock().unwrap_or_else(|x|x.into_inner()).clone()}
#[tauri::command]pub fn save_preferences(app:tauri::AppHandle,state:tauri::State<AppState>,mut prefs:Preferences)->Result<Preferences,String>{
 prefs.validate()?;let mut guard=state.prefs.lock().map_err(|_|"设置锁失败")?;let old=guard.clone();
 let result=(||{let path=prefs_path(&app)?;fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;let tmp=path.with_extension("tmp");fs::write(&tmp,serde_json::to_vec_pretty(&prefs).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;apply_preferences(&app,&prefs)?;if prefs.autostart!=old.autostart{platform::set_autostart(prefs.autostart)?;}fs::rename(tmp,path).map_err(|e|e.to_string())?;Ok::<(),String>(())})();
 let preview=state.size_preview.lock().unwrap_or_else(|e|e.into_inner()).take();
 if let Err(e)=result{
  let _=apply_preferences(&app,&old);
  if let Some(position)=preview{let _=desktop::place(&app,Some(position));}
  if prefs.autostart!=old.autostart{let _=platform::set_autostart(old.autostart);}
  return Err(format!("设置未保存：{e}"));
 }
 *guard=prefs.clone();let _=app.emit("preferences",&prefs);Ok(prefs)
}
#[tauri::command]fn patch_preferences(
 app:tauri::AppHandle,state:tauri::State<AppState>,patch:serde_json::Map<String,serde_json::Value>,
)->Result<Preferences,String>{
 let current=state.prefs.lock().map_err(|_|"设置锁失败")?.clone();
 save_preferences(app,state,current.with_patch(patch)?)
}
#[tauri::command]fn preview_size(app:tauri::AppHandle,window:tauri::WebviewWindow,size:f64)->Result<(),String>{
 if window.label()!="settings"||!size.is_finite(){return Err("大小无效".into());}
 let pet=app.get_webview_window("pet").ok_or("桌宠窗口不存在")?;
 let original=pet.outer_position().map_err(|e|e.to_string())?;
 let state=app.state::<AppState>();
 let snap=state.prefs.lock().map_err(|_|"设置锁失败")?.edge_snap;
 state.size_preview.lock().map_err(|_|"尺寸预览锁失败")?
  .get_or_insert(desktop::Position{x:original.x,y:original.y});
 desktop::resize(&app,&pet,size.clamp(210.,840.),snap)
}
fn panel(app:&tauri::AppHandle,kind:&str)->Result<tauri::WebviewWindow,String>{
 if let Some(window)=app.get_webview_window(kind){return Ok(window);}
 let framed=kind=="settings";
 let (title,width,height)=if framed{("启真 · 设置",620.,760.)}else{("启真 · 互动",356.,470.)};
 let work=app.get_webview_window("pet").and_then(|w|desktop::work(&w).ok().flatten());
 let (width,height)=crate::window_layout::panel_size(width,height,work,framed);
 WebviewWindowBuilder::new(app,kind,WebviewUrl::App(format!("index.html?{kind}").into())).title(title)
  .inner_size(width,height).resizable(false).decorations(framed).always_on_top(true)
  .visible(false).focused(false).skip_taskbar(!framed).build().map_err(|error|error.to_string())
}
fn present_panel(app:&tauri::AppHandle,window:&tauri::WebviewWindow)->Result<(),String>{
 if window.label()=="menu"{
  let state=app.state::<AppState>();
  *state.menu_opened.lock().unwrap_or_else(|error|error.into_inner())=Some(std::time::Instant::now());
 }
 if !window.is_visible().map_err(|error|error.to_string())?{
  desktop::beside(app,window)?;
  window.show().map_err(|error|error.to_string())?;
 }
 if window.label()=="menu"{app.state::<AppState>().menu_visible.store(true,Ordering::Release);}
 else{window.unminimize().map_err(|error|error.to_string())?;}
 window.set_focus().map_err(|error|error.to_string())
}
pub(crate) fn dismiss_menu(app:&tauri::AppHandle)->Result<(),String>{
 let state=app.state::<AppState>();
 state.menu_requested.store(false,Ordering::Release);
 state.menu_dragging.store(false,Ordering::Release);
 if state.menu_visible.swap(false,Ordering::AcqRel){
  if let Some(menu)=app.get_webview_window("menu"){menu.hide().map_err(|error|error.to_string())?;}
 }
 Ok(())
}
#[cfg(windows)]
fn dismiss_menu_outside(app:&tauri::AppHandle,state:&AppState,x:i32,y:i32){
 if !state.menu_visible.load(Ordering::Acquire)||state.menu_dragging.load(Ordering::Acquire){return;}
 // The native poll can still be completing the right-click that opened the menu.
 if state.menu_opened.lock().unwrap_or_else(|error|error.into_inner()).is_some_and(|time|time.elapsed().as_millis()<120){return;}
 let Some(menu)=app.get_webview_window("menu") else{return;};
 let (Ok(position),Ok(size))=(menu.outer_position(),menu.outer_size()) else{return;};
 if x<position.x||y<position.y||x>=position.x+size.width as i32||y>=position.y+size.height as i32{
  let _=dismiss_menu(app);
 }
}
fn open_panel(app:&tauri::AppHandle,kind:&str)->Result<(),String>{
 let state=app.state::<AppState>();
 let _guard=state.window_gate.lock().map_err(|_|"窗口锁失败")?;
 if kind=="settings"{dismiss_menu(app)?;}
 let window=panel(app,kind)?;
 if kind=="menu"{
  state.menu_requested.store(true,Ordering::Release);
  if !state.menu_ready.load(Ordering::Acquire)||!state.menu_requested.swap(false,Ordering::AcqRel){return Ok(());}
 }
 present_panel(app,&window)
}
fn request_panel(app:&tauri::AppHandle,kind:&'static str){let handle=app.clone();tauri::async_runtime::spawn_blocking(move||{if let Err(e)=open_panel(&handle,kind){eprintln!("打开面板失败：{e}");}});}
#[tauri::command]async fn show_settings(app:tauri::AppHandle)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||open_panel(&app,"settings")).await.map_err(|e|e.to_string())?}
#[tauri::command]async fn show_menu(app:tauri::AppHandle)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||open_panel(&app,"menu")).await.map_err(|e|e.to_string())?}
#[tauri::command]fn fit_menu(window:tauri::WebviewWindow,height:f64)->Result<f64,String>{
 if window.label()!="menu"{return Err("只能调整互动菜单自身的高度".into());}
 let scale=window.scale_factor().map_err(|e|e.to_string())?;
 let available=desktop::work(&window)?.map(|(a,s)|(f64::from(a.height)/s-24.).max(1.)).unwrap_or(960.);
 let target=crate::window_layout::menu_height(height,available).ok_or("菜单高度无效")?;
 let width=window.inner_size().map_err(|e|e.to_string())?.to_logical::<f64>(scale).width;
 window.set_size(LogicalSize::new(width,target)).map_err(|e|e.to_string())?;
 if window.is_visible().map_err(|error|error.to_string())?{desktop::fit_panel(&window)?;}
 Ok(target)
}
#[tauri::command]fn menu_ready(app:tauri::AppHandle,window:tauri::WebviewWindow,height:f64)->Result<(),String>{
 fit_menu(window.clone(),height)?;
 let state=app.state::<AppState>();
 state.menu_ready.store(true,Ordering::Release);
 if state.menu_requested.swap(false,Ordering::AcqRel){present_panel(&app,&window)?;}
 Ok(())
}
#[tauri::command]fn close_panel(app:tauri::AppHandle,label:String)->Result<(),String>{if label=="menu"{return dismiss_menu(&app);}if label!="settings"{return Err("窗口无效".into());}if let Some(w)=app.get_webview_window(&label){w.close().map_err(|e|e.to_string())?;}Ok(())}
#[tauri::command]fn update_hit_mask(window:tauri::WebviewWindow,state:tauri::State<AppState>,width:u16,height:u16,runs:Vec<[u16;3]>,artwork_bounds:Option<[u16;4]>)->Result<(),String>{
 if window.label()!="pet"{return Err("只能更新桌宠自身的点击轮廓".into());}
 state.hit_mask.lock().map_err(|_|"轮廓锁失败")?.replace(width,height,&runs,artwork_bounds)
}
#[tauri::command]fn pet_ready(app:tauri::AppHandle)->Result<(),String>{
 let already_ready=app.state::<AppState>().ready.load(Ordering::Acquire);
 desktop::renderer_ready(&app)?;
 if !already_ready{
  tauri::async_runtime::spawn_blocking(move||{
   let state=app.state::<AppState>();
   let Ok(_guard)=state.window_gate.lock() else{return;};
   if let Err(error)=panel(&app,"menu"){eprintln!("菜单预加载失败：{error}");}
  });
 }
 Ok(())
}
#[tauri::command]fn renderer_heartbeat(window:tauri::WebviewWindow,state:tauri::State<AppState>,frames:u64,kind:String,error:Option<String>)->Result<(),String>{
 if window.label()!="pet"{return Err("只能报告桌宠窗口状态".into());}
 state.renderer_frames.store(frames,Ordering::Relaxed);
 *state.renderer_kind.lock().map_err(|_|"渲染状态锁失败")?=kind.chars().take(64).collect();
 if let Some(error)=error{*state.renderer_error.lock().map_err(|_|"渲染状态锁失败")?=error.chars().take(400).collect();}Ok(())
}
#[tauri::command]fn begin_pet_drag(window:tauri::WebviewWindow,state:tauri::State<AppState>)->Result<desktop::Position,String>{
 if window.label()!="pet"{return Err("只能拖动桌宠窗口自身".into());}
 if state.prefs.lock().map_err(|_|"设置锁失败")?.click_through{return Err("关闭鼠标穿透后可拖动桌宠".into());}
 desktop::begin_pet_drag(&window,&state)
}
#[tauri::command]fn move_pet(window:tauri::WebviewWindow,state:tauri::State<AppState>,x:i32,y:i32,finished:bool,moved:bool)->Result<(),String>{
 if window.label()!="pet"{return Err("只能移动桌宠窗口自身".into());}
 let result=if moved{desktop::move_pet(&window,&state,desktop::Position{x,y},finished)}else{Ok(())};
 if finished||result.is_err(){desktop::clear_pet_drag(&state);}
 result
}
#[tauri::command]fn begin_menu_drag(window:tauri::WebviewWindow,state:tauri::State<AppState>)->Result<desktop::Position,String>{
 if window.label()!="menu"{return Err("只能拖动互动窗口自身".into());}
 let position=window.outer_position().map_err(|error|error.to_string())?;
 #[cfg(windows)]
 let held=platform::drag_button_down();
 #[cfg(not(windows))]
 let held=true;
 state.menu_dragging.store(held,Ordering::Release);
 Ok(desktop::Position{x:position.x,y:position.y})
}
#[tauri::command]fn move_menu(window:tauri::WebviewWindow,state:tauri::State<AppState>,x:i32,y:i32,finished:bool)->Result<(),String>{
 if window.label()!="menu"{return Err("只能移动互动窗口自身".into());}
 let result=desktop::move_panel(&window,desktop::Position{x,y});
 if finished||result.is_err(){state.menu_dragging.store(false,Ordering::Release);}
 result
}
#[tauri::command]fn hide_pet(app:tauri::AppHandle)->Result<(),String>{desktop::show(&app,false)}
#[tauri::command]fn show_pet(app:tauri::AppHandle)->Result<(),String>{desktop::show(&app,true)}
#[tauri::command]pub fn reset_pet(app:tauri::AppHandle)->Result<(),String>{let mut p=read_preferences(app.state());p.click_through=false;save_preferences(app.clone(),app.state(),p)?;desktop::place(&app,None)?;desktop::show(&app,true)?;desktop::save_current(&app)}
#[tauri::command]fn pet_action(app:tauri::AppHandle,action:String)->Result<(),String>{
 if !ACTIONS.contains(&action.as_str()){return Err("动作无效".into());}
 if !crate::edition::action_allowed(&action){return Err("此动作属于表情完整版".into());}
 app.emit_to("pet","pet-action",action).map_err(|e|e.to_string())?;
 play_sound(app.state());
 Ok(())
}
#[tauri::command]fn restart_elevated(app:tauri::AppHandle)->Result<(),String>{platform::elevated_restart()?;app.exit(0);Ok(())}
#[tauri::command]fn quit_app(app:tauri::AppHandle){app.exit(0)}
#[tauri::command]fn play_sound(state:tauri::State<AppState>){let p=state.prefs.lock().unwrap_or_else(|x|x.into_inner());if p.sfx_enabled{crate::sound::play(p.sfx_volume);}}
#[tauri::command]fn test_sound(state:tauri::State<AppState>){if crate::edition::STATIC{return;}let volume=state.prefs.lock().unwrap_or_else(|x|x.into_inner()).sfx_volume;crate::sound::play(volume);}
#[tauri::command]pub(crate) fn input_metrics(state:tauri::State<AppState>)->serde_json::Value{
 #[cfg(windows)]let active=crate::keyboard_edges::active();#[cfg(not(windows))]let active=false;
 #[cfg(windows)]let mouse_active=crate::keyboard_edges::mouse_active();#[cfg(not(windows))]let mouse_active=false;
 serde_json::json!({"edition":crate::edition::NAME,"samples":state.samples.load(Ordering::Relaxed),"keyboardPresses":state.keyboard_presses.load(Ordering::Relaxed),"mousePresses":state.mouse_presses.load(Ordering::Relaxed),"keyboardHookActive":active,"mouseHookActive":mouse_active,"gamepadConnected":state.gamepad_connected.load(Ordering::Relaxed),"ownEditorForeground":platform::own_editor_foreground(),"transparentCursor":state.cursor_ignored.load(Ordering::Acquire),"hitMaskUpdates":state.hit_mask.lock().unwrap_or_else(|x|x.into_inner()).updates})
}
#[tauri::command]pub(crate) fn window_diagnostics(app:tauri::AppHandle)->Result<serde_json::Value,String>{
 let mut result=serde_json::Map::new();
 for label in ["pet","settings","menu"]{
  let Some(w)=app.get_webview_window(label) else{continue;};
  let p=w.outer_position().map_err(|e|e.to_string())?;
  let s=w.outer_size().map_err(|e|e.to_string())?;
  let work=desktop::work(&w)?.map(|(r,scale)|serde_json::json!({"x":r.x,"y":r.y,"width":r.width,"height":r.height,"scale":scale}));
  let mut info=serde_json::json!({"x":p.x,"y":p.y,"width":s.width,"height":s.height,"visible":w.is_visible().map_err(|e|e.to_string())?,"minimized":w.is_minimized().map_err(|e|e.to_string())?,"alwaysOnTop":w.is_always_on_top().map_err(|e|e.to_string())?,"work":work});
  if label=="pet"{
   let state=app.state::<AppState>();
   let mask=state.hit_mask.lock().unwrap_or_else(|error|error.into_inner());
   if let Some(art)=mask.artwork_rect(s.width as i32,s.height as i32){
    info["artwork"]=serde_json::json!({"x":p.x+art.x,"y":p.y+art.y,"width":art.width,"height":art.height});
   }
  }
  if label=="menu"{info["ready"]=app.state::<AppState>().menu_ready.load(Ordering::Acquire).into();}
  result.insert(label.into(),info);
 }
 Ok(result.into())
}

#[cfg(windows)]
fn schedule_recovery(app:&tauri::AppHandle){
 let handle=app.clone();
 let _=app.run_on_main_thread(move||{let _=reset_pet(handle);});
}

#[cfg(windows)]fn key_label(code:usize)->String{match code{65..=90|48..=57=>char::from_u32(code as u32).unwrap().to_string(),112..=135=>format!("F{}",code-111),32=>"Space".into(),13=>"Enter".into(),8=>"Backspace".into(),9=>"Tab".into(),27=>"Esc".into(),37=>"←".into(),38=>"↑".into(),39=>"→".into(),40=>"↓".into(),160|161=>"Shift".into(),162|163=>"Ctrl".into(),164|165=>"Alt".into(),96..=105=>format!("Num {}",code-96),20=>"CapsLock".into(),33=>"PageUp".into(),34=>"PageDown".into(),35=>"End".into(),36=>"Home".into(),45=>"Insert".into(),46=>"Delete".into(),_=>String::new()}}
#[cfg(windows)]fn reach(code:usize)->f32{match code{32=>0.,65..=71|81..=84|90|88|86|49..=53=>0.6,72..=80|85|87|89|54..=57=>-0.6,_=>0.}}
#[cfg(windows)]fn start_input(app:tauri::AppHandle){
 let Some(pet)=app.get_webview_window("pet") else{return;};
 let Ok(hwnd)=pet.hwnd() else{return;};
 let handle=hwnd.0 as usize;
 std::thread::spawn(move||{
 use windows_sys::Win32::UI::{Input::KeyboardAndMouse::GetAsyncKeyState,WindowsAndMessaging::GetCursorPos};
 let mut key_order=vec![];let mut held=[false;256];let mut last=InputFrame::default();let mut position=0.;let mut recover_held=false;let mut last_emit=std::time::Instant::now();let mut pad_before=0u16;let mut cursor_anchor=(i32::MIN,i32::MIN);
 loop{
  let prefs=read_preferences(app.state());let editing=platform::own_editor_foreground();let allowed=prefs.input_enabled&&!editing;
  let mut now=[false;256];for k in 1..256{now[k]=unsafe{GetAsyncKeyState(k as i32)} as u16&0x8000!=0;}
  let mut pressed_codes=vec![];let mut presses=vec![];let mut repeats=vec![];let mut count=0u16;let mut new_press=false;
  let mut shortcut_actions=Vec::new();
  let hook_active=crate::keyboard_edges::active();
  let sampled_modifiers=(now[17]||now[162]||now[163],now[18]||now[164]||now[165],now[16]||now[160]||now[161]);
  for k in 8..256{let edge=crate::keyboard_edges::take_press(k);let repeated=crate::keyboard_edges::take_repeat(k);if matches!(k,16|17|18|229){continue;}
   if allowed{if now[k]||(edge.is_some()&&!held[k]){count+=1;}
   let modifiers=edge.or_else(||(!hook_active&&now[k]&&!held[k]).then_some(sampled_modifiers));
   if let Some((ctrl,alt,shift))=modifiers{new_press=true;pressed_codes.push(k);let label=key_label(k);if !label.is_empty(){presses.push(label);}position=reach(k);
    for slot in prefs.shortcuts.iter().filter(|slot|slot.enabled){
     if shortcut_key(&slot.chord)==Some((k,ctrl,alt,shift)){
      shortcut_actions.push(&slot.action);
     }
    }
   }if repeated&&prefs.repeat_keys{let label=key_label(k);if !label.is_empty(){repeats.push(label);}}}
  }
  if !allowed{key_order.clear();}let selected=crate::key_target::update_order(&mut key_order,&now,&pressed_codes);let mut landing=crate::key_target::target(selected.unwrap_or(32));
  let mouse_enabled=allowed&&prefs.input_mode=="keyboard_mouse";
  let mouse_edge=crate::keyboard_edges::take_mouse_press();
  let mut mouse_down=mouse_enabled&&(now[1]||now[2]||now[4]);
  let mut new_mouse_press=mouse_enabled&&(mouse_edge||(!crate::keyboard_edges::mouse_active()&&[1,2,4].iter().any(|&button|now[button]&&!held[button])));
  let state=app.state::<AppState>();if prefs.gamepad_enabled{if let Some((buttons,x,_y))=platform::controller(){state.gamepad_connected.store(true,Ordering::Relaxed);if allowed{if buttons&0x1000!=0{count+=1;position=x as f32/32768.;if selected.is_none(){landing=crate::key_target::Target{x:position,y:0.35,zone:if position>=0.{"left-near"}else{"right-near"}};}}if buttons&0x1000!=0&&pad_before&0x1000==0{new_press=true;presses.push("A".into());}if buttons&0x2000!=0&&prefs.input_mode=="keyboard_mouse"{mouse_down=true;new_mouse_press|=pad_before&0x2000==0;}}pad_before=buttons;}else{state.gamepad_connected.store(false,Ordering::Relaxed);pad_before=0;}}else{state.gamepad_connected.store(false,Ordering::Relaxed);pad_before=0;}
  state.samples.fetch_add(1,Ordering::Relaxed);if new_press{state.keyboard_presses.fetch_add(1,Ordering::Relaxed);}if new_mouse_press{state.mouse_presses.fetch_add(1,Ordering::Relaxed);}
  if prefs.sfx_enabled&&(new_press||new_mouse_press){crate::sound::play(prefs.sfx_volume);}
  let mut pt=windows_sys::Win32::Foundation::POINT{x:0,y:0};
  let cursor_valid=unsafe{GetCursorPos(&mut pt)}!=0;
  let cursor_moved=cursor_valid&&((pt.x as i64-cursor_anchor.0 as i64).abs()+(pt.y as i64-cursor_anchor.1 as i64).abs()>1);
  if cursor_moved{cursor_anchor=(pt.x,pt.y);}
  let (mut cursor_x,mut cursor_y,mut hovering)=(last.cursor_x,last.cursor_y,last.hovering);
  if state.menu_dragging.load(Ordering::Acquire){
   let button=platform::primary_button();
   if !now[button]&&held[button]{state.menu_dragging.store(false,Ordering::Release);}
  }
  if cursor_valid{if let Some(rect)=platform::window_rect(handle){
    let x=pt.x-rect.x;let y=pt.y-rect.y;
    cursor_x=(x as f32/rect.width as f32*2.-1.).clamp(-1.,1.);
    cursor_y=(y as f32/rect.height as f32*2.-1.).clamp(-1.,1.);
    hovering=state.hit_mask.lock().unwrap_or_else(|x|x.into_inner()).contains(x,y,rect.width as u32,rect.height as u32);
    let before=state.cursor_ignored.load(Ordering::Acquire);let ignore=crate::hit_test::ignore_cursor(prefs.click_through,hovering,state.dragging.load(Ordering::Acquire),held[1]||held[2]||held[4],before);
    if before!=ignore&&pet.set_ignore_cursor_events(ignore).is_ok(){state.cursor_ignored.store(ignore,Ordering::Release);}}}
  if cursor_valid&&(now[1]&&!held[1]||now[2]&&!held[2]){dismiss_menu_outside(&app,&state,pt.x,pt.y);}
  presses.truncate(6);repeats.truncate(6);let frame=InputFrame{keys_held:count,mouse_down,new_press,new_mouse_press,key_label:presses.last().cloned().unwrap_or_default(),reach:position,target_x:landing.x,target_y:landing.y,target_zone:landing.zone.into(),cursor_x,cursor_y,cursor_moved,presses,repeats,hovering,editing};
  let recover=sampled_modifiers.0&&sampled_modifiers.1&&sampled_modifiers.2&&now[RECOVERY_KEY];
  let recovery_edge=crate::keyboard_edges::take_recover();
  if (recovery_edge||recover)&&!recover_held{schedule_recovery(&app);}
  recover_held=recover;
  if new_press||new_mouse_press||!frame.repeats.is_empty()||frame!=last||last_emit.elapsed().as_millis()>100{let _=app.emit_to("pet","native-input",&frame);last_emit=std::time::Instant::now();}
  // Finish the triggering input first so it cannot wake an action's sleep pose.
  for action in shortcut_actions{let _=app.emit_to("pet","pet-action",action);}
  last=frame;held=now;std::thread::sleep(std::time::Duration::from_millis(8));
 }
});}

// Static artwork only needs desktop hit testing, menu dismissal and recovery.
// Do not install the keyboard hook, scan the keyboard or emit animation input.
#[cfg(windows)]fn start_static_desktop(app:tauri::AppHandle){
 let Some(pet)=app.get_webview_window("pet") else{return;};
 let Ok(hwnd)=pet.hwnd() else{return;};
 let handle=hwnd.0 as usize;
 std::thread::spawn(move||{
 use windows_sys::Win32::UI::{Input::KeyboardAndMouse::GetAsyncKeyState,WindowsAndMessaging::GetCursorPos};
 let down=|key|unsafe{GetAsyncKeyState(key)} as u16&0x8000!=0;
 let mut previous=[false;3];let mut recover_before=false;
 loop{
  let p=read_preferences(app.state());let state=app.state::<AppState>();let mouse=[down(1),down(2),down(4)];
  let mut pt=windows_sys::Win32::Foundation::POINT{x:0,y:0};
  let cursor_valid=unsafe{GetCursorPos(&mut pt)}!=0;
  if state.menu_dragging.load(Ordering::Acquire){
   let button=platform::primary_button()-1;
   if !mouse[button]&&previous[button]{state.menu_dragging.store(false,Ordering::Release);}
  }
  if cursor_valid{if let Some(rect)=platform::window_rect(handle){
   let hit=state.hit_mask.lock().unwrap_or_else(|x|x.into_inner()).contains(pt.x-rect.x,pt.y-rect.y,rect.width as u32,rect.height as u32);
   let before=state.cursor_ignored.load(Ordering::Acquire);
   let ignore=crate::hit_test::ignore_cursor(p.click_through,hit,state.dragging.load(Ordering::Acquire),previous.iter().any(|x|*x),before);
   if before!=ignore&&pet.set_ignore_cursor_events(ignore).is_ok(){state.cursor_ignored.store(ignore,Ordering::Release);}
  }}
  if cursor_valid&&(mouse[0]&&!previous[0]||mouse[1]&&!previous[1]){dismiss_menu_outside(&app,&state,pt.x,pt.y);}
  let recover=down(17)&&down(18)&&down(16)&&down(RECOVERY_KEY as i32);if recover&&!recover_before{schedule_recovery(&app);}recover_before=recover;previous=mouse;
  std::thread::sleep(std::time::Duration::from_millis(16));
 }
});}

pub fn run(){
 let context=tauri::generate_context!();
 #[cfg(all(windows, feature = "native-qa"))]
 let context=crate::native_qa::isolated_context(context);
 tauri::Builder::default().invoke_handler(tauri::generate_handler![read_preferences,save_preferences,patch_preferences,preview_size,show_settings,show_menu,fit_menu,menu_ready,close_panel,update_hit_mask,pet_ready,renderer_heartbeat,begin_pet_drag,move_pet,begin_menu_drag,move_menu,hide_pet,show_pet,reset_pet,pet_action,restart_elevated,quit_app,play_sound,test_sound,input_metrics,window_diagnostics,desktop::list_positions,desktop::save_position,desktop::restore_position])
 .on_window_event(|window,event|{
  if window.label()=="menu"{
   match event{
    tauri::WindowEvent::CloseRequested{api,..}=>{api.prevent_close();let _=dismiss_menu(window.app_handle());}
    tauri::WindowEvent::Destroyed=>{
     let state=window.app_handle().state::<AppState>();
     state.menu_dragging.store(false,Ordering::Release);
     state.menu_ready.store(false,Ordering::Release);
     state.menu_visible.store(false,Ordering::Release);
    }
    _=>{}
   }
  }
  if window.label()=="settings"&&matches!(event,tauri::WindowEvent::Destroyed){
   let app=window.app_handle();
   let preview=app.state::<AppState>().size_preview.lock().unwrap_or_else(|error|error.into_inner()).take();
   if let Some(original)=preview{
    if let Some(pet)=app.get_webview_window("pet"){
     let preferences=read_preferences(app.state());
     let _=desktop::resize(app,&pet,preferences.size,preferences.edge_snap);
     let _=desktop::place(app,Some(original));
    }
   }
  }
 })
 .setup(|app|{
  let mut p=prefs_path(app.handle()).ok().and_then(|f|fs::read(f).ok()).and_then(|s|serde_json::from_slice::<Preferences>(&s).ok()).unwrap_or_default();p.reserve_recovery_chord();if p.validate().is_err(){p.shortcuts=Preferences::default().shortcuts;p.fullscreen_exceptions.clear();p.validate().map_err(std::io::Error::other)?;}
  let saved=desktop::load(app.handle());let last=saved.last;app.manage(AppState{prefs:Mutex::new(p.clone()),hit_mask:Mutex::new(crate::hit_test::HitMask::default()),cursor_ignored:AtomicBool::new(cfg!(windows)),window_gate:Mutex::new(()),keyboard_presses:AtomicU64::new(0),mouse_presses:AtomicU64::new(0),samples:AtomicU64::new(0),saved:Mutex::new(saved),visibility:Mutex::new(desktop::Visibility::default()),dragging:AtomicBool::new(false),menu_dragging:AtomicBool::new(false),menu_ready:AtomicBool::new(false),menu_requested:AtomicBool::new(false),menu_visible:AtomicBool::new(false),menu_opened:Mutex::new(None),ready:AtomicBool::new(false),gamepad_connected:AtomicBool::new(false),renderer_frames:AtomicU64::new(0),renderer_kind:Mutex::new(String::new()),renderer_error:Mutex::new(String::new()),size_preview:Mutex::new(None),pet_drag_release:Mutex::new(None)});
  #[cfg(all(windows, feature = "native-qa"))]
  crate::native_qa::start(app.handle().clone())?;
  #[cfg(windows)]
  if let Some(pet)=app.get_webview_window("pet"){pet.set_ignore_cursor_events(true)?;}
  apply_preferences(app.handle(),&p)?;desktop::place(app.handle(),last)?;
  if p.autostart{if let Err(error)=platform::set_autostart(true){eprintln!("开机启动设置未更新：{error}");}}
  let show=MenuItem::with_id(app,"show","显示桌宠",true,None::<&str>)?;let hide=MenuItem::with_id(app,"hide","隐藏桌宠",true,None::<&str>)?;let settings=MenuItem::with_id(app,"settings","设置与个性化",true,None::<&str>)?;let interact=MenuItem::with_id(app,"interact",if crate::edition::STATIC{"桌面菜单"}else{"和启真互动"},true,None::<&str>)?;let through=MenuItem::with_id(app,"through","切换鼠标穿透",true,None::<&str>)?;let reset=MenuItem::with_id(app,"reset","找回桌宠 / 关闭穿透",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","退出",true,None::<&str>)?;
  let menu=Menu::with_items(app,&[&show,&hide,&interact,&settings,&through,&reset,&quit])?;
  TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("启真 · 右键互动").menu(&menu).show_menu_on_left_click(false).on_menu_event(|app,e|{match e.id.as_ref(){"settings"=>request_panel(app,"settings"),"interact"=>request_panel(app,"menu"),"show"=>{let _=desktop::show(app,true);},"hide"=>{let _=desktop::show(app,false);},"reset"=>{let _=reset_pet(app.clone());},"through"=>{let mut p=read_preferences(app.state());p.click_through=!p.click_through;let _=save_preferences(app.clone(),app.state(),p);},"quit"=>app.exit(0),_=>{}}}).on_tray_icon_event(|tray,e|{if let TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}=e{request_panel(tray.app_handle(),"menu");}}).build(app)?;
  #[cfg(windows)]{if crate::edition::STATIC{start_static_desktop(app.handle().clone());}else{crate::keyboard_edges::start();start_input(app.handle().clone());}}desktop::watch(app.handle().clone());
  let handle=app.handle().clone();std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(8));let ready=handle.clone();let _=handle.run_on_main_thread(move||{let _=desktop::renderer_ready(&ready);});});
  // A local, explicit development marker enables one bounded startup audit.
  // No debugger port or raw input history is exposed or persisted.
  if let Some(dir)=std::env::current_exe().ok().and_then(|p|p.parent().map(|p|p.to_path_buf())){if dir.join("zju-companion.audit").is_file(){let handle=app.handle().clone();std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(12));let state=handle.state::<AppState>();let report=serde_json::json!({"pid":std::process::id(),"version":env!("CARGO_PKG_VERSION"),"rendererReady":state.ready.load(Ordering::Acquire),"rendererFrames":state.renderer_frames.load(Ordering::Relaxed),"rendererKind":state.renderer_kind.lock().unwrap_or_else(|x|x.into_inner()).clone(),"rendererError":state.renderer_error.lock().unwrap_or_else(|x|x.into_inner()).clone(),"input":input_metrics(handle.state()),"windows":window_diagnostics(handle.clone()).ok(),"scope":"Startup counters only; no visual desktop or real game-input claim"});let _=fs::write(dir.join("startup-check.json"),serde_json::to_vec_pretty(&report).unwrap_or_default());});}}
  Ok(())
 }).run(context).expect("启真启动失败");}
