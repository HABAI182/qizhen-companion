use tauri::Manager;
use crate::preferences::Preferences;

#[cfg(windows)] fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(Some(0)).collect()}
#[cfg(windows)]pub fn own_editor_foreground()->bool{unsafe{use windows_sys::Win32::UI::WindowsAndMessaging::*;let w=GetForegroundWindow();let mut pid=0;GetWindowThreadProcessId(w,&mut pid);pid==std::process::id()}}
#[cfg(not(windows))]pub fn own_editor_foreground()->bool{false}

#[cfg(windows)]
pub fn window_rect(handle:usize)->Option<crate::window_layout::Rect>{
 use windows_sys::Win32::{Foundation::RECT,UI::WindowsAndMessaging::GetWindowRect};
 let mut r=RECT{left:0,top:0,right:0,bottom:0};
 if unsafe{GetWindowRect(handle as _,&mut r)}==0||r.right<=r.left||r.bottom<=r.top{return None;}
 Some(crate::window_layout::Rect{x:r.left,y:r.top,width:r.right-r.left,height:r.bottom-r.top})
}

#[cfg(windows)]
pub fn primary_button()->usize{
 use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics,SM_SWAPBUTTON};
 if unsafe{GetSystemMetrics(SM_SWAPBUTTON)}!=0{2}else{1}
}
#[cfg(windows)]
pub fn drag_button_down()->bool{
 use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
 (unsafe{GetAsyncKeyState(primary_button() as i32)} as u16)&0x8000!=0
}

#[cfg(windows)]pub fn fullscreen(app:&tauri::AppHandle,p:&Preferences)->bool{unsafe{
 use windows_sys::Win32::{UI::WindowsAndMessaging::*,Foundation::{RECT,CloseHandle},System::Threading::*};
 let Some(pet)=app.get_webview_window("pet") else{return false;};let Ok(Some(m))=pet.current_monitor() else{return false;};
 let w=GetForegroundWindow();if w.is_null()||IsIconic(w)!=0||IsWindowVisible(w)==0{return false;}let mut pid=0;GetWindowThreadProcessId(w,&mut pid);if pid==std::process::id(){return false;}
 let mut class=[0u16;128];let n=GetClassNameW(w,class.as_mut_ptr(),128).max(0) as usize;if ["Progman","WorkerW","Shell_TrayWnd"].contains(&String::from_utf16_lossy(&class[..n]).as_str()){return false;}
 let style=GetWindowLongPtrW(w,GWL_STYLE) as u32;if style&(WS_CAPTION|WS_THICKFRAME)!=0{return false;}
 let mut r:RECT=std::mem::zeroed();if GetWindowRect(w,&mut r)==0{return false;}let pos=m.position();let size=m.size();
 let full=r.left<=pos.x+2&&r.top<=pos.y+2&&r.right>=pos.x+size.width as i32-2&&r.bottom>=pos.y+size.height as i32-2;
 if !full||p.fullscreen_exceptions.is_empty(){return full;}let h=OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,0,pid);if h.is_null(){return full;}let mut path=[0u16;32768];let mut len=path.len() as u32;let ok=QueryFullProcessImageNameW(h,0,path.as_mut_ptr(),&mut len);CloseHandle(h);if ok==0{return full;}
 let name=String::from_utf16_lossy(&path[..len as usize]).rsplit(['\\','/']).next().unwrap_or("").to_lowercase();!p.fullscreen_exceptions.contains(&name)
}}
#[cfg(not(windows))]pub fn fullscreen(_:&tauri::AppHandle,_:&Preferences)->bool{false}

#[cfg(windows)]pub fn elevated_restart()->Result<(),String>{
 let path=std::env::current_exe().map_err(|e|e.to_string())?;
 unsafe{use windows_sys::Win32::UI::{Shell::ShellExecuteW,WindowsAndMessaging::SW_SHOWNORMAL};let result=ShellExecuteW(std::ptr::null_mut(),wide("runas").as_ptr(),wide(&path.to_string_lossy()).as_ptr(),std::ptr::null(),std::ptr::null(),SW_SHOWNORMAL);if result as usize<=32{return Err("兼容重启未完成；保留当前普通权限进程".into());}}Ok(())
}
#[cfg(not(windows))]pub fn elevated_restart()->Result<(),String>{Err("当前仅支持Windows".into())}

#[cfg(all(windows, not(feature = "native-qa")))]pub fn set_autostart(enabled:bool)->Result<(),String>{unsafe{
 use windows_sys::Win32::{System::Registry::*,Foundation::ERROR_SUCCESS};
 let command=if enabled{
  let path=std::env::current_exe().map_err(|e|e.to_string())?;
  Some(wide(&format!("\"{}\"",path.display())))
 }else{None};
 let mut key=std::ptr::null_mut();let status=RegCreateKeyExW(HKEY_CURRENT_USER,wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run").as_ptr(),0,std::ptr::null(),0,KEY_SET_VALUE,std::ptr::null(),&mut key,std::ptr::null_mut());if status!=ERROR_SUCCESS{return Err("无法更新开机启动设置".into());}
 let entry=wide(crate::edition::AUTOSTART_ENTRY);
 let result=if let Some(value)=command{RegSetValueExW(key,entry.as_ptr(),0,REG_SZ,value.as_ptr() as *const u8,(value.len()*2) as u32)}else{let code=RegDeleteValueW(key,entry.as_ptr());if code==2{ERROR_SUCCESS}else{code}};
 RegCloseKey(key);if result!=ERROR_SUCCESS{return Err("开机启动设置未保存".into());}Ok(())
}}
#[cfg(all(windows, feature = "native-qa"))]pub fn set_autostart(enabled:bool)->Result<(),String>{
 if enabled{Err("实机验收构建不能写入开机启动".into())}else{Ok(())}
}
#[cfg(not(windows))]pub fn set_autostart(_:bool)->Result<(),String>{Err("当前仅支持Windows".into())}

pub fn controller()->Option<(u16,i16,i16)>{
 #[cfg(windows)]unsafe{use windows_sys::Win32::UI::Input::XboxController::*;let mut state:XINPUT_STATE=std::mem::zeroed();for index in 0..4{if XInputGetState(index,&mut state)==0{return Some((state.Gamepad.wButtons,state.Gamepad.sThumbLX,state.Gamepad.sThumbLY));}}}
 None
}
