// Retain very short press edges between 8 ms state samples. The callback only
// updates fixed atomic state and always passes input to the next hook; it never
// records text, stores an event history, blocks input, or calls into the WebView.
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use windows_sys::Win32::{Foundation::{LPARAM,LRESULT,WPARAM}, UI::WindowsAndMessaging::*};

static DOWN:[AtomicBool;256]=[const {AtomicBool::new(false)};256];
static PRESS:[AtomicU8;256]=[const {AtomicU8::new(0)};256];
static REPEAT:[AtomicBool;256]=[const {AtomicBool::new(false)};256];
static ACTIVE:AtomicBool=AtomicBool::new(false);
static RECOVER:AtomicBool=AtomicBool::new(false);
const CTRL:u8=1;
const ALT:u8=2;
const SHIFT:u8=4;
const PRESSED:u8=8;

fn transition(key:usize,down:bool){
    if key>=256{return;}
    let previous=DOWN[key].swap(down,Ordering::AcqRel);
    if down&&!previous{
        let ctrl=modifier_down(&[17,162,163]);
        let alt=modifier_down(&[18,164,165]);
        let shift=modifier_down(&[16,160,161]);
        PRESS[key].store(PRESSED|u8::from(ctrl)*CTRL|u8::from(alt)*ALT|u8::from(shift)*SHIFT,Ordering::Release);
        if key==90&&ctrl&&alt{
            RECOVER.store(true,Ordering::Release);
        }
    }
    if down&&previous{REPEAT[key].store(true,Ordering::Release);}
}
pub fn take_press(key:usize)->Option<(bool,bool,bool)>{
    // Preserve modifiers from the actual down edge when the whole shortcut is
    // released between two Windows state samples.
    let bits=PRESS[key].swap(0,Ordering::AcqRel);
    (bits&PRESSED!=0).then_some((bits&CTRL!=0,bits&ALT!=0,bits&SHIFT!=0))
}
pub fn take_repeat(key:usize)->bool{REPEAT[key].swap(false,Ordering::AcqRel)}
pub fn active()->bool{ACTIVE.load(Ordering::Acquire)}
pub fn take_recover()->bool{RECOVER.swap(false,Ordering::AcqRel)}

fn modifier_down(keys:&[usize])->bool{
    keys.iter().any(|&key|DOWN[key].load(Ordering::Acquire))
}

unsafe extern "system" fn callback(code:i32,message:WPARAM,data:LPARAM)->LRESULT{
    if code==HC_ACTION as i32{
        let event=&*(data as *const KBDLLHOOKSTRUCT);
        let key=event.vkCode as usize;
        let button=match message as u32{
            WM_KEYDOWN|WM_SYSKEYDOWN=>Some(true),
            WM_KEYUP|WM_SYSKEYUP=>Some(false),
            _=>None,
        };
        if let Some(down)=button {
            #[cfg(feature = "native-qa")]
            if let Some(previous)=DOWN.get(key) {
                crate::native_qa::record_key_edge(
                    event.flags & LLKHF_INJECTED != 0,
                    down,
                    previous.load(Ordering::Relaxed),
                );
            }
            transition(key,down);
        }
    }
    CallNextHookEx(std::ptr::null_mut(),code,message,data)
}
pub fn start(){std::thread::spawn(||unsafe{
    let module=windows_sys::Win32::System::LibraryLoader::GetModuleHandleW(std::ptr::null());
    let hook=SetWindowsHookExW(WH_KEYBOARD_LL,Some(callback),module,0);
    if hook.is_null(){eprintln!("短按事件监听不可用；保留键盘状态采样");return;}
    ACTIVE.store(true,Ordering::Release);
    let mut msg:MSG=std::mem::zeroed();
    while GetMessageW(&mut msg,std::ptr::null_mut(),0,0)>0{TranslateMessage(&msg);DispatchMessageW(&msg);}
    ACTIVE.store(false,Ordering::Release);UnhookWindowsHookEx(hook);
});}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn short_tap_survives_release_but_repeat_is_not_another_press(){
        let k=65;
        transition(k,true);transition(k,true);transition(k,false);
        assert!(take_press(k).is_some(),"down and up between samples must remain observable");
        assert!(take_press(k).is_none(),"a consumed edge must not retrigger");
        transition(k,true);assert!(take_press(k).is_some());
        transition(k,true);assert!(take_press(k).is_none(),"OS autorepeat must not restart bounce");
        assert!(take_repeat(k),"repeat may drive the optional display only");
        assert!(!take_repeat(k),"display repeat is consumed independently");
        transition(k,false);transition(k,true);assert!(take_press(k).is_some(),"a real repress must restart bounce");
        transition(k,false);
    }

    #[test]
    fn short_recovery_chord_is_kept_without_repeating_during_a_hold(){
        transition(162,true);
        transition(165,true);
        transition(90,true);
        assert!(take_recover());
        transition(90,true);
        assert!(!take_recover());
        transition(90,false);
        transition(90,true);
        transition(90,false);
        transition(49,true);
        transition(49,false);
        transition(165,false);
        transition(162,false);
        assert_eq!(take_press(49),Some((true,true,false)));
        assert!(take_press(49).is_none());
        assert!(take_recover(),"release before the polling tick must preserve recovery");
        assert!(!take_recover());
    }
}
